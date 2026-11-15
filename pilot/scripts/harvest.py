"""Pilot harvest: pick ~100 prints from Mia, Rijksmuseum and AIC, write pilot/data/sample.json.

Throwaway pilot tool. Run with:  python3 -I pilot/scripts/harvest.py
"""
import json
import random
import time
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "sample.json"
UA = "ukiyoe-weather-pilot/0.1 (personal non-commercial project)"
RNG = random.Random(42)
ASPECT_MIN, ASPECT_MAX = 0.55, 1.8


def get_json(url, headers=None, data=None):
    h = {"User-Agent": UA, "Accept": "application/json"}
    h.update(headers or {})
    body = json.dumps(data).encode() if data is not None else None
    if body is not None:
        h["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=body, headers=h)
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def aspect_ok(w, h):
    return bool(w and h) and ASPECT_MIN <= w / h <= ASPECT_MAX


# ---------------------------------------------------------------- Mia
def mia_search(q, size=1000):
    url = "https://search.artsmia.org/" + urllib.parse.quote(q) + f"?size={size}"
    return [h["_source"] for h in get_json(url)["hits"]["hits"]]


def mia_record(s, group):
    loc = s["Cache_Location"].replace("\\", "/")
    rend = s["Primary_RenditionNumber"].rsplit(".", 1)[0]
    return {
        "id": f"mia-{s['id']}",
        "source": "Minneapolis Institute of Art",
        "group": group,
        "title": s.get("title"),
        "title_alt": s.get("TitleAlt"),
        "artist": s.get("artist"),
        "date": s.get("dated"),
        "series": s.get("portfolio"),
        "genre_hint": s.get("object_name"),
        "dimensions": s.get("dimension"),
        "rights": s.get("rights_type"),
        "image_url": f"https://img.artsmia.org/web_objects_cache/{loc}/{rend}_800.jpg",
        "object_url": f"https://collections.artsmia.org/art/{s['id']}",
        "pixel_size": [s.get("image_width"), s.get("image_height")],
    }


def harvest_mia():
    base = 'rights_type:"Public Domain" AND image:valid AND '
    picks = []
    seen = set()

    def take(hits, n, group):
        hits = [h for h in hits if h["id"] not in seen
                and aspect_ok(h.get("image_width"), h.get("image_height"))]
        for h in RNG.sample(hits, min(n, len(hits))):
            seen.add(h["id"])
            picks.append(mia_record(h, group))

    take(mia_search(base + 'portfolio:"Fifty-three Stations" AND Hiroshige AND Hōeidō'), 8, "famous")
    take(mia_search(base + 'portfolio:"One Hundred Famous Views"'), 7, "famous")
    take(mia_search(base + 'portfolio:"Thirty-six Views" AND Hokusai'), 5, "famous")
    famous_portfolios = ("Fifty-three Stations", "Hundred Famous Views", "Thirty-six Views")
    rand = [h for h in mia_search(base + 'object_name:"fūkei-ga"')
            if not any(p in (h.get("portfolio") or "") for p in famous_portfolios)]
    take(rand, 18, "random_landscape")
    take(mia_search(base + 'object_name:"kachō-e"'), 7, "kacho_e")
    return picks


# ---------------------------------------------------------------- Rijksmuseum
EN = "http://vocab.getty.edu/aat/300388277"
NL = "http://vocab.getty.edu/aat/300388256"


def rijks_ids(params, limit=400):
    url = "https://data.rijksmuseum.nl/search/collection?" + urllib.parse.urlencode(params)
    ids = []
    while url and len(ids) < limit:
        page = get_json(url)
        ids += [i["id"] for i in page.get("orderedItems", [])]
        url = (page.get("next") or {}).get("id")
        time.sleep(0.3)
    return ids


def rijks_record(obj_id, group):
    rec = get_json(obj_id.replace("id.rijksmuseum.nl", "data.rijksmuseum.nl") + "?_profile=la-framed",
                   headers={"Accept": "application/ld+json"})
    names = {"en": None, "nl": None}
    number = None
    for i in rec.get("identified_by", []):
        if i.get("type") == "Identifier" and number is None:
            number = i.get("content")
        if i.get("type") == "Name":
            langs = [l.get("id") for l in i.get("language", [])]
            if EN in langs and not names["en"]:
                names["en"] = i.get("content")
            elif NL in langs and not names["nl"]:
                names["nl"] = i.get("content")
    texts = []
    for r in rec.get("referred_to_by", []):
        c = r.get("content")
        if isinstance(c, str):
            texts.append(c)
    prod_texts = []
    for r in (rec.get("produced_by") or {}).get("referred_to_by", []):
        if isinstance(r.get("content"), str):
            prod_texts.append(r["content"])
    image = None
    for s in rec.get("subject_of", []):
        for d in s.get("digitally_carried_by", []):
            for ap in d.get("access_point", []):
                if "iiif.micr.io" in ap.get("id", ""):
                    image = ap["id"].split("/full/")[0]
    if not image:
        return None
    info = get_json(image + "/info.json")
    w, h = info.get("width"), info.get("height")
    return {
        "id": f"rijks-{number}",
        "source": "Rijksmuseum",
        "group": group,
        "title": names["en"] or names["nl"],
        "title_alt": names["nl"] if names["en"] else None,
        "artist": "; ".join(prod_texts)[:300] or None,
        "date": None,
        "series": None,
        "genre_hint": None,
        "dimensions": None,
        "notes": " | ".join(texts)[:600] or None,
        "rights": "Public Domain Mark 1.0",
        "image_url": image + "/full/800,/0/default.jpg",
        "object_url": f"https://www.rijksmuseum.nl/en/collection/{number}",
        "pixel_size": [w, h],
    }


def harvest_rijks():
    picks = []
    for creator, n in (("Utagawa Hiroshige (I)", 20), ("Katsushika Hokusai", 10)):
        ids = rijks_ids({"creator": creator, "imageAvailable": "true"})
        RNG.shuffle(ids)
        got = 0
        for oid in ids:
            if got >= n:
                break
            try:
                r = rijks_record(oid, "random_landscape")
            except Exception as e:  # noqa: BLE001 - pilot tool, skip bad records
                print("rijks skip", oid, e)
                continue
            time.sleep(0.3)
            if r and aspect_ok(*r["pixel_size"]):
                picks.append(r)
                got += 1
    return picks


# ---------------------------------------------------------------- AIC
AIC_FIELDS = ("id,title,artist_display,date_display,medium_display,dimensions,image_id,"
              "thumbnail,place_of_origin,classification_titles,subject_titles,term_titles,"
              "is_public_domain,inscriptions")


def aic_search(q, size=100):
    body = {
        "q": q,
        "query": {"bool": {"must": [
            {"term": {"place_of_origin.keyword": "Japan"}},
            {"term": {"is_public_domain": True}},
            {"term": {"classification_titles.keyword": "woodblock print"}},
            {"exists": {"field": "image_id"}},
        ]}},
        "fields": AIC_FIELDS,
        "limit": size,
    }
    res = get_json("https://api.artic.edu/api/v1/artworks/search", data=body,
                   headers={"AIC-User-Agent": UA})
    time.sleep(1.1)
    return res["data"]


def aic_record(a, group):
    th = a.get("thumbnail") or {}
    return {
        "id": f"aic-{a['id']}",
        "source": "Art Institute of Chicago",
        "group": group,
        "title": a.get("title"),
        "title_alt": None,
        "artist": a.get("artist_display"),
        "date": a.get("date_display"),
        "series": None,
        "genre_hint": a.get("medium_display"),
        "dimensions": a.get("dimensions"),
        "subjects": (a.get("subject_titles") or []) + (a.get("term_titles") or [])[:10],
        "rights": "CC0",
        "image_url": f"https://www.artic.edu/iiif/2/{a['image_id']}/full/843,/0/default.jpg",
        "object_url": f"https://www.artic.edu/artworks/{a['id']}",
        "pixel_size": [th.get("width"), th.get("height")],
    }


def harvest_aic():
    picks, seen = [], set()

    def take(hits, n, group):
        hits = [h for h in hits if h["id"] not in seen
                and aspect_ok((h.get("thumbnail") or {}).get("width"), (h.get("thumbnail") or {}).get("height"))]
        for h in RNG.sample(hits, min(n, len(hits))):
            seen.add(h["id"])
            picks.append(aic_record(h, group))

    take(aic_search("Hiroshige Tokaido"), 4, "famous")
    take(aic_search("Hokusai Thirty-six Views of Mount Fuji"), 3, "famous")
    take(aic_search("Hiroshige One Hundred Famous Views of Edo"), 3, "famous")
    pool = []
    for q in ("snow", "rain", "moon", "evening", "night", "mist", "bridge", "river", "mountain", "bay"):
        pool += aic_search(q, 50)
    uniq = {h["id"]: h for h in pool}
    take(list(uniq.values()), 15, "random_landscape")
    return picks


def main():
    sample = []
    for name, fn in (("mia", harvest_mia), ("rijks", harvest_rijks), ("aic", harvest_aic)):
        recs = fn()
        print(f"{name}: {len(recs)}")
        sample += recs
    OUT.write_text(json.dumps(sample, ensure_ascii=False, indent=1))
    print("total", len(sample), "->", OUT)


if __name__ == "__main__":
    main()
