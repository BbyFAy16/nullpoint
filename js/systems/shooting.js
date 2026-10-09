import { segmentWalls } from '../engine/collision.js';

/**
 * Burst state per bot. Called from AI to determine whether the bot
 * should fire this tick.
 *
 * A bot fires in bursts:
 *   - 3–6 shots
 *   - 100–160ms between shots within a burst
 *   - 200–500ms pause between bursts
 *   - first shot after acquiring target has reaction delay
 *
 * Bot fields required: fireRate, skill, ai.burst
 */
export function shouldFire(bot, now) {
  const mem = bot.ai;
  if (!mem.burst) {
    mem.burst = {
      shotsLeft: 0,
      pauseUntil: 0,
      nextShotAt: 0,
    };
  }
  const burst = mem.burst;

  if (now < burst.pauseUntil) return false;
  if (now < burst.nextShotAt) return false;

  // If burst is done, roll a new one
  if (burst.shotsLeft <= 0) {
    const skill = bot.skill ?? 0.5;
    // Higher skill = longer bursts and shorter pauses
    const minShots = 3;
    const maxShots = Math.round(3 + skill * 4);   // 3..7
    burst.shotsLeft = minShots + Math.floor(Math.random() * (maxShots - minShots + 1));

    // Pause between bursts, scaled by skill
    const pauseMin = 500 - skill * 250;   // 500ms..250ms
    const pauseMax = 250 - skill * 100;   // 250ms..150ms
    burst.pauseUntil = now + pauseMin + Math.random() * (pauseMax);
    return false;
  }

  return true;
}

/**
 * Called after a successful fire to consume one shot from the burst.
 */
export function onFire(bot, now) {
  const mem = bot.ai;
  if (!mem.burst) return;

  mem.burst.shotsLeft -= 1;

  const skill = bot.skill ?? 0.5;
  // Delay between shots in burst
  const interval = 1000 / bot.fireRate;
  const jitter = (Math.random() - 0.5) * (60 - skill * 40);   // ±30ms at skill 1, ±30..±0 at skill 0
  mem.burst.nextShotAt = now + interval + jitter;

  // Small chance to pause mid-burst (recoil check)
  if (Math.random() < 0.1) {
    mem.burst.shotsLeft = 0;   // end burst, will roll new one after pause
  }
}

/**
 * Lead a moving target. Given bot pos, target pos + velocity,
 * bullet speed, compute the aim angle to intercept.
 */
export function leadTarget(botPos, target, bulletSpeed) {
  const vel = target.velocity || { x: 0, y: 0 };
  const dx = target.position.x - botPos.x;
  const dy = target.position.y - botPos.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1) return Math.atan2(dy, dx);

  // Time to reach target at current distance
  const timeToHit = dist / bulletSpeed;

  // Predicted target position
  const px = target.position.x + vel.x * timeToHit;
  const py = target.position.y + vel.y * timeToHit;

  return Math.atan2(py - botPos.y, px - botPos.x);
}

/**
 * Check if the firing line is clear of teammates.
 * Returns true if a teammate is in the way.
 */
export function friendlyBlocked(bot, world, teams) {
  return findFriendlyBlocker(bot, world, teams) !== null;
}

export function findFriendlyBlocker(bot, world, teams) {
  const allAllies = teams.getMembers(bot.team).filter(a => a !== bot && a.state === 'alive');
  if (allAllies.length === 0) return null;

  // Sample two points along the aim direction, checking if any ally
  // intersects the line of fire within the first ~400 units.
  const range = Math.min(bot.range, 500);
  const ax = bot.position.x + Math.cos(bot.aim) * (bot.radius + 4);
  const ay = bot.position.y + Math.sin(bot.aim) * (bot.radius + 4);
  const bx = bot.position.x + Math.cos(bot.aim) * range;
  const by = bot.position.y + Math.sin(bot.aim) * range;

  for (const ally of allAllies) {
    // Distance from ally to the firing line (segment AB)
    const dist = pointSegmentDistance(
      ally.position.x, ally.position.y,
      ax, ay, bx, by
    );
    if (dist < ally.radius + 6) {
      // Ensure the ally is ahead of us, not behind
      const dot = (ally.position.x - ax) * Math.cos(bot.aim) +
                  (ally.position.y - ay) * Math.sin(bot.aim);
      if (dot > 0) return ally;
    }
  }
  return null;
}

/**
 * Distance from a point to a segment.
 */
function pointSegmentDistance(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return Math.hypot(px - ax, py - ay);

  let t = ((px - ax) * dx + (py - ay) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  const cx = ax + t * dx;
  const cy = ay + t * dy;
  return Math.hypot(px - cx, py - cy);
}

/**
 * Small aim jitter applied to each shot during a burst, so shots
 * don't form a perfect laser line.
 */
export function applyBurstJitter(bot, now) {
  const skill = bot.skill ?? 0.5;
  const jitterMag = 0.02 + (1 - skill) * 0.03;   // 0.02..0.05 rad
  return (Math.random() - 0.5) * 2 * jitterMag;
}