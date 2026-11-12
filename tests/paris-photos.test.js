import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isParisPhotoPlace,
  isOttawaPhotoPlace,
  isSupportedPhotoPlace,
  photoCity
} from '../public/js/photo-scope.js';
import { matchesAddress, matchesEntity, findPhoto } from '../server/photos.js';

const p = {
  id: 'paris-fixture',
  name: 'Fixture Paris Museum',
  category: 'museums',
  city: 'Paris',
  state: 'Ile-de-France',
  country: 'France',
  countryCode: 'fr',
  lat: 48.8566,
  lon: 2.3522,
  address: '3 Avenue Fixture, 75001 Paris, France'
};
const claim = (value) => ({ mainsnak: { datavalue: { value } } });
test('Paris coverage requires French administrative evidence and Paris coordinates', () => {
  assert(isParisPhotoPlace(p));
  assert(isSupportedPhotoPlace(p));
  assert(!isOttawaPhotoPlace(p));
  assert.equal(photoCity(p), 'Paris');
  assert(
    isParisPhotoPlace({ ...p, city: undefined, address: '3 Avenue Fixture, 75001 Paris, France' })
  );
  for (const change of [
    { country: 'Canada' },
    { countryCode: 'ca' },
    { state: 'Ontario' },
    { city: 'Versailles' },
    { lat: 33.66, lon: -95.55 },
    { lat: 48.804, lon: 2.12 }
  ])
    assert(!isParisPhotoPlace({ ...p, ...change }));
});
test('French numbered addresses normalize commas while preserving the branch number', () => {
  const business = { ...p, category: 'cafes', street: 'Avenue Fixture', houseNumber: '3' };
  const e = {
    id: 'Q97000011',
    labels: { fr: { value: p.name } },
    claims: {
      P625: [claim({ latitude: p.lat, longitude: p.lon })],
      P6375: [claim({ text: '3, avenue Fixture, 75001 Paris', language: 'fr' })]
    }
  };
  assert(matchesAddress(business, e));
  assert(
    matchesAddress(business, {
      claims: { P6375: [claim({ text: '3, avenue Fixture 75001 Paris', language: 'fr' })] }
    })
  );
  assert(matchesEntity(business, e, true));
  assert(!matchesAddress({ ...business, houseNumber: '5' }, e));
});

test('garden singular/plural translation does not prevent an otherwise exact attraction match', () => {
  const place = { ...p, name: 'Luxembourg Garden', address: null };
  const e = {
    id: 'Q97000013',
    labels: { en: { value: 'Luxembourg Gardens' } },
    claims: { P625: [claim({ latitude: p.lat, longitude: p.lon })] }
  };
  assert(matchesEntity(place, e));
  assert(!matchesEntity({ ...place, name: 'Other Garden' }, e));
});

test('a landmark renamed square and number-last address preserve its exact street number', () => {
  const place = {
    ...p,
    name: 'Notre-Dame',
    street: 'Parvis Notre-Dame - Place Jean-Paul II',
    houseNumber: '6'
  };
  const e = {
    claims: { P6375: [claim({ text: 'Place du Parvis de Notre-Dame 6', language: 'fr' })] }
  };
  assert(matchesAddress(place, e));
  assert(!matchesAddress({ ...place, houseNumber: '8' }, e));
});
test('Paris live resolver accepts an exact French entity and retains licensing', async () => {
  const original = fetch;
  const e = {
    id: 'Q97000012',
    labels: { en: { value: p.name } },
    claims: {
      P625: [claim({ latitude: p.lat, longitude: p.lon })],
      P18: [claim('Fixture Paris Museum.jpg')]
    }
  };
  let calls = 0;
  global.fetch = async (url) => {
    calls++;
    if (new URL(url).searchParams.get('action') === 'wbgetentities')
      return Response.json({ entities: { [e.id]: e } });
    return Response.json({
      query: {
        pages: [
          {
            title: 'File:Fixture Paris Museum.jpg',
            imageinfo: [
              {
                mime: 'image/jpeg',
                width: 1800,
                height: 1200,
                thumburl: 'https://thumb.wikimedia.org/paris.jpg',
                descriptionurl: 'https://commons.wikimedia.org/wiki/File:Fixture_Paris_Museum.jpg',
                extmetadata: {
                  Artist: { value: 'Paris fixture photographer' },
                  LicenseShortName: { value: 'CC BY-SA 4.0' },
                  LicenseUrl: { value: 'https://creativecommons.org/licenses/by-sa/4.0/' }
                }
              }
            ]
          }
        ]
      }
    });
  };
  try {
    const photo = await findPhoto({ ...p, wikidata: e.id });
    assert.equal(photo.entityId, e.id);
    assert.equal(photo.creator, 'Paris fixture photographer');
    assert.equal(calls, 2);
  } finally {
    global.fetch = original;
  }
});

test('incomplete geocoding is enriched before Wikimedia lookup without inventing a place', async () => {
  const original = fetch,
    key = process.env.GEOAPIFY_API_KEY,
    calls = [];
  process.env.GEOAPIFY_API_KEY = 'photo-enrichment-fixture-key';
  const id = 'Q97000014',
    name = 'Musée Fixture Paris';
  global.fetch = async (url) => {
    const u = new URL(url);
    calls.push(u.hostname);
    if (u.hostname === 'api.geoapify.com')
      return Response.json({
        features: [
          {
            properties: {
              feature_type: 'details',
              name,
              lat: p.lat,
              lon: p.lon,
              city: 'Paris',
              state: 'Ile-de-France',
              country: 'France',
              country_code: 'fr',
              categories: ['entertainment.museum'],
              wiki_and_media: { wikidata: id },
              datasource: { raw: { name } }
            }
          }
        ]
      });
    if (u.searchParams.get('action') === 'wbgetentities')
      return Response.json({
        entities: {
          [id]: {
            id,
            labels: { fr: { value: name } },
            claims: {
              P625: [claim({ latitude: p.lat, longitude: p.lon })],
              P18: [claim('Paris enriched fixture.jpg')]
            }
          }
        }
      });
    return Response.json({
      query: {
        pages: [
          {
            title: 'File:Paris enriched fixture.jpg',
            imageinfo: [
              {
                mime: 'image/jpeg',
                width: 1800,
                height: 1200,
                thumburl: 'https://thumb.wikimedia.org/enriched.jpg',
                descriptionurl:
                  'https://commons.wikimedia.org/wiki/File:Paris_enriched_fixture.jpg',
                extmetadata: {
                  Artist: { value: 'Fixture photographer' },
                  LicenseShortName: { value: 'CC BY 4.0' },
                  LicenseUrl: { value: 'https://creativecommons.org/licenses/by/4.0/' }
                }
              }
            ]
          }
        ]
      }
    });
  };
  try {
    const photo = await findPhoto({ ...p, id: 'enrichment-fixture', photoNeedsDetails: true });
    assert.equal(photo?.entityId, id);
    assert.equal(calls[0], 'api.geoapify.com');
    assert.equal(calls.length, 3);
  } finally {
    global.fetch = original;
    if (key === undefined) delete process.env.GEOAPIFY_API_KEY;
    else process.env.GEOAPIFY_API_KEY = key;
  }
});
