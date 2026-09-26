import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Flag, MapPin, MoreHorizontal } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { errorText, useT } from '../i18n/index.jsx';
import { Avatar, CatImage, RarityBadge, Sheet, UserLink } from './ui.jsx';

export const REACTIONS = [
  { id: 'meow', icon: '❤️' },
  { id: 'paw', icon: '🐾' },
  { id: 'respect', icon: '🔥' },
  { id: 'seen', icon: '👀' },
];

export function ReactionBar({ observation }) {
  const { toast } = useApp();
  const t = useT();
  const [state, setState] = useState({ reactions: observation.reactions || {}, myReactions: observation.myReactions || [] });
  const [busy, setBusy] = useState(false);
  const react = async (kind) => {
    if (busy) return;
    setBusy(true);
    const had = state.myReactions.includes(kind);
    // Optimistic update
    setState((s) => ({
      reactions: { ...s.reactions, [kind]: Math.max(0, (s.reactions[kind] || 0) + (had ? -1 : 1)) },
      myReactions: had ? s.myReactions.filter((k) => k !== kind) : [...s.myReactions, kind],
    }));
    try {
      const res = await api(`/observations/${observation.id}/react`, { method: 'POST', body: { kind } });
      setState(res);
    } catch (err) {
      toast(errorText(t, err), 'error');
      setState({ reactions: observation.reactions || {}, myReactions: observation.myReactions || [] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="reactions" onClick={(e) => e.stopPropagation()}>
      {REACTIONS.map((r) => (
        <button key={r.id} className={`reaction ${state.myReactions.includes(r.id) ? 'mine' : ''}`} onClick={() => react(r.id)} title={t(`reaction.${r.id}`)} aria-label={t(`reaction.${r.id}`)} aria-pressed={state.myReactions.includes(r.id)}>
          <span className="reaction-icon">{r.icon}</span>
          {state.reactions[r.id] ? <span className="reaction-count">{state.reactions[r.id]}</span> : null}
        </button>
      ))}
    </div>
  );
}

const REPORT_REASONS = ['notCat', 'private', 'harm', 'offensive', 'spam'];

export function ReportSheet({ open, onClose, targetType, targetId }) {
  const { toast } = useApp();
  const t = useT();
  const [reason, setReason] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const res = await api('/reports', { method: 'POST', body: { targetType, targetId, reason } });
      toast(res.alreadyReported ? t('report.already') : t('report.thanks'), 'success');
      onClose();
    } catch (err) {
      toast(errorText(t, err), 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title={t('report.title')}>
      <p className="muted">{t(`report.question.${targetType}`)}</p>
      <div className="stack-sm">
        {REPORT_REASONS.map((r) => (
          <label key={r} className={`radio-row ${reason === r ? 'active' : ''}`}>
            <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {t(`report.reason.${r}`)}
          </label>
        ))}
      </div>
      <button className="btn btn-primary btn-block mt" disabled={!reason || busy} onClick={submit}>{t('report.send')}</button>
    </Sheet>
  );
}

export const huntTitle = (t, h) => h.title || t('hunt.defaultTitle', { region: t.region(h.region) });

function headline(t, item) {
  const u = <UserLink user={item.user} />;
  const cat = item.cat && <Link to={`/cat/${item.cat.id}`} onClick={(e) => e.stopPropagation()}>{item.cat.name}</Link>;
  const rare = item.cat && ['rare', 'epic', 'legendary', 'shiny'].includes(item.cat.rarity);
  const hunt = (label) => <Link to={`/hunts/${item.huntId}`} onClick={(e) => e.stopPropagation()}>{label}</Link>;
  switch (item.type) {
    case 'discovery':
      return rare
        ? { icon: '✨', text: t('feed.discoveryRare', { user: u, cat, rarity: t.rarity(item.cat.rarity) }) }
        : { icon: '🐈', text: t('feed.discovery', { user: u, cat }) };
    case 'observation':
      return {
        icon: '🐾',
        text: item.data.firstForUser && item.data.hunterRank
          ? t('feed.foundRank', { user: u, cat, nth: t.ordinal(item.data.hunterRank) })
          : t('feed.spottedAgain', { user: u, cat }),
      };
    case 'respotted':
      return { icon: '🚨', text: <><strong className="upper">{t('feed.respottedTitle', { cat: item.cat.name })}</strong> {t('feed.respottedBy', { user: u, count: item.data.daysMissing })}</> };
    case 'achievement':
      return { icon: '🏆', text: t('feed.achievement', { user: u, badge: <strong>{item.data.icon} {t(`ach.${item.data.id}.name`)}</strong> }) };
    case 'hunt_created':
      return { icon: '🏹', text: t('feed.huntCreated', { user: u, hunt: hunt(t('feed.huntIn', { region: t.region(item.data.region) })) }) };
    case 'hunt_completed':
      return { icon: '🎯', text: t('feed.huntCompleted', { user: u, hunt: hunt(huntTitle(t, item.data)) }) };
    default:
      return { icon: '🐱', text: u };
  }
}

export function FeedItem({ item }) {
  const navigate = useNavigate();
  const t = useT();
  const [reportOpen, setReportOpen] = useState(false);
  const { icon, text } = headline(t, item);
  const hasPhoto = item.observation && item.cat;
  const region = item.observation?.region || item.data.region;
  return (
    <article className={`feed-item feed-${item.type}`}>
      <div className="feed-head">
        <Link to={`/u/${item.user.username}`} className="feed-avatar"><Avatar user={item.user} size={38} /></Link>
        <div className="feed-text">
          <p><span className="feed-icon" aria-hidden>{icon}</span> {text}</p>
          <p className="muted small">
            {t.timeAgo(item.createdAt)}
            {region && <> · <MapPin size={12} className="inline-icon" /> {t.region(region)}</>}
          </p>
        </div>
        {item.observation && (
          <button className="icon-btn icon-btn-sm" aria-label={t('common.more')} onClick={() => setReportOpen(true)}><MoreHorizontal size={18} /></button>
        )}
      </div>
      {hasPhoto && (
        <div className="feed-photo" onClick={() => navigate(`/cat/${item.cat.id}`)} role="link" tabIndex={0} onKeyDown={(e) => e.key === 'Enter' && navigate(`/cat/${item.cat.id}`)}>
          <CatImage cat={item.cat} photo={item.observation.photo} thumb={item.observation.thumb} variant={item.observation.artSeed} full />
          <div className="feed-photo-caption">
            <span className="feed-cat-name">{item.cat.name}</span>
            <RarityBadge rarity={item.cat.rarity} small />
          </div>
        </div>
      )}
      {item.observation && <ReactionBar observation={item.observation} />}
      {item.observation && (
        <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title={t('feed.captureOptions')}>
          <ReportInline targetType="observation" targetId={item.observation.id} onDone={() => setReportOpen(false)} />
        </Sheet>
      )}
    </article>
  );
}

export function ReportInline({ targetType, targetId, onDone }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="menu-row danger" onClick={() => setOpen(true)}><Flag size={18} /> {t(`report.action.${targetType}`)}</button>
      <ReportSheet open={open} onClose={() => { setOpen(false); onDone?.(); }} targetType={targetType} targetId={targetId} />
    </>
  );
}
