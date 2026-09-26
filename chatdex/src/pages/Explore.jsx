import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import L from 'leaflet';
import { LocateFixed, Users } from 'lucide-react';
import { useApp, useApi } from '../store.jsx';
import { CatImage, Chip, ErrorState, Page, RARITY, RarityBadge, Spinner } from '../components/ui.jsx';
import { TILE_ATTR, TILE_URL } from '../components/MiniMap.jsx';
import { catSvg } from '../lib/catArt.js';
import { distanceKm, getPosition, lastKnownPosition } from '../lib/location.js';
import { plural, timeAgo } from '../lib/format.js';

const DEFAULT_CENTER = { lat: 46.49, lng: 6.75 }; // Lake Geneva, where the demo world lives

function catIcon(c) {
  const color = RARITY[c.rarity].color;
  const inner = c.thumb
    ? `<img src="${c.thumb}" alt="" />`
    : catSvg({ coatColor: c.coatColor, pattern: c.pattern, eyeColor: c.eyeColor, seed: c.artSeed, shiny: c.rarity === 'shiny' });
  return L.divIcon({
    className: '',
    html: `<div class="map-cat ${c.collected ? 'collected' : 'uncollected'} ${c.status === 'missing' ? 'missing' : ''}" style="--rc:${color}">${inner}</div>`,
    iconSize: [44, 44],
    iconAnchor: [22, 22],
  });
}

const hotspotIcon = (h) => L.divIcon({ className: '', html: `<div class="map-hot">🔥<span>${h.cats}</span></div>`, iconSize: [52, 30], iconAnchor: [26, 15] });
const hunterIcon = (h) => L.divIcon({ className: '', html: `<div class="map-hunter" style="background:${h.avatarColor}">${h.avatarEmoji}</div>`, iconSize: [30, 30], iconAnchor: [15, 15] });
const huntIcon = () => L.divIcon({ className: '', html: '<div class="map-hunt">🏹</div>', iconSize: [36, 36], iconAnchor: [18, 18] });
const meIcon = () => L.divIcon({ className: '', html: '<div class="map-me"><span></span></div>', iconSize: [22, 22], iconAnchor: [11, 11] });

export default function Explore() {
  const navigate = useNavigate();
  const { toast } = useApp();
  const { data, error, loading, reload } = useApi('/map');
  const [pos, setPos] = useState(lastKnownPosition());
  const [filter, setFilter] = useState('all');
  const [selected, setSelected] = useState(null);
  const [tilesFailed, setTilesFailed] = useState(false);
  const [locating, setLocating] = useState(false);
  const mapEl = useRef(null);
  const mapRef = useRef(null);
  const layerRef = useRef(null);
  const meRef = useRef(null);

  const locate = useCallback(async (silent) => {
    setLocating(true);
    try {
      const p = await getPosition();
      setPos(p);
      mapRef.current?.setView([p.lat, p.lng], 15);
    } catch (err) {
      if (!silent) toast(`${err.message} Showing the whole map instead.`, 'error');
    } finally {
      setLocating(false);
    }
  }, [toast]);

  // Map init
  useEffect(() => {
    if (!mapEl.current || mapRef.current) return undefined;
    const start = pos || DEFAULT_CENTER;
    const map = L.map(mapEl.current, { zoomControl: false, attributionControl: true }).setView([start.lat, start.lng], pos ? 14 : 11);
    let errors = 0;
    L.tileLayer(TILE_URL, { attribution: TILE_ATTR, maxZoom: 19, detectRetina: true })
      .on('tileerror', () => { errors += 1; if (errors > 4) setTilesFailed(true); })
      .on('tileload', () => { errors = 0; setTilesFailed(false); })
      .addTo(map);
    L.control.zoom({ position: 'topright' }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    map.on('click', () => setSelected(null));
    mapRef.current = map;
    if (!pos) locate(true);
    return () => { map.remove(); mapRef.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Me marker
  useEffect(() => {
    if (!mapRef.current || !pos) return;
    meRef.current?.remove();
    meRef.current = L.marker([pos.lat, pos.lng], { icon: meIcon(), interactive: false, zIndexOffset: 1000 }).addTo(mapRef.current);
  }, [pos]);

  const cats = useMemo(() => (data?.cats || []).filter((c) => (filter === 'all' ? true : filter === 'new' ? !c.collected : c.collected)), [data, filter]);

  // Data layers
  useEffect(() => {
    const layer = layerRef.current;
    if (!layer || !data) return;
    layer.clearLayers();
    data.hotspots.forEach((h) => {
      L.circle([h.lat, h.lng], { radius: 600, color: '#ff6b3d', weight: 1, fillColor: '#ff6b3d', fillOpacity: 0.08, interactive: false }).addTo(layer);
      L.marker([h.lat, h.lng], { icon: hotspotIcon(h) }).on('click', (e) => { L.DomEvent.stopPropagation(e); setSelected({ type: 'hotspot', item: h }); }).addTo(layer);
    });
    cats.forEach((c) => {
      L.marker([c.lat, c.lng], { icon: catIcon(c), title: c.name }).on('click', (e) => { L.DomEvent.stopPropagation(e); setSelected({ type: 'cat', item: c }); }).addTo(layer);
    });
    data.hunters.forEach((h) => {
      L.marker([h.lat, h.lng], { icon: hunterIcon(h), title: h.displayName }).on('click', (e) => { L.DomEvent.stopPropagation(e); setSelected({ type: 'hunter', item: h }); }).addTo(layer);
    });
    data.hunts.forEach((h) => {
      L.marker([h.lat, h.lng], { icon: huntIcon(), title: h.title }).on('click', (e) => { L.DomEvent.stopPropagation(e); setSelected({ type: 'hunt', item: h }); }).addTo(layer);
    });
  }, [data, cats]);

  const nearby = useMemo(() => {
    if (!pos || !data) return [];
    return data.cats.map((c) => ({ ...c, d: distanceKm(pos, c) })).filter((c) => c.d <= 2).sort((a, b) => a.d - b.d);
  }, [pos, data]);

  const focus = (c) => { mapRef.current?.setView([c.lat, c.lng], 16); setSelected({ type: 'cat', item: c }); };

  return (
    <Page className="explore">
      <div className="map-wrap">
        <div ref={mapEl} className="map" data-testid="map" />
        {loading && !data && <div className="map-loading"><Spinner /></div>}
        {error && <div className="map-loading"><ErrorState error={error} onRetry={reload} /></div>}
        {tilesFailed && <div className="map-fallback">🗺️ Map background unavailable (offline?). Cats are still shown below.</div>}
        <div className="map-top">
          <div className="chips">
            <Chip active={filter === 'all'} onClick={() => setFilter('all')}>All cats</Chip>
            <Chip active={filter === 'new'} onClick={() => setFilter('new')}>Not collected</Chip>
            <Chip active={filter === 'mine'} onClick={() => setFilter('mine')}>My cats</Chip>
          </div>
        </div>
        <button className="icon-btn map-locate" onClick={() => locate(false)} aria-label="Center on me">{locating ? '…' : <LocateFixed size={20} />}</button>

        {selected && (
          <div className="map-card card">
            {selected.type === 'cat' && (
              <div className="row gap" onClick={() => navigate(`/cat/${selected.item.id}`)} role="link" tabIndex={0}>
                <CatImage cat={selected.item} thumb={selected.item.thumb} className="map-card-img" />
                <div className="grow">
                  <strong>{selected.item.collected ? selected.item.name : `${selected.item.name}`}</strong>
                  <div><RarityBadge rarity={selected.item.rarity} small /></div>
                  <p className="muted small">{selected.item.collected ? '✅ In your Chatdex' : '🔎 Not collected yet'} · seen {timeAgo(selected.item.lastObservedAt)}</p>
                  {selected.item.legendTitle && <p className="small">{selected.item.legendTitle}</p>}
                </div>
              </div>
            )}
            {selected.type === 'hotspot' && (
              <div>
                <strong>🔥 Cat hotspot: {selected.item.region}</strong>
                <p className="small">🐈 {plural(selected.item.cats, 'cat')} observed here this week</p>
                <p className="small">👥 {plural(selected.item.hunters, 'hunter')} · 📸 {plural(selected.item.observations, 'sighting')}</p>
              </div>
            )}
            {selected.type === 'hunter' && (
              <Link to={`/u/${selected.item.username}`} className="row gap">
                <span className="map-hunter static" style={{ background: selected.item.avatarColor }}>{selected.item.avatarEmoji}</span>
                <span><strong>{selected.item.displayName}</strong> is hunting nearby<span className="muted small block">active {timeAgo(selected.item.lastActiveAt)} · area only</span></span>
              </Link>
            )}
            {selected.type === 'hunt' && (
              <Link to={`/hunts/${selected.item.id}`}>
                <strong>🏹 {selected.item.title}</strong>
                <p className="small">{selected.item.progress}/{selected.item.goal} cats found · tap to join</p>
              </Link>
            )}
          </div>
        )}
      </div>

      <section className="explore-sheet">
        <div className="row between">
          <h2 className="section-title">{pos ? (nearby.length ? `${plural(nearby.length, 'cat')} around you` : 'No known cats within 2 km') : 'Cats on the map'}</h2>
          <Link to="/hunts" className="btn btn-sm btn-ghost"><Users size={14} /> Hunts</Link>
        </div>
        {!pos && <p className="muted small">Turn on location to see the cats closest to you. <button className="btn btn-link" onClick={() => locate(false)}>Locate me</button></p>}
        {pos && !nearby.length && <p className="muted small">Uncharted territory! Every cat you find here will be a First Catch.</p>}
        <div className="hscroll">
          {(pos ? nearby : cats.slice(0, 20)).map((c) => (
            <button key={c.id} className="nearby-cat" onClick={() => focus(c)}>
              <CatImage cat={c} thumb={c.thumb} className={c.collected ? '' : 'dim'} />
              <strong className="truncate">{c.name}</strong>
              <span className="tiny muted">{c.d != null ? `${c.d < 1 ? `${Math.round(c.d * 1000)} m` : `${c.d.toFixed(1)} km`}` : c.region}</span>
            </button>
          ))}
        </div>
        {data && data.hotspots.length > 0 && (
          <>
            <h2 className="section-title">🔥 Hotspots this week</h2>
            <div className="hotspot-list">
              {data.hotspots.slice(0, 5).map((h, i) => (
                <button key={i} className="card hotspot" onClick={() => { mapRef.current?.setView([h.lat, h.lng], 15); setSelected({ type: 'hotspot', item: h }); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                  <span className="hotspot-flame">🔥</span>
                  <span className="grow"><strong>Cat hotspot: {h.region}</strong><span className="muted small block">🐈 {plural(h.cats, 'cat')} this week · 👥 {plural(h.hunters, 'hunter')}</span></span>
                </button>
              ))}
            </div>
          </>
        )}
        <p className="privacy-note">📍 Positions are approximate (~250 m) and never show a home. Watch from public ground, don't chase, and let cats come to you.</p>
      </section>
    </Page>
  );
}
