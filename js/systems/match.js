import { buildStaticMap } from '../maps/static.js';
import { buildEntity, ROSTER, BUNKER_PICK_WEIGHT } from '../characters/roster.js';
import { makeBot } from '../entities/Bot.js';
import { TeamRegistry } from './teams.js';
import { NavGrid } from './navgrid.js';
import { buildCoverPoints } from './cover.js';
import { assignTeamRoles } from './roles.js';
import { TeamBlackboard } from './blackboard.js';
import { CombatSystem } from './combat.js';
import { AISystem } from './ai.js';
import { RoundController } from './rounds.js';
import { createMode } from '../modes/index.js';

export const FOV_RADIANS = (70 * Math.PI) / 180;

const SKILL_BY_DIFFICULTY = {
  easy:   [0.25, 0.40],
  normal: [0.45, 0.65],
  hard:   [0.70, 0.90],
};

/**
 * Match — everything that simulates a game, with no rendering or DOM.
 *
 *   const match = new Match({ mode: 'bunkers', size: 5, squadKeys: [...] });
 *   match.start(now);
 *   match.update(dt, now, intent);          // once per fixed tick
 *   for (const ev of match.drainEvents()) { ... }   // effects, sound, HUD
 *
 * `intent` carries the human player's input for this tick:
 *   { ix, iy, sprint, aimWorld:{x,y}|null, fire, reload, locked }
 */
export class Match {
  constructor({ mode, size, squadKeys, difficulty = 'normal', strictHidden = false, username = 'player_001' }) {
    this.config = { mode, size, squadKeys, difficulty, strictHidden, username };
    this.mode = createMode(mode);

    // ---- arena ----
    this.map = buildStaticMap();
    this.world = {
      bounds: this.map.bounds,
      walls: [...this.map.walls],
      entities: [],
      bunkers: [],
      pushTarget: this.map.pushTarget,
      lanes: this.map.lanes,
      modeId: mode,
    };

    // ---- teams ----
    this.teams = new TeamRegistry();
    this.teams.setSpawns('WARDEN', this.map.spawns.WARDEN.slice(0, size));
    this.teams.setSpawns('BREAKER', this.map.spawns.BREAKER.slice(0, size));
    this.player = null;
    this._buildSquads(squadKeys, size, difficulty, username);

    // ---- mode objectives (adds bunker walls) ----
    this.startPlayerId = this.player.id;
    this.points = { ALPHA: 0, OMEGA: 0 };
    this.killCount = { ALPHA: 0, OMEGA: 0 };
    this.mode.setup(this);

    // ---- navigation (built after objectives so bunkers are obstacles) ----
    this.navgrid = new NavGrid({
      bounds: this.map.bounds,
      walls: this.world.walls,
      cellSize: 32,
      agentRadius: 22,
    });
    this.cover = { points: this._buildCover() };

    // ---- systems ----
    this.combat = new CombatSystem(this.world);
    this.combat.reindex();
    this.blackboards = new Map([
      ['WARDEN', new TeamBlackboard('WARDEN')],
      ['BREAKER', new TeamBlackboard('BREAKER')],
    ]);
    this.ai = new AISystem(this.world, this.teams, this.navgrid, this.blackboards, this.cover);

    this.events = [];
    this.rounds = new RoundController({
      teams: this.teams,
      mode: this.mode,
      onEvent: (ev) => this._onRoundEvent(ev),
    });
  }

  // ------------------------------------------------------------
  // BUILD
  // ------------------------------------------------------------
  _buildSquads(squadKeys, size, difficulty, username) {
    const [lo, hi] = SKILL_BY_DIFFICULTY[difficulty] ?? SKILL_BY_DIFFICULTY.normal;
    const rollSkill = () => lo + Math.random() * (hi - lo);

    const alphaKeys = squadKeys.slice(0, size);
    const omegaKeys = this._pickEnemySquad(alphaKeys, size);

    const make = (key, squad, side, i) => {
      const entity = buildEntity({
        key, team: side, squad,
        id: `${squad === 'ALPHA' ? 'a' : 'o'}_${key.toLowerCase()}`,
        username: squad === 'ALPHA' && i === 0 ? username : null,
        isHuman: squad === 'ALPHA' && i === 0,
      });
      makeBot(entity, rollSkill());
      entity.isHuman = squad === 'ALPHA' && i === 0;
      entity.visionFov = FOV_RADIANS;
      this.world.entities.push(entity);
      this.teams.addMember(side, entity);
      return entity;
    };

    alphaKeys.forEach((key, i) => {
      const e = make(key, 'ALPHA', 'WARDEN', i);
      if (i === 0) this.player = e;
    });
    omegaKeys.forEach((key, i) => make(key, 'OMEGA', 'BREAKER', i));

    // Initial positions (resetForRound repeats this each round).
    this.teams.resetForRound();
  }

  /** Enemy squad = remaining roster; BUNKERS skews toward defensive picks. */
  _pickEnemySquad(alphaKeys, size) {
    const pool = Object.keys(ROSTER).filter(k => !alphaKeys.includes(k));
    const picked = [];
    while (picked.length < size && pool.length) {
      const weights = pool.map(k =>
        this.config.mode === 'bunkers' ? (BUNKER_PICK_WEIGHT[k] ?? 1) : 1
      );
      let roll = Math.random() * weights.reduce((a, b) => a + b, 0);
      let index = 0;
      for (; index < pool.length - 1; index++) {
        roll -= weights[index];
        if (roll <= 0) break;
      }
      picked.push(pool.splice(index, 1)[0]);
    }
    return picked;
  }

  _buildCover() {
    return buildCoverPoints(this.world.walls, this.map.bounds, {
      offset: 36, minLength: 64, spacing: 48,
    });
  }

  /** Walls changed (bunker destroyed / restored): refresh nav + cover. */
  rebuildNavigation() {
    if (!this.navgrid) return;
    this.navgrid.rebuild(this.world.walls);
    this.cover.points = this._buildCover();
    // Cover indices cached by the AI are no longer valid.
    for (const e of this.world.entities) {
      if (!e.ai) continue;
      e.ai.holdingAt = undefined;
      e.ai.attackCoverIndex = null;
      e.ai.guardSpot = null;
      e.ai.breachSpot = null;
      e.ai.path = [];
    }
  }

  // ------------------------------------------------------------
  // LIFECYCLE
  // ------------------------------------------------------------
  start(now) {
    this.rounds.start(now, this);
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }

  _onRoundEvent(ev) {
    if (ev.type === 'roundStart') {
      for (const board of this.blackboards.values()) board.reset();
      assignTeamRoles(this.teams.getMembers('WARDEN'));
      assignTeamRoles(this.teams.getMembers('BREAKER'));

      // Everyone starts facing the middle of the arena.
      const cx = this.world.bounds.w / 2;
      const cy = this.world.bounds.h / 2;
      for (const e of this.world.entities) {
        e.aim = Math.atan2(cy - e.position.y, cx - e.position.x);
        e.reloading = false;
      }
    }
    this.events.push(ev);
  }

  // ------------------------------------------------------------
  // QUERIES
  // ------------------------------------------------------------
  get playerSquad() { return this.player.squad; }

  get enemySquad() { return this.player.squad === 'ALPHA' ? 'OMEGA' : 'ALPHA'; }

  sideOfSquad(squad) { return this.teams.squadSide(squad); }

  livingTeammates() {
    return this.teams.getMembers(this.player.team).filter(e => e.state === 'alive');
  }

  // ------------------------------------------------------------
  // PLAYER CONTROL
  // ------------------------------------------------------------
  /**
   * Hand control to the next living teammate. With `onDeath` the current
   * player is dead, so a single survivor is enough.
   */
  switchPlayer({ onDeath = false } = {}) {
    const team = this.teams.getMembers(this.player.team);
    const living = team.filter(e => e.state === 'alive').length;
    if (living < (onDeath ? 1 : 2)) return false;

    const next = this.teams.nextAliveMember(this.player.team, this.player);
    if (!next || next === this.player) return false;

    const from = this.player;
    this.player.isHuman = false;
    this.player._wantToFire = false;
    this.player = next;
    next.isHuman = true;
    next._wantToFire = false;
    this.events.push({ type: 'playerSwitched', player: next, from, onDeath });
    return true;
  }

  // ------------------------------------------------------------
  // SIMULATION
  // ------------------------------------------------------------
  update(dt, now, intent) {
    const { rounds, world, combat } = this;
    const player = this.player;

    rounds.update(dt, now, this);
    const frozen = rounds.isFrozen();
    const combatActive = rounds.isCombatActive();
    const locked = !!intent?.locked;

    // ---- human movement ----
    if (!frozen && !locked && player.state === 'alive' && intent) {
      let { ix, iy } = intent;
      const il = Math.hypot(ix, iy);
      if (il > 0) { ix /= il; iy /= il; }
      const mul = intent.sprint ? 1.45 : 1.0;
      player.velocity.x += ix * player.accel * mul * dt;
      player.velocity.y += iy * player.accel * mul * dt;
      player._sprinting = !!intent.sprint;
    } else {
      player._sprinting = false;
    }

    const damp = Math.max(0, 1 - player.friction * dt);
    player.velocity.x *= damp;
    player.velocity.y *= damp;
    const maxSpeed = player.speed * (player._sprinting ? 1.45 : 1.0);
    const sp = Math.hypot(player.velocity.x, player.velocity.y);
    if (sp > maxSpeed) {
      const k = maxSpeed / sp;
      player.velocity.x *= k;
      player.velocity.y *= k;
    }
    if (!locked) {
      player.position.x += player.velocity.x * dt;
      player.position.y += player.velocity.y * dt;
    }

    // ---- collision for everyone ----
    const b = world.bounds;
    for (const e of world.entities) {
      if (e.state === 'dead') continue;
      for (const wall of world.walls) resolveCircleWall(e, wall);
      e.position.x = Math.max(e.radius, Math.min(b.w - e.radius, e.position.x));
      e.position.y = Math.max(e.radius, Math.min(b.h - e.radius, e.position.y));
    }

    // ---- aim / fire / reload ----
    if (intent?.aimWorld) {
      player.aim = Math.atan2(
        intent.aimWorld.y - player.position.y,
        intent.aimWorld.x - player.position.x
      );
    }
    if (combatActive && !locked && player.state === 'alive' && intent) {
      if (intent.fire && combat.fire(player, now)) {
        this.events.push({ type: 'shot', entity: player, human: true });
      }
      if (intent.reload) combat.startReload(player, now);
    }

    // ---- AI ----
    if (combatActive) {
      this.ai.update(dt, now, world.entities);
      for (const e of world.entities) {
        if (!e.ai || e.isHuman || e.state !== 'alive' || !e._wantToFire) continue;
        if (combat.fire(e, now)) this.events.push({ type: 'shot', entity: e, human: false });
      }
    }

    // ---- combat ----
    combat.update(dt, now);
    for (const bunker of world.bunkers) {
      if (bunker.hitFlash > 0) bunker.hitFlash = Math.max(0, bunker.hitFlash - dt);
    }
    this._processCombatEvents(now);

    // Dead? hand control to a living teammate straight away.
    if (this.player.state !== 'alive') this.switchPlayer({ onDeath: true });
  }

  _processCombatEvents(now) {
    for (const ev of this.combat.drainEvents()) {
      if (ev.type === 'kill') {
        this.mode.onKill(this, ev);
      } else if (ev.type === 'damage') {
        const victim = ev.target;
        const attacker = this.world.entities.find(e => e.id === ev.attackerId);
        if (attacker && victim) {
          this.blackboards.get(victim.team)?.reportDamage(
            attacker.position.x, attacker.position.y, now,
            {
              attackerId: attacker.id,
              victimId: victim.id,
              victimPosition: victim.position,
            }
          );
        }
      } else if (ev.type === 'bunkerHit') {
        this.mode.onBunkerDamage(this, ev);
        this._alertBunkerOwner(ev, now);
      } else if (ev.type === 'bunkerDestroyed') {
        this.mode.onBunkerDestroyed(this, ev);
        this.rebuildNavigation();
      }
      this.events.push(ev);
    }
  }

  /** Tell the bunker's owners someone is shooting it (throttled). */
  _alertBunkerOwner(ev, now) {
    const bunker = ev.bunker;
    if (now - bunker.reportedAt < 2500) return;
    bunker.reportedAt = now;
    const attacker = this.world.entities.find(e => e.id === ev.attackerId);
    const side = this.teams.squadSide(bunker.squad);
    if (!attacker || !side) return;
    this.blackboards.get(side)?.reportDamage(
      attacker.position.x, attacker.position.y, now,
      {
        attackerId: attacker.id,
        victimId: bunker.id,
        victimPosition: bunker.position,
      }
    );
  }
}

// ============================================================
// COLLISION
// ============================================================
function resolveCircleWall(circle, wall) {
  const r = circle.radius;
  const box = wall;
  const nx = Math.max(box.x, Math.min(circle.position.x, box.x + box.w));
  const ny = Math.max(box.y, Math.min(circle.position.y, box.y + box.h));
  const dx = circle.position.x - nx;
  const dy = circle.position.y - ny;
  const d2 = dx * dx + dy * dy;
  const insideX = circle.position.x > box.x && circle.position.x < box.x + box.w;
  const insideY = circle.position.y > box.y && circle.position.y < box.y + box.h;

  if (insideX && insideY) {
    const left   = circle.position.x - box.x;
    const right  = (box.x + box.w) - circle.position.x;
    const top    = circle.position.y - box.y;
    const bottom = (box.y + box.h) - circle.position.y;
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
