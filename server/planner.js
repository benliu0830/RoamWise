import { relevantForecast } from './weather.js';
import { windowsForDate } from '../public/js/hours.js';
export { distanceKm } from '../public/js/place-utils.js';
import { distanceKm } from '../public/js/place-utils.js';

export function duration(place, pace) {
  const base =
    {
      landmarks: 60,
      food: 60,
      cafes: 35,
      history: 60,
      museums: 100,
      nature: 60,
      entertainment: 100,
      shopping: 60,
      hidden: 35
    }[place.category] || 60;
  return Math.round(base * ({ relaxed: 1.25, balanced: 1, packed: 0.75 }[pace] || 1));
}
export function travelEstimate(a, b, transport) {
  const km = distanceKm(a, b);
  // Straight-line distances are inflated for rough road detours. These are
  // planning assumptions, never advertised as measured routing or transit times.
  return {
    km: Math.round(km * 10) / 10,
    minutes:
      transport === 'transit'
        ? null
        : Math.max(
            3,
            Math.ceil(
              ((km * 1.3) / (transport === 'drive' ? 25 : 4.5)) * 60 +
                (transport === 'drive' ? 5 : 0)
            )
          ),
    reserve: transport === 'transit' ? 30 : null,
    kind: 'estimate'
  };
}
export const openingWindow = windowsForDate;
function dateAt(start, index) {
  if (!start) return null;
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + index);
  return d.toISOString().slice(0, 10);
}
export function buildPlan(places, prefs, center, weather) {
  // A generated plan is an itinerary of exactly the places the traveler chose.
  // Deduplicate provider results defensively before scheduling.
  const remaining = [...new Map(places.map((place) => [place.id, place])).values()],
    days = [];
  const limit = Math.min(prefs.hours * 60, 720),
    startMinute = 9 * 60;
  for (let i = 0; i < prefs.days; i++) {
    const date = dateAt(prefs.startDate, i),
      forecast = date || i === 0 ? relevantForecast(weather, date) : null;
    const day = {
      number: i + 1,
      date,
      stops: [],
      minutes: 0,
      forecast: date || i === 0 ? forecast : null
    };
    let current = center,
      elapsed = 0;
    // Seed each day near the best remaining recommendation, then use nearest
    // neighbors. A growing distance penalty keeps each day's visits clustered.
    const target = Math.max(1, Math.ceil(remaining.length / (prefs.days - i)));
    while (remaining.length && day.stops.length < target) {
      const options = remaining
        .map((p, index) => ({ p, index, km: distanceKm(current, p) }))
        .sort((a, b) => a.km - b.km);
      let choice = null;
      for (const item of options) {
        const p = item.p;
        const activity = duration(p, prefs.pace),
          travel = travelEstimate(current, p, prefs.transport);
        const buffer = travel.minutes ?? travel.reserve;
        const windows = openingWindow(p.hours, date);
        let start = startMinute + elapsed + buffer;
        let hoursChecked = Boolean(windows);
        if (windows) {
          const slot = windows.find(([a, b]) => Math.max(a, start) + activity <= b);
          if (slot) start = Math.max(start, slot[0]);
          else hoursChecked = false;
        }
        // Opening hours and day length guide the schedule, but never remove a
        // selected destination. Overflow stays visible and is explained below.
        const weatherPenalty = forecast && forecast.rain >= 50 && p.setting === 'outdoor' ? 5 : 0;
        const mealPenalty =
          p.category === 'food' && day.stops.some((s) => s.place.category === 'food') ? 4 : 0;
        const score = item.km + weatherPenalty + mealPenalty + item.index * 0.015;
        if (!choice || score < choice.score)
          choice = { ...item, score, activity, travel, start, hoursChecked };
      }
      if (!choice) break;
      const p = choice.p;
      day.stops.push({
        place: p,
        start: choice.start,
        end: choice.start + choice.activity,
        duration: choice.activity,
        travel: choice.travel,
        hoursChecked: choice.hoursChecked
      });
      elapsed = choice.start + choice.activity - startMinute;
      remaining.splice(choice.index, 1);
      current = p;
    }
    day.minutes = elapsed;
    days.push(day);
  }
  const overCapacity = days.some((day) => day.minutes > limit);
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: `${center.name || 'Nearby'} ${prefs.mode === 'local' ? 'outing' : 'adventure'}`,
    center,
    preferences: prefs,
    days,
    alternatives: [],
    unscheduled: 0,
    notes: [
      'Visit durations and travel schedule times are planning estimates. Check live directions before leaving.',
      prefs.transport === 'transit'
        ? 'Transit has a 30-minute scheduling buffer per leg, not a transit-time prediction. Open transit directions for actual service.'
        : 'Open a day to load a Geoapify walking or driving route when available.',
      'Only simple opening-hour rules are checked when a trip date is set. Confirm complex hours and holiday closures with each venue.',
      ...(overCapacity ? ['All selected places are included. Some days exceed the requested hours; adjust expectations before setting out.'] : [])
    ]
  };
}
