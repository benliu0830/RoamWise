import express from 'express';
import { fileURLToPath } from 'node:url';
import health from '../api/health.js';
import geocode from '../api/geocode.js';
import search from '../api/search.js';
import personalize from '../api/personalize.js';
import details from '../api/details.js';
import plan from '../api/plan.js';
import route from '../api/route.js';
import migrate from '../api/migrate.js';
import photo from '../api/photo.js';

const app = express();
const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
const port = Number(process.env.PORT || 3000);

app.disable('x-powered-by');
app.use(express.json({ limit: '256kb' }));
app.use((_request, response, next) => {
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.setHeader('Permissions-Policy', 'geolocation=(self)');
  next();
});
app.all('/api/health', health);
for (const [name, handler] of Object.entries({
  photo,
  geocode,
  search,
  personalize,
  details,
  plan,
  route,
  migrate
}))
  app.all(`/api/${name}`, handler);

// Serve ONLY public/. The repository root and .env.local are never web roots.
app.use(express.static(publicDirectory, { dotfiles: 'deny' }));
app.get('/', (_request, response) => {
  response
    .type('text')
    .send(
      'Roamwise setup is ready. Application development resumes after API key setup. Health check: /api/health'
    );
});
app.use((_request, response) => response.status(404).json({ error: 'Not found.' }));
app.use((error, _request, response, _next) => {
  const status = error.type === 'entity.too.large' ? 413 : error.status === 400 ? 400 : 500;
  response.status(status).json({
    error:
      status === 400
        ? 'Invalid JSON request.'
        : status === 413
          ? 'Request too large.'
          : 'The server could not complete this request.'
  });
});

// Bind locally by default. Use Vercel for a publicly accessible deployment.
app.listen(port, '127.0.0.1', () => {
  console.log(`Roamwise development server: http://localhost:${port}`);
});
