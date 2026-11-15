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
SRC = PROJECT / "pilot" / "data" / "tags_v2.json"
OUT = PROJECT / "web" / "data" / "index.json"
ALIASES = {"wild_geese_flying": "wild_geese", "wild_geese_descending": "wild_geese"}
FALLBACK_DIR = PROJECT / "web" / "fallback"
# Prints whose local copy we don't host (still in copyright in Japan); the app links to the museum only.
NO_FALLBACK = {"mia-83142"}  # Yoshida Tōshi, 1954


def slug(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:60]


def copy_fallback(pid):
    """Copy the pilot image into web/fallback/ and return its path relative to web/ (or None)."""
    src = PROJECT / "pilot" / "images" / f"{pid}.jpg"
    if pid in NO_FALLBACK or not src.exists():
        return None
    FALLBACK_DIR.mkdir(exist_ok=True)
    dst = FALLBACK_DIR / f"{pid}.jpg"
    if not dst.exists() or dst.stat().st_size != src.stat().st_size:
        shutil.copyfile(src, dst)
    return f"fallback/{pid}.jpg"


index = []
for rec in json.loads(SRC.read_text()):
    m, t = rec["meta"], rec["tags"]
    if not t.get("include"):
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
        "crop_shape": t.get("crop_shape", "rect"),
        "palette": t.get("palette"),
        "colors": measure(PROJECT / "pilot" / "images" / f"{m['id']}.jpg", t.get("crop"), t.get("palette")),
        "era": t.get("era"),
        "tags": {k: t.get(k) for k in (
            "genre", "weather", "wind", "snow_ground", "time_of_day", "moon", "season",
            "seasonal_markers", "environment", "place", "fuji", "evidence")},
    })

OUT.write_text(json.dumps(index, ensure_ascii=False, indent=1))
print(f"{len(index)} prints -> {OUT}")
