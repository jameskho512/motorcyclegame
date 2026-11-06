/**
 * MOTO-ROGUE: Upgrades and Items Data Module
 *
 * Defines:
 * 1. META_UPGRADES: Permanent Garage stat upgrades purchased with Scrap.
 * 2. RUN_MOD_POOL: In-run temporary upgrade mods found on pedestals in
 *    Treasure rooms, Boss rewards, and Shop rooms.
 * 3. DROP_ITEMS: Stacking Risk of Rain 2-style enemy toolbox crate drops.
 *
 * Parity reference: moto-rogue/index.html L975-L1095
 */

export type MetaUpgradeId = 'dmg' | 'fireRate' | 'speed' | 'maxHp';

export interface MetaUpgradeDef {
  /** Unique upgrade identifier */
  id: MetaUpgradeId;
  /** Display name shown in Garage tuning bay */
  name: string;
  /** Concise summary of effect per rank */
  desc: string;
  /** Alias for desc */
  description: string;
  /** Base scrap cost for Rank 0 -> Rank 1 */
  baseCost: number;
  /** Exponential scaling multiplier for subsequent ranks */
  costScale: number;
  /** Maximum purchasable rank cap */
  maxRank: number;
  /** Numerical bonus applied per rank */
  statBonusPerRank: number;
  /** Human-readable stat label */
  statLabel: string;
}

/**
 * 4 Permanent Garage Stat Upgrades
 */
export const META_UPGRADES: Record<MetaUpgradeId, MetaUpgradeDef> = {
  dmg: {
    id: 'dmg',
    name: 'Ordnance Calibration',
    desc: '+10% Base Weapon Damage per rank',
    description: '+10% Base Weapon Damage per rank',
    baseCost: 25,
    costScale: 1.6,
    maxRank: 5,
    statBonusPerRank: 0.10,
    statLabel: 'Damage'
  },
  fireRate: {
    id: 'fireRate',
    name: 'Autoloader Gearing',
    desc: '+8% Base Fire Rate per rank',
    description: '+8% Base Fire Rate per rank',
    baseCost: 25,
    costScale: 1.6,
    maxRank: 5,
    statBonusPerRank: 0.08,
    statLabel: 'Fire Rate'
  },
  speed: {
    id: 'speed',
    name: 'Twin-Cam Engine Tune',
    desc: '+6% Base Bike Speed per rank',
    description: '+6% Base Bike Speed per rank',
    baseCost: 20,
    costScale: 1.55,
    maxRank: 5,
    statBonusPerRank: 0.06,
    statLabel: 'Speed'
  },
  maxHp: {
    id: 'maxHp',
    name: 'Reinforced Frame',
    desc: '+1 Starting Max Hull HP per rank',
    description: '+1 Starting Max Hull HP per rank',
    baseCost: 35,
    costScale: 1.75,
    maxRank: 4,
    statBonusPerRank: 1,
    statLabel: 'Max Fuel'
  }
};

/**
 * Calculates the scrap cost for the next rank of a meta upgrade.
 * Formula: round(baseCost * costScale^rank)
 */
export function calcUpgradeCost(upgradeOrId: MetaUpgradeDef | MetaUpgradeId, currentRank: number): number {
  const def = typeof upgradeOrId === 'string'
    ? (Object.prototype.hasOwnProperty.call(META_UPGRADES, upgradeOrId) ? META_UPGRADES[upgradeOrId] : undefined)
    : upgradeOrId;
  if (!def || typeof def.maxRank !== 'number' || currentRank >= def.maxRank) return Infinity;
  return Math.round(def.baseCost * Math.pow(def.costScale, currentRank));
}

// ---------------------------------------------------------------------------
// IN-RUN PEDESTAL MODS
// ---------------------------------------------------------------------------

export type RunModId =
  | 'hollow_point'
  | 'hair_trigger'
  | 'turbo_charger'
  | 'armor_plate'
  | 'piercing_core'
  | 'ricochet_mod'
  | 'vamp_siphon'
  | 'split_chamber'
  | 'high_explosive'
  | 'cryo_rounds'
  | 'homing_missiles'
  | 'overcharge_dynamo'
  | 'executioner_optics'
  | 'berserker_chassis'
  | 'nanite_repair';

/**
 * Minimal interface representing player stats that mods can mutate.
 */
export interface ModPlayerTarget {
  hp: number;
  maxHp: number;
  dmgMult: number;
  fireRateMult: number;
  speedMult: number;
  projSpeedMult: number;
  blastMult: number;
  pierce: number;
  bounce: number;
  multiShot: number;
  vampChance: number;
}

export interface RunModStatDeltas {
  dmgMult?: number;
  fireRateMult?: number;
  speedMult?: number;
  maxHp?: number;
  healHp?: number;
  pierce?: number;
  projSpeedMult?: number;
  bounce?: number;
  vampChance?: number;
  multiShot?: number;
  blastMult?: number;
}

export interface RunModDef {
  /** Unique mod identifier */
  id: RunModId;
  /** Display name on pedestals and HUD */
  name: string;
  /** Tactical description of stat effect */
  desc: string;
  /** Alias for desc */
  description: string;
  /** Base coin purchase price in Shop rooms (0 on free Treasure/Boss pedestals) */
  cost: number;
  /** Structured numerical deltas for testing and analytics */
  statDeltas: RunModStatDeltas;
  /** Mutates player state directly when acquired */
  apply: (p: ModPlayerTarget) => void;
}

/**
 * 9 In-Run Pedestal / Shop Mods
 */
export const RUN_MOD_POOL: readonly RunModDef[] = [
  {
    id: 'hollow_point',
    name: 'Hollow-Point Rounds',
    desc: '+25% Weapon Damage',
    description: '+25% Weapon Damage',
    cost: 18,
    statDeltas: { dmgMult: 0.25 },
    apply: (p: ModPlayerTarget) => {
      p.dmgMult += 0.25;
    }
  },
  {
    id: 'hair_trigger',
    name: 'Hair-Trigger Servo',
    desc: '+22% Fire Rate',
    description: '+22% Fire Rate',
    cost: 18,
    statDeltas: { fireRateMult: 0.22 },
    apply: (p: ModPlayerTarget) => {
      p.fireRateMult += 0.22;
    }
  },
  {
    id: 'turbo_charger',
    name: 'Nitrous Injector',
    desc: '+16% Bike Speed',
    description: '+16% Bike Speed',
    cost: 14,
    statDeltas: { speedMult: 0.16 },
    apply: (p: ModPlayerTarget) => {
      p.speedMult += 0.16;
    }
  },
  {
    id: 'armor_plate',
    name: 'Welded Armor Plate',
    desc: '+2 Max HP & Heal +2 HP',
    description: '+2 Max HP & Heal +2 HP',
    cost: 16,
    statDeltas: { maxHp: 2, healHp: 2 },
    apply: (p: ModPlayerTarget) => {
      p.maxHp += 2;
      p.hp = Math.min(p.maxHp, p.hp + 2);
    }
  },
  {
    id: 'piercing_core',
    name: 'Tungsten Sabot',
    desc: 'Bullets pierce +1 enemy & +15% Bullet Speed',
    description: 'Bullets pierce +1 enemy & +15% Bullet Speed',
    cost: 20,
    statDeltas: { pierce: 1, projSpeedMult: 0.15 },
    apply: (p: ModPlayerTarget) => {
      p.pierce += 1;
      p.projSpeedMult += 0.15;
    }
  },
  {
    id: 'ricochet_mod',
    name: 'Rubberized Casings',
    desc: 'Bullets bounce off walls +1 time',
    description: 'Bullets bounce off walls +1 time',
    cost: 18,
    statDeltas: { bounce: 1 },
    apply: (p: ModPlayerTarget) => {
      p.bounce += 1;
    }
  },
  {
    id: 'vamp_siphon',
    name: 'Scrap Siphon',
    desc: '20% chance on enemy kill to restore +1 HP',
    description: '20% chance on enemy kill to restore +1 HP',
    cost: 22,
    statDeltas: { vampChance: 0.20 },
    apply: (p: ModPlayerTarget) => {
      p.vampChance = Math.min(0.6, p.vampChance + 0.20);
    }
  },
  {
    id: 'split_chamber',
    name: 'Twin Barrel Adapter',
    desc: '+1 Extra Projectile per shot (-15% dmg per shot)',
    description: '+1 Extra Projectile per shot (-15% dmg per shot)',
    cost: 26,
    statDeltas: { multiShot: 1, dmgMult: -0.15 },
    apply: (p: ModPlayerTarget) => {
      p.multiShot += 1;
      p.dmgMult = Math.max(0.6, p.dmgMult - 0.15);
    }
  },
  {
    id: 'high_explosive',
    name: 'Thermobaric Mix',
    desc: '+30% Burn & Explosion Damage / Radius',
    description: '+30% Burn & Explosion Damage / Radius',
    cost: 17,
    statDeltas: { blastMult: 0.30 },
    apply: (p: ModPlayerTarget) => {
      p.blastMult += 0.30;
    }
  },
  {
    id: 'cryo_rounds',
    name: 'Cryo-Jacketed Shells',
    desc: 'Bullets chill enemies & +15% Damage',
    description: 'Bullets chill enemies & +15% Damage',
    cost: 19,
    statDeltas: { dmgMult: 0.15 },
    apply: (p: ModPlayerTarget) => {
      p.dmgMult += 0.15;
    }
  },
  {
    id: 'homing_missiles',
    name: 'Smart-Link Guidance',
    desc: '+20% Projectile Speed & +1 Pierce',
    description: '+20% Projectile Speed & +1 Pierce',
    cost: 21,
    statDeltas: { projSpeedMult: 0.20, pierce: 1 },
    apply: (p: ModPlayerTarget) => {
      p.projSpeedMult += 0.20;
      p.pierce += 1;
    }
  },
  {
    id: 'overcharge_dynamo',
    name: 'Overcharge Dynamo',
    desc: '+18% Fire Rate & +12% Speed',
    description: '+18% Fire Rate & +12% Speed',
    cost: 20,
    statDeltas: { fireRateMult: 0.18, speedMult: 0.12 },
    apply: (p: ModPlayerTarget) => {
      p.fireRateMult += 0.18;
      p.speedMult += 0.12;
    }
  },
  {
    id: 'executioner_optics',
    name: 'Executioner Optics',
    desc: '+32% Weapon Damage',
    description: '+32% Weapon Damage',
    cost: 22,
    statDeltas: { dmgMult: 0.32 },
    apply: (p: ModPlayerTarget) => {
      p.dmgMult += 0.32;
    }
  },
  {
    id: 'berserker_chassis',
    name: 'Berserker Chassis',
    desc: '+1 Max HP, Heal +1 HP & +20% Blast Damage',
    description: '+1 Max HP, Heal +1 HP & +20% Blast Damage',
    cost: 18,
    statDeltas: { maxHp: 1, healHp: 1, blastMult: 0.20 },
    apply: (p: ModPlayerTarget) => {
      p.maxHp += 1;
      p.hp = Math.min(p.maxHp, p.hp + 1);
      p.blastMult += 0.20;
    }
  },
  {
    id: 'nanite_repair',
    name: 'Nanite Hull Matrix',
    desc: '+3 Max HP, Heal +3 HP & +10% Siphon',
    description: '+3 Max HP, Heal +3 HP & +10% Siphon',
    cost: 24,
    statDeltas: { maxHp: 3, healHp: 3, vampChance: 0.10 },
    apply: (p: ModPlayerTarget) => {
      p.maxHp += 3;
      p.hp = Math.min(p.maxHp, p.hp + 3);
      p.vampChance = Math.min(0.6, p.vampChance + 0.10);
    }
  }
] as const;

// ---------------------------------------------------------------------------
// RISK OF RAIN 2-STYLE STACKING DROP ITEMS
// ---------------------------------------------------------------------------

export type DropItemId =
  | 'nitro_syringe'
  | 'tire_iron'
  | 'chrome_lens'
  | 'gasoline'
  | 'racing_slicks'
  | 'oil_infusion'
  | 'tesla_capacitor'
  | 'exhaust_afterburner'
  | 'reactive_plating'
  | 'magnet_coil'
  | 'adrenaline_injector'
  | 'titanium_spikes';

export interface DropItemDef {
  /** Unique drop item identifier */
  id: DropItemId;
  /** Motorcycle-themed display name */
  name: string;
  /** Summary of per-stack effect */
  desc: string;
  /** Alias for desc */
  description: string;
  /** HUD badge color (hex code) */
  color: string;
  /** Single-character badge glyph for HUD / Tooltip */
  icon: string;
  /** Direct Risk of Rain 2 inspiration reference for documentation */
  ror2Inspiration: string;
}

/**
 * 6 Stacking RoR2-style drop items found in enemy toolboxes
 */
export const DROP_ITEMS: Record<DropItemId, DropItemDef> = {
  nitro_syringe: {
    id: 'nitro_syringe',
    name: 'Nitro Syringe',
    desc: '+15% fire rate per stack',
    description: '+15% fire rate per stack',
    color: '#ff9f1c',
    icon: 'N',
    ror2Inspiration: "Soldier's Syringe"
  },
  tire_iron: {
    id: 'tire_iron',
    name: 'Tire Iron',
    desc: '+30% dmg to enemies above 90% HP',
    description: '+30% dmg to enemies above 90% HP',
    color: '#adb5bd',
    icon: 'T',
    ror2Inspiration: 'Crowbar'
  },
  chrome_lens: {
    id: 'chrome_lens',
    name: 'Chrome Lens',
    desc: '+10% crit chance (2x dmg)',
    description: '+10% crit chance (2x dmg)',
    color: '#4cc9f0',
    icon: 'C',
    ror2Inspiration: "Lens-Maker's Glasses"
  },
  gasoline: {
    id: 'gasoline',
    name: 'Spilled Gasoline',
    desc: 'Kills explode in flames',
    description: 'Kills explode in flames',
    color: '#ff5400',
    icon: 'G',
    ror2Inspiration: 'Gasoline'
  },
  racing_slicks: {
    id: 'racing_slicks',
    name: 'Racing Slicks',
    desc: '+10% bike speed per stack',
    description: '+10% bike speed per stack',
    color: '#06d6a0',
    icon: 'S',
    ror2Inspiration: "Paul's Goat Hoof"
  },
  oil_infusion: {
    id: 'oil_infusion',
    name: 'Oil Infusion',
    desc: 'Every 15 kills: +1 max fuel',
    description: 'Every 15 kills: +1 max fuel',
    color: '#9d4edd',
    icon: 'O',
    ror2Inspiration: 'Infusion'
  },
  tesla_capacitor: {
    id: 'tesla_capacitor',
    name: 'Tesla Capacitor',
    desc: '20% chance on hit to chain lightning (+35% dmg/stack)',
    description: '20% chance on hit to chain lightning (+35% dmg/stack)',
    color: '#c77dff',
    icon: 'Z',
    ror2Inspiration: 'Ukulele'
  },
  exhaust_afterburner: {
    id: 'exhaust_afterburner',
    name: 'Exhaust Afterburner',
    desc: 'NOS boost leaves scorching flame trail (+8 dmg/stack)',
    description: 'NOS boost leaves scorching flame trail (+8 dmg/stack)',
    color: '#ff5400',
    icon: 'F',
    ror2Inspiration: 'Frost Relic'
  },
  reactive_plating: {
    id: 'reactive_plating',
    name: 'Reactive Plating',
    desc: 'Taking damage triggers a defensive blast wave',
    description: 'Taking damage triggers a defensive blast wave',
    color: '#ffd60a',
    icon: 'P',
    ror2Inspiration: 'Razorwire'
  },
  magnet_coil: {
    id: 'magnet_coil',
    name: 'Magnet Coil',
    desc: 'Pulls nearby pickups toward bike (+95px range/stack)',
    description: 'Pulls nearby pickups toward bike (+95px range/stack)',
    color: '#00bbf9',
    icon: 'M',
    ror2Inspiration: 'Magnet'
  },
  adrenaline_injector: {
    id: 'adrenaline_injector',
    name: 'Adrenaline Injector',
    desc: 'Kills restore +20 NOS charge per stack',
    description: 'Kills restore +20 NOS charge per stack',
    color: '#06d6a0',
    icon: 'A',
    ror2Inspiration: 'Bandolier'
  },
  titanium_spikes: {
    id: 'titanium_spikes',
    name: 'Titanium Ram Spikes',
    desc: '+45% NOS Ram Damage per stack',
    description: '+45% NOS Ram Damage per stack',
    color: '#ef233c',
    icon: 'K',
    ror2Inspiration: 'Focus Crystal'
  }
};

/**
 * Array of all drop item IDs.
 */
export const DROP_ITEM_IDS: readonly DropItemId[] = [
  'nitro_syringe',
  'tire_iron',
  'chrome_lens',
  'gasoline',
  'racing_slicks',
  'oil_infusion',
  'tesla_capacitor',
  'exhaust_afterburner',
  'reactive_plating',
  'magnet_coil',
  'adrenaline_injector',
  'titanium_spikes'
] as const;
