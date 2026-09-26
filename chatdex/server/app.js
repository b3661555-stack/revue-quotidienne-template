import express from 'express';
import { config } from './config.js';
import { sessionMiddleware } from './auth.js';
import { api } from './routes/api.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '15mb' }));
  app.use(sessionMiddleware);
  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d', immutable: true, fallthrough: false }));
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use('/api', api);
  return app;
}

/** JSON error handler; mounted last so the SPA middleware can come first. */
export function errorHandler(err, req, res, _next) {
  if (err?.type === 'entity.too.large') return res.status(413).json({ error: 'This upload is too large.' });
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Malformed request.' });
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  if (req.path.startsWith('/uploads/') && status === 404) return res.status(404).end();
  res.status(status).json({ error: status >= 500 && !err.expose ? 'Something went wrong on our side. Please try again.' : err.message });
}
