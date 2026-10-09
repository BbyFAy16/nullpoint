/**
 * ELIMINATION — best-of-7 rounds, last squad standing.
 *
 * Score is per SQUAD: sides swap every round, the tally follows the squad.
 * Time-up no longer hands the round to whichever side happens to be
 * defending; it goes to the squad with more players alive, then more total
 * health, and only then to the current defenders.
 */
export const eliminationMode = {
  id: 'elimination',
  label: 'ELIMINATION',

  config: {
    freezeSeconds: 3,
    combatSeconds: 120,
    roundEndSeconds: 3,
    bestOf: 7,
    swapSides: true,
  },

  setup() {},
  onRoundStart() {},
  update() {},
  onKill() {},
  onBunkerDamage() {},
  onBunkerDestroyed() {},

  checkRoundEnd(match, now, timeUp) {
    const { teams } = match;
    const a = teams.squadAlive('ALPHA');
    const o = teams.squadAlive('OMEGA');

    if (a > 0 && o === 0) return { winner: 'ALPHA', reason: 'ELIMINATED' };
    if (o > 0 && a === 0) return { winner: 'OMEGA', reason: 'ELIMINATED' };
    if (a === 0 && o === 0) {
      return { winner: defendingSquad(match), reason: 'DOUBLE WIPE' };
    }

    if (timeUp) {
      if (a !== o) {
        return { winner: a > o ? 'ALPHA' : 'OMEGA', reason: 'TIME UP - MORE ALIVE' };
      }
      const ha = teams.squadHealth('ALPHA');
      const ho = teams.squadHealth('OMEGA');
      if (Math.abs(ha - ho) > 0.5) {
        return { winner: ha > ho ? 'ALPHA' : 'OMEGA', reason: 'TIME UP - MORE HEALTH' };
      }
      return { winner: defendingSquad(match), reason: 'TIME UP - DEFENDERS HOLD' };
    }
    return null;
  },

  checkMatchEnd(match, rounds) {
    for (const squad of ['ALPHA', 'OMEGA']) {
      if (rounds.scores[squad] >= rounds.winsToTakeMatch) return squad;
    }
    return null;
  },

  getHudState(match) {
    const { rounds } = match;
    return {
      modeLabel: 'ELIMINATION',
      scoreLabel: 'ROUNDS',
      infoLine: `ROUND ${rounds.round} / ${rounds.bestOf}`,
      goalLine: `FIRST TO ${rounds.winsToTakeMatch}`,
      scores: { ...rounds.scores },
      bunkers: null,
    };
  },
};

function defendingSquad(match) {
  return match.teams.getMembers('WARDEN')[0]?.squad ?? 'ALPHA';
}
