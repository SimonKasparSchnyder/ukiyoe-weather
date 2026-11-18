"""Export the included pilot prints (round 2 tags) to web/data/index.json.

Throwaway pilot tool until the real pipeline exists. Run with:
    python3 -I pilot/scripts/export_index.py
"""
import json
import re
import shutil
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from colors import measure  # noqa: E402  (paper and accent colours measured from the scan)
ROUND = sys.argv[1] if len(sys.argv) > 1 else "v2"
SRC = PROJECT / "pilot" / "data" / f"tags_{ROUND}.json"
# hosted fallback copies only for the original pilot prints (a curated ~100-print set will replace these later)
FALLBACK_IDS = {r["id"] for r in json.loads((PROJECT / "pilot" / "data" / "sample.json").read_text())}
OUT = PROJECT / "web" / "data" / "index.json"
ALIASES = {"wild_geese_flying": "wild_geese", "wild_geese_descending": "wild_geese"}
FALLBACK_DIR = PROJECT / "web" / "fallback"
# Prints whose local copy we don't host (still in copyright in Japan); the app links to the museum only.
NO_FALLBACK = {"mia-83142"}  # Yoshida Tōshi, 1954
# The same design held twice (two museums, two impressions, or a later copy): left out of the index, so the
# 10-minute rotation never shows one design twice in a row. Kept: the copy that came in first; originals over
# Hokumyō's kamigata copies. Found by a title and image-similarity check over the whole index (round 5).
DUPLICATE_OF = {
    "mia-34745": "aic-4421",             # Kyoto: Great Bridge at Sanjō (Hōeidō Tōkaidō)
    "mia-63441": "aic-26629",            # Night View of Saruwaka-machi (Edo hyakkei)
    "mia-22799": "aic-24690",            # Hongan-ji at Asakusa: Hokumyō's copy of Hokusai
    "aic-87008": "mia-9612",             # Rainstorm beneath the Summit (AIC: "Shower Below the Summit")
    "mia-22788": "mia-9612",             # Rainstorm beneath the Summit: Hokumyō's copy
    "mia-62752": "mia-9152",             # Mishima Pass in Kai Province ("Mishima High Road")
    "rijks-RP-P-1973-221": "mia-65871",  # Hokusai, Snow on the Sumida River
    "mia-61062": "mia-63210",            # Shinagawa (Hōeidō): "Departure of a Daimyō" = "Sunrise"
    "mia-64061": "rijks-RP-P-1956-751",  # Hotohoto Festival, Izumo (Sixty-odd Provinces)
    "mia-64489": "aic-18278",            # Hodogaya (Reisho Tōkaidō)
}
# scans that need turning (degrees, clockwise), found during tagging
ROTATION = {"rijks-RP-P-1952-193": 180}  # Toyoharu, Meguro Fudō: scanned upside down


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def with_paper(colors, tagged):
    """When the scan shows almost no paper, use the tagger's lightest colour toned towards warm paper,
    so the app never needs the tagger palette itself (it isn't published)."""
    if colors.get("paper") or not tagged:
        return colors
    rgbs = [[int(h[i:i + 2], 16) for i in (1, 3, 5)] for h in tagged]
    light = max(rgbs, key=lambda c: 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2])
    paper = [round(v * 0.65 + w * 0.35) for v, w in zip(light, (233, 226, 211))]
    colors["paper"] = "#%02x%02x%02x" % tuple(paper)
    colors["paper_source"] = "tagger fallback"
    return colors


def copy_fallback(pid):
    """Copy the pilot image into web/fallback/ and return its path relative to web/ (or None)."""
    src = PROJECT / "pilot" / "images" / f"{pid}.jpg"
    if pid in NO_FALLBACK or pid not in FALLBACK_IDS or not src.exists():
        return None
    FALLBACK_DIR.mkdir(exist_ok=True)
    dst = FALLBACK_DIR / f"{pid}.jpg"
    if not dst.exists() or dst.stat().st_size != src.stat().st_size:
        shutil.copyfile(src, dst)
    return f"fallback/{pid}.jpg"


index = []
for rec in json.loads(SRC.read_text()):
    m, t = rec["meta"], rec["tags"]
    if not t.get("include") or m["id"] in DUPLICATE_OF:
        continue
    t = dict(t)
    t["seasonal_markers"] = sorted({ALIASES.get(x, x) for x in t.get("seasonal_markers") or []})
    index.append({
        "id": m["id"],
        "design_id": slug(f"{(m.get('artist') or '').split(';')[0]} {m.get('title', '')}"),
        "title": m.get("title"),
        "artist": m.get("artist"),
        "date": m.get("date"),
        "series": m.get("series"),
        "source": m.get("source"),
        "rights": m.get("rights"),
        "object_url": m.get("object_url"),
        "image_url": m.get("image_url"),
        "local_image": copy_fallback(m["id"]),
        "pixel_size": m.get("pixel_size"),
        "crop": t.get("crop"),
        "rotation": ROTATION.get(m["id"], 0),
        "crop_shape": t.get("crop_shape", "rect"),
        "palette": t.get("palette"),
        "colors": with_paper(measure(PROJECT / "pilot" / "images" / f"{m['id']}.jpg", t.get("crop"), t.get("palette")),
                             t.get("palette")),
        "era": t.get("era"),
        "group": m.get("group"),
        "tags": {k: t.get(k) for k in (
            "genre", "weather", "wind", "snow_ground", "time_of_day", "moon", "season",
            "seasonal_markers", "environment", "place", "fuji", "evidence")},
    })

OUT.write_text(json.dumps(index, ensure_ascii=False, indent=1))
print(f"{len(index)} prints -> {OUT}")
