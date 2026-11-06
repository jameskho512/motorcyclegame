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

export function drawMotorcycle(g: Graphics, player: PlayerState, timestampMs: number = 0): void {
  const isDead = (player.deathTimer || 0) > 0;
  const dTimer = player.deathTimer || 0;
  // Progress from 0 (instant of death) to 1.0 (end of 2.2s countdown)
  const deathProg = isDead ? Math.max(0, Math.min(1, (2.2 - dTimer) / 2.2)) : 0;
  const tDeath = isDead ? Math.max(0, 2.2 - dTimer) : 0;
  const wreckTilt = isDead ? Math.min(0.85, 0.25 + deathProg * 0.8) : 0;

  const px = player.x;
  const py = player.y;
  const bAngle = player.bikeAngle + wreckTilt;
  const aAngle = isDead ? bAngle + 0.35 : player.aimAngle;
  const wDef = WEAPONS[player.weapon] || WEAPONS.pistol;
  const weaponColor = parseColor(wDef.color, 0xffd166);

  // Invulnerability flicker
  const isBlinking = player.invuln > 0 && Math.floor(player.invuln * 16) % 2 === 0;
  const alpha = isBlinking ? 0.45 : 1.0;

  // --- Volumetric Headlight Cone (only active when bike is running) ---
  if (!isDead) {
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
  }

  const cosB = Math.cos(bAngle);
  const sinB = Math.sin(bAngle);

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

  // --- 7. Anime Death / Crash Explosion & Mechanical Carnage ---
  if (isDead) {
    // 1. Flickering flame tongues engulfing the chassis
    const flameTongues = [
      { lx: -4, ly: -2, z: 4, h: 22, color: 0xff5400 },
      { lx: 2, ly: 3, z: 5, h: 26, color: 0xe5203a },
      { lx: -14, ly: 0, z: 4, h: 20, color: 0xff9f1c },
      { lx: 8, ly: -3, z: 6, h: 28, color: 0xff5400 },
      { lx: 14, ly: 2, z: 5, h: 18, color: 0xe5203a },
      { lx: -20, ly: -5, z: 3, h: 24, color: 0xffbe0b }
    ];
    for (let i = 0; i < flameTongues.length; i++) {
      const ft = flameTongues[i];
      const [fx, fy] = toWorld(ft.lx, ft.ly, ft.z);
      const flicker = Math.sin(timestampMs * 0.025 + i * 1.7) * 4;
      const curH = (ft.h + flicker) * (0.8 + deathProg * 0.4);
      const w = 7.5;
      const flamePts = [
        fx - w, fy + 2,
        fx - w * 0.4, fy - curH * 0.5,
        fx + Math.sin(timestampMs * 0.03 + i) * 3, fy - curH,
        fx + w * 0.4, fy - curH * 0.5,
        fx + w, fy + 2
      ];
      g.poly(flamePts)
        .fill({ color: ft.color, alpha: 0.9 })
        .stroke({ color: 0x0a0b10, width: 1.8 });
      // Inner hot core
      g.poly([
        fx - w * 0.5, fy + 1,
        fx, fy - curH * 0.7,
        fx + w * 0.5, fy + 1
      ]).fill({ color: 0xffffff, alpha: 0.85 });
    }

    // 2. Dark smoke rings billowing from the engine
    const smokeCount = 7;
    for (let s = 0; s < smokeCount; s++) {
      const sAngle = (s * Math.PI * 2) / smokeCount + (timestampMs * 0.001);
      const sDist = (12 + s * 7) * (0.6 + deathProg * 1.4);
      const sRad = (9 + s * 4) * (0.8 + deathProg * 0.8);
      const smX = px + Math.cos(sAngle) * sDist + (s % 2 === 0 ? -4 : 4);
      const smY = py + Math.sin(sAngle) * sDist * 0.7 - (10 + s * 5);
      const sAlpha = Math.max(0.2, 0.75 - deathProg * 0.45);
      const sCol = (s % 2 === 0) ? 0x1b1e2a : 0x0d0e14;
      g.circle(smX, smY, sRad)
        .fill({ color: sCol, alpha: sAlpha })
        .stroke({ color: 0x0a0b10, width: 2, alpha: sAlpha });
    }

    // 3. Jagged Comic Explosion Starburst Polygons
    const burstPulse = Math.sin(timestampMs * 0.04) * 4;
    const outerRadius = (38 + burstPulse) * (0.7 + deathProg * 0.6);
    const innerRadius = (16 + burstPulse * 0.5) * (0.7 + deathProg * 0.6);
    const starPts: number[] = [];
    const numPoints = 14;
    for (let p = 0; p < numPoints * 2; p++) {
      const ang = (p * Math.PI) / numPoints + (timestampMs * 0.002);
      const rad = (p % 2 === 0) ? outerRadius : innerRadius;
      starPts.push(px + Math.cos(ang) * rad, py + Math.sin(ang) * rad);
    }
    // Outer Crimson Explosion Starburst
    g.poly(starPts)
      .fill({ color: 0xff1744, alpha: 0.88 })
      .stroke({ color: 0x0a0b10, width: 3.5 });

    // Middle Gold Comic Flash Starburst
    const midStarPts: number[] = [];
    for (let p = 0; p < numPoints * 2; p++) {
      const ang = (p * Math.PI) / numPoints + 0.15 + (timestampMs * 0.003);
      const rad = ((p % 2 === 0) ? outerRadius * 0.68 : innerRadius * 0.6);
      midStarPts.push(px + Math.cos(ang) * rad, py + Math.sin(ang) * rad);
    }
    g.poly(midStarPts)
      .fill({ color: 0xffd166, alpha: 0.95 })
      .stroke({ color: 0x0a0b10, width: 2.2 });

    // Inner White Flare Core
    g.circle(px, py, (12 + Math.sin(timestampMs * 0.05) * 3) * (0.8 + deathProg * 0.5))
      .fill({ color: 0xffffff, alpha: 0.95 });

    // 4. Flying Mechanical Debris (spinning tire/fairing shards) radiating outward
    const shards = [
      { ang: 0.6, dist: 85, spin: 14, color: 0x141620, type: 'tire' },
      { ang: 2.2, dist: 95, spin: -16, color: 0xff5c00, type: 'fairing' },
      { ang: 3.8, dist: 78, spin: 18, color: 0xff5c00, type: 'fairing' },
      { ang: 5.1, dist: 105, spin: -15, color: 0x5c6274, type: 'metal' },
      { ang: 1.4, dist: 68, spin: 12, color: 0xffbe0b, type: 'fork' },
      { ang: 4.5, dist: 90, spin: -20, color: 0x141620, type: 'tire' },
      { ang: 3.1, dist: 110, spin: 22, color: 0xe5203a, type: 'fairing' }
    ];

    for (let i = 0; i < shards.length; i++) {
      const sh = shards[i];
      const curDist = deathProg * sh.dist;
      const curAngle = sh.ang;
      const shX = px + Math.cos(curAngle) * curDist;
      const shY = py + Math.sin(curAngle) * curDist;
      const rot = tDeath * sh.spin;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);

      const toShard = (lx: number, ly: number): [number, number] => [
        shX + cosR * lx - sinR * ly,
        shY + sinR * lx + cosR * ly
      ];

      if (sh.type === 'tire') {
        // Jagged tire tread chunk
        const pts = [toShard(-6, -4), toShard(6, -4), toShard(8, 4), toShard(-4, 5)].flat();
        g.poly(pts).fill({ color: sh.color }).stroke({ color: 0x0a0b10, width: 2 });
        const [r1x, r1y] = toShard(-3, 0);
        const [r2x, r2y] = toShard(4, 0);
        g.moveTo(r1x, r1y).lineTo(r2x, r2y).stroke({ color: 0xff5c00, width: 1.5 });
      } else if (sh.type === 'fairing') {
        // Sharp triangular orange fairing fragment
        const pts = [toShard(-7, -5), toShard(9, 0), toShard(-5, 6)].flat();
        g.poly(pts).fill({ color: sh.color }).stroke({ color: 0x0a0b10, width: 2 });
        const [glX, glY] = toShard(0, -1);
        g.circle(glX, glY, 1.5).fill({ color: 0xffffff });
      } else {
        // Heavy metallic frame/fork fragment
        const pts = [toShard(-8, -3), toShard(8, -3), toShard(6, 3), toShard(-8, 3)].flat();
        g.poly(pts).fill({ color: sh.color }).stroke({ color: 0x0a0b10, width: 2 });
      }

      // 5. Orange & Cyan Electrical Short-Circuit Arcs crackling outward
      if (deathProg > 0.08 && (i % 2 === Math.floor(timestampMs / 80) % 2)) {
        const arcColor = (i % 2 === 0) ? 0x2ee6ff : 0xff9f1c;
        const midX = (px + shX) / 2 + Math.sin(timestampMs * 0.05 + i) * 12;
        const midY = (py + shY) / 2 + Math.cos(timestampMs * 0.05 + i) * 12;
        g.moveTo(px, py)
          .lineTo(midX, midY)
          .lineTo(shX, shY)
          .stroke({ color: arcColor, width: 2, alpha: 0.85 });
      }
    }
  }
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

  const toWorld = (lx: number, ly: number, z: number = 0): [number, number] => {
    return [
      ex + cos * lx - sin * ly,
      ey + sin * lx + cos * ly - z
    ];
  };

  // Helper to render vehicle tires with dark rubber & alloy rims
  const drawWheel = (lx: number, ly: number, wLen: number, wWid: number, rimColor: number = 0x8d95a8) => {
    const pts = [
      toWorld(lx - wLen / 2, ly - wWid / 2),
      toWorld(lx + wLen / 2, ly - wWid / 2),
      toWorld(lx + wLen / 2, ly + wWid / 2),
      toWorld(lx - wLen / 2, ly + wWid / 2)
    ].flat();
    g.poly(pts)
      .fill({ color: 0x12141c })
      .stroke({ color: 0x0a0b10, width: 2 });
    const [c1x, c1y] = toWorld(lx - wLen * 0.25, ly);
    const [c2x, c2y] = toWorld(lx + wLen * 0.25, ly);
    g.moveTo(c1x, c1y).lineTo(c2x, c2y).stroke({ color: rimColor, width: 1.5 });
  };

  // Laser telegraph for sniper & charger
  if ((reg.type === 'charger' && reg.state === 'windup') || (reg.type === 'sniper' && reg.aiTimer < 0.45)) {
    const laserLen = 260;
    g.moveTo(ex, ey)
      .lineTo(ex + cos * laserLen, ey + sin * laserLen)
      .stroke({ color: 0xff4d6d, width: 2, alpha: 0.65 });
  }

  const borderWidth = reg.isElite ? 3.8 : 2.5;
  const borderColor = reg.isElite ? 0xffd166 : 0x0a0b10;

  switch (reg.type) {
    case 'swarmer':
    case 'mini_swarmer': {
      // 1. Sport Coupe / Compact Hatchback (sleek 2-door coupe, rear spoiler, 4 wheels, angry headlights)
      // 4 rubber wheels
      drawWheel(r * 0.65, -r * 0.65, r * 0.52, r * 0.25);
      drawWheel(r * 0.65, r * 0.65, r * 0.52, r * 0.25);
      drawWheel(-r * 0.65, -r * 0.65, r * 0.52, r * 0.25);
      drawWheel(-r * 0.65, r * 0.65, r * 0.52, r * 0.25);

      // Aerodynamic coupe chassis
      const coupeBody = [
        toWorld(-r * 1.05, -r * 0.55),
        toWorld(-r * 1.15, 0),
        toWorld(-r * 1.05, r * 0.55),
        toWorld(-r * 0.25, r * 0.62),
        toWorld(r * 0.6, r * 0.58),
        toWorld(r * 1.15, r * 0.42),
        toWorld(r * 1.25, 0),
        toWorld(r * 1.15, -r * 0.42),
        toWorld(r * 0.6, -r * 0.58),
        toWorld(-r * 0.25, -r * 0.62)
      ].flat();
      g.poly(coupeBody)
        .fill({ color: bodyColor })
        .stroke({ color: borderColor, width: borderWidth });

      // Specular hood highlight
      const hoodHi = [
        toWorld(-r * 0.1, -r * 0.45, 1.5),
        toWorld(r * 0.8, -r * 0.35, 1.5),
        toWorld(r * 0.7, 0, 1.5),
        toWorld(-r * 0.1, -r * 0.1, 1.5)
      ].flat();
      g.poly(hoodHi).fill({ color: 0xffffff, alpha: 0.25 });

      // Sloped front windshield & roof
      const windshield = [
        toWorld(r * 0.15, -r * 0.42, 2.5),
        toWorld(r * 0.55, -r * 0.38, 1.5),
        toWorld(r * 0.55, r * 0.38, 1.5),
        toWorld(r * 0.15, r * 0.42, 2.5)
      ].flat();
      g.poly(windshield).fill({ color: 0x161c28 }).stroke({ color: 0x0a0b10, width: 1.8 });

      const roof = [
        toWorld(-r * 0.45, -r * 0.38, 3.5),
        toWorld(r * 0.15, -r * 0.38, 3.5),
        toWorld(r * 0.15, r * 0.38, 3.5),
        toWorld(-r * 0.45, r * 0.38, 3.5)
      ].flat();
      g.poly(roof).fill({ color: bodyColor }).stroke({ color: 0x0a0b10, width: 1.8 });

      const rearHatch = [
        toWorld(-r * 0.75, -r * 0.38, 1.8),
        toWorld(-r * 0.45, -r * 0.38, 3.5),
        toWorld(-r * 0.45, r * 0.38, 3.5),
        toWorld(-r * 0.75, r * 0.38, 1.8)
      ].flat();
      g.poly(rearHatch).fill({ color: 0x161c28 }).stroke({ color: 0x0a0b10, width: 1.8 });

      // High-downforce rear spoiler wing
      const spoiler = [
        toWorld(-r * 1.08, -r * 0.65, 3.5),
        toWorld(-r * 0.95, -r * 0.65, 3.5),
        toWorld(-r * 0.95, r * 0.65, 3.5),
        toWorld(-r * 1.08, r * 0.65, 3.5)
      ].flat();
      g.poly(spoiler).fill({ color: 0x0a0b10 }).stroke({ color: borderColor, width: 1.8 });

      // Angry slanted headlights
      const [hl1x, hl1y] = toWorld(r * 1.12, -r * 0.3, 1.5);
      const [hl2x, hl2y] = toWorld(r * 1.12, r * 0.3, 1.5);
      g.circle(hl1x, hl1y, Math.max(1.8, r * 0.18)).fill({ color: 0xfff3b0 }).stroke({ color: 0x0a0b10, width: 1.2 });
      g.circle(hl2x, hl2y, Math.max(1.8, r * 0.18)).fill({ color: 0xfff3b0 }).stroke({ color: 0x0a0b10, width: 1.2 });
      break;
    }

    case 'trishot':
    case 'sniper': {
      // 2. 4-Door Street Sedan (classic chassis, front hood, cabin roof, windshields, 4 wheels, roof weapon)
      drawWheel(r * 0.7, -r * 0.62, r * 0.52, r * 0.25);
      drawWheel(r * 0.7, r * 0.62, r * 0.52, r * 0.25);
      drawWheel(-r * 0.7, -r * 0.62, r * 0.52, r * 0.25);
      drawWheel(-r * 0.7, r * 0.62, r * 0.52, r * 0.25);

      const sedanPts = [
        toWorld(-r * 1.2, -r * 0.55),
        toWorld(-r * 1.25, 0),
        toWorld(-r * 1.2, r * 0.55),
        toWorld(-r * 0.35, r * 0.6),
        toWorld(r * 0.45, r * 0.58),
        toWorld(r * 1.2, r * 0.52),
        toWorld(r * 1.28, 0),
        toWorld(r * 1.2, -r * 0.52),
        toWorld(r * 0.45, -r * 0.58),
        toWorld(-r * 0.35, -r * 0.6)
      ].flat();
      g.poly(sedanPts).fill({ color: bodyColor }).stroke({ color: borderColor, width: borderWidth });

      // Windshields & cabin
      const frontGlass = [
        toWorld(r * 0.15, -r * 0.45, 3),
        toWorld(r * 0.55, -r * 0.42, 1.5),
        toWorld(r * 0.55, r * 0.42, 1.5),
        toWorld(r * 0.15, r * 0.45, 3)
      ].flat();
      const rearGlass = [
        toWorld(-r * 0.72, -r * 0.42, 1.5),
        toWorld(-r * 0.4, -r * 0.45, 3),
        toWorld(-r * 0.4, r * 0.45, 3),
        toWorld(-r * 0.72, r * 0.42, 1.5)
      ].flat();
      const cabinRoof = [
        toWorld(-r * 0.4, -r * 0.45, 3.5),
        toWorld(r * 0.15, -r * 0.45, 3.5),
        toWorld(r * 0.15, r * 0.45, 3.5),
        toWorld(-r * 0.4, r * 0.45, 3.5)
      ].flat();
      g.poly(frontGlass).fill({ color: 0x141824 }).stroke({ color: 0x0a0b10, width: 1.5 });
      g.poly(rearGlass).fill({ color: 0x141824 }).stroke({ color: 0x0a0b10, width: 1.5 });
      g.poly(cabinRoof).fill({ color: bodyColor }).stroke({ color: 0x0a0b10, width: 1.5 });

      // Front headlights
      const [hl1x, hl1y] = toWorld(r * 1.18, -r * 0.35, 1.5);
      const [hl2x, hl2y] = toWorld(r * 1.18, r * 0.35, 1.5);
      g.circle(hl1x, hl1y, Math.max(1.8, r * 0.18)).fill({ color: 0xfff3b0 }).stroke({ color: 0x0a0b10, width: 1.2 });
      g.circle(hl2x, hl2y, Math.max(1.8, r * 0.18)).fill({ color: 0xfff3b0 }).stroke({ color: 0x0a0b10, width: 1.2 });

      // Roof Weapon Mount
      if (reg.type === 'trishot') {
        // Roof tri-barrel gun turret
        const [tX, tY] = toWorld(-r * 0.1, 0, 4);
        g.circle(tX, tY, r * 0.32).fill({ color: 0x242838 }).stroke({ color: 0x0a0b10, width: 2 });
        [-r * 0.22, 0, r * 0.22].forEach(offY => {
          const [bStart1, bStart2] = toWorld(-r * 0.1, offY, 4.5);
          const [bEnd1, bEnd2] = toWorld(r * 0.9, offY, 4.5);
          g.moveTo(bStart1, bStart2).lineTo(bEnd1, bEnd2).stroke({ color: 0x0a0b10, width: 3.2 });
          g.moveTo(bStart1, bStart2).lineTo(bEnd1, bEnd2).stroke({ color: 0xdde2eb, width: 1.6 });
          const [muzzleX, muzzleY] = toWorld(r * 0.92, offY, 4.5);
          g.circle(muzzleX, muzzleY, 1.8).fill({ color: 0xffd166 });
        });
      } else {
        // Roof heavy sniper rifle barrel with laser scope
        const [sBaseX, sBaseY] = toWorld(-r * 0.2, 0, 4);
        g.circle(sBaseX, sBaseY, r * 0.28).fill({ color: 0x1b1d28 }).stroke({ color: 0x0a0b10, width: 2 });
        const [bS1, bS2] = toWorld(-r * 0.1, 0, 4.8);
        const [bE1, bE2] = toWorld(r * 1.65, 0, 4.8);
        g.moveTo(bS1, bS2).lineTo(bE1, bE2).stroke({ color: 0x0a0b10, width: 4.2 });
        g.moveTo(bS1, bS2).lineTo(bE1, bE2).stroke({ color: 0x4cc9f0, width: 2.2 });
        const [m1, m2] = toWorld(r * 1.65, 0, 4.8);
        g.circle(m1, m2, 3.2).fill({ color: 0x0a0b10 });
        const [sc1, sc2] = toWorld(r * 0.2, 3.5, 5.5);
        g.circle(sc1, sc2, 2.5).fill({ color: 0xff1744 }).stroke({ color: 0x0a0b10, width: 1.5 });
      }
      break;
    }

    case 'charger': {
      // 3. Pickup Truck / Muscle Ram Truck (front bull-bar ram, open bed with spare tire/rollbar, 4 chunky tires)
      drawWheel(r * 0.72, -r * 0.72, r * 0.6, r * 0.35, 0xff9f1c);
      drawWheel(r * 0.72, r * 0.72, r * 0.6, r * 0.35, 0xff9f1c);
      drawWheel(-r * 0.72, -r * 0.72, r * 0.6, r * 0.35, 0xff9f1c);
      drawWheel(-r * 0.72, r * 0.72, r * 0.6, r * 0.35, 0xff9f1c);

      const truckPts = [
        toWorld(-r * 1.25, -r * 0.62),
        toWorld(-r * 1.25, r * 0.62),
        toWorld(r * 0.35, r * 0.62),
        toWorld(r * 1.15, r * 0.58),
        toWorld(r * 1.22, 0),
        toWorld(r * 1.15, -r * 0.58),
        toWorld(r * 0.35, -r * 0.62)
      ].flat();
      g.poly(truckPts).fill({ color: bodyColor }).stroke({ color: borderColor, width: borderWidth });

      // Front Heavy Bull-Bar Ram / Cattle Catcher
      const bullBar = [
        toWorld(r * 1.15, -r * 0.65, 2),
        toWorld(r * 1.48, -r * 0.55, 2),
        toWorld(r * 1.55, 0, 2),
        toWorld(r * 1.48, r * 0.55, 2),
        toWorld(r * 1.15, r * 0.65, 2),
        toWorld(r * 1.15, r * 0.45, 2),
        toWorld(r * 1.4, 0, 2),
        toWorld(r * 1.15, -r * 0.45, 2)
      ].flat();
      g.poly(bullBar).fill({ color: 0x8d95a8 }).stroke({ color: 0x0a0b10, width: 2.5 });
      for (const spY of [-r * 0.35, 0, r * 0.35]) {
        const [spBaseX, spBaseY] = toWorld(r * 1.45, spY, 2);
        const [spTipX, spTipY] = toWorld(r * 1.7, spY, 2);
        g.moveTo(spBaseX, spBaseY).lineTo(spTipX, spTipY).stroke({ color: 0xdde2eb, width: 3.5 });
      }

      // Elevated Cab & Windshield
      const cabGlass = [
        toWorld(r * 0.05, -r * 0.5, 3.8),
        toWorld(r * 0.45, -r * 0.48, 1.8),
        toWorld(r * 0.45, r * 0.48, 1.8),
        toWorld(r * 0.05, r * 0.5, 3.8)
      ].flat();
      const cabRoof = [
        toWorld(-r * 0.35, -r * 0.48, 4),
        toWorld(r * 0.05, -r * 0.48, 4),
        toWorld(r * 0.05, r * 0.48, 4),
        toWorld(-r * 0.35, r * 0.48, 4)
      ].flat();
      g.poly(cabGlass).fill({ color: 0x141824 }).stroke({ color: 0x0a0b10, width: 1.8 });
      g.poly(cabRoof).fill({ color: bodyColor }).stroke({ color: 0x0a0b10, width: 2 });

      // Open rear truck bed with rollbar & spare tire
      const bedFloor = [
        toWorld(-r * 1.18, -r * 0.52, 1),
        toWorld(-r * 0.38, -r * 0.52, 1),
        toWorld(-r * 0.38, r * 0.52, 1),
        toWorld(-r * 1.18, r * 0.52, 1)
      ].flat();
      g.poly(bedFloor).fill({ color: 0x181a24 }).stroke({ color: 0x0a0b10, width: 2 });
      const [rb1x, rb1y] = toWorld(-r * 0.42, -r * 0.5, 4.2);
      const [rb2x, rb2y] = toWorld(-r * 0.42, r * 0.5, 4.2);
      g.moveTo(rb1x, rb1y).lineTo(rb2x, rb2y).stroke({ color: 0xdde2eb, width: 3 });
      const [stX, stY] = toWorld(-r * 0.78, 0, 1.8);
      g.circle(stX, stY, r * 0.28).fill({ color: 0x12141c }).stroke({ color: 0x0a0b10, width: 2 });
      g.circle(stX, stY, r * 0.12).fill({ color: 0x8d95a8 });
      break;
    }

    case 'splitter':
    case 'turret': {
      // 4. Minivan / Tactical Armored Van (sliding door seams, panoramic glass, roof rack/turret, 4 tires)
      drawWheel(r * 0.72, -r * 0.65, r * 0.52, r * 0.25);
      drawWheel(r * 0.72, r * 0.65, r * 0.52, r * 0.25);
      drawWheel(-r * 0.72, -r * 0.65, r * 0.52, r * 0.25);
      drawWheel(-r * 0.72, r * 0.65, r * 0.52, r * 0.25);

      const vanPts = [
        toWorld(-r * 1.35, -r * 0.6),
        toWorld(-r * 1.35, r * 0.6),
        toWorld(r * 0.5, r * 0.6),
        toWorld(r * 1.25, r * 0.45),
        toWorld(r * 1.32, 0),
        toWorld(r * 1.25, -r * 0.45),
        toWorld(r * 0.5, -r * 0.6)
      ].flat();
      g.poly(vanPts).fill({ color: bodyColor }).stroke({ color: borderColor, width: borderWidth });

      // Panoramic windshield and tall roof
      const panoGlass = [
        toWorld(r * 0.35, -r * 0.5, 3.2),
        toWorld(r * 0.95, -r * 0.44, 1.8),
        toWorld(r * 0.95, r * 0.44, 1.8),
        toWorld(r * 0.35, r * 0.5, 3.2)
      ].flat();
      const vanRoof = [
        toWorld(-r * 1.2, -r * 0.5, 3.5),
        toWorld(r * 0.35, -r * 0.5, 3.5),
        toWorld(r * 0.35, r * 0.5, 3.5),
        toWorld(-r * 1.2, r * 0.5, 3.5)
      ].flat();
      g.poly(panoGlass).fill({ color: 0x141824 }).stroke({ color: 0x0a0b10, width: 1.8 });
      g.poly(vanRoof).fill({ color: bodyColor }).stroke({ color: 0x0a0b10, width: 1.8 });

      // Sliding door seams
      const [sd1x, sd1y] = toWorld(-r * 0.25, -r * 0.6);
      const [sd2x, sd2y] = toWorld(-r * 0.25, -r * 0.5, 3.5);
      g.moveTo(sd1x, sd1y).lineTo(sd2x, sd2y).stroke({ color: 0x0a0b10, width: 1.8 });

      if (reg.type === 'turret') {
        // Armored 360-degree rotating roof turret with twin heavy autocannons
        const [turX, turY] = toWorld(0, 0, 4);
        g.circle(turX, turY, r * 0.45).fill({ color: 0x222638 }).stroke({ color: 0x0a0b10, width: 2.2 });
        for (const offY of [-r * 0.18, r * 0.18]) {
          const [tb1, tb2] = toWorld(0, offY, 4.8);
          const [te1, te2] = toWorld(r * 1.35, offY, 4.8);
          g.moveTo(tb1, tb2).lineTo(te1, te2).stroke({ color: 0x0a0b10, width: 4 });
          g.moveTo(tb1, tb2).lineTo(te1, te2).stroke({ color: 0x6c757d, width: 2 });
          const [mzX, mzY] = toWorld(r * 1.35, offY, 4.8);
          g.circle(mzX, mzY, 2).fill({ color: 0xffd166 });
        }
      } else {
        // Tactical split-seam line down center chassis & roof rack
        const [spl1x, spl1y] = toWorld(-r * 1.35, 0, 3.5);
        const [spl2x, spl2y] = toWorld(r * 1.32, 0, 1.8);
        g.moveTo(spl1x, spl1y).lineTo(spl2x, spl2y).stroke({ color: 0x0a0b10, width: 3.5 });
        g.moveTo(spl1x, spl1y).lineTo(spl2x, spl2y).stroke({ color: 0xffd166, width: 1.8 });
        // Roof gear rack
        const [rack1x, rack1y] = toWorld(-r * 0.9, -r * 0.35, 4.2);
        const [rack2x, rack2y] = toWorld(-r * 0.1, -r * 0.35, 4.2);
        const [rack3x, rack3y] = toWorld(-r * 0.9, r * 0.35, 4.2);
        const [rack4x, rack4y] = toWorld(-r * 0.1, r * 0.35, 4.2);
        g.moveTo(rack1x, rack1y).lineTo(rack2x, rack2y).stroke({ color: 0xdde2eb, width: 1.8 });
        g.moveTo(rack3x, rack3y).lineTo(rack4x, rack4y).stroke({ color: 0xdde2eb, width: 1.8 });
      }
      break;
    }

    case 'bomber':
    case 'pyro': {
      // 5. Cargo Box Truck (cab-over-engine front, corrugated box with hazard stripes, 6 wheels, mortar/flame tank)
      drawWheel(r * 0.85, -r * 0.7, r * 0.52, r * 0.28);
      drawWheel(r * 0.85, r * 0.7, r * 0.52, r * 0.28);
      drawWheel(-r * 0.45, -r * 0.7, r * 0.52, r * 0.28);
      drawWheel(-r * 0.45, r * 0.7, r * 0.52, r * 0.28);
      drawWheel(-r * 1.0, -r * 0.7, r * 0.52, r * 0.28);
      drawWheel(-r * 1.0, r * 0.7, r * 0.52, r * 0.28);

      // Cab-over-engine front cab
      const cabPts = [
        toWorld(r * 0.45, -r * 0.65),
        toWorld(r * 0.45, r * 0.65),
        toWorld(r * 1.25, r * 0.65),
        toWorld(r * 1.35, 0),
        toWorld(r * 1.25, -r * 0.65)
      ].flat();
      g.poly(cabPts).fill({ color: 0x242838 }).stroke({ color: borderColor, width: borderWidth });

      const cabGlass = [
        toWorld(r * 0.75, -r * 0.55, 3.5),
        toWorld(r * 1.2, -r * 0.52, 1.8),
        toWorld(r * 1.2, r * 0.52, 1.8),
        toWorld(r * 0.75, r * 0.55, 3.5)
      ].flat();
      g.poly(cabGlass).fill({ color: 0x141824 }).stroke({ color: 0x0a0b10, width: 1.8 });

      // Large corrugated rear cargo box
      const boxPts = [
        toWorld(-r * 1.45, -r * 0.68),
        toWorld(-r * 1.45, r * 0.68),
        toWorld(r * 0.4, r * 0.68),
        toWorld(r * 0.4, -r * 0.68)
      ].flat();
      g.poly(boxPts).fill({ color: bodyColor }).stroke({ color: borderColor, width: borderWidth });

      // Corrugated vertical rib lines
      for (const offX of [-r * 1.15, -r * 0.75, -r * 0.35, -r * 0.05]) {
        const [r1x, r1y] = toWorld(offX, -r * 0.68);
        const [r2x, r2y] = toWorld(offX, r * 0.68);
        g.moveTo(r1x, r1y).lineTo(r2x, r2y).stroke({ color: 0x0a0b10, width: 1.5, alpha: 0.6 });
      }

      // Yellow/black hazard stripes on cargo rear
      const [hz1x, hz1y] = toWorld(-r * 1.45, -r * 0.45);
      const [hz2x, hz2y] = toWorld(-r * 1.45, r * 0.45);
      g.moveTo(hz1x, hz1y).lineTo(hz2x, hz2y).stroke({ color: 0xffd166, width: 3 });

      if (reg.type === 'bomber') {
        // Heavy roof-mounted mortar launch tube
        const [mBaseX, mBaseY] = toWorld(-r * 0.5, 0, 4);
        g.circle(mBaseX, mBaseY, r * 0.4).fill({ color: 0x1a1d2c }).stroke({ color: 0x0a0b10, width: 2.5 });
        g.circle(mBaseX, mBaseY, r * 0.28).fill({ color: 0x0a0b10 });
        g.circle(mBaseX, mBaseY, r * 0.18).fill({ color: 0xff9f1c });
      } else {
        // Napalm flame tanks and flame projector nozzles
        const tankPts = [
          toWorld(-r * 0.9, -r * 0.35, 4),
          toWorld(-r * 0.1, -r * 0.35, 4),
          toWorld(-r * 0.1, r * 0.35, 4),
          toWorld(-r * 0.9, r * 0.35, 4)
        ].flat();
        g.poly(tankPts).fill({ color: 0xff5400 }).stroke({ color: 0x0a0b10, width: 2 });
        for (const offY of [-r * 0.55, r * 0.55]) {
          const [n1, n2] = toWorld(r * 1.1, offY, 2);
          const [n3, n4] = toWorld(r * 1.4, offY, 2);
          g.moveTo(n1, n2).lineTo(n3, n4).stroke({ color: 0xffd166, width: 2.8 });
        }
      }
      break;
    }

    case 'brute': {
      // 6. 18-Wheeler Semi-Truck Rig (heavy tractor cab, chrome grille, smokestacks, frontal plow, dual headlights, armored trailer)
      // Front steer axle
      drawWheel(r * 1.15, -r * 0.72, r * 0.55, r * 0.28);
      drawWheel(r * 1.15, r * 0.72, r * 0.55, r * 0.28);
      // Tractor tandem drive axles
      drawWheel(r * 0.2, -r * 0.72, r * 0.55, r * 0.28);
      drawWheel(r * 0.2, r * 0.72, r * 0.55, r * 0.28);
      drawWheel(-r * 0.25, -r * 0.72, r * 0.55, r * 0.28);
      drawWheel(-r * 0.25, r * 0.72, r * 0.55, r * 0.28);
      // Trailer tandem axles
      drawWheel(-r * 1.25, -r * 0.72, r * 0.55, r * 0.28);
      drawWheel(-r * 1.25, r * 0.72, r * 0.55, r * 0.28);
      drawWheel(-r * 1.7, -r * 0.72, r * 0.55, r * 0.28);
      drawWheel(-r * 1.7, r * 0.72, r * 0.55, r * 0.28);

      // Heavy tractor cab
      const tractorPts = [
        toWorld(-r * 0.35, -r * 0.65),
        toWorld(-r * 0.35, r * 0.65),
        toWorld(r * 1.35, r * 0.65),
        toWorld(r * 1.45, 0),
        toWorld(r * 1.35, -r * 0.65)
      ].flat();
      g.poly(tractorPts).fill({ color: bodyColor }).stroke({ color: borderColor, width: borderWidth });

      // Chrome vertical radiator grille
      const [gr1x, gr1y] = toWorld(r * 1.42, -r * 0.35);
      const [gr2x, gr2y] = toWorld(r * 1.42, r * 0.35);
      g.moveTo(gr1x, gr1y).lineTo(gr2x, gr2y).stroke({ color: 0xdde2eb, width: 3.5 });

      // Dual high chrome smokestacks
      for (const offY of [-r * 0.65, r * 0.65]) {
        const [st1, st2] = toWorld(r * 0.3, offY, 4.5);
        g.circle(st1, st2, 3).fill({ color: 0xdde2eb }).stroke({ color: 0x0a0b10, width: 1.5 });
      }

      // Frontal heavy armor bulldozer plow
      const plowPts = [
        toWorld(r * 1.35, -r * 0.85, 1.5),
        toWorld(r * 1.78, 0, 1.5),
        toWorld(r * 1.35, r * 0.85, 1.5),
        toWorld(r * 1.25, r * 0.7, 1.5),
        toWorld(r * 1.58, 0, 1.5),
        toWorld(r * 1.25, -r * 0.7, 1.5)
      ].flat();
      g.poly(plowPts).fill({ color: 0x8d95a8 }).stroke({ color: 0x0a0b10, width: 3 });
      const [pl1x, pl1y] = toWorld(r * 1.5, -r * 0.4, 2);
      const [pl2x, pl2y] = toWorld(r * 1.5, r * 0.4, 2);
      g.moveTo(pl1x, pl1y).lineTo(pl2x, pl2y).stroke({ color: 0xffd166, width: 2.5 });

      // Fifth-wheel hitch coupling
      const [hitchX, hitchY] = toWorld(-r * 0.4, 0);
      g.circle(hitchX, hitchY, r * 0.2).fill({ color: 0x0a0b10 });

      // Armored trailer box
      const trailerPts = [
        toWorld(-r * 2.1, -r * 0.7),
        toWorld(-r * 2.1, r * 0.7),
        toWorld(-r * 0.45, r * 0.7),
        toWorld(-r * 0.45, -r * 0.7)
      ].flat();
      g.poly(trailerPts).fill({ color: 0x222636 }).stroke({ color: borderColor, width: borderWidth });

      // Reinforced trailer armor plates & golden rivets
      for (const offX of [-r * 1.8, -r * 1.4, -r * 1.0, -r * 0.6]) {
        const [t1x, t1y] = toWorld(offX, -r * 0.7);
        const [t2x, t2y] = toWorld(offX, r * 0.7);
        g.moveTo(t1x, t1y).lineTo(t2x, t2y).stroke({ color: 0x0a0b10, width: 1.8 });
        g.circle(t1x, t1y + 4, 1.5).fill({ color: 0xffd166 });
        g.circle(t2x, t2y - 4, 1.5).fill({ color: 0xffd166 });
      }
      break;
    }

    default: {
      // Fallback: Sedan silhouette
      drawWheel(r * 0.7, -r * 0.62, r * 0.52, r * 0.25);
      drawWheel(r * 0.7, r * 0.62, r * 0.52, r * 0.25);
      drawWheel(-r * 0.7, -r * 0.62, r * 0.52, r * 0.25);
      drawWheel(-r * 0.7, r * 0.62, r * 0.52, r * 0.25);

      const defPts = [
        toWorld(-r * 1.2, -r * 0.55),
        toWorld(-r * 1.25, 0),
        toWorld(-r * 1.2, r * 0.55),
        toWorld(r * 1.2, r * 0.52),
        toWorld(r * 1.28, 0),
        toWorld(r * 1.2, -r * 0.52)
      ].flat();
      g.poly(defPts).fill({ color: bodyColor }).stroke({ color: borderColor, width: borderWidth });
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
  } else if ((p as any).type === 'hub_npc') {
    const npc = p as any;
    const npcId = npc.npcId as string;
    const padRadius = p.radius || (npcId === 'launch' ? 38 : 34);

    if (npcId === 'launch') {
      // ----------------------------------------------------------------------
      // HIGHWAY GATE — Ride Out Portal
      // Blazing crimson/gold/cyan swirling deployment portal gate (radius: 36)
      // with animated chevrons pointing upward and a glowing central vortex ring!
      // ----------------------------------------------------------------------
      const rot = timestampMs / 450;
      const pulse = 1 + Math.sin(timestampMs / 160) * 0.08;

      // 1. Swirling Outer Nebula Accretion Ring (Crimson / Magenta)
      g.circle(p.x, p.y, padRadius * pulse)
        .fill({ color: 0xe5203a, alpha: 0.22 });
      g.circle(p.x, p.y, padRadius * pulse)
        .stroke({ color: 0x0a0b10, width: 3.5 });

      // 2. Multi-layer Spiral Energy Rings (Gold & Cyan)
      g.circle(p.x, p.y, (padRadius - 6) * pulse)
        .stroke({ color: 0xffd166, width: 2.8, alpha: 0.85 });
      g.circle(p.x, p.y, (padRadius - 13) * pulse)
        .stroke({ color: 0x2ee6ff, width: 2.2, alpha: 0.95 });

      // 3. Animated Upward Highway Chevrons (Pointing UP toward Floor 1)
      const chevronCount = 3;
      const chevronBaseY = p.y + 16;
      for (let c = 0; c < chevronCount; c++) {
        const cOffset = ((timestampMs / 220) + c * 1.2) % 3;
        const cyPos = chevronBaseY - cOffset * 11;
        const cAlpha = Math.max(0.15, 1 - (cOffset / 3));
        const cCol = c % 2 === 0 ? 0xffd166 : 0x2ee6ff;
        // Upward chevron arrow (^)
        g.moveTo(p.x - 14, cyPos + 6)
          .lineTo(p.x, cyPos - 4)
          .lineTo(p.x + 14, cyPos + 6)
          .stroke({ color: 0x0a0b10, width: 4.5, alpha: cAlpha });
        g.moveTo(p.x - 14, cyPos + 6)
          .lineTo(p.x, cyPos - 4)
          .lineTo(p.x + 14, cyPos + 6)
          .stroke({ color: cCol, width: 2.8, alpha: cAlpha });
      }

      // 4. Industrial Highway Gate Portal Pylons
      for (const sign of [-1, 1]) {
        const px = p.x + sign * (padRadius + 4);
        // Heavy Pylon Base
        g.rect(px - 6, p.y - 18, 12, 36)
          .fill({ color: 0x1f2233 })
          .stroke({ color: 0x0a0b10, width: 3 });
        // Hazard stripe
        g.rect(px - 4, p.y - 6, 8, 12)
          .fill({ color: 0xffd166 });
        // Blinking beacon on top
        const beaconCol = Math.floor(timestampMs / 200) % 2 === 0 ? 0xff1744 : 0xffbe0b;
        g.circle(px, p.y - 21, 3.5).fill({ color: beaconCol }).stroke({ color: 0x0a0b10, width: 1.5 });
      }

      // 5. Singularity Vortex Core
      g.circle(p.x, p.y, 11)
        .fill({ color: 0x050508 });
      g.circle(p.x, p.y, 6)
        .fill({ color: 0x2ee6ff, alpha: 0.85 + Math.sin(timestampMs / 100) * 0.15 });

      // Rotating energy motes along the rim
      for (let i = 0; i < 4; i++) {
        const ang = rot + (i * Math.PI) / 2;
        const mx = p.x + Math.cos(ang) * (padRadius * 0.65);
        const my = p.y + Math.sin(ang) * (padRadius * 0.65);
        g.circle(mx, my, 2.5).fill({ color: 0xffffff });
      }
    } else {
      // ----------------------------------------------------------------------
      // NPC STATIONS: Garage, Blacksmith, Bounty
      // Draw a large 2.5D octagonal station pad on the floor (radius: 34)
      // with bold #0a0b10 comic ink borders and neon trim
      // ----------------------------------------------------------------------
      const padY = p.y + 6;
      const octPts: number[] = [];
      const zDepth = 8;

      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4 + Math.PI / 8;
        const ox = p.x + Math.cos(ang) * padRadius;
        const oy = padY + Math.sin(ang) * (padRadius * 0.62);
        octPts.push(ox, oy);
      }

      // 2.5D Extruded Front Faces of Octagonal Pad
      const frontIndices = [1, 2, 3, 4];
      const extrudePts = [
        octPts[frontIndices[0] * 2], octPts[frontIndices[0] * 2 + 1],
        octPts[frontIndices[1] * 2], octPts[frontIndices[1] * 2 + 1],
        octPts[frontIndices[2] * 2], octPts[frontIndices[2] * 2 + 1],
        octPts[frontIndices[3] * 2], octPts[frontIndices[3] * 2 + 1],
        octPts[frontIndices[3] * 2], octPts[frontIndices[3] * 2 + 1] + zDepth,
        octPts[frontIndices[2] * 2], octPts[frontIndices[2] * 2 + 1] + zDepth,
        octPts[frontIndices[1] * 2], octPts[frontIndices[1] * 2 + 1] + zDepth,
        octPts[frontIndices[0] * 2], octPts[frontIndices[0] * 2 + 1] + zDepth
      ];
      g.poly(extrudePts)
        .fill({ color: 0x10131e })
        .stroke({ color: 0x0a0b10, width: 3.5 });

      // Pad Top Face
      g.poly(octPts)
        .fill({ color: 0x1b202e })
        .stroke({ color: 0x0a0b10, width: 3.5 });

      if (npcId === 'garage') {
        // --------------------------------------------------------------------
        // WRENCH — Chief Mechanic & Garage Lift
        // Yellow/black hazard-striped hydraulic lift pad (#ffd60a & #0a0b10),
        // tool cabinet, anime mechanic NPC in orange coveralls, welding goggles
        // (#2ee6ff lenses), and a giant chrome wrench waving slightly with bob.
        // --------------------------------------------------------------------
        // Hazard-striped lift pad top trim
        g.poly(octPts).stroke({ color: 0xffd60a, width: 2.5 });
        // Hazard diagonal stripes across center pad
        for (let hx = p.x - 24; hx <= p.x + 24; hx += 12) {
          g.moveTo(hx - 5, padY - 10).lineTo(hx + 5, padY + 10).stroke({ color: 0xffd60a, width: 3, alpha: 0.85 });
        }

        // Twin Hydraulic Lift Pistons
        for (const px of [p.x - 26, p.x + 26]) {
          g.rect(px - 3, padY - 6, 6, 14).fill({ color: 0xdde2eb }).stroke({ color: 0x0a0b10, width: 1.8 });
          g.circle(px, padY - 6, 3.5).fill({ color: 0xffd60a }).stroke({ color: 0x0a0b10, width: 1.5 });
        }

        // Industrial Red Tool Cabinet
        const cabX = p.x - 22;
        const cabY = p.y - 12;
        g.rect(cabX - 10, cabY - 14, 20, 24)
          .fill({ color: 0xc92a37 })
          .stroke({ color: 0x0a0b10, width: 2.5 });
        // Cabinet top bevel & drawer divider lines
        g.rect(cabX - 10, cabY - 14, 20, 5).fill({ color: 0xe63946 });
        for (const dy of [-4, 2, 8]) {
          g.moveTo(cabX - 8, cabY + dy).lineTo(cabX + 8, cabY + dy).stroke({ color: 0x0a0b10, width: 1.5 });
          g.moveTo(cabX - 3, cabY + dy - 2).lineTo(cabX + 3, cabY + dy - 2).stroke({ color: 0xdde2eb, width: 1.5 });
        }

        // Anime Mechanic Character (WRENCH)
        const nX = p.x + 6;
        const nY = p.y - 10 + bob * 0.4;

        // Orange coveralls torso & legs
        const coveralls = [
          nX - 8, nY + 16,
          nX - 8, nY - 4,
          nX + 8, nY - 4,
          nX + 8, nY + 16,
          nX + 2, nY + 16,
          nX, nY + 6,
          nX - 2, nY + 16
        ];
        g.poly(coveralls).fill({ color: 0xff6b2b }).stroke({ color: 0x0a0b10, width: 2.5 });
        // Tool belt with brass buckle
        g.rect(nX - 8, nY + 4, 16, 3.5).fill({ color: 0x242838 }).stroke({ color: 0x0a0b10, width: 1.2 });
        g.rect(nX - 2, nY + 3.5, 4, 4.5).fill({ color: 0xffd60a });

        // Head & hair
        g.circle(nX, nY - 12, 7.5).fill({ color: 0xf1c27d }).stroke({ color: 0x0a0b10, width: 2 });
        // Dark anime spiky hair / cap
        const hairPts = [
          nX - 8, nY - 12,
          nX - 6, nY - 19,
          nX - 1, nY - 21,
          nX + 4, nY - 20,
          nX + 8, nY - 14,
          nX + 5, nY - 10
        ];
        g.poly(hairPts).fill({ color: 0x1f2233 }).stroke({ color: 0x0a0b10, width: 1.5 });

        // Welding Goggles with glowing cyan lenses (#2ee6ff)
        g.rect(nX - 7, nY - 14, 14, 4.5).fill({ color: 0x0a0b10 });
        g.ellipse(nX - 3.5, nY - 12, 3.2, 2.8).fill({ color: 0x2ee6ff }).stroke({ color: 0x0a0b10, width: 1.2 });
        g.ellipse(nX + 3.5, nY - 12, 3.2, 2.8).fill({ color: 0x2ee6ff }).stroke({ color: 0x0a0b10, width: 1.2 });
        g.circle(nX - 4, nY - 13, 1).fill({ color: 0xffffff });
        g.circle(nX + 3, nY - 13, 1).fill({ color: 0xffffff });

        // Giant Chrome Wrench waving slightly with bob
        const wrenchWave = Math.sin(timestampMs / 200) * 0.15;
        const wBaseX = nX + 7;
        const wBaseY = nY;
        const wTipX = wBaseX + 14 + Math.sin(wrenchWave) * 4;
        const wTipY = wBaseY - 24 + bob * 0.8;

        // Arm holding wrench
        g.moveTo(nX + 6, nY - 2).lineTo(wBaseX, wBaseY).stroke({ color: 0xff6b2b, width: 4.5 });
        g.moveTo(nX + 6, nY - 2).lineTo(wBaseX, wBaseY).stroke({ color: 0x0a0b10, width: 1.5 });

        // Chrome Wrench Shaft
        g.moveTo(wBaseX, wBaseY).lineTo(wTipX, wTipY).stroke({ color: 0x0a0b10, width: 6 });
        g.moveTo(wBaseX, wBaseY).lineTo(wTipX, wTipY).stroke({ color: 0xdde2eb, width: 3.5 });
        g.moveTo(wBaseX, wBaseY).lineTo(wTipX, wTipY).stroke({ color: 0xffffff, width: 1.5 });

        // Heavy Chrome Open-End Wrench Jaws
        g.circle(wTipX, wTipY, 6.5).fill({ color: 0xdde2eb }).stroke({ color: 0x0a0b10, width: 2 });
        g.poly([
          wTipX - 2, wTipY - 6.5,
          wTipX + 7, wTipY - 3,
          wTipX + 7, wTipY + 3,
          wTipX - 2, wTipY + 6.5
        ]).fill({ color: 0x1b202e });

      } else if (npcId === 'blacksmith') {
        // --------------------------------------------------------------------
        // SPARKY — Cyber Scrap Forge
        // Cyan/purple neon anvil & plasma smelter pad (#2ee6ff & #9d4edd),
        // glowing forge core, cyber-quartermaster NPC with spiked hair,
        // glowing green visor, and floating scrap gear emblem.
        // --------------------------------------------------------------------
        // Neon trim on pad
        g.poly(octPts).stroke({ color: 0x2ee6ff, width: 2.5 });
        g.circle(p.x, padY, 22).stroke({ color: 0x9d4edd, width: 2, alpha: 0.75 });

        // Plasma Smelter Crucible & Anvil
        const anX = p.x - 14;
        const anY = p.y - 2;
        const anvilPts = [
          anX - 10, anY + 12,
          anX - 6, anY - 2,
          anX + 8, anY - 2,
          anX + 14, anY + 2,
          anX + 6, anY + 5,
          anX + 10, anY + 12
        ];
        g.poly(anvilPts).fill({ color: 0x1f2336 }).stroke({ color: 0x0a0b10, width: 2.5 });
        g.moveTo(anX - 5, anY - 2).lineTo(anX + 8, anY - 2).stroke({ color: 0x2ee6ff, width: 2 });

        // Glowing Plasma Forge Core
        const corePulse = 1 + Math.sin(timestampMs / 140) * 0.18;
        const coreX = anX;
        const coreY = anY - 14;
        g.circle(coreX, coreY, 9 * corePulse).fill({ color: 0x9d4edd, alpha: 0.35 });
        g.circle(coreX, coreY, 6 * corePulse).fill({ color: 0x2ee6ff, alpha: 0.85 });
        g.circle(coreX, coreY, 2.8).fill({ color: 0xffffff });

        // Anime Cyber-Quartermaster Character (SPARKY)
        const nX = p.x + 8;
        const nY = p.y - 10 + bob * 0.4;

        // High-tech quartermaster armored trenchcoat / vest
        const vest = [
          nX - 7, nY + 16,
          nX - 8, nY - 4,
          nX + 8, nY - 4,
          nX + 7, nY + 16,
          nX, nY + 14
        ];
        g.poly(vest).fill({ color: 0x252a3d }).stroke({ color: 0x0a0b10, width: 2.5 });
        // Glowing purple circuitry lines on coat
        g.moveTo(nX - 4, nY - 2).lineTo(nX - 4, nY + 12).stroke({ color: 0x9d4edd, width: 1.5 });
        g.moveTo(nX + 4, nY - 2).lineTo(nX + 4, nY + 12).stroke({ color: 0x9d4edd, width: 1.5 });

        // Head
        g.circle(nX, nY - 12, 7.5).fill({ color: 0xf1c27d }).stroke({ color: 0x0a0b10, width: 2 });

        // Spiky electric cyber hair (#ffd166 / #2ee6ff anime spikes)
        const spikes = [
          nX - 8, nY - 11,
          nX - 12, nY - 18,
          nX - 6, nY - 17,
          nX - 4, nY - 23,
          nX, nY - 17,
          nX + 5, nY - 24,
          nX + 7, nY - 17,
          nX + 12, nY - 19,
          nX + 8, nY - 11
        ];
        g.poly(spikes).fill({ color: 0x2ee6ff }).stroke({ color: 0x0a0b10, width: 1.8 });

        // Glowing Green/Cyan Visor (#06d6a0)
        g.rect(nX - 7, nY - 14, 14, 4.5)
          .fill({ color: 0x06d6a0 })
          .stroke({ color: 0x0a0b10, width: 1.5 });
        g.rect(nX - 5, nY - 13, 10, 2).fill({ color: 0xffffff, alpha: 0.85 });

        // Floating Rotating Scrap Gear Emblem
        const gearX = nX + 2;
        const gearY = nY - 28 + bob * 0.8;
        const gSpin = timestampMs / 400;
        const gearR = 8.5;
        const gearPts: number[] = [];
        for (let i = 0; i < 6; i++) {
          const a1 = gSpin + (i * Math.PI * 2) / 6;
          const a2 = a1 + 0.3;
          gearPts.push(
            gearX + Math.cos(a1) * (gearR + 3), gearY + Math.sin(a1) * (gearR + 3),
            gearX + Math.cos(a2) * gearR, gearY + Math.sin(a2) * gearR
          );
        }
        g.poly(gearPts).fill({ color: 0xffd166 }).stroke({ color: 0x0a0b10, width: 1.8 });
        g.circle(gearX, gearY, 3.5).fill({ color: 0x2ee6ff }).stroke({ color: 0x0a0b10, width: 1.2 });

      } else if (npcId === 'bounty') {
        // --------------------------------------------------------------------
        // VALKYRIE — Outlaw Commander & War Table
        // Emerald/gold tactical holo-table pad (#06d6a0 & #ffd166),
        // glowing holographic map projection, and an armored outlaw commander
        // NPC with a crimson cape and horned helmet.
        // --------------------------------------------------------------------
        // Emerald & Gold neon pad border
        g.poly(octPts).stroke({ color: 0x06d6a0, width: 2.5 });
        g.circle(p.x, padY, 23).stroke({ color: 0xffd166, width: 1.8, alpha: 0.75 });

        // Tactical Holo-Table in center
        const htX = p.x;
        const htY = padY + 2;
        g.ellipse(htX, htY, 18, 9).fill({ color: 0x161a26 }).stroke({ color: 0x0a0b10, width: 2.5 });
        g.ellipse(htX, htY, 14, 6.5).fill({ color: 0x222a3d }).stroke({ color: 0x06d6a0, width: 1.5 });

        // Glowing Holographic Map Projection Cone (Emerald/Cyan)
        const holoCone = [
          htX - 12, htY,
          htX - 22, htY - 26,
          htX + 22, htY - 26,
          htX + 12, htY
        ];
        g.poly(holoCone).fill({ color: 0x06d6a0, alpha: 0.16 });
        // Floating holographic tactical rings & blips
        const hPulse = 1 + Math.sin(timestampMs / 180) * 0.1;
        g.ellipse(htX, htY - 20, 15 * hPulse, 6 * hPulse)
          .stroke({ color: 0x06d6a0, width: 1.5, alpha: 0.75 });
        g.circle(htX - 5, htY - 20, 2.2).fill({ color: 0xffd166, alpha: 0.9 });
        g.circle(htX + 6, htY - 22, 2.2).fill({ color: 0xe5203a, alpha: 0.9 });

        // Anime Outlaw Commander Character (VALKYRIE)
        const nX = p.x;
        const nY = p.y - 12 + bob * 0.4;

        // Flowing Crimson Outlaw Cape (#e63946) billowing behind
        const capeWave = Math.sin(timestampMs / 220) * 4;
        const capePts = [
          nX - 9, nY - 4,
          nX - 16 + capeWave, nY + 18,
          nX - 6, nY + 16,
          nX + 6, nY + 16,
          nX + 16 + capeWave, nY + 18,
          nX + 9, nY - 4
        ];
        g.poly(capePts).fill({ color: 0xe63946 }).stroke({ color: 0x0a0b10, width: 2.5 });

        // Black & Gold Pauldron Heavy Armor
        const armor = [
          nX - 9, nY + 14,
          nX - 10, nY - 5,
          nX + 10, nY - 5,
          nX + 9, nY + 14
        ];
        g.poly(armor).fill({ color: 0x181a24 }).stroke({ color: 0x0a0b10, width: 2.5 });
        // Gold trim pauldrons
        g.rect(nX - 11, nY - 6, 6, 5).fill({ color: 0xffd166 }).stroke({ color: 0x0a0b10, width: 1.5 });
        g.rect(nX + 5, nY - 6, 6, 5).fill({ color: 0xffd166 }).stroke({ color: 0x0a0b10, width: 1.5 });

        // Horned Biker / Commander Helmet
        g.circle(nX, nY - 14, 8).fill({ color: 0x1f2436 }).stroke({ color: 0x0a0b10, width: 2.2 });
        // Aerodynamic Horned Crests on helmet sides
        const hornL = [
          nX - 6, nY - 14,
          nX - 14, nY - 23,
          nX - 5, nY - 19
        ];
        const hornR = [
          nX + 6, nY - 14,
          nX + 14, nY - 23,
          nX + 5, nY - 19
        ];
        g.poly(hornL).fill({ color: 0xffd166 }).stroke({ color: 0x0a0b10, width: 1.8 });
        g.poly(hornR).fill({ color: 0xffd166 }).stroke({ color: 0x0a0b10, width: 1.8 });

        // Glowing Golden Visor Slash (#ffd166)
        g.moveTo(nX - 5, nY - 14).lineTo(nX + 5, nY - 14).stroke({ color: 0xffd166, width: 2.5 });
        g.circle(nX, nY - 14, 1.5).fill({ color: 0xffffff });
      }
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
