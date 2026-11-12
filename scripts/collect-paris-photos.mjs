import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { searchPlaces, geo, normalize } from '../server/places.js';
import { preferences } from '../server/validation.js';
import { findPhoto, warmPhotoMetadata, destinations } from '../server/photos.js';
import { isParisPhotoPlace, photoIdentity } from '../public/js/photo-scope.js';

// Explicit maintenance job: collect all current bounded Paris discovery results
// plus major attractions omitted by proximity ordering. No image searches outside
// Paris, no account, no new credentials, and no provider keys in the artifact.
const input = process.argv.find((a) => a.startsWith('--input='))?.slice(8);
const places = input
  ? JSON.parse(await readFile(input, 'utf8'))
  : (
      await searchPlaces(
        { lat: 48.8566, lon: 2.3522 },
        preferences({ mode: 'tourist', radius: 10000 })
      )
    ).places;
for (const query of [
  'Musee d Orsay',
  'Sainte-Chapelle',
  'Cathedrale Notre-Dame de Paris',
  'Sacre-Coeur',
  'Jardin du Luxembourg',
  'Jardin des Tuileries',
  'Palais Royal',
  'Palais Garnier',
  'Pantheon',
  'Hotel des Invalides',
  'Musee Rodin',
  'Musee Carnavalet',
  'Musee de l Orangerie',
  'Cimetiere du Pere-Lachaise',
  'Parc des Buttes-Chaumont',
  'Parc Monceau',
  'Moulin Rouge',
  'Cafe de Flore',
  'Les Deux Magots',
  'Le Procope',
  'Shakespeare and Company',
  'La Maison Rose',
  'Le Train Bleu'
]) {
  try {
    const data = await geo('/v1/geocode/search', {
      text: `${query}, Paris, France`,
      type: 'amenity',
      format: 'geojson',
      limit: '1',
      lang: 'en'
    });
    if (data.features?.[0]) places.push(normalize(data.features[0]));
  } catch {
    console.log(`Place lookup unavailable: ${query}`);
  }
}
places.push(destinations.Paris);
const scoped = [
  ...new Map(places.filter(isParisPhotoPlace).map((p) => [photoIdentity(p), p])).values()
];
console.log(`Paris records to check: ${scoped.length}`);
try {
  await warmPhotoMetadata(scoped);
} catch {
  console.log('Batch metadata unavailable; individual lookups will use normal safeguards.');
}
const catalog = { version: 2, generatedAt: new Date().toISOString(), photos: [] },
  missing = [];
for (const [index, place] of scoped.entries()) {
  const photo = await findPhoto(place, { refresh: true });
  const { signature, retrievedAt, ...publicPlace } = place;
  if (photo) catalog.photos.push({ place: publicPlace, photo });
  else
    missing.push({
      name: place.name,
      address: place.address,
      lat: place.lat,
      lon: place.lon,
      category: place.category
    });
  console.log(
    `${index + 1}/${scoped.length} ${photo ? 'PHOTO' : 'PLACEHOLDER'} ${place.name}${photo ? ` - ${photo.title}` : ''}`
  );
}
// Keep previous verified successes if a refresh encounters provider outages.
const previous = JSON.parse(
  await readFile(new URL('../server/data/paris-photos.json', import.meta.url), 'utf8')
);
const safePrevious = (previous.version === 2 ? previous.photos : []).filter(
  (entry) =>
    !/\b(redevelopment|construction)\b/i.test(entry.photo.title) &&
    (entry.photo.match !== 'Commons name, numbered address and coordinates' ||
      entry.photo.title.toLowerCase().includes(entry.place.name.toLowerCase()))
);
const entries = new Map(safePrevious.map((entry) => [photoIdentity(entry.place), entry]));
for (const entry of catalog.photos) entries.set(photoIdentity(entry.place), entry);
catalog.photos = [...entries.values()];
await writeFile(
  new URL('../server/data/paris-photos.json', import.meta.url),
  JSON.stringify(catalog, null, 2) + '\n'
);
await mkdir(new URL('../.impeccable/review/', import.meta.url), { recursive: true });
await writeFile(
  new URL('../.impeccable/review/paris-photo-coverage.json', import.meta.url),
  JSON.stringify(
    {
      checkedAt: catalog.generatedAt,
      checked: scoped.length,
      matched: scoped.length - missing.length,
      missing
    },
    null,
    2
  ) + '\n'
);
await writeFile(
  new URL('../docs/paris-photo-coverage.json', import.meta.url),
  JSON.stringify(
    {
      checkedAt: catalog.generatedAt,
      checked: scoped.length,
      matched: scoped.length - missing.length,
      missing
    },
    null,
    2
  ) + '\n'
);
console.log(
  `Finished: ${scoped.length - missing.length}/${scoped.length} records matched; ${missing.length} placeholders retained.`
);
