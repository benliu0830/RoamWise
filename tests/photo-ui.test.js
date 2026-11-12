import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { renderBranchRow } from '../public/js/discovery-ui.js';

test('branch rows retain usable plan and details controls beside the verified photo area', () => {
  const html = renderBranchRow(
    { id: 'branch', name: 'Tim Hortons', address: '406 March Road', category: 'cafes' },
    {
      favorite: () => false,
      selected: () => false,
      photo: () => '<div class="branch-photo"></div>'
    }
  );
  const dom = new JSDOM(html);
  assert(dom.window.document.querySelector('article > .card-bottom input[data-select="branch"]'));
  assert(dom.window.document.querySelector('article > .card-bottom a[href="#place/branch"]'));
  dom.window.close();
});

test('photos load on visibility, retain attribution across saved views, and fall back on image failure', async () => {
  const dom = new JSDOM('<main></main>', { url: 'http://localhost/' });
  global.window = dom.window;
  global.localStorage = dom.window.localStorage;
  let intersection,
    calls = 0;
  global.IntersectionObserver = class {
    constructor(callback) {
      intersection = callback;
    }
    observe() {}
    unobserve() {}
  };
  const previous = global.fetch;
  global.fetch = async () => {
    calls++;
    return Response.json({
      photo: {
        url: 'https://thumb.wikimedia.org/example.jpg',
        sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg',
        creator: 'Creator <script>bad()</script>',
        title: 'Actual place',
        license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        copyright: 'Required copyright notice',
        attribution: 'Required attribution',
        credit: 'Required credit',
        width: 1280,
        height: 800,
        links: [{ label: 'Creator page', url: 'https://example.com/creator' }]
      }
    });
  };
  try {
    const { photoMarkup, observePhotos } = await import('../public/js/photos.js');
    const root = dom.window.document.querySelector('main');
    const place = {
      id: 'verified',
      name: 'Actual place',
      signature: 'signed-fixture',
      category: 'museums',
      lat: 45.4248,
      city: 'Ottawa',
      state: 'Ontario',
      country: 'Canada',
      lon: -75.699
    };
    root.innerHTML = photoMarkup(place, 'card-photo');
    observePhotos(root);
    assert.equal(calls, 0, 'Lookup waits for intersection');
    assert(root.querySelector('.photo-placeholder.category-museums'));
    intersection([{ target: root.firstElementChild, isIntersecting: true }]);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls, 1);
    assert(root.querySelector('img[loading="lazy"]'));
    assert.equal(root.querySelector('script'), null);
    assert(root.textContent.includes('Required copyright notice'));
    assert(root.querySelector('a[href="https://creativecommons.org/licenses/by-sa/4.0/"]'));
    assert(root.querySelector('a[href="https://commons.wikimedia.org/wiki/File:Example.jpg"]'));
    // Saving and re-rendering the unchanged signed place reuses the metadata.
    root.innerHTML = photoMarkup(JSON.parse(JSON.stringify(place)), 'saved-photo');
    await new Promise((r) => setTimeout(r, 10));
    intersection([{ target: root.firstElementChild, isIntersecting: true }]);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls, 1);
    assert(root.querySelector('.photo-credit'));
    const originalImage = root.querySelector('img').getAttribute('src');
    const savedPlace = JSON.parse(JSON.stringify(place));
    delete savedPlace.signature;
    root.innerHTML = photoMarkup(savedPlace, 'builder-choice-image');
    assert.equal(
      root.querySelector('img')?.getAttribute('src'),
      originalImage,
      'The chooser immediately reuses the exact verified image even for an unsigned saved copy'
    );
    await new Promise((r) => setTimeout(r, 10));
    intersection([{ target: root.firstElementChild, isIntersecting: true }]);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls, 1, 'The chooser does not repeat the original photo lookup');
    assert(root.querySelector('.photo-credit'));
    root.querySelector('img').dispatchEvent(new dom.window.Event('error'));
    assert(root.querySelector('.photo-placeholder'));
    assert.equal(root.querySelector('img'), null);
    root.innerHTML = photoMarkup(
      { ...place, id: 'toronto', city: 'Toronto', lat: 43.65, lon: -79.38 },
      'card-photo'
    );
    await new Promise((r) => setTimeout(r, 10));
    intersection([{ target: root.firstElementChild, isIntersecting: true }]);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls, 1, 'Places outside Ottawa never call the photo endpoint');
    assert.equal(root.querySelector('img'), null);
    root.innerHTML = photoMarkup({ name: 'Tokyo', wikidata: 'Q1490' }, 'destination-photo', true);
    await new Promise((r) => setTimeout(r, 10));
    intersection([{ target: root.firstElementChild, isIntersecting: true }]);
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls, 1, 'Unsupported featured cities do not request photos');
    const releases = [];
    global.fetch = async () => {
      calls++;
      return new Promise((resolve) => releases.push(() => resolve(Response.json({ photo: null }))));
    };
    root.innerHTML = [1, 2, 3].map((id) => photoMarkup({ ...place, id: `queued-${id}` })).join('');
    await new Promise((r) => setTimeout(r, 10));
    intersection([...root.children].map((target) => ({ target, isIntersecting: true })));
    assert.equal(calls, 3, 'Only two additional lookups run concurrently');
    root.innerHTML = '';
    releases.forEach((release) => release());
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(calls, 3, 'Detached queued views do not issue requests');
  } finally {
    global.fetch = previous;
    delete global.IntersectionObserver;
    dom.window.close();
  }
});
