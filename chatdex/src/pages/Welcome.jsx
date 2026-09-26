import { useState } from 'react';
import { useApp } from '../store.jsx';
import { CatArt } from '../components/ui.jsx';

const HERO_CATS = [
  { coatColor: 'orange', pattern: 'tabby', eyeColor: 'green', artSeed: 11 },
  { coatColor: 'black', pattern: 'tuxedo', eyeColor: 'yellow', artSeed: 42 },
  { coatColor: 'white', pattern: 'calico', eyeColor: 'amber', artSeed: 7 },
  { coatColor: 'grey', pattern: 'tabby', eyeColor: 'blue', artSeed: 99 },
  { coatColor: 'cream', pattern: 'colorpoint', eyeColor: 'blue', artSeed: 5, rarity: 'shiny' },
];

export const GUIDELINES = [
  ['👀', 'Observe from a distance. Never chase, pick up or corner a cat.'],
  ['🚧', 'Stay on public ground. Never enter gardens or private property.'],
  ['🍗', "Don't feed cats that aren't yours without the owner's permission."],
  ['📍', 'Locations are always approximate. Never share a cat’s exact home.'],
];

export default function Welcome() {
  const { login, register, meta } = useApp();
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
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  const demo = async () => {
    setBusy(true);
    setError(null);
    try { await login('demo@chatdex.app', 'chatdex'); } catch (err) { setError(err.message); setBusy(false); }
  };

  if (mode === 'home') {
    return (
      <main className="welcome">
        <div className="welcome-cats" aria-hidden>
          {HERO_CATS.map((c, i) => <div key={i} className={`welcome-cat wc-${i}`}><CatArt cat={c} /></div>)}
        </div>
        <div className="welcome-body">
          <h1 className="logo-big">Chatdex</h1>
          <p className="tagline">Gotta catch ’em cats.</p>
          <p className="welcome-pitch">Photograph the cats you meet, grow your collection, and see who else has found them.</p>
          <div className="stack">
            <button className="btn btn-primary btn-lg btn-block" onClick={() => setMode('register')}>Start hunting</button>
            <button className="btn btn-ghost btn-lg btn-block" onClick={() => setMode('login')}>I already have an account</button>
            {meta?.demoData && (
              <button className="btn btn-link" onClick={demo} disabled={busy}>👀 Just looking? Explore the demo world</button>
            )}
          </div>
          {error && <p className="form-error">{error}</p>}
        </div>
      </main>
    );
  }

  return (
    <main className="welcome welcome-form">
      <button className="btn btn-link back-link" onClick={() => { setMode('home'); setError(null); }}>← Back</button>
      <h1 className="logo">Chatdex</h1>
      <h2>{mode === 'login' ? 'Welcome back, hunter' : 'Create your hunter profile'}</h2>
      <form onSubmit={submit} className="stack" noValidate>
        {mode === 'register' && (
          <>
            <label className="field">
              <span>Username</span>
              <input value={form.username} onChange={set('username')} autoComplete="username" placeholder="catlover_42" maxLength={20} required />
            </label>
            <label className="field">
              <span>Display name <em className="muted">(optional)</em></span>
              <input value={form.displayName} onChange={set('displayName')} placeholder="Tom" maxLength={30} />
            </label>
          </>
        )}
        <label className="field">
          <span>Email</span>
          <input type="email" value={form.email} onChange={set('email')} autoComplete="email" placeholder="you@example.com" required />
        </label>
        <label className="field">
          <span>Password</span>
          <input type="password" value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} placeholder={mode === 'login' ? '••••••' : 'At least 6 characters'} required />
        </label>
        {mode === 'register' && (
          <div className="guidelines">
            <h3>🐾 Respect the cats</h3>
            <ul>{GUIDELINES.map(([i, t]) => <li key={t}><span>{i}</span>{t}</li>)}</ul>
            <label className="check">
              <input type="checkbox" checked={form.acceptGuidelines} onChange={set('acceptGuidelines')} />
              <span>I promise to hunt with my camera only.</span>
            </label>
          </div>
        )}
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="btn btn-primary btn-lg btn-block" disabled={busy}>
          {busy ? 'One moment…' : mode === 'login' ? 'Log in' : 'Create account'}
        </button>
      </form>
      <p className="center muted">
        {mode === 'login' ? 'New here? ' : 'Already a hunter? '}
        <button className="btn btn-link" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(null); }}>
          {mode === 'login' ? 'Create an account' : 'Log in'}
        </button>
      </p>
    </main>
  );
}
