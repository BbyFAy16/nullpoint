import { segmentWalls } from '../engine/collision.js';

/**
 * Returns true if there's clear line of sight from A to B
 * (no walls block the segment).
 */
export function hasLineOfSight(ax, ay, bx, by, walls) {
  const hit = segmentWalls(ax, ay, bx, by, walls);
  return hit === null;
}

/**
 * Find the nearest visible enemy from `seeker` within `range`.
 * Returns { enemy, distance } or null.
 */
export function findNearestVisibleEnemy(seeker, enemies, walls, range) {
  let best = null;
  let bestDist = Infinity;
  for (const e of enemies) {
    if (e.state === 'dead') continue;
    const dx = e.position.x - seeker.position.x;
    const dy = e.position.y - seeker.position.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > range * range) continue;

    if (!hasLineOfSight(
      seeker.position.x, seeker.position.y,
      e.position.x, e.position.y,
      walls
    )) continue;

    if (d2 < bestDist) {
      bestDist = d2;
      best = e;
    }
  }
  if (!best) return null;
  return { enemy: best, distance: Math.sqrt(bestDist) };
}