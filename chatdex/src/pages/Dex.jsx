import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useApp, useApi } from '../store.jsx';
import { CatImage, Chip, EmptyState, ErrorState, Page, ProgressBar, RARITY, Segmented, Spinner, TopBar } from '../components/ui.jsx';
import { dexNo } from '../lib/format.js';

export function CatCard({ cat, hidden = false }) {
  const r = RARITY[cat.rarity];
  return (
    <Link to={`/cat/${cat.id}`} className={`cat-card ${hidden ? 'cat-card-hidden' : ''}`} style={{ '--rc': r.color }}>
      <div className="cat-card-img">
        <CatImage cat={cat} photo={cat.photo} thumb={cat.thumb} />
        {!hidden && cat.rarity !== 'common' && <span className="cat-card-rarity" title={r.label}>{r.icon}</span>}
        {!hidden && cat.status === 'missing' && <span className="cat-card-missing" title="Not observed recently">💤</span>}
      </div>
      <div className="cat-card-body">
        <span className="dexno">{dexNo(cat.dexNumber)}</span>
        <strong className="truncate">{hidden ? '???' : cat.name}</strong>
        {hidden && <span className="muted tiny truncate">near {cat.region}</span>}
      </div>
    </Link>
  );
}

export default function Dex() {
  const { me } = useApp();
  const [params, setParams] = useSearchParams();
  const user = params.get('user');
  const scope = user ? `user:${user}` : params.get('scope') || 'all';
  const rarity = params.get('rarity') || '';
  const sort = params.get('sort') || 'dex';
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  useEffect(() => { const t = setTimeout(() => setDebounced(q), 250); return () => clearTimeout(t); }, [q]);

  const { data, error, loading, reload } = useApi(`/cats?scope=${encodeURIComponent(scope)}&rarity=${rarity}&sort=${sort}&q=${encodeURIComponent(debounced)}`);
  const setParam = (k, v) => {
    const p = new URLSearchParams(params);
    if (v) p.set(k, v); else p.delete(k);
    setParams(p, { replace: true });
  };
  const isOther = user && user !== me.user.username;

  return (
    <Page className="dex">
      <TopBar title={isOther ? `${data?.owner?.displayName || user}'s Chatdex` : 'Chatdex'} back={!!isOther} />
      {data && (
        <div className="card dex-progress">
          <div className="row between">
            <strong>{isOther ? `${data.owner.displayName} discovered` : 'You discovered'}</strong>
            <span className="dex-count"><strong>{data.collected}</strong> / {data.total}</span>
          </div>
          <ProgressBar value={data.collected} max={data.total} />
          <p className="muted small">{data.total - data.collected > 0 ? `${data.total - data.collected} community cats still to find.` : 'You found every known cat. Legendary!'}</p>
        </div>
      )}
      {!isOther && (
        <Segmented value={scope === 'mine' ? 'mine' : 'all'} onChange={(v) => setParam('scope', v === 'all' ? '' : v)}
          options={[{ value: 'all', label: 'All cats' }, { value: 'mine', label: 'My collection' }]} />
      )}
      <div className="search-field mt"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a name or town" aria-label="Search cats" /></div>
      <div className="chips chips-scroll">
        <Chip active={!rarity} onClick={() => setParam('rarity', '')}>All</Chip>
        {Object.entries(RARITY).map(([id, r]) => (
          <Chip key={id} active={rarity === id} onClick={() => setParam('rarity', rarity === id ? '' : id)}>{r.icon} {r.label}</Chip>
        ))}
      </div>
      <div className="row between sort-row">
        <span className="muted small">{data ? `${data.cats.length} cats` : ''}</span>
        <select value={sort} onChange={(e) => setParam('sort', e.target.value)} aria-label="Sort">
          <option value="dex">Dex number</option>
          <option value="recent">Recently seen</option>
          <option value="rarity">Rarity</option>
          <option value="popular">Most hunted</option>
        </select>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && !data.cats.length && (
        scope === 'mine' && !rarity && !debounced
          ? <EmptyState icon="📖" title="Your Chatdex is empty" text="Every cat you photograph lands here. Go meet one!" action={<Link to="/capture" className="btn btn-primary">📸 Capture your first cat</Link>} />
          : <EmptyState icon="🔍" title="No cats match" text="Try another filter or search." />
      )}
      {data && (
        <div className="cat-grid">
          {data.cats.map((c) => <CatCard key={c.id} cat={c} hidden={scope === 'all' && !c.collected} />)}
        </div>
      )}
    </Page>
  );
}
