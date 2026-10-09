import { segmentAABB } from '../engine/collision.js';
import { hasLineOfSight } from './vision.js';

const TAU = Math.PI * 2;

function wrap(a) {
  while (a > Math.PI) a -= TAU;
  while (a < -Math.PI) a += TAU;
  return a;
}

/** Distance along a ray (angle) to the first wall, capped at `range`. */
function castRay(ox, oy, angle, range, walls) {
  const ex = ox + Math.cos(angle) * range;
  const ey = oy + Math.sin(angle) * range;
  let best = 1;
  for (const w of walls) {
    const t = segmentAABB(ox, oy, ex, ey, w);
    if (t >= 0 && t < best) best = t;
  }
  return best * range;
}

/**
 * Visibility polygon for a cone: `uniform` evenly spaced rays across the FOV
 * plus extra rays just either side of every wall corner inside the cone, so
 * shadow edges follow the geometry exactly instead of being sawtoothed.
 *
 * Returns [{ angle, dist, x, y }, ...] sorted by angle (left -> right).
 */
export function computeVisibility(ox, oy, aim, fov, range, walls, uniform = 64) {
  const half = fov / 2;
  const angles = [];
  for (let i = 0; i <= uniform; i++) angles.push(-half + (fov * i) / uniform);

  const EPS = 0.0007;
  for (const w of walls) {
    const corners = [
      [w.x, w.y], [w.x + w.w, w.y], [w.x, w.y + w.h], [w.x + w.w, w.y + w.h],
    ];
    for (const [cx, cy] of corners) {
      const dx = cx - ox;
      const dy = cy - oy;
      if (dx * dx + dy * dy > range * range) continue;
      const rel = wrap(Math.atan2(dy, dx) - aim);
      if (rel < -half - EPS || rel > half + EPS) continue;
      angles.push(rel - EPS, rel, rel + EPS);
    }
  }

  angles.sort((a, b) => a - b);
  const out = [];
  for (const rel of angles) {
    if (rel < -half || rel > half) continue;
    const a = aim + rel;
    const dist = castRay(ox, oy, a, range, walls);
    out.push({ angle: a, dist, x: ox + Math.cos(a) * dist, y: oy + Math.sin(a) * dist });
  }
  return out;
}

/** Is a single point inside the observer's cone with clear line of sight? */
export function pointInCone(observer, x, y, range, walls) {
  const dx = x - observer.position.x;
  const dy = y - observer.position.y;
  if (dx * dx + dy * dy > range * range) return false;
  const rel = wrap(Math.atan2(dy, dx) - observer.aim);
  if (Math.abs(rel) > (observer.visionFov ?? 1.22) / 2) return false;
  return hasLineOfSight(observer.position.x, observer.position.y, x, y, walls);
}

/**
 * Can `observer` see any part of `target`? Tests the centre and four points
 * on the body edge, so an enemy peeking around a corner is revealed as soon
 * as the drawn cone actually touches them (and not a moment before).
 */
export function canSeeBody(observer, target, range, walls) {
  const { x, y } = target.position;
  const r = (target.radius ?? 22) * 0.85;
  return (
    pointInCone(observer, x, y, range, walls) ||
    pointInCone(observer, x + r, y, range, walls) ||
    pointInCone(observer, x - r, y, range, walls) ||
    pointInCone(observer, x, y + r, range, walls) ||
    pointInCone(observer, x, y - r, range, walls)
  );
}
