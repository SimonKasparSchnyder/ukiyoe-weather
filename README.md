# Ukiyo-e Weather

A weather app that shows the forecast for your location together with the Japanese woodblock print (ukiyo-e) that best matches the moment: the weather, the time of day, the season and the kind of place you're in. Snow falling at dusk in a river town? Hiroshige has a print for that.

The prints are public-domain scans, loaded from museum collections. Weather comes from Open-Meteo (with MET Norway as fallback), surroundings from OpenStreetMap. No account, no tracking; settings stay in your browser.

## Run it locally

```bash
python3 serve.py
```

Then open <http://localhost:8766/web/>. Add `?dev` to the address for developer mode (score details, the Matching Tuner, the icon page); `?dev=0` switches it off again.

## How it works

- **Prints:** each print is tagged once, offline, with weather, time of day, season and environment (see [TAXONOMY.md](TAXONOMY.md)). The current index has 352 prints, chosen in five rounds from public-domain collections (Minneapolis Institute of Art, Rijksmuseum, Art Institute of Chicago).
- **Matching:** the app scores every print against the current conditions with adjustable weights (`web/config/`), and picks among the best matches.
- **Publishing:** `publish.py` builds `site/` from the public parts of `web/`; a GitHub Actions workflow publishes it to GitHub Pages on every push to `main`.

## Project layout

| Path | What |
|---|---|
| `web/` | The app (see [web/README.md](web/README.md)) |
| `pilot/` | The tagging pilot: sample, images, tags, review pages, findings |
| `PLAN.md` | Project plan and decisions |
| `TAXONOMY.md` | Tag categories, closeness tables, season markers, data mappings |
| `serve.py` | Local web server without caching |
| `publish.py` | Builds the public site into `site/` |

## Licence

Code: MIT (see [LICENSE](LICENSE)). Prints, font and data are covered by their own terms — see the Credits in the app.
