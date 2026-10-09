const KEY = 'nullpoint.settings.v1';

export const DEFAULT_SETTINGS = {
  username: 'player_001',
  master: 0.8,          // 0..1
  music: 0.6,
  sfx: 0.9,
  shake: 1.0,           // 0..1.5 multiplier
  damageNumbers: true,
  visionOverlay: true,  // darken everything outside the cone
  minimap: true,
  movementMode: 'classic', // 'classic' (WASD) | 'pointer' (hold W to move toward the cursor)
};

/** localStorage-backed settings with change listeners. Never throws. */
export class Settings {
  constructor() {
    this.values = { ...DEFAULT_SETTINGS };
    this.listeners = new Set();
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Object.assign(this.values, JSON.parse(raw));
    } catch { /* private mode / corrupt json: keep defaults */ }
    this._sanitize();
  }

  _sanitize() {
    const v = this.values;
    for (const k of ['master', 'music', 'sfx']) v[k] = clamp(+v[k], 0, 1, DEFAULT_SETTINGS[k]);
    v.shake = clamp(+v.shake, 0, 1.5, 1);
    v.username = String(v.username || DEFAULT_SETTINGS.username)
      .replace(/[^\w.-]/g, '').slice(0, 16) || DEFAULT_SETTINGS.username;
    for (const k of ['damageNumbers', 'visionOverlay', 'minimap']) v[k] = !!v[k];
    if (!['classic', 'pointer'].includes(v.movementMode)) v.movementMode = DEFAULT_SETTINGS.movementMode;
  }

  get(key) { return this.values[key]; }

  set(patch) {
    Object.assign(this.values, patch);
    this._sanitize();
    try { localStorage.setItem(KEY, JSON.stringify(this.values)); } catch { /* ignore */ }
    for (const fn of this.listeners) fn(this.values, patch);
  }

  reset() { this.set({ ...DEFAULT_SETTINGS }); }

  onChange(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
}

function clamp(n, lo, hi, fallback) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : fallback;
}
