# Phase 1 data schema

All file content is JSON and can be edited without changing simulation logic.

## `config/leagues.json`

Each league is keyed by id and defines `id`, `name`, `nation`, `tier`, `clubGroup`,
`teamIds`, `seasonStartYear`, `seasonWeeks`, `fixtureStartWeek`, `fixtureEndWeek`,
`pointsForWin`, and `pointsForDraw`. Phase 1 currently defines the English top flight.

## `config/archetypes.json`

Each position has its own set of archetypes (the dropdown filters to the selected
position's archetypes). An archetype has a `focus` (the attribute group that gets a
small bonus at creation) and a short `description` used in player creation. The
"Complete" archetype is repeated across every position as a balanced all-rounder.

## `config/objectives.json`

Each manager objective has an `id`, player-facing `title`, evaluator `type`, and,
where relevant, a numeric `target`. Supported Phase 1 types are `rating`, `passes`,
and `goalContribution`.

## `config/career.json`

`training` configures weekly points, attribute-point costs, fatigue recovery and
match-performance rewards. `difficultyBonuses` sets user-club strength modifiers by
difficulty.

## `squads/ENG.json`

`firstNames` and `lastNames` are editable name pools; `positions` defines the generated
18-player squad shape; `ageRange`, `ratingOffsetByPosition`, and `clubRatingFormula`
control the generated roster ratings; `startingPlayer` defines creation rating bounds;
`nationality` supplies the generated players' national affiliation.

## `config/clubs.json`

Club records contain identity, location, stadium, capacity, founding year, prestige,
budgets, colors, and coefficient. `england` and `england2` are separate club groups.
`dataSource` records whether stadium metadata came from a public club reference or was
generated as a safe fallback for a generated identity whose public page did not expose
the field during import.
