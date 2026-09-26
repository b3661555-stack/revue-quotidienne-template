import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.js';
import { httpError } from '../http.js';

const TYPES = {
  'image/jpeg': { ext: 'jpg', magic: (b) => b[0] === 0xff && b[1] === 0xd8 },
  'image/png': { ext: 'png', magic: (b) => b[0] === 0x89 && b[1] === 0x50 },
  'image/webp': { ext: 'webp', magic: (b) => b.subarray(8, 12).toString() === 'WEBP' },
};
const MAX_BYTES = 6 * 1024 * 1024;

export function deletePhotos(paths) {
  for (const p of paths) {
    const name = path.basename(String(p));
    if (/^[\w-]+\.(jpg|png|webp)$/.test(name)) fs.rmSync(path.join(config.uploadsDir, name), { force: true });
  }
}

/** Stores a base64 data URL photo and returns its public path. Storage is local disk; swap for S3/R2 here. */
export function savePhoto(dataUrl, { required = true } = {}) {
  if (!dataUrl) {
    if (required) throw httpError(400, 'photoRequired');
    return null;
  }
  const m = /^data:(image\/[a-z]+);base64,(.+)$/s.exec(String(dataUrl));
  if (!m || !TYPES[m[1]]) throw httpError(400, 'photoType');
  const buf = Buffer.from(m[2], 'base64');
  if (buf.length < 100) throw httpError(400, 'photoEmpty');
  if (buf.length > MAX_BYTES) throw httpError(413, 'photoTooLarge');
  if (!TYPES[m[1]].magic(buf)) throw httpError(400, 'photoCorrupted');
  const name = `${crypto.randomUUID()}.${TYPES[m[1]].ext}`;
  fs.writeFileSync(path.join(config.uploadsDir, name), buf);
  return `/uploads/${name}`;
}
