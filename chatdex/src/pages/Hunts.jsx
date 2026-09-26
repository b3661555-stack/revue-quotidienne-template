import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Camera, LocateFixed, Plus } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useApi } from '../store.jsx';
import { Avatar, Chip, EmptyState, ErrorState, Page, ProgressBar, Sheet, Spinner, TopBar } from '../components/ui.jsx';
import { CatCard } from './Dex.jsx';
import { getPosition, lastKnownPosition } from '../lib/location.js';
import { errorText, useT } from '../i18n/index.jsx';
import { huntTitle } from '../components/social.jsx';

function useCountdown(endsAt) {
  const t = useT();
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, Date.parse(endsAt) - now);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return ms ? `${h ? `${h}:` : ''}${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}` : t('hunt.ended');
}

function HuntCard({ hunt }) {
  const t = useT();
  const left = useCountdown(hunt.endsAt);
  return (
    <Link to={`/hunts/${hunt.id}`} className="card hunt-card">
      <div className="row between">
        <strong>🏹 {huntTitle(t, hunt)}</strong>
        {hunt.status === 'active' && <span className="pill pill-live">● {t('hunt.live')}</span>}
        {hunt.status === 'completed' && <span className="pill pill-gold">🎯 {t('hunt.done')}</span>}
      </div>
      <div className="hunt-progress-row">
        <ProgressBar value={hunt.progress} max={hunt.goal} color="linear-gradient(90deg,#6b4eff,#ff5fc8)" />
        <span className="small strong">{hunt.progress}/{hunt.goal}</span>
      </div>
      <div className="row between">
        <span className="avatar-stack">{hunt.participants.slice(0, 5).map((p) => <Avatar key={p.id} user={p} size={26} />)}</span>
        <span className="muted small">{hunt.status === 'active' ? `⏱ ${t('hunt.left', { time: left })}` : hunt.status === 'completed' ? t('hunt.goalReached') : t('hunt.endedAgo', { when: t.timeAgo(hunt.endsAt) })}</span>
      </div>
    </Link>
  );
}

function CreateHunt({ open, onClose }) {
  const { meta, toast } = useApp();
  const t = useT();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', region: '', durationMin: 90, goal: 10, pos: lastKnownPosition() });
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const useGps = async () => {
    setLocating(true);
    try { const pos = await getPosition(); setForm((f) => ({ ...f, pos, region: '' })); } catch (err) { toast(`${t(`loc.error.${err.code || 'unavailable'}`)} ${t('hunt.pickTown')}`, 'error'); }
    setLocating(false);
  };
  const submit = async () => {
    setBusy(true);
    try {
      const body = { title: form.title, durationMin: form.durationMin, goal: form.goal, region: form.region };
      if (!form.region && form.pos) { body.lat = form.pos.lat; body.lng = form.pos.lng; }
      const res = await api('/hunts', { method: 'POST', body });
      toast(`${t('hunt.started')} 🏹`, 'success');
      onClose();
      navigate(`/hunts/${res.hunt.id}`);
    } catch (err) { toast(errorText(t, err), 'error'); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title={t('hunt.new')}>
      <label className="field"><span>{t('hunt.name')} <em className="muted">{t('common.optional')}</em></span><input value={form.title} maxLength={40} placeholder={t('hunt.namePlaceholder')} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <h3 className="label">{t('hunt.where')}</h3>
      <div className="row gap wrap">
        <Chip active={!form.region && !!form.pos} onClick={useGps}><LocateFixed size={14} /> {locating ? t('loc.finding') : form.pos && !form.region && form.pos.name ? t('loc.near', { place: form.pos.name }) : t('hunt.aroundMe')}</Chip>
        <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} aria-label={t('hunt.town')}>
          <option value="">{t('hunt.orTown')}</option>
          {meta.regions.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
        </select>
      </div>
      <h3 className="label">{t('hunt.duration')}</h3>
      <div className="chips">{[30, 60, 90, 120, 180].map((d) => <Chip key={d} active={form.durationMin === d} onClick={() => setForm({ ...form, durationMin: d })}>{d < 60 ? t('time.min', { n: d }) : t('time.hours', { n: d / 60 })}</Chip>)}</div>
      <h3 className="label">{t('hunt.goal')}</h3>
      <div className="chips">{[3, 5, 10, 15, 20].map((g) => <Chip key={g} active={form.goal === g} onClick={() => setForm({ ...form, goal: g })}>{t('common.cats', { count: g })}</Chip>)}</div>
      <button className="btn btn-primary btn-lg btn-block mt" disabled={busy || (!form.region && !form.pos)} onClick={submit}>{t('hunt.start')}</button>
      {!form.region && !form.pos && <p className="muted small center">{t('errors.huntWhere')}</p>}
    </Sheet>
  );
}

export function Hunts() {
  const t = useT();
  const { data, error, loading, reload } = useApi('/hunts');
  const [open, setOpen] = useState(false);
  return (
    <Page>
      <TopBar back title={t('hunt.title')} right={<button className="icon-btn" onClick={() => setOpen(true)} aria-label={t('hunt.new')}><Plus size={22} /></button>} />
      <div className="card hunt-intro">
        <strong>{t('hunt.together')}</strong>
        <p className="small muted">{t('hunt.intro', { xp: 150 })}</p>
        <button className="btn btn-primary btn-block" onClick={() => setOpen(true)}>🏹 {t('hunt.startA')}</button>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <>
          <h2 className="section-title">{t('hunt.now')}</h2>
          {data.active.length ? data.active.map((h) => <HuntCard key={h.id} hunt={h} />) : <EmptyState icon="🏹" title={t('hunt.noneTitle')} text={t('hunt.noneText')} />}
          {data.past.length > 0 && <><h2 className="section-title">{t('hunt.past')}</h2>{data.past.map((h) => <HuntCard key={h.id} hunt={h} />)}</>}
        </>
      )}
      <CreateHunt open={open} onClose={() => setOpen(false)} />
    </Page>
  );
}

export function HuntDetail() {
  const { id } = useParams();
  const { toast } = useApp();
  const t = useT();
  const { data, error, loading, reload, setData } = useApi(`/hunts/${id}`);
  useEffect(() => { const t = setInterval(() => reload(true), 20000); return () => clearInterval(t); }, [reload]);
  const left = useCountdown(data?.hunt.endsAt || new Date().toISOString());
  if (loading && !data) return <Page><Spinner /></Page>;
  if (error) return <Page><TopBar back title={t('hunt.single')} /><ErrorState error={error} onRetry={reload} /></Page>;
  const { hunt, found } = data;
  const join = async (leave) => {
    try {
      const res = await api(`/hunts/${hunt.id}/${leave ? 'leave' : 'join'}`, { method: 'POST' });
      setData((d) => ({ ...d, hunt: res.hunt }));
      if (!leave) toast(t('hunt.joinedToast'), 'success');
    } catch (err) { toast(errorText(t, err), 'error'); }
  };
  const pct = Math.min(100, Math.round((hunt.progress / hunt.goal) * 100));
  return (
    <Page>
      <TopBar back title={t('hunt.single')} />
      <section className="card hunt-hero">
        {hunt.status === 'active' && <span className="pill pill-live">● {t('hunt.live')} · {t('hunt.left', { time: left })}</span>}
        {hunt.status === 'completed' && <span className="pill pill-gold">🎯 {t('hunt.goalReached')}</span>}
        {hunt.status === 'ended' && <span className="pill">{t('hunt.endedPill')}</span>}
        <h1>🏹 {huntTitle(t, hunt)}</h1>
        <p className="muted">📍 {t.region(hunt.region)} · {t('hunt.goalText', { count: hunt.goal })}</p>
        <div className="ring" style={{ '--p': pct }}><span><strong>{hunt.progress}</strong>/{hunt.goal}</span></div>
        <div className="avatar-stack big">{hunt.participants.map((p) => <Link key={p.id} to={`/u/${p.username}`} title={p.displayName}><Avatar user={p} size={36} /></Link>)}</div>
        <p className="small muted">{t('common.hunters', { count: hunt.participants.length })}</p>
        {hunt.status === 'active' && (
          hunt.joined
            ? <div className="stack"><Link to="/capture" className="btn btn-primary btn-lg btn-block"><Camera size={20} /> {t('common.captureCat')}</Link><button className="btn btn-link" onClick={() => join(true)}>{t('hunt.leave')}</button></div>
            : <button className="btn btn-primary btn-lg btn-block" onClick={() => join(false)}>{t('hunt.join')}</button>
        )}
      </section>
      <h2 className="section-title">{t('hunt.found')}</h2>
      {found.length
        ? <div className="cat-grid">{found.map((c) => <CatCard key={c.id} cat={c} />)}</div>
        : <EmptyState icon="🔎" title={t('hunt.noCats')} text={t('hunt.noCatsText')} />}
    </Page>
  );
}
