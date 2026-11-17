"""Download the ~800 px scans for a sample file into pilot/images/<id>.jpg (skips files already there).

Throwaway pilot tool:  python3 -I pilot/scripts/download_images.py pilot/data/sample_r4.json
"""
import json
import sys
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "ukiyoe-weather-pilot/0.1 (personal non-commercial project)"


def fetch(rec):
    dst = ROOT / "images" / f"{rec['id']}.jpg"
    if dst.exists() and dst.stat().st_size > 10_000:
        return rec["id"], "kept"
    req = urllib.request.Request(rec["image_url"], headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            data = r.read()
    except Exception as e:  # noqa: BLE001 - pilot tool
        return rec["id"], f"FAILED {e}"
    if data[:3] != b"\xff\xd8\xff":
        return rec["id"], "FAILED not a jpeg"
    dst.write_bytes(data)
    return rec["id"], f"{len(data) // 1024} KB"


recs = json.loads(Path(sys.argv[1]).read_text())
with ThreadPoolExecutor(6) as ex:
    results = list(ex.map(fetch, recs))
bad = [r for r in results if r[1].startswith("FAILED")]
print(len(results) - len(bad), "ok;", len(bad), "failed")
for r in bad:
    print(*r)
