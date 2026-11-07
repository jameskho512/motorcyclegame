/**
 * MOTO-ROGUE: Combat System Module
 *
 * Implements:
 * 1. Weapon firing engine for all 7 weapons (Pistol, Machine Gun, Flamethrower,
 *    Grenade Launcher, Shotgun, Railgun, Arc Tesla Coil).
 * 2. Ballistics, projectile updates, wall bouncing, obstacle collisions.
 * 3. Area of Effect (AoE) explosions with distance falloff and explosive barrel chaining.
 * 4. Damage calculations including Frontal Brute armor mitigation, Tire Iron (>90% HP) bonus,
 *    Chrome Lens critical strike system (capped at 80%), and floating text / 'CRIT!' banners.
 * 5. Special effects: Flamethrower single-hit per puff via `hitIds` and 2.4s Burn DoT,
 *    Shotgun 11px physics knockback, Railgun 99-pierce with cyan ion beam trails,
 *    Arc Tesla Coil 3-target lightning chaining (0.65x damage).
 * 6. Kill effects: Gasoline AoE explosions, Oil Infusion max HP bonuses.
 *
 * Parity reference: moto-rogue/index.html L894-L974, L1811-L2025, L2130-L2290, L2498-L2570
 */

import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  WALL_THICKNESS,
  Point2D,
  PlayerState,
  PlayerBullet,
  EnemyBullet,
  Grenade,
  EnemyBomb,
  FloorHazard,
  Particle,
  BeamEffect,
  DamageNumber,
  Enemy,
  Room,
  AudioService,
  MetaSaveState,
  WeaponId
} from '../types/game';
import { WEAPONS, WeaponDef, isWeaponEvolved } from '../data/weapons';
import { DROP_ITEM_IDS, getActiveDuoSynergies } from '../data/upgrades';
import { genLoot } from '../data/equipment';

// ============================================================================
// 1. COMBAT STATE CONTAINER
// ============================================================================

export interface CombatState {
  bullets: PlayerBullet[];
  enemyBullets: EnemyBullet[];
  grenades: Grenade[];
  enemyBombs: EnemyBomb[];
  particles: Particle[];
  beamEffects: BeamEffect[];
  damageNumbers: DamageNumber[];
  screenShake: number;
}

/**
 * Creates a clean combat state container.
 */
export function createCombatState(): CombatState {
  return {
    bullets: [],
    enemyBullets: [],
    grenades: [],
    enemyBombs: [],
    particles: [],
    beamEffects: [],
    damageNumbers: [],
    screenShake: 0
  };
}

// ============================================================================
// 2. GEOMETRY & COLLISION UTILITIES
// ============================================================================

/**
 * Tests if a circle intersects an axis-aligned bounding box (AABB) centered at (rx, ry).
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
  const closestX = Math.max(rx - rw / 2, Math.min(cx, rx + rw / 2));
  const closestY = Math.max(ry - rh / 2, Math.min(cy, ry + rh / 2));
  return Math.hypot(cx - closestX, cy - closestY) <= cr;
}

/**
 * Pushes an entity out of an AABB obstacle.
 */
export function resolveCircleAABB(
  entity: { x: number; y: number; radius: number },
  rx: number,
  ry: number,
  rw: number,
  rh: number
): void {
  const halfW = rw / 2;
  const halfH = rh / 2;
  const closestX = Math.max(rx - halfW, Math.min(entity.x, rx + halfW));
  const closestY = Math.max(ry - halfH, Math.min(entity.y, ry + halfH));
  const dx = entity.x - closestX;
  const dy = entity.y - closestY;
  const dist = Math.hypot(dx, dy);
  if (dist < entity.radius) {
    if (dist === 0) {
      entity.x += entity.radius;
    } else {
      const overlap = entity.radius - dist;
      entity.x += (dx / dist) * overlap;
      entity.y += (dy / dist) * overlap;
    }
  }
}

// ============================================================================
// 3. STAT & DAMAGE CALCULATIONS
// ============================================================================

/**
 * Computes weapon fire cooldown interval taking player fireRateMult and nitro_syringe into account.
 * Formula: w.cooldown / (player.fireRateMult * (1 + 0.15 * itemStacks.nitro_syringe))
 */
export function calcFireCooldown(
  baseCooldown: number,
  fireRateMult: number,
  nitroSyringeStacks: number = 0
): number {
  const effectiveMult = (fireRateMult <= 0 ? 1 : fireRateMult) * (1 + 0.15 * Math.max(0, nitroSyringeStacks));
  return baseCooldown / effectiveMult;
}

/**
 * Computes angular offset for projectile s out of shots total.
 * Formula: (shots > 1) ? (s - (shots - 1) / 2) * 0.14 : 0
 */
export function calcMultiShotOffset(shots: number, index: number): number {
  if (shots <= 1) return 0;
  return (index - (shots - 1) / 2) * 0.14;
}

/**
 * Frontal Brute armor calculation: Brute takes 35% reduced damage from non-flame bullets (0.65x).
 * Flame damage completely bypasses armor.
 */
export function applyBruteArmor(dmg: number, enemyType: string, isFlame: boolean = false): number {
  if (enemyType === 'brute' && !isFlame) {
    return dmg * 0.65;
  }
  return dmg;
}

/**
 * Crowbar / Tire Iron bonus: +30% damage per stack against enemies with >90% HP.
 */
export function applyTireIronBonus(
  dmg: number,
  enemyHp: number,
  enemyMaxHp: number,
  tireIronStacks: number = 0
): number {
  if (tireIronStacks > 0 && enemyMaxHp > 0 && enemyHp > enemyMaxHp * 0.9) {
    return dmg * (1 + 0.3 * tireIronStacks);
  }
  return dmg;
}

/**
 * Crit Lens (Chrome Lens) roll: 10% crit chance per stack (capped at 80%) dealing 2x damage.
 * At >= 9 stacks, crits can roll into 3.0x SUPER CRIT!
 * Flame damage cannot crit.
 */
export function rollCrit(
  chromeLensStacks: number = 0,
  isFlame: boolean = false,
  rng: () => number = Math.random
): { isCrit: boolean; mult: number } {
  if (isFlame || chromeLensStacks <= 0) {
    return { isCrit: false, mult: 1 };
  }
  const critChance = Math.min(0.8, 0.1 * chromeLensStacks);
  const r = rng();
  const isCrit = r < critChance;
  if (!isCrit) {
    return { isCrit: false, mult: 1 };
  }
  if (chromeLensStacks >= 9) {
    const superCritChance = Math.min(0.75, (chromeLensStacks - 8) * 0.12);
    if (r < superCritChance) {
      return { isCrit: true, mult: 3 };
    }
  }
  return {
    isCrit: true,
    mult: 2
  };
}

export interface OverkillResult {
  isOverkill: boolean;
  bonusStyle: number;
  callout: string | null;
}

/**
 * Calculates overkill execution bonus when fatal damage exceeds negative 50% max HP.
 */
export function calcOverkillBonus(finalHp: number, maxHp: number): OverkillResult {
  const safeMax = Math.max(1, Number(maxHp) || 1);
  if (finalHp <= -safeMax * 0.5) {
    return { isOverkill: true, bonusStyle: 4, callout: '💀 OVERKILL!' };
  }
  return { isOverkill: false, bonusStyle: 0, callout: null };
}

/**
 * Checks whether the player has Cryo-Jacketed Shells (via mods, items, or itemStacks).
 */
export function hasCryoRounds(player: PlayerState): boolean {
  const mods = (player as any).mods;
  if (Array.isArray(mods) && (mods.includes('cryo_rounds') || mods.includes('Cryo-Jacketed Shells'))) {
    return true;
  }
  if (Array.isArray(player.items) && (player.items.includes('Cryo-Jacketed Shells') || player.items.includes('cryo_rounds'))) {
    return true;
  }
  if ((player.itemStacks?.cryo_rounds ?? 0) > 0) {
    return true;
  }
  return false;
}

/**
 * Checks whether the player has Smart-Link Guidance homing (via items, mods, or itemStacks).
 */
export function hasHomingMissiles(player: PlayerState): boolean {
  const mods = (player as any).mods;
  if (Array.isArray(mods) && (mods.includes('homing_missiles') || mods.includes('Smart-Link Guidance'))) {
    return true;
  }
  if (Array.isArray(player.items) && (player.items.includes('Smart-Link Guidance') || player.items.includes('homing_missiles'))) {
    return true;
  }
  if ((player.itemStacks?.homing_missiles ?? 0) > 0) {
    return true;
  }
  return false;
}

/**
 * Applies damage to an enemy entity and records floating combat text + 70ms white hit flash.
 */
export function damageEnemy(
  en: Enemy,
  amount: number,
  isBlast: boolean = false,
  state?: CombatState
): void {
  en.hp -= amount;
  (en as any).hitFlashTimer = 0.07;
  if (en.isDummy && en.hp <= 500) {
    en.hp = en.maxHp;
  }
  if (state && (isBlast || amount >= 15)) {
    addFloatingText(state, en.x, en.y - en.radius, `-${Math.round(amount)}`, isBlast ? '#ff9f1c' : '#ffffff');
  }
}

/**
 * Adds a floating combat text entry.
 */
export function addFloatingText(
  state: CombatState,
  x: number,
  y: number,
  text: string,
  color: string = '#ffffff'
): void {
  state.damageNumbers.push({
    x,
    y,
    text,
    color,
    life: 0.85,
    maxLife: 0.85
  });
}

/**
 * Formats hit telemetry for Sanctuary Target Range training dummies.
 */
export function formatDummyHitTelemetry(damage: number, isCrit: boolean = false): string {
  const rounded = Math.max(1, Math.round(Number(damage) || 0));
  return isCrit ? `🎯 CRIT ${rounded}!` : `🎯 HIT ${rounded}`;
}

/**
 * Spawns directional muzzle particles.
 */
export function spawnMuzzleParticles(
  state: CombatState,
  x: number,
  y: number,
  angle: number,
  color: string,
  count: number,
  rng: () => number = Math.random
): void {
  for (let i = 0; i < count; i++) {
    const a = angle + (rng() - 0.5) * 0.7;
    const spd = 55 + rng() * 130;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      radius: 2 + rng() * 2.5,
      color,
      life: 0.16 + rng() * 0.12,
      maxLife: 0.28
    });
  }
}

// ============================================================================
// 4. WEAPON FIRING ENGINE
// ============================================================================

export interface FireWeaponOptions {
  player: PlayerState;
  target: Point2D;
  state: CombatState;
  audio?: AudioService;
  rng?: () => number;
}

/**
 * Fires the player's active weapon if cooldown has elapsed.
 * Returns true if a shot was fired.
 */
export function fireWeapon({
  player,
  target,
  state,
  audio,
  rng = Math.random
}: FireWeaponOptions): boolean {
  if (player.fireTimer > 0) return false;

  const w: WeaponDef = WEAPONS[player.weapon] || WEAPONS.pistol;
  const nitroStacks = player.itemStacks?.nitro_syringe ?? 0;
  player.fireTimer = calcFireCooldown(w.cooldown, player.fireRateMult, nitroStacks);

  if (audio) {
    audio.shoot(player.weapon);
  }

  // Update player aim angle based on target
  player.aimAngle = Math.atan2(target.y - player.y, target.x - player.x);

  const mx = player.x + Math.cos(player.aimAngle) * 20;
  const my = player.y + Math.sin(player.aimAngle) * 20;
  const shots = player.weapon === 'grenade_launcher' ? 1 : Math.max(1, player.multiShot || 1);
  const evolved = isWeaponEvolved(player.weapon, player);

  for (let s = 0; s < shots; s++) {
    const multiOffset = calcMultiShotOffset(shots, s);
    const baseAngle = player.aimAngle + multiOffset;

    switch (player.weapon) {
      case 'pistol': {
        const ang = baseAngle + (rng() - 0.5) * 0.04; // ±0.02 rad
        const spd = w.projSpeed * player.projSpeedMult;
        const bulletColor = evolved ? '#ffd60a' : w.color;
        state.bullets.push({
          x: mx,
          y: my,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          radius: evolved ? 6.5 : 5,
          dmg: w.baseDmg * player.dmgMult * (evolved ? 1.35 : 1),
          pierceLeft: player.pierce,
          bounceLeft: evolved ? player.bounce + 2 : player.bounce,
          hitIds: new Set(),
          color: bulletColor,
          life: 1.15
        });
        spawnMuzzleParticles(state, mx, my, ang, bulletColor, evolved ? 5 : 3, rng);
        break;
      }

      case 'machine_gun': {
        const spd = w.projSpeed * player.projSpeedMult;
        if (evolved) {
          // Hyper-Vulcan Gatling: twin parallel bullet streams offset perpendicular by -4px and +4px
          const perpX = -Math.sin(baseAngle);
          const perpY = Math.cos(baseAngle);
          const offsets = [-4, 4];
          for (const off of offsets) {
            const ang = baseAngle + (rng() - 0.5) * 0.08;
            state.bullets.push({
              x: mx + perpX * off,
              y: my + perpY * off,
              vx: Math.cos(ang) * spd,
              vy: Math.sin(ang) * spd,
              radius: 4,
              dmg: w.baseDmg * player.dmgMult,
              pierceLeft: player.pierce,
              bounceLeft: player.bounce,
              hitIds: new Set(),
              color: '#00f5d4',
              life: 0.95
            });
          }
          state.screenShake = Math.max(state.screenShake, 1.5);
          spawnMuzzleParticles(state, mx, my, baseAngle, '#00f5d4', 3, rng);
        } else {
          const ang = baseAngle + (rng() - 0.5) * 0.18; // ±0.09 rad
          state.bullets.push({
            x: mx,
            y: my,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            radius: 4,
            dmg: w.baseDmg * player.dmgMult,
            pierceLeft: player.pierce,
            bounceLeft: player.bounce,
            hitIds: new Set(),
            color: w.color,
            life: 0.95
          });
          state.screenShake = Math.max(state.screenShake, 1.2);
          spawnMuzzleParticles(state, mx, my, ang, w.color, 2, rng);
        }
        break;
      }

      case 'flamethrower': {
        // Balanced Flamethrower / Plasma Meltdown Torch: short-range cone; each flame puff hits a given enemy at most ONCE
        // and applies a 2.4s non-stacking Burn DoT.
        const ang = baseAngle + (rng() - 0.5) * 0.34; // ±0.17 rad
        const spd = (240 + rng() * 85) * player.projSpeedMult;
        const flameColor = evolved
          ? (rng() < 0.5 ? '#00f5d4' : '#72efdd')
          : (rng() < 0.5 ? '#ff6b2b' : '#ffd166');
        state.bullets.push({
          x: mx,
          y: my,
          vx: Math.cos(ang) * spd + player.vx * 0.2,
          vy: Math.sin(ang) * spd + player.vy * 0.2,
          radius: 6,
          maxRadius: evolved ? 23 : 17,
          dmg: w.baseDmg * player.dmgMult * player.blastMult * (evolved ? 1.45 : 1),
          isFlame: true,
          pierceLeft: 99,
          bounceLeft: player.bounce,
          hitIds: new Set(),
          color: flameColor,
          life: 0.36,
          maxLife: 0.36
        });
        break;
      }

      case 'grenade_launcher': {
        const rawDist = Math.hypot(target.x - mx, target.y - my);
        const dist = Math.min(390 * player.projSpeedMult, rawDist);
        const travelTime = Math.max(0.32, dist / (w.projSpeed * player.projSpeedMult));
        const targetX = Math.max(
          WALL_THICKNESS + 20,
          Math.min(ARENA_WIDTH - WALL_THICKNESS - 20, mx + Math.cos(baseAngle) * dist)
        );
        const targetY = Math.max(
          WALL_THICKNESS + 20,
          Math.min(ARENA_HEIGHT - WALL_THICKNESS - 20, my + Math.sin(baseAngle) * dist)
        );

        const grenade: Grenade = {
          x: mx,
          y: my,
          startX: mx,
          startY: my,
          targetX,
          targetY,
          t: 0,
          duration: travelTime,
          radius: 8,
          blastRadius: (evolved ? 112 : 92) * player.blastMult,
          dmg: w.baseDmg * player.dmgMult * player.blastMult * (evolved ? 1.25 : 1)
        };
        (grenade as any).clusterCount = Math.max(0, (player.multiShot || 1) - 1);
        (grenade as any).bouncesLeft = player.bounce || 0;
        if (evolved) {
          (grenade as any).cluster = true;
        }
        state.grenades.push(grenade);
        state.screenShake = Math.max(state.screenShake, evolved ? 3.5 : 2.5);
        spawnMuzzleParticles(state, mx, my, baseAngle, evolved ? '#ff0055' : w.color, 6, rng);
        break;
      }

      case 'shotgun': {
        // Sawed-Off Shotgun / Hellfire Flak Cannon: 6 (or 10 evolved) buckshot pellets
        const pellets = evolved ? 10 : 6;
        const pelletColor = evolved ? '#ff5400' : w.color;
        const knockback = evolved ? 20 : 11;
        for (let p = 0; p < pellets; p++) {
          const spread = (p / (pellets - 1) - 0.5) * (evolved ? 0.40 : 0.34) + (rng() - 0.5) * 0.06;
          const ang = baseAngle + spread;
          const spd = (w.projSpeed + (rng() - 0.5) * 70) * player.projSpeedMult;
          state.bullets.push({
            x: mx,
            y: my,
            vx: Math.cos(ang) * spd,
            vy: Math.sin(ang) * spd,
            radius: 4.5,
            dmg: w.baseDmg * player.dmgMult,
            knockback,
            pierceLeft: player.pierce,
            bounceLeft: player.bounce,
            hitIds: new Set(),
            color: pelletColor,
            life: 0.46
          });
        }
        state.screenShake = Math.max(state.screenShake, evolved ? 4.2 : 3.2);
        spawnMuzzleParticles(state, mx, my, baseAngle, pelletColor, evolved ? 12 : 8, rng);
        break;
      }

      case 'railgun': {
        // Plasma Railgun / Orbital Ion Lance: hyper-velocity slug, pierce 99, leaves persistent ion beam trail
        const ang = baseAngle;
        const spd = w.projSpeed * player.projSpeedMult;
        const railColor = evolved ? '#ffbe0b' : w.color;
        const pierceStacks = Math.max(0, player.pierce || 0);
        const pierceDmgMult = 1 + 0.15 * pierceStacks;
        const pierceRadiusBonus = 1.2 * pierceStacks;
        state.bullets.push({
          x: mx,
          y: my,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          radius: (evolved ? 8.5 : 6.5) + pierceRadiusBonus,
          dmg: w.baseDmg * player.dmgMult * (evolved ? 1.35 : 1) * pierceDmgMult,
          isRail: true,
          pierceLeft: 99,
          bounceLeft: player.bounce || 0,
          hitIds: new Set(),
          color: railColor,
          life: 0.85
        });
        state.screenShake = Math.max(state.screenShake, evolved ? 5.5 : 4.0);
        spawnMuzzleParticles(state, mx, my, ang, railColor, evolved ? 14 : 10, rng);
        break;
      }

      case 'arc_coil': {
        // Arc Tesla Coil / Thunderlord Storm Coil: lightning orb, on hit chains to nearby enemies
        const ang = baseAngle + (rng() - 0.5) * 0.06;
        const spd = w.projSpeed * player.projSpeedMult;
        const arcColor = evolved ? '#e0aaff' : w.color;
        const bullet: PlayerBullet = {
          x: mx,
          y: my,
          vx: Math.cos(ang) * spd,
          vy: Math.sin(ang) * spd,
          radius: 6,
          dmg: w.baseDmg * player.dmgMult,
          isArc: true,
          pierceLeft: player.pierce,
          bounceLeft: player.bounce,
          hitIds: new Set(),
          color: arcColor,
          life: 1.0
        };
        if (evolved) {
          (bullet as any).evolvedArc = true;
        }
        state.bullets.push(bullet);
        state.screenShake = Math.max(state.screenShake, evolved ? 2.4 : 1.8);
        spawnMuzzleParticles(state, mx, my, ang, arcColor, evolved ? 8 : 5, rng);
        break;
      }
    }
  }

  return true;
}

// ============================================================================
// 5. EXPLOSIONS & AoE RESOLUTION
// ============================================================================

/**
 * Triggers an AoE explosion:
 * - Deals radial falloff damage to all enemies: dmg * (1 - (d / (radius + en.radius)) * 0.45)
 * - Detonates explosive barrels in range: ob.type === 'barrel' && d <= radius + ob.size / 2
 * - Spawns shockwave and 24 shrapnel particles
 */
export function triggerExplosion(
  x: number,
  y: number,
  radius: number,
  dmg: number,
  room: Room,
  state: CombatState,
  audio?: AudioService,
  rng: () => number = Math.random,
  isCryo: boolean = false
): void {
  state.screenShake = Math.max(state.screenShake, 8);
  if (audio) {
    audio.explosion();
  }

  // Shockwave particle
  state.particles.push({
    x,
    y,
    vx: 0,
    vy: 0,
    radius: 8,
    shockwaveMax: radius,
    color: isCryo ? '#72efdd' : '#ff9f1c',
    life: 0.26,
    maxLife: 0.26
  });

  // 24 shrapnel particles
  for (let i = 0; i < 24; i++) {
    const a = rng() * Math.PI * 2;
    const spd = 40 + rng() * 220;
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * spd,
      vy: Math.sin(a) * spd,
      radius: 3.5 + rng() * 5,
      color: isCryo
        ? (i % 2 === 0 ? '#72efdd' : '#48cae4')
        : (i % 2 === 0 ? '#ff5400' : '#ffbd00'),
      life: 0.3 + rng() * 0.25,
      maxLife: 0.55
    });
  }

  // Damage enemies in range with falloff
  const hasThermalShock = (room as any)._thermalShockActive !== false;
  for (const en of room.enemies) {
    const d = Math.hypot(en.x - x, en.y - y);
    const maxDist = radius + en.radius;
    if (d <= maxDist) {
      const falloff = 1 - (d / maxDist) * 0.45;
      let hitDmg = dmg * falloff;
      const isChilled = ((en as any).slowTimer || 0) > 0;
      if (isChilled) {
        hitDmg *= 1.15;
      }
      if (hasThermalShock && isChilled && !isCryo && ((en as any).thermalShockIcd || 0) <= 0) {
        (en as any).thermalShockIcd = 0.4;
        hitDmg *= 1.35;
        state.particles.push({
          x: en.x,
          y: en.y,
          vx: 0,
          vy: 0,
          radius: 6,
          shockwaveMax: 44,
          color: '#72efdd',
          life: 0.22,
          maxLife: 0.22
        });
        addFloatingText(state, en.x, en.y - en.radius - 16, 'THERMAL SHOCK!', '#72efdd');
      }
      damageEnemy(en, hitDmg, true, state);
      (en as any).hitFlashTimer = 0.07;
      if (isCryo) {
        (en as any).slowTimer = 3.5;
        state.damageNumbers.push({
          x: en.x,
          y: en.y - 18,
          text: 'CRYO SLOW!',
          color: '#72efdd',
          life: 0.9,
          maxLife: 0.9
        });
      }
    }
  }

  // Detonate explosive barrels in range
  for (let i = room.obstacles.length - 1; i >= 0; i--) {
    const ob = room.obstacles[i];
    if (ob.type === 'barrel' && Math.hypot(ob.x - x, ob.y - y) <= radius + ob.size / 2) {
      room.obstacles.splice(i, 1);
      const cryo = (ob as any).variant === 'cryo_barrel';
      triggerExplosion(ob.x, ob.y, 88, 34, room, state, audio, rng, cryo);
    }
  }
}

// ============================================================================
// 6. ENEMY DEATH & DROP RESOLUTION
// ============================================================================

export interface DeathResolutionContext {
  room: Room;
  enemy: Enemy;
  index: number;
  player: PlayerState;
  state: CombatState;
  metaState?: MetaSaveState | { scrap: number; totalKills?: number; bossesSlain?: number };
  audio?: AudioService;
  rng?: () => number;
  floorNum?: number;
}

/**
 * Handles enemy defeat, RoR2-style on-kill drops/effects, currency, and cleanup.
 */
export function handleEnemyDeath({
  room,
  enemy: en,
  index,
  player,
  state,
  metaState,
  audio,
  rng = Math.random,
  floorNum = 1
}: DeathResolutionContext): void {
  const metaSave = metaState;
  if (metaSave) {
    metaSave.totalKills = (metaSave.totalKills || 0) + 1;
    if (en.type === 'boss') {
      metaSave.bossesSlain = (metaSave.bossesSlain || 0) + 1;
    }
  }

  if (audio) {
    audio.enemyKill(en.type === 'boss');
  }
  spawnMuzzleParticles(state, en.x, en.y, 0, en.color, 12, rng);

  // Overkill execution bonus check
  const overkill = calcOverkillBonus(en.hp, en.maxHp);
  if (overkill.isOverkill && overkill.callout) {
    player.styleScore = Math.min(100, (player.styleScore || 12) + overkill.bonusStyle);
    state.damageNumbers.push({
      x: en.x,
      y: en.y - en.radius - 22,
      text: overkill.callout,
      color: '#ff007f',
      life: 0.95,
      maxLife: 0.95
    });
  }

  // Splitter spawns 2 fast mini_swarmers on death
  if (en.type === 'splitter') {
    // Exponential floor scaling matching enemyAI / dungeon
    const f = Math.max(1, floorNum);
    const scale = Math.pow(1.55, f - 1);
    const spdScale = Math.pow(1.06, f - 1);
    const hp = Math.round(22 * scale);
    room.enemies.push({
      id: Date.now() + Math.floor(rng() * 1000),
      type: 'mini_swarmer',
      x: en.x - 14,
      y: en.y,
      vx: 0,
      vy: 0,
      radius: 11,
      hp,
      maxHp: hp,
      speed: 175 * spdScale,
      burnTimer: 0,
      burnTick: 0,
      aiTimer: 0.6 + rng() * 0.8,
      state: 'idle',
      angle: 0,
      isElite: false,
      color: '#57cc99'
    });
    room.enemies.push({
      id: Date.now() + Math.floor(rng() * 1000) + 1,
      type: 'mini_swarmer',
      x: en.x + 14,
      y: en.y,
      vx: 0,
      vy: 0,
      radius: 11,
      hp,
      maxHp: hp,
      speed: 175 * spdScale,
      burnTimer: 0,
      burnTick: 0,
      aiTimer: 0.6 + rng() * 0.8,
      state: 'idle',
      angle: 0,
      isElite: false,
      color: '#57cc99'
    });
  }

  // Gasoline on-kill AoE explosion
  const gas = player.itemStacks?.gasoline ?? 0;
  if (gas > 0) {
    triggerExplosion(en.x, en.y, 50 + 14 * gas, 10 + 8 * gas, room, state, audio, rng);
  }

  // Oil Infusion kill counter
  player.killCount = (player.killCount || 0) + 1;
  const inf = player.itemStacks?.oil_infusion ?? 0;
  if (inf > 0 && player.killCount % 15 === 0 && player.maxHp < 20) {
    player.maxHp += inf;
    player.hp = Math.min(player.maxHp, player.hp + inf);
    addFloatingText(state, player.x, player.y - 18, `+${inf} MAX FUEL`, '#9d4edd');
  }

  // Adrenaline Injector: restore +20 NOS per stack on kill
  const adren = player.itemStacks?.adrenaline_injector ?? 0;
  if (adren > 0) {
    player.nos = Math.min((player as any).maxNos || 100, player.nos + 20 * adren);
    player.nosLock = false;
  }

  // RoR2 Stacking Item Toolbox Drop: Boss guaranteed, Elites 30%, Regulars 4% (mini_swarmer yields nothing)
  // Capped at maximum 1 power-up item per 2 rooms in a floor (and max 1 per room).
  const quota = room.powerUpDropQuota;
  const alreadyDroppedInRoom =
    !!room.powerUpDroppedInRoom || room.pickups.some(p => p.type === 'item_drop');
  const underFloorCap = !quota || quota.dropped < quota.max;
  if (
    !alreadyDroppedInRoom &&
    underFloorCap &&
    (en.type === 'boss' || (en.type !== 'mini_swarmer' && rng() < (en.isElite ? 0.30 : 0.04)))
  ) {
    const id = DROP_ITEM_IDS[Math.floor(rng() * DROP_ITEM_IDS.length)];
    room.pickups.push({
      x: en.x,
      y: en.y + (en.type === 'boss' ? -40 : 0),
      type: 'item_drop',
      itemId: id,
      radius: 16
    });
    room.powerUpDroppedInRoom = true;
    if (quota) {
      quota.dropped += 1;
    }
  }

  // Vampiric Siphon mod check
  if (player.vampChance > 0 && player.hp < player.maxHp && rng() < player.vampChance) {
    player.hp = Math.min(player.maxHp, player.hp + 1);
    addFloatingText(state, player.x, player.y - 18, '+1 HP (SIPHON)', '#ff4d6d');
  }

  // Elite Affix Death Payoffs
  if (en.isElite && (en as any).eliteAffix) {
    const affix = (en as any).eliteAffix;
    if (affix === 'volatile') {
      state.particles.push({
        x: en.x,
        y: en.y,
        vx: 0,
        vy: 0,
        radius: 6,
        shockwaveMax: 52,
        color: '#ff9f1c',
        life: 0.25,
        maxLife: 0.25
      });
      addFloatingText(state, en.x, en.y - 18, '💥 VOLATILE ELITE!', '#ff9f1c');
    } else if (affix === 'vampiric') {
      if (player.hp < player.maxHp) {
        player.hp = Math.min(player.maxHp, player.hp + 1);
        addFloatingText(state, player.x, player.y - 18, '🩸 ELITE SIPHON +1 FUEL!', '#06d6a0');
      }
    } else if (affix === 'overclocked') {
      const maxNos = player.nosMax !== undefined ? player.nosMax : 100;
      player.nos = Math.min(maxNos, (player.nos || 0) + 20);
      addFloatingText(state, player.x, player.y - 18, '⚡ OVERCLOCKED +20 NOS!', '#00f5d4');
    }
  }

  // Currency & reward drops
  if (en.type === 'boss') {
    const rawBossScrap = 7 + floorNum * 2;
    const bossScrap = Math.round(rawBossScrap * (1 + (player.heatLevel || 0) * 0.25));
    const bossCoins = 8 + floorNum * 2;
    if (metaState) metaState.scrap += bossScrap;
    player.coins += bossCoins;
    addFloatingText(state, en.x, en.y - 10, `+${bossCoins} 🪙  +${bossScrap} ⚙️`, '#ffd166');

    // Health Jerry-can (+1 Fuel)
    room.pickups.push({ x: en.x, y: en.y, type: 'heart', radius: 13 });

    // Boss loot equipment part
    room.pickups.push({
      x: Math.max(WALL_THICKNESS + 40, Math.min(ARENA_WIDTH - WALL_THICKNESS - 40, en.x + 70)),
      y: en.y,
      type: 'loot',
      item: genLoot(floorNum),
      radius: 20
    });

    // Spawn exit trapdoor / dimensional portal to next floor
    room.trapdoor = true;
  } else if (en.type !== 'mini_swarmer') {
    // 65% chance for coins (1 or 3 for elite)
    if (rng() < 0.65) {
      const c = en.isElite ? 3 : 1;
      player.coins += c;
      addFloatingText(state, en.x, en.y, `+${c} 🪙`, '#ffd166');
    }
    // 25% chance for scrap (or guaranteed 2 scrap for elite)
    if (en.isElite || rng() < 0.25) {
      const rawScrap = en.isElite ? 2 : 1;
      const s = Math.round(rawScrap * (1 + (player.heatLevel || 0) * 0.25));
      if (metaState) metaState.scrap += s;
      addFloatingText(state, en.x, en.y - 14, `+${s} ⚙️`, '#7bdff2');
    }
    // 10% chance for heart drop
    if (rng() < 0.10) {
      room.pickups.push({ x: en.x, y: en.y, type: 'heart', radius: 12 });
    }
  }

  // Remove from room enemies
  room.enemies.splice(index, 1);
}

// ============================================================================
// 7. PROJECTILE UPDATE LOOPS
// ============================================================================

/**
 * Updates player bullets: movement, wall bouncing/bounds, obstacle collisions,
 * enemy hits with hitIds single-hit checking, shotgun knockback, and arc tesla coil lightning.
 */
export function updatePlayerBullets(
  dt: number,
  bullets: PlayerBullet[],
  room: Room,
  player: PlayerState,
  state: CombatState,
  audio?: AudioService,
  rng: () => number = Math.random
): void {
  const homingEnabled = hasHomingMissiles(player);
  const cryoEnabled = hasCryoRounds(player);

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    const prevX = b.x;
    const prevY = b.y;

    // BUG-03: Smart-Link Guidance gentle homing within 190px forward cone (dot > 0.4) at up to 2.2 rad/s
    if (homingEnabled && !b.isFlame && room.enemies.length > 0) {
      const spd = Math.hypot(b.vx, b.vy);
      if (spd > 0) {
        const bvx = b.vx / spd;
        const bvy = b.vy / spd;
        let nearest: Enemy | null = null;
        let bestDist = 190;
        for (const en of room.enemies) {
          if (en.hp <= 0) continue;
          const dx = en.x - b.x;
          const dy = en.y - b.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0 && dist <= bestDist) {
            const dot = (dx / dist) * bvx + (dy / dist) * bvy;
            if (dot > 0.4) {
              bestDist = dist;
              nearest = en;
            }
          }
        }
        if (nearest) {
          const curAngle = Math.atan2(b.vy, b.vx);
          const targetAngle = Math.atan2(nearest.y - b.y, nearest.x - b.x);
          let diff = targetAngle - curAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const maxTurn = 2.2 * dt;
          const turn = Math.max(-maxTurn, Math.min(maxTurn, diff));
          const newAngle = curAngle + turn;
          b.vx = Math.cos(newAngle) * spd;
          b.vy = Math.sin(newAngle) * spd;
        }
      }
    }

    b.x += b.vx * dt;
    b.y += b.vy * dt;
    b.life -= dt;

    // Flamethrower radius expansion: 6px -> 17px
    if (b.isFlame && b.maxLife && b.maxRadius) {
      b.radius = 6 + (1 - b.life / b.maxLife) * (b.maxRadius - 6);
    }

    // Railgun cyan or golden ion beam trail
    if (b.isRail) {
      state.beamEffects.push({
        x1: prevX,
        y1: prevY,
        x2: b.x,
        y2: b.y,
        color: b.color || '#00f5d4',
        width: b.radius && b.radius > 7 ? 6 : 4,
        life: 0.22,
        maxLife: 0.22
      });
    }

    if (b.life <= 0) {
      bullets.splice(i, 1);
      continue;
    }

    // Wall bounce or bounds despawn
    let outOfBounds = false;
    if (b.x < WALL_THICKNESS || b.x > ARENA_WIDTH - WALL_THICKNESS) {
      if (b.bounceLeft > 0) {
        b.vx = -b.vx;
        b.x = Math.max(WALL_THICKNESS + 2, Math.min(ARENA_WIDTH - WALL_THICKNESS - 2, b.x));
        b.bounceLeft--;
      } else {
        outOfBounds = true;
      }
    }
    if (b.y < WALL_THICKNESS || b.y > ARENA_HEIGHT - WALL_THICKNESS) {
      if (b.bounceLeft > 0) {
        b.vy = -b.vy;
        b.y = Math.max(WALL_THICKNESS + 2, Math.min(ARENA_HEIGHT - WALL_THICKNESS - 2, b.y));
        b.bounceLeft--;
      } else {
        outOfBounds = true;
      }
    }
    if (outOfBounds) {
      bullets.splice(i, 1);
      continue;
    }

    // Obstacle collision
    let stopBullet = false;
    for (let j = room.obstacles.length - 1; j >= 0; j--) {
      const ob = room.obstacles[j];
      if (circleIntersectsAABB(b.x, b.y, b.radius, ob.x, ob.y, ob.size, ob.size)) {
        if (ob.type === 'barrel' && !b.hitIds.has(ob)) {
          b.hitIds.add(ob);
          ob.hp -= b.dmg;
          if (ob.hp <= 0) {
            room.obstacles.splice(j, 1);
            const cryo = (ob as any).variant === 'cryo_barrel';
            triggerExplosion(ob.x, ob.y, 88, 34, room, state, audio, rng, cryo);
          }
        }
        if (!b.isFlame) {
          stopBullet = true;
          break;
        }
      }
    }
    if (stopBullet) {
      bullets.splice(i, 1);
      continue;
    }

    // Enemy collision with single-hit per puff tracking
    for (const en of room.enemies) {
      if (b.hitIds.has(en.id)) continue;
      if (Math.hypot(b.x - en.x, b.y - en.y) <= b.radius + en.radius) {
        b.hitIds.add(en.id);

        // Armor, Tire Iron & Crit calculations
        let dmg = applyBruteArmor(b.dmg, en.type, !!b.isFlame);
        dmg = applyTireIronBonus(dmg, en.hp, en.maxHp, player.itemStacks?.tire_iron ?? 0);

        const isChilled = ((en as any).slowTimer || 0) > 0;
        if (isChilled) {
          dmg *= 1.15;
        }

        // Thermal Shock Duo Synergy: chilled enemy hit by flame puff deals +35% shatter damage
        if (b.isFlame && isChilled && ((en as any).thermalShockIcd || 0) <= 0) {
          (en as any).thermalShockIcd = 0.4;
          dmg *= 1.35;
          state.particles.push({
            x: en.x,
            y: en.y,
            vx: 0,
            vy: 0,
            radius: 6,
            shockwaveMax: 44,
            color: '#72efdd',
            life: 0.22,
            maxLife: 0.22
          });
          addFloatingText(state, en.x, en.y - en.radius - 16, 'THERMAL SHOCK!', '#72efdd');
        }

        const critRoll = rollCrit(player.itemStacks?.chrome_lens ?? 0, !!b.isFlame, rng);
        dmg *= critRoll.mult;
        if (critRoll.isCrit) {
          addFloatingText(
            state,
            en.x,
            en.y - en.radius - 12,
            critRoll.mult >= 3 ? 'SUPER CRIT!' : 'CRIT!',
            critRoll.mult >= 3 ? '#ffd60a' : '#4cc9f0'
          );
        }

        if (audio) {
          audio.hit(critRoll.isCrit);
        }
        damageEnemy(en, dmg, false, state);
        (en as any).hitFlashTimer = 0.07;

        if (en.isDummy) {
          (en as any).dummyHits = ((en as any).dummyHits || 0) + 1;
          (en as any).dummyTotalDmg = ((en as any).dummyTotalDmg || 0) + dmg;
          if ((en as any).dummyHits % 5 === 0) {
            state.damageNumbers.push({
              x: en.x,
              y: en.y - en.radius - 26,
              text: `🎯 TOTAL DMG: ${Math.round((en as any).dummyTotalDmg)}`,
              color: '#00f5d4',
              life: 1.0,
              maxLife: 1.0
            });
          }
        }

        // Shotgun 11px physics knockback
        if (b.knockback) {
          const bSpd = Math.hypot(b.vx, b.vy) || 1;
          en.x += (b.vx / bSpd) * b.knockback;
          en.y += (b.vy / bSpd) * b.knockback;
        }

        // BUG-02: Cryo-Jacketed Shells slow enemy on hit (2.2s)
        if (cryoEnabled) {
          (en as any).slowTimer = Math.max((en as any).slowTimer || 0, 2.2);
        }

        const targetChilledNow = ((en as any).slowTimer || 0) > 0;

        // Tesla Capacitor: 20% chance on hit to chain lightning to a nearby enemy (+ Superconductor synergy)
        const teslaStacks = player.itemStacks?.tesla_capacitor ?? 0;
        if (teslaStacks > 0 && !b.isArc && rng() < 0.20) {
          const teslaRange = targetChilledNow ? 240 : 150;
          const nearTarget = room.enemies.find(
            other => other.id !== en.id && other.hp > 0 && Math.hypot(other.x - en.x, other.y - en.y) <= teslaRange
          );
          if (nearTarget) {
            damageEnemy(nearTarget, dmg * 0.35 * teslaStacks, false, state);
            if (targetChilledNow) {
              (nearTarget as any).slowTimer = Math.max((nearTarget as any).slowTimer || 0, 1.5);
            }
            state.beamEffects.push({
              x1: en.x,
              y1: en.y,
              x2: nearTarget.x,
              y2: nearTarget.y,
              color: '#00f5d4',
              isLightning: true,
              width: 2.2,
              life: 0.2,
              maxLife: 0.2
            });
          }
        }

        // Arc Tesla Coil: chains lightning to up to 3 nearby enemies (or 6 for Thunderlord Storm Coil)
        if (b.isArc) {
          const isEvolvedArc = !!(b as any).evolvedArc;
          const chainLimit = isEvolvedArc ? 6 : 3;
          const baseRange = isEvolvedArc ? 195 : 155;
          const chainRange = targetChilledNow ? Math.max(240, baseRange * 1.6) : baseRange;
          const chainDmgMult = isEvolvedArc ? 0.85 : 0.65;
          const beamColor = isEvolvedArc ? '#e0aaff' : '#c77dff';

          const chainTargets = room.enemies
            .filter(other => other.id !== en.id && other.hp > 0 && Math.hypot(other.x - en.x, other.y - en.y) <= chainRange)
            .slice(0, chainLimit);

          if (chainTargets.length > 0 && audio) {
            audio.arcChain();
          }

          let fromX = en.x;
          let fromY = en.y;
          for (const ct of chainTargets) {
            damageEnemy(ct, dmg * chainDmgMult, false, state);
            if (targetChilledNow) {
              (ct as any).slowTimer = Math.max((ct as any).slowTimer || 0, 1.5);
            }
            state.beamEffects.push({
              x1: fromX,
              y1: fromY,
              x2: ct.x,
              y2: ct.y,
              color: beamColor,
              isLightning: true,
              width: isEvolvedArc ? 3.5 : 2.5,
              life: 0.24,
              maxLife: 0.24
            });
            fromX = ct.x;
            fromY = ct.y;
          }
        }

        if (b.isFlame) {
          en.burnTimer = 2.4;
          en.burnTick = 0.35;
        } else {
          spawnMuzzleParticles(state, b.x, b.y, Math.atan2(b.vy, b.vx) + Math.PI, b.color, 3, rng);
          if (b.pierceLeft > 0) {
            b.pierceLeft--;
          } else {
            bullets.splice(i, 1);
            break;
          }
        }
      }
    }
  }
}

/**
 * Updates arcing grenades.
 */
export function updateGrenades(
  dt: number,
  grenades: Grenade[],
  room: Room,
  state: CombatState,
  audio?: AudioService,
  rng: () => number = Math.random
): void {
  for (let i = grenades.length - 1; i >= 0; i--) {
    const g = grenades[i];
    g.t += dt / g.duration;
    if (g.t >= 1) {
      g.x = g.targetX;
      g.y = g.targetY;

      // BUG-04: Bouncing Betty grenades when bouncesLeft > 0
      if (((g as any).bouncesLeft || 0) > 0) {
        (g as any).bouncesLeft -= 1;
        triggerExplosion(g.x, g.y, g.blastRadius, g.dmg * 0.65, room, state, audio, rng);
        const bounceAngle = Math.atan2(g.targetY - g.startY, g.targetX - g.startX);
        g.startX = g.x;
        g.startY = g.y;
        g.targetX = Math.max(
          WALL_THICKNESS + 20,
          Math.min(ARENA_WIDTH - WALL_THICKNESS - 20, g.x + Math.cos(bounceAngle) * 55)
        );
        g.targetY = Math.max(
          WALL_THICKNESS + 20,
          Math.min(ARENA_HEIGHT - WALL_THICKNESS - 20, g.y + Math.sin(bounceAngle) * 55)
        );
        g.t = 0;
        g.duration = 0.28;
        continue;
      }

      triggerExplosion(g.targetX, g.targetY, g.blastRadius, g.dmg, room, state, audio, rng);

      // BUG-04: Multi-shot cluster sub-munitions on final detonation
      const clusterCount = (g as any).clusterCount || 0;
      if (clusterCount > 0) {
        for (let c = 0; c < clusterCount; c++) {
          const clusterAngle = (c * Math.PI * 2) / clusterCount;
          const clusterDist = 34;
          const cx = Math.max(
            WALL_THICKNESS + 15,
            Math.min(ARENA_WIDTH - WALL_THICKNESS - 15, g.targetX + Math.cos(clusterAngle) * clusterDist)
          );
          const cy = Math.max(
            WALL_THICKNESS + 15,
            Math.min(ARENA_HEIGHT - WALL_THICKNESS - 15, g.targetY + Math.sin(clusterAngle) * clusterDist)
          );
          triggerExplosion(cx, cy, g.blastRadius * 0.58, g.dmg * 0.45, room, state, audio, rng);
        }
      }

      // Carpet Cluster Mortar: trigger 3 cluster explosions at 120deg offsets
      if ((g as any).cluster) {
        for (let c = 0; c < 3; c++) {
          const clusterAngle = c * (Math.PI * 2 / 3);
          const clusterDist = 42;
          const cx = Math.max(
            WALL_THICKNESS + 15,
            Math.min(ARENA_WIDTH - WALL_THICKNESS - 15, g.targetX + Math.cos(clusterAngle) * clusterDist)
          );
          const cy = Math.max(
            WALL_THICKNESS + 15,
            Math.min(ARENA_HEIGHT - WALL_THICKNESS - 15, g.targetY + Math.sin(clusterAngle) * clusterDist)
          );
          triggerExplosion(cx, cy, 46, g.dmg * 0.4, room, state, audio, rng);
        }
      }

      grenades.splice(i, 1);
    } else {
      g.x = g.startX + (g.targetX - g.startX) * g.t;
      g.y = g.startY + (g.targetY - g.startY) * g.t;
    }
  }
}

/**
 * Updates enemy lobbed mortar bombs.
 */
export function updateEnemyBombs(
  dt: number,
  enemyBombs: EnemyBomb[],
  room: Room,
  player: PlayerState,
  state: CombatState,
  onPlayerHurt?: (dmg: number) => void
): void {
  for (let i = enemyBombs.length - 1; i >= 0; i--) {
    const eb = enemyBombs[i];
    eb.t += dt / eb.duration;
    if (eb.t >= 1) {
      eb.x = eb.targetX;
      eb.y = eb.targetY;
      room.hazards.push({
        x: eb.targetX,
        y: eb.targetY,
        radius: 42,
        life: 3.5,
        maxLife: 3.5,
        dmg: (eb as any).dmg
      } as FloorHazard);
      spawnMuzzleParticles(state, eb.targetX, eb.targetY, 0, '#ff9f1c', 10);
      if (Math.hypot(player.x - eb.targetX, player.y - eb.targetY) < player.radius + 42) {
        if (onPlayerHurt) {
          const hitDmg = Math.max(1, Math.floor((((eb as any).dmg ?? 1) as number) + 1e-9));
          onPlayerHurt(hitDmg);
        }
      }
      enemyBombs.splice(i, 1);
    } else {
      eb.x = eb.startX + (eb.targetX - eb.startX) * eb.t;
      eb.y = eb.startY + (eb.targetY - eb.startY) * eb.t;
    }
  }
}

/**
 * Updates floor fire hazard pools.
 */
export function updateHazards(
  dt: number,
  hazards: FloorHazard[],
  player: PlayerState,
  onPlayerHurt?: (dmg: number) => void
): void {
  for (let i = hazards.length - 1; i >= 0; i--) {
    const hz = hazards[i];
    hz.life -= dt;
    if (hz.life <= 0) {
      hazards.splice(i, 1);
      continue;
    }
    if (Math.hypot(player.x - hz.x, player.y - hz.y) < player.radius + hz.radius - 6) {
      if (onPlayerHurt) {
        const hitDmg = Math.max(1, Math.floor((((hz as any).dmg ?? 1) as number) + 1e-9));
        onPlayerHurt(hitDmg);
      }
    }
  }
}

/**
 * Updates enemy projectile bullets.
 */
export function updateEnemyBullets(
  dt: number,
  enemyBullets: EnemyBullet[],
  player: PlayerState,
  onPlayerHurt?: (dmg: number) => void
): void {
  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const eb = enemyBullets[i];
    eb.x += eb.vx * dt;
    eb.y += eb.vy * dt;
    if (
      eb.x < WALL_THICKNESS ||
      eb.x > ARENA_WIDTH - WALL_THICKNESS ||
      eb.y < WALL_THICKNESS ||
      eb.y > ARENA_HEIGHT - WALL_THICKNESS
    ) {
      enemyBullets.splice(i, 1);
      continue;
    }
    if (Math.hypot(eb.x - player.x, eb.y - player.y) < eb.radius + player.radius) {
      if (onPlayerHurt) {
        const hitDmg = Math.max(1, Math.floor((((eb as any).dmg ?? 1) as number) + 1e-9));
        onPlayerHurt(hitDmg);
      }
      enemyBullets.splice(i, 1);
    }
  }
}

/**
 * Computes the relative collision mass of an enemy.
 * Bosses have mass 100.
 * Other enemies scale by radius, elite status, and type.
 */
export function getEnemyMass(en: Enemy): number {
  if (en.type === 'boss') {
    return 100;
  }
  return en.radius * (en.isElite ? 1.25 : 1) + (en.type === 'charger' ? 3 : 0);
}

/**
 * Handles physical contact collisions between player and alive enemies in the room.
 */
export function updateEnemyCollisions(
  room: Room,
  player: PlayerState,
  state: CombatState,
  onPlayerHurt?: (dmg: number) => void
): void {
  const isBoosting = !!(player as any).isBoosting && player.nos > 0 && !player.nosLock;

  for (const en of room.enemies) {
    if (en.hp <= 0) continue;
    const dx = player.x - en.x;
    const dy = player.y - en.y;
    const dist = Math.hypot(dx, dy);
    const minDist = player.radius + en.radius;
    if (dist < minDist) {
      const nx = dist > 0 ? dx / dist : 1;
      const ny = dist > 0 ? dy / dist : 0;
      const overlap = minDist - dist;
      const playerMass = player.radius || 17;
      const enemyMass = getEnemyMass(en);

      // Universal NOS Battering Ram: high-speed ram flings any non-boss enemy back, deals heavy damage, 0 hurt to player
      if (en.type !== 'boss' && isBoosting) {
        en.x -= nx * (overlap + 26);
        en.y -= ny * (overlap + 26);
        if (enemyMass > 20.4) {
          player.nos = Math.max(0, player.nos - 15);
          player.invuln = Math.max(player.invuln || 0, 0.25);
        }
        const spikeStacks = player.itemStacks?.titanium_spikes ?? 0;
        const adrenStacks = player.itemStacks?.adrenaline_injector ?? 0;
        const ramDmg = 35 * player.dmgMult * (1 + 0.45 * spikeStacks);
        damageEnemy(en, ramDmg, true, state);
        (en as any).hitFlashTimer = 0.07;
        addFloatingText(state, en.x, en.y - 20, 'NOS RAM!!', '#ffd60a');
        state.screenShake = Math.max(state.screenShake, 6);

        // Juggernaut Overdrive Duo Synergy: titanium_spikes + adrenaline_injector
        if (en.hp <= 0 && spikeStacks > 0 && adrenStacks > 0) {
          player.nos = Math.min(player.nosMax || 100, player.nos + 30);
          player.nosLock = false;
          triggerExplosion(en.x, en.y, 70, 28 * player.dmgMult, room, state);
          addFloatingText(state, en.x, en.y - 34, 'JUGGERNAUT OVERDRIVE!', '#ff0055');
        }
        continue;
      }

      if (en.type === 'boss') {
        player.x += nx * (overlap + 4);
        player.y += ny * (overlap + 4);
        player.vx = nx * 520;
        player.vy = ny * 520;
        if ((player.stunTimer || 0) <= 0 && ((player as any).stunImmuneTimer || 0) <= 0) {
          player.stunTimer = 1.0;
          (player as any).stunImmuneTimer = 1.0;
          addFloatingText(state, player.x, player.y - player.radius - 16, 'STUNNED! 1s', '#ffd166');
        }
        state.screenShake = Math.max(state.screenShake, 9);
      } else if (enemyMass > playerMass) {
        player.x += nx * (overlap + 2);
        player.y += ny * (overlap + 2);
        const kb = Math.min(480, 340 * (enemyMass / playerMass));
        player.vx = nx * kb;
        player.vy = ny * kb;
        state.screenShake = Math.max(state.screenShake, 5);
      } else {
        player.x += nx * (overlap * 0.35);
        player.y += ny * (overlap * 0.35);
        en.x -= nx * (overlap * 0.65);
        en.y -= ny * (overlap * 0.65);
      }

      player.x = Math.max(WALL_THICKNESS + player.radius, Math.min(ARENA_WIDTH - WALL_THICKNESS - player.radius, player.x));
      player.y = Math.max(WALL_THICKNESS + player.radius, Math.min(ARENA_HEIGHT - WALL_THICKNESS - player.radius, player.y));

      if (!en.isDummy && onPlayerHurt) {
        const hitDmg = Math.max(1, Math.floor((((en as any).dmg ?? 1) as number) + 1e-9));
        onPlayerHurt(hitDmg);
      }
    }
  }
}

/**
 * Updates burn DoT ticks for all enemies afflicted with burnTimer > 0.
 * Burn ticks every 0.35s dealing 2.2 * dmgMult * blastMult damage.
 */
export function updateBurnDoT(
  dt: number,
  enemies: Enemy[],
  player: PlayerState,
  state: CombatState,
  rng: () => number = Math.random
): void {
  for (const en of enemies) {
    if (en.burnTimer > 0) {
      en.burnTimer -= dt;
      en.burnTick -= dt;
      if (en.burnTick <= 0) {
        en.burnTick = 0.35;
        const tickDmg = 2.2 * player.dmgMult * player.blastMult;
        en.hp -= tickDmg;
        if (en.isDummy && en.hp <= 500) {
          en.hp = en.maxHp;
        }
        state.particles.push({
          x: en.x + (rng() - 0.5) * en.radius,
          y: en.y + (rng() - 0.5) * en.radius,
          vx: (rng() - 0.5) * 18,
          vy: -25 - rng() * 25,
          radius: 3.5,
          color: '#ff6b2b',
          life: 0.22,
          maxLife: 0.22
        });
      }
    }
  }
}

/**
 * Updates VFX: beams, particles, floating damage numbers, and screen shake decay.
 */
export function updateCombatVfx(dt: number, state: CombatState): void {
  // Screen shake decay (-28 * dt)
  if (state.screenShake > 0) {
    state.screenShake = Math.max(0, state.screenShake - dt * 28);
  }

  // Beam effects
  for (let i = state.beamEffects.length - 1; i >= 0; i--) {
    state.beamEffects[i].life -= dt;
    if (state.beamEffects[i].life <= 0) {
      state.beamEffects.splice(i, 1);
    }
  }

  // Particles
  for (let i = state.particles.length - 1; i >= 0; i--) {
    const pt = state.particles[i];
    pt.x += pt.vx * dt;
    pt.y += pt.vy * dt;
    pt.life -= dt;
    if (pt.life <= 0) {
      state.particles.splice(i, 1);
    }
  }

  // Floating text / Damage numbers
  for (let i = state.damageNumbers.length - 1; i >= 0; i--) {
    const ft = state.damageNumbers[i];
    ft.y -= 26 * dt;
    ft.life -= dt;
    if (ft.life <= 0) {
      state.damageNumbers.splice(i, 1);
    }
  }

  // Strict buffer caps to prevent render loop degradation under heavy combat
  if (state.particles.length > 150) {
    state.particles.splice(0, state.particles.length - 150);
  }
  if (state.bullets.length > 120) {
    state.bullets.splice(0, state.bullets.length - 120);
  }
  if (state.damageNumbers.length > 30) {
    state.damageNumbers.splice(0, state.damageNumbers.length - 30);
  }
}

/**
 * Composite step function for the entire combat pipeline in a single frame.
 */
export function updateCombatPipeline(
  dt: number,
  room: Room,
  player: PlayerState,
  state: CombatState,
  metaState?: MetaSaveState | { scrap: number; totalKills?: number; bossesSlain?: number },
  audio?: AudioService,
  onPlayerHurt?: (dmg: number) => void,
  rng: () => number = Math.random
): void {
  const onPlayerHit = (dmg: number) => {
    const rpStacks = player.itemStacks?.reactive_plating ?? 0;
    if (rpStacks > 0 && player.invuln <= 0) {
      triggerExplosion(player.x, player.y, 75 + rpStacks * 15, 18 * rpStacks * player.dmgMult, room, state, audio, rng);
    }
    onPlayerHurt?.(dmg);
  };

  // Compute active Duo Synergies (respecting 1 duo buff per item copy & user selection)
  const activeDuoIds = new Set(getActiveDuoSynergies(player).map(d => d.id));
  (room as any)._thermalShockActive = activeDuoIds.has('thermal_shock');
  (room as any)._superconductorActive = activeDuoIds.has('superconductor');
  (room as any)._juggernautOverdriveActive = activeDuoIds.has('juggernaut_overdrive');

  // Exhaust Afterburner (+ Voltaic Wake Duo Synergy): leave scorching/plasma trail when NOS boosting
  const afterburnerStacks = player.itemStacks?.exhaust_afterburner ?? 0;
  const hasVoltaicWake =
    activeDuoIds.has('voltaic_wake') ||
    (afterburnerStacks > 0 && (player.itemStacks?.oil_infusion ?? 0) > 0 && activeDuoIds.size === 0);
  if (afterburnerStacks > 0 && (player as any).isBoosting && player.nos > 0 && !player.nosLock && rng() < 0.35) {
    const bikeAngle = (player as any).angle ?? player.aimAngle ?? 0;
    state.bullets.push({
      x: player.x - Math.cos(bikeAngle) * 18,
      y: player.y - Math.sin(bikeAngle) * 18,
      vx: (rng() - 0.5) * 35,
      vy: (rng() - 0.5) * 35,
      radius: hasVoltaicWake ? 12 : 9,
      maxRadius: hasVoltaicWake ? 26 : 19,
      dmg: (8 * afterburnerStacks * (hasVoltaicWake ? 1.5 : 1)) * player.dmgMult,
      isFlame: true,
      isArc: hasVoltaicWake,
      pierceLeft: 99,
      bounceLeft: 0,
      hitIds: new Set(),
      color: hasVoltaicWake ? '#ff9e00' : '#ff5400',
      life: hasVoltaicWake ? 0.65 : 0.42,
      maxLife: hasVoltaicWake ? 0.65 : 0.42
    });
  }

  // Slow timer, hit-flash, thermal shock ICD & enemy displacement damping
  for (const en of room.enemies) {
    if ((en as any).slowTimer && (en as any).slowTimer > 0) {
      (en as any).slowTimer = Math.max(0, (en as any).slowTimer - dt);
      en.x -= en.vx * dt * 0.45;
      en.y -= en.vy * dt * 0.45;
    }
    if ((en as any).hitFlashTimer && (en as any).hitFlashTimer > 0) {
      (en as any).hitFlashTimer = Math.max(0, (en as any).hitFlashTimer - dt);
    }
    if ((en as any).thermalShockIcd && (en as any).thermalShockIcd > 0) {
      (en as any).thermalShockIcd = Math.max(0, (en as any).thermalShockIcd - dt);
    }
  }

  // Biome zones hazards (lava vents)
  const zones = (room as any).biomeZones;
  if (Array.isArray(zones)) {
    for (const z of zones) {
      if (z.type === 'lava_vent') {
        for (const en of room.enemies) {
          if (!en.isDummy && Math.hypot(en.x - z.x, en.y - z.y) <= z.radius + en.radius) {
            en.burnTimer = Math.max(en.burnTimer, 1.5);
          }
        }
        if (Math.hypot(player.x - z.x, player.y - z.y) <= z.radius && player.invuln <= 0) {
          onPlayerHit?.(1);
        }
      }
    }
  }

  // 1. Player bullets
  updatePlayerBullets(dt, state.bullets, room, player, state, audio, rng);

  // 2. Grenades
  updateGrenades(dt, state.grenades, room, state, audio, rng);

  // 3. Enemy bombs & hazards
  updateEnemyBombs(dt, state.enemyBombs, room, player, state, onPlayerHit);
  updateHazards(dt, room.hazards, player, onPlayerHit);

  // 4. Burn DoT
  updateBurnDoT(dt, room.enemies, player, state, rng);

  // 5. Enemy bullets
  updateEnemyBullets(dt, state.enemyBullets, player, onPlayerHit);

  // 6. Enemy body collisions
  updateEnemyCollisions(room, player, state, onPlayerHit);

  // 7. Check enemy deaths
  for (let i = room.enemies.length - 1; i >= 0; i--) {
    const en = room.enemies[i];
    if (en.isDummy) {
      if (en.hp <= 500) en.hp = en.maxHp;
      continue;
    }
    if (en.hp <= 0) {
      handleEnemyDeath({
        room,
        enemy: en,
        index: i,
        player,
        state,
        metaState,
        audio,
        rng
      });
    }
  }

  // 7. VFX updates
  updateCombatVfx(dt, state);
}

// ============================================================================
// 8. COMBAT OFFENSE & SIPHON TELEMETRY
// ============================================================================

export interface Player {
  hp?: number;
  maxHp?: number;
  invuln?: number;
  weapon?: WeaponId | string;
  dmgMult?: number;
  fireRateMult?: number;
  projCount?: number;
  multiShot?: number;
  siphon?: number;
  vampChance?: number;
  items?: string[];
  itemStacks?: Record<string, number>;
  [key: string]: any;
}

export interface CombatOffenseSummary {
  effectiveDpsMult: number;
  siphonPct: number;
  siphonStatus: 'NONE' | 'LIGHT SIPHON' | 'VAMPIRIC OVERDRIVE';
  isEvolved: boolean;
  summaryLine: string;
}

/**
 * Computes an offense and siphon sustain telemetry summary for a player.
 * Calculates effective DPS multiplier taking weapon evolution into account,
 * siphon percentage tier status, and a formatted display summary line.
 */
export function getCombatOffenseSummary(player: Player): CombatOffenseSummary {
  const isEvolved = Boolean(
    player.weapon && isWeaponEvolved(player.weapon as any, player as any)
  );

  const projCount = Math.max(1, player.projCount ?? (player as any).multiShot ?? 1);
  const dmgMult = player.dmgMult || 1;
  const fireRateMult = player.fireRateMult || 1;
  const evoBonus = isEvolved ? 1.35 : 1;
  const effectiveDpsMult = Number((dmgMult * fireRateMult * projCount * evoBonus).toFixed(2));

  const rawSiphon =
    typeof player.siphon === 'number'
      ? player.siphon
      : typeof (player as any).vampChance === 'number'
        ? (player as any).vampChance
        : 0;
  const siphonPct = Math.round((rawSiphon || 0) * 100);

  const siphonStatus: 'NONE' | 'LIGHT SIPHON' | 'VAMPIRIC OVERDRIVE' =
    siphonPct >= 15
      ? 'VAMPIRIC OVERDRIVE'
      : siphonPct > 0
        ? 'LIGHT SIPHON'
        : 'NONE';

  const evoTag = isEvolved ? ' · OVERCLOCKED' : '';
  const summaryLine = `DPS x${effectiveDpsMult.toFixed(2)} · ${siphonStatus} (${siphonPct}% Siphon)${evoTag}`;

  return {
    effectiveDpsMult,
    siphonPct,
    siphonStatus,
    isEvolved,
    summaryLine
  };
}

// ============================================================================
// 9. COMBAT SURVIVABILITY & HULL INTEGRITY ADVISOR
// ============================================================================

export interface CombatSurvivabilitySummary {
  hp: number;
  maxHp: number;
  hullPct: number;
  hullStatus: 'CRITICAL HULL' | 'DAMAGED HULL' | 'OPTIMAL HULL';
  chassisTier: 'STANDARD CHASSIS' | 'REINFORCED CHASSIS' | 'JUGGERNAUT TANK';
  isInvulnerable: boolean;
  summaryLine: string;
}

/**
 * Computes combat survivability, hull integrity percentage, chassis tier,
 * and shield i-frames status for a player.
 */
export function getCombatSurvivabilitySummary(
  player?: Partial<Player> | null
): CombatSurvivabilitySummary {
  const maxHp =
    typeof player?.maxHp === 'number' && Number.isFinite(player.maxHp) && player.maxHp > 0
      ? Math.max(1, Math.floor(player.maxHp))
      : 5;
  const rawHp =
    typeof player?.hp === 'number' && Number.isFinite(player.hp)
      ? Math.floor(player.hp)
      : maxHp;
  const hp = Math.max(0, Math.min(maxHp, rawHp));
  const hullPct = Math.round((hp / maxHp) * 100);
  const hullStatus: 'CRITICAL HULL' | 'DAMAGED HULL' | 'OPTIMAL HULL' =
    hullPct <= 35 ? 'CRITICAL HULL' : hullPct < 80 ? 'DAMAGED HULL' : 'OPTIMAL HULL';
  const chassisTier: 'STANDARD CHASSIS' | 'REINFORCED CHASSIS' | 'JUGGERNAUT TANK' =
    maxHp >= 10 ? 'JUGGERNAUT TANK' : maxHp >= 7 ? 'REINFORCED CHASSIS' : 'STANDARD CHASSIS';
  const rawInvuln =
    typeof (player as any)?.invuln === 'number' && Number.isFinite((player as any).invuln)
      ? (player as any).invuln
      : 0;
  const isInvulnerable = rawInvuln > 0;
  const invulnTag = isInvulnerable ? ' · SHIELD I-FRAMES ACTIVE' : '';
  const summaryLine =
    'HULL: ' + hp + '/' + maxHp + ' (' + hullPct + '% · ' + hullStatus + ') // ' + chassisTier + invulnTag;

  return {
    hp,
    maxHp,
    hullPct,
    hullStatus,
    chassisTier,
    isInvulnerable,
    summaryLine
  };
}

