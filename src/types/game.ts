/**
 * MOTO-ROGUE: Master Type Definitions Contract
 * Source of Truth for Systems, Core, World, Combat, Render, Audio & UI
 */

// ============================================================================
// 1. GEOMETRY, MATH & ENGINE CONSTANTS
// ============================================================================

export const ARENA_WIDTH = 720;
export const ARENA_HEIGHT = 720;
export const WALL_THICKNESS = 58;
export const DOOR_HALF_WIDTH = 42;
export const PLAYER_RADIUS = 17;
export const MAX_STASH_SIZE = 18;
export const MAX_SKIDS_PER_ROOM = 130;

export const SAVE_KEY_META = 'moto_rogue_save_v2';
export const SAVE_KEY_RUN = 'moto_rogue_run_v1';
export const SAVE_KEY_MUTED = 'moto_rogue_muted';

export interface Point2D {
  x: number;
  y: number;
}

export interface Vector2D {
  vx: number;
  vy: number;
}

export interface AABB {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Circle {
  x: number;
  y: number;
  radius: number;
}

export type Direction = 'N' | 'S' | 'E' | 'W';

export type DoorMap = Record<Direction, boolean>;

export interface DoorDef {
  dir: Direction;
  open: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
}

// ============================================================================
// 2. WEAPONS & COMBAT SYSTEMS
// ============================================================================

export type WeaponId =
  | 'pistol'
  | 'machine_gun'
  | 'flamethrower'
  | 'grenade_launcher'
  | 'shotgun'
  | 'railgun'
  | 'arc_coil';

export type UnlockableWeaponId =
  | 'machine_gun'
  | 'shotgun'
  | 'flamethrower'
  | 'railgun'
  | 'grenade_launcher'
  | 'arc_coil';

export interface WeaponDef {
  id: WeaponId;
  name: string;
  key: string;
  desc: string;
  description?: string; // Compatibility alias
  cost: number;
  cooldown: number;
  baseDmg: number;
  damage?: number; // Compatibility alias with PROJECT.md
  projSpeed: number;
  speed?: number;   // Compatibility alias with PROJECT.md
  color: string;
  radius?: number;
  life?: number;
}

export interface PlayerBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  dmg: number;
  pierceLeft: number;
  bounceLeft: number;
  hitIds: Set<number | Obstacle>;
  color: string;
  life: number;
  maxLife?: number;
  maxRadius?: number; // Flamethrower expansion
  isFlame?: boolean;
  isRail?: boolean;
  isArc?: boolean;
  knockback?: number; // Shotgun knockback (11px)
}

export interface EnemyBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  life?: number;
}

export interface Grenade {
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  t: number;
  duration: number;
  radius: number;
  blastRadius: number;
  dmg: number;
}

export interface EnemyBomb {
  x: number;
  y: number;
  startX: number;
  startY: number;
  targetX: number;
  targetY: number;
  t: number;
  duration: number;
}

export interface FloorHazard {
  x: number;
  y: number;
  radius: number;
  life: number;
  maxLife: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  color: string;
  life: number;
  maxLife: number;
  shockwaveMax?: number;
}

export interface BeamEffect {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  life: number;
  maxLife: number;
  isLightning?: boolean;
}

export interface DamageNumber {
  x: number;
  y: number;
  text: string;
  color: string;
  life: number;
  maxLife: number;
}

export type FloatingText = DamageNumber;

export type Projectile = PlayerBullet | EnemyBullet;

// ============================================================================
// 3. ENTITY TYPES (PLAYER, ENEMIES, BOSSES, OBSTACLES)
// ============================================================================

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  bikeAngle: number;
  aimAngle: number;
  baseSpeed: number;
  hp: number;
  maxHp: number;
  coins: number;
  invuln: number;
  invulnTimer?: number; // Compatibility alias
  weapon: WeaponId;
  runWeapons: Partial<Record<WeaponId, boolean>>;
  fireTimer: number;
  // Multipliers & modifiers
  dmgMult: number;
  fireRateMult: number;
  speedMult: number;
  projSpeedMult: number;
  blastMult: number;
  pierce: number;
  bounce: number;
  multiShot: number;
  vampChance: number;
  items: string[];
  itemStacks: Record<string, number>;
  killCount: number;
  // NOS booster system
  nos: number;
  nosMax: number;
  nosLock: boolean;
  nosDelay: number;
}

export type RegularEnemyType =
  | 'swarmer'
  | 'turret'
  | 'charger'
  | 'trishot'
  | 'bomber'
  | 'brute'
  | 'splitter'
  | 'mini_swarmer'
  | 'sniper'
  | 'pyro';

export type EnemyType = RegularEnemyType | 'boss';

export interface BaseEnemy {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  hp: number;
  maxHp: number;
  speed: number;
  burnTimer: number;
  burnTick: number;
  aiTimer: number;
  state: string;
  angle: number;
  isElite: boolean;
  color: string;
}

export interface RegularEnemy extends BaseEnemy {
  type: RegularEnemyType;
  dashVx?: number;
  dashVy?: number;
  strafeDir?: number;
  zigPhase?: number;
}

export type BossVariantId = 0 | 1 | 2 | 3 | 4 | 5;
export type BossVariantName =
  | 'SCRAP GOLIATH'
  | 'SIEGE BEHEMOTH'
  | 'OVERLORD HELION'
  | 'CRYO VALKYRIE'
  | 'INFERNO COLOSSUS'
  | 'OMEGA VALHALLA';

export interface Boss extends BaseEnemy {
  type: 'boss';
  bossVariant: BossVariantId;
  name: BossVariantName | string;
  subtitle?: string;
  subTimer: number;
  specialTimer?: number;
  dashVx?: number;
  dashVy?: number;
  phase?: number;
  isElite: false;
}

export type Enemy = RegularEnemy | Boss;

export type ObstacleType = 'rock' | 'barrel';

export interface Obstacle {
  x: number;
  y: number;
  size: number;
  type: ObstacleType;
  hp: number;
}

// ============================================================================
// 4. WORLD, DUNGEON & ROOMS
// ============================================================================

export type RoomType = 'start' | 'combat' | 'boss' | 'treasure' | 'shop';

export interface SkidMark {
  x: number;
  y: number;
  angle: number;
}

export interface FloorPowerUpQuota {
  dropped: number;
  max: number;
}

export interface Room {
  x: number;
  y: number;
  type: RoomType;
  cleared: boolean;
  visited: boolean;
  doors: DoorMap;
  obstacles: Obstacle[];
  enemies: Enemy[];
  pickups: Pickup[];
  hazards: FloorHazard[];
  skids: SkidMark[];
  trapdoor: boolean;
  bossIntroShown?: boolean;
  powerUpDropQuota?: FloorPowerUpQuota;
  powerUpDroppedInRoom?: boolean;
}

export type Dungeon = Record<string, Room>;

export interface DungeonGraph {
  rooms: Dungeon;
  floor: number;
  targetRooms: number;
  startCoord: Point2D;
  bossCoord: Point2D;
  treasureCoord?: Point2D;
  shopCoord?: Point2D;
}

// ============================================================================
// 5. PROGRESSION, ITEMS & BIKE EQUIPMENT
// ============================================================================

export type EquipSlot = 'tires' | 'engine' | 'handlebars' | 'exhaust' | 'frame' | 'tank';

export type StatKey = 'dmg' | 'fireRate' | 'speed' | 'blast' | 'hp' | 'siphon';

export type RarityTier = 0 | 1 | 2 | 3;
export type RarityId = 'common' | 'magic' | 'rare' | 'legendary';
export type RarityName = 'Common' | 'Magic' | 'Rare' | 'Legendary';

export interface RarityDef {
  id: RarityId;
  name: RarityName;
  color: string;
  mult: number;
  sell: number;
}

export interface EquipmentItem {
  slot: EquipSlot;
  rarity: RarityTier;
  name: string;
  stats: Partial<Record<StatKey, number>>;
}

export interface EquipSlotDef {
  id: EquipSlot;
  label: string;
  stat: StatKey;
}

export type DropItemId =
  | 'nitro_syringe'
  | 'tire_iron'
  | 'chrome_lens'
  | 'gasoline'
  | 'racing_slicks'
  | 'oil_infusion';

export interface DropItemDef {
  id: DropItemId;
  name: string;
  desc: string;
  color: string;
  icon: string;
}

export type ModId =
  | 'hollow_point'
  | 'hair_trigger'
  | 'turbo_charger'
  | 'armor_plate'
  | 'piercing_core'
  | 'ricochet_mod'
  | 'vamp_siphon'
  | 'split_chamber'
  | 'high_explosive';

export interface ModDef {
  id: ModId | string;
  name: string;
  desc: string;
  cost: number;
  apply: (player: PlayerState) => void;
}

export type MetaUpgradeId = 'dmg' | 'fireRate' | 'speed' | 'maxHp';

export interface MetaUpgradeDef {
  id: MetaUpgradeId;
  name: string;
  desc: string;
  baseCost: number;
  costScale: number;
  maxRank: number;
}

export type MetaUpgrades = Record<MetaUpgradeId, MetaUpgradeDef>;

// ============================================================================
// 6. PICKUP SYSTEM (DISCRIMINATED UNIONS)
// ============================================================================

export interface BasePickup {
  x: number;
  y: number;
  radius: number;
}

export interface LootPickup extends BasePickup {
  type: 'loot';
  item: EquipmentItem;
}

export interface DropItemPickup extends BasePickup {
  type: 'item_drop';
  itemId: DropItemId;
}

export interface HeartPickup extends BasePickup {
  type: 'heart';
}

export interface ShopHeartPickup extends BasePickup {
  type: 'shop_heart';
  name: string;
  cost: number;
}

export interface ModPedestalPickup extends BasePickup {
  type: 'mod_pedestal';
  mod: ModDef;
  cost: number;
}

export interface RunWeaponPickup extends BasePickup {
  type: 'run_weapon';
  weaponId: WeaponId;
  name: string;
  cost: number;
}

export type Pickup =
  | LootPickup
  | DropItemPickup
  | HeartPickup
  | ShopHeartPickup
  | ModPedestalPickup
  | RunWeaponPickup;

// ============================================================================
// 7. PERSISTENCE & LOCALSTORAGE STATE
// ============================================================================

export interface MetaSaveState {
  scrap: number;
  unlocked: Record<UnlockableWeaponId, boolean>;
  ranks: Record<MetaUpgradeId, number>;
  equipped: Partial<Record<EquipSlot, EquipmentItem>>;
  stash: EquipmentItem[];
}

export interface RunSaveState {
  floorNum: number;
  hp: number;
  maxHp: number;
  coins: number;
  dmgMult: number;
  fireRateMult: number;
  speedMult: number;
  projSpeedMult: number;
  blastMult: number;
  pierce: number;
  bounce: number;
  multiShot: number;
  vampChance: number;
  killCount: number;
  weapon: WeaponId;
  nos: number;
  items: string[];
  itemStacks: Record<string, number>;
  runWeapons: Partial<Record<WeaponId, boolean>>;
}

export type AudioMuteState = '0' | '1';

// ============================================================================
// 8. AUDIO SERVICE CONTRACT
// ============================================================================

export interface AudioService {
  init(): boolean;
  setMuted(muted: boolean): void;
  toggleMute(): boolean;
  isMuted?(): boolean;
  updateEngine(speedRatio: number, isBoosting: boolean, paused: boolean): void;
  updateEngineHum?(speedRatio: number, isBoosting: boolean, paused: boolean): void;
  shoot(weaponId: WeaponId | string): void;
  arcChain(): void;
  explosion(): void;
  hit(isCrit?: boolean): void;
  enemyKill(isBoss?: boolean): void;
  playerHurt(): void;
  gameOverSound(): void;
  pickupFuel(): void;
  pickupItem(): void;
  pickupLoot(rarityIdx?: number): void;
  shopBuy(): void;
  shopError(): void;
  roomClear(): void;
  doorTransition(): void;
  nextFloor(): void;
  uiClick(): void;
}

// ============================================================================
// 9. INPUT & UI INTERFACES
// ============================================================================

export interface InputState {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  boost: boolean;
  aimAngle: number;
  fire: boolean;
  mouseX: number;
  mouseY: number;
  mouseDown: boolean;
}

export interface ShopPendingPurchase {
  pickup: Pickup;
  title: string;
  desc: string;
  cost: number;
}

export interface AnimeImpactFrame {
  active: boolean;
  timer: number;
  duration: number;
}
