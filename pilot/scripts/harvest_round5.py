"""Round 5: pick ~110 more prints (to land near 100 included), write pilot/data/sample_r5.json.

Groups:
  famous  random picks from well-known series and artists: Hiroshige's Kisokaidō, Famous Places in the Sixty-odd
          Provinces and One Hundred Famous Views of Edo, Hokusai's Thirty-six Views of Mount Fuji, Hasui, Yoshida
  edge    title-keyword pools for what is still thin after round 4: places outside Kantō and the Tōkaidō (Tōhoku,
          Hokkaidō, Chūgoku, Shikoku, Kyūshū), seasonal flowers and events without prints yet (wisteria, fireflies,
          morning glories, azaleas, chrysanthemums, peach blossom, irises, plum), dawn, wind, light rain,
          birds and flowers in weather (kachō-e), more Meiji views (Kiyochika)
  random  random landscapes from Minneapolis and the Rijksmuseum

Only public-domain records with an image. Skips designs already harvested in rounds 1-4.
Throwaway pilot tool:  python3 -I pilot/scripts/harvest_round5.py
"""
import json
import random
import re
import sys
import time
import unicodedata
from collections import Counter
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import harvest as h  # noqa: E402  (get_json, mia_search, mia_record, rijks_record, aspect_ok)
from harvest_round3 import rijks_ids_multi  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "sample_r5.json"
RNG = random.Random(2028)
BASE = 'rights_type:"Public Domain" AND image:valid AND '

FAMOUS = [  # (Mia query, how many)
    ('portfolio:"Sixty-nine Stations"', 9),
    ('portfolio:"Sixty-odd Provinces"', 10),
    ('portfolio:"Thirty-six Views of Mount Fuji" AND artist:Hokusai', 5),
    ('portfolio:"Hundred Famous Views of Edo"', 7),
    ('artist:Hasui AND object_name:"fūkei-ga"', 7),
    ('artist:"Yoshida Hiroshi" AND object_name:"fūkei-ga"', 9),
]

REGION = (r"\b(ezo|hokkaid|matsushima|sendai|mutsu|dewa|akita|aomori|iwaki|shiogama|kinkazan|"
          r"nagasaki|satsuma|hizen|higo|bungo|buzen|chikuzen|chikugo|hyuga|hyūga|ōsumi|osumi|kagoshima|"
          r"awa|sanuki|iyo|tosa|aki|itsukushima|miyajima|izumo|iwami|nagato|suō|suo|bitchū|bizen|bingo|hōki|hoki|inaba|"
          r"kintai|iwakuni|beppu|unzen|aso|kumamoto|kochi|kōchi|matsue|hiroshima|okayama)\b")
EDGE = [  # (title regex, pool, how many)
    (REGION, "land", 12),
    (r"\b(wisteria|fuji no hana|firefl\w*|morning glor\w*|azalea\w*|chrysanthemum\w*|peach|iris\w*|irises|plum)\b", "land", 8),
    (r"\b(wisteria|morning glor\w*|azalea\w*|chrysanthemum\w*|peach|iris\w*|hydrangea\w*|peon\w*|camellia\w*|plum)\b", "kacho", 5),
    (r"\b(snow|rain|moon|wind|night|mist|storm)\b", "kacho", 6),
    (r"\b(dawn|daybreak|sunrise|first light|morning)\b", "land", 5),
    (r"\b(wind|windy|gale|storm|squall|typhoon)\b", "land", 3),
    (r"\b(drizzle|light rain|misty rain|spring rain|autumn rain|evening rain|shower|showers)\b", "land", 4),
    (r"\b(snow|rain|night|moon|evening|morning|mist|fog|sunset|dusk)\b", "kiyochika", 4),
]

old_samples = ("sample.json", "sample_r3.json", "sample_v3.json", "sample_r4.json")
SKIP = set()  # filled after review if needed
seen_ids, seen_designs = set(SKIP), set()


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode().lower()
    s = re.sub(r"\[.*?\]|\(.*?\)", " ", s)                 # drop "[second state]", "(Kanbara yoru no yuki)"
    s = re.sub(r"^(no\.?\s*)?\d+[,.:]?\s*", "", s)          # drop "No. 42", "13,"
    return re.sub(r"[^a-z0-9]+", " ", s).strip()


def design_key(rec):
    artist = norm((rec.get("artist") or "").split(";")[0]).split(" ")
    artist = " ".join(a for a in artist if a not in ("utagawa", "katsushika", "kawase", "yoshida", "kobayashi", "ohara"))[:12]
    return artist, norm(rec.get("title"))


for name in old_samples:
    for r in json.loads((ROOT / "data" / name).read_text()):
        seen_ids.add(r["id"])
        seen_designs.add(design_key(r))


def japanese_print(x):
    obj = x.get("object_name") or ""
    artist = x.get("artist") or ""
    return ("Print" in obj and ("ukiyo-e" in obj or "shin hanga" in obj or "hanga" in obj)
            and "Hokumyō" not in artist      # kamigata copies of Edo designs
            and "Tōshi" not in artist)       # post-war Yoshida Tōshi: still in copyright in Japan


def usable(x):
    return japanese_print(x) and h.aspect_ok(x.get("image_width"), x.get("image_height"))


def take(rec):
    k = design_key(rec)
    if rec["id"] in seen_ids or k in seen_designs:
        return False
    seen_ids.add(rec["id"])
    seen_designs.add(k)
    return True


def take_from(hits, n, group, lookup):
    hits = sorted(hits, key=lambda x: x["id"])  # Mia returns hits in varying order: sort first, so the draw repeats
    RNG.shuffle(hits)
    got = []
    for x in hits:
        if len(got) >= n:
            break
        rec = h.mia_record(x, group)
        rec["lookup"] = lookup
        if take(rec):
            got.append(rec)
    return got


def main():
    picks = []

    for q, n in FAMOUS:
        hits = [x for x in h.mia_search(BASE + q, 400) if usable(x)]
        got = take_from(hits, n, "famous", q)
        picks += got
        print(f"famous {q[:55]:55} pool {len(hits):3} took {len(got)}")

    pools = {
        "land": [x for x in h.mia_search(BASE + 'object_name:"fūkei-ga"', 2000) if usable(x)],
        "kacho": [x for x in h.mia_search(BASE + 'object_name:"kachō-e"', 600) if usable(x)],
        "kiyochika": [x for x in h.mia_search(BASE + 'artist:Kiyochika AND object_name:"fūkei-ga"', 400) if usable(x)],
    }
    print("pools:", {k: len(v) for k, v in pools.items()})
    for rx, pool, n in EDGE:
        cands = [x for x in pools[pool] if re.search(rx, x.get("title") or "", re.I)]
        got = take_from(cands, n, "edge", rx[:60])
        picks += got
        print(f"edge {rx[:45]:45} {pool:9} pool {len(cands):3} took {len(got)}")

    got = take_from(pools["land"], max(0, 104 - len(picks)), "random", "random landscape")
    picks += got
    print("mia random:", len(got))

    view = r"\b(gezicht|landschap|view|rivier|brug|berg|fuji|meer|zee|baai|tempel|weg|station|sneeuw|regen|maan|avond|nacht)"
    ids = rijks_ids_multi([("memberOfSetId", "26134"), ("memberOfSetId", "26151"),
                           ("technique", "kleurenhoutsnede"), ("imageAvailable", "true")], limit=1500)
    ids = sorted(ids)
    RNG.shuffle(ids)
    got, tried = 0, 0
    for oid in ids:
        if got >= 6 or tried > 250:
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
        if not re.search(view, f"{rec.get('title') or ''} {rec.get('title_alt') or ''}", re.I):
            continue
        if take(rec):
            picks.append(rec)
            got += 1
    print("rijks random:", got, "tried", tried)

    # dropped after looking at the scans (applied last, so the rest of the selection stays the same)
    # dropped after looking at the scans (applied after the main draw, so the rest of the selection stays the same)
    review_drop = {
        "mia-90028",  # actor print
        "mia-90030",  # actor print
        "mia-61331",  # same design as mia-64198 (Bonfire Shrine, Oki), already in
        "mia-136803",  # actor print
        "mia-62744",  # same design as mia-22799 (copy of this Hokusai design), already in
        "mia-117541",  # progressive proof (printing stage), not a finished print
        "mia-22753",  # faint second bat and moon
        "mia-62172",  # four scenes on one sheet (harimaze-like)
        "mia-63199",  # same design as mia-124786 (Nihonbashi--Morning View), already in
        "mia-67486",  # Rain at Sanmai Bridge: Rijksmuseum copy already in
        "mia-97519",  # book volume cover
        "mia-136807",  # keyblock proof
        "mia-136762",  # photo of a framed print
        "rijks-RP-P-1965-339",  # figure print
        "rijks-RP-P-1995-305",  # figure print
        "rijks-RP-P-1958-510",  # figure print
        "rijks-RP-P-1989-81",  # figure print (Benkei)
        "rijks-RP-P-1958-469",  # figure print (samurai in rain)
        "mia-124855",  # same design as mia-63250 (Sakanoshita, Fudesute-mine), already in
    }
    picks = [r for r in picks if r["id"] not in review_drop]
    seen_ids.update(review_drop)  # and never pick them again in the top-up
    # top up with random landscapes to make up for the drops
    got = take_from(pools["land"], 12, "random", "random landscape (top-up)")
    picks += got
    print("top-up:", len(got))
    OUT.write_text(json.dumps(picks, ensure_ascii=False, indent=1))
    print("total", len(picks), dict(Counter(r["group"] for r in picks)), "->", OUT)


if __name__ == "__main__":
    main()
