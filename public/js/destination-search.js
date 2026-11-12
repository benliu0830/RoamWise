import { locationLabel } from './location-label.js';
import { api } from './api.js';
import { icon } from './icons.js';

export const popularDestinations = [
  ['Paris', 'France'],
  ['Tokyo', 'Japan'],
  ['London', 'United Kingdom'],
  ['New York City', 'United States'],
  ['Rome', 'Italy'],
  ['Barcelona', 'Spain'],
  ['Toronto', 'Canada'],
  ['Vancouver', 'Canada']
].map(([name, country]) => ({ name, country, label: `${name}, ${country}` }));

// The list above is only the empty-field prompt. Typed queries use live geocoding.
export function attachDestinationSearch(form, onSelect, { submit = false } = {}) {
  const input = form.querySelector('[name=destination]');
  const root = input.closest('.destination-search');
  const panel = root.querySelector('.suggestion-panel');
  const list = root.querySelector('[role=listbox]');
  const status = root.querySelector('[role=status]');
  const heading = root.querySelector('.suggestion-heading');
  const clear = root.querySelector('.clear-search');
  const listeners = new form.ownerDocument.defaultView.AbortController();
  const InputEvent = form.ownerDocument.defaultView.Event;
  const cache = new Map();
  let timer,
    request,
    revision = 0,
    choices = [],
    active = -1,
    composing = false;
  clear.hidden = !input.value;
  const listen = (node, type, handler) =>
    node.addEventListener(type, handler, { signal: listeners.signal });

  function cancel() {
    clearTimeout(timer);
    request?.abort();
    revision++;
    input.removeAttribute('aria-busy');
  }
  function open() {
    panel.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }
  function close() {
    panel.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
    active = -1;
  }
  function message(text) {
    list.replaceChildren();
    choices = [];
    active = -1;
    input.removeAttribute('aria-activedescendant');
    status.textContent = text;
    open();
  }
  function show(items, title) {
    items = items.map((city) => ({
      ...city,
      label: locationLabel(city.label),
      region: locationLabel(`${city.name}, ${city.region || city.country || city.label}`).replace(
        `${city.name}, `,
        ''
      )
    }));
    choices = items;
    active = -1;
    input.removeAttribute('aria-activedescendant');
    list.replaceChildren();
    heading.textContent = title;
    status.textContent = items.length
      ? `${items.length} destinations. Use arrow keys to choose.`
      : 'No cities found. Try a longer name or add a country.';
    items.forEach((city, index) => {
      const row = document.createElement('li');
      row.id = `${input.id}-option-${index}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', 'false');
      row.dataset.index = index;
      const location = document.createElement('span');
      location.className = 'suggestion-icon';
      location.innerHTML = icon('pin');
      const copy = document.createElement('span');
      const name = document.createElement('strong');
      name.textContent = city.name;
      const region = document.createElement('small');
      region.textContent = city.region || city.country || city.label;
      copy.append(name, region);
      const arrow = document.createElement('span');
      arrow.className = 'suggestion-arrow';
      arrow.innerHTML = icon('arrow');
      row.append(location, copy, arrow);
      list.append(row);
    });
    open();
  }
  async function lookup(query, chooseSingle = false) {
    cancel();
    const version = revision;
    heading.textContent = 'Matching destinations';
    message('Finding cities…');
    input.setAttribute('aria-busy', 'true');
    request = new AbortController();
    try {
      const key = `${chooseSingle ? 'search' : 'suggest'}:${query.toLowerCase()}`;
      let items = cache.get(key);
      if (!items) {
        const data = await api(
          `geocode?q=${encodeURIComponent(query)}${chooseSingle ? '' : '&autocomplete=1'}`,
          undefined,
          {
            signal: AbortSignal.any([request.signal, AbortSignal.timeout(15000)])
          }
        );
        items = data.results;
        if (cache.size >= 30) cache.delete(cache.keys().next().value);
        cache.set(key, items);
      }
      if (version !== revision || !form.isConnected) return;
      input.removeAttribute('aria-busy');
      if (chooseSingle && items.length === 1) await choose(items[0]);
      else show(items, chooseSingle ? 'Choose your destination' : 'Matching destinations');
    } catch (error) {
      if (version !== revision || !form.isConnected) return;
      input.removeAttribute('aria-busy');
      if (error.name !== 'AbortError') {
        heading.textContent = 'Destination search';
        message(
          error.name === 'TimeoutError' ? 'City search took too long. Try again.' : error.message
        );
      }
    }
  }
  async function choose(city) {
    if (!city) return;
    cancel();
    input.value = locationLabel(city.label || `${city.name}, ${city.country}`);
    clear.hidden = false;
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
    cancel();
    if (!form.reportValidity()) {
      close();
      return;
    }
    if (!Number.isFinite(city.lat) || !Number.isFinite(city.lon)) {
      // Popular suggestions are names, never fabricated geocoding records.
      await lookup(input.value, true);
      return;
    }
    close();
    await onSelect(city);
  }
  function update() {
    cancel();
    clear.hidden = !input.value;
    if (composing) return;
    const query = input.value.trim();
    if (!query) show(popularDestinations, 'Popular destinations');
    else if (query.length < 2) {
      heading.textContent = 'Destination search';
      message('Type at least two characters to find a city.');
    } else {
      heading.textContent = 'Matching destinations';
      message('Finding cities…');
      timer = setTimeout(() => lookup(query), 320);
    }
  }
  listen(input, 'focus', update);
  listen(input, 'input', update);
  listen(input, 'compositionstart', () => {
    composing = true;
    cancel();
  });
  listen(input, 'compositionend', () => {
    composing = false;
    update();
  });
  listen(input, 'keydown', (event) => {
    if (event.isComposing || composing) return;
    if (event.key === 'Escape') {
      cancel();
      close();
      return;
    }
    if (event.key === 'Tab') {
      cancel();
      close();
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (panel.hidden) {
        update();
        return;
      }
      if (!choices.length) return;
      active =
        (active + (event.key === 'ArrowDown' ? 1 : active < 0 ? 0 : -1) + choices.length) %
        choices.length;
      [...list.children].forEach((row, i) =>
        row.setAttribute('aria-selected', String(i === active))
      );
      input.setAttribute('aria-activedescendant', list.children[active].id);
      list.children[active].scrollIntoView?.({ block: 'nearest' });
    } else if (event.key === 'Enter' && !panel.hidden && active >= 0) {
      event.preventDefault();
      void choose(choices[active]);
    }
  });
  listen(list, 'pointerdown', (event) => event.preventDefault());
  listen(list, 'click', (event) => {
    const row = event.target.closest('[role=option]');
    if (row) void choose(choices[Number(row.dataset.index)]);
  });
  listen(clear, 'click', () => {
    input.value = '';
    input.focus();
    update();
    input.dispatchEvent(new InputEvent('input', { bubbles: true }));
  });
  listen(document, 'pointerdown', (event) => {
    if (!root.contains(event.target)) {
      cancel();
      close();
    }
  });
  listen(root, 'focusout', (event) => {
    if (!root.contains(event.relatedTarget)) {
      cancel();
      close();
    }
  });
  if (submit)
    listen(form, 'submit', (event) => {
      event.preventDefault();
      if (composing) return;
      if (active >= 0 && !panel.hidden) void choose(choices[active]);
      else void lookup(input.value.trim(), true);
    });
  return () => {
    cancel();
    listeners.abort();
  };
}
