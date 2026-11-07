/**
 * MOTO-ROGUE: Equipment and Loot Data Module
 *
 * Defines:
 * 1. EQUIP_SLOTS: 6 motorcycle equipment slots (tires, engine, handlebars, exhaust, frame, tank).
 * 2. RARITY: 4 item rarity tiers (Common, Magic, Rare, Legendary) with stat multipliers and scrap sell values.
 * 3. STAT_BASE & STAT_LABELS: Canonical base scaling metrics for all procedural item rolls.
 * 4. LOOT_PREFIX: Rarity-dependent prefix naming pools.
 * 5. Pure helper functions: rollRarity(floor), genLoot(floor, forcedRarity), itemScore(item), fmtStat(key, val).
 *
 * Parity reference: moto-rogue/index.html L1096-L1170
 */

export type EquipSlotId = 'tires' | 'engine' | 'handlebars' | 'exhaust' | 'frame' | 'tank';

export type StatKey = 'speed' | 'dmg' | 'fireRate' | 'blast' | 'hp' | 'siphon';

export type RarityTier = 0 | 1 | 2 | 3;

export type RarityId = 'common' | 'magic' | 'rare' | 'legendary';

export interface EquipSlotDef {
  /** Slot identifier */
  id: EquipSlotId;
  /** UI display label */
  label: string;
  /** Primary associated stat key */
  stat: StatKey;
}

export interface RarityDef {
  /** Internal rarity identifier */
  id: RarityId;
  /** Display name (e.g. 'Common', 'Legendary') */
  name: string;
  /** Hex color for UI text, borders, and loot glows */
  color: string;
  /** Stat value scaling multiplier */
  mult: number;
  /** Scrap value gained when sold in Garage */
  sell: number;
}

export interface EquipmentItem {
  /** Target bike equipment slot */
  slot: EquipSlotId;
  /** Rarity tier (0 = Common, 1 = Magic, 2 = Rare, 3 = Legendary) */
  rarity: RarityTier;
  /** Full item name with rolled prefix (e.g. 'Apex Predator Tires') */
  name: string;
  /** Rolled stats dictionary */
  stats: Partial<Record<StatKey, number>>;
  /** Scrap Forge upgrade tier (0..4, max tier is 4) */
  tier?: number;
  /** Original un-upgraded base stats snapshot for linear +25% per tier scaling */
  baseStats?: Partial<Record<StatKey, number>>;
}

export const MAX_FORGE_TIER = 4;

/**
 * 6 Motorcycle Equipment Slots
 */
export const EQUIP_SLOTS: readonly EquipSlotDef[] = [
  { id: 'tires',      label: 'Tires',      stat: 'speed'    },
  { id: 'engine',     label: 'Engine',     stat: 'dmg'      },
  { id: 'handlebars', label: 'Handlebars', stat: 'fireRate' },
  { id: 'exhaust',    label: 'Exhaust',    stat: 'blast'    },
  { id: 'frame',      label: 'Frame',      stat: 'hp'       },
  { id: 'tank',       label: 'Fuel Tank',  stat: 'siphon'   }
] as const;

/**
 * 4 Equipment Rarity Tiers
 */
export const RARITY: readonly RarityDef[] = [
  { id: 'common',    name: 'Common',    color: '#c9ced8', mult: 1.0, sell: 3  },
  { id: 'magic',     name: 'Magic',     color: '#4895ef', mult: 1.8, sell: 8  },
  { id: 'rare',      name: 'Rare',      color: '#ffd166', mult: 2.8, sell: 18 },
  { id: 'legendary', name: 'Legendary', color: '#ff6b2b', mult: 4.2, sell: 40 }
] as const;

/**
 * Base stat increments per 1.0x scale multiplier
 */
export const STAT_BASE: Record<StatKey, number> = {
  dmg: 0.06,
  fireRate: 0.05,
  speed: 0.05,
  blast: 0.08,
  hp: 1,
  siphon: 0.03
} as const;

/**
 * Human-readable display labels for item stats
 */
export const STAT_LABELS: Record<StatKey, string> = {
  dmg: 'Damage',
  fireRate: 'Fire Rate',
  speed: 'Speed',
  blast: 'Blast/Burn',
  hp: 'Max Fuel',
  siphon: 'Siphon'
} as const;

/**
 * Procedural prefix names mapped per rarity tier [Common, Magic, Rare, Legendary]
 */
export const LOOT_PREFIX: readonly (readonly string[])[] = [
  ['Stock', 'Worn', 'Standard'],
  ['Tuned', 'Sport', 'Reinforced'],
  ['Racing', 'Hyper', 'Carbon'],
  ['Hellfire', 'Apex Predator', 'Mad Max', 'Valhalla']
] as const;

/**
 * Maximum items allowed in Garage Stash before auto-selling weakest
 */
export const MAX_STASH = 18;

// ---------------------------------------------------------------------------
// PURE GENERATION & SCORING HELPERS
// ---------------------------------------------------------------------------

/**
 * Rolls a rarity tier (0-3) based on floor level and weights.
 * Higher floors decrease Common chance and increase Rare/Legendary chances.
 *
 * @param floor Current dungeon floor number (1-based)
 * @param rng Injectable PRNG returning [0, 1) (defaults to Math.random)
 */
export function rollRarity(floor: number, rng: () => number = Math.random): RarityTier {
  const w = [
    Math.max(20, 55 - floor * 5),
    30,
    12 + floor * 2,
    3 + floor * 1.5
  ];
  const sum = w.reduce((a, b) => a + b, 0);
  let r = rng() * sum;
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r <= 0) return i as RarityTier;
  }
  return 0;
}

/**
 * Procedurally generates an equipment item according to floor scaling and rarity.
 *
 * @param floor Current dungeon floor number (1-based)
 * @param forcedRarity Optional fixed rarity tier (0-3)
 * @param rng Injectable PRNG returning [0, 1) (defaults to Math.random)
 */
export function genLoot(
  floor: number,
  forcedRarity?: RarityTier,
  rng: () => number = Math.random
): EquipmentItem {
  const r: RarityTier = forcedRarity !== undefined ? forcedRarity : rollRarity(floor, rng);
  const R = RARITY[r];
  const slotIndex = Math.floor(rng() * EQUIP_SLOTS.length);
  const slot = EQUIP_SLOTS[slotIndex];
  const scale = R.mult * (1 + 0.08 * (floor - 1));
  const stats: Partial<Record<StatKey, number>> = {};

  const addStat = (k: StatKey, f: number) => {
    let v = STAT_BASE[k] * scale * f;
    v = k === 'hp' ? Math.max(1, Math.round(v)) : Math.round(v * 1000) / 1000;
    stats[k] = (stats[k] || 0) + v;
  };

  // Primary slot stat receives 1.0x weight
  addStat(slot.stat, 1);

  // Pick secondary stats without duplicates
  const allStatKeys = Object.keys(STAT_BASE) as StatKey[];
  const others = allStatKeys.filter(k => k !== slot.stat);
  others.sort(() => rng() - 0.5);

  const extra = [0, 0, 1, 2][r];
  for (let i = 0; i < extra; i++) {
    addStat(others[i], 0.6);
  }

  const prefixes = LOOT_PREFIX[r];
  const pre = prefixes[Math.floor(rng() * prefixes.length)];

  return {
    slot: slot.id,
    rarity: r,
    name: `${pre} ${slot.label}`,
    stats
  };
}

/**
 * Computes an objective power score for an equipment item.
 * Formula: sum(stats[k] / STAT_BASE[k])
 * Used for auto-equipping upgrades and auto-selling lowest score stash items.
 */
export function itemScore(it: EquipmentItem): number {
  if (!it || !it.stats) return 0;
  return (Object.keys(it.stats) as StatKey[]).reduce((total, key) => {
    const val = it.stats[key] ?? 0;
    const base = STAT_BASE[key] || 1;
    return total + val / base;
  }, 0);
}

/**
 * Formats a stat key and numeric value into a human-readable display string.
 * Non-integer display values are rounded down.
 * Example: 'hp', 2 -> '+2 Max Fuel'; 'dmg', 0.12 -> '+12% Damage'
 */
export function fmtStat(k: StatKey, v: number): string {
  const label = STAT_LABELS[k] || k;
  const sign = v >= 0 ? '+' : '';
  if (k === 'hp') {
    const intVal = v >= 0 ? Math.floor(v + 1e-9) : -Math.floor(Math.abs(v) + 1e-9);
    return `${sign}${intVal} ${label}`;
  }
  const pctVal = v >= 0 ? Math.floor(v * 100 + 1e-9) : -Math.floor(Math.abs(v) * 100 + 1e-9);
  return `${sign}${pctVal}% ${label}`;
}

/**
 * Target state interface for applying or removing equipment stats.
 */
export interface EquipmentTargetPlayer {
  dmgMult: number;
  fireRateMult: number;
  speedMult: number;
  blastMult: number;
  vampChance: number;
  maxHp: number;
  hp: number;
}

/**
 * Pure state modifier function to apply (+1) or unapply (-1) equipment stats.
 */
export function applyItemStats(
  it: EquipmentItem,
  sign: 1 | -1,
  player: EquipmentTargetPlayer
): void {
  const s = it.stats;
  if (s.dmg) player.dmgMult += sign * s.dmg;
  if (s.fireRate) player.fireRateMult += sign * s.fireRate;
  if (s.speed) player.speedMult += sign * s.speed;
  if (s.blast) player.blastMult += sign * s.blast;
  if (s.siphon) player.vampChance = Math.max(0, player.vampChance + sign * s.siphon);
  if (s.hp) {
    const hpDelta = Math.floor(s.hp + 1e-9);
    player.maxHp = Math.max(1, Math.floor(player.maxHp + sign * hpDelta));
    player.hp = Math.max(1, Math.min(player.maxHp, Math.floor(player.hp + (sign > 0 ? hpDelta : 0))));
  }
}

/**
 * Upgrades an equipment item's Scrap Forge tier by +1 (up to MAX_FORGE_TIER = 4)
 * without changing its rarity. Each tier grants +25% of the item's base stats,
 * with non-integer values rounded down (e.g. +1 Max HP upgraded 4 times -> +2 Max HP).
 */
export function upgradeEquipmentTier(
  item: EquipmentItem,
  player?: EquipmentTargetPlayer
): boolean {
  if (!item || !item.stats) return false;
  const curTier = Math.max(0, Math.floor(Number(item.tier) || 0));
  if (curTier >= MAX_FORGE_TIER) return false;

  if (!item.baseStats) {
    item.baseStats = { ...item.stats };
  }

  if (player) {
    applyItemStats(item, -1, player);
  }

  const nextTier = curTier + 1;
  item.tier = nextTier;
  const mult = 1 + 0.25 * nextTier;

  for (const k of Object.keys(item.baseStats) as StatKey[]) {
    const baseVal = item.baseStats[k];
    if (typeof baseVal === 'number') {
      if (k === 'hp') {
        item.stats[k] = Math.floor(baseVal * mult + 1e-9);
      } else {
        item.stats[k] = Math.floor(baseVal * 100 * mult + 1e-9) / 100;
      }
    }
  }

  if (player) {
    applyItemStats(item, 1, player);
  }

  return true;
}

// ---------------------------------------------------------------------------
// LEGENDARY SLOT PASSIVES & SET BONUSES
// ---------------------------------------------------------------------------

export const LEGENDARY_SLOT_PASSIVES: Record<EquipSlotId, { title: string; desc: string }> = {
  tires: {
    title: 'APEX DRIFT TURBO',
    desc: 'Drift Overcharge charges 35% faster & grants +20 NOS'
  },
  engine: {
    title: 'TWIN-CAM OVERCLOCK',
    desc: '+18% Crit Damage & +12% Boss Damage'
  },
  handlebars: {
    title: 'GYRO STABILIZER',
    desc: 'Tightens weapon spread by 30% & +15% Bullet Speed'
  },
  exhaust: {
    title: 'PLASMA AFTERBURNER',
    desc: 'NOS Boost emits periodic shockwaves & +25% Burn Damage'
  },
  frame: {
    title: 'REACTIVE AEGIS',
    desc: 'Extends post-hit invulnerability by +0.35s & blocks 1st hazard tick'
  },
  tank: {
    title: 'OVERHEAL CONVERTER',
    desc: 'Siphon procs at full HP grant +15 NOS & +2 Coins'
  }
};

export function getEquippedSetBonus(
  equipped: Partial<Record<EquipSlotId, EquipmentItem>>
): {
  rareCount: number;
  legendaryCount: number;
  dmgBonus: number;
  speedBonus: number;
  label: string;
} {
  let rareCount = 0;
  let legendaryCount = 0;
  if (equipped) {
    for (const item of Object.values(equipped)) {
      if (!item) continue;
      if (item.rarity >= 2) rareCount++;
      if (item.rarity >= 3) legendaryCount++;
    }
  }
  let dmgBonus = 0;
  let speedBonus = 0;
  const labels: string[] = [];

  if (rareCount >= 4) {
    dmgBonus += 0.12;
    speedBonus += 0.08;
    labels.push('4pc Rare Tuning (+12% Dmg, +8% Spd)');
  } else if (rareCount >= 2) {
    dmgBonus += 0.06;
    speedBonus += 0.04;
    labels.push('2pc Rare Tuning (+6% Dmg, +4% Spd)');
  }

  if (legendaryCount >= 3) {
    dmgBonus += 0.15;
    speedBonus += 0.10;
    labels.push('3pc Valhalla Set (+15% Dmg, +10% Spd)');
  }

  return {
    rareCount,
    legendaryCount,
    dmgBonus: Math.round(dmgBonus * 1000) / 1000,
    speedBonus: Math.round(speedBonus * 1000) / 1000,
    label: labels.join(' • ')
  };
}

// ---------------------------------------------------------------------------
// EQUIPMENT LOADOUT POWER & SET ADVISOR (M95)
// ---------------------------------------------------------------------------

export interface EquipmentLoadoutSummary {
  installedCount: number;
  emptySlots: EquipSlotId[];
  totalPowerScore: number;
  highestRarity: RarityTier;
  rarityCounts: Record<RarityTier, number>;
  nextSetGoalText: string;
  summaryLine: string;
}

/**
 * Computes an aggregate loadout summary including installed slot counts,
 * power score, rarity distribution, and next set synergy goal.
 */
export function getEquipmentLoadoutSummary(
  equipped?: Partial<Record<EquipSlotId, EquipmentItem | null>> | null
): EquipmentLoadoutSummary {
  let installedCount = 0;
  const emptySlots: EquipSlotId[] = [];
  let rawPowerScore = 0;
  let highestRarity: RarityTier = 0;
  const rarityCounts: Record<RarityTier, number> = { 0: 0, 1: 0, 2: 0, 3: 0 };

  for (const slotDef of EQUIP_SLOTS) {
    const item = equipped?.[slotDef.id];
    if (item) {
      installedCount++;
      rawPowerScore += itemScore(item);
      rarityCounts[item.rarity] = (rarityCounts[item.rarity] || 0) + 1;
      if (item.rarity > highestRarity) {
        highestRarity = item.rarity;
      }
    } else {
      emptySlots.push(slotDef.id);
    }
  }

  const totalPowerScore = Math.round(rawPowerScore * 100) / 100;

  let nextSetGoalText: string;
  if (rarityCounts[3] >= 3) {
    nextSetGoalText = '3pc Valhalla Set Active (+15% Dmg, +10% Spd)';
  } else if (rarityCounts[3] > 0) {
    nextSetGoalText = `Need ${3 - rarityCounts[3]} more Legendary for 3pc Valhalla Set`;
  } else if ((rarityCounts[2] + rarityCounts[3]) >= 4) {
    nextSetGoalText = '4pc Rare Tuning Set Active (+12% Dmg, +8% Spd)';
  } else {
    nextSetGoalText = `Need ${Math.max(1, 4 - (rarityCounts[2] + rarityCounts[3]))} more Rare+ for 4pc Rare Tuning Set`;
  }

  const summaryLine = `LOADOUT: ${installedCount}/6 INSTALLED · POWER: ${totalPowerScore.toFixed(1)} · ${nextSetGoalText}`;

  return {
    installedCount,
    emptySlots,
    totalPowerScore,
    highestRarity,
    rarityCounts,
    nextSetGoalText,
    summaryLine
  };
}
