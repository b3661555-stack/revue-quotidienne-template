import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Flag, MapPin, MoreHorizontal } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { timeAgo, ordinal } from '../lib/format.js';
import { Avatar, CatImage, RarityBadge, Sheet, UserLink } from './ui.jsx';

export const REACTIONS = [
  { id: 'meow', icon: '❤️', label: 'Meow' },
  { id: 'paw', icon: '🐾', label: 'Paw' },
  { id: 'respect', icon: '🔥', label: 'Respect' },
  { id: 'seen', icon: '👀', label: 'Seen it too' },
];

export function ReactionBar({ observation }) {
  const { toast } = useApp();
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
      toast(err.message, 'error');
      setState({ reactions: observation.reactions || {}, myReactions: observation.myReactions || [] });
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="reactions" onClick={(e) => e.stopPropagation()}>
      {REACTIONS.map((r) => (
        <button key={r.id} className={`reaction ${state.myReactions.includes(r.id) ? 'mine' : ''}`} onClick={() => react(r.id)} title={r.label} aria-label={r.label} aria-pressed={state.myReactions.includes(r.id)}>
          <span className="reaction-icon">{r.icon}</span>
          {state.reactions[r.id] ? <span className="reaction-count">{state.reactions[r.id]}</span> : null}
        </button>
      ))}
    </div>
  );
}

const REPORT_REASONS = [
  'Not a cat / wrong photo',
  'Shows a private address or people',
  'Animal being disturbed or harmed',
  'Offensive or inappropriate',
  'Spam or duplicate',
];

export function ReportSheet({ open, onClose, targetType, targetId }) {
  const { toast } = useApp();
  const [reason, setReason] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      const res = await api('/reports', { method: 'POST', body: { targetType, targetId, reason } });
      toast(res.alreadyReported ? 'You already reported this. Thanks!' : 'Thanks, our community moderators will take a look.', 'success');
      onClose();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="Report">
      <p className="muted">What's wrong with this {targetType === 'observation' ? 'capture' : targetType}?</p>
      <div className="stack-sm">
        {REPORT_REASONS.map((r) => (
          <label key={r} className={`radio-row ${reason === r ? 'active' : ''}`}>
            <input type="radio" name="reason" checked={reason === r} onChange={() => setReason(r)} /> {r}
          </label>
        ))}
      </div>
      <button className="btn btn-primary btn-block mt" disabled={!reason || busy} onClick={submit}>Send report</button>
    </Sheet>
  );
}

function headline(item) {
  const u = <UserLink user={item.user} />;
  const cat = item.cat && <Link to={`/cat/${item.cat.id}`} onClick={(e) => e.stopPropagation()}>{item.cat.name}</Link>;
  const rare = item.cat && ['rare', 'epic', 'legendary', 'shiny'].includes(item.cat.rarity);
  switch (item.type) {
    case 'discovery':
      return { icon: rare ? '✨' : '🐈', text: <>{u} discovered {rare ? `a ${item.cat.rarity} cat` : 'a new cat'}: {cat}</> };
    case 'observation':
      return {
        icon: '🐾',
        text: item.data.firstForUser && item.data.hunterRank
          ? <>{u} found {cat}, the {ordinal(item.data.hunterRank)} hunter to see it</>
          : <>{u} spotted {cat} again</>,
      };
    case 'respotted':
      return { icon: '🚨', text: <><strong className="upper">{item.cat.name} has been spotted again!</strong> {u} found it after {item.data.daysMissing} days</> };
    case 'achievement':
      return { icon: '🏆', text: <>{u} unlocked <strong>{item.data.icon} {item.data.name}</strong></> };
    case 'hunt_created':
      return { icon: '🏹', text: <>{u} started a <Link to={`/hunts/${item.huntId}`} onClick={(e) => e.stopPropagation()}>Cat Hunt in {item.data.region}</Link></> };
    case 'hunt_completed':
      return { icon: '🎯', text: <>{u}'s team completed <Link to={`/hunts/${item.huntId}`} onClick={(e) => e.stopPropagation()}>{item.data.title}</Link></> };
    default:
      return { icon: '🐱', text: <>{u} did something catty</> };
  }
}

export function FeedItem({ item }) {
  const navigate = useNavigate();
  const [reportOpen, setReportOpen] = useState(false);
  const { icon, text } = headline(item);
  const hasPhoto = item.observation && item.cat;
  return (
    <article className={`feed-item feed-${item.type}`}>
      <div className="feed-head">
        <Link to={`/u/${item.user.username}`} className="feed-avatar"><Avatar user={item.user} size={38} /></Link>
        <div className="feed-text">
          <p><span className="feed-icon" aria-hidden>{icon}</span> {text}</p>
          <p className="muted small">
            {timeAgo(item.createdAt)}
            {(item.observation?.region || item.data.region) && <> · <MapPin size={12} className="inline-icon" /> {item.observation?.region || item.data.region}</>}
          </p>
        </div>
        {item.observation && (
          <button className="icon-btn icon-btn-sm" aria-label="More" onClick={() => setReportOpen(true)}><MoreHorizontal size={18} /></button>
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
        <Sheet open={reportOpen} onClose={() => setReportOpen(false)} title="Capture options">
          <ReportInline targetType="observation" targetId={item.observation.id} onDone={() => setReportOpen(false)} />
        </Sheet>
      )}
    </article>
  );
}

export function ReportInline({ targetType, targetId, onDone }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="menu-row danger" onClick={() => setOpen(true)}><Flag size={18} /> Report this {targetType === 'observation' ? 'capture' : targetType}</button>
      <ReportSheet open={open} onClose={() => { setOpen(false); onDone?.(); }} targetType={targetType} targetId={targetId} />
    </>
  );
}
