import { relevantForecast } from './weather.js';

export function distanceKm(a, b) {
  const radians = (n) => (n * Math.PI) / 180;
  const dlat = radians(b.lat - a.lat),
    dlon = radians(b.lon - a.lon);
  const h =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(dlon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
}
export function duration(place, pace) {
  const base =
    {
      landmarks: 60,
      food: 60,
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
const weekdays = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
// Interpret a deliberately small, unambiguous subset of OSM hours. Unsupported
// holiday rules, seasonal clauses, or complex syntax stay unverified.
export function openingWindow(hours, date) {
  if (!hours || !date) return null;
  if (hours === '24/7') return [[0, 1440]];
  const day = weekdays[new Date(`${date}T12:00:00Z`).getUTCDay()];
  const windows = [];
  for (const clause of hours.split(';').map((x) => x.trim())) {
    const match = clause.match(
      /^(?:(Mo|Tu|We|Th|Fr|Sa|Su)(?:-(Mo|Tu|We|Th|Fr|Sa|Su))?\s+)?(off|\d{2}:\d{2}-\d{2}:\d{2})$/
    );
    if (!match) return null;
    let applies = true;
    if (match[1]) {
      const start = weekdays.indexOf(match[1]),
        end = weekdays.indexOf(match[2] || match[1]),
        n = weekdays.indexOf(day);
      applies = start <= end ? n >= start && n <= end : n >= start || n <= end;
    }
    if (!applies) continue;
    // A matching explicit closure must override an earlier general rule.
    if (match[3] === 'off') return [];
    if (match[3].split('-').some((t) => Number(t.slice(3)) > 59 || Number(t.slice(0, 2)) > 24))
      return null;
    const [start, end] = match[3]
      .split('-')
      .map((t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)));
    if (start >= end || end > 1440) return null;
    windows.push([start, end]);
  }
  return windows.sort((a, b) => a[0] - b[0]);
}
function dateAt(start, index) {
  if (!start) return null;
  const d = new Date(`${start}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + index);
  return d.toISOString().slice(0, 10);
}
export function buildPlan(places, prefs, center, weather) {
  const remaining = [...places],
    days = [];
  const limit = Math.min(prefs.hours * 60, 720),
    startMinute = 9 * 60;
  const budget =
    prefs.totalBudget == null
      ? prefs.dailyBudget
      : Math.min(prefs.dailyBudget, prefs.totalBudget / prefs.days);
  for (let i = 0; i < prefs.days; i++) {
    const date = dateAt(prefs.startDate, i),
      forecast = date || i === 0 ? relevantForecast(weather, date) : null;
    const day = {
      number: i + 1,
      date,
      stops: [],
      minutes: 0,
      forecast: date || i === 0 ? forecast : null,
      knownCost: 0,
      currency: prefs.currency,
      unknownCosts: 0
    };
    let current = center,
      elapsed = 0;
    // Seed each day near the best remaining recommendation, then use nearest
    // neighbors. A growing distance penalty keeps each day's visits clustered.
    const target = Math.min(
      prefs.pace === 'packed' ? 7 : prefs.pace === 'relaxed' ? 4 : 5,
      Math.max(1, Math.ceil(remaining.length / (prefs.days - i)))
    );
    while (remaining.length && day.stops.length < target) {
      const options = remaining
        .map((p, index) => ({ p, index, km: distanceKm(current, p) }))
        .sort((a, b) => a.km - b.km);
      let choice = null;
      for (const item of options) {
        const p = item.p;
        if (
          (p.price.amount ?? 0) > 0 &&
          p.price.currency === prefs.currency &&
          day.knownCost + p.price.amount > budget
        )
          continue;
        const activity = duration(p, prefs.pace),
          travel = travelEstimate(current, p, prefs.transport);
        const buffer = travel.minutes ?? travel.reserve;
        const windows = openingWindow(p.hours, date);
        let start = startMinute + elapsed + buffer;
        if (windows) {
          const slot = windows.find(([a, b]) => Math.max(a, start) + activity <= b);
          if (!slot) continue;
          start = Math.max(start, slot[0]);
        }
        if (start + activity > startMinute + limit) continue;
        const weatherPenalty = forecast && forecast.rain >= 50 && p.setting === 'outdoor' ? 5 : 0;
        const mealPenalty =
          p.category === 'food' && day.stops.some((s) => s.place.category === 'food') ? 4 : 0;
        const score = item.km + weatherPenalty + mealPenalty + item.index * 0.015;
        if (!choice || score < choice.score)
          choice = { ...item, score, activity, travel, start, hoursChecked: Boolean(windows) };
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
      if (
        p.price.amount === 0 ||
        (p.price.kind === 'reported' && p.price.currency === prefs.currency)
      )
        day.knownCost += p.price.amount;
      else day.unknownCosts++;
      remaining.splice(choice.index, 1);
      current = p;
    }
    day.minutes = elapsed;
    days.push(day);
  }
  const alternatives = remaining.filter((p) => p.setting === 'indoor').slice(0, 4);
  return {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    name: `${center.name || 'Nearby'} ${prefs.mode === 'local' ? 'outing' : 'adventure'}`,
    center,
    preferences: prefs,
    days,
    alternatives,
    unscheduled: remaining.length,
    notes: [
      'Visit durations and travel schedule times are planning estimates. Check live directions before leaving.',
      'Source-reported entry prices can change. Unknown costs, meals, fares, fuel, and accommodation prevent an exact trip total.',
      prefs.transport === 'transit'
        ? 'Transit has a 30-minute scheduling buffer per leg, not a transit-time prediction. Open transit directions for actual service.'
        : 'Open a day to load a Geoapify walking or driving route when available.',
      'Only simple opening-hour rules are checked when a trip date is set. Confirm complex hours and holiday closures with each venue.'
    ]
  };
}
