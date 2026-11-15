// Sun and moon position for a place and time (low-precision astronomical formulas,
// accurate to roughly a degree — plenty for "dawn, day, dusk, night" and "is the moon up").

const RAD = Math.PI / 180;
const OBLIQUITY = RAD * 23.4397;
const J2000 = 2451545;

function daysSinceJ2000(date) {
  return date.valueOf() / 86400000 + 2440587.5 - J2000;
}

function rightAscension(l, b) {
  return Math.atan2(Math.sin(l) * Math.cos(OBLIQUITY) - Math.tan(b) * Math.sin(OBLIQUITY), Math.cos(l));
}

function declination(l, b) {
  return Math.asin(Math.sin(b) * Math.cos(OBLIQUITY) + Math.cos(b) * Math.sin(OBLIQUITY) * Math.sin(l));
}

function siderealTime(d, lw) {
  return RAD * (280.16 + 360.9856235 * d) - lw;
}

function altitude(H, phi, dec) {
  return Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
}

function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d);
  const M = RAD * (134.963 + 13.064993 * d);
  const F = RAD * (93.272 + 13.229350 * d);
  const l = L + RAD * 6.289 * Math.sin(M);
  const b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
}

/** Sun elevation in degrees. */
export function sunElevation(date, lat, lon) {
  const d = daysSinceJ2000(date);
  const c = sunCoords(d);
  const H = siderealTime(d, RAD * -lon) - c.ra;
  return altitude(H, RAD * lat, c.dec) / RAD;
}

/** True before solar noon (sun climbing). */
export function isMorning(date, lat, lon) {
  const later = new Date(date.valueOf() + 10 * 60000);
  return sunElevation(later, lat, lon) > sunElevation(date, lat, lon);
}

/** Moon altitude in degrees and illuminated fraction (0 = new, 1 = full). */
export function moonInfo(date, lat, lon) {
  const d = daysSinceJ2000(date);
  const m = moonCoords(d);
  const H = siderealTime(d, RAD * -lon) - m.ra;
  const alt = altitude(H, RAD * lat, m.dec) / RAD;
  const s = sunCoords(d);
  const sdist = 149598000;
  const phi = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(phi), m.dist - sdist * Math.cos(phi));
  return { altitude: alt, fraction: (1 + Math.cos(inc)) / 2 };
}
