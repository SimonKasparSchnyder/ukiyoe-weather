# Tagging Pilot — Findings

*2026-11-15. 100 prints, tagged in this Claude Code session against TAXONOMY.md draft 1.*

## What ran

| Step | Result |
|---|---|
| Sample | 45 Minneapolis Institute of Art, 30 Rijksmuseum, 25 Art Institute of Chicago. 30 from famous series, 55 "random" landscapes, 15 bird-and-flower. |
| Images | 100 × ~800 px, 17 MB, all downloaded without errors (`pilot/images/`). |
| Tagging | 5 parallel agents × 20 prints, each looking at every image plus its metadata. Output validated (category names, 0.1 steps, vectors sum to 1). |
| Review | `pilot/contact_sheet.html` — every print with its tags, crop box, evidence and friction notes, plus a "Disagree" box per print. |
| Spot-check | I checked several tags against the images myself (e.g. Hodogaya snow scene, Hamamatsu with geese, both Kanagawa impressions): tags were sound. |

To open the contact sheet: start the local server (`python3 -m http.server 8765 --directory pilot` in the project folder, or the "pilot-contact-sheet" launch configuration) and open `http://localhost:8765/contact_sheet.html`.

## Headline results

### 1. Source quality differs a lot

| Source | Included | Excluded | Why excluded |
|---|---|---|---|
| Minneapolis | 45 / 45 | 0 | Its genre field (`object_name`) is reliable. |
| Art Institute of Chicago | 17 / 25 | 8 | Keyword search pulled in actor, beauty and figure prints. |
| Rijksmuseum | 13 / 30 | 17 | Searching by artist pulls in book covers, sketchbooks, surimono, warrior and poetry prints. |

- **4 of the Rijksmuseum "Hiroshige" prints are 20th-century postcard reproductions** (English captions printed on them). Nothing in the schema could mark them.
- **Minneapolis labels 20th-century shin-hanga as "Public Domain"**, including Yoshida Hiroshi (1926–41), Ohara Shōson (c. 1930) and even Yoshida Tōshi (1954). 7 of the 25 non-famous Minneapolis picks were shin-hanga. That label reflects US law; in Japan, Yoshida Tōshi's work is still in copyright. → decision needed (see below).
- **Metadata errors** exist: a wrong location in a Rijksmuseum note (Kōnodai, not Suruga Bay), a misspelt title (Namazu → Numazu), book covers catalogued as "Hokusai manga" that are really *One Hundred Views of Fuji*.

### 2. Crops: the vision estimate works

The estimated sheet-edge crop correctly excluded a colour checker, a window mount and museum borders. But **crop must run before the format filter**: an envelope-strip print passed the shape filter only because its scan included a large colour-checker backdrop.

### 3. The pool is dominated by clear daytime scenes

Of the 75 included prints (dominant category):

| Dimension | Distribution | No tag |
|---|---|---|
| Weather | clear 51 · rain/storm 6 · snow 5 · mist 3 · cloudy 2 | 8 |
| Time of day | day 48 · night 10 · dusk 7 · dawn 2 | 8 |
| Season | summer 16 · autumn 16 · spring 11 · winter 8 | **24** |

This sample was already weighted towards weather (AIC keyword search for snow, rain, moon …). At full scale (a few thousand designs) that still means a few hundred rain, snow and night prints each, but **dawn and mist pools will be small** — repeats on misty mornings are likely.

Average tagger confidence: environment 0.76 · weather 0.69 · time of day 0.59 · season 0.52.

### 4. Time of day is the noisiest signal

- **Impressions of the same design disagreed on time of day.** Two impressions of Hiroshige's Kanagawa: one `day 0.8`, the other `day 0.5 / dusk 0.5`. The difference is just a deeper orange horizon in one impression. Three impressions of Totsuka varied similarly.
- The cause is **red/pink/orange horizon bands**, which Hiroshige uses in plain daytime scenes. The tagging notes only warned about the dark blue band at the top.
- Good news: where the title or scene gives a cue (Shinagawa *Sunrise*, *Departure of a Daimyō*, *Night View of Saruwaka-machi*, *Evening Snow*), the tags were confident and right.

### 5. Season is often genuinely unknown

A third of the included landscapes have no seasonal cue at all. The taggers couldn't express "unknown" — they used `null` (meant for "not applicable") or an even spread (which would wrongly score well all year).

## Proposed changes for TAXONOMY.md (draft 2)

**Missing values**
1. `null` means "no answer" and scores neutral, with a `null_reason`: `not_applicable` (no sky, no setting) or `no_cue` (has a season, but nothing shows it). Never use an even spread for "unknown". Allow `null` for wind and confidence too.

**Weather**
2. Move lying snow out of the weather vector into a **snow-on-ground modifier** (0–1, like wind), so "snow falling on snow-covered ground" is expressible. Only snow at the scene's own level counts; a snow-capped Fuji or summer snowfields on distant peaks don't.
3. `storm` also covers **wind-only gales** without rain. Wind measures air movement only; waves and surf alone don't raise it.

**Seasonal markers**
4. A fixed list of **marker IDs** (snake_case), so taggers don't invent their own spellings.
5. New markers the pilot needed: `peach_blossom` (early April), `azalea` (May), `hazakura` (cherry in fresh leaf, late April–May), `lotus` (late July), `rice_harvest` (early October), `rapeseed` (March–April), `willow_green` (spring–summer), `lingering_snow` (summer snowfields; summer, not winter).
6. Fix `wild_geese`: flying geese = autumn to early spring; descending geese = autumn. Widen `new_year` (Edo prints show the lunar New Year, late January–February).

**Conventions (tagging notes)**
7. Add: **red/pink/orange horizon bands** are a convention by default — read them as dawn/dusk only with a title or scene cue, or when the glow dominates the sky. Also add: solid black skies in rain scenes (gloom, not night); flat coloured backgrounds and decorative gradients in bird-and-flower prints (no time of day); pale unprinted sky = clear by default; place names containing "sunset" (e.g. Yūhi-no-oka, "Sunset Hill") are not time cues; a moon reflection counts as moon; a fan print's handle notch is not a moon. Faded blues and reds (age, light damage) are not dusk — tag what the printer intended where the fading is evident, and note it.

**Environment and place**
8. Flags: add `castle`; `temple_shrine` covers any religious site (the pilot hit a Confucian temple). Water: add `wetland` (flooded paddies, marsh).
9. **Terrain describes the scene in view; place is the viewpoint.** If there's no usable viewpoint, use the subject with coarse precision. Province-only places get no coordinates.

**Genre and new fields**
10. Exclude still lifes and indoor animal portraits (fish, pug), unless there's an outdoor setting; exclude prints where every scored dimension is `null`.
11. New fields: `edition` (original / later edition / reproduction), `fragment` (single sheet of a triptych, album page), `crop_shape` (rectangle / fan), `time_source` (title / image / both / guess).

## Pipeline changes

- **Rijksmuseum:** filter by object type (print) and technique (colour woodcut); exclude books, sketchbooks and surimono at harvest; detect reproductions.
- **AIC:** use the bulk dump and genre classification instead of keyword search.
- **Minneapolis:** keep relying on its genre field.
- **Order:** crop detection → format filter → tagging.
- **Date filter** for shin-hanga (pending your decision).

## Decisions for you

1. ~~Shin-hanga that museums label public domain~~ — **decided: include them**, with an `era` field so they can be filtered later (see PLAN.md).
2. **Taxonomy draft 2:** apply the changes above, then re-tag the same 100 prints to see whether consistency (especially time of day across impressions) improves?
3. **Your own review:** mark disagreements in the contact sheet and export them; that's the real test of accuracy, which the agents can't judge for themselves.

---

# Round 2 — Taxonomy draft 2

*Same 100 prints, re-tagged independently (the agents did not see round 1) against TAXONOMY.md draft 2. Review page: `contact_sheet_v2.html` (round 1 stays at `contact_sheet.html`). Comparison script: `scripts/compare_rounds.py`.*

## Results

| Check | Round 1 (draft 1) | Round 2 (draft 2) |
|---|---|---|
| Schema problems (invented categories, marker spellings) | many invented marker names | **none** |
| Included prints | 75 | **66** — exactly the 9 intended removals: 4 postcard reproductions, 3 fish still lifes, the indoor dog, an empty book page. No new false inclusions. |
| Time-of-day vectors split (top < 0.6) | 6 | **1** |
| Kanagawa impressions, time-of-day distance (0 = identical) | 0.40 | **0.20** |
| Totsuka impressions (3), time-of-day distance | 0.13 | 0.13 (both rounds now lean "day") |
| Season: even spreads used for "unknown" | 3 | **0** |
| Season: `null` | 24 (reason unknown) | 32 (all `no_cue`) |

**Agreement between the two independent rounds** (66 prints included in both; dominant category):
- weather 56 / 62 same — most changes are draft-2 rule changes working as intended (lying snow moved to `snow_ground`; Eisen's wind-only gale now `storm`);
- time of day 58 / 62 same — changes follow the new red-horizon rule (e.g. Hamamatsu and Totsuka from dusk to day);
- season 33 / 34 same.

So the tagging is **reproducible**: two independent runs agree on ~90–95% of dominant categories. That's consistency, not accuracy — your review remains the accuracy check.

**Impressions differ for real:** the Minneapolis impression of Hokusai's *Reflection in Lake Misaka* has no inverted Fuji in the lake — apparently an impression where the reflection wasn't printed. A good example of why every impression is tagged on its own.

## Still open → candidates for draft 3

Season `null` rose to 32 of 66 included prints (48%) — honest, but it means half the pool is neutral on season. Most draft-3 candidates aim at that:

1. **Series season sections count as a season cue** (e.g. the spring/summer/autumn/winter sections of *One Hundred Famous Views of Edo*); explicit image cues win if they conflict.
2. **Cultural conventions as weak season cues:** a moon alone → autumn (weak); New Year surimono → `new_year`; flooded paddies with young rice → new marker `rice_planting` (early June).
3. **Merge the two wild-geese markers** into one `wild_geese` (autumn–winter): taggers can't reliably tell flying from descending. Geese count as a season marker, not as a dusk cue.
4. **Lotus marker** covers leaves as well as blooms.
5. **Dark skies in snow scenes** mean gloom, not night (extend the rain rule).
6. **Implied snowfall** (title says snow, snow on umbrellas, no flakes drawn) may get a snowfall share.
7. **Split-level weather** (storm below, clear summit): tag the weather event that defines the scene.
8. **Outdoor scenes without visible sky:** tag the evident weather with low confidence instead of `null`.
9. **Fields:** `fragment` gains `book_cover`; `era` describes the object (reproductions are handled by `edition`); `shin_hanga` covers the movement incl. the post-war Yoshida school, `modern` means post-1960 creative prints; `time_source` is `null` when time is `null`; environment groups may be `null` individually.
10. **Genre boundary:** `figures_in_landscape` when the setting fills roughly half the picture or more.
