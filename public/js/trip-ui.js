import { locationLabel } from './location-label.js';
import { icon } from './icons.js';
import { isCompleted, tripCollection } from './trips.js';
import { saved } from './store.js';
const e = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
export const completionDate = (value) => {
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? 'Completion date unavailable'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(d);
};
export function promptTripCompletion(plan, { trigger, onComplete }) {
  if (document.querySelector('#complete-trip-dialog')) return;
  const dialog = document.createElement('dialog');
  dialog.id = 'complete-trip-dialog';
  dialog.className = 'completion-dialog';
  dialog.setAttribute('aria-labelledby', 'completion-heading');
  dialog.setAttribute('aria-describedby', 'completion-message');
  dialog.innerHTML = `<div class="completion-dialog-icon">${icon('check')}</div><h2 id="completion-heading">Complete Your Trip?</h2><p id="completion-message">Ready to finish this adventure? Your itinerary will be saved to Completed Trips.</p><p class="completion-error" role="alert"></p><div class="dialog-actions"><button class="btn secondary" data-cancel>Cancel</button><button class="btn" data-confirm>Complete Trip</button></div>`;
  document.body.append(dialog);
  const close = () => {
    if (dialog.open && dialog.close) dialog.close();
    dialog.remove();
    trigger?.focus();
  };
  dialog.querySelector('[data-cancel]').onclick = close;
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    close();
  });
  dialog.querySelector('[data-confirm]').onclick = (event) => {
    event.currentTarget.disabled = true;
    const completed = saved.completePlan(plan);
    if (!completed) {
      dialog.querySelector('.completion-error').textContent =
        'Browser storage could not save this trip. Free some space and try again.';
      event.currentTarget.disabled = false;
      return;
    }
    close();
    onComplete(completed);
  };
  if (dialog.showModal) dialog.showModal();
  else {
    dialog.setAttribute('open', '');
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
  }
  dialog.querySelector('[data-cancel]').focus();
}
export function tripCollectionMarkup(plans, activePlan, tab = 'active') {
  const all = tripCollection(plans, activePlan),
    completed = all
      .filter(isCompleted)
      .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt))),
    active = all.filter((p) => !isCompleted(p)),
    visible = tab === 'completed' ? completed : active;
  return `<div class="trip-collection-tabs" role="group" aria-label="Trip history"><button class="saved-tab ${tab === 'active' ? 'active' : ''}" data-action="trip-tab" data-tab="active" aria-pressed="${tab === 'active'}">Active Trips <span>${active.length}</span></button><button class="saved-tab ${tab === 'completed' ? 'active' : ''}" data-action="trip-tab" data-tab="completed" aria-pressed="${tab === 'completed'}">Completed Trips <span>${completed.length}</span></button></div><div class="saved-plans trip-collection">${
    visible.length
      ? visible
          .map((p) => {
            const done = isCompleted(p),
              count = p.days.reduce((n, d) => n + d.stops.length, 0);
            return `<article class="saved-plan trip-history-card"><div class="trip-card-icon ${done ? 'is-completed' : ''}">${icon(done ? 'check' : 'route')}</div><div><span class="trip-status ${done ? 'is-completed' : ''}">${done ? 'Completed' : p.tripStarted ? 'In progress' : 'Planned'}</span><h2>${e(locationLabel(p.name))}</h2><p class="trip-city">${icon('pin')}${e(locationLabel(p.center?.name || p.days[0]?.stops[0]?.place.city || 'Your itinerary'))}</p><p>${p.days.length} ${p.days.length === 1 ? 'day' : 'days'} · ${count} ${count === 1 ? 'destination' : 'destinations'}</p>${done ? `<p class="completion-date">Completed ${e(completionDate(p.completedAt))}</p>` : ''}</div><div class="toolbar"><button class="btn ${done ? 'secondary' : ''} small" data-action="open-plan" data-id="${e(p.id)}">${done ? 'View Trip' : 'Open itinerary'}${icon('arrow')}</button><button class="btn quiet small" data-action="delete-plan" data-id="${e(p.id)}">${done ? 'Delete trip' : 'Delete saved plan'}</button></div></article>`;
          })
          .join('')
      : `<div class="trip-history-empty">${icon(tab === 'completed' ? 'check' : 'route')}<h2>${tab === 'completed' ? 'Your adventures will live here.' : 'Your next adventure starts here.'}</h2><p>${tab === 'completed' ? 'Finish an active itinerary to keep its destinations and visited progress in your travel history.' : 'Choose your favorite places and create a trip to explore them.'}</p>${tab === 'active' ? '<a class="btn" href="#builder">Plan a trip</a>' : ''}</div>`
  }</div>`;
}
