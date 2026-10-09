import { Bullet } from "../entities/Bullet.js";

export class CombatSystem {
  constructor(world) {
    this.world = world;
    this.bullets = [];
    this.events = [];
    this._entityById = new Map();
  }

  /**
   * Rebuild the id → entity lookup. Call after registering/replacing entities.
   */
  reindex() {
    this._entityById.clear();
    for (const e of this.world.entities) this._entityById.set(e.id, e);
  }

  /**
   * Attempt to fire a bullet from a shooter.
   * Returns true if a bullet was spawned.
   */
  fire(shooter, nowMs) {
    if (!shooter || shooter.state === "dead") return false;
    if (shooter.reloading) return false;

    const interval = 1000 / shooter.fireRate;
    if (nowMs - (shooter.lastShotAt || 0) < interval) return false;

    if (shooter.ammo <= 0) {
      this.startReload(shooter, nowMs);
      return false;
    }

    shooter.lastShotAt = nowMs;
    shooter.ammo -= 1;

    const dirX = Math.cos(shooter.aim);
    const dirY = Math.sin(shooter.aim);
    const muzzle = shooter.radius + 6;

    const b = new Bullet({
      x: shooter.position.x + dirX * muzzle,
      y: shooter.position.y + dirY * muzzle,
      dx: dirX,
      dy: dirY,
      speed: shooter.bulletSpeed,
      damage: shooter.damage,
      team: shooter.team,
      ownerId: shooter.id,
      radius: 3,
      lifetime: 2.0,
      trailLength: shooter.bulletSpeed * 0.02,
      range: shooter.range,
    });

    this.bullets.push(b);
    return true;
  }

  startReload(shooter, nowMs) {
    if (shooter.reloading) return;
    shooter.reloading = true;
    shooter.reloadEndsAt = nowMs + (shooter.reloadTime || 1500);
  }

  updateReload(shooter, nowMs) {
    if (shooter.reloading && nowMs >= shooter.reloadEndsAt) {
      shooter.reloading = false;
      shooter.ammo = shooter.magSize;
    }
  }

  update(dt, nowMs) {
    for (const e of this.world.entities) {
      if (e.reloading !== undefined) this.updateReload(e, nowMs);
    }

    const ctx = {
      walls: this.world.walls,
      entities: this.world.entities,
      worldBounds: this.world.bounds,
    };

    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.update(dt, ctx);

      if (b.dead) {
        const hit = b.hitResult;

        if (hit?.type === "entity") {
          this.applyDamage(hit.target, b.damage, b.ownerId);
          this.events.push({
            type: "hit",
            x: hit.x,
            y: hit.y,
            target: hit.target,
            ownerId: b.ownerId,
            direction: b.direction,
          });
        } else if (hit?.type === "wall") {
          const wall = hit.wall;
          const attacker = this._entityById.get(b.ownerId);
          const hostile = wall.isBunker && !wall.destroyed &&
            attacker && attacker.squad !== wall.squad;
          if (hostile) this.damageBunker(wall, b.damage, attacker, hit, b.direction);
          this.events.push({
            type: "spark",
            x: hit.x,
            y: hit.y,
            dx: b.direction.x,
            dy: b.direction.y,
            material: wall.isBunker ? 'metal' : (wall.material || 'stone'),
          });
        }

        this.bullets.splice(i, 1);
      }
    }
  }

  /**
   * A bullet from an enemy squad struck a bunker. Reduce its HP, flag the hit
   * for the UI / team alerts, and report destruction exactly once.
   */
  damageBunker(bunker, damage, attacker, hit, direction) {
    if (bunker.destroyed) return;
    const amount = Math.min(bunker.hp, damage);
    bunker.hp -= amount;
    bunker.hitFlash = 0.12;
    bunker.lastHitAt = performance.now();
    bunker.lastAttackerPos = { x: attacker.position.x, y: attacker.position.y };

    this.events.push({
      type: "bunkerHit",
      bunker,
      amount,
      x: hit.x,
      y: hit.y,
      direction,
      attackerId: attacker.id,
      attackerSquad: attacker.squad,
    });

    if (bunker.hp <= 0) {
      bunker.hp = 0;
      bunker.destroyed = true;
      // Stop being solid immediately so no later bullet this tick collides.
      const index = this.world.walls.indexOf(bunker);
      if (index >= 0) this.world.walls.splice(index, 1);
      this.events.push({
        type: "bunkerDestroyed",
        bunker,
        attackerId: attacker.id,
        attackerName: attacker.name,
        attackerSquad: attacker.squad,
        attackerTeam: attacker.team,
      });
    }
  }

  /**
   * Apply damage to a target. If the target is AI-controlled, record where
   * the damage came from so the AI can react (Step 3 of the AI rework).
   */
  applyDamage(target, amount, attackerId) {
    if (!target || target.state === "dead") return;

    const attacker = this._entityById.get(attackerId);

    // Record damage source for AI reaction
    if (attacker && target.ai) {
      const dx = attacker.position.x - target.position.x;
      const dy = attacker.position.y - target.position.y;
      const now = performance.now();

      target.ai.lastDamage = {
        fromX: attacker.position.x,
        fromY: attacker.position.y,
        angle: Math.atan2(dy, dx),
        at: now,
        expireAt: now + 4000,
        attackerId: attacker.id,
      };
    }

    target.health = Math.max(0, target.health - amount);

    // Emit a damage event so main.js can propagate team alerts
    this.events.push({
      type: "damage",
      x: target.position.x,
      y: target.position.y,
      amount,
      target,
      attackerId,
    });

    if (target.health <= 0) {
      target.state = "dead";
      target.deadAt = performance.now();
      target.deaths = (target.deaths || 0) + 1;
      if (attacker && attacker.squad !== target.squad) {
        attacker.kills = (attacker.kills || 0) + 1;
      }

      this.events.push({
        type: "kill",
        victimId: target.id,
        victimName: target.name,
        victimTeam: target.team,
        victimSquad: target.squad,
        attackerSquad: attacker ? attacker.squad : null,
        attackerId,
        attackerName: attacker ? attacker.name : "UNKNOWN",
        attackerTeam: attacker
          ? attacker.team
          : target.team === "WARDEN"
            ? "BREAKER"
            : "WARDEN",
      });
    }
  }

  drainEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }
}

/**
 * Draw bullets + transient effects.
 * Called from main.js's world pass.
 */
export function drawCombat({ bullets, shapes, lines, sparks, hits, muzzles, blood }) {
  for (const b of bullets) {
    const tx = b.position.x - b.direction.x * b.trailLength;
    const ty = b.position.y - b.direction.y * b.trailLength;
    lines.line(tx, ty, b.position.x, b.position.y, 3, [1, 0.97, 0.82, 0.9]);
    shapes.circle(b.position.x, b.position.y, 3, [1, 1, 1, 1], 1.5);
  }
  sparks.draw(lines);
  hits.draw(shapes);
  muzzles.draw(shapes, lines);
  blood.draw(shapes);
}
