import { hexToRgba } from '../utils/color.js';

// ---------- Sparks (impact lines) ----------
export class SparkPool {
  constructor(max = 256) {
    this.items = [];
    this.max = max;
  }

  spawn(x, y, dirX, dirY, material = 'metal') {
    if (this.items.length >= this.max) this.items.shift();
    const count = material === 'metal'
      ? 4 + Math.floor(Math.random() * 3)
      : 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      // Spread around the impact normal
      const baseAngle = Math.atan2(-dirY, -dirX);
      const spread = (Math.random() - 0.5) * 1.6;
      const angle = baseAngle + spread;
      const speed = 120 + Math.random() * 220;
      this.items.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: (material === 'metal' ? 0.18 : 0.28) + Math.random() * 0.08,
        maxLife: material === 'metal' ? 0.26 : 0.36,
        material,
      });
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const s = this.items[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 0.9;
      s.vy *= 0.9;
      s.life -= dt;
      if (s.life <= 0) this.items.splice(i, 1);
    }
  }

  draw(lines) {
    for (const s of this.items) {
      const a = Math.max(0, s.life / s.maxLife);
      const len = 6 * a;
      const nx = s.vx / (Math.hypot(s.vx, s.vy) || 1);
      const ny = s.vy / (Math.hypot(s.vx, s.vy) || 1);
      lines.line(
        s.x, s.y,
        s.x + nx * len, s.y + ny * len,
        2,
        hexToRgba(
          s.material === 'metal' ? '#ffd782' : '#b8a995',
          a
        )
      );
    }
  }
}

export class BloodParticlePool {
  constructor(max = 160) {
    this.items = [];
    this.max = max;
  }

  spawn(x, y, dirX, dirY) {
    const count = 5 + Math.floor(Math.random() * 4);
    const baseAngle = Math.atan2(dirY, dirX);
    for (let i = 0; i < count; i++) {
      if (this.items.length >= this.max) this.items.shift();
      const angle = baseAngle + Math.PI + (Math.random() - 0.5) * 1.8;
      const speed = 45 + Math.random() * 125;
      const life = 0.22 + Math.random() * 0.22;
      this.items.push({
        x, y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 1.5 + Math.random() * 2,
        life,
        maxLife: life,
      });
    }
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const particle = this.items[i];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.92;
      particle.vy *= 0.92;
      particle.life -= dt;
      if (particle.life <= 0) this.items.splice(i, 1);
    }
  }

  draw(shapes) {
    for (const particle of this.items) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      shapes.circle(
        particle.x,
        particle.y,
        particle.radius * alpha,
        hexToRgba('#c6283d', alpha * 0.9),
        1
      );
    }
  }
}

// ---------- Hit flashes (expanding circles on entities) ----------
export class HitFlashPool {
  constructor(max = 64) {
    this.items = [];
    this.max = max;
  }

  spawn(x, y, color = '#ffffff') {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ x, y, life: 0.2, maxLife: 0.2, color });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      this.items[i].life -= dt;
      if (this.items[i].life <= 0) this.items.splice(i, 1);
    }
  }

  draw(shapes) {
    for (const h of this.items) {
      const t = 1 - h.life / h.maxLife;         // 0 → 1
      const r = 4 + t * 16;
      const a = (1 - t) * 0.9;
      shapes.ring(h.x, h.y, r + 3, r, hexToRgba(h.color, a), 2.0);
    }
  }
}

// ---------- Muzzle flash (brief bright circle at shooter) ----------
export class MuzzlePool {
  constructor(max = 32) {
    this.items = [];
    this.max = max;
  }

  spawn(x, y, angle = 0) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ x, y, angle, life: 0.075, maxLife: 0.075 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      this.items[i].life -= dt;
      if (this.items[i].life <= 0) this.items.splice(i, 1);
    }
  }

  draw(shapes, lines) {
    for (const m of this.items) {
      const t = m.life / m.maxLife;
      const dx = Math.cos(m.angle);
      const dy = Math.sin(m.angle);
      const sideX = -dy;
      const sideY = dx;
      shapes.circle(
        m.x + dx * 5,
        m.y + dy * 5,
        11 * t,
        hexToRgba('#fff8d0', t * 0.85),
        2.0
      );
      lines.line(
        m.x - dx * 3,
        m.y - dy * 3,
        m.x + dx * 23 * t,
        m.y + dy * 23 * t,
        5 * t,
        hexToRgba('#ffb84d', t * 0.72)
      );
      lines.line(
        m.x + sideX * 5,
        m.y + sideY * 5,
        m.x + dx * 13 * t + sideX * 8 * t,
        m.y + dy * 13 * t + sideY * 8 * t,
        2 * t,
        hexToRgba('#fff2bf', t * 0.9)
      );
      lines.line(
        m.x - sideX * 5,
        m.y - sideY * 5,
        m.x + dx * 13 * t - sideX * 8 * t,
        m.y + dy * 13 * t - sideY * 8 * t,
        2 * t,
        hexToRgba('#fff2bf', t * 0.9)
      );
    }
  }
}

// ---------- Bunker explosion: shockwave rings + debris + flash ----------
export class ExplosionPool {
  constructor(max = 12) {
    this.items = [];
    this.max = max;
  }

  spawn(x, y, color = '#ffb84d', size = 70) {
    if (this.items.length >= this.max) this.items.shift();
    const debris = [];
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 120 + Math.random() * 380;
      debris.push({ x: 0, y: 0, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, len: 6 + Math.random() * 12 });
    }
    this.items.push({ x, y, color, size, life: 0.9, maxLife: 0.9, debris });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const e = this.items[i];
      e.life -= dt;
      for (const d of e.debris) {
        d.x += d.vx * dt; d.y += d.vy * dt;
        d.vx *= 0.93; d.vy *= 0.93;
      }
      if (e.life <= 0) this.items.splice(i, 1);
    }
  }

  draw(shapes, lines) {
    for (const e of this.items) {
      const t = 1 - e.life / e.maxLife;            // 0 -> 1
      const fade = 1 - t;
      shapes.circle(e.x, e.y, e.size * (0.5 + t * 0.6), hexToRgba('#fff2bf', Math.max(0, 0.9 - t * 3)), 2);
      shapes.ring(e.x, e.y, e.size * (0.6 + t * 2.4) + 5, e.size * (0.6 + t * 2.4), hexToRgba(e.color, fade * 0.9), 2);
      shapes.ring(e.x, e.y, e.size * (0.3 + t * 1.5) + 3, e.size * (0.3 + t * 1.5), hexToRgba('#ffffff', fade * 0.6), 2);
      for (const d of e.debris) {
        const l = d.len * fade;
        const n = Math.hypot(d.vx, d.vy) || 1;
        lines.line(e.x + d.x, e.y + d.y, e.x + d.x + d.vx / n * l, e.y + d.y + d.vy / n * l, 2.5, hexToRgba(e.color, fade));
      }
    }
  }
}

export class DamageNumberPool {
  constructor(max = 48) {
    this.items = [];
    this.max = max;
  }

  spawn(x, y, amount) {
    if (this.items.length >= this.max) this.items.shift();
    this.items.push({ x, y, amount: Math.round(amount), life: 0.8, maxLife: 0.8 });
  }

  update(dt) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const item = this.items[i];
      item.life -= dt;
      item.y -= 22 * dt;
      if (item.life <= 0) this.items.splice(i, 1);
    }
  }
}

// ---------- Bullet drawing (bullets themselves live in combat.js) ----------
export function drawBullets(bullets, lines, shapes) {
  for (const b of bullets) {
    if (b.dead) continue;

    // Trail
    const tx = b.position.x - b.direction.x * b.trailLength;
    const ty = b.position.y - b.direction.y * b.trailLength;
    lines.line(tx, ty, b.position.x, b.position.y, 3, hexToRgba('#fff8d0', 0.9));

    // Core dot
    shapes.circle(b.position.x, b.position.y, 3, hexToRgba('#ffffff', 1.0), 1.5);
  }
}