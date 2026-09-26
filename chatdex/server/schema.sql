CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT NOT NULL,
  bio TEXT NOT NULL DEFAULT '',
  avatar_emoji TEXT NOT NULL DEFAULT '🐱',
  avatar_color TEXT NOT NULL DEFAULT '#ff8a4c',
  xp INTEGER NOT NULL DEFAULT 0,
  favorite_cat_id INTEGER,
  accepted_guidelines INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS cats (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  photo TEXT,
  thumb TEXT,
  art_seed INTEGER NOT NULL DEFAULT 0,
  coat_color TEXT NOT NULL,
  pattern TEXT NOT NULL,
  eye_color TEXT NOT NULL DEFAULT 'unknown',
  breed TEXT NOT NULL DEFAULT 'Unknown',
  rarity TEXT NOT NULL,
  lat REAL,
  lng REAL,
  region TEXT,
  first_catcher_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  observation_count INTEGER NOT NULL DEFAULT 0,
  hunter_count INTEGER NOT NULL DEFAULT 0,
  favorite_count INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  last_observed_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS observations (
  id INTEGER PRIMARY KEY,
  cat_id INTEGER NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  photo TEXT,
  thumb TEXT,
  art_seed INTEGER NOT NULL DEFAULT 0,
  fingerprint TEXT,
  lat REAL,
  lng REAL,
  region TEXT,
  note TEXT NOT NULL DEFAULT '',
  multi_cat INTEGER NOT NULL DEFAULT 0,
  local_hour INTEGER,
  is_first_catch INTEGER NOT NULL DEFAULT 0,
  match_method TEXT NOT NULL DEFAULT 'new',
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  report_count INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_obs_cat ON observations(cat_id, created_at);
CREATE INDEX IF NOT EXISTS idx_obs_user ON observations(user_id, created_at);

CREATE TABLE IF NOT EXISTS cat_tags (
  cat_id INTEGER NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (cat_id, user_id, tag)
);

CREATE TABLE IF NOT EXISTS favorites (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cat_id INTEGER NOT NULL REFERENCES cats(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, cat_id)
);

CREATE TABLE IF NOT EXISTS follows (
  follower_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL,
  PRIMARY KEY (follower_id, following_id)
);

CREATE TABLE IF NOT EXISTS reactions (
  observation_id INTEGER NOT NULL REFERENCES observations(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (observation_id, user_id, kind)
);

CREATE TABLE IF NOT EXISTS achievements (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  sort INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS user_achievements (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  achievement_id TEXT NOT NULL REFERENCES achievements(id) ON DELETE CASCADE,
  unlocked_at TEXT NOT NULL,
  PRIMARY KEY (user_id, achievement_id)
);

-- Activity feed (discoveries, re-sightings, badges, level ups, hunts)
CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY,
  type TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  cat_id INTEGER REFERENCES cats(id) ON DELETE CASCADE,
  observation_id INTEGER REFERENCES observations(id) ON DELETE CASCADE,
  hunt_id INTEGER REFERENCES hunts(id) ON DELETE CASCADE,
  data TEXT NOT NULL DEFAULT '{}',
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_events_time ON events(created_at);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  actor_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  cat_id INTEGER REFERENCES cats(id) ON DELETE CASCADE,
  hunt_id INTEGER REFERENCES hunts(id) ON DELETE CASCADE,
  text TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, created_at);

CREATE TABLE IF NOT EXISTS hunts (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  creator_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  region TEXT NOT NULL,
  lat REAL,
  lng REAL,
  goal INTEGER NOT NULL DEFAULT 10,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  completed_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hunt_participants (
  hunt_id INTEGER NOT NULL REFERENCES hunts(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TEXT NOT NULL,
  PRIMARY KEY (hunt_id, user_id)
);

-- "Could this be Milo?" answers, kept to improve matching later
CREATE TABLE IF NOT EXISTS match_feedback (
  id INTEGER PRIMARY KEY,
  observation_id INTEGER REFERENCES observations(id) ON DELETE CASCADE,
  candidate_cat_id INTEGER REFERENCES cats(id) ON DELETE CASCADE,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  verdict TEXT NOT NULL,
  score REAL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS reports (
  id INTEGER PRIMARY KEY,
  reporter_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL,
  reason TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (reporter_id, target_type, target_id)
);
