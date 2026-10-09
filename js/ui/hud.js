import { COLORS, hexToRgba } from '../utils/color.js';

export function uiScale(vp) {
  const min = Math.min(vp.cssW, vp.cssH);
  return Math.max(0.85, Math.min(1.8, min / 900));
}

export function safeRect(vp) {
  const inset = 10;
  return {
    x0: inset,
    y0: inset,
    x1: vp.cssW - inset,
    y1: vp.cssH - inset,
    w: vp.cssW - inset * 2,
    h: vp.cssH - inset * 2,
  };
}

export const PANEL_FILL = '#0b1017';
export const PANEL_BORDER = '#263140';

export function sideColor(side) {
  return side === 'WARDEN' ? COLORS.blueTeam : COLORS.redTeam;
}

/** Truncate with '...' so text never spills out of its box. */
export function fitText(text, str, maxWidth, sizePx, fontName) {
  if (text.measure(str, sizePx, fontName) <= maxWidth) return str;
  let s = str;
  while (s.length > 1 && text.measure(s + '...', sizePx, fontName) > maxWidth) {
    s = s.slice(0, -1);
  }
  return s + '...';
}

/** Rounded dark panel with a 1px border. Draw BEFORE any text on top of it. */
export function panel(shapes, x, y, w, h, { radius = 8, fill = PANEL_FILL, alpha = 0.88, border = PANEL_BORDER, accent = null } = {}) {
  shapes.roundRect(x + w / 2, y + h / 2, w / 2, h / 2, radius, hexToRgba(fill, alpha), 1);
  if (border) {
    shapes.roundRectOutline(x + w / 2, y + h / 2, w / 2, h / 2, radius, 1.2, hexToRgba(border, 0.95), 1);
  }
  if (accent) {
    shapes.roundRect(x + w / 2, y + 1.5, w / 2 - radius * 0.6, 1.5, 1, hexToRgba(accent, 0.9), 1);
  }
}

function clock(secs) {
  return `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(secs % 60).padStart(2, '0')}`;
}

/**
 * Screen-space HUD. Two-phase so nothing is ever painted over text:
 *   hud.update(...)       compute layout from the current state
 *   hud.drawShapes(...)   panels, bars, pips, arrows   (drawn first)
 *   hud.drawText(...)     every label                   (drawn last)
 */
export class HUD {
  constructor() {
    this.L = null;
    this.portraitRect = { x: 0, y: 0, w: 0, h: 0 };
  }

  update({ vp, match, now, camera }) {
    const s = uiScale(vp);
    const safe = safeRect(vp);
    const player = match.player;
    const rounds = match.rounds;
    const hudState = match.mode.getHudState(match, now);

    // ---------------- top scoreboard ----------------
    const W = Math.min(vp.cssW - 24, 560 * s);
    const H = 64 * s;
    const top = { x: vp.cssW / 2 - W / 2, y: safe.y0, w: W, h: H, timerW: 132 * s };

    const squads = ['ALPHA', 'OMEGA'].map((id) => {
      const side = match.teams.squadSide(id);
      return {
        id,
        side,
        color: sideColor(side),
        alive: match.teams.squadMembers(id).map(m => m.state === 'alive'),
        score: hudState.scores[id],
        isPlayer: id === player.squad,
      };
    });

    let timeStr;
    let timerDim = false;
    let infoLine = hudState.infoLine;
    let urgent = false;
    if (rounds.state === 'COMBAT') {
      const secs = Math.max(0, Math.ceil(rounds.getCombatTimeRemainingMs(now) / 1000));
      timeStr = clock(secs);
      urgent = secs <= 10;
    } else if (rounds.state === 'FREEZE') {
      timeStr = clock(rounds.combatSeconds);
      timerDim = true;
      infoLine = `GET READY ${Math.ceil(rounds.getFreezeRemainingMs(now) / 1000)}`;
    } else if (rounds.state === 'ROUND_END') {
      timeStr = '--:--';
      timerDim = true;
      infoLine = 'ROUND OVER';
    } else {
      timeStr = 'FINAL';
      timerDim = true;
      infoLine = 'MATCH OVER';
    }

    // ---------------- character card ----------------
    const cardW = Math.min(310 * s, vp.cssW * 0.55);
    const cardH = 126 * s;
    const cardX = safe.x0;
    const cardY = safe.y1 - cardH;
    const pad = 12 * s;
    const portrait = 80 * s;
    const colX = cardX + pad + portrait + 14 * s;
    const colW = cardX + cardW - pad - colX;
    this.portraitRect = { x: cardX + pad, y: cardY + pad, w: portrait, h: portrait };

    const hpPct = Math.max(0, player.health / player.maxHealth);
    const hpColor = hpPct > 0.5 ? COLORS.hpHigh : hpPct > 0.25 ? COLORS.hpMid : COLORS.hpLow;
    let reloadPct = null;
    if (player.reloading) {
      const total = player.reloadTime || 1500;
      reloadPct = Math.max(0, Math.min(1, 1 - (player.reloadEndsAt - now) / total));
    }

    // ---------------- off-screen objective arrows ----------------
    const arrows = [];
    if (match.world.bunkers?.length && camera) {
      const margin = 34 * s;
      for (const b of match.world.bunkers) {
        if (b.destroyed) continue;
        const mine = b.squad === player.squad;
        const attacked = mine && b.lastHitAt > 0 && now - b.lastHitAt < 4000;
        if (mine && !attacked) continue;           // only warn about own bunkers under fire
        const sx = vp.cssW / 2 + (b.position.x - camera.position.x) * camera.zoom / vp.dpr;
        const sy = vp.cssH / 2 + (b.position.y - camera.position.y) * camera.zoom / vp.dpr;
        const onScreen = sx > margin && sx < vp.cssW - margin && sy > margin && sy < vp.cssH - margin;
        if (onScreen) continue;
        const dx = sx - vp.cssW / 2;
        const dy = sy - vp.cssH / 2;
        const k = Math.min(
          (vp.cssW / 2 - margin) / Math.abs(dx || 1e-6),
          (vp.cssH / 2 - margin) / Math.abs(dy || 1e-6)
        );
        arrows.push({
          x: vp.cssW / 2 + dx * k,
          y: vp.cssH / 2 + dy * k,
          angle: Math.atan2(dy, dx),
          color: sideColor(match.teams.squadSide(b.squad)),
          fraction: b.fraction,
          attacked,
          mine,
          label: b.siteId,
        });
      }
    }

    this.L = {
      s, vp, safe, now, top, squads, timeStr, timerDim, infoLine, urgent, hudState,
      card: {
        x: cardX, y: cardY, w: cardW, h: cardH, pad, colX, colW,
        hpPct, hpColor, reloadPct, player,
      },
      arrows,
    };
    return this.L;
  }

  // ------------------------------------------------------------
  // SHAPES
  // ------------------------------------------------------------
  drawShapes(shapes, lines) {
    const L = this.L;
    if (!L) return;
    const { s, top, card } = L;
    const blockW = (top.w - top.timerW) / 2;
    const midX = top.x + top.w / 2;
    const midY = top.y + top.h / 2;

    // ---- scoreboard ----
    panel(shapes, top.x, top.y, top.w, top.h, { radius: 10 * s });
    for (let i = 0; i < 2; i++) {
      const x = i === 0 ? top.x + 6 * s : top.x + top.w - 6 * s;
      shapes.roundRect(x, midY, 2.2 * s, top.h / 2 - 12 * s, 1.5, hexToRgba(L.squads[i].color, 0.95), 1);
    }
    shapes.roundRect(midX, midY, top.timerW / 2 - 4 * s, top.h / 2 - 7 * s, 8 * s, hexToRgba('#05080c', 0.7), 1);
    if (L.urgent) {
      const pulse = 0.35 + 0.35 * Math.sin(L.now / 110);
      shapes.roundRectOutline(midX, midY, top.timerW / 2 - 4 * s, top.h / 2 - 7 * s, 8 * s, 1.6,
        hexToRgba(COLORS.hpLow, 0.4 + pulse), 1);
    }

    // alive pips, packed toward the timer
    L.squads.forEach((sq, i) => {
      const pipR = 4 * s;
      const gap = 12 * s;
      const total = sq.alive.length;
      const cy = top.y + top.h - 13 * s;
      const edge = i === 0 ? top.x + blockW - 16 * s - pipR : top.x + top.w - blockW + 16 * s + pipR;
      sq.alive.forEach((alive, k) => {
        const px = i === 0 ? edge - (total - 1 - k) * gap : edge + k * gap;
        if (alive) shapes.circle(px, cy, pipR, hexToRgba(sq.color, 1), 1);
        else shapes.ring(px, cy, pipR, pipR - 1.4, hexToRgba('#3a4655', 1), 1);
      });
    });

    // side chips under the squad names
    const chipW = 56 * s;
    const chipH = 15 * s;
    L.squads.forEach((sq, i) => {
      const x = i === 0 ? top.x + 18 * s : top.x + top.w - 18 * s - chipW;
      const y = top.y + 36 * s;
      shapes.roundRect(x + chipW / 2, y + chipH / 2, chipW / 2, chipH / 2, 4 * s, hexToRgba(sq.color, 0.2), 1);
      shapes.roundRectOutline(x + chipW / 2, y + chipH / 2, chipW / 2, chipH / 2, 4 * s, 1, hexToRgba(sq.color, 0.9), 1);
    });

    // bunker bars under the scoreboard
    if (L.hudState.bunkers) {
      L.squads.forEach((sq, i) => {
        const list = L.hudState.bunkers[sq.id] ?? [];
        const barW = 46 * s;
        const barH = 7 * s;
        const gap = 6 * s;
        const total = list.length * barW + (list.length - 1) * gap;
        const startX = i === 0 ? top.x + 18 * s : top.x + top.w - 18 * s - total;
        const y = top.y + top.h + 8 * s;
        list.forEach((b, k) => {
          const x = startX + k * (barW + gap);
          shapes.roundRect(x + barW / 2, y + barH / 2, barW / 2, barH / 2, 3 * s, hexToRgba('#05080c', 0.85), 1);
          if (b.fraction > 0) {
            const fw = barW * b.fraction;
            shapes.roundRect(x + fw / 2, y + barH / 2, fw / 2, barH / 2, 3 * s, hexToRgba(sq.color, 0.95), 1);
          }
          shapes.roundRectOutline(x + barW / 2, y + barH / 2, barW / 2, barH / 2, 3 * s, 1,
            hexToRgba(b.destroyed ? '#ef4444' : '#2f3b4b', 0.9), 1);
        });
      });
    }

    // ---- character card ----
    panel(shapes, card.x, card.y, card.w, card.h, { radius: 10 * s, accent: card.player.color });
    const pr = this.portraitRect;
    shapes.roundRect(pr.x + pr.w / 2, pr.y + pr.h / 2, pr.w / 2, pr.h / 2, 8 * s, hexToRgba('#141b25', 1), 1);
    shapes.roundRectOutline(pr.x + pr.w / 2, pr.y + pr.h / 2, pr.w / 2, pr.h / 2, 8 * s, 1.4,
      hexToRgba(card.player.color, 0.9), 1);

    const barY = card.y + 74 * s;
    const barH = 8 * s;
    shapes.roundRect(card.colX + card.colW / 2, barY + barH / 2, card.colW / 2, barH / 2, 4 * s, hexToRgba('#05080c', 0.95), 1);
    if (card.hpPct > 0) {
      const fw = Math.max(barH, card.colW * card.hpPct);
      shapes.roundRect(card.colX + fw / 2, barY + barH / 2, fw / 2, barH / 2, 4 * s, hexToRgba(card.hpColor, 1), 1);
    }
    if (card.reloadPct !== null) {
      const ry = card.y + 104 * s;
      shapes.roundRect(card.colX + card.colW / 2, ry, card.colW / 2, 1.8 * s, 1, hexToRgba('#05080c', 0.9), 1);
      const rw = Math.max(2, card.colW * card.reloadPct);
      shapes.roundRect(card.colX + rw / 2, ry, rw / 2, 1.8 * s, 1, hexToRgba(COLORS.gold, 1), 1);
    }

    // ---- objective arrows ----
    for (const a of L.arrows) {
      const size = 13 * s;
      const pulse = a.attacked ? 0.6 + 0.4 * Math.sin(L.now / 90) : 0.95;
      const c = a.mine ? [1, 0.82, 0.2, pulse] : hexToRgba(a.color, pulse);
      const cos = Math.cos(a.angle);
      const sin = Math.sin(a.angle);
      const tip = { x: a.x + cos * size, y: a.y + sin * size };
      const l = { x: a.x - cos * size * 0.7 - sin * size * 0.8, y: a.y - sin * size * 0.7 + cos * size * 0.8 };
      const r = { x: a.x - cos * size * 0.7 + sin * size * 0.8, y: a.y - sin * size * 0.7 - cos * size * 0.8 };
      lines.filledPolygon([tip, l, r], c);
      const bx = a.x - cos * size * 1.9;
      const by = a.y - sin * size * 1.9;
      shapes.circle(bx, by, 10 * s, hexToRgba('#0b1017', 0.9), 1);
      shapes.arc(bx, by, 10 * s, 7.5 * s, -Math.PI / 2, Math.PI * 2 * Math.max(0.02, a.fraction), c, 1);
    }
  }

  // ------------------------------------------------------------
  // TEXT
  // ------------------------------------------------------------
  drawText(text) {
    const L = this.L;
    if (!L) return;
    const { s, top, card } = L;
    const blockW = (top.w - top.timerW) / 2;
    const white = hexToRgba('#ffffff', 1);
    const dim = hexToRgba(COLORS.textDim, 0.95);
    const cx = top.x + top.w / 2;

    // ---- timer block ----
    const timerColor = L.urgent ? hexToRgba(COLORS.hpLow, 1)
      : L.timerDim ? hexToRgba('#7b8798', 1) : white;
    text.draw(L.timeStr, cx, top.y + 26 * s, 30 * s, timerColor, 'mono', 'center', 'middle');
    text.draw(L.infoLine, cx, top.y + 48 * s, 10.5 * s, dim, 'inter', 'center', 'middle');

    // ---- squads ----
    const chipW = 56 * s;
    L.squads.forEach((sq, i) => {
      const left = i === 0;
      const nameX = left ? top.x + 18 * s : top.x + top.w - 18 * s;
      const align = left ? 'left' : 'right';
      text.draw(sq.id, nameX, top.y + 20 * s, 15 * s, white, 'inter', align, 'middle');
      if (sq.isPlayer) {
        const nameW = text.measure(sq.id, 15 * s, 'inter');
        text.draw('YOU', left ? nameX + nameW + 7 * s : nameX - nameW - 7 * s, top.y + 20 * s,
          9.5 * s, hexToRgba(COLORS.gold, 1), 'inter', align, 'middle');
      }
      const chipX = left ? top.x + 18 * s + chipW / 2 : top.x + top.w - 18 * s - chipW / 2;
      text.draw(sq.side ?? '', chipX, top.y + 36 * s + 7.5 * s, 9.5 * s, hexToRgba(sq.color, 1), 'inter', 'center', 'middle');
      const scoreX = left ? top.x + blockW - 16 * s : top.x + top.w - blockW + 16 * s;
      text.draw(String(sq.score), scoreX, top.y + 26 * s, 30 * s, hexToRgba(sq.color, 1), 'mono',
        left ? 'right' : 'left', 'middle');
    });

    const goalY = top.y + top.h + (L.hudState.bunkers ? 30 : 12) * s;
    text.draw(L.hudState.goalLine, cx, goalY, 9.5 * s, hexToRgba(COLORS.textDim, 0.7), 'inter', 'center', 'middle');

    // ---- character card ----
    const p = card.player;
    text.draw(fitText(text, p.name, card.colW, 19 * s, 'inter'),
      card.colX, card.y + card.pad + 2 * s, 19 * s, white, 'inter', 'left', 'top');
    text.draw(fitText(text, `${p.className} | ${p.subclass}`, card.colW, 11.5 * s, 'inter'),
      card.colX, card.y + 40 * s, 11.5 * s, dim, 'inter', 'left', 'top');

    text.draw('HP', card.colX, card.y + 62 * s, 10 * s, hexToRgba(COLORS.textDim, 0.8), 'inter', 'left', 'middle');
    text.draw(`${Math.max(0, Math.round(p.health))} / ${p.maxHealth}`,
      card.colX + card.colW, card.y + 62 * s, 12 * s, white, 'mono', 'right', 'middle');

    text.draw(p.reloading ? 'RELOADING' : 'AMMO', card.colX, card.y + 94 * s, 10 * s,
      p.reloading ? hexToRgba(COLORS.gold, 1) : hexToRgba(COLORS.textDim, 0.8), 'inter', 'left', 'middle');
    text.draw(`${p.ammo} / ${p.magSize}`, card.colX + card.colW, card.y + 94 * s, 14 * s,
      p.ammo <= p.magSize * 0.2 ? hexToRgba(COLORS.hpLow, 1) : white, 'mono', 'right', 'middle');

    text.draw(fitText(text, `@${p.username}`, card.colW, 10 * s, 'inter'),
      card.colX, card.y + card.h - 8 * s, 10 * s, hexToRgba(COLORS.textDim, 0.55), 'inter', 'left', 'baseline');

    // ---- arrow labels ----
    for (const a of L.arrows) {
      const size = 13 * s;
      text.draw(a.label, a.x - Math.cos(a.angle) * size * 1.9, a.y - Math.sin(a.angle) * size * 1.9,
        8.5 * s, white, 'inter', 'center', 'middle');
    }
  }
}
