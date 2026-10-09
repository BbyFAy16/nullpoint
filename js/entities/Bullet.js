export const BULLET_SUBSTEP = 6;

export class Bullet {
  constructor(opts) {
    this.position = { x: opts.x, y: opts.y };
    this.direction = { x: opts.dx, y: opts.dy };
    this.speed = opts.speed;
    this.damage = opts.damage;
    this.team = opts.team;
    this.ownerId = opts.ownerId;
    this.radius = opts.radius ?? 3;
    this.lifetime = opts.lifetime ?? 2.0;
    this.trailLength = opts.trailLength ?? (this.speed * 0.02);
    this.range = opts.range ?? 0;      // 0 = unlimited
    this.dead = false;
    this.hitResult = null;

    // Remembered on first update so we can measure distance travelled
    this.originX = undefined;
    this.originY = undefined;
  }

  update(dt, ctx) {
    if (this.dead) return;

    if (this.originX === undefined) {
      this.originX = this.position.x;
      this.originY = this.position.y;
    }

    const totalDist = this.speed * dt;
    let remaining = totalDist;

    while (remaining > 0) {
      const step = Math.min(BULLET_SUBSTEP, remaining);
      this.position.x += this.direction.x * step;
      this.position.y += this.direction.y * step;
      remaining -= step;

      // ---- Range check ----
      if (this.range > 0) {
        const dxO = this.position.x - this.originX;
        const dyO = this.position.y - this.originY;
        if (dxO * dxO + dyO * dyO > this.range * this.range) {
          this.dead = true;
          this.hitResult = { type: 'expired' };
          return;
        }
      }

      // ---- Wall check ----
      for (const w of ctx.walls) {
        const box = w;
        if (
          this.position.x + this.radius > box.x &&
          this.position.x - this.radius < box.x + box.w &&
          this.position.y + this.radius > box.y &&
          this.position.y - this.radius < box.y + box.h
        ) {
          this.dead = true;
          this.hitResult = {
            type: 'wall',
            wall: w,
            x: this.position.x,
            y: this.position.y,
          };
          return;
        }
      }

      // ---- Entity check ----
      for (const e of ctx.entities) {
        if (!e || e.team === this.team) continue;
        if (e.state === 'dead') continue;
        if (e.id === this.ownerId) continue;

        const dx = e.position.x - this.position.x;
        const dy = e.position.y - this.position.y;
        const rr = e.radius + this.radius;
        if (dx * dx + dy * dy < rr * rr) {
          this.dead = true;
          this.hitResult = {
            type: 'entity',
            target: e,
            x: this.position.x,
            y: this.position.y,
          };
          return;
        }
      }

      // ---- Bounds check ----
      const b = ctx.worldBounds;
      if (
        this.position.x < b.x ||
        this.position.x > b.x + b.w ||
        this.position.y < b.y ||
        this.position.y > b.y + b.h
      ) {
        this.dead = true;
        this.hitResult = { type: 'bounds', x: this.position.x, y: this.position.y };
        return;
      }
    }

    this.lifetime -= dt;
    if (this.lifetime <= 0) {
      this.dead = true;
      this.hitResult = { type: 'expired' };
    }
  }
}