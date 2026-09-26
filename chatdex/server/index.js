import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { config } from './config.js';
import { createApp, errorHandler } from './app.js';
import { get } from './db.js';
import { refreshDemoHunt, seedDemo } from './seed.js';

if (config.demoData && !get('SELECT 1 FROM users WHERE is_demo = 1 LIMIT 1')) {
  console.log('🐾 Seeding demo world...');
  seedDemo();
}
if (config.demoData) refreshDemoHunt();

const app = createApp();
const httpServer = http.createServer(app);

if (config.production) {
  const dist = path.join(config.root, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) {
    console.error('No build found. Run "npm run build" first.');
    process.exit(1);
  }
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get(/^(?!\/api\/|\/uploads\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
} else {
  const { createServer } = await import('vite');
  const vite = await createServer({ root: config.root, server: { middlewareMode: true, hmr: { server: httpServer } }, appType: 'spa' });
  app.use(vite.middlewares);
}
app.use(errorHandler);

httpServer.listen(config.port, config.host, () => {
  console.log(`\n  🐱 Chatdex running at http://localhost:${config.port}  (${config.production ? 'production' : 'dev'})\n`);
});
