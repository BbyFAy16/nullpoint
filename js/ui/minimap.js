import { COLORS, hexToRgba } from '../utils/color.js';
import { uiScale, sideColor } from './hud.js';

const MEMORY_MS = 5000;   // last-known enemy markers fade out over this long

export function drawMinimap({ vp, safe }) {
  const s = uiScale(vp);
  const size = 180 * s;
  const x1 = safe.x1;
  const y1 = safe.y1;
  return { x0: x1 - size, y0: y1 - size, x1, y1, size };
}

/** Minimap, drawn in the screen-space shape pass (no text on it). */
export function drawMinimapContent({
  shapes, lines, mm, world, player, fog, visibleEnemies, enemyMemory, now, teams,
}) {
  const { x0, y0, size } = mm;
  const sx = size / world.bounds.w;
  const sy = size / world.bounds.h;
  const toMini = (wx, wy) => ({ x: x0 + wx * sx, y: y0 + wy * sy });

  shapes.roundRect(x0 + size / 2, y0 + size / 2, size / 2, size / 2, 8, hexToRgba('#0b1017', 0.9), 1);

  const wallColor = hexToRgba('#3a4551', 0.9);
  for (const w of world.walls) {
    if (w.isBunker) continue;
    const p = toMini(w.x, w.y);
    const ww = w.w * sx;
    const hh = w.h * sy;
    shapes.rect(p.x + ww / 2, p.y + hh / 2, Math.max(0.6, ww / 2), Math.max(0.6, hh / 2), wallColor, 0.5);
  }

  if (fog) {
    const cellW = size / fog.cols;
    const cellH = size / fog.rows;
    const fogColor = hexToRgba('#05080c', 0.9);
    for (let row = 0; row < fog.rows; row++) {
      for (let col = 0; col < fog.cols; col++) {
        if (fog.seen[row * fog.cols + col]) continue;
        shapes.rect(x0 + col * cellW + cellW / 2, y0 + row * cellH + cellH / 2,
          cellW / 2 + 0.4, cellH / 2 + 0.4, fogColor, 0);
      }
    }
  }

  // Bunkers are fixed structures, so they are always shown.
  for (const b of world.bunkers ?? []) {
    const p = toMini(b.position.x, b.position.y);
    const color = sideColor(teams.squadSide(b.squad));
    if (b.destroyed) {
      lines.line(p.x - 3, p.y - 3, p.x + 3, p.y + 3, 1.5, hexToRgba('#6b7280', 0.9));
      lines.line(p.x - 3, p.y + 3, p.x + 3, p.y - 3, 1.5, hexToRgba('#6b7280', 0.9));
    } else {
      shapes.rect(p.x, p.y, 4, 4, hexToRgba('#05080c', 1), 0.5);
      shapes.rect(p.x, p.y, 3, 3, hexToRgba(color, 0.55 + 0.45 * b.fraction), 0.5);
    }
  }

  // Teammates always; enemies only while visible (plus fading last-known).
  for (const e of world.entities) {
    if (e.state === 'dead') continue;
    const isPlayer = e === player;
    const isAlly = e.team === player.team;
    if (!isPlayer && !isAlly && !visibleEnemies?.has(e.id)) continue;
    const p = toMini(e.position.x, e.position.y);
    const r = isPlayer ? 4 : 3;
    shapes.circle(p.x, p.y, r, hexToRgba(e.color, isPlayer ? 1 : 0.85), 0.7);
    if (isPlayer) shapes.ring(p.x, p.y, r + 3, r + 1, hexToRgba(COLORS.gold, 0.9), 0.7);
  }

  if (enemyMemory) {
    for (const [id, m] of enemyMemory) {
      if (visibleEnemies?.has(id)) continue;
      const age = now - m.seenAt;
      if (age > MEMORY_MS) continue;
      const p = toMini(m.x, m.y);
      shapes.circle(p.x, p.y, 2.5, hexToRgba(COLORS.redTeam, 0.4 * (1 - age / MEMORY_MS)), 0.7);
    }
  }

  shapes.roundRectOutline(x0 + size / 2, y0 + size / 2, size / 2, size / 2, 8, 1.4, hexToRgba('#263140', 1), 1);
}
