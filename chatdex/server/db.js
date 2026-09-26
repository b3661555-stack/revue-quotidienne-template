import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.js';
import { ACHIEVEMENTS } from './services/achievementDefs.js';

fs.mkdirSync(config.uploadsDir, { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 3000;');
db.exec(fs.readFileSync(path.join(config.root, 'server/schema.sql'), 'utf8'));

// Lightweight migrations for databases created by earlier versions.
const hasColumn = (table, col) => db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === col);
if (!hasColumn('notifications', 'data')) db.exec(`ALTER TABLE notifications ADD COLUMN data TEXT NOT NULL DEFAULT '{}'`);

const upsertAchievement = db.prepare(
  `INSERT INTO achievements (id, name, description, icon, sort) VALUES (?, ?, ?, ?, ?)
   ON CONFLICT(id) DO UPDATE SET name = excluded.name, description = excluded.description, icon = excluded.icon, sort = excluded.sort`
);
ACHIEVEMENTS.forEach((a, i) => upsertAchievement.run(a.id, a.name, a.description, a.icon, i));

const cache = new Map();
const stmt = (sql) => {
  let s = cache.get(sql);
  if (!s) { s = db.prepare(sql); cache.set(sql, s); }
  return s;
};

export const get = (sql, ...params) => stmt(sql).get(...params);
export const all = (sql, ...params) => stmt(sql).all(...params);
export const run = (sql, ...params) => stmt(sql).run(...params);

export function tx(fn) {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

export const nowIso = () => new Date().toISOString();
