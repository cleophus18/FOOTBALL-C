#!/usr/bin/env python3
"""
Build a local ZIP of Touchline's real club crests from the public
JoseArroyave/football-logos GitHub repository.

Run: python download_logos.py
Uses only Python's standard library. Internet access is required when run.
The script reports any club for which it cannot find a confident filename match.
"""
import json, re, sys, time, urllib.request, urllib.error, zipfile
from pathlib import Path
from difflib import SequenceMatcher

ROOT = Path(__file__).resolve().parent
REPO = "JoseArroyave/football-logos"
TREE_URL = f"https://api.github.com/repos/{REPO}/git/trees/main?recursive=1"
RAW_BASE = f"https://raw.githubusercontent.com/{REPO}/refs/heads/main/"
COUNTRY_DIR = {
    "Premier League": "england",
    "La Liga": "spain",
    "Bundesliga": "germany",
    "Serie A": "italy",
    "Ligue 1": "france",
}
ALIASES = {
    "Brighton & Hove Albion": ["Brighton", "Brighton and Hove Albion"],
    "Bayern München": ["Bayern Munich", "Bayern"],
    "Borussia Mönchengladbach": ["Borussia Monchengladbach", "Monchengladbach"],
    "FC Köln": ["Koln", "FC Koln", "1 FC Koln"],
    "VfB Stuttgart": ["Stuttgart"],
    "FC Barcelona": ["Barcelona"],
    "Atlético Madrid": ["Atletico Madrid", "Atletico"],
    "Alavés": ["Alaves"],
    "Deportivo de La Coruña": ["Deportivo La Coruna", "Deportivo"],
    "Málaga": ["Malaga"],
    "Paris Saint-Germain": ["Paris Saint Germain", "PSG"],
    "AC Milan": ["Milan"],
    "Inter": ["Inter Milan", "Internazionale"],
    "Leeds United": ["Leeds"],
    "Manchester City": ["Man City"],
    "Manchester United": ["Man United", "Man Utd"],
    "Newcastle United": ["Newcastle"],
    "Tottenham Hotspur": ["Tottenham", "Spurs"],
    "Nottingham Forest": ["Nottingham"],
    "West Ham United": ["West Ham"],
    "Athletic Club": ["Athletic Bilbao"],
    "Real Betis": ["Betis"],
    "Real Sociedad": ["Sociedad"],
    "RB Leipzig": ["Leipzig"],
    "Bayer Leverkusen": ["Leverkusen"],
    "Borussia Dortmund": ["Dortmund"],
    "Eintracht Frankfurt": ["Frankfurt"],
    "Mainz 05": ["Mainz"],
    "RB Leipzig": ["Leipzig"],
    "Paris FC": ["Paris"],
    "Le Havre": ["Havre"],
}

def norm(s):
    import unicodedata
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\.(svg)$", "", s)
    s = re.sub(r"[^a-z0-9]+", "", s)
    for prefix in ("footballclub", "club", "fc", "afc", "ac", "as", "sc", "cf"):
        if s.startswith(prefix) and len(s) > len(prefix) + 3:
            s = s[len(prefix):]
    return s

def get_json(url):
    req = urllib.request.Request(url, headers={"User-Agent": "Touchline-Logo-Pack-Builder/1.0"})
    with urllib.request.urlopen(req, timeout=45) as response:
        return json.loads(response.read().decode("utf-8"))

def main():
    clubs = json.loads((ROOT / "clubs.json").read_text(encoding="utf-8"))
    print("Loading public logo repository index...")
    tree = get_json(TREE_URL).get("tree", [])
    files = {}
    for league, country in COUNTRY_DIR.items():
        files[league] = [
            item["path"] for item in tree
            if item.get("type") == "blob"
            and item["path"].lower().startswith(f"logos/{country}/")
            and item["path"].lower().endswith(".svg")
        ]

    out = ROOT / "touchline-real-club-logos.zip"
    manifest, missing = [], []
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for league, names in clubs.items():
            country_files = files.get(league, [])
            for club in names:
                candidates = [club] + ALIASES.get(club, [])
                scored = []
                for path in country_files:
                    stem = Path(path).stem
                    score = max(SequenceMatcher(None, norm(alias), norm(stem)).ratio()
                                for alias in candidates)
                    if norm(stem) == norm(club) or any(norm(stem) == norm(a) for a in candidates):
                        score = 1.0
                    scored.append((score, path))
                scored.sort(reverse=True)
                if not scored or scored[0][0] < 0.88 or (
                    len(scored) > 1 and scored[0][0] - scored[1][0] < 0.035
                    and scored[0][0] < 1.0
                ):
                    missing.append({"league": league, "club": club,
                                    "best_candidates": [p for _, p in scored[:3]]})
                    print(f"NOT MATCHED: {league} / {club}")
                    continue
                path = scored[0][1]
                url = RAW_BASE + urllib.parse.quote(path, safe="/")
                try:
                    req = urllib.request.Request(url, headers={"User-Agent": "Touchline-Logo-Pack-Builder/1.0"})
                    with urllib.request.urlopen(req, timeout=35) as response:
                        data = response.read()
                    if b"<svg" not in data[:2000].lower():
                        raise ValueError("Downloaded file did not look like SVG")
                    filename = norm(club) + ".svg"
                    archive_path = f"{league}/{filename}"
                    zf.writestr(archive_path, data)
                    manifest.append({"league": league, "club": club,
                                     "file": archive_path, "source": url})
                    print(f"OK: {league} / {club}")
                except Exception as exc:
                    missing.append({"league": league, "club": club, "error": str(exc)})
                    print(f"DOWNLOAD FAILED: {league} / {club}: {exc}")
                time.sleep(0.04)
        zf.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2))
        zf.writestr("missing.json", json.dumps(missing, ensure_ascii=False, indent=2))
        zf.writestr("ATTRIBUTION.txt",
            "Club crests are trademarks/copyright of their respective clubs and rights holders.\\n"
            "Source repository: https://github.com/JoseArroyave/football-logos\\n"
            "The source repository states that its collection is available under an MIT license; "
            "that does not transfer ownership of club trademarks or guarantee rights for every crest.\\n"
            "For identification/reference use. Check each rights holder's requirements before public or commercial release.\\n")
    print(f"\\nCreated: {out}")
    print(f"Matched: {len(manifest)} / {sum(map(len, clubs.values()))}")
    print(f"Unmatched/download failures: {len(missing)}")
    if missing:
        print("Review missing.json in the ZIP and add the correct SVG files for unmatched clubs.")
    return 0

if __name__ == "__main__":
    import urllib.parse
    sys.exit(main())
