import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { api, mediaUrl } from '../api.js';
import { useApp, useApi } from '../store.jsx';
import { Avatar, Page, Sheet, TopBar } from '../components/ui.jsx';
import { Guidelines } from './Welcome.jsx';
import { errorText, LanguageSelect, useT } from '../i18n/index.jsx';

const EMOJIS = ['🐱', '😺', '😸', '🐾', '🦊', '🐯', '🦁', '🐻', '🐼', '🦉', '🌙', '⭐', '🌸', '🍀', '🎩', '🔭'];
const COLORS = ['#ff8a4c', '#ff5c8a', '#7c5cff', '#3a8dff', '#2bb3a3', '#3fb86b', '#f2b705', '#7a5638', '#2b2b55'];

export default function EditProfile() {
  const { me, setMe, logout, toast } = useApp();
  const navigate = useNavigate();
  const t = useT();
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
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [deleteError, setDeleteError] = useState(null);

  const deleteAccount = async () => {
    setBusy(true);
    setDeleteError(null);
    try {
      await api('/me', { method: 'DELETE', body: { password } });
      toast(t('settings.deleted'), 'success');
      await logout();
    } catch (err) {
      setDeleteError(errorText(t, err));
      setBusy(false);
    }
  };

  const save = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await api('/me', { method: 'PATCH', body: { ...form, favoriteCatId: form.favoriteCatId || null } });
      setMe(res);
      toast(t('settings.saved'), 'success');
      navigate(`/u/${me.user.username}`);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Page className="edit-profile">
      <TopBar back title={t('settings.title')} />
      <section className="card row between"><strong>{t('settings.language')}</strong><LanguageSelect /></section>
      <form className="stack" onSubmit={save}>
        <div className="center"><Avatar user={form} size={96} ring /></div>
        <div>
          <h3 className="label">{t('field.avatar')}</h3>
          <div className="emoji-grid">
            {EMOJIS.map((e) => <button type="button" key={e} className={`emoji-btn ${form.avatarEmoji === e ? 'active' : ''}`} onClick={() => setForm({ ...form, avatarEmoji: e })}>{e}</button>)}
          </div>
          <div className="color-row">
            {COLORS.map((c) => <button type="button" key={c} aria-label={c} className={`color-btn ${form.avatarColor === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setForm({ ...form, avatarColor: c })} />)}
          </div>
        </div>
        <label className="field"><span>{t('field.displayName')}</span><input value={form.displayName} maxLength={30} onChange={(e) => setForm({ ...form, displayName: e.target.value })} /></label>
        <label className="field"><span>{t('field.bio')}</span><textarea value={form.bio} maxLength={160} rows={3} placeholder={t('settings.bioPlaceholder')} onChange={(e) => setForm({ ...form, bio: e.target.value })} /></label>
        <label className="field">
          <span>{t('profile.favCat')}</span>
          <select value={form.favoriteCatId} onChange={(e) => setForm({ ...form, favoriteCatId: e.target.value })}>
            <option value="">{t('common.none')}</option>
            {mine?.cats.map((c) => <option key={c.id} value={c.id}>{c.name} ({t.region(c.region)})</option>)}
          </select>
        </label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>{busy ? t('common.saving') : t('common.save')}</button>
      </form>

      <div className="mt"><Guidelines /></div>
      <p className="muted small center">{t('settings.signedInAs', { email: me.user.email })}</p>
      <button className="btn btn-ghost btn-block danger" onClick={logout}><LogOut size={18} /> {t('settings.logout')}</button>
      <a className="btn btn-link" href={mediaUrl('/privacy.html')} target="_blank" rel="noreferrer">{t('settings.privacy')}</a>
      <button className="btn btn-link danger" onClick={() => setDeleteOpen(true)}>{t('settings.deleteAccount')}</button>
      <Sheet open={deleteOpen} onClose={() => setDeleteOpen(false)} title={t('settings.deleteTitle')}>
        <p>{t('settings.deleteText')}</p>
        <label className="field">
          <span>{t('settings.passwordConfirm')}</span>
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
        </label>
        {deleteError && <p className="form-error" role="alert">{deleteError}</p>}
        <button className="btn btn-primary btn-block danger-bg" disabled={!password || busy} onClick={deleteAccount}>{t('settings.deleteConfirm')}</button>
      </Sheet>
    </Page>
  );
}
