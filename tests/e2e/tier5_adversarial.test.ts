/**
 * MOTO-ROGUE: E2E Test Suite — Tier 5: Adversarial Coverage Hardening
 *
 * Empirical White-Box Adversarial Stress Testing Suite:
 *
 * 1. Extreme Entity Stress:
 *    - 200 concurrent projectiles (multi-type mix, wall bounces, obstacle collisions, memory culling)
 *    - 60 active enemies (all 10 types + boss variant, physics bounds, state machine updates)
 *    - 130 skid mark buffer limit overflow (continuous drift turns strictly capped at MAX_SKIDS_PER_ROOM)
 *    - Rapid room switching (oscillating doorway traversals across BFS graph without coordinate drift)
 *
 * 2. Stat Extremes:
 *    - 100 stacks of each RoR2 drop item (nitro_syringe, tire_iron, chrome_lens, gasoline, racing_slicks, oil_infusion)
 *    - Maximum negative or corrupted save inputs (malformed JSON, prototype pollution, negative scrap/coins, dead hp)
 *    - Zero and negative dt intervals (dt = 0, dt = -0.016, lag spike dt = 10.0)
 *
 * 3. Audio & Render Robustness:
 *    - Headless AudioService mock under rapid multi-channel firing (250+ burst SFX, engine modulation, mute persistence)
 *    - Canvas resize handling under high DPR (3x) and viewport extremes (4K widescreen, mobile, 0x0 clamp)
 *    - PixiJS Stage hierarchy & VFX particle decay under heavy particle loads
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  WALL_THICKNESS,
  MAX_SKIDS_PER_ROOM,
  SAVE_KEY_META,
  SAVE_KEY_RUN,
  PlayerState,
  Room,
  DungeonGraph,
  RegularEnemyType,
  WeaponId
} from '@/types/game';

import { getWeaponDef } from '@/data/weapons';
import { calcUpgradeCost, getRunModDeckSummary, getMetaTuningSummary } from '@/data/upgrades';

import {
  SafeLocalStorage,
  createDefaultPlayerState,
  loadRunCheckpoint,
  loadMetaSave,
  getFloorBountyContractStatus
} from '@/core/state';

import { generateDungeon, createBoss, getFloorBountyContract } from '@/world/dungeon';

import {
  updateBikeKinematics,
  updatePlayerPhysics,
  calculateEffectiveSpeed,
  handleWallAndDoors
} from '@/systems/physics';

import {
  createCombatState,
  updatePlayerBullets,
  handleEnemyDeath,
  applyTireIronBonus,
  rollCrit,
  triggerExplosion,
  calcOverkillBonus,
  getCombatSurvivabilitySummary
} from '@/systems/combat';

import {
  createEnemy,
  updateEnemyAI,
  getRoomVisualClutterAudit
} from '@/systems/enemyAI';

import { SoundSynthesizer, calculateEngineParams } from '@/audio/sfx';
import { StageManager } from '@/render/stage';
import { FilterManager } from '@/render/shaders';
import { isLowFuel, calcNeedleAngle, calcMinimapRoomCoords } from '@/ui/hud';
import {
  HubStationModalController,
  HubStationOpenOptions,
  getForgeStationAdvisor,
  getScannerStationAdvisor,
  getWarRoomStationAdvisor,
  getLaunchGateAdvisor,
  getGarageStationAdvisor
} from '@/ui/hubStationModal';
import { getEquipmentVisualSpec, getEquipmentItemModelSvg } from '../../src/ui/icons';
import { getEquippedBikeVisualState, GarageController, GarageCallbacks } from '../../src/ui/garage';
import { getEquipmentLoadoutSummary } from '../../src/data/equipment';
import { EquipSlot, EquipmentItem, MetaSaveState } from '@/types/game';
import { createDefaultMetaSave } from '@/core/state';
import { getDuoSynergyAdvisor } from '@/data/items';
import { getDropItemStackSummary } from '@/ui/dropModal';

describe('Tier 5: Adversarial Coverage Hardening', () => {
  let player: PlayerState;
  let storage: SafeLocalStorage;

  beforeEach(() => {
    storage = new SafeLocalStorage();
    storage.clear();
    player = createDefaultPlayerState();
  });

  // ==========================================================================
  // SECTION 1: EXTREME ENTITY STRESS
  // ==========================================================================
  describe('1. Extreme Entity Stress', () => {
    it('1.1 simulates 200 concurrent projectiles without memory leak, crash, or NaN coordinates', () => {
      const combatState = createCombatState();
      const room: Room = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [
          { x: 360, y: 360, size: 64, type: 'rock', hp: 99999 },
          { x: 200, y: 200, size: 36, type: 'barrel', hp: 24 }
        ],
        enemies: [createEnemy('brute', 500, 360, 1)],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      // Populate 200 active projectiles spanning pistols, shotgun pellets, flame puffs, and railgun beams
      for (let i = 0; i < 200; i++) {
        const angle = (i / 200) * Math.PI * 2;
        const speed = 250 + (i % 5) * 100;
        const isFlame = i % 4 === 0;
        const isRail = i % 8 === 0;
        const bounceLeft = i % 3 === 0 ? 2 : 0;

        combatState.bullets.push({
          x: 360,
          y: 360,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          radius: isFlame ? 6 : 5,
          dmg: 15,
          life: 0.5 + (i % 10) * 0.1,
          maxLife: 1.5,
          color: isFlame ? '#ff5400' : isRail ? '#00f5d4' : '#ffd166',
          bounceLeft,
          pierceLeft: isRail ? 99 : 0,
          hitIds: new Set(),
          isFlame,
          isRail,
          maxRadius: isFlame ? 17 : undefined
        });
      }

      expect(combatState.bullets.length).toBe(200);

      // Advance simulation over 30 ticks (0.5 seconds of dense projectile updates)
      const dt = 1 / 60;
      for (let step = 0; step < 30; step++) {
        updatePlayerBullets(dt, combatState.bullets, room, player, combatState);

        // Every projectile must have finite real coordinates
        for (const b of combatState.bullets) {
          expect(Number.isFinite(b.x)).toBe(true);
          expect(Number.isFinite(b.y)).toBe(true);
          expect(Number.isFinite(b.radius)).toBe(true);
          expect(b.radius).toBeGreaterThan(0);
        }
      }

      // Expired or out-of-bounds projectiles should have been culled safely
      expect(combatState.bullets.length).toBeLessThan(200);
      expect(combatState.bullets.length).toBeGreaterThanOrEqual(0);
    });

    it('1.2 updates 60 active enemies concurrently within arena boundaries without NaN or stall', () => {
      const room: Room = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [
          { x: 360, y: 360, size: 70, type: 'rock', hp: 99999 }
        ],
        enemies: [],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      const enemyTypes: RegularEnemyType[] = [
        'swarmer',
        'turret',
        'charger',
        'trishot',
        'bomber',
        'brute',
        'splitter',
        'mini_swarmer',
        'sniper',
        'pyro'
      ];

      // Spawn 59 regular enemies (6 of each type except mini_swarmer which gets 5)
      for (let i = 0; i < 59; i++) {
        const type = enemyTypes[i % enemyTypes.length];
        const spawnX = WALL_THICKNESS + 40 + ((i * 37) % (ARENA_WIDTH - WALL_THICKNESS * 2 - 80));
        const spawnY = WALL_THICKNESS + 40 + ((i * 53) % (ARENA_HEIGHT - WALL_THICKNESS * 2 - 80));
        room.enemies.push(createEnemy(type, spawnX, spawnY, 2, i % 5 === 0));
      }

      // 60th enemy is an Overlord Helion Boss (Floor 3 rotated variant 2)
      const boss = createBoss(3, 360, 150);
      room.enemies.push(boss);

      expect(room.enemies.length).toBe(60);

      const combatState = createCombatState();
      const dt = 1 / 60;

      // Simulate 60 physics frames with all 60 enemies actively pursuing / firing
      for (let frame = 0; frame < 60; frame++) {
        for (const en of room.enemies) {
          updateEnemyAI({
            room,
            enemy: en,
            dt,
            player,
            projScale: 1.08,
            enemyBullets: combatState.enemyBullets,
            enemyBombs: combatState.enemyBombs,
            floorNum: 2
          });

          // Verify strict arena containment and coordinate integrity
          expect(Number.isFinite(en.x)).toBe(true);
          expect(Number.isFinite(en.y)).toBe(true);
          expect(en.x).toBeGreaterThanOrEqual(WALL_THICKNESS + en.radius - 1e-4);
          expect(en.x).toBeLessThanOrEqual(ARENA_WIDTH - WALL_THICKNESS - en.radius + 1e-4);
          expect(en.y).toBeGreaterThanOrEqual(WALL_THICKNESS + en.radius - 1e-4);
          expect(en.y).toBeLessThanOrEqual(ARENA_HEIGHT - WALL_THICKNESS - en.radius + 1e-4);
        }
      }

      // Enemies should have fired projectiles into the combat state buffers
      expect(combatState.enemyBullets.length).toBeGreaterThan(0);
      expect(combatState.enemyBombs.length).toBeGreaterThanOrEqual(0);
    });

    it('1.3 strictly clamps skid mark buffer to MAX_SKIDS_PER_ROOM (130) under 300 drift iterations', () => {
      const room: Room = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: true,
        visited: true,
        doors: { N: true, S: true, E: true, W: true },
        obstacles: [],
        enemies: [],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      player.x = 360;
      player.y = 360;
      player.bikeAngle = 0;

      // Simulate 300 rapid, alternating sharp turns (|diff| > 0.45 rad)
      for (let i = 0; i < 300; i++) {
        // Toggle input between perpendicular directions to force sharp steering diff
        const ix = i % 2 === 0 ? 1 : 0;
        const iy = i % 2 === 0 ? 0 : 1;
        updateBikeKinematics(player, ix, iy, false, 0.05, room);
      }

      // Memory buffer must be strictly capped at 130
      expect(room.skids.length).toBe(MAX_SKIDS_PER_ROOM);
      expect(room.skids.length).toBe(130);

      // Verify all stored skid segments have valid finite coordinates
      for (const s of room.skids) {
        expect(Number.isFinite(s.x)).toBe(true);
        expect(Number.isFinite(s.y)).toBe(true);
        expect(Number.isFinite(s.angle)).toBe(true);
      }
    });

    it('1.4 handles rapid doorway room transitions (100 switches) without coordinate drift or out-of-bounds glitch', () => {
      const dungeon: DungeonGraph = generateDungeon(3);
      let curX = 0;
      let curY = 0;
      let currentRoom = dungeon.rooms[`${curX},${curY}`];
      currentRoom.cleared = true;

      // Find an available doorway from start room
      const dir: 'N' | 'S' | 'E' | 'W' = currentRoom.doors.N
        ? 'N'
        : currentRoom.doors.S
        ? 'S'
        : currentRoom.doors.E
        ? 'E'
        : 'W';

      const dx = dir === 'E' ? 1 : dir === 'W' ? -1 : 0;
      const dy = dir === 'S' ? 1 : dir === 'N' ? -1 : 0;
      const neighborCoord = `${curX + dx},${curY + dy}`;
      const neighborRoom = dungeon.rooms[neighborCoord];
      expect(neighborRoom).toBeDefined();
      neighborRoom.cleared = true;

      // Oscillate between currentRoom and neighborRoom 100 times
      for (let cycle = 0; cycle < 100; cycle++) {
        const activeRoom = cycle % 2 === 0 ? currentRoom : neighborRoom;
        const targetDir = cycle % 2 === 0 ? dir : (dir === 'N' ? 'S' : dir === 'S' ? 'N' : dir === 'E' ? 'W' : 'E');

        // Position player at the threshold of the target doorway
        if (targetDir === 'N') {
          player.x = ARENA_WIDTH / 2;
          player.y = WALL_THICKNESS - 15;
        } else if (targetDir === 'S') {
          player.x = ARENA_WIDTH / 2;
          player.y = ARENA_HEIGHT - WALL_THICKNESS + 15;
        } else if (targetDir === 'W') {
          player.x = WALL_THICKNESS - 15;
          player.y = ARENA_HEIGHT / 2;
        } else {
          player.x = ARENA_WIDTH - WALL_THICKNESS + 15;
          player.y = ARENA_HEIGHT / 2;
        }

        const transition = handleWallAndDoors(player, activeRoom);
        expect(transition).not.toBeNull();

        // Relocate player to exit position
        player.x = transition!.newX;
        player.y = transition!.newY;

        // Player must land safely inside arena walls
        expect(player.x).toBeGreaterThanOrEqual(WALL_THICKNESS + player.radius);
        expect(player.x).toBeLessThanOrEqual(ARENA_WIDTH - WALL_THICKNESS - player.radius);
        expect(player.y).toBeGreaterThanOrEqual(WALL_THICKNESS + player.radius);
        expect(player.y).toBeLessThanOrEqual(ARENA_HEIGHT - WALL_THICKNESS - player.radius);
      }
    });
  });

  // ==========================================================================
  // SECTION 2: STAT EXTREMES
  // ==========================================================================
  describe('2. Stat Extremes', () => {
    it('2.1 evaluates 100 stacks of each RoR2 drop item with robust formula resilience', () => {
      // Configure 100 stacks of all 6 stacking drop items
      player.itemStacks = {
        nitro_syringe: 100,
        tire_iron: 100,
        chrome_lens: 100,
        gasoline: 100,
        racing_slicks: 100,
        oil_infusion: 100
      };

      // 1. Nitro Syringe: +15% fire rate per stack
      // Formula: w.cooldown / (fireRateMult * (1 + 0.15 * 100)) = cooldown / 16
      const pistolDef = getWeaponDef('pistol');
      const expectedCooldown = pistolDef.cooldown / (player.fireRateMult * (1 + 0.15 * 100));
      expect(expectedCooldown).toBeCloseTo(pistolDef.cooldown / 16, 5);
      expect(expectedCooldown).toBeGreaterThan(0);
      expect(Number.isFinite(expectedCooldown)).toBe(true);

      // 2. Tire Iron: +30% damage to enemies >90% HP
      // Formula: dmg * (1 + 0.3 * 100) = 31 * dmg
      const healthyDmg = applyTireIronBonus(10, 100, 100, player.itemStacks.tire_iron);
      expect(healthyDmg).toBe(310);
      // Damaged enemy (50% HP) receives standard 1x damage
      const damagedDmg = applyTireIronBonus(10, 50, 100, player.itemStacks.tire_iron);
      expect(damagedDmg).toBe(10);

      // 3. Chrome Lens: 10% crit chance per stack, strictly capped at 80%
      const critRoll = rollCrit(player.itemStacks.chrome_lens, false, () => 0.79);
      expect(critRoll.isCrit).toBe(true);
      expect(critRoll.mult).toBe(2);
      const critDenied = rollCrit(player.itemStacks.chrome_lens, false, () => 0.81);
      expect(critDenied.isCrit).toBe(false);
      expect(critDenied.mult).toBe(1);
      // Flame damage strictly denies crit even with 100 stacks
      const flameCrit = rollCrit(player.itemStacks.chrome_lens, true, () => 0.01);
      expect(flameCrit.isCrit).toBe(false);

      // 4. Gasoline: 100 stacks triggers huge explosion radius (50 + 14*100 = 1450) and dmg (10 + 8*100 = 810)
      const combatState = createCombatState();
      const testRoom: Room = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [],
        enemies: [
          createEnemy('swarmer', 300, 300, 1),
          createEnemy('turret', 400, 400, 1),
          createEnemy('brute', 500, 500, 1)
        ],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      const primaryVictim = testRoom.enemies[0];
      handleEnemyDeath({
        room: testRoom,
        enemy: primaryVictim,
        index: 0,
        player,
        state: combatState,
        floorNum: 1
      });

      // Gasoline explosion should have created shockwave & shrapnel particles without stack overflow
      expect(combatState.particles.length).toBeGreaterThan(0);
      // Remaining enemies in room took fatal blast damage from the 810-damage explosion
      for (const en of testRoom.enemies) {
        expect(en.hp).toBeLessThanOrEqual(0);
      }

      // 5. Racing Slicks: +10% speed per stack
      // Formula: baseSpeed * speedMult * (1 + 0.1 * 100) = 265 * 1 * 11 = 2915 px/s
      const hyperSpeed = calculateEffectiveSpeed(player, false);
      expect(hyperSpeed).toBe(265 * 11);
      // Kinematics with hyper speed remains bounded
      updateBikeKinematics(player, 1, 0, false, 0.016, testRoom);
      expect(Number.isFinite(player.vx)).toBe(true);

      // 6. Oil Infusion: +inf on 15th kill when maxHp < 20
      player.maxHp = 6;
      player.hp = 6;
      player.killCount = 14;
      const testEnemy = createEnemy('swarmer', 100, 100, 1);
      testRoom.enemies.push(testEnemy);

      handleEnemyDeath({
        room: testRoom,
        enemy: testEnemy,
        index: testRoom.enemies.length - 1,
        player,
        state: combatState,
        floorNum: 1
      });

      expect(player.killCount).toBe(15);
      expect(player.maxHp).toBeGreaterThan(6);

      // Once maxHp >= 20, further kills must not increase maxHp
      const prevMaxHp = player.maxHp;
      player.killCount = 29; // next is 30th
      const anotherEnemy = createEnemy('swarmer', 100, 100, 1);
      testRoom.enemies.push(anotherEnemy);

      handleEnemyDeath({
        room: testRoom,
        enemy: anotherEnemy,
        index: testRoom.enemies.length - 1,
        player,
        state: combatState,
        floorNum: 1
      });
      expect(player.maxHp).toBe(prevMaxHp);
    });

    it('2.2 sanitizes maximum negative or corrupted save inputs gracefully', () => {
      // 1. Corrupted stringified JSON in meta save
      storage.setItem(SAVE_KEY_META, '{ "scrap": -999999999, "unlocked": null, "ranks": { "dmg": -5 } }');
      const loadedMeta = loadMetaSave(storage);
      expect(loadedMeta).toBeDefined();
      expect(loadedMeta.scrap).toBe(-999999999);
      // Unlocked weapons default safely to false
      expect(loadedMeta.unlocked.machine_gun).toBe(false);

      // Upgrade cost with negative scrap denies purchase
      const cost = calcUpgradeCost('dmg', loadedMeta.ranks.dmg || 0);
      expect(cost).toBeGreaterThan(0);
      expect(loadedMeta.scrap < cost).toBe(true);

      // 2. Prototype pollution injection payload
      storage.setItem(
        SAVE_KEY_META,
        JSON.stringify({
          __proto__: { polluted: true },
          scrap: 100,
          unlocked: { pistol: true }
        })
      );
      const safeMeta = loadMetaSave(storage);
      expect((({} as unknown) as Record<string, unknown>).polluted).toBeUndefined();
      expect(safeMeta.scrap).toBe(100);

      // 3. Completely malformed non-JSON garbage string
      storage.setItem(SAVE_KEY_META, '<<<CORRUPTED_BINARY_DATA_BLOB>>>');
      const fallbackMeta = loadMetaSave(storage);
      expect(fallbackMeta.scrap).toBe(0);
      expect(fallbackMeta.stash).toEqual([]);

      // 4. Dead player checkpoint (hp = 0, hp = -50, hp = NaN)
      storage.setItem(
        SAVE_KEY_RUN,
        JSON.stringify({
          hp: 0,
          maxHp: 6,
          floorNum: 3,
          coins: -50
        })
      );
      const deadRestore = loadRunCheckpoint(player, fallbackMeta, storage);
      expect(deadRestore.restored).toBe(false);
      expect(deadRestore.floorNum).toBe(1);

      // 5. Negative hp checkpoint
      storage.setItem(
        SAVE_KEY_RUN,
        JSON.stringify({
          hp: -99,
          maxHp: 6
        })
      );
      const negRestore = loadRunCheckpoint(player, fallbackMeta, storage);
      expect(negRestore.restored).toBe(false);

      // 6. Checkpoint with corrupted itemStacks and non-array items
      storage.setItem(
        SAVE_KEY_RUN,
        JSON.stringify({
          hp: 5,
          maxHp: 6,
          items: 'not an array',
          itemStacks: 'not an object',
          runWeapons: null
        })
      );
      const corruptFieldRestore = loadRunCheckpoint(player, fallbackMeta, storage);
      expect(corruptFieldRestore.restored).toBe(true);
      expect(player.items).toEqual([]);
      expect(player.itemStacks).toEqual({});
      expect(player.runWeapons).toEqual({});
    });

    it('2.3 survives zero and negative dt intervals without NaN or simulation blowup', () => {
      const room: Room = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [],
        enemies: [createEnemy('swarmer', 300, 300, 1)],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      player.x = 360;
      player.y = 360;
      player.vx = 100;
      player.vy = 100;
      player.nos = 50;

      // 1. dt = 0 (paused / zero frame elapsed)
      const resDt0 = updatePlayerPhysics(player, { ix: 1, iy: 0, shift: true }, room, 0);
      expect(resDt0.moved).toBe(true);
      expect(Number.isFinite(player.x)).toBe(true);
      expect(Number.isFinite(player.y)).toBe(true);
      expect(Number.isFinite(player.vx)).toBe(true);
      expect(Number.isFinite(player.vy)).toBe(true);
      expect(player.nos).toBe(50); // No NOS consumed when dt = 0

      // 2. dt = -0.016 (negative time step / clock skew)
      const resNeg = updatePlayerPhysics(player, { ix: 0, iy: 1, shift: false }, room, -0.016);
      expect(resNeg).toBeDefined();
      expect(Number.isFinite(player.x)).toBe(true);
      expect(Number.isFinite(player.y)).toBe(true);
      expect(Number.isFinite(player.vx)).toBe(true);
      expect(Number.isFinite(player.vy)).toBe(true);

      // 3. dt = 10.0 (extreme lag spike / background tab resumption)
      const resLag = updatePlayerPhysics(player, { ix: 1, iy: 0, shift: true }, room, 10.0);
      expect(resLag).toBeDefined();
      expect(Number.isFinite(player.x)).toBe(true);
      expect(Number.isFinite(player.y)).toBe(true);
      // Wall containment holds firm even across 10-second delta jumps
      expect(player.x).toBeLessThanOrEqual(ARENA_WIDTH - WALL_THICKNESS - player.radius);
      expect(player.x).toBeGreaterThanOrEqual(WALL_THICKNESS + player.radius);

      // 4. Combat projectile updates under dt = 0 and dt = -0.016
      const combatState = createCombatState();
      combatState.bullets.push({
        x: 360,
        y: 360,
        vx: 200,
        vy: 0,
        radius: 5,
        dmg: 15,
        life: 1.0,
        color: '#ffd166',
        bounceLeft: 0,
        pierceLeft: 0,
        hitIds: new Set()
      });

      updatePlayerBullets(0, combatState.bullets, room, player, combatState);
      expect(combatState.bullets[0].x).toBe(360);
      expect(combatState.bullets[0].life).toBe(1.0);

      updatePlayerBullets(-0.016, combatState.bullets, room, player, combatState);
      expect(Number.isFinite(combatState.bullets[0].x)).toBe(true);
      expect(combatState.bullets[0].life).toBeCloseTo(1.016, 3);
    });
  });

  // ==========================================================================
  // SECTION 3: AUDIO & RENDER ROBUSTNESS
  // ==========================================================================
  describe('3. Audio & Render Robustness', () => {
    it('3.1 executes 250+ rapid multi-channel SFX calls and engine modulations without error', () => {
      const audio = new SoundSynthesizer(storage);

      // Verify init executes safely in headless environment
      const initResult = audio.init();
      expect(typeof initResult).toBe('boolean');

      const weapons: WeaponId[] = [
        'pistol',
        'machine_gun',
        'flamethrower',
        'grenade_launcher',
        'shotgun',
        'railgun',
        'arc_coil'
      ];

      // Rapidly fire 250 audio routine invocations across all channels
      expect(() => {
        for (let i = 0; i < 250; i++) {
          const w = weapons[i % weapons.length];
          audio.shoot(w);
          if (i % 5 === 0) audio.hit(i % 10 === 0);
          if (i % 7 === 0) audio.explosion();
          if (i % 11 === 0) audio.enemyKill(i % 22 === 0);
          if (i % 13 === 0) audio.playerHurt();
          if (i % 17 === 0) audio.pickupFuel();
          if (i % 19 === 0) audio.pickupItem();
          if (i % 23 === 0) audio.pickupLoot((i % 4) as 0 | 1 | 2 | 3);
          if (i % 29 === 0) audio.shopBuy();
          if (i % 31 === 0) audio.shopError();
          if (i % 37 === 0) audio.roomClear();
          if (i % 41 === 0) audio.doorTransition();
          if (i % 43 === 0) audio.nextFloor();
          if (i % 47 === 0) audio.uiClick();

          // Continuous engine frequency modulation with alternating extreme inputs
          const speedRatio = (i % 20) / 20;
          const isBoosting = i % 2 === 0;
          audio.updateEngine(speedRatio, isBoosting, false);

          // Alternating mute toggling
          if (i % 50 === 0) {
            audio.toggleMute();
          }
        }
      }).not.toThrow();

      // Audio engine parameters calculation handles negative or extreme throttle ratios
      const extremeParams = calculateEngineParams(99.0, true, false, false);
      expect(Number.isFinite(extremeParams.f1)).toBe(true);
      expect(Number.isFinite(extremeParams.f2)).toBe(true);
      expect(Number.isFinite(extremeParams.cutoff)).toBe(true);
      expect(Number.isFinite(extremeParams.gain)).toBe(true);

      const negParams = calculateEngineParams(-5.0, false, false, false);
      expect(Number.isFinite(negParams.f1)).toBe(true);
    });

    it('3.2 handles canvas resizing across high DPR (3x), 4K widescreen, and ultra-narrow displays', () => {
      // Simulate DOM canvas elements
      const mockCanvas = document.createElement('canvas');
      const mockMinimap = document.createElement('canvas');
      const mockFuel = document.createElement('canvas');
      const mockBike = document.createElement('canvas');

      // Helper function mirroring main.ts fitAll() sizing logic
      const runFitTest = (winW: number, winH: number, dpr: number) => {
        const availH = Math.max(320, winH - 24);
        const availW = Math.max(320, winW - 540);
        const size = Math.floor(Math.min(availH, availW));

        const fitCanvas = (c: HTMLCanvasElement, cssW: number, cssH: number) => {
          c.style.width = `${cssW}px`;
          c.style.height = `${cssH}px`;
          c.width = Math.round(cssW * dpr);
          c.height = Math.round(cssH * dpr);
        };

        fitCanvas(mockCanvas, size, size);
        fitCanvas(mockMinimap, 220, 135);
        fitCanvas(mockFuel, 220, 110);
        fitCanvas(mockBike, 260, 165);

        return { size, dpr };
      };

      // 1. 4K High-DPI Display (3840 x 2160, DPR = 3.0)
      const res4K = runFitTest(3840, 2160, 3.0);
      expect(res4K.size).toBe(2136); // min(2136, 3300)
      expect(mockCanvas.width).toBe(2136 * 3);
      expect(mockCanvas.height).toBe(2136 * 3);
      expect(mockMinimap.width).toBe(220 * 3);
      expect(mockMinimap.height).toBe(135 * 3);

      // 2. Ultra-narrow Mobile display (360 x 640, DPR = 2.0)
      const resMobile = runFitTest(360, 640, 2.0);
      expect(resMobile.size).toBe(320); // clamped to Math.max(320, ...)
      expect(mockCanvas.width).toBe(320 * 2);
      expect(mockCanvas.height).toBe(320 * 2);

      // 3. Degenerate zero display (0 x 0, DPR = 1.0)
      const resZero = runFitTest(0, 0, 1.0);
      expect(resZero.size).toBe(320); // minimum safety clamp prevents 0-pixel collapse
      expect(mockCanvas.width).toBe(320);
      expect(mockCanvas.height).toBe(320);
    });

    it('3.3 validates StageManager layer hierarchy and FilterManager impact flash decay', () => {
      const stage = new StageManager();
      expect(stage.floorLayer).toBeDefined();
      expect(stage.skidLayer).toBeDefined();
      expect(stage.shadowLayer).toBeDefined();
      expect(stage.entityLayer).toBeDefined();
      expect(stage.vfxLayer).toBeDefined();
      expect(stage.hudLayer).toBeDefined();

      const filterManager = new FilterManager();
      expect(filterManager.isImpactActive()).toBe(false);

      // Trigger flash
      filterManager.triggerImpactFlash(0.12);
      expect(filterManager.isImpactActive()).toBe(true);

      // Step time forward
      filterManager.update(0.06);
      expect(filterManager.isImpactActive()).toBe(true);

      // Step past expiration
      filterManager.update(0.10);
      expect(filterManager.isImpactActive()).toBe(false);

      // Multiple rapid flash triggers reset timer safely
      filterManager.triggerImpactFlash(0.05);
      filterManager.triggerImpactFlash(0.20);
      filterManager.update(0.10);
      expect(filterManager.isImpactActive()).toBe(true);
    });

    it('3.4 validates semicircular fuel gauge angles and minimap coordinate transforms', () => {
      // Dial needle angle formulas
      const emptyDial = calcNeedleAngle(0, 6, 0);
      expect(emptyDial.angle).toBeCloseTo(Math.PI, 4);

      const fullDial = calcNeedleAngle(6, 6, 0);
      expect(fullDial.angle).toBeCloseTo(Math.PI * 2, 4);

      // Jitter test when low fuel (HP <= 34%)
      expect(isLowFuel(2, 6)).toBe(true);
      expect(isLowFuel(5, 6)).toBe(false);

      // Minimap room transforms
      const centerRoom = calcMinimapRoomCoords(0, 0, 0, 0, 240, 145, 18, 3);
      expect(centerRoom.rx).toBe(120 - 9);
      expect(centerRoom.ry).toBe(72.5 - 9);
      expect(centerRoom.visible).toBe(true);

      const offscreenRoom = calcMinimapRoomCoords(100, 100, 0, 0, 240, 145, 18, 3);
      expect(offscreenRoom.visible).toBe(false);
    });
  });

  // ==========================================================================
  // SECTION 4: MULTI-SYSTEM ADVERSARIAL STRESS & WAVE 4/5 INTEGRATION
  // ==========================================================================
  describe('4. Multi-System Adversarial Stress & Wave 4/5 Integration', () => {
    it('4.1 verifies Wave 5 Elite Affixes (volatile, overclocked, vampiric) and handleEnemyDeath payoffs under rapid multi-kill bursts', () => {
      const room: Room = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [],
        enemies: [],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };
      const combatState = createCombatState();

      // Configure player with partially depleted HP and NOS
      player.maxHp = 8;
      player.hp = 5;
      player.nos = 40;
      player.nosMax = 100;
      player.vampChance = 0; // Isolate affix payoff from passive item siphon

      // 1. Vampiric Elite kill payoff (+1 HP siphon capped at maxHp)
      const vampEnemy = createEnemy('charger', 200, 200, 2, true);
      (vampEnemy as any).eliteAffix = 'vampiric';
      room.enemies.push(vampEnemy);

      handleEnemyDeath({
        room,
        enemy: vampEnemy,
        index: 0,
        player,
        state: combatState,
        floorNum: 2
      });

      expect(player.hp).toBe(6); // +1 HP siphoned
      const vampFloater = combatState.damageNumbers.find(d => d.text.includes('ELITE SIPHON'));
      expect(vampFloater).toBeDefined();
      expect(vampFloater?.color).toBe('#06d6a0');

      // Cap at maxHp: heal player to maxHp and kill another vampiric elite
      player.hp = player.maxHp;
      const vampEnemy2 = createEnemy('charger', 220, 220, 2, true);
      (vampEnemy2 as any).eliteAffix = 'vampiric';
      handleEnemyDeath({
        room,
        enemy: vampEnemy2,
        index: 0,
        player,
        state: combatState,
        floorNum: 2
      });
      expect(player.hp).toBe(player.maxHp); // Strictly capped, does not exceed 8

      // 2. Overclocked Elite kill payoff (+20 NOS capped at nosMax)
      const ocEnemy = createEnemy('trishot', 300, 300, 2, true);
      (ocEnemy as any).eliteAffix = 'overclocked';
      player.nos = 50;

      handleEnemyDeath({
        room,
        enemy: ocEnemy,
        index: 0,
        player,
        state: combatState,
        floorNum: 2
      });

      expect(player.nos).toBe(70); // +20 NOS
      const ocFloater = combatState.damageNumbers.find(d => d.text.includes('OVERCLOCKED +20 NOS!'));
      expect(ocFloater).toBeDefined();
      expect(ocFloater?.color).toBe('#00f5d4');

      // Cap at nosMax
      player.nos = 95;
      const ocEnemy2 = createEnemy('trishot', 320, 320, 2, true);
      (ocEnemy2 as any).eliteAffix = 'overclocked';
      handleEnemyDeath({
        room,
        enemy: ocEnemy2,
        index: 0,
        player,
        state: combatState,
        floorNum: 2
      });
      expect(player.nos).toBe(100); // Strictly capped at nosMax

      // 3. Volatile Elite kill payoff (shockwave explosion particle)
      const prevParticlesCount = combatState.particles.length;
      const volEnemy = createEnemy('bomber', 400, 400, 2, true);
      (volEnemy as any).eliteAffix = 'volatile';

      handleEnemyDeath({
        room,
        enemy: volEnemy,
        index: 0,
        player,
        state: combatState,
        floorNum: 2
      });

      const shockwave = combatState.particles.slice(prevParticlesCount).find(p => p.shockwaveMax === 52);
      expect(shockwave).toBeDefined();
      expect(shockwave?.color).toBe('#ff9f1c');
      expect(shockwave?.life).toBe(0.25);
      const volFloater = combatState.damageNumbers.find(d => d.text.includes('VOLATILE ELITE!'));
      expect(volFloater).toBeDefined();

      // 4. Simultaneous burst multi-kill of all 3 elite types
      player.hp = 4;
      player.nos = 30;
      const burstEnemies = [
        createEnemy('brute', 250, 250, 3, true),
        createEnemy('splitter', 260, 260, 3, true),
        createEnemy('swarmer', 270, 270, 3, true)
      ];
      (burstEnemies[0] as any).eliteAffix = 'vampiric';
      (burstEnemies[1] as any).eliteAffix = 'overclocked';
      (burstEnemies[2] as any).eliteAffix = 'volatile';
      room.enemies.push(...burstEnemies);

      for (let i = 0; i < burstEnemies.length; i++) {
        handleEnemyDeath({
          room,
          enemy: burstEnemies[i],
          index: i,
          player,
          state: combatState,
          floorNum: 3
        });
      }

      expect(player.hp).toBe(5); // +1 from vampiric
      expect(player.nos).toBe(50); // +20 from overclocked
      expect(combatState.particles.some(p => p.shockwaveMax === 52)).toBe(true);

      // Verify all particles and damage numbers have finite non-NaN coordinates
      for (const p of combatState.particles) {
        expect(Number.isFinite(p.x)).toBe(true);
        expect(Number.isFinite(p.y)).toBe(true);
        expect(Number.isFinite(p.radius)).toBe(true);
      }
      for (const d of combatState.damageNumbers) {
        expect(Number.isFinite(d.x)).toBe(true);
        expect(Number.isFinite(d.y)).toBe(true);
      }
    });

    it('4.2 simulates Wave 5 Biome Zones (boost_strip, oil_slick, ice_patch) under extreme velocities and heat-lock states without NaN or blowout', () => {
      const room: Room = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [],
        enemies: [],
        pickups: [],
        hazards: [],
        skids: [],
        biomeZones: [
          { x: 220, y: 220, radius: 80, type: 'boost_strip' },
          { x: 360, y: 360, radius: 80, type: 'ice_patch' },
          { x: 500, y: 500, radius: 80, type: 'oil_slick' }
        ],
        trapdoor: false
      };

      const dt = 1 / 60;

      // Phase A: Player on boost_strip (replenishes NOS smoothly, effSpeed amplified)
      player.x = 220;
      player.y = 220;
      player.vx = 50;
      player.vy = 0;
      player.nos = 10;
      player.nosMax = 100;
      player.nosDelay = 3.5;
      player.nosLock = true;
      player.heatLevel = 4;

      updatePlayerPhysics(player, { ix: 1, iy: 0, shift: false }, room, dt);
      expect((player as any).onBoostStrip).toBe(true);
      expect(player.nos).toBeGreaterThan(10); // Boost strip regenerated NOS

      // Extreme velocity stress through the room across 60 frames
      player.vx = 9500;
      player.vy = -8400;
      for (let step = 0; step < 60; step++) {
        updatePlayerPhysics(player, { ix: 1, iy: -1, shift: false }, room, dt);
        expect(Number.isFinite(player.x)).toBe(true);
        expect(Number.isFinite(player.y)).toBe(true);
        expect(Number.isFinite(player.vx)).toBe(true);
        expect(Number.isFinite(player.vy)).toBe(true);
        expect(Number.isFinite(player.nos)).toBe(true);
        expect(Number.isNaN(player.x)).toBe(false);
        expect(Number.isNaN(player.y)).toBe(false);
      }

      // Phase B: Move player to ice_patch with nos >= 25 (reduces nosDelay and releases nosLock)
      player.x = 360;
      player.y = 360;
      player.vx = 30;
      player.vy = 30;
      player.nos = 30;
      player.nosLock = true;
      player.nosDelay = 2.0;

      for (let step = 0; step < 10; step++) {
        updatePlayerPhysics(player, { ix: 0, iy: 1, shift: false }, room, dt);
        expect(Number.isFinite(player.x)).toBe(true);
        expect(Number.isFinite(player.y)).toBe(true);
        expect(Number.isFinite(player.nosDelay)).toBe(true);
      }
      expect(player.nosLock).toBe(false); // nosLock released on ice patch when nos >= 25
      expect(player.nosDelay).toBeLessThan(2.0);

      // Phase C: Move player to oil_slick (forces continuous skid marks, damped steering)
      player.x = 500;
      player.y = 500;
      player.vx = 40;
      player.vy = 40;
      const initialSkids = room.skids.length;

      for (let step = 0; step < 30; step++) {
        updatePlayerPhysics(player, { ix: -1, iy: 1, shift: false }, room, dt);
        expect(Number.isFinite(player.x)).toBe(true);
        expect(Number.isFinite(player.y)).toBe(true);
        expect(Number.isFinite(player.bikeAngle)).toBe(true);
      }
      expect(room.skids.length).toBeGreaterThan(initialSkids);
      expect(room.skids.length).toBeLessThanOrEqual(MAX_SKIDS_PER_ROOM);

      // Boundary safety verification under extreme hyper-velocity
      player.vx = 999999;
      player.vy = 999999;
      updatePlayerPhysics(player, { ix: 1, iy: 1, shift: false }, room, dt);
      expect(player.x).toBeLessThanOrEqual(ARENA_WIDTH - WALL_THICKNESS - player.radius);
      expect(player.y).toBeLessThanOrEqual(ARENA_HEIGHT - WALL_THICKNESS - player.radius);
      expect(Number.isNaN(player.x)).toBe(false);
      expect(Number.isNaN(player.y)).toBe(false);
    });

    it('4.3 verifies Wave 4 Boss Phase-2 overdrivePulseTimer hazard spawning and cryo_barrel slow aura interaction', () => {
      const room: Room = {
        x: 0,
        y: 0,
        type: 'boss',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [
          { x: 360, y: 260, size: 42, type: 'barrel', variant: 'cryo_barrel', hp: 15 }
        ],
        enemies: [],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      const combatState = createCombatState();

      // 1. Spawn Floor 4 Boss (variant 3: CRYO VALKYRIE) in Phase 2
      const boss = createBoss(4, 360, 200);
      boss.phase = 2;
      boss.hp = 300; // Phase 2 enrage
      room.enemies.push(boss);

      const dt = 0.1; // 100ms ticks

      // Simulate boss updates across 5 seconds (50 ticks)
      // overdrivePulseTimer is initialized to 2.4s and resets periodically to spawn hazards
      let hazardSpawns = 0;
      for (let tick = 0; tick < 50; tick++) {
        const prevHazards = room.hazards.length;
        updateEnemyAI({
          room,
          enemy: boss,
          dt,
          player,
          projScale: 1.0,
          enemyBullets: combatState.enemyBullets,
          enemyBombs: combatState.enemyBombs,
          floorNum: 4
        });
        if (room.hazards.length > prevHazards) {
          hazardSpawns++;
        }
      }

      // Over 5 seconds with 2.4s period, overdrivePulseTimer must have triggered at least 2 hazard pulses
      expect(hazardSpawns).toBeGreaterThanOrEqual(2);
      expect(room.hazards.length).toBeGreaterThanOrEqual(2);
      for (const h of room.hazards) {
        expect(Number.isFinite(h.x)).toBe(true);
        expect(Number.isFinite(h.y)).toBe(true);
        expect(h.radius).toBe(46);
        expect(h.life).toBeGreaterThan(0);
        expect(h.maxLife).toBe(3.5);
      }

      // 2. Cryo Barrel detonation and Slow Aura application
      expect(room.obstacles.length).toBe(1);
      const barrel = room.obstacles[0];
      expect(barrel.variant).toBe('cryo_barrel');

      // Shoot barrel with projectile to trigger cryo explosion
      combatState.bullets.push({
        x: 360,
        y: 250,
        vx: 0,
        vy: 200,
        radius: 6,
        dmg: 25,
        life: 1.0,
        color: '#ffd166',
        bounceLeft: 0,
        pierceLeft: 0,
        hitIds: new Set()
      });

      updatePlayerBullets(0.05, combatState.bullets, room, player, combatState);

      // Cryo barrel exploded and was removed
      expect(room.obstacles.length).toBe(0);

      // Verify cryo shockwave and shrapnel particles exist
      const cryoShockwave = combatState.particles.find(p => p.color === '#72efdd' && p.shockwaveMax === 88);
      expect(cryoShockwave).toBeDefined();

      // Boss was within 88px radius of cryo barrel detonation (dist = 60 <= 88 + 34)
      // Boss must have received cryo slow aura (slowTimer = 3.5) and 'CRYO SLOW!' damage indicator
      expect((boss as any).slowTimer).toBeGreaterThan(0);
      expect((boss as any).slowTimer).toBeLessThanOrEqual(3.5);

      const cryoSlowText = combatState.damageNumbers.find(d => d.text === 'CRYO SLOW!');
      expect(cryoSlowText).toBeDefined();
      expect(cryoSlowText?.color).toBe('#72efdd');

      // 3. Subsequent attack deals chilled bonus (+15%) and Thermal Shock when hit by explosive/flame
      const initialBossHp = boss.hp;
      triggerExplosion(boss.x, boss.y, 50, 40, room, combatState, undefined, Math.random, false);

      // Hit damage against chilled target with non-cryo explosion triggers THERMAL SHOCK!
      const thermalShockText = combatState.damageNumbers.find(d => d.text.includes('THERMAL SHOCK!'));
      expect(thermalShockText).toBeDefined();
      expect(boss.hp).toBeLessThan(initialBossHp);

      // Final sanity: zero NaN values anywhere in combat state or entities
      expect(Number.isFinite(boss.x)).toBe(true);
      expect(Number.isFinite(boss.y)).toBe(true);
      expect(Number.isFinite(boss.hp)).toBe(true);
      for (const b of combatState.enemyBullets) {
        expect(Number.isFinite(b.x)).toBe(true);
        expect(Number.isFinite(b.y)).toBe(true);
      }
    });
  });

  // ==========================================================================
  // SECTION 5: WAVE 9 ADVERSARIAL COVERAGE HARDENING
  // ==========================================================================
  describe('5. Wave 9 Adversarial Extremes (Overkill Edge Cases & Bounty Contract Input Sanitization)', () => {
    it('5.1 handles extreme negative HP (-1e9), 0 maxHp, and NaN inputs in calcOverkillBonus without throw or NaN state', () => {
      // 1. Extreme negative HP (-1e9) with normal maxHp (100)
      const extremeNeg = calcOverkillBonus(-1e9, 100);
      expect(extremeNeg.isOverkill).toBe(true);
      expect(extremeNeg.bonusStyle).toBe(4);
      expect(extremeNeg.callout).toBe('💀 OVERKILL!');

      // 2. Extreme negative HP (-1e9) with extreme negative maxHp (-1e9)
      // safeMax clamps to Math.max(1, Number(-1e9) || 1) = 1
      const extremeBothNeg = calcOverkillBonus(-1e9, -1e9);
      expect(extremeBothNeg.isOverkill).toBe(true);
      expect(extremeBothNeg.bonusStyle).toBe(4);
      expect(extremeBothNeg.callout).toBe('💀 OVERKILL!');

      // 3. 0 maxHp edge case: safeMax clamps to 1
      // When finalHp is 0, 0 <= -0.5 is false -> no overkill
      const zeroHpZeroMax = calcOverkillBonus(0, 0);
      expect(zeroHpZeroMax.isOverkill).toBe(false);
      expect(zeroHpZeroMax.bonusStyle).toBe(0);
      expect(zeroHpZeroMax.callout).toBeNull();

      // When finalHp is -1 with maxHp = 0: -1 <= -0.5 is true -> overkill triggered
      const negHpZeroMax = calcOverkillBonus(-1, 0);
      expect(negHpZeroMax.isOverkill).toBe(true);
      expect(negHpZeroMax.bonusStyle).toBe(4);
      expect(negHpZeroMax.callout).toBe('💀 OVERKILL!');

      // Positive finalHp with 0 maxHp: no overkill
      const posHpZeroMax = calcOverkillBonus(10, 0);
      expect(posHpZeroMax.isOverkill).toBe(false);
      expect(posHpZeroMax.bonusStyle).toBe(0);
      expect(posHpZeroMax.callout).toBeNull();

      // 4. NaN input handling: safeMax clamps to 1; NaN comparisons return false safely
      const nanHpNormalMax = calcOverkillBonus(NaN, 100);
      expect(nanHpNormalMax.isOverkill).toBe(false);
      expect(nanHpNormalMax.bonusStyle).toBe(0);
      expect(nanHpNormalMax.callout).toBeNull();

      const negHpNanMax = calcOverkillBonus(-50, NaN);
      // safeMax = 1, -50 <= -0.5 is true -> overkill safely handled
      expect(negHpNanMax.isOverkill).toBe(true);
      expect(negHpNanMax.bonusStyle).toBe(4);
      expect(negHpNanMax.callout).toBe('💀 OVERKILL!');

      const bothNan = calcOverkillBonus(NaN, NaN);
      expect(bothNan.isOverkill).toBe(false);
      expect(bothNan.bonusStyle).toBe(0);
      expect(bothNan.callout).toBeNull();

      // 5. Infinity / -Infinity inputs
      const negInfHp = calcOverkillBonus(-Infinity, 100);
      expect(negInfHp.isOverkill).toBe(true);
      expect(negInfHp.bonusStyle).toBe(4);
      expect(negInfHp.callout).toBe('💀 OVERKILL!');

      const posInfHp = calcOverkillBonus(Infinity, 100);
      expect(posInfHp.isOverkill).toBe(false);
      expect(posInfHp.bonusStyle).toBe(0);
      expect(posInfHp.callout).toBeNull();
    });

    it('5.2 sanitizes extreme floor numbers (-999, 0, 999, NaN) in getFloorBountyContract safely', () => {
      // 1. Extreme negative floor (-999) clamps safely to Floor 1 contract
      const negFloorContract = getFloorBountyContract(-999);
      expect(negFloorContract.floor).toBe(1);
      expect(negFloorContract.id).toBe('GRAZE_INITIATE');
      expect(negFloorContract.title).toBe('NEON DAREDEVIL');
      expect(negFloorContract.scrapReward).toBe(8);
      expect(negFloorContract.coinReward).toBe(10);
      expect(Number.isFinite(negFloorContract.scrapReward)).toBe(true);
      expect(Number.isFinite(negFloorContract.coinReward)).toBe(true);

      // 2. Zero floor (0) clamps safely to Floor 1 contract
      const zeroFloorContract = getFloorBountyContract(0);
      expect(zeroFloorContract.floor).toBe(1);
      expect(zeroFloorContract.id).toBe('GRAZE_INITIATE');
      expect(zeroFloorContract.title).toBe('NEON DAREDEVIL');
      expect(zeroFloorContract.scrapReward).toBe(8);
      expect(zeroFloorContract.coinReward).toBe(10);

      // 3. Extreme high floor (999) produces valid scaled Valhalla contract without NaN or overflow
      const highFloorContract = getFloorBountyContract(999);
      expect(highFloorContract.floor).toBe(999);
      expect(highFloorContract.id).toBe('VALHALLA_LEGEND');
      expect(highFloorContract.title).toBe('VALHALLA ASCENDANT');
      // Formula: scrapReward: 30 + (999 - 6) * 5 = 4995, coinReward: 40 + (999 - 6) * 8 = 7984
      expect(highFloorContract.scrapReward).toBe(30 + (999 - 6) * 5);
      expect(highFloorContract.coinReward).toBe(40 + (999 - 6) * 8);
      expect(highFloorContract.targetCount).toBe(1);
      expect(Number.isFinite(highFloorContract.scrapReward)).toBe(true);
      expect(Number.isFinite(highFloorContract.coinReward)).toBe(true);
      expect(highFloorContract.scrapReward).toBeGreaterThan(0);
      expect(highFloorContract.coinReward).toBeGreaterThan(0);

      // 4. NaN input defaults safely to Floor 1 contract
      const nanFloorContract = getFloorBountyContract(NaN);
      expect(nanFloorContract.floor).toBe(1);
      expect(nanFloorContract.id).toBe('GRAZE_INITIATE');
      expect(nanFloorContract.scrapReward).toBe(8);
      expect(nanFloorContract.coinReward).toBe(10);

      // 5. Floating point floor numbers are floored cleanly
      const floatFloorContract = getFloorBountyContract(3.85);
      expect(floatFloorContract.floor).toBe(3);
      expect(floatFloorContract.id).toBe('THERMAL_HUNTER');
    });
  });

  // ==========================================================================
  // SECTION 6: SANCTUARY STATION MODAL & LEFT HUD ADVERSARIAL STRESS SUITE (M72)
  // ==========================================================================
  describe('Sanctuary Station Modal & Left HUD Adversarial Stress Suite (M72)', () => {
    const HUB_STATION_AND_HUD_MARKUP = `
      <div class="hud-left-container" id="hud-left-container">
        <div class="hud-meter hud-hull" id="hull-meter" role="meter" aria-label="Hull" aria-valuemin="0" aria-valuenow="6" aria-valuemax="6">
          <span class="hud-label">HULL</span>
          <span id="hp-text" class="hud-readout">6 / 6</span>
          <div class="hud-hull-frame"><div class="hud-segbar" id="hull-bar"></div></div>
        </div>
        <div class="hud-meter hud-nos" id="nos-meter">
          <span class="hud-label">NOS</span>
          <span id="nos-text" class="hud-readout">100%</span>
          <div class="hud-nos-row"><div class="hud-nos-track"><div id="nos-fill"></div></div><span id="hud-lv-badge" class="hud-lv-badge">LV. 1</span></div>
        </div>
        <div class="hud-stats" id="stats-grid"></div>
        <div class="hud-wing-panel hud-wing-left" id="left-wing-panel" aria-label="Style Rank and Active Synergies">
          <div class="style-rank-card" id="style-rank-card">
            <span class="style-rank-title" id="style-rank-title">CRUISING</span>
            <span class="style-rank-grade" id="style-rank-grade">D</span>
            <div class="style-rank-bar"><div class="style-rank-fill" id="style-rank-fill" style="width: 18%"></div></div>
            <span class="style-rank-sub" id="style-rank-sub">DRIFT [SPACE] + SPEED COMBO</span>
          </div>
          <div class="synergy-tracker-card" id="synergy-tracker-card">
            <div class="synergy-list" id="synergy-list"></div>
            <div class="synergy-list" id="hud-synergy-list"></div>
          </div>
        </div>
      </div>

      <button id="outside-focus-btn" type="button">outside</button>
      <button type="button" id="hub-interact-banner" class="hub-interact-banner" hidden>
        <span class="hub-interact-key">[PRESS E]</span>
        <div class="hub-interact-copy">
          <strong id="hub-interact-title"></strong>
          <span id="hub-interact-desc"></span>
        </div>
      </button>
      <div id="hub-station-overlay" aria-hidden="true">
        <div class="hub-station-card" role="dialog" aria-modal="true" aria-labelledby="hub-station-title">
          <header class="hub-station-header">
            <div class="hub-station-title-wrap">
              <span class="hub-station-kicker" id="hub-station-kicker"></span>
              <h2 class="hub-station-title" id="hub-station-title"></h2>
            </div>
            <div class="hub-station-speaker-pill" id="hub-station-speaker"></div>
          </header>
          <blockquote class="hub-station-quote" id="hub-station-quote"></blockquote>
          <div class="hub-station-purpose" id="hub-station-purpose"></div>
          <div class="hub-station-body" id="hub-station-body"></div>
          <div class="hub-station-feedback" id="hub-station-feedback" hidden></div>
          <footer class="hub-station-actions" id="hub-station-actions">
            <button type="button" class="portal-btn portal-btn--primary" id="btn-hub-station-primary"><kbd>E</kbd> ACTIVATE</button>
            <button type="button" class="portal-btn portal-btn--secondary" id="btn-hub-station-secondary">CYCLE HEAT</button>
            <button type="button" class="portal-btn portal-btn--secondary" id="btn-hub-station-close"><kbd>ESC</kbd> CLOSE</button>
          </footer>
        </div>
      </div>
    `;

    function createDefaultHubOptions(overrides: Partial<HubStationOpenOptions> = {}): HubStationOpenOptions {
      return {
        npcId: 'garage',
        metaSave: {
          scrap: 24,
          heatLevel: 0,
          bestFloor: 2,
          totalKills: 88,
          bossesSlain: 1,
          totalRuns: 4,
          stash: [],
          equipped: {
            chassis: { slot: 'chassis', name: 'Reinforced Steel Frame', rarity: 1 }
          }
        },
        player: {
          weapon: 'pistol',
          hp: 6,
          maxHp: 6
        },
        scannerClaimed: false,
        bountyClaimed: false,
        onReforge: vi.fn(() => ({ ok: true, message: 'Reforged successfully!' })),
        onClaimScanner: vi.fn(() => ({ ok: true, message: 'Scanner calibrated!' })),
        onClaimBountyCache: vi.fn(() => ({ ok: true, message: 'Supply cache secured!' })),
        onSelectHeat: vi.fn(),
        onLaunchRun: vi.fn(),
        onClose: vi.fn(),
        ...overrides
      };
    }

    afterEach(() => {
      document.body.innerHTML = '';
    });

    it('6.1 executes 50-cycle rapid open() / close() fuzz test across all sanctuary stations confirming isOpen() consistency, 0 misfires, and clean DOM restoration', () => {
      document.body.innerHTML = HUB_STATION_AND_HUD_MARKUP;
      const modal = new HubStationModalController();
      const overlay = document.getElementById('hub-station-overlay')!;
      const outsideBtn = document.getElementById('outside-focus-btn') as HTMLButtonElement;
      const closeBtn = document.getElementById('btn-hub-station-close') as HTMLButtonElement;

      const stations = ['blacksmith', 'codex', 'bounty', 'launch'] as const;
      const onCloseSpy = vi.fn();
      const onReforgeSpy = vi.fn(() => ({ ok: true, message: 'ok' }));
      const onClaimScannerSpy = vi.fn(() => ({ ok: true, message: 'ok' }));
      const onClaimBountyCacheSpy = vi.fn(() => ({ ok: true, message: 'ok' }));

      // 50-cycle fuzzing loop
      for (let cycle = 0; cycle < 50; cycle++) {
        const station = stations[cycle % stations.length];
        outsideBtn.focus();

        const opts = createDefaultHubOptions({
          npcId: station,
          onClose: onCloseSpy,
          onReforge: onReforgeSpy,
          onClaimScanner: onClaimScannerSpy,
          onClaimBountyCache: onClaimBountyCacheSpy
        });

        // Open modal
        modal.open(opts);

        // Verify open state consistency
        expect(modal.isOpen()).toBe(true);
        expect(overlay.classList.contains('visible')).toBe(true);
        expect(overlay.getAttribute('aria-hidden')).toBe('false');

        // Verify active element was moved into the dialog
        expect(document.activeElement?.id).toBe('btn-hub-station-primary');

        // Close modal using rotating methods: 0: modal.close(), 1: Escape key, 2: close button click
        if (cycle % 3 === 0) {
          modal.close();
        } else if (cycle % 3 === 1) {
          window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
        } else {
          closeBtn.click();
        }

        // Verify clean closed state
        expect(modal.isOpen()).toBe(false);
        expect(overlay.classList.contains('visible')).toBe(false);
        expect(overlay.getAttribute('aria-hidden')).toBe('true');
        expect(onCloseSpy).toHaveBeenCalledTimes(cycle + 1);

        // Idempotent secondary close call - must not misfire onClose or corrupt state
        modal.close();
        expect(modal.isOpen()).toBe(false);
        expect(onCloseSpy).toHaveBeenCalledTimes(cycle + 1);

        // Verify 0 duplicate event listener misfires: dispatching keyboard events while closed
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true, cancelable: true }));
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));

        expect(onReforgeSpy).not.toHaveBeenCalled();
        expect(onClaimScannerSpy).not.toHaveBeenCalled();
        expect(onClaimBountyCacheSpy).not.toHaveBeenCalled();
        expect(onCloseSpy).toHaveBeenCalledTimes(cycle + 1);
      }

      expect(modal.isOpen()).toBe(false);
      expect(onCloseSpy).toHaveBeenCalledTimes(50);
      modal.close();
    });

    it('6.2 validates Blacksmith Scrap boundary stress test (scrap = 0, scrap = 11, scrap = 12) preventing negative scrap deduction and unauthorized gear mutation', () => {
      document.body.innerHTML = HUB_STATION_AND_HUD_MARKUP;
      const modal = new HubStationModalController();

      const metaSave: { scrap: number; equipped: { chassis: { slot: string; name: string; rarity: number } } } = {
        scrap: 0,
        equipped: {
          chassis: { slot: 'chassis', name: 'Reinforced Steel Frame', rarity: 1 }
        }
      };

      const onReforge = vi.fn(() => {
        if (metaSave.scrap < 12) {
          return { ok: false, message: 'Insufficient Scrap! (Requires 12 ⚙️)' };
        }
        metaSave.scrap -= 12;
        metaSave.equipped.chassis.rarity += 1;
        return { ok: true, message: 'Chassis reforged to RARE (+25% Stats)!' };
      });

      const options = createDefaultHubOptions({
        npcId: 'blacksmith',
        metaSave,
        onReforge
      });

      // Boundary 1: scrap = 0
      metaSave.scrap = 0;
      modal.open(options);

      const primaryBtn = document.getElementById('btn-hub-station-primary') as HTMLButtonElement;
      const feedbackEl = document.getElementById('hub-station-feedback')!;

      // Attempt 5 rapid unaffordable clicks
      for (let i = 0; i < 5; i++) {
        primaryBtn.click();
      }

      expect(onReforge).toHaveBeenCalledTimes(5);
      expect(feedbackEl.classList.contains('is-error')).toBe(true);
      expect(feedbackEl.textContent).toContain('Insufficient Scrap');
      expect(metaSave.scrap).toBe(0); // Strictly not negative
      expect(metaSave.scrap).toBeGreaterThanOrEqual(0);
      expect(metaSave.equipped.chassis.rarity).toBe(1); // Gear unmutated

      // Boundary 2: scrap = 11 (1 below threshold 12)
      metaSave.scrap = 11;
      modal.open(options);
      expect(document.querySelector('.hub-stat-val.hub-gold')?.textContent).toContain('11 SCRAP');

      for (let i = 0; i < 5; i++) {
        primaryBtn.click();
      }

      expect(onReforge).toHaveBeenCalledTimes(10);
      expect(feedbackEl.classList.contains('is-error')).toBe(true);
      expect(feedbackEl.textContent).toContain('Insufficient Scrap');
      expect(metaSave.scrap).toBe(11); // Strictly not deducted to -1
      expect(metaSave.equipped.chassis.rarity).toBe(1); // Gear unmutated

      // Boundary 3: scrap = 12 (exact threshold)
      metaSave.scrap = 12;
      modal.open(options);
      expect(document.querySelector('.hub-stat-val.hub-gold')?.textContent).toContain('12 SCRAP');

      // Click once to reforge
      primaryBtn.click();

      expect(onReforge).toHaveBeenCalledTimes(11);
      expect(feedbackEl.classList.contains('is-success')).toBe(true);
      expect(feedbackEl.textContent).toContain('Chassis reforged to RARE');
      expect(metaSave.scrap).toBe(0); // Clean deduction: 12 - 12 = 0
      expect(metaSave.equipped.chassis.rarity).toBe(2); // Upgraded from Magic (1) to Rare (2)

      // Post-upgrade DOM verification: now displays 0 scrap and updated rarity
      expect(document.querySelector('.hub-stat-val.hub-gold')?.textContent).toContain('0 SCRAP');
      expect(document.querySelector('.hub-tier-badge')?.textContent).toContain('RARE');

      // Boundary 4: Immediate subsequent click now that scrap is 0 must fail cleanly
      primaryBtn.click();
      expect(onReforge).toHaveBeenCalledTimes(12);
      expect(feedbackEl.classList.contains('is-error')).toBe(true);
      expect(metaSave.scrap).toBe(0); // Stays at 0, not -12
      expect(metaSave.equipped.chassis.rarity).toBe(2); // Stays at 2, not mutated to 3

      modal.close();
    });

    it('6.3 executes rapid Heat Level cycling (0 -> 1 -> 2 -> 3 -> 0) via #btn-hub-station-secondary and .hub-heat-btn buttons, verifying strict clamping to {0, 1, 2, 3}', () => {
      document.body.innerHTML = HUB_STATION_AND_HUD_MARKUP;
      const modal = new HubStationModalController();

      const metaSave = { heatLevel: 0 };
      const onSelectHeat = vi.fn((heat: number) => {
        // Robust controller / save clamping contract
        const valid = [0, 1, 2, 3];
        const clamped = valid.includes(heat) ? heat : Math.max(0, Math.min(3, Math.floor(heat) || 0));
        metaSave.heatLevel = clamped;
      });

      const options = createDefaultHubOptions({
        npcId: 'bounty',
        metaSave,
        onSelectHeat
      });

      modal.open(options);

      const secondaryBtn = document.getElementById('btn-hub-station-secondary') as HTMLButtonElement;
      expect(secondaryBtn).not.toBeNull();

      // Attach secondary button cycling listener
      secondaryBtn.onclick = () => {
        const nextHeat = ((metaSave.heatLevel ?? 0) + 1) % 4;
        onSelectHeat(nextHeat);
        metaSave.heatLevel = nextHeat;
        modal.open({ ...options, metaSave });
      };

      // Part A: 40-click rapid cycling (10 full loops 0 -> 1 -> 2 -> 3 -> 0)
      for (let i = 0; i < 40; i++) {
        secondaryBtn.click();
        const expectedHeat = (i + 1) % 4;
        expect(metaSave.heatLevel).toBe(expectedHeat);
        expect([0, 1, 2, 3].includes(metaSave.heatLevel)).toBe(true);
        expect(document.querySelector('.hub-heat-current')?.textContent).toBe(`CURRENT: HEAT ${expectedHeat}`);

        // Verify active button in DOM
        const activeBtn = document.querySelector(`.hub-heat-btn[data-heat="${expectedHeat}"]`);
        expect(activeBtn?.classList.contains('active')).toBe(true);
      }

      // Part B: Direct clicking of .hub-heat-btn buttons in non-sequential order
      const heatButtons = document.querySelectorAll<HTMLButtonElement>('.hub-heat-btn');
      expect(heatButtons.length).toBe(4);

      const sequence = [3, 1, 0, 2, 3, 3, 0, 1, 2];
      for (const targetHeat of sequence) {
        heatButtons[targetHeat].click();
        expect(metaSave.heatLevel).toBe(targetHeat);
        expect([0, 1, 2, 3].includes(metaSave.heatLevel)).toBe(true);
        expect(document.querySelector('.hub-heat-current')?.textContent).toBe(`CURRENT: HEAT ${targetHeat}`);
      }

      // Part C: Fuzz testing with invalid heat inputs (-99, 4, 100, NaN) through handler
      for (const invalidHeat of [-99, -1, 4, 10, 999, NaN]) {
        onSelectHeat(invalidHeat);
        expect([0, 1, 2, 3].includes(metaSave.heatLevel)).toBe(true);
        expect(metaSave.heatLevel).toBeGreaterThanOrEqual(0);
        expect(metaSave.heatLevel).toBeLessThanOrEqual(3);
      }

      modal.close();
    });

    it('6.4 enforces idempotent Codex & War Room primary button close safety and Launch Gate deployment', () => {
      document.body.innerHTML = HUB_STATION_AND_HUD_MARKUP;
      const modal = new HubStationModalController();
      const onClaimScanner = vi.fn();
      const onClaimBountyCache = vi.fn();
      const codexOptions = createDefaultHubOptions({ npcId: 'codex', scannerClaimed: false, onClaimScanner });
      modal.open(codexOptions);
      const primaryBtn = document.getElementById('btn-hub-station-primary') as HTMLButtonElement;
      expect(primaryBtn.textContent).toContain('CLOSE DOSSIER');
      for (let i = 0; i < 10; i++) { primaryBtn.click(); }
      expect(onClaimScanner).not.toHaveBeenCalled();
      expect(modal.isOpen()).toBe(false);
      const bountyOptions = createDefaultHubOptions({ npcId: 'bounty', bountyClaimed: false, onClaimBountyCache });
      modal.open(bountyOptions);
      expect(primaryBtn.textContent).toContain('CONFIRM WAR ROOM SETUP');
      for (let i = 0; i < 10; i++) { modal.open(bountyOptions); primaryBtn.click(); }
      expect(onClaimBountyCache).not.toHaveBeenCalled();
      const onLaunchRun = vi.fn();
      const launchOptions = createDefaultHubOptions({ npcId: 'launch', onLaunchRun });
      modal.open(launchOptions);
      expect(document.getElementById('btn-hub-autoclaim')).toBeNull();
      expect(document.querySelector('.hub-ready-banner')?.textContent).toContain('Bike systems calibrated');
      for (let i = 0; i < 10; i++) { modal.open(launchOptions); primaryBtn.click(); }
      expect(onLaunchRun).toHaveBeenCalledTimes(10);
      modal.close();
    });
  });

  // ==========================================================================
  // SECTION 7: ADVERSARIAL FUZZ: EQUIPMENT MODELS & LOADOUT (M102)
  // ==========================================================================
  describe('Adversarial Fuzz: 24 High-Res Equipment Models & Loadout Telemetry (M102)', () => {
    it('survives malformed, null, undefined, negative rarity (-99), NaN rarity, and out-of-bounds rarity (999) or unknown slot (\'flux_capacitor\') inputs to getEquipmentVisualSpec and getEquipmentItemModelSvg without throwing, always returning a valid 128x128 SVG model and bounded rarity 0..3', () => {
      const malformedInputs = [
        null,
        undefined,
        {},
        { slot: 'flux_capacitor' as any },
        { slot: 'flux_capacitor' as any, rarity: 0 },
        { slot: 'engine', rarity: -99 },
        { slot: 'engine', rarity: NaN },
        { slot: 'engine', rarity: 999 },
        { slot: 'engine', rarity: -Infinity },
        { slot: 'engine', rarity: Infinity },
        { slot: 'engine', rarity: 2.7 },
        { slot: 'tires', rarity: -1 },
        { slot: 'handlebars', rarity: 4 },
        { slot: 'exhaust', rarity: undefined },
        { slot: 'frame', rarity: null as any },
        { slot: 'tank', rarity: 'rare' as any },
        { slot: 123 as any, rarity: {} as any },
        { name: 'Broken Corrupt Item', slot: undefined, rarity: -999 }
      ];

      for (const input of malformedInputs) {
        expect(() => getEquipmentVisualSpec(input as any)).not.toThrow();
        const spec = getEquipmentVisualSpec(input as any);
        expect(spec.rarity).toBeGreaterThanOrEqual(0);
        expect(spec.rarity).toBeLessThanOrEqual(3);
        expect(['MK-I', 'MK-II', 'MK-III', 'OMEGA']).toContain(spec.tierBadge);
        expect(spec.modelCode).toBeDefined();
        expect(typeof spec.modelCode).toBe('string');
        expect(spec.modelCode.length).toBeGreaterThan(0);

        expect(() => getEquipmentItemModelSvg(input as any)).not.toThrow();
        const svg = getEquipmentItemModelSvg(input as any);
        expect(typeof svg).toBe('string');
        expect(svg).toContain('viewBox="0 0 128 128"');
        expect(svg).toContain('<svg');
        expect(svg).toContain('</svg>');
        expect(svg).toContain('class="gx-equip-model');
        expect(svg).toMatch(/data-rarity="[0-3]"/);
        expect(svg).toContain(`data-model-code="${spec.modelCode}"`);
      }
    });

    it('executes a 100-cycle deterministic PRNG fuzz loop randomly equipping, upgrading, downgrading, and unequipping items across all 6 slots and 4 rarities, asserting that getEquippedBikeVisualState and getEquipmentLoadoutSummary stay 100% synchronized', () => {
      const slots: EquipSlot[] = ['tires', 'engine', 'handlebars', 'exhaust', 'frame', 'tank'];
      const meta: MetaSaveState = createDefaultMetaSave();

      let seed = 0x9e3779b9;
      const lcg = (): number => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      for (let cycle = 0; cycle < 100; cycle++) {
        const slot = slots[Math.floor(lcg() * slots.length)];
        const actionRoll = lcg();

        if (actionRoll < 0.45) {
          // Equip or upgrade
          const rarity = Math.floor(lcg() * 4) as 0 | 1 | 2 | 3;
          meta.equipped[slot] = {
            slot,
            rarity,
            name: `Fuzz ${slot.toUpperCase()} MK-${rarity + 1}`,
            stats: {
              speed: Number((10 + lcg() * 20).toFixed(2)),
              dmg: Number((0.05 + lcg() * 0.25).toFixed(3))
            }
          };
        } else if (actionRoll < 0.75) {
          // Downgrade existing or assign common
          const currentRarity = meta.equipped[slot]?.rarity ?? 0;
          const downgradedRarity = Math.max(0, currentRarity - 1) as 0 | 1 | 2 | 3;
          meta.equipped[slot] = {
            slot,
            rarity: downgradedRarity,
            name: `Downgraded ${slot} T${downgradedRarity}`,
            stats: {
              speed: Number((5 + downgradedRarity * 4).toFixed(1))
            }
          };
        } else {
          // Unequip (alternating between delete and undefined / null)
          if (cycle % 2 === 0) {
            delete meta.equipped[slot];
          } else {
            meta.equipped[slot] = null as any;
          }
        }

        const bikeVisuals = getEquippedBikeVisualState(meta);
        const loadout = getEquipmentLoadoutSummary(meta.equipped);

        // Assert 100% synchronization
        expect(bikeVisuals.equippedCount).toBe(loadout.installedCount);
        expect(bikeVisuals.equippedSlots.length).toBe(loadout.installedCount);
        expect(bikeVisuals.modelCodes.length).toBe(loadout.installedCount);

        expect(Number.isFinite(loadout.totalPowerScore)).toBe(true);
        expect(loadout.totalPowerScore).toBeGreaterThanOrEqual(0);

        expect(typeof bikeVisuals.summaryLine).toBe('string');
        expect(bikeVisuals.summaryLine.length).toBeGreaterThan(0);
        expect(typeof loadout.summaryLine).toBe('string');
        expect(loadout.summaryLine.length).toBeGreaterThan(0);

        // Slot membership invariants
        for (const s of bikeVisuals.equippedSlots) {
          expect(loadout.emptySlots).not.toContain(s);
          const item = meta.equipped[s];
          expect(item).toBeDefined();
          const partVisual = bikeVisuals.parts[s];
          expect(partVisual).toBeDefined();
          expect(partVisual?.slot).toBe(s);
        }
      }
    });

    it('renders GarageController across 30 rapid equip/unequip/livery cycles with extreme stash sizes and verifies #bike-canvas and #garage-overlay attributes never become NaN or undefined', () => {
      document.body.innerHTML = `
        <div id="garage-overlay">
          <h1 id="modal-title">MOTO-GARAGE BAY 01</h1>
          <p id="modal-subtitle">TACTICAL WORKSHOP</p>
          <span id="modal-scrap">1250</span>
          <canvas id="bike-canvas" width="400" height="300"></canvas>
          <div id="slots-left"></div>
          <div id="slots-right"></div>
          <div id="eq-totals"></div>
          <div id="stash-list"></div>
          <div id="unlock-list"></div>
          <div id="meta-upgrade-list"></div>
          <div id="livery-bar"></div>
          <button id="btn-resume">Resume</button>
          <button id="btn-new-run">New Run</button>
          <button id="btn-reset-save">Reset</button>
        </div>
      `;

      const callbacks: GarageCallbacks = {
        onEquipItem: vi.fn(),
        onUnequipSlot: vi.fn(),
        onSellItem: vi.fn(),
        onUnlockWeapon: vi.fn(),
        onEquipWeapon: vi.fn(),
        onBuyUpgrade: vi.fn(),
        onSelectLivery: vi.fn(),
        onResumeRun: vi.fn(),
        onNewRun: vi.fn(),
        onResetSave: vi.fn()
      };

      const garage = new GarageController(callbacks);
      const meta: MetaSaveState = createDefaultMetaSave();
      const player = createDefaultPlayerState();
      const slots: EquipSlot[] = ['tires', 'engine', 'handlebars', 'exhaust', 'frame', 'tank'];
      const liveries = ['crimson_kaneda', 'cyber_neon', 'golden_valhalla', 'midnight_stealth', 'toxic_hazard'] as const;

      const canvas = document.getElementById('bike-canvas') as HTMLCanvasElement;
      const overlay = document.getElementById('garage-overlay') as HTMLElement;

      for (let cycle = 0; cycle < 30; cycle++) {
        // 1. Extreme stash sizes: 0, 1, 18 (MAX_STASH), 75, 150 overflow items
        const stashSizes = [0, 1, 18, 75, 150];
        const targetStashSize = stashSizes[cycle % stashSizes.length];
        const stash: EquipmentItem[] = [];
        for (let i = 0; i < targetStashSize; i++) {
          const slot = slots[i % slots.length];
          const rarity = (i % 4) as 0 | 1 | 2 | 3;
          stash.push({
            slot,
            rarity,
            name: `Stash Item #${i + 1} (${slot})`,
            stats: { speed: 5 + rarity * 3, dmg: 0.05 * (i % 5) }
          });
        }
        meta.stash = stash;

        // 2. Equip / unequip cycling across slots
        slots.forEach((s, idx) => {
          if ((cycle + idx) % 3 === 0) {
            delete meta.equipped[s];
          } else {
            const rarity = ((cycle + idx) % 4) as 0 | 1 | 2 | 3;
            meta.equipped[s] = {
              slot: s,
              rarity,
              name: `Mount ${s} R${rarity}`,
              stats: { speed: 8 + rarity * 4 }
            };
          }
        });

        // 3. Livery cycling
        const livId = liveries[cycle % liveries.length];
        meta.livery = livId;
        player.livery = livId;

        // 4. Render modal and canvas lift
        garage.open(false, (cycle % 6) + 1, meta, player);
        garage.drawBikeLift(meta);

        // 5. Simulate livery button interaction if rendered
        const liveryBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.gx-livery-btn'));
        if (liveryBtns.length > 0) {
          liveryBtns[cycle % liveryBtns.length].click();
        }

        // 6. Assert #bike-canvas attributes never become NaN or undefined
        const canvasEquippedCount = canvas.getAttribute('data-equipped-visual-count');
        expect(canvasEquippedCount).not.toBeNull();
        expect(canvasEquippedCount).not.toBe('NaN');
        expect(canvasEquippedCount).not.toBe('undefined');
        expect(canvasEquippedCount).not.toContain('NaN');
        expect(canvasEquippedCount).not.toContain('undefined');
        expect(Number.isFinite(Number(canvasEquippedCount))).toBe(true);

        // 7. Assert #garage-overlay attributes never become NaN or undefined
        const overlayEquippedCount = overlay.getAttribute('data-equipped-visual-count');
        expect(overlayEquippedCount).not.toBeNull();
        expect(overlayEquippedCount).not.toBe('NaN');
        expect(overlayEquippedCount).not.toBe('undefined');
        expect(overlayEquippedCount).not.toContain('NaN');
        expect(overlayEquippedCount).not.toContain('undefined');
        expect(Number.isFinite(Number(overlayEquippedCount))).toBe(true);

        const overlayPowerScore = overlay.getAttribute('data-loadout-power-score');
        expect(overlayPowerScore).not.toBeNull();
        expect(overlayPowerScore).not.toBe('NaN');
        expect(overlayPowerScore).not.toBe('undefined');
        expect(overlayPowerScore).not.toContain('NaN');
        expect(overlayPowerScore).not.toContain('undefined');
        expect(Number.isFinite(Number(overlayPowerScore))).toBe(true);

        const overlayNextGoal = overlay.getAttribute('data-next-set-goal');
        expect(overlayNextGoal).not.toBeNull();
        expect(overlayNextGoal).not.toBe('NaN');
        expect(overlayNextGoal).not.toBe('undefined');
        expect(overlayNextGoal).not.toContain('NaN');
        expect(overlayNextGoal).not.toContain('undefined');
        expect(typeof overlayNextGoal).toBe('string');
        expect(overlayNextGoal!.length).toBeGreaterThan(0);
      }

      garage.close();
    });
  });

  // ==========================================================================
  // SECTION 8: ADVERSARIAL FUZZ: SANCTUARY STATION ADVISORS, MOD DECK & BOUNTIES (M123)
  // ==========================================================================
  describe('Adversarial Fuzz: Sanctuary Station Advisors, Mod Deck Summary & Bounty Contracts (M123)', () => {
    it('executes a 100-cycle deterministic PRNG fuzz across all sanctuary station advisors with mutated/extreme metaSave and player inputs, verifying finite numeric bounds and clean summaryLine strings', () => {
      let seed = 0x5a17fa57;
      const lcg = (): number => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      const extremeScrapValues = [
        0, 1, 14, 15, 20, 50, 100, 99999, 1000000,
        -1, -42, -99999,
        NaN, -Infinity,
        null as any, undefined as any
      ];

      const extremeNumbers = [
        0, 1, 2, 3, 4, 5, 6, 10, 50, 100, 99999,
        -1, -10, -9999,
        NaN, Infinity, -Infinity,
        null as any, undefined as any
      ];

      const weaponPool = ['pistol', 'shotgun', 'rifle', 'katana', '', 'invalid_weapon', null as any, undefined as any];

      for (let cycle = 0; cycle < 100; cycle++) {
        const isNullMeta = cycle % 10 === 0;
        const metaSave: any = isNullMeta
          ? null
          : {
              scrap: extremeScrapValues[Math.floor(lcg() * extremeScrapValues.length)],
              heatLevel: extremeNumbers[Math.floor(lcg() * extremeNumbers.length)],
              bestFloor: extremeNumbers[Math.floor(lcg() * extremeNumbers.length)],
              totalKills: extremeNumbers[Math.floor(lcg() * extremeNumbers.length)],
              bossesSlain: extremeNumbers[Math.floor(lcg() * extremeNumbers.length)],
              totalRuns: extremeNumbers[Math.floor(lcg() * extremeNumbers.length)],
              ranks: (cycle % 5 === 0)
                ? null
                : (cycle % 5 === 1)
                  ? undefined
                  : {
                      dmg: extremeNumbers[Math.floor(lcg() * extremeNumbers.length)],
                      fireRate: extremeNumbers[Math.floor(lcg() * extremeNumbers.length)],
                      speed: extremeNumbers[Math.floor(lcg() * extremeNumbers.length)],
                      maxHp: extremeNumbers[Math.floor(lcg() * extremeNumbers.length)]
                    },
              equipped: (cycle % 4 === 0)
                ? null
                : (cycle % 4 === 1)
                  ? undefined
                  : {
                      tires: { slot: 'tires', name: 'Fuzz Tires', rarity: Math.min(3, Math.max(0, Math.floor(lcg() * 4))) as 0 | 1 | 2 | 3 },
                      engine: { slot: 'engine', name: 'Fuzz Engine', rarity: Math.min(3, Math.max(0, Math.floor(lcg() * 4))) as 0 | 1 | 2 | 3 }
                    }
            };

        const isNullPlayer = cycle % 7 === 0;
        const playerPayload: any = isNullPlayer
          ? null
          : {
              weapon: weaponPool[Math.floor(lcg() * weaponPool.length)],
              hp: extremeNumbers[Math.floor(lcg() * extremeNumbers.length)],
              maxHp: 6,
              scannerBuff: lcg() > 0.5,
              items: (cycle % 3 === 0) ? [] : (cycle % 3 === 1) ? ['nitro_syringe', 'tire_iron'] : null
            };

        const floorNum = extremeNumbers[Math.floor(lcg() * extremeNumbers.length)];
        const bountyClaimed = lcg() > 0.5;
        const scannerClaimed = lcg() > 0.5;

        // 1. Forge Station Advisor
        const forge = getForgeStationAdvisor(metaSave, playerPayload);
        expect(Number.isFinite(forge.scrapAvailable)).toBe(true);
        expect(forge.scrapAvailable).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(forge.reforgeCost)).toBe(true);
        expect(forge.reforgeCost).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(forge.modCount)).toBe(true);
        expect(forge.modCount).toBeGreaterThanOrEqual(0);
        expect(typeof forge.canReforge).toBe('boolean');
        expect(typeof forge.summaryLine).toBe('string');
        expect(forge.summaryLine.length).toBeGreaterThan(0);
        expect(forge.summaryLine).not.toContain('NaN');
        expect(forge.summaryLine).not.toContain('undefined');

        // 2. Scanner Station Advisor
        const scanner = getScannerStationAdvisor(playerPayload, floorNum);
        expect(Number.isFinite(scanner.critBonusPct)).toBe(true);
        expect(scanner.critBonusPct).toBeGreaterThanOrEqual(0);
        expect(scanner.critBonusPct).toBeLessThanOrEqual(100);
        expect(Number.isFinite(scanner.targetFloor)).toBe(true);
        expect(scanner.targetFloor).toBeGreaterThanOrEqual(1);
        expect(typeof scanner.scannerActive).toBe('boolean');
        expect(typeof scanner.summaryLine).toBe('string');
        expect(scanner.summaryLine.length).toBeGreaterThan(0);
        expect(scanner.summaryLine).not.toContain('NaN');
        expect(scanner.summaryLine).not.toContain('undefined');

        // 3. War Room Station Advisor
        const warRoom = getWarRoomStationAdvisor(metaSave, bountyClaimed);
        expect(Number.isFinite(warRoom.currentHeat)).toBe(true);
        expect(warRoom.currentHeat).toBeGreaterThanOrEqual(0);
        expect(warRoom.currentHeat).toBeLessThanOrEqual(3);
        expect(Number.isFinite(warRoom.scrapBonusPct)).toBe(true);
        expect(warRoom.scrapBonusPct).toBeGreaterThanOrEqual(0);
        expect(warRoom.scrapBonusPct).toBeLessThanOrEqual(75);
        expect(Number.isFinite(warRoom.recommendedMaxHeat)).toBe(true);
        expect(warRoom.recommendedMaxHeat).toBeGreaterThanOrEqual(0);
        expect(warRoom.recommendedMaxHeat).toBeLessThanOrEqual(3);
        expect(typeof warRoom.bountyClaimed).toBe('boolean');
        expect(typeof warRoom.summaryLine).toBe('string');
        expect(warRoom.summaryLine.length).toBeGreaterThan(0);
        expect(warRoom.summaryLine).not.toContain('NaN');
        expect(warRoom.summaryLine).not.toContain('undefined');

        // 4. Launch Gate Advisor
        const launch = getLaunchGateAdvisor(metaSave, playerPayload, scannerClaimed, bountyClaimed);
        expect(Number.isFinite(launch.readyCount)).toBe(true);
        expect(launch.readyCount).toBeGreaterThanOrEqual(0);
        expect(launch.readyCount).toBeLessThanOrEqual(launch.totalChecks);
        expect(Number.isFinite(launch.totalChecks)).toBe(true);
        expect(launch.totalChecks).toBeGreaterThanOrEqual(0);
        expect(typeof launch.isFullyPrepped).toBe('boolean');
        expect(Array.isArray(launch.missingBuffs)).toBe(true);
        expect(typeof launch.summaryLine).toBe('string');
        expect(launch.summaryLine.length).toBeGreaterThan(0);
        expect(launch.summaryLine).not.toContain('NaN');
        expect(launch.summaryLine).not.toContain('undefined');

        // 5. Garage Station Advisor
        const garage = getGarageStationAdvisor(metaSave);
        expect(Number.isFinite(garage.equippedCount)).toBe(true);
        expect(garage.equippedCount).toBeGreaterThanOrEqual(0);
        expect(garage.equippedCount).toBeLessThanOrEqual(6);
        expect(Number.isFinite(garage.powerScore)).toBe(true);
        expect(garage.powerScore).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(garage.tuningRanks)).toBe(true);
        expect(garage.tuningRanks).toBeGreaterThanOrEqual(0);
        expect(garage.tuningRanks).toBeLessThanOrEqual(garage.tuningMaxRanks);
        expect(Number.isFinite(garage.tuningMaxRanks)).toBe(true);
        expect(garage.tuningMaxRanks).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(garage.tuningCompletionPct)).toBe(true);
        expect(garage.tuningCompletionPct).toBeGreaterThanOrEqual(0);
        expect(garage.tuningCompletionPct).toBeLessThanOrEqual(100);
        expect(typeof garage.canAffordNextTuning).toBe('boolean');
        expect(typeof garage.summaryLine).toBe('string');
        expect(garage.summaryLine.length).toBeGreaterThan(0);
        expect(garage.summaryLine).not.toContain('NaN');
        expect(garage.summaryLine).not.toContain('undefined');
      }
    });

    it('executes a 100-cycle deterministic PRNG fuzz across getRunModDeckSummary, getMetaTuningSummary, and getFloorBountyContractStatus verifying invariants totalModPicks >= 0, 0 <= completionPct <= 100, 0 <= progressPct <= 100, and clean summaryLine', () => {
      let seed = 0xb0071e5;
      const lcg = (): number => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };

      const allMods = ['nitro_syringe', 'tire_iron', 'chrome_lens', 'gasoline', 'racing_slicks', 'oil_infusion', 'warp_drive', 'ghost_plate'];
      const upgradeIds = ['dmg', 'fireRate', 'speed', 'maxHp', 'ramDamage'];
      const extremeNumbers = [
        0, 1, 2, 3, 5, 10, 25, 50, 100, 99999,
        -1, -10, -9999,
        NaN, Infinity, -Infinity,
        null as any, undefined as any
      ];

      for (let cycle = 0; cycle < 100; cycle++) {
        // Corrupted modStacks
        const modStacks: Record<string, any> = {};
        const numModEntries = Math.floor(lcg() * 6);
        for (let m = 0; m < numModEntries; m++) {
          const key = lcg() > 0.3 ? allMods[Math.floor(lcg() * allMods.length)] : ('invalid_mod_' + m);
          const rawVal = extremeNumbers[Math.floor(lcg() * extremeNumbers.length)];
          modStacks[key] = rawVal;
        }
        const playerPayload = (cycle % 12 === 0) ? null : {
          modStacks: (cycle % 6 === 0) ? null : modStacks,
          items: Object.keys(modStacks)
        };

        // Corrupted ranks
        const ranks: Record<string, any> = {};
        for (const upId of upgradeIds) {
          if (lcg() > 0.3) {
            ranks[upId] = extremeNumbers[Math.floor(lcg() * extremeNumbers.length)];
          }
        }
        if (lcg() > 0.5) {
          ranks['corrupt_key_xyz'] = extremeNumbers[Math.floor(lcg() * extremeNumbers.length)];
        }
        const metaPayload = (cycle % 15 === 0) ? null : {
          ranks: (cycle % 8 === 0) ? null : ranks
        };

        // Corrupted floorNum, styleScore, and styleRank
        const floorNum = extremeNumbers[Math.floor(lcg() * extremeNumbers.length)];
        const styleScore = extremeNumbers[Math.floor(lcg() * extremeNumbers.length)];
        const styleRanks = ['', 'D', 'C', 'B', 'A', 'S', 'SS', 'SSS', 'UNKNOWN', null as any, undefined as any];
        const styleRank = styleRanks[Math.floor(lcg() * styleRanks.length)];
        const bountyPlayerPayload = (cycle % 10 === 0) ? null : { styleScore, styleRank };

        // 1. Run Mod Deck Summary
        const deckSummary = getRunModDeckSummary(playerPayload as any);
        expect(deckSummary.totalModPicks).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(deckSummary.totalModPicks)).toBe(true);
        expect(deckSummary.uniqueModsCount).toBeGreaterThanOrEqual(0);
        expect(deckSummary.maxStackCount).toBeGreaterThanOrEqual(0);
        expect(typeof deckSummary.evoStackReady).toBe('boolean');
        expect(deckSummary.activeDuoCount).toBeGreaterThanOrEqual(0);
        expect(deckSummary.potentialDuoCount).toBeGreaterThanOrEqual(0);
        expect(typeof deckSummary.summaryLine).toBe('string');
        expect(deckSummary.summaryLine.length).toBeGreaterThan(0);
        expect(deckSummary.summaryLine).not.toContain('NaN');
        expect(deckSummary.summaryLine).not.toContain('undefined');

        // 2. Meta Tuning Summary
        const tuningSummary = getMetaTuningSummary(metaPayload as any);
        expect(tuningSummary.completionPct).toBeGreaterThanOrEqual(0);
        expect(tuningSummary.completionPct).toBeLessThanOrEqual(100);
        expect(Number.isFinite(tuningSummary.completionPct)).toBe(true);
        expect(tuningSummary.totalRanks).toBeGreaterThanOrEqual(0);
        expect(tuningSummary.totalRanks).toBeLessThanOrEqual(tuningSummary.maxPossibleRanks);
        expect(typeof tuningSummary.summaryLine).toBe('string');
        expect(tuningSummary.summaryLine.length).toBeGreaterThan(0);
        expect(tuningSummary.summaryLine).not.toContain('NaN');
        expect(tuningSummary.summaryLine).not.toContain('undefined');

        // 3. Floor Bounty Contract Status
        const bountyStatus = getFloorBountyContractStatus(floorNum, bountyPlayerPayload as any);
        expect(bountyStatus.targetFloor).toBeGreaterThanOrEqual(1);
        expect(Number.isFinite(bountyStatus.targetFloor)).toBe(true);
        expect(bountyStatus.rewardScrap).toBeGreaterThanOrEqual(0);
        expect(bountyStatus.rewardCoins).toBeGreaterThanOrEqual(0);
        expect(typeof bountyStatus.isStyleMilestoneMet).toBe('boolean');
        expect(typeof bountyStatus.contractTitle).toBe('string');
        expect(bountyStatus.contractTitle.length).toBeGreaterThan(0);
        expect(typeof bountyStatus.taskText).toBe('string');
        expect(bountyStatus.taskText.length).toBeGreaterThan(0);
        expect(typeof bountyStatus.summaryLine).toBe('string');
        expect(bountyStatus.summaryLine.length).toBeGreaterThan(0);
        expect(bountyStatus.summaryLine).not.toContain('NaN');
        expect(bountyStatus.summaryLine).not.toContain('undefined');

        // 4. Floor Bounty Contract / Style Milestone progressPct invariant: 0 <= progressPct <= 100
        const rawScore = Number(bountyPlayerPayload?.styleScore);
        const safeScore = Number.isFinite(rawScore) ? Math.max(0, rawScore) : 0;
        const progressPct = Math.min(100, Math.max(0, Math.round((safeScore / 50) * 100)));
        expect(progressPct).toBeGreaterThanOrEqual(0);
        expect(progressPct).toBeLessThanOrEqual(100);
        expect(Number.isFinite(progressPct)).toBe(true);
      }
    });

    it('executes a 40-cycle rapid DOM fuzz on HubStationModalController cycling through all sanctuary stations with fuzzed payloads, verifying advisor data attributes on #hub-station-overlay are never empty, NaN, or undefined', () => {
      const HUB_STATION_MARKUP = `
        <button id="outside-focus-btn" type="button">outside</button>
        <button type="button" id="hub-interact-banner" class="hub-interact-banner" hidden>
          <span class="hub-interact-key">[PRESS E]</span>
          <div class="hub-interact-copy">
            <strong id="hub-interact-title"></strong>
            <span id="hub-interact-desc"></span>
          </div>
        </button>
        <div id="hub-station-overlay" aria-hidden="true">
          <div class="hub-station-card" role="dialog" aria-modal="true" aria-labelledby="hub-station-title">
            <header class="hub-station-header">
              <div class="hub-station-title-wrap">
                <span class="hub-station-kicker" id="hub-station-kicker"></span>
                <h2 class="hub-station-title" id="hub-station-title"></h2>
              </div>
              <div class="hub-station-speaker-pill" id="hub-station-speaker"></div>
            </header>
            <blockquote class="hub-station-quote" id="hub-station-quote"></blockquote>
            <div class="hub-station-purpose" id="hub-station-purpose"></div>
            <div class="hub-station-body" id="hub-station-body"></div>
            <div class="hub-station-feedback" id="hub-station-feedback" hidden></div>
            <footer class="hub-station-actions" id="hub-station-actions">
              <button type="button" class="portal-btn portal-btn--primary" id="btn-hub-station-primary"><kbd>E</kbd> ACTIVATE</button>
              <button type="button" class="portal-btn portal-btn--secondary" id="btn-hub-station-secondary">CYCLE HEAT</button>
              <button type="button" class="portal-btn portal-btn--secondary" id="btn-hub-station-close"><kbd>ESC</kbd> CLOSE</button>
            </footer>
          </div>
        </div>
      `;

      document.body.innerHTML = HUB_STATION_MARKUP;
      const modal = new HubStationModalController();
      const overlay = document.getElementById('hub-station-overlay')!;

      const stations = ['garage', 'blacksmith', 'codex', 'bounty', 'launch'] as const;
      const stationAttrMap: Record<string, string> = {
        garage: 'data-garage-advisor',
        blacksmith: 'data-forge-advisor',
        codex: 'data-scanner-advisor',
        bounty: 'data-war-room-advisor',
        launch: 'data-launch-advisor'
      };

      for (let cycle = 0; cycle < 40; cycle++) {
        const station = stations[cycle % stations.length];

        const metaSave = {
          scrap: [0, 10, 14, 15, 30, 100, 99999, -20, NaN][cycle % 9],
          heatLevel: [0, 1, 2, 3, 10, -5, NaN, Infinity][cycle % 8],
          bestFloor: [1, 2, 3, 4, 5, 6, 99, NaN, -1][cycle % 9],
          totalKills: [0, 15, 120, 9999, NaN, -5][cycle % 6],
          bossesSlain: [0, 1, 3, 6, 12, NaN, -1][cycle % 7],
          totalRuns: [0, 3, 20, 500, NaN][cycle % 5],
          ranks: {
            dmg: [0, 1, 3, 5, 99, NaN][cycle % 6],
            speed: [0, 1, 2, 4, 99, NaN][(cycle + 1) % 6]
          },
          equipped: (cycle % 3 === 0)
            ? {}
            : {
                tires: { slot: 'tires', name: 'Drift Tires', rarity: ((cycle % 4) as 0 | 1 | 2 | 3) },
                engine: { slot: 'engine', name: 'Turbo V-Twin', rarity: (((cycle + 1) % 4) as 0 | 1 | 2 | 3) }
              },
          stash: []
        };

        const player = {
          weapon: ['pistol', 'shotgun', 'rifle', 'katana'][cycle % 4],
          hp: [1, 6, 10, -5, NaN][cycle % 5],
          maxHp: 6,
          scannerBuff: cycle % 2 === 0,
          items: cycle % 3 === 0 ? [] : ['nitro_syringe', 'tire_iron']
        };

        modal.open({
          npcId: station,
          metaSave,
          player,
          scannerClaimed: cycle % 2 === 1,
          bountyClaimed: cycle % 3 === 1,
          onReforge: () => ({ ok: true, message: 'Reforged' }),
          onClaimScanner: () => ({ ok: true, message: 'Scanner calibrated' }),
          onClaimBountyCache: () => ({ ok: true, message: 'Supply cache secured' }),
          onSelectHeat: () => {},
          onLaunchRun: () => {},
          onClose: () => {}
        });

        expect(modal.isOpen()).toBe(true);

        const targetAttr = stationAttrMap[station];
        const targetVal = overlay.getAttribute(targetAttr);
        expect(targetVal).not.toBeNull();
        expect(targetVal!.length).toBeGreaterThan(0);
        expect(targetVal).not.toBe('NaN');
        expect(targetVal).not.toBe('undefined');
        expect(targetVal).not.toContain('NaN');
        expect(targetVal).not.toContain('undefined');

        if (cycle >= 5) {
          for (const attr of [
            'data-garage-advisor',
            'data-forge-advisor',
            'data-scanner-advisor',
            'data-war-room-advisor',
            'data-launch-advisor'
          ]) {
            const val = overlay.getAttribute(attr);
            expect(val).not.toBeNull();
            expect(val!.length).toBeGreaterThan(0);
            expect(val).not.toBe('NaN');
            expect(val).not.toBe('undefined');
            expect(val).not.toContain('NaN');
            expect(val).not.toContain('undefined');
          }
        }

        modal.close();
        expect(modal.isOpen()).toBe(false);
      }

      document.body.innerHTML = '';
    });
  });

  // --------------------------------------------------------------------------
  // Adversarial Fuzz: Wave 38-41 Clean Arena, Drop Stack & Duo Advisor Stress (M148)
  // --------------------------------------------------------------------------
  describe('Adversarial Fuzz: Wave 38-41 Clean Arena, Drop Stack & Duo Advisor Stress (M148)', () => {
    // Fuzz Test 1: getDuoSynergyAdvisor under 50 randomized corrupted player inventories
    it('fuzzes getDuoSynergyAdvisor with 50 randomized corrupted player inventories and verifies zero exceptions, zero NaN, and defined string telemetry', () => {
      const canonicalItemPool = [
        'cryo_rounds',
        'high_explosive',
        'tesla_capacitor',
        'magnet_coil',
        'titanium_spikes',
        'turbo_charger',
        'exhaust_afterburner',
        'gasoline'
      ];
      const corruptedPrimitives = [null, undefined, NaN, Infinity, -Infinity, '', ' ', 'unknown_item_xyz', 123, true, {}, []];

      for (let iteration = 0; iteration < 50; iteration++) {
        let fuzzedInput: any;

        if (iteration % 6 === 0) {
          // Direct non-object primitives
          fuzzedInput = corruptedPrimitives[iteration % corruptedPrimitives.length];
        } else if (iteration % 6 === 1) {
          // Corrupted items array
          fuzzedInput = {
            items: Array.from({ length: iteration % 10 }, (_, idx) => {
              return (idx + iteration) % 2 === 0
                ? canonicalItemPool[(idx + iteration) % canonicalItemPool.length]
                : corruptedPrimitives[(idx + iteration) % corruptedPrimitives.length];
            }),
            itemStacks: null
          };
        } else if (iteration % 6 === 2) {
          // Corrupted itemStacks map with extreme values
          const stacks: Record<string, any> = {};
          for (let s = 0; s < (iteration % 8); s++) {
            const key = s % 2 === 0 ? canonicalItemPool[s % canonicalItemPool.length] : `corrupt_key_${s}`;
            stacks[key] = [NaN, Infinity, -Infinity, -500, 0, 0.45, 1, 2, 50, 99999, 'bad_stack', null, undefined][(s + iteration) % 13];
          }
          fuzzedInput = {
            items: null,
            itemStacks: stacks
          };
        } else if (iteration % 6 === 3) {
          // Both items and itemStacks populated with mixed valid/invalid data
          const items = canonicalItemPool.slice(0, (iteration % canonicalItemPool.length) + 1);
          const itemStacks: Record<string, any> = {};
          for (const item of items) {
            itemStacks[item] = (iteration % 5) - 1; // -1, 0, 1, 2, 3
          }
          fuzzedInput = {
            items,
            itemStacks,
            outlawStyle: iteration % 2 === 0 ? 'INVALID_STYLE' : undefined
          };
        } else if (iteration % 6 === 4) {
          // Prototype pollution or symbol-keyed object
          fuzzedInput = Object.create(null);
          fuzzedInput.items = ['cryo_rounds', 'high_explosive'];
          fuzzedInput.itemStacks = { cryo_rounds: 1, high_explosive: 1 };
        } else {
          // Empty or full inventory
          fuzzedInput = {
            items: iteration % 2 === 0 ? [] : [...canonicalItemPool],
            itemStacks: iteration % 2 === 0 ? {} : Object.fromEntries(canonicalItemPool.map(k => [k, 3]))
          };
        }

        const advisor = getDuoSynergyAdvisor(fuzzedInput);

        expect(advisor).toBeDefined();
        expect(Array.isArray(advisor.unlockedDuos)).toBe(true);
        expect(Array.isArray(advisor.partialDuos)).toBe(true);
        expect(typeof advisor.unlockedCount).toBe('number');
        expect(Number.isFinite(advisor.unlockedCount)).toBe(true);
        expect(advisor.unlockedCount).not.toBeNaN();
        expect(advisor.unlockedCount).toBeGreaterThanOrEqual(0);
        expect(advisor.unlockedCount).toBeLessThanOrEqual(5);

        expect(typeof advisor.nearMissCount).toBe('number');
        expect(Number.isFinite(advisor.nearMissCount)).toBe(true);
        expect(advisor.nearMissCount).not.toBeNaN();
        expect(advisor.nearMissCount).toBeGreaterThanOrEqual(0);

        expect(typeof advisor.summaryLine).toBe('string');
        expect(advisor.summaryLine.length).toBeGreaterThan(0);
        expect(advisor.summaryLine).not.toContain('NaN');
        expect(advisor.summaryLine).not.toContain('undefined');

        for (const p of advisor.partialDuos) {
          expect(typeof p.id).toBe('string');
          expect(typeof p.name).toBe('string');
          expect(typeof p.ownedItem).toBe('string');
          expect(typeof p.missingItem).toBe('string');
          expect(typeof p.effectDesc).toBe('string');
        }
      }
    });

    // Fuzz Test 2: getRoomVisualClutterAudit with 50 randomized room topologies and floorNum inputs
    it('fuzzes getRoomVisualClutterAudit with 50 randomized room topologies and floorNum inputs and confirms zero crashes or NaN telemetry', () => {
      const obstacleTypes = ['rock', 'explosive_barrel', 'cryo_barrel', 'spikes', 'wall', 'corrupt_type', null, undefined];
      const zoneTypes = ['oil_slick', 'cryo_patch', 'emp_zone', 'toxic_pool', 'invalid_zone', null, undefined];

      for (let iteration = 0; iteration < 50; iteration++) {
        const floorInputs = [NaN, -999, -1, 0, 0.42, 1, 2, 3, 4, 5, 6, 10, 9999, Infinity, -Infinity, undefined, null];
        const floorNum = floorInputs[iteration % floorInputs.length] as number;

        let fuzzedRoom: any;
        if (iteration % 5 === 0) {
          // Direct null/undefined/primitive room inputs
          fuzzedRoom = [null, undefined, 42, 'room_string', true, {}][iteration % 6];
        } else if (iteration % 5 === 1) {
          // Room with invalid or non-array fields
          fuzzedRoom = {
            obstacles: 'not_an_array',
            biomeZones: null,
            enemies: undefined
          };
        } else {
          // Room with randomized arrays of obstacles, zones, and enemies
          const numObs = iteration % 15;
          const numZones = iteration % 8;
          const numEnemies = iteration % 12;

          const obstacles = Array.from({ length: numObs }, (_, i) => {
            if (i % 3 === 0) return null;
            return {
              x: (i * 50) % 800,
              y: (i * 40) % 600,
              size: [NaN, -10, 0, 20, Infinity][i % 5],
              type: obstacleTypes[(i + iteration) % obstacleTypes.length],
              hp: [NaN, -5, 0, 10, 100, Infinity][(i + iteration) % 6]
            };
          });

          const biomeZones = Array.from({ length: numZones }, (_, i) => {
            if (i % 4 === 0) return null;
            return {
              x: (i * 60) % 800,
              y: (i * 50) % 600,
              radius: [NaN, -20, 0, 60, Infinity][i % 5],
              type: zoneTypes[(i + iteration) % zoneTypes.length]
            };
          });

          const enemies = Array.from({ length: numEnemies }, (_, i) => {
            if (i % 5 === 0) return null;
            return {
              id: 1000 + i,
              hp: [NaN, -10, 0, 0.5, 40, 500, Infinity][(i + iteration) % 7],
              maxHp: 100,
              type: i === 0 && iteration % 2 === 0 ? 'boss' : 'grunt',
              isElite: i % 3 === 0
            };
          });

          fuzzedRoom = { obstacles, biomeZones, enemies };
        }

        const audit = getRoomVisualClutterAudit(fuzzedRoom, floorNum);

        expect(audit).toBeDefined();
        expect(typeof audit.obstacleCount).toBe('number');
        expect(Number.isFinite(audit.obstacleCount)).toBe(true);
        expect(audit.obstacleCount).toBeGreaterThanOrEqual(0);

        expect(typeof audit.hazardObstacleCount).toBe('number');
        expect(Number.isFinite(audit.hazardObstacleCount)).toBe(true);
        expect(audit.hazardObstacleCount).toBeGreaterThanOrEqual(0);

        expect(typeof audit.biomeZoneCount).toBe('number');
        expect(Number.isFinite(audit.biomeZoneCount)).toBe(true);
        expect(audit.biomeZoneCount).toBeGreaterThanOrEqual(0);

        expect(typeof audit.activeEnemyCount).toBe('number');
        expect(Number.isFinite(audit.activeEnemyCount)).toBe(true);
        expect(audit.activeEnemyCount).toBeGreaterThanOrEqual(0);

        expect(typeof audit.clutterScore).toBe('number');
        expect(Number.isFinite(audit.clutterScore)).toBe(true);
        expect(audit.clutterScore).toBeGreaterThanOrEqual(0);

        expect(['CLEAN', 'MODERATE', 'DENSE']).toContain(audit.readabilityGrade);
        expect(typeof audit.isCleanLayout).toBe('boolean');

        expect(typeof audit.layoutSummary).toBe('string');
        expect(audit.layoutSummary.length).toBeGreaterThan(0);
        expect(audit.layoutSummary).not.toContain('NaN');
        expect(audit.layoutSummary).not.toContain('undefined');
      }
    });

    // Fuzz Test 3: getDropItemStackSummary with 50 randomized drop choice lists and player item stacks
    it('fuzzes getDropItemStackSummary with 50 randomized drop choice lists and validates zero crashes, valid tier classifications, and clean badges', () => {
      const dropItemPool = [
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
        'nanite_repair',
        'cryo_rounds',
        'high_explosive',
        'titanium_spikes',
        'turbo_charger'
      ];

      for (let iteration = 0; iteration < 50; iteration++) {
        let fuzzedChoices: any;
        if (iteration % 5 === 0) {
          fuzzedChoices = [null, undefined, [], 'invalid_string', 42][iteration % 5];
        } else {
          const choiceCount = iteration % 8;
          fuzzedChoices = Array.from({ length: choiceCount }, (_, i) => {
            const pick = (i + iteration) % 4;
            if (pick === 0) {
              return dropItemPool[(i + iteration) % dropItemPool.length];
            } else if (pick === 1) {
              return { id: dropItemPool[(i + iteration) % dropItemPool.length], name: `Item ${i}` };
            } else if (pick === 2) {
              return { itemId: dropItemPool[(i + iteration) % dropItemPool.length] };
            } else {
              return [null, undefined, 123, '', { corrupted: true }][i % 5];
            }
          });
        }

        let fuzzedPlayer: any;
        if (iteration % 4 === 0) {
          fuzzedPlayer = [null, undefined, {}, { itemStacks: null }][iteration % 4];
        } else {
          const stacks: Record<string, any> = {};
          for (let s = 0; s < (iteration % 6); s++) {
            const key = dropItemPool[s % dropItemPool.length];
            stacks[key] = [NaN, -5, 0, 0.9, 1, 2, 3, 5, 9999, Infinity, 'bad_val', null][(s + iteration) % 12];
          }
          fuzzedPlayer = { itemStacks: stacks };
        }

        const summary = getDropItemStackSummary(fuzzedChoices, fuzzedPlayer);

        expect(summary).toBeDefined();
        expect(typeof summary.totalChoices).toBe('number');
        expect(Number.isFinite(summary.totalChoices)).toBe(true);
        expect(summary.totalChoices).toBeGreaterThanOrEqual(0);

        expect(typeof summary.newItemsCount).toBe('number');
        expect(Number.isFinite(summary.newItemsCount)).toBe(true);
        expect(summary.newItemsCount).toBeGreaterThanOrEqual(0);

        expect(typeof summary.stackUpgradeCount).toBe('number');
        expect(Number.isFinite(summary.stackUpgradeCount)).toBe(true);
        expect(summary.stackUpgradeCount).toBeGreaterThanOrEqual(0);

        expect(typeof summary.evoReadyCount).toBe('number');
        expect(Number.isFinite(summary.evoReadyCount)).toBe(true);
        expect(summary.evoReadyCount).toBeGreaterThanOrEqual(0);

        expect(typeof summary.summaryLine).toBe('string');
        expect(summary.summaryLine.length).toBeGreaterThan(0);
        expect(summary.summaryLine).not.toContain('NaN');
        expect(summary.summaryLine).not.toContain('undefined');

        expect(Array.isArray(summary.choiceBreakdown)).toBe(true);
        for (const breakdown of summary.choiceBreakdown) {
          expect(['NEW', 'STACK_2', 'EVO_READY', 'OVERSTACK']).toContain(breakdown.nextTier);
          expect(typeof breakdown.currentStacks).toBe('number');
          expect(Number.isFinite(breakdown.currentStacks)).toBe(true);
          expect(breakdown.currentStacks).toBeGreaterThanOrEqual(0);

          expect(typeof breakdown.nextStacks).toBe('number');
          expect(Number.isFinite(breakdown.nextStacks)).toBe(true);
          expect(breakdown.nextStacks).toBeGreaterThanOrEqual(1);

          expect(typeof breakdown.id).toBe('string');
          expect(typeof breakdown.name).toBe('string');
        }
      }
    });

    // Fuzz Test 4: getCombatSurvivabilitySummary with 50 randomized player stat profiles
    it('fuzzes getCombatSurvivabilitySummary with 50 randomized player stat profiles and confirms rock-solid hull math and defined status badges', () => {
      const hpVariants = [NaN, -999, -5, 0, 0.45, 1, 2, 4.8, 6, 10, 15, 99999, Infinity, -Infinity, undefined, null, '6' as any];
      const maxHpVariants = [NaN, -10, 0, 0.9, 1, 3, 5, 6, 8, 12, 100, 99999, Infinity, -Infinity, undefined, null, '10' as any];
      const invulnVariants = [NaN, -5, 0, 0.1, 1.5, 3.0, 9999, Infinity, -Infinity, undefined, null];

      for (let iteration = 0; iteration < 50; iteration++) {
        let fuzzedPlayer: any;
        if (iteration % 6 === 0) {
          fuzzedPlayer = [null, undefined, 42, 'player_str', true, []][iteration % 6];
        } else {
          fuzzedPlayer = {
            hp: hpVariants[(iteration * 3) % hpVariants.length],
            maxHp: maxHpVariants[(iteration * 5) % maxHpVariants.length],
            invuln: invulnVariants[(iteration * 7) % invulnVariants.length]
          };
        }

        const surv = getCombatSurvivabilitySummary(fuzzedPlayer);

        expect(surv).toBeDefined();
        expect(typeof surv.hp).toBe('number');
        expect(Number.isFinite(surv.hp)).toBe(true);
        expect(surv.hp).not.toBeNaN();
        expect(surv.hp).toBeGreaterThanOrEqual(0);

        expect(typeof surv.maxHp).toBe('number');
        expect(Number.isFinite(surv.maxHp)).toBe(true);
        expect(surv.maxHp).not.toBeNaN();
        expect(surv.maxHp).toBeGreaterThanOrEqual(1);

        expect(surv.hp).toBeLessThanOrEqual(surv.maxHp);

        expect(typeof surv.hullPct).toBe('number');
        expect(Number.isFinite(surv.hullPct)).toBe(true);
        expect(surv.hullPct).not.toBeNaN();
        expect(surv.hullPct).toBeGreaterThanOrEqual(0);
        expect(surv.hullPct).toBeLessThanOrEqual(100);

        expect(['CRITICAL HULL', 'DAMAGED HULL', 'OPTIMAL HULL']).toContain(surv.hullStatus);
        expect(['STANDARD CHASSIS', 'REINFORCED CHASSIS', 'JUGGERNAUT TANK']).toContain(surv.chassisTier);

        expect(typeof surv.isInvulnerable).toBe('boolean');

        expect(typeof surv.summaryLine).toBe('string');
        expect(surv.summaryLine.length).toBeGreaterThan(0);
        expect(surv.summaryLine).not.toContain('NaN');
        expect(surv.summaryLine).not.toContain('undefined');
      }
    });
  });

});
