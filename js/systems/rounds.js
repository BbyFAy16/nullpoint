export const RoundState = {
  FREEZE:     'FREEZE',
  COMBAT:     'COMBAT',
  ROUND_END:  'ROUND_END',
  MATCH_END:  'MATCH_END',
};

export const SQUAD_IDS = ['ALPHA', 'OMEGA'];

/**
 * Mode-agnostic round controller.
 *
 * Scores belong to SQUADS, not sides: when sides swap between rounds the
 * squad keeps its score. The mode object (see modes/*.js) decides when a
 * round ends, who won, and when the match is over; the controller only owns
 * the FREEZE -> COMBAT -> ROUND_END -> MATCH_END state machine.
 */
export class RoundController {
  /**
   * @param {object} opts
   * @param {import('./teams.js').TeamRegistry} opts.teams
   * @param {object} opts.mode            a mode from modes/index.js
   * @param {(ev:object)=>void} [opts.onEvent]
   */
  constructor({ teams, mode, onEvent = null }) {
    this.teams = teams;
    this.mode = mode;
    this.onEvent = onEvent;

    const c = mode.config;
    this.freezeSeconds = c.freezeSeconds ?? 3;
    this.combatSeconds = c.combatSeconds ?? 120;
    this.roundEndSeconds = c.roundEndSeconds ?? 3;
    this.bestOf = c.bestOf ?? 1;
    this.swapSidesEachRound = c.swapSides ?? false;
    this.winsToTakeMatch = Math.ceil(this.bestOf / 2);

    this.round = 1;
    this.scores = { ALPHA: 0, OMEGA: 0 };
    this.state = RoundState.FREEZE;
    this.stateStartedAt = 0;
    this.combatEndsAt = 0;
    this.roundWinner = null;      // squad id
    this.roundReason = '';
    this.matchWinner = null;      // squad id
  }

  _emit(type, extra = {}) {
    if (this.onEvent) this.onEvent({ type, round: this.round, ...extra });
  }

  /** Start the first round. */
  start(now, match) {
    this.round = 1;
    this.scores = { ALPHA: 0, OMEGA: 0 };
    this.matchWinner = null;
    this._enterFreeze(now, match);
  }

  _enterFreeze(now, match) {
    this.state = RoundState.FREEZE;
    this.stateStartedAt = now;
    this.combatEndsAt = 0;
    this.roundWinner = null;
    this.roundReason = '';
    this.teams.resetForRound();
    this.mode.onRoundStart(match);
    this._emit('roundStart');
  }

  _enterCombat(now) {
    this.state = RoundState.COMBAT;
    this.stateStartedAt = now;
    this.combatEndsAt = now + this.combatSeconds * 1000;
    this._emit('combatStart');
  }

  _enterRoundEnd(now, result) {
    this.state = RoundState.ROUND_END;
    this.stateStartedAt = now;
    this.roundWinner = result.winner;
    this.roundReason = result.reason || '';
    this.scores[result.winner]++;
    this._emit('roundEnd', { winner: result.winner, reason: this.roundReason });
  }

  _enterMatchEnd(now, winner) {
    this.state = RoundState.MATCH_END;
    this.stateStartedAt = now;
    this.matchWinner = winner;
    this._emit('matchEnd', { winner });
  }

  update(dt, now, match) {
    switch (this.state) {
      case RoundState.FREEZE: {
        if (now - this.stateStartedAt >= this.freezeSeconds * 1000) {
          this._enterCombat(now);
        }
        break;
      }
      case RoundState.COMBAT: {
        this.mode.update(match, dt, now);
        const timeUp = now >= this.combatEndsAt;
        const result = this.mode.checkRoundEnd(match, now, timeUp);
        if (result) this._enterRoundEnd(now, result);
        break;
      }
      case RoundState.ROUND_END: {
        if (now - this.stateStartedAt >= this.roundEndSeconds * 1000) {
          const matchWinner = this.mode.checkMatchEnd(match, this);
          if (matchWinner) {
            this._enterMatchEnd(now, matchWinner);
          } else {
            if (this.swapSidesEachRound) this.teams.swapSides();
            this.round++;
            this._enterFreeze(now, match);
          }
        }
        break;
      }
      case RoundState.MATCH_END:
        break;
    }
  }

  /** Push every running timer forward (used to exclude time spent paused). */
  shiftTime(ms) {
    this.stateStartedAt += ms;
    if (this.combatEndsAt) this.combatEndsAt += ms;
  }

  /** Seconds of freeze left (for the HUD countdown). */
  getFreezeRemainingMs(now) {
    if (this.state !== RoundState.FREEZE) return 0;
    return Math.max(0, this.freezeSeconds * 1000 - (now - this.stateStartedAt));
  }

  getCombatTimeRemainingMs(now) {
    if (this.state !== RoundState.COMBAT) return 0;
    return Math.max(0, this.combatEndsAt - now);
  }

  isCombatActive() { return this.state === RoundState.COMBAT; }

  isFrozen() {
    return this.state === RoundState.FREEZE || this.state === RoundState.ROUND_END;
  }
}
