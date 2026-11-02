import { cp, mkdir } from 'node:fs/promises';

// Keep Leaflet local rather than depending on a third-party script CDN.
const source = new URL('../node_modules/leaflet/dist/', import.meta.url);
const target = new URL('../public/vendor/leaflet/', import.meta.url);
await mkdir(target, { recursive: true });
for (const name of ['leaflet.js', 'leaflet.css', 'images']) {
  await cp(new URL(name, source), new URL(name, target), { recursive: true });
}
await cp(new URL('../node_modules/leaflet/LICENSE', import.meta.url), new URL('LICENSE', target));
console.log('Leaflet browser assets prepared in public/vendor/leaflet.');
