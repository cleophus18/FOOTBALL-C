# Touchline — Real Club Logos

This folder contains real club crest SVG files for the 96 clubs in the five major European leagues used by Touchline / FOOTBALL-C.

## Folder layout

```
assets/logos/
├── index.json                  # club name -> file path mapping (plus aliases)
├── README.md                   # this file
├── premier-league/             # 20 clubs
│   ├── arsenal.svg
│   ├── aston-villa.svg
│   └── ...
├── la-liga/                    # 20 clubs
│   ├── alaves.svg
│   ├── athletic-club.svg
│   └── ...
├── bundesliga/                 # 18 clubs
│   ├── augsburg.svg
│   ├── bayern-munchen.svg
│   └── ...
├── serie-a/                    # 20 clubs
│   ├── atalanta.svg
│   ├── inter.svg
│   └── ...
└── ligue-1/                    # 18 clubs
    ├── marseille.svg
    ├── paris-saint-germain.svg
    └── ...
```

## Fallback behaviour

`src/ui/club-crests.mjs` exports `renderClubCrest(name, shortName, className)`. When a logo exists for the club (matched via `assets/logos/index.json`), it returns an `` element with `loading="lazy"`, `decoding="async"`, `object-fit: contain`, and `alt="<club> crest"`. When no logo exists, it falls back to the original generated SVG crest so nothing breaks. `clubCrestColors(name)` is unchanged and still drives shirt colours.

## Attribution / licence

Club crests are trademarks of their respective clubs and rights holders.

Source repository: https://github.com/JoseArroyave/football-logos

The source collection is stated by its maintainer to be available under the MIT license and "Free to use for personal and commercial projects." That licence covers the repository's curation and SVG encoding work; it does not transfer ownership of any club trademark or guarantee rights for every crest. Individual club crests remain the property of their clubs.

These logos are included for identification/reference use in Touchline. They should not be used commercially without checking each rights holder's requirements and obtaining permission where required.

## Transparency

All logos are SVG with fully transparent backgrounds (no white box, no coloured square, no drop shadow). They render correctly at small table size and at the larger manager-hub size via `object-fit: contain`.
