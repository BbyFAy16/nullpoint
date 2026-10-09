import { Wall } from './Wall.js';

/**
 * Bunker — a destructible objective. It is a Wall subclass so movement,
 * line-of-sight, bullets, nav-grid and cover generation all treat it as solid
 * geometry for free; the combat system recognises `isBunker` on a bullet hit
 * and converts it into damage instead of a plain impact spark.
 */
export const BUNKER_SIZE = 88;
export const BUNKER_HP = 1600;

export class Bunker extends Wall {
  /**
   * @param {object} o
   * @param {string} o.id        'TL' | 'BL' | 'TR' | 'BR'
   * @param {number} o.cx,cy     centre in world units
   * @param {string} o.squad     owning squad
   * @param {string} o.side      side the owner started on (for colours)
   */
  constructor({ id, cx, cy, squad, side, hp = BUNKER_HP, size = BUNKER_SIZE }) {
    super(cx - size / 2, cy - size / 2, size, size, { material: 'metal' });
    this.type = 'bunker';
    this.isBunker = true;
    this.id = `bunker_${id}`;
    this.siteId = id;
    this.squad = squad;
    this.side = side;
    this.maxHp = hp;
    this.hp = hp;
    this.destroyed = false;
    this.hitFlash = 0;          // seconds left of the white hit flash
    this.lastHitAt = 0;         // performance.now() of the last hit taken
    this.lastAttackerPos = null;
    this.reportedAt = 0;        // throttle for team alerts
    this.pointsAwardedHp = 0;   // damage already converted into points
  }

  /** Entity-style position so the AI can treat a bunker as an aim target. */
  get position() {
    return { x: this.x + this.w / 2, y: this.y + this.h / 2 };
  }

  get fraction() {
    return Math.max(0, this.hp / this.maxHp);
  }
}
