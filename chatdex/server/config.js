import path from 'node:path';
import { fileURLToPath } from 'node:url';

try { process.loadEnvFile(); } catch { /* .env is optional */ }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bool = (v, d) => (v === undefined ? d : ['1', 'true', 'yes', 'on'].includes(String(v).toLowerCase()));

export const config = {
  root,
  port: Number(process.env.PORT || 3000),
  host: process.env.HOST || '0.0.0.0',
  production: process.env.NODE_ENV === 'production',
  dataDir: path.resolve(root, process.env.DATA_DIR || './data'),
  demoData: bool(process.env.DEMO_DATA, true),
  catDetector: process.env.CAT_DETECTOR || 'coco-ssd',
  missingAfterDays: Number(process.env.MISSING_AFTER_DAYS || 30),
  cookieSecure: bool(process.env.COOKIE_SECURE, false),
};
config.uploadsDir = path.join(config.dataDir, 'uploads');
config.dbPath = process.env.DB_PATH || path.join(config.dataDir, 'chatdex.db');
