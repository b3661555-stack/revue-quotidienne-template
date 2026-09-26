import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Camera, Dices, ImagePlus, LocateFixed, MapPin, RefreshCw, Search, X } from 'lucide-react';
import { api } from '../api.js';
import { useApp } from '../store.jsx';
import { CatImage, Chip, Confetti, RarityBadge, Sheet, Spinner, RARITY } from '../components/ui.jsx';
import { GUIDELINES } from './Welcome.jsx';
import { drawToCanvas, fingerprint, guessCoatColor, loadImage, thumbnail, toJpeg } from '../lib/image.js';
import { detectCats, loadDetector } from '../lib/detector.js';
import { distanceKm, getPosition, saveArea, savedArea } from '../lib/location.js';
import { ordinal, plural, randomCatName, timeAgo } from '../lib/format.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function useLocation() {
  const [loc, setLoc] = useState({ status: 'locating', pos: null });
  const locate = useCallback(async () => {
    setLoc((l) => ({ ...l, status: 'locating' }));
    try {
      const pos = await getPosition();
      setLoc({ status: 'ok', pos });
    } catch (err) {
      const area = savedArea();
      setLoc({ status: area ? 'manual' : err.code, pos: area, error: err.message });
    }
  }, []);
  useEffect(() => { locate(); }, [locate]);
  return [loc, setLoc, locate];
}

function AreaSheet({ open, onClose, onPick, onRetryGps, regions }) {
  const [q, setQ] = useState('');
  const list = useMemo(() => regions.filter((r) => r.name.toLowerCase().includes(q.toLowerCase())), [regions, q]);
  return (
    <Sheet open={open} onClose={onClose} title="Where are you?">
      <p className="muted small">We only use an approximate area (never an exact address).</p>
      <button className="btn btn-ghost btn-block" onClick={onRetryGps}><LocateFixed size={18} /> Use my location</button>
      <div className="search-field mt"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search a town" aria-label="Search a town" /></div>
      <div className="area-list">
        {list.map((r) => <button key={r.name} className="menu-row" onClick={() => onPick(r)}><MapPin size={16} /> {r.name}</button>)}
      </div>
    </Sheet>
  );
}

function PickCatSheet({ open, onClose, pos, onPick }) {
  const [cats, setCats] = useState(null);
  const [q, setQ] = useState('');
  useEffect(() => {
    if (!open || cats) return;
    api('/map').then((m) => {
      const sorted = m.cats
        .map((c) => ({ ...c, d: pos ? distanceKm(pos, c) : 0 }))
        .filter((c) => !pos || c.d < 5)
        .sort((a, b) => a.d - b.d);
      setCats(sorted);
    }).catch(() => setCats([]));
  }, [open, cats, pos]);
  const list = (cats || []).filter((c) => c.name.toLowerCase().includes(q.toLowerCase())).slice(0, 60);
  return (
    <Sheet open={open} onClose={onClose} title="Which cat is it?">
      <div className="search-field"><Search size={16} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name" aria-label="Search by name" /></div>
      {!cats && <Spinner />}
      {cats && !list.length && <p className="muted center mt">No registered cats nearby. It's probably a new one!</p>}
      <div className="pick-list">
        {list.map((c) => (
          <button key={c.id} className="pick-row" onClick={() => onPick(c)}>
            <CatImage cat={c} thumb={c.thumb} className="pick-img" />
            <span className="grow"><strong>{c.name}</strong><span className="muted small block">{c.region} · {c.d ? `${c.d.toFixed(1)} km` : ''} · seen {timeAgo(c.lastObservedAt)}</span></span>
            <RarityBadge rarity={c.rarity} small />
          </button>
        ))}
      </div>
    </Sheet>
  );
}

function Reward({ result, onAgain }) {
  const navigate = useNavigate();
  const { cat } = result;
  const [shown, setShown] = useState(0);
  const lines = result.xp;
  useEffect(() => {
    if (shown >= lines.length + 3) return undefined;
    const t = setTimeout(() => setShown((s) => s + 1), shown === 0 ? 900 : 380);
    return () => clearTimeout(t);
  }, [shown, lines.length]);
  const r = RARITY[cat.rarity];
  const headline = result.isNewCat
    ? { kicker: cat.rarity === 'shiny' ? '✨ SHINY DISCOVERY! ✨' : 'NEW CAT DISCOVERED', emoji: '🎉' }
    : result.respotted
      ? { kicker: `${cat.name.toUpperCase()} HAS BEEN SPOTTED AGAIN!`, emoji: '🚨' }
      : result.firstForUser
        ? { kicker: 'ADDED TO YOUR CHATDEX', emoji: '🐾' }
        : { kicker: `YOU FOUND ${cat.name.toUpperCase()} AGAIN`, emoji: '🐾' };
  return (
    <div className={`reward rarity-bg-${cat.rarity}`} style={{ '--rc': r.color }}>
      {(result.isNewCat || result.levelAfter > result.levelBefore || result.respotted) && <Confetti count={result.isNewCat ? 60 : 36} />}
      <p className="reward-kicker">{headline.emoji} {headline.kicker}</p>
      <div className="reward-card">
        <div className="reward-glow" />
        <CatImage cat={cat} photo={cat.photo} thumb={cat.thumb} full className="reward-img" />
        {result.isFirstCatch && <div className="ribbon">👑 FIRST CATCH</div>}
      </div>
      <h1 className="reward-name">{cat.name}</h1>
      <div className="reward-rarity"><RarityBadge rarity={cat.rarity} /></div>
      {!result.isNewCat && result.firstForUser && result.hunterRank && (
        <p className="reward-sub">You are the <strong>{ordinal(result.hunterRank)}</strong> hunter to observe {cat.name}.</p>
      )}
      {result.respotted && <p className="reward-sub">Nobody had seen {cat.name} for {result.daysMissing} days. Nice detective work!</p>}
      {result.isNewCat && <p className="reward-sub">Nobody has registered this cat before. It's officially your First Catch.</p>}
      <div className="xp-lines">
        {lines.slice(0, Math.max(0, shown - 1)).map((l, i) => (
          <div key={i} className="xp-line"><span>{l.label}</span><strong>+{l.xp} XP</strong></div>
        ))}
        {shown > lines.length && <div className="xp-total">+{result.xpTotal} XP</div>}
      </div>
      {shown > lines.length + 1 && result.levelAfter > result.levelBefore && (
        <div className="levelup">⬆️ Level up! You're now level {result.levelAfter}</div>
      )}
      {shown > lines.length + 1 && result.achievements.map((a) => (
        <div key={a.id} className="badge-unlock"><span className="badge-unlock-icon">{a.icon}</span><span><strong>Badge unlocked: {a.name}</strong><span className="small block">{a.description}</span></span></div>
      ))}
      {shown > lines.length + 1 && result.hunts.map((h) => (
        <div key={h.huntId} className="hunt-line">🏹 {h.title}: {h.progress}/{h.goal} cats {h.justCompleted ? '· COMPLETE! 🎯' : ''}</div>
      ))}
      <div className="reward-actions">
        <button className="btn btn-primary btn-lg btn-block" onClick={() => navigate(`/cat/${cat.id}`)}>See {cat.name}'s profile</button>
        <button className="btn btn-ghost btn-block" onClick={onAgain}><Camera size={18} /> Capture another cat</button>
        <Link className="btn btn-link" to="/">Back home</Link>
      </div>
    </div>
  );
}

export default function Capture() {
  const { meta, setMe, toast, online } = useApp();
  const navigate = useNavigate();
  const [loc, setLoc, locate] = useLocation();
  const [step, setStep] = useState('start');
  const [photo, setPhoto] = useState(null);
  const [detect, setDetect] = useState(null);
  const [attrs, setAttrs] = useState({ coatColor: null, pattern: null, eyeColor: 'unknown' });
  const [multiCat, setMultiCat] = useState(false);
  const [candidates, setCandidates] = useState([]);
  const [candIdx, setCandIdx] = useState(0);
  const [feedback, setFeedback] = useState([]);
  const [newCat, setNewCat] = useState({ name: randomCatName(), tags: [] });
  const [target, setTarget] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [areaOpen, setAreaOpen] = useState(false);
  const [pickOpen, setPickOpen] = useState(false);
  const detectorRef = useRef(null);
  const cameraInput = useRef(null);
  const galleryInput = useRef(null);
  const tip = useMemo(() => GUIDELINES[Math.floor(Math.random() * GUIDELINES.length)], []);

  useEffect(() => { detectorRef.current = loadDetector(meta.catDetector); }, [meta.catDetector]);
  useEffect(() => () => photo?.preview && URL.revokeObjectURL(photo.preview), [photo]);

  const reset = () => {
    setStep('start'); setPhoto(null); setDetect(null); setAttrs({ coatColor: null, pattern: null, eyeColor: 'unknown' });
    setMultiCat(false); setCandidates([]); setCandIdx(0); setFeedback([]); setNewCat({ name: randomCatName(), tags: [] });
    setTarget(null); setResult(null); setError(null);
  };

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError(null);
    setStep('processing');
    try {
      const { img, url } = await loadImage(file);
      const full = drawToCanvas(img, 1280);
      const small = drawToCanvas(img, 640);
      const thumb = thumbnail(img, 360);
      const model = await Promise.race([detectorRef.current, sleep(5000).then(() => null)]);
      const d = await detectCats(model, small);
      const scale = full.width / small.width;
      const box = d.box ? d.box.map((v) => v * scale) : null;
      const guess = guessCoatColor(full, box);
      setPhoto({
        preview: url,
        full: toJpeg(full, 0.82),
        thumb: toJpeg(thumb, 0.8),
        fingerprint: fingerprint(full, box),
        box: d.box ? { x: d.box[0] / small.width, y: d.box[1] / small.height, w: d.box[2] / small.width, h: d.box[3] / small.height } : null,
        guess,
      });
      setAttrs((a) => ({ ...a, coatColor: guess }));
      setDetect(d);
      if (d.count > 1) setMultiCat(true);
      if (d.available && d.count > 0) {
        setStep('detected');
        setTimeout(() => setStep((s) => (s === 'detected' ? 'describe' : s)), 1500);
      } else {
        setStep('confirm');
      }
    } catch (err) {
      setError(err.message || 'This photo could not be processed.');
      setStep('start');
    }
  };

  const identify = async () => {
    if (!loc.pos) { setAreaOpen(true); return; }
    setStep('matching');
    try {
      const res = await api('/captures/match', { method: 'POST', body: { lat: loc.pos.lat, lng: loc.pos.lng, attributes: attrs, fingerprint: photo.fingerprint } });
      await sleep(600);
      setCandidates(res.candidates);
      setCandIdx(0);
      setStep(res.candidates.length ? 'candidates' : 'name');
    } catch (err) {
      // Identification failed: continue as a new cat, the user can still pick an existing one manually.
      toast(err.offline ? err.message : "Couldn't check for known cats. You can still add it.", 'error');
      setCandidates([]);
      setStep('name');
    }
  };

  const answer = (verdict) => {
    const c = candidates[candIdx];
    const fb = [...feedback, { catId: c.id, verdict, score: c.score }];
    setFeedback(fb);
    if (verdict === 'yes') { save({ catId: c.id, matchMethod: 'confirmed' }, fb); return; }
    if (verdict === 'no' && candIdx + 1 < candidates.length) { setCandIdx(candIdx + 1); return; }
    setStep('name');
  };

  const save = async (tgt = target, fb = feedback) => {
    setTarget(tgt);
    setStep('saving');
    setError(null);
    try {
      const body = {
        photo: photo.full,
        thumb: photo.thumb,
        fingerprint: photo.fingerprint,
        attributes: attrs,
        lat: loc.pos.lat,
        lng: loc.pos.lng,
        multiCat,
        localHour: new Date().getHours(),
        feedback: fb,
        ...(tgt?.catId ? { catId: tgt.catId, matchMethod: tgt.matchMethod } : { newCat }),
      };
      const res = await api('/captures', { method: 'POST', body });
      setMe(res.me);
      setResult(res);
      setStep('reward');
    } catch (err) {
      setError(err.message);
      setStep('saveError');
    }
  };

  const pickArea = (r) => {
    const pos = saveArea(r);
    setLoc({ status: 'manual', pos });
    setAreaOpen(false);
  };

  const locationPill = (
    <button className={`loc-pill loc-${loc.status}`} onClick={() => setAreaOpen(true)}>
      <MapPin size={14} />
      {loc.status === 'locating' && 'Finding your area…'}
      {loc.status === 'ok' && 'Location on (approximate)'}
      {loc.status === 'manual' && `Near ${loc.pos?.name || 'chosen area'}`}
      {['denied', 'unavailable', 'timeout'].includes(loc.status) && 'Location off · choose your area'}
    </button>
  );

  const sheets = (
    <>
      <AreaSheet open={areaOpen} onClose={() => setAreaOpen(false)} onPick={pickArea} regions={meta.regions}
        onRetryGps={async () => { setAreaOpen(false); await locate(); }} />
      <PickCatSheet open={pickOpen} onClose={() => setPickOpen(false)} pos={loc.pos}
        onPick={(c) => { setPickOpen(false); save({ catId: c.id, matchMethod: 'manual' }, feedback); }} />
    </>
  );

  const inputs = (
    <>
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} data-testid="camera-input" />
      <input ref={galleryInput} type="file" accept="image/*" hidden onChange={onFile} data-testid="gallery-input" />
    </>
  );

  if (step === 'reward' && result) return <main className="page capture-page"><Reward result={result} onAgain={reset} /></main>;

  return (
    <main className="page capture-page">
      <header className="capture-top">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Close"><X size={22} /></button>
        {locationPill}
        <span className="topbar-spacer" />
      </header>
      {inputs}
      {sheets}

      {step === 'start' && (
        <div className="capture-start">
          <button className="viewfinder" onClick={() => cameraInput.current.click()} aria-label="Take a photo">
            <span className="vf-corner tl" /><span className="vf-corner tr" /><span className="vf-corner bl" /><span className="vf-corner br" />
            <span className="vf-emoji">🐈</span>
            <span className="vf-text">Saw a cat?</span>
            <span className="muted small">Snap it from a respectful distance</span>
          </button>
          {error && <p className="form-error" role="alert">{error}</p>}
          {!online && <p className="form-error">You're offline. You can take the photo now, but you'll need a connection to save it.</p>}
          <button className="shutter" onClick={() => cameraInput.current.click()} aria-label="Take photo"><Camera size={34} /></button>
          <button className="btn btn-ghost" onClick={() => galleryInput.current.click()}><ImagePlus size={18} /> Upload from gallery</button>
          <p className="muted small center">Camera blocked? Allow camera access in your browser settings, or upload a photo instead.</p>
          <div className="tip"><span>{tip[0]}</span> {tip[1]}</div>
        </div>
      )}

      {step === 'processing' && <div className="capture-center"><Spinner label="Looking for a cat…" /></div>}

      {photo && !['start', 'processing'].includes(step) && (
        <div className={`capture-photo ${step === 'detected' ? 'is-detected' : ''} ${['describe', 'candidates', 'name', 'matching', 'saving', 'saveError'].includes(step) ? 'small' : ''}`}>
          <img src={photo.preview} alt="Your capture" />
          {photo.box && step === 'detected' && (
            <div className="det-box" style={{ left: `${photo.box.x * 100}%`, top: `${photo.box.y * 100}%`, width: `${photo.box.w * 100}%`, height: `${photo.box.h * 100}%` }} />
          )}
        </div>
      )}

      {step === 'detected' && (
        <div className="capture-panel center pop">
          <div className="big-emoji">🐱</div>
          <h2>{detect.count > 1 ? `${detect.count} cats detected!` : 'Cat detected!'}</h2>
          <p className="muted small">{Math.round(detect.score * 100)}% sure</p>
        </div>
      )}

      {step === 'confirm' && (
        <div className="capture-panel center">
          <h2>{detect?.available ? "Hmm, we couldn't spot a cat" : 'Is there a cat in this photo?'}</h2>
          <p className="muted small">{detect?.available ? 'Maybe it is hiding, far away, or just very fluffy.' : 'Automatic detection is unavailable right now, so we trust your eyes.'}</p>
          <div className="row gap">
            <button className="btn btn-ghost grow" onClick={() => { setStep('start'); setPhoto(null); }}><RefreshCw size={16} /> Retake</button>
            <button className="btn btn-primary grow" onClick={() => setStep('describe')}>Yes, it's a cat 🐱</button>
          </div>
        </div>
      )}

      {step === 'describe' && (
        <div className="capture-panel">
          <h2>Describe this cat</h2>
          <p className="muted small">This helps us check if someone already found it.</p>
          <h3 className="label">Coat colour {photo.guess && <span className="hint">suggested: {meta.coatColors.find((c) => c.id === photo.guess)?.label}</span>}</h3>
          <div className="chips">
            {meta.coatColors.map((c) => (
              <Chip key={c.id} active={attrs.coatColor === c.id} onClick={() => setAttrs({ ...attrs, coatColor: c.id })}>
                <span className="swatch" style={{ background: c.hex }} /> {c.label}
              </Chip>
            ))}
          </div>
          <h3 className="label">Pattern</h3>
          <div className="chips">
            {meta.patterns.map((p) => <Chip key={p.id} active={attrs.pattern === p.id} onClick={() => setAttrs({ ...attrs, pattern: p.id })}>{p.label}</Chip>)}
          </div>
          <h3 className="label">Eyes</h3>
          <div className="chips">
            {meta.eyeColors.map((p) => <Chip key={p.id} active={attrs.eyeColor === p.id} onClick={() => setAttrs({ ...attrs, eyeColor: p.id })}>{p.label}</Chip>)}
          </div>
          <label className="check mt">
            <input type="checkbox" checked={multiCat} onChange={(e) => setMultiCat(e.target.checked)} />
            <span>Several cats in this photo (describe the main one)</span>
          </label>
          <button className="btn btn-primary btn-lg btn-block mt" disabled={!attrs.coatColor || !attrs.pattern} onClick={identify}>
            {!attrs.pattern ? 'Pick a pattern' : 'Identify'}
          </button>
          {!loc.pos && loc.status !== 'locating' && <p className="muted small center">We'll ask for your area first.</p>}
        </div>
      )}

      {step === 'matching' && <div className="capture-panel center"><Spinner label="Checking the Chatdex…" /></div>}

      {step === 'candidates' && candidates[candIdx] && (() => {
        const c = candidates[candIdx];
        return (
          <div className="capture-panel center">
            <p className="kicker">{c.strong ? 'Looks familiar…' : 'Possible match'}</p>
            <h2>Could this be {c.name}?</h2>
            <div className="candidate">
              <CatImage cat={c} photo={c.photo} thumb={c.thumb} className="candidate-img" />
              <div className="candidate-info">
                <RarityBadge rarity={c.rarity} small />
                <p className="small">{c.reasons.join(' · ')}</p>
                <p className="muted small">{plural(c.hunterCount, "hunter")} · last seen {timeAgo(c.lastObservedAt)}{c.lastSeenBy ? ` by ${c.lastSeenBy.displayName}` : ''}</p>
              </div>
            </div>
            <div className="answer-row">
              <button className="btn btn-ghost" onClick={() => answer('no')}>No</button>
              <button className="btn btn-ghost" onClick={() => answer('unsure')}>Not sure</button>
              <button className="btn btn-primary" onClick={() => answer('yes')}>Yes!</button>
            </div>
            <p className="muted small">{candIdx + 1} of {candidates.length} possible matches</p>
          </div>
        );
      })()}

      {step === 'name' && (
        <div className="capture-panel">
          <p className="kicker">{candidates.length ? 'Then it must be…' : 'Nobody has registered this cat nearby'}</p>
          <h2>✨ A new cat! Name it</h2>
          <div className="name-row">
            <input className="name-input" value={newCat.name} maxLength={24} onChange={(e) => setNewCat({ ...newCat, name: e.target.value })} aria-label="Cat name" />
            <button className="icon-btn" aria-label="Random name" onClick={() => setNewCat({ ...newCat, name: randomCatName() })}><Dices size={22} /></button>
          </div>
          <h3 className="label">Personality <span className="hint">optional, up to 3</span></h3>
          <div className="chips">
            {meta.personalityTags.map((t) => {
              const on = newCat.tags.includes(t);
              return (
                <Chip key={t} active={on} onClick={() => setNewCat({ ...newCat, tags: on ? newCat.tags.filter((x) => x !== t) : newCat.tags.length < 3 ? [...newCat.tags, t] : newCat.tags })}>{t}</Chip>
              );
            })}
          </div>
          <button className="btn btn-primary btn-lg btn-block mt" disabled={!newCat.name.trim()} onClick={() => save(null)}>Add to my Chatdex</button>
          <button className="btn btn-link btn-block" onClick={() => setPickOpen(true)}>Actually, I know this cat: pick it from the list</button>
        </div>
      )}

      {step === 'saving' && <div className="capture-panel center"><Spinner label="Saving your capture…" /></div>}

      {step === 'saveError' && (
        <div className="capture-panel center">
          <div className="big-emoji">😿</div>
          <h2>Upload failed</h2>
          <p className="muted">{error}</p>
          <p className="muted small">Your photo and answers are kept. Try again when you have a connection.</p>
          <button className="btn btn-primary btn-lg btn-block" onClick={() => save()}>Retry</button>
          <button className="btn btn-link" onClick={reset}>Start over</button>
        </div>
      )}
    </main>
  );
}
