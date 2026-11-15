# Tagging brief (pilot, round 2 — taxonomy draft 2)

You are tagging Japanese woodblock prints for a weather app that picks the print best matching the current weather, time of day, season and place. Read `../TAXONOMY.md` (draft 2) first — categories, genres, marker IDs, conventions — and follow it exactly.

## Input
- `data/sample.json` — list of 100 records (title, alt title, artist, date, series, genre hint, dimensions, subjects, notes). Some titles are Dutch (Rijksmuseum); translate mentally. Metadata can be wrong — trust the image and your knowledge where they clearly disagree, and say so in `evidence`.
- `images/<id>.jpg` — the print scan, ~800 px wide. **Look at every image** (Read tool); never tag from metadata alone.

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
  "season": null,
  "season_null_reason": "no_cue",
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
  "confidence": {"weather": 0.9, "time_of_day": 0.6, "season": null, "environment": 0.8},
  "evidence": "Title 'Driving Rain'; slanted rain lines, figures running, trees bent. No seasonal sign.",
  "taxonomy_friction": "none"
}
```

Rules:
- **Category names exactly as in TAXONOMY.md draft 2.** Genre: landscape, figures_in_landscape, flora_fauna, still_life, animal_portrait, figure, other. Weather: clear, cloudy, mist, drizzle, rain, storm, snowfall (no `snow_cover` any more — use `snow_ground`). Time: dawn, day, dusk, night. Season: spring, summer, autumn, winter. Settlement: city, town, rural, wild. Water: none, river, lake, sea, wetland. Terrain: flat, hilly, mountain. Flags: onsen, temple_shrine, castle, garden_park, forest, waterfall, bridge. **Markers only from the fixed ID table** in TAXONOMY.md §5.
- **Vectors:** only non-zero categories, values in steps of 0.1, each vector sums to 1.0.
- **Missing values:** `null` plus the matching `*_null_reason` — `not_applicable` or `no_cue`. Never an even spread for "unknown". `wind`, `snow_ground` and `confidence` entries may be `null` where not applicable (e.g. no outdoor scene).
- `include`: true only for landscape, figures_in_landscape and flora_fauna; false for still_life, animal_portrait, figure, other, extreme formats (judged on the cropped sheet), reproductions, and prints with every scored dimension null. Give `exclude_reason`. Still fill in what you can for excluded prints.
- `place`: only for a real, locatable place; coordinates of the **viewpoint** (see TAXONOMY §6), from your own knowledge; province-only → `null`.
- `crop`: best visual estimate of the **sheet edge** as fractions `[x, y, width, height]`, excluding backdrops, colour checkers, mounts. Note anything odd in `crop_note`.
- `palette`: 3 dominant colours as hex, by eye.
- `evidence`: one or two sentences — which cues drove weather, time and season.
- `taxonomy_friction`: candid notes on anything that still doesn't fit draft 2; `"none"` if nothing.
