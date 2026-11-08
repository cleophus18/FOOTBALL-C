# Football Career Simulator — Architecture Plan

A browser-based (HTML/JS/Node) player-career football simulation in the style of EA FC
"Player Career". Starts 2026/27, ends with retirement and a legacy summary.

---

## 1. Platform choice

**Web browser, TypeScript-free plain ES modules, Node for headless simulation.**

| Layer       | Choice                                                        | Why                                                                     |
| ----------- | ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Runtime     | Node.js 24 (already installed)                                | No build step needed, `--experimental-strip-types` unused; plain `.mjs` |
| UI          | Zero-dependency DOM renderer                                  | No npm install, no bundler, works offline                               |
| Data        | JSON files in `/data`                                         | Requirement: editable without touching code                             |
| Persistence | JSON save slots in `localStorage` (browser) / `saves/` (Node) | Same shape both ways                                                    |
| Sim engine  | Pure functions, deterministic seeded PRNG                     | Reproducible seasons; testable headless                                 |
| Tests       | `node --test`                                                 | Built in, no dependency                                                 |

The reason not to use Unity: the requirement is data-file-driven rosters editable by
hand, fast iteration, and no toolchain. A plain web stack gives that for free, and the
same engine runs headless so 20 seasons can be simulated in a test in under a second.

**No runtime dependencies at all.** `package.json` has zero `dependencies`.

---

## 2. Directory layout

```
FOOTBALL C/
├─ ARCHITECTURE.md            <- this file
├─ README.md                  <- how to run
├─ package.json               <- scripts, type: module
├─ data/
│  ├─ schema.md               <- documents every field (kept in sync by a test)
│  ├─ config/
│  │  ├─ leagues.json         <- the 10 divisions + promotion/relegation rules
│  │  ├─ cups.json            <- domestic cups + super cups
│  │  ├─ europe.json          <- UCL/UEL/UECL formats & access list
│  │  ├─ world.json           <- World Cup, continental tournaments, calendar
│  │  ├─ nations.json         <- national teams + FIFA ranking points
│  │  ├─ clubs.json           <- club identity: name, city, prestige, budget
│  │  ├─ agents.json          <- agent pool definition (archetypes)
│  │  ├─ archetypes.json      <- position archetypes + attribute weights
│  │  ├─ awards.json          <- award definitions & eligibility
│  │  ├─ challenges.json      <- weekly/season/career challenge pool
│  │  └─ events.json          <- random life/media event pool
│  ├─ squads/
│  │  ├─ ENG.json             <- Premier League + Championship squads
│  │  ├─ ESP.json
│  │  ├─ GER.json
│  │  ├─ ITA.json
│  │  └─ FRA.json
│  └─ nations/
│     └─ squads.json          <- international squads
├─ src/
│  ├─ core/
│  │  ├─ rng.mjs              <- seeded PRNG (xoshiro128**) + helpers
│  │  ├─ util.mjs             <- clamp, lerp, pick, weighted pick, id helpers
│  │  ├─ calendar.mjs         <- date/week arithmetic; season calendar builder
│  │  ├─ finance.mjs          <- club ledger, revenue, budgets, market values, transfers
│  │  └─ constants.mjs        <- tuning constants in one place
│  ├─ data/
│  │  ├─ loader.mjs           <- reads data/, validates, resolves references
│  │  └─ validate.mjs         <- structural validation w/ helpful errors
│  ├─ model/
│  │  ├─ player.mjs           <- Player, attributes, rating calc, age curve
│  │  ├─ club.mjs             <- Club, finances, prestige, squad
│  │  ├─ league.mjs           <- League table, fixtures, promotion/relegation
│  │  ├─ competition.mjs      <- Cup + European competition state machines
│  │  ├─ agent.mjs            <- Agent model, negotiation maths
│  │  ├─ contract.mjs         <- Contract, release clause, loyalty bonus
│  │  ├─ careersave.mjs       <- the whole save state + (de)serialisation
│  │  └─ person.mjs           <- manager, teammate relationships
│  ├─ sim/
│  │  ├─ strength.mjs         <- team strength from squad, tactics, form, morale
│  │  ├─ match.mjs            <- full match sim (event-driven minutes)
│  │  ├─ playermatch.mjs      <- the *player's* match: key moments + rating
│  │  ├─ objectives.mjs       <- manager match objectives & grading
│  │  ├─ training.mjs         <- training points, drills, risk/reward
│  │  ├─ development.mjs      <- weekly growth, age curve, position changes
│  │  ├─ injury.mjs           <- injury roll, severity, rehab
│  │  ├─ transfer.mjs         <- AI transfers, bids, loans, windows
│  │  ├─ youth.mjs            <- regens, youth intakes, retirements
│  │  ├─ season.mjs           <- season orchestrator (the "advance week" loop)
│  │  ├─ awards.mjs           <- award voting
│  │  ├─ media.mjs            <- press, social, fan sentiment, random events
│  │  └─ finance.mjs          <- wages, sponsorships, spending
│  ├─ world.mjs               <- top-level World object; owns all leagues/clubs
│  ├─ career.mjs              <- career facade: the API the UI calls
│  └─ ui/
│     ├─ app.mjs              <- state machine: creation → hub → screens
│     ├─ render.mjs           <- tiny DOM helper (h(), mount())
│     ├─ style.css
│     └─ screens/
│        ├─ creation.mjs
│        ├─ dashboard.mjs
│        ├─ inbox.mjs
│        ├─ table.mjs
│        ├─ fixtures.mjs
│        ├─ player.mjs
│        ├─ training.mjs
│        ├─ transfers.mjs
│        ├─ agent.mjs
│        ├─ trophies.mjs
│        └─ legacy.mjs
├─ tools/
│  ├─ sim-season.mjs          <- CLI: simulate N seasons headless
│  └─ balance.mjs             <- CLI: run balance reports
└─ test/
   ├─ rng.test.mjs
   ├─ league.test.mjs
   ├─ match.test.mjs
   ├─ development.test.mjs
   ├─ transfer.test.mjs
   └─ data.test.mjs           <- validates all data files load & are coherent
```

---

## 3. Core domain model

### 3.1 Player

```
Player {
  id, first, last, nationality,            // nation code -> NT eligibility
  dob: {year, month, day},                 // age derives from calendar, not stored
  height, weight, foot, weakFoot, skillMoves,
  position,                                // GK | CB | LB | RB | DM | CM | AM | LW | RW | ST
  altPositions: [],                        // learned positions
  archetype,                               // Poacher, Playmaker, ...
  attrs: { pace, shooting, passing, dribbling, defending, physical },
  gkAttrs: { reflexes, handling, positioning, kicking },   // GK only
  overall, previousOverall, potential,     // OVR derived from detailed attrs + position profile
  ratingHistory: [ /* meaningful OVR changes */ ],
  traits: [],                              // Wonderkid, Late Bloomer, Leader, ...
  personality: [],                         // Professional, Ambitious, Loyal, Flashy, Leader
  form, morale, sharpness, fitness, fatigue,
  injury: { type, weeksOut, severity } | null,
  squadStatus,                             // Prospect|Rotation|First Team|Key Player|Star
  contract, value,
  trust: { manager, fans, teammates, board },
  stats: { career, season, byCompetition },
  history: [ /* per-season record */ ]
}
```

`calculatePlayerOverall(player, position)` in `src/model/player.mjs` is the authoritative
rating engine. It weights individual 1–99 attributes differently for each position
(including diving, handling and reflexes for goalkeepers), applies a one-point
secondary-position adjustment, and falls back safely for compact legacy/world records.
`updatePlayerOverall` is the controlled mutation path used by training, position changes,
season development and save migration. The stored `overall` is kept as a save/UI cache,
but is always recalculated from attributes; temporary form is applied separately by
`model/form.mjs`. Meaningful changes are appended to `ratingHistory` without duplicate
no-op entries.

### 3.2 Hidden potential

Each created player rolls `potential` from a distribution shaped by starting overall,
age and the chosen trait:

- `Wonderkid`: potential skewed high (`base + 8..22`), but a small chance of a hard cap
  if the player doesn't get minutes before 21 (the "flop" path).
- `Late Bloomer`: lower initial ceiling, but the ceiling itself grows while the player
  is 21–26 and he keeps improving after 27.
- default: `base + 4..14`.

Potential is never shown exactly; the UI shows a scout's range (`"80–88"`) that narrows
as the player ages and plays.

### 3.3 Club

```
Club {
  id, name, shortName, nation, city, stadium, capacity,
  prestige,      // 1..100 long-run reputation
  budget,        // transfer budget
  wageBudget,
  reputation,    // dynamic, moves with results
  squad: [PlayerId],
  tactics: { formation, mentality, pressing },
  manager: { name, style, trust[] },
  honours: [ {competitionId, season} ],
  coefficient,   // for UEFA seeding
  finances: {
    balance, transferBudget, wageBudget, debt,
    revenue, expenses, sponsorships, ledger, processedEvents
  }
}
```

### 3.4 World

`World` owns: all leagues, all clubs, all players (by id), the calendar, the European
competition states, national teams, the award history and the transfer market. The
career's player is just one player in that world — this is what makes AI transfers,
regen, and 20-year simulation possible without special-casing.

---

## 4. Simulation model

### 4.1 Team strength

```
attack  = f(meanOverall(top 11 attackers/mid), form, morale, sharpness, tactics)
defence = f(meanOverall(top 11 defenders/GK), form, morale, sharpness, tactics, homeAdv)
```

Each match, `expectedGoals_home` and `expectedGoals_away` come from a Poisson
regression on the attack/defence difference. Goals are then drawn from Poisson. This
gives realistic scorelines and a realistic league table shape without needing a
minute-by-minute engine for the 600 clubs the player never watches.

### 4.2 The player's own match

The player's match _is_ simulated minute-by-minute, on top of the team-level result, so
that his individual numbers are consistent with the scoreline:

1. Compute team xG for both sides (4.1).
2. Distribute the team's xG across the attacking players in proportion to their
   attacking contribution and role (a Poacher gets a bigger share of the xG than a DM).
3. Walk the 90 (+stoppage) minutes. At each minute, for the player only, roll
   involvement events with probability driven by his attributes vs the opposition:
   `chance` (shot), `keyPass`, `take_on`, `duel`, `aerial`, `tackle`, `interception`,
   `foul_committed`, `foul_won`, `setpiece_taken`.
4. Each involvement resolves success/failure against the relevant opposing attribute.
   A successful `chance` rolls against the keeper to become a goal — and that goal is
   _taken out of the team's pre-computed goal total_, so individual goals never
   contradict the scoreline.
5. Cards, injuries and fatigue accrue from the events.

**Player interaction.** The user is not asked to micro-control every minute. Instead,
key moments (a clear chance, a penalty, a one-on-one) surface as decision prompts — and
the game also offers a "Coach/Sim" mode that auto-resolves them using the player's
attributes. This matches FC's player-career feel: you influence, you don't puppet.

### 4.3 Match rating

Rating starts at 6.0 and moves with a weighted sum of the events above, normalised by
position expectations (a CB with 8 duels won and 0 goals can rate 8.5; a striker with
the same numbers rates 6.4). Anchored so that the league's mean rating is ~6.8.

### 4.4 Determinism

Every random draw goes through one seeded generator stored in the save. `rng.mjs`
exposes named sub-streams (`world`, `match`, `transfers`, `events`, `youth`) so that
simulating a match doesn't shift the sequence the transfer market sees. A save
reproduces exactly from its seed + the sequence of user actions.

---

## 5. Calendar

The season is a list of weeks. Each week has a date, a set of fixtures, and a set of
"events" that fire. Advancing a week runs, in order:

1. training (player points, drill results, overtraining risk)
2. midweek fixtures (cups / Europe)
3. weekend fixtures (league)
4. injury/fatigue/sharpness update
5. morale, media, board & manager trust updates
6. youth intake & AI transfer ticks (on their scheduled weeks)
7. awards voting (on their scheduled weeks)
8. inbox generation

Season structure (configurable in `data/config/world.json`):

- pre-season: July, friendlies + transfer window open
- Aug–May: league, cups, Europe
- winter window: Jan 1–31
- summer window: Jun 10 – Sep 1

---

## 6. Data-file design

The requirement is that leagues, clubs, players and awards live in editable data files.
Design rules:

1. **Every tunable number is in data, not code.** Promotion spots, UCL pots, award
   weights, wage formulas, age-curve coefficients — all JSON.
2. **References by id.** Squads reference clubs by id; competitions reference
   participants by id. The loader resolves and _validates_ these, so a typo in a data
   file produces a readable error, not a crash mid-season.
3. **`fictionalNames: false` toggle.** `clubs.json` and squads carry both `name` and
   `fictionalName`. One flag in `config/world.json` swaps the whole world's names and
   abbreviations for public release.
4. **`data/schema.md`** documents each file, and `test/data.test.mjs` asserts every
   documented field actually exists in the files.

### Roster realism

The supplied workspace contains club identities, but no real 2026/27 player rosters.
Phase 1 creates reproducible background squads from editable name pools, positions,
ages, and club rating formulas in `data/squads/ENG.json`. These are generated players,
not claims about real-world rosters. Replace them with data you are licensed to use.

---

## 7. The career layer

`src/career.mjs` is a facade over `World` + the player's `Player`. The UI only talks to
it. Its surface:

```
createCareer(opts)        -> Career       // includes player creation
advanceWeek()             -> WeekReport   // simulate one week, return what happened
advanceToNextEvent()      -> WeekReport   // skip empty weeks
respondToInbox(id, choice)                // agent offers, contract talks, media
setTrainingFocus(attr, intensity)
hireAgent(agentId) / fireAgent()
requestTransfer() / withdrawTransferRequest()
negotiateContract(offerId, counter)
save(slot) / load(slot)
```

Everything the UI shows is derived from `Career.state` — there is no second source of
truth, which is what makes save/load trivially correct.

---

## 8. Build order & phase gates

Each phase ends with working code, a test, and a summary.

| Phase | Deliverable                                                                                                                                            | Gate                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| **1** | Data architecture + core loop: player creation, one league (Premier League), season calendar, full match sim, training points, dashboard UI, save/load | Simulate a full Premier League season headlessly and in the browser; tests pass |
| **2** | Agent gate, contracts, transfer windows, club switching, AI transfers, loans                                                                           | Player can be signed by an AI club without crashing the world                   |
| **3** | All Big 5 + second divisions, promotion/relegation with real rules, domestic cups                                                                      | 10 real 2026/27 rosters load; simulate 10 seasons with stable club count        |
| **4** | UCL 36-team league phase + knockouts, UEL, UECL, Club World Cup                                                                                        | Full European season sims; pots and qualification correct                       |
| **5** | National teams, call-ups, World Cup 48-team cycle                                                                                                      | A call-up and a World Cup run work end to end                                   |
| **6** | Awards, challenges, media, finances, random events                                                                                                     | Ballon d'Or and per-season awards computed; media events affect morale          |
| **7** | Polish, saves, balance, legacy, retirement, next-gen                                                                                                   | A full 20-season auto-play career produces a sensible legacy summary            |

---

## 9. Known assumptions

1. **Licensing.** Real club and player names are loaded from the data files for
   personal use, with a `fictionalNames` toggle for any public distribution. Badges
   and kits are not included — the UI draws generated colour/initials crests.
2. **Roster accuracy.** The project starts without a real player roster data source.
   Phase 1 generates background squads from editable configuration; it does not
   represent them as current real-world players or ratings.
3. **League field sizes** follow the real 2026/27 season: PL 20, Championship 24,
   La Liga 20, Segunda 22, Bundesliga 18, 2. Bundesliga 18, Serie A 20, Serie B 20,
   Ligue 1 18, Ligue 2 18.
4. **Simulation fidelity** targets realism-of-outcome (tables, award races, values),
   not a physically accurate ball model.
5. Where a real-world rule is in flux (play-off formats, extra UCL spots from
   coefficients), the rule lives in `data/config/leagues.json` with the current
   real-world value and a comment.

---

## 10. Phase 1 scope (this deliverable)

The whole spine of the game, deliberately narrow in content:

- **In:** seeded RNG, calendar, data loader + validator, Player/Club/League models,
  overall-from-attributes, age curve, full match sim, the player's own match with key
  moments and match rating, manager objectives, training points and attribute sessions,
  weekly recovery, one complete league (Premier League, 20 club identities with
  generated supporting squads), season calendar, a dashboard UI, and save/load.
- **Implemented since the initial Phase 1 scope:** the five major European leagues and
  Betway Premiership, league scorer/assister and Player of the Season leaderboards,
  seeded UEFA and CAF Champions League simulations, and a four-year World Cup
  simulation.
- **Still out of scope:** transfers and player movement between leagues, promotion and
  relegation, media, and sponsorships. World Cup squads select league performers by
  known nationality and temporarily call up the career player without changing club
  registration. Tournament simulations are self-contained and are not yet scheduled
  into the weekly league calendar.

The current game is implemented as a dependency-free browser game backed by the seeded
engine modules, a `Career` facade, editable JSON content, and a static Node server.
Tournament state is part of the career save format and can be advanced independently
from the league calendar.
## Club hierarchy and staff

`src/model/hierarchy.mjs` is the authoritative plain-data model for club ownership,
boards, manager employment, coaching staff, objectives, relationships, and owner
requests. `Club` creates or migrates this structure, while `Career.advanceWeek()` posts
staff wages through the existing idempotent finance ledger. Manager results update the
board and dressing-room relationships; owner requests and responses are persisted in the
hierarchy inbox. The Manager Hub renders the current hierarchy rather than a static
mock. Existing saves without hierarchy data receive deterministic profiles during
restore, without changing standings, squads, transfers, or player histories.

`src/core/investment.mjs` owns persistent facility levels, project construction,
maintenance, completion effects, and conservative AI investment decisions. The
investment budget is separate from the transfer budget; manager careers approve
projects while player careers can inspect club finances but cannot spend club money.

## Scouting

`src/core/scouting.mjs` owns scout contracts, star-rated expertise, regional knowledge,
assignments, report uncertainty, youth prospect generation, shortlists, notifications,
and scouting expenses. Reports read the same player objects and market-value functions
used by transfers, but never mutate player attributes or overall ratings. `Career.advanceWeek()`
advances assignments and posts scout wages for every club using the existing idempotent
ledger; AI clubs can start restrained assignments when their scouting budget permits.
Club scouting state is plain JSON on the club object, so older saves receive a default
scout and budget during restore.

## Coaching and academy

`src/core/coaching.mjs` centralizes coach playstyle profiles, tactical settings,
formation suitability, and academy state. `Career.applyCoachFormations()` applies the
selected shape to each club while preserving deliberate real-manager overrides. Match
strength consumes the resulting playstyle settings with modest, attribute-dependent
benefits and fatigue trade-offs rather than a universal overall boost.

Accepted youth prospects remain persistent academy records until promoted or released.
`Career.advanceWeek()` develops academy attributes through the existing player rating
engine, using coach youth ability, facility level, potential ceilings, and development
plans. The same pathway is used for user and AI clubs, and academy/coach fields are
defaulted during save restoration so older careers remain valid.
