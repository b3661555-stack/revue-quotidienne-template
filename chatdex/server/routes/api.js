import express from 'express';
import { all, get, run, tx, nowIso } from '../db.js';
import { config } from '../config.js';
import { createSession, destroySession, hashPassword, requireAuth, verifyPassword } from '../auth.js';
import { httpError, intParam, num, str } from '../http.js';
import { ACHIEVEMENTS } from '../services/achievementDefs.js';
import {
  COAT_COLORS, EYE_COLORS, PATTERNS, PERSONALITY_TAGS, RARITIES, XP, isValidAttr,
} from '../services/game.js';
import { REGIONS, isValidCoord, regionFor, roundCoord } from '../services/geo.js';
import { findCandidates } from '../services/matcher.js';
import { recordCapture } from '../services/captures.js';
import { huntProgress } from '../services/hunts.js';
import { addEvent, evaluateAchievements, notify, userStats } from '../services/progress.js';
import { savePhoto } from '../services/uploads.js';
import { catSummary, miniUser, MINI_USER_COLS, publicUser } from '../services/serialize.js';

export const api = express.Router();

export const REACTIONS = [
  { id: 'meow', icon: '❤️', label: 'Meow' },
  { id: 'paw', icon: '🐾', label: 'Paw' },
  { id: 'respect', icon: '🔥', label: 'Respect' },
  { id: 'seen', icon: '👀', label: 'Seen this cat too' },
];
const REACTION_IDS = REACTIONS.map((r) => r.id);

const collectedSet = (userId) =>
  new Set(userId ? all('SELECT DISTINCT cat_id FROM observations WHERE user_id = ?', userId).map((r) => r.cat_id) : []);

const userByName = (username) => {
  const u = get('SELECT * FROM users WHERE username = ?', String(username).toLowerCase());
  if (!u) throw httpError(404, 'This hunter does not exist.');
  return u;
};

function meResponse(user) {
  const fresh = get('SELECT * FROM users WHERE id = ?', user.id);
  return {
    user: {
      ...publicUser(fresh),
      email: fresh.email,
      favoriteCatId: fresh.favorite_cat_id,
      acceptedGuidelines: !!fresh.accepted_guidelines,
    },
    stats: userStats(fresh.id),
    unreadNotifications: get('SELECT COUNT(*) AS n FROM notifications WHERE user_id = ? AND read = 0', fresh.id).n,
    totalCats: get('SELECT COUNT(*) AS n FROM cats WHERE hidden = 0').n,
  };
}

// ---------------------------------------------------------------- meta
api.get('/meta', (req, res) => {
  res.json({
    coatColors: COAT_COLORS,
    patterns: PATTERNS,
    eyeColors: EYE_COLORS,
    rarities: RARITIES,
    personalityTags: PERSONALITY_TAGS,
    reactions: REACTIONS,
    regions: REGIONS,
    xp: XP,
    achievements: ACHIEVEMENTS.map(({ check, ...a }) => a),
    catDetector: config.catDetector,
    demoData: config.demoData,
    missingAfterDays: config.missingAfterDays,
    totalCats: get('SELECT COUNT(*) AS n FROM cats WHERE hidden = 0').n,
  });
});

// ---------------------------------------------------------------- auth
api.post('/auth/register', (req, res) => {
  const b = req.body || {};
  const email = str(b.email, { field: 'Email', required: true, max: 120 }).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw httpError(400, 'Please enter a valid email address.');
  const password = typeof b.password === 'string' ? b.password : '';
  if (password.length < 6) throw httpError(400, 'Password must be at least 6 characters.');
  const username = str(b.username, { field: 'Username', required: true, min: 3, max: 20 }).toLowerCase();
  if (!/^[a-z0-9_]+$/.test(username)) throw httpError(400, 'Username can only contain letters, numbers and underscores.');
  const displayName = str(b.displayName, { field: 'Display name', max: 30 }) || username;
  if (!b.acceptGuidelines) throw httpError(400, 'Please accept the Respect the Cats guidelines.');
  if (get('SELECT 1 FROM users WHERE email = ?', email)) throw httpError(409, 'An account with this email already exists.');
  if (get('SELECT 1 FROM users WHERE username = ?', username)) throw httpError(409, 'This username is taken.');
  const colors = ['#ff8a4c', '#7c5cff', '#2bb3a3', '#ff5c8a', '#3a8dff', '#f2b705'];
  const emojis = ['🐱', '😺', '🐾', '🦊', '🐯', '🦁'];
  const r = run(
    `INSERT INTO users (email, password_hash, username, display_name, avatar_emoji, avatar_color, accepted_guidelines, created_at)
     VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
    email, hashPassword(password), username, displayName,
    emojis[Math.floor(Math.random() * emojis.length)], colors[Math.floor(Math.random() * colors.length)], nowIso()
  );
  const user = get('SELECT * FROM users WHERE id = ?', Number(r.lastInsertRowid));
  createSession(res, user.id);
  res.status(201).json(meResponse(user));
});

api.post('/auth/login', (req, res) => {
  const email = str(req.body?.email, { field: 'Email', required: true, max: 120 }).toLowerCase();
  const user = get('SELECT * FROM users WHERE email = ?', email);
  if (!user || !verifyPassword(String(req.body?.password || ''), user.password_hash)) {
    throw httpError(401, 'Wrong email or password.');
  }
  createSession(res, user.id);
  res.json(meResponse(user));
});

api.post('/auth/logout', (req, res) => {
  destroySession(req, res);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- me
api.get('/me', requireAuth, (req, res) => res.json(meResponse(req.user)));

api.patch('/me', requireAuth, (req, res) => {
  const b = req.body || {};
  const u = req.user;
  const displayName = b.displayName !== undefined ? str(b.displayName, { field: 'Display name', required: true, max: 30 }) : u.display_name;
  const bio = b.bio !== undefined ? str(b.bio, { field: 'Bio', max: 160 }) : u.bio;
  const avatarEmoji = b.avatarEmoji !== undefined ? str(b.avatarEmoji, { field: 'Avatar', required: true, max: 8 }) : u.avatar_emoji;
  const avatarColor = b.avatarColor !== undefined && /^#[0-9a-f]{6}$/i.test(b.avatarColor) ? b.avatarColor : u.avatar_color;
  let favoriteCatId = u.favorite_cat_id;
  if (b.favoriteCatId !== undefined) {
    favoriteCatId = b.favoriteCatId ? Number(b.favoriteCatId) : null;
    if (favoriteCatId && !get('SELECT 1 FROM observations WHERE user_id = ? AND cat_id = ?', u.id, favoriteCatId)) {
      throw httpError(400, 'Your favourite cat must be in your collection.');
    }
  }
  run('UPDATE users SET display_name = ?, bio = ?, avatar_emoji = ?, avatar_color = ?, favorite_cat_id = ? WHERE id = ?',
    displayName, bio, avatarEmoji, avatarColor, favoriteCatId, u.id);
  res.json(meResponse(u));
});

// ---------------------------------------------------------------- users
api.get('/users', requireAuth, (req, res) => {
  const q = str(req.query.q, { field: 'Search', max: 40 }).toLowerCase();
  const rows = q
    ? all(`SELECT * FROM users WHERE (username LIKE ? OR lower(display_name) LIKE ?) ORDER BY xp DESC LIMIT 20`, `%${q}%`, `%${q}%`)
    : all(
        `SELECT * FROM users WHERE id != ? AND id NOT IN (SELECT following_id FROM follows WHERE follower_id = ?)
         ORDER BY xp DESC LIMIT 8`,
        req.user.id, req.user.id
      );
  const following = new Set(all('SELECT following_id FROM follows WHERE follower_id = ?', req.user.id).map((r) => r.following_id));
  res.json({
    users: rows.map((u) => ({ ...publicUser(u), cats: userStats(u.id).cats, isFollowing: following.has(u.id), isMe: u.id === req.user.id })),
  });
});

api.get('/users/:username', requireAuth, (req, res) => {
  const u = userByName(req.params.username);
  const me = req.user;
  const stats = userStats(u.id);
  const collected = collectedSet(me.id);
  const favoriteCat = u.favorite_cat_id ? get('SELECT * FROM cats WHERE id = ? AND hidden = 0', u.favorite_cat_id) : null;
  const badges = all(
    `SELECT a.*, ua.unlocked_at FROM user_achievements ua JOIN achievements a ON a.id = ua.achievement_id WHERE ua.user_id = ? ORDER BY ua.unlocked_at DESC`,
    u.id
  ).map((a) => ({ id: a.id, name: a.name, icon: a.icon, description: a.description, unlockedAt: a.unlocked_at }));
  const recent = all(
    `SELECT o.id AS o_id, o.photo AS o_photo, o.thumb AS o_thumb, o.art_seed AS o_art_seed, o.created_at AS o_created_at, o.region AS o_region, o.is_first_catch AS o_first, c.*
     FROM observations o JOIN cats c ON c.id = o.cat_id WHERE o.user_id = ? AND o.hidden = 0 AND c.hidden = 0 ORDER BY o.created_at DESC LIMIT 12`,
    u.id
  ).map((r) => ({
    observationId: r.o_id, photo: r.o_photo, thumb: r.o_thumb, artSeed: r.o_art_seed, createdAt: r.o_created_at, region: r.o_region,
    isFirstCatch: !!r.o_first, cat: catSummary(r, collected),
  }));
  const favorites = all(
    `SELECT c.* FROM favorites f JOIN cats c ON c.id = f.cat_id WHERE f.user_id = ? AND c.hidden = 0 ORDER BY f.created_at DESC LIMIT 12`, u.id
  ).map((c) => catSummary(c, collected));
  const isFollowing = !!get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', me.id, u.id);
  const followsYou = !!get('SELECT 1 FROM follows WHERE follower_id = ? AND following_id = ?', u.id, me.id);
  let compare = null;
  if (u.id !== me.id) {
    const mine = userStats(me.id);
    compare = {
      me: { ...publicUser(me), cats: mine.cats, rare: mine.rare, regions: mine.regions, firstCatches: mine.firstCatches, badges: mine.badges },
      them: { cats: stats.cats, rare: stats.rare, regions: stats.regions, firstCatches: stats.firstCatches, badges: stats.badges },
      shared: get(
        `SELECT COUNT(DISTINCT a.cat_id) AS n FROM observations a JOIN observations b ON a.cat_id = b.cat_id WHERE a.user_id = ? AND b.user_id = ?`,
        me.id, u.id
      ).n,
    };
  }
  res.json({
    user: publicUser(u),
    stats,
    isMe: u.id === me.id,
    isFollowing,
    followsYou,
    favoriteCat: favoriteCat ? catSummary(favoriteCat, collected) : null,
    badges,
    totalBadges: ACHIEVEMENTS.length,
    recent,
    favorites,
    totalCats: get('SELECT COUNT(*) AS n FROM cats WHERE hidden = 0').n,
    compare,
  });
});

api.get('/users/:username/follows', requireAuth, (req, res) => {
  const u = userByName(req.params.username);
  const followers = all(`SELECT u.* FROM follows f JOIN users u ON u.id = f.follower_id WHERE f.following_id = ? ORDER BY f.created_at DESC`, u.id);
  const following = all(`SELECT u.* FROM follows f JOIN users u ON u.id = f.following_id WHERE f.follower_id = ? ORDER BY f.created_at DESC`, u.id);
  res.json({ followers: followers.map(publicUser), following: following.map(publicUser) });
});

api.post('/users/:username/follow', requireAuth, (req, res) => {
  const u = userByName(req.params.username);
  if (u.id === req.user.id) throw httpError(400, "You can't follow yourself.");
  const at = nowIso();
  const r = run('INSERT OR IGNORE INTO follows (follower_id, following_id, created_at) VALUES (?, ?, ?)', req.user.id, u.id, at);
  if (r.changes) {
    notify({ userId: u.id, type: 'follow', actorId: req.user.id, text: `${req.user.display_name} started following you.`, at });
    evaluateAchievements(req.user.id, at);
  }
  res.json({ following: true });
});

api.delete('/users/:username/follow', requireAuth, (req, res) => {
  const u = userByName(req.params.username);
  run('DELETE FROM follows WHERE follower_id = ? AND following_id = ?', req.user.id, u.id);
  res.json({ following: false });
});

// ---------------------------------------------------------------- cats / chatdex
api.get('/cats', requireAuth, (req, res) => {
  const scope = String(req.query.scope || 'all');
  const rarity = String(req.query.rarity || '');
  const q = str(req.query.q, { field: 'Search', max: 40 }).toLowerCase();
  const sort = String(req.query.sort || 'dex');
  let owner = req.user;
  if (scope.startsWith('user:')) owner = userByName(scope.slice(5));
  const collected = collectedSet(req.user.id);
  const ownerSet = owner.id === req.user.id ? collected : collectedSet(owner.id);

  const where = ['c.hidden = 0'];
  const params = [];
  if (scope !== 'all') { where.push('c.id IN (SELECT cat_id FROM observations WHERE user_id = ?)'); params.push(owner.id); }
  if (RARITIES.some((r) => r.id === rarity)) { where.push('c.rarity = ?'); params.push(rarity); }
  if (q) { where.push('(lower(c.name) LIKE ? OR lower(c.region) LIKE ?)'); params.push(`%${q}%`, `%${q}%`); }
  const order = sort === 'recent' ? 'c.last_observed_at DESC'
    : sort === 'rarity' ? `CASE c.rarity WHEN 'shiny' THEN 0 WHEN 'legendary' THEN 1 WHEN 'epic' THEN 2 WHEN 'rare' THEN 3 WHEN 'uncommon' THEN 4 ELSE 5 END, c.id`
    : sort === 'popular' ? 'c.hunter_count DESC, c.observation_count DESC' : 'c.id';
  const cats = all(`SELECT c.* FROM cats c WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT 500`, ...params);
  res.json({
    cats: cats.map((c) => catSummary(c, collected)),
    total: get('SELECT COUNT(*) AS n FROM cats WHERE hidden = 0').n,
    collected: ownerSet.size,
    owner: publicUser(owner),
  });
});

api.get('/cats/:id', requireAuth, (req, res) => {
  const id = intParam(req.params.id);
  const cat = get('SELECT * FROM cats WHERE id = ? AND hidden = 0', id);
  if (!cat) throw httpError(404, 'This cat could not be found. It may have been removed.');
  const me = req.user.id;
  const collected = collectedSet(me);
  const firstCatcher = cat.first_catcher_id ? get('SELECT * FROM users WHERE id = ?', cat.first_catcher_id) : null;
  const tags = all(
    `SELECT tag, COUNT(*) AS count, MAX(user_id = ?) AS mine FROM cat_tags WHERE cat_id = ? GROUP BY tag ORDER BY count DESC, tag`, me, id
  ).map((t) => ({ tag: t.tag, count: t.count, mine: !!t.mine }));
  const obsRows = all(
    `SELECT o.*, ${MINI_USER_COLS('u')} FROM observations o JOIN users u ON u.id = o.user_id
     WHERE o.cat_id = ? AND o.hidden = 0 ORDER BY o.created_at DESC LIMIT 60`,
    id
  );
  const reactionCounts = reactionsFor(obsRows.map((o) => o.id), me);
  const observations = obsRows.map((o) => ({
    id: o.id, user: miniUser(o), photo: o.photo, thumb: o.thumb, artSeed: o.art_seed, region: o.region,
    createdAt: o.created_at, isFirstCatch: !!o.is_first_catch, note: o.note, multiCat: !!o.multi_cat,
    ...reactionCounts(o.id),
  }));
  const most = get(
    `SELECT ${MINI_USER_COLS('u')}, COUNT(*) AS n FROM observations o JOIN users u ON u.id = o.user_id WHERE o.cat_id = ? AND o.hidden = 0
     GROUP BY o.user_id ORDER BY n DESC, MIN(o.created_at) LIMIT 1`, id
  );
  const hunters = all(
    `SELECT ${MINI_USER_COLS('u')}, COUNT(*) AS n, MIN(o.created_at) AS first_at FROM observations o JOIN users u ON u.id = o.user_id
     WHERE o.cat_id = ? AND o.hidden = 0 GROUP BY o.user_id ORDER BY first_at LIMIT 50`, id
  ).map((h, i) => ({ ...miniUser(h), observations: h.n, firstSeenAt: h.first_at, rank: i + 1 }));
  res.json({
    cat: catSummary(cat, collected),
    firstCatcher: publicUser(firstCatcher),
    tags,
    isFavorite: !!get('SELECT 1 FROM favorites WHERE user_id = ? AND cat_id = ?', me, id),
    myObservations: get('SELECT COUNT(*) AS n FROM observations WHERE user_id = ? AND cat_id = ?', me, id).n,
    leaders: {
      firstCatch: publicUser(firstCatcher),
      mostObservations: most ? { user: miniUser(most), count: most.n } : null,
      mostRecent: observations[0] ? { user: observations[0].user, at: observations[0].createdAt } : null,
    },
    hunters,
    observations,
    missingAfterDays: config.missingAfterDays,
  });
});

api.post('/cats/:id/favorite', requireAuth, (req, res) => {
  const id = intParam(req.params.id);
  if (!get('SELECT 1 FROM cats WHERE id = ? AND hidden = 0', id)) throw httpError(404, 'Cat not found.');
  const exists = get('SELECT 1 FROM favorites WHERE user_id = ? AND cat_id = ?', req.user.id, id);
  tx(() => {
    if (exists) run('DELETE FROM favorites WHERE user_id = ? AND cat_id = ?', req.user.id, id);
    else run('INSERT INTO favorites (user_id, cat_id, created_at) VALUES (?, ?, ?)', req.user.id, id, nowIso());
    run('UPDATE cats SET favorite_count = (SELECT COUNT(*) FROM favorites WHERE cat_id = ?) WHERE id = ?', id, id);
  });
  res.json({ isFavorite: !exists, favoriteCount: get('SELECT favorite_count FROM cats WHERE id = ?', id).favorite_count });
});

api.post('/cats/:id/tags', requireAuth, (req, res) => {
  const id = intParam(req.params.id);
  if (!get('SELECT 1 FROM cats WHERE id = ? AND hidden = 0', id)) throw httpError(404, 'Cat not found.');
  const tag = str(req.body?.tag, { field: 'Tag', required: true, max: 20 }).toLowerCase();
  if (!/^[\p{L}\p{N} '-]+$/u.test(tag)) throw httpError(400, 'Tags can only contain letters, numbers and spaces.');
  const exists = get('SELECT 1 FROM cat_tags WHERE cat_id = ? AND user_id = ? AND tag = ?', id, req.user.id, tag);
  if (exists) run('DELETE FROM cat_tags WHERE cat_id = ? AND user_id = ? AND tag = ?', id, req.user.id, tag);
  else run('INSERT INTO cat_tags (cat_id, user_id, tag, created_at) VALUES (?, ?, ?, ?)', id, req.user.id, tag, nowIso());
  const tags = all(
    `SELECT tag, COUNT(*) AS count, MAX(user_id = ?) AS mine FROM cat_tags WHERE cat_id = ? GROUP BY tag ORDER BY count DESC, tag`, req.user.id, id
  ).map((t) => ({ tag: t.tag, count: t.count, mine: !!t.mine }));
  res.json({ tags });
});

// ---------------------------------------------------------------- capture
function readCaptureInput(b) {
  const attributes = {
    coatColor: String(b.attributes?.coatColor || ''),
    pattern: String(b.attributes?.pattern || ''),
    eyeColor: String(b.attributes?.eyeColor || 'unknown'),
  };
  if (!isValidAttr(COAT_COLORS, attributes.coatColor)) throw httpError(400, 'Please choose a coat colour.');
  if (!isValidAttr(PATTERNS, attributes.pattern)) throw httpError(400, 'Please choose a coat pattern.');
  if (!isValidAttr(EYE_COLORS, attributes.eyeColor)) attributes.eyeColor = 'unknown';
  const lat = num(b.lat);
  const lng = num(b.lng);
  const hasLoc = lat != null && lng != null && isValidCoord(lat, lng);
  let fingerprint = null;
  if (b.fingerprint && Array.isArray(b.fingerprint.hist) && b.fingerprint.hist.length <= 512 && typeof b.fingerprint.dhash === 'string') {
    fingerprint = { hist: b.fingerprint.hist.map((x) => Number(x) || 0), dhash: b.fingerprint.dhash.slice(0, 64) };
  }
  return { attributes, lat: hasLoc ? lat : null, lng: hasLoc ? lng : null, fingerprint };
}

api.post('/captures/match', requireAuth, (req, res) => {
  const input = readCaptureInput(req.body || {});
  const collected = collectedSet(req.user.id);
  const candidates = findCandidates(input).map((c) => {
    const cat = get('SELECT * FROM cats WHERE id = ?', c.catId);
    const last = get(
      `SELECT ${MINI_USER_COLS('u')}, o.created_at FROM observations o JOIN users u ON u.id = o.user_id WHERE o.cat_id = ? ORDER BY o.created_at DESC LIMIT 1`,
      c.catId
    );
    return { ...catSummary(cat, collected), score: c.score, strong: c.strong, reasons: c.reasons, lastSeenBy: miniUser(last) };
  });
  res.json({ candidates, region: regionFor(roundCoord(input.lat), roundCoord(input.lng)) });
});

api.post('/captures', requireAuth, (req, res) => {
  const b = req.body || {};
  const input = readCaptureInput(b);
  if (input.lat == null) throw httpError(400, 'We need an approximate location. Turn on location or pick your area.');
  let catId = null;
  let newCat = null;
  if (b.catId) {
    catId = Number(b.catId);
    if (!get('SELECT 1 FROM cats WHERE id = ? AND hidden = 0', catId)) throw httpError(404, 'That cat no longer exists.');
  } else {
    const name = str(b.newCat?.name, { field: 'Cat name', required: true, max: 24 });
    const tags = (Array.isArray(b.newCat?.tags) ? b.newCat.tags : [])
      .map((t) => String(t).trim().toLowerCase()).filter((t) => t && t.length <= 20).slice(0, 5);
    newCat = { name, tags };
  }
  const photo = savePhoto(b.photo);
  const thumb = savePhoto(b.thumb, { required: false }) || photo;
  const localHour = Number.isInteger(b.localHour) && b.localHour >= 0 && b.localHour < 24 ? b.localHour : new Date().getHours();
  const result = recordCapture({
    userId: req.user.id,
    catId,
    newCat,
    attributes: input.attributes,
    lat: input.lat,
    lng: input.lng,
    fingerprint: input.fingerprint,
    photo,
    thumb,
    multiCat: !!b.multiCat,
    localHour,
    note: typeof b.note === 'string' ? b.note : '',
    matchMethod: b.matchMethod === 'manual' ? 'manual' : 'confirmed',
    feedback: Array.isArray(b.feedback) ? b.feedback.slice(0, 5) : [],
  });
  const cat = get('SELECT * FROM cats WHERE id = ?', result.catId);
  res.status(201).json({ ...result, cat: catSummary(cat, collectedSet(req.user.id)), me: meResponse(req.user) });
});

// ---------------------------------------------------------------- feed & reactions
function reactionsFor(observationIds, viewerId) {
  const counts = new Map();
  if (observationIds.length) {
    const ph = observationIds.map(() => '?').join(',');
    for (const r of all(
      `SELECT observation_id, kind, COUNT(*) AS n, MAX(user_id = ?) AS mine FROM reactions WHERE observation_id IN (${ph}) GROUP BY observation_id, kind`,
      viewerId, ...observationIds
    )) {
      if (!counts.has(r.observation_id)) counts.set(r.observation_id, { reactions: {}, myReactions: [] });
      const entry = counts.get(r.observation_id);
      entry.reactions[r.kind] = r.n;
      if (r.mine) entry.myReactions.push(r.kind);
    }
  }
  return (id) => counts.get(id) || { reactions: {}, myReactions: [] };
}

api.get('/feed', requireAuth, (req, res) => {
  const scope = req.query.scope === 'following' ? 'following' : 'all';
  const before = typeof req.query.before === 'string' && !Number.isNaN(Date.parse(req.query.before)) ? req.query.before : '9999';
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const scopeSql = scope === 'following'
    ? 'AND (e.user_id = ? OR e.user_id IN (SELECT following_id FROM follows WHERE follower_id = ?))'
    : '';
  const params = scope === 'following' ? [req.user.id, req.user.id] : [];
  const rows = all(
    `SELECT e.*, ${MINI_USER_COLS('u')}, o.photo AS o_photo, o.thumb AS o_thumb, o.art_seed AS o_art_seed, o.region AS o_region,
            c.id AS c_id, c.name AS c_name, c.rarity AS c_rarity, c.art_seed AS c_art_seed, c.coat_color AS c_coat_color,
            c.pattern AS c_pattern, c.eye_color AS c_eye_color, c.thumb AS c_thumb, c.region AS c_region,
            c.hunter_count AS c_hunter_count, c.observation_count AS c_observation_count
     FROM events e JOIN users u ON u.id = e.user_id
     LEFT JOIN observations o ON o.id = e.observation_id
     LEFT JOIN cats c ON c.id = e.cat_id
     WHERE e.created_at < ? AND e.type != 'level_up' AND (o.id IS NULL OR o.hidden = 0) AND (c.id IS NULL OR c.hidden = 0) ${scopeSql}
     ORDER BY e.created_at DESC LIMIT ?`,
    before, ...params, limit
  );
  const reacts = reactionsFor(rows.filter((r) => r.observation_id).map((r) => r.observation_id), req.user.id);
  const items = rows.map((r) => ({
    id: r.id,
    type: r.type,
    createdAt: r.created_at,
    data: JSON.parse(r.data || '{}'),
    user: miniUser(r),
    cat: r.c_id ? {
      id: r.c_id, name: r.c_name, rarity: r.c_rarity, artSeed: r.c_art_seed, coatColor: r.c_coat_color, pattern: r.c_pattern,
      eyeColor: r.c_eye_color, thumb: r.c_thumb, region: r.c_region, hunterCount: r.c_hunter_count, observationCount: r.c_observation_count,
    } : null,
    observation: r.observation_id ? {
      id: r.observation_id, photo: r.o_photo, thumb: r.o_thumb, artSeed: r.o_art_seed, region: r.o_region, ...reacts(r.observation_id),
    } : null,
    huntId: r.hunt_id,
  }));
  res.json({ items, nextBefore: rows.length === limit ? rows[rows.length - 1].created_at : null });
});

api.post('/observations/:id/react', requireAuth, (req, res) => {
  const id = intParam(req.params.id);
  const kind = String(req.body?.kind || '');
  if (!REACTION_IDS.includes(kind)) throw httpError(400, 'Unknown reaction.');
  const obs = get(`SELECT o.*, c.name AS cat_name FROM observations o JOIN cats c ON c.id = o.cat_id WHERE o.id = ? AND o.hidden = 0`, id);
  if (!obs) throw httpError(404, 'This capture no longer exists.');
  const exists = get('SELECT 1 FROM reactions WHERE observation_id = ? AND user_id = ? AND kind = ?', id, req.user.id, kind);
  if (exists) run('DELETE FROM reactions WHERE observation_id = ? AND user_id = ? AND kind = ?', id, req.user.id, kind);
  else {
    const at = nowIso();
    run('INSERT INTO reactions (observation_id, user_id, kind, created_at) VALUES (?, ?, ?, ?)', id, req.user.id, kind, at);
    if (obs.user_id !== req.user.id) {
      const icon = REACTIONS.find((r) => r.id === kind).icon;
      notify({ userId: obs.user_id, type: 'reaction', actorId: req.user.id, catId: obs.cat_id, text: `${req.user.display_name} reacted ${icon} to your ${obs.cat_name} capture.`, at });
    }
  }
  res.json(reactionsFor([id], req.user.id)(id));
});

// ---------------------------------------------------------------- reports
api.post('/reports', requireAuth, (req, res) => {
  const type = String(req.body?.targetType || '');
  const targetId = Number(req.body?.targetId);
  const reason = str(req.body?.reason, { field: 'Reason', required: true, max: 300 });
  const tables = { cat: 'cats', observation: 'observations', user: 'users' };
  if (!tables[type] || !Number.isInteger(targetId)) throw httpError(400, 'Invalid report.');
  if (!get(`SELECT 1 FROM ${tables[type]} WHERE id = ?`, targetId)) throw httpError(404, 'Nothing to report here.');
  const r = run('INSERT OR IGNORE INTO reports (reporter_id, target_type, target_id, reason, created_at) VALUES (?, ?, ?, ?, ?)',
    req.user.id, type, targetId, reason, nowIso());
  // Simple community moderation: enough distinct reports hide content until reviewed.
  const n = get('SELECT COUNT(*) AS n FROM reports WHERE target_type = ? AND target_id = ?', type, targetId).n;
  if (type === 'observation') {
    run('UPDATE observations SET report_count = ?, hidden = CASE WHEN ? >= 3 THEN 1 ELSE hidden END WHERE id = ?', n, n, targetId);
  } else if (type === 'cat' && n >= 5) {
    run('UPDATE cats SET hidden = 1 WHERE id = ?', targetId);
  }
  res.status(201).json({ ok: true, alreadyReported: !r.changes });
});

// ---------------------------------------------------------------- notifications
api.get('/notifications', requireAuth, (req, res) => {
  const rows = all(
    `SELECT n.*, ${MINI_USER_COLS('u')}, c.thumb AS c_thumb, c.art_seed AS c_art_seed, c.coat_color AS c_coat_color, c.pattern AS c_pattern, c.eye_color AS c_eye_color
     FROM notifications n LEFT JOIN users u ON u.id = n.actor_id LEFT JOIN cats c ON c.id = n.cat_id
     WHERE n.user_id = ? ORDER BY n.created_at DESC LIMIT 60`,
    req.user.id
  );
  res.json({
    items: rows.map((n) => ({
      id: n.id, type: n.type, text: n.text, read: !!n.read, createdAt: n.created_at, actor: miniUser(n), catId: n.cat_id, huntId: n.hunt_id,
      cat: n.cat_id ? { thumb: n.c_thumb, artSeed: n.c_art_seed, coatColor: n.c_coat_color, pattern: n.c_pattern, eyeColor: n.c_eye_color } : null,
    })),
    unread: rows.filter((n) => !n.read).length,
  });
});

api.post('/notifications/read', requireAuth, (req, res) => {
  run('UPDATE notifications SET read = 1 WHERE user_id = ?', req.user.id);
  res.json({ ok: true });
});

// ---------------------------------------------------------------- achievements
api.get('/achievements', requireAuth, (req, res) => {
  const owned = new Map(all('SELECT achievement_id, unlocked_at FROM user_achievements WHERE user_id = ?', req.user.id).map((r) => [r.achievement_id, r.unlocked_at]));
  res.json({ achievements: ACHIEVEMENTS.map(({ check, ...a }) => ({ ...a, unlockedAt: owned.get(a.id) || null })), stats: userStats(req.user.id) });
});

// ---------------------------------------------------------------- map
api.get('/map', requireAuth, (req, res) => {
  const collected = collectedSet(req.user.id);
  const cats = all('SELECT * FROM cats WHERE hidden = 0 AND lat IS NOT NULL ORDER BY last_observed_at DESC LIMIT 1000').map((c) => {
    const s = catSummary(c, collected);
    return {
      id: s.id, name: s.name, lat: s.lat, lng: s.lng, rarity: s.rarity, thumb: s.thumb, artSeed: s.artSeed, coatColor: s.coatColor,
      pattern: s.pattern, eyeColor: s.eyeColor, collected: s.collected, status: s.status, lastObservedAt: s.lastObservedAt,
      region: s.region, hunterCount: s.hunterCount, observationCount: s.observationCount, legendTitle: s.legendTitle,
    };
  });

  // Hotspots: ~1 km grid cells with several different cats seen during the last 7 days.
  const since = new Date(Date.now() - 7 * 86400000).toISOString();
  const cells = new Map();
  for (const o of all('SELECT cat_id, user_id, lat, lng, region FROM observations WHERE created_at >= ? AND lat IS NOT NULL AND hidden = 0', since)) {
    const key = `${Math.round(o.lat * 100)}:${Math.round(o.lng * 100)}`;
    if (!cells.has(key)) cells.set(key, { cats: new Set(), hunters: new Set(), lat: 0, lng: 0, n: 0, region: o.region });
    const cell = cells.get(key);
    cell.cats.add(o.cat_id); cell.hunters.add(o.user_id); cell.lat += o.lat; cell.lng += o.lng; cell.n += 1;
  }
  const hotspots = [...cells.values()]
    .filter((c) => c.cats.size >= 3)
    .map((c) => ({ lat: roundCoord(c.lat / c.n, 0.005), lng: roundCoord(c.lng / c.n, 0.005), region: c.region, cats: c.cats.size, hunters: c.hunters.size, observations: c.n }))
    .sort((a, b) => b.cats - a.cats)
    .slice(0, 30);

  // Active hunters: anyone who spotted a cat in the last 2 hours, shown on a ~1 km grid only.
  const activeSince = new Date(Date.now() - 2 * 3600000).toISOString();
  const hunters = all(
    `SELECT ${MINI_USER_COLS('u')}, o.lat, o.lng, MAX(o.created_at) AS last_at FROM observations o JOIN users u ON u.id = o.user_id
     WHERE o.created_at >= ? AND o.lat IS NOT NULL GROUP BY o.user_id ORDER BY last_at DESC LIMIT 50`,
    activeSince
  ).map((h) => ({ ...miniUser(h), lat: roundCoord(h.lat, 0.01), lng: roundCoord(h.lng, 0.01), lastActiveAt: h.last_at }));

  const now = nowIso();
  const hunts = all('SELECT * FROM hunts WHERE starts_at <= ? AND ends_at >= ? AND lat IS NOT NULL', now, now)
    .map((h) => ({ id: h.id, title: h.title, lat: h.lat, lng: h.lng, region: h.region, goal: h.goal, progress: huntProgress(h) }));

  res.json({ cats, hotspots, hunters, hunts });
});

// ---------------------------------------------------------------- hunts
function huntSummary(h, viewerId) {
  const participants = all(`SELECT ${MINI_USER_COLS('u')} FROM hunt_participants hp JOIN users u ON u.id = hp.user_id WHERE hp.hunt_id = ? ORDER BY hp.joined_at`, h.id).map((r) => miniUser(r));
  const now = Date.now();
  const status = h.completed_at ? 'completed' : Date.parse(h.ends_at) < now ? 'ended' : Date.parse(h.starts_at) > now ? 'upcoming' : 'active';
  return {
    id: h.id, title: h.title, region: h.region, lat: h.lat, lng: h.lng, goal: h.goal, progress: huntProgress(h),
    startsAt: h.starts_at, endsAt: h.ends_at, completedAt: h.completed_at, status,
    participants, joined: participants.some((p) => p.id === viewerId), creatorId: h.creator_id,
  };
}

api.get('/hunts', requireAuth, (req, res) => {
  const now = nowIso();
  const active = all('SELECT * FROM hunts WHERE ends_at >= ? ORDER BY starts_at LIMIT 30', now).map((h) => huntSummary(h, req.user.id));
  const past = all(
    `SELECT h.* FROM hunts h WHERE h.ends_at < ? AND (h.id IN (SELECT hunt_id FROM hunt_participants WHERE user_id = ?) OR h.completed_at IS NOT NULL)
     ORDER BY h.ends_at DESC LIMIT 10`, now, req.user.id
  ).map((h) => huntSummary(h, req.user.id));
  res.json({ active, past });
});

api.post('/hunts', requireAuth, (req, res) => {
  const b = req.body || {};
  const lat = num(b.lat);
  const lng = num(b.lng);
  let region = str(b.region, { field: 'Area', max: 40 });
  const hasLoc = lat != null && lng != null && isValidCoord(lat, lng);
  if (!hasLoc && !region) throw httpError(400, 'Choose where the hunt takes place.');
  const regionRef = REGIONS.find((r) => r.name === region);
  const hlat = hasLoc ? roundCoord(lat, 0.01) : regionRef?.lat ?? null;
  const hlng = hasLoc ? roundCoord(lng, 0.01) : regionRef?.lng ?? null;
  if (!region) region = regionFor(hlat, hlng);
  const duration = Math.min(Math.max(Number(b.durationMin) || 90, 15), 240);
  const goal = Math.min(Math.max(Number(b.goal) || 10, 1), 50);
  const title = str(b.title, { field: 'Title', max: 40 }) || `Cat Hunt: ${region}`;
  const start = new Date();
  const at = start.toISOString();
  const id = tx(() => {
    const r = run(`INSERT INTO hunts (title, creator_id, region, lat, lng, goal, starts_at, ends_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      title, req.user.id, region, hlat, hlng, goal, at, new Date(start.getTime() + duration * 60000).toISOString(), at);
    const huntId = Number(r.lastInsertRowid);
    run('INSERT INTO hunt_participants (hunt_id, user_id, joined_at) VALUES (?, ?, ?)', huntId, req.user.id, at);
    addEvent({ type: 'hunt_created', userId: req.user.id, huntId, data: { title, region, goal, durationMin: duration }, at });
    for (const f of all('SELECT follower_id FROM follows WHERE following_id = ?', req.user.id)) {
      notify({ userId: f.follower_id, type: 'hunt', actorId: req.user.id, huntId, text: `${req.user.display_name} started a Cat Hunt in ${region}. Join in!`, at });
    }
    return huntId;
  });
  res.status(201).json({ hunt: huntSummary(get('SELECT * FROM hunts WHERE id = ?', id), req.user.id) });
});

api.get('/hunts/:id', requireAuth, (req, res) => {
  const h = get('SELECT * FROM hunts WHERE id = ?', intParam(req.params.id));
  if (!h) throw httpError(404, 'This hunt does not exist.');
  const collected = collectedSet(req.user.id);
  const found = all(
    `SELECT c.*, ${MINI_USER_COLS('u')}, MIN(o.created_at) AS found_at FROM observations o JOIN hunt_participants hp ON hp.user_id = o.user_id AND hp.hunt_id = ?
     JOIN cats c ON c.id = o.cat_id JOIN users u ON u.id = o.user_id
     WHERE o.created_at BETWEEN ? AND ? AND o.hidden = 0 GROUP BY c.id ORDER BY found_at DESC`,
    h.id, h.starts_at, h.ends_at
  ).map((r) => ({ ...catSummary(r, collected), foundBy: miniUser(r), foundAt: r.found_at }));
  res.json({ hunt: huntSummary(h, req.user.id), found });
});

api.post('/hunts/:id/join', requireAuth, (req, res) => {
  const h = get('SELECT * FROM hunts WHERE id = ?', intParam(req.params.id));
  if (!h) throw httpError(404, 'This hunt does not exist.');
  if (Date.parse(h.ends_at) < Date.now()) throw httpError(400, 'This hunt has already ended.');
  run('INSERT OR IGNORE INTO hunt_participants (hunt_id, user_id, joined_at) VALUES (?, ?, ?)', h.id, req.user.id, nowIso());
  res.json({ hunt: huntSummary(h, req.user.id) });
});

api.post('/hunts/:id/leave', requireAuth, (req, res) => {
  const h = get('SELECT * FROM hunts WHERE id = ?', intParam(req.params.id));
  if (!h) throw httpError(404, 'This hunt does not exist.');
  run('DELETE FROM hunt_participants WHERE hunt_id = ? AND user_id = ?', h.id, req.user.id);
  res.json({ hunt: huntSummary(h, req.user.id) });
});

api.use((req, res) => res.status(404).json({ error: 'Unknown API route.' }));

