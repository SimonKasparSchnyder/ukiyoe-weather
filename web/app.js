import { loadConfig, rankPrints, pickPrint, timeVectorFromSun, croppedAspect } from "./lib/scoring.js";
import { sunElevation, isMorning, moonInfo } from "./lib/sky.js";
import { fetchWeatherRace, mapWeather, describe, currentHourIndex } from "./lib/weather.js";
import { getEnvironment, cachedEnvironment, searchPlaces, placeName } from "./lib/environment.js";
import { storage } from "./lib/storage.js";
import { ICON, weatherIcon } from "./lib/icons.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const REFRESH_MS = 15 * 60 * 1000; // Open-Meteo updates its "current" values every 15 minutes

const CJK = /[々〆぀-ヿ㐀-鿿豈-﫿]+/g;
/** "English (romaji 漢字), also known as …" → "English 漢字". */
function cleanSeries(s) {
  if (!s) return "";
  const m = /^(.*?)\s*\(([^)]*)\)/.exec(s);
  if (!m) return s.split(", also known as")[0].trim();
  const kanji = (m[2].match(CJK) || []).join("");
  return `${m[1].trim()}${kanji ? " " + kanji : ""}`;
}
/** AIC-style titles: drop romaji in parentheses, move ', from the series "…"' into the series. */
function splitTitle(p) {
  let title = p.title || "", series = p.series || "";
  const fs = /,?\s*from the (?:series|untitled series)\s*"?([^"]+)"?\s*$/i.exec(title);
  if (fs) { title = title.slice(0, fs.index); if (!series) series = fs[1]; }
  title = title.replace(/\s*\(([^)]*)\)/g, (all, inner) => ((inner.match(CJK) || []).length ? ` ${(inner.match(CJK) || []).join("")}` : ""));
  return { title: title.trim(), series: cleanSeries(series) };
}
const DEFAULT_PLACE = { name: "Nihonbashi, Tokyo", lat: 35.684, lon: 139.774 };
const K = { settings: "ukiyoe-settings-v1", recent: "ukiyoe-recent-designs-v1", current: "ukiyoe-current-print-v1", last: "ukiyoe-last-view-v1" };
const LAST_VIEW_MAX_AGE = 30 * 60 * 1000; // show the remembered view straight away if it is younger than this
const PARAMS = new URLSearchParams(location.search);
const DEBUG = PARAMS.has("debug");
// Developer mode: off by default everywhere, so the default view is what friends see.
// "?dev" switches it on and this browser remembers; "?dev=0" switches it off. "?debug" adds raw values for one visit.
if (PARAMS.has("dev")) storage.set("ukiyoe-dev", PARAMS.get("dev") === "0" ? "0" : "1");
const DEV = storage.get("ukiyoe-dev") === "1" || DEBUG;
document.body.classList.toggle("dev", DEV);

let cfg, index;
const DEFAULT_SETTINGS = { locmode: "device", place: null, surround: "washi", size: "framed", collapsed: true };
// saved settings on top of the defaults, so a value missing from an older save falls back to its default
let settings = { ...DEFAULT_SETTINGS, ...storage.getJSON(K.settings, {}) };
settings.surround = "washi"; // Japanese paper over the print colour is the only surround
if (!["framed", "fit"].includes(settings.size)) settings.size = DEFAULT_SETTINGS.size;
let state = { place: null, weather: null, env: null, cur: null, ranked: [], chosen: null, lastRefresh: 0 };
if (DEBUG) window.__state = state;

// load timing (shown under "Why this print" with ?debug, and in the console in developer mode)
const T0 = performance.now();
state.timings = [];
function mark(label) {
  const ms = Math.round(performance.now() - T0);
  state.timings.push([label, ms]);
  if (DEV) console.info(`[timing] ${label}: ${ms} ms`);
}

// ---------------------------------------------------------------- location

function deviceLocation() {
  return new Promise((resolve) => {
    if (!navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lon: p.coords.longitude }),
      () => resolve(null),
      { timeout: 10000, maximumAge: 10 * 60 * 1000 },
    );
  });
}

async function resolvePlace() {
  if (settings.locmode === "fixed" && settings.place) return { ...settings.place, fixed: true };
  const loc = await deviceLocation();
  if (loc) return { ...loc, name: null };
  return { ...DEFAULT_PLACE, fallback: true };
}

// ---------------------------------------------------------------- conditions

function buildConditions(place, weatherData, env) {
  const now = new Date();
  const w = mapWeather(weatherData, cfg.weather);
  const elev = sunElevation(now, place.lat, place.lon);
  const time = timeVectorFromSun(elev, isMorning(now, place.lat, place.lon), cfg.time);
  const moon = moonInfo(now, place.lat, place.lon);
  const darkShare = (time.night || 0) + (time.dusk || 0) + (time.dawn || 0) * 0.5;
  const moonVisible = moon.altitude > 0 && moon.fraction > 0.2 && w.cloud_cover <= cfg.time.moon_max_cloud_cover && darkShare >= 0.5;
  const localDate = weatherData.current.time.slice(0, 10);
  const d = new Date(localDate + "T12:00:00");
  const doy = Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000) - 1;
  return {
    weather: w.weather, wind: w.wind, snow_ground: w.snow_ground,
    time_of_day: time, moon: moonVisible, day_of_year: doy, southern_hemisphere: place.lat < 0,
    environment: { settlement: env?.settlement ?? null, water: env?.water ?? null, terrain: env?.terrain ?? null, flags: env?.flags ?? [] },
    location: { lat: place.lat, lon: place.lon },
    window_aspect: window.innerWidth / window.innerHeight,
    _sun: elev, _moon: moon, _cloud: w.cloud_cover,
  };
}

// ---------------------------------------------------------------- choosing a print

function choosePrint(force = false) {
  const recent = storage.getJSON(K.recent, []);
  const currentId = storage.get(K.current);
  const best = state.ranked[0]?.total ?? 0;
  const topK = state.ranked.slice(0, cfg.selection.top_k).filter((r) => r.total >= best - (cfg.selection.max_gap ?? Infinity));
  if (!force && currentId) {
    const keep = topK.find((r) => r.print.id === currentId);
    if (keep) return keep;
  }
  const avoid = force && state.chosen ? state.chosen.print.design_id : null;
  const pick = pickPrint(state.ranked, cfg, recent, Math.random, avoid);
  storage.setJSON(K.recent, [pick.print.design_id, ...recent.filter((d) => d !== pick.print.design_id)]
    .slice(0, cfg.selection.avoid_recent_designs));
  storage.set(K.current, pick.print.id);
  return pick;
}

/** Larger renditions where the museum server allows them (see PLAN.md §7). */
function imageUrl(print) {
  const u = print.image_url || "";
  if (u.includes("iiif.micr.io")) return u.replace("/full/800,/", "/full/1600,/");
  if (u.includes("artic.edu/iiif")) return u.replace("/full/843,/", "/full/1686,/");
  return u;
}

// ---------------------------------------------------------------- palette and theme

function hexToRgb(h) {
  const m = /^#?([0-9a-f]{6})$/i.exec(h || "");
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
const lum = ([r, g, b]) => (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
const mix = (a, b, t) => a.map((x, i) => Math.round(x * (1 - t) + b[i] * t));
const css = ([r, g, b]) => `rgb(${r} ${g} ${b})`;
const PANEL_LIGHT = [248, 244, 234], PANEL_DARK = [35, 32, 27]; // --panel in light and dark mode

/** WCAG contrast ratio between two colours. */
function contrast(a, b) {
  const L = (c) => {
    const [r, g, bl] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  };
  const [hi, lo] = [L(a), L(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Move `col` towards `target` (black or white) until it reads well on `bg`. */
function withContrast(col, bg, target, min = 4.5) {
  for (let t = 0; t <= 1; t += 0.05) {
    const c = mix(col, target, t);
    if (contrast(c, bg) >= min) return c;
  }
  return target;
}

function applyPalette(print) {
  const root = document.documentElement.style;
  const measured = print.colors || {};
  const cols = (print.palette || []).map(hexToRgb).filter(Boolean).sort((a, b) => lum(a) - lum(b));
  const dark = cols[0], light = cols[cols.length - 1];

  // surround: the print's paper colour as measured from the scan, else the tagger's lightest colour toned down
  const paper = hexToRgb(measured.paper) || (light && mix(light, [233, 226, 211], 0.35));
  if (paper) root.setProperty("--plain", css(paper));

  // Two accents: a dark ink of the print for the light panel, a lighter ink for the dark panel (both measured
  // from the scan), each adjusted until it reaches readable contrast (WCAG 4.5 : 1) against its panel colour.
  const inkL = hexToRgb(measured.accent_light) || dark;
  const inkD = hexToRgb(measured.accent_dark) || inkL;
  if (inkL) root.setProperty("--accent-l", css(withContrast(inkL, PANEL_LIGHT, [0, 0, 0])));
  if (inkD) root.setProperty("--accent-d", css(withContrast(inkD, PANEL_DARK, [255, 255, 255])));
}

// ---------------------------------------------------------------- layout

/** Current interface scale: the size of one --u in pixels (1 on desktops, larger on touch screens / Dynamic Type). */
function uiScale() {
  let probe = document.getElementById("u-probe");
  if (!probe) {
    probe = document.createElement("div");
    probe.id = "u-probe";
    probe.style.cssText = "position:absolute;visibility:hidden;pointer-events:none;width:calc(100 * var(--u));height:0";
    document.body.appendChild(probe);
  }
  return probe.offsetWidth / 100 || 1;
}

/**
 * Place the print and the panel. All numbers come from config/layout.json.
 * Modes: "overlay" (panel floats over the print), "side" (panel to the right), "below" (panel under the print).
 */
function layout() {
  const L = cfg?.layout;
  if (!L) return;
  const print = state.chosen?.print;
  const panel = $("panel");
  const vw = window.innerWidth, vh = window.innerHeight;
  // "Fit to window": no margins, the print touches the window edges in one direction, the panel floats over it
  const fitMode = settings.size === "fit";
  const pad = fitMode ? 0 : Math.max(L.pad_min_px, Math.round(Math.min(vw, vh) * L.pad_fraction));
  const inset = fitMode ? L.fit_panel_inset_px : pad; // the panel's distance from the window edge
  const mat = 0; // extra room around the print for a drawn frame (none at the moment)
  const a = print ? croppedAspect(print) : 1.5;
  const collapsed = settings.collapsed;

  const fit = (w, h) => (w / h > a ? { w: h * a, h } : { w, h: w / a });
  const box = { w: vw - 2 * pad - 2 * mat, h: vh - 2 * pad - 2 * mat };
  const shapeMatch = Math.abs(Math.log(a / (box.w / box.h))) < L.shape_tolerance;

  // panel sizes for each mode, scaled with the interface (larger on touch screens, see --ui-scale)
  const scale = uiScale();
  const S = L.side_panel, B = L.below_panel, O = L.overlay_panel;
  const sideW = Math.min(S.max_px * scale, Math.max(S.min_px * scale, vw * S.width_fraction), vw - 2 * pad);
  const belowW = Math.min(B.max_width_px * scale, vw - 2 * pad);
  const overlayW = Math.min(O.max_width_px * scale, vw - 2 * inset);

  // the always-visible buttons (credits, settings) sit in the bottom-right corner; the panel keeps clear of them
  const controls = $("controls");
  Object.assign(controls.style, { right: `${inset}px`, bottom: `${inset}px` });
  const ctrlW = controls.offsetWidth, gap = 8 * scale;
  const ctrlReserve = controls.offsetHeight + gap;           // height to keep free above the buttons
  const hitsControls = (left, width) => left + width > vw - inset - ctrlW - gap;

  // the panel's height when it sits below the print, measured at that width
  panel.style.width = `${belowW}px`;
  panel.style.height = "auto";
  panel.style.maxHeight = "none";
  const belowH = Math.min(panel.scrollHeight || 400, vh * B.max_height_fraction) + (hitsControls((vw - belowW) / 2, belowW) ? ctrlReserve : 0);

  const side = fit(vw - 3 * pad - sideW - 2 * mat, box.h);
  const below = fit(box.w, vh - 3 * pad - belowH - 2 * mat);
  let mode = shapeMatch || collapsed || fitMode ? "overlay" : side.w * side.h >= below.w * below.h ? "side" : "below";
  if (mode === "side" && side.w < vw * L.min_print_width_side) mode = "below";
  if (mode === "below" && below.h < vh * L.min_print_height_below) mode = "overlay";

  let pr;
  if (mode === "overlay") {
    const f = fit(box.w, box.h);
    pr = { x: (vw - f.w) / 2, y: (vh - f.h) / 2, w: f.w, h: f.h };
    const lift = hitsControls(inset, overlayW) ? ctrlReserve : 0;
    Object.assign(panel.style, {
      left: `${inset}px`, top: "auto", bottom: `${inset + lift}px`,
      width: `${overlayW}px`, height: "auto", maxHeight: `${Math.min(vh * O.max_height_fraction, vh - 2 * inset - lift)}px`,
    });
  } else if (mode === "side") {
    const left = pad + mat + (vw - 3 * pad - sideW - 2 * mat - side.w) / 2;
    pr = { x: left, y: (vh - side.h) / 2, w: side.w, h: side.h };
    Object.assign(panel.style, {
      left: `${vw - pad - sideW}px`, top: `${pad}px`, bottom: "auto",
      width: `${sideW}px`, height: "auto", maxHeight: `${vh - 2 * pad - ctrlReserve}px`,
    });
  } else {
    pr = { x: (vw - below.w) / 2, y: pad + mat, w: below.w, h: below.h };
    const top = pad + mat + below.h + mat + pad;
    const left = (vw - belowW) / 2;
    const keep = hitsControls(left, belowW) ? ctrlReserve : 0;
    Object.assign(panel.style, {
      left: `${left}px`, top: `${top}px`, bottom: "auto",
      width: `${belowW}px`, height: "auto", maxHeight: `${vh - top - pad - keep}px`,
    });
  }
  Object.assign($("printbox").style, { left: `${pr.x}px`, top: `${pr.y}px`, width: `${pr.w}px`, height: `${pr.h}px` });
  panel.classList.toggle("hidden", collapsed);
  $("expand-btn").hidden = !collapsed;
  document.body.dataset.mode = mode;
}

// ---------------------------------------------------------------- minimise / restore

const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Transform that maps rectangle `a` onto rectangle `b` (transform-origin top left). */
function rectTransform(a, b) {
  return `translate(${b.left - a.left}px, ${b.top - a.top}px) scale(${b.width / a.width}, ${b.height / a.height})`;
}

function placeBubble() {
  const b = settings.bubble || { right: 16, bottom: 16 };
  const st = $("expand-btn").style;
  st.left = b.left != null ? `${b.left}px` : "auto";
  st.right = b.right != null ? `${b.right}px` : "auto";
  const edge = cfg?.layout?.bubble_min_edge_px ?? 8;
  st.top = b.top != null ? `${Math.max(edge, b.top)}px` : "auto";
  st.bottom = b.bottom != null ? `${Math.max(edge, b.bottom)}px` : "auto";
}

/** The panel shrinks into the bubble's position; the bubble then takes over. */
/** Put the bubble at the panel's corner nearest a screen corner, so the two connect visually. */
function bubbleFromPanelRect(r) {
  const vw = window.innerWidth, vh = window.innerHeight;
  const b = {};
  if (r.left < vw - r.right) b.left = Math.round(r.left); else b.right = Math.round(vw - r.right);
  if (r.top < vh - r.bottom) b.top = Math.round(r.top); else b.bottom = Math.round(vh - r.bottom);
  settings.bubble = b;
  placeBubble();
}

/** While minimised: work out where the panel would be (invisibly) and anchor the bubble there. */
function anchorBubble() {
  if (!settings.collapsed) return;
  const panel = $("panel");
  panel.style.transition = "none";
  panel.style.visibility = "hidden";
  settings.collapsed = false;
  layout();
  const r = panel.getBoundingClientRect();
  settings.collapsed = true;
  layout();
  panel.style.visibility = "";
  bubbleFromPanelRect(r);
  requestAnimationFrame(() => { panel.style.transition = ""; });
}

async function collapsePanel() {
  const panel = $("panel"), bubble = $("expand-btn");
  const from = panel.getBoundingClientRect();
  bubbleFromPanelRect(from);
  bubble.hidden = false;
  bubble.style.visibility = "hidden";
  const to = bubble.getBoundingClientRect();
  if (!reduceMotion()) {
    const anim = panel.animate([
      { transform: "none", opacity: 1, borderRadius: "8px" },
      { transform: rectTransform(from, to), opacity: 0.4, borderRadius: `${to.height / 2}px` },
    ], { duration: cfg.layout.minimise_ms, easing: "cubic-bezier(.5, 0, .2, 1)", fill: "forwards" });
    await anim.finished;
    panel.classList.add("hidden");
    anim.cancel();
  }
  bubble.style.visibility = "";
  settings.collapsed = true; saveSettings();
  layout();
}

/** The bubble grows back into the panel at its place in the layout. */
async function expandPanel() {
  const panel = $("panel"), bubble = $("expand-btn");
  const from = bubble.getBoundingClientRect();
  settings.collapsed = false; saveSettings();
  panel.style.transition = "none";  // jump straight to the final place, then animate from the bubble
  layout();                         // (the print shrinks to make room with its own transition)
  bubble.hidden = true;
  const to = panel.getBoundingClientRect();
  requestAnimationFrame(() => { panel.style.transition = ""; });
  if (reduceMotion()) return;
  panel.animate([
    { transform: rectTransform(to, from), opacity: 0.4, borderRadius: `${from.height / 2}px` },
    { transform: "none", opacity: 1, borderRadius: "8px" },
  ], { duration: cfg.layout.restore_ms, easing: "cubic-bezier(.3, 0, .2, 1)" });
}

// ---------------------------------------------------------------- rendering

function showPrint(r) {
  const p = r.print;
  const img = $("printimg");
  const [cx, cy, cw, ch] = p.crop || [0, 0, 1, 1];
  Object.assign(img.style, { left: `${(-cx / cw) * 100}%`, top: `${(-cy / ch) * 100}%`, width: `${100 / cw}%`, height: `${100 / ch}%` });
  // scans that were digitised turned: rotate about the centre of the cropped area (index field "rotation")
  img.style.transformOrigin = `${(cx + cw / 2) * 100}% ${(cy + ch / 2) * 100}%`;
  img.style.transform = p.rotation ? `rotate(${p.rotation}deg)` : "";
  if (img.dataset.id !== p.id) {
    img.classList.remove("loaded");
    img.dataset.id = p.id;
    img.dataset.fallback = p.local_image || "";
    img.alt = `${p.title}${p.artist ? ", " + p.artist.split(";")[0] : ""}`;
    img.onload = () => { img.classList.add("loaded"); mark("print image loaded"); };
    img.onerror = () => {
      if (img.dataset.fallback) { img.src = img.dataset.fallback; img.dataset.fallback = ""; return; }
      // museum server unreachable and no local copy: show the best match among the prints we host
      const alt = state.ranked.find((x) => x.print.local_image && x.print.id !== p.id);
      if (alt && state.chosen?.print.id === p.id) { state.chosen = alt; showPrint(alt); }
    };
    img.src = imageUrl(p);
  }
  applyPalette(p);
  const artist = (p.artist || "").split(";")[0];
  const { title, series } = splitTitle(p);
  $("print-info").innerHTML = `
    <div class="title">${esc(title)}</div>
    <div class="meta">${esc(artist)}${p.date ? " · " + esc(p.date) : ""}${series ? "<br>" + esc(series) : ""}</div>
    <div class="credit">From <a href="${esc(p.object_url)}" target="_blank" rel="noopener">${esc(p.source)}</a> · ${esc(p.rights || "Public domain")}</div>`;
  renderWhy(r);
  layout();
}

const LABELS = { weather: "weather", wind: "wind", snow_ground: "snow on the ground", time_of_day: "time of day", moon: "moon",
  season: "season", environment: "geographic features", environment_flags: "local features", proximity: "nearby place", orientation: "fits the screen" };

function vecText(v) {
  return v ? Object.entries(v).sort((a, b) => b[1] - a[1]).map(([k, x]) => (x >= 0.99 ? k : `${k} ${x.toFixed(1)}`)).join(", ") : "—";
}

function renderWhy(r) {
  const t = r.print.tags, c = state.cur;
  const parts = Object.entries(r.parts).filter(([, p]) => !p.neutral && p.w > 0)
    .sort((a, b) => b[1].contribution - a[1].contribution).slice(0, 4);
  const rank = state.ranked.indexOf(r) + 1;
  $("why-body").innerHTML = `
    <ul>${parts.map(([k, p]) => `<li>${LABELS[k] || k}: ${Math.round(p.s * 100)}% match</li>`).join("")}</ul>
    <p class="evidence">${esc(t.evidence || "")}</p>
    <div class="conds">Now: ${esc(vecText(c.weather))} · ${esc(vecText(c.time_of_day))}${c.moon ? " · moon up" : ""}
      ${c.environment.settlement ? " · " + esc(vecText(c.environment.settlement)) + ", " + esc(vecText(c.environment.water)) : ""}
      <br>Print: ${esc(vecText(t.weather))} · ${esc(vecText(t.time_of_day))} · ${esc(vecText(t.season))}
      <br>Rank ${rank} of ${state.ranked.length}, score ${r.total.toFixed(2)}${DEBUG ? `<br>timing: ${state.timings.map(([l, ms]) => `${l} ${ms} ms`).join(" · ")}` : ""}${DEBUG ? `<br>sun ${c._sun.toFixed(1)}°, moon ${c._moon.altitude.toFixed(0)}° (${Math.round(c._moon.fraction * 100)}%), clouds ${c._cloud}%` : ""}</div>`;
}

function renderWeather() {
  const data = state.weather;
  const c = data.current;
  const [text] = describe(c.weather_code);
  const nowIcon = weatherIcon(c.weather_code, c.is_day === 0);
  $("temp").textContent = `${Math.round(c.temperature_2m)}°`;
  $("sym").innerHTML = nowIcon;
  $("cond-text").textContent = text;
  $("mini-temp").textContent = `${Math.round(c.temperature_2m)}°`;
  $("mini-sym").innerHTML = nowIcon;
  const today = data.daily;
  $("now-sub").innerHTML = [
    `<span title="Wind">${ICON.wind} ${Math.round(c.wind_speed_10m)} km/h</span>`,
    today.sunrise[0] ? `<span title="Sunrise">${ICON.sunrise} ${today.sunrise[0].slice(11, 16)}</span>` : "",
    today.sunset[0] ? `<span title="Sunset">${ICON.sunset} ${today.sunset[0].slice(11, 16)}</span>` : "",
  ].join("");

  const h0 = currentHourIndex(data);
  const riseH = today.sunrise[0] ? +today.sunrise[0].slice(11, 13) : 6;
  const setH = today.sunset[0] ? +today.sunset[0].slice(11, 13) + 1 : 18;
  const hours = [];
  for (let i = 1; i <= 24 && hours.length < 8; i += 3) {
    const k = h0 + i;
    if (k >= data.hourly.time.length) break;
    const hh = +data.hourly.time[k].slice(11, 13);
    const code = data.hourly.weather_code[k];
    const night = hh < riseH || hh >= setH;
    const symbol = weatherIcon(code, night);
    hours.push(`<div><span class="h">${String(hh).padStart(2, "0")}</span><span class="s">${symbol}</span><span class="t">${Math.round(data.hourly.temperature_2m[k])}°</span></div>`);
  }
  $("hours").innerHTML = hours.join("");

  const DAYS_SHOWN = 4; // today and the next three days
  const lo = Math.min(...today.temperature_2m_min.slice(0, DAYS_SHOWN)), hi = Math.max(...today.temperature_2m_max.slice(0, DAYS_SHOWN));
  const span = Math.max(1, hi - lo);
  $("days").innerHTML = today.time.slice(0, DAYS_SHOWN).map((d, i) => {
    const name = i === 0 ? "Today" : new Date(d + "T12:00:00").toLocaleDateString("en", { weekday: "short" });
    const a = ((today.temperature_2m_min[i] - lo) / span) * 100, b = ((today.temperature_2m_max[i] - lo) / span) * 100;
    const pp = today.precipitation_probability_max?.[i];
    const pp10 = pp == null ? null : Math.round(pp / 10) * 10; // to the nearest 10 %
    return `<div class="day"><span class="d">${name}</span>
      <span class="s" title="${esc(describe(today.weather_code[i])[0])}">${weatherIcon(today.weather_code[i])}</span>
      <span class="p" title="Chance of rain">${pp10 >= 20 ? `${ICON.drop}${pp10}%` : ""}</span>
      <span class="range"><b style="left:${a}%;width:${Math.max(4, b - a)}%"></b></span>
      <span class="lohi">${Math.round(today.temperature_2m_min[i])}° / ${Math.round(today.temperature_2m_max[i])}°</span></div>`;
  }).join("");
}

function setStatus(msg) {
  $("status").textContent = msg;
  $("status").hidden = !msg; // nothing to say → no status line at all
}

// ---------------------------------------------------------------- refresh cycle

/** Recompute conditions and ranking; keep the current print if it is still a good match. */
function rescore(forcePick) {
  state.cur = buildConditions(state.place, state.weather, state.env);
  state.ranked = rankPrints(index, state.cur, cfg);
  state.chosen = choosePrint(forcePick);
  renderWeather();
  showPrint(state.chosen);
  anchorBubble();
}

async function refresh({ forcePick = false, newPlace = false } = {}) {
  try {
    if (newPlace || !state.place) {
      mark("locating");
      state.place = await resolvePlace();
      mark(state.place.fallback ? "location unavailable" : "location known");
      $("place-name").textContent = state.place.name || "Here";
    }
    const p = state.place;
    if (DEV) setStatus("Updating…");
    if (!p.name) placeName(p.lat, p.lon).then((n) => { p.name = n; $("place-name").textContent = n; });
    const cachedEnv = cachedEnvironment(p.lat, p.lon);
    const envPromise = cachedEnv?.terrain ? Promise.resolve(cachedEnv) : getEnvironment(p.lat, p.lon);
    mark("weather requested");
    state.weather = await fetchWeatherRace(p.lat, p.lon, p.timezone, (better) => {
      if (state.place !== p) return;          // the place changed meanwhile
      state.weather = better;
      mark("weather upgraded (Open-Meteo)");
      rescore(false);
      rememberView();
      report();
    });
    mark(`weather received (${state.weather.provider})`);
    state.env = cachedEnv;
    rescore(forcePick);
    mark("print and forecast shown");
    rememberView();
    state.lastRefresh = Date.now();
    function report() {
      const notes = [];
      if (p.fallback) notes.push("Location unavailable — showing Tokyo. Set a place in Settings.");
      if (DEV) {
        if (state.weather.providerNote) notes.push(`Weather from ${state.weather.provider} (${state.weather.providerNote}).`);
        if (!state.env) notes.push("Looking up geographic features…");
        else if (state.env.error) notes.push("Can't look up geographic features right now; matching without them.");
      }
      const time = new Date().toLocaleTimeString("en", { hour: "2-digit", minute: "2-digit" });
      // friends only see notes that need their attention; developer mode also shows the last update
      setStatus(notes.join(" ") || (DEV ? `Updated ${time} · ${state.weather.provider}` : ""));
    }
    report();
    if (!cachedEnv?.terrain) {
      envPromise.then((env) => { state.env = env; mark("geographic features received"); rescore(false); report(); });
    }
  } catch (e) {
    setStatus(DEV ? `Could not update: ${e.message}. Retrying in a few minutes.` : "Couldn't load the weather. Trying again in a few minutes.");
    setTimeout(() => refresh(), 3 * 60 * 1000);
  }
}

/** Remember place and weather, so the next visit can show them at once (see showRememberedView). */
function rememberView() {
  storage.setJSON(K.last, { time: Date.now(), locmode: settings.locmode, place: state.place, weather: state.weather });
}

/** On start: if the last view is recent and for the same location setting, show it immediately. */
function showRememberedView() {
  const last = storage.getJSON(K.last, null);
  if (!last || Date.now() - last.time > LAST_VIEW_MAX_AGE || last.locmode !== settings.locmode) return false;
  if (settings.locmode === "fixed" && (last.place?.lat !== settings.place?.lat || last.place?.lon !== settings.place?.lon)) return false;
  state.place = last.place;
  state.weather = last.weather;
  state.env = cachedEnvironment(last.place.lat, last.place.lon);
  $("place-name").textContent = last.place.name || "Here";
  rescore(false);
  mark("shown from last visit");
  return true;
}

// ---------------------------------------------------------------- settings

function saveSettings() { storage.setJSON(K.settings, settings); }

function applySurround() {
  $("stage").className = `surround-${settings.surround} size-${settings.size}`;
  layout();
}

/** Open a dialog with focus on the dialog itself, so no button starts out highlighted
    (the browser would otherwise focus the first button, the close x). Tab still reaches every control. */
function openDialog(d) {
  d.showModal();
  d.focus();
}

function openSettings() {
  const d = $("settings");
  d.querySelectorAll('input[name="locmode"]').forEach((r) => { r.checked = r.value === settings.locmode; });
  d.querySelectorAll('input[name="size"]').forEach((r) => { r.checked = r.value === settings.size; });
  $("fixed-name").textContent = settings.place?.name || "none yet — search below";
  $("place-results").innerHTML = "";
  openDialog(d);
}

function wireSettings() {
  const d = $("settings");
  d.addEventListener("change", (e) => {
    if (e.target.name === "size") { settings.size = e.target.value; saveSettings(); applySurround(); anchorBubble(); }
    if (e.target.name === "locmode") {
      if (e.target.value === "fixed" && !settings.place) { $("place-search").focus(); return; }
      settings.locmode = e.target.value; saveSettings(); refresh({ newPlace: true });
    }
  });
  let timer;
  $("place-search").addEventListener("input", (e) => {
    clearTimeout(timer);
    const q = e.target.value.trim();
    if (q.length < 2) { $("place-results").innerHTML = ""; return; }
    timer = setTimeout(async () => {
      const res = await searchPlaces(q);
      $("place-results").innerHTML = res.map((r, i) =>
        `<li><button type="button" data-i="${i}">${esc(r.name)} <small>${esc(r.region)}</small></button></li>`).join("");
      $("place-results").onclick = (ev) => {
        const b = ev.target.closest("button"); if (!b) return;
        const r = res[+b.dataset.i];
        settings.place = { name: r.name, lat: r.lat, lon: r.lon, timezone: r.timezone };
        settings.locmode = "fixed"; saveSettings();
        $("fixed-name").textContent = r.name;
        d.querySelector('input[name="locmode"][value="fixed"]').checked = true;
        refresh({ newPlace: true });
      };
    }, 300);
  });
}

// ---------------------------------------------------------------- start

async function init() {
  mark("script started");
  [cfg, index] = await Promise.all([loadConfig("config/"), fetch("data/index.json").then((r) => r.json())]);
  mark("config and print index loaded");
  document.documentElement.style.setProperty("--layout-ms", `${cfg.layout.layout_transition_ms}ms`);
  document.documentElement.style.setProperty("--fade-ms", `${cfg.layout.print_fade_ms}ms`);
  applySurround();
  wireSettings();
  $("place-btn").addEventListener("click", openSettings);
  $("settings-btn").innerHTML = ICON.gear;
  $("credits-btn").innerHTML = ICON.info;
  $("credits-btn").addEventListener("click", () => openDialog($("credits")));
  // a click or tap on the print (or the paper around it) minimises the weather box
  $("stage").addEventListener("click", (e) => {
    if (settings.collapsed || e.target.closest("#panel, #controls, #expand-btn")) return;
    collapsePanel();
  });
  $("settings-btn").addEventListener("click", openSettings);
  settings.collapsed = true; // always start with the weather box minimised
  $("another-btn").addEventListener("click", () => {
    state.chosen = choosePrint(true);
    showPrint(state.chosen);
  });
  $("collapse-btn").addEventListener("click", collapsePanel);
  document.querySelectorAll(".close-btn").forEach((b) => { b.innerHTML = ICON.close; });
  // a tap outside a dialog (on its backdrop) closes it
  document.querySelectorAll("dialog").forEach((d) => d.addEventListener("click", (e) => { if (e.target === d) d.close(); }));
  $("expand-btn").addEventListener("click", expandPanel);
  let rt;
  window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { layout(); anchorBubble(); }, 120); });
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden && Date.now() - state.lastRefresh > REFRESH_MS) refresh();
  });
  setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
  placeBubble();
  layout();
  showRememberedView();
  await refresh({ newPlace: true });
}

init().catch((e) => setStatus(`Could not start: ${e.message}`));
