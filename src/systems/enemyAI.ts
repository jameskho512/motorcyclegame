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
import { genLoot, rollRarity, type RarityTier } from '../data/equipment';
import { resolveCircleAABB } from './combat';

// ============================================================================
// 1. FLOOR & STAT SCALING FORMULAS
// ============================================================================

/**
 * Exponential difficulty scaling per floor.
 * Formula: 1.55^(floor - 1)
 */
export function getFloorScale(floor: number): number {
  const f = Math.max(1, floor);
  return Math.pow(1.55, f - 1);
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
 * Calculates scaled enemy movement speed (exponential per floor).
 * Formula: baseSpeed * 1.06^(floor - 1) * (isElite ? 1.15 : 1)
 */
export function calcEnemySpeed(baseSpeed: number, floor: number, isElite: boolean = false): number {
  const f = Math.max(1, floor);
  const spdScale = Math.pow(1.06, f - 1) * (isElite ? 1.15 : 1);
  return baseSpeed * spdScale;
}

/**
 * Calculates enemy bullet velocity scaling multiplier (exponential per floor).
 * Formula: 1.08^(floor - 1)
 */
export function calcEnemyProjSpeedScale(floor: number): number {
  const f = Math.max(1, floor);
  return Math.pow(1.08, f - 1);
}

/**
 * Calculates elite spawn probability for a floor (exponential per floor).
 * Formula: floor <= 1 ? 0 : min(0.45, 0.10 * 1.45^(floor - 2))
 */
export function getEliteSpawnChance(floor: number): number {
  const f = Math.max(1, floor);
  if (f <= 1) return 0;
  return Math.min(0.45, 0.10 * Math.pow(1.45, f - 2));
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

  if (isElite) {
    const affixes = ['volatile', 'overclocked', 'vampiric'] as const;
    (enemy as any).eliteAffix = affixes[(enemy.id + floor) % 3];
  }

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
  'OVERLORD HELION',
  'CRYO VALKYRIE',
  'INFERNO COLOSSUS',
  'OMEGA VALHALLA'
] as const;

export const BOSS_SUBTITLES: readonly string[] = [
  'THE RUSTYARD JUGGERNAUT',
  'HELLFIRE ARTILLERY RIG',
  'CYBER-PLASMA HOVERTANK',
  'SUB-ZERO JET INTERCEPTOR',
  'MOLTEN SMELTER CRAWLER',
  'THE CHROME APOCALYPSE'
] as const;

export const BOSS_COLORS: readonly string[] = [
  '#e63946',
  '#f77f00',
  '#9d4edd',
  '#00bbf9',
  '#ff5400',
  '#ffd166'
] as const;

export const BOSS_RADII: readonly number[] = [
  36,
  38,
  36,
  34,
  40,
  40
] as const;

/**
 * Creates a boss instance matching the floor variant formula: ((Math.max(1, floor) - 1) % 6).
 */
export function createBoss(
  floor: number,
  x: number,
  y: number,
  id: number = getNextEntityId()
): Boss {
  const scale = getFloorScale(floor);
  const bossVariant = ((Math.max(1, floor) - 1) % 6) as BossVariantId;
  const baseHp = Math.round(1120 * scale);

  return {
    id,
    type: 'boss',
    bossVariant,
    name: BOSS_NAMES[bossVariant],
    subtitle: BOSS_SUBTITLES[bossVariant],
    x,
    y,
    vx: 0,
    vy: 0,
    radius: BOSS_RADII[bossVariant],
    hp: baseHp,
    maxHp: baseHp,
    speed: Math.round(105 * Math.pow(1.06, Math.max(1, floor) - 1)),
    burnTimer: 0,
    burnTick: 0,
    aiTimer: 1.3,
    subTimer: 3.0,
    specialTimer: 0,
    dashVx: 0,
    dashVy: 0,
    phase: 1,
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
 * Updates a boss enemy's AI behavior, phase transitions, overdrive pulse escalation,
 * variant attacks, and arena boundary clamping.
 */
export function updateBossAI(ctx: AIContext): void {
  const {
    room,
    enemy: en,
    dt,
    player,
    projScale,
    enemyBullets,
    enemyBombs,
    rng = Math.random,
    floorNum = 1
  } = ctx;
  const boss = en as Boss;
  const dx = player.x - en.x;
  const dy = player.y - en.y;
  const dist = Math.hypot(dx, dy) || 1;
  en.angle = Math.atan2(dy, dx);

  const phaseTimer = ((boss as any).phaseTimer || 0) + dt;
  (boss as any).phaseTimer = phaseTimer;
  const isEnraged = boss.hp <= boss.maxHp * 0.5;
  boss.phase = isEnraged ? 2 : 1;
  (boss as any).enraged = isEnraged;

  // Handle dash / windup state machine for ramming / jet-strafing bosses
  if (boss.state === 'windup') {
    boss.specialTimer = (boss.specialTimer || 0) - dt;
    if (boss.specialTimer <= 0) {
      boss.state = 'dashing';
      boss.specialTimer = boss.bossVariant === 3 ? 0.45 : 0.55;
      const mult = boss.bossVariant === 3 ? 2.8 : 3.0;
      if (boss.bossVariant === 3) {
        // Tangential jet strafe
        const perpX = -dy / dist;
        const perpY = dx / dist;
        const dir = (Math.floor(phaseTimer * 2) % 2 === 0) ? 1 : -1;
        boss.dashVx = (perpX * dir * 0.8 + (dx / dist) * 0.4) * en.speed * mult;
        boss.dashVy = (perpY * dir * 0.8 + (dy / dist) * 0.4) * en.speed * mult;
      } else {
        boss.dashVx = (dx / dist) * en.speed * mult;
        boss.dashVy = (dy / dist) * en.speed * mult;
      }
      if (boss.phase === 2 && boss.bossVariant !== 3 && boss.bossVariant !== 4) {
        boss.dashVx *= 1.25;
        boss.dashVy *= 1.25;
      }
    }
  } else if (boss.state === 'dashing') {
    boss.specialTimer = (boss.specialTimer || 0) - dt;
    en.x += (boss.dashVx || 0) * dt;
    en.y += (boss.dashVy || 0) * dt;
    // Side shrapnel sparks while dashing for Scrap Goliath & Omega Valhalla
    if ((boss.bossVariant === 0 || boss.bossVariant === 5) && Math.floor((boss.specialTimer || 0) * 20) % 4 === 0) {
      const dashAng = Math.atan2(boss.dashVy || 0, boss.dashVx || 1);
      for (const side of [-1, 1]) {
        const sa = dashAng + side * (Math.PI * 0.55);
        enemyBullets.push({
          x: en.x,
          y: en.y,
          vx: Math.cos(sa) * 195 * projScale,
          vy: Math.sin(sa) * 195 * projScale,
          radius: 5.5,
          color: '#ff9f1c'
        });
      }
    }
    if (boss.specialTimer <= 0) {
      boss.state = 'idle';
    }
  } else {
    // Persistent advance in idle state (boosted by 1.18x when in Phase 2 Overdrive)
    const moveMult = isEnraged ? 1.18 : 1.0;
    en.x += (dx / dist) * en.speed * dt * moveMult;
    en.y += (dy / dist) * en.speed * dt * moveMult;
  }

  en.aiTimer -= dt;
  boss.subTimer -= dt;

  // Phase 2 Overdrive pulse timer & hazard escalation
  if (boss.phase === 2) {
    if ((boss as any).overdrivePulseTimer === undefined) {
      (boss as any).overdrivePulseTimer = 2.4;
    }
    (boss as any).overdrivePulseTimer -= dt;
    if ((boss as any).overdrivePulseTimer <= 0) {
      (boss as any).overdrivePulseTimer = 2.4;
      if (boss.bossVariant === 3 || boss.bossVariant === 4) {
        if (!room.hazards) room.hazards = [];
        room.hazards.push({
          x: en.x,
          y: en.y,
          radius: 46,
          life: 3.5,
          maxLife: 3.5
        });
      }
    }
  }

  // Primary Attack (aiTimer): Variant-specific signature + radial pressure
  if (en.aiTimer <= 0) {
    const baseAiCooldown = Math.max(0.75, 1.35 - floorNum * 0.08);
    en.aiTimer = isEnraged ? baseAiCooldown * 0.85 : baseAiCooldown;
    const count = 8 + Math.min(6, floorNum * 2);

    // Baseline radial nova (keeps classic bullet-hell density & test compatibility)
    for (let k = 0; k < count; k++) {
      const a = en.angle + (k * Math.PI * 2) / count + (boss.bossVariant === 1 ? phaseTimer * 0.9 : 0);
      enemyBullets.push({
        x: en.x,
        y: en.y,
        vx: Math.cos(a) * 230 * projScale,
        vy: Math.sin(a) * 230 * projScale,
        radius: 7,
        color: boss.bossVariant === 5 && k % 2 === 1 ? '#e63946' : en.color
      });
    }

    // Phase 2 extra projectiles: 4-bullet aimed fan if enabled
    if (isEnraged && (boss as any).enablePhase2ExtraProjectiles) {
      for (let s = -1.5; s <= 1.5; s += 1) {
        const sa = en.angle + s * 0.12;
        enemyBullets.push({
          x: en.x,
          y: en.y,
          vx: Math.cos(sa) * 260 * projScale,
          vy: Math.sin(sa) * 260 * projScale,
          radius: 6.5,
          color: '#ffd166'
        });
      }
    }

    // Variant-specific Primary Bonus
    if (boss.bossVariant === 0) {
      // Scrap Goliath: aimed heavy scatter shot
      for (let s = -1; s <= 1; s++) {
        const sa = en.angle + s * 0.18;
        enemyBullets.push({
          x: en.x,
          y: en.y,
          vx: Math.cos(sa) * 290 * projScale,
          vy: Math.sin(sa) * 290 * projScale,
          radius: 8,
          color: '#ff9f1c'
        });
      }
    } else if (boss.bossVariant === 1) {
      // Siege Behemoth: rotating gatling spiral burst
      for (let s = 0; s < 4; s++) {
        const sa = en.angle + phaseTimer * 2.2 + (s * Math.PI) / 2;
        enemyBullets.push({
          x: en.x,
          y: en.y,
          vx: Math.cos(sa) * 275 * projScale,
          vy: Math.sin(sa) * 275 * projScale,
          radius: 6.5,
          color: '#ffd166'
        });
      }
    } else if (boss.bossVariant === 2) {
      // Overlord Helion: 7-way cyber plasma fan
      for (let k = -3; k <= 3; k++) {
        const a = en.angle + k * 0.14;
        enemyBullets.push({
          x: en.x,
          y: en.y,
          vx: Math.cos(a) * 320 * projScale,
          vy: Math.sin(a) * 320 * projScale,
          radius: 6,
          color: '#00f5d4'
        });
      }
    } else if (boss.bossVariant === 3) {
      // Cryo Valkyrie: High-velocity 3-round piercing ice lance snipe
      for (let k = -1; k <= 1; k++) {
        const a = en.angle + k * 0.08;
        enemyBullets.push({
          x: en.x,
          y: en.y,
          vx: Math.cos(a) * 420 * projScale,
          vy: Math.sin(a) * 420 * projScale,
          radius: 6,
          color: '#90e0ef'
        });
      }
    } else if (boss.bossVariant === 4) {
      // Inferno Colossus: Twin flamethrower sweep + molten magma wake pool underneath itself
      for (let k = -2; k <= 2; k++) {
        const a = en.angle + k * 0.2;
        enemyBullets.push({
          x: en.x,
          y: en.y,
          vx: Math.cos(a) * 260 * projScale,
          vy: Math.sin(a) * 260 * projScale,
          radius: 8.5,
          color: '#ff9f1c'
        });
      }
      if (room.hazards.length < 10) {
        room.hazards.push({
          x: en.x,
          y: en.y,
          radius: 36,
          life: 4.0,
          maxLife: 4.0
        });
      }
    } else if (boss.bossVariant === 5) {
      // Omega Valhalla: 7-way cyan rail-fan volley
      for (let k = -3; k <= 3; k++) {
        const a = en.angle + k * 0.15;
        enemyBullets.push({
          x: en.x,
          y: en.y,
          vx: Math.cos(a) * 350 * projScale,
          vy: Math.sin(a) * 350 * projScale,
          radius: 6.5,
          color: '#00f5d4'
        });
      }
    }
  }

  // Secondary Attack (subTimer): every 2.8s (reduced by 15% in Phase 2 Overdrive)
  if (boss.subTimer <= 0) {
    boss.subTimer = isEnraged ? 2.8 * 0.85 : 2.8;
    if (boss.bossVariant === 0) {
      // Scrap Goliath: Bulldozer Ram Charge
      boss.state = 'windup';
      boss.specialTimer = 0.55;
    } else if (boss.bossVariant === 1) {
      // Siege Behemoth: Carpet Mortar Barrage (3 targeted mortar bombs around player)
      const offsets: [number, number][] = [[0, 0], [-55, 40], [55, -40]];
      for (const [ox, oy] of offsets) {
        const tx = Math.max(WALL_THICKNESS + 36, Math.min(ARENA_WIDTH - WALL_THICKNESS - 36, player.x + ox));
        const ty = Math.max(WALL_THICKNESS + 36, Math.min(ARENA_HEIGHT - WALL_THICKNESS - 36, player.y + oy));
        enemyBombs.push({
          x: en.x,
          y: en.y,
          startX: en.x,
          startY: en.y,
          targetX: tx,
          targetY: ty,
          t: 0,
          duration: 0.85
        });
      }
    } else if (boss.bossVariant === 2) {
      // Overlord Helion: Aimed 5-way spread burst + Phase Blink & Cyber-Drone Surge
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
      // Tangential phase blink
      const blinkAngle = en.angle + (rng() < 0.5 ? 1 : -1) * (Math.PI * 0.45);
      en.x = Math.max(
        WALL_THICKNESS + en.radius + 10,
        Math.min(ARENA_WIDTH - WALL_THICKNESS - en.radius - 10, en.x + Math.cos(blinkAngle) * 110)
      );
      en.y = Math.max(
        WALL_THICKNESS + en.radius + 10,
        Math.min(ARENA_HEIGHT - WALL_THICKNESS - en.radius - 10, en.y + Math.sin(blinkAngle) * 110)
      );
      if (room.enemies.length < 5) {
        room.enemies.push(createEnemy('mini_swarmer', en.x + 28, en.y - 28, floorNum, false, getNextEntityId(), rng));
      }
    } else if (boss.bossVariant === 3) {
      // Cryo Valkyrie: Diamond Jet Strafe & 12-shard Frost Nova
      boss.state = 'windup';
      boss.specialTimer = 0.35;
      for (let k = 0; k < 12; k++) {
        const a = (k * Math.PI * 2) / 12 + phaseTimer;
        enemyBullets.push({
          x: en.x,
          y: en.y,
          vx: Math.cos(a) * 255 * projScale,
          vy: Math.sin(a) * 255 * projScale,
          radius: 6,
          color: '#48cae4'
        });
      }
    } else if (boss.bossVariant === 4) {
      // Inferno Colossus: Pyroclastic Star Eruption (4 mortar bombs + 14-bullet magma ring)
      const crossOffsets: [number, number][] = [[65, 0], [-65, 0], [0, 65], [0, -65]];
      for (const [ox, oy] of crossOffsets) {
        const tx = Math.max(WALL_THICKNESS + 36, Math.min(ARENA_WIDTH - WALL_THICKNESS - 36, player.x + ox));
        const ty = Math.max(WALL_THICKNESS + 36, Math.min(ARENA_HEIGHT - WALL_THICKNESS - 36, player.y + oy));
        enemyBombs.push({
          x: en.x,
          y: en.y,
          startX: en.x,
          startY: en.y,
          targetX: tx,
          targetY: ty,
          t: 0,
          duration: 0.9
        });
      }
      for (let k = 0; k < 14; k++) {
        const a = (k * Math.PI * 2) / 14;
        enemyBullets.push({
          x: en.x,
          y: en.y,
          vx: Math.cos(a) * 215 * projScale,
          vy: Math.sin(a) * 215 * projScale,
          radius: 7.5,
          color: '#ffd166'
        });
      }
    } else if (boss.bossVariant === 5) {
      // Omega Valhalla: Charger Ram + Twin Mortar Bombs + 16-bullet Apocalypse Nova
      boss.state = 'windup';
      boss.specialTimer = 0.5;
      for (const [ox, oy] of [[-40, -40], [40, 40]] as [number, number][]) {
        const tx = Math.max(WALL_THICKNESS + 36, Math.min(ARENA_WIDTH - WALL_THICKNESS - 36, player.x + ox));
        const ty = Math.max(WALL_THICKNESS + 36, Math.min(ARENA_HEIGHT - WALL_THICKNESS - 36, player.y + oy));
        enemyBombs.push({
          x: en.x,
          y: en.y,
          startX: en.x,
          startY: en.y,
          targetX: tx,
          targetY: ty,
          t: 0,
          duration: 0.85
        });
      }
      for (let k = 0; k < 16; k++) {
        const a = (k * Math.PI * 2) / 16;
        enemyBullets.push({
          x: en.x,
          y: en.y,
          vx: Math.cos(a) * 265 * projScale,
          vy: Math.sin(a) * 265 * projScale,
          radius: 7,
          color: k % 2 === 0 ? '#ffd166' : '#00f5d4'
        });
      }
    }
  }

  // Clamping for direct updateBossAI invocations
  en.x = Math.max(WALL_THICKNESS + en.radius, Math.min(ARENA_WIDTH - WALL_THICKNESS - en.radius, en.x));
  en.y = Math.max(WALL_THICKNESS + en.radius, Math.min(ARENA_HEIGHT - WALL_THICKNESS - en.radius, en.y));
}

/**
 * Updates an individual enemy's state machine, movement vector, aiming angle,
 * projectile firing cooldowns, and hazard creation.
 */
export function updateEnemyAI(ctx: AIContext): void {
  const {
    room,
    enemy: en,
    dt,
    player,
    projScale,
    enemyBullets,
    enemyBombs,
    rng = Math.random
  } = ctx;
  const dx = player.x - en.x;
  const dy = player.y - en.y;
  const dist = Math.hypot(dx, dy) || 1;
  const targetAngle = Math.atan2(dy, dx);

  if (
    en.type === 'turret' ||
    en.type === 'sniper' ||
    en.type === 'brute' ||
    en.type === 'trishot' ||
    en.type === 'bomber' ||
    en.type === 'pyro'
  ) {
    if (en.aiTimer > 0.16) {
      (en as any).aimLockAngle = targetAngle;
      en.angle = targetAngle;
    } else if (en.aiTimer > 0 && (en as any).aimLockAngle !== undefined) {
      en.angle = (en as any).aimLockAngle;
    } else {
      en.angle = targetAngle;
    }
  } else {
    en.angle = targetAngle;
  }

  if (en.isElite && (en as any).eliteAffix === 'overclocked' && en.aiTimer > 0.35) {
    en.aiTimer -= dt * 0.15;
  }

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
      updateBossAI(ctx);
      break;
    }
  }

  // Expose Pre-Fire Telegraph timer (final 0.30s before firing) for ranged enemies
  if (
    en.type === 'turret' ||
    en.type === 'trishot' ||
    en.type === 'bomber' ||
    en.type === 'brute' ||
    en.type === 'sniper' ||
    en.type === 'pyro'
  ) {
    (en as any).telegraphTimer = en.aiTimer > 0 && en.aiTimer <= 0.30 ? en.aiTimer : 0;
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
      item: genLoot(
        floor,
        floor >= 2 ? (Math.max(1, rollRarity(floor + 1, rng)) as RarityTier) : undefined,
        rng
      ),
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
