# Tagging brief (round 5 — taxonomy draft 3)

You are tagging Japanese woodblock prints for a weather app that picks the print best matching the current weather, time of day, season and place. Read `../TAXONOMY.md` (draft 3) first — categories, genres, marker IDs, judgement rules, conventions — and follow it exactly.

## Input
- `data/sample_r5.json` — 104 new records (title, alt title, artist, date, series, genre hint, dimensions, notes). A few titles are Dutch (Rijksmuseum); translate mentally. Metadata can be wrong — trust the image and your knowledge where they clearly disagree, and say so in `evidence`.
- `images/<id>.jpg` — the print scan, ~800 px wide. **Look at every image** (Read tool); never tag from metadata alone.
- This round adds famous series (Hiroshige's Kisokaidō, *Famous Places in the Sixty-odd Provinces*, *One Hundred Famous Views of Edo*; Hokusai's Fuji views; Hasui; Yoshida, including his mountain and travel prints abroad) and edge cases: places far from Edo (Tōhoku, Chūgoku, Shikoku, Kyūshū, Sado, Oki — give their coordinates), seasonal flowers (wisteria, plum, iris, peony, azalea) and dawn scenes, and kachō-e (birds and flowers, genre `flora_fauna`; their weather and moon still count). Peonies have no marker in draft 3: set the season from the flower by convention (early summer) with low confidence.
- Many prints are 20th-century shin-hanga (Kawase Hasui, Yoshida Hiroshi, Ohara Shōson): skies, light and weather are drawn realistically, so the ukiyo-e conventions about decorative bands apply less; tag what you see.
- `crop_shape` is only `rect` or `fan`. A picture set in a circle (surimono) gets `rect` around the printed sheet; mention the circle in `taxonomy_friction`.
- Use taxonomy **draft 3** exactly as in the round-3 brief below, so these tags stay comparable with the 166 already tagged; do not apply the draft-4 candidates from PILOT_FINDINGS.md.

## Output: one JSON object per print

```json
{
  "id": "mia-60810",
  "genre": "landscape",
  "include": true,
  "exclude_reason": null,
  "era": "edo",
  "edition": "original",
  "fragment": "none",
  "weather": {"rain": 0.7, "storm": 0.3},
  "weather_null_reason": null,
  "wind": 0.6,
  "snow_ground": 0.0,
  "time_of_day": {"day": 0.8, "dusk": 0.2},
  "time_null_reason": null,
  "time_source": "image",
  "moon": false,
  "season": {"summer": 0.6, "autumn": 0.4},
  "season_null_reason": null,
  "season_source": "image | series_section | convention | none",
  "seasonal_markers": [],
  "environment": {
    "settlement": {"town": 0.7, "rural": 0.3},
    "water": {"none": 1.0},
    "terrain": {"hilly": 1.0},
    "flags": ["forest"]
  },
  "environment_null_reason": null,
  "place": {"name": "Shōno (Tōkaidō station)", "lat": 34.88, "lon": 136.53, "precision_km": 3},
  "fuji": false,
  "crop": [0.02, 0.03, 0.96, 0.94],
  "crop_shape": "rect",
  "crop_note": "thin museum border; sheet edge clear",
  "fading": false,
  "palette": ["#d9d2c0", "#3d4a5c", "#7a7d6e"],
  "confidence": {"weather": 0.9, "time_of_day": 0.6, "season": 0.4, "environment": 0.8},
  "evidence": "Title 'Driving Rain'; slanted rain lines, figures running, trees bent. Season from series convention only.",
  "taxonomy_friction": "none"
}
```

Rules:
- **Category names exactly as in TAXONOMY.md draft 3.** Genre: landscape, figures_in_landscape, flora_fauna, still_life, animal_portrait, figure, other. Weather: clear, cloudy, mist, drizzle, rain, storm, snowfall (lying snow → `snow_ground`). Time: dawn, day, dusk, night. Season: spring, summer, autumn, winter. Settlement: city, town, rural, wild. Water: none, river, lake, sea, wetland. Terrain: flat, hilly, mountain. Flags: onsen, temple_shrine, castle, garden_park, forest, waterfall, bridge. **Markers only from the fixed ID table** in TAXONOMY.md §5 (note: one `wild_geese` marker; new `rice_planting`; `lotus` includes leaves).
- **Season (draft 3):** besides plants, festivals, activities and clothing, a series' own **season section** counts (e.g. *One Hundred Famous Views of Edo*), and **weak cultural conventions** count with low confidence (a moon alone → autumn ≈ 0.6). Record what decided it in `season_source`. Use `null` + `no_cue` only when there is truly nothing.
- **Weather judgement rules (draft 3):** implied snowfall may get a share; split-level weather → tag the defining event; outdoor scenes without visible sky → evident weather with low confidence; dark skies in rain *or snow* mean gloom, not night.
- **Vectors:** only non-zero categories, values in steps of 0.1, each vector sums to 1.0.
- **Missing values:** `null` plus the matching `*_null_reason` (`not_applicable` or `no_cue`). Environment groups may be `null` individually. `wind`, `snow_ground`, confidence entries may be `null`; `time_source` is `null` when time is `null`.
- `include`: true only for landscape, figures_in_landscape and flora_fauna; false for still_life, animal_portrait, figure, other, extreme formats (judged on the cropped sheet), reproductions, studies/sketches, and prints with every scored dimension null. Give `exclude_reason`. Still fill in what you can for excluded prints.
- `era` describes the object: edo (to 1868), meiji (1868–1912), shin_hanga (c. 1915–1960 movement), modern. `fragment` may be `book_cover`.
- `place`: real, locatable viewpoint (TAXONOMY §6); province-only → `null`.
- `crop`: sheet edge as fractions `[x, y, width, height]`, excluding backdrops, colour checkers, mounts.
- `evidence`: one or two sentences — the cues behind weather, time and season.
- `taxonomy_friction`: candid notes on anything that still doesn't fit draft 3; `"none"` if nothing.
