// Demo world: fictional hunters and cats so the app feels alive on first launch.
// Every demo row carries is_demo = 1 and can be removed with `npm run demo:clear`.
// Demo cats have no photo; the client draws them with procedural art (artSeed).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { all, db, get, run, tx } from './db.js';
import { config } from './config.js';
import { hashPassword } from './auth.js';
import { recordCapture } from './services/captures.js';
import { isShinySeed, PERSONALITY_TAGS, SHINY_ODDS } from './services/game.js';
import { REGIONS } from './services/geo.js';
import { addEvent, evaluateAchievements } from './services/progress.js';

export const DEMO_LOGIN = { email: 'demo@chatdex.app', password: 'chatdex' };

function rng(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const USERS = [
  ['tom', 'Tom', '🦊', '#ff8a4c', 'Collecting every whisker between Lausanne and Montreux.', DEMO_LOGIN.email],
  ['sarah', 'Sarah', '🐯', '#7c5cff', 'First Catch addict. Montreux is my turf.'],
  ['lucas', 'Lucas', '🐾', '#2bb3a3', 'Weekend hunter, weekday dreamer.'],
  ['emma', 'Emma', '😺', '#ff5c8a', 'Chasing shinies (with my camera only).'],
  ['noah', 'Noah', '🦁', '#f2b705', 'Night walks, black cats.'],
  ['lea', 'Léa', '🐱', '#3a8dff', 'Vevey lakeside patrol.'],
  ['yanis', 'Yanis', '🐈', '#8e6cff', 'Geneva old town cats are the best cats.'],
  ['chloe', 'Chloé', '🌸', '#ff7bd5', 'Calico collector.'],
  ['hugo', 'Hugo', '🌙', '#2b2b55', 'Zurich + Bern explorer.'],
  ['nina', 'Nina', '🍀', '#3fb86b', 'I name cats after cheeses.'],
  ['arthur', 'Arthur', '🎩', '#7a5638', 'Retired, walking a lot, seeing cats.'],
  ['mia', 'Mia', '⭐', '#ff4d5e', 'Just started!'],
];

const NAMES = [
  'Milo', 'Tigrou', 'Minette', 'Filou', 'Caramel', 'Pixel', 'Moustache', 'Biscotte', 'Nala', 'Simba', 'Oreo', 'Pistache',
  'Réglisse', 'Gribouille', 'Plume', 'Noisette', 'Chaussette', 'Mochi', 'Sushi', 'Pepper', 'Luna', 'Olive', 'Grisou', 'Zorro',
  'Ficelle', 'Praline', 'Kiwi', 'Tofu', 'Brioche', 'Cannelle', 'Figaro', 'Mistigri', 'Poussière', 'Doudou', 'Rocky', 'Salem',
  'Choupette', 'Pompon', 'Vanille', 'Taco', 'Nougat', 'Crumble', 'Bamboo', 'Loki', 'Ginger', 'Shadow', 'Marbre', 'Gruyère',
];

// [colour, pattern, eyes, weight]
const LOOKS = [
  ['orange', 'tabby', 'amber', 9], ['grey', 'tabby', 'green', 9], ['black', 'solid', 'yellow', 8], ['black', 'tuxedo', 'green', 6],
  ['grey', 'bicolor', 'yellow', 5], ['brown', 'tabby', 'green', 5], ['white', 'bicolor', 'blue', 3], ['orange', 'bicolor', 'amber', 4],
  ['white', 'calico', 'green', 3], ['black', 'tortoiseshell', 'amber', 3], ['grey', 'solid', 'amber', 3], ['cream', 'colorpoint', 'blue', 1],
  ['white', 'solid', 'odd', 1], ['brown', 'spotted', 'green', 1], ['cream', 'tabby', 'amber', 2],
];

const HOMES = [['Montreux', 26], ['Lausanne', 30], ['Vevey', 14], ['Geneva', 12], ['Zurich', 7], ['Bern', 5], ['Fribourg', 4], ['Aigle', 2]];

function pickWeighted(r, list, w = (x) => x[x.length - 1]) {
  const total = list.reduce((s, x) => s + w(x), 0);
  let v = r() * total;
  for (const x of list) { v -= w(x); if (v <= 0) return x; }
  return list[list.length - 1];
}

export function seedDemo({ now = Date.now() } = {}) {
  const r = rng(20260926);
  const DAY = 86400000;
  const pw = hashPassword(DEMO_LOGIN.password);

  const users = USERS.map(([username, name, emoji, color, bio, email], i) => {
    const res = run(
      `INSERT INTO users (email, password_hash, username, display_name, bio, avatar_emoji, avatar_color, accepted_guidelines, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1, 1, ?)`,
      email || `${username}@demo.chatdex.app`, pw, username, name, bio, emoji, color, new Date(now - (150 - i * 3) * DAY).toISOString()
    );
    return { id: Number(res.lastInsertRowid), username, activity: username === 'mia' ? 1 : username === 'tom' ? 7 : username === 'sarah' ? 9 : 3 + (i % 4) };
  });
  const byName = Object.fromEntries(users.map((u) => [u.username, u]));
  const pickUser = () => pickWeighted(r, users, (u) => u.activity);

  // Plan every cat and its sightings, then replay them in chronological order through the real game logic.
  const plans = [];
  NAMES.forEach((name, i) => {
    const [home] = i === 0 ? ['Montreux'] : pickWeighted(r, HOMES);
    const region = REGIONS.find((x) => x.name === home);
    const look = i === 0 ? ['orange', 'tabby', 'green', 1] : pickWeighted(r, LOOKS);
    let seed = Math.floor(r() * 1e9);
    if (isShinySeed(seed)) seed += 1;
    if (name === 'Poussière' || name === 'Luna') seed = SHINY_ODDS * 1234 + 7; // two shinies to hunt
    const center = { lat: region.lat + (r() - 0.5) * 0.024, lng: region.lng + (r() - 0.5) * 0.032 };
    const bornDaysAgo = 2 + r() ** 1.4 * 110;
    const missing = i % 9 === 4; // not seen for a while (demo of the "not observed" state)
    const legend = i === 0; // Milo: the famous cat of Montreux
    const nObs = legend ? 64 : Math.max(1, Math.round(r() ** 2 * 14));
    plans.push({ name, look, seed, center, bornDaysAgo, missing, legend, nObs });
  });

  const captures = [];
  plans.forEach((p, idx) => {
    const born = now - p.bornDaysAgo * DAY;
    const end = p.missing ? now - (35 + (idx % 20)) * DAY : now - r() * 6 * DAY - 3600000;
    const discoverer = idx === 0 ? byName.sarah : pickUser();
    captures.push({ plan: idx, user: discoverer, at: born });
    for (let k = 1; k < p.nObs; k++) {
      // Spread sightings evenly with some noise, the last one close to `end`.
      const t = k === p.nObs - 1 ? end : born + ((k + (r() - 0.5) * 0.8) / (p.nObs - 1)) * (end - born);
      const user = p.legend && k < 14 ? users[(k + 1) % users.length] : pickUser();
      captures.push({ plan: idx, user, at: Math.max(born + 3600000, Math.min(t, now - 60000)) });
    }
  });
  // A cat found again after a long absence, and a few fresh sightings so hunters look active.
  captures.push({ plan: 4, user: byName.tom, at: now - 2 * DAY });
  const tomCats = [0, 1, 2, 3, 5, 6, 8, 10, 12, 15, 19, 22, 27];
  tomCats.forEach((c, k) => captures.push({ plan: c, user: byName.tom, at: now - (k * 5 + 1) * DAY - r() * DAY }));
  captures.push({ plan: 7, user: byName.sarah, at: now - 25 * 60000 });
  captures.push({ plan: 11, user: byName.emma, at: now - 50 * 60000 });
  captures.push({ plan: 0, user: byName.lucas, at: now - 80 * 60000 });

  captures.sort((a, b) => a.at - b.at);
  const catIds = new Map();
  for (const c of captures) {
    const p = plans[c.plan];
    // Sightings must happen after the discovery.
    if (!catIds.has(c.plan) && c.at < now - p.bornDaysAgo * DAY) continue;
    let hourAdjusted = new Date(c.at);
    const h = hourAdjusted.getUTCHours();
    if (h < 7 && r() < 0.8) hourAdjusted = new Date(c.at + (8 - h) * 3600000);
    const at = Math.min(hourAdjusted.getTime(), now - 60000);
    const result = recordCapture({
      userId: c.user.id,
      catId: catIds.get(c.plan) || null,
      newCat: { name: p.name, tags: [] },
      attributes: { coatColor: p.look[0], pattern: p.look[1], eyeColor: p.look[2] },
      lat: p.center.lat + (r() - 0.5) * 0.002,
      lng: p.center.lng + (r() - 0.5) * 0.003,
      artSeed: p.seed,
      obsArtSeed: Math.floor(r() * 1e9),
      multiCat: r() < 0.04,
      localHour: (new Date(at).getUTCHours() + 2) % 24,
      matchMethod: 'confirmed',
      at: new Date(at).toISOString(),
      isDemo: true,
    });
    catIds.set(c.plan, result.catId);
    run('UPDATE cats SET is_demo = 1 WHERE id = ?', result.catId);
  }

  const at = new Date(now - 3 * 3600000).toISOString();
  tx(() => {
    // Social graph
    const follows = [['tom', ['sarah', 'lucas', 'emma', 'lea', 'noah', 'yanis']], ['sarah', ['tom', 'emma', 'chloe']], ['lucas', ['tom', 'sarah']],
      ['emma', ['sarah', 'tom', 'nina']], ['noah', ['hugo', 'tom']], ['lea', ['tom', 'sarah']], ['mia', ['tom', 'sarah', 'emma']], ['nina', ['emma']]];
    for (const [a, list] of follows) for (const b of list) {
      run('INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)', byName[a].id, byName[b].id, new Date(now - r() * 60 * DAY).toISOString());
    }
    // Community personality tags and favourites
    for (const catId of catIds.values()) {
      const hunters = all('SELECT DISTINCT user_id FROM observations WHERE cat_id = ?', catId).map((x) => x.user_id);
      const tags = [PERSONALITY_TAGS[Math.floor(r() * PERSONALITY_TAGS.length)], PERSONALITY_TAGS[Math.floor(r() * PERSONALITY_TAGS.length)]];
      hunters.forEach((uid, k) => {
        run('INSERT OR IGNORE INTO cat_tags (cat_id, user_id, tag, created_at) VALUES (?, ?, ?, ?)', catId, uid, tags[k % 2], at);
        if (r() < 0.45) run('INSERT OR IGNORE INTO favorites (user_id, cat_id, created_at) VALUES (?, ?, ?)', uid, catId, at);
      });
      run('UPDATE cats SET favorite_count = (SELECT COUNT(*) FROM favorites WHERE cat_id = ?) WHERE id = ?', catId, catId);
    }
    // Reactions on recent captures
    const kinds = ['meow', 'paw', 'respect', 'seen'];
    for (const o of all('SELECT id, user_id, created_at FROM observations WHERE is_demo = 1 ORDER BY created_at DESC LIMIT 120')) {
      for (const u of users) {
        if (u.id !== o.user_id && r() < 0.18) {
          run('INSERT OR IGNORE INTO reactions (observation_id, user_id, kind, created_at) VALUES (?, ?, ?, ?)', o.id, u.id, kinds[Math.floor(r() * 4)], o.created_at);
        }
      }
    }
    const tom = byName.tom.id;
    const fav = get('SELECT cat_id FROM observations WHERE user_id = ? GROUP BY cat_id ORDER BY COUNT(*) DESC LIMIT 1', tom);
    if (fav) run('UPDATE users SET favorite_cat_id = ? WHERE id = ?', fav.cat_id, tom);
    for (const u of users) {
      const f = get('SELECT cat_id FROM observations WHERE user_id = ? GROUP BY cat_id ORDER BY COUNT(*) DESC LIMIT 1', u.id);
      if (f && u.id !== tom) run('UPDATE users SET favorite_cat_id = ? WHERE id = ?', f.cat_id, u.id);
      evaluateAchievements(u.id, at, 1);
    }
  });
  refreshDemoHunt();
  return { users: users.length, cats: catIds.size, observations: captures.length };
}

/** Keeps one live demo hunt around so the Hunts screen is never empty in demo mode. */
export function refreshDemoHunt() {
  const now = Date.now();
  const iso = new Date(now).toISOString();
  if (get('SELECT 1 FROM hunts WHERE is_demo = 1 AND ends_at > ?', iso)) return;
  const sarah = get(`SELECT id FROM users WHERE username = 'sarah' AND is_demo = 1`);
  if (!sarah) return;
  const lausanne = REGIONS.find((r) => r.name === 'Lausanne');
  const res = run(
    `INSERT INTO hunts (title, creator_id, region, lat, lng, goal, starts_at, ends_at, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    '', sarah.id, 'Lausanne', lausanne.lat, lausanne.lng, 10, iso, new Date(now + 6 * 3600000).toISOString(), iso
  );
  const huntId = Number(res.lastInsertRowid);
  for (const u of all(`SELECT id FROM users WHERE is_demo = 1 AND username IN ('sarah', 'lucas', 'emma', 'lea')`)) {
    run('INSERT OR IGNORE INTO hunt_participants (hunt_id, user_id, joined_at) VALUES (?, ?, ?)', huntId, u.id, iso);
  }
  addEvent({ type: 'hunt_created', userId: sarah.id, huntId, data: { title: '', region: 'Lausanne', goal: 10, durationMin: 360 }, isDemo: 1, at: iso });
}

export function clearDemo() {
  tx(() => {
    run('DELETE FROM hunts WHERE is_demo = 1');
    run('DELETE FROM cats WHERE is_demo = 1');
    run('DELETE FROM users WHERE is_demo = 1');
    run('DELETE FROM events WHERE is_demo = 1');
    // Recompute aggregates of real cats that demo hunters had observed.
    for (const c of all('SELECT id FROM cats')) {
      const agg = get('SELECT COUNT(*) AS n, COUNT(DISTINCT user_id) AS h, MAX(created_at) AS last FROM observations WHERE cat_id = ?', c.id);
      run(`UPDATE cats SET observation_count = ?, hunter_count = ?, last_observed_at = COALESCE(?, last_observed_at),
           favorite_count = (SELECT COUNT(*) FROM favorites WHERE cat_id = ?) WHERE id = ?`, agg.n, agg.h, agg.last, c.id, c.id);
    }
  });
}

export function resetAll() {
  const tables = ['reports', 'match_feedback', 'hunt_participants', 'notifications', 'events', 'user_achievements', 'reactions',
    'follows', 'favorites', 'cat_tags', 'observations', 'hunts', 'cats', 'sessions', 'users'];
  tx(() => tables.forEach((t) => db.exec(`DELETE FROM ${t}`)));
  for (const f of fs.readdirSync(config.uploadsDir)) fs.rmSync(path.join(config.uploadsDir, f), { force: true });
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const flag = process.argv[2];
  if (flag === '--clear-demo') {
    clearDemo();
    console.log('Demo data removed. Real accounts and their cats were kept.');
  } else {
    if (flag === '--reset') { resetAll(); console.log('Database wiped.'); }
    if (get('SELECT 1 FROM users WHERE is_demo = 1 LIMIT 1')) {
      console.log('Demo data already present. Use "npm run db:reset" to rebuild everything.');
    } else {
      const t = Date.now();
      const s = seedDemo();
      console.log(`Seeded ${s.users} demo hunters, ${s.cats} cats, ${s.observations} sightings in ${Date.now() - t} ms.`);
      console.log(`Demo login: ${DEMO_LOGIN.email} / ${DEMO_LOGIN.password}`);
    }
  }
}
