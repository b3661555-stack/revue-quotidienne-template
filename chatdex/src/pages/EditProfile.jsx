import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { api } from '../api.js';
import { useApp, useApi } from '../store.jsx';
import { Avatar, Page, TopBar } from '../components/ui.jsx';
import { GUIDELINES } from './Welcome.jsx';

const EMOJIS = ['🐱', '😺', '😸', '🐾', '🦊', '🐯', '🦁', '🐻', '🐼', '🦉', '🌙', '⭐', '🌸', '🍀', '🎩', '🔭'];
const COLORS = ['#ff8a4c', '#ff5c8a', '#7c5cff', '#3a8dff', '#2bb3a3', '#3fb86b', '#f2b705', '#7a5638', '#2b2b55'];

export default function EditProfile() {
  const { me, setMe, logout, toast } = useApp();
  const navigate = useNavigate();
  const { data: mine } = useApi('/cats?scope=mine&sort=recent');
  const [form, setForm] = useState({
    displayName: me.user.displayName,
    bio: me.user.bio,
    avatarEmoji: me.user.avatarEmoji,
    avatarColor: me.user.avatarColor,
    favoriteCatId: me.user.favoriteCatId || '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api('/me', { method: 'PATCH', body: { ...form, favoriteCatId: form.favoriteCatId || null } });
      setMe(res);
      toast('Profile saved', 'success');
      navigate(`/u/${me.user.username}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page className="edit-profile">
      <TopBar back title="Edit profile" />
      <form className="stack" onSubmit={save}>
        <div className="center"><Avatar user={form} size={96} ring /></div>
        <div>
          <h3 className="label">Avatar</h3>
          <div className="emoji-grid">
            {EMOJIS.map((e) => <button type="button" key={e} className={`emoji-btn ${form.avatarEmoji === e ? 'active' : ''}`} onClick={() => setForm({ ...form, avatarEmoji: e })}>{e}</button>)}
          </div>
          <div className="color-row">
            {COLORS.map((c) => <button type="button" key={c} aria-label={`Colour ${c}`} className={`color-btn ${form.avatarColor === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setForm({ ...form, avatarColor: c })} />)}
          </div>
        </div>
        <label className="field"><span>Display name</span><input value={form.displayName} maxLength={30} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>
        <label className="field"><span>Bio</span><textarea value={form.bio} maxLength={160} rows={3} placeholder="What kind of cat hunter are you?" onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
        <label className="field">
          <span>Favourite cat</span>
          <select value={form.favoriteCatId} onChange={(e) => setForm({ ...form, favoriteCatId: e.target.value })}>
            <option value="">None</option>
            {mine?.cats.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.region})</option>)}
          </select>
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </form>

      <section className="card mt guidelines">
        <h3>🐾 Respect the cats</h3>
        <ul>{GUIDELINES.map(([i, t]) => <li key={t}><span>{i}</span>{t}</li>)}</ul>
      </section>
      <p className="muted small center">Signed in as {me.user.email}</p>
      <button className="btn btn-ghost btn-block danger" onClick={logout}><LogOut size={18} /> Log out</button>
    </Page>
  );
}
