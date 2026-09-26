import { useState } from 'react';
import { useApp } from '../store.jsx';
import { CatArt } from '../components/ui.jsx';
import { errorText, LanguageSelect, useT } from '../i18n/index.jsx';

const HERO_CATS = [
  { coatColor: 'orange', pattern: 'tabby', eyeColor: 'green', artSeed: 11 },
  { coatColor: 'black', pattern: 'tuxedo', eyeColor: 'yellow', artSeed: 42 },
  { coatColor: 'white', pattern: 'calico', eyeColor: 'amber', artSeed: 7 },
  { coatColor: 'grey', pattern: 'tabby', eyeColor: 'blue', artSeed: 99 },
  { coatColor: 'cream', pattern: 'colorpoint', eyeColor: 'blue', artSeed: 5, rarity: 'shiny' },
];

export const GUIDELINES = [['👀', 'guide.distance'], ['🚧', 'guide.public'], ['🍗', 'guide.feed'], ['📍', 'guide.location']];

export function Guidelines({ children }) {
  const t = useT();
  return (
    <div className="guidelines">
      <h3>🐾 {t('guide.title')}</h3>
      <ul>{GUIDELINES.map(([i, k]) => <li key={k}><span>{i}</span>{t(k)}</li>)}</ul>
      {children}
    </div>
  );
}

export default function Welcome() {
  const { login, register, meta } = useApp();
  const t = useT();
  const [mode, setMode] = useState('home');
  const [form, setForm] = useState({ email: '', password: '', username: '', displayName: '', acceptGuidelines: false });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));

  const submit = async (e) => {
    e?.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') await login(form.email, form.password);
      else await register(form);
    } catch (err) {
      setError(errorText(t, err));
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    setBusy(true);
    setError(null);
    try { await login('demo@chatdex.app', 'chatdex'); } catch (err) { setError(errorText(t, err)); setBusy(false); }
  };

  if (mode === 'home') {
    return (
      <main className="welcome">
        <LanguageSelect className="welcome-lang" />
        <div className="welcome-cats" aria-hidden>
          {HERO_CATS.map((c, i) => <div key={i} className={`welcome-cat wc-${i}`}><CatArt cat={c} /></div>)}
        </div>
        <div className="welcome-body">
          <h1 className="logo-big">Chatdex</h1>
          <p className="tagline">{t('app.tagline')}</p>
          <p className="welcome-pitch">{t('welcome.pitch')}</p>
          <div className="stack">
            <button className="btn btn-primary btn-lg btn-block" onClick={() => setMode('register')}>{t('welcome.start')}</button>
            <button className="btn btn-ghost btn-lg btn-block" onClick={() => setMode('login')}>{t('welcome.haveAccount')}</button>
            {meta?.demoData && (
              <button className="btn btn-link" onClick={demo} disabled={busy}>👀 {t('welcome.demo')}</button>
            )}
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="welcome welcome-form">
      <button className="btn btn-link back-link" onClick={() => { setMode('home'); setError(null); }}>{t('common.backArrow')}</button>
      <h1 className="logo">Chatdex</h1>
      <h2>{mode === 'login' ? t('auth.loginTitle') : t('auth.registerTitle')}</h2>
      <form onSubmit={submit} className="stack" noValidate>
        {mode === 'register' && (
          <>
            <label className="field">
              <span>{t('field.username')}</span>
              <input value={form.username} onChange={set('username')} autoComplete="username" placeholder="catlover_42" maxLength={20} required />
            </label>
            <label className="field">
              <span>{t('field.displayName')} <em className="muted">{t('common.optional')}</em></span>
              <input value={form.displayName} onChange={set('displayName')} placeholder="Tom" maxLength={30} />
            </label>
          </>
        )}
        <label className="field">
          <span>{t('field.email')}</span>
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" required />
        </label>
        <label className="field">
          <span>{t('field.password')}</span>
          <input type="password" value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? '••••••' : t('auth.passwordHint')} required />
        </label>
        {mode === 'register' && (
          <Guidelines>
            <label className="check">
              <input type="checkbox" checked={form.acceptGuidelines} onChange={set('acceptGuidelines')} />
              <span>{t('guide.promise')}</span>
            </label>
          </Guidelines>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? t('common.oneMoment') : mode === 'login' ? t('auth.login') : t('auth.create')}
        </button>
      </form>
      <p className="center muted">
        {mode === 'login' ? t('auth.newHere') : t('auth.already')}{' '}
        <button className="btn btn-link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
          {mode === 'login' ? t('auth.createLink') : t('auth.login')}
        </button>
      </p>
    </main>
  );
}
