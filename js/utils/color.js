// hex "#rrggbb" → [r, g, b] floats 0–1
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  const n = parseInt(h, 16);
  return [
    ((n >> 16) & 255) / 255,
    ((n >> 8) & 255) / 255,
    (n & 255) / 255,
  ];
}

// hex + alpha 0–1 → [r, g, b, a]
export function hexToRgba(hex, alpha = 1) {
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b, alpha];
}

export const COLORS = {
  blueTeam:    '#3b82f6',
  redTeam:     '#ef4444',
  gold:        '#fbbf24',
  dead:        '#4b5563',
  wallFill:    '#1f2937',
  wallEdge:    '#374151',
  floor:       '#0b0f14',
  grid:        '#1a1f26',
  textPrimary: '#ffffff',
  textDim:     '#94a3b8',
  bulletCore:  '#fff8d0',
  hpHigh:      '#22c55e',
  hpMid:       '#eab308',
  hpLow:       '#ef4444',
};