import { segmentWalls } from '../engine/collision.js';
import { findPath, followPath } from './pathfinding.js';
import { findVisibleEnemy, visionRangeFor, canSee } from './perception.js';
import { UtilityAI } from './utility.js';
import {
  AttackAction, PeekAction, RespondAction, PushAction, HoldAction,
  RetreatAction, RepositionAction, ReloadAction, SearchAction,
} from './actions.js';
import { BreachAction, GuardAction, hasBunkerLineOfFire } from './objectiveActions.js';
import {
  shouldFire, onFire, leadTarget, findFriendlyBlocker, applyBurstJitter,
} from './shooting.js';

// ============================================================
// CONFIG
// ============================================================

const TURN_SPEED_BY_ACTION = {
  BREACH: 4.5,
  GUARD: 3.5,
  ATTACK: 7.0,
  PEEK: 4.5,
  PUSH: 3.0,
  HOLD: 3.0,
  RETREAT: 4.0,
  REPOSITION: 2.5,
  RELOAD: 2.5,
  SEARCH: 3.5,
  RESPOND: 5.5,
  REACT: 9.0,
};

function turnSpeedFor(bot, actionName) {
  const base = TURN_SPEED_BY_ACTION[actionName] ?? 4.0;
  const skillMul = 0.8 + (bot.skill ?? 0.5) * 0.6;
  return base * skillMul;
}

function reactionDelayFor(bot) {
  const skill = bot.skill ?? 0.5;
  return 400 - skill * 250;
}

const REPATH_INTERVAL_MS = 500;
const REPATH_DISTANCE    = 96;
const ARRIVE_RADIUS      = 26;
const SPRINT_MUL         = 1.40;
const AVOID_LOOKAHEAD    = 60;
const AVOID_FORCE        = 1.6;

// Debug: set to a bot id (e.g. 'w_anchor') to log action switches, or null
const DEBUG_SWITCH_BOT   = null;

// ============================================================
// AI SYSTEM
// ============================================================

export class AISystem {
  constructor(world, teams, navgrid, blackboards, cover) {
    this.world = world;
    this.teams = teams;
    this.navgrid = navgrid;
    this.blackboards = blackboards;
    this.cover = cover;
    this.aiFor = new WeakMap();
  }

  _getAI(bot) {
    let uai = this.aiFor.get(bot);
    if (!uai) {
      uai = new UtilityAI(
        [
          new AttackAction(),
          new PeekAction(),
          new RespondAction(),
          new PushAction(),
          new HoldAction(),
          new RetreatAction(),
          new RepositionAction(),
          new ReloadAction(),
          new SearchAction(),
          new BreachAction(),
          new GuardAction(),
        ],
        {
          hysteresis: 0.08,
          minDurationMs: 650,
          smoothing: 0.7,
        }
      );
      this.aiFor.set(bot, uai);
    } else if (uai.currentAction !== bot.ai.currentAction) {
      uai.reset();
    }
    return uai;
  }

  update(dt, now, entities) {
    // Update team blackboards once per frame
    for (const [teamName, bb] of this.blackboards) {
      const members = this.teams.getMembers(teamName);
      const enemies = this.teams.getMembers(
        teamName === 'WARDEN' ? 'BREAKER' : 'WARDEN'
      );
      bb.update(now, members, enemies, this.world.walls, this.cover.points, this.world.bounds);
    }

    const claimedCover = this._computeClaimedCover();

    for (const e of entities) {
      if (!e.ai || e.isHuman) continue;
      if (e.state === 'dead') {
        e._wantToFire = false;
        continue;
      }
      this._tickBot(e, dt, now, claimedCover);
      if (e.ai.holdingAt !== undefined && e.ai.holdingAt !== null) {
        claimedCover.add(e.ai.holdingAt);
      }
      if (e.ai.attackCoverIndex !== null) {
        claimedCover.add(e.ai.attackCoverIndex);
      }
    }
  }

  _computeClaimedCover() {
    const claimed = new Set();
    for (const teamName of ['WARDEN', 'BREAKER']) {
      const members = this.teams.getMembers(teamName);
      for (const m of members) {
        if (!m.ai || m.isHuman) continue;
        if (m.state !== 'alive') continue;
        if (m.ai.holdingAt !== undefined && m.ai.holdingAt !== null) {
          claimed.add(m.ai.holdingAt);
        }
      }
    }
    return claimed;
  }

  _tickBot(bot, dt, now, claimedCover) {
    const mem = bot.ai;
    if (mem.lastEngageAt === 0) mem.lastEngageAt = now;

    // ---------- Perception ----------
    const enemies = this.teams.enemiesOf(bot).filter(x => x.state === 'alive');
    const visionRange = visionRangeFor(bot);
    const seen = findVisibleEnemy(
      bot, enemies, this.world.walls, visionRange,
      { preferLowHp: true, preferPlayer: true }
    );

    mem.visibleEnemy = seen || null;

    if (seen) {
      const isNew = seen.enemy !== mem.target;
      mem.target = seen.enemy;
      mem.lastSeenAt = now;
      mem.lastSeenX = seen.enemy.position.x;
      mem.lastSeenY = seen.enemy.position.y;
      mem.lastEngageAt = now;

      if (isNew) {
        mem.targetAcquiredAt = now;
        mem.aimErrorAngle = (Math.random() - 0.5) * 0.26;
        mem.aimErrorChangeAt = now;
        mem.firstShotAt = now + 250;

        // Reset burst fire
        mem.burst.shotsLeft = 0;
        mem.burst.pauseUntil = 0;
        mem.burst.nextShotAt = 0;

        const bb = this.blackboards.get(bot.team);
        bb?.reportContact(seen.enemy.position.x, seen.enemy.position.y, now);
      }
    }

    const blackboard = this.blackboards.get(bot.team);

    // ---------- Decision frame ----------
    const decision = {
      destination: null,
      aimTarget: null,
      wantToFire: false,
      holdGround: false,
      fireObjective: null,
    };

    const ctx = {
      bot, now, dt,
      world: this.world,
      teams: this.teams,
      memory: mem,
      decision,
      visionRange,
      blackboard,
      cover: this.cover,
      claimedCover,
      navgrid: this.navgrid,
    };

    // ---------- Damage reaction (overrides AI) ----------
    let reactingToDamage = false;
    if (mem.lastDamage && now < mem.lastDamage.expireAt) {
      const dmg = mem.lastDamage;

      if (mem.reactionStartedAt < dmg.at) {
        mem.reactionStartedAt = dmg.at;
        mem.reactionDelayUntil = dmg.at + reactionDelayFor(bot);
        mem.searchAngle = dmg.angle;
        mem.searchUntil = dmg.at + 2200;
      }

      if (now < mem.reactionDelayUntil) {
        reactingToDamage = true;
        // freezes aim during the delay
      } else if (now < mem.reactionDelayUntil + 600) {
        reactingToDamage = true;
        const dx = dmg.fromX - bot.position.x;
        const dy = dmg.fromY - bot.position.y;
        const desired = Math.atan2(dy, dx);
        const speed = turnSpeedFor(bot, 'REACT');
        bot.aim = turnToward(bot.aim, desired, speed * dt);
      } else {
        const t = (now - mem.reactionDelayUntil - 600) / 1000;
        const sweep = Math.sin(t * Math.PI * 1.2) * 0.9;
        const desired = mem.searchAngle + sweep;
        const speed = turnSpeedFor(bot, 'SEARCH');
        bot.aim = turnToward(bot.aim, desired, speed * dt);
        reactingToDamage = true;
        if (now > mem.searchUntil) mem.lastDamage = null;
      }
    }

    // ---------- Utility AI ----------
    let currentAction = mem.currentAction;

    if (!reactingToDamage) {
      const uai = this._getAI(bot);
      const prevName = mem.currentActionName;
      currentAction = uai.evaluate(ctx);
      mem.currentAction = currentAction;
      mem.currentActionName = currentAction?.name ?? null;

      // Debug: log switches for a specific bot
      if (DEBUG_SWITCH_BOT && bot.id === DEBUG_SWITCH_BOT
          && prevName !== mem.currentActionName) {
        console.log(
          `[switch ${bot.id}] ${prevName} → ${mem.currentActionName}` +
          ` at ${Math.round(now % 100000)}ms`
        );
      }

      // Tick the action (populates `decision`)
      currentAction?.tick(ctx, dt);
      mem.debugAction = currentAction?.name ?? '—';

      // Aim at the decision target
      if (decision.aimTarget) {
        const desired = Math.atan2(
          decision.aimTarget.position.y - bot.position.y,
          decision.aimTarget.position.x - bot.position.x
        );
        const speed = turnSpeedFor(bot, currentAction.name);
        const applyError =
          currentAction.name === 'ATTACK' || currentAction.name === 'PEEK';
        let finalAim = desired;
        if (applyError) {
          const timeOnTarget = (now - mem.targetAcquiredAt) / 1000;
          const errMag = Math.max(
            0.05,
            0.26 * Math.max(0, 1 - timeOnTarget / 1.2)
          );
          if (now > mem.aimErrorChangeAt) {
            mem.aimErrorAngle = (Math.random() - 0.5) * 2 * errMag;
            mem.aimErrorChangeAt = now + 80 + Math.random() * 80;
          }
          finalAim += mem.aimErrorAngle;
        }
        bot.aim = turnToward(bot.aim, finalAim, speed * dt);
      }
    } else {
      mem.debugAction = 'REACT';
    }

    // ---------- Movement ----------
    let moveDir = { x: 0, y: 0 };
    mem.debugRecovery = false;
    const intendedDestination = decision.destination;
    if (
      mem.recoveryTarget &&
      (now >= mem.recoveryUntil ||
        !intendedDestination ||
        Math.hypot(
          mem.recoveryForDestination.x - intendedDestination.x,
          mem.recoveryForDestination.y - intendedDestination.y
        ) > REPATH_DISTANCE ||
        Math.hypot(
          mem.recoveryTarget.x - bot.position.x,
          mem.recoveryTarget.y - bot.position.y
        ) <= ARRIVE_RADIUS * 1.5)
    ) {
      mem.recoveryTarget = null;
      mem.recoveryForDestination = null;
    }
    if (mem.recoveryTarget && intendedDestination) {
      decision.destination = mem.recoveryTarget;
      decision.holdGround = false;
      mem.debugRecovery = true;
    }
    mem.debugDestination = decision.destination
      ? { x: decision.destination.x, y: decision.destination.y }
      : null;
    if (!decision.destination) mem.debugPathLength = 0;

    if (decision.holdGround) {
      bot.velocity.x *= 0.7;
      bot.velocity.y *= 0.7;
    } else if (decision.destination) {
      const needRepath =
        !mem.path.length ||
        mem.waypointIndex >= mem.path.length ||
        !mem.pathDestination ||
        Math.hypot(
          mem.pathDestination.x - decision.destination.x,
          mem.pathDestination.y - decision.destination.y
        ) > REPATH_DISTANCE ||
        now >= mem.repathAt;

      if (needRepath) {
        const path = findPath(this.navgrid, bot.position, decision.destination);
        mem.path = path;
        mem.waypointIndex = 0;
        mem.pathDestination = {
          x: decision.destination.x,
          y: decision.destination.y,
        };
        mem.repathAt = now + REPATH_INTERVAL_MS;
        mem.lastPathAt = now;
      }

      if (now - mem.lastStuckCheckAt > 1200) {
        const moved = Math.hypot(
          bot.position.x - mem._lastPos.x,
          bot.position.y - mem._lastPos.y
        );
        if (moved < 18 && decision.destination) {
          mem.stuckChecks++;
          mem.repathAt = 0;
          mem.path = [];
          const recovery = this._findRecoveryTarget(bot, intendedDestination);
          if (recovery) {
            mem.recoveryTarget = recovery;
            mem.recoveryForDestination = { ...intendedDestination };
            mem.recoveryUntil = now + 1800;
            decision.destination = recovery;
            mem.debugDestination = { ...recovery };
            mem.debugRecovery = true;
          }
        } else {
          mem.stuckChecks = Math.max(0, mem.stuckChecks - 1);
        }
        mem._lastPos = { x: bot.position.x, y: bot.position.y };
        mem.lastStuckCheckAt = now;
        mem._stuckAt = now;
      }

      mem.debugPathLength = mem.path.length;
      const follow = followPath(
        bot.position,
        mem.path,
        mem.waypointIndex,
        ARRIVE_RADIUS
      );
      mem.waypointIndex = follow.newIndex;

      if (!follow.reachedEnd) {
        moveDir.x = follow.dirX;
        moveDir.y = follow.dirY;
        mem.lastMovedAt = now;
      }
    }

    // Sprint when moving aggressively
    const sprinting =
      currentAction?.name === 'PUSH' ||
      currentAction?.name === 'REPOSITION' ||
      currentAction?.name === 'PEEK'
        ? SPRINT_MUL
        : 1.0;

    moveDir = this._avoid(bot, moveDir);

    // ---------- Apply movement ----------
    const mag = Math.hypot(moveDir.x, moveDir.y);
    if (mag > 0) {
      const nx = moveDir.x / mag;
      const ny = moveDir.y / mag;
      bot.velocity.x += nx * bot.accel * dt;
      bot.velocity.y += ny * bot.accel * dt;
    }

    const damp = Math.max(0, 1 - bot.friction * dt);
    bot.velocity.x *= damp;
    bot.velocity.y *= damp;

    const sp = Math.hypot(bot.velocity.x, bot.velocity.y);
    const maxSp =
      bot.speed *
      (currentAction?.name === 'ATTACK' ? 0.7 : 1.0) *
      sprinting;
    if (sp > maxSp) {
      const k = maxSp / sp;
      bot.velocity.x *= k;
      bot.velocity.y *= k;
    }

    bot.position.x += bot.velocity.x * dt;
    bot.position.y += bot.velocity.y * dt;

    // Wall collision
    for (const wall of this.world.walls) {
      resolveCircleWall(bot, wall);
    }

    const b = this.world.bounds;
    bot.position.x = Math.max(
      bot.radius,
      Math.min(b.w - bot.radius, bot.position.x)
    );
    bot.position.y = Math.max(
      bot.radius,
      Math.min(b.h - bot.radius, bot.position.y)
    );

    // ---------- Fire decision ----------
    bot._wantToFire = false;

    if (reactingToDamage) {
      // Flinching — no fire
    } else if (decision.fireObjective && !decision.wantToFire) {
      const bunker = decision.fireObjective;
      const dx = bunker.position.x - bot.position.x;
      const dy = bunker.position.y - bot.position.y;
      const inRange = Math.hypot(dx, dy) <= bot.range * 0.95;
      let angleDelta = Math.atan2(dy, dx) - bot.aim;
      while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
      while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;
      if (
        inRange && !bunker.destroyed && Math.abs(angleDelta) < 0.1 &&
        hasBunkerLineOfFire(bot.position.x, bot.position.y, bunker, this.world.walls) &&
        !findFriendlyBlocker(bot, this.world, this.teams) &&
        shouldFire(bot, now)
      ) {
        bot._wantToFire = true;
        onFire(bot, now);
      }
    } else if (
      decision.wantToFire &&
      mem.target &&
      mem.target.state === 'alive'
    ) {
      if (now >= mem.firstShotAt) {
        const withinCone = canSee(
          bot, mem.target, this.world.walls, visionRange
        );
        if (withinCone) {
          const aimAngle = leadTarget(bot.position, mem.target, bot.bulletSpeed);
          let angleDelta = aimAngle - bot.aim;
          while (angleDelta > Math.PI) angleDelta -= Math.PI * 2;
          while (angleDelta < -Math.PI) angleDelta += Math.PI * 2;

          if (Math.abs(angleDelta) < 0.12) {
            const blocker = findFriendlyBlocker(bot, this.world, this.teams);
            if (!blocker) {
              mem.shotBlockedBy = null;
              mem.shotBlockedUntil = 0;
              if (shouldFire(bot, now)) {
                bot._wantToFire = true;
                mem.lastEngageAt = now;

                const jitter = applyBurstJitter(bot, now);
                bot.aim += jitter;

                onFire(bot, now);
              }
            } else {
              mem.shotBlockedBy = blocker.id;
              mem.shotBlockedUntil = now + 1200;
            }
          }
        }
      }
    }
  }

  _avoid(bot, dir) {
    if (dir.x === 0 && dir.y === 0) return dir;

    const ahead = {
      x: bot.position.x + dir.x * AVOID_LOOKAHEAD,
      y: bot.position.y + dir.y * AVOID_LOOKAHEAD,
    };

    let steerX = dir.x;
    let steerY = dir.y;

    for (const wall of this.world.walls) {
      const hit = segmentWalls(
        bot.position.x, bot.position.y,
        ahead.x, ahead.y,
        [wall]
      );
      if (hit) {
        steerX += -dir.y * AVOID_FORCE;
        steerY += dir.x * AVOID_FORCE;
      }
    }

    for (const ally of this.teams.getMembers(bot.team)) {
      if (ally === bot || ally.state !== 'alive') continue;
      const dx = bot.position.x - ally.position.x;
      const dy = bot.position.y - ally.position.y;
      const distance = Math.hypot(dx, dy);
      const minDistance = bot.radius + ally.radius + 12;
      if (distance === 0 || distance >= minDistance) continue;
      const strength = (minDistance - distance) / minDistance;
      steerX += (dx / distance) * strength * 1.8;
      steerY += (dy / distance) * strength * 1.8;
    }

    return { x: steerX, y: steerY };
  }

  _findRecoveryTarget(bot, destination) {
    if (!destination) return null;
    const offsets = [];
    for (const radius of [96, 160, 224, 288]) {
      for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        offsets.push({
          x: destination.x + Math.cos(angle) * radius,
          y: destination.y + Math.sin(angle) * radius,
        });
      }
    }

    let best = null;
    let bestScore = Infinity;
    const tested = new Set();
    for (const candidate of offsets) {
      const cell = this.navgrid.nearestWalkable(candidate.x, candidate.y, 3);
      if (!cell) continue;
      const key = `${cell.col},${cell.row}`;
      if (tested.has(key)) continue;
      tested.add(key);
      const point = this.navgrid.cellToWorld(cell.col, cell.row);
      if (Math.hypot(point.x - bot.position.x, point.y - bot.position.y) < 64) continue;

      const path = findPath(this.navgrid, bot.position, point);
      if (!path.length) continue;
      const score =
        path.length * this.navgrid.cellSize +
        Math.hypot(point.x - destination.x, point.y - destination.y) * 1.5;
      if (score < bestScore) {
        best = point;
        bestScore = score;
      }
    }
    return best;
  }
}

// ============================================================
// MATH HELPERS
// ============================================================

function turnToward(current, target, maxDelta) {
  let d = target - current;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  if (Math.abs(d) <= maxDelta) return target;
  return current + Math.sign(d) * maxDelta;
}

function resolveCircleWall(circle, wall) {
  const r = circle.radius;
  const box = wall;
  const nx = Math.max(box.x, Math.min(circle.position.x, box.x + box.w));
  const ny = Math.max(box.y, Math.min(circle.position.y, box.y + box.h));
  const dx = circle.position.x - nx;
  const dy = circle.position.y - ny;
  const d2 = dx * dx + dy * dy;
  const insideX =
    circle.position.x > box.x && circle.position.x < box.x + box.w;
  const insideY =
    circle.position.y > box.y && circle.position.y < box.y + box.h;

  if (insideX && insideY) {
    const left = circle.position.x - box.x;
    const right = box.x + box.w - circle.position.x;
    const top = circle.position.y - box.y;
    const bottom = box.y + box.h - circle.position.y;
    const minH = Math.min(left, right);
    const minV = Math.min(top, bottom);
    if (minH < minV) {
      circle.position.x = left < right ? box.x - r : box.x + box.w + r;
      circle.velocity.x = 0;
    } else {
      circle.position.y = top < bottom ? box.y - r : box.y + box.h + r;
      circle.velocity.y = 0;
    }
    return;
  }

  if (d2 >= r * r) return;
  const d = Math.sqrt(d2) || 1;
  const ux = dx / d;
  const uy = dy / d;
  const overlap = r - d;
  circle.position.x += ux * overlap;
  circle.position.y += uy * overlap;
  if (Math.abs(ux) > Math.abs(uy)) circle.velocity.x = 0;
  else circle.velocity.y = 0;
}