/**
 * Roles:
 *   ENTRY   — first to engage, aggressive push
 *   FLANK   — attack from side lanes
 *   ANCHOR  — hold chokes, don't chase
 *   SUPPORT — stay near allies, heal/aura
 *   FLEX    — adapts
 *   SNIPER  — long range, hold sightlines
 *   SCOUT   — aggressive recon
 */
export const SUBCLASS_ROLE = {
  BREACHER: 'ENTRY',
  RAIDER:   'FLANK',
  WARDEN:   'ANCHOR',
  PALADIN:  'SUPPORT',
  MEDIC:    'SUPPORT',
  HYBRID:   'FLEX',
  SCOUT:    'SCOUT',
  LONG:     'SNIPER',
  OPERATOR: 'FLEX',
  GAMBIT:   'FLEX',
};

/**
 * Postures per role. Posture determines which lane waypoint the bot
 * prefers and how far forward it likes to be.
 */
export const ROLE_POSTURE = {
  ENTRY:   { frontBias: 0.9, lanePreference: 'middle', engagementRange: 1.0, coverUse: 0.6 },
  FLANK:   { frontBias: 0.7, lanePreference: 'side',   engagementRange: 1.0, coverUse: 0.5 },
  ANCHOR:  { frontBias: 0.4, lanePreference: 'middle', engagementRange: 0.9, coverUse: 0.9 },
  SUPPORT: { frontBias: 0.2, lanePreference: 'side',   engagementRange: 0.8, coverUse: 0.8 },
  FLEX:    { frontBias: 0.5, lanePreference: 'any',    engagementRange: 1.0, coverUse: 0.7 },
  SNIPER:  { frontBias: 0.1, lanePreference: 'long',   engagementRange: 1.4, coverUse: 1.0 },
  SCOUT:   { frontBias: 0.8, lanePreference: 'side',   engagementRange: 0.9, coverUse: 0.4 },
};

/**
 * Assign roles to a team. Bots get their role from SUBCLASS_ROLE.
 * Also assigns a lane ownership so bots don't stack.
 */
export function assignTeamRoles(teamMembers) {
  const bots = teamMembers.filter(e => e.ai);
  const lanes = ['top', 'middle', 'bottom'];

  // Assign roles from subclass
  for (const bot of bots) {
    bot.role = SUBCLASS_ROLE[bot.subclass] || 'FLEX';
    bot.posture = ROLE_POSTURE[bot.role] || ROLE_POSTURE.FLEX;
  }

  // Lane assignment: use role preferences first, then distribute
  const laneCounts = { top: 0, middle: 0, bottom: 0 };
  const assigned = new Set();

  // Pass 1 — roles with strong lane preference
  for (const bot of bots) {
    if (bot.role === 'SNIPER') {
      bot.lane = 'middle';
      laneCounts.middle++;
      assigned.add(bot.id);
    } else if (bot.role === 'FLANK' || bot.role === 'SCOUT') {
      // Pick a side lane
      const side = laneCounts.top <= laneCounts.bottom ? 'top' : 'bottom';
      bot.lane = side;
      laneCounts[side]++;
      assigned.add(bot.id);
    }
  }

  // Pass 2 — remaining bots fill gaps
  for (const bot of bots) {
    if (assigned.has(bot.id)) continue;
    // Pick the least-used lane
    let bestLane = 'middle';
    let bestCount = Infinity;
    for (const lane of lanes) {
      if (laneCounts[lane] < bestCount) {
        bestCount = laneCounts[lane];
        bestLane = lane;
      }
    }
    bot.lane = bestLane;
    laneCounts[bestLane]++;
  }
}