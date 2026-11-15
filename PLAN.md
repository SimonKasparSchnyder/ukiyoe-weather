# Ukiyo-e Weather — Project Plan

*Status: pilot done (100 prints tagged, two rounds); matching tuner and first app shell running locally with 66 prints. Last updated 2026-11-15.*

## 1. Vision

A weather app for the current (or a chosen) location that styles itself with the ukiyo-e print that best matches the moment: the current **weather**, **time of day**, **season**, and the **place** — either the actual location (where a print of it exists) or the *type* of environment (city, river town, coast, mountains, rural fields, hot-spring town, …).

Audience: personal use, possibly a few friends. Not commercial.

## 2. Decisions so far

| Topic | Decision |
|---|---|
| Image licensing | **CC0 and public-domain-equivalent sources** (Public Domain Mark, "public domain / free to reuse"). Exact rights statement stored per item, so the pool can be narrowed to strict CC0 later. No non-commercial or attribution-required (CC BY) licences. |
| Login / accounts | **None.** Static site; settings stored per device in the browser. |
| Location handling | Read in the browser (Geolocation API) or set manually; sent only to the weather/map services, never to the host. |
| Place matching | Real-place match when a print of a nearby location exists; otherwise (in Japan or abroad) fall back to **environment-type** match. |
| Scoring | Weighted sum of similarity scores with **float weights in a config file**, easy to adjust. Priority: weather & time of day first, then season & place. |
| Orientation | Include a small **orientation weight** favouring prints whose shape suits the current screen. |
| Print formats | **Exclude extreme formats** (pillar prints/hashira-e, triptychs, etc.) for now. |
| Shin-hanga | **Include 20th-century prints (shin-hanga, e.g. Yoshida Hiroshi, Kawase Hasui, Ohara Shōson) when the holding museum labels them public domain.** Such labels usually follow US law; some (e.g. Yoshida Tōshi, d. 1995) are still in copyright in Japan. Acceptable for personal use; store an `era` field (Edo / Meiji / shin-hanga) so they can be filtered out if the app is ever shared more widely. |
| Cropping | **Crop to the edge of the sheet** (keeps signatures, seals, title cartouches; removes museum backdrop, colour bars, mounts). Crop rectangles computed offline and stored in the index. *Later:* generalise to slightly rotated (misaligned) scans. |
| Image delivery | **Load images directly from museum servers** first. If that proves too slow or too soft (e.g. Mia offers only 800 px or a ~17 MB original), add a **local image cache** on the Mac (no web hosting involved). Self-hosting pre-cropped copies is a possible later step. |
| AI at runtime | **None.** All analysis is done once, offline; the app only scores a precomputed index. |
| First platform | **Locally run web app** on the Mac. Nothing on GitHub or any host for now. |
| Typeface | **Source Serif** (Source Serif 4), bundled locally. |
| Surround (leftover space) | **Japanese paper (washi)** texture or a **plain colour from the print**. (Passepartout and mounting brocade were tried and dropped.) |
| Print size | **Framed** (margin all round; panel beside, below or over the print) or **Fit to window** (as large as possible without cropping — the CSS "contain" / macOS "Fit to Screen" behaviour; the panel floats over the print). |

## 3. Architecture overview

```
 ┌──────────────── OFFLINE (on the Mac, run occasionally) ────────────────┐
 │  Museum APIs → harvest → dedupe → filter → crop detect → tag → review  │
 │                                                     ↓                  │
 │                                              index.json                │
 └────────────────────────────────────────────────────────────────────────┘
                                ↓ (served by a local web server)
 ┌──────────────── RUNTIME (in the browser on the Mac) ───────────────────┐
 │  location → weather (Open-Meteo) + sun position + season + environment │
 │           → score every print in index.json → pick from top matches    │
 │           → load cropped image from museum server → lay out UI         │
 └────────────────────────────────────────────────────────────────────────┘
```

Rough project layout (when we start coding):

- `pipeline/` — Python scripts for the offline steps
- `data/` — raw harvested metadata, intermediate files, `index.json`
- `review/` — a small local tool for checking crops and tags
- `web/` — the static app (HTML/CSS/JS), including `config/weights.json`

## 4. Image sources (CC0 / public domain, incl. Public Domain Mark)

*Verified 2026-11-15 against the institutions' own APIs and documentation. Counts are from live API queries.*

**Licence wording varies.** Only some sources use a formal CC0 dedication; others use the Public Domain Mark (PDM) or say "public domain, free to reuse". For a personal, non-commercial app these are equivalent. The pipeline stores each item's exact rights statement and rights URL, so the pool can be narrowed to strict CC0 at any time.

### Core sources

| Source | Licence | Size (public domain, with images) | Harvest | Images | Notes |
|---|---|---|---|---|---|
| **Minneapolis Institute of Art (Mia)** | PDM ("free of known restrictions") | ~2,350 ukiyo-e, of which **~1,180 landscapes**; ~140 bird-and-flower (all rights) | Undocumented keyless search API (`search.artsmia.org`); CC0 bulk data on GitHub (stale since Jan 2026) | **No IIIF.** Fixed renditions: 400 px, 800 px, full (~9,000 px, ~17 MB) | **Best metadata:** genre in `object_name` (e.g. "Print (ukiyo-e / fūkei-ga)"), series in `portfolio`, Japanese title, format (ōban …), image pixel size. |
| **Rijksmuseum** | Images PDM, metadata CC0; credit line requested | ~4,400 Japanese prints | New keyless Data Services search API (results are IDs; fetch Linked Art JSON-LD records). Filters need **Dutch terms** (`kleurenhoutsnede`). Bulk dump from 2024 only. | **Full IIIF** (v3, Micrio): free region crops, any size, jpg/webp; rotation only in 90° steps | English + Dutch titles; format field; subjects behind a separate linked record. |
| **Art Institute of Chicago** | **CC0**; caption requested | ~6,300 Japanese woodblock prints | Keyless API, 60 requests/min; asks for an `AIC-User-Agent` header. **Full bulk dump** (~75 MB compressed). | IIIF, but **restricted**: only fixed widths (200, 400, 600, 843, 1200, 1686 px), crops only on the 256 px tile grid, no rotation | Subject tags sparse (~200 prints); series only inside titles; format in `medium_display`. Docs prefer hotlinking over scraping. |
| **The Met** | **CC0** | ~5,100 woodblock prints with images in Asian Art, **~75% public domain** (sample) | `/v1/search` was **retired 2026-10-01**; use `/v1.1/search`. Bot protection blocks after ~100 quick requests → **use the bulk CSV** and throttle hard. | **No IIIF.** Original JPEG (~3 MB) or `web-large` (~120 KB) | Good subject tags (Landscapes, Rain, Snow, Birds …, linked to Getty AAT/Wikidata). `hasImages` ≠ public domain: filter on `isPublicDomain`. |
| **National Diet Library** (via Japan Search) | Copyright expired, "may be reused freely", credit requested (Japan Search: PDM) | ~10,700 nishiki-e | Japan Search API (keyless) | **IIIF on all of them** | Japanese titles with readings; includes themed sets such as *Meisho Edo Hyakkei*. |
| **Tokyo Metropolitan Library** (via Japan Search) | "Public domain" on item pages (Japan Search: PDM); no standalone licence page found | ~13,900 nishiki-e, ~1,500 famous-place (meisho) prints | Japan Search API | **No IIIF**; download URLs only | Dense in **Edo/Tokyo places** — ideal for real-place matching in Tokyo. |

### Secondary sources (small or partly unverified)

| Source | Licence | Notes |
|---|---|---|
| Cleveland Museum of Art | **CC0** | ~600 Japanese prints. Keyless API (limit 1,000/page), daily bulk data. No IIIF: 900 px / 3,400 px / huge TIFF. Japanese titles; no subject tags; series only in titles. |
| Tokyo Fuji Art Museum (via Japan Search) | **CC0** | ~430 nishiki-e, incl. Hokusai's Fuji series and Hiroshige's Tōkaidō. No IIIF. |
| Yale University Art Gallery (LUX) | Open access, no fees or permission | Keyless Linked Art API, IIIF. Japanese print count unverified (hundreds to ~1,600 hits incl. library items). |
| Princeton University Art Museum | Public domain, free download; credit requested | ~450 hits, keyless API, IIIF v3, names in Japanese script. |
| Edo-Tokyo Museum (via Japan Search) | PDM per Japan Search (own licence page unverified) | ~370 Hiroshige among ~21,000 items. No IIIF. |

**Japan Search** (jpsearch.go.jp) is the gateway for the Japanese sources: keyless API, a per-item rights filter (`f-rights=pdm` or `cc0`, one per request), a IIIF filter, and a SPARQL endpoint. Avoid its `arc_nishikie` (Ritsumeikan, no rights code) and `enpk_ukiyoe` (Waseda, restricted) databases.

**Wikidata** (CC0) serves as a cross-reference for series, individual prints, places and coordinates.

### Dropped or excluded

- **Smithsonian NMAA** — CC0, but only a few dozen ukiyo-e prints in Open Access; needs an API key.
- **Library of Congress** — images max ~1,024 px, and its site blocks automated harvesting.
- **Licence grounds:** British Museum (CC BY-NC-SA), MFA Boston, Harvard Art Museums (non-commercial API terms), ColBase / Tokyo National Museum (CC BY, ~7,000 nishiki-e — reconsider if attribution is acceptable).
- **Later, if needed:** National Gallery of Art and Walters (CC0, few Japanese prints), NYPL, MKG Hamburg, Paris Musées, Brooklyn.
- Ukiyo-e.org remains useful only as a *reference* for matching the same design across collections.

### Expected yield

The raw pool is large (roughly 40,000+ public-domain prints), but it includes many actor, beauty and warrior prints and many duplicate impressions across museums. After filtering to landscapes and bird-and-flower prints and deduplicating designs, expect **several thousand** distinct designs, with good coverage of the major landscape series and of Edo/Tokyo places.

## 5. Offline pipeline

1. **Harvest** — pull metadata and image URLs for Japanese prints from each source; keep source IDs, credit lines, the exact rights statement and rights URL, and links to the museum object pages.
   - Prefer **bulk data dumps** (AIC, Met, Cleveland, Mia) over API crawling; otherwise throttle to well below each documented limit (AIC 60/min; the Met blocks quick bursts).
   - Japanese sources through the **Japan Search** API with the rights filter.
   - Record each image's pixel size and the available renditions/IIIF service.
2. **Normalise & group impressions** — the same design (e.g. a Hiroshige view) exists in many museums, and impressions of one design can differ meaningfully: different editions and states (e.g. a sky gradation at the top vs. the bottom), printer's colour choices, and — especially in shin-hanga, e.g. Yoshida Hiroshi's sailboat series printed from the same blocks for different times of day — **deliberate weather/time variants**.
   - Group impressions by visual similarity (image embeddings) under a shared `design_id`, but **tag every impression individually**.
   - Impressions whose tags agree collapse to the best scan (resolution, condition, colour); impressions whose weather, time or mood differ stay as **separate candidates** within the design.
   - Distinguish fading and wear (e.g. faded blues and reds, which can make a day scene look like dusk) from deliberate colour; prefer well-preserved impressions.
   - The selection's variety rule treats a design as one unit, so two impressions of the same design aren't shown back to back.
3. **Filter**
   - Keep landscapes (fūkeiga) and bird-and-flower prints (kachō-e); drop actor, beauty, and warrior prints. An image-embedding model (e.g. CLIP, free and local) does a first pass; metadata helps.
   - Drop extreme formats by aspect ratio (starting range: keep width/height between ~0.55 and ~1.8; tune later).
4. **Crop detection** — find the sheet edge in each scan (classic image analysis, falling back to a vision model for a bounding box). Store as a normalised rectangle `[x, y, w, h]`. Compute the cropped aspect ratio.
   - *Later:* handle slightly rotated scans — detect the sheet as a rotated rectangle (e.g. minimum-area rectangle around the sheet contour) and store a small `rotation` angle in degrees alongside the crop. Design the index field now (default `0`) so the app doesn't need to change when this arrives.
5. **Tagging** — a vision-language model receives the image plus title/series/metadata and returns structured tags with confidence values (schema in §6). Pilot on ~100 prints first to check quality and cost; then run the rest in batch.
6. **Geocoding** — derive real places from titles and series (Tōkaidō and Kisokaidō stations, Edo views, famous sites) → latitude/longitude where possible.
7. **Palette extraction** — a few dominant colours per print, for theming the UI.
8. **Review** — a local page to browse prints with their crops and tags, fix failures by hand, and spot-check a random sample.
9. **Export** — write `index.json`.

## 6. Index schema (draft)

```json
{
  "id": "aic-12345",
  "design_id": "hiroshige-tokaido-hoeido-16",
  "title": "Evening Snow at Kanbara",
  "artist": "Utagawa Hiroshige",
  "series": "Fifty-three Stations of the Tōkaidō",
  "date": "c. 1833",
  "source": "Art Institute of Chicago",
  "license": "CC0",
  "object_url": "https://…",
  "image": { "url": "https://…", "iiif_base": "https://…", "width": 4000, "height": 2700 },
  "crop": [0.03, 0.04, 0.94, 0.92],
  "rotation": 0.0,
  "aspect": 1.49,
  "genre": "landscape",
  "era": "edo",
  "edition": "original",
  "weather":     { "snowfall": 1.0 },
  "wind": 0.0,
  "snow_ground": 1.0,
  "time_of_day": { "dusk": 0.3, "night": 0.7 },
  "time_source": "both",
  "moon": false,
  "season":      { "winter": 1.0 },
  "seasonal_markers": ["snow"],
  "environment": {
    "settlement": { "town": 0.8, "wild": 0.2 },
    "water":      { "none": 1.0 },
    "terrain":    { "hilly": 0.6, "mountain": 0.4 },
    "flags":      []
  },
  "fuji": false,
  "place": { "name": "Kanbara", "lat": 35.12, "lon": 138.60, "precision_km": 2 },
  "palette": ["#e9e4d8", "#2b3a55", "#8a8f99"]
}
```

Vectors list only non-zero categories. The categories, closeness tables and data mappings are defined in **[TAXONOMY.md](TAXONOMY.md)** and will be refined after the tagging pilot.

## 7. Image delivery and cropping (runtime)

Images load directly from museum servers.

**Cropping is applied in the browser for every source.** The browser shows only the crop rectangle from the index by positioning the image inside a clipping frame (CSS). This is display-only: no image analysis on the device. (Verification showed that server-side cropping can't be relied on: AIC only allows crops on its tile grid, and the Met, Mia, Cleveland and the Tokyo Metropolitan Library have no IIIF at all.)

**Choosing the image size** per source, so a large screen gets a sharp image without downloading huge originals:

| Source | Sizes available |
|---|---|
| Rijksmuseum, NDL (full IIIF) | Any size — request exactly what the window needs (could also request the crop region directly). |
| AIC (restricted IIIF) | Fixed widths: 843, 1,200 or 1,686 px. |
| Mia | 800 px or full (~17 MB). |
| The Met | `web-large` or original (~3 MB). |
| Cleveland | 900 px or 3,400 px. |

The index records which renditions each print has; the app picks the smallest one that is sharp enough for the window. Colour palettes are extracted offline, so the app never needs to read image pixels (some servers don't allow that from a web page).

No cropping *logic* runs on the device — only display of a precomputed rectangle.

Rotation (later): IIIF only rotates in 90° steps, so a small deskew angle is applied in the browser (CSS transform on the image inside the clipping frame) for every source. Still display-only and cheap.

*Future option:* host pre-cropped, downsized copies (screen size + widget size) for reliability, speed and widget support. ~1 GB for a few thousand prints; Cloudflare R2 free tier if GitHub Pages is too small.

## 8. Runtime context

| Input | Source | Notes |
|---|---|---|
| Location | Browser geolocation, or a saved manual location | Per-device storage. |
| Weather | Open-Meteo (free, no key); **MET Norway as automatic fallback** (Open-Meteo's forecast server was unreachable for a while during testing) | Map WMO weather codes + cloud cover, visibility (fog), precipitation, wind speed → our weather categories. Also forecast for the UI. |
| Time of day | Sun position (sunrise/sunset from Open-Meteo or computed locally) | "Dusk" follows actual sunset through the year. |
| Moon | Computed moon phase and altitude | Lets clear moonlit nights favour moon prints. |
| Season | Date of year, **flipped for the southern hemisphere** | Smooth (circular) rather than four hard boxes. |
| Environment | OpenStreetMap (Overpass) around the location, cached per location | Coastline/river/lake nearby, built-up density, farmland/paddy, forest, hot springs (`natural=hot_spring`, onsen baths), elevation/terrain → environment vector. Respect the OSM fair-use policies (cache, low request rate). |
| Screen shape | Viewport size | For the orientation term. |

## 9. Scoring

**Score = Σ wᵢ · sᵢ**, each similarity sᵢ ∈ [0, 1].

| Component | Similarity |
|---|---|
| Weather | Current condition vs. print's weather vector, using a **closeness table** (e.g. rain↔mist 0.5, rain↔snow 0.3, clear↔storm 0). Wind as a small modifier. |
| Time of day | Closeness table with neighbours (e.g. dusk↔night 0.6, dawn↔dusk some credit for similar light). |
| Season | Circular distance in the year (late winter is near early spring); seasonal markers (plum, cherry, iris, maple, …) can narrow the window. |
| Proximity | Decays with distance to the print's real place, e.g. full score within a few km, fading over ~50 km. Zero for prints without a place. |
| Environment | Similarity between the location's environment vector and the print's. |
| Orientation | Bonus when the print's aspect ratio suits the screen. |

Proximity and environment are **separate terms**, so a nearby print wins when it fits, and an environment match from anywhere takes over when nothing nearby does.

Starting weights (`web/config/weights.json`), to be tuned:

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
  "proximity": 0.4,
  "orientation": 0.15,
  "neutral": 0.4
}
```

`neutral` is the score a print gets on a dimension it has no tag for (e.g. a flora-and-fauna close-up has no environment).

The exact similarity formulas, closeness tables, season curves, and the mappings from Open-Meteo and OpenStreetMap are in **[TAXONOMY.md](TAXONOMY.md)**. All of it lives in config files, not in the code.

**Selection:** pick randomly among the top few matches, weighted by score, and avoid recently shown prints, so a week of rain doesn't show the same print every time.

**Tuning page:** shows the top ~10 matches for the current conditions or for made-up ones (e.g. "snowy dusk, coastal city, February"), with a per-component score breakdown and sliders for every weight.

## 10. Interface

- Always show the **whole print** (cropped to the sheet edge); at most a slight crop for fit.
- Compare print aspect ratio with window aspect ratio:
  - **Similar** (within a tunable tolerance) → controls float over the print on a translucent panel.
  - **Print taller than the window** → controls to the side.
  - **Print wider than the window** → controls below (typical for landscape prints on a phone held upright).
- **Surround** (leftover space), echoing how prints were historically displayed or kept:
  - **Japanese paper** (washi, visible fibres),
  - Fallback: plain paper tone or a colour from the print's palette.
  - Textures either from CC0 photographic sources or generated (SVG/CSS noise for washi fibres). The surround could be a user setting, or chosen per print, e.g. tinted from the print's palette.
- The palette also themes the controls.
- **Typeface:** Source Serif 4 (SIL Open Font License), bundled with the app so it works offline. Source Serif has no Japanese glyphs; for Japanese titles pair it with **Source Han Serif / Noto Serif JP**, its matching CJK companion.
- Content: current conditions and forecast, location (current / saved / search), print title, artist, series, date, museum credit with a link.

## 11. Platform phases

1. **Pipeline** (Python, offline) → `index.json`. Platform-independent; the bulk of the work.
2. **Locally run web app** on the Mac: a static app served by a simple local web server, opened at `http://localhost:…`. Location works there (browsers treat `localhost` as secure). Matching logic tuned here. **Status: first version running** (`web/`, see `web/README.md`): live weather, sun/moon, OpenStreetMap surroundings, layout modes, surrounds, forecast panel, Matching Tuner.
   - Limitation: an iPhone on the same Wi-Fi could open the page via the Mac's local IP address, but browser location is blocked on plain `http://` from another device. It would work with a manually set location, or with local HTTPS later.
   - *Later, optional:* free static hosting (GitHub Pages with a public repo, or Cloudflare Pages with a private one) to use it on the iPhone away from home.
3. **Widgets**
   - iPhone: **Scriptable** (free, JavaScript home-screen widgets, no developer account). Needs `index.json` reachable from the phone, so it depends on the hosting step (or on bundling the index into the Scriptable script).
   - Mac: **Übersicht** (HTML/JS desktop widgets, reuses web code) or a native **SwiftUI/WidgetKit** widget (free signing works indefinitely on your own Mac).
4. **Native SwiftUI app + widgets** for iPhone/Mac — only if it proves worth the Apple Developer Program fee (also unlocks WeatherKit and easy distribution to friends). Free signing on iPhone is possible for testing, but apps expire after 7 days.

## 12. Publishing to friends (later)

Goal: share the app via GitHub Pages (or Cloudflare Pages) without the development tools.

- **Developer mode, switched in the browser — no flag to remember.** Off by default everywhere, so the default view (also on `localhost`) is exactly what friends see. `?dev` in the address switches it on and the browser remembers it; `?dev=0` switches it off; `?debug` adds raw sun/moon/cloud values for one visit. Developer-only: "Why this print", the "Another print" button, technical status notes (weather provider, surroundings lookup), links to the Matching Tuner and icon page in Settings. Implemented in `web/app.js` (`DEV`) and `web/app.css` (`.dev-only`).
- **Publish a cleaned copy, not the repository.** A small publish script copies only the public parts of `web/` (app, config, `lib/`, fonts, print index, fallback images) into a separate folder or branch that Pages serves. The tuner, icon page, `pilot/` and planning documents are not published.
- **Fallback images.** The app loads prints from the museum servers and falls back to a local copy if that fails. Not every print gets a local copy:
  - *now:* the pilot prints are the fallback set;
  - *later:* a curated set of about **100 prints** covering most weather, time-of-day and season combinations. When a museum server is down, the app picks the best match from this set only.
- **Repository visibility.** Free GitHub Pages needs a public repository, so everything in it is readable. Cloudflare Pages can publish from a private repository for free.

## 13. Open questions / to verify

- AIC asks for a contact in its `AIC-User-Agent` header: decide what to put there.
- Not yet verified: the Met's own image policy page (blocked automated reading); exact public-domain count at the Met (from the CSV); Tokyo Metropolitan Library and Edo-Tokyo Museum licence pages; Yale's Japanese print count.
- Categories, closeness values and marker dates in TAXONOMY.md are draft 1 — confirm, then refine after the tagging pilot.
- Tagging cost and quality — decide after the ~100-print pilot.
- Whether to also store a "printed border" crop rectangle alongside the sheet-edge one.
- Exact aspect-ratio cut-offs for "extreme formats".
- Surround: more textures later? (Currently washi or print colour.)
- Whether free-account WidgetKit on iPhone supports what we need (App Groups) — relevant only for phase 4.

## 14. Out of scope for now

- **Non-Japanese weather art** (public domain / CC0) as a future extension. Many of the same sources (Met, AIC, Rijksmuseum, Cleveland, Yale, National Gallery of Art) hold it under the same licences. Candidates:
  - Dutch Golden Age winter landscapes and seascapes (e.g. Avercamp's skating scenes, storm seascapes),
  - Romantic and Impressionist weather and light (Constable's cloud studies, Friedrich's fog, Monet's series painted at different times of day and seasons, Whistler's nocturnes),
  - Chinese landscape painting (mist, snow, rain),
  - Japonisme prints influenced by ukiyo-e (a natural bridge between the two).
  - The same pipeline and taxonomy would apply; the prompt notes on conventions would need per-tradition additions. Mixing styles changes the app's character, so the art tradition would be a user setting ("ukiyo-e only" / "all").
  - Excluded on licence grounds: e.g. Tate (CC BY-NC-ND).
- Extreme formats (pillar prints, triptychs).
- Self-hosting images.
- Publishing the app or code anywhere (GitHub, web hosting) — planned for later, see §12.
- Deskewing rotated scans (index field reserved).
- User accounts, syncing settings across devices.
- Commercial use or App Store distribution.
