"""Merge pilot tag batches into data/tags.json and build contact_sheet.html.

Throwaway pilot tool. Run with:  python3 -I pilot/scripts/build_contact_sheet.py
"""
import json
import sys
from pathlib import Path

VERSION = sys.argv[1] if len(sys.argv) > 1 else "v1"
PAT = "tags_batch*.json" if VERSION == "v1" else f"tags_{VERSION}_batch*.json"
SUFFIX = "" if VERSION == "v1" else f"_{VERSION}"

ROOT = Path(__file__).resolve().parent.parent
SAMPLE_FILE = "sample_v3.json" if VERSION == "v3" else "sample.json"
sample = {r["id"]: r for r in json.loads((ROOT / "data" / SAMPLE_FILE).read_text())}
order = list(sample)

tags = {}
for f in sorted((ROOT / "data").glob(PAT)):
    for t in json.loads(f.read_text()):
        tags[t["id"]] = t

merged = []
for pid in order:
    if pid in tags:
        merged.append({"meta": sample[pid], "tags": tags[pid]})
(ROOT / "data" / f"tags{SUFFIX}.json").write_text(json.dumps(merged, ensure_ascii=False, indent=1))

missing = [p for p in order if p not in tags]
print(f"merged {len(merged)} prints; missing: {missing}")

data_js = json.dumps(merged, ensure_ascii=False).replace("</", "<\\/")

HTML = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pilot Contact Sheet __VER__</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Source+Serif+4:opsz,wght@8..60,400;8..60,600&display=swap" rel="stylesheet">
<style>
:root {
  --bg: #f4efe4; --card: #fbf8f1; --ink: #2a2723; --muted: #7a7266; --line: #ddd4c3;
  --bar: #3d5a73; --bar-bg: #e6dfd1; --accent: #a8432f; --ok: #4b6b3c;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --bg: #1d1b18; --card: #26231f; --ink: #ece6da; --muted: #a39a8b; --line: #3a362f;
    --bar: #8fb0cc; --bar-bg: #34302a; --accent: #e07a62; --ok: #9cc58a;
  }
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--ink);
  font-family: "Source Serif 4", Georgia, serif; font-size: 15px; line-height: 1.4; }
header { padding: 20px 16px 8px; max-width: 1400px; margin: 0 auto; }
h1 { font-weight: 600; font-size: 26px; margin: 0 0 4px; }
.sub { color: var(--muted); margin: 0 0 12px; }
.controls { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; }
select, button { font: inherit; padding: 4px 10px; border: 1px solid var(--line);
  background: var(--card); color: var(--ink); border-radius: 4px; cursor: pointer; }
main { max-width: 1400px; margin: 0 auto; padding: 8px 16px 40px;
  display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 420px), 1fr)); gap: 16px; }
.card { background: var(--card); border: 1px solid var(--line); border-radius: 6px; overflow: hidden;
  display: flex; flex-direction: column; }
.card.excluded { opacity: .6; }
.card.flagged { outline: 2px solid var(--accent); }
.imgwrap { position: relative; background: var(--bar-bg); }
.imgwrap img { display: block; width: 100%; height: auto; }
.crop { position: absolute; border: 2px dashed var(--accent); pointer-events: none; }
.body { padding: 10px 12px 12px; display: flex; flex-direction: column; gap: 6px; }
.title { font-weight: 600; font-size: 16px; }
.meta { color: var(--muted); font-size: 13px; }
.meta a { color: inherit; }
.row { display: grid; grid-template-columns: 92px 1fr; gap: 6px; font-size: 13px; align-items: start; }
.row > span:first-child { color: var(--muted); }
.vec { display: flex; flex-direction: column; gap: 2px; }
.bar { display: grid; grid-template-columns: 82px 1fr 30px; gap: 6px; align-items: center; }
.bar i { display: block; height: 7px; background: var(--bar-bg); border-radius: 4px; position: relative; }
.bar i b { position: absolute; inset: 0 auto 0 0; background: var(--bar); border-radius: 4px; }
.null { color: var(--muted); font-style: italic; }
.pal { display: flex; gap: 4px; }
.pal span { width: 22px; height: 16px; border-radius: 3px; border: 1px solid var(--line); }
.evidence, .friction { font-size: 13px; }
.friction { color: var(--accent); }
.tag { display: inline-block; padding: 0 6px; border: 1px solid var(--line); border-radius: 10px; font-size: 12px; margin: 0 4px 2px 0; }
.review { border-top: 1px solid var(--line); padding-top: 8px; display: flex; flex-direction: column; gap: 6px; }
.review label { font-size: 13px; display: flex; gap: 6px; align-items: center; }
textarea { font: inherit; font-size: 13px; width: 100%; min-height: 44px; border: 1px solid var(--line);
  background: var(--bg); color: var(--ink); border-radius: 4px; padding: 4px 6px; }
#export-out { width: 100%; max-width: 1400px; margin: 0 auto 0; display: none; }
</style>
</head>
<body>
<header>
  <h1>Pilot Contact Sheet (__VER__)</h1>
  <p class="sub">100 prints tagged against TAXONOMY.md. Dashed red box = estimated sheet-edge crop.
  Tick "Disagree" and add a note where a tag is wrong; notes are kept in this browser. Export copies them as JSON.</p>
  <div class="controls">
    <label>Show <select id="filter">
      <option value="all">all</option>
      <option value="included">included only</option>
      <option value="excluded">excluded only</option>
      <option value="famous">famous series</option>
      <option value="random_landscape">random landscapes</option>
      <option value="kacho_e">bird-and-flower</option>
      <option value="gap">round 3: gap-fillers</option>
      <option value="shin_hanga">round 3: shin-hanga</option>
      <option value="random">round 3: random</option>
      <option value="flagged">my disagreements</option>
      <option value="friction">with taxonomy friction</option>
    </select></label>
    <span id="count" class="meta"></span>
    <button id="export">Export my notes</button>
  </div>
  <textarea id="export-out" rows="6" readonly></textarea>
</header>
<main id="grid"></main>
<script>
const DATA = __DATA__;
const KEY = "ukiyoe-pilot-review-__VER__";
let notes = {};
try { notes = JSON.parse(localStorage.getItem(KEY) || "{}"); } catch (e) { notes = {}; }
function save() { try { localStorage.setItem(KEY, JSON.stringify(notes)); } catch (e) {} }

const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
function vec(v, reason) {
  if (v == null) return `<span class="null">no tag (neutral)${reason ? " — " + esc(reason) : ""}</span>`;
  const entries = Object.entries(v).filter(([, x]) => x > 0).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return '<span class="null">empty</span>';
  return '<div class="vec">' + entries.map(([k, x]) =>
    `<div class="bar"><span>${esc(k)}</span><i><b style="width:${Math.round(x*100)}%"></b></i><span>${x.toFixed(1)}</span></div>`).join("") + "</div>";
}
function env(e, reason) {
  if (e == null) return `<span class="null">no tag (neutral)${reason ? " — " + esc(reason) : ""}</span>`;
  return `<div class="vec">
    <div><em>settlement</em>${vec(e.settlement)}</div>
    <div><em>water</em>${vec(e.water)}</div>
    <div><em>terrain</em>${vec(e.terrain)}</div>
    <div>${(e.flags||[]).map(f => `<span class="tag">${esc(f)}</span>`).join("") || '<span class="null">no flags</span>'}</div></div>`;
}
function card(d) {
  const m = d.meta, t = d.tags, n = notes[m.id] || {};
  const c = t.crop || [0,0,1,1];
  const conf = t.confidence ? Object.entries(t.confidence).map(([k,v]) => `${k} ${(+v).toFixed(1)}`).join(" · ") : "";
  const place = t.place ? `${esc(t.place.name)} (${t.place.lat}, ${t.place.lon}, ±${t.place.precision_km} km)` : '<span class="null">none</span>';
  const fr = t.taxonomy_friction && !/^\\s*(nothing|none)\\.?\\s*$/i.test(t.taxonomy_friction) ? t.taxonomy_friction : "";
  return `<article class="card ${t.include ? "" : "excluded"} ${n.flag ? "flagged" : ""}" data-id="${esc(m.id)}">
    <div class="imgwrap"><img loading="lazy" src="images/${esc(m.id)}.jpg" alt="${esc(m.title)}">
      <div class="crop" style="left:${c[0]*100}%;top:${c[1]*100}%;width:${c[2]*100}%;height:${c[3]*100}%"></div></div>
    <div class="body">
      <div class="title">${esc(m.title)}</div>
      <div class="meta">${esc(m.artist || "")}${m.series ? " — " + esc(m.series) : ""}<br>
        ${esc(m.source)} · <a href="${esc(m.object_url)}" target="_blank" rel="noopener">object page</a> · ${esc(m.id)} · group: ${esc(m.group)}</div>
      <div class="row"><span>genre</span><span>${esc(t.genre)} ${t.include ? "" : `— <strong>excluded</strong>: ${esc(t.exclude_reason)}`}</span></div>
      <div class="row"><span>era / edition</span><span>${esc(t.era ?? "–")} · ${esc(t.edition ?? "–")}${t.fragment && t.fragment !== "none" ? " · " + esc(t.fragment) : ""}${t.fading ? " · faded" : ""}</span></div>
      <div class="row"><span>weather</span>${vec(t.weather, t.weather_null_reason)}</div>
      <div class="row"><span>wind</span><span>${t.wind ?? '<span class="null">–</span>'}${"snow_ground" in t ? " · snow on ground " + (t.snow_ground ?? "–") : ""}</span></div>
      <div class="row"><span>time of day</span><div>${vec(t.time_of_day, t.time_null_reason)}${t.time_source ? `<span class="meta">from: ${esc(t.time_source)}</span>` : ""}</div></div>
      <div class="row"><span>moon</span><span>${t.moon ? "yes" : "no"}</span></div>
      <div class="row"><span>season</span>${vec(t.season, t.season_null_reason)}</div>
      <div class="row"><span>markers</span><span>${(t.seasonal_markers||[]).map(x => `<span class="tag">${esc(x)}</span>`).join("") || '<span class="null">none</span>'}</span></div>
      <div class="row"><span>environment</span>${env(t.environment, t.environment_null_reason)}</div>
      <div class="row"><span>place</span><span>${place}${t.fuji ? ' <span class="tag">Fuji</span>' : ""}</span></div>
      <div class="row"><span>palette</span><span class="pal">${(t.palette||[]).map(h => `<span style="background:${esc(h)}" title="${esc(h)}"></span>`).join("")}</span></div>
      <div class="row"><span>crop</span><span>${esc(t.crop_note || "")}</span></div>
      <div class="row"><span>confidence</span><span>${esc(conf)}</span></div>
      <div class="evidence">${esc(t.evidence || "")}</div>
      ${fr ? `<div class="friction">Friction: ${esc(fr)}</div>` : ""}
      <div class="review">
        <label><input type="checkbox" class="flag" ${n.flag ? "checked" : ""}> Disagree</label>
        <textarea class="note" placeholder="What's wrong? (e.g. 'this is dusk, not dawn')">${esc(n.note || "")}</textarea>
      </div>
    </div></article>`;
}
function render() {
  const f = document.getElementById("filter").value;
  const shown = DATA.filter(d => {
    const t = d.tags, m = d.meta;
    if (f === "included") return t.include;
    if (f === "excluded") return !t.include;
    if (f === "flagged") return (notes[m.id] || {}).flag;
    if (f === "friction") return t.taxonomy_friction && !/^\\s*(nothing|none)\\.?\\s*$/i.test(t.taxonomy_friction);
    if (["famous", "random_landscape", "kacho_e", "gap", "shin_hanga", "random"].includes(f)) return m.group === f;
    return true;
  });
  document.getElementById("grid").innerHTML = shown.map(card).join("");
  document.getElementById("count").textContent = `${shown.length} of ${DATA.length} prints`;
}
document.getElementById("filter").addEventListener("change", render);
document.getElementById("grid").addEventListener("input", e => {
  const art = e.target.closest(".card"); if (!art) return;
  const id = art.dataset.id; notes[id] = notes[id] || {};
  if (e.target.classList.contains("flag")) { notes[id].flag = e.target.checked; art.classList.toggle("flagged", e.target.checked); }
  if (e.target.classList.contains("note")) notes[id].note = e.target.value;
  save();
});
document.getElementById("export").addEventListener("click", () => {
  const out = document.getElementById("export-out");
  const kept = Object.fromEntries(Object.entries(notes).filter(([, v]) => v.flag || (v.note || "").trim()));
  out.style.display = "block"; out.value = JSON.stringify(kept, null, 1); out.select();
  try { document.execCommand("copy"); } catch (e) {}
});
render();
</script>
</body>
</html>
"""

(ROOT / f"contact_sheet{SUFFIX}.html").write_text(HTML.replace("__DATA__", data_js).replace("__VER__", VERSION))
print("wrote", ROOT / f"contact_sheet{SUFFIX}.html")
