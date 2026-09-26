import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Camera, ChevronRight } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useApi } from '../store.jsx';
import { Avatar, EmptyState, ErrorState, LevelBar, Page, ProgressBar, Segmented, Spinner } from '../components/ui.jsx';
import { FeedItem, huntTitle } from '../components/social.jsx';
import { distanceKm, getPosition, lastKnownPosition, locationPermission } from '../lib/location.js';
import { errorText, useT } from '../i18n/index.jsx';

function NearbyCard() {
  const navigate = useNavigate();
  const t = useT();
  const [state, setState] = useState({ status: 'idle' });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let pos = lastKnownPosition();
      if (!pos && (await locationPermission()) === 'granted') pos = await getPosition().catch(() => null);
      if (!pos) { if (!cancelled) setState({ status: 'nolocation' }); return; }
      try {
        const map = await api('/map');
        const near = map.cats.filter((c) => distanceKm(pos, c) <= 2);
        const hot = map.hotspots.filter((h) => distanceKm(pos, h) <= 5);
        if (!cancelled) setState({ status: 'ok', near: near.length, uncollected: near.filter((c) => !c.collected).length, hot: hot[0], area: pos.name });
      } catch {
        if (!cancelled) setState({ status: 'nolocation' });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (state.status === 'idle') return null;
  if (state.status === 'nolocation') {
    return (
      <button className="card card-cta nearby" onClick={() => navigate('/explore')}>
        <span className="nearby-emoji">🗺️</span>
        <span className="grow"><strong>{t('home.nearbyNoLoc')}</strong><span className="muted small block">{t('home.nearbyNoLocSub')}</span></span>
        <ChevronRight />
      </button>
    );
  }
  return (
    <button className="card card-cta nearby" onClick={() => navigate('/explore')}>
      <span className="nearby-emoji">🐈</span>
      <span className="grow">
        <strong>{state.near ? t('home.catsAround', { count: state.near }) : t('home.noCatsAround')}</strong>
        <span className="muted small block">
          {state.near ? t('home.notCollectedYet', { count: state.uncollected }) : t('home.beFirst')}
          {state.hot ? ` · 🔥 ${t('home.hotspotIn', { region: t.region(state.hot.region) })}` : ''}
        </span>
      </span>
      <ChevronRight />
    </button>
  );
}

function ActiveHunts() {
  const t = useT();
  const { data } = useApi('/hunts');
  const hunts = data?.active?.filter((h) => h.status === 'active') || [];
  if (!data) return null;
  if (!hunts.length) {
    return (
      <Link to="/hunts" className="card card-cta hunt-cta">
        <span className="nearby-emoji">🏹</span>
        <span className="grow"><strong>{t('home.startHunt')}</strong><span className="muted small block">{t('home.startHuntSub')}</span></span>
        <ChevronRight />
      </Link>
    );
  }
  const h = hunts[0];
  return (
    <Link to={`/hunts/${h.id}`} className="card hunt-banner">
      <div className="hunt-banner-top">
        <span className="pill pill-live">● {t('hunt.live')}</span>
        <span className="muted small">{t('common.hunters', { count: h.participants.length })}</span>
      </div>
      <strong className="hunt-title">🏹 {huntTitle(t, h)}</strong>
      <div className="hunt-progress-row">
        <ProgressBar value={h.progress} max={h.goal} color="linear-gradient(90deg,#6b4eff,#ff5fc8)" />
        <span className="small strong">{t('hunt.progressCats', { progress: h.progress, goal: h.goal })}</span>
      </div>
      <span className="small muted">{h.joined ? t('home.huntJoined') : t('home.huntTapJoin')}</span>
    </Link>
  );
}

function Suggestions() {
  const { data, setData } = useApi('/users');
  const { toast } = useApp();
  const t = useT();
  const users = data?.users?.slice(0, 6) || [];
  if (!users.length) return null;
  const follow = async (u) => {
    try {
      await api(`/users/${u.username}/follow`, { method: 'POST' });
      setData((d) => ({ ...d, users: d.users.map((x) => (x.id === u.id ? { ...x, isFollowing: true } : x)) }));
      toast(t('social.nowFollowing', { name: u.displayName }), 'success');
    } catch (err) { toast(errorText(t, err), 'error'); }
  };
  return (
    <section>
      <h2 className="section-title">{t('home.huntersToFollow')}</h2>
      <div className="hscroll">
        {users.map((u) => (
          <div key={u.id} className="card mini-user">
            <Link to={`/u/${u.username}`} className="mini-user-link">
              <Avatar user={u} size={52} />
              <strong className="truncate">{u.displayName}</strong>
              <span className="muted small">{t('level.short', { level: u.level })} · {t('common.cats', { count: u.cats })}</span>
            </Link>
            <button className={`btn btn-sm ${u.isFollowing ? 'btn-ghost' : 'btn-primary'}`} disabled={u.isFollowing} onClick={() => follow(u)}>
              {u.isFollowing ? t('social.following') : t('social.follow')}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Feed() {
  const t = useT();
  const [scope, setScope] = useState('all');
  const [items, setItems] = useState([]);
  const [next, setNext] = useState(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);

  const load = useCallback(async (before) => {
    setStatus(before ? 'more' : 'loading');
    try {
      const res = await api(`/feed?scope=${scope}${before ? `&before=${encodeURIComponent(before)}` : ''}`);
      setItems((prev) => (before ? [...prev, ...res.items] : res.items));
      setNext(res.nextBefore);
      setStatus('ok');
    } catch (err) {
      setError(err);
      setStatus('error');
    }
  }, [scope]);

  useEffect(() => { load(); }, [load]);

  return (
    <section>
      <div className="feed-header">
        <h2 className="section-title">{t('home.activity')}</h2>
        <Segmented value={scope} onChange={setScope} options={[{ value: 'all', label: t('home.everyone') }, { value: 'following', label: t('social.following') }]} />
      </div>
      {status === 'loading' && <Spinner />}
      {status === 'error' && <ErrorState error={error} onRetry={() => load()} />}
      {status !== 'loading' && status !== 'error' && !items.length && (
        <EmptyState
          icon={scope === 'following' ? '👥' : '🐾'}
          title={scope === 'following' ? t('home.emptyFollowingTitle') : t('home.emptyAllTitle')}
          text={scope === 'following' ? t('home.emptyFollowingText') : t('home.emptyAllText')}
          action={scope === 'following' ? <button className="btn btn-ghost" onClick={() => setScope('all')}>{t('home.seeEveryone')}</button> : <Link to="/capture" className="btn btn-primary">📸 {t('common.captureCat')}</Link>}
        />
      )}
      <div className="feed">{items.map((it) => <FeedItem key={it.id} item={it} />)}</div>
      {next && status === 'ok' && <button className="btn btn-ghost btn-block" onClick={() => load(next)}>{t('common.loadMore')}</button>}
      {status === 'more' && <Spinner />}
    </section>
  );
}

export default function Home() {
  const { me } = useApp();
  const t = useT();
  const { user, stats, unreadNotifications } = me;
  const hour = new Date().getHours();
  const greeting = t(hour < 5 ? 'home.greetNight' : hour < 12 ? 'home.greetMorning' : hour < 18 ? 'home.greetDay' : 'home.greetEvening');
  return (
    <Page className="home">
      <header className="home-header">
        <span className="logo">Chatdex</span>
        <Link to="/notifications" className="icon-btn bell" aria-label={t('notif.title')}>
          <Bell size={22} />
          {unreadNotifications > 0 && <span className="badge-dot">{unreadNotifications > 9 ? '9+' : unreadNotifications}</span>}
        </Link>
      </header>

      <section className="card hero">
        <div className="hero-top">
          <Link to="/me"><Avatar user={user} size={56} ring /></Link>
          <div className="grow">
            <p className="muted small">{greeting}</p>
            <h2 className="hero-name">{user.displayName}</h2>
            <p className="hero-title">{t(`title.${user.titleId}`)}</p>
          </div>
        </div>
        <LevelBar user={user} />
        <div className="hero-stats">
          <Link to="/dex?scope=mine"><strong>{stats.cats}</strong><span>{t('stat.cats')}</span></Link>
          <Link to="/dex?scope=mine&sort=rarity"><strong>{stats.rare}</strong><span>{t('stat.rarePlus')}</span></Link>
          <Link to="/achievements"><strong>{stats.badges}</strong><span>{t('stat.badges')}</span></Link>
          <Link to="/me"><strong>{stats.regions}</strong><span>{t('stat.regions')}</span></Link>
        </div>
        <Link to="/dex" className="collection-line">
          <span className="small strong">{t('home.collection', { n: stats.cats, total: me.totalCats })}</span>
          <ProgressBar value={stats.cats} max={me.totalCats} />
        </Link>
      </section>

      {stats.cats === 0 && (
        <Link to="/capture" className="card first-capture">
          <div className="first-capture-icon"><Camera size={30} /></div>
          <div>
            <strong>{t('home.firstCatch')}</strong>
            <p className="small">{t('home.firstCatchSub')}</p>
          </div>
        </Link>
      )}

      <NearbyCard />
      <ActiveHunts />
      {stats.following < 3 && <Suggestions />}
      <Feed />
    </Page>
  );
}
