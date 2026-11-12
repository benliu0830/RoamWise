import { distanceKm, nameKey } from '../public/js/place-utils.js';
import { isSupportedPhotoPlace, photoCity, photoIdentity } from '../public/js/photo-scope.js';
import catalog from './data/ottawa-photos.json' with { type: 'json' };
import parisCatalog from './data/paris-photos.json' with { type: 'json' };
import { placeDetails } from './places.js';

const endpoints = {
  commons: 'https://commons.wikimedia.org/w/api.php',
  wikidata: 'https://www.wikidata.org/w/api.php'
};
// Visual QA identified this as a close-up of a plaque, not the museum building.
const rejectedPhotoFiles = new Set(['File:Billings Estate, Ottawa (20170819 100819).jpg']);
export const destinations = {
  Paris: {
    name: 'Paris',
    city: 'Paris',
    state: 'Île-de-France',
    country: 'France',
    countryCode: 'fr',
    wikidata: 'Q90',
    lat: 48.8566,
    lon: 2.3522,
    category: 'landmarks',
    cityPhoto: true
  },
  Ottawa: {
    name: 'Ottawa',
    city: 'Ottawa',
    state: 'Ontario',
    country: 'Canada',
    wikidata: 'Q1930',
    lat: 45.4208,
    lon: -75.69,
    category: 'landmarks',
    cityPhoto: true
  }
};
const value = (claim) => claim?.mainsnak?.datavalue?.value;
const claims = (entity, key) =>
  (entity?.claims?.[key] || [])
    .filter((c) => c.rank !== 'deprecated')
    .sort((a, b) => Number(b.rank === 'preferred') - Number(a.rank === 'preferred'))
    .map(value);
const plain = (html) =>
  String(html || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|nbsp);/gi, (full, code) => {
      if (!code.startsWith('#'))
        return (
          { amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' }[code.toLowerCase()] ||
          full
        );
      const n = code.toLowerCase().startsWith('#x')
        ? parseInt(code.slice(2), 16)
        : Number(code.slice(1));
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : '';
    })
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
function attributionLinks(meta) {
  const links = [];
  for (const key of ['Artist', 'Credit', 'Attribution', 'Copyright']) {
    for (const match of String(meta[key]?.value || '').matchAll(
      /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi
    )) {
      try {
        const url = new URL(plain(match[1]), 'https://commons.wikimedia.org');
        if (url.protocol === 'https:' && !url.username && !url.password)
          links.push({ label: plain(match[2]) || 'Attribution source', url: url.href });
      } catch {
        /* Ignore malformed links, retain their readable credit. */
      }
    }
  }
  return links.slice(0, 20);
}
const qid = (id) => /^Q[1-9]\d*$/.test(id || '');
const business = (p) =>
  ['food', 'cafes'].includes(p.category) ||
  Boolean(p.brand || p.brandId) ||
  (p.category === 'shopping' &&
    !p.categories?.some((c) => ['commercial.shopping_mall', 'commercial.marketplace'].includes(c)));

// A process-local queue also bounds requests made by simultaneous photo lookups.
let tail = Promise.resolve(),
  cooldown = 0;
const metadata = new Map(),
  pending = new Map(),
  results = new Map();
const entityCache = new Map(),
  imageCache = new Map();
const catalogByPlace = new Map(
  [catalog, parisCatalog]
    .flatMap((c) => (c.version === 2 ? c.photos : []))
    .map((entry) => [photoIdentity(entry.place), entry.photo])
);
async function request(host, params) {
  const key = host + JSON.stringify(params);
  if (metadata.get(key)?.until > Date.now()) return metadata.get(key).data;
  if (pending.has(key)) return pending.get(key);
  const job = tail.then(async () => {
    if (Date.now() < cooldown) throw new Error('Wikimedia is cooling down');
    const url = new URL(endpoints[host] || host);
    url.search = new URLSearchParams({
      format: 'json',
      formatversion: '2',
      maxlag: '5',
      ...params
    });
    const response = await fetch(url, {
      headers: {
        'User-Agent':
          process.env.WIKIMEDIA_USER_AGENT ||
          'Roamwise/0.1 (https://github.com/benliu0830/YourSpot; Wikimedia place photography)',
        Accept: 'application/json'
      },
      signal: AbortSignal.timeout(7000)
    });
    if (response.status === 429 || response.status === 503) {
      const retry = response.headers.get('retry-after');
      const delay = /^\d+$/.test(retry || '')
        ? Number(retry) * 1000
        : Date.parse(retry) - Date.now();
      cooldown = Date.now() + Math.max(60000, Number.isFinite(delay) ? delay : 60000);
      throw new Error('Wikimedia rate limited');
    }
    if (!response.ok) throw new Error('Wikimedia unavailable');
    const data = await response.json();
    if (data.error) {
      if (data.error.code === 'maxlag') cooldown = Date.now() + 60000;
      throw new Error('Wikimedia API error');
    }
    if (metadata.size >= 500) metadata.delete(metadata.keys().next().value);
    metadata.set(key, { data, until: Date.now() + 86400000 });
    return data;
  });
  tail = job.catch(() => {}).then(() => new Promise((resolve) => setTimeout(resolve, 1100)));
  pending.set(key, job);
  try {
    return await job;
  } finally {
    pending.delete(key);
  }
}

export function matchesEntity(place, entity, direct = false) {
  if (!entity || entity.id === place.brandId) return false;
  const names = [
    ...Object.values(entity.labels || {}),
    ...Object.values(entity.aliases || {}).flat()
  ].map((n) => nameKey(n.value));
  // Provider identity links are authoritative for landmarks, but business links
  // still need a matching branch name and a coordinate at the actual branch.
  const providerNames = [
    nameKey(place.name),
    ...(place.names || []).filter((n) => typeof n === 'string').map(nameKey)
  ];
  if (direct && place.wikipedia) {
    const article = /^(?:https:\/\/[a-z]{2,12}\.wikipedia\.org\/wiki\/|[a-z]{2,12}:)(.+)$/.exec(
      place.wikipedia
    );
    if (article)
      try {
        providerNames.push(
          nameKey(
            decodeURIComponent(article[1])
              .replaceAll('_', ' ')
              .replace(/\s*\((Ottawa|Paris)\)$/i, '')
          )
        );
      } catch {
        /* Ignore malformed provider article links. */
      }
  }
  const descriptiveSuffix = (name) => name.replace(/\s+(building|sculpture)$/, '');
  const gardenName = (name) => name.replace(/\bgardens\b/g, 'garden');
  if (
    !providerNames.some(
      (name) =>
        names.includes(name) ||
        (!business(place) &&
          names.some((candidate) => gardenName(candidate) === gardenName(name))) ||
        (direct &&
          !business(place) &&
          names.some((candidate) => descriptiveSuffix(candidate) === descriptiveSuffix(name)))
    )
  )
    return false;
  const coordinates = claims(entity, 'P625');
  if (business(place) && (coordinates.length !== 1 || claims(entity, 'P159').length)) return false;
  if (!matchesAddress(place, entity)) return false;
  return coordinates.some(
    (c) =>
      c &&
      (!c.globe || c.globe.endsWith('/Q2')) &&
      Number.isFinite(c.latitude) &&
      Number.isFinite(c.longitude) &&
      distanceKm(place, { lat: c.latitude, lon: c.longitude }) <=
        (place.cityPhoto ? 5 : business(place) ? 0.08 : 0.5)
  );
}

export function matchesAddress(place, entity) {
  const addresses = [...claims(entity, 'P6375'), ...claims(entity, 'P969')]
    .map((a) => (typeof a === 'string' ? a : a?.text))
    .filter(Boolean);
  // Compare street identity, ignoring postal/locality suffixes and common road
  // abbreviations. Never discard the branch's street number.
  const street = streetIdentity;
  const expected =
    place.street && place.houseNumber
      ? `${place.houseNumber} ${place.street}`
      : String(place.address || '').split(',')[0];
  if (!expected || !/^\d+[a-z]?\b/i.test(expected.trim())) return !business(place);
  if (!addresses.length) return !business(place);
  const streetPart = (address) => {
    const parts = address.split(',');
    return /^\s*\d+[a-z]?\s*$/i.test(parts[0]) && parts[1] ? `${parts[0]} ${parts[1]}` : parts[0];
  };
  const canonical = (address) => {
    let s = street(streetPart(address));
    if (!/^\d/.test(s)) s = s.replace(/^(.+?)\s+(\d+[a-z]?)$/, '$2 $1');
    if (!business(place))
      s = s.replace(/\b(de|du|des|la|le|l)\b/g, ' ').replace(/^(\d+[a-z]?)\s+place\s+/, '$1 ');
    return s.replace(/\s+/g, ' ').trim();
  };
  const alternatives = expected
    .split(' - ')
    .map((s, i) => (i && place.houseNumber ? `${place.houseNumber} ${s}` : s));
  return addresses.some((a) =>
    alternatives.some((alternative) => canonical(a) === canonical(alternative))
  );
}

export function licensedPhoto(page, entityId, match, place) {
  if (rejectedPhotoFiles.has(page?.title)) return null;
  const info = page?.imageinfo?.[0];
  if (
    !info ||
    !['image/jpeg', 'image/png', 'image/webp'].includes(info.mime) ||
    info.width < 640 ||
    info.height < 400
  )
    return null;
  // A landmark visible FROM a park does not establish a photograph OF the park.
  if (
    place &&
    [' from ', ' depuis '].some((word) => nameKey(page.title).includes(word + nameKey(place.name)))
  )
    return null;
  if (
    /\b(logo|map|diagram|plan|drawing|coat of arms|flag|icon|poster|floorplan|redevelopment|construction)\b/i.test(
      page.title
    )
  )
    return null;
  const meta = info.extmetadata || {},
    field = (key) => plain(meta[key]?.value);
  if (
    place &&
    !/plaque|sign/i.test(place.name) &&
    /\b(plaque|signage|interpretive sign|information panel)\b/i.test(
      `${page.title} ${field('ImageDescription')} ${field('Categories')}`
    )
  )
    return null;
  if (place) {
    const subject = nameKey(place.name),
      title = nameKey(page.title);
    if (
      [' at ', ' at the ', ' in ', ' in the ', ' near ', ' outside '].some((word) =>
        title.includes(word + subject)
      ) ||
      /\b(on display|portrait|group portrait|family portrait|postcard|engraving|lithograph|illustration)\b/i.test(
        page.title
      )
    )
      return null;
    const lat = Number(meta.GPSLatitude?.value),
      lon = Number(meta.GPSLongitude?.value);
    if (
      meta.GPSLatitude?.value &&
      meta.GPSLongitude?.value &&
      Number.isFinite(lat) &&
      Number.isFinite(lon) &&
      distanceKm(place, { lat, lon }) > (place.cityPhoto ? 5 : 1)
    )
      return null;
  }
  const license = field('LicenseShortName');
  let licenseUrl = meta.LicenseUrl?.value;
  // Commons public-domain declarations often have no external license URL.
  // Link the file's own licensing declaration, without relabelling it as CC0.
  if (
    !licenseUrl &&
    license === 'Public domain' &&
    field('Copyrighted').toLowerCase() === 'false' &&
    /^pd(?:-|$)/.test(field('License'))
  )
    licenseUrl = `${info.descriptionurl}#Licensing`;
  // Fail closed for unknown/custom/restricted licenses. Each file retains its
  // own source, creator, credit and copyright notice, including ShareAlike.
  if (!/^(CC BY(?:-SA)? (?:1\.0|2\.[05]|3\.0|4\.0)|CC0(?: 1\.0)?|Public domain)$/i.test(license))
    return null;
  if (!/^https:\/\/(creativecommons\.org|commons\.wikimedia\.org)\//.test(licenseUrl || ''))
    return null;
  if (field('Restrictions') || (field('AttributionRequired') === 'true' && !field('Artist')))
    return null;
  const url = info.thumburl || info.url;
  if (
    !/^https:\/\/(?:upload|thumb)\.wikimedia\.org\//.test(url || '') ||
    !/^https:\/\/commons\.wikimedia\.org\/wiki\//.test(info.descriptionurl || '')
  )
    return null;
  const imageUrl = new URL(url);
  for (const key of [...imageUrl.searchParams.keys()])
    if (key.startsWith('utm_')) imageUrl.searchParams.delete(key);
  return {
    url: imageUrl.href,
    sourceUrl: info.descriptionurl,
    title: plain(page.title.replace(/^File:/, '')),
    creator: field('Artist') || 'Creator listed on source page',
    credit: field('Credit'),
    copyright: field('Copyright'),
    attribution: field('Attribution'),
    license,
    licenseUrl,
    links: attributionLinks(meta),
    width: info.thumbwidth || info.width,
    height: info.thumbheight || info.height,
    entityId,
    match,
    checkedAt: new Date().toISOString()
  };
}

async function entities(ids) {
  const missing = ids.filter((id) => !(entityCache.get(id)?.until > Date.now()));
  for (let i = 0; i < missing.length; i += 40) {
    const data = await request('wikidata', {
      action: 'wbgetentities',
      ids: missing.slice(i, i + 40).join('|'),
      props: 'labels|aliases|claims',
      languages: 'en|fr|ja|de|es'
    });
    for (const [id, entity] of Object.entries(data.entities || {})) {
      if (entityCache.size >= 500) entityCache.delete(entityCache.keys().next().value);
      entityCache.set(id, { entity, until: Date.now() + 86400000 });
    }
  }
  return Object.fromEntries(
    ids.filter((id) => entityCache.has(id)).map((id) => [id, entityCache.get(id).entity])
  );
}

async function imagePages(titles) {
  const missing = titles.filter((title) => !(imageCache.get(title)?.until > Date.now()));
  for (let i = 0; i < missing.length; i += 40) {
    const batch = missing.slice(i, i + 40);
    const data = await request('commons', {
      action: 'query',
      titles: batch.join('|'),
      redirects: '1',
      prop: 'imageinfo',
      iiprop: 'url|size|mime|extmetadata',
      iiurlwidth: '1280',
      iiextmetadatalanguage: 'en'
    });
    for (const title of batch) {
      let canonical = title.replaceAll('_', ' ');
      for (const item of [...(data.query?.normalized || []), ...(data.query?.redirects || [])])
        if (item.from === canonical || item.from === title) canonical = item.to;
      if (imageCache.size >= 500) imageCache.delete(imageCache.keys().next().value);
      imageCache.set(title, {
        page: data.query?.pages?.find((p) => p.title === canonical),
        until: Date.now() + 86400000
      });
    }
  }
  return titles.map((title) => imageCache.get(title)?.page).filter(Boolean);
}

// Used by the opt-in Ottawa catalog refresh, never by an ordinary page render.
// Known identities and their primary file metadata share bounded batch queries.
export async function warmPhotoMetadata(places) {
  const scoped = places.filter(isSupportedPhotoPlace);
  const ids = [...new Set(scoped.map((p) => p.wikidata).filter(qid))];
  const data = await entities(ids);
  const files = [
    ...new Set(
      scoped.flatMap((p) =>
        matchesEntity(p, data[p.wikidata], true)
          ? claims(data[p.wikidata], 'P18')
              .filter((f) => typeof f === 'string')
              .slice(0, 3)
              .map((f) => `File:${f}`)
          : []
      )
    )
  ];
  await imagePages(files);
}
async function resolve(place) {
  let id = qid(place.wikidata) ? place.wikidata : null;
  if (!id && place.wikipedia) {
    const article = /^(?:https:\/\/([a-z]{2,12})\.wikipedia\.org\/wiki\/|([a-z]{2,12}):)(.+)$/.exec(
      place.wikipedia
    );
    if (article) {
      const data = await request(`https://${article[1] || article[2]}.wikipedia.org/w/api.php`, {
        action: 'query',
        prop: 'pageprops',
        ppprop: 'wikibase_item',
        redirects: '1',
        titles: decodeURIComponent(article[3]).replaceAll('_', ' ')
      });
      id = data.query?.pages?.[0]?.pageprops?.wikibase_item;
    }
  }
  let entity, match;
  if (qid(id)) {
    entity = (await entities([id]))[id];
    if (!matchesEntity(place, entity, true)) return null;
    match = 'provider identity and coordinates';
  } else {
    // A chain name alone never identifies a branch. No name-only fallback.
    if (business(place) && (place.brand || place.brandId || !place.address)) return null;
    const search = await request('wikidata', {
      action: 'wbsearchentities',
      search: place.name,
      language: 'en',
      type: 'item',
      limit: '5'
    });
    const ids = (search.search || []).map((e) => e.id).filter(qid);
    if (!ids.length) return null;
    const candidates = Object.values(await entities(ids)).filter((e) => matchesEntity(place, e));
    if (candidates.length !== 1) return null;
    entity = candidates[0];
    id = entity.id;
    match = 'unique name and coordinates';
  }
  const files = claims(entity, 'P18')
    .filter((name) => typeof name === 'string')
    .slice(0, 3)
    .map((name) => `File:${name}`);
  async function select(titles) {
    if (!titles.length) return null;
    const pages = await imagePages(titles);
    for (const page of pages) {
      const photo = licensedPhoto(page, id, match, place);
      if (photo) return photo;
    }
    return null;
  }
  const primary = await select(files);
  if (primary) return primary;
  // P373 connects this already verified entity to its exact Commons category.
  // Do not descend into subcategories (which may depict neighbouring venues).
  if (!business(place)) {
    for (const category of claims(entity, 'P373')
      .filter((c) => typeof c === 'string')
      .slice(0, 1)) {
      const data = await request('commons', {
        action: 'query',
        generator: 'categorymembers',
        gcmtitle: `Category:${category}`,
        gcmtype: 'file',
        gcmnamespace: '6',
        gcmlimit: '50',
        prop: 'imageinfo',
        iiprop: 'url|size|mime|extmetadata',
        iiurlwidth: '1280',
        iiextmetadatalanguage: 'en'
      });
      const names = [
        place.name,
        ...Object.values(entity.labels || {}).map((n) => n.value),
        ...Object.values(entity.aliases || {})
          .flat()
          .map((n) => n.value)
      ]
        .map(nameKey)
        .filter((n) => n.length >= 6);
      const candidates = (data.query?.pages || [])
        .filter((page) =>
          names.some((name) => {
            const title = nameKey(page.title.replace(/^File:/, ''));
            return (
              title.startsWith(name) ||
              title.startsWith(`${photoCity(place)?.toLowerCase()} ${name}`)
            );
          })
        )
        .sort(
          (a, b) =>
            Number(names.includes(nameKey(b.title.replace(/^File:|\.(jpe?g|png|webp)$/gi, '')))) -
              Number(
                names.includes(nameKey(a.title.replace(/^File:|\.(jpe?g|png|webp)$/gi, '')))
              ) ||
            Number(/\b(19\d\d|old|historic)\b/.test(a.title)) -
              Number(/\b(19\d\d|old|historic)\b/.test(b.title))
        );
      for (const page of candidates) {
        const photo = licensedPhoto(page, id, 'verified entity Commons category', place);
        if (photo) return photo;
      }
    }
  }
  // Commons structured depicts statements identify the subject, unlike nearby
  // camera coordinates or a title containing the same business name.
  let search = {};
  try {
    search = await request('commons', {
      action: 'query',
      list: 'search',
      srsearch: `haswbstatement:P180=${id} filetype:bitmap "${place.name.replaceAll('"', '')}" -intitle:from`,
      srnamespace: '6',
      srlimit: '4'
    });
  } catch (error) {
    if (!files.length) throw error;
  }
  const names = [place.name, ...Object.values(entity.labels || {}).map((n) => n.value)]
    .map(nameKey)
    .filter((n) => n.length >= 4);
  const titles = [...new Set((search.query?.search || []).map((p) => p.title))]
    .filter((title) => names.some((name) => nameKey(title).includes(name)))
    .slice(0, 4);
  return select(titles);
}

function streetIdentity(address) {
  return nameKey(address)
    .replace(/\s+75\d{3}\s+paris(?:\s.*)?$/, '')
    .replace(
      /\b(street|avenue|road|boulevard|drive|parkway)\b/g,
      (word) =>
        ({
          street: 'st',
          avenue: 'ave',
          road: 'rd',
          boulevard: 'blvd',
          drive: 'dr',
          parkway: 'pkwy'
        })[word]
    );
}

export function matchesBusinessPhoto(place, page) {
  const address =
    place.street && place.houseNumber
      ? `${place.houseNumber} ${place.street}`
      : String(place.address || '').split(',')[0];
  if (!/^\d+[a-z]?\b/i.test(address)) return false;
  const info = page?.imageinfo?.[0],
    meta = info?.extmetadata || {};
  const description = plain(meta.ImageDescription?.value);
  const text = nameKey(`${page.title || ''} ${description} ${plain(meta.ObjectName?.value)}`);
  const target = streetIdentity(address),
    actual = streetIdentity(description + ' ' + (page.title || ''));
  const boundaryIncludes = (haystack, needle) => ` ${haystack} `.includes(` ${needle} `);
  const primary = nameKey(`${page.title || ''} ${plain(meta.ObjectName?.value)}`);
  if (
    !boundaryIncludes(primary, nameKey(place.name)) ||
    !boundaryIncludes(text, nameKey(place.name)) ||
    !boundaryIncludes(actual, target)
  )
    return false;
  const lat = Number(meta.GPSLatitude?.value),
    lon = Number(meta.GPSLongitude?.value);
  return Boolean(
    meta.GPSLatitude?.value &&
    meta.GPSLongitude?.value &&
    Number.isFinite(lat) &&
    Number.isFinite(lon) &&
    distanceKm(place, { lat, lon }) <= 0.15
  );
}

async function businessCommonsPhoto(place) {
  const address =
    place.street && place.houseNumber
      ? `${place.houseNumber} ${place.street}`
      : String(place.address || '').split(',')[0];
  if (!/^\d+[a-z]?\b/i.test(address)) return null;
  const quote = (s) => `"${s.replaceAll('"', '')}"`;
  const data = await request('commons', {
    action: 'query',
    generator: 'search',
    gsrsearch: `${quote(place.name)} ${photoCity(place)} ${quote(address)} filetype:bitmap`,
    gsrnamespace: '6',
    gsrlimit: '6',
    prop: 'imageinfo',
    iiprop: 'url|size|mime|extmetadata',
    iiurlwidth: '1280',
    iiextmetadatalanguage: 'en'
  });
  for (const page of data.query?.pages || []) {
    if (!matchesBusinessPhoto(place, page)) continue;
    const photo = licensedPhoto(
      page,
      null,
      'Commons name, numbered address and coordinates',
      place
    );
    if (photo) return photo;
  }
  return null;
}

export async function findPhoto(place, { refresh = false } = {}) {
  if (
    typeof place?.name !== 'string' ||
    !place.name.trim() ||
    !Number.isFinite(place.lat) ||
    !Number.isFinite(place.lon)
  )
    return null;
  if (!isSupportedPhotoPlace(place)) return null;
  const key = photoIdentity(place);
  const existing = catalogByPlace.get(key);
  if (
    !refresh &&
    existing &&
    Date.parse(existing.checkedAt) > Date.now() - 86400000 &&
    !/\b(redevelopment|construction)\b/i.test(existing.title) &&
    (existing.match !== 'Commons name, numbered address and coordinates' ||
      nameKey(existing.title).includes(nameKey(place.name)))
  )
    return existing;
  if (results.get(key)?.until > Date.now()) return results.get(key).photo;
  const pendingKey = `photo:${key}`;
  if (pending.has(pendingKey)) return pending.get(pendingKey);
  const job = (async () => {
    let photo = null,
      failed = false;
    try {
      let target = place;
      if (place.photoNeedsDetails && place.id && !place.wikidata && !place.wikipedia) {
        try {
          const enriched = await placeDetails(place);
          if (
            isSupportedPhotoPlace(enriched) &&
            photoCity(enriched) === photoCity(place) &&
            distanceKm(place, enriched) <= 0.1
          )
            target = enriched;
        } catch {
          /* Keep the original verified record when extra details fail. */
        }
      }
      photo = await resolve(target);
      if (!photo && business(target)) photo = await businessCommonsPhoto(target);
    } catch {
      failed = true;
    }
    if (results.size >= 500) results.delete(results.keys().next().value);
    results.set(key, { photo, until: Date.now() + (failed ? 60000 : photo ? 86400000 : 3600000) });
    return photo;
  })();
  pending.set(pendingKey, job);
  try {
    return await job;
  } finally {
    pending.delete(pendingKey);
  }
}
