/**
 * Utility AI with:
 *   - scored actions
 *   - hysteresis: new action must beat current by a meaningful margin
 *   - minimum action duration: can't switch until MIN_DURATION has passed
 *   - score smoothing: EMA of scores so single-tick spikes don't win
 */
export class UtilityAI {
  constructor(actions, opts = {}) {
    this.actions = actions;
    this.actionsByName = new Map(actions.map(a => [a.name, a]));

    // Minimum score advantage (0..1) required to change actions.
    this.hysteresis = opts.hysteresis ?? 0.08;

    // Minimum time an action stays active (ms) before we can switch
    this.minDurationMs = opts.minDurationMs ?? 700;

    // Score smoothing factor (0 = no smoothing, 1 = never update)
    // 0.7 = 70% old score, 30% new score each tick
    this.smoothing = opts.smoothing ?? 0.85;

    this.currentName = null;
    this.currentAction = null;
    this.currentStartAt = 0;
    this.smoothScores = {};
    this.rawScores = {};
  }

  reset() {
    this.currentName = null;
    this.currentAction = null;
    this.currentStartAt = 0;
    this.smoothScores = {};
    this.rawScores = {};
  }

  evaluate(ctx) {
    const now = ctx.now;

    // -------- 1. Compute raw scores --------
    const raw = {};
    for (const action of this.actions) {
      raw[action.name] = clamp01(action.score(ctx));
    }
    this.rawScores = raw;

    // -------- 2. Smooth scores (EMA) --------
    // Prevents single-tick spikes from winning
    for (const name of Object.keys(raw)) {
      const prev = this.smoothScores[name];
      if (prev === undefined) {
        this.smoothScores[name] = raw[name];
      } else {
        this.smoothScores[name] = prev * this.smoothing + raw[name] * (1 - this.smoothing);
      }
    }

    // -------- 3. Find the best (on smoothed scores) --------
    let bestName = null;
    let bestScore = -Infinity;
    for (const name of Object.keys(this.smoothScores)) {
      if (this.smoothScores[name] > bestScore) {
        bestScore = this.smoothScores[name];
        bestName = name;
      }
    }
    let bestRawName = null;
    let bestRawScore = -Infinity;
    for (const name of Object.keys(raw)) {
      if (raw[name] > bestRawScore) {
        bestRawScore = raw[name];
        bestRawName = name;
      }
    }

    // -------- 4. Enforce minimum duration --------
    const timeSinceStart = now - this.currentStartAt;
    const canSwitch = timeSinceStart >= this.minDurationMs;

    // -------- 5. Hysteresis: only switch if new best clearly wins --------
    let chosen = this.currentName || bestName;
    if (this.currentName) {
      const currentScore = this.smoothScores[this.currentName] ?? -Infinity;
      const currentRawScore = raw[this.currentName] ?? 0;
      const currentActionInvalid = currentRawScore === 0 && bestRawScore > 0;
      const challengerName = currentActionInvalid ? bestRawName : bestName;
      if (bestName === this.currentName) {
        if (currentActionInvalid) {
          chosen = challengerName;
        } else {
          // Staying anyway
          chosen = this.currentName;
        }
      } else if (currentActionInvalid) {
        chosen = challengerName;
      } else if (
        canSwitch &&
        this.smoothScores[challengerName] >= currentScore + this.hysteresis
      ) {
        chosen = challengerName;
      } else {
        chosen = this.currentName;
      }
    } else {
      chosen = bestName;
    }

    // -------- 6. Handle action change --------
    if (chosen !== this.currentName) {
      this.currentAction?.exit?.(ctx);
      this.currentName = chosen;
      this.currentAction = this.actionsByName.get(chosen);
      this.currentStartAt = now;
      this.currentAction?.enter?.(ctx);
    }

    return this.currentAction;
  }
}

function clamp01(v) {
  if (v < 0) return 0;
  if (v > 1) return 1;
  return v;
}

export class Action {
  constructor(name) { this.name = name; }
  score(ctx) { return 0; }
  enter(ctx) {}
  tick(ctx, dt) {}
  exit(ctx) {}
}