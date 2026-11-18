"""Merge round-5 tags into the full tag set: tags_v5.json = tags_v4.json (271) + round-5 batches (104).

Round-5 prints were tagged with the same brief rules (taxonomy draft 3), so both sets are comparable.
Throwaway pilot tool:  python3 -I pilot/scripts/merge_round5.py
"""
import json
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
meta = {r["id"]: r for r in json.loads((DATA / "sample_r5.json").read_text())}
new = []
for f in sorted(DATA.glob("tags_r5_batch*.json")):
    new += json.loads(f.read_text())
ids = [t["id"] for t in new]
assert len(ids) == len(set(ids)), "duplicate ids across batches"
missing = set(meta) - set(ids)
assert not missing, f"untagged: {sorted(missing)}"
old = json.loads((DATA / "tags_v4.json").read_text())
old_ids = {r["meta"]["id"] for r in old}
assert not old_ids & set(ids), "round-5 id already tagged earlier"
merged = old + [{"meta": meta[t["id"]], "tags": t} for t in new]
(DATA / "tags_v5.json").write_text(json.dumps(merged, ensure_ascii=False, indent=1))
inc = sum(1 for r in merged if r["tags"].get("include"))
print(f"{len(merged)} tagged ({len(new)} new), {inc} included -> {DATA / 'tags_v5.json'}")
