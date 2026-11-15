// Matching engine: scores prints from the index against current conditions.
// All numbers come from web/config/*.json; see TAXONOMY.md for the rules.

export async function loadConfig(base = "config/") {
  const names = ["weights", "weather", "time", "season", "environment", "proximity", "selection", "layout"];
  const entries = await Promise.all(
    names.map(async (n) => [n, await (await fetch(`${base}${n}.json`)).json()])
  );
  return Object.fromEntries(entries);
}

// ---------------------------------------------------------------- helpers

const DAYS = 365;

/** Σ current_i · print_j · closeness(i, j); both vectors sum to 1. */
export function vectorSimilarity(current, print, closeness) {
  let s = 0;
  for (const [i, ci] of Object.entries(current)) {
    for (const [j, pj] of Object.entries(print)) {
      s += ci * pj * (closeness[i]?.[j] ?? 0);
    }
  }
  return s;
}

function circularDayDistance(a, b) {
  const d = Math.abs(a - b) % DAYS;
  return Math.min(d, DAYS - d);
}

/** Bell curve with value 0.5 at `halfWidth` days from the peak. */
function bump(doy, peak, halfWidth) {
  const d = circularDayDistance(doy, peak);
  return Math.exp(-Math.LN2 * (d / halfWidth) ** 2);
}

/**
 * The print's season curve, evaluated at one day of the year.
 * Season vector entries scale broad bumps; each marker adds a narrow bump.
 * The curve is normalised so its peak over the year is 1.
 * Returns null when the print has neither a season vector nor markers.
 */
export function seasonCurve(tags, seasonCfg) {
  const parts = [];
  for (const [s, w] of Object.entries(tags.season || {})) {
    const b = seasonCfg.seasons[s];
    if (b && w > 0) parts.push({ peak: b.peak_doy, hw: b.half_width, w });
  }
  for (let m of tags.seasonal_markers || []) {
    m = seasonCfg.aliases?.[m] ?? m;
    const b = seasonCfg.markers[m];
    if (b) parts.push({ peak: b.peak_doy, hw: b.half_width, w: 1 });
  }
  if (!parts.length) return null;
  const raw = (doy) => Math.max(...parts.map((p) => p.w * bump(doy, p.peak, p.hw)));
  let peak = 0;
  for (let d = 0; d < DAYS; d += 2) peak = Math.max(peak, raw(d));
  return (doy) => raw(doy) / peak;
}

function haversineKm(a, b) {
  const R = 6371, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function croppedAspect(print) {
  const [w, h] = print.pixel_size || [1, 1];
  const c = print.crop || [0, 0, 1, 1];
  return (c[2] * w) / (c[3] * h);
}

// ---------------------------------------------------------------- current conditions

/** Time-of-day vector from sun elevation (degrees) and whether it is morning. */
export function timeVectorFromSun(elevation, isMorning, timeCfg) {
  const { twilight_low: lo, twilight_high: hi, blend } = timeCfg.sun_elevation;
  const ramp = (x, edge) => Math.min(1, Math.max(0, (x - (edge - blend)) / (2 * blend)));
  const aboveHi = ramp(elevation, hi);   // 0 → 1 across the upper twilight edge
  const aboveLo = ramp(elevation, lo);   // 0 → 1 across the lower twilight edge
  const day = aboveHi;
  const night = 1 - aboveLo;
  const twilight = Math.max(0, 1 - day - night);
  const v = { day, night };
  v[isMorning ? "dawn" : "dusk"] = twilight;
  for (const k of Object.keys(v)) if (v[k] < 1e-3) delete v[k];
  return v;
}

// ---------------------------------------------------------------- scoring

/**
 * Score one print against the current conditions.
 * Returns { total, parts: {name: {s, w, contribution, neutral}} }.
 */
export function scorePrint(print, cur, cfg, weights = cfg.weights) {
  const t = print.tags;
  const N = weights.neutral;
  const parts = {};
  const add = (name, s, isNeutral = false) => {
    const w = weights[name] ?? 0;
    if (s === undefined) return; // term skipped for every print (e.g. no location set)
    parts[name] = { s, w, contribution: w * s, neutral: isNeutral };
  };
  const orNeutral = (value, fn) => (value == null ? [N, true] : [fn(value), false]);

  add("weather", ...orNeutral(t.weather, (v) => vectorSimilarity(cur.weather, v, cfg.weather.closeness)));
  add("wind", ...orNeutral(t.wind, (v) => 1 - Math.abs(cur.wind - v)));
  add("snow_ground", ...orNeutral(t.snow_ground, (v) => 1 - Math.abs(cur.snow_ground - v)));
  add("time_of_day", ...orNeutral(t.time_of_day, (v) => vectorSimilarity(cur.time_of_day, v, cfg.time.closeness)));
  add("moon", t.time_of_day == null ? N : (Boolean(t.moon) === Boolean(cur.moon) ? 1 : 0), t.time_of_day == null);

  // season
  const curve = seasonCurve(t, cfg.season);
  const doy = cur.southern_hemisphere
    ? (cur.day_of_year + cfg.season.southern_hemisphere_shift_days) % DAYS
    : cur.day_of_year;
  add("season", curve ? curve(doy) : N, !curve);

  // environment groups
  const env = t.environment;
  if (env == null) {
    add("environment", N, true);
  } else {
    let sum = 0, wsum = 0;
    for (const [g, gw] of Object.entries(cfg.environment.group_weights)) {
      if (env[g] == null || cur.environment[g] == null) continue;
      sum += gw * vectorSimilarity(cur.environment[g], env[g], cfg.environment.closeness[g]);
      wsum += gw;
    }
    add("environment", wsum ? sum / wsum : N, !wsum);
  }
  // flags: bonus only, and only when the location has any
  const curFlags = cur.environment.flags || [];
  if (curFlags.length) {
    const have = new Set(env?.flags || []);
    add("environment_flags", curFlags.filter((f) => have.has(f)).length / curFlags.length);
  }

  // proximity: only when a location is set
  if (cur.location) {
    const p = t.place;
    add("proximity", p && p.lat != null
      ? Math.exp(-haversineKm(cur.location, p) / cfg.proximity.scale_km) : 0);
  }

  // orientation
  if (cur.window_aspect) {
    const r = Math.abs(Math.log(croppedAspect(print) / cur.window_aspect)) / Math.LN2;
    add("orientation", Math.max(0, 1 - r));
  }

  const total = Object.values(parts).reduce((a, p) => a + p.contribution, 0);
  return { total, parts };
}

export function rankPrints(index, cur, cfg, weights) {
  return index
    .map((print) => ({ print, ...scorePrint(print, cur, cfg, weights) }))
    .sort((a, b) => b.total - a.total);
}

/**
 * Pick among the top k, weighted by score (softmax), preferring designs not shown recently.
 * Variety never reaches below the top k: if every top match was shown recently, repeat one.
 * `mustAvoid` (e.g. the print on screen when "Another print" is pressed) is always skipped if possible.
 */
export function pickPrint(ranked, cfg, recentDesigns = [], rng = Math.random, mustAvoid = null) {
  const { top_k, temperature, max_gap = Infinity } = cfg.selection;
  const key = (r) => r.print.design_id ?? r.print.id;
  const best = ranked[0]?.total ?? 0;
  // candidates: among the top k AND close to the best score, so variety never costs relevance
  let top = ranked.slice(0, top_k).filter((r) => key(r) !== mustAvoid && r.total >= best - max_gap);
  if (!top.length) top = ranked.filter((r) => key(r) !== mustAvoid).slice(0, 1); // "Another print": next best
  const fresh = top.filter((r) => !recentDesigns.includes(key(r)));
  const pool = fresh.length ? fresh : top;
  if (!pool.length) return ranked[0];
  const max = pool[0].total;
  const w = pool.map((r) => Math.exp((r.total - max) / temperature));
  let x = rng() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < pool.length; i++) { x -= w[i]; if (x <= 0) return pool[i]; }
  return pool[pool.length - 1];
}
