import { Action } from './utility.js';
import { segmentWalls } from '../engine/collision.js';
import { findPath } from './pathfinding.js';
import { findBestCover } from './cover.js';

/**
 * Objective-aware actions for BUNKERS mode.
 *
 *   BREACH  attack the best enemy bunker from a spot with a clear line of fire
 *   GUARD   stay near an own bunker, facing the approach, and rush to it
 *           when it is being shot
 *
 * Both only activate when the world has bunkers, so ELIMINATION is unaffected.
 */

const BREACH_BASE = {
  ENTRY: 0.76, FLANK: 0.74, SCOUT: 0.72, FLEX: 0.68,
  SNIPER: 0.64, SUPPORT: 0.58, ANCHOR: 0.56,
};

const UNDER_ATTACK_MS = 5000;

export function enemyBunkers(world, bot) {
  return (world.bunkers ?? []).filter(b => !b.destroyed && b.squad !== bot.squad);
}

export function ownBunkers(world, bot) {
  return (world.bunkers ?? []).filter(b => !b.destroyed && b.squad === bot.squad);
}

/** First wall hit between (ax,ay) and the bunker centre is the bunker itself. */
export function hasBunkerLineOfFire(ax, ay, bunker, walls) {
  const c = bunker.position;
  const hit = segmentWalls(ax, ay, c.x, c.y, walls);
  return !!hit && hit.wall === bunker;
}

// ============================================================
// BREACH
// ============================================================
export class BreachAction extends Action {
  constructor() { super('BREACH'); }

  score(ctx) {
    const { bot, world, memory, now } = ctx;
    if (!world.bunkers?.length) return 0;
    if (!enemyBunkers(world, bot).length) return 0;
    if (memory.visibleEnemy) return 0;

    const role = bot.role || 'FLEX';
    let s = BREACH_BASE[role] ?? 0.62;

    // Defenders only go on the offensive once they have nothing left to guard.
    if (bot.objectiveJob === 'DEFEND' && ownBunkers(world, bot).length > 0) s = 0.2;

    // Just lost sight of someone: give PEEK / SEARCH a chance first.
    if (memory.target && now - memory.lastSeenAt < 1500) s -= 0.15;

    const hpPct = bot.health / bot.maxHealth;
    s *= 0.75 + hpPct * 0.25;
    return clamp01(s);
  }

  tick(ctx) {
    const { bot, memory, decision, world, now, navgrid } = ctx;
    const targets = enemyBunkers(world, bot);
    if (!targets.length) return;

    // ---- choose a bunker (sticky, re-evaluated every few seconds) ----
    let bunker = targets.find(b => b.id === memory.objectiveId);
    if (!bunker || now >= (memory.objectiveRepickAt || 0)) {
      const best = pickBunker(bot, targets, memory.objectiveId);
      if (best.id !== memory.objectiveId) {
        memory.objectiveId = best.id;
        memory.breachSpot = null;
      }
      bunker = best;
      memory.objectiveRepickAt = now + 2500;
    }

    // ---- choose a firing spot ----
    if (!memory.breachSpot || now >= (memory.breachSpotAt || 0)) {
      memory.breachSpot = findBreachSpot(bot, bunker, ctx);
      memory.breachSpotAt = now + 3000;
    }
    const spot = memory.breachSpot;

    const dist = Math.hypot(
      bunker.position.x - bot.position.x,
      bunker.position.y - bot.position.y
    );
    const canFire =
      dist <= bot.range * 0.95 &&
      hasBunkerLineOfFire(bot.position.x, bot.position.y, bunker, world.walls);

    if (spot) {
      const d = Math.hypot(spot.x - bot.position.x, spot.y - bot.position.y);
      if (d > 36) decision.destination = spot;
      else decision.holdGround = true;
    } else {
      decision.destination = bunker.position;
    }

    if (canFire) {
      decision.aimTarget = bunker;
      decision.fireObjective = bunker;
    } else {
      // Look where we are walking so the vision cone stays useful.
      const next = memory.path?.[memory.waypointIndex];
      decision.aimTarget = { position: next ?? spot ?? bunker.position };
    }
    decision.wantToFire = false;
  }
}

function pickBunker(bot, targets, currentId) {
  let best = targets[0];
  let bestScore = Infinity;
  for (const b of targets) {
    const d = Math.hypot(b.position.x - bot.position.x, b.position.y - bot.position.y);
    // Prefer close and already-damaged bunkers; stick with the current one.
    let score = d * (0.55 + 0.45 * b.fraction);
    if (b.id === currentId) score *= 0.75;
    if (score < bestScore) { bestScore = score; best = b; }
  }
  return best;
}

/**
 * Sample a ring of candidate positions around the bunker and keep the
 * nearest walkable one with a clear line of fire that a path can reach.
 */
function findBreachSpot(bot, bunker, ctx) {
  const { world, navgrid, teams } = ctx;
  const center = bunker.position;
  const maxR = bot.range * 0.85;
  const ideal = Math.min(maxR, bot.range * (bot.posture?.engagementRange ?? 1) * 0.55);

  const radii = [150, 230, 330, 450, 600, 800, 1000].filter(r => r <= maxR);
  if (!radii.length) radii.push(Math.max(120, maxR));

  const allies = teams.getMembers(bot.team).filter(a => a !== bot && a.state === 'alive');
  const spots = [];
  for (const r of radii) {
    for (let i = 0; i < 28; i++) {
      const a = (i / 28) * Math.PI * 2;
      const x = center.x + Math.cos(a) * r;
      const y = center.y + Math.sin(a) * r;
      if (x < 40 || y < 40 || x > world.bounds.w - 40 || y > world.bounds.h - 40) continue;
      const cell = navgrid.worldToCell(x, y);
      if (!navgrid.isWalkable(cell.col, cell.row)) continue;
      if (!hasBunkerLineOfFire(x, y, bunker, world.walls)) continue;

      let score = Math.hypot(x - bot.position.x, y - bot.position.y) + Math.abs(r - ideal) * 0.8;
      for (const ally of allies) {
        const claim = ally.ai?.breachSpot;
        if (claim && Math.hypot(claim.x - x, claim.y - y) < 90) score += 220;
      }
      spots.push({ x, y, score });
    }
  }
  spots.sort((a, b) => a.score - b.score);

  for (const spot of spots.slice(0, 4)) {
    const path = findPath(navgrid, bot.position, spot);
    if (!path.length) continue;
    const end = path[path.length - 1];
    if (Math.hypot(end.x - spot.x, end.y - spot.y) < 80) return { x: spot.x, y: spot.y };
  }
  return null;
}

// ============================================================
// GUARD
// ============================================================
export class GuardAction extends Action {
  constructor() { super('GUARD'); }

  score(ctx) {
    const { bot, world, memory, now } = ctx;
    const mine = ownBunkers(world, bot);
    if (!mine.length) return 0;
    if (memory.visibleEnemy) return 0;

    const attacked = mine.find(b => now - b.lastHitAt < UNDER_ATTACK_MS && b.lastHitAt > 0);
    let s = bot.objectiveJob === 'DEFEND' ? 0.7 : 0;

    if (attacked) {
      const d = Math.hypot(
        attacked.position.x - bot.position.x,
        attacked.position.y - bot.position.y
      );
      // Anyone close enough drops what they are doing to help.
      if (d < 900) s = Math.max(s, 0.62 + (1 - d / 900) * 0.2);
      else if (bot.objectiveJob === 'DEFEND') s = 0.82;
    }
    return clamp01(s);
  }

  tick(ctx) {
    const { bot, memory, decision, world, now, cover, claimedCover } = ctx;
    const mine = ownBunkers(world, bot);
    if (!mine.length) return;

    // Guard the bunker being shot, else the weakest, else the closest.
    let bunker = mine.find(b => now - b.lastHitAt < UNDER_ATTACK_MS && b.lastHitAt > 0);
    if (!bunker) {
      bunker = [...mine].sort((a, b) => {
        const da = Math.hypot(a.position.x - bot.position.x, a.position.y - bot.position.y);
        const db = Math.hypot(b.position.x - bot.position.x, b.position.y - bot.position.y);
        return (da * (0.6 + 0.4 * a.fraction)) - (db * (0.6 + 0.4 * b.fraction));
      })[0];
    }

    // Face the likely approach: toward the attacker if known, else the arena centre.
    const threat = bunker.lastAttackerPos && now - bunker.lastHitAt < UNDER_ATTACK_MS
      ? bunker.lastAttackerPos
      : { x: world.bounds.w / 2, y: world.bounds.h / 2 };
    const threatAngle = Math.atan2(
      threat.y - bunker.position.y, threat.x - bunker.position.x
    );

    if (memory.guardBunkerId !== bunker.id) {
      memory.guardBunkerId = bunker.id;
      memory.guardSpot = null;
    }

    if (!memory.guardSpot && cover) {
      const found = findBestCover(
        cover.points, bunker.position, threatAngle,
        { maxDistance: 340, claimed: claimedCover }
      );
      if (found) memory.guardSpot = { ...found.point.position };
    }
    if (!memory.guardSpot) {
      memory.guardSpot = {
        x: bunker.position.x + Math.cos(threatAngle) * 130,
        y: bunker.position.y + Math.sin(threatAngle) * 130,
      };
    }

    const spot = memory.guardSpot;
    const d = Math.hypot(spot.x - bot.position.x, spot.y - bot.position.y);
    if (d > 45) decision.destination = spot;
    else decision.holdGround = true;

    decision.aimTarget = { position: threat };
    decision.wantToFire = false;
  }

  exit(ctx) {
    ctx.memory.guardSpot = null;
    ctx.memory.guardBunkerId = null;
  }
}

function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
