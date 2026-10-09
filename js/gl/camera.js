import { clamp } from "../utils/math.js";

export class Camera {
  constructor() {
    this.position = { x: 0, y: 0 };
    this.zoom = 1.6; // ← was 1.0
    this.viewport = { w: 1, h: 1 };
    this.target = null;
    this._mat = new Float32Array(9);
    this._initialized = false; // ← also init this (was implicit)
    this._shakeRemaining = 0;
    this._shakeDuration = 0;
    this._shakeStrength = 0;
    this._shakeOffset = { x: 0, y: 0 };
    this._sweep = null;
  }

  sweepTo(position, duration = 1.1) {
    this._sweep = {
      from: { ...this.position },
      to: { x: position.x, y: position.y },
      elapsed: 0,
      duration,
    };
  }

  updateSweep(dt) {
    if (!this._sweep) return false;
    const sweep = this._sweep;
    sweep.elapsed = Math.min(sweep.duration, sweep.elapsed + dt);
    const t = sweep.duration > 0 ? sweep.elapsed / sweep.duration : 1;
    const eased = t * t * (3 - 2 * t);
    this.position.x = sweep.from.x + (sweep.to.x - sweep.from.x) * eased;
    this.position.y = sweep.from.y + (sweep.to.y - sweep.from.y) * eased;
    if (t >= 1) this._sweep = null;
    return true;
  }

  shake(strength, duration = 0.12) {
    this._shakeStrength = Math.min(9, Math.max(this._shakeStrength, strength));
    this._shakeDuration = Math.max(this._shakeDuration, duration);
    this._shakeRemaining = Math.max(this._shakeRemaining, duration);
  }

  updateShake(dt) {
    if (this._shakeRemaining <= 0) {
      this._shakeOffset.x = 0;
      this._shakeOffset.y = 0;
      this._shakeStrength = 0;
      return;
    }
    this._shakeRemaining = Math.max(0, this._shakeRemaining - dt);
    const fade = this._shakeDuration > 0
      ? this._shakeRemaining / this._shakeDuration
      : 0;
    const amount = this._shakeStrength * fade;
    this._shakeOffset.x = (Math.random() * 2 - 1) * amount;
    this._shakeOffset.y = (Math.random() * 2 - 1) * amount;
  }

  follow(entity, smoothing = 0.15) {
    if (!entity || this._sweep) return;
    if (!this._initialized) {
      this.position.x = entity.position.x;
      this.position.y = entity.position.y;
      this._initialized = true;
      return;
    }
    this.position.x += (entity.position.x - this.position.x) * smoothing;
    this.position.y += (entity.position.y - this.position.y) * smoothing;
  }

  setViewport(w, h) {
    this.viewport.w = w;
    this.viewport.h = h;
  }

  /**
   * World → clip space (mat3, column-major).
   * WebGL clip space: x right +1, y up +1.
   * We flip y so +y goes down in world (canvas-style).
   */
  getMatrix() {
    const { w, h } = this.viewport;
    const z = this.zoom;

    // scale from world to pixels: (world - camPos) * z
    // pixels → clip: x: 2/w, y: -2/h (flip y)
    const sx = (2 / w) * z;
    const sy = (-2 / h) * z;

    const tx = -(this.position.x + this._shakeOffset.x) * sx;
    const ty = -(this.position.y + this._shakeOffset.y) * sy;

    // column-major: [m00, m01, m02, m10, m11, m12, m20, m21, m22]
    const m = this._mat;
    m[0] = sx;
    m[1] = 0;
    m[2] = 0;
    m[3] = 0;
    m[4] = sy;
    m[5] = 0;
    m[6] = tx;
    m[7] = ty;
    m[8] = 1;
    return m;
  }

  /** Screen pixel (CSS or device — must match viewport units) → world. */
  screenToWorld(sx, sy) {
    const { w, h } = this.viewport;
    const z = this.zoom;
    const wx = (sx - w / 2) / z + this.position.x + this._shakeOffset.x;
    const wy = (sy - h / 2) / z + this.position.y + this._shakeOffset.y;
    return { x: wx, y: wy };
  }
}

/** Clip-space projection for screen-space UI (text, HUD). Matches u_viewport pixels. */
export function screenProjection(w, h) {
  // x: 0..w → -1..1 ; y: 0..h → +1..-1 (flip y)
  const m = new Float32Array(9);
  m[0] = 2 / w;
  m[1] = 0;
  m[2] = 0;
  m[3] = 0;
  m[4] = -2 / h;
  m[5] = 0;
  m[6] = -1;
  m[7] = 1;
  m[8] = 1;
  return m;
}
