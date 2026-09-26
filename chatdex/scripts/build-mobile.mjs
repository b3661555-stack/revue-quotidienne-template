// Builds the web app for the iOS/Android shells and copies it into the native projects.
// Usage: CHATDEX_API_URL=https://your-chatdex.onrender.com npm run build:mobile
import { execSync } from 'node:child_process';

const api = (process.env.CHATDEX_API_URL || '').replace(/\/$/, '');
if (!/^https:\/\//.test(api)) {
  console.error('Set CHATDEX_API_URL to your deployed server, e.g. CHATDEX_API_URL=https://chatdex.onrender.com npm run build:mobile');
  process.exit(1);
}
const run = (cmd, env = {}) => execSync(cmd, { stdio: 'inherit', env: { ...process.env, ...env } });
run('npx vite build', { VITE_API_BASE: api });
run('npx cap sync');
console.log(`\nMobile build ready, talking to ${api}. Open with "npm run cap:android" or "npm run cap:ios".`);
