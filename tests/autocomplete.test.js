import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { attachDestinationSearch } from '../public/js/destination-search.js';

test('city autocomplete supports popular options, keyboard selection, debounce, unrestricted cities, dismissal and errors', async () => {
  const dom = new JSDOM(
    '<form><div class="destination-search"><input id="city" name="destination" required minlength="2"><button class="clear-search" type="button">Clear</button><div class="suggestion-panel" hidden><div class="suggestion-heading"></div><ul role="listbox"></ul><div role="status"></div></div><button type="submit">Explore</button></div></form><button id="outside">Outside</button>',
    { url: 'http://localhost:3000' }
  );
  const oldDocument = global.document,
    original = global.fetch;
  global.document = dom.window.document;
  const input = document.querySelector('input'),
    panel = document.querySelector('.suggestion-panel');
  const calls = [],
    selected = [];
  global.fetch = async (url) => {
    calls.push(url);
    if (url.includes('missing'))
      return Response.json(
        { error: 'No destination found. Try a city and country.' },
        { status: 404 }
      );
    const name = url.includes('Toronto') ? 'Toronto' : 'Unlisted real city';
    return Response.json({
      results: [
        { name, label: `${name}, Test country`, country: 'Test country', lat: 45, lon: -75 }
      ]
    });
  };
  const dispose = attachDestinationSearch(
    document.querySelector('form'),
    (city) => selected.push(city),
    { submit: true }
  );
  const key = (value) =>
    input.dispatchEvent(
      new dom.window.KeyboardEvent('keydown', { key: value, bubbles: true, cancelable: true })
    );
  const type = (value) => {
    input.value = value;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  };
  const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  try {
    input.focus();
    assert.equal(document.querySelectorAll('[role=option]').length, 8);
    key('ArrowUp');
    assert.match(input.getAttribute('aria-activedescendant'), /option-7$/);
    key('ArrowDown');
    assert.match(input.getAttribute('aria-activedescendant'), /option-0$/);
    key('Escape');
    assert(panel.hidden);
    type('T');
    type('To');
    type('Toronto');
    await pause(380);
    assert.equal(calls.length, 1);
    assert(calls[0].includes('autocomplete=1'));
    key('ArrowDown');
    key('Enter');
    await pause(10);
    assert.equal(selected[0].name, 'Toronto');
    assert(panel.hidden);
    type('Unlisted');
    await pause(380);
    assert.equal(document.querySelector('[role=option] strong').textContent, 'Unlisted real city');
    document.querySelector('[role=option]').click();
    await pause(10);
    assert.equal(selected[1].name, 'Unlisted real city');
    document.querySelector('.clear-search').click();
    assert.equal(input.value, '');
    assert.equal(document.querySelectorAll('[role=option]').length, 8);
    document
      .querySelector('#outside')
      .dispatchEvent(new dom.window.Event('pointerdown', { bubbles: true }));
    assert(panel.hidden);
    type('missing');
    await pause(380);
    assert.match(document.querySelector('[role=status]').textContent, /No destination found/);
    type('cancel pending');
    key('Escape');
    await pause(380);
    assert(panel.hidden, 'A dismissed pending request must not reopen suggestions');
  } finally {
    dispose();
    dom.window.close();
    global.fetch = original;
    global.document = oldDocument;
  }
});
