/**
 * A* pathfinding on a NavGrid.
 * Returns an array of world positions [{x,y}, ...] from start to goal.
 * Returns [] if no path found.
 */
export function findPath(grid, startWorld, goalWorld) {
  const startCell = grid.nearestWalkable(startWorld.x, startWorld.y, 6);
  const goalCell  = grid.nearestWalkable(goalWorld.x, goalWorld.y, 6);
  if (!startCell || !goalCell) return [];

  const { cols, rows, cellSize } = grid;

  // If start and goal are the same cell, return a single waypoint.
  if (startCell.col === goalCell.col && startCell.row === goalCell.row) {
    return [grid.cellToWorld(goalCell.col, goalCell.row)];
  }

  // --- A* ---
  const total = cols * rows;
  const open = new MinHeap();
  const gScore = new Float32Array(total).fill(Infinity);
  const fScore = new Float32Array(total).fill(Infinity);
  const cameFrom = new Int32Array(total).fill(-1);
  const closed = new Uint8Array(total);

  const idx = (c, r) => r * cols + c;
  const startIdx = idx(startCell.col, startCell.row);
  const goalIdx  = idx(goalCell.col, goalCell.row);

  gScore[startIdx] = 0;
  fScore[startIdx] = heuristic(startCell, goalCell);
  open.push(startIdx, fScore[startIdx]);

  // 8-directional offsets with diagonal flag
  const dirs = [
    [ 1,  0], [-1,  0], [ 0,  1], [ 0, -1],   // orthogonal
    [ 1,  1], [ 1, -1], [-1,  1], [-1, -1],   // diagonal
  ];

  while (open.size > 0) {
    const current = open.pop();
    if (current === goalIdx) break;
    if (closed[current]) continue;
    closed[current] = 1;

    const cc = current % cols;
    const cr = (current - cc) / cols;

    for (const [dc, dr] of dirs) {
      const nc = cc + dc;
      const nr = cr + dr;
      if (!grid.isWalkable(nc, nr)) continue;

      // Diagonal move requires both orthogonals to be walkable (no corner cutting)
      if (dc !== 0 && dr !== 0) {
        if (!grid.isWalkable(cc + dc, cr) || !grid.isWalkable(cc, cr + dr)) continue;
      }

      const nIdx = idx(nc, nr);
      if (closed[nIdx]) continue;

      const stepCost = (dc !== 0 && dr !== 0) ? Math.SQRT2 : 1.0;
      const tentativeG = gScore[current] + stepCost;

      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = current;
        gScore[nIdx] = tentativeG;
        fScore[nIdx] = tentativeG + heuristic({ col: nc, row: nr }, goalCell);
        open.push(nIdx, fScore[nIdx]);
      }
    }
  }

  if (cameFrom[goalIdx] === -1 && startIdx !== goalIdx) {
    return [];   // no path
  }

  // Reconstruct
  const cellPath = [];
  let node = goalIdx;
  while (node !== -1) {
    const c = node % cols;
    const r = (node - c) / cols;
    cellPath.push({ col: c, row: r });
    if (node === startIdx) break;
    node = cameFrom[node];
  }
  cellPath.reverse();

  // Convert to world positions
  const worldPath = cellPath.map(cell => grid.cellToWorld(cell.col, cell.row));

  // Smooth: drop waypoints we can skip with a clear line of sight
  return smoothPath(worldPath, grid);
}

/** Octile heuristic — accurate for 8-directional movement. */
function heuristic(a, b) {
  const dx = Math.abs(a.col - b.col);
  const dy = Math.abs(a.row - b.row);
  return (dx + dy) + (Math.SQRT2 - 2) * Math.min(dx, dy);
}

/**
 * Remove intermediate waypoints if a direct line to a further one is clear.
 * Uses a grid-based line check (Bresenham) against walkability.
 */
function smoothPath(path, grid) {
  if (path.length <= 2) return path;

  const result = [path[0]];
  let i = 0;
  while (i < path.length - 1) {
    // Find the furthest reachable index from i
    let j = path.length - 1;
    for (; j > i + 1; j--) {
      if (gridLineClear(path[i], path[j], grid)) break;
    }
    result.push(path[j]);
    i = j;
  }
  return result;
}

/** True if the straight line from A to B only crosses walkable cells. */
function gridLineClear(a, b, grid) {
  const aCell = grid.worldToCell(a.x, a.y);
  const bCell = grid.worldToCell(b.x, b.y);
  return walkableLine(aCell.col, aCell.row, bCell.col, bCell.row, grid);
}

function walkableLine(c0, r0, c1, r1, grid) {
  let x = c0, y = r0;
  const dx = Math.abs(c1 - c0);
  const dy = Math.abs(r1 - r0);
  const sx = c0 < c1 ? 1 : -1;
  const sy = r0 < r1 ? 1 : -1;
  let err = dx - dy;

  // Safety cap — no line should be longer than cols + rows
  const maxSteps = grid.cols + grid.rows + 4;
  let steps = 0;

  while (steps++ < maxSteps) {
    if (!grid.isWalkable(x, y)) return false;
    if (x === c1 && y === r1) return true;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x += sx; }
    if (e2 <  dx) { err += dx; y += sy; }
  }
  return false;
}

/**
 * Given a bot at `pos` and a path (list of world waypoints),
 * find the direction to move and the waypoint index we're heading to.
 * Advances the index if we're within `arriveRadius` of the current waypoint.
 */
export function followPath(pos, path, waypointIndex, arriveRadius = 24) {
  if (!path || waypointIndex >= path.length) {
    return { dirX: 0, dirY: 0, reachedEnd: true, newIndex: waypointIndex };
  }

  let idx = waypointIndex;
  let wp = path[idx];

  // Advance past waypoints we've already reached
  while (idx < path.length) {
    const dx = wp.x - pos.x;
    const dy = wp.y - pos.y;
    if (Math.hypot(dx, dy) <= arriveRadius) {
      idx++;
      if (idx >= path.length) {
        return { dirX: 0, dirY: 0, reachedEnd: true, newIndex: idx };
      }
      wp = path[idx];
    } else {
      break;
    }
  }

  if (idx >= path.length) {
    return { dirX: 0, dirY: 0, reachedEnd: true, newIndex: idx };
  }

  const dx = wp.x - pos.x;
  const dy = wp.y - pos.y;
  const d = Math.hypot(dx, dy) || 1;

  return {
    dirX: dx / d,
    dirY: dy / d,
    reachedEnd: false,
    newIndex: idx,
  };
}

// ---------- MinHeap (priority queue) ----------
class MinHeap {
  constructor() {
    this.items = [];   // { value: number, priority: number }
  }
  get size() { return this.items.length; }

  push(value, priority) {
    this.items.push({ value, priority });
    this._up(this.items.length - 1);
  }

  pop() {
    const top = this.items[0];
    const last = this.items.pop();
    if (this.items.length > 0) {
      this.items[0] = last;
      this._down(0);
    }
    return top.value;
  }

  _up(i) {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent].priority <= this.items[i].priority) break;
      [this.items[parent], this.items[i]] = [this.items[i], this.items[parent]];
      i = parent;
    }
  }

  _down(i) {
    const n = this.items.length;
    while (true) {
      const l = i * 2 + 1;
      const r = i * 2 + 2;
      let smallest = i;
      if (l < n && this.items[l].priority < this.items[smallest].priority) smallest = l;
      if (r < n && this.items[r].priority < this.items[smallest].priority) smallest = r;
      if (smallest === i) break;
      [this.items[smallest], this.items[i]] = [this.items[i], this.items[smallest]];
      i = smallest;
    }
  }
}