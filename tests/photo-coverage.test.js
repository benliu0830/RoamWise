import test from 'node:test';
import assert from 'node:assert/strict';
import {
  findPhoto,
  warmPhotoMetadata,
  matchesEntity,
  matchesBusinessPhoto,
  licensedPhoto,
  matchesAddress
} from '../server/photos.js';

const claim = (value) => ({ mainsnak: { datavalue: { value } } });
const place = (name, id) => ({
  id,
  name,
  lat: 45.4215,
  lon: -75.6972,
  city: 'Ottawa',
  state: 'Ontario',
  country: 'Canada',
  category: 'landmarks'
});
const entity = (p, id, file) => ({
  id,
  labels: { en: { value: p.name } },
  claims: {
    P625: [claim({ latitude: p.lat, longitude: p.lon })],
    ...(file ? { P18: [claim(file)] } : {})
  }
});
const page = (title) => ({
  title: `File:${title}`,
  imageinfo: [
    {
      mime: 'image/jpeg',
      width: 2000,
      height: 1200,
      thumburl: 'https://thumb.wikimedia.org/example.jpg',
      descriptionurl: `https://commons.wikimedia.org/wiki/File:${encodeURIComponent(title)}`,
      extmetadata: {
        Artist: { value: 'Fixture Photographer' },
        LicenseShortName: { value: 'CC BY-SA 4.0' },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' }
      }
    }
  ]
});

test('catalog refresh batches entity and image metadata instead of one request per place', async () => {
  const original = fetch,
    calls = [];
  const a = { ...place('Fixture Museum Alpha', 'batch-a'), wikidata: 'Q97000001' },
    b = { ...place('Fixture Museum Beta', 'batch-b'), wikidata: 'Q97000002' };
  global.fetch = async (url) => {
    const u = new URL(url);
    calls.push(u);
    return u.searchParams.get('action') === 'wbgetentities'
      ? Response.json({
          entities: {
            [a.wikidata]: entity(a, a.wikidata, 'Fixture Museum Alpha.jpg'),
            [b.wikidata]: entity(b, b.wikidata, 'Fixture Museum Beta.jpg')
          }
        })
      : Response.json({
          query: { pages: [page('Fixture Museum Alpha.jpg'), page('Fixture Museum Beta.jpg')] }
        });
  };
  try {
    await warmPhotoMetadata([a, b, { ...a, city: 'Toronto' }]);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].searchParams.get('ids').split('|').length, 2);
    assert.equal((await findPhoto(a)).entityId, a.wikidata);
    assert.equal((await findPhoto(b)).entityId, b.wikidata);
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = original;
  }
});

test('exact Commons categories recover a place photo while rejecting people and views from it', async () => {
  const original = fetch,
    p = { ...place('Fixture Park', 'category-fixture'), wikidata: 'Q97000003', category: 'nature' };
  global.fetch = async (url) => {
    const u = new URL(url);
    if (u.searchParams.get('action') === 'wbgetentities')
      return Response.json({
        entities: {
          [p.wikidata]: {
            ...entity(p, p.wikidata, 'Landmark seen from Fixture Park.jpg'),
            claims: {
              ...entity(p, p.wikidata, 'Landmark seen from Fixture Park.jpg').claims,
              P373: [claim('Fixture Park')]
            }
          }
        }
      });
    if (u.searchParams.get('generator') === 'categorymembers')
      return Response.json({
        query: { pages: [page('Person at Fixture Park.jpg'), page('Fixture Park.jpg')] }
      });
    return Response.json({ query: { pages: [page('Landmark seen from Fixture Park.jpg')] } });
  };
  try {
    const photo = await findPhoto(p);
    assert.equal(photo.title, 'Fixture Park.jpg');
    assert.equal(photo.match, 'verified entity Commons category');
  } finally {
    global.fetch = original;
  }
});

test('a provider article supplies an alternative official name but cannot overcome wrong coordinates', () => {
  const p = {
    ...place('Museum Alternate Name', 'alias-fixture'),
    wikipedia: 'en:Fixture Official Museum'
  };
  const e = entity({ ...p, name: 'Fixture Official Museum' }, 'Q97000004');
  assert(matchesEntity(p, e, true));
  assert(!matchesEntity(p, e, false));
  assert(!matchesEntity({ ...p, lat: 45.5 }, e, true));
});

test('Commons branch photos require explicit name, numbered address and nearby camera coordinates', () => {
  const p = {
    ...place('Fixture Coffee', 'branch-fixture'),
    category: 'cafes',
    address: '406 March Road, Ottawa, ON, Canada'
  };
  const file = page('Fixture Coffee 406 March Road Ottawa.jpg');
  file.imageinfo[0].extmetadata.GPSLatitude = { value: String(p.lat) };
  file.imageinfo[0].extmetadata.GPSLongitude = { value: String(p.lon) };
  assert(matchesBusinessPhoto(p, file));
  assert(!matchesBusinessPhoto({ ...p, address: '404 March Road, Ottawa, ON, Canada' }, file));
  assert(!matchesBusinessPhoto({ ...p, lat: p.lat + 0.01 }, file));
  delete file.imageinfo[0].extmetadata.GPSLatitude;
  assert(!matchesBusinessPhoto(p, file));
  const portrait = page('Person at the Fixture Museum.jpg');
  assert.equal(
    licensedPhoto(portrait, 'Q97000001', 'test', { ...p, name: 'Fixture Museum' }),
    null
  );
  const wrongCity = page('Fixture Coffee.jpg');
  wrongCity.imageinfo[0].extmetadata.GPSLatitude = { value: '51.5' };
  wrongCity.imageinfo[0].extmetadata.GPSLongitude = { value: '-0.1' };
  assert.equal(licensedPhoto(wrongCity, 'Q97000001', 'test', p), null);
  const unrelated = page('Sculpture at a plaza.jpg');
  unrelated.imageinfo[0].extmetadata.ImageDescription = {
    value: 'Fixture Coffee, 406 March Road, Ottawa'
  };
  unrelated.imageinfo[0].extmetadata.GPSLatitude = { value: String(p.lat) };
  unrelated.imageinfo[0].extmetadata.GPSLongitude = { value: String(p.lon) };
  assert(
    !matchesBusinessPhoto(p, unrelated),
    'An object at an address does not establish a photo of the business'
  );
});

test('road abbreviations, museum naming and shopping-centre identity do not block exact locations', () => {
  const p = {
    ...place('Fixture Aviation Museum', 'abbreviation'),
    street: 'Aviation Parkway',
    houseNumber: '11',
    address: '11 Aviation Parkway, Ottawa, ON, Canada'
  };
  assert(
    matchesAddress(p, {
      claims: { P6375: [claim({ text: '11 Aviation Pkwy, Ottawa, ON', language: 'en' })] }
    })
  );
  const mall = {
    ...place('Fixture Shopping Centre', 'mall'),
    category: 'shopping',
    categories: ['commercial.shopping_mall']
  };
  assert(matchesEntity(mall, entity(mall, 'Q97000005'), true));
  assert(!matchesEntity({ ...mall, category: 'cafes' }, entity(mall, 'Q97000005'), true));
  const pd = page('Fixture park.jpg');
  pd.imageinfo[0].extmetadata.LicenseShortName.value = 'CC BY-SA 2.5';
  pd.imageinfo[0].extmetadata.LicenseUrl.value = 'https://creativecommons.org/licenses/by-sa/2.5/';
  assert.equal(licensedPhoto(pd, 'Q97000005', 'test').license, 'CC BY-SA 2.5');
});
