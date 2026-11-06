/**
 * Unit Tests for Enemy AI & Boss Systems (`src/systems/enemyAI.ts`)
 *
 * Verifies:
 * - Non-linear floor scaling formula getFloorScale(floor)
 * - HP, speed, and enemy bullet speed scaling (including 1.65x HP & 1.15x speed for elites)
 * - Charger 3-state machine transitions (idle -> windup -> dashing -> idle)
 * - Splitter death split into 2 mini_swarmers
 * - All 10 enemy AI behaviors (Swarmer, Turret, Charger, Trishot, Bomber, Brute, Splitter, Mini Swarmer, Sniper, Pyro)
 * - All 3 Road-Raging Boss variants (Scrap Goliath, Siege Behemoth, Overlord Helion)
 * - Boss minion spawning (floor 1 swarmer, floor 2+ trishot)
 * - Boss defeat reward drop tables (Coins, Scrap, Heart, Equipment loot, Mod pedestal, Trapdoor)
 */

import { describe, it, expect } from 'vitest';
import {
  getFloorScale,
  calcEnemyHp,
  calcEnemySpeed,
  calcEnemyProjSpeedScale,
  getEliteSpawnChance,
  createEnemy,
  createBoss,
  spawnBossMinions,
  updateEnemyAI,
  generateBossDefeatRewards,
  BOSS_COLORS,
  BOSS_NAMES,
  getEliteAffixTacticalInfo,
  type EliteAffix,
  type EliteAffixTacticalInfo
} from '../../src/systems/enemyAI';
import { handleEnemyDeath, createCombatState } from '../../src/systems/combat';
import type {
  Room,
  PlayerState,
  EnemyBullet,
  EnemyBomb
} from '../../src/types/game';

function createMockRoom(overrides: Partial<Room> = {}): Room {
  return {
    x: 0,
    y: 0,
    type: 'combat',
    cleared: false,
    visited: true,
    doors: { N: true, S: true, E: true, W: true },
    obstacles: [],
    enemies: [],
    pickups: [],
    hazards: [],
    skids: [],
    trapdoor: false,
    ...overrides
  };
}

function createMockPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    x: 360,
    y: 360,
    vx: 0,
    vy: 0,
    radius: 17,
    bikeAngle: 0,
    aimAngle: 0,
    baseSpeed: 265,
    hp: 6,
    maxHp: 6,
    coins: 0,
    invuln: 0,
    weapon: 'pistol',
    runWeapons: {},
    fireTimer: 0,
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
    nos: 100,
    nosMax: 100,
    nosLock: false,
    nosDelay: 0,
    ...overrides
  };
}

describe('Systems: EnemyAI — Floor Scaling Curves', () => {
  it('computes exponential floor scaling curves correctly across floors 1 to 10', () => {
    // Floor 1: 1.55^0 = 1.0
    expect(getFloorScale(1)).toBe(1.0);

    // Floor 2: 1.55^1 = 1.55
    expect(getFloorScale(2)).toBeCloseTo(1.55, 5);

    // Floor 3: 1.55^2 = 2.4025
    const expectedFloor3 = Math.pow(1.55, 2);
    expect(getFloorScale(3)).toBeCloseTo(expectedFloor3, 5);

    // Scaling is strictly exponential (accelerating marginal increments)
    for (let f = 1; f < 10; f++) {
      const deltaCurr = getFloorScale(f + 1) - getFloorScale(f);
      const deltaNext = getFloorScale(f + 2) - getFloorScale(f + 1);
      expect(deltaCurr).toBeGreaterThan(0);
      expect(deltaNext).toBeGreaterThan(deltaCurr);
      expect(getFloorScale(f + 1) / getFloorScale(f)).toBeCloseTo(1.55, 5);
    }
  });

  it('scales enemy HP with floor and elite 1.65x multiplier', () => {
    const baseHp = 100;
    // Floor 1 regular -> 100
    expect(calcEnemyHp(baseHp, 1, false)).toBe(100);

    // Floor 1 elite -> 165
    expect(calcEnemyHp(baseHp, 1, true)).toBe(165);

    // Floor 2 regular -> round(100 * 1.55) = 155
    expect(calcEnemyHp(baseHp, 2, false)).toBe(155);

    // Floor 2 elite -> round(100 * getFloorScale(2) * 1.65)
    expect(calcEnemyHp(baseHp, 2, true)).toBe(Math.round(baseHp * getFloorScale(2) * 1.65));
  });

  it('scales enemy speed exponentially with floor and elite 1.15x multiplier', () => {
    const baseSpeed = 100;
    // Floor 1 regular -> 100
    expect(calcEnemySpeed(baseSpeed, 1, false)).toBe(100);

    // Floor 1 elite -> 115
    expect(calcEnemySpeed(baseSpeed, 1, true)).toBeCloseTo(115, 5);

    // Floor 3 regular -> 100 * 1.06^2
    expect(calcEnemySpeed(baseSpeed, 3, false)).toBeCloseTo(100 * Math.pow(1.06, 2), 5);

    // Floor 3 elite -> 100 * 1.06^2 * 1.15
    expect(calcEnemySpeed(baseSpeed, 3, true)).toBeCloseTo(100 * Math.pow(1.06, 2) * 1.15, 5);
  });

  it('scales enemy bullet projectile speed exponentially', () => {
    expect(calcEnemyProjSpeedScale(1)).toBe(1.0);
    expect(calcEnemyProjSpeedScale(2)).toBeCloseTo(1.08, 5);
    expect(calcEnemyProjSpeedScale(5)).toBeCloseTo(Math.pow(1.08, 4), 5);
  });

  it('computes elite spawn chance exponentially starting at floor 2 and capping at 45%', () => {
    expect(getEliteSpawnChance(1)).toBe(0);
    expect(getEliteSpawnChance(2)).toBeCloseTo(0.10, 5);
    expect(getEliteSpawnChance(4)).toBeCloseTo(0.10 * Math.pow(1.45, 2), 5);
    expect(getEliteSpawnChance(10)).toBe(0.45); // capped at 0.45
  });
});

describe('Systems: EnemyAI — Charger State Machine Transitions', () => {
  it('progresses through idle -> windup -> dashing -> idle states with correct timings and speeds', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 450, y: 360 }); // 90px away (<340px)
    const charger = createEnemy('charger', 360, 360, 1, false);
    const bullets: EnemyBullet[] = [];
    const bombs: EnemyBomb[] = [];

    // State 1: IDLE
    charger.state = 'idle';
    charger.aiTimer = 0; // ready to windup

    // Update frame -> triggers windup
    updateEnemyAI({
      room,
      enemy: charger,
      dt: 0.016,
      player,
      projScale: 1,
      enemyBullets: bullets,
      enemyBombs: bombs
    });

    expect(charger.state).toBe('windup');
    expect(charger.aiTimer).toBe(0.45); // 0.45s telegraph

    // State 2: WINDUP (stationary telegraph)
    const posXBefore = charger.x;
    updateEnemyAI({
      room,
      enemy: charger,
      dt: 0.20,
      player,
      projScale: 1,
      enemyBullets: bullets,
      enemyBombs: bombs
    });
    expect(charger.state).toBe('windup');
    expect(charger.x).toBe(posXBefore); // stays stationary during windup

    // Windup finishes -> transitions to DASHING
    updateEnemyAI({
      room,
      enemy: charger,
      dt: 0.30,
      player,
      projScale: 1,
      enemyBullets: bullets,
      enemyBombs: bombs
    });
    expect(charger.state).toBe('dashing');
    expect(charger.aiTimer).toBeCloseTo(0.42, 2); // 0.42s dash duration
    // dash velocity = speed * 2.75 in +X direction
    expect(charger.dashVx).toBeCloseTo(charger.speed * 2.75, 1);

    // State 3: DASHING
    updateEnemyAI({
      room,
      enemy: charger,
      dt: 0.20,
      player,
      projScale: 1,
      enemyBullets: bullets,
      enemyBombs: bombs
    });
    expect(charger.state).toBe('dashing');
    expect(charger.x).toBeGreaterThan(posXBefore);

    // Dash completes -> transitions back to IDLE with 1.1s recovery
    updateEnemyAI({
      room,
      enemy: charger,
      dt: 0.25,
      player,
      projScale: 1,
      enemyBullets: bullets,
      enemyBombs: bombs
    });
    expect(charger.state).toBe('idle');
    expect(charger.aiTimer).toBe(1.1);
  });
});

describe('Systems: EnemyAI — Splitter Death Split', () => {
  it('spawns 2 mini_swarmers at x - 14 and x + 14 on death', () => {
    const room = createMockRoom();
    const player = createMockPlayer();
    const state = createCombatState();
    const splitter = createEnemy('splitter', 360, 360, 2, false);
    room.enemies = [splitter];

    handleEnemyDeath({
      room,
      enemy: splitter,
      index: 0,
      player,
      state,
      floorNum: 2
    });

    // Original splitter removed
    expect(room.enemies).not.toContain(splitter);
    // Two mini_swarmers spawned
    expect(room.enemies).toHaveLength(2);
    expect(room.enemies[0].type).toBe('mini_swarmer');
    expect(room.enemies[1].type).toBe('mini_swarmer');
    expect(room.enemies[0].x).toBe(360 - 14);
    expect(room.enemies[1].x).toBe(360 + 14);
  });
});

describe('Systems: EnemyAI — All 10 Enemy Behaviors', () => {
  it('swarmer advances with sinusoidal perpendicular wave', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 360, y: 500 }); // strictly South
    const swarmer = createEnemy('swarmer', 360, 360, 1, false);
    swarmer.zigPhase = 0;

    updateEnemyAI({
      room,
      enemy: swarmer,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: [],
      enemyBombs: []
    });

    expect(swarmer.y).toBeGreaterThan(360); // moved South toward player
    expect(swarmer.zigPhase).toBeCloseTo(0.6, 5); // 0 + 0.1 * 6 = 0.6
  });

  it('turret stays stationary and fires aimed bullet every 1.35s', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 500, y: 360 }); // East
    const turret = createEnemy('turret', 360, 360, 1, false);
    turret.aiTimer = 0.05;
    const bullets: EnemyBullet[] = [];

    updateEnemyAI({
      room,
      enemy: turret,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: bullets,
      enemyBombs: []
    });

    expect(turret.x).toBe(360); // stationary
    expect(turret.y).toBe(360);
    expect(turret.aiTimer).toBe(1.35); // timer reset
    expect(bullets).toHaveLength(1);
    expect(bullets[0].color).toBe('#9b5de5');
    expect(bullets[0].vx).toBeCloseTo(245, 1);
  });

  it('trishot strafes tangentially and fires 3-bullet fan spread every 1.55s', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 360, y: 360 });
    const trishot = createEnemy('trishot', 360, 180, 2, false); // 180px North (between 140 and 230)
    trishot.aiTimer = 0.05;
    const bullets: EnemyBullet[] = [];

    updateEnemyAI({
      room,
      enemy: trishot,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: bullets,
      enemyBombs: []
    });

    expect(trishot.aiTimer).toBe(1.55);
    expect(bullets).toHaveLength(3); // 3-bullet fan
    expect(bullets[0].color).toBe('#00f5d4');
  });

  it('bomber kites away from close player and lobs mortar bomb every 2.2s', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 360, y: 360 });
    const bomber = createEnemy('bomber', 360, 460, 2, false); // 100px away (<190px)
    bomber.aiTimer = 0.05;
    const bombs: EnemyBomb[] = [];

    updateEnemyAI({
      room,
      enemy: bomber,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: [],
      enemyBombs: bombs
    });

    // Distance was 100px (<190px), so moveDir is -0.7 -> retreats further South (Y increases)
    expect(bomber.y).toBeGreaterThan(460);
    expect(bomber.aiTimer).toBe(2.2);
    expect(bombs).toHaveLength(1);
    expect(bombs[0].duration).toBe(0.95);
  });

  it('brute fires heavy cannon slug every 1.75s', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 500, y: 360 });
    const brute = createEnemy('brute', 360, 360, 2, false);
    brute.aiTimer = 0.05;
    const bullets: EnemyBullet[] = [];

    updateEnemyAI({
      room,
      enemy: brute,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: bullets,
      enemyBombs: []
    });

    expect(brute.aiTimer).toBe(1.75);
    expect(bullets).toHaveLength(1);
    expect(bullets[0].radius).toBe(9); // heavy cannon slug
    expect(bullets[0].color).toBe('#ff9f1c');
  });

  it('sniper fires high-velocity precision slug every 1.9s', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 500, y: 360 });
    const sniper = createEnemy('sniper', 360, 360, 3, false);
    sniper.aiTimer = 0.05;
    const bullets: EnemyBullet[] = [];

    updateEnemyAI({
      room,
      enemy: sniper,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: bullets,
      enemyBombs: []
    });

    expect(sniper.aiTimer).toBe(1.9);
    expect(bullets).toHaveLength(1);
    expect(bullets[0].radius).toBe(5);
    expect(bullets[0].vx).toBeCloseTo(410, 1);
  });

  it('pyro fires 6-bullet circular nova ring every 1.65s', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 360, y: 500 });
    const pyro = createEnemy('pyro', 360, 360, 3, false);
    pyro.aiTimer = 0.05;
    const bullets: EnemyBullet[] = [];

    updateEnemyAI({
      room,
      enemy: pyro,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: bullets,
      enemyBombs: []
    });

    expect(pyro.aiTimer).toBe(1.65);
    expect(bullets).toHaveLength(6); // 6-bullet circular nova
    expect(bullets[0].color).toBe('#ff5400');
  });

  it('sets telegraphTimer during the final 0.30s before firing on ranged enemies and resets to 0 otherwise', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 500, y: 360 });
    const rangedTypes = ['turret', 'trishot', 'bomber', 'brute', 'sniper', 'pyro'] as const;

    for (const type of rangedTypes) {
      const en = createEnemy(type, 360, 360, 3, false);
      en.aiTimer = 0.25;
      updateEnemyAI({
        room,
        enemy: en,
        dt: 0.05,
        player,
        projScale: 1,
        enemyBullets: [],
        enemyBombs: []
      });
      // aiTimer is now 0.20 (within (0, 0.30])
      expect((en as any).telegraphTimer).toBeCloseTo(0.20, 4);

      // When aiTimer > 0.30, telegraphTimer is 0
      en.aiTimer = 0.80;
      updateEnemyAI({
        room,
        enemy: en,
        dt: 0.05,
        player,
        projScale: 1,
        enemyBullets: [],
        enemyBombs: []
      });
      expect((en as any).telegraphTimer).toBe(0);
    }
  });

  it('locks aim angle during the final 0.16s window for turret, sniper, and brute when aimLockAngle was tracked', () => {
    const room = createMockRoom();
    const playerEast = createMockPlayer({ x: 500, y: 360 }); // angle = 0
    const playerSouth = createMockPlayer({ x: 360, y: 500 }); // angle = PI / 2

    for (const type of ['turret', 'sniper', 'brute'] as const) {
      const en = createEnemy(type, 360, 360, 3, false);
      en.aiTimer = 0.20; // > 0.16

      // Frame 1: aiTimer > 0.16 -> tracks playerEast (angle 0) and records aimLockAngle
      updateEnemyAI({
        room,
        enemy: en,
        dt: 0.06, // aiTimer becomes 0.14 (<= 0.16)
        player: playerEast,
        projScale: 1,
        enemyBullets: [],
        enemyBombs: []
      });
      expect((en as any).aimLockAngle).toBeCloseTo(0, 4);
      expect(en.angle).toBeCloseTo(0, 4);

      // Frame 2: player dodges South, but aiTimer is 0.14 (<= 0.16) -> angle stays locked at 0!
      const bullets: EnemyBullet[] = [];
      updateEnemyAI({
        room,
        enemy: en,
        dt: 0.15, // triggers shot
        player: playerSouth,
        projScale: 1,
        enemyBullets: bullets,
        enemyBombs: []
      });
      expect(en.angle).toBeCloseTo(0, 4);
      expect(bullets).toHaveLength(1);
      expect(bullets[0].vy).toBeCloseTo(0, 2);
      expect(bullets[0].vx).toBeGreaterThan(0);
    }
  });
});

describe('Systems: EnemyAI — The 3 Boss Variants', () => {
  it('creates the correct boss variant based on (floor - 1) % 3 formula', () => {
    // Floor 1: (0) % 6 = 0 -> SCRAP GOLIATH
    const boss1 = createBoss(1, 360, 360);
    expect(boss1.bossVariant).toBe(0);
    expect(boss1.name).toBe('SCRAP GOLIATH');
    expect(boss1.color).toBe(BOSS_COLORS[0]);
    expect(boss1.radius).toBe(36);
    expect(boss1.speed).toBe(98 + 1 * 7); // 105

    // Floor 2: (1) % 6 = 1 -> SIEGE BEHEMOTH
    const boss2 = createBoss(2, 360, 360);
    expect(boss2.bossVariant).toBe(1);
    expect(boss2.name).toBe('SIEGE BEHEMOTH');
    expect(boss2.color).toBe(BOSS_COLORS[1]);
    expect(boss2.speed).toBe(111);

    // Floor 3: (2) % 6 = 2 -> OVERLORD HELION
    const boss3 = createBoss(3, 360, 360);
    expect(boss3.bossVariant).toBe(2);
    expect(boss3.name).toBe('OVERLORD HELION');
    expect(boss3.color).toBe(BOSS_COLORS[2]);
    expect(boss3.speed).toBe(118);

    // Floor 4: (3) % 6 = 3 -> CRYO VALKYRIE
    const boss4 = createBoss(4, 360, 360);
    expect(boss4.bossVariant).toBe(3);
  });

  it('Variant 0 (Scrap Goliath) fires circular bullet novas on primary attack', () => {
    const room = createMockRoom();
    const player = createMockPlayer();
    const boss = createBoss(1, 360, 360);
    boss.aiTimer = 0.05;
    const bullets: EnemyBullet[] = [];
    const bombs: EnemyBomb[] = [];

    updateEnemyAI({
      room,
      enemy: boss,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: bullets,
      enemyBombs: bombs,
      floorNum: 1
    });

    // Floor 1 count: 10 radial nova + 3 aimed spread = 13 bullets
    expect(bullets).toHaveLength(13);
    for (const b of bullets) {
      expect(b.radius).toBeGreaterThanOrEqual(6.5);
    }
  });

  it('Variant 1 (Siege Behemoth) lobs heavy mortar bombs on secondary attack', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 420, y: 380 });
    const boss = createBoss(2, 360, 360); // Variant 1
    boss.aiTimer = 10; // disable primary
    boss.subTimer = 0.05; // trigger secondary
    const bullets: EnemyBullet[] = [];
    const bombs: EnemyBomb[] = [];

    updateEnemyAI({
      room,
      enemy: boss,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: bullets,
      enemyBombs: bombs,
      floorNum: 2
    });

    expect(boss.subTimer).toBe(2.8);
    expect(bombs).toHaveLength(3);
    expect(bombs[0].targetX).toBe(420);
    expect(bombs[0].targetY).toBe(380);
    expect(bombs[0].duration).toBe(0.85);
  });

  it('Variant 2 (Overlord Helion) fires aimed 5-way spread burst on secondary attack', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 500, y: 360 });
    const boss = createBoss(3, 360, 360); // Variant 2
    boss.aiTimer = 10; // disable primary
    boss.subTimer = 0.05; // trigger secondary
    const bullets: EnemyBullet[] = [];
    const bombs: EnemyBomb[] = [];

    updateEnemyAI({
      room,
      enemy: boss,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: bullets,
      enemyBombs: bombs,
      floorNum: 3
    });

    expect(boss.subTimer).toBe(2.8);
    expect(bullets).toHaveLength(5); // 5-way aimed spread
    for (const b of bullets) {
      expect(b.color).toBe('#00f5d4');
      expect(b.radius).toBe(6);
    }
  });

  it('spawns boss minions correctly based on floor (floor 1 swarmer, floor 2+ trishot)', () => {
    // Floor 1 -> 1 swarmer
    const minionsF1 = spawnBossMinions(1);
    expect(minionsF1).toHaveLength(1);
    expect(minionsF1[0].type).toBe('swarmer');

    // Floor 2 -> 2 trishots
    const minionsF2 = spawnBossMinions(2);
    expect(minionsF2).toHaveLength(2);
    expect(minionsF2[0].type).toBe('trishot');
    expect(minionsF2[1].type).toBe('trishot');

    // Floor 4 -> 4 trishots
    const minionsF4 = spawnBossMinions(4);
    expect(minionsF4).toHaveLength(4);

    // Floor 10 -> capped at 4 minions
    const minionsF10 = spawnBossMinions(10);
    expect(minionsF10).toHaveLength(4);
  });

  it('generates complete boss defeat rewards table', () => {
    const boss = createBoss(2, 360, 360);
    const rewards = generateBossDefeatRewards(boss, 2);

    // 8 + floor * 2 coins = 8 + 4 = 12
    expect(rewards.coins).toBe(12);
    // 7 + floor * 2 scrap = 7 + 4 = 11
    expect(rewards.scrap).toBe(11);
    // Guaranteed Jerry-can heart pickup
    expect(rewards.heartPickup.type).toBe('heart');
    // Guaranteed Equipment loot pickup
    expect(rewards.lootPickup.type).toBe('loot');
    // Guaranteed Item drop crate
    expect(rewards.itemDropPickup.type).toBe('item_drop');
    // Free Mod Pedestal (cost 0)
    expect(rewards.modPedestalPickup.type).toBe('mod_pedestal');
    // Trapdoor flag true
    expect(rewards.trapdoor).toBe(true);
  });

  it('activates Boss Phase-2 Overdrive Enrage (boss.phase === 2, 1.18x speed, 0.85x cooldowns) when hp <= 50%', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 600, y: 360 });
    const boss = createBoss(2, 360, 360); // Variant 1
    boss.aiTimer = 10;
    boss.subTimer = 10;

    // Phase 1: hp > 50%
    updateEnemyAI({
      room,
      enemy: boss,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: [],
      enemyBombs: [],
      floorNum: 2
    });
    expect(boss.phase).toBe(1);
    const phase1DeltaX = boss.x - 360;

    // Phase 2: hp <= 50%
    boss.x = 360;
    boss.y = 360;
    boss.hp = Math.floor(boss.maxHp * 0.5);
    boss.aiTimer = 0.02;
    boss.subTimer = 0.02;

    updateEnemyAI({
      room,
      enemy: boss,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: [],
      enemyBombs: [],
      floorNum: 2
    });

    expect(boss.phase).toBe(2);
    const phase2DeltaX = boss.x - 360;
    expect(phase2DeltaX / phase1DeltaX).toBeCloseTo(1.18, 2);

    // Cooldown recovery reduced by 15% (* 0.85)
    const expectedBasePrimary = Math.max(0.75, 1.35 - 2 * 0.08);
    expect(boss.aiTimer).toBeCloseTo(expectedBasePrimary * 0.85, 4);
    expect(boss.subTimer).toBeCloseTo(2.8 * 0.85, 4);
  });

  it('guarantees at least Magic/Rare equipment loot drop from Boss on floor >= 2', () => {
    const boss = createBoss(2, 360, 360);
    // Even with rng returning 0 (which would normally roll Common rarity 0), floor >= 2 guarantees >= 1 (Magic/Rare)
    const rewards = generateBossDefeatRewards(boss, 2, () => 0);
    expect(rewards.lootPickup.type).toBe('loot');
    if (rewards.lootPickup.type === 'loot') {
      expect(rewards.lootPickup.item.rarity).toBeGreaterThanOrEqual(1);
    }
  });

  it('decrements overdrivePulseTimer in Phase 2 and spawns 46px FloorHazard every 2.4s for Cryo Valkyrie and Inferno Colossus', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 500, y: 360 });

    // Cryo Valkyrie (Variant 3)
    const cryoBoss = createBoss(4, 360, 360); // Floor 4 -> variant 3
    cryoBoss.hp = Math.floor(cryoBoss.maxHp * 0.4); // Phase 2
    (cryoBoss as any).overdrivePulseTimer = 0.05;

    updateEnemyAI({
      room,
      enemy: cryoBoss,
      dt: 0.1, // triggers overdrive pulse
      player,
      projScale: 1,
      enemyBullets: [],
      enemyBombs: [],
      floorNum: 4
    });

    expect(cryoBoss.phase).toBe(2);
    expect((cryoBoss as any).overdrivePulseTimer).toBeCloseTo(2.4, 2);
    expect(room.hazards).toHaveLength(1);
    expect(room.hazards[0].radius).toBe(46);
    expect(room.hazards[0].life).toBe(3.5);
    expect(room.hazards[0].maxLife).toBe(3.5);
    expect(room.hazards[0].x).toBe(cryoBoss.x);
    expect(room.hazards[0].y).toBe(cryoBoss.y);

    // Inferno Colossus (Variant 4)
    const infernoBoss = createBoss(5, 360, 360); // Floor 5 -> variant 4
    infernoBoss.hp = Math.floor(infernoBoss.maxHp * 0.3); // Phase 2
    (infernoBoss as any).overdrivePulseTimer = 0.05;

    updateEnemyAI({
      room,
      enemy: infernoBoss,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: [],
      enemyBombs: [],
      floorNum: 5
    });

    expect(infernoBoss.phase).toBe(2);
    expect((infernoBoss as any).overdrivePulseTimer).toBeCloseTo(2.4, 2);
    expect(room.hazards).toHaveLength(2);
    expect(room.hazards[1].radius).toBe(46);
    expect(room.hazards[1].life).toBe(3.5);
  });

  it('boosts dash velocity by 1.25x in Phase 2 for non-hazard boss variants upon windup completion', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 500, y: 360 }); // strictly East

    // Scrap Goliath (Variant 0) in Phase 1
    const bossP1 = createBoss(1, 360, 360);
    bossP1.state = 'windup';
    bossP1.specialTimer = 0.05;

    updateEnemyAI({
      room,
      enemy: bossP1,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: [],
      enemyBombs: [],
      floorNum: 1
    });

    expect(bossP1.state).toBe('dashing');
    const phase1DashVx = bossP1.dashVx;

    // Scrap Goliath in Phase 2
    const bossP2 = createBoss(1, 360, 360);
    bossP2.hp = Math.floor(bossP2.maxHp * 0.4); // Phase 2
    bossP2.state = 'windup';
    bossP2.specialTimer = 0.05;

    updateEnemyAI({
      room,
      enemy: bossP2,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: [],
      enemyBombs: [],
      floorNum: 1
    });

    expect(bossP2.state).toBe('dashing');
    expect(bossP2.phase).toBe(2);
    expect(bossP2.dashVx).toBeCloseTo((phase1DashVx || 0) * 1.25, 1);
  });

  it('fires extra 4-bullet aimed fan in Phase 2 only when enablePhase2ExtraProjectiles is enabled', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 500, y: 360 });

    // Boss Phase 2 WITHOUT enablePhase2ExtraProjectiles flag
    const bossWithoutFlag = createBoss(1, 360, 360);
    bossWithoutFlag.hp = Math.floor(bossWithoutFlag.maxHp * 0.4);
    bossWithoutFlag.aiTimer = 0.05;
    const bullets1: EnemyBullet[] = [];

    updateEnemyAI({
      room,
      enemy: bossWithoutFlag,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: bullets1,
      enemyBombs: [],
      floorNum: 1
    });

    // 10 radial nova + 3 aimed scatter = 13 bullets
    expect(bullets1).toHaveLength(13);

    // Boss Phase 2 WITH enablePhase2ExtraProjectiles flag
    const bossWithFlag = createBoss(1, 360, 360);
    bossWithFlag.hp = Math.floor(bossWithFlag.maxHp * 0.4);
    bossWithFlag.aiTimer = 0.05;
    (bossWithFlag as any).enablePhase2ExtraProjectiles = true;
    const bullets2: EnemyBullet[] = [];

    updateEnemyAI({
      room,
      enemy: bossWithFlag,
      dt: 0.1,
      player,
      projScale: 1,
      enemyBullets: bullets2,
      enemyBombs: [],
      floorNum: 1
    });

    // 10 radial nova + 3 aimed scatter + 4 extra Phase-2 fan = 17 bullets
    expect(bullets2).toHaveLength(17);
  });
});

describe('Systems: EnemyAI — Elite Affixes & Overclocked Cycling', () => {
  it('assigns deterministic eliteAffix to elite enemies without consuming extra RNG calls', () => {
    let rngCallCount = 0;
    const countingRng = () => {
      rngCallCount++;
      return 0.5;
    };

    // Non-elite enemies do not have an eliteAffix
    const normalEnemy = createEnemy('turret', 100, 100, 1, false, 1000, countingRng);
    expect((normalEnemy as any).eliteAffix).toBeUndefined();
    const callsForNormal = rngCallCount;

    // Reset counter and create elite enemy
    rngCallCount = 0;
    const eliteEnemy = createEnemy('turret', 100, 100, 1, true, 1000, countingRng);
    expect(rngCallCount).toBe(callsForNormal); // Exactly 0 extra RNG calls!

    // Verify deterministic affix formula: affixes[(id + floor) % 3]
    // affixes = ['volatile', 'overclocked', 'vampiric']
    // (1000 + 1) % 3 = 2 -> 'vampiric'
    expect((eliteEnemy as any).eliteAffix).toBe('vampiric');

    const eliteVolatile = createEnemy('swarmer', 100, 100, 1, true, 1001, () => 0.5);
    // (1001 + 1) % 3 = 0 -> 'volatile'
    expect((eliteVolatile as any).eliteAffix).toBe('volatile');

    const eliteOverclocked = createEnemy('swarmer', 100, 100, 1, true, 1002, () => 0.5);
    // (1002 + 1) % 3 = 1 -> 'overclocked'
    expect((eliteOverclocked as any).eliteAffix).toBe('overclocked');

    const eliteVampiric = createEnemy('swarmer', 100, 100, 1, true, 1003, () => 0.5);
    // (1003 + 1) % 3 = 2 -> 'vampiric'
    expect((eliteVampiric as any).eliteAffix).toBe('vampiric');

    // Floor variation: floor 2
    const eliteFloor2 = createEnemy('swarmer', 100, 100, 2, true, 1001, () => 0.5);
    // (1001 + 2) % 3 = 1 -> 'overclocked'
    expect((eliteFloor2 as any).eliteAffix).toBe('overclocked');

    const eliteFloor2Volatile = createEnemy('swarmer', 100, 100, 2, true, 1003, () => 0.5);
    // (1003 + 2) % 3 = 0 -> 'volatile'
    expect((eliteFloor2Volatile as any).eliteAffix).toBe('volatile');
  });

  it('reduces aiTimer by extra dt * 0.15 for overclocked elites while aiTimer > 0.35', () => {
    const room = createMockRoom();
    const player = createMockPlayer({ x: 360, y: 360 });

    const overclockedTurret = createEnemy('turret', 100, 100, 1, true, 1002); // 1002 + 1 % 3 = 1 -> overclocked
    expect((overclockedTurret as any).eliteAffix).toBe('overclocked');
    overclockedTurret.aiTimer = 1.0;

    // Normal non-overclocked turret for comparison
    const volatileTurret = createEnemy('turret', 100, 100, 1, true, 1001); // 1001 + 1 % 3 = 0 -> volatile
    expect((volatileTurret as any).eliteAffix).toBe('volatile');
    volatileTurret.aiTimer = 1.0;

    const dt = 0.1;
    updateEnemyAI({
      room,
      enemy: volatileTurret,
      dt,
      player,
      projScale: 1,
      enemyBullets: [],
      enemyBombs: []
    });
    // volatileTurret should reduce only by dt: 1.0 - 0.1 = 0.9
    expect(volatileTurret.aiTimer).toBeCloseTo(0.9, 4);

    updateEnemyAI({
      room,
      enemy: overclockedTurret,
      dt,
      player,
      projScale: 1,
      enemyBullets: [],
      enemyBombs: []
    });
    // overclockedTurret should reduce by dt + dt * 0.15 = 0.115 -> 1.0 - 0.115 = 0.885
    expect(overclockedTurret.aiTimer).toBeCloseTo(0.885, 4);

    // When aiTimer <= 0.35, overclocked turret should NOT subtract the extra dt * 0.15
    overclockedTurret.aiTimer = 0.30;
    updateEnemyAI({
      room,
      enemy: overclockedTurret,
      dt: 0.05,
      player,
      projScale: 1,
      enemyBullets: [],
      enemyBombs: []
    });
    // Reduces only by dt: 0.30 - 0.05 = 0.25
    expect(overclockedTurret.aiTimer).toBeCloseTo(0.25, 4);
  });
});

describe('Systems: EnemyAI — Boss Phase-2 Enrage Across All 6 Floor Variants (Floors 1-6)', () => {
  it('verifies all 6 Boss variants (Floors 1 through 6) enter Phase-2 Enrage when hp <= maxHp * 0.5', () => {
    const expectedVariants = [
      { floor: 1, variant: 0, name: BOSS_NAMES[0] },
      { floor: 2, variant: 1, name: BOSS_NAMES[1] },
      { floor: 3, variant: 2, name: BOSS_NAMES[2] },
      { floor: 4, variant: 3, name: BOSS_NAMES[3] },
      { floor: 5, variant: 4, name: BOSS_NAMES[4] },
      { floor: 6, variant: 5, name: BOSS_NAMES[5] }
    ];

    for (const { floor, variant, name } of expectedVariants) {
      const room = createMockRoom();
      const player = createMockPlayer({ x: 500, y: 360 });
      const boss = createBoss(floor, 360, 360);

      expect(boss.bossVariant).toBe(variant);
      expect(boss.name).toBe(name);

      // Phase 1 check: hp > 50%
      boss.hp = Math.floor(boss.maxHp * 0.51);
      updateEnemyAI({
        room,
        enemy: boss,
        dt: 0.05,
        player,
        projScale: 1,
        enemyBullets: [],
        enemyBombs: [],
        floorNum: floor
      });
      expect(boss.phase).toBe(1);
      expect((boss as any).enraged).toBe(false);

      // Phase 2 check: hp exactly 50%
      boss.hp = Math.floor(boss.maxHp * 0.50);
      updateEnemyAI({
        room,
        enemy: boss,
        dt: 0.05,
        player,
        projScale: 1,
        enemyBullets: [],
        enemyBombs: [],
        floorNum: floor
      });
      expect(boss.phase).toBe(2);
      expect((boss as any).enraged).toBe(true);

      // Phase 2 check: hp well below 50% (e.g. 20%)
      boss.hp = Math.floor(boss.maxHp * 0.20);
      updateEnemyAI({
        room,
        enemy: boss,
        dt: 0.05,
        player,
        projScale: 1,
        enemyBullets: [],
        enemyBombs: [],
        floorNum: floor
      });
      expect(boss.phase).toBe(2);
      expect((boss as any).enraged).toBe(true);
    }
  });

  it('verifies overdrivePulseTimer decrements and resets to 2.4s, spawning floor hazards only on Floors 4 & 5', () => {
    for (let floor = 1; floor <= 6; floor++) {
      const room = createMockRoom();
      const player = createMockPlayer({ x: 500, y: 360 });
      const boss = createBoss(floor, 360, 360);
      boss.hp = Math.floor(boss.maxHp * 0.4); // Trigger Phase 2

      // Step 1: Initial frame initializes overdrivePulseTimer to 2.4 and subtracts dt
      updateEnemyAI({
        room,
        enemy: boss,
        dt: 0.1,
        player,
        projScale: 1,
        enemyBullets: [],
        enemyBombs: [],
        floorNum: floor
      });
      expect(boss.phase).toBe(2);
      expect((boss as any).overdrivePulseTimer).toBeCloseTo(2.3, 4);

      // Step 2: Trigger pulse timer reset
      (boss as any).overdrivePulseTimer = 0.05;
      updateEnemyAI({
        room,
        enemy: boss,
        dt: 0.1,
        player,
        projScale: 1,
        enemyBullets: [],
        enemyBombs: [],
        floorNum: floor
      });
      expect((boss as any).overdrivePulseTimer).toBeCloseTo(2.4, 4);

      // Verify hazard spawning behavior:
      // Floors 4 (Cryo Valkyrie) & 5 (Inferno Colossus) spawn 46px hazards on pulse reset
      // Floors 1, 2, 3, 6 do NOT spawn hazards on pulse reset
      const pulseHazards = room.hazards.filter(h => h.radius === 46 && h.life === 3.5);
      if (floor === 4 || floor === 5) {
        expect(pulseHazards.length).toBeGreaterThanOrEqual(1);
        expect(pulseHazards[0].maxLife).toBe(3.5);
      } else {
        expect(pulseHazards).toHaveLength(0);
      }
    }
  });

  it('verifies 1.25x dash velocity boost in Phase 2 for Floors 1, 2, 3, 6 (Variants 0, 1, 2, 5) but NOT Floors 4 & 5 (Variants 3 & 4)', () => {
    for (let floor = 1; floor <= 6; floor++) {
      const room = createMockRoom();
      const player = createMockPlayer({ x: 500, y: 360 });

      // Run windup -> dashing in Phase 1
      const bossP1 = createBoss(floor, 360, 360);
      bossP1.state = 'windup';
      bossP1.specialTimer = 0.05;

      updateEnemyAI({
        room,
        enemy: bossP1,
        dt: 0.1,
        player,
        projScale: 1,
        enemyBullets: [],
        enemyBombs: [],
        floorNum: floor
      });
      expect(bossP1.state).toBe('dashing');
      const p1Speed = Math.hypot(bossP1.dashVx || 0, bossP1.dashVy || 0);

      // Run windup -> dashing in Phase 2
      const bossP2 = createBoss(floor, 360, 360);
      bossP2.hp = Math.floor(bossP2.maxHp * 0.35); // Enraged Phase 2
      bossP2.state = 'windup';
      bossP2.specialTimer = 0.05;

      updateEnemyAI({
        room,
        enemy: bossP2,
        dt: 0.1,
        player,
        projScale: 1,
        enemyBullets: [],
        enemyBombs: [],
        floorNum: floor
      });
      expect(bossP2.state).toBe('dashing');
      expect(bossP2.phase).toBe(2);
      const p2Speed = Math.hypot(bossP2.dashVx || 0, bossP2.dashVy || 0);

      if (floor === 4 || floor === 5) {
        // Floors 4 (variant 3) and 5 (variant 4) are excluded from the 1.25x dash boost
        expect(p2Speed / p1Speed).toBeCloseTo(1.0, 2);
      } else {
        // Floors 1, 2, 3, 6 (variants 0, 1, 2, 5) receive the 1.25x dash velocity boost
        expect(p2Speed / p1Speed).toBeCloseTo(1.25, 2);
      }
    }
  });

  it('verifies enablePhase2ExtraProjectiles 4-bullet fan across all 6 Boss variants in Phase 2', () => {
    for (let floor = 1; floor <= 6; floor++) {
      const player = createMockPlayer({ x: 500, y: 360 });

      // Case A: Phase 2 WITHOUT enablePhase2ExtraProjectiles
      const roomA = createMockRoom();
      const bossA = createBoss(floor, 360, 360);
      bossA.hp = Math.floor(bossA.maxHp * 0.4); // Phase 2
      bossA.aiTimer = 0.05;
      const bulletsA: EnemyBullet[] = [];

      updateEnemyAI({
        room: roomA,
        enemy: bossA,
        dt: 0.1,
        player,
        projScale: 1,
        enemyBullets: bulletsA,
        enemyBombs: [],
        floorNum: floor
      });
      expect(bossA.phase).toBe(2);

      // Case B: Phase 2 WITH enablePhase2ExtraProjectiles
      const roomB = createMockRoom();
      const bossB = createBoss(floor, 360, 360);
      bossB.hp = Math.floor(bossB.maxHp * 0.4); // Phase 2
      bossB.aiTimer = 0.05;
      (bossB as any).enablePhase2ExtraProjectiles = true;
      const bulletsB: EnemyBullet[] = [];

      updateEnemyAI({
        room: roomB,
        enemy: bossB,
        dt: 0.1,
        player,
        projScale: 1,
        enemyBullets: bulletsB,
        enemyBombs: [],
        floorNum: floor
      });
      expect(bossB.phase).toBe(2);

      // Exactly 4 extra bullets fired
      expect(bulletsB.length - bulletsA.length).toBe(4);

      // Case C: Phase 1 WITH enablePhase2ExtraProjectiles -> should NOT fire extra bullets
      const roomC = createMockRoom();
      const bossC = createBoss(floor, 360, 360);
      bossC.hp = bossC.maxHp; // Phase 1
      bossC.aiTimer = 0.05;
      (bossC as any).enablePhase2ExtraProjectiles = true;
      const bulletsC: EnemyBullet[] = [];

      updateEnemyAI({
        room: roomC,
        enemy: bossC,
        dt: 0.1,
        player,
        projScale: 1,
        enemyBullets: bulletsC,
        enemyBombs: [],
        floorNum: floor
      });
      expect(bossC.phase).toBe(1);
      // In Phase 1 with flag, bullets equal Phase 2 without flag
      expect(bulletsC.length).toBe(bulletsA.length);

      // Verify the 4 extra projectiles have yellow/gold color (#ffd166), radius 6.5, and correct fan speed
      const phase2FanBullets = bulletsB.filter(b => {
        const speed = Math.hypot(b.vx, b.vy);
        return b.color === '#ffd166' && b.radius === 6.5 && Math.abs(speed - 260) < 1;
      });
      expect(phase2FanBullets).toHaveLength(4);
    }
  });
});

describe('Systems: EnemyAI — Elite Affix Tactical Intelligence (M59)', () => {
  it('returns null when affix is undefined, null, or empty', () => {
    expect(getEliteAffixTacticalInfo()).toBeNull();
    expect(getEliteAffixTacticalInfo(undefined)).toBeNull();
    expect(getEliteAffixTacticalInfo(null)).toBeNull();
    expect(getEliteAffixTacticalInfo('' as unknown as EliteAffix)).toBeNull();
    expect(getEliteAffixTacticalInfo('unknown_affix' as unknown as EliteAffix)).toBeNull();
  });

  it('returns correct tactical intelligence for volatile elite affix', () => {
    const info = getEliteAffixTacticalInfo('volatile');
    expect(info).not.toBeNull();
    expect(info).toEqual<EliteAffixTacticalInfo>({
      affix: 'volatile',
      label: '💥 VOLATILE ELITE',
      behaviorDesc: 'Unstable core charges toward target',
      deathPayoffDesc: 'Detonates on death, damaging nearby enemies',
      colorHex: '#ff5400'
    });
  });

  it('returns correct tactical intelligence for overclocked elite affix', () => {
    const info = getEliteAffixTacticalInfo('overclocked');
    expect(info).not.toBeNull();
    expect(info).toEqual<EliteAffixTacticalInfo>({
      affix: 'overclocked',
      label: '⚡ OVERCLOCKED ELITE',
      behaviorDesc: '+25% movement speed & +30% fire rate',
      deathPayoffDesc: 'Grants +20 NOS surge on elimination',
      colorHex: '#00f5d4'
    });
  });

  it('returns correct tactical intelligence for vampiric elite affix', () => {
    const info = getEliteAffixTacticalInfo('vampiric');
    expect(info).not.toBeNull();
    expect(info).toEqual<EliteAffixTacticalInfo>({
      affix: 'vampiric',
      label: '🩸 VAMPIRIC ELITE',
      behaviorDesc: 'Regenerates hull integrity while in combat',
      deathPayoffDesc: 'Siphons +1 Fuel Heart to player on kill',
      colorHex: '#ff1f4b'
    });
  });

  it('resolves tactical intelligence directly from spawned elite enemy affix', () => {
    const eliteEnemy = createEnemy('turret', 100, 100, 1, true, 1001); // 1001 + 1 % 3 = 0 -> 'volatile'
    const affix = (eliteEnemy as any).eliteAffix as EliteAffix;
    expect(affix).toBe('volatile');
    const info = getEliteAffixTacticalInfo(affix);
    expect(info).not.toBeNull();
    expect(info?.label).toContain('VOLATILE');
    expect(info?.colorHex).toBe('#ff5400');
  });
});


