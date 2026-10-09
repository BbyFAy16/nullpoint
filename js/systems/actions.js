import { Action } from './utility.js';
import { findBestCover } from './cover.js';

const PUSH_SCORE_BY_ROLE = {
  ENTRY: 0.78,
  FLANK: 0.72,
  SCOUT: 0.74,
  FLEX: 0.62,
  SUPPORT: 0.34,
  ANCHOR: 0.35,
  SNIPER: 0.32,
};
const DEFENSIVE_ROLES = new Set(['ANCHOR', 'SUPPORT', 'SNIPER']);

// ============================================================
// ATTACK
// ============================================================
export class AttackAction extends Action {
  constructor() { super('ATTACK'); }

  score(ctx) {
    const { bot, memory, blackboard } = ctx;
    if (!memory.visibleEnemy) return 0;
    const { enemy, distance } = memory.visibleEnemy;
    if (distance > bot.range) return 0;

    const idealRange = bot.range * 0.7;
    const distErr = Math.abs(distance - idealRange) / bot.range;
    let s = 0.85 - distErr * 0.3;

    const hpFactor = 1 - enemy.health / enemy.maxHealth;
    s += hpFactor * 0.15;

    if (distance < bot.range * 0.2) s -= 0.1;

    // Focus fire bonus
    if (blackboard?.focusTarget && blackboard.focusTarget === enemy) s += 0.1;

    const healthFactor = bot.health / bot.maxHealth;
    s *= 0.55 + healthFactor * 0.45;
    return clamp01(s);
  }

  tick(ctx) {
    const { bot, memory, decision, cover, claimedCover, blackboard, now } = ctx;
    const enemy = memory.visibleEnemy?.enemy;
    if (!enemy) return;

    decision.aimTarget = enemy;
    decision.wantToFire = true;

    if (memory.attackTargetId !== enemy.id) {
      memory.attackTargetId = enemy.id;
      memory.attackCoverIndex = null;
    }

    const dx = enemy.position.x - bot.position.x;
    const dy = enemy.position.y - bot.position.y;
    const d = Math.hypot(dx, dy) || 1;
    const roleRange = bot.posture?.engagementRange ?? 1;
    const idealRange = bot.range * roleRange * 0.65;
    const rangeError = d - idealRange;
    const engagement = blackboard?.getEngagement(bot.id, enemy.id);
    const blocked = now < memory.shotBlockedUntil;
    const coverIndex = memory.attackCoverIndex;
    const currentCover = coverIndex === null
      ? null
      : cover?.points[coverIndex];

    if (
      currentCover &&
      (claimedCover.has(coverIndex) ||
        Math.hypot(currentCover.position.x - bot.position.x,
                   currentCover.position.y - bot.position.y) > 340)
    ) {
      memory.attackCoverIndex = null;
    }

    if (memory.attackCoverIndex === null && cover) {
      const found = findBestCover(
        cover.points,
        bot.position,
        Math.atan2(dy, dx),
        { maxDistance: 260, claimed: claimedCover }
      );
      if (found && found.score >= 1.8) {
        memory.attackCoverIndex = found.index;
      }
    }

    const attackCover = memory.attackCoverIndex === null
      ? null
      : cover?.points[memory.attackCoverIndex];
    if (attackCover) {
      const distanceToCover = Math.hypot(
        attackCover.position.x - bot.position.x,
        attackCover.position.y - bot.position.y
      );
      if (distanceToCover > 45) {
        decision.destination = attackCover.position;
        return;
      }
    }

    if (engagement && (blocked || engagement.kind === 'flank')) {
      decision.destination = engagement.position;
      decision.holdGround = Math.hypot(
        engagement.position.x - bot.position.x,
        engagement.position.y - bot.position.y
      ) <= 45;
      return;
    }

    if (blocked) {
      const side = [...bot.id].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 2 ? 1 : -1;
      const offset = idealRange * 0.35 * side;
      decision.destination = {
        x: enemy.position.x - (dx / d) * idealRange + (-dy / d) * offset,
        y: enemy.position.y - (dy / d) * idealRange + ( dx / d) * offset,
      };
      return;
    }

    if (rangeError < -idealRange * 0.2) {
      decision.destination = {
        x: bot.position.x - (dx / d) * idealRange,
        y: bot.position.y - (dy / d) * idealRange,
      };
    } else if (rangeError > idealRange * 0.2) {
      decision.destination = {
        x: enemy.position.x - (dx / d) * idealRange,
        y: enemy.position.y - (dy / d) * idealRange,
      };
    } else {
      decision.holdGround = true;
    }
  }
}

// ============================================================
// PEEK
// ============================================================
export class PeekAction extends Action {
  constructor() { super('PEEK'); }

  score(ctx) {
    const { memory, now, bot } = ctx;
    if (!memory.target) return 0;
    const age = now - memory.lastSeenAt;
    if (age > 2500) return 0;
    if (memory.visibleEnemy) return 0;

    const recency = 1 - age / 2500;
    const hpPct = bot.health / bot.maxHealth;
    return clamp01(recency * 0.6 * (0.4 + hpPct * 0.6));
  }

  tick(ctx) {
    const { memory, decision, bot, cover, claimedCover } = ctx;

    const threatAngle = Math.atan2(
      memory.lastSeenY - bot.position.y,
      memory.lastSeenX - bot.position.x
    );

    if (cover) {
      const found = findBestCover(
        cover.points,
        bot.position,
        threatAngle,
        { maxDistance: 250, claimed: claimedCover }
      );
      if (found) {
        decision.destination = found.point.position;
        decision.aimTarget = { position: { x: memory.lastSeenX, y: memory.lastSeenY } };
        decision.wantToFire = false;
        return;
      }
    }

    decision.aimTarget = { position: { x: memory.lastSeenX, y: memory.lastSeenY } };
    decision.destination = { x: memory.lastSeenX, y: memory.lastSeenY };
    decision.wantToFire = false;
  }
}

// ============================================================
// RESPOND — take a role-assigned covered position near a fresh squad contact
// ============================================================
export class RespondAction extends Action {
  constructor() { super('RESPOND'); }

  score(ctx) {
    const { bot, memory, now, blackboard } = ctx;
    if (memory.visibleEnemy) return 0;
    const response = blackboard?.getResponse(bot.id, now);
    if (!response) return 0;
    if (response.role === 'SUPPORT') return 0.72;
    if (response.role === 'ENTRY') return 0.86;
    if (response.role === 'SCOUT' || response.role === 'FLANK') return 0.84;
    return 0.78;
  }

  tick(ctx) {
    const { bot, decision, now, blackboard, memory, teams } = ctx;
    const response = blackboard?.getResponse(bot.id, now);
    if (!response) return;

    const incident = blackboard.getIncident(now);
    const distance = Math.hypot(
      response.position.x - bot.position.x,
      response.position.y - bot.position.y
    );
    decision.destination = distance > 45 ? response.position : null;
    decision.holdGround = distance <= 45;

    const attacker = incident?.attackerId
      ? teams.enemiesOf(bot).find(enemy =>
          enemy.id === incident.attackerId && enemy.state === 'alive'
        )
      : null;
    if (attacker) {
      if (memory.target !== attacker) {
        memory.target = attacker;
        memory.targetAcquiredAt = now;
        memory.firstShotAt = now + 250;
        memory.burst.shotsLeft = 0;
        memory.burst.pauseUntil = 0;
        memory.burst.nextShotAt = 0;
      }
      decision.aimTarget = attacker;
      decision.wantToFire =
        Math.hypot(
          attacker.position.x - bot.position.x,
          attacker.position.y - bot.position.y
        ) <= bot.range;
    } else {
      decision.aimTarget = {
        position: incident?.position ?? response.position,
      };
      decision.wantToFire = false;
    }
  }
}

// ============================================================
// PUSH — role-weighted lane advance toward the objective
// ============================================================
export class PushAction extends Action {
  constructor() { super('PUSH'); }

  score(ctx) {
    const { bot, memory, now, blackboard, world } = ctx;
    if (world.bunkers?.length) return 0;   // BUNKERS: BREACH / GUARD take over
    if (memory.visibleEnemy) return 0;
    if (bot.team === 'BREAKER') return 1;
    if (memory.target && now - memory.lastSeenAt < 2500) return 0;
    if (blackboard?.getResponse(bot.id, now)) return 0;

    const role = bot.role || 'FLEX';
    const roleBias = PUSH_SCORE_BY_ROLE[role] ?? 0.62;
    let s = roleBias;
    const hpPct = bot.health / bot.maxHealth;
    s += hpPct * 0.05;

    const bias = bot.posture?.frontBias ?? 0.5;
    s += bias * 0.05;

    const sinceEngage = (now - memory.lastEngageAt) / 1000;
    if (!DEFENSIVE_ROLES.has(role)) {
      if (sinceEngage > 6) s += 0.1;
      else if (sinceEngage > 3) s += 0.04;
    }

    if (bot.team === 'WARDEN') s -= 0.18;

    return clamp01(s);
  }

  tick(ctx) {
    const { bot, decision, world, memory, blackboard, now, teams } = ctx;

    const lanes = world.lanes?.[bot.team];
    if (lanes && bot.lane && lanes[bot.lane]?.length) {
      const laneWaypoints = lanes[bot.lane];
      let waypointIndex = Math.min(
        memory.pushWaypointIndex ?? 0,
        laneWaypoints.length - 1
      );

      while (waypointIndex < laneWaypoints.length - 1) {
        const waypoint = laneWaypoints[waypointIndex];
        const distance = Math.hypot(
          waypoint.x - bot.position.x,
          waypoint.y - bot.position.y
        );
        if (distance > 80) break;
        waypointIndex++;
      }

      memory.pushWaypointIndex = waypointIndex;
      let target = laneWaypoints[waypointIndex];
      let aimTarget = target;
      if (bot.team === 'BREAKER' && waypointIndex === laneWaypoints.length - 1) {
        const livingDefenders = teams.getMembers('WARDEN').filter(
          member => member.state === 'alive'
        );
        const livePlayer = livingDefenders.find(member => member.isHuman);
        const pushTarget = livePlayer ?? livingDefenders[0];
        if (pushTarget) {
          const playerDx = pushTarget.position.x - bot.position.x;
          const playerDy = pushTarget.position.y - bot.position.y;
          const playerDistance = Math.hypot(playerDx, playerDy) || 1;
          if (
            Math.hypot(
              target.x - bot.position.x,
              target.y - bot.position.y
            ) <= 180 ||
            playerDistance <= 180
          ) {
            aimTarget = pushTarget.position;
            if (playerDistance <= 180) {
              target = null;
              decision.holdGround = true;
            } else {
              target = {
                x: pushTarget.position.x - (playerDx / playerDistance) * 180,
                y: pushTarget.position.y - (playerDy / playerDistance) * 180,
              };
            }
          }
        }
      }
      decision.destination = target;
      decision.aimTarget = { position: aimTarget };
      decision.wantToFire = false;

      if (blackboard && memory.target) {
        blackboard.reportContact(memory.lastSeenX, memory.lastSeenY, now);
      }
      return;
    }

    const push = world.pushTarget?.[bot.team]
      || { x: world.bounds.w / 2, y: world.bounds.h / 2 };
    decision.destination = push;
    decision.aimTarget = { position: push };
    decision.wantToFire = false;
  }
}

// ============================================================
// HOLD — reduced base score; fallback for anchor/support only
// ============================================================
export class HoldAction extends Action {
  constructor() { super('HOLD'); }

  score(ctx) {
    const { bot, memory, now, world } = ctx;
    if (memory.visibleEnemy) return 0;
    if (memory.target && now - memory.lastSeenAt < 1500) return 0;
    if (world.bunkers?.length) return 0.05;

    const role = bot.role || 'FLEX';
    let s = 0.25;
    if (role === 'ANCHOR') s = 0.5;
    else if (role === 'SUPPORT') s = 0.45;
    else if (role === 'SNIPER') s = 0.45;
    else if (role === 'ENTRY' || role === 'SCOUT') s = 0.1;

    return clamp01(s);
  }

  tick(ctx) {
    const { bot, decision, world, cover, claimedCover, memory, now, blackboard } = ctx;

    const enemyTeam = bot.team === 'WARDEN' ? 'BREAKER' : 'WARDEN';
    const enemyPush = world.pushTarget?.[enemyTeam]
      || { x: world.bounds.w / 2, y: world.bounds.h / 2 };
    const alert = blackboard?.getAlert(now);
    const threatTarget = alert ?? enemyPush;
    const threatAngle = Math.atan2(
      threatTarget.y - bot.position.y,
      threatTarget.x - bot.position.x
    );

    if (cover && memory.holdingAt === undefined) {
      const found = findBestCover(
        cover.points,
        bot.position,
        threatAngle,
        { maxDistance: 300, claimed: claimedCover }
      );
      if (found) {
        memory.holdingAt = found.index;
        decision.destination = found.point.position;
        decision.aimTarget = { position: threatTarget };
        decision.wantToFire = false;
        return;
      }
    }

    if (memory.holdingAt !== undefined && cover?.points[memory.holdingAt]) {
      decision.destination = cover.points[memory.holdingAt].position;
      decision.aimTarget = { position: threatTarget };
      decision.wantToFire = false;
      return;
    }

    decision.destination = null;
    decision.aimTarget = { position: threatTarget };
    decision.holdGround = true;
    decision.wantToFire = false;
  }

  exit(ctx) {
    ctx.memory.holdingAt = undefined;
  }
}

// ============================================================
// RETREAT
// ============================================================
export class RetreatAction extends Action {
  constructor() { super('RETREAT'); }

  score(ctx) {
    const { bot } = ctx;
    const hpPct = bot.health / bot.maxHealth;
    if (hpPct > 0.4) return 0;
    const s = (0.4 - hpPct) / 0.4;
    const role = bot.role || 'FLEX';
    const roleMul = (role === 'SUPPORT') ? 1.15 : 1.0;
    return clamp01((0.4 + s * 0.6) * roleMul);
  }

  tick(ctx) {
    const { bot, memory, decision, world, teams, cover, claimedCover } = ctx;

    const threat = memory.visibleEnemy?.enemy || memory.target;

    if (threat) {
      const awayAngle = Math.atan2(
        bot.position.y - threat.position.y,
        bot.position.x - threat.position.x
      );

      if (cover) {
        const found = findBestCover(
          cover.points,
          bot.position,
          awayAngle,
          { maxDistance: 350, claimed: claimedCover }
        );
        if (found) {
          decision.destination = found.point.position;
          decision.aimTarget = threat;
          decision.wantToFire = false;
          return;
        }
      }

      const d = Math.hypot(
        bot.position.x - threat.position.x,
        bot.position.y - threat.position.y
      ) || 1;
      decision.destination = {
        x: clamp(bot.position.x + ((bot.position.x - threat.position.x) / d) * 200, 60, world.bounds.w - 60),
        y: clamp(bot.position.y + ((bot.position.y - threat.position.y) / d) * 200, 60, world.bounds.h - 60),
      };
      decision.aimTarget = threat;
      decision.wantToFire = false;
      return;
    }

    const ownTeam = teams.getMembers(bot.team);
    const aliveAllies = ownTeam.filter(a => a !== bot && a.state === 'alive');
    if (aliveAllies.length > 0) {
      let nearest = aliveAllies[0];
      let bestD = Infinity;
      for (const a of aliveAllies) {
        const dd = Math.hypot(a.position.x - bot.position.x, a.position.y - bot.position.y);
        if (dd < bestD) { bestD = dd; nearest = a; }
      }
      decision.destination = { x: nearest.position.x, y: nearest.position.y };
      decision.aimTarget = { position: nearest.position };
    } else {
      decision.destination = null;
    }
    decision.wantToFire = false;
  }
}

// ============================================================
// REPOSITION — lower score; filler action only
// ============================================================
export class RepositionAction extends Action {
  constructor() { super('REPOSITION'); }

  score(ctx) {
    const { memory, now } = ctx;
    if (memory.visibleEnemy) return 0;
    if (memory.target && now - memory.lastSeenAt < 2000) return 0;

    const sinceMove = (now - (memory.lastMovedAt || 0)) / 1000;
    // Cap at 0.35 — always lower than Push (0.6+)
    let s = 0.15 + Math.min(sinceMove, 6) / 6 * 0.15;
    return clamp01(s);
  }

  tick(ctx) {
    const { bot, memory, decision, world, cover } = ctx;

    // Only pick a new destination if we don't have one or we've arrived
    const needsNewTarget =
      !memory.repositionTarget ||
      Math.hypot(
        memory.repositionTarget.x - bot.position.x,
        memory.repositionTarget.y - bot.position.y
      ) < 40;

    if (needsNewTarget) {
      if (cover && cover.points.length > 0) {
        // Prefer a cover point
        const idx = Math.floor(Math.random() * cover.points.length);
        const cp = cover.points[idx];
        const d = Math.hypot(cp.position.x - bot.position.x, cp.position.y - bot.position.y);
        if (d < 500 && d > 60) {
          memory.repositionTarget = cp.position;
        } else {
          memory.repositionTarget = pickRandomOpenSpot(world);
        }
      } else {
        memory.repositionTarget = pickRandomOpenSpot(world);
      }
    }

    decision.destination = memory.repositionTarget;
    decision.aimTarget = memory.repositionTarget;
    decision.wantToFire = false;
  }

  exit(ctx) {
    ctx.memory.repositionTarget = null;
  }
}

function pickRandomOpenSpot(world) {
  const b = world.bounds;
  return {
    x: 200 + Math.random() * (b.w - 400),
    y: 200 + Math.random() * (b.h - 400),
  };
}

// ============================================================
// RELOAD
// ============================================================
export class ReloadAction extends Action {
  constructor() { super('RELOAD'); }

  score(ctx) {
    const { bot, memory } = ctx;
    if (bot.reloading) return 0.9;
    if (bot.ammo > bot.magSize * 0.2) return 0;
    if (!memory.visibleEnemy) return 0.75;
    if (memory.visibleEnemy.distance > bot.range * 0.7) return 0.5;
    return 0.15;
  }

  enter(ctx) {
    const { bot, now } = ctx;
    if (!bot.reloading) {
      bot.reloading = true;
      bot.reloadEndsAt = now + (bot.reloadTime || 1500);
    }
  }

  tick(ctx) {
    const { decision } = ctx;
    decision.destination = null;
    decision.holdGround = true;
    decision.wantToFire = false;
  }
}

// ============================================================
// SEARCH
// ============================================================
export class SearchAction extends Action {
  constructor() { super('SEARCH'); }

  score(ctx) {
    const { bot, memory, now, blackboard } = ctx;
    if (memory.visibleEnemy) return 0;

    if (blackboard?.getResponse(bot.id, now)) return 0;

    if (memory.lastDamage && now < memory.searchUntil) return 0.65;
    if (memory.target && now - memory.lastSeenAt < 3000) return 0.45;
    return 0;
  }

  tick(ctx) {
    const { bot, memory, decision, now } = ctx;

    const searchAngle = memory.searchAngle ??
      (memory.lastSeenAt
        ? Math.atan2(memory.lastSeenY - bot.position.y,
                     memory.lastSeenX - bot.position.x)
        : bot.aim);
    const t = (now - (memory.reactionDelayUntil || now)) / 1000;
    const sweep = Math.sin(t * Math.PI * 1.2) * 0.9;

    decision.aimTarget = {
      position: {
        x: bot.position.x + Math.cos(searchAngle + sweep) * 400,
        y: bot.position.y + Math.sin(searchAngle + sweep) * 400,
      },
    };

    if (memory.lastSeenAt && now - memory.lastSeenAt < 3000) {
      decision.destination = { x: memory.lastSeenX, y: memory.lastSeenY };
    } else {
      decision.destination = null;
      decision.holdGround = true;
    }
    decision.wantToFire = false;
  }
}

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function clamp01(v) { return clamp(v, 0, 1); }