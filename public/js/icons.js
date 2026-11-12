const paths = {
  coffee: '<path d="M4 8h12v6a6 6 0 0 1-12 0V8Zm12 1h2a3 3 0 0 1 0 6h-2M3 21h16M7 3v2m5-2v2"/>',
  landmark: '<path d="m3 10 9-7 9 7H3Zm2 0v10m5-10v10m4-10v10m5-10v10M3 21h18"/>',
  museum: '<path d="m3 8 9-5 9 5H3Zm2 3v7m7-7v7m7-7v7M3 21h18M3 18h18"/>',
  food: '<path d="M5 3v6m3-6v6M2 3v6a3 3 0 0 0 6 0M5 12v9M19 3c-4 3-4 9 0 9V3Zm0 9v9"/>',
  leaf: '<path d="M20 3C9 2 2 7 5 15c3 8 15 3 15-12ZM4 21 16 8"/>',
  ticket: '<path d="M3 5h18v5a2 2 0 0 0 0 4v5H3v-5a2 2 0 0 0 0-4V5Zm12 0v3m0 3v2m0 3v3"/>',
  bag: '<path d="M4 7h16l1 14H3L4 7Zm4 0V5a4 4 0 0 1 8 0v2M8 10v1m8-1v1"/>',
  gem: '<path d="m3 8 4-5h10l4 5-9 13L3 8Zm0 0h18M8 3l-1 5 5 13 5-13-1-5"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m16 8-2.5 5.5L8 16l2.5-5.5L16 8Z"/>',
  arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
  back: '<path d="M20 12H4m6-6-6 6 6 6"/>',
  pin: '<path d="M20 10c0 6-8 11-8 11S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  heart:
    '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 21l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 5 5"/>',
  map: '<path d="m3 6 6-3 6 3 6-3v15l-6 3-6-3-6 3V6Zm6-3v15m6-12v15"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/>',
  rain: '<path d="M6 15a5 5 0 1 1 2-9 6 6 0 0 1 11 4 3 3 0 0 1 0 6M8 18l-1 3m6-3-1 3m6-3-1 3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  locate:
    '<circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/><path d="M12 2v4m0 12v4M2 12h4m14 0h4"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  route:
    '<circle cx="6" cy="5" r="2"/><circle cx="18" cy="19" r="2"/><path d="M6 7v7a4 4 0 0 0 4 4h6M8 5h6a4 4 0 0 1 0 8h-4"/>',
  globe:
    '<circle cx="12" cy="12" r="9"/><ellipse cx="12" cy="12" rx="4" ry="9"/><path d="M3 12h18"/>',
  external: '<path d="M14 3h7v7m0-7L10 14m-1-9H4v15h15v-5"/>',
  'zoom-in': '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6m-3-3v6"/>',
  'zoom-out': '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6M7 10h6"/>',
  fit: '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/><circle cx="12" cy="12" r="3"/>',
  fullscreen: '<path d="M3 9V3h6m6 0h6v6M3 15v6h6m6 0h6v-6"/>',
  wallet: '<path d="M20 7H5a2 2 0 0 1 0-4h12v4M3 5v14a2 2 0 0 0 2 2h15V7m-4 5h5v5h-5v-5Z"/>'
};
export const icon = (name, cls = '') =>
  `<svg class="icon ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.compass}</svg>`;
