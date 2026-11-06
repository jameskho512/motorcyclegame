/**
 * Unit Test Suite for Physics, Kinematics & Collision Systems
 * Tests:
 * - src/systems/physics.ts
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  BASE_PLAYER_SPEED,
  ACCEL_LERP_FACTOR,
  STEER_LERP_FACTOR,
  PASSIVE_FRICTION_BASE,
  NOS_SPEED_MULT,
  NOS_DRAIN_RATE,
  NOS_RECHARGE_RATE,
  NOS_DELAY,
  NOS_LOCK_THRESHOLD,
  SKID_MARK_THRESHOLD,
  getAngleDiff,
  calculateEffectiveSpeed,
  updateNos,
  updateBikeKinematics,
  circleIntersectsAABB,
  resolveCircleAABB,
  resolveObstacleCollisions,
  handleWallAndDoors,
  updatePlayerPhysics
} from '@/systems/physics';
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  WALL_THICKNESS,
  PLAYER_RADIUS,
  MAX_SKIDS_PER_ROOM,
  type PlayerState,
  type Room,
  type Obstacle
} from '@/types/game';

function createMockPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    x: ARENA_WIDTH / 2,
    y: ARENA_HEIGHT / 2,
    vx: 0,
    vy: 0,
    radius: PLAYER_RADIUS,
    bikeAngle: 0,
    aimAngle: 0,
    baseSpeed: BASE_PLAYER_SPEED,
    hp: 6,
    maxHp: 6,
    coins: 0,
    invuln: 0,
    weapon: 'pistol',
    runWeapons: {},
    fireTimer: 0,
    dmgMult: 1.0,
    fireRateMult: 1.0,
    speedMult: 1.0,
    projSpeedMult: 1.0,
    blastMult: 1.0,
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

describe('Physics Module: Kinematics, NOS, and Collisions (src/systems/physics.ts)', () => {
  let player: PlayerState;
  let room: Room;

  beforeEach(() => {
    player = createMockPlayer();
    room = createMockRoom();
  });

  describe('Angular difference wrapping', () => {
    it('wraps difference within [-PI, PI]', () => {
      // 0 to PI/2
      expect(getAngleDiff(Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2);
      // PI - (-PI) = 2PI -> 0
      expect(getAngleDiff(Math.PI, -Math.PI)).toBeCloseTo(0);
      // -3.0 to 3.0: shortest turn is ~0.28 rad
      const diff = getAngleDiff(-3.0, 3.0);
      expect(Math.abs(diff)).toBeLessThanOrEqual(Math.PI);
      expect(diff).toBeCloseTo(Math.PI * 2 - 6.0, 4);
    });
  });

  describe('Speed calculation with items and NOS', () => {
    it('calculates base effective speed with no modifiers', () => {
      const speed = calculateEffectiveSpeed(player, false);
      expect(speed).toBe(BASE_PLAYER_SPEED);
    });

    it('applies speedMult multiplier', () => {
      player.speedMult = 1.25;
      const speed = calculateEffectiveSpeed(player, false);
      expect(speed).toBe(BASE_PLAYER_SPEED * 1.25);
    });

    it('stacks +10% speed per Racing Slicks item', () => {
      player.itemStacks.racing_slicks = 3;
      const speed = calculateEffectiveSpeed(player, false);
      expect(speed).toBeCloseTo(BASE_PLAYER_SPEED * (1 + 0.10 * 3));
    });

    it('applies 1.7x multiplier when boosting with NOS', () => {
      player.itemStacks.racing_slicks = 1;
      const speedBoost = calculateEffectiveSpeed(player, true);
      const expected = BASE_PLAYER_SPEED * (1 + 0.10) * NOS_SPEED_MULT;
      expect(speedBoost).toBeCloseTo(expected);
    });
  });

  describe('Kinematics, velocity lerp and passive friction', () => {
    it('lerps velocity towards target direction when input is active', () => {
      const dt = 0.05;
      const { moved } = updateBikeKinematics(player, 1, 0, false, dt, room);
      expect(moved).toBe(true);

      const targetVx = BASE_PLAYER_SPEED;
      const expectedVx = targetVx * Math.min(1, dt * ACCEL_LERP_FACTOR);
      expect(player.vx).toBeCloseTo(expectedVx, 2);
      expect(player.vy).toBe(0);
    });

    it('normalizes diagonal input vector so speed does not exceed effSpeed', () => {
      const dt = 1.0; // large dt so lerp factor reaches 1.0
      updateBikeKinematics(player, 1, 1, false, dt, room);
      const totalSpeed = Math.hypot(player.vx, player.vy);
      expect(totalSpeed).toBeCloseTo(BASE_PLAYER_SPEED, 2);
    });

    it('decays velocity via passive friction (0.001^dt) when input is zero', () => {
      player.vx = 200;
      player.vy = 150;
      const dt = 0.1;
      const { moved } = updateBikeKinematics(player, 0, 0, false, dt, room);
      expect(moved).toBe(false);

      const frictionFactor = Math.pow(PASSIVE_FRICTION_BASE, dt);
      expect(player.vx).toBeCloseTo(200 * frictionFactor, 4);
      expect(player.vy).toBeCloseTo(150 * frictionFactor, 4);
    });

    it('rotates bike angle towards velocity vector with steering lerp', () => {
      player.vx = 0;
      player.vy = 100; // moving South (PI/2 rad)
      player.bikeAngle = 0; // facing East
      const dt = 0.05;

      updateBikeKinematics(player, 0, 1, false, dt, room);
      const diff = Math.PI / 2;
      const expectedAngle = diff * Math.min(1, dt * STEER_LERP_FACTOR);
      expect(player.bikeAngle).toBeCloseTo(expectedAngle, 3);
    });

    it('generates tyre skid mark on sharp turns (|diff| > 0.45 rad)', () => {
      player.bikeAngle = 0;
      player.vx = 0;
      player.vy = -200; // moving North (-PI/2), diff ~ -1.57 rad > 0.45
      const { skidCreated, diff } = updateBikeKinematics(player, 0, -1, false, 0.05, room);

      expect(Math.abs(diff)).toBeGreaterThan(SKID_MARK_THRESHOLD);
      expect(skidCreated).toBe(true);
      expect(room.skids.length).toBe(1);
      expect(room.skids[0].x).toBe(player.x);
      expect(room.skids[0].y).toBe(player.y);
    });

    it('strictly caps skid marks at MAX_SKIDS_PER_ROOM (130)', () => {
      // Pre-fill 130 skids
      for (let i = 0; i < MAX_SKIDS_PER_ROOM; i++) {
        room.skids.push({ x: 100, y: 100, angle: 0 });
      }
      expect(room.skids.length).toBe(130);

      player.bikeAngle = 0;
      player.vx = 0;
      player.vy = 200;
      const { skidCreated } = updateBikeKinematics(player, 0, 1, false, 0.05, room);
      expect(skidCreated).toBe(false);
      expect(room.skids.length).toBe(130);
    });
  });

  describe('NOS Booster State Machine', () => {
    it('activates and drains NOS at 35/s when moving and shift is held', () => {
      player.nos = 100;
      const dt = 0.2;
      const { boosting } = updateNos(player, true, true, dt);

      expect(boosting).toBe(true);
      expect(player.nos).toBeCloseTo(100 - NOS_DRAIN_RATE * dt);
      expect(player.nosDelay).toBe(NOS_DELAY);
    });

    it('does NOT drain NOS or boost when player is stationary', () => {
      player.nos = 100;
      const { boosting } = updateNos(player, true, false, 0.1);
      expect(boosting).toBe(false);
      expect(player.nos).toBe(100);
    });

    it('locks NOS when fully depleted and denies boost', () => {
      player.nos = 5;
      const { boosting } = updateNos(player, true, true, 0.5); // drains 17.5 > 5
      expect(boosting).toBe(true);
      expect(player.nos).toBe(0);
      expect(player.nosLock).toBe(true);

      // Subsequent attempt while locked
      const next = updateNos(player, true, true, 0.1);
      expect(next.boosting).toBe(false);
    });

    it('delays recharge by 0.7s before recharging at 16/s', () => {
      player.nos = 50;
      player.nosDelay = 0.7;

      // 0.3s of inactivity: still delayed (0.4s remaining)
      updateNos(player, false, false, 0.3);
      expect(player.nos).toBe(50);
      expect(player.nosDelay).toBeCloseTo(0.4);

      // Remaining 0.4s: delay expires, recharging during this frame (0.4 * 16 = 6.4)
      updateNos(player, false, false, 0.4);
      expect(player.nosDelay).toBeCloseTo(0.0);
      expect(player.nos).toBeCloseTo(50 + NOS_RECHARGE_RATE * 0.4);

      // Next 0.5s: recharges by NOS_RECHARGE_RATE * 0.5 = 8
      const prevNos = player.nos;
      updateNos(player, false, false, 0.5);
      expect(player.nos).toBeCloseTo(prevNos + NOS_RECHARGE_RATE * 0.5);
    });

    it('clears nosLock once NOS recharges to >= 25%', () => {
      player.nos = 24.5;
      player.nosLock = true;
      player.nosDelay = 0;

      // Recharge across threshold (16 * 0.1 = 1.6 -> 26.1 >= 25)
      updateNos(player, false, false, 0.1);
      expect(player.nos).toBeGreaterThanOrEqual(NOS_LOCK_THRESHOLD);
      expect(player.nosLock).toBe(false);
    });
  });

  describe('Circle-AABB collision resolution', () => {
    it('detects circle and AABB intersection accurately', () => {
      // Box centered at (200, 200), size 42 (x: 179..221, y: 179..221)
      expect(circleIntersectsAABB(225, 200, 17, 200, 200, 42, 42)).toBe(true);
      expect(circleIntersectsAABB(250, 200, 17, 200, 200, 42, 42)).toBe(false);
    });

    it('resolves penetration and pushes circle out of AABB', () => {
      // Box centered at (200, 200), size 42 -> right edge at 221
      // Circle at (225, 200) with radius 17 penetrates by (17 - (225 - 221)) = 13px
      const ent = { x: 225, y: 200, radius: 17 };
      const resolved = resolveCircleAABB(ent, 200, 200, 42, 42);
      expect(resolved).toBe(true);
      expect(ent.x).toBeCloseTo(238, 2);
      expect(ent.y).toBe(200);
      expect(circleIntersectsAABB(ent.x, ent.y, ent.radius, 200, 200, 42, 42)).toBe(false);
    });

    it('safely handles zero-distance singularity without NaN', () => {
      const ent = { x: 200, y: 200, radius: 17 }; // exactly at center of AABB
      const resolved = resolveCircleAABB(ent, 200, 200, 42, 42);
      expect(resolved).toBe(true);
      expect(Number.isFinite(ent.x)).toBe(true);
      expect(Number.isFinite(ent.y)).toBe(true);
      expect(ent.y).toBe(200 - 17);
    });

    it('resolves collision against multiple room obstacles', () => {
      // Player at (230, 200) penetrates obstacle at (200, 200), size 42 (edge at 221)
      player.x = 230;
      player.y = 200;
      const obstacles: Obstacle[] = [
        { x: 200, y: 200, size: 42, type: 'rock', hp: 99999 },
        { x: 500, y: 500, size: 42, type: 'barrel', hp: 24 }
      ];
      const count = resolveObstacleCollisions(player, obstacles);
      expect(count).toBe(1);
      expect(player.x).toBeCloseTo(238, 2);
    });
  });

  describe('Wall boundaries and doorway transitions', () => {
    it('clamps player within arena wall boundaries in solid walls', () => {
      // Wall = 58, radius = 17 -> min = 75, max = 645
      player.x = 100;
      player.y = 50; // trying to move past North wall away from doorway
      const transition = handleWallAndDoors(player, room);
      expect(transition).toBeNull();
      expect(player.y).toBe(WALL_THICKNESS + PLAYER_RADIUS);
    });

    it('blocks passage through doorways when room is NOT cleared', () => {
      room.cleared = false;
      room.doors.N = true;
      player.x = ARENA_WIDTH / 2; // at doorway center
      player.y = 40; // past North boundary
      const transition = handleWallAndDoors(player, room);
      expect(transition).toBeNull();
      expect(player.y).toBe(WALL_THICKNESS + PLAYER_RADIUS);
    });

    it('triggers North room transition when room IS cleared and player crosses threshold', () => {
      room.cleared = true;
      room.doors.N = true;
      player.x = ARENA_WIDTH / 2;
      player.y = WALL_THICKNESS - 12; // 46 < 48 (WALL - 10)

      const transition = handleWallAndDoors(player, room);
      expect(transition).not.toBeNull();
      expect(transition).toEqual({
        dx: 0,
        dy: -1,
        newX: ARENA_WIDTH / 2,
        newY: ARENA_HEIGHT - WALL_THICKNESS - PLAYER_RADIUS - 8
      });
    });

    it('triggers South room transition when player crosses South doorway', () => {
      room.cleared = true;
      room.doors.S = true;
      player.x = ARENA_WIDTH / 2;
      player.y = ARENA_HEIGHT - WALL_THICKNESS + 12;

      const transition = handleWallAndDoors(player, room);
      expect(transition).not.toBeNull();
      expect(transition).toEqual({
        dx: 0,
        dy: 1,
        newX: ARENA_WIDTH / 2,
        newY: WALL_THICKNESS + PLAYER_RADIUS + 8
      });
    });

    it('triggers West and East room transitions properly', () => {
      room.cleared = true;
      room.doors.W = true;
      player.x = WALL_THICKNESS - 12;
      player.y = ARENA_HEIGHT / 2;
      const transW = handleWallAndDoors(player, room);
      expect(transW).toEqual({
        dx: -1,
        dy: 0,
        newX: ARENA_WIDTH - WALL_THICKNESS - PLAYER_RADIUS - 8,
        newY: ARENA_HEIGHT / 2
      });

      room.doors.E = true;
      player.x = ARENA_WIDTH - WALL_THICKNESS + 12;
      player.y = ARENA_HEIGHT / 2;
      const transE = handleWallAndDoors(player, room);
      expect(transE).toEqual({
        dx: 1,
        dy: 0,
        newX: WALL_THICKNESS + PLAYER_RADIUS + 8,
        newY: ARENA_HEIGHT / 2
      });
    });
  });

  describe('Full integrated physics step updatePlayerPhysics', () => {
    it('integrates position, kinematics, and collisions in single frame', () => {
      player.x = 360;
      player.y = 360;
      const dt = 0.05;
      const result = updatePlayerPhysics(
        player,
        { ix: 1, iy: 0, shift: true },
        room,
        dt
      );

      expect(result.boosting).toBe(true);
      expect(result.moved).toBe(true);
      expect(player.vx).toBeGreaterThan(0);
      expect(player.x).toBeGreaterThan(360);
      expect(result.transition).toBeNull();
    });
  });
});
