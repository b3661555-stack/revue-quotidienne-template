import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Bell, Camera, ChevronRight } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useApi } from '../store.jsx';
import { Avatar, EmptyState, ErrorState, LevelBar, Page, ProgressBar, Segmented, Spinner } from '../components/ui.jsx';
import { FeedItem } from '../components/social.jsx';
import { distanceKm, getPosition, lastKnownPosition, locationPermission } from '../lib/location.js';
import { plural } from '../lib/format.js';

function NearbyCard() {
  const navigate = useNavigate();
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
        <span className="grow"><strong>Which cats live around you?</strong><span className="muted small block">Open the map to find cats and hotspots nearby.</span></span>
        <ChevronRight />
      </button>
    );
  }
  return (
    <button className="card card-cta nearby" onClick={() => navigate('/explore')}>
      <span className="nearby-emoji">🐈</span>
      <span className="grow">
        <strong>{state.near ? `${plural(state.near, 'cat')} around you` : 'No cats registered around you yet'}</strong>
        <span className="muted small block">
          {state.near ? `${state.uncollected} not in your Chatdex yet` : 'Be the first to put your street on the map!'}
          {state.hot ? ` · 🔥 hotspot in ${state.hot.region}` : ''}
        </span>
      </span>
      <ChevronRight />
    </button>
  );
}

function ActiveHunts() {
  const { data } = useApi('/hunts');
  const hunts = data?.active?.filter((h) => h.status === 'active') || [];
  if (!data) return null;
  if (!hunts.length) {
    return (
      <Link to="/hunts" className="card card-cta hunt-cta">
        <span className="nearby-emoji">🏹</span>
        <span className="grow"><strong>Start a Cat Hunt</strong><span className="muted small block">Go out with friends and find as many cats as you can.</span></span>
        <ChevronRight />
      </Link>
    );
  }
  const h = hunts[0];
  return (
    <Link to={`/hunts/${h.id}`} className="card hunt-banner">
      <div className="hunt-banner-top">
        <span className="pill pill-live">● LIVE</span>
        <span className="muted small">{plural(h.participants.length, 'hunter')}</span>
      </div>
      <strong className="hunt-title">🏹 {h.title}</strong>
      <div className="hunt-progress-row">
        <ProgressBar value={h.progress} max={h.goal} color="linear-gradient(90deg,#6b4eff,#ff5fc8)" />
        <span className="small strong">{h.progress}/{h.goal} cats</span>
      </div>
      <span className="small muted">{h.joined ? "You're in! Every cat you capture counts." : 'Tap to join the hunt'}</span>
    </Link>
  );
}

function Suggestions() {
  const { data, setData } = useApi('/users');
  const { toast } = useApp();
  const users = data?.users?.slice(0, 6) || [];
  if (!users.length) return null;
  const follow = async (u) => {
    try {
      await api(`/users/${u.username}/follow`, { method: 'POST' });
      setData((d) => ({ ...d, users: d.users.map((x) => (x.id === u.id ? { ...x, isFollowing: true } : x)) }));
      toast(`You're now following ${u.displayName}`, 'success');
    } catch (err) { toast(err.message, 'error'); }
  };
  return (
    <section>
      <h2 className="section-title">Hunters to follow</h2>
      <div className="hscroll">
        {users.map((u) => (
          <div key={u.id} className="card mini-user">
            <Link to={`/u/${u.username}`} className="mini-user-link">
              <Avatar user={u} size={52} />
              <strong className="truncate">{u.displayName}</strong>
              <span className="muted small">Lv {u.level} · {u.cats} cats</span>
            </Link>
            <button className={`btn btn-sm ${u.isFollowing ? 'btn-ghost' : 'btn-primary'}`} disabled={u.isFollowing} onClick={() => follow(u)}>
              {u.isFollowing ? 'Following' : 'Follow'}
            </button>
          </div>
        ))}
      </div>
    </section>
  );
}

function Feed() {
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
        <h2 className="section-title">Cat activity</h2>
        <Segmented value={scope} onChange={setScope} options={[{ value: 'all', label: 'Everyone' }, { value: 'following', label: 'Following' }]} />
      </div>
      {status === 'loading' && <Spinner />}
      {status === 'error' && <ErrorState error={error} onRetry={() => load()} />}
      {status !== 'loading' && status !== 'error' && !items.length && (
        <EmptyState
          icon={scope === 'following' ? '👥' : '🐾'}
          title={scope === 'following' ? 'Nothing from your hunters yet' : 'No activity yet'}
          text={scope === 'following' ? 'Follow other hunters to see their discoveries here.' : 'Capture the first cat and start the story!'}
          action={scope === 'following' ? <button className="btn btn-ghost" onClick={() => setScope('all')}>See everyone</button> : <Link to="/capture" className="btn btn-primary">📸 Capture a cat</Link>}
        />
      )}
      <div className="feed">{items.map((it) => <FeedItem key={it.id} item={it} />)}</div>
      {next && status === 'ok' && <button className="btn btn-ghost btn-block" onClick={() => load(next)}>Load more</button>}
      {status === 'more' && <Spinner />}
    </section>
  );
}

export default function Home() {
  const { me, meta } = useApp();
  const { user, stats, unreadNotifications } = me;
  const hour = new Date().getHours();
  const greeting = hour < 5 ? 'Night hunting,' : hour < 12 ? 'Good morning,' : hour < 18 ? 'Hey' : 'Good evening,';
  return (
    <Page className="home">
      <header className="home-header">
        <span className="logo">Chatdex</span>
        <Link to="/notifications" className="icon-btn bell" aria-label={`Notifications${unreadNotifications ? ` (${unreadNotifications} unread)` : ''}`}>
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
            <p className="hero-title">{user.title}</p>
          </div>
        </div>
        <LevelBar user={user} />
        <div className="hero-stats">
          <Link to="/dex?scope=mine"><strong>{stats.cats}</strong><span>cats</span></Link>
          <Link to="/dex?scope=mine&sort=rarity"><strong>{stats.rare}</strong><span>rare+</span></Link>
          <Link to="/achievements"><strong>{stats.badges}</strong><span>badges</span></Link>
          <Link to="/me"><strong>{stats.regions}</strong><span>regions</span></Link>
        </div>
        <Link to="/dex" className="collection-line">
          <span className="small strong">Collection {stats.cats}/{me.totalCats}</span>
          <ProgressBar value={stats.cats} max={me.totalCats} />
        </Link>
      </section>

      {stats.cats === 0 && (
        <Link to="/capture" className="card first-capture">
          <div className="first-capture-icon"><Camera size={30} /></div>
          <div>
            <strong>Catch your first cat!</strong>
            <p className="small">See a cat? Snap it to start your Chatdex and earn your first badge.</p>
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
