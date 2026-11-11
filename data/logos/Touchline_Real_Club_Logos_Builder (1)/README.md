# Touchline — real club logo pack builder

This builder targets the exact 2026/27 five-league club list in Touchline / FOOTBALL-C.

## Contents
- `clubs.json` — the 96 club names from `data/config/career-league-teams.json`
- `download_logos.py` — downloads matching real SVG club crests and packages them
- The generated ZIP will contain league folders, `manifest.json`, `missing.json`, and attribution notes.

## Build the actual logo archive
1. Extract this builder ZIP.
2. Open a terminal in the extracted folder.
3. Run `python download_logos.py`.
4. The script creates `touchline-real-club-logos.zip`.

Python 3 is required. The download step needs an internet connection. The script deliberately reports uncertain or missing filename matches rather than silently assigning the wrong club badge.

## Important
The source collection is `https://github.com/JoseArroyave/football-logos` and its repository README states that it is MIT licensed. Individual club crests remain trademarks/copyright of their respective rights holders. Check the applicable permissions before distributing the crests publicly or using them commercially.

Touchline already has a custom crest renderer in `src/ui/club-crests.mjs`; those generated badges are original in-game artwork, not official club crests. This builder is intended to provide real club crests instead.
