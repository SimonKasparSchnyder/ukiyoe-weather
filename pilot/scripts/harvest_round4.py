"""Round 4: pick ~110 more prints (to land near 100 included), write pilot/data/sample_r4.json.

Three groups:
  famous  well-known, well-liked designs, looked up by title (Hokusai, Hiroshige, Hasui, Yoshida, ...)
  edge    title-keyword pools for categories the collection is still thin on: wind and storm, light rain,
          rain in spring and autumn, night rain and snow, waterfalls, hot springs, castles, autumn maples,
          birds and flowers in weather (Ohara Shōson), Meiji-era views (Kiyochika)
  random  random landscapes from Minneapolis and the Rijksmuseum, to keep the collection representative

Only public-domain records with an image. Skips designs already harvested in rounds 1-3.
Throwaway pilot tool:  python3 -I pilot/scripts/harvest_round4.py
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
OUT = ROOT / "data" / "sample_r4.json"
RNG = random.Random(2027)
BASE = 'rights_type:"Public Domain" AND image:valid AND '

# (title words, artist) - looked up one by one; the best-matching Japanese print wins
FAMOUS = [
    # Hokusai: Thirty-six Views of Mount Fuji
    ("Under the Wave off Kanagawa", "Hokusai"),
    ("Thunderstorm Beneath the Summit", "Hokusai"),
    ("Rainstorm Beneath the Summit", "Hokusai"),
    ("Kajikazawa in Kai Province", "Hokusai"),
    ("Ejiri in Suruga Province", "Hokusai"),
    ("Fuji View Plain in Owari Province", "Hokusai"),
    ("Hodogaya on the Tōkaidō", "Hokusai"),
    ("Lake Suwa in Shinano Province", "Hokusai"),
    ("Mishima Pass in Kai Province", "Hokusai"),
    ("Shichiri Beach in Sagami Province", "Hokusai"),
    ("Umezawa in Sagami Province", "Hokusai"),
    ("Inume Pass in Kai Province", "Hokusai"),
    ("Tama River in Musashi Province", "Hokusai"),
    ("Kanaya on the Tōkaidō", "Hokusai"),
    ("Seven-Mile Beach in Sagami Province", "Hokusai"),
    ("Tago Bay near Ejiri on the Tōkaidō", "Hokusai"),
    # Hokusai: waterfalls and bridges
    ("Kirifuri Waterfall Kurokami", "Hokusai"),
    ("Waterfall at Ono Kisokaidō", "Hokusai"),
    ("Amida Falls", "Hokusai"),
    ("Horse-washing Falls Yoshino", "Hokusai"),
    ("Kiyotaki Kannon Waterfall", "Hokusai"),
    ("Drum Bridge Kameido Tenjin", "Hokusai"),
    ("Suspension Bridge Hida Etchū", "Hokusai"),
    ("Yatsuhashi Mikawa", "Hokusai"),
    # Hiroshige: One Hundred Famous Views of Edo
    ("Evening Shower over Ōhashi Bridge and Atake", "Hiroshige"),
    ("Tekona Shrine and Tsugihashi Bridge through the Maples at Mount Mama", "Hiroshige"),
    ("View of the Plum Garden at Kameido", "Hiroshige"),
    ("Snow in the Precincts of the Tenman Shrine at Kameido", "Hiroshige"),
    ("Sunrise on New Year's Day at Susaki", "Hiroshige"),
    ("View of the Whirlpool at Awa", "Hiroshige"),
    ("Plum Park in Kameido", "Hiroshige"),
    ("Fukagawa Susaki and Jūmantsubo", "Hiroshige"),
    ("Kinryūzan Temple in Asakusa", "Hiroshige"),
    ("Maple Trees at Mama", "Hiroshige"),
    ("Moon Pine Ueno", "Hiroshige"),
    ("Night View of Saruwaka-machi", "Hiroshige"),
    ("Fireworks at Ryōgoku", "Hiroshige"),
    ("Inside Kameido Tenjin Shrine", "Hiroshige"),
    ("Irises at Horikiri", "Hiroshige"),
    ("Suidō Bridge and Surugadai", "Hiroshige"),
    ("Fudō Falls Ōji", "Hiroshige"),
    ("Benten Shrine Inokashira Pond Snow", "Hiroshige"),
    ("Bamboo Yards Kyōbashi Bridge", "Hiroshige"),
    ("Haneda Ferry Benten Shrine", "Hiroshige"),
    ("Asakusa Ricefields Torinomachi Festival", "Hiroshige"),
    ("Atagoshita Yabu Lane", "Hiroshige"),
    ("Matsuchi Hill Sanya Canal Night", "Hiroshige"),
    # Hiroshige: Tōkaidō (Hōeidō) and Eight Views of Ōmi
    ("Kanbara Night Snow", "Hiroshige"),
    ("Mishima Morning Mist", "Hiroshige"),
    ("Hara Mount Fuji Morning", "Hiroshige"),
    ("Kameyama Clear Weather after Snow", "Hiroshige"),
    ("Hakone Lake", "Hiroshige"),
    ("Ōiso Tora's Rain", "Hiroshige"),
    ("Yokkaichi Mie River", "Hiroshige"),
    ("Tsuchiyama Spring Rain", "Hiroshige"),
    ("Hamamatsu Winter Scene", "Hiroshige"),
    ("Nihonbashi Morning View", "Hiroshige"),
    ("Night Rain at Karasaki", "Hiroshige"),
    ("Evening Snow on Mount Hira", "Hiroshige"),
    ("Autumn Moon at Ishiyama", "Hiroshige"),
    ("Evening Glow at Seta", "Hiroshige"),
    ("Clearing Weather at Awazu", "Hiroshige"),
    ("Evening Bell at Mii Temple", "Hiroshige"),
    # Hiroshige: Kisokaidō, other series
    ("Seba Kisokaidō", "Hiroshige"),
    ("Nojiri Kisokaidō", "Hiroshige"),
    ("Miyanokoshi Kisokaidō", "Hiroshige"),
    ("Monkey Bridge Kai Province", "Hiroshige"),
    ("Naruto Whirlpools Awa", "Hiroshige"),
    # Shin-hanga and Meiji
    ("Zōjō Temple Shiba Snow", "Hasui"),
    ("Evening Snow at Terajima", "Hasui"),
    ("Kiba Snow", "Hasui"),
    ("Shin-Ōhashi Rain", "Hasui"),
    ("Arayu Hot Spring Shiobara", "Hasui"),
    ("Kintai Bridge", "Hasui"),
    ("Snow at Zōjōji Temple", "Hasui"),
    ("Snow at Miyajima Shrine", "Hasui"),
    ("Snow at the Sacred Bridge in Nikkō", "Hasui"),
    ("Spring Snow, Kiyomizudera Temple in Kyoto", "Hasui"),
    ("Kumoi Cherry Trees", "Yoshida"),
    ("Sailing Boats: Night", "Yoshida"),
    ("Sailing Boats: Evening", "Yoshida"),
    ("Kagurazaka Street After a Night Rain", "Yoshida"),
    ("Sailing Boats Morning", "Yoshida"),
    ("Sailing Boats Mist", "Yoshida"),
    ("Fuji from Kawaguchi Lake", "Yoshida"),
    ("Rain at Sanmai Bridge in Hakone", "Kiyochika"),
    ("Ryōgoku in Snow", "Kiyochika"),
]

EDGE = [  # (title regex, pool, how many)
    (r"\b(wind|windy|gale|storm|squall|typhoon|whirlwind|blustery)\b", "land", 6),
    (r"\b(drizzle|spring rain|misty rain|light rain|shower|showers|evening rain|autumn rain)\b", "land", 6),
    (r"\b(night rain|rainy night|night snow|snowy night|rain at night|snow at night)\b", "land", 4),
    (r"\b(waterfall|falls|cascade)\b", "land", 4),
    (r"\b(hot spring|hot springs|onsen|spa|yumoto)\b", "land", 4),
    (r"\b(castle)\b", "land", 3),
    (r"\b(maple|maples|momiji|autumn leaves|red leaves)\b", "land", 3),
    (r"\b(snow|rain|moon|night|mist|wind)\b", "shoson", 6),
    (r"\b(snow|rain|night|moon|evening|morning|mist|fog|lantern)\b", "kiyochika", 4),
]

# found on review: designs already in the collection under another title or state, and non-views
SKIP = {
    "mia-20061",              # Kanbara: Night Snow, second state (first state already in)
    "mia-67486",              # Kiyochika, Rain at Sanmai Bridge (Rijksmuseum copy already in)
    "mia-61176",              # Fireworks at Ryōgoku Bridge (Rijksmuseum copy already in)
    "mia-62036",              # Evening Snow on Mount Hira (already in)
    "rijks-RP-P-1956-728",    # Red Fuji: same design as mia-7505
    "rijks-RP-P-1956-734",    # Mishima Pass: same design as mia-9152
    "rijks-RP-P-1958-394",    # surimono of two figures
    "rijks-RP-P-1990-154",    # figure print
}
seen_ids, seen_designs = set(SKIP), set()
for name in ("sample.json", "sample_r3.json", "sample_v3.json"):
    for r in json.loads((ROOT / "data" / name).read_text()):
        seen_ids.add(r["id"])


def norm(s):
    s = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", " ", s.lower()).strip()


def design_key(rec):
    artist = norm((rec.get("artist") or "").split(";")[0]).split(" ")
    artist = " ".join(a for a in artist if a not in ("utagawa", "katsushika", "kawase", "yoshida", "kobayashi"))[:12]
    return artist, norm(rec.get("title"))


for name in ("sample.json", "sample_r3.json", "sample_v3.json"):
    for r in json.loads((ROOT / "data" / name).read_text()):
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


def lookup_famous(title, artist):
    words = [w for w in norm(title).split() if len(w) > 2]
    raw = [w for w in re.split(r"[^\w']+", title) if len(w) > 2]   # keep macrons: Mia's index doesn't fold them
    q = BASE + f"artist:{artist} AND title:(" + " ".join(raw) + ")"
    try:
        hits = h.mia_search(q, 40)
    except Exception as e:  # noqa: BLE001 - pilot tool
        print("  search failed", title, e)
        return None
    best, best_score = None, 0.0
    for x in hits:
        if not usable(x):
            continue
        t = set(norm(x.get("title")).split()) | set(norm(x.get("portfolio")).split())
        score = sum(w in t for w in words) / len(words)
        size = (x.get("image_width") or 0) * (x.get("image_height") or 0)
        if score > best_score or (score == best_score and best and size > best[1]):
            best, best_score = (x, size), score
    if not best or best_score < 0.6:
        return None
    return best[0]


def main():
    picks = []

    # --- famous designs
    missing = []
    for title, artist in FAMOUS:
        x = lookup_famous(title, artist)
        if not x:
            missing.append(title)
            continue
        rec = h.mia_record(x, "famous")
        rec["lookup"] = title
        if take(rec):
            picks.append(rec)
        time.sleep(0.2)
    print(f"famous: {len(picks)} new of {len(FAMOUS)} looked up; not found: {missing}")

    # --- edge cases from keyword pools
    pools = {
        "land": [x for x in h.mia_search(BASE + 'object_name:"fūkei-ga"', 2000) if usable(x)],
        "shoson": [x for x in h.mia_search(BASE + '("Ohara Shōson" OR "Ohara Koson")', 400) if usable(x)],
        "kiyochika": [x for x in h.mia_search(BASE + 'artist:Kiyochika AND object_name:"fūkei-ga"', 400) if usable(x)],
    }
    print("pools:", {k: len(v) for k, v in pools.items()})
    for rx, pool, n in EDGE:
        cands = [x for x in pools[pool] if re.search(rx, x.get("title") or "", re.I)]
        RNG.shuffle(cands)
        got = 0
        for x in cands:
            if got >= n:
                break
            rec = h.mia_record(x, "edge")
            rec["lookup"] = rx
            if take(rec):
                picks.append(rec)
                got += 1
        print(f"edge {rx[:40]:40} {pool:9} pool {len(cands):3} took {got}")

    # --- random landscapes, Minneapolis
    land = pools["land"][:]
    RNG.shuffle(land)
    got = 0
    for x in land:
        if len(picks) >= 102:  # Rijksmuseum adds 8 more: ~110 in all
            break
        rec = h.mia_record(x, "random")
        if take(rec):
            picks.append(rec)
            got += 1
    print("mia random:", got)

    # --- random landscapes, Rijksmuseum (Japan collection, prints, colour woodcut); titles must hint at a view
    view = r"\b(gezicht|landschap|view|rivier|brug|berg|fuji|meer|zee|baai|tempel|weg|station|sneeuw|regen|maan|avond|nacht)"
    ids = rijks_ids_multi([("memberOfSetId", "26134"), ("memberOfSetId", "26151"),
                           ("technique", "kleurenhoutsnede"), ("imageAvailable", "true")], limit=1500)
    RNG.shuffle(ids)
    got, tried = 0, 0
    for oid in ids:
        if got >= 8 or tried > 250:
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
        text = f"{rec.get('title') or ''} {rec.get('title_alt') or ''}"
        if not re.search(view, text, re.I):
            continue
        if take(rec):
            picks.append(rec)
            got += 1
    print("rijks random:", got, "tried", tried)

    # dropped after looking at the scans (applied last, so the rest of the selection stays the same)
    review_drop = {
        "mia-62172",            # four scenes on one sheet (harimaze-like)
        "mia-63405",            # tiny print on a large mount; repeats Yoshida's sailing boats
        "rijks-AK-MAK-943",     # still life
        "rijks-RP-P-1958-284",  # figure print
        "rijks-RP-P-1964-802",  # figure print
    }
    picks = [r for r in picks if r["id"] not in review_drop]
    OUT.write_text(json.dumps(picks, ensure_ascii=False, indent=1))
    print("total", len(picks), dict(Counter(r["group"] for r in picks)), "->", OUT)


if __name__ == "__main__":
    main()
