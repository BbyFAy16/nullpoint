import { hasLineOfSight } from "./vision.js";

/**
 * Default vision cone params. Can be overridden per-bot via
 * bot.visionFov (radians) and bot.visionRange (units).
 */
export const DEFAULT_FOV_RADIANS = (70 * Math.PI) / 180; // 70° total
export const DEFAULT_VISION_MUL = 1.6; // vision range = weaponRange × this

/**
 * True if `seeker` can currently see `targetEntity`, given:
 *   - FOV cone facing `seeker.aim`
 *   - distance <= vision range
 *   - line of sight through walls
 */
export function canSee(seeker, targetEntity, walls, visionRange) {
  if (!seeker || !targetEntity) return false;
  if (targetEntity.state === "dead") return false;
  if (targetEntity.team === seeker.team) return false;

  const dx = targetEntity.position.x - seeker.position.x;
  const dy = targetEntity.position.y - seeker.position.y;
  const d2 = dx * dx + dy * dy;

  if (d2 > visionRange * visionRange) return false;

  // FOV check
  const angleToTarget = Math.atan2(dy, dx);
  let angleDelta = angleToTarget - seeker.aim;
  while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
  while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;

  const halfFov = (seeker.visionFov ?? DEFAULT_FOV_RADIANS) / 2;
  if (Math.abs(angleDelta) > halfFov) return false;

  // Line of sight
  if (
    !hasLineOfSight(
      seeker.position.x,
      seeker.position.y,
      targetEntity.position.x,
      targetEntity.position.y,
      walls,
    )
  )
    return false;

  return true;
}

/**
 * Find the nearest enemy visible within the seeker's cone.
 * Optional `preferLowHp` biases slightly toward weakened targets.
 * Returns { enemy, distance } or null.
 */
export function findVisibleEnemy(
  seeker,
  enemies,
  walls,
  visionRange,
  opts = {},
) {
  const { preferLowHp = false, preferPlayer = false } = opts;
  let best = null;
  let bestScore = Infinity;

  for (const e of enemies) {
    if (!canSee(seeker, e, walls, visionRange)) continue;

    const dx = e.position.x - seeker.position.x;
    const dy = e.position.y - seeker.position.y;
    const d = Math.hypot(dx, dy);

    let score = d;

    // Prefer the human player if enabled
    if (preferPlayer && e.isHuman) {
      score *= 0.6;
    }

    // Prefer low-HP targets
    if (preferLowHp) {
      const hpFactor = 1 + (1 - e.health / e.maxHealth) * 0.4;
      score = score / hpFactor;
    }

    if (score < bestScore) {
      bestScore = score;
      best = { enemy: e, distance: d };
    }
  }

  return best;
}

/**
 * Compute the effective vision range for a bot:
 * weapon range × multiplier (bots see a bit further than they can shoot).
 */
export function visionRangeFor(entity) {
  return (entity.range || 800) * (entity.visionMul ?? DEFAULT_VISION_MUL);
}

/**
 * Debug helper — returns the two edge rays of the vision cone
 * in world coordinates, for drawing.
 *   returns { origin: {x,y}, left: {x,y}, right: {x,y} }
 */
export function visionConeGeometry(entity, range) {
  const half = (entity.visionFov ?? DEFAULT_FOV_RADIANS) / 2;
  const left = entity.aim - half;
  const right = entity.aim + half;
  return {
    origin: { x: entity.position.x, y: entity.position.y },
    left: {
      x: entity.position.x + Math.cos(left) * range,
      y: entity.position.y + Math.sin(left) * range,
    },
    right: {
      x: entity.position.x + Math.cos(right) * range,
      y: entity.position.y + Math.sin(right) * range,
    },
  };
}
