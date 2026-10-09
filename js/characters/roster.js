import { COLORS } from '../utils/color.js';

export const SUBCLASS_STATS = {
  BREACHER: { hp:100, speed:220, fireRate:10, magSize:20, damage:12, range:900,  reloadTime:1500, bulletSpeed:2000 },
  RAIDER:   { hp:100, speed:260, fireRate:8,  magSize:24, damage:12, range:800,  reloadTime:1500, bulletSpeed:2000 },
  WARDEN:   { hp:150, speed:180, fireRate:6,  magSize:30, damage:14, range:900,  reloadTime:2000, bulletSpeed:2000 },
  PALADIN:  { hp:130, speed:190, fireRate:6,  magSize:30, damage:12, range:800,  reloadTime:2000, bulletSpeed:2000 },
  MEDIC:    { hp:100, speed:210, fireRate:7,  magSize:25, damage:10, range:700,  reloadTime:1500, bulletSpeed:2000 },
  HYBRID:   { hp:100, speed:220, fireRate:8,  magSize:25, damage:11, range:800,  reloadTime:1500, bulletSpeed:2000 },
  SCOUT:    { hp:90,  speed:280, fireRate:8,  magSize:24, damage:10, range:600,  reloadTime:1200, bulletSpeed:2000 },
  LONG:     { hp:100, speed:190, fireRate:2,  magSize:10, damage:35, range:1400, reloadTime:2500, bulletSpeed:2400 },
  OPERATOR: { hp:100, speed:220, fireRate:8,  magSize:25, damage:12, range:800,  reloadTime:1500, bulletSpeed:2000 },
  GAMBIT:   { hp:100, speed:220, fireRate:8,  magSize:25, damage:12, range:800,  reloadTime:1500, bulletSpeed:2000 },
};

export const ROSTER = {
  VEX:    { name:'VEX',    class:'ASSAULT', subclass:'BREACHER' },
  RIFT:   { name:'RIFT',   class:'ASSAULT', subclass:'RAIDER'   },
  ANCHOR: { name:'ANCHOR', class:'BULWARK', subclass:'WARDEN'   },
  HALO:   { name:'HALO',   class:'BULWARK', subclass:'PALADIN'  },
  VITAL:  { name:'VITAL',  class:'COMMAND', subclass:'MEDIC'    },
  PULSE:  { name:'PULSE',  class:'COMMAND', subclass:'HYBRID'   },
  GHOST:  { name:'GHOST',  class:'OUTPOST', subclass:'SCOUT'    },
  NOVA:   { name:'NOVA',   class:'OUTPOST', subclass:'LONG'     },
  ECHO:   { name:'ECHO',   class:'JOKER',   subclass:'OPERATOR' },
  SHIFT:  { name:'SHIFT',  class:'JOKER',   subclass:'GAMBIT'   },
};

/**
 * Build a full entity object from a roster key + team + isHuman flag.
 * Returns a fresh player-like object ready to be pushed to WORLD.entities.
 */
export function buildEntity({ key, team, isHuman = false, username = null, id = null, squad = null }) {
  const char = ROSTER[key];
  if (!char) throw new Error(`Unknown character key: ${key}`);

  const stats = SUBCLASS_STATS[char.subclass];
  const color = team === 'WARDEN' ? COLORS.blueTeam : COLORS.redTeam;

  return {
    id: id || key.toLowerCase() + '_' + Math.floor(Math.random() * 1e6),
    name: char.name,
    className: char.class,
    subclass: char.subclass,
    team,
    squad: squad || (team === 'WARDEN' ? 'ALPHA' : 'OMEGA'),
    color,
    isHuman,
    username: username || (isHuman ? 'player_001' : key.toLowerCase()),

    // Transform
    position: { x: 0, y: 0 },
    velocity: { x: 0, y: 0 },
    aim: 0,

    // Combat
    health: stats.hp,
    maxHealth: stats.hp,
    ammo: stats.magSize,
    magSize: stats.magSize,
    reloading: false,
    reloadEndsAt: 0,
    reloadTime: stats.reloadTime,
    fireRate: stats.fireRate,
    damage: stats.damage,
    bulletSpeed: stats.bulletSpeed,
    range: stats.range,
    lastShotAt: 0,

    // Movement
    speed: stats.speed,
    accel: 800,
    friction: 8,
    radius: 22,

    // State
    state: 'alive',
    deadAt: 0,
    kills: 0,
    deaths: 0,

    // AI (populated by Bot wrapper if not human)
    ai: null,
  };
}

/**
 * Bunkers mode skews the enemy squad toward defensive classes
 * (spec 20: WARDEN, BREACHER, MEDIC). Used as pick weights.
 */
export const BUNKER_PICK_WEIGHT = {
  ANCHOR: 3, VEX: 3, VITAL: 3,
};

/** Class glyph colours/labels used by menus. */
export const CLASS_BLURB = {
  ASSAULT: 'Frontline damage',
  BULWARK: 'Tanky anchor',
  COMMAND: 'Support & utility',
  OUTPOST: 'Range & recon',
  JOKER:   'Balanced all-rounder',
};
