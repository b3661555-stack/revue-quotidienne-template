import { all, get, run, tx } from '../db.js';
import { config } from '../config.js';
import { computeRarity, levelFor, RARITIES, XP } from './game.js';
import { regionFor, roundCoord, snap } from './geo.js';
import { addEvent, awardXp, evaluateAchievements, notify } from './progress.js';
import { updateHuntsFor } from './hunts.js';

const DAY = 86400000;
const bonusFor = (rarity) => RARITIES.find((r) => r.id === rarity)?.bonus ?? 0;
export const randomSeed = () => Math.floor(Math.random() * 1_000_000_000);

/**
 * The core game action: a user photographs a cat.
 * Either `catId` (a known cat, confirmed by the user) or `newCat` must be given.
 */
export function recordCapture(input) {
  const at = input.at || new Date().toISOString();
  const atMs = Date.parse(at);
  const isDemo = input.isDemo ? 1 : 0;
  const lat = roundCoord(input.lat);
  const lng = roundCoord(input.lng);
  const region = regionFor(lat, lng);
  const attrs = input.attributes;

  return tx(() => {
    const user = get('SELECT * FROM users WHERE id = ?', input.userId);
    if (!user) throw Object.assign(new Error('User not found'), { status: 404 });

    let cat;
    let isNewCat = false;
    if (input.catId) {
      cat = get('SELECT * FROM cats WHERE id = ? AND hidden = 0', input.catId);
      if (!cat) throw Object.assign(new Error('That cat no longer exists'), { status: 404 });
    } else {
      isNewCat = true;
      const artSeed = input.artSeed ?? randomSeed();
      const rarity = computeRarity(attrs, artSeed);
      const res = run(
        `INSERT INTO cats (name, photo, thumb, art_seed, coat_color, pattern, eye_color, breed, rarity, lat, lng, region,
                           first_catcher_id, is_demo, created_at, last_observed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        input.newCat.name, input.photo || null, input.thumb || null, artSeed, attrs.coatColor, attrs.pattern,
        attrs.eyeColor || 'unknown', attrs.breed || 'Unknown', rarity,
        lat == null ? null : roundCoord(snap(lat, 0.0025)), lng == null ? null : roundCoord(snap(lng, 0.0025)), region,
        user.id, isDemo, at, at
      );
      cat = get('SELECT * FROM cats WHERE id = ?', Number(res.lastInsertRowid));
      for (const tag of input.newCat.tags || []) {
        run('INSERT OR IGNORE INTO cat_tags (cat_id, user_id, tag, created_at) VALUES (?, ?, ?, ?)', cat.id, user.id, tag, at);
      }
    }

    const prevUserObs = get('SELECT created_at FROM observations WHERE cat_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 1', cat.id, user.id);
    const firstForUser = !prevUserObs;
    const daysMissing = isNewCat ? 0 : Math.floor((atMs - Date.parse(cat.last_observed_at)) / DAY);
    const respotted = !isNewCat && daysMissing >= config.missingAfterDays;
    const regionIsNew = !get('SELECT 1 FROM observations WHERE user_id = ? AND region = ? LIMIT 1', user.id, region);

    const xp = [];
    if (isNewCat) {
      xp.push({ label: 'New cat discovered', xp: XP.newCat });
      if (bonusFor(cat.rarity)) xp.push({ label: `${cat.rarity[0].toUpperCase()}${cat.rarity.slice(1)} bonus`, xp: bonusFor(cat.rarity) });
    } else if (firstForUser) {
      xp.push({ label: 'New cat for your collection', xp: XP.firstSighting });
      if (bonusFor(cat.rarity)) xp.push({ label: `${cat.rarity[0].toUpperCase()}${cat.rarity.slice(1)} bonus`, xp: Math.round(bonusFor(cat.rarity) / 2) });
    } else {
      const sameDay = atMs - Date.parse(prevUserObs.created_at) < DAY / 2;
      xp.push({ label: sameDay ? 'Another look' : 'Observation', xp: sameDay ? XP.repeatSameDay : XP.repeat });
    }
    if (regionIsNew && lat != null) xp.push({ label: `New region: ${region}`, xp: XP.newRegion });
    if (respotted) xp.push({ label: 'Re-spotted after a long absence', xp: XP.respotted });
    if (input.multiCat) xp.push({ label: 'Cat group photo', xp: XP.multiCat });
    const xpTotal = xp.reduce((s, x) => s + x.xp, 0);

    const obsRes = run(
      `INSERT INTO observations (cat_id, user_id, photo, thumb, art_seed, fingerprint, lat, lng, region, note, multi_cat, local_hour,
                                 is_first_catch, match_method, xp_awarded, is_demo, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      cat.id, user.id, input.photo || null, input.thumb || null, input.obsArtSeed ?? randomSeed(),
      input.fingerprint ? JSON.stringify(input.fingerprint) : null, lat, lng, region, (input.note || '').slice(0, 280),
      input.multiCat ? 1 : 0, Number.isInteger(input.localHour) ? input.localHour : null, isNewCat ? 1 : 0,
      isNewCat ? 'new' : input.matchMethod || 'confirmed', xpTotal, isDemo, at
    );
    const observationId = Number(obsRes.lastInsertRowid);

    // Refresh cat aggregates. The public position is the centre of its sightings, snapped to ~250 m.
    const agg = get('SELECT AVG(lat) AS lat, AVG(lng) AS lng, COUNT(*) AS n, COUNT(DISTINCT user_id) AS hunters, MAX(created_at) AS last FROM observations WHERE cat_id = ?', cat.id);
    run(
      `UPDATE cats SET observation_count = ?, hunter_count = ?, last_observed_at = ?, lat = COALESCE(?, lat), lng = COALESCE(?, lng),
                       photo = COALESCE(photo, ?), thumb = COALESCE(thumb, ?) WHERE id = ?`,
      agg.n, agg.hunters, agg.last, agg.lat == null ? null : roundCoord(snap(agg.lat, 0.0025)),
      agg.lng == null ? null : roundCoord(snap(agg.lng, 0.0025)), input.photo || null, input.thumb || null, cat.id
    );
    cat = get('SELECT * FROM cats WHERE id = ?', cat.id);

    for (const f of input.feedback || []) {
      if (!['yes', 'no', 'unsure'].includes(f.verdict)) continue;
      run('INSERT INTO match_feedback (observation_id, candidate_cat_id, user_id, verdict, score, created_at) VALUES (?, ?, ?, ?, ?, ?)',
        observationId, f.catId, user.id, f.verdict, Number(f.score) || null, at);
    }

    const level = awardXp(user.id, xpTotal, at, isDemo);
    const hunterRank = firstForUser ? cat.hunter_count : null;

    if (isNewCat) {
      addEvent({ type: 'discovery', userId: user.id, catId: cat.id, observationId, data: { rarity: cat.rarity, region }, isDemo, at });
    } else if (respotted) {
      addEvent({ type: 'respotted', userId: user.id, catId: cat.id, observationId, data: { daysMissing, region }, isDemo, at });
      const collectors = all('SELECT DISTINCT user_id FROM observations WHERE cat_id = ? AND user_id != ?', cat.id, user.id);
      for (const c of collectors) {
        notify({ userId: c.user_id, type: 'respotted', actorId: user.id, catId: cat.id, text: `🚨 ${cat.name} has been spotted again after ${daysMissing} days, by ${user.display_name}!`, at });
      }
    } else {
      addEvent({ type: 'observation', userId: user.id, catId: cat.id, observationId, data: { hunterRank, firstForUser, region }, isDemo, at });
    }
    if (!isNewCat && firstForUser && cat.first_catcher_id && cat.first_catcher_id !== user.id) {
      notify({ userId: cat.first_catcher_id, type: 'first_catch_found', actorId: user.id, catId: cat.id, text: `${user.display_name} found ${cat.name}, your First Catch! Hunter #${hunterRank}.`, at });
    }

    const achievements = evaluateAchievements(user.id, at, isDemo);
    if (cat.first_catcher_id && cat.first_catcher_id !== user.id) evaluateAchievements(cat.first_catcher_id, at, isDemo);
    const hunts = updateHuntsFor(user.id, at, isDemo);
    const huntXp = hunts.filter((h) => h.justCompleted).length ? XP.huntComplete : 0;

    const finalUser = get('SELECT xp FROM users WHERE id = ?', user.id);
    return {
      observationId,
      catId: cat.id,
      isNewCat,
      firstForUser,
      isFirstCatch: isNewCat,
      hunterRank,
      respotted,
      daysMissing,
      region,
      xp,
      xpTotal: xpTotal + huntXp,
      levelBefore: level.before,
      levelAfter: levelFor(finalUser.xp),
      userXp: finalUser.xp,
      achievements,
      hunts,
    };
  });
}
