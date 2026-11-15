"""Compare pilot tagging round 1 (draft 1) with round 2 (draft 2).

Throwaway pilot tool. Run with:  python3 -I pilot/scripts/compare_rounds.py
"""
import collections
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
v1 = {x["meta"]["id"]: x for x in json.loads((ROOT / "data" / "tags.json").read_text())}
v2 = {x["meta"]["id"]: x for x in json.loads((ROOT / "data" / "tags_v2.json").read_text())}
ids = [i for i in v1 if i in v2]

DRAFT2 = {
    "genre": {"landscape", "figures_in_landscape", "flora_fauna", "still_life", "animal_portrait", "figure", "other"},
    "weather": {"clear", "cloudy", "mist", "drizzle", "rain", "storm", "snowfall"},
    "time_of_day": {"dawn", "day", "dusk", "night"},
    "season": {"spring", "summer", "autumn", "winter"},
    "markers": {"new_year", "plum_blossom", "rapeseed", "cherry_blossom", "peach_blossom", "hazakura", "azalea",
                "wisteria", "willow_green", "iris", "loquat", "fireflies", "lotus", "morning_glory",
                "summer_fireworks", "lingering_snow", "moon_viewing", "autumn_grasses", "rice_harvest",
                "wild_geese_descending", "wild_geese_flying", "chrysanthemum", "autumn_maples", "snow"},
    "flags": {"onsen", "temple_shrine", "castle", "garden_park", "forest", "waterfall", "bridge"},
}


def top(v):
    return max(v.items(), key=lambda kv: kv[1])[0] if v else None


def l1(a, b):
    if a is None or b is None:
        return None
    keys = set(a) | set(b)
    return sum(abs(a.get(k, 0) - b.get(k, 0)) for k in keys) / 2  # 0 = identical, 1 = disjoint


def section(title):
    print("\n## " + title)


# ---------------------------------------------------------------- validation
section("Draft-2 validation (round 2)")
problems = []
for i in ids:
    t = v2[i]["tags"]
    if t.get("genre") not in DRAFT2["genre"]:
        problems.append((i, "genre", t.get("genre")))
    for dim in ("weather", "time_of_day", "season"):
        v = t.get(dim)
        if v:
            bad = set(v) - DRAFT2[dim]
            if bad:
                problems.append((i, dim, bad))
            if abs(sum(v.values()) - 1) > 0.01:
                problems.append((i, dim, "sum", sum(v.values())))
    bad = set(t.get("seasonal_markers") or []) - DRAFT2["markers"]
    if bad:
        problems.append((i, "markers", bad))
    bad = set(((t.get("environment") or {}).get("flags")) or []) - DRAFT2["flags"]
    if bad:
        problems.append((i, "flags", bad))
print("problems:", problems or "none")

# ---------------------------------------------------------------- inclusion
section("Inclusion and genre")
inc1 = {i for i in ids if v1[i]["tags"]["include"]}
inc2 = {i for i in ids if v2[i]["tags"]["include"]}
print(f"included: round 1 {len(inc1)}, round 2 {len(inc2)}")
print("now excluded:", [(i, v2[i]["tags"].get("genre"), v2[i]["tags"].get("exclude_reason")) for i in sorted(inc1 - inc2)])
print("now included:", [(i, v2[i]["tags"].get("genre")) for i in sorted(inc2 - inc1)])
print("round 2 genres:", dict(collections.Counter(v2[i]["tags"].get("genre") for i in ids)))
print("round 2 editions:", dict(collections.Counter(v2[i]["tags"].get("edition") for i in ids)))
print("round 2 eras:", dict(collections.Counter(v2[i]["tags"].get("era") for i in ids)))

both = sorted(inc1 & inc2)

# ---------------------------------------------------------------- agreement
section(f"Round 1 vs round 2 agreement ({len(both)} prints included in both)")
for dim in ("weather", "time_of_day", "season"):
    same, diff, dists, nulls = 0, [], [], 0
    for i in both:
        a, b = v1[i]["tags"].get(dim), v2[i]["tags"].get(dim)
        if a is None or b is None:
            nulls += 1
            continue
        d = l1(a, b)
        dists.append(d)
        if top(a) == top(b):
            same += 1
        else:
            diff.append((i, top(a), top(b)))
    n = len(dists)
    print(f"{dim}: same dominant category {same}/{n}; mean distance {sum(dists)/max(n,1):.2f}; "
          f"null in one round {nulls}")
    for x in diff:
        print("   changed:", x)

# ---------------------------------------------------------------- distributions
section("Time-of-day dominant category (included)")
for name, src, inc in (("round 1", v1, inc1), ("round 2", v2, inc2)):
    c = collections.Counter(top(src[i]["tags"].get("time_of_day")) for i in inc)
    split = sum(1 for i in inc if src[i]["tags"].get("time_of_day")
                and max(src[i]["tags"]["time_of_day"].values()) < 0.6)
    print(f"{name}: {dict(c)}; split (top < 0.6): {split}")
print("round 2 time_source:", dict(collections.Counter(v2[i]["tags"].get("time_source") for i in inc2)))

section("Season (included)")
for name, src, inc in (("round 1", v1, inc1), ("round 2", v2, inc2)):
    nulls = sum(1 for i in inc if src[i]["tags"].get("season") is None)
    even = sum(1 for i in inc if src[i]["tags"].get("season") and len(src[i]["tags"]["season"]) >= 3
               and max(src[i]["tags"]["season"].values()) <= 0.4)
    print(f"{name}: null {nulls}, near-even spread {even}")
print("round 2 null reasons:", dict(collections.Counter(v2[i]["tags"].get("season_null_reason") for i in inc2
                                                       if v2[i]["tags"].get("season") is None)))

section("Snow (round 2)")
for i in ids:
    t = v2[i]["tags"]
    if (t.get("snow_ground") or 0) > 0 or (t.get("weather") or {}).get("snowfall"):
        print(f"  {i}: weather {t.get('weather')}, snow_ground {t.get('snow_ground')}, "
              f"markers {t.get('seasonal_markers')}")

# ---------------------------------------------------------------- impressions
section("Consistency across impressions of the same design")
groups = collections.defaultdict(list)
for i in ids:
    groups[v1[i]["meta"]["title"]].append(i)
for title, members in groups.items():
    if len(members) < 2 or not all(i in inc1 for i in members):
        continue
    print(f"\n{title}")
    for name, src in (("round 1", v1), ("round 2", v2)):
        vecs = [src[i]["tags"].get("time_of_day") for i in members]
        pair = [l1(vecs[a], vecs[b]) for a in range(len(vecs)) for b in range(a + 1, len(vecs))]
        pair = [p for p in pair if p is not None]
        print(f"  {name}: time vectors {vecs}; mean pairwise distance {sum(pair)/max(len(pair),1):.2f}")

section("Remaining friction (round 2)")
for i in ids:
    f = v2[i]["tags"].get("taxonomy_friction")
    if f and f.strip().lower().rstrip(".") not in ("none", "nothing"):
        print(f"- {i}: {f}")
