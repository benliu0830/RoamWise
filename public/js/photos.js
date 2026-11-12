import { icon } from './icons.js';
import { categoryOf, categoryKey } from './categories.js';
import { escape as e } from './discovery-ui.js';
import { isSupportedPhotoPlace, photoIdentity } from './photo-scope.js';

const places = new Map(),
  cache = new Map(),
  pending = new Map(),
  consumers = new Map(),
  queue = [];
let active = 0;
const keyOf = photoIdentity;
const watchedImages = new WeakSet();
const storageKey = 'roamwise:photos:ottawa-paris:v4';
try {
  for (const [key, entry] of JSON.parse(localStorage.getItem(storageKey) || '[]'))
    if (entry.until > Date.now()) cache.set(key, entry);
} catch {
  /* Browsing works without storage. */
}

export function placeholder(p) {
  return `<span class="photo-placeholder category-${categoryKey(p.category)}">${icon(categoryOf(p.category).icon)}<span>Photo unavailable</span><small>No verified photograph of this location</small></span>`;
}
export function photoMarkup(p, cls = '', destination = false) {
  const key = keyOf(p);
  const previous = places.get(key);
  places.set(key, {
    place: !p.signature && previous?.place.signature ? previous.place : p,
    destination
  });
  if (places.size > 500) places.delete(places.keys().next().value);
  const cached = cache.get(key);
  const photo = isSupportedPhotoPlace(p) && cached?.until > Date.now() ? cached.photo : null;
  return `<div class="location-photo ${cls}" data-photo-key="${e(key)}">${photoContent(photo, p) || placeholder(p)}</div>`;
}
function photoContent(photo, place) {
  if (
    !photo ||
    !/^https:\/\/(?:upload|thumb)\.wikimedia\.org\//.test(photo.url) ||
    !/^https:\/\/commons\.wikimedia\.org\/wiki\//.test(photo.sourceUrl) ||
    !/^https:\/\/(creativecommons\.org|commons\.wikimedia\.org)\//.test(photo.licenseUrl)
  )
    return '';
  const links = (photo.links || []).filter((link) => /^https:\/\//.test(link.url || ''));
  return `<img src="${e(photo.url)}" alt="${e(place.name)} — ${e(photo.title)}" width="${Number(photo.width) || 1280}" height="${Number(photo.height) || 800}" loading="lazy" decoding="async"><div class="photo-credit"><span>${e(photo.creator)}</span> · <a href="${e(photo.licenseUrl)}" target="_blank" rel="noopener noreferrer">${e(photo.license)}</a> · <a href="${e(photo.sourceUrl)}" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a><details><summary>Photo credits</summary><p>${e(photo.title)}</p>${[
    photo.attribution,
    photo.credit,
    photo.copyright
  ]
    .filter(Boolean)
    .map((text) => `<p>${e(text)}</p>`)
    .join(
      ''
    )}${links.map((link) => `<p><a href="${e(link.url)}" target="_blank" rel="noopener noreferrer">${e(link.label)}</a></p>`).join('')}<p>Displayed without alterations; cropped to fit.</p></details></div>`;
}
function watchImage(node, place) {
  const image = node.querySelector('img');
  if (!image || watchedImages.has(image)) return;
  watchedImages.add(image);
  image.addEventListener(
    'error',
    () => {
      node.innerHTML = placeholder(place);
    },
    { once: true }
  );
}
function renderPhoto(node, photo, place) {
  const content = photoContent(photo, place);
  if (!content) return;
  node.innerHTML = content;
  watchImage(node, place);
}
function pump() {
  while (active < 2 && queue.length) {
    const job = queue.shift();
    active++;
    job().finally(() => {
      active--;
      pump();
    });
  }
}
function retrieve(key, item) {
  if (cache.get(key)?.until > Date.now()) return Promise.resolve(cache.get(key).photo);
  if (pending.has(key)) return pending.get(key);
  const promise = new Promise((resolve) => {
    queue.push(async () => {
      if (![...(consumers.get(key) || [])].some((node) => node.isConnected)) {
        pending.delete(key);
        resolve(null);
        return;
      }
      let photo = null,
        failed = false;
      try {
        const response = await fetch('/api/photo', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            item.destination ? { destination: item.place.name } : { place: item.place }
          ),
          signal: AbortSignal.timeout(45000)
        });
        if (!response.ok) throw new Error('Photo unavailable');
        photo = (await response.json()).photo;
      } catch {
        failed = true;
      }
      if (cache.size >= 200) cache.delete(cache.keys().next().value);
      cache.set(key, { photo, until: Date.now() + (failed || !photo ? 60000 : 86400000) });
      try {
        localStorage.setItem(storageKey, JSON.stringify([...cache]));
      } catch {
        /* Optional cache. */
      }
      pending.delete(key);
      resolve(photo);
    });
  });
  pending.set(key, promise);
  pump();
  return promise;
}

export function observePhotos(root) {
  const load = async (node) => {
    const key = node.dataset.photoKey,
      item = places.get(key);
    if (
      !item ||
      !isSupportedPhotoPlace(item.place) ||
      (!item.destination &&
        !item.place.signature &&
        !(cache.get(key)?.photo && cache.get(key).until > Date.now()))
    )
      return;
    if (!consumers.has(key)) consumers.set(key, new Set());
    consumers.get(key).add(node);
    try {
      const photo = await retrieve(key, item);
      if (node.isConnected) renderPhoto(node, photo, item.place);
    } finally {
      const nodes = consumers.get(key);
      nodes?.delete(node);
      if (!nodes?.size) consumers.delete(key);
    }
  };
  const Observer = globalThis.IntersectionObserver || globalThis.window?.IntersectionObserver;
  const visible = Observer
    ? new Observer(
        (entries) => {
          for (const entry of entries)
            if (entry.isIntersecting) {
              visible.unobserve(entry.target);
              void load(entry.target);
            }
        },
        { rootMargin: '200px' }
      )
    : null;
  function scan() {
    for (const node of root.querySelectorAll('[data-photo-key]:not([data-photo-observed])')) {
      node.dataset.photoObserved = 'true';
      const item = places.get(node.dataset.photoKey);
      if (item) watchImage(node, item.place);
      if (visible) visible.observe(node);
      else void load(node);
    }
  }
  const observer = new window.MutationObserver((mutations) => {
    for (const mutation of mutations)
      for (const removed of mutation.removedNodes) {
        if (removed.nodeType !== 1) continue;
        visible?.unobserve(removed);
        for (const node of removed.querySelectorAll('[data-photo-key]')) visible?.unobserve(node);
      }
    scan();
  });
  observer.observe(root, { childList: true, subtree: true });
  scan();
}
