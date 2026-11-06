/**
 * MOTO-ROGUE: Weapon Data Module
 *
 * Defines all 7 player weapons, ballistic parameters, unlock costs,
 * visual styles, and unlockable weapon IDs.
 *
 * Parity reference: moto-rogue/index.html L894-L974 & L1811-L1958
 */

export type WeaponId =
  | 'pistol'
  | 'machine_gun'
  | 'flamethrower'
  | 'grenade_launcher'
  | 'shotgun'
  | 'railgun'
  | 'arc_coil';

export type UnlockableWeaponId = Exclude<WeaponId, 'pistol'>;

export interface WeaponDef {
  /** Unique weapon identifier */
  id: WeaponId;
  /** Display name in HUD and Garage */
  name: string;
  /** Direct keyboard selection key ('1' - '7') */
  key: string;
  /** Gameplay flavor and tactical description */
  desc: string;
  /** Alias for desc for interface flexibility */
  description: string;
  /** Permanent scrap unlock cost in Garage (0 for default starting sidearm) */
  cost: number;
  /** Base fire cooldown interval in seconds */
  cooldown: number;
  /** Base impact damage per projectile */
  damage: number;
  /** Alias for damage matching original monolith property */
  baseDmg: number;
  /** Projectile travel speed in pixels/second */
  speed: number;
  /** Alias for speed matching original monolith property */
  projSpeed: number;
  /** Primary vector and particle color (hex code) */
  color: string;
  /** Collision radius in pixels */
  radius: number;
  /** Lifetime in seconds before despawning */
  life: number;
}

/**
 * Complete WEAPONS dictionary matching exact original prototype balance.
 */
export const WEAPONS: Record<WeaponId, WeaponDef> = {
  pistol: {
    id: 'pistol',
    key: '1',
    name: 'Pistol',
    desc: 'Accurate semi-auto sidearm. Reliable range & steady damage.',
    description: 'Accurate semi-auto sidearm. Reliable range & steady damage.',
    cost: 0,
    cooldown: 0.27,
    damage: 13,
    baseDmg: 13,
    speed: 540,
    projSpeed: 540,
    color: '#ffd166',
    radius: 5,
    life: 1.15
  },
  machine_gun: {
    id: 'machine_gun',
    key: '2',
    name: 'Machine Gun',
    desc: 'High fire-rate SMG. Lower damage per round with recoil spread.',
    description: 'High fire-rate SMG. Lower damage per round with recoil spread.',
    cost: 55,
    cooldown: 0.095,
    damage: 5.5,
    baseDmg: 5.5,
    speed: 620,
    projSpeed: 620,
    color: '#4cc9f0',
    radius: 4,
    life: 0.95
  },
  flamethrower: {
    id: 'flamethrower',
    key: '3',
    name: 'Flamethrower',
    desc: 'Short-range fire cone. Each puff hits once & applies Burn DoT.',
    description: 'Short-range fire cone. Each puff hits once & applies Burn DoT.',
    cost: 95,
    cooldown: 0.09,
    damage: 3.2,
    baseDmg: 3.2,
    speed: 290,
    projSpeed: 290,
    color: '#ff6b2b',
    radius: 6,
    life: 0.36
  },
  grenade_launcher: {
    id: 'grenade_launcher',
    key: '4',
    name: 'Grenade Launcher',
    desc: 'Lobbed explosive shells. Heavy AoE blast with slower reload.',
    description: 'Lobbed explosive shells. Heavy AoE blast with slower reload.',
    cost: 140,
    cooldown: 0.78,
    damage: 36,
    baseDmg: 36,
    speed: 410,
    projSpeed: 410,
    color: '#f72585',
    radius: 8,
    life: 0.95
  },
  shotgun: {
    id: 'shotgun',
    key: '5',
    name: 'Sawed-Off Shotgun',
    desc: '6-pellet buckshot cone. Devastating close-range burst & knockback.',
    description: '6-pellet buckshot cone. Devastating close-range burst & knockback.',
    cost: 70,
    cooldown: 0.56,
    damage: 5.2,
    baseDmg: 5.2,
    speed: 560,
    projSpeed: 560,
    color: '#ffbe0b',
    radius: 4.5,
    life: 0.46
  },
  railgun: {
    id: 'railgun',
    key: '6',
    name: 'Plasma Railgun',
    desc: 'Hyper-velocity electromagnetic slug that pierces all enemies in a line.',
    description: 'Hyper-velocity electromagnetic slug that pierces all enemies in a line.',
    cost: 120,
    cooldown: 0.80,
    damage: 35,
    baseDmg: 35,
    speed: 980,
    projSpeed: 980,
    color: '#00f5d4',
    radius: 6.5,
    life: 0.85
  },
  arc_coil: {
    id: 'arc_coil',
    key: '7',
    name: 'Arc Tesla Coil',
    desc: 'High-voltage lightning orb that chains arcs to up to 3 nearby enemies.',
    description: 'High-voltage lightning orb that chains arcs to up to 3 nearby enemies.',
    cost: 165,
    cooldown: 0.40,
    damage: 15,
    baseDmg: 15,
    speed: 520,
    projSpeed: 520,
    color: '#c77dff',
    radius: 6,
    life: 1.0
  }
};

/**
 * Array of permanent weapons purchasable in the Garage.
 * Ordered by unlock display position.
 */
export const UNLOCKABLE_IDS: readonly UnlockableWeaponId[] = [
  'machine_gun',
  'shotgun',
  'flamethrower',
  'railgun',
  'grenade_launcher',
  'arc_coil'
] as const;

/**
 * Helper: checks if an arbitrary string is a valid WeaponId.
 */
export function isWeaponId(id: string): id is WeaponId {
  return Object.prototype.hasOwnProperty.call(WEAPONS, id);
}

/**
 * Helper: retrieves weapon definition with fallback to pistol.
 */
export function getWeaponDef(id: string): WeaponDef {
  if (isWeaponId(id)) {
    return WEAPONS[id];
  }
  return WEAPONS.pistol;
}
