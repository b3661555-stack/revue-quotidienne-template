import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { MoreHorizontal, Settings } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useApi } from '../store.jsx';
import { Avatar, CatImage, EmptyState, ErrorState, LevelBar, Page, ProgressBar, RarityBadge, Sheet, Spinner, TopBar } from '../components/ui.jsx';
import { ReportInline } from '../components/social.jsx';
import { CatCard } from './Dex.jsx';
import { errorText, useT } from '../i18n/index.jsx';

function CompareCard({ compare, them }) {
  const t = useT();
  const rows = [
    [`🐱 ${t('stat.cats')}`, compare.me.cats, compare.them.cats],
    [`✨ ${t('stat.rarePlus')}`, compare.me.rare, compare.them.rare],
    [`👑 ${t('stat.firstCatches')}`, compare.me.firstCatches, compare.them.firstCatches],
    [`🌍 ${t('stat.regions')}`, compare.me.regions, compare.them.regions],
    [`🏆 ${t('stat.badges')}`, compare.me.badges, compare.them.badges],
  ];
  return (
    <section className="card compare">
      <h2 className="section-title">{t('compare.title', { name: them.displayName })}</h2>
      <div className="compare-head">
        <span><Avatar user={compare.me} size={34} /> {t('compare.you')}</span>
        <span className="muted small">{t('compare.rivalry')}</span>
        <span>{them.displayName} <Avatar user={them} size={34} /></span>
      </div>
      {rows.map(([label, a, b]) => (
        <div key={label} className="compare-row">
          <strong className={a > b ? 'win' : ''}>{a}</strong>
          <span className="muted small">{label}</span>
          <strong className={b > a ? 'win' : ''}>{b}</strong>
        </div>
      ))}
      <p className="muted small center">{compare.shared ? t('compare.shared', { count: compare.shared }) : t('compare.none')}</p>
    </section>
  );
}

export default function Profile() {
  const { username } = useParams();
  const { toast, refreshMe } = useApp();
  const t = useT();
  const { data, error, loading, reload, setData } = useApi(`/users/${username}`);
  const [menu, setMenu] = useState(false);

  if (loading && !data) return <Page><Spinner /></Page>;
  if (error) return <Page><TopBar back title={t('profile.hunter')} /><ErrorState error={error} onRetry={reload} /></Page>;
  const { user, stats, isMe, isFollowing, followsYou, favoriteCat, badges, recent, favorites, totalCats, compare, totalBadges } = data;

  const toggleFollow = async () => {
    try {
      await api(`/users/${user.username}/follow`, { method: isFollowing ? 'DELETE' : 'POST' });
      setData((d) => ({ ...d, isFollowing: !isFollowing, stats: { ...d.stats, followers: d.stats.followers + (isFollowing ? -1 : 1) } }));
      refreshMe();
    } catch (err) { toast(errorText(t, err), 'error'); }
  };

  return (
    <Page className="profile">
      <TopBar
        back={!isMe}
        title={isMe ? t('profile.mine') : user.displayName}
        right={isMe
          ? <Link to="/me/edit" className="icon-btn" aria-label={t('settings.title')}><Settings size={20} /></Link>
          : <button className="icon-btn" onClick={() => setMenu(true)} aria-label={t('common.more')}><MoreHorizontal size={20} /></button>}
      />
      <section className="profile-head">
        <Avatar user={user} size={92} ring />
        <h1>{user.displayName} {user.isDemo && <span className="pill pill-demo">{t('profile.demo')}</span>}</h1>
        <p className="muted">@{user.username}</p>
        <p className="hero-title">{t(`title.${user.titleId}`)} · {t('level.long', { level: user.level })}</p>
        {user.bio && <p className="bio">{user.bio}</p>}
        <div className="follow-counts">
          <Link to={`/u/${user.username}/follows`}>{t('social.followersCount', { count: stats.followers, n: <strong>{stats.followers}</strong> })}</Link>
          <Link to={`/u/${user.username}/follows?tab=following`}>{t('social.followingCount', { count: stats.following, n: <strong>{stats.following}</strong> })}</Link>
        </div>
        {!isMe && (
          <div className="row gap center-row">
            <button className={`btn ${isFollowing ? 'btn-ghost' : 'btn-primary'}`} onClick={toggleFollow}>{isFollowing ? `${t('social.following')} ✓` : followsYou ? t('social.followBack') : t('social.follow')}</button>
            <Link className="btn btn-ghost" to={`/dex?user=${user.username}`}>{t('profile.viewDex')}</Link>
          </div>
        )}
      </section>

      <div className="card"><LevelBar user={user} /></div>

      <div className="stat-grid">
        <Link to={isMe ? '/dex?scope=mine' : `/dex?user=${user.username}`}><strong>🐱 {stats.cats}</strong><span>{t('stat.cats')}</span></Link>
        <Link to={isMe ? '/dex?scope=mine&sort=rarity' : `/dex?user=${user.username}&sort=rarity`}><strong>✨ {stats.rare}</strong><span>{t('stat.rareCats')}</span></Link>
        <Link to={isMe ? '/achievements' : '#badges'}><strong>🏆 {stats.badges}</strong><span>{t('stat.badges')}</span></Link>
        <div><strong>🌍 {stats.regions}</strong><span>{t('stat.regions')}</span></div>
        <div><strong>👑 {stats.firstCatches}</strong><span>{t('stat.firstCatches')}</span></div>
        <div><strong>📸 {stats.observations}</strong><span>{t('stat.sightings')}</span></div>
      </div>

      <Link to={isMe ? '/dex?scope=mine' : `/dex?user=${user.username}`} className="card collection-card">
        <div className="row between"><strong>{t('profile.collection')}</strong><span><strong>{stats.cats}</strong>/{totalCats}</span></div>
        <ProgressBar value={stats.cats} max={totalCats} />
      </Link>

      {compare && <CompareCard compare={compare} them={user} />}

      {favoriteCat && (
        <Link to={`/cat/${favoriteCat.id}`} className="card fav-cat">
          <CatImage cat={favoriteCat} photo={favoriteCat.photo} thumb={favoriteCat.thumb} className="fav-cat-img" />
          <div>
            <span className="kicker">{t('profile.favCat')}</span>
            <strong className="fav-cat-name">🐈 {favoriteCat.name}</strong>
            <RarityBadge rarity={favoriteCat.rarity} small />
          </div>
        </Link>
      )}

      <section id="badges">
        <div className="row between">
          <h2 className="section-title">{t('badges.title')} <span className="muted small">{badges.length}/{totalBadges}</span></h2>
          {isMe && <Link to="/achievements" className="small">{t('common.seeAll')}</Link>}
        </div>
        {badges.length ? (
          <div className="badge-row">
            {badges.map((b) => (
              <div key={b.id} className="badge" title={`${t(`ach.${b.id}.name`)}: ${t(`ach.${b.id}.desc`)}`}>
                <span className="badge-icon">{b.icon}</span>
                <span className="tiny">{t(`ach.${b.id}.name`)}</span>
              </div>
            ))}
          </div>
        ) : <p className="muted small">{t('badges.none')}</p>}
      </section>

      <section>
        <h2 className="section-title">{t('profile.recent')}</h2>
        {recent.length ? (
          <div className="capture-grid">
            {recent.map((r) => (
              <Link key={r.observationId} to={`/cat/${r.cat.id}`} className="capture-tile">
                <CatImage cat={r.cat} photo={r.photo} thumb={r.thumb} variant={r.artSeed} />
                <span className="capture-tile-label"><strong>{r.cat.name}</strong><span>{t.timeAgo(r.createdAt)}</span></span>
                {r.isFirstCatch && <span className="capture-tile-crown" title={t('cat.firstCatch')}>👑</span>}
              </Link>
            ))}
          </div>
        ) : (
          <EmptyState icon="📷" title={t('profile.noCaptures')} text={isMe ? t('profile.noCapturesMe') : t('profile.noCapturesThem', { name: user.displayName })}
            action={isMe && <Link to="/capture" className="btn btn-primary">📸 {t('common.captureCat')}</Link>} />
        )}
      </section>

      {favorites.length > 0 && (
        <section>
          <h2 className="section-title">{t('profile.favourites')}</h2>
          <div className="cat-grid">{favorites.map((c) => <CatCard key={c.id} cat={c} />)}</div>
        </section>
      )}

      <p className="muted tiny center">{t('profile.since', { date: t.date(user.createdAt) })}</p>

      <Sheet open={menu} onClose={() => setMenu(false)} title={user.displayName}>
        <ReportInline targetType="user" targetId={user.id} onDone={() => setMenu(false)} />
      </Sheet>
    </Page>
  );
}
