import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Camera, LocateFixed, Plus } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useApi } from '../store.jsx';
import { Avatar, Chip, EmptyState, ErrorState, Page, ProgressBar, Sheet, Spinner, TopBar } from '../components/ui.jsx';
import { CatCard } from './Dex.jsx';
import { getPosition, lastKnownPosition } from '../lib/location.js';
import { plural, timeAgo } from '../lib/format.js';

function useCountdown(endsAt) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  const ms = Math.max(0, Date.parse(endsAt) - now);
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  return ms ? `${h ? `${h}h ` : ''}${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s` : 'ended';
}

function HuntCard({ hunt }) {
  const left = useCountdown(hunt.endsAt);
  return (
    <Link to={`/hunts/${hunt.id}`} className="card hunt-card">
      <div className="row between">
        <strong>🏹 {hunt.title}</strong>
        {hunt.status === 'active' && <span className="pill pill-live">● LIVE</span>}
        {hunt.status === 'completed' && <span className="pill pill-gold">🎯 Done</span>}
      </div>
      <div className="hunt-progress-row">
        <ProgressBar value={hunt.progress} max={hunt.goal} color="linear-gradient(90deg,#6b4eff,#ff5fc8)" />
        <span className="small strong">{hunt.progress}/{hunt.goal}</span>
      </div>
      <div className="row between">
        <span className="avatar-stack">{hunt.participants.slice(0, 5).map((p) => <Avatar key={p.id} user={p} size={26} />)}</span>
        <span className="muted small">{hunt.status === 'active' ? `⏱ ${left} left` : hunt.status === 'completed' ? 'Goal reached' : `ended ${timeAgo(hunt.endsAt)}`}</span>
      </div>
    </Link>
  );
}

function CreateHunt({ open, onClose }) {
  const { meta, toast } = useApp();
  const navigate = useNavigate();
  const [form, setForm] = useState({ title: '', region: '', durationMin: 90, goal: 10, pos: lastKnownPosition() });
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);
  const useGps = async () => {
    setLocating(true);
    try { const pos = await getPosition(); setForm((f) => ({ ...f, pos, region: '' })); } catch (err) { toast(`${err.message} Pick a town instead.`, 'error'); }
    setLocating(false);
  };
  const submit = async () => {
    setBusy(true);
    try {
      const body = { title: form.title, durationMin: form.durationMin, goal: form.goal, region: form.region };
      if (!form.region && form.pos) { body.lat = form.pos.lat; body.lng = form.pos.lng; }
      const res = await api('/hunts', { method: 'POST', body });
      toast('Hunt started! Good luck 🏹', 'success');
      onClose();
      navigate(`/hunts/${res.hunt.id}`);
    } catch (err) { toast(err.message, 'error'); } finally { setBusy(false); }
  };
  return (
    <Sheet open={open} onClose={onClose} title="New Cat Hunt">
      <label className="field"><span>Name <em className="muted">(optional)</em></span><input value={form.title} maxLength={40} placeholder="Sunday cat walk" onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
      <h3 className="label">Where</h3>
      <div className="row gap wrap">
        <Chip active={!form.region && !!form.pos} onClick={useGps}><LocateFixed size={14} /> {locating ? 'Locating…' : form.pos && !form.region ? (form.pos.name ? `Near ${form.pos.name}` : 'Around me') : 'Around me'}</Chip>
        <select value={form.region} onChange={(e) => setForm({ ...form, region: e.target.value })} aria-label="Town">
          <option value="">or pick a town…</option>
          {meta.regions.map((r) => <option key={r.name} value={r.name}>{r.name}</option>)}
        </select>
      </div>
      <h3 className="label">Duration</h3>
      <div className="chips">{[30, 60, 90, 120, 180].map((d) => <Chip key={d} active={form.durationMin === d} onClick={() => setForm({ ...form, durationMin: d })}>{d < 60 ? `${d} min` : `${d / 60} h`}</Chip>)}</div>
      <h3 className="label">Goal</h3>
      <div className="chips">{[3, 5, 10, 15, 20].map((g) => <Chip key={g} active={form.goal === g} onClick={() => setForm({ ...form, goal: g })}>{g} cats</Chip>)}</div>
      <button className="btn btn-primary btn-lg btn-block mt" disabled={busy || (!form.region && !form.pos)} onClick={submit}>Start the hunt</button>
      {!form.region && !form.pos && <p className="muted small center">Choose where the hunt happens.</p>}
    </Sheet>
  );
}

export function Hunts() {
  const { data, error, loading, reload } = useApi('/hunts');
  const [open, setOpen] = useState(false);
  return (
    <Page>
      <TopBar back title="Cat Hunts" right={<button className="icon-btn" onClick={() => setOpen(true)} aria-label="New hunt"><Plus size={22} /></button>} />
      <div className="card hunt-intro">
        <strong>Hunt together</strong>
        <p className="small muted">Team up for a timed walk. Every cat any hunter spots counts toward the goal. Complete it for +150 XP each.</p>
        <button className="btn btn-primary btn-block" onClick={() => setOpen(true)}>🏹 Start a hunt</button>
      </div>
      {loading && !data && <Spinner />}
      {error && <ErrorState error={error} onRetry={reload} />}
      {data && (
        <>
          <h2 className="section-title">Happening now</h2>
          {data.active.length ? data.active.map((h) => <HuntCard key={h.id} hunt={h} />) : <EmptyState icon="🏹" title="No hunts right now" text="Start one and invite your followers." />}
          {data.past.length > 0 && <><h2 className="section-title">Past hunts</h2>{data.past.map((h) => <HuntCard key={h.id} hunt={h} />)}</>}
        </>
      )}
      <CreateHunt open={open} onClose={() => setOpen(false)} />
    </Page>
  );
}

export function HuntDetail() {
  const { id } = useParams();
  const { toast } = useApp();
  const { data, error, loading, reload, setData } = useApi(`/hunts/${id}`);
  useEffect(() => { const t = setInterval(() => reload(true), 20000); return () => clearInterval(t); }, [reload]);
  const left = useCountdown(data?.hunt.endsAt || new Date().toISOString());
  if (loading && !data) return <Page><Spinner /></Page>;
  if (error) return <Page><TopBar back title="Cat Hunt" /><ErrorState error={error} onRetry={reload} /></Page>;
  const { hunt, found } = data;
  const join = async (leave) => {
    try {
      const res = await api(`/hunts/${hunt.id}/${leave ? 'leave' : 'join'}`, { method: 'POST' });
      setData((d) => ({ ...d, hunt: res.hunt }));
      if (!leave) toast("You joined the hunt. Every cat you capture now counts!", 'success');
    } catch (err) { toast(err.message, 'error'); }
  };
  const pct = Math.min(100, Math.round((hunt.progress / hunt.goal) * 100));
  return (
    <Page>
      <TopBar back title="Cat Hunt" />
      <section className="card hunt-hero">
        {hunt.status === 'active' && <span className="pill pill-live">● LIVE · {left} left</span>}
        {hunt.status === 'completed' && <span className="pill pill-gold">🎯 Goal reached!</span>}
        {hunt.status === 'ended' && <span className="pill">Ended</span>}
        <h1>🏹 {hunt.title}</h1>
        <p className="muted">📍 {hunt.region} · Goal: discover {plural(hunt.goal, 'cat')}</p>
        <div className="ring" style={{ '--p': pct }}><span><strong>{hunt.progress}</strong>/{hunt.goal}</span></div>
        <div className="avatar-stack big">{hunt.participants.map((p) => <Link key={p.id} to={`/u/${p.username}`} title={p.displayName}><Avatar user={p} size={36} /></Link>)}</div>
        <p className="small muted">{plural(hunt.participants.length, 'hunter')}</p>
        {hunt.status === 'active' && (
          hunt.joined
            ? <div className="stack"><Link to="/capture" className="btn btn-primary btn-lg btn-block"><Camera size={20} /> Capture a cat</Link><button className="btn btn-link" onClick={() => join(true)}>Leave hunt</button></div>
            : <button className="btn btn-primary btn-lg btn-block" onClick={() => join(false)}>Join the hunt</button>
        )}
      </section>
      <h2 className="section-title">Cats found during the hunt</h2>
      {found.length
        ? <div className="cat-grid">{found.map((c) => <CatCard key={c.id} cat={c} />)}</div>
        : <EmptyState icon="🔎" title="No cats yet" text="Walk slowly, look at windows, walls and doorsteps." />}
    </Page>
  );
}
