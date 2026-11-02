import { fetchJson } from './http.js';

export function weatherLabel(code) {
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Foggy';
  if (code <= 67) return 'Rain';
  if (code <= 77) return 'Snow';
  if (code <= 82) return 'Rain showers';
  if (code <= 86) return 'Snow showers';
  return 'Thunderstorms';
}
export async function getWeather(center) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: center.lat,
    longitude: center.lon,
    timezone: 'auto',
    forecast_days: '16',
    current: 'temperature_2m,weather_code',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max'
  });
  const data = await fetchJson(url);
  const days = (data.daily?.time || []).map((date, i) => ({
    date,
    code: data.daily.weather_code[i],
    label: weatherLabel(data.daily.weather_code[i]),
    high: data.daily.temperature_2m_max[i],
    low: data.daily.temperature_2m_min[i],
    rain: data.daily.precipitation_probability_max?.[i] ?? null
  }));
  return {
    timezone: data.timezone,
    current: data.current
      ? {
          temperature: data.current.temperature_2m,
          label: weatherLabel(data.current.weather_code),
          time: data.current.time
        }
      : null,
    days,
    source: 'Open-Meteo'
  };
}
export function relevantForecast(weather, date) {
  return date ? weather?.days?.find((d) => d.date === date) || null : weather?.days?.[0] || null;
}
