"""Round 3: pick ~100 more prints to widen the collection, write pilot/data/sample_r3.json.

Three groups:
  gap        ~40  titles hinting at thin categories (mist, dawn, night, moon, rain, snow, evening, wind)
  shin_hanga ~30  Kawase Hasui and Yoshida Hiroshi (public domain at Minneapolis)
  random     ~30  random landscapes, to keep the collection representative

Sources: Minneapolis (genre field) and Rijksmuseum (Japan collection, prints, colour woodcut).
Skips designs already in the pilot sample. Throwaway pilot tool:  python3 -I pilot/scripts/harvest_round3.py
"""
import json
import random
import re
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harvest as h  # noqa: E402  (reuses the round-1 helpers: get_json, mia_search, mia_record, rijks_ids, rijks_record)

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "sample_r3.json"
RNG = random.Random(2026)

GAP_EN = r"\b(mist|misty|fog|haze|hazy|dawn|daybreak|morning|sunrise|night|moon|moonlight|moonlit|rain|rainy|shower|snow|snowy|evening|dusk|twilight|sunset|wind|windy|storm|clearing)\b"
GAP_NL = r"\b(nevel|mist|ochtend|dageraad|zonsopgang|nacht|maan|maanlicht|regen|bui|sneeuw|avond|schemering|zonsondergang|wind|storm)\w*"

existing = json.loads((ROOT / "data" / "sample.json").read_text())
seen_ids = {r["id"] for r in existing}


def norm(s):
    return re.sub(r"[^a-z0-9]+", " ", (s or "").lower()).strip()


seen_designs = {(norm((r.get("artist") or "").split(";")[0])[:20], norm(r.get("title"))) for r in existing}


def new_design(rec):
    key = (norm((rec.get("artist") or "").split(";")[0])[:20], norm(rec.get("title")))
    if rec["id"] in seen_ids or key in seen_designs:
        return False
    seen_ids.add(rec["id"])
    seen_designs.add(key)
    return True


def take_mia(hits, n, group, extra=None):
    hits = [x for x in hits if h.aspect_ok(x.get("image_width"), x.get("image_height"))]
    RNG.shuffle(hits)
    out = []
    for x in hits:
        if len(out) >= n:
            break
        if "Tōshi" in (x.get("artist") or ""):
            continue  # post-war Yoshida Tōshi: still in copyright in Japan
        rec = h.mia_record(x, group)
        if extra:
            rec.update(extra)
        if new_design(rec):
            out.append(rec)
    return out


def rijks_ids_multi(pairs, limit=1200):
    """Rijksmuseum search with repeated parameters (several sets are ANDed)."""
    import urllib.parse
    url = "https://data.rijksmuseum.nl/search/collection?" + urllib.parse.urlencode(pairs)
    ids = []
    while url and len(ids) < limit:
        page = h.get_json(url)
        ids += [i["id"] for i in page.get("orderedItems", [])]
        url = (page.get("next") or {}).get("id")
        time.sleep(0.3)
    return ids


def main():
    base = 'rights_type:"Public Domain" AND image:valid AND '
    picks = []

    # --- gap fillers from Minneapolis landscapes (title keywords)
    land = h.mia_search(base + 'object_name:"fūkei-ga"', 2000)
    gap_pool = [x for x in land if re.search(GAP_EN, x.get("title") or "", re.I)]
    picks += take_mia(gap_pool, 25, "gap")
    print("mia gap:", len(picks), "of pool", len(gap_pool))

    # --- shin-hanga: Hasui and Yoshida Hiroshi
    sh = h.mia_search(base + '(Hasui OR "Yoshida Hiroshi")', 500)
    n0 = len(picks)
    picks += take_mia(sh, 30, "shin_hanga")
    print("mia shin-hanga:", len(picks) - n0, "of pool", len(sh))

    # --- random landscapes from Minneapolis
    n0 = len(picks)
    picks += take_mia(land, 15, "random")
    print("mia random:", len(picks) - n0)

    # --- Rijksmuseum: Japan collection, prints, colour woodcut
    ids = rijks_ids_multi([("memberOfSetId", "26134"), ("memberOfSetId", "26151"),
                           ("technique", "kleurenhoutsnede"), ("imageAvailable", "true")], limit=1200)
    RNG.shuffle(ids)
    print("rijks pool:", len(ids))
    want = {"gap": 15, "random": 15}
    got = {"gap": 0, "random": 0}
    tried = 0
    for oid in ids:
        if all(got[g] >= want[g] for g in want) or tried > 260:
            break
        tried += 1
        try:
            rec = h.rijks_record(oid, "random")
        except Exception as e:  # noqa: BLE001 - pilot tool
            print("rijks skip", oid, e)
            continue
        time.sleep(0.3)
        if not rec or not h.aspect_ok(*rec["pixel_size"]):
            continue
        text = f"{rec.get('title') or ''} {rec.get('title_alt') or ''} {rec.get('notes') or ''}"
        g = "gap" if re.search(GAP_NL, text, re.I) or re.search(GAP_EN, text, re.I) else "random"
        if got[g] >= want[g]:
            continue
        rec["group"] = g
        if new_design(rec):
            picks.append(rec)
            got[g] += 1
    print("rijks:", got, "tried", tried)

    OUT.write_text(json.dumps(picks, ensure_ascii=False, indent=1))
    from collections import Counter
    print("total", len(picks), dict(Counter(r["group"] for r in picks)), "->", OUT)


if __name__ == "__main__":
    main()
