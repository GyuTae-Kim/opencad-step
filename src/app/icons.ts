/**
 * 선 아이콘(24×24, stroke = currentColor). 이 앱을 위해 새로 그린 단순한 모양이다.
 */
export const ICONS = {
  open: '<path d="M3 7.5V18a1.5 1.5 0 0 0 1.5 1.5h15A1.5 1.5 0 0 0 21 18V9.5A1.5 1.5 0 0 0 19.5 8H12l-2-2.5H4.5A1.5 1.5 0 0 0 3 7Z"/>',
  sample: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z"/>',
  apps: '<rect x="4" y="4" width="6" height="6" rx="1"/><rect x="14" y="4" width="6" height="6" rx="1"/><rect x="4" y="14" width="6" height="6" rx="1"/><rect x="14" y="14" width="6" height="6" rx="1"/>',
  code: '<path d="m8 7-5 5 5 5M16 7l5 5-5 5M13.5 4.5l-3 15"/>',
  fit: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/><rect x="8.5" y="8.5" width="7" height="7" rx="1"/>',
  focus: '<circle cx="11" cy="11" r="6.5"/><path d="m16 16 4.5 4.5"/><path d="M11 8v6M8 11h6"/>',
  views: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/><path d="M12 12 4 7.5" stroke-dasharray="1.5 2"/>',
  perspective: '<path d="M6 6h12l3 12H3Z"/><path d="M9.5 6 8 18M14.5 6 16 18"/>',
  ortho: '<rect x="4" y="6" width="16" height="12" rx="1"/><path d="M9.3 6v12M14.7 6v12"/>',
  shade: '<circle cx="12" cy="12" r="8"/><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" opacity=".45"/>',
  grid: '<path d="M3 8h18M3 16h18M8 3v18M16 3v18"/>',
  cube: '<path d="M12 3 20 7.5v9L12 21l-8-4.5v-9Z"/><path d="M4 7.5 12 12l8-4.5M12 12v9"/>',
  axes: '<path d="M5 19V5M5 19h14M5 19l-3 3"/><path d="m3 7 2-2 2 2M17 17l2 2-2 2"/>',
  measure: '<path d="m3 16 13-13 5 5L8 21Z"/><path d="m7 12 2 2M10 9l2 2M13 6l2 2"/>',
  image: '<rect x="3" y="4.5" width="18" height="15" rx="1.5"/><circle cx="8.5" cy="9.5" r="1.8"/><path d="m21 16-5-5-9 8.5"/>',
  panel: '<rect x="3" y="4" width="18" height="16" rx="1.5"/><path d="M15 4v16"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  eyeOff: '<path d="M4 4l16 16M10 6c.6-.3 1.3-.5 2-.5 6 0 9.5 6.5 9.5 6.5a17 17 0 0 1-2.6 3.4M6.3 7.5A16 16 0 0 0 2.5 12S6 18.5 12 18.5c1.6 0 3-.4 4.2-1"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  chevronRight: '<path d="m9 6 6 6-6 6"/>',
  upload: '<path d="M12 15V4M7.5 8.5 12 4l4.5 4.5"/><path d="M4 14v4.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V14"/>',
  lock: '<rect x="5" y="10.5" width="14" height="10" rx="1.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  warn: '<path d="M12 3.5 21.5 20h-19Z"/><path d="M12 10v4.5M12 17.2v.3"/>',
  expand: '<path d="m7 10 5 5 5-5M7 4.5l5 5 5-5" />',
  collapse: '<path d="m7 14 5-5 5 5M7 19.5l5-5 5 5"/>',
} as const;

export type IconName = keyof typeof ICONS;
