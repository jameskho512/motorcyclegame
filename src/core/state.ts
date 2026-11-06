/**
 * MOTO-ROGUE: Core Reactive State Management & Persistence Module
 *
 * Implements:
 * 1. PlayerState & MetaSaveState initialization and resets.
 * 2. Exact LocalStorage persistence keys:
 *    - 'moto_rogue_save_v2' (Meta progression)
 *    - 'moto_rogue_run_v1'  (In-run checkpoint)
 *    - 'moto_rogue_muted'   (Audio mute setting)
 * 3. In-memory storage fallback for headless environments or quota errors.
 * 4. Equipment management (equip, unequip, sell, auto-equip & auto-sell overflow).
 * 5. Player stat calculations combining equipped items and garage meta ranks.
 * 6. Reactive GameStateManager store with listener subscription.
 *
 * Parity reference: moto-rogue/index.html L1155-L1263, L1406-L1474, L4012-L4049
 */

import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  PLAYER_RADIUS,
  MAX_STASH_SIZE,
  SAVE_KEY_META,
  SAVE_KEY_RUN,
  SAVE_KEY_MUTED,
  PlayerState,
  MetaSaveState,
  RunSaveState,
  EquipmentItem,
  EquipSlot,
  WeaponId,
  UnlockableWeaponId,
  MetaUpgradeId,
  BikeLiveryId
} from '../types/game';

import {
  EQUIP_SLOTS,
  RARITY,
  itemScore,
  applyItemStats as applyItemStatsHelper
} from '../data/equipment';

import { UNLOCKABLE_IDS } from '../data/weapons';
import { META_UPGRADES } from '../data/upgrades';

// ============================================================================
// STORAGE FALLBACK ABSTRACTION
// ============================================================================

export interface StorageDriver {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  clear(): void;
}

export class SafeLocalStorage implements StorageDriver {
  private inMemoryFallback = new Map<string, string>();

  getItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // Storage access blocked or unavailable
    }
    return this.inMemoryFallback.has(key) ? this.inMemoryFallback.get(key)! : null;
  }

  setItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // Storage quota exceeded or disabled
    }
    this.inMemoryFallback.set(key, value);
  }

  removeItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore errors
    }
    this.inMemoryFallback.delete(key);
  }

  clear(): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
      }
    } catch {
      // Ignore errors
    }
    this.inMemoryFallback.clear();
  }
}

export const defaultStorage: StorageDriver = new SafeLocalStorage();

// ============================================================================
// DEFAULT FACTORIES
// ============================================================================

/**
 * Creates a pristine MetaSaveState with zero scrap, no ranks, and locked weapons.
 */
export function createDefaultMetaSave(): MetaSaveState {
  return {
    scrap: 0,
    unlocked: {
      machine_gun: false,
      shotgun: false,
      flamethrower: false,
      railgun: false,
      grenade_launcher: false,
      arc_coil: false
    },
    ranks: {
      dmg: 0,
      fireRate: 0,
      speed: 0,
      maxHp: 0
    },
    equipped: {},
    stash: [],
    livery: 'crimson_kaneda',
    heatLevel: 0,
    totalRuns: 0,
    totalKills: 0,
    bestFloor: 1,
    bossesSlain: 0,
    weaponKills: {}
  };
}

/**
 * Creates default PlayerState with initial baseline stats.
 */
export function createDefaultPlayerState(): PlayerState {
  return {
    x: ARENA_WIDTH / 2,
    y: ARENA_HEIGHT / 2,
    vx: 0,
    vy: 0,
    radius: PLAYER_RADIUS,
    bikeAngle: 0,
    aimAngle: 0,
    baseSpeed: 265,
    hp: 6,
    maxHp: 6,
    coins: 0,
    invuln: 0,
    stunTimer: 0,
    weapon: 'pistol',
    runWeapons: {},
    fireTimer: 0,
    // Multipliers & modifiers
    dmgMult: 1,
    fireRateMult: 1,
    speedMult: 1,
    projSpeedMult: 1,
    blastMult: 1,
    pierce: 0,
    bounce: 0,
    multiShot: 1,
    vampChance: 0,
    items: [],
    itemStacks: {},
    killCount: 0,
    // NOS booster system
    nos: 100,
    nosMax: 100,
    nosLock: false,
    nosDelay: 0,
    livery: 'crimson_kaneda',
    heatLevel: 0
  };
}

// ============================================================================
// META PERSISTENCE HELPERS
// ============================================================================

/**
 * Loads persistent meta progression from storage, repairing missing fields.
 */
export function loadMetaSave(storage: StorageDriver = defaultStorage): MetaSaveState {
  const saveState = createDefaultMetaSave();
  try {
    const raw = storage.getItem(SAVE_KEY_META);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (typeof parsed.scrap === 'number' && !isNaN(parsed.scrap)) {
        saveState.scrap = parsed.scrap;
      }
      if (parsed.equipped && typeof parsed.equipped === 'object') {
        saveState.equipped = parsed.equipped;
      }
      if (Array.isArray(parsed.stash)) {
        saveState.stash = parsed.stash;
      }
      if (parsed.unlocked && typeof parsed.unlocked === 'object') {
        for (const id of UNLOCKABLE_IDS) {
          saveState.unlocked[id] = !!parsed.unlocked[id];
        }
      }
      if (parsed.ranks && typeof parsed.ranks === 'object') {
        const upgradeKeys = Object.keys(META_UPGRADES) as MetaUpgradeId[];
        for (const k of upgradeKeys) {
          if (typeof parsed.ranks[k] === 'number' && !isNaN(parsed.ranks[k])) {
            saveState.ranks[k] = parsed.ranks[k];
          }
        }
      }
      if (typeof parsed.livery === 'string') {
        saveState.livery = parsed.livery as BikeLiveryId;
      }
      if (typeof parsed.heatLevel === 'number' && !isNaN(parsed.heatLevel)) {
        saveState.heatLevel = parsed.heatLevel;
      }
      if (typeof parsed.totalRuns === 'number' && !isNaN(parsed.totalRuns)) {
        saveState.totalRuns = parsed.totalRuns;
      }
      if (typeof parsed.totalKills === 'number' && !isNaN(parsed.totalKills)) {
        saveState.totalKills = parsed.totalKills;
      }
      if (typeof parsed.bestFloor === 'number' && !isNaN(parsed.bestFloor)) {
        saveState.bestFloor = parsed.bestFloor;
      }
      if (typeof parsed.bossesSlain === 'number' && !isNaN(parsed.bossesSlain)) {
        saveState.bossesSlain = parsed.bossesSlain;
      }
      if (parsed.weaponKills && typeof parsed.weaponKills === 'object') {
        saveState.weaponKills = parsed.weaponKills;
      }
    }
  } catch {
    // Malformed JSON fallback to defaults
  }
  return saveState;
}

/**
 * Writes persistent meta progression to storage.
 */
export function writeMetaSave(
  state: MetaSaveState,
  storage: StorageDriver = defaultStorage
): void {
  try {
    storage.setItem(SAVE_KEY_META, JSON.stringify(state));
  } catch {
    // Fail-safe
  }
}

// ============================================================================
// CAREER MILESTONE & OUTLAW RANK CLASSIFIER
// ============================================================================

export interface CareerOutlawRank {
  rankId: 'rookie_courier' | 'highway_outlaw' | 'syndicate_enforcer' | 'apex_roadlord' | 'legend_of_valhalla';
  title: string;
  tierNumber: 1 | 2 | 3 | 4 | 5;
  careerScore: number;
  nextMilestoneText: string;
}

/**
 * Computes career score and classifies player into one of 5 Outlaw Ranks based on
 * total kills, bosses slain, and deepest floor reached.
 */
export function getCareerOutlawRank(metaSave?: Partial<MetaSaveState> | null): CareerOutlawRank {
  const kills = Math.max(0, metaSave?.totalKills || 0);
  const bosses = Math.max(0, metaSave?.bossesSlain || 0);
  const bestFloor = Math.max(1, metaSave?.bestFloor || 1);
  const careerScore = kills + bosses * 25 + (bestFloor - 1) * 40;

  if (careerScore >= 500 || (bestFloor >= 6 && bosses >= 6)) {
    return {
      rankId: 'legend_of_valhalla',
      title: '👑 LEGEND OF VALHALLA',
      tierNumber: 5,
      careerScore,
      nextMilestoneText: 'MAX CAREER RANK ACHIEVED'
    };
  }

  if (careerScore >= 250 || bestFloor >= 5) {
    return {
      rankId: 'apex_roadlord',
      title: '☠️ APEX ROADLORD',
      tierNumber: 4,
      careerScore,
      nextMilestoneText: 'Reach 500 Career Score or clear Floor 6 for LEGEND OF VALHALLA'
    };
  }

  if (careerScore >= 120 || bestFloor >= 3) {
    return {
      rankId: 'syndicate_enforcer',
      title: '⚡ SYNDICATE ENFORCER',
      tierNumber: 3,
      careerScore,
      nextMilestoneText: 'Reach 250 Career Score or Floor 5 for APEX ROADLORD'
    };
  }

  if (careerScore >= 40 || bestFloor >= 2) {
    return {
      rankId: 'highway_outlaw',
      title: '🔥 HIGHWAY OUTLAW',
      tierNumber: 2,
      careerScore,
      nextMilestoneText: 'Reach 120 Career Score or Floor 3 for SYNDICATE ENFORCER'
    };
  }

  return {
    rankId: 'rookie_courier',
    title: '⚙️ ROOKIE COURIER',
    tierNumber: 1,
    careerScore,
    nextMilestoneText: 'Reach 40 Career Score or Floor 2 for HIGHWAY OUTLAW'
  };
}

// ============================================================================
// FLOOR BOUNTY CONTRACT PROGRESS EVALUATOR
// ============================================================================

export interface FloorBountyContractStatus {
  targetFloor: number;
  contractTitle: string;
  taskText: string;
  rewardScrap: number;
  rewardCoins: number;
  isStyleMilestoneMet: boolean;
  summaryLine: string;
}

const FLOOR_BOUNTY_DEFINITIONS = [
  { title: 'NEON DAREDEVIL', task: 'Graze 3 enemy projectiles or clear Floor 1 Boss', scrap: 8, coins: 10 },
  { title: 'DRIFT EXECUTIONER', task: 'Trigger 2 Drift Shockwaves or clear Floor 2 Boss', scrap: 10, coins: 12 },
  { title: 'THERMAL HUNTER', task: 'Reach Style Rank A or clear Floor 3 Boss', scrap: 12, coins: 15 },
  { title: 'CRYO BREAKER', task: 'Detonate 2 Arena Barrels or clear Floor 4 Boss', scrap: 15, coins: 18 },
  { title: 'APEX INTERCEPTOR', task: 'Reach Style Rank S or clear Floor 5 Boss', scrap: 18, coins: 22 },
  { title: 'VALHALLA CONQUEROR', task: 'Defeat Omega Valhalla on Floor 6', scrap: 25, coins: 30 }
] as const;

/**
 * Pure evaluator mapping run floors to canonical bounty contracts and checking player style milestones.
 */
export function getFloorBountyContractStatus(
  floorNum: number = 1,
  player?: Partial<PlayerState> | null
): FloorBountyContractStatus {
  const targetFloor = Math.max(1, Math.floor(Number.isFinite(floorNum) ? floorNum : 1));
  const contractIdx = (targetFloor - 1) % 6;
  const contract = FLOOR_BOUNTY_DEFINITIONS[contractIdx];

  const styleScore = Number(player?.styleScore || 0);
  const styleRank = String(player?.styleRank || '');
  const isStyleMilestoneMet = styleScore >= 50 || ['A', 'S', 'SS', 'SSS'].includes(styleRank);

  const contractTitle = contract.title;
  const taskText = contract.task;
  const rewardScrap = contract.scrap;
  const rewardCoins = contract.coins;
  const summaryLine = `BOUNTY [F${targetFloor}] ${contractTitle}: ${taskText} (+${rewardScrap} SCRAP, +${rewardCoins} COINS)`;

  return {
    targetFloor,
    contractTitle,
    taskText,
    rewardScrap,
    rewardCoins,
    isStyleMilestoneMet,
    summaryLine
  };
}

// ============================================================================
// RUN CHECKPOINT AUTOSAVE
// ============================================================================

const RUN_FIELDS: (keyof RunSaveState)[] = [
  'hp',
  'maxHp',
  'coins',
  'dmgMult',
  'fireRateMult',
  'speedMult',
  'projSpeedMult',
  'blastMult',
  'pierce',
  'bounce',
  'multiShot',
  'vampChance',
  'killCount',
  'weapon',
  'nos'
];

/**
 * Saves in-run checkpoint autosave (`moto_rogue_run_v1`).
 */
export function saveRunCheckpoint(
  player: PlayerState,
  floorNum: number,
  storage: StorageDriver = defaultStorage
): void {
  try {
    const checkpoint: RunSaveState = {
      floorNum,
      hp: player.hp,
      maxHp: player.maxHp,
      coins: player.coins,
      dmgMult: player.dmgMult,
      fireRateMult: player.fireRateMult,
      speedMult: player.speedMult,
      projSpeedMult: player.projSpeedMult,
      blastMult: player.blastMult,
      pierce: player.pierce,
      bounce: player.bounce,
      multiShot: player.multiShot,
      vampChance: player.vampChance,
      killCount: player.killCount,
      weapon: player.weapon,
      nos: player.nos,
      items: [...player.items],
      itemStacks: { ...player.itemStacks },
      runWeapons: { ...player.runWeapons }
    };
    storage.setItem(SAVE_KEY_RUN, JSON.stringify(checkpoint));
  } catch {
    // Fail-safe
  }
}

/**
 * Loads and restores in-run checkpoint autosave if present and valid (hp > 0).
 */
export function loadRunCheckpoint(
  player: PlayerState,
  save: MetaSaveState,
  storage: StorageDriver = defaultStorage
): { restored: boolean; floorNum: number } {
  try {
    const raw = storage.getItem(SAVE_KEY_RUN);
    if (!raw) return { restored: false, floorNum: 1 };
    const checkpoint = JSON.parse(raw) as Partial<RunSaveState>;
    if (!checkpoint || typeof checkpoint.hp !== 'number' || checkpoint.hp <= 0) {
      return { restored: false, floorNum: 1 };
    }

    const floorNum = checkpoint.floorNum || 1;
    for (const key of RUN_FIELDS) {
      if (checkpoint[key] !== undefined) {
        (player as unknown as Record<string, unknown>)[key] = checkpoint[key];
      }
    }
    player.items = Array.isArray(checkpoint.items) ? checkpoint.items : [];
    player.itemStacks = checkpoint.itemStacks && typeof checkpoint.itemStacks === 'object' ? checkpoint.itemStacks : {};
    player.runWeapons = checkpoint.runWeapons && typeof checkpoint.runWeapons === 'object' ? checkpoint.runWeapons : {};

    // Validate restored weapon availability
    if (!isWeaponAvailable(player.weapon, save, player)) {
      player.weapon = getStartingWeapon(save);
    }

    return { restored: true, floorNum };
  } catch {
    return { restored: false, floorNum: 1 };
  }
}

/**
 * Clears in-run checkpoint autosave upon player defeat or run completion.
 */
export function clearRunSave(storage: StorageDriver = defaultStorage): void {
  try {
    storage.removeItem(SAVE_KEY_RUN);
  } catch {
    // Fail-safe
  }
}

// ============================================================================
// AUDIO MUTE PREFERENCE
// ============================================================================

export function isMuted(storage: StorageDriver = defaultStorage): boolean {
  return storage.getItem(SAVE_KEY_MUTED) === '1';
}

export function setMuted(muted: boolean, storage: StorageDriver = defaultStorage): void {
  storage.setItem(SAVE_KEY_MUTED, muted ? '1' : '0');
}

// ============================================================================
// WEAPON RULES & SELECTION
// ============================================================================

export const WEAPON_PRIORITY_ORDER: readonly WeaponId[] = [
  'arc_coil',
  'railgun',
  'grenade_launcher',
  'shotgun',
  'flamethrower',
  'machine_gun'
] as const;

/**
 * Determines the player's starting weapon for a fresh run based on permanent garage unlocks.
 * Highest-tier unlocked weapon takes priority; defaults to pistol.
 */
export function getStartingWeapon(save: MetaSaveState): WeaponId {
  for (const id of WEAPON_PRIORITY_ORDER) {
    if (save.unlocked[id as UnlockableWeaponId]) {
      return id;
    }
  }
  return 'pistol';
}

/**
 * Checks if a weapon is currently selectable by the player.
 */
export function isWeaponAvailable(
  weaponId: WeaponId,
  save: MetaSaveState,
  player?: PlayerState
): boolean {
  if (weaponId === 'pistol') return true;
  if (player?.runWeapons && player.runWeapons[weaponId]) return true;
  return !!save.unlocked[weaponId as UnlockableWeaponId];
}

// ============================================================================
// PLAYER STATS & EQUIPMENT LOGIC
// ============================================================================

/**
 * Applies or unapplies stats from an equipment item to the player state.
 */
export function applyItemStats(
  player: PlayerState,
  item: EquipmentItem,
  sign: 1 | -1
): void {
  applyItemStatsHelper(item, sign, player);
}

/**
 * Applies persistent garage meta ranks and weapon mastery bonuses to player stats.
 */
export function applyMetaStats(
  player: PlayerState,
  metaSave: MetaSaveState
): void {
  player.dmgMult = 1 + (metaSave.ranks?.dmg || 0) * 0.10;
  player.fireRateMult = 1 + (metaSave.ranks?.fireRate || 0) * 0.08;
  player.speedMult = 1 + (metaSave.ranks?.speed || 0) * 0.06;
  player.maxHp = 6 + (metaSave.ranks?.maxHp || 0);
  player.hp = player.maxHp;

  if (player.dmg === undefined) {
    player.dmg = player.dmgMult;
  }

  const weaponId = player.weapon || getStartingWeapon(metaSave);
  const kills = metaSave.weaponKills?.[weaponId] || 0;
  if (kills >= 100) {
    player.dmg = Number((player.dmg * 1.15).toFixed(2));
    player.dmgMult = Number((player.dmgMult * 1.15).toFixed(2));
  } else if (kills >= 40) {
    player.dmg = Number((player.dmg * 1.10).toFixed(2));
    player.dmgMult = Number((player.dmgMult * 1.10).toFixed(2));
  } else if (kills >= 10) {
    player.dmg = Number((player.dmg * 1.05).toFixed(2));
    player.dmgMult = Number((player.dmgMult * 1.05).toFixed(2));
  }
}

/**
 * Completely resets player stats for a new run, applying meta ranks and equipped items.
 */
export function resetPlayerStatsForRun(
  player: PlayerState,
  save: MetaSaveState
): void {
  player.weapon = getStartingWeapon(save);
  applyMetaStats(player, save);
  player.projSpeedMult = 1;
  player.blastMult = 1;
  player.pierce = 0;
  player.bounce = 0;
  player.multiShot = 1;
  player.vampChance = 0;

  // Apply all equipped equipment pieces
  for (const slotDef of EQUIP_SLOTS) {
    const item = save.equipped[slotDef.id];
    if (item) {
      applyItemStats(player, item, 1);
    }
  }

  // Restore HP to calculated maxHp
  player.hp = player.maxHp;
  player.coins = 0;
  player.runWeapons = {};
  player.items = [];
  player.itemStacks = {};
  player.killCount = 0;
  player.nos = player.nosMax;
  player.nosLock = false;
  player.nosDelay = 0;
  player.invuln = 0;
  player.livery = save.livery || 'crimson_kaneda';
  player.heatLevel = save.heatLevel || 0;
}

/**
 * Equips an item from the stash into its corresponding slot.
 */
export function equipItem(
  save: MetaSaveState,
  item: EquipmentItem,
  player?: PlayerState,
  storage: StorageDriver = defaultStorage
): void {
  const stashIdx = save.stash.indexOf(item);
  if (stashIdx >= 0) {
    save.stash.splice(stashIdx, 1);
  }

  const oldItem = save.equipped[item.slot];
  if (oldItem) {
    if (player) {
      applyItemStats(player, oldItem, -1);
    }
    save.stash.push(oldItem);
  }

  save.equipped[item.slot] = item;
  if (player) {
    applyItemStats(player, item, 1);
  }

  writeMetaSave(save, storage);
}

/**
 * Unequips an equipment slot and returns the item to the stash.
 */
export function unequipSlot(
  save: MetaSaveState,
  slotId: EquipSlot,
  player?: PlayerState,
  storage: StorageDriver = defaultStorage
): EquipmentItem | null {
  const item = save.equipped[slotId];
  if (!item) return null;

  if (player) {
    applyItemStats(player, item, -1);
  }
  delete save.equipped[slotId];
  save.stash.push(item);
  writeMetaSave(save, storage);
  return item;
}

/**
 * Sells an item from the stash for scrap.
 */
export function sellItem(
  save: MetaSaveState,
  item: EquipmentItem,
  storage: StorageDriver = defaultStorage
): number {
  const idx = save.stash.indexOf(item);
  if (idx < 0) return 0;

  save.stash.splice(idx, 1);
  const rarityDef = RARITY[item.rarity];
  const scrapEarned = rarityDef ? rarityDef.sell : 3;
  save.scrap += scrapEarned;
  writeMetaSave(save, storage);
  return scrapEarned;
}

/**
 * Adds newly found loot to inventory:
 * - If slot is empty or new item has higher score, auto-equips.
 * - Otherwise puts in stash.
 * - If stash exceeds MAX_STASH_SIZE (18), auto-sells the weakest item.
 */
export function addLoot(
  save: MetaSaveState,
  item: EquipmentItem,
  player?: PlayerState,
  storage: StorageDriver = defaultStorage
): { equipped: boolean; soldWeakest: EquipmentItem | null } {
  const cur = save.equipped[item.slot];
  let equipped = false;
  let soldWeakest: EquipmentItem | null = null;

  if (!cur || itemScore(item) > itemScore(cur)) {
    equipItem(save, item, player, storage);
    equipped = true;
  } else {
    save.stash.push(item);
  }

  while (save.stash.length > MAX_STASH_SIZE) {
    let worst = save.stash[0];
    for (const s of save.stash) {
      if (itemScore(s) < itemScore(worst)) {
        worst = s;
      }
    }
    sellItem(save, worst, storage);
    soldWeakest = worst;
  }

  writeMetaSave(save, storage);
  return { equipped, soldWeakest };
}

// ============================================================================
// REACTIVE STATE MANAGER CLASS
// ============================================================================

export type StateChangeCallback = (stateManager: StateManager) => void;

/**
 * Reactive State Manager encapsulating game state, meta save, and persistence.
 */
export class StateManager {
  public player: PlayerState;
  public metaSave: MetaSaveState;
  public floorNum: number = 1;
  public gameOver: boolean = false;
  public screenShake: number = 0;
  private listeners: Set<StateChangeCallback> = new Set();
  private storage: StorageDriver;

  constructor(storage: StorageDriver = defaultStorage) {
    this.storage = storage;
    this.player = createDefaultPlayerState();
    this.metaSave = loadMetaSave(this.storage);
    resetPlayerStatsForRun(this.player, this.metaSave);
  }

  public subscribe(callback: StateChangeCallback): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  public notify(): void {
    for (const cb of this.listeners) {
      cb(this);
    }
  }

  public saveMeta(): void {
    writeMetaSave(this.metaSave, this.storage);
    this.notify();
  }

  public saveRun(): void {
    if (this.gameOver) return;
    saveRunCheckpoint(this.player, this.floorNum, this.storage);
  }

  public loadRun(): boolean {
    const res = loadRunCheckpoint(this.player, this.metaSave, this.storage);
    if (res.restored) {
      this.floorNum = res.floorNum;
      this.notify();
      return true;
    }
    return false;
  }

  public clearRun(): void {
    clearRunSave(this.storage);
  }

  public resetRun(): void {
    this.gameOver = false;
    this.floorNum = 1;
    this.screenShake = 0;
    this.player = createDefaultPlayerState();
    resetPlayerStatsForRun(this.player, this.metaSave);
    this.notify();
  }

  public equip(item: EquipmentItem): void {
    equipItem(this.metaSave, item, this.player, this.storage);
    this.notify();
  }

  public unequip(slotId: EquipSlot): EquipmentItem | null {
    const res = unequipSlot(this.metaSave, slotId, this.player, this.storage);
    this.notify();
    return res;
  }

  public sell(item: EquipmentItem): number {
    const scrap = sellItem(this.metaSave, item, this.storage);
    this.notify();
    return scrap;
  }

  public receiveLoot(item: EquipmentItem): { equipped: boolean; soldWeakest: EquipmentItem | null } {
    const res = addLoot(this.metaSave, item, this.player, this.storage);
    this.notify();
    return res;
  }

  public isMuted(): boolean {
    return isMuted(this.storage);
  }

  public setMuted(muted: boolean): void {
    setMuted(muted, this.storage);
    this.notify();
  }
}
