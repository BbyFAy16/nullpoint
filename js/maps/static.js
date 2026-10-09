import { Wall } from '../entities/Wall.js';

export const WORLD_BOUNDS = { x: 0, y: 0, w: 3072, h: 2048 };

export function buildStaticMap() {
  const walls = [];
  const T = 64;

  // --- Corner bunkers with door openings facing the middle ---
  addBunkerWithDoor(walls, 3 * T, 3 * T, 6 * T, 5 * T, 'right');
  addBunkerWithDoor(walls, 39 * T, 3 * T, 6 * T, 5 * T, 'left');
  addBunkerWithDoor(walls, 3 * T, 24 * T, 6 * T, 5 * T, 'right');
  addBunkerWithDoor(walls, 39 * T, 24 * T, 6 * T, 5 * T, 'left');

  // --- Center cover cluster ---
  walls.push(new Wall(20 * T, 13 * T, 1.5 * T, 1.5 * T));
  walls.push(new Wall(26 * T, 13 * T, 1.5 * T, 1.5 * T));
  walls.push(new Wall(20 * T, 18 * T, 1.5 * T, 1.5 * T));
  walls.push(new Wall(26 * T, 18 * T, 1.5 * T, 1.5 * T));

  // Center vertical piece
  walls.push(new Wall(23 * T, 15 * T, 1 * T, 2 * T));

  // --- Flank cover ---
  walls.push(new Wall(14 * T, 5 * T, 1 * T, 3 * T));
  walls.push(new Wall(32 * T, 5 * T, 1 * T, 3 * T));
  walls.push(new Wall(14 * T, 24 * T, 1 * T, 3 * T));
  walls.push(new Wall(32 * T, 24 * T, 1 * T, 3 * T));

  walls.push(new Wall(11 * T, 10 * T, 2 * T, 1 * T));
  walls.push(new Wall(35 * T, 21 * T, 2 * T, 1 * T));
  walls.push(new Wall(11 * T, 21 * T, 2 * T, 1 * T));
  walls.push(new Wall(35 * T, 10 * T, 2 * T, 1 * T));

  // --- Small pillars ---
  walls.push(new Wall(18 * T, 8 * T, 0.75 * T, 0.75 * T));
  walls.push(new Wall(29 * T, 8 * T, 0.75 * T, 0.75 * T));
  walls.push(new Wall(18 * T, 23 * T, 0.75 * T, 0.75 * T));
  walls.push(new Wall(29 * T, 23 * T, 0.75 * T, 0.75 * T));

  return {
    bounds: WORLD_BOUNDS,
    walls,

    // Up to 5 spawns per side (3v3 uses the first three). The layout is
    // point-symmetric: (x, y) -> (48T - x, 32T - y).
    spawns: {
      WARDEN: [
        { x: 6 * T,  y: 10 * T   },
        { x: 6 * T,  y: 13 * T   },
        { x: 9 * T,  y: 11.5 * T },
        { x: 4 * T,  y: 11.5 * T },
        { x: 9 * T,  y: 14.5 * T },
      ],
      BREAKER: [
        { x: 42 * T, y: 22 * T   },
        { x: 42 * T, y: 19 * T   },
        { x: 39 * T, y: 20.5 * T },
        { x: 44 * T, y: 20.5 * T },
        { x: 39 * T, y: 17.5 * T },
      ],
    },

    // Objective bunker sites for BUNKERS mode. Each sits inside one of the
    // four corner rooms, off the door axis so attackers have to commit.
    // WARDEN owns the two left rooms, BREAKER the two right rooms.
    bunkerSites: [
      { id: 'TL', cx: 310,        cy: 275,        side: 'WARDEN'  },
      { id: 'BL', cx: 310,        cy: 2048 - 275, side: 'WARDEN'  },
      { id: 'TR', cx: 3072 - 310, cy: 275,        side: 'BREAKER' },
      { id: 'BR', cx: 3072 - 310, cy: 2048 - 275, side: 'BREAKER' },
    ],

    // Each team pushes past the middle toward the enemy side
    pushTarget: {
      WARDEN:  { x: 32 * T, y: 16 * T },
      BREAKER: { x: 16 * T, y: 16 * T },
    },

    // Lane waypoints — clean straight lanes at y=7, varying mid, y=27
    // First waypoint is OUTSIDE the bunker so bots don't get stuck
    lanes: {
      WARDEN: {
        top: [
          { x: 9 * T,  y: 7 * T  },
          { x: 16 * T, y: 7 * T  },
          { x: 24 * T, y: 7 * T  },
          { x: 34 * T, y: 7 * T  },
          { x: 40 * T, y: 7 * T  },
        ],
        middle: [
          { x: 9 * T,  y: 12 * T },
          { x: 14 * T, y: 14 * T },
          { x: 24 * T, y: 16 * T },
          { x: 34 * T, y: 18 * T },
          { x: 42 * T, y: 20 * T },
        ],
        bottom: [
          { x: 9 * T,  y: 27 * T },
          { x: 16 * T, y: 27 * T },
          { x: 24 * T, y: 27 * T },
          { x: 34 * T, y: 27 * T },
          { x: 40 * T, y: 27 * T },
        ],
      },
      BREAKER: {
        top: [
          { x: 40 * T, y: 7 * T  },
          { x: 30 * T, y: 7 * T  },
          { x: 22 * T, y: 7 * T  },
          { x: 14 * T, y: 7 * T  },
          { x: 8 * T,  y: 7 * T  },
        ],
        middle: [
          { x: 40 * T, y: 20 * T },
          { x: 34 * T, y: 18 * T },
          { x: 24 * T, y: 16 * T },
          { x: 14 * T, y: 14 * T },
          { x: 8 * T,  y: 12 * T },
        ],
        bottom: [
          { x: 40 * T, y: 27 * T },
          { x: 30 * T, y: 27 * T },
          { x: 22 * T, y: 27 * T },
          { x: 14 * T, y: 27 * T },
          { x: 8 * T,  y: 27 * T },
        ],
      },
    },
  };
}

function addBunkerWithDoor(walls, x, y, w, h, side) {
  const t = 28;
  const doorSize = 90;

  if (side === 'top') {
    const gapStart = x + (w - doorSize) / 2;
    walls.push(new Wall(x, y, gapStart - x, t));
    walls.push(new Wall(gapStart + doorSize, y, (x + w) - (gapStart + doorSize), t));
  } else {
    walls.push(new Wall(x, y, w, t));
  }

  if (side === 'bottom') {
    const gapStart = x + (w - doorSize) / 2;
    walls.push(new Wall(x, y + h - t, gapStart - x, t));
    walls.push(new Wall(gapStart + doorSize, y + h - t, (x + w) - (gapStart + doorSize), t));
  } else {
    walls.push(new Wall(x, y + h - t, w, t));
  }

  if (side === 'left') {
    const gapStart = y + (h - doorSize) / 2;
    walls.push(new Wall(x, y + t, t, gapStart - (y + t)));
    walls.push(new Wall(x, gapStart + doorSize, t, (y + h - t) - (gapStart + doorSize)));
  } else {
    walls.push(new Wall(x, y + t, t, h - t * 2));
  }

  if (side === 'right') {
    const gapStart = y + (h - doorSize) / 2;
    walls.push(new Wall(x + w - t, y + t, t, gapStart - (y + t)));
    walls.push(new Wall(x + w - t, gapStart + doorSize, t, (y + h - t) - (gapStart + doorSize)));
  } else {
    walls.push(new Wall(x + w - t, y + t, t, h - t * 2));
  }
}