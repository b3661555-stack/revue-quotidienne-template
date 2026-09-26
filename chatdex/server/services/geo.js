// Location helpers. Privacy rule: exact coordinates never reach the database.
// Observations are snapped to a ~110 m grid, public cat positions to a ~250 m grid.

export const REGIONS = [
  ['Lausanne', 46.5197, 6.6323], ['Montreux', 46.4312, 6.9107], ['Vevey', 46.4628, 6.8419],
  ['Geneva', 46.2044, 6.1432], ['Nyon', 46.3833, 6.2396], ['Morges', 46.5113, 6.4985],
  ['Yverdon-les-Bains', 46.7785, 6.6412], ['Fribourg', 46.8065, 7.1619], ['Neuchâtel', 46.9900, 6.9293],
  ['Bern', 46.9480, 7.4474], ['Biel/Bienne', 47.1368, 7.2468], ['Basel', 47.5596, 7.5886],
  ['Zurich', 47.3769, 8.5417], ['Winterthur', 47.4988, 8.7237], ['Lucerne', 47.0502, 8.3093],
  ['Zug', 47.1662, 8.5155], ['St. Gallen', 47.4245, 9.3767], ['Chur', 46.8499, 9.5329],
  ['Lugano', 46.0037, 8.9511], ['Locarno', 46.1709, 8.7995], ['Bellinzona', 46.1946, 9.0244],
  ['Sion', 46.2331, 7.3606], ['Martigny', 46.1027, 7.0726], ['Aigle', 46.3180, 6.9709],
  ['Interlaken', 46.6863, 7.8632], ['Thun', 46.7580, 7.6280], ['Aarau', 47.3925, 8.0444],
  ['Schaffhausen', 47.6973, 8.6349], ['La Chaux-de-Fonds', 47.1035, 6.8328], ['Zermatt', 46.0207, 7.7491],
  ['Paris', 48.8566, 2.3522], ['Lyon', 45.7640, 4.8357], ['Annecy', 45.8992, 6.1294],
  ['Milan', 45.4642, 9.19], ['Munich', 48.1351, 11.582], ['London', 51.5072, -0.1276],
  ['Berlin', 52.52, 13.405], ['Amsterdam', 52.3676, 4.9041], ['Barcelona', 41.3874, 2.1686],
  ['Rome', 41.9028, 12.4964], ['Istanbul', 41.0082, 28.9784], ['New York', 40.7128, -74.006],
  ['Montreal', 45.5019, -73.5674], ['Tokyo', 35.6762, 139.6503],
].map(([name, lat, lng]) => ({ name, lat, lng }));

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;

export function distanceM(aLat, aLng, bLat, bLng) {
  const dLat = rad(bLat - aLat);
  const dLng = rad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export const snap = (v, step) => Math.round(v / step) * step;
export const roundCoord = (v, step = 0.001) => (v == null ? null : Number(snap(v, step).toFixed(4)));

export function isValidCoord(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

export function regionFor(lat, lng) {
  if (lat == null || lng == null) return 'Unknown area';
  let best = null;
  let bestD = Infinity;
  for (const r of REGIONS) {
    const d = distanceM(lat, lng, r.lat, r.lng);
    if (d < bestD) { bestD = d; best = r; }
  }
  if (best && bestD < 20000) return best.name;
  return `Wild zone ${lat.toFixed(1)}, ${lng.toFixed(1)}`;
}

export const isSwiss = (lat, lng) => lat != null && lat > 45.8 && lat < 47.85 && lng > 5.95 && lng < 10.5;
