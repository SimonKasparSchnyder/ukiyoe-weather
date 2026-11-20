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

---

# Round 3 — 100 new prints, all 166 tagged with taxonomy draft 3

*Sample: 40 gap-fillers (titles hinting at mist, dawn, night, moon, rain, snow, evening, wind), 30 shin-hanga (Kawase Hasui, Yoshida Hiroshi), 30 random landscapes; 90 from Minneapolis, 10 from the Rijksmuseum (the Art Institute refused scripted requests during this round). The 66 prints already in the app were re-tagged independently. Review page: `contact_sheet_v3.html`.*

## Results

- **Included: 156** (all 66 earlier prints + 90 of the 100 new). Excluded: a harimaze sheet, a reproduction, a drypoint etching, two book plates from Yoshida's printing manual, a preparatory study, a zoo cockatoo, two actor/figure prints, a crowd scene.
- **Season "no cue" for the 66: down from 32 to 20** (draft 3's series sections and weak conventions). New prints: 30 of 90. Overall 50 of 156 (32 %).
- **Consistency with round 2** (dominant category, the 66): weather 57/62, time 58/62, season 33/34.
- **The thin categories filled up** (dominant category, 156 prints vs. the 66 before): rain 11 (was ~5), snowfall 9 plus 17 prints with snow on the ground, mist 6 (3), dawn 11 (3), dusk 22 (5), night 23 (8), moon shown 15.
- **Eras:** Edo 105, shin-hanga 45, Meiji 5, modern 1. **Places outside Japan:** Agra, Giza, Jaipur, Guangzhou, Granada (Yoshida's travel prints) — useful when the location is abroad.
- **Data problems found:** one Rijksmuseum scan is upside down (now turned via the index's `rotation` field); several metadata errors (Izumi → Izumo, Iwado → Imado, a missing series, a lake that is Naha harbour).

## Scoring fix found while testing

A print tagged only broadly ("spring") scored the full season match in cherry-blossom week — as much as a print whose cherry blossoms pin it to that week. Broad seasons are now capped at 80 % (`broad_season_peak` in `web/config/season.json`), so specific markers win: Gotenyama's cherry blossoms now beat Yoshida's peony garden on 1 April, and New Year's Eve Foxfires leads on 31 December.

## Candidates for draft 4

1. `season_source` gains **`title`** (nearly every batch asked for it).
2. **Moon convention:** say where the remaining share goes (e.g. to the neighbouring seasons) and that a thin crescent counts less.
3. **New markers:** `late_snow` (spring snow, ~March), `peony`, `paulownia`, `tea_picking`, `cranes` (winter / New Year), `bare_trees` (late autumn–winter, weak).
4. **Implied snowfall** also from a heavy snow sky with straw rain-capes, not only from the title.
5. **Harimaze** (several unrelated vignettes on one sheet): exclude, genre `other`.
6. **Rain gloom vs. lit windows:** lit windows decide dusk/night; the dark sky alone doesn't.
7. Fields: `edition` gains `derivative` (contemporary copies), `place_null_reason`; a `rotation` note when a scan is turned.

# Round 4 — 105 new prints (famous designs and edge cases), tagged with taxonomy draft 3

*Sample (`scripts/harvest_round4.py`): 41 famous designs looked up by title (Hokusai's Fuji views, waterfalls and bridges; Hiroshige's Edo, Tōkaidō, Ōmi and Kisokaidō views; Hasui; Yoshida), 26 edge cases from title keywords (wind and storm, showers and light rain, night rain and snow, waterfalls, hot springs, castles, maples, Ohara Shōson's birds in rain, snow and moonlight, Kiyochika's Meiji night views), 38 random landscapes; 100 from Minneapolis, 5 from the Rijksmuseum. Designs already in the collection were skipped, also under other titles or states. Only the new prints were tagged (brief: `TAGGING_BRIEF_r4.md`, same rules as round 3), so the 166 earlier tags are unchanged; merged into `data/tags_v4.json`.*

## Results

- **Included: 103 of 105** → **259 prints** in the app. Excluded: Kiyochika's *Moon Seen Beyond Shinagawa* (the museum image is a skewed phone photo of a framed print) and the second state of *Kanbara: Night Snow* (the first state is already in).
- **Thin categories** (share ≥ 0.3, 259 prints vs. 156 before): rain 24 (13), snowfall 24 (10), mist 28 (16), storm 13 (8), drizzle 4 (1), night 49 (32), moon shown 22 (15), night with rain or snow 9 (3), spring rain 6 (2); flags waterfall 12 (1), onsen 6 (1), castle 15 (9); flora_fauna 11 (5); Meiji 15 (5).
- **Season "no cue":** 88 of 259 (34 %) — Hokusai's Fuji, waterfall and bridge views mostly have no seasonal cue.
- **Spot checks with the scoring:** a summer day by a mountain waterfall now picks Hiroshige's *Fudō Falls in Ōji*; an autumn day in an onsen town picks Hasui's *Arayu Hot Spring*; spring rain picks Hasui's *Spring Rain at Benkei Bridge*.

## More candidates for draft 4

8. **Markers:** cormorant fishing (`ukai`, summer), Boys' Festival carp streamers (May), burnet and other autumn plants beyond `autumn_grasses`, non-maple autumn foliage, egrets.
9. **Weather:** a state or modifier for "just after rain" (wet streets, rain stopped); the Great Wave shows a storm only in the sea under a calm sky.
10. **Era:** `sosaku_hanga` (creative prints, same years as shin-hanga); prints from 1912–c. 1915 fall between `meiji` and `shin_hanga`.
11. **Crop:** a `round` crop shape for pictures set in a circle (surimono).
12. **Moon matching:** "rain and moonlight" prints rarely match, because the current-side moon needs a mostly clear sky.

# Round 5 — 104 new prints (famous series, regions, flowers), tagged with taxonomy draft 3

*Sample (`scripts/harvest_round5.py`): 41 random picks from famous series and artists (Hiroshige's Kisokaidō, Famous Places in the Sixty-odd Provinces, One Hundred Famous Views of Edo; Hokusai's Fuji views; Hasui; Yoshida incl. the Alps and China), 27 edge cases (places outside Kantō and the Tōkaidō, wisteria, plum, iris, peony, kachō-e in snow and moonlight, dawn), 36 random landscapes; 103 from Minneapolis, 1 from the Rijksmuseum. Mia returns search hits in varying order, so pools are now sorted before the seeded draw — the selection repeats exactly. 19 candidates dropped after looking (actor and figure prints, keyblock and progressive proofs, a book cover, a photo of a framed print, and four designs already in under other titles). Brief: `TAGGING_BRIEF_r5.md`.*

## Results

- **Included: 103 of 104** → **362 prints**. Excluded: a second impression of Hiroshige's *Kannon Temple at Abumon* (Bingo), found by a title check after export.
- **Regions** (viewpoint coordinates): west of Kansai 19 (8), north of 38° 5 (2), abroad 8 (5); Kantō/Tōkai 228, Kansai/Chūbu 59, no place 44.
- **Markers** now present for wisteria (3; none before), plum 8 (4), autumn maples 8 (5), rice planting 6 (3); still thin: chrysanthemum, peach, rapeseed, azalea, iris.
- **Weather/time** (share ≥ 0.3): snowfall 31, rain 27, mist 34, drizzle 7, dawn 28, night 63; flora_fauna 20.
- **Scoring observation:** regional prints rarely win away from Tokyo, because proximity decays within ~15 km (`proximity.json`) and is weighted 0.4; flower prints without a place or environment (kachō-e) also rank below views that match the setting. **Changed:** proximity weight 0.4 → 0.2, plus a new `region` term (weight 0.3, ~150 km, scaled by min(1, 15 / prints within 150 km)). Simulated over 304 weather/time/month conditions: share of shows that are local — Hiroshima 8 → 21 %, Kōchi 5 → 10 %, Matsue 4 → 8 %; nearby prints ever shown — Hiroshima 9 → 10 of 14, Kōchi 4 → 8 of 12, Kagoshima 0 → 2 of 3; Tokyo 91 → 83 % local (less Edo-heavy). A plain region bonus without the scaling would push Tokyo to 96 % local.

## More candidates for draft 4

13. **Markers:** peony, water lily, bonito season, fish weirs (yana), seaweed (nori) farming, reed cutting, kanpyō drying, frozen lake, cranes, bats; plum between the winter and spring bumps.
14. **Environment:** one `environment_null_reason` per group (settlement, water, terrain), not one for all three.
15. **Crop:** `fan` vs `uchiwa` (folding vs round fan); the app does not use `crop_shape` yet.
16. **Genre:** interiors with a small view outside (Yoshida's *Farmhouse*) fit no genre well.

## Rotation and a duplicate sweep (after round 5)

The app now moves on to another good match every 10 minutes (`rotate_minutes` in `selection.json`; candidates: the top 8 within 0.35 of the best, avoiding the last 8 designs). Within that score window there are usually 6–8 designs (median over 96 test conditions; 1 in only 1–2 of them), often 10 or more.

Testing the rotation showed the same design twice in a row (AIC's and Mia's *Night View of Saruwaka-machi*), so the whole index was checked for designs held twice: titles normalised (AIC's "…, from the series …" and romanised titles, Dutch titles), the same artist, and a perceptual image hash to rank the candidates, then checked by eye. A plain image hash alone does not separate them — different impressions differ in colour. **10 prints left out** at export (`DUPLICATE_OF` in `scripts/export_index.py`): two museum copies, two Hokumyō copies of Hokusai designs, and the Rainstorm beneath the Summit held three times → **352 prints**. Kept: the copy that came in first, originals over copies. Yoshida's *Sailing Boats* (one composition in several colourings for different times of day) are kept as separate prints on purpose.

## Round 6: a single requested print

Asked for Kiyochika's "Snow at Sumida River": no print of that title turned up in Mia, the Rijksmuseum or museum catalogues online. Added the closest public-domain match instead, Kiyochika's triptych *The Second Month, Matsuchiyama in Snow at Dusk* (1896, Mia 9657; the Rijksmuseum's copy RP-P-1968-273 is not in the index) — a ferry crossing the Sumida in falling snow below Matsuchiyama. Tagged by hand under the round-5 rules (`harvest_round6.py`, `tags_r6_batch0.json`, `merge_round6.py` → `tags_v6.json`; export with `v6`). Its cropped aspect (1.93) is the widest in the index; the orientation term handles it. For snowfall at dusk in Tokyo it ranks 4th, inside the rotation pool → **353 prints**.
