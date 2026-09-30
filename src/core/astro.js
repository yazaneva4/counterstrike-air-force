// Real astronomy for the live sky: where the Sun and Moon are for a given
// moment and place (low-precision series, accurate to well under a degree),
// the Moon's phase, and sidereal time for rotating the stars. Adapted from the
// standard formulas used by SunCalc (BSD-2, Vladimir Agafonkin).
//
// World axes: +X is east, +Z is south, -Z is north, +Y is up.

const RAD = Math.PI / 180, DAY = 86400000, J1970 = 2440588, J2000 = 2451545, OBLIQ = RAD * 23.4397;

const toDays = (date) => date.valueOf() / DAY - 0.5 + J1970 - J2000;
const rightAscension = (l, b) => Math.atan2(Math.sin(l) * Math.cos(OBLIQ) - Math.tan(b) * Math.sin(OBLIQ), Math.cos(l));
const declination = (l, b) => Math.asin(Math.sin(b) * Math.cos(OBLIQ) + Math.cos(b) * Math.sin(OBLIQ) * Math.sin(l));
const azimuth = (H, phi, dec) => Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(phi) - Math.tan(dec) * Math.cos(phi)); // from south, towards west
const altitude = (H, phi, dec) => Math.asin(Math.sin(phi) * Math.sin(dec) + Math.cos(phi) * Math.cos(dec) * Math.cos(H));
export const siderealTime = (d, lw) => RAD * (280.16 + 360.9856235 * d) - lw;

function sunCoords(d) {
  const M = RAD * (357.5291 + 0.98560028 * d);
  const C = RAD * (1.9148 * Math.sin(M) + 0.02 * Math.sin(2 * M) + 0.0003 * Math.sin(3 * M));
  const L = M + C + RAD * 102.9372 + Math.PI;
  return { dec: declination(L, 0), ra: rightAscension(L, 0) };
}

function moonCoords(d) {
  const L = RAD * (218.316 + 13.176396 * d), M = RAD * (134.963 + 13.064993 * d), F = RAD * (93.272 + 13.22935 * d);
  const l = L + RAD * 6.289 * Math.sin(M), b = RAD * 5.128 * Math.sin(F);
  return { ra: rightAscension(l, b), dec: declination(l, b), dist: 385001 - 20905 * Math.cos(M) };
}

// Horizontal coordinates to a world direction vector {x, y, z}.
export function horizontalToWorld(alt, az, out = {}) {
  out.x = -Math.sin(az) * Math.cos(alt); out.y = Math.sin(alt); out.z = Math.cos(az) * Math.cos(alt);
  return out;
}

// Everything the sky needs for a moment and a place (lat/lon in degrees).
export function skyAt(date, lat, lon) {
  const d = toDays(date), lw = RAD * -lon, phi = RAD * lat;
  const s = sunCoords(d), m = moonCoords(d);
  const st = siderealTime(d, lw);
  const Hs = st - s.ra, Hm = st - m.ra;
  // Moon phase: angle between the Sun and Moon as seen from Earth.
  const sdist = 149598000;
  const ph = Math.acos(Math.sin(s.dec) * Math.sin(m.dec) + Math.cos(s.dec) * Math.cos(m.dec) * Math.cos(s.ra - m.ra));
  const inc = Math.atan2(sdist * Math.sin(ph), m.dist - sdist * Math.cos(ph));
  const angle = Math.atan2(Math.cos(s.dec) * Math.sin(s.ra - m.ra), Math.sin(s.dec) * Math.cos(m.dec) - Math.cos(s.dec) * Math.sin(m.dec) * Math.cos(s.ra - m.ra));
  return {
    sun: { alt: altitude(Hs, phi, s.dec), az: azimuth(Hs, phi, s.dec), dec: s.dec },
    moon: { alt: altitude(Hm, phi, m.dec), az: azimuth(Hm, phi, m.dec) },
    illumination: (1 + Math.cos(inc)) / 2,
    phase: 0.5 + (0.5 * inc * (angle < 0 ? -1 : 1)) / Math.PI,   // 0 new, 0.25 first quarter, 0.5 full, 0.75 last quarter
    siderealTime: st,
  };
}
