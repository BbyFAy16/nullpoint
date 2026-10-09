import { COLORS, hexToRgba } from '../utils/color.js';
import { uiScale, sideColor, PANEL_BORDER } from './hud.js';

const LIFETIME  = 5.0;
const FADE_OUT  = 0.6;
const MAX_LINES = 5;

/** Right-aligned kill log. Two-phase (shapes, then text) like the HUD. */
export class KillFeed {
  constructor() {
    this.lines = [];
    this.rows = [];
  }

  push(ev, now) {
    this.lines.push({
      attackerName: ev.attackerName || 'UNKNOWN',
      attackerTeam: ev.attackerTeam || 'WARDEN',
      victimName:   ev.victimName   || 'UNKNOWN',
      victimTeam:   ev.victimTeam   || 'BREAKER',
      bornAt: now,
    });
    if (this.lines.length > MAX_LINES) this.lines.shift();
  }

  /** Bunker kills show as "NAME > BUNKER TL". */
  pushBunker(ev, now) {
    this.lines.push({
      attackerName: ev.attackerName || 'UNKNOWN',
      attackerTeam: ev.attackerTeam || 'WARDEN',
      victimName: `BUNKER ${ev.bunker.siteId}`,
      victimTeam: ev.bunker.side,
      bornAt: now,
    });
    if (this.lines.length > MAX_LINES) this.lines.shift();
  }

  clear() { this.lines = []; this.rows = []; }

  update(now) {
    const cutoff = now - LIFETIME * 1000;
    this.lines = this.lines.filter(l => l.bornAt > cutoff);
  }

  prepare(text, vp, safe) {
    const s = uiScale(vp);
    const now = performance.now();
    const size = 13 * s;
    const rowH = 24 * s;
    const padX = 10 * s;
    const arrow = '  >  ';
    let y = safe.y0;
    this.rows = [];
    for (const line of this.lines) {
      const age = (now - line.bornAt) / 1000;
      const alpha = age > LIFETIME - FADE_OUT
        ? Math.max(0, 1 - (age - (LIFETIME - FADE_OUT)) / FADE_OUT) : 1;
      const wA = text.measure(line.attackerName, size, 'inter');
      const wM = text.measure(arrow, size, 'inter');
      const wV = text.measure(line.victimName, size, 'inter');
      const w = wA + wM + wV + padX * 2;
      this.rows.push({ line, alpha, x: safe.x1 - w, y, w, h: rowH - 4 * s, size, padX, wA, wM });
      y += rowH;
    }
  }

  drawShapes(shapes) {
    for (const r of this.rows) {
      shapes.roundRect(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 6,
        hexToRgba('#0b1017', 0.8 * r.alpha), 1);
      shapes.roundRectOutline(r.x + r.w / 2, r.y + r.h / 2, r.w / 2, r.h / 2, 6, 1,
        hexToRgba(PANEL_BORDER, r.alpha), 1);
    }
  }

  drawText(text) {
    for (const r of this.rows) {
      const cy = r.y + r.h / 2;
      let x = r.x + r.padX;
      text.draw(r.line.attackerName, x, cy, r.size, hexToRgba(sideColor(r.line.attackerTeam), r.alpha), 'inter', 'left', 'middle');
      x += r.wA;
      text.draw('  >  ', x, cy, r.size, hexToRgba(COLORS.textDim, r.alpha), 'inter', 'left', 'middle');
      x += r.wM;
      text.draw(r.line.victimName, x, cy, r.size, hexToRgba(sideColor(r.line.victimTeam), r.alpha), 'inter', 'left', 'middle');
    }
  }
}
