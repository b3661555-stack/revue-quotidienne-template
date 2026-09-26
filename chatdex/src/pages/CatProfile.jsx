import { lazy, Suspense, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Camera, ChevronLeft, Heart, MoreHorizontal, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api.js';
import { useApp, useApi } from '../store.jsx';
import { Avatar, CatImage, Chip, ErrorState, Page, RARITY, RarityBadge, Sheet, Spinner, UserLink } from '../components/ui.jsx';
import { ReactionBar, ReportInline } from '../components/social.jsx';
import { dexNo } from '../lib/format.js';
import { errorText, useT } from '../i18n/index.jsx';

const MiniMap = lazy(() => import('../components/MiniMap.jsx'));


export default function CatProfile() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { meta, toast } = useApp();
  const t = useT();
  const { data, error, loading, reload, setData } = useApi(`/cats/${id}`);
  const [menu, setMenu] = useState(false);
  const [tagOpen, setTagOpen] = useState(false);
  const [newTag, setNewTag] = useState('');
  const [photoView, setPhotoView] = useState(null);

  if (loading && !data) return <Page><Spinner /></Page>;
  if (error) return <Page><div className="topbar"><button className="icon-btn" onClick={() => navigate(-1)} aria-label={t('common.back')}><ChevronLeft className="flip-rtl" /></button></div><ErrorState error={error} onRetry={reload} /></Page>;
  const { cat, firstCatcher, tags, isFavorite, myObservations, leaders, observations, hunters } = data;
  const r = RARITY[cat.rarity];

  const toggleFavorite = async () => {
    try {
      const res = await api(`/cats/${cat.id}/favorite`, { method: 'POST' });
      setData((d) => ({ ...d, isFavorite: res.isFavorite, cat: { ...d.cat, favoriteCount: res.favoriteCount } }));
      if (res.isFavorite) toast(`❤️ ${t('cat.favAdded', { name: cat.name })}`, 'success');
    } catch (err) { toast(errorText(t, err), 'error'); }
  };
  const toggleTag = async (tag) => {
    try {
      const res = await api(`/cats/${cat.id}/tags`, { method: 'POST', body: { tag } });
      setData((d) => ({ ...d, tags: res.tags }));
    } catch (err) { toast(errorText(t, err), 'error'); }
  };
  const photos = observations.filter((o) => o.photo || o.artSeed).slice(0, 12);

  return (
    <Page className="cat-profile">
      <div className="cat-hero" style={{ '--rc': r.color }}>
        <CatImage cat={cat} photo={cat.photo} thumb={cat.thumb} full className="cat-hero-img" />
        <div className="cat-hero-shade" />
        <div className="cat-hero-bar">
          <button className="icon-btn glass" onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/dex'))} aria-label={t('common.back')}><ChevronLeft size={22} className="flip-rtl" /></button>
          <div className="row gap-sm">
            <button className={`icon-btn glass ${isFavorite ? 'fav-on' : ''}`} onClick={toggleFavorite} aria-label={isFavorite ? t('cat.unfav') : t('cat.fav')} aria-pressed={isFavorite}>
              <Heart size={20} fill={isFavorite ? 'currentColor' : 'none'} />
            </button>
            <button className="icon-btn glass" onClick={() => setMenu(true)} aria-label={t('common.more')}><MoreHorizontal size={20} /></button>
          </div>
        </div>
        <div className="cat-hero-title">
          <span className="dexno light">{dexNo(cat.dexNumber)}</span>
          <h1>{cat.name}</h1>
          <div className="row gap-sm wrap">
            <RarityBadge rarity={cat.rarity} />
            {cat.legend && <span className="pill pill-legend">{cat.legend.kind === 'legend' ? `👑 ${cat.legend.region ? t('cat.legendOf', { region: cat.legend.region }) : t('cat.legendWild')}` : `🔥 ${t('cat.celebrity', { region: t.region(cat.legend.region) })}`}</span>}
          </div>
        </div>
      </div>

      <div className="cat-body">
        <div className={`status-line ${cat.status}`}>
          {cat.status === 'active'
            ? <>🟢 {t('cat.active')} · {t('cat.lastSeen', { when: t.timeAgo(cat.lastObservedAt) })}</>
            : <>💤 {t('cat.missing', { count: cat.daysSinceSeen })}</>}
        </div>

        <div className="stat-row">
          <div><strong>{cat.observationCount}</strong><span>📸 {t('stat.sightings')}</span></div>
          <div><strong>{cat.hunterCount}</strong><span>👀 {t('stat.hunters')}</span></div>
          <div><strong>{cat.favoriteCount}</strong><span>❤️ {t('stat.favourites')}</span></div>
        </div>

        {firstCatcher && (
          <Link to={`/u/${firstCatcher.username}`} className="card first-catch-card">
            <span className="crown">👑</span>
            <div className="grow">
              <span className="kicker">{t('cat.firstCatch')}</span>
              <strong>{firstCatcher.displayName}</strong>
              <span className="muted small block">{t('cat.discoveredOn', { name: cat.name, date: t.date(cat.createdAt), region: t.region(cat.region) })}</span>
            </div>
            <Avatar user={firstCatcher} size={44} />
          </Link>
        )}

        {myObservations > 0
          ? <p className="collected-line">✅ {t('cat.inDex')} · {t('cat.seenTimes', { name: cat.name, count: myObservations })}</p>
          : (
            <Link to="/capture" className="card card-cta not-collected">
              <Camera size={22} />
              <span className="grow"><strong>{t('cat.notInDex')}</strong><span className="muted small block">{t('cat.usuallyAround', { region: t.region(cat.region) })}</span></span>
            </Link>
          )}

        <section className="card">
          <h2 className="section-title">{t('cat.looks')}</h2>
          <dl className="traits">
            <div><dt>{t('attr.coat')}</dt><dd>{t(`coat.${cat.coatColor}`)}</dd></div>
            <div><dt>{t('attr.pattern')}</dt><dd>{t(`pattern.${cat.pattern}`)}</dd></div>
            <div><dt>{t('attr.eyes')}</dt><dd>{t(`eyes.${cat.eyeColor}`)}</dd></div>
            <div><dt>{t('attr.breed')}</dt><dd>{cat.breed === 'Unknown' ? t('cat.mix') : cat.breed}</dd></div>
          </dl>
          <h3 className="label">{t('attr.personality')} <span className="hint">{t('cat.voted')}</span></h3>
          <div className="chips">
            {tags.map((tg) => (
              <Chip key={tg.tag} active={tg.mine} onClick={() => toggleTag(tg.tag)}>{t.tag(tg.tag)} <span className="chip-count">{tg.count}</span></Chip>
            ))}
            <Chip onClick={() => setTagOpen(true)}><Plus size={14} /> {t('common.add')}</Chip>
          </div>
        </section>

        <section className="card">
          <h2 className="section-title">{t('cat.hallOfFame')}</h2>
          <div className="leaders">
            <div className="leader"><span className="leader-icon">👑</span><span className="muted small">{t('cat.firstCatch')}</span><UserLink user={leaders.firstCatch} /></div>
            <div className="leader"><span className="leader-icon">🥇</span><span className="muted small">{t('cat.mostSightings')}</span>{leaders.mostObservations && <><UserLink user={leaders.mostObservations.user} /><span className="tiny muted">{leaders.mostObservations.count}×</span></>}</div>
            <div className="leader"><span className="leader-icon">🔥</span><span className="muted small">{t('cat.mostRecent')}</span>{leaders.mostRecent && <><UserLink user={leaders.mostRecent.user} /><span className="tiny muted">{t.timeAgo(leaders.mostRecent.at)}</span></>}</div>
          </div>
          {hunters.length > 0 && (
            <div className="hunter-stack">
              {hunters.slice(0, 12).map((h) => <Link key={h.id} to={`/u/${h.username}`} title={`#${h.rank} ${h.displayName}`}><Avatar user={h} size={32} /></Link>)}
              {hunters.length > 12 && <span className="muted small">+{hunters.length - 12}</span>}
            </div>
          )}
        </section>

        <section className="card">
          <h2 className="section-title">{t('cat.territory')}</h2>
          <p className="muted small">{t('cat.territoryText', { region: t.region(cat.region) })}</p>
          {cat.lat != null && (
            <Suspense fallback={<div className="minimap" />}><MiniMap lat={cat.lat} lng={cat.lng} color={r.color} /></Suspense>
          )}
        </section>

        {photos.length > 1 && (
          <section>
            <h2 className="section-title">{t('cat.photos')}</h2>
            <div className="photo-grid">
              {photos.map((o) => (
                <button key={o.id} className="photo-cell" onClick={() => setPhotoView(o)} aria-label={t('cat.photoBy', { name: o.user.displayName })}>
                  <CatImage cat={cat} photo={o.photo} thumb={o.thumb} variant={o.artSeed} />
                </button>
              ))}
            </div>
          </section>
        )}

        <section>
          <h2 className="section-title">{t('cat.sightings')}</h2>
          <ol className="timeline">
            {observations.map((o) => (
              <li key={o.id} className="timeline-item">
                <Link to={`/u/${o.user.username}`}><Avatar user={o.user} size={36} /></Link>
                <div className="grow">
                  <p><UserLink user={o.user} /> {o.isFirstCatch && <span className="pill pill-gold">👑 {t('cat.firstCatch')}</span>}</p>
                  <p className="muted small">{t.date(o.createdAt)} · {t.timeAgo(o.createdAt)} · {t.region(o.region)}</p>
                  <ReactionBar observation={o} />
                </div>
                <button className="timeline-thumb" onClick={() => setPhotoView(o)} aria-label={t('cat.viewPhoto')}>
                  <CatImage cat={cat} photo={o.photo} thumb={o.thumb} variant={o.artSeed} />
                </button>
              </li>
            ))}
          </ol>
        </section>
      </div>

      <Sheet open={menu} onClose={() => setMenu(false)} title={cat.name}>
        <Link to="/capture" className="menu-row"><Camera size={18} /> {t('cat.iSpotted', { name: cat.name })}</Link>
        <ReportInline targetType="cat" targetId={cat.id} onDone={() => setMenu(false)} />
      </Sheet>

      <Sheet open={tagOpen} onClose={() => setTagOpen(false)} title={t('cat.addTag')}>
        <div className="chips">
          {meta.personalityTags.filter((tg) => !tags.some((x) => x.tag === tg)).map((tg) => (
            <Chip key={tg} onClick={() => { toggleTag(tg); setTagOpen(false); }}>{t.tag(tg)}</Chip>
          ))}
        </div>
        <form className="row gap mt" onSubmit={(e) => { e.preventDefault(); if (newTag.trim()) { toggleTag(newTag.trim()); setNewTag(''); setTagOpen(false); } }}>
          <input className="input grow" value={newTag} onChange={(e) => setNewTag(e.target.value)} maxLength={20} placeholder={t('cat.ownTag')} aria-label={t('cat.ownTag')} />
          <button className="btn btn-primary" disabled={!newTag.trim()}>{t('common.add')}</button>
        </form>
      </Sheet>

      <Sheet open={!!photoView} onClose={() => setPhotoView(null)} title={photoView ? `${photoView.user.displayName} · ${t.date(photoView.createdAt)}` : ''}>
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
