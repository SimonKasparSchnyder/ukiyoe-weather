import { loadConfig, rankPrints, pickPrint, timeVectorFromSun, croppedAspect } from "./lib/scoring.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const LOCATIONS = {
  none: { label: "none (no place matching)" },
  nihonbashi: { label: "Tokyo — Nihonbashi", lat: 35.684, lon: 139.774 },
  shinagawa: { label: "Tokyo — Shinagawa", lat: 35.619, lon: 139.740 },
  ueno: { label: "Tokyo — Ueno", lat: 35.714, lon: 139.774 },
  hakone: { label: "Hakone", lat: 35.233, lon: 139.107 },
  kyoto: { label: "Kyoto — Sanjō bridge", lat: 35.009, lon: 135.772 },
  zurich: { label: "Zurich", lat: 47.370, lon: 8.540 },
};

const SCENARIOS = [
  { name: "Snowy dusk in a river town, February",
    c: { w1: "snowfall", w2: "cloudy", wmix: 0.2, wind: 0.1, snow: 0.8, sun: -3, ampm: "pm", moon: false,
         date: "2026-02-10", settlement: "town", water: "river", terrain: "flat", flags: ["bridge"], location: "none" } },
  { name: "Summer downpour in central Tokyo",
    c: { w1: "rain", w2: "storm", wmix: 0.4, wind: 0.5, snow: 0, sun: 40, ampm: "pm", moon: false,
         date: "2026-07-20", settlement: "city", water: "river", terrain: "flat", flags: ["bridge"], location: "nihonbashi" } },
  { name: "Clear autumn night by a lake, full moon",
    c: { w1: "clear", w2: "clear", wmix: 0, wind: 0, snow: 0, sun: -30, ampm: "pm", moon: true,
         date: "2026-10-05", settlement: "rural", water: "lake", terrain: "hilly", flags: [], location: "none" } },
  { name: "Misty spring morning in the mountains",
    c: { w1: "mist", w2: "cloudy", wmix: 0.2, wind: 0, snow: 0, sun: 1, ampm: "am", moon: false,
         date: "2026-04-20", settlement: "wild", water: "river", terrain: "mountain", flags: ["forest"], location: "hakone" } },
  { name: "Cherry-blossom day in Shinagawa",
    c: { w1: "clear", w2: "cloudy", wmix: 0.3, wind: 0.1, snow: 0, sun: 45, ampm: "pm", moon: false,
         date: "2026-04-01", settlement: "city", water: "sea", terrain: "flat", flags: ["garden_park"], location: "shinagawa" } },
  { name: "Hot clear summer afternoon in Zurich",
    c: { w1: "clear", w2: "clear", wmix: 0, wind: 0.1, snow: 0, sun: 50, ampm: "pm", moon: false,
         date: "2026-07-25", settlement: "city", water: "lake", terrain: "hilly", flags: [], location: "zurich" } },
  { name: "New Year's Eve, cold clear night",
    c: { w1: "clear", w2: "clear", wmix: 0, wind: 0.1, snow: 0, sun: -40, ampm: "pm", moon: false,
         date: "2026-12-31", settlement: "town", water: "none", terrain: "flat", flags: ["temple_shrine"], location: "none" } },
];

const PART_LABELS = {
  weather: "weather", wind: "wind", snow_ground: "snow on ground", time_of_day: "time of day", moon: "moon",
  season: "season", environment: "environment", environment_flags: "env. features", proximity: "proximity", region: "region",
  orientation: "orientation",
};

let cfg, index, weights, ranked = [], selected = 0, recent = [], pickedId = null;
const KEY = "ukiyoe-tuner-weights-v1";

function dayOfYear(dateStr) {
  const d = new Date(dateStr + "T12:00:00");
  return Math.floor((d - new Date(d.getFullYear(), 0, 0)) / 86400000) - 1;
}

function readConditions() {
  const w1 = $("w1").value, w2 = $("w2").value, mix = +$("wmix").value;
  const weather = {};
  weather[w1] = (weather[w1] || 0) + (1 - mix);
  if (mix > 0) weather[w2] = (weather[w2] || 0) + mix;
  const time = timeVectorFromSun(+$("sun").value, $("ampm").value === "am", cfg.time);
  const loc = LOCATIONS[$("location").value];
  return {
    weather, wind: +$("wind").value, snow_ground: +$("snow").value,
    time_of_day: time, moon: $("moon").checked,
    day_of_year: dayOfYear($("date").value), southern_hemisphere: $("south").checked,
    environment: {
      settlement: { [$("settlement").value]: 1 }, water: { [$("water").value]: 1 }, terrain: { [$("terrain").value]: 1 },
      flags: [...document.querySelectorAll("#flags input:checked")].map((x) => x.value),
    },
    location: loc.lat != null ? { lat: loc.lat, lon: loc.lon } : null,
    window_aspect: +$("window").value,
  };
}

function setConditions(c) {
  for (const k of ["w1", "w2", "wmix", "wind", "snow", "sun", "ampm", "date", "settlement", "water", "terrain", "location"]) {
    if (c[k] !== undefined) $(k).value = c[k];
  }
  $("moon").checked = !!c.moon;
  document.querySelectorAll("#flags input").forEach((x) => { x.checked = (c.flags || []).includes(x.value); });
  syncOutputs();
}

function syncOutputs() {
  document.querySelectorAll(".rangewrap").forEach((w) => {
    const r = w.querySelector("input"), o = w.querySelector("output");
    o.textContent = r.id === "sun" ? `${r.value}°` : (+r.value).toFixed(r.step < 0.1 ? 2 : 1);
  });
  const tv = timeVectorFromSun(+$("sun").value, $("ampm").value === "am", cfg.time);
  $("timevec").textContent = "→ " + Object.entries(tv).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(", ");
}

function frameHTML(print, maxHeight) {
  const a = croppedAspect(print);
  const [cx, cy, cw, ch] = print.crop || [0, 0, 1, 1];
  const style = `left:${(-cx / cw) * 100}%;top:${(-cy / ch) * 100}%;width:${100 / cw}%;height:${100 / ch}%`;
  const box = maxHeight && a < 1 ? `height:${maxHeight};width:auto;aspect-ratio:${a}` : `aspect-ratio:${a}`;
  return `<div class="frame" style="${box}"><img src="${esc(print.image_url)}" data-fallback="${esc(print.local_image)}" alt="${esc(print.title)}" style="${style}" loading="lazy"></div>`;
}

function bindFallbacks(root) {
  root.querySelectorAll("img[data-fallback]").forEach((img) => {
    img.addEventListener("error", () => {
      if (img.dataset.fallback && img.src.indexOf(img.dataset.fallback) === -1) {
        img.src = img.dataset.fallback; img.dataset.fallback = "";
      }
    }, { once: true });
  });
}

function renderFeature() {
  const r = ranked[selected];
  if (!r) return;
  const p = r.print, t = p.tags;
  $("mat").innerHTML = frameHTML(p, "58vh");
  bindFallbacks($("mat"));
  const max = Math.max(...Object.values(weights).filter((v) => typeof v === "number"), 1);
  const bars = Object.entries(r.parts).map(([k, part]) => `
    <div class="bar"><span>${PART_LABELS[k] || k}${part.neutral ? '<span class="neutral-tag">neutral</span>' : ""}</span>
      <i><b style="width:${Math.round(part.s * 100)}%;background:var(--c-${k})"></b></i>
      <span class="num">${part.s.toFixed(2)} × ${part.w.toFixed(2)} = ${part.contribution.toFixed(2)}</span></div>`).join("");
  const fmt = (v) => (v ? Object.entries(v).map(([k, x]) => `${k} ${x}`).join(", ") : "—");
  $("details").innerHTML = `
    <h3>#${selected + 1} · ${esc(p.title)}</h3>
    <div class="meta">${esc((p.artist || "").split(";")[0])}${p.date ? " · " + esc(p.date) : ""}${p.series ? "<br>" + esc(p.series) : ""}<br>
      ${esc(p.source)} · <a href="${esc(p.object_url)}" target="_blank" rel="noopener">object page</a></div>
    <div class="evidence">${esc(t.evidence || "")}</div>
    <div class="meta">Tags — weather: ${esc(fmt(t.weather))} · time: ${esc(fmt(t.time_of_day))} · season: ${esc(fmt(t.season))}
      ${t.seasonal_markers?.length ? " · markers: " + esc(t.seasonal_markers.join(", ")) : ""}${t.place ? " · place: " + esc(t.place.name) : ""}</div>
    <div class="bars">${bars}</div>
    <p class="meta" style="margin-top:8px">Total <strong>${r.total.toFixed(2)}</strong></p>`;
}

function renderRanking() {
  const top = ranked.slice(0, 15);
  const maxTotal = top[0]?.total || 1;
  $("ranking").innerHTML = top.map((r, i) => {
    const stack = Object.entries(r.parts).map(([k, p]) =>
      `<span title="${PART_LABELS[k] || k}: ${p.contribution.toFixed(2)}" style="width:${(p.contribution / maxTotal) * 100}%;background:var(--c-${k});${p.neutral ? "opacity:.45" : ""}"></span>`).join("");
    return `<div class="rk ${i === selected ? "sel" : ""} ${r.print.id === pickedId ? "picked" : ""}" data-i="${i}">
      <span class="n">${i + 1}</span>
      <div class="thumb">${frameHTML(r.print)}</div>
      <div class="t">${esc(r.print.title)}<small>${esc((r.print.artist || "").split(";")[0])} · ${esc(r.print.source)}</small>
        <div class="stack">${stack}</div></div>
      <span class="total">${r.total.toFixed(2)}</span></div>`;
  }).join("");
  bindFallbacks($("ranking"));
}

function update() {
  syncOutputs();
  ranked = rankPrints(index, readConditions(), cfg, weights);
  selected = 0; pickedId = null; $("pickinfo").textContent = "";
  renderFeature(); renderRanking();
}

function buildWeights() {
  $("weights").innerHTML = Object.entries(weights).map(([k, v]) => `
    <label class="f"><span>${k === "neutral" ? "neutral value" : (PART_LABELS[k] || k)}</span>
      <span class="rangewrap"><input type="range" data-w="${k}" min="0" max="${k === "neutral" ? 1 : 2}" step="0.05" value="${v}"><output></output></span></label>`).join("");
  $("weights").querySelectorAll("input").forEach((r) => r.addEventListener("input", () => {
    weights[r.dataset.w] = +r.value;
    try { localStorage.setItem(KEY, JSON.stringify(weights)); } catch (e) { /* storage unavailable */ }
    update();
  }));
  syncOutputs();
}

function fillSelect(id, values, labels = {}) {
  $(id).innerHTML = values.map((v) => `<option value="${v}">${labels[v] || v}</option>`).join("");
}

async function init() {
  cfg = await loadConfig("config/");
  index = await (await fetch("data/index.json")).json();
  $("count").textContent = index.length;
  weights = { ...cfg.weights };
  try { Object.assign(weights, JSON.parse(localStorage.getItem(KEY) || "{}")); } catch (e) { /* ignore */ }

  fillSelect("w1", cfg.weather.categories);
  fillSelect("w2", cfg.weather.categories);
  fillSelect("settlement", Object.keys(cfg.environment.closeness.settlement));
  fillSelect("water", Object.keys(cfg.environment.closeness.water));
  fillSelect("terrain", Object.keys(cfg.environment.closeness.terrain));
  fillSelect("location", Object.keys(LOCATIONS), Object.fromEntries(Object.entries(LOCATIONS).map(([k, v]) => [k, v.label])));
  $("flags").innerHTML = cfg.environment.flags.map((f) => `<label><input type="checkbox" value="${f}">${f.replace("_", " ")}</label>`).join("");
  $("legend").innerHTML = Object.entries(PART_LABELS).map(([k, l]) => `<span style="--c:var(--c-${k})">${l}</span>`).join("") +
    `<span style="--c:var(--bar-bg)">faded = neutral (no tag)</span>`;

  $("scenarios").innerHTML = SCENARIOS.map((s, i) => `<button data-i="${i}">${esc(s.name)}</button>`).join("");
  $("scenarios").addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    document.querySelectorAll("#scenarios button").forEach((x) => x.classList.toggle("active", x === b));
    setConditions(SCENARIOS[+b.dataset.i].c); update();
  });
  $("conditions").addEventListener("input", () => {
    document.querySelectorAll("#scenarios button").forEach((x) => x.classList.remove("active"));
    update();
  });
  $("ranking").addEventListener("click", (e) => {
    const row = e.target.closest(".rk"); if (!row) return;
    selected = +row.dataset.i; renderFeature(); renderRanking();
  });
  $("pick").addEventListener("click", () => {
    const r = pickPrint(ranked, cfg, recent);
    recent = [r.print.design_id, ...recent].slice(0, cfg.selection.avoid_recent_designs);
    pickedId = r.print.id; selected = ranked.indexOf(r);
    $("pickinfo").textContent = `Picked #${selected + 1} (weighted random among the top ${cfg.selection.top_k}, skipping the last ${recent.length - 1} shown designs).`;
    renderFeature(); renderRanking();
  });
  $("reset").addEventListener("click", () => {
    weights = { ...cfg.weights };
    try { localStorage.removeItem(KEY); } catch (e) { /* ignore */ }
    buildWeights(); update();
  });
  $("export").addEventListener("click", () => {
    const out = $("export-out"); out.style.display = "block";
    out.value = JSON.stringify(weights, null, 2); out.select();
  });

  buildWeights();
  document.querySelector("#scenarios button").click();
}

init().catch((e) => {
  document.querySelector("main").innerHTML = `<p class="status">Could not load: ${esc(e.message)}. Serve the project folder over a local web server (see web/README).</p>`;
});
