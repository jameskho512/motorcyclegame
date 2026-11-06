/**
 * MOTO-ROGUE: Cel-Shaded Vector Art Module
 *
 * Implements Arc System Works / Dragon Ball FighterZ / Anime fighting game vector aesthetics:
 * 1. Bold variable-weight black ink outlines (#0a0b10 / #000000).
 * 2. Sharp angular silhouettes, cel-shaded hard-edge 2-tone/3-tone color blocks, specular rim highlights.
 * 3. Player Motorcycle with rider helmet, dual exhaust, tires, and aiming turret.
 * 4. 3 Road-Raging Boss Muscle Cars with spiked bumpers, racing stripes, angry headlights, and exhaust flames.
 * 5. All 10 enemy types with distinct angular silhouettes and Elite golden borders.
 * 6. Obstacles: faceted rocks and explosive TNT barrels.
 * 7. Pickups: loot crates, mechanic toolboxes, jerry-cans, mod pedestals, and run weapons.
 * 8. Blast doors and exit trapdoors.
 *
 * Parity reference: moto-rogue/index.html L2966-L3238, L3275-L3361, L3458-L3697
 */

import { Graphics } from 'pixi.js';
import {
  PlayerState,
  Enemy,
  RegularEnemy,
  Boss,
  Obstacle,
  Pickup,
  Direction,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  WALL_THICKNESS,
  DOOR_HALF_WIDTH
} from '../types/game';

import { WEAPONS } from '../data/weapons';
import { DROP_ITEMS } from '../data/upgrades';
import { RARITY } from '../data/equipment';

/**
 * Converts a hex color string ('#ffd166') to a numeric color (0xffd166).
 */
export function parseColor(colorStr: string, fallback: number = 0xffffff): number {
  if (!colorStr) return fallback;
  if (colorStr.startsWith('#')) {
    const parsed = parseInt(colorStr.slice(1), 16);
    return isNaN(parsed) ? fallback : parsed;
  }
  return fallback;
}

// ============================================================================
// 1. PLAYER MOTORCYCLE RENDERING
// ============================================================================

export function drawMotorcycle(g: Graphics, player: PlayerState, _timestampMs: number = 0): void {
  const px = player.x;
  const py = player.y;
  const bAngle = player.bikeAngle;
  const aAngle = player.aimAngle;
  const wDef = WEAPONS[player.weapon] || WEAPONS.pistol;
  const weaponColor = parseColor(wDef.color, 0xffd166);

  // Invulnerability flicker
  const isBlinking = player.invuln > 0 && Math.floor(player.invuln * 16) % 2 === 0;
  const alpha = isBlinking ? 0.45 : 1.0;

  // --- Volumetric Headlight Cone ---
  const hlLength = 135;
  const hlSpread = 40;
  const cosB = Math.cos(bAngle);
  const sinB = Math.sin(bAngle);
  const perpX = -sinB;
  const perpY = cosB;

  const hlOriginX = px + cosB * 14;
  const hlOriginY = py + sinB * 14;
  const hlFarCenterX = px + cosB * hlLength;
  const hlFarCenterY = py + sinB * hlLength;

  const coneCoords = [
    hlOriginX, hlOriginY,
    hlFarCenterX + perpX * hlSpread, hlFarCenterY + perpY * hlSpread,
    hlFarCenterX - perpX * hlSpread, hlFarCenterY - perpY * hlSpread
  ];

  g.poly(coneCoords)
    .fill({ color: 0xfffae0, alpha: 0.14 * alpha });

  // Inner bright beam core
  const innerConeCoords = [
    hlOriginX, hlOriginY,
    hlFarCenterX + perpX * (hlSpread * 0.4), hlFarCenterY + perpY * (hlSpread * 0.4),
    hlFarCenterX - perpX * (hlSpread * 0.4), hlFarCenterY - perpY * (hlSpread * 0.4)
  ];
  g.poly(innerConeCoords)
    .fill({ color: 0xffffff, alpha: 0.22 * alpha });

  // --- Motorcycle Chassis (Drawn along bikeAngle) ---
  // Transforms helper
  const toWorld = (lx: number, ly: number): [number, number] => {
    return [
      px + cosB * lx - sinB * ly,
      py + sinB * lx + cosB * ly
    ];
  };

  // Rear Tire (Bold black rubber with hard-edge tread rim)
  const tireCoords = [
    toWorld(-23, -6.5),
    toWorld(-9, -6.5),
    toWorld(-9, 6.5),
    toWorld(-23, 6.5)
  ].flat();
  g.poly(tireCoords)
    .fill({ color: 0x0a0b10, alpha })
    .stroke({ color: 0x222530, width: 2, alpha });

  // Front Tire
  const frontTireCoords = [
    toWorld(8, -5.5),
    toWorld(21, -5.5),
    toWorld(21, 5.5),
    toWorld(8, 5.5)
  ].flat();
  g.poly(frontTireCoords)
    .fill({ color: 0x0a0b10, alpha })
    .stroke({ color: 0x222530, width: 2, alpha });

  // Chrome Twin Exhaust Pipes
  const ex1Coords = [toWorld(-21, -9.5), toWorld(-6, -9.5), toWorld(-6, -6.5), toWorld(-21, -6.5)].flat();
  const ex2Coords = [toWorld(-21, 6.5), toWorld(-6, 6.5), toWorld(-6, 9.5), toWorld(-21, 9.5)].flat();
  g.poly(ex1Coords).fill({ color: 0x535661, alpha }).stroke({ color: 0x0a0b10, width: 1.5, alpha });
  g.poly(ex2Coords).fill({ color: 0x535661, alpha }).stroke({ color: 0x0a0b10, width: 1.5, alpha });

  // Glowing heated exhaust tips
  const tip1 = [toWorld(-23, -9.5), toWorld(-21, -9.5), toWorld(-21, -6.5), toWorld(-23, -6.5)].flat();
  const tip2 = [toWorld(-23, 6.5), toWorld(-21, 6.5), toWorld(-21, 9.5), toWorld(-23, 9.5)].flat();
  g.poly(tip1).fill({ color: 0xff9f1c, alpha });
  g.poly(tip2).fill({ color: 0xff9f1c, alpha });

  // Cel-shaded Fairing & Chassis (Angular 2-tone orange)
  const chassisPoints = [
    toWorld(-14, -7.5),
    toWorld(8, -7.5),
    toWorld(14, 0),
    toWorld(8, 7.5),
    toWorld(-14, 7.5)
  ].flat();

  // Dark ink outline
  g.poly(chassisPoints)
    .stroke({ color: 0x0a0b10, width: 3.5, alpha });

  // Base bold orange fill
  g.poly(chassisPoints)
    .fill({ color: 0xff5c00, alpha });

  // Top specular highlight block
  const specPoints = [
    toWorld(-12, -6.5),
    toWorld(6, -6.5),
    toWorld(11, 0),
    toWorld(-12, 0)
  ].flat();
  g.poly(specPoints)
    .fill({ color: 0xff8533, alpha });

  // Center black racing stripe
  const stripePoints = [
    toWorld(-12, -2.5),
    toWorld(12, -2.5),
    toWorld(12, 2.5),
    toWorld(-12, 2.5)
  ].flat();
  g.poly(stripePoints)
    .fill({ color: 0x0a0b10, alpha });

  // Handlebars
  const [hbLeftX, hbLeftY] = toWorld(6, -13);
  const [hbMidX, hbMidY] = toWorld(9.5, 0);
  const [hbRightX, hbRightY] = toWorld(6, 13);
  g.moveTo(hbLeftX, hbLeftY)
    .lineTo(hbMidX, hbMidY)
    .lineTo(hbRightX, hbRightY)
    .stroke({ color: 0xdee2e6, width: 3, alpha });

  // Headlight fixture
  const [hlX, hlY] = toWorld(14, 0);
  g.circle(hlX, hlY, 3.5)
    .fill({ color: 0xfffce6, alpha })
    .stroke({ color: 0x0a0b10, width: 1.5, alpha });

  // --- Aimed Turret Carriage & Rider Helmet (aimAngle) ---
  const cosA = Math.cos(aAngle);
  const sinA = Math.sin(aAngle);

  const toAim = (lx: number, ly: number): [number, number] => {
    return [
      px + cosA * lx - sinA * ly,
      py + sinA * lx + cosA * ly
    ];
  };

  // Heavy Turret Carriage
  const turretPoints = [
    toAim(2, -4),
    toAim(22, -4),
    toAim(22, 4),
    toAim(2, 4)
  ].flat();

  g.poly(turretPoints)
    .fill({ color: 0x1a1c26, alpha })
    .stroke({ color: 0x0a0b10, width: 3, alpha });

  // Weapon Muzzle Accent Band
  const muzzlePoints = [
    toAim(19, -4.5),
    toAim(23, -4.5),
    toAim(23, 4.5),
    toAim(19, 4.5)
  ].flat();
  g.poly(muzzlePoints)
    .fill({ color: weaponColor, alpha });

  // Rider Helmet (Cel-shaded dome with bold ink contour)
  g.circle(px, py, 9)
    .fill({ color: 0x222533, alpha })
    .stroke({ color: 0x0a0b10, width: 3, alpha });

  // Aerodynamic Visor with Neon Weapon Color
  const visorPoints = [
    toAim(2.5, -5),
    toAim(8, -5),
    toAim(8, 5),
    toAim(2.5, 5)
  ].flat();

  g.poly(visorPoints)
    .fill({ color: weaponColor, alpha })
    .stroke({ color: 0x0a0b10, width: 1.5, alpha });
}

// ============================================================================
// 2. BOSS ROAD-RAGING MUSCLE CARS
// ============================================================================

export function drawBossCar(g: Graphics, boss: Boss, timestampMs: number = 0): void {
  const bx = boss.x;
  const by = boss.y;
  const angle = boss.angle;
  const raging = boss.aiTimer < 0.4;
  const bodyColor = boss.burnTimer > 0
    ? 0xff6b2b
    : parseColor(boss.color, 0xe63946);

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const toWorld = (lx: number, ly: number): [number, number] => {
    return [
      bx + cos * lx - sin * ly,
      by + sin * lx + cos * ly
    ];
  };

  // 1. Wheels (4 heavy wide-drag tires)
  const wheelOffsets = [
    [-28, -29], [24, -29],
    [-28, 23], [24, 23]
  ];
  wheelOffsets.forEach(([wx, wy]) => {
    const coords = [
      toWorld(wx, wy),
      toWorld(wx + 18, wy),
      toWorld(wx + 18, wy + 8),
      toWorld(wx, wy + 8)
    ].flat();
    g.poly(coords)
      .fill({ color: 0x0a0b10 })
      .stroke({ color: 0x2a2b36, width: 2 });
  });

  // 2. Car Chassis (Heavy muscle car body)
  const bodyCoords = [
    toWorld(-46, -23),
    toWorld(46, -23),
    toWorld(46, 23),
    toWorld(-46, 23)
  ].flat();

  // Bold black ink outline (ArcSys style)
  g.poly(bodyCoords)
    .stroke({ color: 0x0a0b10, width: 4.5 });

  // Hard-edge primary color
  g.poly(bodyCoords)
    .fill({ color: bodyColor });

  // 3. Dual White Racing Stripes
  const stripe1 = [toWorld(-44, -6), toWorld(44, -6), toWorld(44, -2), toWorld(-44, -2)].flat();
  const stripe2 = [toWorld(-44, 2), toWorld(44, 2), toWorld(44, 6), toWorld(-44, 6)].flat();
  g.poly(stripe1).fill({ color: 0xffffff, alpha: 0.85 });
  g.poly(stripe2).fill({ color: 0xffffff, alpha: 0.85 });

  // 4. Windshield & Cabin Roof
  const frontGlass = [toWorld(4, -17), toWorld(18, -17), toWorld(18, 17), toWorld(4, 17)].flat();
  const rearGlass = [toWorld(-34, -16), toWorld(-24, -16), toWorld(-24, 16), toWorld(-34, 16)].flat();
  const cabinRoof = [toWorld(-22, -15), toWorld(4, -15), toWorld(4, 15), toWorld(-22, 15)].flat();

  g.poly(frontGlass).fill({ color: 0x1b2530 }).stroke({ color: 0x0a0b10, width: 2 });
  g.poly(rearGlass).fill({ color: 0x1b2530 }).stroke({ color: 0x0a0b10, width: 2 });
  g.poly(cabinRoof).fill({ color: bodyColor }).stroke({ color: 0x0a0b10, width: 2 });

  // 5. Angry Driver Silhouette & Fist
  const [driverHeadX, driverHeadY] = toWorld(-9, 0);
  g.circle(driverHeadX, driverHeadY, 6)
    .fill({ color: 0xf1c27d })
    .stroke({ color: 0x0a0b10, width: 1.5 });

  const fistShake = Math.sin(timestampMs / 50) * (raging ? 4 : 1);
  const fistCoords = [
    toWorld(-4, -22 - fistShake),
    toWorld(4, -22 - fistShake),
    toWorld(4, -16 - fistShake),
    toWorld(-4, -16 - fistShake)
  ].flat();
  g.poly(fistCoords)
    .fill({ color: 0xf1c27d })
    .stroke({ color: 0x0a0b10, width: 1.5 });

  // 6. Hood Scoop
  const scoop = [toWorld(22, -7), toWorld(38, -7), toWorld(38, 7), toWorld(22, 7)].flat();
  g.poly(scoop).fill({ color: 0x0a0b10 });

  // 7. Chrome Spiked Front Bumper
  for (let i = -3; i <= 3; i++) {
    const spike = [
      toWorld(46, i * 6 - 3),
      toWorld(56, i * 6),
      toWorld(46, i * 6 + 3)
    ].flat();
    g.poly(spike)
      .fill({ color: 0xc9ced8 })
      .stroke({ color: 0x0a0b10, width: 1.5 });
  }

  // 8. Slanted Angular Angry Headlights with Furrowed Eyebrows
  const hlColor = raging ? 0xff4d6d : 0xfff3b0;
  const [hl1X, hl1Y] = toWorld(43, -15);
  const [hl2X, hl2Y] = toWorld(43, 15);
  g.circle(hl1X, hl1Y, 5).fill({ color: hlColor }).stroke({ color: 0x0a0b10, width: 2 });
  g.circle(hl2X, hl2Y, 5).fill({ color: hlColor }).stroke({ color: 0x0a0b10, width: 2 });

  // Slanted eyebrow cuts
  const [eb1StartX, eb1StartY] = toWorld(38, -23);
  const [eb1EndX, eb1EndY] = toWorld(48, -11);
  const [eb2StartX, eb2StartY] = toWorld(38, 23);
  const [eb2EndX, eb2EndY] = toWorld(48, 11);
  g.moveTo(eb1StartX, eb1StartY).lineTo(eb1EndX, eb1EndY).stroke({ color: 0x0a0b10, width: 3.5 });
  g.moveTo(eb2StartX, eb2StartY).lineTo(eb2EndX, eb2EndY).stroke({ color: 0x0a0b10, width: 3.5 });

  // 9. Rear Exhaust Flames
  const flameLen = 10 + Math.random() * 12 + (raging ? 10 : 0);
  const flame1 = [toWorld(-47, -9), toWorld(-47 - flameLen, -7), toWorld(-47, -4)].flat();
  const flame2 = [toWorld(-47, 9), toWorld(-47 - flameLen, 7), toWorld(-47, 4)].flat();
  const flameCol = Math.random() < 0.5 ? 0xff9f1c : 0xff5400;
  g.poly(flame1).fill({ color: flameCol }).stroke({ color: 0x0a0b10, width: 1.5 });
  g.poly(flame2).fill({ color: flameCol }).stroke({ color: 0x0a0b10, width: 1.5 });
}

// ============================================================================
// 3. REGULAR & ELITE ENEMIES (ALL 10 TYPES)
// ============================================================================

export function drawEnemy(g: Graphics, en: Enemy, timestampMs: number = 0): void {
  if (en.type === 'boss') {
    drawBossCar(g, en as Boss, timestampMs);
    return;
  }

  const reg = en as RegularEnemy;
  const ex = reg.x;
  const ey = reg.y;
  const angle = reg.angle;
  const r = reg.radius;
  const bodyColor = reg.burnTimer > 0
    ? 0xff6b2b
    : parseColor(reg.color, 0x00bbf9);

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  const toWorld = (lx: number, ly: number): [number, number] => {
    return [
      ex + cos * lx - sin * ly,
      ey + sin * lx + cos * ly
    ];
  };

  // Laser telegraph for sniper & charger
  if ((reg.type === 'charger' && reg.state === 'windup') || (reg.type === 'sniper' && reg.aiTimer < 0.45)) {
    const laserLen = 260;
    g.moveTo(ex, ey)
      .lineTo(ex + cos * laserLen, ey + sin * laserLen)
      .stroke({ color: 0xff4d6d, width: 2, alpha: 0.65 });
  }

  const borderWidth = reg.isElite ? 4 : 2.5;
  const borderColor = reg.isElite ? 0xffd166 : 0x0a0b10;

  switch (reg.type) {
    case 'swarmer':
    case 'mini_swarmer': {
      // Sharp Diamond-head spear silhouette
      const points = [
        toWorld(r * 1.3, 0),
        toWorld(0, -r * 0.8),
        toWorld(-r * 0.9, 0),
        toWorld(0, r * 0.8)
      ].flat();

      g.poly(points)
        .fill({ color: bodyColor })
        .stroke({ color: borderColor, width: borderWidth });

      // Eye slit
      const [eyeX, eyeY] = toWorld(r * 0.3, 0);
      g.circle(eyeX, eyeY, Math.max(2, r * 0.22))
        .fill({ color: 0xffffff });
      break;
    }

    case 'turret': {
      // Heavy beveled Octagon fortress with rotating cannon
      const octPoints = [
        toWorld(r, -r * 0.4), toWorld(r * 0.4, -r),
        toWorld(-r * 0.4, -r), toWorld(-r, -r * 0.4),
        toWorld(-r, r * 0.4), toWorld(-r * 0.4, r),
        toWorld(r * 0.4, r), toWorld(r, r * 0.4)
      ].flat();

      g.poly(octPoints)
        .fill({ color: bodyColor })
        .stroke({ color: borderColor, width: borderWidth });

      // Cannon barrel
      const barrel = [toWorld(r * 0.2, -3.5), toWorld(r * 1.2, -3.5), toWorld(r * 1.2, 3.5), toWorld(r * 0.2, 3.5)].flat();
      g.poly(barrel).fill({ color: 0x0a0b10 });
      break;
    }

    case 'charger': {
      // Aggressive swept-wing wedge
      const points = [
        toWorld(r * 1.35, 0),
        toWorld(-r * 0.9, -r * 0.9),
        toWorld(-r * 0.4, 0),
        toWorld(-r * 0.9, r * 0.9)
      ].flat();

      g.poly(points)
        .fill({ color: bodyColor })
        .stroke({ color: borderColor, width: borderWidth });
      break;
    }

    case 'trishot': {
      // Angular Tri-wing craft
      const points = [
        toWorld(r * 1.2, 0),
        toWorld(-r * 0.8, -r * 0.9),
        toWorld(-r * 0.3, 0),
        toWorld(-r * 0.8, r * 0.9)
      ].flat();

      g.poly(points)
        .fill({ color: bodyColor })
        .stroke({ color: borderColor, width: borderWidth });

      // 3 gun ports
      [-r * 0.5, 0, r * 0.5].forEach(offset => {
        const [gx, gy] = toWorld(r * 0.6, offset);
        g.circle(gx, gy, 2).fill({ color: 0x0a0b10 });
      });
      break;
    }

    case 'bomber': {
      // Heavy hexagon mortar platform
      const hexPoints = [
        toWorld(r * 0.9, 0),
        toWorld(r * 0.45, -r * 0.8),
        toWorld(-r * 0.45, -r * 0.8),
        toWorld(-r * 0.9, 0),
        toWorld(-r * 0.45, r * 0.8),
        toWorld(r * 0.45, r * 0.8)
      ].flat();

      g.poly(hexPoints)
        .fill({ color: bodyColor })
        .stroke({ color: borderColor, width: borderWidth });

      // Mortar launch tube
      g.circle(ex, ey, r * 0.4).fill({ color: 0x0a0b10 });
      break;
    }

    case 'brute': {
      // Armored tank fortress with frontal shield plating
      const rectPoints = [
        toWorld(r, -r), toWorld(r, r),
        toWorld(-r, r), toWorld(-r, -r)
      ].flat();

      g.poly(rectPoints)
        .fill({ color: bodyColor })
        .stroke({ color: borderColor, width: borderWidth });

      // Frontal heavy armor plate (ArcSys style hard-edge highlight)
      const platePoints = [
        toWorld(r, -r),
        toWorld(r + 5, -r * 0.7),
        toWorld(r + 5, r * 0.7),
        toWorld(r, r)
      ].flat();

      g.poly(platePoints)
        .fill({ color: 0xadb5bd })
        .stroke({ color: 0x0a0b10, width: 2 });
      break;
    }

    case 'splitter': {
      // Faceted dual-core crystal bug
      g.circle(ex - 4, ey, r * 0.8).fill({ color: bodyColor }).stroke({ color: borderColor, width: borderWidth });
      g.circle(ex + 4, ey, r * 0.8).fill({ color: bodyColor }).stroke({ color: borderColor, width: borderWidth });
      break;
    }

    case 'sniper': {
      // Long-barrel precision needle
      const points = [
        toWorld(r * 1.5, 0),
        toWorld(-r * 0.8, -r * 0.6),
        toWorld(-r * 0.5, 0),
        toWorld(-r * 0.8, r * 0.6)
      ].flat();

      g.poly(points)
        .fill({ color: bodyColor })
        .stroke({ color: borderColor, width: borderWidth });
      break;
    }

    case 'pyro': {
      // Heat-sink flame striker
      g.circle(ex, ey, r)
        .fill({ color: bodyColor })
        .stroke({ color: borderColor, width: borderWidth });

      // Exhaust heat vent
      const [vx, vy] = toWorld(-r * 0.5, 0);
      g.circle(vx, vy, 4).fill({ color: 0xffd166 });
      break;
    }

    default: {
      g.circle(ex, ey, r)
        .fill({ color: bodyColor })
        .stroke({ color: borderColor, width: borderWidth });
      break;
    }
  }

  // Elite Golden Crown / Ring
  if (reg.isElite) {
    g.circle(ex, ey, r + 3)
      .stroke({ color: 0xffd166, width: 2, alpha: 0.8 });
  }
}

// ============================================================================
// 4. OBSTACLES (ROCKS & TNT BARRELS)
// ============================================================================

export function drawObstacle(g: Graphics, ob: Obstacle): void {
  const hs = ob.size / 2;

  if (ob.type === 'rock') {
    // Sharp faceted indestructible rock
    const rockPoints = [
      ob.x - hs, ob.y - hs + 4,
      ob.x - hs + 6, ob.y - hs,
      ob.x + hs - 4, ob.y - hs,
      ob.x + hs, ob.y - hs + 7,
      ob.x + hs, ob.y + hs - 5,
      ob.x + hs - 6, ob.y + hs,
      ob.x - hs + 5, ob.y + hs,
      ob.x - hs, ob.y + hs - 4
    ];

    // Bold black ink contour
    g.poly(rockPoints)
      .fill({ color: 0x3b3d4f })
      .stroke({ color: 0x0a0b10, width: 3 });

    // Sharp angular stone facet highlights
    g.moveTo(ob.x - hs + 8, ob.y - hs + 10)
      .lineTo(ob.x + 2, ob.y + 2)
      .lineTo(ob.x + hs - 7, ob.y + hs - 6)
      .stroke({ color: 0x686c87, width: 2 });
  } else {
    // High-contrast explosive TNT barrel
    // Cylinder body
    g.circle(ob.x, ob.y, hs)
      .fill({ color: 0xe63946 })
      .stroke({ color: 0x0a0b10, width: 3 });

    // Yellow hazard bands
    g.circle(ob.x, ob.y, hs - 3)
      .stroke({ color: 0xffd166, width: 2.5 });
  }
}

// ============================================================================
// 5. PICKUPS & PEDESTALS (Actual Graphical Representations)
// ============================================================================

export function drawPickup(g: Graphics, p: Pickup, timestampMs: number = 0): void {
  const bob = Math.sin(timestampMs / 220) * 3;
  const shadowY = p.y + 12;

  // Ground drop shadow
  g.ellipse(p.x, shadowY, 14, 5)
    .fill({ color: 0x000000, alpha: 0.45 });

  if (p.type === 'loot') {
    const R = RARITY[p.item.rarity];
    const rColor = parseColor(R.color, 0xffd166);
    const slot = p.item.slot;
    const itemY = p.y + bob;

    // Glowing rarity tech pedestal disc
    g.circle(p.x, p.y + 6, 17)
      .fill({ color: 0x161822 })
      .stroke({ color: rColor, width: 2.5, alpha: 0.9 });
    g.circle(p.x, p.y + 6, 12)
      .stroke({ color: rColor, width: 1, alpha: 0.4 });

    // Distinct Motorcycle Equipment Vector Graphics
    if (slot === 'tires') {
      // Detailed motorcycle wheel: outer tire, rim, spokes, hub
      g.circle(p.x, itemY, 13)
        .fill({ color: 0x1a1c24 })
        .stroke({ color: 0x0a0b10, width: 2 });
      g.circle(p.x, itemY, 8.5)
        .fill({ color: 0x3a3d4d })
        .stroke({ color: rColor, width: 1.5 });
      // 4 silver rim spokes
      for (let a = 0; a < 4; a++) {
        const ang = (a * Math.PI) / 2 + (timestampMs / 1000);
        g.moveTo(p.x, itemY)
          .lineTo(p.x + Math.cos(ang) * 8.5, itemY + Math.sin(ang) * 8.5)
          .stroke({ color: 0xc9ced8, width: 1.5 });
      }
      g.circle(p.x, itemY, 3.5).fill({ color: rColor });
    } else if (slot === 'engine') {
      // V-twin motorcycle engine block with cooling fins
      g.rect(p.x - 9, itemY - 6, 18, 14)
        .fill({ color: 0x2e303d })
        .stroke({ color: 0x0a0b10, width: 1.5 });
      // Dual V-angled cylinder heads
      const cylL = [p.x - 9, itemY - 6, p.x - 13, itemY - 14, p.x - 4, itemY - 14, p.x - 2, itemY - 6];
      const cylR = [p.x + 2, itemY - 6, p.x + 4, itemY - 14, p.x + 13, itemY - 14, p.x + 9, itemY - 6];
      g.poly(cylL).fill({ color: 0x484b60 }).stroke({ color: rColor, width: 1.5 });
      g.poly(cylR).fill({ color: 0x484b60 }).stroke({ color: rColor, width: 1.5 });
      // Cooling fin horizontal stripes
      g.moveTo(p.x - 7, itemY - 2).lineTo(p.x + 7, itemY - 2).stroke({ color: rColor, width: 1 });
      g.moveTo(p.x - 7, itemY + 2).lineTo(p.x + 7, itemY + 2).stroke({ color: rColor, width: 1 });
      g.circle(p.x, itemY + 5, 3).fill({ color: 0xffffff, alpha: 0.8 });
    } else if (slot === 'handlebars') {
      // Swept motorcycle handlebars with grips and levers
      g.moveTo(p.x - 14, itemY + 3)
        .lineTo(p.x - 7, itemY - 6)
        .lineTo(p.x + 7, itemY - 6)
        .lineTo(p.x + 14, itemY + 3)
        .stroke({ color: 0xdde1e7, width: 2.5 });
      // Handgrips
      g.rect(p.x - 16, itemY + 1, 4, 6).fill({ color: 0x0a0b10 }).stroke({ color: rColor, width: 1 });
      g.rect(p.x + 12, itemY + 1, 4, 6).fill({ color: 0x0a0b10 }).stroke({ color: rColor, width: 1 });
      // Center clamp
      g.circle(p.x, itemY - 6, 3.5).fill({ color: rColor });
    } else if (slot === 'exhaust') {
      // Curved twin chrome exhaust headers and megaphone muffler
      const pipePts = [
        p.x - 10, itemY - 7,
        p.x - 3, itemY - 7,
        p.x + 5, itemY,
        p.x + 14, itemY + 3
      ];
      g.poly(pipePts).stroke({ color: 0xdde1e7, width: 3.5 });
      // Flared muffler tip with heated nozzle
      g.ellipse(p.x + 14, itemY + 3, 3, 5).fill({ color: 0xff9f1c });
      g.circle(p.x - 10, itemY - 7, 3).fill({ color: rColor });
    } else if (slot === 'frame') {
      // Trellis tubular triangulated chassis frame
      const framePts = [
        p.x - 12, itemY + 6,
        p.x - 4, itemY - 10,
        p.x + 12, itemY - 4,
        p.x + 6, itemY + 6,
        p.x - 12, itemY + 6
      ];
      g.poly(framePts).stroke({ color: rColor, width: 2.5 });
      g.moveTo(p.x - 4, itemY - 10).lineTo(p.x + 6, itemY + 6).stroke({ color: 0xffffff, width: 1.5, alpha: 0.8 });
    } else {
      // Tank: sculpted teardrop fuel tank with chrome cap
      const tankPts = [
        p.x - 13, itemY + 2,
        p.x - 7, itemY - 8,
        p.x + 10, itemY - 8,
        p.x + 14, itemY,
        p.x + 7, itemY + 7,
        p.x - 7, itemY + 7
      ];
      g.poly(tankPts).fill({ color: 0x222433 }).stroke({ color: rColor, width: 2 });
      g.ellipse(p.x - 1, itemY - 3, 6, 2.5).fill({ color: rColor });
      g.circle(p.x + 4, itemY - 7, 2).fill({ color: 0xffffff });
    }
  } else if (p.type === 'item_drop') {
    const it = DROP_ITEMS[p.itemId];
    const itColor = parseColor(it ? it.color : '#ffd166', 0xffd166);
    const itemY = p.y + bob;

    // Glowing aura base ring
    g.circle(p.x, p.y + 6, 16)
      .fill({ color: 0x141520 })
      .stroke({ color: itColor, width: 2, alpha: 0.85 });

    // Distinct Stacking Item Graphics
    if (p.itemId === 'nitro_syringe') {
      // Nitro Injector Syringe: glass cylinder with orange nitro fuel & steel needle
      // Needle pointing down
      g.moveTo(p.x, itemY + 6).lineTo(p.x, itemY + 14).stroke({ color: 0xdde1e7, width: 1.5 });
      // Glass barrel
      g.rect(p.x - 4, itemY - 6, 8, 12).fill({ color: 0xff9f1c, alpha: 0.9 }).stroke({ color: 0xffffff, width: 1.5 });
      // Plunger & flange
      g.moveTo(p.x - 5, itemY - 6).lineTo(p.x + 5, itemY - 6).stroke({ color: 0xdde1e7, width: 2 });
      g.moveTo(p.x, itemY - 6).lineTo(p.x, itemY - 11).stroke({ color: 0xdde1e7, width: 1.5 });
      g.circle(p.x, itemY - 12, 2.5).fill({ color: 0xffffff });
    } else if (p.itemId === 'tire_iron') {
      // Steel Tire Iron / Angled Crowbar
      const barPts = [
        p.x - 12, itemY + 9,
        p.x + 6, itemY - 9,
        p.x + 13, itemY - 7
      ];
      g.poly(barPts).stroke({ color: 0xc9ced8, width: 3.5 });
      // Chisel pry tip
      g.moveTo(p.x - 14, itemY + 11).lineTo(p.x - 9, itemY + 7).stroke({ color: itColor, width: 2 });
    } else if (p.itemId === 'chrome_lens') {
      // Motorcycle Riding Goggles / Aviator Lenses
      // Bridge
      g.moveTo(p.x - 3, itemY).lineTo(p.x + 3, itemY).stroke({ color: 0xadb5bd, width: 2 });
      // Dual rounded frames
      g.ellipse(p.x - 7, itemY, 5.5, 4.5).fill({ color: 0x4cc9f0, alpha: 0.85 }).stroke({ color: 0xffffff, width: 1.5 });
      g.ellipse(p.x + 7, itemY, 5.5, 4.5).fill({ color: 0x4cc9f0, alpha: 0.85 }).stroke({ color: 0xffffff, width: 1.5 });
      // Lens glare glints
      g.moveTo(p.x - 9, itemY - 2).lineTo(p.x - 6, itemY + 2).stroke({ color: 0xffffff, width: 1 });
      g.moveTo(p.x + 5, itemY - 2).lineTo(p.x + 8, itemY + 2).stroke({ color: 0xffffff, width: 1 });
    } else if (p.itemId === 'gasoline') {
      // Vintage Steel Jerry-can with Flame insignia
      g.rect(p.x - 8, itemY - 8, 16, 17).fill({ color: 0xd62828 }).stroke({ color: 0x0a0b10, width: 1.5 });
      g.moveTo(p.x - 8, itemY - 8).lineTo(p.x + 8, itemY + 9).stroke({ color: 0x8a1313, width: 1.5 });
      // Spout & handle
      g.rect(p.x - 7, itemY - 12, 6, 4).fill({ color: 0xffd166 });
      g.rect(p.x + 1, itemY - 12, 7, 3).fill({ color: 0xffd166 });
      // Flame badge
      g.circle(p.x, itemY, 3).fill({ color: 0xffbe0b });
    } else if (p.itemId === 'racing_slicks') {
      // Racing Slick Motorcycle Wheel
      g.circle(p.x, itemY, 11).fill({ color: 0x111218 }).stroke({ color: 0x00f5d4, width: 2 });
      g.circle(p.x, itemY, 6).fill({ color: 0x3d405b }).stroke({ color: 0xffffff, width: 1 });
      g.circle(p.x, itemY, 2.5).fill({ color: 0x00f5d4 });
    } else {
      // Oil Infusion: Glass chemical flask with shimmering oil
      const flaskPts = [
        p.x - 3, itemY - 10,
        p.x + 3, itemY - 10,
        p.x + 3, itemY - 4,
        p.x + 9, itemY + 7,
        p.x - 9, itemY + 7,
        p.x - 3, itemY - 4
      ];
      g.poly(flaskPts).fill({ color: 0x7209b7, alpha: 0.9 }).stroke({ color: 0xffffff, width: 1.5 });
      g.circle(p.x, itemY + 3, 3).fill({ color: 0xff9f1c });
    }
  } else if (p.type === 'heart' || p.type === 'shop_heart') {
    const itemY = p.y + bob;
    // Red Fuel Jerry-can
    g.rect(p.x - 9, itemY - 9, 18, 20)
      .fill({ color: 0xd62828 })
      .stroke({ color: 0x0a0b10, width: 2 });

    // Stamped structural cross-brace
    g.moveTo(p.x - 6, itemY - 6).lineTo(p.x + 6, itemY + 7).stroke({ color: 0x9e1a1a, width: 1.5 });
    g.moveTo(p.x + 6, itemY - 6).lineTo(p.x - 6, itemY + 7).stroke({ color: 0x9e1a1a, width: 1.5 });

    // Handle & Brass Pour Spout
    g.rect(p.x - 9, itemY - 14, 7, 5).fill({ color: 0xffd166 }).stroke({ color: 0x0a0b10, width: 1 });
    g.rect(p.x + 1, itemY - 14, 8, 4).fill({ color: 0xffd166 }).stroke({ color: 0x0a0b10, width: 1 });
  } else if (p.type === 'mod_pedestal') {
    const itemY = p.y + bob;

    // High-tech Octagonal Stone Pedestal Base
    const octBase = [
      p.x - 16, p.y + 4,
      p.x - 8, p.y - 4,
      p.x + 8, p.y - 4,
      p.x + 16, p.y + 4,
      p.x + 16, p.y + 12,
      p.x + 8, p.y + 18,
      p.x - 8, p.y + 18,
      p.x - 16, p.y + 12
    ];
    g.poly(octBase).fill({ color: 0x1b1d2a }).stroke({ color: 0x3d4158, width: 2 });
    g.circle(p.x, p.y + 7, 10).stroke({ color: 0xffd166, width: 1.5, alpha: 0.7 });

    // Floating Rotating Faceted Mod Crystal
    const pulse = 1 + Math.sin(timestampMs / 180) * 0.12;
    const crystalPts = [
      p.x, itemY - 14 * pulse,
      p.x + 10 * pulse, itemY,
      p.x, itemY + 12 * pulse,
      p.x - 10 * pulse, itemY
    ];
    g.poly(crystalPts).fill({ color: 0xffd166, alpha: 0.9 }).stroke({ color: 0xffffff, width: 2 });
    // Core specular shine
    g.circle(p.x, itemY, 3.5).fill({ color: 0xffffff });
  } else if (p.type === 'run_weapon') {
    const wInfo = WEAPONS[p.weaponId];
    const wColor = parseColor(wInfo ? wInfo.color : '#ffd166', 0xffd166);
    const itemY = p.y + bob;

    // High-tech Armory Weapon Display Rack
    g.roundRect(p.x - 18, p.y + 2, 36, 14, 4)
      .fill({ color: 0x181a24 })
      .stroke({ color: wColor, width: 2 });
    g.circle(p.x, p.y + 9, 3).fill({ color: wColor, alpha: 0.8 });

    // Distinct Vector Silhouette per Weapon
    const wid = p.weaponId;
    if (wid === 'pistol') {
      // Semi-auto sidearm
      g.rect(p.x - 9, itemY - 6, 16, 5).fill({ color: wColor }).stroke({ color: 0x0a0b10, width: 1 });
      g.rect(p.x - 6, itemY - 1, 6, 9).fill({ color: 0x222530 }).stroke({ color: wColor, width: 1 });
    } else if (wid === 'machine_gun') {
      // Compact SMG with curved clip
      g.rect(p.x - 13, itemY - 5, 24, 5).fill({ color: wColor }).stroke({ color: 0x0a0b10, width: 1 });
      g.rect(p.x - 4, itemY, 5, 9).fill({ color: 0x1c1e28 }).stroke({ color: wColor, width: 1 });
      g.rect(p.x - 10, itemY, 4, 6).fill({ color: 0x3a3d4d });
    } else if (wid === 'flamethrower') {
      // Flame projector with twin canisters & pilot flame
      g.rect(p.x - 12, itemY - 6, 20, 6).fill({ color: wColor }).stroke({ color: 0x0a0b10, width: 1 });
      g.ellipse(p.x - 5, itemY + 4, 4, 6).fill({ color: 0xff5400 });
      g.circle(p.x + 10, itemY - 3, 2.5).fill({ color: 0xffd166 });
    } else if (wid === 'grenade_launcher') {
      // Revolving drum grenade launcher
      g.rect(p.x - 8, itemY - 7, 20, 7).fill({ color: wColor }).stroke({ color: 0x0a0b10, width: 1 });
      g.circle(p.x - 4, itemY - 1, 6).fill({ color: 0x2b2d3d }).stroke({ color: wColor, width: 1.5 });
    } else if (wid === 'shotgun') {
      // Double-barrel shotgun
      g.rect(p.x - 14, itemY - 7, 26, 4).fill({ color: wColor }).stroke({ color: 0x0a0b10, width: 1 });
      g.rect(p.x - 14, itemY - 3, 26, 4).fill({ color: wColor }).stroke({ color: 0x0a0b10, width: 1 });
      g.rect(p.x - 14, itemY + 1, 10, 5).fill({ color: 0x483c32 });
    } else if (wid === 'railgun') {
      // Electromagnetic dual rail accelerator
      g.rect(p.x - 16, itemY - 6, 30, 3).fill({ color: 0x00f5d4 }).stroke({ color: 0x0a0b10, width: 1 });
      g.rect(p.x - 16, itemY - 1, 30, 3).fill({ color: 0x00f5d4 }).stroke({ color: 0x0a0b10, width: 1 });
      g.rect(p.x - 8, itemY - 8, 4, 12).fill({ color: 0xffffff });
      g.rect(p.x + 4, itemY - 8, 4, 12).fill({ color: 0xffffff });
    } else {
      // Arc Tesla Coil emitter
      g.rect(p.x - 3, itemY - 4, 6, 12).fill({ color: 0x484b60 }).stroke({ color: wColor, width: 1 });
      g.circle(p.x, itemY - 8, 6).fill({ color: 0x7bdff2 }).stroke({ color: 0xffffff, width: 1.5 });
      g.circle(p.x, itemY - 8, 2.5).fill({ color: 0xffffff });
    }
  }
}

// ============================================================================
// 6. BLAST DOORS & EXIT TRAPDOORS (Dimensional Vortex Portal)
// ============================================================================

export function drawDoor(
  g: Graphics,
  dir: Direction,
  _isOpen: boolean,
  isCleared: boolean,
  frameColorHex: string = '#6c757d'
): void {
  const frameColor = parseColor(frameColorHex, 0x6c757d);
  let cx = ARENA_WIDTH / 2;
  let cy = WALL_THICKNESS / 2;
  let w = DOOR_HALF_WIDTH * 2;
  let h = WALL_THICKNESS;

  if (dir === 'S') {
    cy = ARENA_HEIGHT - WALL_THICKNESS / 2;
  } else if (dir === 'W') {
    cx = WALL_THICKNESS / 2;
    cy = ARENA_HEIGHT / 2;
    w = WALL_THICKNESS;
    h = DOOR_HALF_WIDTH * 2;
  } else if (dir === 'E') {
    cx = ARENA_WIDTH - WALL_THICKNESS / 2;
    cy = ARENA_HEIGHT / 2;
    w = WALL_THICKNESS;
    h = DOOR_HALF_WIDTH * 2;
  }

  // Door opening fill
  const fillColor = isCleared ? 0x2a2b3a : 0x4a1c24;
  g.rect(cx - w / 2, cy - h / 2, w, h)
    .fill({ color: fillColor });

  // Heavy blast door border frame
  g.rect(cx - w / 2, cy - h / 2, w, h)
    .stroke({ color: frameColor, width: 3 });
}

export function drawTrapdoor(g: Graphics, timestampMs: number = 0): void {
  const tx = ARENA_WIDTH / 2;
  const ty = ARENA_HEIGHT / 2 - 45;
  const pulse = 1 + Math.sin(timestampMs / 180) * 0.10;
  const rot = (timestampMs / 500);

  // 1. Swirling Outer Nebula Accretion Halo
  g.circle(tx, ty, 38 * pulse)
    .fill({ color: 0x7209b7, alpha: 0.22 });

  // 2. Multi-layer Spiral Energy Rings
  g.circle(tx, ty, 30 * pulse)
    .stroke({ color: 0x4cc9f0, width: 3, alpha: 0.85 });

  g.circle(tx, ty, 22 * pulse)
    .stroke({ color: 0x7bdff2, width: 2, alpha: 0.95 });

  // 3. Deep Event Horizon Vortex Core
  g.circle(tx, ty, 16 * pulse)
    .fill({ color: 0x06070a });

  // 4. Rotating Energy Motes along rim
  for (let i = 0; i < 4; i++) {
    const ang = rot + (i * Math.PI) / 2;
    const px = tx + Math.cos(ang) * (26 * pulse);
    const py = ty + Math.sin(ang) * (26 * pulse);
    g.circle(px, py, 2.5)
      .fill({ color: 0xffffff, alpha: 0.9 });
  }

  // 5. Pulsing Center Singularity
  const coreAlpha = 0.5 + Math.sin(timestampMs / 120) * 0.3;
  g.circle(tx, ty, 5)
    .fill({ color: 0x00f5d4, alpha: coreAlpha });
}
