import { COLORS, hexToRgba } from '../utils/color.js';
import { uiScale } from './hud.js';

/** Big centre-screen announcement with a dark band behind it. */
export class Banner {
  constructor() {
    this.text = null;
    this.subtext = null;
    this.color = '#ffffff';
    this.bornAt = 0;
    this.duration = 0;
    this._a = 0;
    this._geom = null;
  }

  show({ text, subtext = null, duration = 2600, color = '#ffffff' }) {
    this.text = text;
    this.subtext = subtext;
    this.color = color;
    this.bornAt = performance.now();
    this.duration = duration;
  }

  clear() { this.text = null; }

  isVisible(now) {
    return this.text && (now - this.bornAt) < this.duration;
  }

  prepare(vp) {
    const now = performance.now();
    this._geom = null;
    if (!this.isVisible(now)) return;
    const s = uiScale(vp);
    const age = now - this.bornAt;
    const alpha = Math.max(0, Math.min(1, age / 250, (this.duration - age) / 350));
    const slide = (1 - Math.min(1, age / 300)) * 18 * s;
    this._geom = {
      s, alpha, cx: vp.cssW / 2, cy: vp.cssH * 0.27 + slide,
      bandH: (this.subtext ? 96 : 70) * s, w: vp.cssW,
    };
  }

  drawShapes(shapes) {
    const g = this._geom;
    if (!g) return;
    shapes.rect(g.cx, g.cy + (this.subtext ? 14 * g.s : 0), g.w / 2, g.bandH / 2, hexToRgba('#05080c', 0.62 * g.alpha), 1);
    shapes.rect(g.cx, g.cy + (this.subtext ? 14 * g.s : 0) - g.bandH / 2, g.w / 2, 1.2, hexToRgba(this.color, 0.7 * g.alpha), 1);
    shapes.rect(g.cx, g.cy + (this.subtext ? 14 * g.s : 0) + g.bandH / 2, g.w / 2, 1.2, hexToRgba(this.color, 0.7 * g.alpha), 1);
  }

  drawText(text) {
    const g = this._geom;
    if (!g) return;
    text.draw(this.text, g.cx, g.cy, 40 * g.s, hexToRgba(this.color, g.alpha), 'inter', 'center', 'middle');
    if (this.subtext) {
      text.draw(this.subtext, g.cx, g.cy + 38 * g.s, 17 * g.s, hexToRgba(COLORS.textDim, g.alpha), 'mono', 'center', 'middle');
    }
  }
}

export class KillConfirmBanner extends Banner {
  prepare(vp) {
    const now = performance.now();
    this._geom = null;
    if (!this.isVisible(now)) return;
    const s = uiScale(vp);
    const age = now - this.bornAt;
    this._geom = {
      s, cx: vp.cssW / 2, cy: vp.cssH * 0.4,
      alpha: Math.max(0, Math.min(1, age / 120, (this.duration - age) / 280)),
    };
  }

  drawShapes() {}

  drawText(text) {
    const g = this._geom;
    if (!g) return;
    text.draw(this.text, g.cx, g.cy, 22 * g.s, hexToRgba('#fbbf24', g.alpha), 'inter', 'center', 'middle');
  }
}
