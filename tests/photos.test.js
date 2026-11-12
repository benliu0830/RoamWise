import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesEntity, licensedPhoto, findPhoto } from '../server/photos.js';
import photoEndpoint from '../api/photo.js';

const claim = (value) => ({ mainsnak: { datavalue: { value } } });
const place = {
  id: 'hill',
  city: 'Ottawa',
  state: 'Ontario',
  country: 'Canada',
  name: 'Parliament Hill',
  category: 'landmarks',
  lat: 45.4248,
  lon: -75.699
};
const entity = {
  id: 'Q1589289',
  labels: { en: { value: 'Parliament Hill' } },
  claims: { P625: [claim({ latitude: place.lat, longitude: place.lon })] }
};
const page = () => ({
  title: 'File:Parliament Hill.jpg',
  imageinfo: [
    {
      mime: 'image/jpeg',
      width: 2000,
      height: 1200,
      thumburl: 'https://thumb.wikimedia.org/wikipedia/commons/example.jpg',
      descriptionurl: 'https://commons.wikimedia.org/wiki/File:Parliament_Hill.jpg',
      extmetadata: {
        Artist: { value: '<a href="evil">Photographer</a>' },
        LicenseShortName: { value: 'CC BY-SA 4.0' },
        LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' },
        Credit: { value: 'Original work' },
        Copyright: { value: 'Copyright Photographer' },
        AttributionRequired: { value: 'true' }
      }
    }
  ]
});

test('identity requires name and coordinates; nearby places and other branches fail closed', () => {
  assert(matchesEntity(place, entity));
  assert(!matchesEntity({ ...place, name: 'Other tower' }, entity));
  assert(!matchesEntity({ ...place, lat: 45 }, entity, true));
  assert(!matchesEntity(place, { ...entity, claims: {} }, true));
  const branch = {
    ...place,
    name: 'Tim Hortons',
    category: 'cafes',
    brandId: 'Qbrand',
    address: '406 March Road, Ottawa, ON, Canada'
  };
  const restaurant = {
    ...entity,
    labels: { en: { value: 'Tim Hortons' } },
    claims: { ...entity.claims, P6375: [claim({ text: '406 March Road', language: 'en' })] }
  };
  assert(matchesEntity(branch, restaurant, true));
  assert(!matchesEntity(branch, { ...restaurant, id: 'Qbrand' }, true));
  assert(!matchesEntity({ ...branch, lat: branch.lat + 0.002 }, restaurant, true));
  assert(
    !matchesEntity(
      branch,
      { ...restaurant, claims: { ...restaurant.claims, P159: [claim('headquarters')] } },
      true
    )
  );
});

test('photos retain creator, license, credit, copyright and source; unsafe and unsuitable files are rejected', () => {
  const photo = licensedPhoto(page(), 'Q1589289', 'test');
  assert.equal(photo.creator, 'Photographer');
  assert.equal(photo.license, 'CC BY-SA 4.0');
  assert.equal(photo.copyright, 'Copyright Photographer');
  assert.equal(photo.credit, 'Original work');
  assert(photo.sourceUrl.startsWith('https://commons.wikimedia.org/'));
  const viewpoint = page();
  viewpoint.title = "File:Ottawa Chateau Laurier seen from Major's Hill Park.jpg";
  assert.equal(licensedPhoto(viewpoint, 'Q3363862', 'test', { name: "Major's Hill Park" }), null);
  const pd = page();
  pd.imageinfo[0].extmetadata.LicenseShortName.value = 'Public domain';
  delete pd.imageinfo[0].extmetadata.LicenseUrl;
  pd.imageinfo[0].extmetadata.Copyrighted = { value: 'False' };
  pd.imageinfo[0].extmetadata.License = { value: 'pd' };
  assert.equal(
    licensedPhoto(pd, 'Q1589289', 'test').licenseUrl,
    `${pd.imageinfo[0].descriptionurl}#Licensing`
  );
  pd.imageinfo[0].extmetadata.Copyrighted.value = 'True';
  assert.equal(licensedPhoto(pd, 'Q1589289', 'test'), null);
  for (const mutate of [
    (p) => {
      p.title = 'File:Parliament Hill map.jpg';
    },
    (p) => {
      p.imageinfo[0].mime = 'image/svg+xml';
    },
    (p) => {
      p.imageinfo[0].width = 200;
    },
    (p) => {
      p.imageinfo[0].extmetadata.LicenseShortName.value = 'All rights reserved';
    },
    (p) => {
      p.imageinfo[0].extmetadata.Restrictions = { value: 'Permission required' };
    },
    (p) => {
      p.imageinfo[0].extmetadata.Artist.value = '';
    },
    (p) => {
      p.imageinfo[0].thumburl = 'https://evil.example/photo.jpg';
    }
  ]) {
    const p = page();
    mutate(p);
    assert.equal(licensedPhoto(p, 'Q1589289', 'test'), null);
  }
});

test('resolver prefers normalized P18 files, deduplicates concurrent lookups and caches success', async () => {
  const original = global.fetch,
    calls = [];
  global.fetch = async (url, options) => {
    calls.push(new URL(url));
    assert(options.headers['User-Agent'].includes('Roamwise'));
    if (calls.at(-1).searchParams.get('action') === 'wbgetentities')
      return Response.json({
        entities: {
          Q1589289: { ...entity, claims: { ...entity.claims, P18: [claim('Parliament_Hill.jpg')] } }
        }
      });
    return Response.json({
      query: {
        normalized: [{ from: 'File:Parliament_Hill.jpg', to: 'File:Parliament Hill.jpg' }],
        pages: [page()]
      }
    });
  };
  try {
    const p = { ...place, wikidata: 'Q1589289' };
    const [a, b] = await Promise.all([findPhoto(p), findPhoto(p)]);
    assert.equal(a?.entityId, 'Q1589289');
    assert.deepEqual(a, b);
    assert.deepEqual(await findPhoto(p), a);
    assert.equal(calls.length, 2);
  } finally {
    global.fetch = original;
  }
});

test('businesses without branch identity never search for chain or nearby imagery', async () => {
  const original = global.fetch;
  global.fetch = () => {
    throw new Error('A branch without identity must not make an upstream request');
  };
  try {
    assert.equal(
      await findPhoto({
        name: 'Tim Hortons',
        category: 'cafes',
        address: 'March Road, Kanata',
        lat: 45.33,
        lon: -75.93
      }),
      null
    );
    assert.equal(
      await findPhoto({ name: 'No-photo restaurant', category: 'food', lat: 45.33, lon: -75.93 }),
      null
    );
  } finally {
    global.fetch = original;
  }
});

test('photo endpoint rejects unsigned places and unknown destinations', async () => {
  for (const body of [{ place }, { destination: '__proto__' }, { destination: 'Unknown city' }]) {
    const response = {
      status(code) {
        this.code = code;
        return this;
      },
      setHeader() {},
      json(data) {
        this.data = data;
        return this;
      }
    };
    await photoEndpoint({ method: 'POST', body, headers: {}, url: '/api/photo' }, response);
    assert.equal(response.code, 400);
  }
});

test('Wikimedia rate limits activate a cooldown and errors remain safe placeholders', async () => {
  const original = global.fetch;
  let count = 0;
  global.fetch = async () => {
    count++;
    return Response.json(
      { error: 'rate limited' },
      { status: 429, headers: { 'Retry-After': '120' } }
    );
  };
  try {
    const p = { ...place, id: 'rate-test', wikidata: 'Q99999999' };
    assert.equal(await findPhoto(p), null);
    assert.equal(await findPhoto(p), null);
    assert.equal(await findPhoto({ ...p, wikidata: 'Q99999998' }), null);
    assert.equal(count, 1, 'Repeated and unrelated lookups respect the provider cooldown');
  } finally {
    global.fetch = original;
  }
});
