import { config } from '../config.js';
import { levelInfo } from './game.js';

const DAY = 86400000;

export function publicUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    bio: u.bio,
    avatarEmoji: u.avatar_emoji,
    avatarColor: u.avatar_color,
    isDemo: !!u.is_demo,
    createdAt: u.created_at,
    ...levelInfo(u.xp),
  };
}

/** Minimal user shape for lists/feeds; accepts prefixed columns (e.g. u_username). */
export function miniUser(row, p = 'u_') {
  if (!row || row[`${p}id`] == null) return null;
  return {
    id: row[`${p}id`],
    username: row[`${p}username`],
    displayName: row[`${p}display_name`],
    avatarEmoji: row[`${p}avatar_emoji`],
    avatarColor: row[`${p}avatar_color`],
  };
}
export const MINI_USER_COLS = (alias, p = 'u_') =>
  `${alias}.id AS ${p}id, ${alias}.username AS ${p}username, ${alias}.display_name AS ${p}display_name, ${alias}.avatar_emoji AS ${p}avatar_emoji, ${alias}.avatar_color AS ${p}avatar_color`;

/** Community fame, derived from real counts. Clients localize via `legend.kind`. */
export function legendInfo(cat) {
  const wild = cat.region?.startsWith('Wild zone');
  if (cat.hunter_count >= 10) return { kind: 'legend', region: wild ? null : cat.region };
  if (cat.observation_count >= 25) return { kind: 'celebrity', region: cat.region };
  return null;
}

export function legendTitle(cat) {
  if (cat.hunter_count >= 10) return `👑 Legend of ${cat.region?.startsWith('Wild zone') ? 'the wild' : cat.region}`;
  if (cat.observation_count >= 25) return `🔥 ${cat.region} celebrity`;
  return null;
}

export function catSummary(cat, collectedSet) {
  const daysSinceSeen = Math.floor((Date.now() - Date.parse(cat.last_observed_at)) / DAY);
  return {
    id: cat.id,
    dexNumber: cat.id,
    name: cat.name,
    photo: cat.photo,
    thumb: cat.thumb,
    artSeed: cat.art_seed,
    coatColor: cat.coat_color,
    pattern: cat.pattern,
    eyeColor: cat.eye_color,
    breed: cat.breed,
    rarity: cat.rarity,
    lat: cat.lat,
    lng: cat.lng,
    region: cat.region,
    observationCount: cat.observation_count,
    hunterCount: cat.hunter_count,
    favoriteCount: cat.favorite_count,
    createdAt: cat.created_at,
    lastObservedAt: cat.last_observed_at,
    daysSinceSeen,
    status: daysSinceSeen >= config.missingAfterDays ? 'missing' : 'active',
    legendTitle: legendTitle(cat),
    legend: legendInfo(cat),
    isDemo: !!cat.is_demo,
    collected: collectedSet ? collectedSet.has(cat.id) : undefined,
  };
}
