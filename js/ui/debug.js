import { hexToRgba } from '../utils/color.js';
import { uiScale } from './hud.js';

export const DEBUG = {
  enabled: false,
  showVision: true, showPaths: true, showCover: true, showLanes: true,
  showNavGrid: false, showActions: true, showStats: true,
  _fps: [],
};

export function toggleDebugKey(code) {
  const map = {
    Digit1: 'showVision', Digit2: 'showPaths', Digit3: 'showCover', Digit4: 'showLanes',
    Digit5: 'showNavGrid', Digit6: 'showActions', Digit7: 'showStats',
  };
  if (code === 'F3') { DEBUG.enabled = !DEBUG.enabled; return; }
  if (DEBUG.enabled && map[code]) DEBUG[map[code]] = !DEBUG[map[code]];
}

const teamColor = (t, a) => hexToRgba(t === 'WARDEN' ? '#3b82f6' : '#ef4444', a);

export function drawDebugWorld({ shapes, lines, match }) {
  if (!DEBUG.enabled) return;
  const { world, navgrid, cover } = match;

  if (DEBUG.showNavGrid) {
    const c = hexToRgba('#22c55e', 0.08);
    for (let r = 0; r < navgrid.rows; r++) for (let q = 0; q < navgrid.cols; q++) {
      if (navgrid.grid[r * navgrid.cols + q] === 0) {
        const x = q * navgrid.cellSize, y = r * navgrid.cellSize, s = navgrid.cellSize;
        lines.line(x, y, x + s, y + s, 1, c); lines.line(x + s, y, x, y + s, 1, c);
      }
    }
  }
  if (DEBUG.showLanes) {
    for (const team of ['WARDEN', 'BREAKER']) {
      for (const wps of Object.values(world.lanes?.[team] ?? {})) {
        for (let i = 0; i < wps.length - 1; i++) lines.line(wps[i].x, wps[i].y, wps[i + 1].x, wps[i + 1].y, 2, teamColor(team, 0.25));
      }
    }
  }
  if (DEBUG.showCover) {
    for (const cp of cover.points) shapes.circle(cp.position.x, cp.position.y, 4, hexToRgba('#a855f7', 0.55), 0.7);
  }
  if (DEBUG.showPaths) {
    for (const e of world.entities) {
      if (!e.ai?.path || e.ai.path.length < 2) continue;
      let px = e.position.x, py = e.position.y;
      for (let i = e.ai.waypointIndex; i < e.ai.path.length; i++) {
        lines.line(px, py, e.ai.path[i].x, e.ai.path[i].y, 2, teamColor(e.team, 0.6));
        px = e.ai.path[i].x; py = e.ai.path[i].y;
      }
      if (e.ai.breachSpot) {
        const b = e.ai.breachSpot;
        lines.line(b.x - 8, b.y - 8, b.x + 8, b.y + 8, 2, hexToRgba('#f97316', 0.9));
        lines.line(b.x - 8, b.y + 8, b.x + 8, b.y - 8, 2, hexToRgba('#f97316', 0.9));
      }
    }
  }
  if (DEBUG.showVision) {
    const half = (70 * Math.PI) / 360;
    for (const e of world.entities) {
      if (!e.ai || e.state === 'dead') continue;
      const range = (e.range || 800) * 1.6;
      for (const a of [e.aim - half, e.aim + half]) {
        lines.line(e.position.x, e.position.y, e.position.x + Math.cos(a) * range, e.position.y + Math.sin(a) * range, 1.5, teamColor(e.team, 0.28));
      }
    }
  }
}

export function drawDebugText({ text, vp, match }) {
  if (!DEBUG.enabled) return;
  const s = uiScale(vp);
  const avg = DEBUG._fps.reduce((a, b) => a + b, 0) / Math.max(1, DEBUG._fps.length);
  const out = [
    `F3 DEBUG  ${avg > 0 ? Math.round(1 / avg) : 0} FPS`,
    `Entities ${match.world.entities.length}  Bullets ${match.combat.bullets.length}`,
    `Mode ${match.mode.id}  Round ${match.rounds.round}`,
    `1 cones ${DEBUG.showVision}  2 paths ${DEBUG.showPaths}  3 cover ${DEBUG.showCover}`,
    `4 lanes ${DEBUG.showLanes}  5 nav ${DEBUG.showNavGrid}  6 labels ${DEBUG.showActions}`,
  ];
  let y = vp.cssH * 0.33;
  for (const line of out) { text.draw(line, 12, y, 11 * s, hexToRgba('#e5e7eb', 0.9), 'mono', 'left', 'top'); y += 15 * s; }
  if (DEBUG.showStats) {
    const bx = vp.cssW - 330 * s;
    let by = vp.cssH * 0.33;
    text.draw('BOT STATE', bx, by, 11 * s, hexToRgba('#94a3b8', 0.9), 'mono', 'left', 'top');
    by += 15 * s;
    for (const e of match.world.entities) {
      if (!e.ai) continue;
      const line = `${e.id.padEnd(10)} ${(e.ai.currentActionName || '-').padEnd(9)} ${String(Math.round(e.health)).padStart(3)} ${e.objectiveJob?.[0] ?? ''}`;
      text.draw(line, bx, by, 10 * s, hexToRgba('#e5e7eb', 0.85), 'mono', 'left', 'top');
      by += 13 * s;
    }
  }
}
