// Georeferencing of plan.jpg and Google Maps links.
//
// The old plan is schematic and rotated (Calea Șerban Vodă along the bottom ≈ west). It was fitted with a
// projective transform to the north-up colour board (photos/board-ortodox-numbered.jpg, 150 m scale bar)
// using 27 matching labels/landmarks (~8 m RMS), then anchored to published GPS points: the Google Maps pin
// for the cemetery (main gate, 44.403148, 26.097998), the Wikipedia centre point (Capela Sf. Ioan
// Botezătorul, 44.40389, 26.10000) and Eminescu's grave (Fig. 9, 44.4024, 26.0991); they agree to ~11 m.
// Expect positions to be good to roughly ±20–30 m: enough to find the plot, not the exact stone.

/** Homography: [x, y, 1] (plan pixels) → [lng·w, lat·w, w]. */
const H = [
  [-3.385266139215e-3, -2.473988383342e-3, 26.09923063041],
  [-5.765413522247e-3, -4.204266521755e-3, 44.40796967349],
  [-1.297784209699e-4, -9.464978606138e-5, 1],
];

function invert3(m: number[][]): number[][] {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [
    [A / det, -(b * i - c * h) / det, (b * f - c * e) / det],
    [B / det, (a * i - c * g) / det, -(a * f - c * d) / det],
    [C / det, -(a * h - b * g) / det, (a * e - b * d) / det],
  ];
}
const HINV = invert3(H);

const apply = (m: number[][], u: number, v: number) => {
  const w = m[2][0] * u + m[2][1] * v + m[2][2];
  return [(m[0][0] * u + m[0][1] * v + m[0][2]) / w, (m[1][0] * u + m[1][1] * v + m[1][2]) / w];
};

export interface LatLng {
  lat: number;
  lng: number;
}

export function planToGps([x, y]: [number, number]): LatLng {
  const [lng, lat] = apply(H, x, y);
  return { lat, lng };
}

export function gpsToPlan({ lat, lng }: LatLng): [number, number] {
  const [x, y] = apply(HINV, lng, lat);
  return [x, y];
}

const M_PER_DEG_LAT = 111_132;
const mPerDegLng = (lat: number) => 111_320 * Math.cos((lat * Math.PI) / 180);

/** Shift a point by metres east/north (good enough at cemetery scale). */
export function offset(p: LatLng, east: number, north: number): LatLng {
  return { lat: p.lat + north / M_PER_DEG_LAT, lng: p.lng + east / mPerDegLng(p.lat) };
}

/** Distance in metres and compass direction from a to b. */
export function heading(a: LatLng, b: LatLng): { m: number; dir: string } {
  const east = (b.lng - a.lng) * mPerDegLng(a.lat);
  const north = (b.lat - a.lat) * M_PER_DEG_LAT;
  const deg = ((Math.atan2(east, north) * 180) / Math.PI + 360) % 360;
  const dir = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"][Math.round(deg / 45) % 8];
  return { m: Math.hypot(east, north), dir };
}

export const BELLU: LatLng = { lat: 44.403148, lng: 26.097998 }; // main gate, Calea Șerban Vodă 249
const BELLU_PLACE = "Cimitirul Bellu, Calea Șerban Vodă 249, București";

const fmt = (p: LatLng) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

/** Google Maps directions (opens the app on phones). No travel mode → Google's default for the user. */
export function directionsUrl(to?: LatLng, walking = false): string {
  const u = new URL("https://www.google.com/maps/dir/");
  u.searchParams.set("api", "1");
  u.searchParams.set("destination", to ? fmt(to) : BELLU_PLACE);
  if (walking) u.searchParams.set("travelmode", "walking");
  return u.toString();
}

/** Google Maps pin at a point (satellite / Street View are one tap away there). */
export function mapsUrl(at: LatLng): string {
  const u = new URL("https://www.google.com/maps/search/");
  u.searchParams.set("api", "1");
  u.searchParams.set("query", fmt(at));
  return u.toString();
}
