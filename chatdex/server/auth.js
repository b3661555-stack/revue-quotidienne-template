import crypto from 'node:crypto';
import { get, run } from './db.js';
import { config } from './config.js';
import { errorBody } from './errors.js';

const SESSION_DAYS = 60;
export const COOKIE = 'chatdex_session';

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${hash}`;
}

export function verifyPassword(password, stored) {
  const [, salt, hash] = String(stored).split(':');
  if (!salt || !hash) return false;
  const candidate = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hash, 'hex');
  return candidate.length === expected.length && crypto.timingSafeEqual(candidate, expected);
}

export function createSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  run('INSERT INTO sessions (token, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)',
    token, userId, new Date(now).toISOString(), new Date(now + SESSION_DAYS * 86400000).toISOString());
  res.setHeader('Set-Cookie', cookieHeader(token, SESSION_DAYS * 86400));
}

export function destroySession(req, res) {
  const token = readCookie(req);
  if (token) run('DELETE FROM sessions WHERE token = ?', token);
  res.setHeader('Set-Cookie', cookieHeader('', 0));
}

function cookieHeader(value, maxAge) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${config.cookieSecure ? '; Secure' : ''}`;
}

function readCookie(req) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}

/** Populates req.user when a valid session cookie is present. */
export function sessionMiddleware(req, _res, next) {
  const token = readCookie(req);
  if (token) {
    const row = get(
      'SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = ? AND s.expires_at > ?',
      token, new Date().toISOString()
    );
    if (row) req.user = row;
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json(errorBody('loginRequired'));
  next();
}
