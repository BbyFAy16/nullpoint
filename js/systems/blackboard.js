import { findBestCover } from './cover.js';

/**
 * TeamBlackboard — one instance per team.
 * Updated once per frame by AISystem (before individual bot ticks).
 */
export class TeamBlackboard {
  constructor(team) {
    this.team = team;

    // Which enemy the team is focusing on right now
    this.focusTarget = null;
    this.focusSetAt = 0;
    this.focusTimeoutMs = 2000;
    this.engagements = new Map();
    this.engagementTargetId = null;
    this.engagementUpdatedAt = 0;
    this.engagementRefreshMs = 750;

    // Recent enemy contact — where and when
    this.alertPos = null;      // { x, y }
    this.alertAt = 0;
    this.alertTimeoutMs = 3000;

    this.damageIncident = null;
    this.nextIncidentId = 1;
    this.plannedIncidentId = null;
    this.responses = new Map();
    this.responseTimeoutMs = 7000;
    this.damageMergeMs = 1200;

    // Lane ownership (botId → lane)
    this.laneAssignments = new Map();

    // Damage taken from unknown directions
    this.lastSquadDamage = null;
    this.lastSquadDamageAt = 0;
  }

  reset() {
    this.focusTarget = null;
    this.focusSetAt = 0;
    this.engagements.clear();
    this.engagementTargetId = null;
    this.engagementUpdatedAt = 0;
    this.alertPos = null;
    this.alertAt = 0;
    this.damageIncident = null;
    this.plannedIncidentId = null;
    this.responses.clear();
    this.lastSquadDamage = null;
    this.lastSquadDamageAt = 0;
  }

  /**
   * Update from current world state. Called once per frame.
   */
  update(now, members, enemies, walls, coverPoints = [], bounds = null) {
    this._updateFocusTarget(now, members);
    this._updateEngagements(now, members);
    this._expireAlerts(now);
    this._expireDamageIncident(now);
    const hasMissingResponder = [...this.responses.keys()].some(
      id => !members.some(member => member.id === id && member.state === 'alive')
    );
    if (
      this.damageIncident &&
      (this.plannedIncidentId !== this.damageIncident.id || hasMissingResponder)
    ) {
      this._planResponses(now, members, coverPoints, bounds);
    }
  }

  _updateEngagements(now, members) {
    const target = this.focusTarget;
    if (!target || target.state !== 'alive') {
      if (now - this.focusSetAt > this.focusTimeoutMs) {
        this.engagements.clear();
        this.engagementTargetId = null;
      }
      return;
    }
    if (
      this.engagementTargetId === target.id &&
      now - this.engagementUpdatedAt < this.engagementRefreshMs
    ) return;

    this.engagements.clear();
    this.engagementTargetId = target.id;
    this.engagementUpdatedAt = now;

    const available = members.filter(member =>
      member.ai &&
      member.state === 'alive' &&
      member.ai.visibleEnemy?.enemy === target
    );
    const flankers = available
      .filter(member => ['FLANK', 'SCOUT'].includes(member.role))
      .sort((a, b) => a.id.localeCompare(b.id));
    const allies = members.filter(member => member.state === 'alive');
    const center = allies.reduce(
      (sum, member) => ({
        x: sum.x + member.position.x / Math.max(1, allies.length),
        y: sum.y + member.position.y / Math.max(1, allies.length),
      }),
      { x: 0, y: 0 }
    );
    const towardTeam = Math.atan2(
      center.y - target.position.y,
      center.x - target.position.x
    );

    flankers.forEach((member, index) => {
      const side = index % 2 === 0 ? 1 : -1;
      const angle = towardTeam + side * (Math.PI * 0.55);
      const distance = (member.posture?.engagementRange ?? 1) * 280;
      this.engagements.set(member.id, {
        targetId: target.id,
        position: {
          x: target.position.x + Math.cos(angle) * distance,
          y: target.position.y + Math.sin(angle) * distance,
        },
        role: member.role,
        kind: 'flank',
      });
    });
  }

  _updateFocusTarget(now, members) {
    // Count how many bots can see each enemy
    const votes = new Map();
    for (const m of members) {
      if (m.state !== 'alive' || !m.ai) continue;
      const visible = m.ai.visibleEnemy?.enemy;
      if (!visible) continue;
      votes.set(visible.id, (votes.get(visible.id) || 0) + 1);
    }

    // Pick the most-visible enemy
    let bestId = null;
    let bestCount = 0;
    for (const [id, count] of votes) {
      if (count > bestCount) {
        bestCount = count;
        bestId = id;
      }
    }

    if (bestId && bestCount >= 1) {
      // Find the entity
      for (const m of members) {
        if (!m.ai) continue;
        const e = m.ai.visibleEnemy?.enemy;
        if (e && e.id === bestId) {
          this.focusTarget = e;
          this.focusSetAt = now;
          break;
        }
      }
    } else if (now - this.focusSetAt > this.focusTimeoutMs) {
      this.focusTarget = null;
    }
  }

  _expireAlerts(now) {
    if (this.alertPos && now - this.alertAt > this.alertTimeoutMs) {
      this.alertPos = null;
    }
  }

  _expireDamageIncident(now) {
    if (
      this.damageIncident &&
      now - this.damageIncident.updatedAt > this.responseTimeoutMs
    ) {
      this.damageIncident = null;
      this.responses.clear();
      this.plannedIncidentId = null;
    }
  }

  _planResponses(now, members, coverPoints, bounds) {
    const incident = this.damageIncident;
    if (!incident) return;

    this.responses.clear();
    this.plannedIncidentId = incident.id;

    const candidates = members
      .filter(member => member.ai && member.state === 'alive')
      .map(member => {
        const role = member.role || 'FLEX';
        const distance = Math.hypot(
          member.position.x - incident.position.x,
          member.position.y - incident.position.y
        );
        const distanceToVictim = incident.victimPosition
          ? Math.hypot(
              member.position.x - incident.victimPosition.x,
              member.position.y - incident.victimPosition.y
            )
          : distance;
        return { member, role, distance, distanceToVictim };
      });

    const mobilePriority = {
      ENTRY: 4,
      SCOUT: 3.5,
      FLANK: 3.5,
      FLEX: 2.5,
    };
    const mobile = candidates
      .filter(candidate => mobilePriority[candidate.role] && candidate.distance <= 1100)
      .sort((a, b) =>
        (mobilePriority[b.role] * 1000 - b.distance) -
        (mobilePriority[a.role] * 1000 - a.distance)
      )
      .slice(0, 2);
    const support = candidates
      .filter(candidate => candidate.role === 'SUPPORT' && candidate.distanceToVictim <= 650)
      .sort((a, b) => a.distanceToVictim - b.distanceToVictim)
      .slice(0, 1);

    const responders = [...mobile, ...support];
    const claimed = new Set(
      candidates
        .map(candidate => candidate.member.ai.holdingAt)
        .filter(index => index !== undefined && index !== null)
    );
    const threatAngle = incident.threatAngle ?? 0;

    responders.forEach(({ member, role }, index) => {
      const stagingCenter = role === 'SUPPORT' && incident.victimPosition
        ? incident.victimPosition
        : incident.position;
      const cover = coverPoints.length
        ? findBestCover(
            coverPoints,
            stagingCenter,
            threatAngle,
            { maxDistance: role === 'SUPPORT' ? 220 : 280, claimed }
          )
        : null;
      let position = cover?.point.position;
      if (cover) claimed.add(cover.index);

      if (!position) {
        const dx = member.position.x - stagingCenter.x;
        const dy = member.position.y - stagingCenter.y;
        const length = Math.hypot(dx, dy) || 1;
        const fallbackDistance = 130 + index * 85;
        position = {
          x: stagingCenter.x + dx / length * fallbackDistance,
          y: stagingCenter.y + dy / length * fallbackDistance,
        };
        if (bounds) {
          position.x = Math.max(60, Math.min(bounds.w - 60, position.x));
          position.y = Math.max(60, Math.min(bounds.h - 60, position.y));
        }
      }

      this.responses.set(member.id, {
        incidentId: incident.id,
        role,
        position,
      });
    });
  }

  /** A teammate reports being hit by a specific attacker. */
  reportDamage(
    x,
    y,
    now,
    { attackerId = null, victimId = null, victimPosition = null } = {}
  ) {
    const previous = this.damageIncident;
    const sameIncident =
      previous &&
      previous.attackerId === attackerId &&
      now - previous.updatedAt <= this.damageMergeMs;

    if (sameIncident) {
      previous.position = { x, y };
      previous.updatedAt = now;
    } else {
      this.damageIncident = {
        id: this.nextIncidentId++,
        attackerId,
        victimId,
        position: { x, y },
        victimPosition: victimPosition
          ? { x: victimPosition.x, y: victimPosition.y }
          : null,
        threatAngle: victimPosition
          ? Math.atan2(y - victimPosition.y, x - victimPosition.x)
          : 0,
        reportedAt: now,
        updatedAt: now,
      };
      this.plannedIncidentId = null;
    }
    if (sameIncident && victimPosition) {
      previous.victimPosition = { x: victimPosition.x, y: victimPosition.y };
    }

    this.lastSquadDamage = { x, y };
    this.lastSquadDamageAt = now;
    this.alertPos = { x, y };
    this.alertAt = now;
  }

  /** A bot sees an enemy and propagates the contact to the team. */
  reportContact(x, y, now) {
    if (
      this.damageIncident &&
      now - this.damageIncident.updatedAt <= this.responseTimeoutMs
    ) return;
    this.alertPos = { x, y };
    this.alertAt = now;
  }

  getIncident(now) {
    this._expireDamageIncident(now);
    if (!this.damageIncident) return null;
    return this.damageIncident;
  }

  getResponse(memberId, now) {
    const incident = this.getIncident(now);
    const response = this.responses.get(memberId);
    if (!incident || response?.incidentId !== incident.id) return null;
    return response;
  }

  getEngagement(memberId, targetId) {
    const engagement = this.engagements.get(memberId);
    if (engagement?.targetId !== targetId) return null;
    return engagement;
  }

  /** Get the current shared alert if fresh. */
  getAlert(now) {
    if (!this.alertPos) return null;
    if (now - this.alertAt > this.alertTimeoutMs) return null;
    return this.alertPos;
  }
}