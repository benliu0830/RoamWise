const days = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
export const dayNames = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday'
];
const minutes = (time) => {
  const [h, m] = time.split(':').map(Number);
  return h > 24 || m > 59 || (h === 24 && m !== 0) ? null : h * 60 + m;
};

// Deliberately conservative: holidays, seasonal rules and appointments are not
// guessed. All consumers use the same parser, including the itinerary planner.
export function parseHours(value) {
  if (!value || typeof value !== 'string') return null;
  if (value.trim() === '24/7') return days.map(() => [[0, 1440]]);
  const week = days.map(() => []);
  for (const clause of value.split(';').map((part) => part.trim())) {
    const match = clause.match(
      /^(?:((?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?(?:,(?:Mo|Tu|We|Th|Fr|Sa|Su)(?:-(?:Mo|Tu|We|Th|Fr|Sa|Su))?)*)\s+)?(off|closed|(?:\d{2}:\d{2}-\d{2}:\d{2})(?:,\s*\d{2}:\d{2}-\d{2}:\d{2})*)$/
    );
    if (!match) return null;
    const affected = new Set();
    if (!match[1]) days.forEach((_, i) => affected.add(i));
    else
      for (const segment of match[1].split(',')) {
        const [first, last = first] = segment.split('-');
        let index = days.indexOf(first);
        for (let n = 0; n < 7; n++, index = (index + 1) % 7) {
          affected.add(index);
          if (index === days.indexOf(last)) break;
        }
      }
    if (['off', 'closed'].includes(match[2])) {
      affected.forEach((i) => {
        week[i] = [];
      });
      continue;
    }
    const ranges = [];
    for (const range of match[2].split(',')) {
      const [start, end] = range.trim().split('-').map(minutes);
      if (start == null || end == null || start >= 1440 || start === end) return null;
      ranges.push([start, end < start ? end + 1440 : end]);
    }
    affected.forEach((i) => {
      week[i] = [...week[i], ...ranges].sort((a, b) => a[0] - b[0]);
    });
  }
  return week;
}
export function windowsForDate(hours, date) {
  const week = parseHours(hours);
  const timestamp = Date.parse(`${date}T12:00:00Z`);
  if (!week || !date || !Number.isFinite(timestamp)) return null;
  const day = (new Date(timestamp).getUTCDay() + 6) % 7;
  const carry = week[(day + 6) % 7]
    .filter(([, end]) => end > 1440)
    .map(([, end]) => [0, end - 1440]);
  return [...carry, ...week[day].map(([start, end]) => [start, Math.min(end, 1440)])].sort(
    (a, b) => a[0] - b[0]
  );
}
export function openingStatus(place, fallbackZone, now = new Date()) {
  const timezone = place.timezone || fallbackZone;
  if (!place.hours) return { reliable: false, label: 'Hours unavailable', open: null, today: null };
  const week = parseHours(place.hours);
  if (!week || !timezone)
    return { reliable: false, label: 'Check hours before visiting', open: null, today: null };
  try {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        hourCycle: 'h23'
      })
        .formatToParts(now)
        .map((part) => [part.type, part.value])
    );
    const date = `${parts.year}-${parts.month}-${parts.day}`;
    const minute = Number(parts.hour) * 60 + Number(parts.minute);
    const windows = windowsForDate(place.hours, date);
    const open = windows.some(([start, end]) => minute >= start && minute < end);
    return {
      reliable: true,
      label: open ? 'Open now' : 'Closed now',
      open,
      today: windows.length > 0,
      timezone,
      date,
      windows
    };
  } catch {
    return { reliable: false, label: 'Check hours before visiting', open: null, today: null };
  }
}
export const formatHour = (minute) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
