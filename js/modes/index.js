import { eliminationMode } from './elimination.js';
import { bunkersMode } from './bunkers.js';

export const MODES = {
  elimination: eliminationMode,
  bunkers: bunkersMode,
};

/** Menu-facing metadata (kept separate from rules so UI can import cheaply). */
export const MODE_INFO = {
  elimination: {
    id: 'elimination',
    name: 'ELIMINATION',
    tagline: 'Last squad standing',
    description:
      'Best-of-seven rounds. Wipe the enemy squad to take the round. ' +
      'Sides swap every round - your squad keeps its score.',
    rules: [
      'First squad to 4 round wins takes the match',
      '2:00 per round, 3s freeze at the start',
      'Time up: most players alive, then most health',
      'No respawns inside a round',
    ],
  },
  bunkers: {
    id: 'bunkers',
    name: 'BUNKERS',
    tagline: 'Raid theirs, hold yours',
    description:
      'One round. Each squad guards two bunkers in its corner rooms. ' +
      'Break the enemy bunkers, wipe their squad, or lead on points when the clock runs out.',
    rules: [
      'Win by destroying every enemy bunker',
      'Win by eliminating the enemy squad',
      'Otherwise the highest score at 3:00 wins',
      'Kill = 100 pts, bunker damage and destruction score too',
    ],
  },
};

export function createMode(id) {
  const mode = MODES[id];
  if (!mode) throw new Error(`Unknown mode: ${id}`);
  return mode;
}
