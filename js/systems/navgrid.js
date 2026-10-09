/**
 * NavGrid — 2D boolean grid derived from map walls.
 * Each cell is walkable if no wall (inflated by `padding`) overlaps it.
 */
export class NavGrid {
  /**
   * @param {object} opts
   * @param {{x,y,w,h}} opts.bounds       — world bounds
   * @param {Array} opts.walls            — array of Wall { x, y, w, h }
   * @param {number} opts.cellSize        — cell edge in world units
   * @param {number} opts.agentRadius     — padding around walls (bot radius)
   */
  constructor({ bounds, walls, cellSize = 32, agentRadius = 22 }) {
    this.bounds = bounds;
    this.cellSize = cellSize;
    this.agentRadius = agentRadius;

    this.cols = Math.ceil(bounds.w / cellSize);
    this.rows = Math.ceil(bounds.h / cellSize);

    // Walkable grid. 1 = walkable, 0 = blocked.
    this.grid = new Uint8Array(this.cols * this.rows);

    // Precompute inflated wall boxes so we test each cell against them.
    const pad = agentRadius;
    this.inflatedWalls = walls.map(w => ({
      x: w.x - pad,
      y: w.y - pad,
      w: w.w + pad * 2,
      h: w.h + pad * 2,
    }));

    this._build();
  }

  /** Recompute walkability after the wall set changed (bunker destroyed). */
  rebuild(walls) {
    const pad = this.agentRadius;
    this.inflatedWalls = walls.map(w => ({
      x: w.x - pad,
      y: w.y - pad,
      w: w.w + pad * 2,
      h: w.h + pad * 2,
    }));
    this._build();
  }

  _build() {
    const cs = this.cellSize;

    for (let row = 0; row < this.rows; row++) {
      for (let col = 0; col < this.cols; col++) {
        const cx = col * cs + cs / 2;
        const cy = row * cs + cs / 2;

        // Treat cell as blocked if its center OR any corner is inside a wall.
        // Using the center only is fine given the inflation already accounts for radius.
        let walkable = 1;
        for (const w of this.inflatedWalls) {
          if (
            cx >= w.x && cx <= w.x + w.w &&
            cy >= w.y && cy <= w.y + w.h
          ) {
            walkable = 0;
            break;
          }
        }
        this.grid[row * this.cols + col] = walkable;
      }
    }
  }

  inBounds(col, row) {
    return col >= 0 && col < this.cols && row >= 0 && row < this.rows;
  }

  isWalkable(col, row) {
    if (!this.inBounds(col, row)) return false;
    return this.grid[row * this.cols + col] === 1;
  }

  /** World position → grid cell (floor). */
  worldToCell(wx, wy) {
    return {
      col: Math.floor(wx / this.cellSize),
      row: Math.floor(wy / this.cellSize),
    };
  }

  /** Grid cell → world position at the center of the cell. */
  cellToWorld(col, row) {
    return {
      x: col * this.cellSize + this.cellSize / 2,
      y: row * this.cellSize + this.cellSize / 2,
    };
  }

  /**
   * Find the closest walkable cell to a world position.
   * BFS outward from the requested cell, capped at `maxRadius` cells.
   * Returns { col, row } or null.
   */
  nearestWalkable(wx, wy, maxRadius = 8) {
    const { col: c0, row: r0 } = this.worldToCell(wx, wy);
    if (this.isWalkable(c0, r0)) return { col: c0, row: r0 };

    for (let r = 1; r <= maxRadius; r++) {
      for (let dc = -r; dc <= r; dc++) {
        for (let dr = -r; dr <= r; dr++) {
          if (Math.abs(dc) !== r && Math.abs(dr) !== r) continue;   // ring only
          const c = c0 + dc;
          const rr = r0 + dr;
          if (this.isWalkable(c, rr)) return { col: c, row: rr };
        }
      }
    }
    return null;
  }
}