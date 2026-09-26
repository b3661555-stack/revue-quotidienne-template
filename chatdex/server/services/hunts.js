import { all, get, run } from '../db.js';
import { XP } from './game.js';
import { addEvent, awardXp, evaluateAchievements, notify } from './progress.js';

export function huntProgress(hunt) {
  return get(
    `SELECT COUNT(DISTINCT o.cat_id) AS n FROM observations o
     JOIN hunt_participants hp ON hp.user_id = o.user_id AND hp.hunt_id = ?
     WHERE o.created_at BETWEEN ? AND ? AND o.hidden = 0`,
    hunt.id, hunt.starts_at, hunt.ends_at
  ).n;
}

/** Called after each capture: advances the hunts this user takes part in. */
export function updateHuntsFor(userId, at, isDemo = 0) {
  const hunts = all(
    `SELECT h.* FROM hunts h JOIN hunt_participants hp ON hp.hunt_id = h.id
     WHERE hp.user_id = ? AND h.starts_at <= ? AND h.ends_at >= ?`,
    userId, at, at
  );
  return hunts.map((h) => {
    const progress = huntProgress(h);
    let justCompleted = false;
    if (!h.completed_at && progress >= h.goal) {
      justCompleted = true;
      run('UPDATE hunts SET completed_at = ? WHERE id = ?', at, h.id);
      addEvent({ type: 'hunt_completed', userId, huntId: h.id, data: { title: h.title, goal: h.goal }, isDemo, at });
      for (const p of all('SELECT user_id FROM hunt_participants WHERE hunt_id = ?', h.id)) {
        awardXp(p.user_id, XP.huntComplete, at, isDemo);
        notify({ userId: p.user_id, type: 'hunt_completed', huntId: h.id, text: `🏹 Hunt complete: ${h.title}! +${XP.huntComplete} XP`, at });
        evaluateAchievements(p.user_id, at, isDemo);
      }
    }
    return { huntId: h.id, title: h.title, progress, goal: h.goal, completed: !!(h.completed_at || justCompleted), justCompleted };
  });
}
