// Icon set: thin line drawings on a 24 × 24 grid, drawn in the current text colour.
// Parts with class "f" are filled; class "bg" is filled with the panel colour to hide what lies behind.
// Rain is drawn as fine slanted lines and mist as long bands, after the ukiyo-e conventions.

const svg = (body, label) =>
  `<svg class="ico" viewBox="0 0 24 24" role="img" aria-label="${label}">${body}</svg>`;

// ---------------------------------------------------------------- building blocks

const CLOUD = "M7 13.5h9.5a3.5 3.5 0 0 0 .4-7a5 5 0 0 0-9.6 1.4A2.8 2.8 0 0 0 7 13.5z";
const cloud = (dx = 0, dy = 0, cls = "bg") => `<path class="${cls}" transform="translate(${dx} ${dy})" d="${CLOUD}"/>`;

function rays(cx, cy, r1, r2, angles) {
  return angles.map((deg) => {
    const a = (deg * Math.PI) / 180;
    const p = (r) => `${(cx + Math.cos(a) * r).toFixed(2)} ${(cy - Math.sin(a) * r).toFixed(2)}`;
    return `<path d="M${p(r1)}L${p(r2)}"/>`;
  }).join("");
}

const sun = (cx, cy, r, rayIn, rayOut) =>
  `<circle class="f" cx="${cx}" cy="${cy}" r="${r}"/>` + rays(cx, cy, rayIn, rayOut, [0, 45, 90, 135, 180, 225, 270, 315]);

const MOON = (s = 1, dx = 0, dy = 0) =>
  `<path class="f" transform="translate(${dx} ${dy}) scale(${s})" d="M19 14.6A7.6 7.6 0 1 1 9.4 5a6 6 0 0 0 9.6 9.6z"/>`;

/** Slanted rain lines below a cloud: [x, y, length] each. */
const rainLines = (lines) => lines.map(([x, y, len]) => `<path d="M${x} ${y}l${(-len * 0.32).toFixed(2)} ${len}"/>`).join("");
const dots = (pts) => pts.map(([x, y]) => `<circle class="f" cx="${x}" cy="${y}" r="1.05"/>`).join("");

function gearPath(cx = 12, cy = 12, teeth = 8, rOut = 9.6, rIn = 7.4) {
  const pts = [];
  for (let i = 0; i < teeth; i++) {
    const a = (i * 2 * Math.PI) / teeth;
    for (const [off, r] of [[-0.3, rIn], [-0.17, rOut], [0.17, rOut], [0.3, rIn]]) {
      pts.push(`${(cx + Math.cos(a + off) * r).toFixed(2)} ${(cy + Math.sin(a + off) * r).toFixed(2)}`);
    }
  }
  return `M${pts.join("L")}z`;
}

// ---------------------------------------------------------------- icons

export const ICON = {
  // weather states
  clear: svg(sun(12, 12, 4.2, 6.6, 9.2), "clear"),
  clear_night: svg(MOON(1, 0, 0), "clear night"),
  partly_cloudy: svg(sun(9, 8.5, 3, 4.8, 6.6) + cloud(2.5, 5), "partly cloudy"),
  partly_cloudy_night: svg(MOON(0.62, 2.2, 1.2) + cloud(2.5, 5), "partly cloudy night"),
  cloudy: svg(cloud(-2.2, 1.5, "bg") + cloud(2.2, 4.5), "overcast"),
  fog: svg('<path d="M3.5 7.5h11"/><path d="M8.5 12h12"/><path d="M3 16.5h12.5"/><path d="M11 20.5h7" opacity=".6"/>', "fog"),
  drizzle: svg(cloud(0, -1) + rainLines([[8.5, 15.5, 2.6], [12.5, 16.5, 2.6], [16.5, 15.5, 2.6]]), "drizzle"),
  rain: svg(cloud(0, -1.5) + rainLines([[7.5, 14.5, 6], [11, 15.5, 6], [14.5, 14.5, 6], [18, 15.5, 5]]), "rain"),
  heavy_rain: svg(cloud(0, -2) + rainLines([[6.5, 13.5, 8], [9.5, 14.5, 8], [12.5, 13.5, 8.5], [15.5, 14.5, 8], [18.5, 13.5, 7]]), "heavy rain"),
  sleet: svg(cloud(0, -1.5) + rainLines([[8, 15, 4.5], [15, 15, 4.5]]) + dots([[11.6, 17], [18.4, 17.5], [10.6, 21]]), "sleet"),
  snow: svg(cloud(0, -1.5) + dots([[8, 16.2], [12, 15.8], [16, 16.2], [10, 19.4], [14, 19.4], [12, 22.4]]), "snow"),
  thunder: svg(cloud(0, -1.5) + '<path class="f" d="M12.8 13.2 9.6 18.2h3.1l-1.6 4.6 4.6-6.2h-3.2l1.8-3.4z"/>', "thunderstorm"),

  // details
  sunrise: svg('<path d="M2.5 19h19"/><path class="f" d="M7 19a5 5 0 0 1 10 0z"/>' +
    rays(12, 19, 6.8, 9.2, [45, 135]) + '<path d="M12 12v-8M9.4 6.6 12 4l2.6 2.6"/>', "sunrise"),
  sunset: svg('<path d="M2.5 19h19"/><path class="f" d="M7 19a5 5 0 0 1 10 0z"/>' +
    rays(12, 19, 6.8, 9.2, [45, 135]) + '<path d="M12 4v8M9.4 9.4 12 12l2.6-2.6"/>', "sunset"),
  wind: svg('<path d="M3 9h10.5a3 3 0 1 0-3-3"/><path d="M3 14h15a3 3 0 1 1-3 3"/>', "wind"),
  drop: svg('<path d="M12 3.5c3.2 4.4 5.5 7.4 5.5 10.2a5.5 5.5 0 0 1-11 0c0-2.8 2.3-5.8 5.5-10.2z"/>', "chance of rain"),
  gear: svg(`<path d="${gearPath()}"/><circle cx="12" cy="12" r="3"/>`, "settings"),
  // circle fills the whole icon box, so the button's edge is the circle's edge (for exact spacing)
  close: svg('<circle cx="12" cy="12" r="11.2"/><path d="M8.2 8.2l7.6 7.6M15.8 8.2l-7.6 7.6"/>', "close"),
  info: svg('<circle cx="12" cy="12" r="9.2"/><path d="M12 10.8v6"/><circle class="f" cx="12" cy="7.6" r="1.1"/>', "credits"),
};

/** Icon for a WMO weather code; night swaps the sun for the moon. */
export function weatherIcon(code, night = false) {
  const c = Number(code);
  if (c <= 1) return night ? ICON.clear_night : ICON.clear;
  if (c === 2) return night ? ICON.partly_cloudy_night : ICON.partly_cloudy;
  if (c === 3) return ICON.cloudy;
  if (c === 45 || c === 48) return ICON.fog;
  if (c >= 51 && c <= 55) return ICON.drizzle;
  if (c === 56 || c === 57 || c === 66 || c === 67) return ICON.sleet;
  if (c === 61) return ICON.drizzle;
  if (c === 63 || c === 80 || c === 81) return ICON.rain;
  if (c === 65 || c === 82) return ICON.heavy_rain;
  if ((c >= 71 && c <= 77) || c === 85 || c === 86) return ICON.snow;
  if (c >= 95) return ICON.thunder;
  return ICON.cloudy;
}
