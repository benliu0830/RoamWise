import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { JSDOM } from 'jsdom';

test('map updates retain marker objects, reject missing coordinates, preserve attribution and clean up', async () => {
  const dom = new JSDOM('<main><div id="map"></div></main>', {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  global.window = dom.window;
  global.document = dom.window.document;
  dom.window.eval(
    await readFile(new URL('../node_modules/leaflet/dist/leaflet.js', import.meta.url), 'utf8')
  );
  global.L = dom.window.L;
  L.Browser.svg = true;
  dom.window.eval(
    await readFile(
      new URL(
        '../node_modules/leaflet.markercluster/dist/leaflet.markercluster.js',
        import.meta.url
      ),
      'utf8'
    )
  );
  const { createMap, clearMaps } = await import('../public/js/maps.js');
  const node = document.querySelector('#map');
  Object.defineProperties(node, { clientWidth: { value: 800 }, clientHeight: { value: 500 } });
  const a = { id: 'a', name: 'Museum', category: 'museums', lat: 45.42, lon: -75.69 },
    b = { id: 'b', name: 'Park', category: 'nature', lat: 45.421, lon: -75.691 };
  try {
    const map = createMap(node, [a, b, a, { id: 'missing', lat: NaN, lon: 1 }], a);
    assert.equal(map.roam.markers.size, 2);
    const marker = map.roam.markers.get('a');
    map.roam.setPlaces([a]);
    assert.equal(map.roam.markers.size, 1);
    assert.equal(map.roam.markers.get('a'), marker);
    map.roam.selectPlace('a', { open: false });
    assert.equal(map.roam.getContext().selectedId, 'a');
    assert(
      document.querySelector(
        '.leaflet-control-attribution a[href="https://www.openstreetmap.org/copyright"]'
      )
    );
    assert.equal(document.querySelectorAll('.map-controls button').length, 5);
    clearMaps();
    assert.equal(node._leaflet_id, undefined);
  } finally {
    clearMaps();
    dom.window.close();
  }
});
