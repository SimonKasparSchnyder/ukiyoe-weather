// Current weather and forecast from Open-Meteo (free, no key), mapped to the taxonomy.

import { sunElevation } from "./sky.js";

const FORECAST = "https://api.open-meteo.com/v1/forecast";
const METNO = "https://api.met.no/weatherapi/locationforecast/2.0/complete";

function withTimeout(ms) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), ms);
  return { signal: c.signal, done: () => clearTimeout(t) };
}

/**
 * Weather for a place, as fast as possible: ask Open-Meteo and MET Norway at the same time and return whichever
 * answers first. If MET Norway wins, Open-Meteo's richer data (snow depth, visibility, rain probability) is handed
 * to `onUpgrade` when it arrives. Both return Open-Meteo's shape.
 */
export function fetchWeatherRace(lat, lon, timeZone, onUpgrade) {
  // Open-Meteo no longer holds up the first view, so it may take its time (it often needs 6 s or more here)
  const om = fetchOpenMeteo(lat, lon, 30000).then((d) => Object.assign(d, { provider: "Open-Meteo" }));
  const mn = fetchMetNo(lat, lon, timeZone).then((d) => Object.assign(d, { provider: "MET Norway" }));
  return new Promise((resolve, reject) => {
    let done = false, failures = 0;
    const fail = (e) => { if (++failures === 2 && !done) reject(e); };
    om.then((d) => {
      if (!done) { done = true; resolve(d); } else if (onUpgrade) onUpgrade(d);
    }, fail);
    mn.then((d) => {
      if (!done) { done = true; d.providerNote = "answered first; Open-Meteo still loading"; resolve(d); }
    }, fail);
  });
}

/** Weather for a place: Open-Meteo first, MET Norway as fallback. Both return Open-Meteo's shape. */
export async function fetchWeather(lat, lon, timeZone) {
  try {
    const data = await fetchOpenMeteo(lat, lon);
    data.provider = "Open-Meteo";
    return data;
  } catch (e) {
    const data = await fetchMetNo(lat, lon, timeZone);
    data.provider = "MET Norway";
    data.providerNote = `Open-Meteo unavailable (${e.name === "AbortError" ? "timeout" : e.message})`;
    return data;
  }
}

async function fetchOpenMeteo(lat, lon, timeoutMs = 10000) {
  const params = new URLSearchParams({
    latitude: lat.toFixed(4),
    longitude: lon.toFixed(4),
    current: "temperature_2m,apparent_temperature,weather_code,cloud_cover,wind_speed_10m,wind_gusts_10m,precipitation,is_day",
    hourly: "temperature_2m,weather_code,precipitation_probability,visibility,snow_depth",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset",
    timezone: "auto",
    forecast_days: "4",
  });
  const t = withTimeout(timeoutMs);
  try {
    const res = await fetch(`${FORECAST}?${params}`, { signal: t.signal });
    if (!res.ok) throw new Error(`Open-Meteo ${res.status}`);
    return await res.json();
  } finally { t.done(); }
}

// ---------------------------------------------------------------- MET Norway fallback

const METNO_TO_WMO = {
  clearsky: 0, fair: 1, partlycloudy: 2, cloudy: 3, fog: 45,
  lightrain: 61, rain: 63, heavyrain: 65,
  lightrainshowers: 80, rainshowers: 81, heavyrainshowers: 82,
  lightsleet: 66, sleet: 66, heavysleet: 67, lightsleetshowers: 66, sleetshowers: 66, heavysleetshowers: 67,
  lightsnow: 71, snow: 73, heavysnow: 75, lightsnowshowers: 85, snowshowers: 85, heavysnowshowers: 86,
};

function symbolToWmo(sym) {
  if (!sym) return null;
  const base = sym.replace(/_(day|night|polartwilight)$/, "");
  if (base.includes("thunder")) return 95;
  return METNO_TO_WMO[base] ?? 3;
}

/** "YYYY-MM-DDTHH:MM" in the place's time zone. */
function localStamp(date, timeZone) {
  const f = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
  const p = Object.fromEntries(f.formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}

function sunCrossings(lat, lon, timeZone, localDate) {
  // scan 36 h around the local date in 5-minute steps for the -0.833° crossings
  const start = Date.parse(localDate + "T00:00:00Z") - 14 * 3600000;
  let rise = "", set = "";
  let prev = sunElevation(new Date(start), lat, lon);
  for (let t = start + 300000; t < start + 52 * 3600000; t += 300000) {
    const e = sunElevation(new Date(t), lat, lon);
    const stamp = localStamp(new Date(t), timeZone);
    if (stamp.startsWith(localDate)) {
      if (prev < -0.833 && e >= -0.833 && !rise) rise = stamp;
      if (prev >= -0.833 && e < -0.833 && !set) set = stamp;
    }
    prev = e;
  }
  return { rise, set };
}

async function fetchMetNo(lat, lon, timeZone) {
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;
  const t = withTimeout(15000);
  let json;
  try {
    const res = await fetch(`${METNO}?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}`, { signal: t.signal });
    if (!res.ok) throw new Error(`MET Norway ${res.status}`);
    json = await res.json();
  } finally { t.done(); }
  const ts = json.properties.timeseries;
  const sym = (e) => e.data.next_1_hours?.summary?.symbol_code ?? e.data.next_6_hours?.summary?.symbol_code;
  const now = ts[0], d0 = now.data.instant.details;
  const nowDate = new Date();

  const hourly = { time: [], temperature_2m: [], weather_code: [], precipitation_probability: [], visibility: [], snow_depth: [] };
  for (const e of ts) {
    const d = e.data.instant.details;
    hourly.time.push(localStamp(new Date(e.time), tz).slice(0, 13) + ":00");
    hourly.temperature_2m.push(d.air_temperature);
    hourly.weather_code.push(symbolToWmo(sym(e)));
    hourly.precipitation_probability.push(e.data.next_1_hours?.details?.probability_of_precipitation ?? null);
    hourly.visibility.push((d.fog_area_fraction ?? 0) > 30 ? 800 : 10000);
    hourly.snow_depth.push(0); // not provided by MET Norway
  }

  const days = new Map();
  for (const e of ts) {
    const stamp = localStamp(new Date(e.time), tz);
    const day = stamp.slice(0, 10);
    if (!days.has(day)) days.set(day, { temps: [], symbols: [] });
    const g = days.get(day);
    g.temps.push(e.data.instant.details.air_temperature);
    const s6 = e.data.next_6_hours;
    if (s6?.details?.air_temperature_max != null) g.temps.push(s6.details.air_temperature_max, s6.details.air_temperature_min);
    const hour = +stamp.slice(11, 13);
    g.symbols.push({ dist: Math.abs(hour - 12), code: symbolToWmo(sym(e)) });
  }
  const daily = { time: [], weather_code: [], temperature_2m_max: [], temperature_2m_min: [],
    precipitation_probability_max: [], sunrise: [], sunset: [] };
  for (const [day, g] of [...days.entries()].slice(0, 4)) {
    daily.time.push(day);
    daily.temperature_2m_max.push(Math.max(...g.temps));
    daily.temperature_2m_min.push(Math.min(...g.temps));
    daily.weather_code.push(g.symbols.filter((x) => x.code != null).sort((a, b) => a.dist - b.dist)[0]?.code ?? 3);
    daily.precipitation_probability_max.push(null);
    const sun = daily.time.length === 1 ? sunCrossings(lat, lon, tz, day) : { rise: "", set: "" };
    daily.sunrise.push(sun.rise);
    daily.sunset.push(sun.set);
  }

  return {
    timezone: tz,
    current: {
      time: localStamp(nowDate, tz),
      temperature_2m: d0.air_temperature,
      apparent_temperature: d0.apparent_air_temperature ?? d0.air_temperature,
      weather_code: symbolToWmo(sym(now)),
      cloud_cover: d0.cloud_area_fraction,
      wind_speed_10m: (d0.wind_speed ?? 0) * 3.6,
      wind_gusts_10m: d0.wind_speed_of_gust != null ? d0.wind_speed_of_gust * 3.6 : null,
      is_day: sunElevation(nowDate, lat, lon) > 0 ? 1 : 0,
    },
    hourly, daily,
  };
}

/** Index of the hourly entry for the current local hour. */
export function currentHourIndex(data) {
  const hour = data.current.time.slice(0, 13); // "YYYY-MM-DDTHH"
  const i = data.hourly.time.findIndex((t) => t.startsWith(hour));
  return i < 0 ? 0 : i;
}

function ramp(x, zero, full) {
  return Math.min(1, Math.max(0, (x - zero) / (full - zero)));
}

function blend(vec, key, share) {
  const out = {};
  for (const [k, v] of Object.entries(vec)) out[k] = v * (1 - share);
  out[key] = (out[key] || 0) + share;
  return out;
}

/** Weather vector, wind and snow-on-ground from an Open-Meteo response (TAXONOMY §3). */
export function mapWeather(data, weatherCfg) {
  const a = weatherCfg.adjustments;
  const c = data.current;
  const h = currentHourIndex(data);
  let vec = { ...(weatherCfg.wmo[String(c.weather_code)] || { cloudy: 1 }) };

  const visibility = data.hourly.visibility?.[h];
  if (visibility != null && !vec.mist) {
    if (visibility < a.visibility_fog_m) vec = blend(vec, "mist", a.visibility_fog_mist_share);
    else if (visibility < a.visibility_haze_m) vec = blend(vec, "mist", a.visibility_haze_mist_share);
  }
  const gusts = c.wind_gusts_10m ?? 0;
  const precipitating = Object.keys(vec).some((k) => ["drizzle", "rain", "storm", "snowfall"].includes(k));
  if (gusts >= a.gale_gust_kmh && !precipitating) vec = blend(vec, "storm", a.gale_storm_share);

  const wind = ramp(Math.max(c.wind_speed_10m ?? 0, (gusts || 0) * 0.7), a.wind_zero_kmh, a.wind_full_kmh);
  const snowDepth = data.hourly.snow_depth?.[h] ?? 0;
  const snow_ground = ramp(snowDepth, 0, a.snow_depth_full_m);
  return { weather: vec, wind, snow_ground, cloud_cover: c.cloud_cover ?? 0 };
}

// Short descriptions and symbols for display.
const WMO_TEXT = {
  0: ["Clear", "☀︎"], 1: ["Mainly clear", "☀︎"], 2: ["Partly cloudy", "⛅︎"], 3: ["Overcast", "☁︎"],
  45: ["Fog", "≋"], 48: ["Rime fog", "≋"],
  51: ["Light drizzle", "☂︎"], 53: ["Drizzle", "☂︎"], 55: ["Dense drizzle", "☂︎"],
  56: ["Freezing drizzle", "☂︎"], 57: ["Freezing drizzle", "☂︎"],
  61: ["Light rain", "☂︎"], 63: ["Rain", "☂︎"], 65: ["Heavy rain", "☔︎"],
  66: ["Freezing rain", "☂︎"], 67: ["Freezing rain", "☔︎"],
  71: ["Light snow", "❄︎"], 73: ["Snow", "❄︎"], 75: ["Heavy snow", "❄︎"], 77: ["Snow grains", "❄︎"],
  80: ["Showers", "☂︎"], 81: ["Showers", "☂︎"], 82: ["Violent showers", "☔︎"],
  85: ["Snow showers", "❄︎"], 86: ["Snow showers", "❄︎"],
  95: ["Thunderstorm", "⚡︎"], 96: ["Thunderstorm, hail", "⚡︎"], 99: ["Thunderstorm, hail", "⚡︎"],
};

export function describe(code) {
  return WMO_TEXT[code] || ["—", "·"];
}
