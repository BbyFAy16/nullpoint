import { COLORS } from '../utils/color.js';

export class TeamRegistry {
  constructor() {
    this.teams = {
      WARDEN:  { name: 'WARDEN',  spawns: [], members: [] },
      BREAKER: { name: 'BREAKER', spawns: [], members: [] },
    };
  }

  /** Remove every member (used when a new match is built). */
  clear() {
    this.teams.WARDEN.members = [];
    this.teams.BREAKER.members = [];
  }

  /** Every entity belonging to a squad, regardless of current side. */
  squadMembers(squad) {
    return [
      ...this.teams.WARDEN.members,
      ...this.teams.BREAKER.members,
    ].filter(e => e.squad === squad);
  }

  /** Which side ('WARDEN' | 'BREAKER') a squad is currently fighting on. */
  squadSide(squad) {
    if (this.teams.WARDEN.members.some(e => e.squad === squad)) return 'WARDEN';
    if (this.teams.BREAKER.members.some(e => e.squad === squad)) return 'BREAKER';
    return null;
  }

  squadAlive(squad) {
    return this.squadMembers(squad).filter(e => e.state === 'alive').length;
  }

  squadHealth(squad) {
    return this.squadMembers(squad)
      .reduce((sum, e) => sum + (e.state === 'alive' ? e.health : 0), 0);
  }

  setSpawns(team, spawnPoints) {
    if (!this.teams[team]) throw new Error(`Unknown team: ${team}`);
    this.teams[team].spawns = spawnPoints.slice();
  }

  addMember(team, entity) {
    if (!this.teams[team]) throw new Error(`Unknown team: ${team}`);
    this.teams[team].members.push(entity);
  }

  getMembers(team) {
    return this.teams[team].members;
  }

  nextAliveMember(team, currentMember) {
    const members = this.getMembers(team);
    const currentIndex = members.indexOf(currentMember);
    for (let offset = 1; offset <= members.length; offset++) {
      const candidate = members[(currentIndex + offset + members.length) % members.length];
      if (candidate.state === 'alive') return candidate;
    }
    return null;
  }

  swapSides() {
    const wardenMembers = this.teams.WARDEN.members;
    this.teams.WARDEN.members = this.teams.BREAKER.members;
    this.teams.BREAKER.members = wardenMembers;

    for (const member of this.teams.WARDEN.members) {
      member.team = 'WARDEN';
      member.color = COLORS.blueTeam;
    }
    for (const member of this.teams.BREAKER.members) {
      member.team = 'BREAKER';
      member.color = COLORS.redTeam;
    }
  }

  enemiesOf(entity) {
    const enemyTeam = entity.team === 'WARDEN' ? 'BREAKER' : 'WARDEN';
    return this.teams[enemyTeam].members;
  }

  alliesOf(entity) {
    return this.teams[entity.team].members;
  }

  aliveCount(team) {
    return this.teams[team].members.filter(e => e.state === 'alive').length;
  }

  /** Reset all members: full HP, full ammo, respawn position, alive state. */
  resetForRound() {
    for (const teamName of ['WARDEN', 'BREAKER']) {
      const team = this.teams[teamName];
      const spawns = team.spawns;
      team.members.forEach((e, i) => {
        const sp = spawns[i % spawns.length];
        e.position.x = sp.x;
        e.position.y = sp.y;
        e.velocity.x = 0;
        e.velocity.y = 0;
        e.health = e.maxHealth;
        e.ammo = e.magSize;
        e.reloading = false;
        e.reloadEndsAt = 0;
        e.state = 'alive';
        e.deadAt = 0;
        e.lastShotAt = 0;
        if (e.ai) e.ai.reset();
      });
    }
  }
}