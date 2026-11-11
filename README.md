# Touchline — Player Career Simulator

most important
if any changes are made they must be record here!

A dependency-free, browser-based football player-career simulation. The playable build
covers the 2026/27 five major European leagues and Betway Premiership, player creation,
seeded squad and match simulation, weekly development, league leaderboards, continental
and international tournament simulations, and browser save slots.

## Number formatting rule

Every displayed number must be either a whole number or a fractional number formatted
to exactly two decimal places. Do not display fractional values with more or fewer
than two decimal places; use the shared number-formatting helper wherever possible.

## Visual update

The interface uses a premium Touchline matchday skin inspired by modern football
gaming interfaces: charcoal and navy surfaces, lime matchday accents, floodlit
stadium atmosphere, layered depth, responsive navigation, polished player cards,
formation pitches, tables, forms, and reduced-motion support. This is a CSS-only
presentation upgrade; simulation rules, player data, save formats, routes, and
interactions remain unchanged.

## Real Club Logos

Generated placeholder crests have been replaced with real club logos (transparent
background SVGs) for all 96 clubs in the five major leagues (Premier League 20,
La Liga 20, Bundesliga 18, Serie A 20, Ligue 1 18).

- Logos live in `assets/logos/<league>/<slug>.svg`, one folder per league:
  `premier-league`, `la-liga`, `bundesliga`, `serie-a`, `ligue-1`.
- `assets/logos/index.json` maps each club name (exactly as spelled in
  `data/config/career-league-teams.json`) to its file path. Supplemental aliases
  from `data/config/supplemental-club-aliases.json` map to the same file.
- `src/ui/club-crests.mjs` `renderClubCrest(name, shortName, className)` returns
  an `` with `loading="lazy"`, `decoding="async"`, `object-fit: contain`, and
  `alt="<club> crest"` when a logo exists. When no logo exists, it falls back to
  the original generated SVG crest so nothing breaks. `clubCrestColors(name)` is
  unchanged and still drives shirt colours.
- CSS classes `.club-crest`, `.table-crest`, `.fixture-crest`, `.manager-crest`,
  and `.manager-crest-sm` use `object-fit: contain` so logos never stretch or
  crop at small table size or large manager-hub size.
- The catalog page `data/logos/team-crests.html` now shows the real logos,
  grouped by league.
- Attribution and licence notice live in `assets/logos/README.md`. Club crests
  are trademarks of their clubs; the logos should not be used commercially
  without permission.

All logos were verified to have fully transparent backgrounds (no white box, no
coloured square, no drop shadow).

## Club finance and transfer market

Club money is stored as integer euros inside each saved `Club.finances` profile.
Legacy `budget`, `wageBudget`, and `balance` fields remain synchronized for
backward compatibility. The ledger records weekly player wages, stadium/academy
operations, sponsorship instalments, home matchday revenue, and transfer fees.
Transactions carry deterministic event ids, so repeating a simulation event cannot
pay or charge a club twice.
Winning a domestic league or major tournament also pays prize money into the club
ledger, with most of the award increasing its transfer budget and a smaller share
supporting investment. The transaction is idempotent, so a saved season cannot pay the
same trophy twice.

The Transfers screen now exposes the live player market. Market values are derived
from overall, potential, age, contract length, club prestige, and development
trajectory; completed purchases check transfer and wage budgets, move the player
between real squad lists, update the contract, and write income/expense entries for
both clubs. Destination searches include all playable leagues, and strong recent form
improves a player's chance of drawing club interest. Older saves migrate missing
finance fields when loaded.

Player transfers now reconcile squad registration from each player's saved `clubId`
when a career is restored, keeping player profiles, team pages, and squad views aligned
with the active career state. FIFA World Cup fixtures for the player's nationality
appear in the main chronological Fixtures list whether or not the player is selected
for the national squad. A selected player enters their scheduled group or knockout
match through the existing Match Sim; full-time records the international appearance,
tournament score, and progression once, without adding a domestic league result.

The History tab records and displays the winning team for each completed league or
competition trophy, alongside the existing individual award winners. Older season
records without the new trophy list fall back to their saved league standings.
League champion honours are also assigned to every player in NPC background leagues,
so their player profiles and trophy cases retain domestic titles just like players in
the active career league. Club squads in active and background leagues are completed
with generated NPCs only when fewer than 20 source players are available. The five
major-league squads use the central 2026/27 player database; generated depth players
are not added when those clubs already have 20 or more imported players.

All players, including NPCs in background leagues, use the same position-weighted
attribute OVR engine. Legacy world performers are hydrated with detailed attributes on
creation or save restoration, and seasonal development changes those attributes before
recalculating OVR. High-OVR players have reduced goal and assist production; only a
fully developed 99 OVR player receiving a form boost to 99 gets the small peak-production
bonus. League simulation caps every player's season at 50 goals. Messi and Ronaldo now
use normal age, rating, development, transfer, and production rules.

The Ballon d'Or is calculated from completed matches in the
six supported competitions. Each candidate receives a capped score out of 1,000 across
domestic league performance (300), Champions League performance (250), individual
statistics (200), team achievements (150), and consistency/big-match performance (100).
The evaluator is position-specific, gives Champions League knockout matches extra weight,
uses diminishing returns, and keeps overall rating from deciding the result. The Awards
screen stores a 30-player shortlist, a top-10 ceremony ranking, category breakdowns,
achievements, club and nationality, and historical results in the career save. Final
season results are confirmed after the competitions finish; the Ballon d'Or ceremony is
presented at the start of the following season and is recorded once per award period.
Domestic league goals contribute 10 Ballon d'Or points each and assists contribute 5
points each before the 300-point domestic-category cap. Champions League goals and
assists use the same controlled values within their 250-point category cap. Domestic
and background-league player totals reset at the start
of every new season, so all candidates are evaluated on season form rather than career
totals.

Node-based tools and tests load the same local roster and competition configuration as the
browser using `src/data/loader.mjs`.

League Player of the Season is champion-aware: the award is selected from the best
performing players at the league-winning club, rather than automatically going to the
highest statistical producer at a non-champion club. Match simulation also measures
background-club strength from the live available squad, weighting the strongest XI and
the club's elite core. That measured strength drives expected goals and therefore makes
stronger squads more likely to win their league and major competitions.

## Run

Requires Node.js 20 or newer. From this folder:

```sh
npm.cmd start
```

Open the URL printed in the terminal (normally <http://127.0.0.1:4173>). If port
4173 is already occupied, the server automatically tries port 4199. To select a
different port explicitly in PowerShell, run `$env:PORT = 4200; npm.cmd start`.
No external packages or network connection are required.
Run the headless tests with `node --test` (or `npm.cmd test`). Use `npm start` in
Command Prompt if you prefer the shorter Windows command.

## Editable content

- `data/config/clubs.json` contains club identities and finances.
- `data/config/leagues.json` defines the Phase 1 league membership and schedule.
- `data/config/archetypes.json` and `data/config/objectives.json` drive player creation
  and manager objectives.
- `data/config/career.json` controls progression rewards and difficulty tuning.
- `data/config/football_leagues.csv` contains the supplied competition metadata used
  to show league sizes and season labels.
- `data/config/career-league-teams.json` lists the playable clubs in the five major
  European leagues; the five league rosters must match the central player database.
- `data/squads/touchline_player_database.csv` is the primary player source for the five
  major leagues. The supplied 2026/27 master contains 2,786 records across 96 clubs.
  The application does not merge `fc26_player_ratings.csv` or `player_additions.csv`
  into these league rosters. The supplied records retain their IDs, ratings, potential,
  attributes, nationality, positions, and birth dates. Their source status says club
  membership and ratings still require independent verification; blank contract,
  financial, physical, and shirt-number fields remain blank in the database.
- `src/data/touchline_2026_27_all_five_leagues.csv` is the supplied master-file copy;
  it is installed unchanged as `data/squads/touchline_player_database.csv`. The loader
  validates IDs, ratings, positions, league/club coverage, and quoted UTF-8 CSV data.
  “Ipswich” is normalized to the configured club name “Ipswich Town” during loading.
- `data/squads/ENG.json` contains generated-squad settings. Generated players remain
  available for other supported leagues and as a depth fallback only when a configured
  club has fewer than 20 source players; they are kept separate from master records.
- `data/squads/fc26_player_ratings.csv`, `data/squads/player_additions.csv`, and their
  mapping files are retained for legacy-save migration and compatibility tests, but
  are not loaded into new five-league careers or the World player browser.
- Imported roster sizes can exceed 25 players. Their registration capacity is preserved
  from the source roster (with a small transfer buffer), while clubs without this
  database-specific capacity retain the existing 25-player limit.

The supplied records are not independently verified by the game. The master CSV's
data-status field is preserved so users can distinguish its estimates from verified
information; missing values are not written back as invented database facts.

The game has three manual browser save slots and maintains a latest autosave in local
storage. Progress is autosaved after game actions and periodically during a live match,
so refreshing or closing the page does not lose the current career. Use Resume Autosave
from the main menu to restore the latest progress; manual slots remain available for
separate save points.

## Phase 1 controls

Create your player, choose a league and club, and advance a week at a time or play the
next scheduled league or tournament fixture from the Career hub. Advancing to a week
with your fixture now opens that match in the dedicated Match Sim tab without recording
the result early; start the match there to run its live clock, goal announcements,
commentary, and key-moment decisions. An unfinished live match resumes in Match Sim
after a save is loaded. Teams with few
imported players are filled out with seeded,
generated squad members so they can field a full team. Use **Simulate one day** or
**Simulate to end of season** to automatically complete scheduled fixtures, including
your own match, through full time. Successful
attacking decisions can score, creative decisions can create a goal, and defensive
decisions can block an upcoming opponent goal. The table and player match record are
finalized at full time.
Key moments offer three seeded, randomized context-sensitive actions for the player's
position, including goalkeeper-specific saves and distribution. Actions use their
relevant player attribute and have different success odds and match effects. Edit
`data/config/key-moment-options.json` to change the action catalog.
The Overview selection indicator and player match involvement use the same selected
line-up, including custom XI assignments and player availability. A player not selected
for the matchday squad cannot enter the simulation or receive minutes, a rating, or
match statistics; named substitutes only participate after the match engine brings
them on.
Training & Development uses natural, attribute-based progression; there are no player attribute points, manual attribute purchases, or point rewards. Every detailed player (user, imported, generated, academy, senior squad, and background-league performer) uses the same seasonal engine and position-weighted base OVR calculation. Age, potential, minutes, match rating, contribution, morale, fitness, training attendance, coach ability/specialisation, intensity, facilities, and recovery shape development and decline. Base OVR is distinct from potential and temporary form. Player-career users can view their club's coaches and set a personal attribute focus only; coach recruitment/dismissal, contracts, wages, programme/intensity decisions, department assignments, budgets, and facility investments are manager-career controls. AI clubs run the same development engine, employ specialist staff, post staff wages through the idempotent finance ledger, and cautiously recruit when affordable. Development reports and history persist with players; old training-point save fields are ignored during migration. The Player Hub shows a compact historical development graph. PlayStyles remain independent and continue to progress through training evidence and match actions.
Live key-moment types are weighted by position, so defenders face more recovery and
stopping situations, midfielders see more distribution moments, and attackers get
more finishing opportunities.
Choose a player role before the next match to change the player's simulated passing,
shooting, dribbling, defensive work, duel volume, and key-moment opportunities. Specialist
roles are limited to compatible positions and each role shows its tactical effect.
Each position also has 20 additional role-specific choices spread across its relevant
key moments. During live matches, 50 seeded football/stadium situations may occur; a
subset is one-time per career, and their small momentum effects are saved. If your
rating falls to 5.8 or below after the 45th minute, you can request a substitution.
Active and background fixtures share a seeded, event-driven match engine. Possessions
resolve through passes, dribbles, tackles, interceptions, shots, blocks, and goalkeeper
saves; player attributes, team strength, fitness, formation, tactics, and coaching affect
those actions. Goals, expected goals, possession, passing, shots, saves, and player
performance records are derived from the simulated events. Match timelines show goals,
cards, injuries, fouls, free kicks, offsides, blocks, and saves live and after full time. Injuries and red
cards affect player availability in following matches. AI players in active and world
leagues develop or decline each season based on age, potential, appearances, team, and
league context. The Top Performers tab shows league scorer and assister tables for every
club, based on completed match events.
A Player of the Season race updates from league stats and match ratings. Formation &
Squad shows the selected formation, its best starting XI, and substitutes. The Player
Hub brings together player details, season and career statistics, technical and detailed
attributes, season records, finances, a permanent trophy case with distinct trophy
artwork, and match history. The Trophy case shortcut keeps career honours within easy
reach, with appearance history in its own section below. The Game info tab summarizes
your current career and explains the main game
systems and controls. World-tab goals, assists, appearances, and ratings update from the simulated
season. The Players menu lists NPCs throughout the playable leagues and opens profiles
with player details, attributes, available season totals, and recorded match history.
Player appearances in played matches are saved to their profiles. Imported real players
use the game's three-letter country codes for nationality. Player names in rosters,
leaderboards, awards, and match reports link directly to the matching player profile;
World Cup reports and the live scoreboard identify the player's national team rather
than their club team.
known real-world entries with missing source countries are matched to their country.
Match reports
include teammate ratings after full time, and the Teammates tab tracks the squad's
appearances, goals, assists, average ratings, and latest match ratings. The Fixtures
tab labels every listed game with its competition, match number, and date; expand any
completed fixture to review its score, expected goals, possession, shots, saves, fouls,
cards, and offsides. Create your player with 1- or 2-star weak-foot and skill-move
ratings. Weak-foot and skill-move ratings are retained from the player profile and are not bought with training points; match actions continue to use both attributes. South Africa is available as a nationality.
Your player starts with €10,000, earns a weekly salary plus appearance and goal bonuses,
and can review their balance and transaction history in Finances. Earned money can hire
managers whose ratings directly improve club attack and defence, with tactical styles
adding specialized effects. The next-season button appears only after every club in all
six playable leagues has completed its fixtures; league tables and the current season
award race then reset while lifetime player totals and earned trophies are retained.
The Awards screen announces the Player of the Season, Golden Boot, Playmaker, Best
Average Rating, and Ballon d'Or winners. Eliminated teams leave their tournament while
the remaining fixtures continue through to the final.
The League Table tab lets you browse standings and top scorers/assisters for all six
playable leagues. Transfer offers can come from any of those leagues; accepting an
out-of-league offer switches the active career to that league. Tournament winners also
receive Golden Boot, Top Playmaker, and Player of the Tournament awards when recorded
performances are available.
Fan approval changes
after each appearance based on match rating and result; the career hub also shows the
supporters' expectation for your next league fixture.
Change your playing position from the player profile; overall is recalculated using
that position's attribute weights. Three local browser save slots are available.
The Tournaments tab includes the UEFA Champions League, CAF Champions League, and the
FIFA World Cup. World Cup fixtures use the existing player-based match engine and
progress across dated matchdays; tournament brackets, results, and matchday IDs are
included in career saves. Other competitions continue simulating during the tournament.
Each season, the top six clubs from each eligible domestic league qualify for the
Champions League. All 30 entrants play eight league-phase matches; the top 16 advance
to the Round of 16.
The first World Cup is scheduled exactly four in-game years after career creation
(2030 for a career starting in 2026); later editions remain on that save's four-year
cycle. Qualification advances in edition-relative rounds, including after the first
tournament, and completed editions cannot be simulated or awarded twice. National
squads select a balanced 26-player roster from eligible players across all supported
leagues using overall, form, recent ratings, season output, defensive contributions,
consistency, fitness, club level, experience, and potential. A career player must earn a
place against other players of their nationality and keeps their original club registration.
The existing supported nation pool is retained; missing positional depth is filled with
generated national-team NPCs so those countries can qualify and compete without adding
new country data.
World Cup group and knockout fixtures have independent, persisted dates. Matches progress
across the international calendar; selected players are unavailable to their clubs while
they are in the tournament, and recent participants receive recovery time after matches.
Domestic leagues, continental competitions, transfers, development, and world-league
simulation continue during the tournament. A season waits for its scheduled World Cup
to finish, extending the calendar when required. The career overview gives a selected
international player their next tournament match, stage, date, group position, and
tournament statistics.
The bundled roster currently supports a four-country finals field: one round-robin group
feeds a final, with third place determined by the group standings; larger eligible pools
use the corresponding larger group-and-knockout formats. International group ties use
head-to-head results before overall goal difference.
Lionel Messi is
included with FC Barcelona and Cristiano Ronaldo with Real Madrid in the La Liga roster.
Real club logos (transparent background) are shown in league tables, fixtures, and
team lists for the 96 clubs in the five major leagues. Open the full crest catalog
from the World tab or at [data/logos/team-crests.html](./data/logos/team-crests.html).

The season seed reproduces the same generated squads, fixture order, and random match
outcomes. Easy and Sandbox difficulty apply a small strength advantage to your club.

## Architecture and build phases

### Club hierarchy

Each club now carries a serialisable management hierarchy alongside its squad and
financial profile. The hierarchy contains an owner, board members, manager employment
record, specialist coaching/recruitment staff, season objectives, relationships, and an
idempotent inbox of board events. Known existing clubs use recognisable real-world
manager names; generated clubs receive deterministic fictional staff. Staff payroll is
posted through the normal finance ledger each simulation week, and manager-career
players can request a board meeting and respond to an owner request from the Manager
Hub. Legacy saves are migrated when clubs are reconstructed.

Player careers can browse the transfer market and club financial context, but cannot
approve club purchases, sales, formations, or starting-XI changes. The Player Hub
provides manager conversations for playing-time requests, recruitment requests, and
transfer requests. The manager evaluates these using player-manager trust, recent
performance, and wage capacity; an approved transfer still requires a valid destination
and transfer negotiation. Manager careers retain the club-level transfer and formation
authority.

Manager careers can allocate a separate investment budget to persistent projects:
training grounds, youth academies, medical centres, scouting networks, stadium
expansion, and commercial facilities. Manager careers also manage training coaches through
Training & Development, recruiting among F/E/D/C/B/A/S grades with numerical 1–99 ratings,
area specialisations, weekly salaries, recruitment costs and contract lengths. Specialists
have distinct technical, physical, tactical, and youth abilities, so coaching grade alone does
not replace the department fit. Club-wide programme and intensity decisions influence players
and recovery; coach salaries and recruitment fees are real club-ledger transactions. Projects deduct real cash through the finance
ledger, take simulation time to complete, charge recurring maintenance, and expose
modifiers to training, recovery, scouting, stadium capacity, and commercial reputation.
AI clubs can start conservative projects when they have sufficient reserves. Existing
saves receive level-one facilities and a derived investment budget during migration.

Manager careers also have a Scouting Hub backed by `src/core/scouting.mjs`. Clubs employ
scouts with separate ability, potential, tactical, youth, and regional-knowledge ratings.
Assignments consume a persistent scouting budget, progress only when the simulation
calendar advances, and produce confidence-bounded reports from the live player data.
Youth assignments generate finite, age-appropriate prospects using the existing seeded
attribute generator. Scout recruitment, wages, assignment expenses, reports, shortlists,
notifications, and youth prospects are saved with each club; AI clubs periodically run
affordable assignments as part of their weekly decision loop.

Manager careers group these systems under the Club Office. The Coaching dashboard gives
each manager a persistent tactical identity (including possession, pressing, counter,
wing-play, and defensive styles), selects formations from squad suitability, and exposes
the current XI and tactical settings. The Academy dashboard accepts discovered prospects
without immediately signing them to the senior squad, develops their real attributes
gradually through the existing rating engine, and supports promotion or release when
appropriate. Academy development uses the club's youth-academy facility level and coach
youth-development ability, so facilities and staff improve opportunity without
guaranteeing elite players.

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the layered architecture and remaining
development roadmap.

## Player PlayStyles

Players now carry a persistent, position-aware set of specialist PlayStyles, with Standard and rare PlayStyle+ tiers. The data-driven registry lives in `src/model/playstyles.mjs`; progression tuning defaults are in `data/config/playstyles.json`. Match actions apply contextual effects to normal execution/stat calculations (passing accuracy, shots on target/selection, dribbling retention, duels, defensive wins, aerials, and keeper saves). Abilities do not change overall ratings. Training focus and repeated in-match evidence advance unlock/upgrade progress; profile cards show category, effect, tier and progress, with filtering and teammate comparison. Existing saves migrate to an empty safe collection and legacy collection shapes are normalized; player data persists through the existing save/transfer/season serialization paths.
