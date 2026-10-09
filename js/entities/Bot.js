export class BotMemory {
  constructor() {
    this.reset();
  }

  reset() {
    this.state = 'IDLE';

    // Perception
    this.visibleEnemy = null;
    this.target = null;
    this.targetAcquiredAt = 0;
    this.lastSeenAt = 0;
    this.lastSeenX = 0;
    this.lastSeenY = 0;

    // Aim
    this.aimErrorAngle = 0;
    this.aimErrorChangeAt = 0;
    this.firstShotAt = 0;
    this.lastEngageAt = 0;

    // Path
    this.path = [];
    this.waypointIndex = 0;
    this.pathDestination = null;
    this.pushWaypointIndex = 0;
    this.repathAt = 0;
    this.lastPathAt = 0;
    this.recoveryTarget = null;
    this.recoveryUntil = 0;
    this.stuckChecks = 0;
    this.lastStuckCheckAt = 0;
    this.debugDestination = null;
    this.debugPathLength = 0;
    this.debugRecovery = false;
    this.attackCoverIndex = null;
    this.attackTargetId = null;
    this.shotBlockedUntil = 0;
    this.shotBlockedBy = null;
    this._stuckAt = 0;
    this._lastPos = { x: 0, y: 0 };
    this.lastMovedAt = 0;

    // Damage reaction
    this.lastDamage = null;
    this.reactingUntil = 0;
    this.reactionStartedAt = 0;
    this.reactionDelayUntil = 0;
    this.searchUntil = 0;
    this.searchAngle = 0;
    this.searchingAt = 0;

    // Utility AI
    this.currentAction = null;
    this.currentActionName = null;
    this.actionStartAt = 0;
    this.repositionTarget = null;
    this.holdingAt = undefined;

    // Burst fire
    this.burst = {
      shotsLeft: 0,
      pauseUntil: 0,
      nextShotAt: 0,
    };
  }
}

export function makeBot(entity, skill = 0.5) {
  entity.ai = new BotMemory();
  entity.isHuman = false;
  entity.skill = Math.max(0, Math.min(1, skill));
  return entity;
}