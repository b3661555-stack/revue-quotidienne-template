import { lazy, Suspense, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera, ChevronLeft, Heart, MoreHorizontal, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp, useApi } from '../store.jsx';
import { Avatar, CatImage, Chip, ErrorState, Page, RARITY, RarityBadge, Sheet, Spinner, UserLink } from '../components/ui.jsx';
import { ReactionBar, ReportInline } from '../components/social.jsx';
import { dexNo, plural, shortDate, timeAgo } from '../lib/format.js';

const MiniMap = lazy(() => import('../components/MiniMap.jsx'));

function label(list, id) {
  return list.find((x) => x.id === id)?.label || id;
}

export default function CatProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { meta, toast } = useApp();
  const { data, error, loading, reload, setData } = useApi(`/cats/${id}`);
  const [menu, setMenu] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [photoView, setPhotoView] = useState(null);

  if (loading && !data) return <Page><Spinner /></Page>;
  if (error) return <Page><div className="topbar"><button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back"><ChevronLeft /></button></div><ErrorState error={error} onRetry={reload} /></Page>;
  const { cat, firstCatcher, tags, isFavorite, myObservations, leaders, observations, hunters } = data;
  const r = RARITY[cat.rarity];

  const toggleFavorite = async () => {
    try {
      const res = await api(`/cats/${cat.id}/favorite`, { method: 'POST' });
      setData((d) => ({ ...d, isFavorite: res.isFavorite, cat: { ...d.cat, favoriteCount: res.favoriteCount } }));
      if (res.isFavorite) toast(`❤️ ${cat.name} added to your favourites`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  };
  const toggleTag = async (tag) => {
    try {
      const res = await api(`/cats/${cat.id}/tags`, { method: 'POST', body: { tag } });
      setData((d) => ({ ...d, tags: res.tags }));
    } catch (err) { toast(err.message, 'error'); }
  };
  const photos = observations.filter((o) => o.photo || o.artSeed).slice(0, 12);

  return (
    <Page className="cat-profile">
      <div className="cat-hero" style={{ '--rc': r.color }}>
        <CatImage cat={cat} photo={cat.photo} thumb={cat.thumb} full className="cat-hero-img" />
        <div className="cat-hero-shade" />
        <div className="cat-hero-bar">
          <button className="icon-btn glass" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/dex'))} aria-label="Back"><ChevronLeft size={22} /></button>
          <div className="row gap-sm">
            <button className={`icon-btn glass ${isFavorite ? 'fav-on' : ''}`} onClick={toggleFavorite} aria-label={isFavorite ? 'Remove from favourites' : 'Add to favourites'} aria-pressed={isFavorite}>
              <Heart size={20} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button className="icon-btn glass" onClick={() => setMenu(true)} aria-label="More"><MoreHorizontal size={20} /></button>
          </div>
        </div>
        <div className="cat-hero-title">
          <span className="dexno light">{dexNo(cat.dexNumber)}</span>
          <h1>{cat.name}</h1>
          <div className="row gap-sm wrap">
            <RarityBadge rarity={cat.rarity} />
            {cat.legendTitle && <span className="pill pill-legend">{cat.legendTitle}</span>}
          </div>
        </div>
      </div>

      <div className="cat-body">
        <div className={`status-line ${cat.status}`}>
          {cat.status === 'active'
            ? <>🟢 Active · last seen {timeAgo(cat.lastObservedAt)}</>
            : <>💤 Not observed for {cat.daysSinceSeen} days. Spot it to bring it back to the feed!</>}
        </div>

        <div className="stat-row">
          <div><strong>{cat.observationCount}</strong><span>📸 sightings</span></div>
          <div><strong>{cat.hunterCount}</strong><span>👀 hunters</span></div>
          <div><strong>{cat.favoriteCount}</strong><span>❤️ favourites</span></div>
        </div>

        {firstCatcher && (
          <Link to={`/u/${firstCatcher.username}`} className="card first-catch-card">
            <span className="crown">👑</span>
            <div className="grow">
              <span className="kicker">First Catch</span>
              <strong>{firstCatcher.displayName}</strong>
              <span className="muted small block">discovered {cat.name} on {shortDate(cat.createdAt)} in {cat.region}</span>
            </div>
            <Avatar user={firstCatcher} size={44} />
          </Link>
        )}

        {myObservations > 0
          ? <p className="collected-line">✅ In your Chatdex · you've seen {cat.name} {plural(myObservations, 'time')}</p>
          : (
            <Link to="/capture" className="card card-cta not-collected">
              <Camera size={22} />
              <span className="grow"><strong>Not in your Chatdex yet</strong><span className="muted small block">Usually around {cat.region}. Keep your eyes open!</span></span>
            </Link>
          )}

        <section className="card">
          <h2 className="section-title">Looks</h2>
          <dl className="traits">
            <div><dt>Coat</dt><dd>{label(meta.coatColors, cat.coatColor)}</dd></div>
            <div><dt>Pattern</dt><dd>{label(meta.patterns, cat.pattern)}</dd></div>
            <div><dt>Eyes</dt><dd>{label(meta.eyeColors, cat.eyeColor)}</dd></div>
            <div><dt>Breed</dt><dd>{cat.breed === 'Unknown' ? 'Probably a lovely mix' : cat.breed}</dd></div>
          </dl>
          <h3 className="label">Personality <span className="hint">voted by hunters</span></h3>
          <div className="chips">
            {tags.map((t) => (
              <Chip key={t.tag} active={t.mine} onClick={() => toggleTag(t.tag)}>{t.tag} <span className="chip-count">{t.count}</span></Chip>
            ))}
            <Chip onClick={() => setTagOpen(true)}><Plus size={14} /> Add</Chip>
          </div>
        </section>

        <section className="card">
          <h2 className="section-title">Hall of fame</h2>
          <div className="leaders">
            <div className="leader"><span className="leader-icon">👑</span><span className="muted small">First Catch</span><UserLink user={leaders.firstCatch} /></div>
            <div className="leader"><span className="leader-icon">🥇</span><span className="muted small">Most sightings</span>{leaders.mostObservations && <><UserLink user={leaders.mostObservations.user} /><span className="tiny muted">{leaders.mostObservations.count}×</span></>}</div>
            <div className="leader"><span className="leader-icon">🔥</span><span className="muted small">Most recent</span>{leaders.mostRecent && <><UserLink user={leaders.mostRecent.user} /><span className="tiny muted">{timeAgo(leaders.mostRecent.at)}</span></>}</div>
          </div>
          {hunters.length > 0 && (
            <div className="hunter-stack">
              {hunters.slice(0, 12).map((h) => <Link key={h.id} to={`/u/${h.username}`} title={`#${h.rank} ${h.displayName}`}><Avatar user={h} size={32} /></Link>)}
              {hunters.length > 12 && <span className="muted small">+{hunters.length - 12}</span>}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="section-title">Territory</h2>
          <p className="muted small">Approximate area around {cat.region}. Exact locations are never shown. Please stay on public ground.</p>
          {cat.lat != null && (
            <Suspense fallback={<div className="minimap" />}><MiniMap lat={cat.lat} lng={cat.lng} color={r.color} /></Suspense>
          )}
        </section>

        {photos.length > 1 && (
          <section>
            <h2 className="section-title">Photos</h2>
            <div className="photo-grid">
              {photos.map((o) => (
                <button key={o.id} className="photo-cell" onClick={() => setPhotoView(o)} aria-label={`Photo by ${o.user.displayName}`}>
                  <CatImage cat={cat} photo={o.photo} thumb={o.thumb} variant={o.artSeed} />
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="section-title">Sightings</h2>
          <ol className="timeline">
            {observations.map((o) => (
              <li key={o.id} className="timeline-item">
                <Link to={`/u/${o.user.username}`}><Avatar user={o.user} size={36} /></Link>
                <div className="grow">
                  <p><UserLink user={o.user} /> {o.isFirstCatch && <span className="pill pill-gold">👑 First Catch</span>}</p>
                  <p className="muted small">{shortDate(o.createdAt)} · {timeAgo(o.createdAt)} · {o.region}</p>
                  <ReactionBar observation={o} />
                </div>
                <button className="timeline-thumb" onClick={() => setPhotoView(o)} aria-label="View photo">
                  <CatImage cat={cat} photo={o.photo} thumb={o.thumb} variant={o.artSeed} />
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title={cat.name}>
        <Link to="/capture" className="menu-row"><Camera size={18} /> I spotted {cat.name}</Link>
        <ReportInline targetType="cat" targetId={cat.id} onDone={() => setMenu(false)} />
      </Sheet>

      <Sheet open={tagOpen} onClose={() => setTagOpen(false)} title="Add a personality tag">
        <div className="chips">
          {meta.personalityTags.filter((t) => !tags.some((x) => x.tag === t)).map((t) => (
            <Chip key={t} onClick={() => { toggleTag(t); setTagOpen(false); }}>{t}</Chip>
          ))}
        </div>
        <form className="row gap mt" onSubmit={(e) => { e.preventDefault(); if (newTag.trim()) { toggleTag(newTag.trim()); setNewTag(''); setTagOpen(false); } }}>
          <input className="input grow" value={newTag} onChange={(e) => setNewTag(e.target.value)} maxLength={20} placeholder="Your own tag" aria-label="Your own tag" />
          <button className="btn btn-primary" disabled={!newTag.trim()}>Add</button>
        </form>
      </Sheet>

      <Sheet open={!!photoView} onClose={() => setPhotoView(null)} title={photoView ? `${photoView.user.displayName} · ${shortDate(photoView.createdAt)}` : ''}>
        {photoView && (
          <>
            <div className="photo-view"><CatImage cat={cat} photo={photoView.photo} thumb={photoView.thumb} variant={photoView.artSeed} full /></div>
            <ReactionBar observation={photoView} />
            <ReportInline targetType="observation" targetId={photoView.id} onDone={() => setPhotoView(null)} />
          </>
        )}
      </Sheet>
    </Page>
  );
}
