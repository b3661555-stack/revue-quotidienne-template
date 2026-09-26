import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MoreHorizontal, Settings } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useApi } from '../store.jsx';
import { Avatar, CatImage, EmptyState, ErrorState, LevelBar, Page, ProgressBar, RarityBadge, Sheet, Spinner, TopBar } from '../components/ui.jsx';
import { ReportInline } from '../components/social.jsx';
import { CatCard } from './Dex.jsx';
import { shortDate, timeAgo } from '../lib/format.js';

function CompareCard({ compare, them }) {
  const rows = [
    ['🐱 Cats', compare.me.cats, compare.them.cats],
    ['✨ Rare+', compare.me.rare, compare.them.rare],
    ['👑 First catches', compare.me.firstCatches, compare.them.firstCatches],
    ['🌍 Regions', compare.me.regions, compare.them.regions],
    ['🏆 Badges', compare.me.badges, compare.them.badges],
  ];
  return (
    <section className="card compare">
      <h2 className="section-title">You vs {them.displayName}</h2>
      <div className="compare-head">
        <span><Avatar user={compare.me} size={34} /> You</span>
        <span className="muted small">friendly rivalry</span>
        <span>{them.displayName} <Avatar user={them} size={34} /></span>
      </div>
      {rows.map(([label, a, b]) => (
        <div key={label} className="compare-row">
          <strong className={a > b ? 'win' : ''}>{a}</strong>
          <span className="muted small">{label}</span>
          <strong className={b > a ? 'win' : ''}>{b}</strong>
        </div>
      ))}
      <p className="muted small center">{compare.shared ? `You've both seen ${compare.shared} of the same cats.` : "You haven't crossed paths with the same cat yet."}</p>
    </section>
  );
}

export default function Profile() {
  const { username } = useParams();
  const { toast, refreshMe } = useApp();
  const { data, error, loading, reload, setData } = useApi(`/users/${username}`);
  const [menu, setMenu] = useState(false);

  if (loading && !data) return <Page><Spinner /></Page>;
  if (error) return <Page><TopBar back title="Hunter" /><ErrorState error={error} onRetry={reload} /></Page>;
  const { user, stats, isMe, isFollowing, followsYou, favoriteCat, badges, recent, favorites, totalCats, compare, totalBadges } = data;

  const toggleFollow = async () => {
    try {
      await api(`/users/${user.username}/follow`, { method: isFollowing ? 'DELETE' : 'POST' });
      setData((d) => ({ ...d, isFollowing: !isFollowing, stats: { ...d.stats, followers: d.stats.followers + (isFollowing ? -1 : 1) } }));
      refreshMe();
    } catch (err) { toast(err.message, 'error'); }
  };

  return (
    <Page className="profile">
      <TopBar
        back={!isMe}
        title={isMe ? 'My profile' : user.displayName}
        right={isMe
          ? <Link to="/me/edit" className="icon-btn" aria-label="Settings"><Settings size={20} /></Link>
          : <button className="icon-btn" onClick={() => setMenu(true)} aria-label="More"><MoreHorizontal size={20} /></button>}
      />
      <section className="profile-head">
        <Avatar user={user} size={92} ring />
        <h1>{user.displayName} {user.isDemo && <span className="pill pill-demo">DEMO</span>}</h1>
        <p className="muted">@{user.username}</p>
        <p className="hero-title">{user.title} · Level {user.level}</p>
        {user.bio && <p className="bio">{user.bio}</p>}
        <div className="follow-counts">
          <Link to={`/u/${user.username}/follows`}><strong>{stats.followers}</strong> followers</Link>
          <Link to={`/u/${user.username}/follows?tab=following`}><strong>{stats.following}</strong> following</Link>
        </div>
        {!isMe && (
          <div className="row gap center-row">
            <button className={`btn ${isFollowing ? 'btn-ghost' : 'btn-primary'}`} onClick={toggleFollow}>{isFollowing ? 'Following ✓' : followsYou ? 'Follow back' : 'Follow'}</button>
            <Link className="btn btn-ghost" to={`/dex?user=${user.username}`}>View Chatdex</Link>
          </div>
        )}
      </section>

      <div className="card"><LevelBar user={user} /></div>

      <div className="stat-grid">
        <Link to={isMe ? '/dex?scope=mine' : `/dex?user=${user.username}`}><strong>🐱 {stats.cats}</strong><span>cats</span></Link>
        <Link to={isMe ? '/dex?scope=mine&sort=rarity' : `/dex?user=${user.username}&sort=rarity`}><strong>✨ {stats.rare}</strong><span>rare cats</span></Link>
        <Link to={isMe ? '/achievements' : '#badges'}><strong>🏆 {stats.badges}</strong><span>badges</span></Link>
        <div><strong>🌍 {stats.regions}</strong><span>regions</span></div>
        <div><strong>👑 {stats.firstCatches}</strong><span>first catches</span></div>
        <div><strong>📸 {stats.observations}</strong><span>sightings</span></div>
      </div>

      <Link to={isMe ? '/dex?scope=mine' : `/dex?user=${user.username}`} className="card collection-card">
        <div className="row between"><strong>Collection</strong><span><strong>{stats.cats}</strong>/{totalCats}</span></div>
        <ProgressBar value={stats.cats} max={totalCats} />
      </Link>

      {compare && <CompareCard compare={compare} them={user} />}

      {favoriteCat && (
        <Link to={`/cat/${favoriteCat.id}`} className="card fav-cat">
          <CatImage cat={favoriteCat} photo={favoriteCat.photo} thumb={favoriteCat.thumb} className="fav-cat-img" />
          <div>
            <span className="kicker">Favourite cat</span>
            <strong className="fav-cat-name">🐈 {favoriteCat.name}</strong>
            <RarityBadge rarity={favoriteCat.rarity} small />
          </div>
        </Link>
      )}

      <section id="badges">
        <div className="row between">
          <h2 className="section-title">Badges <span className="muted small">{badges.length}/{totalBadges}</span></h2>
          {isMe && <Link to="/achievements" className="small">See all</Link>}
        </div>
        {badges.length ? (
          <div className="badge-row">
            {badges.map((b) => (
              <div key={b.id} className="badge" title={`${b.name}: ${b.description}`}>
                <span className="badge-icon">{b.icon}</span>
                <span className="tiny">{b.name}</span>
              </div>
            ))}
          </div>
        ) : <p className="muted small">No badges yet. The first one comes with the first cat!</p>}
      </section>

      <section>
        <h2 className="section-title">Recent captures</h2>
        {recent.length ? (
          <div className="capture-grid">
            {recent.map((r) => (
              <Link key={r.observationId} to={`/cat/${r.cat.id}`} className="capture-tile">
                <CatImage cat={r.cat} photo={r.photo} thumb={r.thumb} variant={r.artSeed} />
                <span className="capture-tile-label"><strong>{r.cat.name}</strong><span>{timeAgo(r.createdAt)}</span></span>
                {r.isFirstCatch && <span className="capture-tile-crown" title="First Catch">👑</span>}
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon="📷" title={isMe ? 'No captures yet' : 'No captures yet'} text={isMe ? 'Your cat photos will appear here.' : `${user.displayName} hasn't caught a cat yet.`}
            action={isMe && <Link to="/capture" className="btn btn-primary">📸 Capture a cat</Link>} />
        )}
      </section>

      {favorites.length > 0 && (
        <section>
          <h2 className="section-title">Favourites</h2>
          <div className="cat-grid">{favorites.map((c) => <CatCard key={c.id} cat={c} />)}</div>
        </section>
      )}

      <p className="muted tiny center">Hunter since {shortDate(user.createdAt)}</p>

      <Sheet open={menu} onClose={() => setMenu(false)} title={user.displayName}>
        <ReportInline targetType="user" targetId={user.id} onDone={() => setMenu(false)} />
      </Sheet>
    </Page>
  );
}
