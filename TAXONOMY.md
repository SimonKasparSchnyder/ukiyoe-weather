# Ukiyo-e Weather — Tag Categories and Matching

*Draft 3, 2026-11-15. Companion to [PLAN.md](PLAN.md). Revised after two rounds of the 100-print tagging pilot ([pilot/PILOT_FINDINGS.md](pilot/PILOT_FINDINGS.md)). All numbers are starting values; they live in `web/config/` and are tuned there.*

**Changes from draft 2:** series season sections and weak cultural conventions count as season cues; `rice_planting` marker; the two wild-geese markers merged; lotus leaves count; rules for implied snowfall, dark snow skies, split-level weather and outdoor scenes without sky; genre boundary rule; `book_cover` fragment; `era` definitions; environment groups may be `null` individually.

**Changes from draft 1:** genre split (`flora_fauna`, `still_life`, `animal_portrait` instead of one bird-and-flower bucket); `null_reason` for missing tags; lying snow moved out of the weather vector into a `snow_ground` modifier; wind-only gales count as `storm`; fixed seasonal marker IDs with eight new markers; more ukiyo-e conventions; `castle` flag, `wetland` water category; viewpoint/terrain rules; new fields `era`, `edition`, `fragment`, `crop_shape`, `time_source`.

## 1. Principles

- **Same categories on both sides.** Every dimension uses one category list for the prints (filled in by the tagger) and for the current conditions (derived from weather and map data).
- **Soft vectors, not single labels.** A print can be `mist 0.6, drizzle 0.4`; the present moment can be `dawn 0.7, day 0.3`. Each vector sums to 1.
- **One similarity formula for every categorical dimension:**

  **similarity = Σᵢ Σⱼ currentᵢ · printⱼ · closeness(i, j)**

  where `closeness` is a symmetric table with 1 on the diagonal. An exact match scores 1; a near miss (e.g. rain vs. drizzle) still earns partial credit.
- **Missing tags are `null` and score a neutral value** (start: 0.4), so such prints neither vanish nor dominate. Every `null` carries a reason:
  - `not_applicable` — the dimension has no meaningful answer (no sky or atmosphere at all; no setting).
  - `no_cue` — the scene has an answer, but nothing in title or image shows it (e.g. a landscape with no seasonal sign).

  **Never use an even spread to mean "unknown"**: a flat season vector would score well all year, which is not the same as not knowing.
- **Modifiers** (wind, snow on the ground, moon) are separate 0–1 values or flags with their own small weights.

## 2. Genre and inclusion

| Genre | Meaning | Included? |
|---|---|---|
| `landscape` | The scene is the subject (fūkeiga) | yes |
| `figures_in_landscape` | Figures prominent, but the setting fills roughly half the picture or more | yes |
| `flora_fauna` | Living plants and animals in nature: birds on branches, flowers, insects, fish in water (the core of kachō-e) | yes |
| `still_life` | Arranged or harvested things: fish on a board, food, objects, most surimono still lifes | no |
| `animal_portrait` | Animals shown without a natural setting (e.g. a pet indoors) | no |
| `figure` | Actor, beauty, warrior, figure-dominated prints | no |
| `other` | Book covers, title/contents sheets, sketches, non-prints | no |

Also excluded, whatever the genre:
- **Extreme formats** (pillar prints, full triptychs, envelope strips) — judged on the *cropped* sheet, not the scan.
- **Reproductions** (`edition: reproduction`, e.g. 20th-century postcards after Hiroshige).
- Prints where **every scored dimension is `null`**.

Excluded prints still get whatever tags can be filled in, plus `exclude_reason`.

## 3. Weather

### Categories

| Category | In a print | From current data |
|---|---|---|
| `clear` | Clear or blue sky, bright even light, no precipitation; **pale unprinted sky counts as clear** by default | Clear / mainly clear sky |
| `cloudy` | Grey or overcast sky, dull light | Partly cloudy / overcast |
| `mist` | Fog, mist or haze *as atmosphere* (veiled distance, figures fading) | Fog, low visibility |
| `drizzle` | Light rain: sparse fine lines, umbrellas in calm conditions | Drizzle, slight rain |
| `rain` | Steady rain: dense lines across the image | Moderate rain, showers |
| `storm` | Heavy driving rain, lightning, violent waves — **or a wind-only gale** (bent trees, flying hats) without rain | Heavy rain, thunderstorm, gale-force wind |
| `snowfall` | Falling snow (white dots/flakes in the air) | Snowfall, sleet (partial) |

### Modifiers

- **Wind** (0–1): air movement only — bent trees, flying hats and sleeves, tilted umbrellas, blown smoke. Waves and surf alone don't raise it.
- **Snow on the ground** (`snow_ground`, 0–1): snow lying at the scene's own level — roofs, trees, ground, the viewer's surroundings. A snow-capped Fuji or summer snowfields on distant peaks don't count (see the `lingering_snow` marker).

So "snow falling on snow-covered ground" is `weather: {snowfall: 1.0}, snow_ground: 1.0`, and the clear morning after snow is `weather: {clear: 1.0}, snow_ground: 1.0`.

### Judgement rules

- **Implied snowfall:** when the title says it is snowing and the scene supports it (snow-laden umbrellas, a heavy snow sky) but no flakes are drawn, give `snowfall` a share (e.g. 0.5–0.7).
- **Split-level weather** (e.g. a storm below a clear summit): tag the weather event that defines the scene — the storm — with a smaller share for the rest.
- **Outdoor scenes without visible sky** (bird's-eye views, close views of a pond): tag the evident weather with low confidence, rather than `null`. `null` (`not_applicable`) is for prints with no outdoor atmosphere at all.

### Closeness table

|          | clear | cloudy | mist | drizzle | rain | storm | snowfall |
|---|---|---|---|---|---|---|---|
| clear    | 1   | 0.5 | 0.3 | 0.1 | 0   | 0   | 0   |
| cloudy   | 0.5 | 1   | 0.6 | 0.4 | 0.2 | 0.1 | 0.2 |
| mist     | 0.3 | 0.6 | 1   | 0.5 | 0.3 | 0.1 | 0.2 |
| drizzle  | 0.1 | 0.4 | 0.5 | 1   | 0.7 | 0.3 | 0.3 |
| rain     | 0   | 0.2 | 0.3 | 0.7 | 1   | 0.6 | 0.3 |
| storm    | 0   | 0.1 | 0.1 | 0.3 | 0.6 | 1   | 0.2 |
| snowfall | 0   | 0.2 | 0.2 | 0.3 | 0.3 | 0.2 | 1   |

Similarity for each modifier: 1 − |current − print|.

### Mapping Open-Meteo to weather

| WMO code | Meaning | Weather vector |
|---|---|---|
| 0 | Clear sky | clear 1 |
| 1 | Mainly clear | clear 0.8, cloudy 0.2 |
| 2 | Partly cloudy | clear 0.4, cloudy 0.6 |
| 3 | Overcast | cloudy 1 |
| 45, 48 | Fog, rime fog | mist 1 |
| 51, 53, 55 | Drizzle | drizzle 1 |
| 56, 57 | Freezing drizzle | drizzle 0.7, snowfall 0.3 |
| 61 | Slight rain | drizzle 0.5, rain 0.5 |
| 63 | Moderate rain | rain 1 |
| 65 | Heavy rain | rain 0.5, storm 0.5 |
| 66, 67 | Freezing rain | rain 0.7, snowfall 0.3 |
| 71, 73, 75, 77 | Snowfall, snow grains | snowfall 1 |
| 80, 81 | Rain showers | rain 1 |
| 82 | Violent rain showers | rain 0.5, storm 0.5 |
| 85, 86 | Snow showers | snowfall 1 |
| 95, 96, 99 | Thunderstorm (with hail) | storm 1 |

Adjustments after the code lookup:
- **Visibility** < 1 km → blend in mist (e.g. 50%); 1–5 km → small mist share (haze).
- **Gale:** gusts above ~60 km/h without precipitation → blend in storm (e.g. 40%).
- **Wind:** 0 below ~15 km/h, rising to 1 at ~50 km/h (gusts count).
- **Snow on the ground:** 0 with no snow depth, rising to 1 at ~10 cm.

## 4. Time of day

### Categories

| Category | In a print | From the sun |
|---|---|---|
| `dawn` | Pale sky low on the horizon, early travellers, first light | Sun elevation −8° to +6°, morning |
| `day` | Full daylight | Above +6° |
| `dusk` | Sunset glow, lanterns being lit, arrivals | +6° to −8°, evening |
| `night` | Dark sky, moon or stars, lit windows and lanterns | Below −8° |

Boundaries blend over a couple of degrees, so the transition is gradual (`dusk 0.6, night 0.4`).

**Moon** (flag): the print shows the moon, **including a reflection of it**. Currently the moon is visible if it is above the horizon, the sky is at most ~50% cloudy, and it is dusk or night. Similarity: 1 if they agree, 0 if they don't (low weight).

**`time_source`** records what decided the time tag: `title`, `image`, `both`, or `guess`; `null` when time is `null`.

### Closeness table

|       | dawn | day | dusk | night |
|---|---|---|---|---|
| dawn  | 1   | 0.4 | 0.5 | 0.3 |
| day   | 0.4 | 1   | 0.3 | 0   |
| dusk  | 0.5 | 0.3 | 1   | 0.5 |
| night | 0.3 | 0   | 0.5 | 1   |

Dawn and dusk share credit because the light looks similar in prints.

## 5. Season

Seasons are a circle, and plants pin a print to a much narrower window than "spring". So season is a **curve over the year**, not a closeness table.

**Print side:** the tagger returns
- a soft 4-season vector (`spring`, `summer`, `autumn`, `winter`) — or `null` with a reason, and
- a list of **seasonal marker IDs** from the table below.

The pipeline turns both into a curve over the 365 days: each season is a broad bump, each marker a narrower one. The curve is scaled so its peak is 1.

**Current side:** today's day of year. In the **southern hemisphere** shift by half a year.

**Similarity** = the print's curve value at today's date.

Season cues come from plants, festivals, activities and clothing, **not from general greenness or colour**. Also valid:
- **Series season sections** — e.g. the spring/summer/autumn/winter sections of *One Hundred Famous Views of Edo*. Explicit image cues win if they conflict.
- **Cultural conventions, as weak cues** (vector top ≈ 0.6, low confidence): a moon alone → autumn; New Year surimono → `new_year`.

Wild geese are a **season** cue only, not a dusk cue.

### Season bumps

| Season | Centre | Half-width |
|---|---|---|
| spring | 5 April | ~45 days |
| summer | 15 July | ~45 days |
| autumn | 15 October | ~45 days |
| winter | 15 January | ~45 days |

### Seasonal markers (fixed IDs)

Dates are approximate for the Kantō region today. Use only these IDs; if something new is needed, name it in `taxonomy_friction` instead.

| ID | What | Peak | Half-width |
|---|---|---|---|
| `new_year` | New Year decorations, kites, first sunrise (Edo prints show the lunar New Year) | 15 Jan | 25 days |
| `plum_blossom` | Ume | 20 Feb | 20 days |
| `rapeseed` | Yellow rapeseed fields | 1 Apr | 20 days |
| `cherry_blossom` | Sakura in bloom | 1 Apr | 10 days |
| `peach_blossom` | Momo | 5 Apr | 10 days |
| `hazakura` | Cherry trees in fresh leaf | 1 May | 12 days |
| `azalea` | Tsutsuji | 5 May | 12 days |
| `wisteria` | Fuji (the plant) | 1 May | 12 days |
| `willow_green` | Willows in fresh or full leaf | 15 May | 40 days |
| `iris` | Hanashōbu, kakitsubata | 5 Jun | 12 days |
| `rice_planting` | Flooded paddies with young rice, planting | 5 Jun | 15 days |
| `loquat` | Ripe loquats | 10 Jun | 12 days |
| `fireflies` | Firefly viewing | 25 Jun | 15 days |
| `lotus` | Lotus in bloom or in leaf | 25 Jul | 25 days |
| `morning_glory` | Asagao | 1 Aug | 15 days |
| `summer_fireworks` | Fireworks, evening cool by the river (yūsuzumi) | 1 Aug | 20 days |
| `lingering_snow` | Summer snowfields on high mountains | 15 Jul | 40 days |
| `moon_viewing` | Tsukimi, harvest moon offerings | 20 Sep | 15 days |
| `autumn_grasses` | Susuki pampas grass, bush clover | 25 Sep | 20 days |
| `rice_harvest` | Harvest, drying sheaves | 1 Oct | 15 days |
| `wild_geese` | Wild geese, flying or descending (rakugan) | 1 Nov | 60 days |
| `chrysanthemum` | Kiku | 1 Nov | 15 days |
| `autumn_maples` | Momiji | 20 Nov | 15 days |
| `snow` | Snow at the scene's level | 25 Jan | 35 days |

*Later:* shift the marker peaks by local climate (cherry blossoms are in January in Okinawa and mid-April in Zurich); in the tropics, where seasons mean little, reduce the season weight automatically.

## 6. Environment

A place can be several things at once (a coastal town in the mountains). So environment has **three groups**, each a soft vector with its own closeness table, plus **feature flags**.

**Privacy:** the app looks these up for the device position rounded to 2 decimals (a ~1 km square), never the precise point, so the distances below are measured from the centre of that square and describe the neighbourhood rather than the exact spot.

**Viewpoint vs. view:** the **terrain** and **water** groups describe the **scene in view** (mountains across the harbour count as mountain). The **place** coordinates are the **viewpoint** — where the artist stood. If there is no usable viewpoint (open sea, the mountain itself), use the subject's location with coarse precision. Places named only by a province get **no coordinates**.

### Groups

**Settlement**

| Category | Print | Map data |
|---|---|---|
| `city` | Dense streets, shopfronts, crowds (Edo, Osaka, Kyoto) | Commercial land use, dense buildings |
| `town` | Village or post-station street, scattered houses | Residential, moderate density |
| `rural` | Rice paddies, fields, farmhouses | Farmland, orchards, meadows |
| `wild` | No settlement: open mountains, coast, forest | Forest, nature areas, few buildings |

|       | city | town | rural | wild |
|---|---|---|---|---|
| city  | 1   | 0.6 | 0.2 | 0   |
| town  | 0.6 | 1   | 0.5 | 0.2 |
| rural | 0.2 | 0.5 | 1   | 0.5 |
| wild  | 0   | 0.2 | 0.5 | 1   |

**Water**

| Category | Print | Map data |
|---|---|---|
| `none` | No water | No water nearby |
| `river` | River, canal, moat, stream | River or canal within ~500 m |
| `lake` | Lake or pond | Lake or pond within ~500 m |
| `sea` | Bay, beach, open sea, lagoon open to the sea | Coastline within ~2 km, fading out by ~5 km |
| `wetland` | Flooded rice paddies, marsh, reed beds | Wetland or paddy land use within ~500 m |

|         | none | river | lake | sea | wetland |
|---|---|---|---|---|---|
| none    | 1   | 0.3 | 0.3 | 0.1 | 0.3 |
| river   | 0.3 | 1   | 0.6 | 0.4 | 0.5 |
| lake    | 0.3 | 0.6 | 1   | 0.5 | 0.5 |
| sea     | 0.1 | 0.4 | 0.5 | 1   | 0.3 |
| wetland | 0.3 | 0.5 | 0.5 | 0.3 | 1   |

**Terrain**

| Category | Print | Map data (relief within ~2 km) |
|---|---|---|
| `flat` | Plains, flat river banks | < 50 m |
| `hilly` | Hills, slopes | 50–300 m |
| `mountain` | Mountains, passes, gorges | > 300 m, or high elevation |

|          | flat | hilly | mountain |
|---|---|---|---|
| flat     | 1   | 0.5 | 0.1 |
| hilly    | 0.5 | 1   | 0.5 |
| mountain | 0.1 | 0.5 | 1   |

Relief comes from Open-Meteo's elevation data: the centre point plus ~8 points around it.

**Environment similarity** = weighted average of the three groups (start: settlement 0.4, water 0.35, terrain 0.25) + a flag bonus. A group can be `null` on its own (e.g. settlement of a riverbank vignette with no buildings); the average then uses the remaining groups.

### Feature flags

| Flag | Print | Map data |
|---|---|---|
| `onsen` | Hot-spring town, bathers, steam | Hot spring or onsen bath within ~1 km |
| `temple_shrine` | Any religious site: temple, shrine, pagoda, torii, Confucian hall | Place of worship within ~500 m (Buddhist/Shinto full credit, others half) |
| `castle` | Castle, fortifications | Castle within ~1 km |
| `garden_park` | Garden, blossom-viewing park | Park or garden within ~400 m |
| `forest` | Real woodland or groves (not just a pine avenue or scattered trees) | Woodland within ~500 m |
| `waterfall` | Waterfall | Waterfall within ~1 km |
| `bridge` | Bridge prominent in the scene | Bridge within ~300 m |

Flags are a **bonus only**: for each flag true at the current location, a print that has it earns credit. A print having a flag the location lacks is not penalised (otherwise bridge prints, which are everywhere in ukiyo-e, would be penalised almost everywhere).

## 7. Orientation

Print aspect ratio (of the cropped sheet) vs. window aspect ratio, on a log scale so portrait and landscape are treated symmetrically:

**similarity = max(0, 1 − |ln(print aspect / window aspect)| / ln 2)**

So an exact fit scores 1, and a print twice as wide (or tall) as the window scores 0.

## 8. Proximity

**similarity = exp(−distance / scale)** with scale ~15 km (so ~1 within a few km, ~0.5 at 10 km, ~0.04 at 50 km). Prints without coordinates score 0. The coordinates are the viewpoint (see §6).

A second, broader **region** term uses the same formula with a ~150 km scale, multiplied by min(1, 15 / number of prints within 150 km of the current location): full strength where only a few prints are nearby (e.g. Hiroshima, Kōchi), small where most of the collection is (Tokyo), so regional prints get shown without making Edo views even more dominant around Tokyo. Settings in `proximity.json`.

## 9. Other tagger output

| Field | Values | Use |
|---|---|---|
| `era` | `edo` (to 1868), `meiji` (1868–1912), `shin_hanga` (the movement, c. 1915–1960, incl. the post-war Yoshida school), `modern` (later creative prints) — describes the **object**; reproductions are marked by `edition` | Filtering (shin-hanga copyright caveat) |
| `edition` | `original`, `later_edition`, `reproduction` | Reproductions excluded; prefer originals |
| `fragment` | `none`, `triptych_sheet`, `album_page`, `book_page`, `book_cover` | Note single sheets of larger works |
| `crop_shape` | `rect`, `fan` | Fan prints (uchiwa-e) need a shaped mask, not a rectangle |
| `fuji` | true / false | Possible later feature; true only where Fuji is drawn |
| `confidence` | 0–1 per dimension, or `null` | Doubtful prints go to the review tool |
| `fading` | true / false | Colours visibly faded; tags describe the intended colours |

### Notes for the tagging prompt (ukiyo-e conventions)

The tagger must not read stylistic conventions as weather or time:
- **Stylised cloud and mist bands** (suyari-gasumi) are a compositional device, not fog. Only atmospheric mist that veils the scene counts as `mist`.
- **Dark blue gradation at the top of the sky** (ichimonji-bokashi) is a convention in daytime scenes too; it does not by itself mean night or storm.
- **Red, pink or orange horizon bands** are also a convention, used by Hiroshige in plain daytime scenes. Read them as dawn or dusk only with a title or scene cue, or when the glow clearly dominates the sky. Otherwise tag `day` (with a small dawn/dusk share at most).
- **Solid black or very dark skies in rain and snow scenes** mean gloom, not night — unless there are lanterns, lit windows or a moon.
- **Flat coloured backgrounds** (e.g. yellow, grey) and decorative gradients in flora-and-fauna prints say nothing about time of day or weather → `null` (`not_applicable`).
- **Pale, unprinted skies** count as `clear` by default.
- **Night** is shown by a moon, stars, lanterns, lit windows, or an overall dark palette. Moonlit skies are often pale blue; the moon itself is the cue.
- **Rain** is drawn as fine straight lines; **snow** as white dots or white-covered forms.
- **Season** is usually told by plants, festivals and clothing; never by general greenness.
- **Faded colours** (blues and reds fade with age and light) are not dusk or autumn. Tag what the printer intended where the fading is evident, and set `fading: true`.
- **Impressions differ.** Tag each impression as it looks, but don't let small printing differences (a slightly deeper horizon band) flip the time of day.
- **Fan prints:** the uncut handle notch is not a moon.
- **Dawn vs. dusk** is rarely clear from the light alone. Decide from:
  - **the title** — morning (朝), dawn (暁, 曙), sunrise (日の出) vs. evening (夕, 暮), evening glow (夕照), evening bell (晩鐘), returning sails (帰帆), descending geese (落雁), night rain (夜雨). **But a place name is not a time cue**: Yūhi-no-oka ("Sunset Hill") is a place.
  - **activity** — travellers setting out from inns, processions departing, fishing boats heading out (dawn) vs. travellers arriving, inn touts, lanterns being lit, boats returning (dusk). Flying birds alone are not a time cue.
  - If neither gives a clue, **split the vector** (e.g. dawn 0.5, dusk 0.5) rather than guessing, and set `time_source: guess`.

## 10. Config files (draft)

```
web/config/
  weights.json        top-level weights (see PLAN.md §9) + neutral value
  weather.json        categories, closeness table, WMO mapping, visibility/gale/snow/wind rules
  time.json           categories, closeness table, sun-elevation thresholds, blend width
  season.json         season bumps, marker table with peaks and widths, hemisphere rule
  environment.json    group categories, closeness tables, group sub-weights, flag radii
  proximity.json      distance scales (place, region) and the region fair share
```

Example `weights.json`:

```json
{
  "weather": 1.5,
  "wind": 0.15,
  "snow_ground": 0.5,
  "time_of_day": 0.9,
  "moon": 0.2,
  "season": 0.5,
  "environment": 0.5,
  "environment_flags": 0.15,
  "proximity": 0.2,
  "region": 0.3,
  "orientation": 0.15,
  "neutral": 0.4
}
```
