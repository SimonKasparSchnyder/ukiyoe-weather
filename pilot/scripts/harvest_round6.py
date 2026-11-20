"""Round 6: single print added on request — Kiyochika, The Second Month, Matsuchiyama in Snow at Dusk (Mia 9657).

Writes pilot/data/sample_r6.json.  Throwaway pilot tool:  python3 -I pilot/scripts/harvest_round6.py
"""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harvest as h  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "sample_r6.json"
IDS = [9657]

picks = []
for mid in IDS:
    hits = [x for x in h.mia_search(f"id:{mid}", 5) if str(x["id"]) == str(mid)]
    assert hits, f"mia {mid} not found"
    s = hits[0]
    assert s.get("rights_type") == "Public Domain", s.get("rights_type")
    rec = h.mia_record(s, "request")
    rec["lookup"] = "requested: Kiyochika snow on the Sumida"
    picks.append(rec)
OUT.write_text(json.dumps(picks, ensure_ascii=False, indent=1))
print(json.dumps(picks, ensure_ascii=False, indent=1))
