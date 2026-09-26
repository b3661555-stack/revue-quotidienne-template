import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useApp, useApi } from '../store.jsx';
import { useT } from '../i18n/index.jsx';
import { huntTitle } from '../components/social.jsx';
import { Avatar, CatArt, EmptyState, ErrorState, Page, Spinner, TopBar } from '../components/ui.jsx';

const ICONS = { achievement: '🏆', level_up: '⬆️', respotted: '🚨', first_catch_found: '👑', reaction: '❤️', follow: '👋', hunt: '🏹', hunt_completed: '🎯' };

/** Notifications are stored as type + data so they render in the viewer's language. */
function notifText(t, n) {
  const d = n.data || {};
  switch (n.type) {
    case 'achievement': return d.id ? `${d.icon} ${t('notif.achievement', { name: t(`ach.${d.id}.name`) })}` : n.text;
    case 'level_up': return d.level ? t('notif.levelUp', { level: d.level }) : n.text;
    case 'respotted': return d.cat ? `🚨 ${t('notif.respotted', { cat: d.cat, count: d.days, user: d.user })}` : n.text;
    case 'first_catch_found': return d.cat ? t('notif.firstCatchFound', { user: d.user, cat: d.cat, rank: d.rank }) : n.text;
    case 'reaction': return d.cat ? t('notif.reaction', { user: d.user, icon: d.icon, cat: d.cat }) : n.text;
    case 'follow': return d.user ? t('notif.follow', { user: d.user }) : n.text;
    case 'hunt': return d.region ? t('notif.hunt', { user: d.user, region: t.region(d.region) }) : n.text;
    case 'hunt_completed': return d.region ? `🏹 ${t('notif.huntCompleted', { title: huntTitle(t, d), xp: d.xp })}` : n.text;
    default: return n.text;
  }
}

export default function Notifications() {
  const { refreshMe } = useApp();
  const t = useT();
  const { data, error, loading, reload } = useApi('/notifications');
  useEffect(() => {
    if (data?.unread) api('/notifications/read', { method: 'POST' }).then(() => refreshMe()).catch(() => {});
  }, [data, refreshMe]);

  const linkFor = (n) => (n.catId ? `/cat/${n.catId}` : n.huntId ? `/hunts/${n.huntId}` : n.type === 'follow' && n.actor ? `/u/${n.actor.username}` : n.type === 'achievement' ? '/achievements' : '/me');

  return (
    <Page>
      <TopBar back title={t('notif.title')} />
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && !data.items.length && <EmptyState icon="🔔" title={t('notif.emptyTitle')} text={t('notif.emptyText')} />}
      <ul className="notif-list">
        {data?.items.map((n) => (
          <li key={n.id}>
            <Link to={linkFor(n)} className={`notif ${n.read ? '' : 'unread'}`}>
              {n.actor ? <Avatar user={n.actor} size={40} /> : <span className="notif-icon">{ICONS[n.type] || '🐾'}</span>}
              <span className="grow"><span className="block">{notifText(t, n)}</span><span className="muted tiny">{t.timeAgo(n.createdAt)}</span></span>
              {n.cat && <span className="notif-cat"><CatArt cat={{ ...n.cat, artSeed: n.cat.artSeed }} /></span>}
            </Link>
          </li>
        ))}
      </ul>
    </Page>
  );
}
