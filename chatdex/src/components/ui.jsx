import { useEffect, useMemo, useState } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { BookOpen, Camera, ChevronLeft, Compass, House, User, WifiOff, X } from 'lucide-react';
import { catSvg } from '../lib/catArt.js';
import { mediaUrl } from '../api.js';
import { useApp } from '../store.jsx';
import { errorText, useT } from '../i18n/index.jsx';

export const RARITY = {
  common: { label: 'Common', icon: '🟢', color: '#3fb86b' },
  uncommon: { label: 'Uncommon', icon: '🔵', color: '#3a8dff' },
  rare: { label: 'Rare', icon: '🟣', color: '#9b5cff' },
  epic: { label: 'Epic', icon: '🟡', color: '#e6a800' },
  legendary: { label: 'Legendary', icon: '🔴', color: '#ff4d5e' },
  shiny: { label: 'Shiny', icon: '✨', color: '#ff5fc8' },
};

export function CatArt({ cat, variant, className = '', background = true }) {
  const html = useMemo(
    () => catSvg({ coatColor: cat.coatColor, pattern: cat.pattern, eyeColor: cat.eyeColor, seed: cat.artSeed, variant, shiny: cat.rarity === 'shiny', background }),
    [cat.coatColor, cat.pattern, cat.eyeColor, cat.artSeed, cat.rarity, variant, background]
  );
  return <div className={`cat-art ${className}`} dangerouslySetInnerHTML={{ __html: html }} />;
}

/** Real photo when there is one, otherwise the cat's procedural portrait. */
export function CatImage({ cat, photo, thumb, variant, full = false, className = '', alt }) {
  const [failed, setFailed] = useState(false);
  const src = mediaUrl(full ? photo || thumb : thumb || photo);
  if (src && !failed) {
    return <img className={`cat-img ${className}`} src={src} alt={alt || cat?.name || 'Cat'} loading="lazy" onError={() => setFailed(true)} />;
  }
  return <CatArt cat={cat} variant={variant} className={`cat-img ${className}`} />;
}

export function Avatar({ user, size = 40, ring = false }) {
  if (!user) return null;
  return (
    <span
      className={`avatar ${ring ? 'avatar-ring' : ''}`}
      style={{ width: size, height: size, background: user.avatarColor, fontSize: size * 0.52 }}
      aria-label={user.displayName}
    >
      {user.avatarEmoji}
    </span>
  );
}

export function UserLink({ user, children }) {
  if (!user) return null;
  return <Link className="user-link" to={`/u/${user.username}`} onClick={(e) => e.stopPropagation()}>{children || user.displayName}</Link>;
}

export function RarityBadge({ rarity, small = false }) {
  const t = useT();
  const r = RARITY[rarity] || RARITY.common;
  return (
    <span className={`rarity ${small ? 'rarity-sm' : ''} rarity-${rarity}`} style={{ '--rc': r.color }}>
      <span aria-hidden>{r.icon}</span> {t.rarity(rarity)}
    </span>
  );
}

export function LevelBar({ user, compact = false }) {
  const t = useT();
  const pct = Math.min(100, Math.round((user.levelXp / user.levelSpan) * 100));
  return (
    <div className={`levelbar ${compact ? 'levelbar-compact' : ''}`}>
      <div className="levelbar-top">
        <span className="levelbar-level">{t('level.short', { level: user.level })}</span>
        <span className="muted small ltr">{t('level.xp', { xp: t.number(user.levelXp), span: t.number(user.levelSpan) })}</span>
      </div>
      <div className="bar"><div className="bar-fill" style={{ width: `${pct}%` }} /></div>
    </div>
  );
}

export function ProgressBar({ value, max, color }) {
  const pct = max ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return <div className="bar"><div className="bar-fill" style={{ width: `${pct}%`, background: color }} /></div>;
}

export function Spinner({ label }) {
  return (
    <div className="spinner-wrap" role="status">
      <div className="paw-spinner"><span>🐾</span></div>
      {label && <p className="muted">{label}</p>}
    </div>
  );
}

export function EmptyState({ icon = '🐈', title, text, action }) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon}</div>
      <h3>{title}</h3>
      {text && <p className="muted">{text}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry }) {
  const t = useT();
  return (
    <EmptyState
      icon={error?.offline ? '📡' : '🙀'}
      title={error?.offline ? t('errors.offlineTitle') : t('errors.genericTitle')}
      text={errorText(t, error)}
      action={onRetry && <button className="btn btn-primary" onClick={() => onRetry()}>{t('common.tryAgain')}</button>}
    />
  );
}

export function Page({ children, className = '' }) {
  return <main className={`page ${className}`}>{children}</main>;
}

export function TopBar({ title, back = false, right, transparent = false }) {
  const navigate = useNavigate();
  const t = useT();
  return (
    <header className={`topbar ${transparent ? 'topbar-transparent' : ''}`}>
      {back ? (
        <button className="icon-btn" aria-label={t('common.back')} onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/'))}>
          <ChevronLeft size={22} className="flip-rtl" />
        </button>
      ) : <span className="topbar-spacer" />}
      <h1 className="topbar-title">{title}</h1>
      <div className="topbar-right">{right || <span className="topbar-spacer" />}</div>
    </header>
  );
}

export function Sheet({ open, onClose, title, children }) {
  const t = useT();
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label={t('common.close')}><X size={20} /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function BottomNav() {
  const t = useT();
  const tab = (to, Icon, label, end) => (
    <NavLink to={to} end={end} className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
      <Icon size={22} strokeWidth={2.2} />
      <span>{label}</span>
    </NavLink>
  );
  return (
    <nav className="bottom-nav" aria-label="Main">
      {tab('/', House, t('nav.home'), true)}
      {tab('/explore', Compass, t('nav.explore'))}
      <NavLink to="/capture" className="nav-capture" aria-label={t('nav.captureLabel')}>
        <span className="nav-capture-btn"><Camera size={28} strokeWidth={2.4} /></span>
        <span className="nav-capture-label">{t('nav.capture')}</span>
      </NavLink>
      {tab('/dex', BookOpen, t('nav.dex'))}
      {tab('/me', User, t('nav.profile'))}
    </nav>
  );
}

export function Toasts() {
  const { toasts } = useApp();
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => <div key={t.id} className={`toast toast-${t.kind}`}>{t.text}</div>)}
    </div>
  );
}

export function OfflineBanner() {
  const { online } = useApp();
  const t = useT();
  if (online) return null;
  return (
    <div className="offline-banner"><WifiOff size={16} /> {t('offline.banner')}</div>
  );
}

export function Confetti({ count = 40 }) {
  const pieces = useMemo(
    () => Array.from({ length: count }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 0.6,
      dur: 1.6 + Math.random() * 1.4,
      color: ['#ff6b3d', '#ffc94d', '#6b4eff', '#3fb86b', '#ff5fc8', '#3a8dff'][i % 6],
      rot: Math.random() * 360,
      shape: i % 3,
    })),
    [count]
  );
  return (
    <div className="confetti" aria-hidden>
      {pieces.map((p, i) => (
        <span key={i} style={{ left: `${p.left}%`, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, background: p.color, transform: `rotate(${p.rot}deg)`, borderRadius: p.shape === 0 ? '50%' : 2 }} />
      ))}
    </div>
  );
}

export function Segmented({ value, onChange, options }) {
  return (
    <div className="segmented" role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} className={value === o.value ? 'active' : ''} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Chip({ active, onClick, children, color, className = '' }) {
  return (
    <button type="button" className={`chip ${active ? 'chip-active' : ''} ${className}`} onClick={onClick} style={color ? { '--chip': color } : undefined} aria-pressed={!!active}>
      {children}
    </button>
  );
}
