import { all, get, run } from '../db.js';
import { ACHIEVEMENTS } from './achievementDefs.js';
import { levelFor, RARE_OR_BETTER } from './game.js';

const rareList = RARE_OR_BETTER.map((r) => `'${r}'`).join(',');

export function userStats(userId) {
  const base = get(
    `SELECT COUNT(DISTINCT o.cat_id) AS cats,
            COUNT(DISTINCT CASE WHEN c.rarity IN (${rareList}) THEN c.id END) AS rare,
            COUNT(DISTINCT CASE WHEN c.rarity = 'shiny' THEN c.id END) AS shiny,
            COUNT(DISTINCT o.region) AS regions,
            COUNT(DISTINCT CASE WHEN o.lat BETWEEN 45.8 AND 47.85 AND o.lng BETWEEN 5.95 AND 10.5 THEN o.cat_id END) AS swissCats,
            COUNT(*) AS observations,
            SUM(CASE WHEN o.multi_cat = 1 THEN 1 ELSE 0 END) AS groupCaptures,
            SUM(CASE WHEN o.local_hour >= 21 OR o.local_hour < 5 THEN 1 ELSE 0 END) AS nightCaptures
     FROM observations o JOIN cats c ON c.id = o.cat_id
     WHERE o.user_id = ? AND o.hidden = 0 AND c.hidden = 0`,
    userId
  );
  const firstCatches = get('SELECT COUNT(*) AS n FROM cats WHERE first_catcher_id = ? AND hidden = 0', userId).n;
  const legendFirstCatches = get('SELECT COUNT(*) AS n FROM cats WHERE first_catcher_id = ? AND hunter_count >= 10 AND hidden = 0', userId).n;
  const respots = get(`SELECT COUNT(*) AS n FROM events WHERE user_id = ? AND type = 'respotted'`, userId).n;
  const huntsCompleted = get(
    `SELECT COUNT(*) AS n FROM hunt_participants hp JOIN hunts h ON h.id = hp.hunt_id WHERE hp.user_id = ? AND h.completed_at IS NOT NULL`,
    userId
  ).n;
  const following = get('SELECT COUNT(*) AS n FROM follows WHERE follower_id = ?', userId).n;
  const followers = get('SELECT COUNT(*) AS n FROM follows WHERE following_id = ?', userId).n;
  const badges = get('SELECT COUNT(*) AS n FROM user_achievements WHERE user_id = ?', userId).n;
  return {
    cats: base.cats || 0,
    rare: base.rare || 0,
    shiny: base.shiny || 0,
    regions: base.regions || 0,
    swissCats: base.swissCats || 0,
    observations: base.observations || 0,
    groupCaptures: base.groupCaptures || 0,
    nightCaptures: base.nightCaptures || 0,
    firstCatches,
    legendFirstCatches,
    respots,
    huntsCompleted,
    following,
    followers,
    badges,
  };
}

export function addEvent({ type, userId, catId = null, observationId = null, huntId = null, data = {}, isDemo = 0, at }) {
  run(
    `INSERT INTO events (type, user_id, cat_id, observation_id, hunt_id, data, is_demo, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    type, userId, catId, observationId, huntId, JSON.stringify(data), isDemo ? 1 : 0, at
  );
}

/** `text` is the English fallback; clients render `type` + `data` in the viewer's language. */
export function notify({ userId, type, text, data = {}, actorId = null, catId = null, huntId = null, at }) {
  run(
    `INSERT INTO notifications (user_id, type, actor_id, cat_id, hunt_id, text, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    userId, type, actorId, catId, huntId, text, JSON.stringify(data), at
  );
}

/** Adds XP, emits a level-up event/notification when needed. Returns {before, after}. */
export function awardXp(userId, amount, at, isDemo = 0) {
  const u = get('SELECT xp FROM users WHERE id = ?', userId);
  const before = levelFor(u.xp);
  const after = levelFor(u.xp + amount);
  run('UPDATE users SET xp = xp + ? WHERE id = ?', amount, userId);
  if (after > before) {
    addEvent({ type: 'level_up', userId, data: { level: after }, isDemo, at });
    notify({ userId, type: 'level_up', text: `Level up! You reached level ${after}.`, data: { level: after }, at });
  }
  return { before, after };
}

/** Unlocks any newly earned badges for a user. Returns the new badges. */
export function evaluateAchievements(userId, at, isDemo = 0) {
  const owned = new Set(all('SELECT achievement_id FROM user_achievements WHERE user_id = ?', userId).map((r) => r.achievement_id));
  const stats = userStats(userId);
  const unlocked = [];
  for (const a of ACHIEVEMENTS) {
    if (owned.has(a.id) || !a.check(stats)) continue;
    run('INSERT INTO user_achievements (user_id, achievement_id, unlocked_at) VALUES (?, ?, ?)', userId, a.id, at);
    addEvent({ type: 'achievement', userId, data: { id: a.id, name: a.name, icon: a.icon }, isDemo, at });
    notify({ userId, type: 'achievement', text: `${a.icon} Badge unlocked: ${a.name}`, data: { id: a.id, icon: a.icon }, at });
    unlocked.push({ id: a.id, name: a.name, icon: a.icon, description: a.description });
  }
  return unlocked;
}
