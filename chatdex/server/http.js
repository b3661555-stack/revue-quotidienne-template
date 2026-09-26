import { format } from './errors.js';

/** Throws an API error identified by a code from errors.js (translated client-side). */
export const httpError = (status, code, params) =>
  Object.assign(new Error(format(code, params)), { status, code, params, expose: true });

export function str(value, { field, min = 0, max = 200, required = false } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s && required) throw httpError(400, 'fieldRequired', { field });
  if (s && s.length < min) throw httpError(400, 'fieldTooShort', { field, min });
  if (s.length > max) throw httpError(400, 'fieldTooLong', { field, max });
  return s;
}

export function num(value) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export const intParam = (v) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) throw httpError(404, 'notFound');
  return n;
};
