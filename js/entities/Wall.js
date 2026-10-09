import { aabbFromCenter } from '../engine/collision.js';

export class Wall {
  constructor(x, y, w, h, opts = {}) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
    this.fillColor = opts.fillColor || null;   // resolved by renderer
    this.edgeColor = opts.edgeColor || null;
    this.material = opts.material || 'metal';
  }

  get box() {
    return { x: this.x, y: this.y, w: this.w, h: this.h };
  }

  get centerX() { return this.x + this.w / 2; }
  get centerY() { return this.y + this.h / 2; }
}