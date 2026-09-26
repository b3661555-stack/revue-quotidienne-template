// Game rules: rarity, XP and levels. Kept deliberately simple and deterministic.

export const COAT_COLORS = [
  { id: 'black', label: 'Black', hex: '#2b2b33', points: 0 },
  { id: 'grey', label: 'Grey', hex: '#8d93a0', points: 0 },
  { id: 'orange', label: 'Orange', hex: '#f08a3c', points: 0 },
  { id: 'white', label: 'White', hex: '#f4f1ea', points: 1 },
  { id: 'brown', label: 'Brown', hex: '#7a5638', points: 1 },
  { id: 'cream', label: 'Cream', hex: '#ecd3a4', points: 2 },
];

export const PATTERNS = [
  { id: 'tabby', label: 'Tabby', points: 0 },
  { id: 'bicolor', label: 'Bicolor', points: 0 },
  { id: 'solid', label: 'Solid', points: 1 },
  { id: 'tuxedo', label: 'Tuxedo', points: 1 },
  { id: 'spotted', label: 'Spotted', points: 2 },
  { id: 'tortoiseshell', label: 'Tortie', points: 2 },
  { id: 'calico', label: 'Calico', points: 2 },
  { id: 'colorpoint', label: 'Colorpoint', points: 3 },
];

export const EYE_COLORS = [
  { id: 'unknown', label: "Couldn't see", points: 0 },
  { id: 'yellow', label: 'Yellow', points: 0 },
  { id: 'green', label: 'Green', points: 0 },
  { id: 'amber', label: 'Amber', points: 0 },
  { id: 'blue', label: 'Blue', points: 1 },
  { id: 'odd', label: 'Odd-eyed', points: 3 },
];

export const PERSONALITY_TAGS = [
  'friendly', 'shy', 'sleepy', 'curious', 'chatty', 'grumpy', 'playful', 'regal', 'chonky', 'sunbather', 'window watcher', 'fence walker',
];

export const RARITIES = [
  { id: 'common', label: 'Common', icon: '🟢', color: '#3fb86b', bonus: 0 },
  { id: 'uncommon', label: 'Uncommon', icon: '🔵', color: '#3a8dff', bonus: 25 },
  { id: 'rare', label: 'Rare', icon: '🟣', color: '#9b5cff', bonus: 50 },
  { id: 'epic', label: 'Epic', icon: '🟡', color: '#f2b705', bonus: 100 },
  { id: 'legendary', label: 'Legendary', icon: '🔴', color: '#ff4d5e', bonus: 200 },
  { id: 'shiny', label: 'Shiny', icon: '✨', color: '#ff7bd5', bonus: 300 },
];
export const RARE_OR_BETTER = ['rare', 'epic', 'legendary', 'shiny'];

const pts = (list, id) => list.find((x) => x.id === id)?.points ?? 0;

export const SHINY_ODDS = 40;
export const isShinySeed = (seed) => seed % SHINY_ODDS === 7;

/** Rarity reflects how unusual a visual combination is, never how "good" a cat is. */
export function computeRarity({ coatColor, pattern, eyeColor }, artSeed = 1) {
  if (isShinySeed(artSeed)) return 'shiny';
  const score = pts(COAT_COLORS, coatColor) + pts(PATTERNS, pattern) + pts(EYE_COLORS, eyeColor);
  if (score >= 7) return 'legendary';
  if (score >= 5) return 'epic';
  if (score >= 3) return 'rare';
  if (score >= 2) return 'uncommon';
  return 'common';
}

export const XP = {
  newCat: 100,
  firstSighting: 50,
  repeat: 15,
  repeatSameDay: 5,
  newRegion: 75,
  respotted: 50,
  multiCat: 20,
  huntComplete: 150,
};

export const xpForLevel = (level) => 50 * level * (level - 1);
export const levelFor = (xp) => Math.max(1, Math.floor((1 + Math.sqrt(1 + 0.08 * Math.max(0, xp))) / 2));

export function titleFor(level) {
  if (level >= 30) return 'Legendary Whisker';
  if (level >= 20) return 'Master Tracker';
  if (level >= 10) return 'Cat Hunter';
  if (level >= 5) return 'Cat Scout';
  return 'Curious Kitten';
}

export function levelInfo(xp) {
  const level = levelFor(xp);
  const floor = xpForLevel(level);
  const next = xpForLevel(level + 1);
  return { level, title: titleFor(level), xp, levelXp: xp - floor, levelSpan: next - floor, nextLevelXp: next };
}

export const isValidAttr = (list, id) => list.some((x) => x.id === id);
