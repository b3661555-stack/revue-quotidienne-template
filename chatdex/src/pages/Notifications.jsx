import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp, useApi } from '../store.jsx';
import { Avatar, CatArt, EmptyState, ErrorState, Page, Spinner, TopBar } from '../components/ui.jsx';
import { timeAgo } from '../lib/format.js';

const ICONS = { achievement: '🏆', level_up: '⬆️', respotted: '🚨', first_catch_found: '👑', reaction: '❤️', follow: '👋', hunt: '🏹', hunt_completed: '🎯' };

export default function Notifications() {
  const { refreshMe } = useApp();
  const { data, error, loading, reload } = useApi('/notifications');
  useEffect(() => {
    if (data?.unread) api('/notifications/read', { method: 'POST' }).then(() => refreshMe()).catch(() => {});
  }, [data, refreshMe]);

  const linkFor = (n) => (n.catId ? `/cat/${n.catId}` : n.huntId ? `/hunts/${n.huntId}` : n.type === 'follow' && n.actor ? `/u/${n.actor.username}` : n.type === 'achievement' ? '/achievements' : '/me');

  return (
    <Page>
      <TopBar back title="Notifications" />
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && !data.items.length && <EmptyState icon="🔔" title="All quiet" text="Reactions, followers, badges and re-spotted cats will show up here." />}
      <ul className="notif-list">
        {data?.items.map((n) => (
          <li key={n.id}>
            <Link to={linkFor(n)} className={`notif ${n.read ? '' : 'unread'}`}>
              {n.actor ? <Avatar user={n.actor} size={40} /> : <span className="notif-icon">{ICONS[n.type] || '🐾'}</span>}
              <span className="grow"><span className="block">{n.text}</span><span className="muted tiny">{timeAgo(n.createdAt)}</span></span>
              {n.cat && <span className="notif-cat"><CatArt cat={{ ...n.cat, artSeed: n.cat.artSeed }} /></span>}
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
