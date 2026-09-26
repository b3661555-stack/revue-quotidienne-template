export const httpError = (status, message) => Object.assign(new Error(message), { status, expose: true });

export function str(value, { field, min = 0, max = 200, required = false } = {}) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!s && required) throw httpError(400, `${field} is required.`);
  if (s && s.length < min) throw httpError(400, `${field} must be at least ${min} characters.`);
  if (s.length > max) throw httpError(400, `${field} must be at most ${max} characters.`);
  return s;
}

export function num(value) {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value !== '' ? Number(value) : NaN;
  return Number.isFinite(n) ? n : null;
}

export const intParam = (v) => {
  const n = Number.parseInt(v, 10);
  if (!Number.isFinite(n) || n <= 0) throw httpError(404, 'Not found.');
  return n;
};
