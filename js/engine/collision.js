// AABB: { x, y, w, h }  (x,y = top-left, w,h = size)

export function aabbFromCenter(cx, cy, halfW, halfH) {
  return { x: cx - halfW, y: cy - halfH, w: halfW * 2, h: halfH * 2 };
}

export function pointInAABB(px, py, box) {
  return px >= box.x && px <= box.x + box.w &&
         py >= box.y && py <= box.y + box.h;
}

/** Circle (cx, cy, r) overlaps AABB? */
export function circleAABB(cx, cy, r, box) {
  const nx = Math.max(box.x, Math.min(cx, box.x + box.w));
  const ny = Math.max(box.y, Math.min(cy, box.y + box.h));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

/** Circle vs circle. */
export function circleCircle(x0, y0, r0, x1, y1, r1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const rr = r0 + r1;
  return dx * dx + dy * dy < rr * rr;
}

/**
 * Resolve circle-vs-AABB by axis-separated slide.
 * Returns the new position after pushing the circle out of the box.
 * px, py = previous position (before this frame's movement)
 * Returns { x, y }.
 */
export function resolveCircleAABB(cx, cy, r, box, prevX, prevY) {
  if (!circleAABB(cx, cy, r, box)) return { x: cx, y: cy };

  // Find closest point on AABB
  const nx = Math.max(box.x, Math.min(cx, box.x + box.w));
  const ny = Math.max(box.y, Math.min(cy, box.y + box.h));

  // If the circle center is inside the box, push out via shortest axis
  if (cx > box.x && cx < box.x + box.w && cy > box.y && cy < box.y + box.h) {
    const leftDist   = cx - box.x;
    const rightDist  = (box.x + box.w) - cx;
    const topDist    = cy - box.y;
    const bottomDist = (box.y + box.h) - cy;
    const minH = Math.min(leftDist, rightDist);
    const minV = Math.min(topDist, bottomDist);
    if (minH < minV) {
      return { x: leftDist < rightDist ? box.x - r : box.x + box.w + r, y: cy };
    } else {
      return { x: cx, y: topDist < bottomDist ? box.y - r : box.y + box.h + r };
    }
  }

  // Outside — push along the normal from closest point
  let dx = cx - nx;
  let dy = cy - ny;
  const d = Math.hypot(dx, dy) || 1;
  dx /= d; dy /= d;
  const overlap = r - d;
  return { x: cx + dx * overlap, y: cy + dy * overlap };
}

/**
 * Segment vs AABB (slab method). Returns t in [0,1] or -1 if no hit.
 * Segment from (x0,y0) to (x1,y1).
 */
export function segmentAABB(x0, y0, x1, y1, box) {
  const dx = x1 - x0;
  const dy = y1 - y0;

  let tmin = 0;
  let tmax = 1;

  // X slab
  if (Math.abs(dx) < 1e-8) {
    if (x0 < box.x || x0 > box.x + box.w) return -1;
  } else {
    const invDx = 1 / dx;
    let t1 = (box.x - x0) * invDx;
    let t2 = (box.x + box.w - x0) * invDx;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }

  // Y slab
  if (Math.abs(dy) < 1e-8) {
    if (y0 < box.y || y0 > box.y + box.h) return -1;
  } else {
    const invDy = 1 / dy;
    let t1 = (box.y - y0) * invDy;
    let t2 = (box.y + box.h - y0) * invDy;
    if (t1 > t2) { const tmp = t1; t1 = t2; t2 = tmp; }
    tmin = Math.max(tmin, t1);
    tmax = Math.min(tmax, t2);
    if (tmin > tmax) return -1;
  }

  return tmin;
}

/** Closest t in [0,1] where segment hits any wall. Returns null or {t, wall}. */
export function segmentWalls(x0, y0, x1, y1, walls) {
  let bestT = Infinity;
  let bestWall = null;
  for (const w of walls) {
    const t = segmentAABB(x0, y0, x1, y1, w);
    if (t >= 0 && t < bestT) {
      bestT = t;
      bestWall = w;
    }
  }
  return bestWall ? { t: bestT, wall: bestWall } : null;
}