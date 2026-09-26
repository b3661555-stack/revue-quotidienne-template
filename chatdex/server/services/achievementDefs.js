// Badge catalogue. `check` receives the user's stats (see progress.js#userStats).
export const ACHIEVEMENTS = [
  { id: 'first_capture', icon: '🐾', name: 'First Capture', description: 'Add your first cat to your Chatdex.', check: (s) => s.cats >= 1 },
  { id: 'cats_10', icon: '🐱', name: '10 Cats', description: 'Collect 10 different cats.', check: (s) => s.cats >= 10 },
  { id: 'cats_50', icon: '😺', name: '50 Cats', description: 'Collect 50 different cats.', check: (s) => s.cats >= 50 },
  { id: 'cats_100', icon: '😻', name: '100 Cats', description: 'Collect 100 different cats.', check: (s) => s.cats >= 100 },
  { id: 'first_catch', icon: '👑', name: 'Trailblazer', description: 'Be the very first to register a cat.', check: (s) => s.firstCatches >= 1 },
  { id: 'first_shiny', icon: '✨', name: 'First Shiny', description: 'Collect a Shiny cat.', check: (s) => s.shiny >= 1 },
  { id: 'expert_spotter', icon: '🔭', name: 'Expert Spotter', description: 'Collect 5 cats that are Rare or rarer.', check: (s) => s.rare >= 5 },
  { id: 'night_hunter', icon: '🌙', name: 'Night Hunter', description: 'Spot a cat between 9 pm and 5 am.', check: (s) => s.nightCaptures >= 1 },
  { id: 'cat_group', icon: '🐈', name: 'Cat Group', description: 'Photograph several cats together.', check: (s) => s.groupCaptures >= 1 },
  { id: 'explorer', icon: '🌍', name: 'Explorer', description: 'Spot cats in 3 different regions.', check: (s) => s.regions >= 3 },
  { id: 'swiss_collector', icon: '🇨🇭', name: 'Swiss Cat Collector', description: 'Collect 10 cats in Switzerland.', check: (s) => s.swissCats >= 10 },
  { id: 'cat_detective', icon: '🚨', name: 'Cat Detective', description: 'Re-spot a cat nobody had seen for a month.', check: (s) => s.respots >= 1 },
  { id: 'local_legend', icon: '🏰', name: 'Local Legend', description: 'Hold the First Catch of a cat seen by 10+ hunters.', check: (s) => s.legendFirstCatches >= 1 },
  { id: 'hunting_party', icon: '🏹', name: 'Hunting Party', description: 'Complete a Cat Hunt with other hunters.', check: (s) => s.huntsCompleted >= 1 },
  { id: 'pack_member', icon: '🤝', name: 'Pack Member', description: 'Follow 3 other hunters.', check: (s) => s.following >= 3 },
];
