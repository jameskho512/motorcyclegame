/**
 * MOTO-ROGUE: Physics, Kinematics & Collision Systems
 *
 * Implements:
 * 1. Motorcycle Kinematics & Velocity Lerp:
 *    - Base speed: 265 px/s
 *    - Racing Slicks item bonus: +10% per stack
 *    - NOS Boost multiplier: 1.7x (+70%)
 *    - Acceleration lerp: min(1, 11 * dt)
 *    - Passive friction decay: 0.001^dt
 * 2. Steering & Drift Dynamics:
 *    - Target angle calculation from velocity vector
 *    - Wrapped angular difference in [-PI, PI]
 *    - Steering lerp: min(1, 12 * dt)
 *    - Skid mark generation when |diff| > 0.45 rad (capped at 130 per room)
 * 3. NOS Booster State Machine:
 *    - Drain: 35/s while holding Shift + moving
 *    - Recharge delay: 0.7s
 *    - Recharge rate: 16/s up to nosMax (100)
 *    - Empty lockout: nosLock enabled when nos <= 0; locked until nos >= 25% (25)
 * 4. Circle-AABB Collision Resolution:
 *    - Player circle (radius 17) vs obstacle AABB (size 42)
 *    - Zero-distance singularity handling
 * 5. Boundary & Doorway Transitions:
 *    - Playable box: [WALL + radius, ARENA - WALL - radius] = [75, 645]
 *    - Door passage bounds: |player.x - 360| < 34 or |player.y - 360| < 34
 *    - Room transitions when crossing doors in cleared rooms
 *
 * Parity reference: moto-rogue/index.html L2045-L2131, L2769-L2842
 */

import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  WALL_THICKNESS,
  DOOR_HALF_WIDTH,
  PLAYER_RADIUS,
  MAX_SKIDS_PER_ROOM,
  type PlayerState,
  type Room,
  type Obstacle
} from '../types/game';

// Kinematics and engine tuning constants
export const BASE_PLAYER_SPEED = 265;
export const ACCEL_LERP_FACTOR = 11;
export const STEER_LERP_FACTOR = 12;
export const PASSIVE_FRICTION_BASE = 0.001;
export const RACING_SLICKS_BONUS = 0.10;
export const NOS_SPEED_MULT = 1.7;
export const NOS_DRAIN_RATE = 35;
export const NOS_RECHARGE_RATE = 16;
export const NOS_DELAY = 0.7;
export const NOS_LOCK_THRESHOLD = 25;
export const SKID_MARK_THRESHOLD = 0.45;

/**
 * Calculates normalized angular difference wrapped to [-PI, PI].
 */
export function getAngleDiff(target: number, current: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}

/**
 * Computes effective speed including player multipliers, Racing Slicks, and active NOS boost.
 * effSpeed = baseSpeed * speedMult * (1 + 0.10 * racing_slicks) * (boosting ? 1.7 : 1.0)
 */
export function calculateEffectiveSpeed(player: PlayerState, boosting: boolean): number {
  const slicksCount = player.itemStacks?.racing_slicks ?? 0;
  const slicksBonus = 1 + RACING_SLICKS_BONUS * slicksCount;
  const boostMult = boosting ? NOS_SPEED_MULT : 1.0;
  return player.baseSpeed * player.speedMult * slicksBonus * boostMult;
}

/**
 * Updates NOS booster charge, delay, and lockout state.
 * index.html L2053-L2064
 */
export function updateNos(
  player: PlayerState,
  shiftRequested: boolean,
  isMoving: boolean,
  dt: number
): { boosting: boolean } {
  let boosting = false;

  if (shiftRequested && isMoving && player.nos > 0 && !player.nosLock) {
    boosting = true;
    player.nos = Math.max(0, player.nos - NOS_DRAIN_RATE * dt);
    player.nosDelay = NOS_DELAY;
    if (player.nos <= 0) {
      player.nosLock = true;
    }
  } else {
    player.nosDelay -= dt;
    if (player.nosDelay <= 0) {
      player.nos = Math.min(player.nosMax, player.nos + NOS_RECHARGE_RATE * dt);
    }
    if (player.nosLock && player.nos >= NOS_LOCK_THRESHOLD) {
      player.nosLock = false;
    }
  }

  player.isBoosting = boosting;
  return { boosting };
}

export interface KinematicsResult {
  moved: boolean;
  skidCreated: boolean;
  diff: number;
}

/**
 * Updates motorcycle velocity lerp, passive friction, steering rotation, and skid mark placement.
 * index.html L2084-L2120
 */
export function updateBikeKinematics(
  player: PlayerState,
  ix: number,
  iy: number,
  boosting: boolean,
  dt: number,
  room?: Room
): KinematicsResult {
  let moved = false;
  let skidCreated = false;
  let diff = 0;

  let effSpeed = calculateEffectiveSpeed(player, boosting);

  if ((player.driftBoostTimer || 0) > 0) {
    player.driftBoostTimer = Math.max(0, (player.driftBoostTimer || 0) - dt);
    effSpeed *= 1.22;
  }

  // Biome zone effects
  const pRadius = player.radius || PLAYER_RADIUS;
  let isBoostStrip = false;
  let isIcePatch = false;
  let isOilSlick = false;

  if (room?.biomeZones) {
    for (const z of room.biomeZones) {
      if (Math.hypot(player.x - z.x, player.y - z.y) <= z.radius + pRadius) {
        if (z.type === 'boost_strip') isBoostStrip = true;
        if (z.type === 'ice_patch') isIcePatch = true;
        if (z.type === 'oil_slick') isOilSlick = true;
      }
    }
  }

  (player as any).onBoostStrip = isBoostStrip;
  if (isBoostStrip) {
    effSpeed *= 1.35;
    if (typeof player.nos === 'number' && typeof player.nosMax === 'number') {
      player.nos = Math.min(player.nosMax, player.nos + dt * 14);
    }
  }
  if (isIcePatch) {
    effSpeed *= 1.15;
    if (player.nosDelay > 0) {
      player.nosDelay = Math.max(0, player.nosDelay - dt);
    }
    if (player.nos >= 25) {
      player.nosLock = false;
    }
  }

  const activePowerslide = !!(player as any).spacePowerslide && (ix !== 0 || iy !== 0);

  if (ix !== 0 || iy !== 0) {
    moved = true;
    const len = Math.hypot(ix, iy);
    const normIx = ix / len;
    const normIy = iy / len;

    const targetVx = normIx * effSpeed;
    const targetVy = normIy * effSpeed;

    let accelLerp = Math.min(1, dt * ACCEL_LERP_FACTOR);
    if (isIcePatch) {
      accelLerp *= 0.45;
    }
    player.vx += (targetVx - player.vx) * accelLerp;
    player.vy += (targetVy - player.vy) * accelLerp;

    const targetAngle = Math.atan2(player.vy, player.vx);
    diff = getAngleDiff(targetAngle, player.bikeAngle);

    let steerLerp = Math.min(1, dt * STEER_LERP_FACTOR);
    if (isOilSlick) {
      steerLerp *= 0.6;
    }
    if (activePowerslide) {
      steerLerp *= 0.45;
    }
    player.bikeAngle += diff * steerLerp;

    const skidThreshold = activePowerslide ? 0.18 : SKID_MARK_THRESHOLD;
    if ((Math.abs(diff) > skidThreshold || activePowerslide || isOilSlick) && room) {
      if (room.skids.length < MAX_SKIDS_PER_ROOM) {
        room.skids.push({ x: player.x, y: player.y, angle: player.bikeAngle });
        skidCreated = true;
      }
    }
  } else {
    // Passive friction deceleration when no directional input is held
    const frictionFactor = Math.pow(PASSIVE_FRICTION_BASE, dt);
    player.vx *= frictionFactor;
    player.vy *= frictionFactor;
  }

  const highSpeed = boosting || Math.hypot(player.vx, player.vy) > 220;
  if (activePowerslide && (Math.abs(diff) > 0.18 || activePowerslide)) {
    player.driftCharge = Math.min(1.0, (player.driftCharge || 0) + dt * 1.85);
  } else if (Math.abs(diff) > 0.28 && highSpeed) {
    player.driftCharge = Math.min(1.0, (player.driftCharge || 0) + dt * 1.45);
  } else if (Math.abs(diff) > SKID_MARK_THRESHOLD) {
    player.driftCharge = Math.min(1.0, (player.driftCharge || 0) + dt * 1.35);
  } else {
    player.driftCharge = Math.max(0, (player.driftCharge || 0) - dt * (highSpeed ? 0.35 : 0.55));
  }

  const isMoving = moved || Math.hypot(player.vx, player.vy) > 10;
  if (isOilSlick && isMoving) {
    player.driftCharge = Math.min(1, (player.driftCharge || 0) + dt * 0.65);
  }

  return { moved, skidCreated, diff };
}

/**
 * Checks if a circle intersects an Axis-Aligned Bounding Box (AABB).
 * index.html L2819-L2824
 */
export function circleIntersectsAABB(
  cx: number,
  cy: number,
  cr: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  const halfW = rw / 2;
  const halfH = rh / 2;
  const closestX = Math.max(rx - halfW, Math.min(cx, rx + halfW));
  const closestY = Math.max(ry - halfH, Math.min(cy, ry + halfH));
  return Math.hypot(cx - closestX, cy - closestY) < cr;
}

/**
 * Resolves collision between a moving circular entity and an AABB obstacle.
 * Displaces entity along minimum penetration vector.
 * index.html L2826-L2842
 */
export function resolveCircleAABB(
  ent: { x: number; y: number; radius: number },
  rx: number,
  ry: number,
  rw: number,
  rh: number
): boolean {
  const halfW = rw / 2;
  const halfH = rh / 2;
  const closestX = Math.max(rx - halfW, Math.min(ent.x, rx + halfW));
  const closestY = Math.max(ry - halfH, Math.min(ent.y, ry + halfH));
  const dx = ent.x - closestX;
  const dy = ent.y - closestY;
  const dist = Math.hypot(dx, dy);

  if (dist < ent.radius) {
    if (dist === 0) {
      ent.y -= ent.radius;
    } else {
      const overlap = ent.radius - dist;
      ent.x += (dx / dist) * overlap;
      ent.y += (dy / dist) * overlap;
    }
    return true;
  }
  return false;
}

/**
 * Resolves player collision with all obstacles in a room.
 */
export function resolveObstacleCollisions(
  player: PlayerState,
  obstacles: readonly Obstacle[]
): number {
  let collisions = 0;
  for (const ob of obstacles) {
    if (resolveCircleAABB(player, ob.x, ob.y, ob.size, ob.size)) {
      collisions++;
    }
  }
  return collisions;
}

export interface RoomTransition {
  dx: number;
  dy: number;
  newX: number;
  newY: number;
}

/**
 * Enforces wall boundaries and detects doorway transitions into adjacent rooms.
 * index.html L2769-L2804
 */
export function handleWallAndDoors(
  player: PlayerState,
  room: Room
): RoomTransition | null {
  const radius = player.radius || PLAYER_RADIUS;
  const minC = WALL_THICKNESS + radius;
  const maxC = ARENA_WIDTH - WALL_THICKNESS - radius;
  const mid = ARENA_WIDTH / 2;

  // Doorway opening span: DOOR_HALF_WIDTH - 8 = 42 - 8 = 34px from center (68px opening)
  const inHorizDoor = Math.abs(player.x - mid) < DOOR_HALF_WIDTH - 8;
  const inVertDoor = Math.abs(player.y - mid) < DOOR_HALF_WIDTH - 8;

  let transition: RoomTransition | null = null;

  // North Door / Wall
  if (player.y < minC) {
    if (room.cleared && room.doors.N && inHorizDoor) {
      if (player.y < WALL_THICKNESS - 10) {
        transition = {
          dx: 0,
          dy: -1,
          newX: ARENA_WIDTH / 2,
          newY: ARENA_HEIGHT - WALL_THICKNESS - radius - 8
        };
      }
    } else {
      player.y = minC;
    }
  }

  // South Door / Wall
  if (player.y > maxC) {
    if (room.cleared && room.doors.S && inHorizDoor) {
      if (player.y > ARENA_HEIGHT - WALL_THICKNESS + 10) {
        transition = {
          dx: 0,
          dy: 1,
          newX: ARENA_WIDTH / 2,
          newY: WALL_THICKNESS + radius + 8
        };
      }
    } else {
      player.y = maxC;
    }
  }

  // West Door / Wall
  if (player.x < minC) {
    if (room.cleared && room.doors.W && inVertDoor) {
      if (player.x < WALL_THICKNESS - 10) {
        transition = {
          dx: -1,
          dy: 0,
          newX: ARENA_WIDTH - WALL_THICKNESS - radius - 8,
          newY: ARENA_HEIGHT / 2
        };
      }
    } else {
      player.x = minC;
    }
  }

  // East Door / Wall
  if (player.x > maxC) {
    if (room.cleared && room.doors.E && inVertDoor) {
      if (player.x > ARENA_WIDTH - WALL_THICKNESS + 10) {
        transition = {
          dx: 1,
          dy: 0,
          newX: WALL_THICKNESS + radius + 8,
          newY: ARENA_HEIGHT / 2
        };
      }
    } else {
      player.x = maxC;
    }
  }

  return transition;
}

export interface MovementInput {
  ix: number;
  iy: number;
  shift?: boolean;
}

export interface PhysicsStepResult {
  boosting: boolean;
  moved: boolean;
  skidCreated: boolean;
  transition: RoomTransition | null;
}

/**
 * Integrated physics step updating NOS, kinematics, position, obstacle collisions,
 * and boundary / doorway transitions in a single unified routine.
 */
export function updatePlayerPhysics(
  player: PlayerState,
  input: MovementInput,
  room: Room,
  dt: number
): PhysicsStepResult {
  const isMoving = input.ix !== 0 || input.iy !== 0;
  const { boosting } = updateNos(player, !!input.shift, isMoving, dt);
  const { moved, skidCreated } = updateBikeKinematics(
    player,
    input.ix,
    input.iy,
    boosting,
    dt,
    room
  );

  // Position integration
  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // Obstacle collisions
  resolveObstacleCollisions(player, room.obstacles);

  // Walls & doorways
  const transition = handleWallAndDoors(player, room);

  return {
    boosting,
    moved,
    skidCreated,
    transition
  };
}

export interface StyleAdrenalineBonus {
  rank: 'D' | 'C' | 'B' | 'A' | 'S' | 'SS' | 'SSS';
  nosRegenBonusPerSec: number;
  speedBonusMult: number;
}

export function getStyleAdrenalineBonus(styleScore: number = 12): StyleAdrenalineBonus {
  const s = Math.max(0, Math.min(100, Number(styleScore) || 0));
  if (s >= 92) return { rank: 'SSS', nosRegenBonusPerSec: 12, speedBonusMult: 1.15 };
  if (s >= 80) return { rank: 'SS', nosRegenBonusPerSec: 8, speedBonusMult: 1.10 };
  if (s >= 68) return { rank: 'S', nosRegenBonusPerSec: 5, speedBonusMult: 1.08 };
  if (s >= 52) return { rank: 'A', nosRegenBonusPerSec: 3, speedBonusMult: 1.05 };
  if (s >= 36) return { rank: 'B', nosRegenBonusPerSec: 1.5, speedBonusMult: 1.02 };
  if (s >= 20) return { rank: 'C', nosRegenBonusPerSec: 0.5, speedBonusMult: 1.0 };
  return { rank: 'D', nosRegenBonusPerSec: 0, speedBonusMult: 1.0 };
}
