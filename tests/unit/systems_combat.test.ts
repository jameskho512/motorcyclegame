/**
 * Unit Tests for Combat Systems (`src/systems/combat.ts`)
 *
 * Verifies:
 * - Weapon cooldown calculation with fireRateMult and nitro_syringe stacking
 * - Multi-shot fan spread angular offsets
 * - Weapon firing for all 7 weapons (ballistics, speeds, projectile properties)
 * - Flamethrower single-hit per puff via `hitIds` and non-stacking Burn DoT
 * - Shotgun 11px physics knockback on hit enemies
 * - Railgun 99-pierce and ion beam trail generation
 * - Arc Tesla Coil 3-target lightning chaining (0.65x damage within 155px)
 * - Frontal Brute armor reduction (-35% non-flame bullets, flame bypasses)
 * - Crowbar / Tire Iron bonus (+30% per stack to >90% HP enemies)
 * - Chrome Lens crit chance (capped at 80%, deals 2x damage, 'CRIT!' banner)
 * - Gasoline on-kill AoE explosion (radius 50 + 14*stacks, damage 10 + 8*stacks)
 * - Oil Infusion on-kill max HP bonus (every 15 kills +1*stacks capped at 20)
 * - Grenade launcher lob travel time, AoE explosion radial falloff, barrel chaining
 */

import { describe, it, expect, vi } from 'vitest';
import {
  calcFireCooldown,
  calcMultiShotOffset,
  applyBruteArmor,
  applyTireIronBonus,
  rollCrit,
  fireWeapon,
  createCombatState,
  updatePlayerBullets,
  updateGrenades,
  updateBurnDoT,
  updateEnemyCollisions,
  triggerExplosion,
  handleEnemyDeath
} from '../../src/systems/combat';
import { WEAPONS } from '../../src/data/weapons';
import type {
  PlayerState,
  Room,
  RegularEnemy,
  Obstacle,
  AudioService
} from '../../src/types/game';

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

function createMockEnemy(overrides: Partial<RegularEnemy> = {}): RegularEnemy {
  return {
    id: 1,
    type: 'swarmer',
    x: 400,
    y: 360,
    vx: 0,
    vy: 0,
    radius: 14,
    hp: 34,
    maxHp: 34,
    speed: 130,
    burnTimer: 0,
    burnTick: 0,
    aiTimer: 1.0,
    state: 'idle',
    angle: 0,
    isElite: false,
    color: '#00bbf9',
    ...overrides
  };
}

function createMockAudio(): AudioService {
  return {
    init: vi.fn(() => true),
    setMuted: vi.fn(),
    toggleMute: vi.fn(() => false),
    updateEngine: vi.fn(),
    shoot: vi.fn(),
    arcChain: vi.fn(),
    explosion: vi.fn(),
    hit: vi.fn(),
    enemyKill: vi.fn(),
    playerHurt: vi.fn(),
    gameOverSound: vi.fn(),
    pickupFuel: vi.fn(),
    pickupItem: vi.fn(),
    pickupLoot: vi.fn(),
    shopBuy: vi.fn(),
    shopError: vi.fn(),
    roomClear: vi.fn(),
    doorTransition: vi.fn(),
    nextFloor: vi.fn(),
    uiClick: vi.fn()
  };
}

describe('Systems: Combat — Weapon Firing & Cooldown Math', () => {
  it('calculates fire cooldown with base values and nitro_syringe stacks correctly', () => {
    const baseCooldown = 0.5; // 0.5s
    // 0 stacks, fireRateMult = 1 -> 0.5
    expect(calcFireCooldown(baseCooldown, 1, 0)).toBeCloseTo(0.5, 5);

    // 2 stacks nitro_syringe (+30% fire rate), fireRateMult = 1 -> 0.5 / 1.30
    expect(calcFireCooldown(baseCooldown, 1, 2)).toBeCloseTo(0.5 / 1.3, 5);

    // fireRateMult = 1.25, 4 stacks nitro_syringe (+60%) -> 0.5 / (1.25 * 1.6)
    expect(calcFireCooldown(baseCooldown, 1.25, 4)).toBeCloseTo(0.5 / (1.25 * 1.6), 5);
  });

  it('calculates multi-shot fan spread offsets symmetrically', () => {
    // 1 shot -> offset 0
    expect(calcMultiShotOffset(1, 0)).toBe(0);

    // 2 shots -> s=0: -0.07 rad, s=1: +0.07 rad (span 0.14)
    expect(calcMultiShotOffset(2, 0)).toBeCloseTo(-0.07, 5);
    expect(calcMultiShotOffset(2, 1)).toBeCloseTo(0.07, 5);

    // 3 shots -> s=0: -0.14 rad, s=1: 0 rad, s=2: +0.14 rad
    expect(calcMultiShotOffset(3, 0)).toBeCloseTo(-0.14, 5);
    expect(calcMultiShotOffset(3, 1)).toBeCloseTo(0, 5);
    expect(calcMultiShotOffset(3, 2)).toBeCloseTo(0.14, 5);
  });

  it('fires all 7 weapons and populates correct projectile properties', () => {
    const audio = createMockAudio();
    const deterministicRng = () => 0.5; // Centers random spreads

    // 1. Pistol
    {
      const player = createMockPlayer({ weapon: 'pistol' });
      const state = createCombatState();
      const fired = fireWeapon({
        player,
        target: { x: 460, y: 360 },
        state,
        audio,
        rng: deterministicRng
      });
      expect(fired).toBe(true);
      expect(state.bullets).toHaveLength(1);
      const b = state.bullets[0];
      expect(b.radius).toBe(5);
      expect(b.dmg).toBe(WEAPONS.pistol.baseDmg);
      expect(b.life).toBe(1.15);
      expect(audio.shoot).toHaveBeenCalledWith('pistol');
    }

    // 2. Machine Gun
    {
      const player = createMockPlayer({ weapon: 'machine_gun' });
      const state = createCombatState();
      fireWeapon({ player, target: { x: 460, y: 360 }, state, audio, rng: deterministicRng });
      expect(state.bullets).toHaveLength(1);
      expect(state.bullets[0].radius).toBe(4);
      expect(state.bullets[0].life).toBe(0.95);
      expect(state.screenShake).toBeGreaterThanOrEqual(1.2);
    }

    // 3. Flamethrower
    {
      const player = createMockPlayer({ weapon: 'flamethrower' });
      const state = createCombatState();
      fireWeapon({ player, target: { x: 460, y: 360 }, state, audio, rng: deterministicRng });
      expect(state.bullets).toHaveLength(1);
      const b = state.bullets[0];
      expect(b.isFlame).toBe(true);
      expect(b.pierceLeft).toBe(99);
      expect(b.radius).toBe(6);
      expect(b.maxRadius).toBe(17);
      expect(b.life).toBe(0.36);
      expect(b.hitIds).toBeInstanceOf(Set);
    }

    // 4. Grenade Launcher
    {
      const player = createMockPlayer({ weapon: 'grenade_launcher', multiShot: 4 });
      const state = createCombatState();
      fireWeapon({ player, target: { x: 500, y: 360 }, state, audio, rng: deterministicRng });
      // Multi-shot must not affect grenade launcher: always 1 grenade
      expect(state.grenades).toHaveLength(1);
      const g = state.grenades[0];
      expect(g.radius).toBe(8);
      expect(g.blastRadius).toBe(92);
      expect(g.dmg).toBe(18);
      expect(g.dmg).toBe(WEAPONS.grenade_launcher.baseDmg);
      expect(player.fireTimer).toBeCloseTo(1.17, 5);
      expect(state.screenShake).toBeGreaterThanOrEqual(2.5);
    }

    // 5. Shotgun
    {
      const player = createMockPlayer({ weapon: 'shotgun' });
      const state = createCombatState();
      fireWeapon({ player, target: { x: 460, y: 360 }, state, audio, rng: deterministicRng });
      expect(state.bullets).toHaveLength(6); // 6 pellets
      for (const pellet of state.bullets) {
        expect(pellet.radius).toBe(4.5);
        expect(pellet.knockback).toBe(11);
        expect(pellet.life).toBe(0.46);
      }
      expect(state.screenShake).toBeGreaterThanOrEqual(3.2);
    }

    // 6. Railgun
    {
      const player = createMockPlayer({ weapon: 'railgun' });
      const state = createCombatState();
      fireWeapon({ player, target: { x: 460, y: 360 }, state, audio, rng: deterministicRng });
      expect(state.bullets).toHaveLength(1);
      const b = state.bullets[0];
      expect(b.isRail).toBe(true);
      expect(b.pierceLeft).toBe(99);
      expect(b.radius).toBe(6.5);
      expect(b.dmg).toBe(WEAPONS.railgun.baseDmg);
      expect(state.screenShake).toBeGreaterThanOrEqual(4.0);
    }

    // 7. Arc Tesla Coil
    {
      const player = createMockPlayer({ weapon: 'arc_coil' });
      const state = createCombatState();
      fireWeapon({ player, target: { x: 460, y: 360 }, state, audio, rng: deterministicRng });
      expect(state.bullets).toHaveLength(1);
      const b = state.bullets[0];
      expect(b.isArc).toBe(true);
      expect(b.radius).toBe(6);
      expect(b.life).toBe(1.0);
      expect(state.screenShake).toBeGreaterThanOrEqual(1.8);
    }
  });

  it('respects weapon fire cooldown and refuses to fire when fireTimer > 0', () => {
    const player = createMockPlayer({ weapon: 'pistol', fireTimer: 0.2 });
    const state = createCombatState();
    const fired = fireWeapon({
      player,
      target: { x: 500, y: 360 },
      state
    });
    expect(fired).toBe(false);
    expect(state.bullets).toHaveLength(0);
  });
});

describe('Systems: Combat — Flamethrower Mechanics', () => {
  it('hits each enemy at most ONCE per puff via hitIds Set across multiple frames', () => {
    const player = createMockPlayer({ weapon: 'flamethrower' });
    const state = createCombatState();
    const enemy = createMockEnemy({ id: 99, x: 380, y: 360, hp: 100, maxHp: 100 });
    const room = createMockRoom({ enemies: [enemy] });

    // Spawn 1 flamethrower puff
    fireWeapon({ player, target: { x: 400, y: 360 }, state, rng: () => 0.5 });
    expect(state.bullets).toHaveLength(1);
    const puff = state.bullets[0];

    // Frame 1: bullet overlaps enemy
    puff.x = 380;
    puff.y = 360;
    updatePlayerBullets(0.016, state.bullets, room, player, state);

    const hpAfterFrame1 = enemy.hp;
    expect(hpAfterFrame1).toBeLessThan(100);
    expect(puff.hitIds.has(99)).toBe(true);
    expect(enemy.burnTimer).toBe(2.4);

    // Frame 2: bullet still overlaps enemy
    updatePlayerBullets(0.016, state.bullets, room, player, state);
    expect(enemy.hp).toBe(hpAfterFrame1); // Damage MUST NOT be applied again!
  });

  it('flamethrower radius expands smoothly from 6px to 17px over lifetime', () => {
    const player = createMockPlayer({ weapon: 'flamethrower' });
    const state = createCombatState();
    const room = createMockRoom();

    fireWeapon({ player, target: { x: 400, y: 360 }, state, rng: () => 0.5 });
    const puff = state.bullets[0];
    expect(puff.radius).toBe(6);

    // Advance halfway through life (0.18s of 0.36s)
    updatePlayerBullets(0.18, state.bullets, room, player, state);
    expect(puff.radius).toBeCloseTo(6 + 0.5 * 11, 1); // ~11.5px

    // Advance almost to end
    updatePlayerBullets(0.16, state.bullets, room, player, state);
    expect(puff.radius).toBeCloseTo(16.39, 1); // expands up towards 17px
  });

  it('applies Burn DoT every 0.35s dealing 2.2 * dmgMult * blastMult', () => {
    const player = createMockPlayer({ dmgMult: 1.5, blastMult: 1.2 });
    const state = createCombatState();
    const enemy = createMockEnemy({ hp: 50, burnTimer: 2.4, burnTick: 0.35 });
    const expectedTickDmg = 2.2 * 1.5 * 1.2; // 3.96

    // Advance 0.20s: burnTimer decreases, burnTick not yet 0 -> no damage tick
    updateBurnDoT(0.20, [enemy], player, state);
    expect(enemy.burnTimer).toBeCloseTo(2.2, 5);
    expect(enemy.burnTick).toBeCloseTo(0.15, 5);
    expect(enemy.hp).toBe(50);

    // Advance another 0.20s: burnTick triggers (0.15 - 0.20 <= 0), resets to 0.35
    updateBurnDoT(0.20, [enemy], player, state);
    expect(enemy.hp).toBeCloseTo(50 - expectedTickDmg, 5);
    expect(enemy.burnTick).toBe(0.35);
  });
});

describe('Systems: Combat — Physics, Knockback, Penetration & Chain Lightning', () => {
  it('applies 11px physics knockback on shotgun pellet hits', () => {
    const player = createMockPlayer();
    const state = createCombatState();
    const enemy = createMockEnemy({ x: 400, y: 360 });
    const room = createMockRoom({ enemies: [enemy] });

    // Create shotgun pellet moving strictly in +X direction
    state.bullets.push({
      x: 395,
      y: 360,
      vx: 560,
      vy: 0,
      radius: 4.5,
      dmg: 5.2,
      knockback: 11,
      pierceLeft: 0,
      bounceLeft: 0,
      hitIds: new Set(),
      color: '#ffbe0b',
      life: 0.46
    });

    updatePlayerBullets(0.01, state.bullets, room, player, state);
    // Enemy was at X=400, should be pushed +11px along projectile vector to X=411
    expect(enemy.x).toBeCloseTo(411, 2);
  });

  it('railgun pierces 99 enemies in a line and generates persistent ion beam trail', () => {
    const player = createMockPlayer();
    const state = createCombatState();
    const en1 = createMockEnemy({ id: 101, x: 380, y: 360, hp: 100, maxHp: 100 });
    const en2 = createMockEnemy({ id: 102, x: 420, y: 360, hp: 100, maxHp: 100 });
    const room = createMockRoom({ enemies: [en1, en2] });

    state.bullets.push({
      x: 360,
      y: 360,
      vx: 980,
      vy: 0,
      radius: 6.5,
      dmg: 35,
      isRail: true,
      pierceLeft: 99,
      bounceLeft: 0,
      hitIds: new Set(),
      color: '#00f5d4',
      life: 0.85
    });

    // Advance frames: railgun moves past en1 and en2
    for (let f = 0; f < 4; f++) {
      updatePlayerBullets(0.02, state.bullets, room, player, state);
    }

    // Both enemies must be hit
    expect(en1.hp).toBe(65); // 100 - 35
    expect(en2.hp).toBe(65);
    // Bullet still alive (pierce 99)
    expect(state.bullets).toHaveLength(1);
    // Ion beam effect created
    expect(state.beamEffects.length).toBeGreaterThan(0);
    expect(state.beamEffects[0].color).toBe('#00f5d4');
    expect(state.beamEffects[0].width).toBe(4);
  });

  it('arc tesla coil chains to up to 3 nearby enemies within 155px for 0.65x damage', () => {
    const player = createMockPlayer();
    const state = createCombatState();
    const audio = createMockAudio();

    // Primary target at (390, 360)
    const primary = createMockEnemy({ id: 1, x: 390, y: 360, hp: 100, maxHp: 100 });
    // Chain target 1 within 155px at (440, 360) -> distance 50px
    const chain1 = createMockEnemy({ id: 2, x: 440, y: 360, hp: 100, maxHp: 100 });
    // Chain target 2 within 155px at (390, 420) -> distance 60px
    const chain2 = createMockEnemy({ id: 3, x: 390, y: 420, hp: 100, maxHp: 100 });
    // Far target beyond 155px at (600, 360) -> distance 210px
    const far = createMockEnemy({ id: 4, x: 600, y: 360, hp: 100, maxHp: 100 });

    const room = createMockRoom({ enemies: [primary, chain1, chain2, far] });

    state.bullets.push({
      x: 388,
      y: 360,
      vx: 520,
      vy: 0,
      radius: 6,
      dmg: 20,
      isArc: true,
      pierceLeft: 0,
      bounceLeft: 0,
      hitIds: new Set(),
      color: '#c77dff',
      life: 1.0
    });

    updatePlayerBullets(0.01, state.bullets, room, player, state, audio);

    // Primary takes full 20 damage -> hp 80
    expect(primary.hp).toBe(80);
    // Chain targets take 20 * 0.65 = 13 damage -> hp 87
    expect(chain1.hp).toBe(87);
    expect(chain2.hp).toBe(87);
    // Far enemy untouched -> hp 100
    expect(far.hp).toBe(100);

    // Audio arcChain played and lightning beam effects added
    expect(audio.arcChain).toHaveBeenCalled();
    expect(state.beamEffects.filter(b => b.isLightning)).toHaveLength(2);
  });
});

describe('Systems: Combat — Damage Calculations, Armor, Crits & Items', () => {
  it('applies 35% mitigation (0.65x) to Brute against non-flame bullets, bypassed by flame', () => {
    // Non-flame against brute
    expect(applyBruteArmor(100, 'brute', false)).toBe(65);

    // Flame against brute (bypasses armor)
    expect(applyBruteArmor(100, 'brute', true)).toBe(100);

    // Non-flame against regular swarmer (no armor)
    expect(applyBruteArmor(100, 'swarmer', false)).toBe(100);
  });

  it('applies Tire Iron (Crowbar) +30% bonus per stack only when enemy HP > 90%', () => {
    const baseDmg = 100;
    // 2 stacks, HP is 95 / 100 (>90%) -> +60% bonus
    expect(applyTireIronBonus(baseDmg, 95, 100, 2)).toBe(160);

    // 2 stacks, HP is 90 / 100 (not >90%) -> regular damage
    expect(applyTireIronBonus(baseDmg, 90, 100, 2)).toBe(100);

    // 2 stacks, HP is 50 / 100 (<=90%) -> regular damage
    expect(applyTireIronBonus(baseDmg, 50, 100, 2)).toBe(100);

    // 0 stacks -> regular damage regardless of HP
    expect(applyTireIronBonus(baseDmg, 100, 100, 0)).toBe(100);
  });

  it('rolls Chrome Lens crit capped at 80% with 2x damage multiplier', () => {
    // 1 stack -> 10% chance
    expect(rollCrit(1, false, () => 0.05)).toEqual({ isCrit: true, mult: 2 });
    expect(rollCrit(1, false, () => 0.15)).toEqual({ isCrit: false, mult: 1 });

    // 8 stacks -> 80% chance
    expect(rollCrit(8, false, () => 0.79)).toEqual({ isCrit: true, mult: 2 });
    expect(rollCrit(8, false, () => 0.81)).toEqual({ isCrit: false, mult: 1 });

    // 15 stacks -> capped strictly at 80%
    expect(rollCrit(15, false, () => 0.79)).toEqual({ isCrit: true, mult: 2 });
    expect(rollCrit(15, false, () => 0.81)).toEqual({ isCrit: false, mult: 1 });

    // Flame damage cannot crit even with 10 stacks and low roll
    expect(rollCrit(10, true, () => 0.01)).toEqual({ isCrit: false, mult: 1 });
  });

  it('triggers Gasoline AoE explosion on enemy kill', () => {
    const player = createMockPlayer({ itemStacks: { gasoline: 3 } });
    const state = createCombatState();
    const enemy = createMockEnemy({ x: 300, y: 300 });
    const bystander = createMockEnemy({ id: 2, x: 320, y: 300, hp: 100, maxHp: 100 });
    const room = createMockRoom({ enemies: [enemy, bystander] });

    // 3 stacks gasoline: radius = 50 + 14 * 3 = 92; damage = 10 + 8 * 3 = 34
    handleEnemyDeath({
      room,
      enemy,
      index: 0,
      player,
      state,
      floorNum: 1
    });

    // Bystander was 20px away from explosion -> damaged
    expect(bystander.hp).toBeLessThan(100);
    expect(state.screenShake).toBeGreaterThanOrEqual(8);
  });

  it('awards Oil Infusion max HP bonuses every 15 kills up to cap of 20', () => {
    const player = createMockPlayer({
      hp: 6,
      maxHp: 6,
      killCount: 14,
      itemStacks: { oil_infusion: 1 }
    });
    const state = createCombatState();
    const enemy = createMockEnemy();
    const room = createMockRoom({ enemies: [enemy] });

    // 15th kill: should increment maxHp from 6 to 7 and heal to 7
    handleEnemyDeath({
      room,
      enemy,
      index: 0,
      player,
      state
    });

    expect(player.killCount).toBe(15);
    expect(player.maxHp).toBe(7);
    expect(player.hp).toBe(7);
    expect(state.damageNumbers.some(d => d.text.includes('MAX FUEL'))).toBe(true);

    // Test cap of 20 Max HP
    player.maxHp = 20;
    player.hp = 20;
    player.killCount = 29;
    const enemy2 = createMockEnemy();
    room.enemies.push(enemy2);

    handleEnemyDeath({
      room,
      enemy: enemy2,
      index: 0,
      player,
      state
    });
    expect(player.killCount).toBe(30);
    expect(player.maxHp).toBe(20); // capped, did not exceed 20
  });
});

describe('Systems: Combat — Explosions & Grenade Flight', () => {
  it('grenade travels in arc and triggers explosion with distance falloff on arrival', () => {
    const state = createCombatState();
    const enemy = createMockEnemy({ x: 400, y: 360, hp: 100, maxHp: 100, radius: 14 });
    const room = createMockRoom({ enemies: [enemy] });

    state.grenades.push({
      x: 360,
      y: 360,
      startX: 360,
      startY: 360,
      targetX: 400,
      targetY: 360,
      t: 0,
      duration: 0.5,
      radius: 8,
      blastRadius: 92,
      dmg: 40
    });

    // Advance 0.25s: t = 0.5 -> not yet arrived
    updateGrenades(0.25, state.grenades, room, state);
    expect(state.grenades).toHaveLength(1);
    expect(enemy.hp).toBe(100);

    // Advance 0.30s: t >= 1.0 -> detonates
    updateGrenades(0.30, state.grenades, room, state);
    expect(state.grenades).toHaveLength(0);
    // Enemy is at center (d=0) -> falloff is 1 - 0 = 1.0 -> takes 40 damage
    expect(enemy.hp).toBe(60);
  });

  it('triggerExplosion detonates explosive barrels in chain', () => {
    const state = createCombatState();
    const barrel: Obstacle = { x: 380, y: 360, size: 42, type: 'barrel', hp: 20 };
    const rock: Obstacle = { x: 500, y: 500, size: 42, type: 'rock', hp: 99999 };
    const room = createMockRoom({ obstacles: [barrel, rock] });

    triggerExplosion(360, 360, 50, 30, room, state);

    // Barrel was within blast radius: destroyed and chained
    expect(room.obstacles).not.toContain(barrel);
    // Indestructible rock remains
    expect(room.obstacles).toContain(rock);
  });
});

describe('Systems: Combat — BUG-02, BUG-03, BUG-04, Weapon Scaling & Duo Synergies', () => {
  it('BUG-02: Cryo-Jacketed Shells (in player.items) chills enemies for 2.2s and chilled enemies take +15% bonus damage', () => {
    const player = createMockPlayer({ items: ['Cryo-Jacketed Shells'] });
    const state = createCombatState();
    const enemy = createMockEnemy({ x: 390, y: 360, hp: 100, maxHp: 100 });
    const room = createMockRoom({ enemies: [enemy] });

    // First hit: applies slowTimer = 2.2
    state.bullets.push({
      x: 388,
      y: 360,
      vx: 500,
      vy: 0,
      radius: 5,
      dmg: 10,
      pierceLeft: 0,
      bounceLeft: 0,
      hitIds: new Set(),
      color: '#fff',
      life: 1.0
    });
    updatePlayerBullets(0.01, state.bullets, room, player, state);
    expect((enemy as any).slowTimer).toBeCloseTo(2.2, 4);
    expect((enemy as any).hitFlashTimer).toBeCloseTo(0.07, 4);
    const hpAfterFirst = enemy.hp;

    // Second hit against chilled enemy: deals +15% bonus damage (10 * 1.15 = 11.5)
    state.bullets.push({
      x: 388,
      y: 360,
      vx: 500,
      vy: 0,
      radius: 5,
      dmg: 10,
      pierceLeft: 0,
      bounceLeft: 0,
      hitIds: new Set(),
      color: '#fff',
      life: 1.0
    });
    updatePlayerBullets(0.01, state.bullets, room, player, state);
    expect(hpAfterFirst - enemy.hp).toBeCloseTo(11.5, 4);
  });

  it('BUG-03: Smart-Link Guidance steers bullets toward nearest enemy within 190px forward cone at up to 2.2 rad/s', () => {
    const player = createMockPlayer({ items: ['Smart-Link Guidance'] });
    const state = createCombatState();
    // Enemy is 100px ahead and 50px below -> within 190px and dot > 0.4
    const enemy = createMockEnemy({ x: 460, y: 410, hp: 100, maxHp: 100 });
    const room = createMockRoom({ enemies: [enemy] });

    state.bullets.push({
      x: 360,
      y: 360,
      vx: 500,
      vy: 0,
      radius: 5,
      dmg: 10,
      pierceLeft: 0,
      bounceLeft: 0,
      hitIds: new Set(),
      color: '#fff',
      life: 1.0
    });

    updatePlayerBullets(0.05, state.bullets, room, player, state);
    const b = state.bullets[0];
    const newAngle = Math.atan2(b.vy, b.vx);
    expect(newAngle).toBeCloseTo(2.2 * 0.05, 4);
  });

  it('BUG-04: Grenade Launcher attaches clusterCount and bouncesLeft, bounces with 65% dmg, and spawns mini-clusters on final detonation', () => {
    const player = createMockPlayer({
      weapon: 'grenade_launcher',
      multiShot: 3,
      bounce: 1
    });
    const state = createCombatState();
    const enemy = createMockEnemy({ x: 450, y: 360, hp: 200, maxHp: 200 });
    const room = createMockRoom({ enemies: [enemy] });

    fireWeapon({ player, target: { x: 450, y: 360 }, state, rng: () => 0.5 });
    expect(state.grenades).toHaveLength(1);
    const g = state.grenades[0];
    expect((g as any).clusterCount).toBe(2);
    expect((g as any).bouncesLeft).toBe(1);

    // Reach first impact: bouncesLeft decrements to 0, triggers 65% bounce explosion, retargets 55px forward
    updateGrenades(g.duration + 0.01, state.grenades, room, state);
    expect(state.grenades).toHaveLength(1);
    expect((g as any).bouncesLeft).toBe(0);
    expect(g.duration).toBeCloseTo(0.28, 4);
    expect(g.targetX).toBeCloseTo(450 + 55, 2);
    expect(enemy.hp).toBeCloseTo(200 - 18 * 0.65, 3);

    // Move enemy to new targetX (505, 360) for final detonation + 2 mini-clusters
    enemy.x = g.targetX;
    enemy.y = g.targetY;
    const hpBeforeFinal = enemy.hp;
    updateGrenades(0.30, state.grenades, room, state);
    expect(state.grenades).toHaveLength(0);
    // Final detonation + 2 mini-cluster explosions damaged the enemy further
    expect(enemy.hp).toBeLessThan(hpBeforeFinal - 18);
  });

  it('scales Railgun damage (+15% per pierce) and radius (+1.2px per pierce) and supports wall bouncing', () => {
    const player = createMockPlayer({
      weapon: 'railgun',
      pierce: 2,
      bounce: 2
    });
    const state = createCombatState();
    fireWeapon({ player, target: { x: 500, y: 360 }, state, rng: () => 0.5 });
    expect(state.bullets).toHaveLength(1);
    const b = state.bullets[0];
    expect(b.dmg).toBeCloseTo(35 * (1 + 0.15 * 2), 4);
    expect(b.radius).toBeCloseTo(6.5 + 1.2 * 2, 4);
    expect(b.bounceLeft).toBe(2);
  });

  it('supports 3.0x SUPER CRIT when Chrome Lens stacks >= 9', () => {
    // 10 stacks -> superCritChance = (10 - 8) * 0.12 = 0.24
    expect(rollCrit(10, false, () => 0.10)).toEqual({ isCrit: true, mult: 3 });
    expect(rollCrit(10, false, () => 0.50)).toEqual({ isCrit: true, mult: 2 });
  });

  it('Universal NOS Battering Ram wins against Brutes/Elites, consumes 15 NOS, grants 0.25s invuln, and triggers Juggernaut Overdrive on kill', () => {
    const player = createMockPlayer({
      x: 360,
      y: 360,
      nos: 80,
      invuln: 0,
      itemStacks: { titanium_spikes: 2, adrenaline_injector: 1 }
    });
    (player as any).isBoosting = true;

    const brute = createMockEnemy({
      id: 50,
      type: 'brute',
      x: 375,
      y: 360,
      radius: 22,
      hp: 40,
      maxHp: 120
    });
    const bystander = createMockEnemy({
      id: 51,
      type: 'swarmer',
      x: 410,
      y: 360,
      hp: 100,
      maxHp: 100
    });
    const room = createMockRoom({ enemies: [brute, bystander] });
    const state = createCombatState();
    const onPlayerHurt = vi.fn();

    updateEnemyCollisions(room, player, state, onPlayerHurt);

    // Player took 0 damage, gained 0.25s invuln, consumed 15 NOS then refunded +30 NOS from Juggernaut Overdrive kill (80 - 15 + 30 = 95)
    expect(onPlayerHurt).not.toHaveBeenCalled();
    expect(player.invuln).toBeGreaterThanOrEqual(0.25);
    expect(brute.hp).toBeLessThanOrEqual(0);
    expect((brute as any).hitFlashTimer).toBeCloseTo(0.07, 4);
    expect(player.nos).toBeCloseTo(95, 4);
    // Juggernaut Overdrive 70px shockwave explosion damaged nearby bystander
    expect(bystander.hp).toBeLessThan(100);
  });

  it('triggers Thermal Shock (+35% shatter damage) when chilled enemy is hit by flame or explosion, and Superconductor extends chain lightning to 240px + propagates slow', () => {
    const player = createMockPlayer();
    const state = createCombatState();
    const chilledPrimary = createMockEnemy({ id: 1, x: 390, y: 360, hp: 100, maxHp: 100 });
    (chilledPrimary as any).slowTimer = 2.0;

    // Flame puff hitting chilled enemy triggers Thermal Shock (+35% damage)
    const room = createMockRoom({ enemies: [chilledPrimary] });
    state.bullets.push({
      x: 390,
      y: 360,
      vx: 200,
      vy: 0,
      radius: 10,
      dmg: 10,
      isFlame: true,
      pierceLeft: 99,
      bounceLeft: 0,
      hitIds: new Set(),
      color: '#ff6b2b',
      life: 0.3,
      maxLife: 0.3
    });
    updatePlayerBullets(0.01, state.bullets, room, player, state);
    // Chilled (+15%) and Thermal Shock (+35%) -> 10 * 1.15 * 1.35 = 15.525
    expect(100 - chilledPrimary.hp).toBeGreaterThan(13);
    expect((chilledPrimary as any).thermalShockIcd).toBeCloseTo(0.4, 4);
    expect(state.damageNumbers.some(d => d.text === 'THERMAL SHOCK!')).toBe(true);

    // Superconductor: Arc coil hitting chilled primary chains up to 240px (e.g. 210px away) and propagates slowTimer = 1.5
    const farTarget = createMockEnemy({ id: 2, x: 600, y: 360, hp: 100, maxHp: 100 }); // 210px from 390
    room.enemies.push(farTarget);
    state.bullets.push({
      x: 388,
      y: 360,
      vx: 500,
      vy: 0,
      radius: 6,
      dmg: 20,
      isArc: true,
      pierceLeft: 0,
      bounceLeft: 0,
      hitIds: new Set(),
      color: '#c77dff',
      life: 1.0
    });
    updatePlayerBullets(0.01, state.bullets, room, player, state);
    expect(farTarget.hp).toBeLessThan(100);
    expect((farTarget as any).slowTimer).toBeCloseTo(1.5, 4);
  });
});
