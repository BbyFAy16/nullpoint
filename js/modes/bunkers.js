import { Bunker } from '../entities/Bunker.js';
import { SUBCLASS_ROLE } from '../systems/roles.js';

/**
 * BUNKERS — a single round, three ways to win:
 *
 *   1. KILL POINTS      eliminate the entire enemy squad
 *   2. DESTROY BUNKERS  destroy every enemy bunker
 *   3. MOST POINTS      when time expires the higher score wins
 *
 * Points: +KILL_POINTS per kill, +1 per DAMAGE_PER_POINT bunker HP dealt,
 * +DESTROY_BONUS when a bunker falls. No mid-round respawns.
 */
export const KILL_POINTS = 100;
export const DAMAGE_PER_POINT = 20;
export const DESTROY_BONUS = 150;

// Lower rank = more defensive. Used to choose who stays home.
const DEFENSE_RANK = {
  ANCHOR: 0, SUPPORT: 1, SNIPER: 2, FLEX: 3, SCOUT: 4, FLANK: 5, ENTRY: 6,
};

export const bunkersMode = {
  id: 'bunkers',
  label: 'BUNKERS',

  config: {
    freezeSeconds: 3,
    combatSeconds: 180,
    roundEndSeconds: 3,
    bestOf: 1,
    swapSides: false,
  },

  /** Build the bunker objectives and add them to the arena geometry. */
  setup(match) {
    const { world, map } = match;
    world.bunkers = [];
    for (const site of map.bunkerSites) {
      const squad = match.teams.getMembers(site.side)[0]?.squad
        ?? (site.side === 'WARDEN' ? 'ALPHA' : 'OMEGA');
      const bunker = new Bunker({
        id: site.id, cx: site.cx, cy: site.cy, squad, side: site.side,
      });
      world.bunkers.push(bunker);
      world.walls.push(bunker);
    }
    match.points = { ALPHA: 0, OMEGA: 0 };
    match.killCount = { ALPHA: 0, OMEGA: 0 };
  },

  onRoundStart(match) {
    for (const b of match.world.bunkers ?? []) {
      b.hp = b.maxHp;
      b.hitFlash = 0;
      b.lastHitAt = 0;
      b.pointsAwardedHp = 0;
      if (b.destroyed) {
        b.destroyed = false;
        if (!match.world.walls.includes(b)) match.world.walls.push(b);
      }
    }
    match.points = { ALPHA: 0, OMEGA: 0 };
    match.killCount = { ALPHA: 0, OMEGA: 0 };
    assignJobs(match);
    match.rebuildNavigation();
  },

  update() {},

  onKill(match, ev) {
    if (!ev.attackerSquad || ev.attackerSquad === ev.victimSquad) return;
    match.points[ev.attackerSquad] += KILL_POINTS;
    match.killCount[ev.attackerSquad]++;
  },

  onBunkerDamage(match, ev) {
    if (!ev.attackerSquad) return;
    match.points[ev.attackerSquad] += ev.amount / DAMAGE_PER_POINT;
  },

  onBunkerDestroyed(match, ev) {
    if (ev.attackerSquad) match.points[ev.attackerSquad] += DESTROY_BONUS;
  },

  checkRoundEnd(match, now, timeUp) {
    const { teams, world } = match;
    const left = (squad) => world.bunkers.filter(b => b.squad === squad && !b.destroyed);

    const aBunkers = left('ALPHA').length;
    const oBunkers = left('OMEGA').length;
    const aAlive = teams.squadAlive('ALPHA');
    const oAlive = teams.squadAlive('OMEGA');

    // 2) bunkers destroyed
    if (aBunkers === 0 || oBunkers === 0) {
      if (aBunkers === 0 && oBunkers === 0) return pointsWinner(match, 'BUNKERS DESTROYED');
      return { winner: oBunkers === 0 ? 'ALPHA' : 'OMEGA', reason: 'BUNKERS DESTROYED' };
    }

    // 1) kill points -> squad eliminated
    if (aAlive === 0 || oAlive === 0) {
      if (aAlive === 0 && oAlive === 0) return pointsWinner(match, 'DOUBLE WIPE');
      return { winner: oAlive === 0 ? 'ALPHA' : 'OMEGA', reason: 'SQUAD ELIMINATED' };
    }

    // 3) time -> most points
    if (timeUp) return pointsWinner(match, 'TIME UP - MOST POINTS');
    return null;
  },

  checkMatchEnd(match, rounds) {
    for (const squad of ['ALPHA', 'OMEGA']) {
      if (rounds.scores[squad] >= rounds.winsToTakeMatch) return squad;
    }
    return null;
  },

  getHudState(match) {
    const bunkers = { ALPHA: [], OMEGA: [] };
    for (const b of match.world.bunkers ?? []) {
      bunkers[b.squad].push({ fraction: b.destroyed ? 0 : b.fraction, destroyed: b.destroyed });
    }
    return {
      modeLabel: 'BUNKERS',
      scoreLabel: 'POINTS',
      infoLine: 'DESTROY BUNKERS',
      goalLine: 'OR WIPE THE SQUAD',
      scores: {
        ALPHA: Math.floor(match.points.ALPHA),
        OMEGA: Math.floor(match.points.OMEGA),
      },
      bunkers,
    };
  },
};

/**
 * Tie-break chain for the points decision: points -> remaining bunker HP ->
 * players alive -> total health -> whoever is defending.
 */
function pointsWinner(match, reason) {
  const { points, teams, world } = match;
  const pa = Math.floor(points.ALPHA);
  const po = Math.floor(points.OMEGA);
  if (pa !== po) return { winner: pa > po ? 'ALPHA' : 'OMEGA', reason };

  const hp = (squad) => world.bunkers
    .filter(b => b.squad === squad && !b.destroyed)
    .reduce((sum, b) => sum + b.hp, 0);
  if (Math.abs(hp('ALPHA') - hp('OMEGA')) > 0.5) {
    return { winner: hp('ALPHA') > hp('OMEGA') ? 'ALPHA' : 'OMEGA', reason: `${reason} (BUNKER HP)` };
  }
  const aa = teams.squadAlive('ALPHA');
  const oa = teams.squadAlive('OMEGA');
  if (aa !== oa) return { winner: aa > oa ? 'ALPHA' : 'OMEGA', reason: `${reason} (ALIVE)` };
  const ha = teams.squadHealth('ALPHA');
  const ho = teams.squadHealth('OMEGA');
  if (Math.abs(ha - ho) > 0.5) return { winner: ha > ho ? 'ALPHA' : 'OMEGA', reason: `${reason} (HEALTH)` };
  return { winner: teams.getMembers('WARDEN')[0]?.squad ?? 'ALPHA', reason: `${reason} (TIE)` };
}

/**
 * Decide who stays home. 3v3 keeps one defender per squad, 5v5 keeps two,
 * picked by the most defensive roles first. Everyone else assaults.
 */
function assignJobs(match) {
  for (const squad of ['ALPHA', 'OMEGA']) {
    const members = match.teams.squadMembers(squad).filter(e => e.ai);
    const defenders = members.length >= 5 ? 2 : 1;
    const ranked = [...members].sort((a, b) =>
      (DEFENSE_RANK[SUBCLASS_ROLE[a.subclass] ?? 'FLEX'] ?? 3) -
      (DEFENSE_RANK[SUBCLASS_ROLE[b.subclass] ?? 'FLEX'] ?? 3)
    );
    ranked.forEach((bot, i) => {
      bot.objectiveJob = i < defenders ? 'DEFEND' : 'ASSAULT';
    });
  }
}
