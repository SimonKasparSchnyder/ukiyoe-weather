# web/

The local web app (work in progress).

| Path | What |
|---|---|
| `index.html`, `app.js`, `app.css` | **The app**: live weather for your location (or a set place), the best-matching print, forecast panel, settings. |
| `tuning.html`, `tuning.js` | **Matching Tuner**: scenarios, condition controls, weight sliders, ranked results with score breakdown. |
| `config/layout.json` | Layout numbers: margins, mode thresholds, panel sizes, animation timings. |
| `config/*.json` (others) | All matching numbers: weights, closeness tables, season bumps and markers, weather-code mapping, selection. Defined in [../TAXONOMY.md](../TAXONOMY.md). |
| `lib/scoring.js` | Matching engine: similarity per dimension, season curves, ranking, weighted random pick. |
| `lib/weather.js` | Weather from Open-Meteo, with MET Norway as automatic fallback; mapping to the taxonomy. |
| `lib/sky.js` | Sun elevation, morning/evening, moon altitude and phase. |
| `lib/environment.js` | Surroundings from OpenStreetMap (Overpass) and relief from elevation data; cached per ~1 km; place search and names. |
| `lib/storage.js` | Browser storage that falls back to memory when blocked. |
| `data/index.json` | Print index. Currently the 66 included pilot prints, exported by `pilot/scripts/export_index.py`. |
| `fonts/` | Source Serif 4 (SIL Open Font License, see `fonts/OFL.txt`). |

## Run

From the project folder:

```bash
python3 serve.py
```

(`serve.py` is Python's built-in web server with caching switched off, so code changes appear on a normal reload. `python3 -m http.server 8766` also works, but the browser may keep old copies of the scripts.)

Then open:
- the app: <http://localhost:8766/web/>
- the tuner: <http://localhost:8766/web/tuning.html>

**Developer mode** is off by default, so the app looks exactly as it will for friends. Add `?dev` to the address once to switch it on (this browser remembers), `?dev=0` to switch it off. It shows "Why this print", the "Another print" button, technical status notes and links to the tuner and icon page in Settings. `?debug` additionally shows sun, moon and cloud values, for one visit.

## How the app works

1. **Location:** the browser's location (it asks once), or a place set in Settings. Falls back to Tokyo if neither is available.
2. **Weather:** Open-Meteo (current, hourly, 7 days). If it doesn't answer within 10 s, MET Norway is used instead (no snow depth there).
3. **Sky:** sun elevation decides dawn/day/dusk/night; the moon counts as visible when it is up, more than a thin crescent, the sky is at most half cloudy and it is dark.
4. **Surroundings:** one OpenStreetMap query per place (river, coast, buildings, farmland, onsen, temples, castle, park, forest, waterfall, bridge) plus relief from 9 elevation points. The first lookup can take a while when the Overpass servers are busy; the app shows the weather and a print meanwhile and re-ranks when the surroundings arrive.
5. **Choice:** all prints are scored; the current print stays as long as it is still among the top 5; otherwise a weighted random pick from the top 5, avoiding the last 5 designs shown. "Another print" forces a new pick.
6. **Refresh:** every 20 minutes while the page is visible.

## Privacy

Coordinates go only to the weather services (Open-Meteo, MET Norway), OpenStreetMap (Overpass for surroundings, Nominatim for the place name) and Open-Meteo's elevation and place-search services. Settings and caches stay in this browser.

## Known limits

- **Phone over Wi-Fi:** the page opens from another device at `http://<this Mac's address>:8766/web/`, but browsers block location on plain `http` from another device — set a place in Settings there.
- **Image sharpness:** Minneapolis only offers 800 px or a ~17 MB original, so its prints look soft on large screens (local image cache is the planned fix). Rijksmuseum and AIC images load at 1,600–1,700 px.
- **Season** is neutral for about half the pilot prints until they are re-tagged with taxonomy draft 3.
