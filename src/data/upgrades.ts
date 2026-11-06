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
  | 'nanite_repair'
  | 'glass_cannon'
  | 'heavy_ordnance'
  | 'point_blank'
  | 'overclock_core';

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

/**
 * 4 High-Risk / High-Reward Build-Defining Mods (Kiss/Curse & Overclock Pool)
 */
export const KISS_CURSE_MOD_POOL: readonly RunModDef[] = [
  {
    id: 'glass_cannon',
    name: 'Glass Cannon Bore',
    desc: '+65% Weapon Damage, -2 Max Hull HP',
    description: '+65% Weapon Damage, -2 Max Hull HP',
    cost: 22,
    statDeltas: { dmgMult: 0.65, maxHp: -2 },
    apply: (p: ModPlayerTarget) => {
      p.dmgMult += 0.65;
      p.maxHp = Math.max(2, p.maxHp - 2);
      p.hp = Math.min(p.hp, p.maxHp);
    }
  },
  {
    id: 'heavy_ordnance',
    name: 'Heavy Ordnance Chamber',
    desc: '+85% Weapon Damage & +40% Blast, -25% Fire Rate',
    description: '+85% Weapon Damage & +40% Blast, -25% Fire Rate',
    cost: 22,
    statDeltas: { dmgMult: 0.85, blastMult: 0.40, fireRateMult: -0.25 },
    apply: (p: ModPlayerTarget) => {
      p.dmgMult += 0.85;
      p.blastMult += 0.40;
      p.fireRateMult = Math.max(0.5, p.fireRateMult - 0.25);
    }
  },
  {
    id: 'point_blank',
    name: 'Point-Blank Choke',
    desc: '+1 Projectile & +40% Damage, -20% Bullet Speed',
    description: '+1 Projectile & +40% Damage, -20% Bullet Speed',
    cost: 24,
    statDeltas: { multiShot: 1, dmgMult: 0.40, projSpeedMult: -0.20 },
    apply: (p: ModPlayerTarget) => {
      p.multiShot += 1;
      p.dmgMult += 0.40;
      p.projSpeedMult = Math.max(0.55, p.projSpeedMult - 0.20);
    }
  },
  {
    id: 'overclock_core',
    name: 'Overclock Synergy Core',
    desc: '+25% Damage, +20% Fire Rate & +1 Pierce',
    description: '+25% Damage, +20% Fire Rate & +1 Pierce',
    cost: 28,
    statDeltas: { dmgMult: 0.25, fireRateMult: 0.20, pierce: 1 },
    apply: (p: ModPlayerTarget) => {
      p.dmgMult += 0.25;
      p.fireRateMult += 0.20;
      p.pierce += 1;
    }
  }
] as const;

export const ALL_RUN_MOD_POOL: readonly RunModDef[] = [
  ...RUN_MOD_POOL,
  ...KISS_CURSE_MOD_POOL
];

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

// ---------------------------------------------------------------------------
// DUO ITEM SYNERGIES (CROSS-ITEM & ELEMENTAL COMBINATIONS)
// ---------------------------------------------------------------------------

export type DuoSynergyId =
  | 'thermal_shock'
  | 'superconductor'
  | 'void_vortex'
  | 'juggernaut_overdrive'
  | 'voltaic_wake';

export interface DuoSynergyPlayerSnapshot {
  weapon?: string;
  items?: string[];
  itemStacks?: Record<string, number>;
}

export interface DuoSynergyDef {
  id: DuoSynergyId;
  name: string;
  color: string;
  desc: string;
  components: readonly string[];
  isActive: (p: DuoSynergyPlayerSnapshot) => boolean;
}

function hasItemOrMod(p: DuoSynergyPlayerSnapshot, key: string): boolean {
  if (p.weapon === key) return true;
  if (p.items?.includes(key)) return true;
  if (p.itemStacks && (p.itemStacks[key] ?? 0) > 0) return true;
  return false;
}

export const DUO_SYNERGIES: readonly DuoSynergyDef[] = [
  {
    id: 'thermal_shock',
    name: 'THERMAL SHOCK',
    color: '#00f5d4',
    desc: 'Chilled enemies hit by Fire/Blast trigger a Cyan-Gold Shatter Nova',
    components: ['Cryo-Jacketed Shells', 'cryo_rounds', 'flamethrower', 'Thermobaric Mix', 'high_explosive', 'gasoline', 'Spilled Gasoline', 'exhaust_afterburner', 'Exhaust Afterburner'],
    isActive: (p) => {
      const hasCryo = hasItemOrMod(p, 'Cryo-Jacketed Shells') || hasItemOrMod(p, 'cryo_rounds');
      const hasFire =
        p.weapon === 'flamethrower' ||
        hasItemOrMod(p, 'Thermobaric Mix') ||
        hasItemOrMod(p, 'high_explosive') ||
        hasItemOrMod(p, 'gasoline') ||
        hasItemOrMod(p, 'Spilled Gasoline') ||
        hasItemOrMod(p, 'exhaust_afterburner') ||
        hasItemOrMod(p, 'Exhaust Afterburner');
      return hasCryo && hasFire;
    }
  },
  {
    id: 'superconductor',
    name: 'SUPERCONDUCTOR',
    color: '#c77dff',
    desc: 'Chilled enemies double Lightning chain range (220px) & +40% Arc Dmg',
    components: ['Cryo-Jacketed Shells', 'cryo_rounds', 'tesla_capacitor', 'Tesla Capacitor', 'arc_coil'],
    isActive: (p) => {
      const hasCryo = hasItemOrMod(p, 'Cryo-Jacketed Shells') || hasItemOrMod(p, 'cryo_rounds');
      const hasVolt =
        p.weapon === 'arc_coil' ||
        hasItemOrMod(p, 'tesla_capacitor') ||
        hasItemOrMod(p, 'Tesla Capacitor');
      return hasCryo && hasVolt;
    }
  },
  {
    id: 'void_vortex',
    name: 'VOID VORTEX',
    color: '#4cc9f0',
    desc: 'Explosions pull nearby enemies inward with a magnetic implosion',
    components: ['magnet_coil', 'Magnet Coil', 'grenade_launcher', 'Thermobaric Mix', 'high_explosive', 'gasoline', 'Spilled Gasoline'],
    isActive: (p) => {
      const hasMagnet = hasItemOrMod(p, 'magnet_coil') || hasItemOrMod(p, 'Magnet Coil');
      const hasBlast =
        p.weapon === 'grenade_launcher' ||
        hasItemOrMod(p, 'Thermobaric Mix') ||
        hasItemOrMod(p, 'high_explosive') ||
        hasItemOrMod(p, 'gasoline') ||
        hasItemOrMod(p, 'Spilled Gasoline');
      return hasMagnet && hasBlast;
    }
  },
  {
    id: 'juggernaut_overdrive',
    name: 'JUGGERNAUT OVERDRIVE',
    color: '#ffd60a',
    desc: 'NOS Ram kills refund +35 NOS & unleash a 75px Golden Shockwave',
    components: ['titanium_spikes', 'Titanium Ram Spikes', 'adrenaline_injector', 'Adrenaline Injector', 'Nitrous Injector', 'turbo_charger'],
    isActive: (p) => {
      const hasSpikes = hasItemOrMod(p, 'titanium_spikes') || hasItemOrMod(p, 'Titanium Ram Spikes');
      const hasNos =
        hasItemOrMod(p, 'adrenaline_injector') ||
        hasItemOrMod(p, 'Adrenaline Injector') ||
        hasItemOrMod(p, 'Nitrous Injector') ||
        hasItemOrMod(p, 'turbo_charger');
      return hasSpikes && hasNos;
    }
  },
  {
    id: 'voltaic_wake',
    name: 'VOLTAIC WAKE',
    color: '#00bbf9',
    desc: 'NOS Boost leaves Blue-Gold Plasma Pools that ignite & shock enemies',
    components: ['exhaust_afterburner', 'Exhaust Afterburner', 'gasoline', 'Spilled Gasoline', 'tesla_capacitor', 'Tesla Capacitor'],
    isActive: (p) => {
      const hasAfterburner = hasItemOrMod(p, 'exhaust_afterburner') || hasItemOrMod(p, 'Exhaust Afterburner');
      const hasSecondary =
        hasItemOrMod(p, 'gasoline') ||
        hasItemOrMod(p, 'Spilled Gasoline') ||
        hasItemOrMod(p, 'tesla_capacitor') ||
        hasItemOrMod(p, 'Tesla Capacitor');
      return hasAfterburner && hasSecondary;
    }
  }
] as const;

export function getActiveDuoSynergies(
  player: DuoSynergyPlayerSnapshot
): DuoSynergyDef[] {
  if (!player) return [];
  return DUO_SYNERGIES.filter(syn => syn.isActive(player));
}

export function getPotentialDuoSynergiesForItem(
  itemIdOrName: string,
  player: DuoSynergyPlayerSnapshot
): DuoSynergyDef[] {
  if (!itemIdOrName || !player) return [];
  const simulatedItems = [...(player.items ?? []), itemIdOrName];
  const simulatedStacks: Record<string, number> = {
    ...(player.itemStacks ?? {}),
    [itemIdOrName]: ((player.itemStacks ?? {})[itemIdOrName] ?? 0) + 1
  };
  const simulated: DuoSynergyPlayerSnapshot = {
    weapon: player.weapon,
    items: simulatedItems,
    itemStacks: simulatedStacks
  };
  return DUO_SYNERGIES.filter(
    syn => syn.components.includes(itemIdOrName) && syn.isActive(simulated)
  );
}
