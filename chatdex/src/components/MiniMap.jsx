import { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { useT } from '../i18n/index.jsx';

export const TILE_URL = 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';
export const TILE_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

/** Small static map showing a cat's approximate area as a soft circle, never a pin on a house. */
export default function MiniMap({ lat, lng, color = '#ff6b3d', radius = 250 }) {
  const el = useRef(null);
  const t = useT();
  const [tilesFailed, setTilesFailed] = useState(false);
  useEffect(() => {
    if (!el.current || lat == null) return undefined;
    const map = L.map(el.current, { zoomControl: false, attributionControl: true, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, touchZoom: false, boxZoom: false, keyboard: false })
      .setView([lat, lng], 15);
    let errors = 0;
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19 })
      .on('tileerror', () => { errors += 1; if (errors > 3) setTilesFailed(true); })
      .addTo(map);
    L.circle([lat, lng], { radius, color, weight: 2, fillColor: color, fillOpacity: 0.18 }).addTo(map);
    return () => map.remove();
  }, [lat, lng, color, radius]);
  return (
    <div className="minimap-wrap">
      <div ref={el} className="minimap" />
      {tilesFailed && <div className="map-fallback small">{t('map.previewUnavailable')}</div>}
    </div>
  );
}
