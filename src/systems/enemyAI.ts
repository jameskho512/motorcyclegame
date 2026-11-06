/**
 * MOTO-ROGUE: Enemy AI & Boss System Module
 *
 * Implements:
 * 1. Non-linear floor scaling formulas (HP, movement speed, projectile speed).
 * 2. Elite variant modifier (1.65x HP, 1.15x speed, gold border, enhanced loot drops).
 * 3. All 10 regular & advanced enemy AI behaviors:
 *    - Swarmer, Mini Swarmer, Splitter (sinusoidal perpendicular wave chasing)
 *    - Turret (stationary, aimed 1.35s projectile)
 *    - Charger (3-state machine: idle, windup laser telegraph, 2.75x high-speed dash)
 *    - Trishot (tangential strafe, 3-bullet fan spread)
 *    - Bomber (retreats/kites, lobs mortar bombs that spawn fire hazard pools)
 *    - Brute (frontal bullet armor, heavy cannon slug)
 *    - Sniper (kites, red dashed laser sight telegraph, precision sniper slug)
 *    - Pyro (aggressive pursuer, 6-bullet circular nova ring)
 * 4. The 3 Road-Raging Boss Variants:
 *    - Variant 0: Scrap Goliath (radial bullet novas)
 *    - Variant 1: Siege Behemoth (radial bullet novas + heavy mortar bombs)
 *    - Variant 2: Overlord Helion (radial bullet novas + aimed 5-way spread burst)
 * 5. Boss minion spawning and defeat reward drops (Coins, Scrap, Jerry-can, Equipment loot,
 *    Free Mod Pedestal, Trapdoor).
 *
 * Parity reference: moto-rogue/index.html L1701-L1770, L2572-L2751
 */

import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  WALL_THICKNESS,
  type Point2D,
  type PlayerState,
  type Enemy,
  type RegularEnemy,
  type RegularEnemyType,
  type Boss,
  type BossVariantId,
  type BossVariantName,
  type EnemyBullet,
  type EnemyBomb,
  type Room,
  type Pickup
} from '../types/game';
import { RUN_MOD_POOL } from '../data/upgrades';
import { genLoot } from '../data/equipment';
import { resolveCircleAABB } from './combat';

// ============================================================================
// 1. FLOOR & STAT SCALING FORMULAS
// ============================================================================

/**
 * Meaningful non-linear exponential + linear scaling per floor.
 * Formula: 1 + (floor - 1) * 0.45 + (floor - 1)^1.35 * 0.22
 */
export function getFloorScale(floor: number): number {
  const f = Math.max(1, floor);
  return 1 + (f - 1) * 0.45 + Math.pow(f - 1, 1.35) * 0.22;
}

/**
 * Calculates scaled enemy HP.
 * Formula: round(baseHp * getFloorScale(floor) * (isElite ? 1.65 : 1))
 */
export function calcEnemyHp(baseHp: number, floor: number, isElite: boolean = false): number {
  const scale = getFloorScale(floor) * (isElite ? 1.65 : 1);
  return Math.round(baseHp * scale);
}

/**
 * Calculates scaled enemy movement speed.
 * Formula: baseSpeed * (1 + (floor - 1) * 0.06) * (isElite ? 1.15 : 1)
 */
export function calcEnemySpeed(baseSpeed: number, floor: number, isElite: boolean = false): number {
  const f = Math.max(1, floor);
  const spdScale = (1 + (f - 1) * 0.06) * (isElite ? 1.15 : 1);
  return baseSpeed * spdScale;
}

/**
 * Calculates enemy bullet velocity scaling multiplier.
 * Formula: 1 + (floor - 1) * 0.08
 */
export function calcEnemyProjSpeedScale(floor: number): number {
  const f = Math.max(1, floor);
  return 1 + (f - 1) * 0.08;
}

/**
 * Calculates elite spawn probability for a floor.
 * Formula: min(0.45, max(0, (floor - 1) * 0.12))
 */
export function getEliteSpawnChance(floor: number): number {
  return Math.min(0.45, Math.max(0, (floor - 1) * 0.12));
}

// ============================================================================
// 2. ENEMY FACTORY & SPAWNERS
// ============================================================================

let entityIdCounter = 1000;

export function resetEntityIdCounter(start: number = 1000): void {
  entityIdCounter = start;
}

export function getNextEntityId(): number {
  return ++entityIdCounter;
}

export interface EnemyTypeBaseConfig {
  baseHp: number;
  baseSpeed: number;
  radius: number;
  color: string;
}

export const ENEMY_BASE_CONFIGS: Record<RegularEnemyType, EnemyTypeBaseConfig> = {
  swarmer:      { baseHp: 34,  baseSpeed: 130, radius: 14, color: '#00bbf9' },
  turret:       { baseHp: 42,  baseSpeed: 35,  radius: 16, color: '#9b5de5' },
  charger:      { baseHp: 52,  baseSpeed: 120, radius: 17, color: '#f15bb5' },
  trishot:      { baseHp: 58,  baseSpeed: 95,  radius: 17, color: '#00f5d4' },
  bomber:       { baseHp: 64,  baseSpeed: 75,  radius: 18, color: '#ff9f1c' },
  brute:        { baseHp: 105, baseSpeed: 68,  radius: 22, color: '#5c677d' },
  splitter:     { baseHp: 72,  baseSpeed: 115, radius: 20, color: '#80ed99' },
  mini_swarmer: { baseHp: 22,  baseSpeed: 175, radius: 11, color: '#57cc99' },
  sniper:       { baseHp: 48,  baseSpeed: 65,  radius: 15, color: '#ff4d6d' },
  pyro:         { baseHp: 82,  baseSpeed: 110, radius: 19, color: '#ff5400' }
};

/**
 * Creates an instance of a regular or advanced enemy with scaled stats.
 */
export function createEnemy(
  type: RegularEnemyType,
  x: number,
  y: number,
  floor: number,
  isElite: boolean = false,
  id: number = getNextEntityId(),
  rng: () => number = Math.random
): RegularEnemy {
  const cfg = ENEMY_BASE_CONFIGS[type] || ENEMY_BASE_CONFIGS.swarmer;
  const hp = calcEnemyHp(cfg.baseHp, floor, isElite);
  const speed = calcEnemySpeed(cfg.baseSpeed, floor, isElite);

  const enemy: RegularEnemy = {
    id,
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    radius: cfg.radius,
    hp,
    maxHp: hp,
    speed,
    burnTimer: 0,
    burnTick: 0,
    aiTimer: 0.6 + rng() * 0.8,
    state: 'idle',
    angle: 0,
    isElite,
    color: cfg.color
  };

  if (type === 'charger') {
    enemy.dashVx = 0;
    enemy.dashVy = 0;
  } else if (type === 'trishot') {
    enemy.strafeDir = rng() < 0.5 ? 1 : -1;
  } else if (type === 'swarmer' || type === 'mini_swarmer' || type === 'splitter') {
    enemy.zigPhase = rng() * 6;
  }

  return enemy;
}

export const BOSS_NAMES: readonly BossVariantName[] = [
  'SCRAP GOLIATH',
  'SIEGE BEHEMOTH',
  'OVERLORD HELION'
] as const;

export const BOSS_COLORS: readonly string[] = [
  '#e63946',
  '#f77f00',
  '#9d4edd'
] as const;

/**
 * Creates a boss instance matching the floor variant formula: (floor - 1) % 3.
 */
export function createBoss(
  floor: number,
  x: number,
  y: number,
  id: number = getNextEntityId()
): Boss {
  const scale = getFloorScale(floor);
  const bossVariant = ((floor - 1) % 3) as BossVariantId;
  const baseHp = Math.round(280 * scale);

  return {
    id,
    type: 'boss',
    bossVariant,
    name: BOSS_NAMES[bossVariant],
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 34,
    hp: baseHp,
    maxHp: baseHp,
    speed: 98 + floor * 7,
    burnTimer: 0,
    burnTick: 0,
    aiTimer: 1.3,
    subTimer: 3.2,
    state: 'idle',
    angle: 0,
    isElite: false,
    color: BOSS_COLORS[bossVariant]
  };
}

/** Compatibility aliases for E2E and other test runners */
export const createRegularEnemy = createEnemy;
export const createBossEnemy = createBoss;

/**
 * Returns boss minion spawn configuration for a boss arena.
 * Spawns min(4, floor) minions at four corner coordinates:
 * Floor 1: 'swarmer'; Floor 2+: 'trishot'.
 */
export function spawnBossMinions(floor: number): RegularEnemy[] {
  const count = Math.min(4, Math.max(1, floor));
  const corners: Point2D[] = [
    { x: 200, y: 200 },
    { x: 520, y: 200 },
    { x: 200, y: 520 },
    { x: 520, y: 520 }
  ];

  const minionType: RegularEnemyType = floor === 1 ? 'swarmer' : 'trishot';
  const minions: RegularEnemy[] = [];

  for (let i = 0; i < count; i++) {
    const pt = corners[i % corners.length];
    minions.push(createEnemy(minionType, pt.x, pt.y, floor, false));
  }

  return minions;
}

// ============================================================================
// 3. AI BEHAVIOR UPDATE SYSTEM
// ============================================================================

export interface AIContext {
  room: Room;
  enemy: Enemy;
  dt: number;
  player: Point2D | PlayerState;
  projScale: number;
  enemyBullets: EnemyBullet[];
  enemyBombs: EnemyBomb[];
  rng?: () => number;
  floorNum?: number;
}

/**
 * Updates an individual enemy's state machine, movement vector, aiming angle,
 * projectile firing cooldowns, and hazard creation.
 */
export function updateEnemyAI({
  room,
  enemy: en,
  dt,
  player,
  projScale,
  enemyBullets,
  enemyBombs,
  rng = Math.random,
  floorNum = 1
}: AIContext): void {
  const dx = player.x - en.x;
  const dy = player.y - en.y;
  const dist = Math.hypot(dx, dy) || 1;
  en.angle = Math.atan2(dy, dx);

  switch (en.type) {
    case 'swarmer':
    case 'mini_swarmer':
    case 'splitter': {
      // Sinusoidal perpendicular wave chasing: freq 6 rad/s, amplitude 0.35
      const reg = en as RegularEnemy;
      reg.zigPhase = (reg.zigPhase || 0) + dt * 6;
      const perpX = -dy / dist;
      const perpY = dx / dist;
      const wave = Math.sin(reg.zigPhase) * 0.35;
      en.x += (dx / dist + perpX * wave) * en.speed * dt;
      en.y += (dy / dist + perpY * wave) * en.speed * dt;
      break;
    }

    case 'charger': {
      // 3-state machine: idle, windup (0.45s telegraph), dashing (0.42s at 2.75x speed)
      const reg = en as RegularEnemy;
      en.aiTimer -= dt;

      if (en.state === 'dashing') {
        en.x += (reg.dashVx || 0) * dt;
        en.y += (reg.dashVy || 0) * dt;
        if (en.aiTimer <= 0) {
          en.state = 'idle';
          en.aiTimer = 1.1; // Recovery cooldown
        }
      } else if (en.state === 'windup') {
        // Stationary during windup telegraph
        if (en.aiTimer <= 0) {
          en.state = 'dashing';
          en.aiTimer = 0.42;
          reg.dashVx = (dx / dist) * en.speed * 2.75;
          reg.dashVy = (dy / dist) * en.speed * 2.75;
        }
      } else {
        // Idle state: advances toward player at 0.65x speed
        en.x += (dx / dist) * en.speed * 0.65 * dt;
        en.y += (dy / dist) * en.speed * 0.65 * dt;
        if (en.aiTimer <= 0 && dist < 340) {
          en.state = 'windup';
          en.aiTimer = 0.45;
        }
      }
      break;
    }

    case 'turret': {
      // Stationary platform firing aimed bullet every 1.35s
      en.aiTimer -= dt;
      if (en.aiTimer <= 0) {
        en.aiTimer = 1.35;
        enemyBullets.push({
          x: en.x,
          y: en.y,
          vx: Math.cos(en.angle) * 245 * projScale,
          vy: Math.sin(en.angle) * 245 * projScale,
          radius: 6,
          color: '#9b5de5'
        });
      }
      break;
    }

    case 'trishot': {
      // Tangential strafe tethering between 140px and 230px, 3-bullet fan every 1.55s
      const reg = en as RegularEnemy;
      const strafeDir = reg.strafeDir || 1;
      const perpX = (-dy / dist) * strafeDir;
      const perpY = (dx / dist) * strafeDir;
      const pull = dist > 230 ? 0.5 : dist < 140 ? -0.5 : 0;
      en.x += (perpX + (dx / dist) * pull) * en.speed * dt;
      en.y += (perpY + (dy / dist) * pull) * en.speed * dt;

      en.aiTimer -= dt;
      if (en.aiTimer <= 0) {
        en.aiTimer = 1.55;
        for (let k = -1; k <= 1; k++) {
          const a = en.angle + k * 0.24;
          enemyBullets.push({
            x: en.x,
            y: en.y,
            vx: Math.cos(a) * 240 * projScale,
            vy: Math.sin(a) * 240 * projScale,
            radius: 5.5,
            color: '#00f5d4'
          });
        }
      }
      break;
    }

    case 'bomber': {
      // Retreats/kites (dist < 190 -> -0.7x speed, else 0.4x speed), lobs mortar bomb every 2.2s
      const moveDir = dist < 190 ? -0.7 : 0.4;
      en.x += (dx / dist) * en.speed * moveDir * dt;
      en.y += (dy / dist) * en.speed * moveDir * dt;

      en.aiTimer -= dt;
      if (en.aiTimer <= 0) {
        en.aiTimer = 2.2;
        const targetX = Math.max(
          WALL_THICKNESS + 30,
          Math.min(ARENA_WIDTH - WALL_THICKNESS - 30, player.x + (rng() - 0.5) * 50)
        );
        const targetY = Math.max(
          WALL_THICKNESS + 30,
          Math.min(ARENA_HEIGHT - WALL_THICKNESS - 30, player.y + (rng() - 0.5) * 50)
        );
        enemyBombs.push({
          x: en.x,
          y: en.y,
          startX: en.x,
          startY: en.y,
          targetX,
          targetY,
          t: 0,
          duration: 0.95
        });
      }
      break;
    }

    case 'brute': {
      // Slow relentless march toward player, fires heavy cannon slug every 1.75s
      en.x += (dx / dist) * en.speed * dt;
      en.y += (dy / dist) * en.speed * dt;

      en.aiTimer -= dt;
      if (en.aiTimer <= 0) {
        en.aiTimer = 1.75;
        enemyBullets.push({
          x: en.x,
          y: en.y,
          vx: Math.cos(en.angle) * 210 * projScale,
          vy: Math.sin(en.angle) * 210 * projScale,
          radius: 9,
          color: '#ff9f1c'
        });
      }
      break;
    }

    case 'sniper': {
      // Kites afar (dist < 260 -> retreat, dist > 380 -> creep closer), fires precision slug every 1.9s
      const kiteDir = dist < 260 ? -0.5 : dist > 380 ? 0.4 : 0;
      en.x += (dx / dist) * en.speed * kiteDir * dt;
      en.y += (dy / dist) * en.speed * kiteDir * dt;

      en.aiTimer -= dt;
      if (en.aiTimer <= 0) {
        en.aiTimer = 1.9;
        enemyBullets.push({
          x: en.x,
          y: en.y,
          vx: Math.cos(en.angle) * 410 * projScale,
          vy: Math.sin(en.angle) * 410 * projScale,
          radius: 5,
          color: '#ff4d6d'
        });
      }
      break;
    }

    case 'pyro': {
      // Aggressive pursuit, fires 6-bullet circular nova ring every 1.65s
      en.x += (dx / dist) * en.speed * dt;
      en.y += (dy / dist) * en.speed * dt;

      en.aiTimer -= dt;
      if (en.aiTimer <= 0) {
        en.aiTimer = 1.65;
        for (let k = 0; k < 6; k++) {
          const a = en.angle + (k * Math.PI * 2) / 6;
          enemyBullets.push({
            x: en.x,
            y: en.y,
            vx: Math.cos(a) * 185 * projScale,
            vy: Math.sin(a) * 185 * projScale,
            radius: 6,
            color: '#ff5400'
          });
        }
      }
      break;
    }

    case 'boss': {
      const boss = en as Boss;
      // Persistent advance
      en.x += (dx / dist) * en.speed * dt;
      en.y += (dy / dist) * en.speed * dt;

      en.aiTimer -= dt;
      boss.subTimer -= dt;

      // Primary Attack: radial bullet burst of 8 + min(6, floor * 2) bullets
      if (en.aiTimer <= 0) {
        en.aiTimer = Math.max(0.75, 1.35 - floorNum * 0.08);
        const count = 8 + Math.min(6, floorNum * 2);
        for (let k = 0; k < count; k++) {
          const a = en.angle + (k * Math.PI * 2) / count;
          enemyBullets.push({
            x: en.x,
            y: en.y,
            vx: Math.cos(a) * 230 * projScale,
            vy: Math.sin(a) * 230 * projScale,
            radius: 7,
            color: en.color
          });
        }
      }

      // Secondary Attack: every 2.8s
      if (boss.subTimer <= 0) {
        boss.subTimer = 2.8;
        if (boss.bossVariant === 1) {
          // Siege Behemoth: lobs heavy targeted mortar bomb
          enemyBombs.push({
            x: en.x,
            y: en.y,
            startX: en.x,
            startY: en.y,
            targetX: player.x,
            targetY: player.y,
            t: 0,
            duration: 0.85
          });
        } else if (boss.bossVariant === 2) {
          // Overlord Helion: aimed 5-way spread burst at player
          for (let k = -2; k <= 2; k++) {
            const a = en.angle + k * 0.16;
            enemyBullets.push({
              x: en.x,
              y: en.y,
              vx: Math.cos(a) * 320 * projScale,
              vy: Math.sin(a) * 320 * projScale,
              radius: 6,
              color: '#00f5d4'
            });
          }
        }
      }
      break;
    }
  }

  // Arena wall clamping and obstacle physics collision
  en.x = Math.max(WALL_THICKNESS + en.radius, Math.min(ARENA_WIDTH - WALL_THICKNESS - en.radius, en.x));
  en.y = Math.max(WALL_THICKNESS + en.radius, Math.min(ARENA_HEIGHT - WALL_THICKNESS - en.radius, en.y));

  for (const ob of room.obstacles) {
    resolveCircleAABB(en, ob.x, ob.y, ob.size, ob.size);
  }
}

// ============================================================================
// 4. BOSS REWARDS & LOOT RESOLUTION
// ============================================================================

export interface BossDefeatRewards {
  coins: number;
  scrap: number;
  heartPickup: Pickup;
  lootPickup: Pickup;
  itemDropPickup: Pickup;
  modPedestalPickup: Pickup;
  trapdoor: boolean;
}

/**
 * Generates the full suite of guaranteed boss defeat rewards:
 * - 8 + floor * 2 Coins
 * - 7 + floor * 2 Scrap
 * - Guaranteed Jerry-can (+1 Fuel / Heart)
 * - Guaranteed Toolbox drop crate
 * - Guaranteed Equipment Loot item (genLoot(floor))
 * - Free In-Run Mod Pedestal (cost 0)
 * - Trapdoor to next floor
 */
export function generateBossDefeatRewards(
  boss: Boss,
  floor: number,
  rng: () => number = Math.random
): BossDefeatRewards {
  const coins = 8 + floor * 2;
  const scrap = 7 + floor * 2;
  const randomMod = RUN_MOD_POOL[Math.floor(rng() * RUN_MOD_POOL.length)];

  return {
    coins,
    scrap,
    heartPickup: {
      x: boss.x,
      y: boss.y,
      type: 'heart',
      radius: 13
    },
    lootPickup: {
      x: Math.max(WALL_THICKNESS + 40, Math.min(ARENA_WIDTH - WALL_THICKNESS - 40, boss.x + 70)),
      y: boss.y,
      type: 'loot',
      item: genLoot(floor),
      radius: 20
    },
    itemDropPickup: {
      x: boss.x,
      y: boss.y - 40,
      type: 'item_drop',
      itemId: 'nitro_syringe', // Will roll from DROP_ITEM_IDS in caller or defaults
      radius: 16
    },
    modPedestalPickup: {
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT / 2 + 65,
      type: 'mod_pedestal',
      mod: randomMod,
      cost: 0,
      radius: 22
    },
    trapdoor: true
  };
}

/**
 * Checks if a regular enemy should spawn as an elite variant on a given floor.
 */
export function rollEliteStatus(floor: number, rng: () => number = Math.random): boolean {
  const chance = getEliteSpawnChance(floor);
  return rng() < chance;
}
