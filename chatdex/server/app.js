import express from 'express';
import { config } from './config.js';
import { sessionMiddleware } from './auth.js';
import { api } from './routes/api.js';
import { errorBody } from './errors.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    // CORS for the native apps, which load the UI from capacitor://localhost or https://localhost.
    const origin = req.headers.origin;
    if (origin && config.corsOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      res.setHeader('Access-Control-Max-Age', '86400');
      if (req.method === 'OPTIONS') return res.status(204).end();
    }
    next();
  });
  app.use(express.json({ limit: '15mb' }));
  app.use(sessionMiddleware);
  app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d', immutable: true, fallthrough: false }));
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use('/api', api);
  return app;
}

/** JSON error handler; mounted last so the SPA middleware can come first. */
export function errorHandler(err, req, res, _next) {
  if (err?.type === 'entity.too.large') return res.status(413).json(errorBody('uploadTooLarge'));
  if (err?.type === 'entity.parse.failed') return res.status(400).json(errorBody('malformed'));
  const status = err.status || err.statusCode || 500;
  if (status >= 500) console.error(err);
  if (req.path.startsWith('/uploads/') && status === 404) return res.status(404).end();
  if (status >= 500 && !err.expose) return res.status(status).json(errorBody('server'));
  res.status(status).json(err.code ? errorBody(err.code, err.params) : { error: err.message });
}
