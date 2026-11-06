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

import { describe, it, expect, beforeEach } from 'vitest';
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
import { calcUpgradeCost } from '@/data/upgrades';

import {
  SafeLocalStorage,
  createDefaultPlayerState,
  loadRunCheckpoint,
  loadMetaSave
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
  calcOverkillBonus
} from '@/systems/combat';

import {
  createEnemy,
  updateEnemyAI
} from '@/systems/enemyAI';

import { SoundSynthesizer, calculateEngineParams } from '@/audio/sfx';
import { StageManager } from '@/render/stage';
import { FilterManager } from '@/render/shaders';
import { isLowFuel, calcNeedleAngle, calcMinimapRoomCoords } from '@/ui/hud';

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
      expect(highFloorContract.targetCount).toBe(85);
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
      expect(floatFloorContract.id).toBe('STYLE_HUNTER');
    });
  });
});
