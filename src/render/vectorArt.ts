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
  const hlLength = 145;
  const hlSpread = 42;
  const cosB = Math.cos(bAngle);
  const sinB = Math.sin(bAngle);
  const perpX = -sinB;
  const perpY = cosB;

  const hlOriginX = px + cosB * 18;
  const hlOriginY = py + sinB * 18;
  const hlFarCenterX = px + cosB * hlLength;
  const hlFarCenterY = py + sinB * hlLength;

  const coneCoords = [
    hlOriginX, hlOriginY,
    hlFarCenterX + perpX * hlSpread, hlFarCenterY + perpY * hlSpread,
    hlFarCenterX - perpX * hlSpread, hlFarCenterY - perpY * hlSpread
  ];
  g.poly(coneCoords)
    .fill({ color: 0xfffae0, alpha: 0.14 * alpha });

  const innerConeCoords = [
    hlOriginX, hlOriginY,
    hlFarCenterX + perpX * (hlSpread * 0.42), hlFarCenterY + perpY * (hlSpread * 0.42),
    hlFarCenterX - perpX * (hlSpread * 0.42), hlFarCenterY - perpY * (hlSpread * 0.42)
  ];
  g.poly(innerConeCoords)
    .fill({ color: 0xffffff, alpha: 0.22 * alpha });

  // 2.5D Height Extrusion Helper: z > 0 lifts geometry upward in screen-Y for three-quarter 3D depth
  const toWorld = (lx: number, ly: number, z: number = 0): [number, number] => {
    return [
      px + cosB * lx - sinB * ly,
      py + sinB * lx + cosB * ly - z
    ];
  };

  // --- 1. Wide Performance Tires & 2.5D Sidewalls ---
  // Rear Tire (Fat racing slick with 3D sidewall, tread grooves & orange rim stripe)
  const rearTireBase = [
    toWorld(-26, -7.8, 0),
    toWorld(-8, -7.8, 0),
    toWorld(-8, 7.8, 0),
    toWorld(-26, 7.8, 0)
  ].flat();
  g.poly(rearTireBase)
    .fill({ color: 0x0b0c12, alpha })
    .stroke({ color: 0x050508, width: 2.5, alpha });

  const rearTireTop = [
    toWorld(-25, -7.0, 2.5),
    toWorld(-9, -7.0, 2.5),
    toWorld(-9, 7.0, 2.5),
    toWorld(-25, 7.0, 2.5)
  ].flat();
  g.poly(rearTireTop)
    .fill({ color: 0x1e202b, alpha })
    .stroke({ color: 0x0a0b10, width: 2, alpha });

  // Rear Tire orange alloy rim accent & tread ribs
  const [rt1x, rt1y] = toWorld(-22, -5.5, 2.5);
  const [rt2x, rt2y] = toWorld(-12, -5.5, 2.5);
  g.moveTo(rt1x, rt1y).lineTo(rt2x, rt2y).stroke({ color: 0xff5c00, width: 1.6, alpha });
  for (const tx of [-23, -19, -15, -11]) {
    const [t1x, t1y] = toWorld(tx, -6.2, 2.5);
    const [t2x, t2y] = toWorld(tx - 1.5, 6.2, 2.5);
    g.moveTo(t1x, t1y).lineTo(t2x, t2y).stroke({ color: 0x0a0b10, width: 1.5, alpha });
  }

  // Front Tire (Sculpted sport tire with gold inverted fork tubes)
  const frontTireBase = [
    toWorld(9, -6.2, 0),
    toWorld(25, -6.2, 0),
    toWorld(25, 6.2, 0),
    toWorld(9, 6.2, 0)
  ].flat();
  g.poly(frontTireBase)
    .fill({ color: 0x0b0c12, alpha })
    .stroke({ color: 0x050508, width: 2.5, alpha });

  const frontTireTop = [
    toWorld(10, -5.4, 2.2),
    toWorld(24, -5.4, 2.2),
    toWorld(24, 5.4, 2.2),
    toWorld(10, 5.4, 2.2)
  ].flat();
  g.poly(frontTireTop)
    .fill({ color: 0x1e202b, alpha })
    .stroke({ color: 0x0a0b10, width: 1.8, alpha });

  // Gold Inverted Front Forks & Rear Swingarm
  const [fkL1x, fkL1y] = toWorld(8, -6.8, 4.5);
  const [fkL2x, fkL2y] = toWorld(18, -5.8, 1.5);
  const [fkR1x, fkR1y] = toWorld(8, 6.8, 4.5);
  const [fkR2x, fkR2y] = toWorld(18, 5.8, 1.5);
  g.moveTo(fkL1x, fkL1y).lineTo(fkL2x, fkL2y).stroke({ color: 0xffbe0b, width: 3, alpha });
  g.moveTo(fkR1x, fkR1y).lineTo(fkR2x, fkR2y).stroke({ color: 0xffbe0b, width: 3, alpha });

  // --- 2. Twin Upswept Megaphone Exhausts & Mechanical Engine Block ---
  const exLeft = [toWorld(-24, -10.5, 4), toWorld(-5, -8.5, 3), toWorld(-5, -5.5, 3), toWorld(-24, -7.2, 4)].flat();
  const exRight = [toWorld(-24, 7.2, 4), toWorld(-5, 5.5, 3), toWorld(-5, 8.5, 3), toWorld(-24, 10.5, 4)].flat();
  g.poly(exLeft).fill({ color: 0x5c6274, alpha }).stroke({ color: 0x0a0b10, width: 2, alpha });
  g.poly(exRight).fill({ color: 0x454a59, alpha }).stroke({ color: 0x0a0b10, width: 2, alpha });

  // Glowing afterburner exhaust nozzles
  const [noz1x, noz1y] = toWorld(-24.5, -8.8, 4);
  const [noz2x, noz2y] = toWorld(-24.5, 8.8, 4);
  g.circle(noz1x, noz1y, 2.4).fill({ color: 0xff9f1c, alpha });
  g.circle(noz2x, noz2y, 2.4).fill({ color: 0xff9f1c, alpha });

  // Exposed Gunmetal V-Twin Engine Casing & Gold Clutch Cover
  const engineBlock = [
    toWorld(-7, -9.2, 3),
    toWorld(6, -9.2, 3),
    toWorld(6, 9.2, 3),
    toWorld(-7, 9.2, 3)
  ].flat();
  g.poly(engineBlock)
    .fill({ color: 0x2b2e3b, alpha })
    .stroke({ color: 0x0a0b10, width: 2, alpha });
  const [clX, clY] = toWorld(-1, 7.5, 3.2);
  g.circle(clX, clY, 3.2)
    .fill({ color: 0xff9f1c, alpha })
    .stroke({ color: 0x0a0b10, width: 1.5, alpha });

  // --- 3. Sculpted 3-Tone Cel-Shaded Sportbike Fairing, Tank & Tail Cowl ---
  // Lower Shadow Belly Pan (Dark crimson-orange 3D underside)
  const lowerFairing = [
    toWorld(-18, -8.2, 3.2),
    toWorld(10, -9.2, 3.2),
    toWorld(19, 0, 3.2),
    toWorld(10, 9.2, 3.2),
    toWorld(-18, 8.2, 3.2)
  ].flat();
  g.poly(lowerFairing)
    .fill({ color: 0xb33000, alpha })
    .stroke({ color: 0x0a0b10, width: 3.5, alpha });

  // Main Sculpted Upper Fairing & Swept Tail Cowl (Vibrant Anime Racing Orange)
  const upperFairing = [
    toWorld(-21, -4.5, 5.5),
    toWorld(-11, -8.0, 5.5),
    toWorld(9, -8.8, 5.5),
    toWorld(19, -3.2, 5.2),
    toWorld(21, 0, 5.2),
    toWorld(19, 3.2, 5.2),
    toWorld(9, 8.8, 5.5),
    toWorld(-11, 8.0, 5.5),
    toWorld(-21, 4.5, 5.5)
  ].flat();
  g.poly(upperFairing)
    .fill({ color: 0xff5c00, alpha })
    .stroke({ color: 0x0a0b10, width: 3, alpha });

  // Cel-Shaded Top-Left Specular Highlight Plane
  const fairingHighlight = [
    toWorld(-19, -4.0, 5.8),
    toWorld(-9, -7.2, 5.8),
    toWorld(8, -7.8, 5.8),
    toWorld(17, -2.2, 5.6),
    toWorld(14, 0, 5.8),
    toWorld(-15, -1.0, 5.8)
  ].flat();
  g.poly(fairingHighlight)
    .fill({ color: 0xff9e44, alpha });

  // Sculpted Fuel Tank Bulge with Graphic Black Racing Stripe & Crisp Rim Glint
  const tankShape = [
    toWorld(-4, -6.2, 6.5),
    toWorld(8, -6.8, 6.5),
    toWorld(12, -3.5, 6.5),
    toWorld(12, 3.5, 6.5),
    toWorld(8, 6.8, 6.5),
    toWorld(-4, 6.2, 6.5)
  ].flat();
  g.poly(tankShape)
    .fill({ color: 0xff6d1a, alpha })
    .stroke({ color: 0x0a0b10, width: 2.2, alpha });

  const racingStripe = [
    toWorld(-20, -2.2, 6.6),
    toWorld(17, -2.2, 6.6),
    toWorld(17, 2.2, 6.6),
    toWorld(-20, 2.2, 6.6)
  ].flat();
  g.poly(racingStripe)
    .fill({ color: 0x0a0b10, alpha });

  // Dark Smoked Aero Windscreen & Twin Shark-Eye LED Headlights
  const windscreen = [
    toWorld(9, -5.2, 6.8),
    toWorld(16, -3.0, 6.5),
    toWorld(18, 0, 6.5),
    toWorld(16, 3.0, 6.5),
    toWorld(9, 5.2, 6.8)
  ].flat();
  g.poly(windscreen)
    .fill({ color: 0x141824, alpha })
    .stroke({ color: 0x0a0b10, width: 2, alpha });

  const [ledLx, ledLy] = toWorld(18.5, -3.4, 5.2);
  const [ledRx, ledRy] = toWorld(18.5, 3.4, 5.2);
  g.circle(ledLx, ledLy, 2.4).fill({ color: 0xfffce6, alpha }).stroke({ color: 0x0a0b10, width: 1.2, alpha });
  g.circle(ledRx, ledRy, 2.4).fill({ color: 0xfffce6, alpha }).stroke({ color: 0x0a0b10, width: 1.2, alpha });

  // Swept Clip-On Handlebars & Brake Levers
  const [hbLx, hbLy] = toWorld(6.5, -13.5, 6.5);
  const [hbMx, hbMy] = toWorld(10.5, 0, 6.8);
  const [hbRx, hbRy] = toWorld(6.5, 13.5, 6.5);
  g.moveTo(hbLx, hbLy)
    .lineTo(hbMx, hbMy)
    .lineTo(hbRx, hbRy)
    .stroke({ color: 0xdde2eb, width: 3.2, alpha });
  g.circle(hbLx, hbLy, 2.5).fill({ color: 0x0a0b10, alpha });
  g.circle(hbRx, hbRy, 2.5).fill({ color: 0x0a0b10, alpha });

  // --- 4. Anime Biker Rider (Leaning Armored Torso, Spine Plates, Shoulders & Arms) ---
  // Rider Back & Armored Jacket Torso leaning into the tank
  const torsoPts = [
    toWorld(-14, -6.2, 7.5),
    toWorld(-2, -7.8, 8.5),
    toWorld(3, -5.2, 9.0),
    toWorld(3, 5.2, 9.0),
    toWorld(-2, 7.8, 8.5),
    toWorld(-14, 6.2, 7.5)
  ].flat();
  g.poly(torsoPts)
    .fill({ color: 0x1d1f2b, alpha })
    .stroke({ color: 0x0a0b10, width: 2.8, alpha });

  // Orange Leather Shoulder Pads on Rider Jacket
  const leftPad = [
    toWorld(-5, -7.8, 8.8),
    toWorld(2, -7.2, 9.2),
    toWorld(2, -3.5, 9.2),
    toWorld(-5, -4.0, 8.8)
  ].flat();
  const rightPad = [
    toWorld(-5, 4.0, 8.8),
    toWorld(2, 3.5, 9.2),
    toWorld(2, 7.2, 9.2),
    toWorld(-5, 7.8, 8.8)
  ].flat();
  g.poly(leftPad).fill({ color: 0xff5c00, alpha }).stroke({ color: 0x0a0b10, width: 1.8, alpha });
  g.poly(rightPad).fill({ color: 0xd94800, alpha }).stroke({ color: 0x0a0b10, width: 1.8, alpha });

  // Segmented Cybernetic Spine Armor Ribs along Rider's Back
  for (const sx of [-11, -8, -5]) {
    const [sp1x, sp1y] = toWorld(sx, -2.4, 8.8);
    const [sp2x, sp2y] = toWorld(sx, 2.4, 8.8);
    g.moveTo(sp1x, sp1y).lineTo(sp2x, sp2y).stroke({ color: 0x8d95a8, width: 2, alpha });
  }

  // Left Rider Arm gripping handlebar
  const [shLx, shLy] = toWorld(0, -7.0, 9.0);
  g.moveTo(shLx, shLy)
    .lineTo(hbLx, hbLy)
    .stroke({ color: 0x292c3d, width: 4.2, alpha });
  g.circle(hbLx, hbLy, 3).fill({ color: 0xff5c00, alpha }).stroke({ color: 0x0a0b10, width: 1.5, alpha });

  // --- 5. Aimed Heavy Weapon Rig & Sculpted Anime Racing Helmet (aimAngle) ---
  const cosA = Math.cos(aAngle);
  const sinA = Math.sin(aAngle);
  const recoil = player.fireTimer > 0 ? Math.min(3.5, player.fireTimer * 14) : 0;

  const toAim = (lx: number, ly: number, z: number = 9.5): [number, number] => {
    const rx = lx - recoil;
    return [
      px + cosA * rx - sinA * ly,
      py + sinA * rx + cosA * ly - z
    ];
  };

  // Rider Right Weapon Arm supporting the gun
  const [armStartX, armStartY] = toAim(-1, 5.5, 9.0);
  const [armEndX, armEndY] = toAim(11, 3.8, 9.2);
  g.moveTo(armStartX, armStartY)
    .lineTo(armEndX, armEndY)
    .stroke({ color: 0x1d1f2b, width: 4.8, alpha });

  // Weapon-Specific High-Detail Silhouette (matching Concept Art)
  if (player.weapon === 'shotgun') {
    // Double-barrel sawed-off shotgun with wooden stock & twin heavy bores
    const body = [toAim(3, -4.5), toAim(24, -4.5), toAim(24, 4.5), toAim(3, 4.5)].flat();
    g.poly(body).fill({ color: 0x2b2d3c, alpha }).stroke({ color: 0x0a0b10, width: 2.8, alpha });
    const [b1x, b1y] = toAim(7, -2.2);
    const [b2x, b2y] = toAim(24, -2.2);
    const [b3x, b3y] = toAim(7, 2.2);
    const [b4x, b4y] = toAim(24, 2.2);
    g.moveTo(b1x, b1y).lineTo(b2x, b2y).stroke({ color: 0x8d95a8, width: 2.2, alpha });
    g.moveTo(b3x, b3y).lineTo(b4x, b4y).stroke({ color: 0x8d95a8, width: 2.2, alpha });
  } else if (player.weapon === 'railgun') {
    // Twin-rail electromagnetic accelerator with glowing cyan plasma core
    const railL = [toAim(2, -5.2), toAim(27, -4.2), toAim(27, -1.8), toAim(2, -1.8)].flat();
    const railR = [toAim(2, 1.8), toAim(27, 1.8), toAim(27, 4.2), toAim(2, 5.2)].flat();
    g.poly(railL).fill({ color: 0x232736, alpha }).stroke({ color: 0x0a0b10, width: 2.4, alpha });
    g.poly(railR).fill({ color: 0x232736, alpha }).stroke({ color: 0x0a0b10, width: 2.4, alpha });
    const [c1x, c1y] = toAim(4, 0);
    const [c2x, c2y] = toAim(26, 0);
    g.moveTo(c1x, c1y).lineTo(c2x, c2y).stroke({ color: 0x00f5d4, width: 3, alpha });
  } else if (player.weapon === 'flamethrower') {
    // Heavy flame projector with orange fuel tank & igniter nozzle
    const tank = [toAim(1, -6.2), toAim(13, -6.2), toAim(13, -1.5), toAim(1, -1.5)].flat();
    g.poly(tank).fill({ color: 0xff5400, alpha }).stroke({ color: 0x0a0b10, width: 2.2, alpha });
    const barrel = [toAim(3, -2.5), toAim(24, -2.5), toAim(24, 3.8), toAim(3, 3.8)].flat();
    g.poly(barrel).fill({ color: 0x282b3a, alpha }).stroke({ color: 0x0a0b10, width: 2.8, alpha });
  } else if (player.weapon === 'grenade_launcher') {
    // Revolving drum heavy grenade launcher
    const drum = [toAim(4, -6.2), toAim(15, -6.2), toAim(15, 6.2), toAim(4, 6.2)].flat();
    g.poly(drum).fill({ color: 0x34384b, alpha }).stroke({ color: 0x0a0b10, width: 2.8, alpha });
    const tube = [toAim(14, -4.2), toAim(25, -4.2), toAim(25, 4.2), toAim(14, 4.2)].flat();
    g.poly(tube).fill({ color: 0x1c1e29, alpha }).stroke({ color: 0x0a0b10, width: 2.6, alpha });
  } else {
    // Assault SMG / Tactical Sidearm / Arc Coil Receiver with top Picatinny rail
    const gunBody = [
      toAim(3, -4.2),
      toAim(24, -3.8),
      toAim(24, 3.8),
      toAim(3, 4.2)
    ].flat();
    g.poly(gunBody)
      .fill({ color: 0x222533, alpha })
      .stroke({ color: 0x0a0b10, width: 2.8, alpha });

    const [rail1x, rail1y] = toAim(5, -1.5);
    const [rail2x, rail2y] = toAim(20, -1.5);
    g.moveTo(rail1x, rail1y).lineTo(rail2x, rail2y).stroke({ color: 0x6c758c, width: 1.8, alpha });
  }

  // Glowing Weapon Muzzle Brake Band
  const muzzlePoints = [
    toAim(21, -4.5),
    toAim(25.5, -4.5),
    toAim(25.5, 4.5),
    toAim(21, 4.5)
  ].flat();
  g.poly(muzzlePoints)
    .fill({ color: weaponColor, alpha })
    .stroke({ color: 0x0a0b10, width: 1.8, alpha });

  // --- 6. Sculpted Anime Racing Helmet (Matching HUD Portrait & Concept Art) ---
  const toHelm = (lx: number, ly: number): [number, number] => {
    return [
      px + cosA * lx - sinA * ly,
      py + sinA * lx + cosA * ly - 10.5
    ];
  };

  // Aerodynamic Helmet Shell with Rear Spoiler Ridge (Orange & Black Cel-Shaded)
  const helmetShell = [
    toHelm(-10.5, -4.2),
    toHelm(-5.5, -8.8),
    toHelm(3.5, -8.6),
    toHelm(9.2, -5.2),
    toHelm(10.5, 0),
    toHelm(9.2, 5.2),
    toHelm(3.5, 8.6),
    toHelm(-5.5, 8.8),
    toHelm(-10.5, 4.2),
    toHelm(-12.0, 0)
  ].flat();
  g.poly(helmetShell)
    .fill({ color: 0xff5c00, alpha })
    .stroke({ color: 0x0a0b10, width: 3.2, alpha });

  // Helmet Crown Specular Highlight (Top-left cel-shaded light crescent)
  const helmetHighlight = [
    toHelm(-7.5, -4.5),
    toHelm(-3.5, -7.4),
    toHelm(4.0, -7.0),
    toHelm(6.5, -3.5),
    toHelm(-4.5, -2.2)
  ].flat();
  g.poly(helmetHighlight)
    .fill({ color: 0xff9e44, alpha });

  // Center Black Racing Stripe across Helmet Crown
  const helmStripe = [
    toHelm(-11.0, -2.0),
    toHelm(5.0, -2.0),
    toHelm(5.0, 2.0),
    toHelm(-11.0, 2.0)
  ].flat();
  g.poly(helmStripe)
    .fill({ color: 0x0a0b10, alpha });

  // Wrap-Around Tinted Racing Visor with Neon Rim & White Anime Specular Slash
  const visorPoints = [
    toHelm(2.0, -6.8),
    toHelm(8.5, -4.8),
    toHelm(10.2, 0),
    toHelm(8.5, 4.8),
    toHelm(2.0, 6.8),
    toHelm(4.2, 0)
  ].flat();
  g.poly(visorPoints)
    .fill({ color: 0x101420, alpha })
    .stroke({ color: 0x0a0b10, width: 2, alpha });

  // Visor Neon Glint Slash
  const [vg1x, vg1y] = toHelm(4.5, -4.8);
  const [vg2x, vg2y] = toHelm(8.6, -1.2);
  g.moveTo(vg1x, vg1y)
    .lineTo(vg2x, vg2y)
    .stroke({ color: weaponColor, width: 2.2, alpha });
}

// ============================================================================
// 2. BOSS ROAD-RAGING MUSCLE CARS
// ============================================================================

export function drawBossCar(g: Graphics, boss: Boss, timestampMs: number = 0): void {
  const bx = boss.x;
  const by = boss.y;
  const angle = boss.angle;
  const variant = boss.bossVariant ?? 0;
  const raging = boss.aiTimer < 0.4 || boss.state === 'windup' || boss.state === 'dashing';
  const bodyColor = boss.burnTimer > 0
    ? 0xff6b2b
    : parseColor(boss.color, 0xe63946);

  const cos = Math.cos(angle);
  const sin = Math.sin(angle);

  // 2.5D extrusion helper (z lifts upward in screen Y)
  const toWorld = (lx: number, ly: number, z: number = 0): [number, number] => {
    return [
      bx + cos * lx - sin * ly,
      by + sin * lx + cos * ly - z
    ];
  };

  // Windup / Charge Telegraph Laser Sight & Warning Cone
  if (boss.state === 'windup') {
    const [tx1, ty1] = toWorld(38, 0, 4);
    const [tx2, ty2] = toWorld(290, -24, 0);
    const [tx3, ty3] = toWorld(290, 24, 0);
    g.poly([tx1, ty1, tx2, ty2, tx3, ty3])
      .fill({ color: 0xff2a55, alpha: 0.18 });
    const [lx2, ly2] = toWorld(310, 0, 4);
    g.moveTo(tx1, ty1)
      .lineTo(lx2, ly2)
      .stroke({ color: 0xff2a55, width: 3, alpha: 0.85 });
  }

  if (variant === 1) {
    // =========================================================================
    // VARIANT 1: SIEGE BEHEMOTH (6-Wheeled Armored Artillery War-Rig)
    // =========================================================================
    const wheelXs = [-32, 0, 28];
    for (const wx of wheelXs) {
      for (const wy of [-31, 23]) {
        const wPts = [toWorld(wx, wy, 0), toWorld(wx + 16, wy, 0), toWorld(wx + 16, wy + 8, 0), toWorld(wx, wy + 8, 0)].flat();
        g.poly(wPts).fill({ color: 0x0a0b10 }).stroke({ color: 0x2a2b36, width: 2 });
      }
    }

    // 2.5D Lower Armored Skirt
    const lowerHull = [toWorld(-50, -25, 0), toWorld(48, -25, 0), toWorld(48, 25, 0), toWorld(-50, 25, 0)].flat();
    g.poly(lowerHull).fill({ color: 0x7a3800 }).stroke({ color: 0x0a0b10, width: 4.5 });

    // Elevated Upper Deck
    const upperHull = [toWorld(-48, -24, 7), toWorld(46, -24, 7), toWorld(46, 24, 7), toWorld(-48, 24, 7)].flat();
    g.poly(upperHull).fill({ color: bodyColor }).stroke({ color: 0x0a0b10, width: 3.5 });

    // Reactive Side Armor Slabs & Hazard Chevrons
    for (const sy of [-22, 16]) {
      const slab = [toWorld(-40, sy, 8), toWorld(36, sy, 8), toWorld(36, sy + 6, 8), toWorld(-40, sy + 6, 8)].flat();
      g.poly(slab).fill({ color: 0x2b2d3c }).stroke({ color: 0x0a0b10, width: 2 });
    }
    const plow = [toWorld(46, -26, 4), toWorld(56, -18, 4), toWorld(56, 18, 4), toWorld(46, 26, 4)].flat();
    g.poly(plow).fill({ color: 0xffd166 }).stroke({ color: 0x0a0b10, width: 3 });

    // Rear Twin Mortar Launch Tubes
    for (const my of [-11, 11]) {
      const [mx, mY] = toWorld(-30, my, 10);
      g.circle(mx, mY, 7).fill({ color: 0x161822 }).stroke({ color: 0x0a0b10, width: 2.5 });
      g.circle(mx, mY, 3.5).fill({ color: 0xff5400 });
    }

    // Central Rotating Dual-Barrel Siege Howitzer Turret
    const turretOct = [
      toWorld(-8, -14, 12), toWorld(14, -14, 12),
      toWorld(20, -6, 12), toWorld(20, 6, 12),
      toWorld(14, 14, 12), toWorld(-8, 14, 12)
    ].flat();
    g.poly(turretOct).fill({ color: 0x3a3d4d }).stroke({ color: 0x0a0b10, width: 3 });

    for (const byOff of [-5, 5]) {
      const barrel = [toWorld(18, byOff - 2.5, 13), toWorld(48, byOff - 2.5, 13), toWorld(48, byOff + 2.5, 13), toWorld(18, byOff + 2.5, 13)].flat();
      g.poly(barrel).fill({ color: 0x1b1d28 }).stroke({ color: 0x0a0b10, width: 2 });
    }
    const [coreX, coreY] = toWorld(4, 0, 14);
    g.circle(coreX, coreY, 5).fill({ color: raging ? 0xff2a55 : 0xffd166 }).stroke({ color: 0x0a0b10, width: 2 });
    return;
  }

  if (variant === 2) {
    // =========================================================================
    // VARIANT 2: OVERLORD HELION (Cyber-Plasma Hovertank)
    // =========================================================================
    const hoverBob = Math.sin(timestampMs / 160) * 3;
    const zBase = 6 + hoverBob;

    // 4 Glowing Cyan Hover-Thruster Rings
    for (const [hx, hy] of [[-28, -24], [22, -24], [-28, 24], [22, 24]]) {
      const [wx, wy] = toWorld(hx, hy, 2);
      g.circle(wx, wy, 10).fill({ color: 0x00f5d4, alpha: 0.35 }).stroke({ color: 0x00f5d4, width: 2.5 });
      g.circle(wx, wy, 5).fill({ color: 0xffffff });
    }

    // Twin-Pronged Cyber Hull
    const hull = [
      toWorld(-44, -18, zBase),
      toWorld(-20, -27, zBase),
      toWorld(26, -25, zBase),
      toWorld(50, -14, zBase),
      toWorld(50, -6, zBase),
      toWorld(18, -6, zBase),
      toWorld(18, 6, zBase),
      toWorld(50, 6, zBase),
      toWorld(50, 14, zBase),
      toWorld(26, 25, zBase),
      toWorld(-20, 27, zBase),
      toWorld(-44, 18, zBase)
    ].flat();
    g.poly(hull).fill({ color: bodyColor }).stroke({ color: 0x0a0b10, width: 4 });

    // Cel-Shaded Top Armor Deck & Neon Circuit Lines
    const innerDeck = [
      toWorld(-34, -14, zBase + 4),
      toWorld(16, -16, zBase + 4),
      toWorld(16, 16, zBase + 4),
      toWorld(-34, 14, zBase + 4)
    ].flat();
    g.poly(innerDeck).fill({ color: 0x241734 }).stroke({ color: 0x00f5d4, width: 2 });

    // Twin Plasma Rail-Prong Glow Strips
    for (const pyOff of [-10, 10]) {
      const [p1x, p1y] = toWorld(20, pyOff, zBase + 2);
      const [p2x, p2y] = toWorld(48, pyOff, zBase + 2);
      g.moveTo(p1x, p1y).lineTo(p2x, p2y).stroke({ color: 0x00f5d4, width: 3.5 });
    }

    // Pulsing Central Cyber-Core
    const [cx, cy] = toWorld(-6, 0, zBase + 6);
    g.circle(cx, cy, 11).fill({ color: 0x0a0b10 }).stroke({ color: 0x00f5d4, width: 2.5 });
    g.circle(cx, cy, 6.5).fill({ color: raging ? 0xff2a55 : 0x00f5d4 });
    return;
  }

  if (variant === 3) {
    // =========================================================================
    // VARIANT 3: CRYO VALKYRIE (Sub-Zero Jet Interceptor)
    // =========================================================================
    const zLift = 5 + Math.sin(timestampMs / 150) * 2.5;

    // Twin Rear Cryo-Turbine Afterburners
    const jetLen = 14 + Math.random() * 10 + (raging ? 10 : 0);
    for (const jy of [-11, 11]) {
      const jet = [toWorld(-42, jy - 4, zLift), toWorld(-42 - jetLen, jy, zLift), toWorld(-42, jy + 4, zLift)].flat();
      g.poly(jet).fill({ color: 0x90e0ef }).stroke({ color: 0x00bbf9, width: 1.5 });
    }

    // Swept Forward-Angled Cryo-Wings
    const wings = [
      toWorld(-38, -12, zLift),
      toWorld(-8, -32, zLift),
      toWorld(28, -24, zLift),
      toWorld(18, -10, zLift),
      toWorld(54, 0, zLift + 2),
      toWorld(18, 10, zLift),
      toWorld(28, 24, zLift),
      toWorld(-8, 32, zLift),
      toWorld(-38, 12, zLift)
    ].flat();
    g.poly(wings).fill({ color: bodyColor }).stroke({ color: 0x0a0b10, width: 4 });

    // White Cel-Shaded Frost Highlight Blades
    const frostTrim = [
      toWorld(-6, -28, zLift + 2),
      toWorld(24, -21, zLift + 2),
      toWorld(12, -9, zLift + 2),
      toWorld(46, 0, zLift + 3),
      toWorld(12, 9, zLift + 2),
      toWorld(24, 21, zLift + 2),
      toWorld(-6, 28, zLift + 2),
      toWorld(-20, 0, zLift + 2)
    ].flat();
    g.poly(frostTrim).fill({ color: 0xe0fbfc, alpha: 0.88 }).stroke({ color: 0x0a0b10, width: 2 });

    // Armored Dark-Ice Cockpit Canopy
    const canopy = [toWorld(-18, -7, zLift + 4), toWorld(16, -5, zLift + 4), toWorld(24, 0, zLift + 4), toWorld(16, 5, zLift + 4), toWorld(-18, 7, zLift + 4)].flat();
    g.poly(canopy).fill({ color: 0x101828 }).stroke({ color: 0x0a0b10, width: 2.5 });
    return;
  }

  if (variant === 4) {
    // =========================================================================
    // VARIANT 4: INFERNO COLOSSUS (Molten Smelter Crawler)
    // =========================================================================
    // Twin Armored Caterpillar Treads
    for (const ty of [-30, 18]) {
      const tread = [toWorld(-46, ty, 0), toWorld(44, ty, 0), toWorld(44, ty + 12, 0), toWorld(-46, ty + 12, 0)].flat();
      g.poly(tread).fill({ color: 0x14151d }).stroke({ color: 0x0a0b10, width: 3 });
    }

    // Black-Iron & Molten-Orange Bulky Smelter Hull
    const hull = [toWorld(-44, -22, 6), toWorld(42, -22, 6), toWorld(42, 22, 6), toWorld(-44, 22, 6)].flat();
    g.poly(hull).fill({ color: 0x262328 }).stroke({ color: 0x0a0b10, width: 4.5 });

    // Glowing Molten Magma Vats on Rear Deck
    for (const vxOff of [-22, 4]) {
      const [vx, vy] = toWorld(vxOff, 0, 9);
      g.circle(vx, vy, 12).fill({ color: 0xff5400 }).stroke({ color: 0x0a0b10, width: 2.5 });
      g.circle(vx, vy, 6).fill({ color: 0xffd166 });
    }

    // Twin Front Flamethrower Nozzles & Rotating Crusher Spikes
    for (let i = -3; i <= 3; i++) {
      const tooth = [toWorld(42, i * 6 - 3, 4), toWorld(54, i * 6, 4), toWorld(42, i * 6 + 3, 4)].flat();
      g.poly(tooth).fill({ color: 0xff9f1c }).stroke({ color: 0x0a0b10, width: 2 });
    }
    return;
  }

  if (variant === 5) {
    // =========================================================================
    // VARIANT 5: OMEGA VALHALLA (Gold-Chrome & Crimson 8-Wheeled Dreadnought)
    // =========================================================================
    for (const wx of [-36, -14, 8, 28]) {
      for (const wy of [-31, 23]) {
        const wPts = [toWorld(wx, wy, 0), toWorld(wx + 14, wy, 0), toWorld(wx + 14, wy + 8, 0), toWorld(wx, wy + 8, 0)].flat();
        g.poly(wPts).fill({ color: 0x0a0b10 }).stroke({ color: 0xffd166, width: 1.8 });
      }
    }

    // Crimson & Gold-Chrome Royal Dreadnought Chassis
    const baseHull = [toWorld(-50, -25, 4), toWorld(48, -25, 4), toWorld(56, 0, 4), toWorld(48, 25, 4), toWorld(-50, 25, 4)].flat();
    g.poly(baseHull).fill({ color: 0x9e1b26 }).stroke({ color: 0x0a0b10, width: 4.5 });

    const goldDeck = [toWorld(-44, -20, 9), toWorld(42, -20, 9), toWorld(50, 0, 9), toWorld(42, 20, 9), toWorld(-44, 20, 9)].flat();
    g.poly(goldDeck).fill({ color: bodyColor }).stroke({ color: 0x0a0b10, width: 3 });

    // Spiked Golden Cowcatcher Ram
    for (let i = -3; i <= 3; i++) {
      const spike = [toWorld(48, i * 6 - 3, 5), toWorld(60, i * 6, 5), toWorld(48, i * 6 + 3, 5)].flat();
      g.poly(spike).fill({ color: 0xffffff }).stroke({ color: 0x0a0b10, width: 1.8 });
    }

    // Glowing Cyan Halo Reactor Core & Quad Turret Barrels
    const [rx, ry] = toWorld(-4, 0, 13);
    g.circle(rx, ry, 14).fill({ color: 0x141622 }).stroke({ color: 0x0a0b10, width: 3 });
    g.circle(rx, ry, 9).fill({ color: 0x00f5d4 }).stroke({ color: 0xffffff, width: 2 });
    return;
  }

  // ===========================================================================
  // VARIANT 0 (DEFAULT): SCRAP GOLIATH (Supercharged Muscle-Interceptor)
  // ===========================================================================
  // 1. Wheels (4 heavy wide-drag tires)
  const wheelOffsets = [
    [-28, -29], [24, -29],
    [-28, 23], [24, 23]
  ];
  wheelOffsets.forEach(([wx, wy]) => {
    const coords = [
      toWorld(wx, wy, 0),
      toWorld(wx + 18, wy, 0),
      toWorld(wx + 18, wy + 8, 0),
      toWorld(wx, wy + 8, 0)
    ].flat();
    g.poly(coords)
      .fill({ color: 0x0a0b10 })
      .stroke({ color: 0x2a2b36, width: 2 });
  });

  // 2. 2.5D Extruded Lower Chassis Shadow & Upper Muscle Car Body
  const lowerCoords = [
    toWorld(-46, -23, 0),
    toWorld(46, -23, 0),
    toWorld(46, 23, 0),
    toWorld(-46, 23, 0)
  ].flat();
  g.poly(lowerCoords)
    .fill({ color: 0x6b111b })
    .stroke({ color: 0x0a0b10, width: 4.5 });

  const bodyCoords = [
    toWorld(-46, -23, 5),
    toWorld(46, -23, 5),
    toWorld(46, 23, 5),
    toWorld(-46, 23, 5)
  ].flat();
  g.poly(bodyCoords)
    .fill({ color: bodyColor })
    .stroke({ color: 0x0a0b10, width: 4 });

  // 3. Dual White Racing Stripes
  const stripe1 = [toWorld(-44, -6, 5.5), toWorld(44, -6, 5.5), toWorld(44, -2, 5.5), toWorld(-44, -2, 5.5)].flat();
  const stripe2 = [toWorld(-44, 2, 5.5), toWorld(44, 2, 5.5), toWorld(44, 6, 5.5), toWorld(-44, 6, 5.5)].flat();
  g.poly(stripe1).fill({ color: 0xffffff, alpha: 0.85 });
  g.poly(stripe2).fill({ color: 0xffffff, alpha: 0.85 });

  // 4. Windshield & Cabin Roof
  const frontGlass = [toWorld(4, -17, 7), toWorld(18, -17, 7), toWorld(18, 17, 7), toWorld(4, 17, 7)].flat();
  const rearGlass = [toWorld(-34, -16, 7), toWorld(-24, -16, 7), toWorld(-24, 16, 7), toWorld(-34, 16, 7)].flat();
  const cabinRoof = [toWorld(-22, -15, 8.5), toWorld(4, -15, 8.5), toWorld(4, 15, 8.5), toWorld(-22, 15, 8.5)].flat();

  g.poly(frontGlass).fill({ color: 0x1b2530 }).stroke({ color: 0x0a0b10, width: 2 });
  g.poly(rearGlass).fill({ color: 0x1b2530 }).stroke({ color: 0x0a0b10, width: 2 });
  g.poly(cabinRoof).fill({ color: bodyColor }).stroke({ color: 0x0a0b10, width: 2 });

  // 5. Angry Driver Silhouette & Fist
  const [driverHeadX, driverHeadY] = toWorld(-9, 0, 9.5);
  g.circle(driverHeadX, driverHeadY, 6)
    .fill({ color: 0xf1c27d })
    .stroke({ color: 0x0a0b10, width: 1.5 });

  const fistShake = Math.sin(timestampMs / 50) * (raging ? 4 : 1);
  const fistCoords = [
    toWorld(-4, -22 - fistShake, 8),
    toWorld(4, -22 - fistShake, 8),
    toWorld(4, -16 - fistShake, 8),
    toWorld(-4, -16 - fistShake, 8)
  ].flat();
  g.poly(fistCoords)
    .fill({ color: 0xf1c27d })
    .stroke({ color: 0x0a0b10, width: 1.5 });

  // 6. Supercharger Hood Scoop
  const scoop = [toWorld(22, -7, 8), toWorld(38, -7, 8), toWorld(38, 7, 8), toWorld(22, 7, 8)].flat();
  g.poly(scoop).fill({ color: 0x2b2d3c }).stroke({ color: 0x0a0b10, width: 2 });

  // 7. Chrome Spiked Front Bulldozer Bumper
  for (let i = -3; i <= 3; i++) {
    const spike = [
      toWorld(46, i * 6 - 3, 4),
      toWorld(57, i * 6, 4),
      toWorld(46, i * 6 + 3, 4)
    ].flat();
    g.poly(spike)
      .fill({ color: 0xc9ced8 })
      .stroke({ color: 0x0a0b10, width: 1.5 });
  }

  // 8. Slanted Angular Angry Headlights with Furrowed Eyebrows
  const hlColor = raging ? 0xff4d6d : 0xfff3b0;
  const [hl1X, hl1Y] = toWorld(43, -15, 5.5);
  const [hl2X, hl2Y] = toWorld(43, 15, 5.5);
  g.circle(hl1X, hl1Y, 5).fill({ color: hlColor }).stroke({ color: 0x0a0b10, width: 2 });
  g.circle(hl2X, hl2Y, 5).fill({ color: hlColor }).stroke({ color: 0x0a0b10, width: 2 });

  // Slanted eyebrow cuts
  const [eb1StartX, eb1StartY] = toWorld(38, -23, 6);
  const [eb1EndX, eb1EndY] = toWorld(48, -11, 6);
  const [eb2StartX, eb2StartY] = toWorld(38, 23, 6);
  const [eb2EndX, eb2EndY] = toWorld(48, 11, 6);
  g.moveTo(eb1StartX, eb1StartY).lineTo(eb1EndX, eb1EndY).stroke({ color: 0x0a0b10, width: 3.5 });
  g.moveTo(eb2StartX, eb2StartY).lineTo(eb2EndX, eb2EndY).stroke({ color: 0x0a0b10, width: 3.5 });

  // 9. Rear Exhaust Flames
  const flameLen = 10 + Math.random() * 12 + (raging ? 10 : 0);
  const flame1 = [toWorld(-47, -9, 4), toWorld(-47 - flameLen, -7, 4), toWorld(-47, -4, 4)].flat();
  const flame2 = [toWorld(-47, 9, 4), toWorld(-47 - flameLen, 7, 4), toWorld(-47, 4, 4)].flat();
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
  const zHeight = 12; // 2.5D vertical extrusion height

  if (ob.type === 'rock') {
    // 1. 2.5D Extruded Front/Side Vertical Faces (gives true 3D block height)
    const frontFace = [
      ob.x - hs, ob.y - hs + 4,
      ob.x + hs, ob.y - hs + 7,
      ob.x + hs, ob.y + hs - 3,
      ob.x + hs - 6, ob.y + hs + 2,
      ob.x - hs + 5, ob.y + hs + 2,
      ob.x - hs, ob.y + hs - 2
    ];
    g.poly(frontFace)
      .fill({ color: 0x222430 })
      .stroke({ color: 0x0a0b10, width: 3 });

    // Hazard stripe band on front vertical face
    g.rect(ob.x - hs + 4, ob.y + hs - 8, ob.size - 8, 5)
      .fill({ color: 0xffae00, alpha: 0.75 })
      .stroke({ color: 0x0a0b10, width: 1.5 });

    // 2. Elevated 2.5D Top Armor Slab (shifted up by -zHeight)
    const topY = ob.y - zHeight;
    const rockTop = [
      ob.x - hs, topY - hs + 4,
      ob.x - hs + 6, topY - hs,
      ob.x + hs - 4, topY - hs,
      ob.x + hs, topY - hs + 7,
      ob.x + hs, topY + hs - 5,
      ob.x + hs - 6, topY + hs,
      ob.x - hs + 5, topY + hs,
      ob.x - hs, topY + hs - 4
    ];
    g.poly(rockTop)
      .fill({ color: 0x424559 })
      .stroke({ color: 0x0a0b10, width: 3 });

    // Top slab specular bevel & bolted steel reinforcement plate
    g.moveTo(ob.x - hs + 6, topY - hs + 3)
      .lineTo(ob.x + hs - 5, topY - hs + 3)
      .stroke({ color: 0x767b99, width: 2 });
    g.rect(ob.x - hs + 8, topY - hs + 8, ob.size - 16, ob.size - 16)
      .fill({ color: 0x323546 })
      .stroke({ color: 0x0a0b10, width: 1.5 });
  } else {
    // 2.5D Standing Explosive Fuel / TNT Drum Cylinder
    const r = hs * 0.92;
    const topY = ob.y - 10;
    const botY = ob.y + 6;

    // Cylinder vertical body
    g.rect(ob.x - r, topY, r * 2, botY - topY)
      .fill({ color: 0xc92a37 })
      .stroke({ color: 0x0a0b10, width: 3 });

    // Bottom elliptical base of drum
    g.ellipse(ob.x, botY, r, r * 0.55)
      .fill({ color: 0x9e1b26 })
      .stroke({ color: 0x0a0b10, width: 3 });

    // Right-side 3D cel-shaded shadow band on cylinder wall
    g.rect(ob.x + r * 0.2, topY, r * 0.75, botY - topY)
      .fill({ color: 0x80131d, alpha: 0.65 });

    // Left-side 3D specular highlight band
    g.rect(ob.x - r * 0.75, topY, r * 0.3, botY - topY)
      .fill({ color: 0xff6b77, alpha: 0.65 });

    // Curved Yellow Hazard Stripe around drum waist
    g.ellipse(ob.x, (topY + botY) / 2 + 2, r, r * 0.42)
      .stroke({ color: 0xffd166, width: 3 });

    // 3D Elliptical Top Lid of Drum
    g.ellipse(ob.x, topY, r, r * 0.55)
      .fill({ color: 0xe63946 })
      .stroke({ color: 0x0a0b10, width: 3 });
    g.ellipse(ob.x, topY, r * 0.72, r * 0.38)
      .fill({ color: 0x242633 })
      .stroke({ color: 0xffd166, width: 1.5 });
    // Bung cap glint
    g.circle(ob.x - 4, topY, 2.2).fill({ color: 0xffd166 });
  }
}

// ============================================================================
// 5. PICKUPS & PEDESTALS (Actual Graphical Representations)
// ============================================================================

export function drawPickup(g: Graphics, p: Pickup, timestampMs: number = 0): void {
  const bob = Math.sin(timestampMs / 220) * 3;
  const shadowY = p.y + 13;

  // Ground drop shadow
  g.ellipse(p.x, shadowY, 15, 5.5)
    .fill({ color: 0x050508, alpha: 0.55 });

  if (p.type === 'loot') {
    const R = RARITY[p.item.rarity];
    const rColor = parseColor(R.color, 0xffd166);
    const slot = p.item.slot;
    const itemY = p.y + bob;

    // 2.5D Cel-Shaded Rarity Tech Pedestal Disc
    g.ellipse(p.x, p.y + 8, 18, 8)
      .fill({ color: 0x10121c })
      .stroke({ color: 0x0a0b10, width: 3 });
    g.ellipse(p.x, p.y + 5, 17, 7)
      .fill({ color: 0x1e2235 })
      .stroke({ color: rColor, width: 2.5 });
    g.ellipse(p.x, p.y + 5, 11, 4.2)
      .stroke({ color: 0xffffff, width: 1, alpha: 0.5 });

    // Distinct Motorcycle Equipment Vector Graphics (Crisp Comic Outlines & Cel Highlights)
    if (slot === 'tires') {
      g.circle(p.x, itemY, 13.5)
        .fill({ color: 0x181a24 })
        .stroke({ color: 0x0a0b10, width: 3 });
      g.circle(p.x, itemY, 8.8)
        .fill({ color: 0x3a3d4d })
        .stroke({ color: rColor, width: 2 });
      for (let a = 0; a < 4; a++) {
        const ang = (a * Math.PI) / 2 + (timestampMs / 1000);
        g.moveTo(p.x, itemY)
          .lineTo(p.x + Math.cos(ang) * 8.5, itemY + Math.sin(ang) * 8.5)
          .stroke({ color: 0xdde2eb, width: 1.8 });
      }
      g.circle(p.x, itemY, 3.8).fill({ color: rColor }).stroke({ color: 0x0a0b10, width: 1.5 });
    } else if (slot === 'engine') {
      g.rect(p.x - 9, itemY - 5, 18, 13)
        .fill({ color: 0x2e303d })
        .stroke({ color: 0x0a0b10, width: 2.5 });
      const cylL = [p.x - 9, itemY - 5, p.x - 13, itemY - 14, p.x - 4, itemY - 14, p.x - 2, itemY - 5];
      const cylR = [p.x + 2, itemY - 5, p.x + 4, itemY - 14, p.x + 13, itemY - 14, p.x + 9, itemY - 5];
      g.poly(cylL).fill({ color: 0x52576e }).stroke({ color: 0x0a0b10, width: 2 });
      g.poly(cylR).fill({ color: 0x52576e }).stroke({ color: 0x0a0b10, width: 2 });
      g.moveTo(p.x - 7, itemY - 1).lineTo(p.x + 7, itemY - 1).stroke({ color: rColor, width: 1.8 });
      g.circle(p.x, itemY + 3, 3.2).fill({ color: rColor }).stroke({ color: 0x0a0b10, width: 1.5 });
    } else if (slot === 'handlebars') {
      g.moveTo(p.x - 14, itemY + 3)
        .lineTo(p.x - 7, itemY - 6)
        .lineTo(p.x + 7, itemY - 6)
        .lineTo(p.x + 14, itemY + 3)
        .stroke({ color: 0x0a0b10, width: 5.5 });
      g.moveTo(p.x - 14, itemY + 3)
        .lineTo(p.x - 7, itemY - 6)
        .lineTo(p.x + 7, itemY - 6)
        .lineTo(p.x + 14, itemY + 3)
        .stroke({ color: 0xdde1e7, width: 3 });
      g.rect(p.x - 16, itemY, 5, 7).fill({ color: rColor }).stroke({ color: 0x0a0b10, width: 2 });
      g.rect(p.x + 11, itemY, 5, 7).fill({ color: rColor }).stroke({ color: 0x0a0b10, width: 2 });
      g.circle(p.x, itemY - 6, 4).fill({ color: rColor }).stroke({ color: 0x0a0b10, width: 2 });
    } else if (slot === 'exhaust') {
      const pipePts = [
        p.x - 12, itemY - 6,
        p.x + 12, itemY - 9,
        p.x + 15, itemY + 4,
        p.x - 12, itemY + 2
      ];
      g.poly(pipePts).fill({ color: 0xb8c0d0 }).stroke({ color: 0x0a0b10, width: 2.8 });
      g.ellipse(p.x + 13.5, itemY - 2.5, 3, 5.5).fill({ color: 0xff5c00 }).stroke({ color: 0x0a0b10, width: 1.8 });
      g.circle(p.x - 8, itemY - 2, 3.2).fill({ color: rColor }).stroke({ color: 0x0a0b10, width: 1.5 });
    } else if (slot === 'frame') {
      const framePts = [
        p.x - 12, itemY + 6,
        p.x - 4, itemY - 10,
        p.x + 12, itemY - 4,
        p.x + 6, itemY + 6
      ];
      g.poly(framePts).fill({ color: 0x202436, alpha: 0.85 }).stroke({ color: 0x0a0b10, width: 4.5 });
      g.poly(framePts).stroke({ color: rColor, width: 2.5 });
      g.moveTo(p.x - 4, itemY - 10).lineTo(p.x + 6, itemY + 6).stroke({ color: 0xffffff, width: 2 });
    } else {
      const tankPts = [
        p.x - 13, itemY + 2,
        p.x - 7, itemY - 8,
        p.x + 10, itemY - 8,
        p.x + 14, itemY,
        p.x + 7, itemY + 7,
        p.x - 7, itemY + 7
      ];
      g.poly(tankPts).fill({ color: rColor }).stroke({ color: 0x0a0b10, width: 3 });
      g.ellipse(p.x - 1, itemY - 4, 6.5, 2.5).fill({ color: 0xffffff, alpha: 0.75 });
      g.circle(p.x + 4, itemY - 7, 2.5).fill({ color: 0x161822 }).stroke({ color: 0x0a0b10, width: 1.5 });
    }
  } else if (p.type === 'item_drop') {
    const it = DROP_ITEMS[p.itemId];
    const itColor = parseColor(it ? it.color : '#ffd166', 0xffd166);
    const itemY = p.y + bob;

    // 2.5D Glowing Power-Up Pad
    g.ellipse(p.x, p.y + 7, 17, 7)
      .fill({ color: 0x141520 })
      .stroke({ color: 0x0a0b10, width: 3 });
    g.ellipse(p.x, p.y + 5, 15, 6)
      .fill({ color: 0x1f2233 })
      .stroke({ color: itColor, width: 2.2 });

    // Distinct Cel-Shaded Anime Power-Up Icons
    if (p.itemId === 'nitro_syringe') {
      // Needle + glowing orange NOS barrel + plunger
      g.moveTo(p.x, itemY + 7).lineTo(p.x, itemY + 14).stroke({ color: 0x0a0b10, width: 3.5 });
      g.moveTo(p.x, itemY + 7).lineTo(p.x, itemY + 14).stroke({ color: 0xffffff, width: 1.8 });
      g.rect(p.x - 5, itemY - 7, 10, 14)
        .fill({ color: 0xff9f1c })
        .stroke({ color: 0x0a0b10, width: 2.5 });
      g.rect(p.x - 2.5, itemY - 5, 2.5, 10).fill({ color: 0xfff3b0 });
      g.rect(p.x - 6, itemY - 11, 12, 3.5).fill({ color: 0xdde2eb }).stroke({ color: 0x0a0b10, width: 2 });
    } else if (p.itemId === 'tire_iron') {
      // Heavy L-shaped Chrome Crowbar / Tire Iron
      const bar = [
        p.x - 11, itemY + 9,
        p.x + 5, itemY - 9,
        p.x + 13, itemY - 5,
        p.x + 10, itemY - 1,
        p.x + 5, itemY - 3,
        p.x - 7, itemY + 11
      ];
      g.poly(bar).fill({ color: 0xdde2eb }).stroke({ color: 0x0a0b10, width: 2.5 });
      g.circle(p.x - 9, itemY + 10, 2.5).fill({ color: 0xff4d6d });
    } else if (p.itemId === 'chrome_lens') {
      // Cyber-Tactical Precision Aviator Goggles
      g.rect(p.x - 4, itemY - 2, 8, 3).fill({ color: 0xdde2eb }).stroke({ color: 0x0a0b10, width: 1.5 });
      g.ellipse(p.x - 7.5, itemY, 6.5, 5).fill({ color: 0x4cc9f0 }).stroke({ color: 0x0a0b10, width: 2.5 });
      g.ellipse(p.x + 7.5, itemY, 6.5, 5).fill({ color: 0x4cc9f0 }).stroke({ color: 0x0a0b10, width: 2.5 });
      g.moveTo(p.x - 10, itemY - 2).lineTo(p.x - 6, itemY + 2).stroke({ color: 0xffffff, width: 2 });
      g.moveTo(p.x + 5, itemY - 2).lineTo(p.x + 9, itemY + 2).stroke({ color: 0xffffff, width: 2 });
    } else if (p.itemId === 'gasoline') {
      // High-Octane Red Fuel Canister with Flame Badge
      g.rect(p.x - 9, itemY - 8, 18, 17).fill({ color: 0xe63946 }).stroke({ color: 0x0a0b10, width: 2.5 });
      g.rect(p.x - 7, itemY - 12, 7, 4).fill({ color: 0xffd166 }).stroke({ color: 0x0a0b10, width: 1.8 });
      g.circle(p.x, itemY + 1, 4.5).fill({ color: 0xffbe0b }).stroke({ color: 0x0a0b10, width: 1.5 });
    } else if (p.itemId === 'racing_slicks') {
      // Turbo Cyan-Rimmed Racing Slick Tire
      g.circle(p.x, itemY, 12).fill({ color: 0x141622 }).stroke({ color: 0x0a0b10, width: 3 });
      g.circle(p.x, itemY, 8.5).stroke({ color: 0x00f5d4, width: 2.2 });
      g.circle(p.x, itemY, 4.5).fill({ color: 0xffffff }).stroke({ color: 0x0a0b10, width: 1.5 });
    } else {
      // Oil Infusion: Alchemical Violet Flask with Glowing Core
      const flaskPts = [
        p.x - 3.5, itemY - 11,
        p.x + 3.5, itemY - 11,
        p.x + 3.5, itemY - 5,
        p.x + 10, itemY + 7,
        p.x - 10, itemY + 7,
        p.x - 3.5, itemY - 5
      ];
      g.poly(flaskPts).fill({ color: 0x9d4edd }).stroke({ color: 0x0a0b10, width: 2.5 });
      g.circle(p.x, itemY + 2, 3.8).fill({ color: 0xffd166 });
    }
  } else if (p.type === 'heart' || p.type === 'shop_heart') {
    const itemY = p.y + bob;
    // Cel-Shaded Crimson Jerry-Can with Bold Outline & Specular Highlight
    g.rect(p.x - 10, itemY - 9, 20, 20)
      .fill({ color: 0xe63946 })
      .stroke({ color: 0x0a0b10, width: 3 });
    g.rect(p.x - 7.5, itemY - 6.5, 4, 15)
      .fill({ color: 0xff758f, alpha: 0.7 });

    // Stamped structural cross-brace
    g.moveTo(p.x - 5, itemY - 4).lineTo(p.x + 6, itemY + 7).stroke({ color: 0x800f2f, width: 2 });
    g.moveTo(p.x + 6, itemY - 4).lineTo(p.x - 5, itemY + 7).stroke({ color: 0x800f2f, width: 2 });

    // Handle & Brass Pour Spout
    g.rect(p.x - 9, itemY - 14, 8, 5).fill({ color: 0xffd166 }).stroke({ color: 0x0a0b10, width: 2 });
    g.rect(p.x + 1, itemY - 14, 8, 4).fill({ color: 0xffd166 }).stroke({ color: 0x0a0b10, width: 2 });
  } else if (p.type === 'mod_pedestal') {
    const itemY = p.y + bob;

    // 2.5D Octagonal Shrine Pedestal Base
    const octBase = [
      p.x - 17, p.y + 4,
      p.x - 9, p.y - 4,
      p.x + 9, p.y - 4,
      p.x + 17, p.y + 4,
      p.x + 17, p.y + 13,
      p.x + 9, p.y + 19,
      p.x - 9, p.y + 19,
      p.x - 17, p.y + 13
    ];
    g.poly(octBase).fill({ color: 0x1b1d2a }).stroke({ color: 0x0a0b10, width: 3 });
    g.ellipse(p.x, p.y + 6, 11, 5).fill({ color: 0x2b2f44 }).stroke({ color: 0xffd166, width: 2 });

    // Floating Rotating Faceted Golden Mod Crystal
    const pulse = 1 + Math.sin(timestampMs / 180) * 0.12;
    const crystalPts = [
      p.x, itemY - 15 * pulse,
      p.x + 11 * pulse, itemY,
      p.x, itemY + 12 * pulse,
      p.x - 11 * pulse, itemY
    ];
    g.poly(crystalPts).fill({ color: 0xffd166 }).stroke({ color: 0x0a0b10, width: 3 });
    const innerPts = [
      p.x, itemY - 10 * pulse,
      p.x + 6 * pulse, itemY,
      p.x, itemY + 7 * pulse,
      p.x - 6 * pulse, itemY
    ];
    g.poly(innerPts).fill({ color: 0xffffff, alpha: 0.85 });
  } else if (p.type === 'run_weapon') {
    const wInfo = WEAPONS[p.weaponId];
    const wColor = parseColor(wInfo ? wInfo.color : '#ffd166', 0xffd166);
    const itemY = p.y + bob;

    // 2.5D Armory Display Pedestal
    g.roundRect(p.x - 20, p.y + 2, 40, 14, 5)
      .fill({ color: 0x181a26 })
      .stroke({ color: 0x0a0b10, width: 3 });
    g.roundRect(p.x - 17, p.y + 4, 34, 9, 3)
      .fill({ color: 0x25283a })
      .stroke({ color: wColor, width: 2 });

    // Crisp Cel-Shaded Weapon Silhouette per WeaponId
    const wid = p.weaponId;
    if (wid === 'pistol') {
      const barrel = [p.x - 10, itemY - 7, p.x + 10, itemY - 7, p.x + 10, itemY - 1, p.x - 2, itemY - 1, p.x - 5, itemY + 8, p.x - 11, itemY + 8];
      g.poly(barrel).fill({ color: wColor }).stroke({ color: 0x0a0b10, width: 2.5 });
      g.rect(p.x - 8, itemY - 5.5, 14, 2).fill({ color: 0xffffff, alpha: 0.8 });
    } else if (wid === 'machine_gun') {
      g.rect(p.x - 15, itemY - 6, 28, 6).fill({ color: wColor }).stroke({ color: 0x0a0b10, width: 2.5 });
      g.rect(p.x - 5, itemY, 5, 9).fill({ color: 0x2b2d3c }).stroke({ color: 0x0a0b10, width: 2 });
      g.rect(p.x + 3, itemY, 4, 8).fill({ color: 0xffd166 }).stroke({ color: 0x0a0b10, width: 2 });
    } else if (wid === 'flamethrower') {
      g.rect(p.x - 14, itemY - 6, 24, 6).fill({ color: wColor }).stroke({ color: 0x0a0b10, width: 2.5 });
      g.ellipse(p.x - 4, itemY + 4, 6, 4.5).fill({ color: 0xff5400 }).stroke({ color: 0x0a0b10, width: 2 });
      g.circle(p.x + 13, itemY - 3, 3.5).fill({ color: 0xffd166 }).stroke({ color: 0x0a0b10, width: 1.5 });
    } else if (wid === 'grenade_launcher') {
      g.rect(p.x - 13, itemY - 6, 26, 7).fill({ color: wColor }).stroke({ color: 0x0a0b10, width: 2.5 });
      g.circle(p.x - 2, itemY, 6.5).fill({ color: 0x2b2d3d }).stroke({ color: 0x0a0b10, width: 2.5 });
      g.circle(p.x - 2, itemY, 2.5).fill({ color: wColor });
    } else if (wid === 'shotgun') {
      g.rect(p.x - 15, itemY - 7, 29, 4.5).fill({ color: wColor }).stroke({ color: 0x0a0b10, width: 2.2 });
      g.rect(p.x - 15, itemY - 2.5, 29, 4.5).fill({ color: 0xdde2eb }).stroke({ color: 0x0a0b10, width: 2.2 });
      g.rect(p.x - 16, itemY + 1, 10, 6).fill({ color: 0x8a5a36 }).stroke({ color: 0x0a0b10, width: 2 });
    } else if (wid === 'railgun') {
      g.rect(p.x - 17, itemY - 7, 34, 4).fill({ color: 0x00f5d4 }).stroke({ color: 0x0a0b10, width: 2.2 });
      g.rect(p.x - 17, itemY - 1, 34, 4).fill({ color: 0x00f5d4 }).stroke({ color: 0x0a0b10, width: 2.2 });
      g.moveTo(p.x - 14, itemY - 2).lineTo(p.x + 15, itemY - 2).stroke({ color: 0xffffff, width: 2.2 });
    } else {
      // Arc Tesla Coil emitter
      g.rect(p.x - 4, itemY - 3, 8, 12).fill({ color: 0x3a3d4d }).stroke({ color: 0x0a0b10, width: 2.2 });
      g.circle(p.x, itemY - 7, 7).fill({ color: 0x7bdff2 }).stroke({ color: 0x0a0b10, width: 2.5 });
      g.circle(p.x, itemY - 7, 3).fill({ color: 0xffffff });
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

  // 1. Recessed 3D Tunnel / Blast Gate Interior
  const fillColor = isCleared ? 0x10121c : 0x3b151e;
  g.rect(cx - w / 2, cy - h / 2, w, h)
    .fill({ color: fillColor });

  if (isCleared) {
    // Open 2.5D corridor depth rails leading into adjacent room
    if (dir === 'N' || dir === 'S') {
      g.rect(cx - w / 2 + 6, cy - h / 2, w - 12, h)
        .fill({ color: 0x08090f });
      g.moveTo(cx - w / 2 + 12, cy - h / 2).lineTo(cx - w / 2 + 12, cy + h / 2).stroke({ color: frameColor, width: 2, alpha: 0.7 });
      g.moveTo(cx + w / 2 - 12, cy - h / 2).lineTo(cx + w / 2 - 12, cy + h / 2).stroke({ color: frameColor, width: 2, alpha: 0.7 });
    } else {
      g.rect(cx - w / 2, cy - h / 2 + 6, w, h - 12)
        .fill({ color: 0x08090f });
      g.moveTo(cx - w / 2, cy - h / 2 + 12).lineTo(cx + w / 2, cy - h / 2 + 12).stroke({ color: frameColor, width: 2, alpha: 0.7 });
      g.moveTo(cx - w / 2, cy + h / 2 - 12).lineTo(cx + w / 2, cy + h / 2 - 12).stroke({ color: frameColor, width: 2, alpha: 0.7 });
    }
  } else {
    // Locked heavy steel blast shutters & red laser barrier
    if (dir === 'N' || dir === 'S') {
      g.moveTo(cx - w / 2, cy).lineTo(cx + w / 2, cy).stroke({ color: 0xff2a55, width: 3 });
    } else {
      g.moveTo(cx, cy - h / 2).lineTo(cx, cy + h / 2).stroke({ color: 0xff2a55, width: 3 });
    }
  }

  // 2. Heavy 3D Beveled Bulkhead Door Frame & Flanking Pillars
  g.rect(cx - w / 2, cy - h / 2, w, h)
    .stroke({ color: 0x0a0b10, width: 4 });
  g.rect(cx - w / 2 + 1.5, cy - h / 2 + 1.5, w - 3, h - 3)
    .stroke({ color: frameColor, width: 2.5 });
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
