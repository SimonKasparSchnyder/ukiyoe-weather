// Describe the surroundings of a location (TAXONOMY §6) from OpenStreetMap and elevation data.
// Results are cached per location (~1 km grid), so each place is looked up only once.

import { storage } from "./storage.js";

const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
const ELEVATION = "https://api.open-meteo.com/v1/elevation";
const CACHE_KEY = "ukiyoe-env-cache-v2";
const reliefRetried = new Set();

// Each line is one count, in this order.
const QUERIES = [
  ["buildings", 'way["building"](around:500,{p});'],
  ["commercial", 'way["landuse"~"^(commercial|retail)$"](around:500,{p});'],
  ["farmland", 'way["landuse"~"^(farmland|paddy|orchard|meadow|farmyard)$"](around:500,{p});'],
  ["coast2", 'way["natural"="coastline"](around:2000,{p});'],
  ["coast5", 'way["natural"="coastline"](around:5000,{p});'],
  ["river", 'way["waterway"~"^(river|canal)$"](around:300,{p});'],
  ["lake", 'nwr["natural"="water"]["water"~"^(lake|pond|reservoir|lagoon)$"](around:500,{p});'],
  ["wetland", 'nwr["natural"="wetland"](around:300,{p});'],
  ["onsen", 'nwr["natural"="hot_spring"](around:1000,{p});nwr["amenity"="public_bath"]["bath:type"="onsen"](around:1000,{p});'],
  ["worship_jp", 'nwr["amenity"="place_of_worship"]["religion"~"^(buddhist|shinto)$"](around:300,{p});'],
  ["worship", 'nwr["amenity"="place_of_worship"](around:300,{p});'],
  ["castle", 'nwr["historic"="castle"](around:1000,{p});'],
  ["garden_park", 'nwr["leisure"~"^(park|garden)$"](around:200,{p});'],
  ["forest", 'nwr["landuse"="forest"](around:300,{p});nwr["natural"="wood"](around:300,{p});'],
  ["waterfall", 'nwr["waterway"="waterfall"](around:1000,{p});'],
  ["bridge", 'way["bridge"="yes"](around:100,{p});'],
];

function overpassQuery(lat, lon) {
  const p = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  const body = QUERIES.map(([, q]) => `(${q.replaceAll("{p}", p)});out count;`).join("\n");
  return `[out:json][timeout:25];\n${body}`;
}

async function fetchCounts(lat, lon) {
  let lastError;
  for (const [i, url] of OVERPASS.entries()) {
    if (i > 0) await new Promise((r) => setTimeout(r, 1500));
    const c = new AbortController();
    const timer = setTimeout(() => c.abort(), 30000);
    try {
      const res = await fetch(url, { method: "POST", body: new URLSearchParams({ data: overpassQuery(lat, lon) }), signal: c.signal });
      if (!res.ok) throw new Error(`Overpass ${res.status}`);
      const json = await res.json();
      const counts = {};
      json.elements.filter((e) => e.type === "count").forEach((e, k) => { counts[QUERIES[k][0]] = Number(e.tags.total); });
      return counts;
    } catch (e) {
      lastError = e;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function fetchRelief(lat, lon) {
  const pts = [[0, 0]];
  const dLat = 2 / 111, dLon = 2 / (111 * Math.cos((lat * Math.PI) / 180));
  for (let k = 0; k < 8; k++) {
    const a = (k * Math.PI) / 4;
    pts.push([Math.sin(a) * dLat, Math.cos(a) * dLon]);
  }
  const q = new URLSearchParams({
    latitude: pts.map(([y]) => (lat + y).toFixed(4)).join(","),
    longitude: pts.map(([, x]) => (lon + x).toFixed(4)).join(","),
  });
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), 10000);
  let res;
  try { res = await fetch(`${ELEVATION}?${q}`, { signal: c.signal }); } finally { clearTimeout(timer); }
  if (!res.ok) throw new Error(`Elevation ${res.status}`);
  const elev = (await res.json()).elevation;
  return { elevation: elev[0], relief: Math.max(...elev) - Math.min(...elev) };
}

const clamp01 = (x) => Math.min(1, Math.max(0, x));
function normalise(v) {
  const s = Object.values(v).reduce((a, b) => a + b, 0);
  const out = {};
  for (const [k, x] of Object.entries(v)) if (x > 0) out[k] = Math.round((x / s) * 100) / 100;
  return out;
}

/** Turn raw counts and relief into taxonomy vectors and flags. */
export function classify(counts, terrain) {
  const b = counts.buildings ?? 0;
  const settlement = normalise({
    city: clamp01((b - 300) / 500) + (counts.commercial > 0 && b > 200 ? 0.3 : 0),
    town: b < 60 ? 0 : b < 300 ? clamp01((b - 60) / 240) : clamp01(1 - (b - 500) / 600),
    rural: counts.farmland > 0 ? clamp01(1 - b / 500) : 0,
    wild: clamp01(1 - b / 60) * (counts.farmland > 0 ? 0.4 : 1),
  });

  const sea = counts.coast2 > 0 ? 1 : counts.coast5 > 0 ? 0.5 : 0;
  const river = counts.river > 0 ? 1 : 0;
  const lake = counts.lake > 0 ? 1 : 0;
  const wetland = counts.wetland > 0 ? 0.7 : 0;
  const water = normalise(sea + river + lake + wetland > 0 ? { sea, river, lake, wetland } : { none: 1 });

  const r = terrain?.relief ?? 0;
  const highUp = (terrain?.elevation ?? 0) > 800 ? 0.5 : 0;
  const terrainVec = terrain ? normalise({
    flat: clamp01(1 - (r - 30) / 60),
    hilly: r < 30 ? 0 : r < 150 ? clamp01((r - 30) / 60) : clamp01(1 - (r - 250) / 200),
    mountain: clamp01((r - 200) / 200) + highUp,
  }) : null;

  const flags = [];
  if (counts.onsen > 0) flags.push("onsen");
  if (counts.worship_jp > 0 || counts.worship > 0) flags.push("temple_shrine");
  if (counts.castle > 0) flags.push("castle");
  if (counts.garden_park > 0) flags.push("garden_park");
  if (counts.forest > 0) flags.push("forest");
  if (counts.waterfall > 0) flags.push("waterfall");
  if (counts.bridge > 0) flags.push("bridge");

  return { settlement, water, terrain: terrainVec, flags };
}

/** Cached environment for a location, or null. */
export function cachedEnvironment(lat, lon) {
  return storage.getJSON(CACHE_KEY, {})[`${lat.toFixed(2)},${lon.toFixed(2)}`] || null;
}

/** Environment for a location: cached, or looked up and classified. Never throws. */
export async function getEnvironment(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  const cache = storage.getJSON(CACHE_KEY, {});
  if (cache[key]) {
    const hit = cache[key];
    // the elevation service may have been down when this place was first looked up
    if (!hit.terrain && hit.raw && !reliefRetried.has(key)) {
      reliefRetried.add(key);
      try {
        const relief = await fetchRelief(lat, lon);
        hit.terrain = classify(hit.raw, relief).terrain;
        Object.assign(hit.raw, relief);
        cache[key] = hit;
        storage.setJSON(CACHE_KEY, cache);
      } catch { /* keep matching without terrain */ }
    }
    return { ...hit, cached: true };
  }
  const [counts, terrain] = await Promise.allSettled([fetchCounts(lat, lon), fetchRelief(lat, lon)]);
  if (counts.status !== "fulfilled") {
    return { settlement: null, water: null, terrain: terrain.value ? classify({}, terrain.value).terrain : null,
             flags: [], error: String(counts.reason?.message || counts.reason) };
  }
  const env = classify(counts.value, terrain.status === "fulfilled" ? terrain.value : null);
  env.raw = { ...counts.value, ...(terrain.value || {}) };
  cache[key] = env;
  storage.setJSON(CACHE_KEY, cache);
  return env;
}

/** Place search by name (Open-Meteo geocoding). */
const GEOCODING = "https://geocoding-api.open-meteo.com/v1/search";

export async function searchPlaces(name, signal) {
  const q = new URLSearchParams({ name, count: "6", language: "en", format: "json" });
  const res = await fetch(`${GEOCODING}?${q}`, { signal });
  if (!res.ok) return [];
  return ((await res.json()).results || []).map((r) => ({
    name: r.name, region: [r.admin1, r.country].filter(Boolean).join(", "), lat: r.latitude, lon: r.longitude, timezone: r.timezone,
  }));
}

/**
 * Open the connection to the place search ahead of typing. Its server can take ~6 s to set up an encrypted
 * connection (measured from Japan; later requests on the same connection take ~0.3 s), so a throwaway search
 * when the settings open means the first real search doesn't wait. At most once a minute.
 */
let warmedAt = 0;
export function warmPlaceSearch() {
  if (Date.now() - warmedAt < 60_000) return;
  warmedAt = Date.now();
  fetch(`${GEOCODING}?name=Tokyo&count=1&format=json`).catch(() => { warmedAt = 0; });
}

/** Short name for coordinates (OpenStreetMap Nominatim), cached. */
export async function placeName(lat, lon) {
  const key = `ukiyoe-placename-${lat.toFixed(2)},${lon.toFixed(2)}`;
  const hit = storage.get(key);
  if (hit) return hit;
  try {
    const q = new URLSearchParams({ lat: lat.toFixed(4), lon: lon.toFixed(4), format: "jsonv2", zoom: "14", "accept-language": "en" });
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?${q}`);
    const a = (await res.json()).address || {};
    const name = [a.suburb || a.neighbourhood || a.village || a.town || a.city_district, a.city || a.town || a.county || a.state]
      .filter(Boolean).filter((v, i, arr) => arr.indexOf(v) === i).join(", ");
    if (name) storage.set(key, name);
    return name || `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  } catch {
    return `${lat.toFixed(2)}, ${lon.toFixed(2)}`;
  }
}
