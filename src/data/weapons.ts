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
  /** Alias for cooldown / fire interval */
  fireRate: number;
  /** Base impact damage per projectile */
  damage: number;
  /** Alias for damage matching original monolith property */
  baseDmg: number;
  /** Short alias for damage */
  dmg: number;
  /** Base projectile count per shot (default 1) */
  count?: number;
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
    fireRate: 0.27,
    damage: 13,
    baseDmg: 13,
    dmg: 13,
    count: 1,
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
    fireRate: 0.095,
    damage: 5.5,
    baseDmg: 5.5,
    dmg: 5.5,
    count: 1,
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
    fireRate: 0.09,
    damage: 3.2,
    baseDmg: 3.2,
    dmg: 3.2,
    count: 1,
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
    cooldown: 1.17,
    fireRate: 1.17,
    damage: 18,
    baseDmg: 18,
    dmg: 18,
    count: 1,
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
    fireRate: 0.56,
    damage: 5.2,
    baseDmg: 5.2,
    dmg: 5.2,
    count: 6,
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
    fireRate: 0.80,
    damage: 35,
    baseDmg: 35,
    dmg: 35,
    count: 1,
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
    fireRate: 0.40,
    damage: 15,
    baseDmg: 15,
    dmg: 15,
    count: 1,
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

// ============================================================================
// WEAPON EVOLUTIONS (OVERCLOCK PROTOCOL) & PROC COEFFICIENTS
// ============================================================================

export const WEAPON_PROC_COEFFICIENTS: Record<WeaponId, number> = {
  pistol: 1.0,
  machine_gun: 0.45,
  flamethrower: 0.35,
  shotgun: 0.35,
  grenade_launcher: 1.0,
  railgun: 1.0,
  arc_coil: 0.75
};

export interface WeaponEvolutionDef {
  weaponId: WeaponId;
  evolvedName: string;
  signatureModId: string;
  signatureModDisplayName: string;
  signatureModName: string;
  evolvedColor: string;
  desc: string;
}

export const WEAPON_EVOLUTIONS: Record<WeaponId, WeaponEvolutionDef> = {
  pistol: {
    weaponId: 'pistol',
    evolvedName: 'RICOCHET REVOLVER',
    signatureModId: 'ricochet_mod',
    signatureModDisplayName: 'Rubberized Casings',
    signatureModName: 'Ricochet Rounds',
    evolvedColor: '#ffd60a',
    desc: '+2 Bounces, +35% Damage & Golden Tracer Rounds'
  },
  machine_gun: {
    weaponId: 'machine_gun',
    evolvedName: 'HYPER-VULCAN GATLING',
    signatureModId: 'hair_trigger',
    signatureModDisplayName: 'Hair-Trigger Servo',
    signatureModName: 'Hair Trigger',
    evolvedColor: '#00f5d4',
    desc: 'Twin Parallel Streams & Tightened Spread'
  },
  flamethrower: {
    weaponId: 'flamethrower',
    evolvedName: 'PLASMA MELTDOWN TORCH',
    signatureModId: 'high_explosive',
    signatureModDisplayName: 'Thermobaric Mix',
    signatureModName: 'High Explosive',
    evolvedColor: '#72efdd',
    desc: 'Blue-White Plasma Cone & +45% Burn Power'
  },
  grenade_launcher: {
    weaponId: 'grenade_launcher',
    evolvedName: 'CARPET CLUSTER MORTAR',
    signatureModId: 'high_explosive',
    signatureModDisplayName: 'Thermobaric Mix',
    signatureModName: 'High Explosive',
    evolvedColor: '#ff0055',
    desc: 'Spawns 3 Secondary Cluster Bomblets on Impact'
  },
  shotgun: {
    weaponId: 'shotgun',
    evolvedName: 'HELLFIRE FLAK CANNON',
    signatureModId: 'split_chamber',
    signatureModDisplayName: 'Twin Barrel Adapter',
    signatureModName: 'Split Chamber',
    evolvedColor: '#ff5400',
    desc: '10 Incendiary Pellets & 20px Blast Knockback'
  },
  railgun: {
    weaponId: 'railgun',
    evolvedName: 'ORBITAL ION LANCE',
    signatureModId: 'piercing_core',
    signatureModDisplayName: 'Tungsten Sabot',
    signatureModName: 'Piercing Core',
    evolvedColor: '#ffbe0b',
    desc: 'Hyper-Wide Golden Ion Lance & +35% Damage'
  },
  arc_coil: {
    weaponId: 'arc_coil',
    evolvedName: 'THUNDERLORD STORM COIL',
    signatureModId: 'vamp_siphon',
    signatureModDisplayName: 'Scrap Siphon',
    signatureModName: 'Vampiric Siphon',
    evolvedColor: '#e0aaff',
    desc: 'Chains to 6 Targets for 85% Damage'
  }
};

/**
 * Returns true if the player's build has unlocked the weapon evolution:
 * Either possesses the weapon's signature upgrade item/mod (by ID, display name, or legacy name),
 * OR has >= 3 total item stacks.
 */
export function isWeaponEvolved(
  weaponId: WeaponId,
  player: { items?: string[]; itemStacks?: Record<string, number> }
): boolean {
  if (!weaponId || !WEAPON_EVOLUTIONS[weaponId]) return false;
  const evo = WEAPON_EVOLUTIONS[weaponId];
  if (
    player.items &&
    (player.items.includes(evo.signatureModName) ||
      player.items.includes(evo.signatureModDisplayName) ||
      player.items.includes(evo.signatureModId))
  ) {
    return true;
  }
  if (player.itemStacks) {
    let sum = 0;
    for (const val of Object.values(player.itemStacks)) {
      if (typeof val === 'number') {
        sum += val;
      }
    }
    if (sum >= 3) return true;
  }
  return false;
}

/**
 * Returns all weapon evolution defs triggered by a given mod ID or name (for UI tooltip badges).
 */
export function getEvolutionsForMod(modIdOrName: string): WeaponEvolutionDef[] {
  if (!modIdOrName) return [];
  return Object.values(WEAPON_EVOLUTIONS).filter(
    evo =>
      evo.signatureModId === modIdOrName ||
      evo.signatureModDisplayName === modIdOrName ||
      evo.signatureModName === modIdOrName
  );
}

export interface WeaponEvolutionProgress {
  evolved: boolean;
  evolvedName: string;
  signatureModId: string;
  signatureModName: string;
  hasSignatureMod: boolean;
  maxStackCount: number;
  progressPct: number;
  statusText: string;
}

export interface Player {
  items?: string[];
  itemStacks?: Record<string, number>;
}

/**
 * Calculates weapon overclock evolution progress, requirement fulfillment,
 * percentage completion, and UI badge status string.
 */
export function getWeaponEvolutionProgress(
  weaponId: WeaponId,
  player: Pick<Player, 'items' | 'itemStacks'>
): WeaponEvolutionProgress {
  const evo = WEAPON_EVOLUTIONS[weaponId] || WEAPON_EVOLUTIONS.pistol;
  const items = player.items || [];
  const hasSignatureMod = Boolean(
    items.includes(evo.signatureModName) ||
      items.includes(evo.signatureModDisplayName) ||
      items.includes(evo.signatureModId)
  );

  const stackValues = Object.values(player.itemStacks || {}).filter(
    (v): v is number => typeof v === 'number'
  );
  const maxStackCount = stackValues.length > 0 ? Math.max(0, ...stackValues) : 0;

  // Verify baseline evolution check for parity
  isWeaponEvolved(weaponId, player as Player);

  const signatureContrib = hasSignatureMod ? 50 : 0;
  const stackContrib = Math.min(50, Math.round((Math.min(3, maxStackCount) / 3) * 50));
  let progressPct = signatureContrib + stackContrib;

  const evolved = progressPct >= 100;
  if (evolved) {
    progressPct = 100;
  }

  const statusText = evolved
    ? '⚡ OVERCLOCK EVOLVED: ' + evo.evolvedName.toUpperCase()
    : `[${hasSignatureMod ? '✓' : '✗'} ${evo.signatureModName}] + [${Math.min(3, maxStackCount)}/3 Mod Stack]`;

  return {
    evolved,
    evolvedName: evo.evolvedName,
    signatureModId: evo.signatureModId,
    signatureModName: evo.signatureModName,
    hasSignatureMod,
    maxStackCount,
    progressPct,
    statusText
  };
}

// ============================================================================
// WEAPON TACTICAL PROFILES (ROLE & BASE DPS CLASSIFIER - M91)
// ============================================================================

export interface WeaponTacticalProfile {
  weaponId: WeaponId;
  roleTag:
    | 'PRECISION SIDEARM'
    | 'RAPID SUPPRESSION'
    | 'AREA DENIAL'
    | 'HEAVY ARTILLERY'
    | 'CLOSE-QUARTERS BURST'
    | 'SNIPER PIERCE'
    | 'CHAIN CROWD-CONTROL';
  optimalRangeText: string;
  baseDps: number;
  summaryLine: string;
}

export const WEAPON_TACTICAL_ROLES: Record<
  WeaponId,
  {
    roleTag: WeaponTacticalProfile['roleTag'];
    optimalRangeText: string;
  }
> = {
  pistol: {
    roleTag: 'PRECISION SIDEARM',
    optimalRangeText: 'MID RANGE'
  },
  machine_gun: {
    roleTag: 'RAPID SUPPRESSION',
    optimalRangeText: 'CLOSE-TO-MID RANGE'
  },
  flamethrower: {
    roleTag: 'AREA DENIAL',
    optimalRangeText: 'SHORT RANGE'
  },
  grenade_launcher: {
    roleTag: 'HEAVY ARTILLERY',
    optimalRangeText: 'MID-TO-LONG RANGE'
  },
  shotgun: {
    roleTag: 'CLOSE-QUARTERS BURST',
    optimalRangeText: 'POINT-BLANK RANGE'
  },
  railgun: {
    roleTag: 'SNIPER PIERCE',
    optimalRangeText: 'LONG RANGE'
  },
  arc_coil: {
    roleTag: 'CHAIN CROWD-CONTROL',
    optimalRangeText: 'MID-RANGE CHAIN'
  }
};

/**
 * Pure function returning tactical role, optimal combat engagement range,
 * base DPS classification, and single-line summary badge string for any weapon.
 */
export function getWeaponTacticalProfile(weaponId: WeaponId): WeaponTacticalProfile {
  const w = WEAPONS[weaponId] || WEAPONS.pistol;
  const config = WEAPON_TACTICAL_ROLES[weaponId] || WEAPON_TACTICAL_ROLES.pistol;
  const baseDps = Math.round((w.dmg * (w.count || 1)) / Math.max(0.05, w.fireRate));
  const summaryLine = `${config.roleTag} · ${baseDps} BASE DPS · ${config.optimalRangeText}`;

  return {
    weaponId: isWeaponId(weaponId) ? weaponId : 'pistol',
    roleTag: config.roleTag,
    optimalRangeText: config.optimalRangeText,
    baseDps,
    summaryLine
  };
}



