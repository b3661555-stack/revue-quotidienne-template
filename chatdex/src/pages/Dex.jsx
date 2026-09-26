import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useApp, useApi } from '../store.jsx';
import { CatImage, Chip, EmptyState, ErrorState, Page, ProgressBar, RARITY, Segmented, Spinner, TopBar } from '../components/ui.jsx';
import { dexNo } from '../lib/format.js';
import { useT } from '../i18n/index.jsx';

export function CatCard({ cat, hidden = false }) {
  const t = useT();
  const r = RARITY[cat.rarity];
  return (
    <Link to={`/cat/${cat.id}`} className={`cat-card ${hidden ? 'cat-card-hidden' : ''}`} style={{ '--rc': r.color }}>
      <div className="cat-card-img">
        <CatImage cat={cat} photo={cat.photo} thumb={cat.thumb} />
        {!hidden && cat.rarity !== 'common' && <span className="cat-card-rarity" title={t.rarity(cat.rarity)}>{r.icon}</span>}
        {!hidden && cat.status === 'missing' && <span className="cat-card-missing" title={t('cat.notRecently')}>💤</span>}
      </div>
      <div className="cat-card-body">
        <span className="dexno">{dexNo(cat.dexNumber)}</span>
        <strong className="truncate">{hidden ? '???' : cat.name}</strong>
        {hidden && <span className="muted tiny truncate">{t('cat.near', { region: t.region(cat.region) })}</span>}
      </div>
    </Link>
  );
}

export default function Dex() {
  const { me } = useApp();
  const t = useT();
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
      <TopBar title={isOther ? t('dex.ofUser', { name: data?.owner?.displayName || user }) : t('nav.dex')} back={!!isOther} />
      {data && (
        <div className="card dex-progress">
          <div className="row between">
            <strong>{isOther ? t('dex.theyDiscovered', { name: data.owner.displayName }) : t('dex.youDiscovered')}</strong>
            <span className="dex-count"><strong>{data.collected}</strong> / {data.total}</span>
          </div>
          <ProgressBar value={data.collected} max={data.total} />
          <p className="muted small">{data.total - data.collected > 0 ? t('dex.toFind', { count: data.total - data.collected }) : t('dex.allFound')}</p>
        </div>
      )}
      {!isOther && (
        <Segmented value={scope === 'mine' ? 'mine' : 'all'} onChange={(v) => setParam('scope', v === 'all' ? '' : v)}
          options={[{ value: 'all', label: t('dex.allCats') }, { value: 'mine', label: t('dex.mine') }]} />
      )}
      <div className="search-field mt"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('dex.search')} aria-label={t('dex.search')} /></div>
      <div className="chips chips-scroll">
        <Chip active={!rarity} onClick={() => setParam('rarity', '')}>{t('common.all')}</Chip>
        {Object.entries(RARITY).map(([id, r]) => (
          <Chip key={id} active={rarity === id} onClick={() => setParam('rarity', rarity === id ? '' : id)}>{r.icon} {t.rarity(id)}</Chip>
        ))}
      </div>
      <div className="row between sort-row">
        <span className="muted small">{data ? t('common.cats', { count: data.cats.length }) : ''}</span>
        <select value={sort} onChange={(e) => setParam('sort', e.target.value)} aria-label={t('dex.sort')}>
          <option value="dex">{t('dex.sortDex')}</option>
          <option value="recent">{t('dex.sortRecent')}</option>
          <option value="rarity">{t('dex.sortRarity')}</option>
          <option value="popular">{t('dex.sortPopular')}</option>
        </select>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && !data.cats.length && (
        scope === 'mine' && !rarity && !debounced
          ? <EmptyState icon="📖" title={t('dex.emptyTitle')} text={t('dex.emptyText')} action={<Link to="/capture" className="btn btn-primary">📸 {t('dex.captureFirst')}</Link>} />
          : <EmptyState icon="🔍" title={t('dex.noMatch')} text={t('dex.noMatchText')} />
      )}
      {data && (
        <div className="cat-grid">
          {data.cats.map((c) => <CatCard key={c.id} cat={c} hidden={scope === 'all' && !c.collected} />)}
        </div>
      )}
    </Page>
  );
}
