/**
 * CoverPoint — a spot a bot can stand next to a wall to avoid fire
 * from a given direction.
 *
 *   position      { x, y } — where to stand
 *   facing        radians  — the direction the cover protects against
 *                             (bot should face this way to be "in cover")
 *   peekDirection radians  — where the bot can peek out to fire
 *   quality       0..1     — 1 = great cover (wall on 3 sides), 0.3 = thin cover
 *   size          number   — length of the wall segment this was derived from
 */
export function buildCoverPoints(walls, bounds, opts = {}) {
  const {
    offset    = 36,       // distance from the wall face to the cover spot
    minLength = 64,       // ignore walls shorter than this
    quality   = 0.7,      // baseline quality (overridden for corner points)
    spacing   = 48,       // cover point spacing along a wall
  } = opts;

  const points = [];

  for (const w of walls) {
    const horizontal = w.w >= w.h;

    if (horizontal) {
      // Wall runs along X. Cover on top (north) and bottom (south)
      if (w.w < minLength) continue;

      const count = Math.max(1, Math.floor(w.w / spacing));
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const cx = w.x + w.w * t;

        // North side
        const ny = w.y - offset;
        if (ny > 40) {
          points.push({
            position: { x: cx, y: ny },
            facing: Math.PI / 2,        // face south (toward wall)
            peekDirection: -Math.PI / 2, // peek north (away from wall)
            quality,
            size: w.w,
          });
        }

        // South side
        const sy = w.y + w.h + offset;
        if (sy < bounds.h - 40) {
          points.push({
            position: { x: cx, y: sy },
            facing: -Math.PI / 2,
            peekDirection: Math.PI / 2,
            quality,
            size: w.w,
          });
        }
      }
    } else {
      // Wall runs along Y. Cover on left (west) and right (east)
      if (w.h < minLength) continue;

      const count = Math.max(1, Math.floor(w.h / spacing));
      for (let i = 0; i < count; i++) {
        const t = (i + 0.5) / count;
        const cy = w.y + w.h * t;

        // West side
        const wx = w.x - offset;
        if (wx > 40) {
          points.push({
            position: { x: wx, y: cy },
            facing: 0,
            peekDirection: Math.PI,
            quality,
            size: w.h,
          });
        }

        // East side
        const ex = w.x + w.w + offset;
        if (ex < bounds.w - 40) {
          points.push({
            position: { x: ex, y: cy },
            facing: Math.PI,
            peekDirection: 0,
            quality,
            size: w.h,
          });
        }
      }
    }
  }

  return points;
}

/**
 * Find the best cover point near a position that protects against
 * `threatAngle` (radians, direction FROM cover TO threat).
 *
 * Scoring:
 *   - Closer to `nearPos` is better
 *   - Cover facing roughly opposite threatAngle is better
 *   - Higher quality is better
 *   - Points already claimed by teammates are penalized
 */
export function findBestCover(coverPoints, nearPos, threatAngle, opts = {}) {
  const {
    maxDistance = 500,
    claimed = new Set(),        // set of cover point indices taken by teammates
    threatWeight = 1.0,
    distanceWeight = 1.0,
  } = opts;

  let best = null;
  let bestScore = -Infinity;

  for (let i = 0; i < coverPoints.length; i++) {
    const cp = coverPoints[i];
    const dx = cp.position.x - nearPos.x;
    const dy = cp.position.y - nearPos.y;
    const d = Math.hypot(dx, dy);
    if (d > maxDistance) continue;
    if (claimed.has(i)) continue;

    // Angle between cover facing and threat direction
    // Ideal: cover facing points TOWARD threat (so bot's back is to the wall)
    let angleDelta = threatAngle - cp.facing;
    while (angleDelta >  Math.PI) angleDelta -= Math.PI * 2;
    while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
    const angleScore = Math.max(0, 1 - Math.abs(angleDelta) / Math.PI);

    const distanceScore = 1 - d / maxDistance;
    const qualityScore = cp.quality;

    const score =
      angleScore * threatWeight * 1.5 +
      distanceScore * distanceWeight +
      qualityScore * 0.5;

    if (score > bestScore) {
      bestScore = score;
      best = { point: cp, index: i, distance: d, score: bestScore };
    }
  }

  return best;
}