// Geolocation with graceful fallbacks. Positions are only used approximately (the server snaps them).
const KEY = 'chatdex.area';

export function getPosition({ timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) return reject(Object.assign(new Error('unavailable'), { code: 'unavailable' }));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const pos = { lat: p.coords.latitude, lng: p.coords.longitude, source: 'gps' };
        try { sessionStorage.setItem('chatdex.lastpos', JSON.stringify(pos)); } catch { /* ignore */ }
        resolve(pos);
      },
      (err) => {
        const code = err.code === 1 ? 'denied' : err.code === 3 ? 'timeout' : 'unavailable';
        reject(Object.assign(new Error(code), { code }));
      },
      { enableHighAccuracy: false, timeout, maximumAge: 120000 }
    );
  });
}

export async function locationPermission() {
  try {
    const p = await navigator.permissions.query({ name: 'geolocation' });
    return p.state; // granted | prompt | denied
  } catch {
    return 'prompt';
  }
}

export function lastKnownPosition() {
  try { return JSON.parse(sessionStorage.getItem('chatdex.lastpos')) || savedArea(); } catch { return savedArea(); }
}

export function savedArea() {
  try { return JSON.parse(localStorage.getItem(KEY)); } catch { return null; }
}

export function saveArea(region) {
  const pos = { lat: region.lat, lng: region.lng, source: 'manual', name: region.name };
  try { localStorage.setItem(KEY, JSON.stringify(pos)); } catch { /* ignore */ }
  return pos;
}

export function distanceKm(a, b) {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
