/**
 * MOTO-ROGUE: PixiJS v8 Stage Hierarchy & Scene Graph Manager
 *
 * Implements:
 * 1. PixiJS v8 Application initialization (`app.init({ width: 720, height: 720, ... })`).
 * 2. Strict 6-layer scene graph hierarchy:
 *    - FloorLayer: arena floor, grid lines, room instructions, trapdoor.
 *    - SkidLayer: permanent tire skid marks (capped at 130 per room).
 *    - ShadowLayer: obstacle shadows, bike neon underglow, entity shadows.
 *    - EntityLayer: obstacles, pickups, enemies, boss cars, player bike.
 *    - VFXLayer: projectiles, flames, beams, anime speed lines, Ki aura, shockwaves.
 *    - HUDLayer: floating combat text ('CRIT!', damage numbers), HP bars.
 * 3. Screen shake translation with smooth linear decay.
 * 4. Integration with FilterManager (Bloom, Glow, Impact Flash).
 *
 * Parity reference: moto-rogue/index.html L2845-L3274
 */

import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  WALL_THICKNESS,
  PlayerState,
  Room,
  Dungeon,
  Direction,
  Particle,
  BeamEffect,
  DamageNumber,
  PlayerBullet,
  EnemyBullet,
  Grenade,
  EnemyBomb
} from '../types/game';

import {
  drawMotorcycle,
  drawEnemy,
  drawObstacle,
  drawPickup,
  drawDoor,
  drawTrapdoor,
  parseColor
} from './vectorArt';

import { VFXManager } from './vfx';
import { FilterManager } from './shaders';
import { WEAPONS } from '../data/weapons';

/**
 * Maps dungeon floor number (1..6+) to atmospheric ambient mote theme color:
 * Floor 1: Warm rust/amber dust motes (0xff9f1c)
 * Floor 2: Rising smelter orange embers (0xff5400)
 * Floor 3: Neon cyan cyber-streaks (0x00f5d4)
 * Floor 4: Crisp icy cryo crystals (0x72efdd)
 * Floor 5: Crimson magma sparks (0xff2a4b)
 * Floor 6+: Golden Valhalla stars/motes (0xffd60a)
 */
export function getFloorMoteColor(floorNum: number): number {
  if (floorNum <= 1) return 0xff9f1c;
  if (floorNum === 2) return 0xff5400;
  if (floorNum === 3) return 0x00f5d4;
  if (floorNum === 4) return 0x72efdd;
  if (floorNum === 5) return 0xff2a4b;
  return 0xffd60a; // Floor 6+
}

/**
 * Maps elite enemy affix name to outer halo ring color:
 * - 'volatile': 0xff9f1c (fiery amber-orange)
 * - 'overclocked': 0x00f5d4 (electric cyan)
 * - 'vampiric': 0xff1f4b (crimson siphon)
 * - default: 0xffd60a (gold)
 */
export function getEliteAffixColor(affix?: string): number {
  if (affix === 'volatile') return 0xff9f1c;
  if (affix === 'overclocked') return 0x00f5d4;
  if (affix === 'vampiric') return 0xff1f4b;
  return 0xffd60a;
}

export class StageManager {
  public app: Application;
  public vfx: VFXManager;
  public filterManager: FilterManager;

  // Layer hierarchy containers
  public floorLayer: Container;
  public skidLayer: Container;
  public shadowLayer: Container;
  public entityLayer: Container;
  public vfxLayer: Container;
  public hudLayer: Container;

  // Graphics buffers per layer
  private floorGraphics: Graphics;
  private skidGraphics: Graphics;
  private shadowGraphics: Graphics;
  private entityGraphics: Graphics;
  private vfxGraphics: Graphics;
  private hudGraphics: Graphics;
  private floatingTextContainer: Container;
  private priceTextContainer: Container;

  private isInitialized: boolean = false;

  constructor() {
    this.app = new Application();
    this.vfx = new VFXManager();
    this.filterManager = new FilterManager();

    this.floorLayer = new Container();
    this.skidLayer = new Container();
    this.shadowLayer = new Container();
    this.entityLayer = new Container();
    this.vfxLayer = new Container();
    this.hudLayer = new Container();

    this.floorGraphics = new Graphics();
    this.skidGraphics = new Graphics();
    this.shadowGraphics = new Graphics();
    this.entityGraphics = new Graphics();
    this.vfxGraphics = new Graphics();
    this.hudGraphics = new Graphics();
    this.floatingTextContainer = new Container();
    this.priceTextContainer = new Container();
  }

  /**
   * Initializes PixiJS v8 Application and wires stage hierarchy.
   */
  public async init(targetCanvas?: HTMLCanvasElement): Promise<void> {
    if (this.isInitialized) return;

    const resolution = (typeof window !== 'undefined' && window.devicePixelRatio) ? Math.min(3, window.devicePixelRatio) : 1;

    await this.app.init({
      width: ARENA_WIDTH,
      height: ARENA_HEIGHT,
      resolution,
      autoDensity: true,
      antialias: true,
      canvas: targetCanvas,
      backgroundColor: 0x0e0f16
    });

    // Build ordered scene graph
    this.floorLayer.addChild(this.floorGraphics);
    this.skidLayer.addChild(this.skidGraphics);
    this.shadowLayer.addChild(this.shadowGraphics);
    this.entityLayer.addChild(this.entityGraphics);
    this.vfxLayer.addChild(this.vfxGraphics);
    this.hudLayer.addChild(this.hudGraphics);
    this.hudLayer.addChild(this.priceTextContainer);
    this.hudLayer.addChild(this.floatingTextContainer);

    this.app.stage.addChild(this.floorLayer);
    this.app.stage.addChild(this.skidLayer);
    this.app.stage.addChild(this.shadowLayer);
    this.app.stage.addChild(this.entityLayer);
    this.app.stage.addChild(this.vfxLayer);
    this.app.stage.addChild(this.hudLayer);

    // Post-processing: keep stage filters empty to maintain 60 FPS without GPU blur bottleneck
    this.app.stage.filters = [];

    this.isInitialized = true;
  }

  /**
   * Updates VFX and shader filter timers.
   */
  public update(dt: number): void {
    this.vfx.update(dt);
    this.filterManager.update(dt);

    const filters = this.filterManager.getFilters();
    if (filters.length > 0) {
      this.app.stage.filters = filters;
    } else if (this.app.stage.filters && this.app.stage.filters.length > 0) {
      this.app.stage.filters = [];
    }
  }

  /**
   * Renders the complete game scene for the active frame.
   */
  public render(
    player: PlayerState,
    room: Room,
    dungeon: Dungeon,
    floorNum: number,
    bullets: PlayerBullet[],
    enemyBullets: EnemyBullet[],
    grenades: Grenade[],
    enemyBombs: EnemyBomb[],
    particles: Particle[],
    beamEffects: BeamEffect[],
    damageNumbers: DamageNumber[],
    screenShake: number = 0,
    timestampMs: number = performance.now()
  ): void {
    if (!this.isInitialized) return;

    // Apply screen shake to stage
    if (screenShake > 0) {
      this.app.stage.position.set(
        (Math.random() - 0.5) * screenShake,
        (Math.random() - 0.5) * screenShake
      );
    } else {
      this.app.stage.position.set(0, 0);
    }

    // Clear graphics buffers
    this.floorGraphics.clear();
    this.skidGraphics.clear();
    this.shadowGraphics.clear();
    this.entityGraphics.clear();
    this.vfxGraphics.clear();
    this.hudGraphics.clear();

    // 1. FLOOR LAYER
    this.renderFloor(this.floorGraphics, room, floorNum, timestampMs);

    // 2. SKID LAYER
    this.renderSkids(this.skidGraphics, room);

    // 3. SHADOW LAYER
    this.renderShadows(this.shadowGraphics, player, room);

    // 4. ENTITY LAYER
    this.renderEntities(this.entityGraphics, player, room, dungeon, timestampMs);

    // 5. VFX LAYER
    this.renderVFX(
      this.vfxGraphics,
      player,
      room,
      bullets,
      enemyBullets,
      grenades,
      enemyBombs,
      particles,
      beamEffects,
      timestampMs
    );

    // 6. HUD LAYER
    this.renderHUD(this.hudGraphics, player, room, damageNumbers, timestampMs);
  }

  public renderFloor(g: Graphics, room: Room, floorNum: number, timestampMs: number): void {
    const W = ARENA_WIDTH;
    const H = ARENA_HEIGHT;
    const WALL = WALL_THICKNESS;

    // 1. Outer deep bunker hull abyss
    g.rect(0, 0, W, H).fill({ color: 0x090a10 });

    // 2. Floor Biome palettes based on floorNum (1..6)
    const biomeIdx = ((Math.max(1, floorNum) - 1) % 6) + 1;
    const biomePalettes: Record<number, { floor: number; plateHi: number; plateLo: number; wall: number; accent: number }> = {
      1: { floor: 0x25232b, plateHi: 0x312e39, plateLo: 0x19181f, wall: 0x2c2836, accent: 0xff6b2b },
      2: { floor: 0x2b1d19, plateHi: 0x382620, plateLo: 0x1c120f, wall: 0x36211c, accent: 0xff9f1c },
      3: { floor: 0x151829, plateHi: 0x1e233a, plateLo: 0x0e101c, wall: 0x1d2238, accent: 0x00f5d4 },
      4: { floor: 0x192533, plateHi: 0x233446, plateLo: 0x111924, wall: 0x203040, accent: 0x72efdd },
      5: { floor: 0x261419, plateHi: 0x361c23, plateLo: 0x180c10, wall: 0x30171d, accent: 0xff2a55 },
      6: { floor: 0x22202b, plateHi: 0x302d3d, plateLo: 0x16151d, wall: 0x2b2838, accent: 0xffd60a }
    };

    let palette = { ...(biomePalettes[biomeIdx] || biomePalettes[1]) };

    if (room.type === 'hub') {
      palette = { floor: 0x161a26, plateHi: 0x20273a, plateLo: 0x10131d, wall: 0x242a3d, accent: 0x2ee6ff };
    } else {
      if (room.type === 'treasure') {
        palette.accent = 0xffd60a;
      } else if (room.type === 'shop') {
        palette.accent = 0x00f59b;
      } else if (room.type === 'boss') {
        palette.accent = 0xff1744;
      }
    }

    const innerW = W - WALL * 2;
    const innerH = H - WALL * 2;

    g.rect(WALL, WALL, innerW, innerH).fill({ color: palette.floor });

    // 3. 2.5D Beveled Industrial Steel Floor Deck Plates (8x8 heavy armored slabs)
    const cols = 8;
    const tile = innerW / cols;
    for (let r = 0; r < cols; r++) {
      for (let c = 0; c < cols; c++) {
        const tx = WALL + c * tile;
        const ty = WALL + r * tile;
        const checker = (r + c) % 2 === 0;

        // Subtle alternating plate tone
        g.rect(tx + 2, ty + 2, tile - 4, tile - 4)
          .fill({ color: checker ? palette.plateHi : palette.plateLo, alpha: checker ? 0.42 : 0.25 });

        // Top & Left 3D cel-shaded specular bevel
        g.moveTo(tx + 2, ty + tile - 2)
          .lineTo(tx + 2, ty + 2)
          .lineTo(tx + tile - 2, ty + 2)
          .stroke({ color: 0xffffff, width: 1.5, alpha: 0.09 });

        // Bottom & Right 3D recessed shadow bevel
        g.moveTo(tx + 2, ty + tile - 2)
          .lineTo(tx + tile - 2, ty + tile - 2)
          .lineTo(tx + tile - 2, ty + 2)
          .stroke({ color: 0x050508, width: 2, alpha: 0.55 });

        // Corner bolt rivets on each steel slab
        const inset = 6;
        g.circle(tx + inset, ty + inset, 1.3).fill({ color: 0x0d0e14, alpha: 0.7 });
        g.circle(tx + tile - inset, ty + inset, 1.3).fill({ color: 0x0d0e14, alpha: 0.7 });
        g.circle(tx + inset, ty + tile - inset, 1.3).fill({ color: 0x0d0e14, alpha: 0.7 });
        g.circle(tx + tile - inset, ty + tile - inset, 1.3).fill({ color: 0x0d0e14, alpha: 0.7 });
      }
    }

    // Deep recessed expansion seams between steel floor slabs
    for (let i = 0; i <= cols; i++) {
      const p = WALL + i * tile;
      g.moveTo(p, WALL).lineTo(p, H - WALL).stroke({ color: 0x0a0b10, width: 2.5, alpha: 0.75 });
      g.moveTo(WALL, p).lineTo(W - WALL, p).stroke({ color: 0x0a0b10, width: 2.5, alpha: 0.75 });
    }

    // 4. Sub-floor 3D Recessed Ventilation Grates (4 symmetrical bays)
    const gratePositions = [
      [WALL + tile * 1.2, WALL + tile * 1.2],
      [W - WALL - tile * 2.2, WALL + tile * 1.2],
      [WALL + tile * 1.2, H - WALL - tile * 2.2],
      [W - WALL - tile * 2.2, H - WALL - tile * 2.2]
    ];
    for (const [gx, gy] of gratePositions) {
      const gw = tile * 0.95;
      const gh = tile * 0.65;
      // Sub-floor dark pit depth
      g.rect(gx, gy, gw, gh)
        .fill({ color: 0x08090f })
        .stroke({ color: 0x0a0b10, width: 2.5 });
      // Inner top wall lip inside pit (2.5D depth)
      g.rect(gx + 2, gy + 2, gw - 4, 6)
        .fill({ color: 0x151722 });
      // Steel grate bars
      for (let bx = gx + 8; bx < gx + gw - 4; bx += 8) {
        g.moveTo(bx, gy + 2).lineTo(bx, gy + gh - 2).stroke({ color: 0x2f3242, width: 2 });
      }
      // Beveled outer hazard trim
      g.rect(gx - 2, gy - 2, gw + 4, gh + 4)
        .stroke({ color: 0x3d3a4b, width: 1.5, alpha: 0.65 });
    }

    // 5. Central Tactical Arena Octagon & Isometric Panel Lines / Hub Sanctuary Decal
    const cx = W / 2;
    const cy = H / 2;

    if ((room.type as string) === 'hub') {
      // Safe Sanctuary Outlaw Skull / Gear Floor Decal
      this.renderHubSanctuaryDecal(g, cx, cy, timestampMs);
    } else {
      const octR = 118;
      const octPts: number[] = [];
      for (let i = 0; i < 8; i++) {
        const ang = (i * Math.PI) / 4 + Math.PI / 8;
        octPts.push(cx + Math.cos(ang) * octR, cy + Math.sin(ang) * octR);
      }
      g.poly(octPts)
        .fill({ color: 0x16151d, alpha: 0.45 })
        .stroke({ color: 0x0a0b10, width: 3, alpha: 0.7 });
      const statusRingColor = room.cleared ? 0x00f5d4 : 0xff9f1c;
      const statusRingAlpha = room.cleared ? 0.34 : 0.24 + 0.12 * Math.sin(timestampMs / 180);
      g.circle(cx, cy, 82)
        .stroke({ color: statusRingColor, width: 2.2, alpha: statusRingAlpha });
      g.circle(cx, cy, 32)
        .stroke({ color: palette.accent, width: 1.5, alpha: 0.25 });
      // Diagonal structural floor seams
      g.moveTo(cx - 65, cy - 65).lineTo(cx - 28, cy - 28).stroke({ color: palette.accent, width: 2, alpha: 0.25 });
      g.moveTo(cx + 65, cy - 65).lineTo(cx + 28, cy - 28).stroke({ color: palette.accent, width: 2, alpha: 0.25 });
      g.moveTo(cx - 65, cy + 65).lineTo(cx - 28, cy + 28).stroke({ color: palette.accent, width: 2, alpha: 0.25 });
      g.moveTo(cx + 65, cy + 65).lineTo(cx + 28, cy + 28).stroke({ color: palette.accent, width: 2, alpha: 0.25 });
    }

    // 5b. Biome Surface Hazard Zones (oil_slick, lava_vent, boost_strip, ice_patch)
    const zones = (room as any).biomeZones as any[] | undefined;
    if (Array.isArray(zones)) {
      for (const z of zones) {
        if (!z) continue;
        if (z.type === 'oil_slick') {
          // dark glossy puddle with inner iridescent ring
          g.circle(z.x, z.y, z.radius)
            .fill({ color: 0x0b0c12, alpha: 0.85 })
            .stroke({ color: 0x72efdd, width: 2, alpha: 0.45 });
          g.circle(z.x, z.y, z.radius * 0.65)
            .stroke({ color: 0xffbe0b, width: 2, alpha: 0.3 });
        } else if (z.type === 'lava_vent') {
          // glowing molten grate circle and pulsing magma core
          g.circle(z.x, z.y, z.radius)
            .fill({ color: 0x2b0905, alpha: 0.9 })
            .stroke({ color: 0xff5400, width: 3, alpha: 0.85 });
          const corePulse = z.radius * (0.55 + 0.1 * Math.sin(timestampMs / 150));
          g.circle(z.x, z.y, corePulse)
            .fill({ color: 0xffbe0b, alpha: 0.65 });
        } else if (z.type === 'boost_strip') {
          // glowing neon speed pad with 3 animated cyan/gold chevrons (>>>) inside
          const padW = z.radius * 2;
          const padH = z.radius * 1.1;
          g.roundRect(z.x - z.radius, z.y - z.radius * 0.55, padW, padH, 8)
            .fill({ color: 0x0d1b2a, alpha: 0.85 })
            .stroke({ color: 0x00f5d4, width: 2.5, alpha: 0.9 });

          // Extra inner glowing cyan-gold speed chevron ring
          g.circle(z.x, z.y, z.radius * 0.55)
            .stroke({ color: 0xffffff, width: 2, alpha: 0.75 });

          const chevSpacing = padW / 4;
          for (let c = -1; c <= 1; c++) {
            const chX = z.x + c * chevSpacing;
            const chevPulse = Math.sin(timestampMs * 0.008 + c * 1.2);
            const chevColor = chevPulse > 0 ? 0x00f5d4 : 0xffd60a;
            const chevAlpha = 0.7 + Math.abs(chevPulse) * 0.3;
            const chevH = padH * 0.3;
            const chevW = chevSpacing * 0.45;
            g.moveTo(chX - chevW, z.y - chevH)
              .lineTo(chX + chevW * 0.5, z.y)
              .lineTo(chX - chevW, z.y + chevH)
              .stroke({ color: chevColor, width: 2.5, alpha: chevAlpha });
          }
        } else if (z.type === 'ice_patch') {
          // translucent crystalline ice sheet with crisp white diagonal frost lines
          g.circle(z.x, z.y, z.radius)
            .fill({ color: 0x90e0ef, alpha: 0.28 })
            .stroke({ color: 0x72efdd, width: 2, alpha: 0.7 });

          // Inner crystalline specular ring
          g.circle(z.x, z.y, z.radius * 0.6)
            .stroke({ color: 0xffffff, width: 1.5, alpha: 0.65 });

          const rIce = z.radius * 0.68;
          g.moveTo(z.x - rIce, z.y - rIce * 0.4)
            .lineTo(z.x + rIce * 0.8, z.y + rIce * 0.3)
            .stroke({ color: 0xffffff, width: 1.5, alpha: 0.65 });
          g.moveTo(z.x - rIce * 0.5, z.y + rIce * 0.5)
            .lineTo(z.x + rIce * 0.5, z.y - rIce * 0.5)
            .stroke({ color: 0xffffff, width: 1.2, alpha: 0.5 });
        }
      }
    }

    // 6. 2.5D Perspective Bunker Walls (North, West, East, South)
    const parapet = 12;

    // --- NORTH WALL (Top): Shows parapet roof + angled 3D vertical wall face + floor cast shadow ---
    // Floor cast shadow from North wall
    g.rect(WALL, WALL, innerW, 24)
      .fill({ color: 0x05050a, alpha: 0.52 });
    g.rect(WALL, WALL + 24, innerW, 14)
      .fill({ color: 0x05050a, alpha: 0.22 });

    // 3D Vertical North wall face (y: parapet .. WALL)
    g.rect(parapet, parapet, W - parapet * 2, WALL - parapet)
      .fill({ color: palette.wall })
      .stroke({ color: 0x0a0b10, width: 2.5 });

    // North wall lower hazard skirting strip
    g.rect(WALL, WALL - 5, innerW, 5)
      .fill({ color: 0x14131a });
    for (let hx = WALL + 8; hx < W - WALL - 16; hx += 24) {
      if (Math.abs(hx - cx) < 56) continue; // skip doorway
      g.poly([hx, WALL - 5, hx + 10, WALL - 5, hx + 6, WALL, hx - 4, WALL])
        .fill({ color: 0xffae00, alpha: 0.65 });
    }

    // Extruded 3D Steel I-Beam Buttress Columns along North Wall
    const northPillars = [96, 176, 256, 464, 544, 624];
    for (const px of northPillars) {
      // Column shadow
      g.rect(px + 5, parapet, 8, WALL - parapet + 8)
        .fill({ color: 0x07070c, alpha: 0.55 });
      // 3D Column front face
      g.rect(px - 6, parapet - 2, 12, WALL - parapet + 4)
        .fill({ color: 0x3d384a })
        .stroke({ color: 0x0a0b10, width: 2 });
      // Column specular edge
      g.rect(px - 4, parapet, 3, WALL - parapet)
        .fill({ color: 0x5c556e });
    }

    // Glowing Industrial Bunker Sconces on North Wall casting warm light pools onto floor
    const sconceXs = [136, 216, 504, 584];
    for (const sx of sconceXs) {
      // Floor light cone
      g.poly([sx - 6, WALL, sx + 6, WALL, sx + 26, WALL + 42, sx - 26, WALL + 42])
        .fill({ color: palette.accent, alpha: 0.11 });
      // Sconce fixture
      g.rect(sx - 7, parapet + 6, 14, 6)
        .fill({ color: palette.accent })
        .stroke({ color: 0x0a0b10, width: 1.5 });
    }

    // --- WEST WALL (Left): 3D Perspective Sloped Wall Face ---
    g.rect(WALL, WALL, 16, innerH)
      .fill({ color: 0x05050a, alpha: 0.42 });
    g.poly([parapet, parapet, WALL, WALL, WALL, H - WALL, parapet, H - parapet])
      .fill({ color: 0x25222e })
      .stroke({ color: 0x0a0b10, width: 2.5 });
    for (const py of northPillars) {
      g.poly([parapet, py - 5, WALL, py - 3, WALL, py + 7, parapet, py + 5])
        .fill({ color: 0x3a3548 })
        .stroke({ color: 0x0a0b10, width: 1.8 });
    }

    // --- EAST WALL (Right): 3D Perspective Sloped Wall Face ---
    g.rect(W - WALL - 16, WALL, 16, innerH)
      .fill({ color: 0x05050a, alpha: 0.42 });
    g.poly([W - parapet, parapet, W - WALL, WALL, W - WALL, H - WALL, W - parapet, H - parapet])
      .fill({ color: 0x1f1c27 })
      .stroke({ color: 0x0a0b10, width: 2.5 });
    for (const py of northPillars) {
      g.poly([W - parapet, py - 5, W - WALL, py - 3, W - WALL, py + 7, W - parapet, py + 5])
        .fill({ color: 0x342f42 })
        .stroke({ color: 0x0a0b10, width: 1.8 });
    }

    // --- SOUTH WALL (Bottom): Foreground Cutaway Parapet Ledge ---
    g.poly([parapet, H - parapet, WALL, H - WALL, W - WALL, H - WALL, W - parapet, H - parapet])
      .fill({ color: 0x332e40 })
      .stroke({ color: 0x0a0b10, width: 2.5 });
    // Bright top rim along inner South wall edge
    g.moveTo(WALL, H - WALL + 1.5)
      .lineTo(W - WALL, H - WALL + 1.5)
      .stroke({ color: 0x625a78, width: 2 });

    // --- Outer Parapet Top Frame & 4 Reinforced 3D Corner Bastions ---
    const corners = [
      [0, 0],
      [W - WALL, 0],
      [0, H - WALL],
      [W - WALL, H - WALL]
    ];
    for (const [bx, by] of corners) {
      g.rect(bx + 2, by + 2, WALL - 4, WALL - 4)
        .fill({ color: 0x2e2a3b })
        .stroke({ color: 0x0a0b10, width: 3 });
      g.rect(bx + 7, by + 7, WALL - 14, WALL - 14)
        .fill({ color: 0x1a1823 })
        .stroke({ color: palette.accent, width: 1.5, alpha: 0.75 });
      g.circle(bx + WALL / 2, by + WALL / 2, 4.5)
        .fill({ color: palette.accent, alpha: 0.85 });
    }

    // Doorway threshold light cones & guiding floor chevrons
    const doorLightColor = room.cleared ? 0x00f5d4 : 0xff1744;
    const doorLightAlpha = room.cleared ? 0.14 : 0.18;
    if (room.doors?.N) {
      g.poly([cx - 38, WALL, cx + 38, WALL, cx + 68, WALL + 58, cx - 68, WALL + 58])
        .fill({ color: doorLightColor, alpha: doorLightAlpha });
    }
    if (room.doors?.S) {
      g.poly([cx - 38, H - WALL, cx + 38, H - WALL, cx + 68, H - WALL - 58, cx - 68, H - WALL - 58])
        .fill({ color: doorLightColor, alpha: doorLightAlpha });
    }
    if (room.doors?.W) {
      g.poly([WALL, cy - 38, WALL, cy + 38, WALL + 58, cy + 68, WALL + 58, cy - 68])
        .fill({ color: doorLightColor, alpha: doorLightAlpha });
    }
    if (room.doors?.E) {
      g.poly([W - WALL, cy - 38, W - WALL, cy + 38, W - WALL - 58, cy + 68, W - WALL - 58, cy - 68])
        .fill({ color: doorLightColor, alpha: doorLightAlpha });
    }

    // Crisp inner arena 3D bounding contour
    g.rect(WALL, WALL, innerW, innerH)
      .stroke({ color: 0x0a0b10, width: 3.5 });

    // Trapdoor in cleared Boss Room
    if (room.trapdoor) {
      drawTrapdoor(g, timestampMs);
    }

    // 7. Per-Floor Atmospheric Ambient Motes (10 deterministic drifting motes)
    this.renderAmbientMotes(g, floorNum, timestampMs);
  }

  /**
   * Renders the safe sanctuary Outlaw Skull & Gear emblem in the center of the Home Base hub,
   * flanked by 5 architectural station bays with distinct 2.5D depth, props, and ambient lighting.
   */
  private renderHubSanctuaryDecal(g: Graphics, cx: number, cy: number, timestampMs: number): void {
    // 0. Recessed Architectural Station Bays around the 5 Sanctuary destinations
    // 0a. Top-Left (185, 215) — GARAGE & ARMORY BAY (0xffd60a)
    g.roundRect(185 - 68, 215 - 48, 136, 96, 10)
      .fill({ color: 0x10131d, alpha: 0.95 })
      .stroke({ color: 0xffd60a, width: 2, alpha: 0.85 });
    g.rect(185 - 66, 215 - 46, 132, 10)
      .fill({ color: 0x07080d, alpha: 0.85 });
    // Hydraulic lift rails
    g.rect(185 - 34, 215 - 38, 8, 76)
      .fill({ color: 0x242836 })
      .stroke({ color: 0x0a0b10, width: 1.5 });
    g.rect(185 + 26, 215 - 38, 8, 76)
      .fill({ color: 0x242836 })
      .stroke({ color: 0x0a0b10, width: 1.5 });
    g.moveTo(185 - 34, 215 - 18).lineTo(185 + 34, 215 - 18).stroke({ color: 0x181c28, width: 2.5 });
    g.moveTo(185 - 34, 215 + 18).lineTo(185 + 34, 215 + 18).stroke({ color: 0x181c28, width: 2.5 });
    // Red mechanic tool cabinet
    g.rect(185 - 60, 215 - 32, 14, 44)
      .fill({ color: 0xe5203a })
      .stroke({ color: 0x0a0b10, width: 1.5 });
    for (let dy = 215 - 26; dy <= 215 + 6; dy += 8) {
      g.moveTo(185 - 58, dy).lineTo(185 - 48, dy).stroke({ color: 0x0a0b10, width: 1 });
      g.moveTo(185 - 55, dy + 2).lineTo(185 - 51, dy + 2).stroke({ color: 0xdde2eb, width: 1.2 });
    }
    // Warm golden ambient spotlight
    g.circle(185, 215, 58).fill({ color: 0xffd60a, alpha: 0.08 });

    // 0b. Top-Right (535, 215) — THE SCRAP FORGE (0x2ee6ff / 0xff5400)
    g.roundRect(535 - 68, 215 - 48, 136, 96, 10)
      .fill({ color: 0x141118, alpha: 0.95 })
      .stroke({ color: 0x2ee6ff, width: 2, alpha: 0.85 });
    g.rect(535 - 66, 215 - 46, 132, 10)
      .fill({ color: 0x07080d, alpha: 0.85 });
    // Glowing molten hearth trough + inner core
    g.roundRect(535 + 38, 215 - 28, 20, 52, 4)
      .fill({ color: 0xff5400 })
      .stroke({ color: 0x0a0b10, width: 1.5 });
    g.roundRect(535 + 42, 215 - 22, 12, 40, 2)
      .fill({ color: 0xffd60a });
    g.moveTo(535 + 44, 215 - 4).lineTo(535 + 52, 215 - 4).stroke({ color: 0xffffff, width: 1.5, alpha: 0.75 });
    // Heavy iron anvil prop on left
    g.rect(535 - 58, 215 - 20, 16, 16)
      .fill({ color: 0x2e2c39 })
      .stroke({ color: 0x0a0b10, width: 1.5 });
    g.moveTo(535 - 60, 215 - 20).lineTo(535 - 40, 215 - 20).stroke({ color: 0x484558, width: 3 });
    // Warm forge ambient glow
    const forgePulse = 0.09 + 0.02 * Math.sin(timestampMs / 90);
    g.circle(535, 215, 58).fill({ color: 0xff5400, alpha: forgePulse });

    // 0c. Top-Center (360, 155) — INTEL & SCANNER LAB (0x9d4edd / 0x00f5d4)
    g.roundRect(360 - 74, 155 - 44, 148, 88, 10)
      .fill({ color: 0x111526, alpha: 0.95 })
      .stroke({ color: 0x9d4edd, width: 2, alpha: 0.85 });
    g.rect(360 - 72, 155 - 42, 144, 10)
      .fill({ color: 0x07080d, alpha: 0.85 });
    // Horizontal & vertical cyan grid lines
    for (let gy = 155 - 28; gy <= 155 + 32; gy += 15) {
      g.moveTo(360 - 66, gy).lineTo(360 + 66, gy).stroke({ color: 0x00f5d4, width: 1, alpha: 0.18 });
    }
    for (let gx = 360 - 60; gx <= 360 + 60; gx += 20) {
      g.moveTo(gx, 155 - 36).lineTo(gx, 155 + 36).stroke({ color: 0x00f5d4, width: 1, alpha: 0.18 });
    }
    // Terminal monitors
    g.rect(360 - 64, 155 - 24, 14, 20).fill({ color: 0x1a2138 }).stroke({ color: 0x00f5d4, width: 1.2, alpha: 0.7 });
    g.rect(360 - 62, 155 - 22, 10, 16).fill({ color: 0x00f5d4, alpha: 0.4 });
    g.rect(360 + 50, 155 - 24, 14, 20).fill({ color: 0x1a2138 }).stroke({ color: 0x9d4edd, width: 1.2, alpha: 0.7 });
    g.rect(360 + 52, 155 - 22, 10, 16).fill({ color: 0x9d4edd, alpha: 0.45 });
    // Cyan ambient glow
    g.circle(360, 155, 56).fill({ color: 0x00f5d4, alpha: 0.08 });

    // 0d. Bottom-Left (185, 505) — OUTLAW WAR ROOM & BOUNTIES (0x06d6a0)
    g.roundRect(185 - 68, 505 - 48, 136, 96, 10)
      .fill({ color: 0x0f1c1a, alpha: 0.95 })
      .stroke({ color: 0x06d6a0, width: 2, alpha: 0.85 });
    g.rect(185 - 66, 505 - 46, 132, 10)
      .fill({ color: 0x07080d, alpha: 0.85 });
    // Tactical corner brackets
    const bL = 185 - 64;
    const bR = 185 + 64;
    const bT = 505 - 44;
    const bB = 505 + 44;
    const bk = 10;
    g.moveTo(bL, bT + bk).lineTo(bL, bT).lineTo(bL + bk, bT).stroke({ color: 0x06d6a0, width: 2, alpha: 0.85 });
    g.moveTo(bR - bk, bT).lineTo(bR, bT).lineTo(bR, bT + bk).stroke({ color: 0x06d6a0, width: 2, alpha: 0.85 });
    g.moveTo(bL, bB - bk).lineTo(bL, bB).lineTo(bL + bk, bB).stroke({ color: 0x06d6a0, width: 2, alpha: 0.85 });
    g.moveTo(bR - bk, bB).lineTo(bR, bB).lineTo(bR, bB - bk).stroke({ color: 0x06d6a0, width: 2, alpha: 0.85 });
    // Ammo crate props
    g.rect(185 - 58, 505 - 30, 16, 22).fill({ color: 0x2b3a30 }).stroke({ color: 0x0a0b10, width: 1.5 });
    g.moveTo(185 - 58, 505 - 30).lineTo(185 - 42, 505 - 8).stroke({ color: 0x19241e, width: 1.5 });
    g.moveTo(185 - 58, 505 - 8).lineTo(185 - 42, 505 - 30).stroke({ color: 0x19241e, width: 1.5 });
    g.rect(185 - 54, 505 - 2, 14, 16).fill({ color: 0x36483c }).stroke({ color: 0x0a0b10, width: 1.2 });
    // Emerald ambient glow
    g.circle(185, 505, 58).fill({ color: 0x06d6a0, alpha: 0.08 });

    // 0e. Bottom-Right (535, 505) — SECTOR 1 HIGHWAY LAUNCH GATE (0xe5203a / 0xffd60a)
    g.roundRect(535 - 72, 505 - 48, 144, 96, 10)
      .fill({ color: 0x121218, alpha: 0.95 })
      .stroke({ color: 0xe5203a, width: 2, alpha: 0.85 });
    g.rect(535 - 70, 505 - 46, 140, 10)
      .fill({ color: 0x07080d, alpha: 0.85 });
    // Yellow dashed road centerline
    for (let dx = 535 - 56; dx <= 535 + 46; dx += 20) {
      g.moveTo(dx, 505).lineTo(dx + 11, 505).stroke({ color: 0xffd60a, width: 3, alpha: 0.85 });
    }
    // Animated crimson/gold launch chevrons (>>>)
    const chPhase = Math.floor(timestampMs / 220) % 3;
    const chevX = [535 - 24, 535, 535 + 24];
    for (let i = 0; i < 3; i++) {
      const isLit = i === chPhase;
      const chevCol = isLit ? 0xffd60a : 0xe5203a;
      const chevAlpha = isLit ? 0.95 : 0.45;
      const cx0 = chevX[i];
      g.moveTo(cx0 - 6, 505 - 14)
        .lineTo(cx0 + 6, 505)
        .lineTo(cx0 - 6, 505 + 14)
        .stroke({ color: chevCol, width: 3, alpha: chevAlpha });
    }
    // Crimson/gold ambient spotlight
    g.circle(535, 505, 58).fill({ color: 0xe5203a, alpha: 0.08 });

    // 1. Glowing power tracks radiating out to all 5 NPC stations
    const stations = [
      [185, 215],
      [535, 215],
      [360, 155],
      [185, 505],
      [535, 505]
    ];
    for (const [stX, stY] of stations) {
      g.moveTo(cx, cy)
        .lineTo(stX, stY)
        .stroke({ color: 0x0a0b10, width: 6 });
      g.moveTo(cx, cy)
        .lineTo(stX, stY)
        .stroke({ color: 0x2ee6ff, width: 2.2, alpha: 0.45 });
      // Golden dashed chevrons moving outward
      const pulsePhase = (timestampMs / 600) % 1;
      const interX = cx + (stX - cx) * (0.35 + pulsePhase * 0.4);
      const interY = cy + (stY - cy) * (0.35 + pulsePhase * 0.4);
      g.circle(interX, interY, 3.5).fill({ color: 0xffd60a, alpha: 0.85 });
    }

    // 1b. Tactical Firing Range Target Bay at (360, 545)
    const bayX = 360;
    const bayY = 545;
    const bayW = 92;
    const bayH = 64;
    g.roundRect(bayX - 46, bayY - 32, bayW, bayH, 8)
      .fill({ color: 0x12151f, alpha: 0.85 })
      .stroke({ color: 0xffd60a, width: 2, alpha: 0.65 });

    // Corner crosshair ticks & firing-range markings
    const tickLen = 8;
    const left = bayX - 46;
    const right = bayX + 46;
    const top = bayY - 32;
    const bot = bayY + 32;

    g.moveTo(left, top + tickLen).lineTo(left, top).lineTo(left + tickLen, top).stroke({ color: 0xffd60a, width: 2, alpha: 0.85 });
    g.moveTo(right - tickLen, top).lineTo(right, top).lineTo(right, top + tickLen).stroke({ color: 0xffd60a, width: 2, alpha: 0.85 });
    g.moveTo(left, bot - tickLen).lineTo(left, bot).lineTo(left + tickLen, bot).stroke({ color: 0xffd60a, width: 2, alpha: 0.85 });
    g.moveTo(right - tickLen, bot).lineTo(right, bot).lineTo(right, bot - tickLen).stroke({ color: 0xffd60a, width: 2, alpha: 0.85 });

    // Center crosshair markings
    g.moveTo(bayX - 12, bayY).lineTo(bayX + 12, bayY).stroke({ color: 0xffd60a, width: 1.5, alpha: 0.4 });
    g.moveTo(bayX, bayY - 12).lineTo(bayX, bayY + 12).stroke({ color: 0xffd60a, width: 1.5, alpha: 0.4 });

    // 2. Large Outer Heavy Industrial Sanctuary Gear (radius ~74 with 12 teeth)
    const gearInnerR = 64;
    const gearOuterR = 76;
    const teeth = 12;
    const gearPts: number[] = [];
    const spin = timestampMs * 0.0003;
    for (let i = 0; i < teeth; i++) {
      const a1 = spin + (i * Math.PI * 2) / teeth;
      const a2 = a1 + (Math.PI / teeth) * 0.45;
      const a3 = a1 + (Math.PI / teeth) * 0.7;
      const a4 = a1 + (Math.PI * 2) / teeth;
      gearPts.push(
        cx + Math.cos(a1) * gearOuterR, cy + Math.sin(a1) * gearOuterR,
        cx + Math.cos(a2) * gearOuterR, cy + Math.sin(a2) * gearOuterR,
        cx + Math.cos(a3) * gearInnerR, cy + Math.sin(a3) * gearInnerR,
        cx + Math.cos(a4) * gearInnerR, cy + Math.sin(a4) * gearInnerR
      );
    }
    // Gear drop shadow
    g.poly(gearPts.map((v, idx) => (idx % 2 === 1 ? v + 4 : v)))
      .fill({ color: 0x07080d, alpha: 0.85 });
    // Gear fill and bold black comic outline
    g.poly(gearPts)
      .fill({ color: 0x141824 })
      .stroke({ color: 0x0a0b10, width: 4 });

    // Concentric glowing gold & cyan sanctuary rings
    g.circle(cx, cy, 58)
      .stroke({ color: 0xffd60a, width: 2.5 });
    g.circle(cx, cy, 53)
      .stroke({ color: 0x2ee6ff, width: 1.8, alpha: 0.8 });
    g.circle(cx, cy, 46)
      .fill({ color: 0x1a2130 })
      .stroke({ color: 0x0a0b10, width: 2.5 });

    // 3. Crossed Heavy Chrome & Gold Wrenches behind the Skull
    const wrenchLen = 42;
    for (const sign of [-1, 1]) {
      const wAngle = (Math.PI / 4) * sign;
      const cosW = Math.cos(wAngle);
      const sinW = Math.sin(wAngle);
      const x1 = cx - cosW * wrenchLen;
      const y1 = cy - sinW * wrenchLen;
      const x2 = cx + cosW * wrenchLen;
      const y2 = cy + sinW * wrenchLen;
      // Shadow & shaft
      g.moveTo(x1, y1 + 3).lineTo(x2, y2 + 3).stroke({ color: 0x0a0b10, width: 8 });
      g.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: 0xdde2eb, width: 5 });
      g.moveTo(x1, y1).lineTo(x2, y2).stroke({ color: 0xffd60a, width: 2 });
      // Wrench jaw heads
      for (const [jx, jy] of [[x1, y1], [x2, y2]]) {
        g.circle(jx, jy, 6).fill({ color: 0xdde2eb }).stroke({ color: 0x0a0b10, width: 2 });
        g.circle(jx, jy, 2.5).fill({ color: 0x0a0b10 });
      }
    }

    // 4. Stylized Outlaw Biker Skull
    const skullY = cy - 4;
    // Skull Cranium dome
    g.ellipse(cx, skullY - 4, 18, 16)
      .fill({ color: 0x263044 })
      .stroke({ color: 0x0a0b10, width: 3.5 });

    // Skull Specular Glint Crescent
    g.ellipse(cx - 5, skullY - 8, 7, 4)
      .fill({ color: 0x2ee6ff, alpha: 0.5 });

    // Angular aggressive anime visor / eye sockets
    const eyeL = [
      cx - 13, skullY - 5,
      cx - 3, skullY - 3,
      cx - 5, skullY + 3,
      cx - 12, skullY + 2
    ];
    const eyeR = [
      cx + 3, skullY - 3,
      cx + 13, skullY - 5,
      cx + 12, skullY + 2,
      cx + 5, skullY + 3
    ];
    g.poly(eyeL).fill({ color: 0x2ee6ff }).stroke({ color: 0x0a0b10, width: 1.5 });
    g.poly(eyeR).fill({ color: 0x2ee6ff }).stroke({ color: 0x0a0b10, width: 1.5 });
    // Glowing white eye cores
    g.circle(cx - 7, skullY, 1.8).fill({ color: 0xffffff });
    g.circle(cx + 7, skullY, 1.8).fill({ color: 0xffffff });

    // Nose cavity
    g.poly([cx - 2.5, skullY + 6, cx + 2.5, skullY + 6, cx, skullY + 3])
      .fill({ color: 0x0a0b10 });

    // Golden mechanical jaw / teeth plate
    const jawPts = [
      cx - 9, skullY + 8,
      cx + 9, skullY + 8,
      cx + 6, skullY + 16,
      cx - 6, skullY + 16
    ];
    g.poly(jawPts).fill({ color: 0xffd60a }).stroke({ color: 0x0a0b10, width: 2.2 });
    // Teeth slits
    for (const tx of [-4, 0, 4]) {
      g.moveTo(cx + tx, skullY + 9).lineTo(cx + tx, skullY + 15).stroke({ color: 0x0a0b10, width: 1.5 });
    }

    // Flanking golden outlaw wing chevrons
    g.poly([cx - 24, skullY - 8, cx - 34, skullY - 4, cx - 22, skullY + 2])
      .fill({ color: 0xffd60a }).stroke({ color: 0x0a0b10, width: 1.8 });
    g.poly([cx + 24, skullY - 8, cx + 34, skullY - 4, cx + 22, skullY + 2])
      .fill({ color: 0xffd60a }).stroke({ color: 0x0a0b10, width: 1.8 });
  }

  /**
   * Draws 10 deterministic, gently drifting comic ambient motes across the arena
   * with thematic colors based on floor number:
   * Floor 1: Warm rust/amber dust motes (0xff9f1c)
   * Floor 2: Rising smelter orange embers (0xff5400)
   * Floor 3: Neon cyan cyber-streaks (0x00f5d4)
   * Floor 4: Crisp icy cryo crystals (0x72efdd)
   * Floor 5: Crimson magma sparks (0xff2a4b)
   * Floor 6+: Golden Valhalla stars/motes (0xffd60a)
   */
  public renderAmbientMotes(g: Graphics, floorNum: number, timestampMs: number): void {
    const moteColor = getFloorMoteColor(floorNum);
    const W = ARENA_WIDTH;
    const H = ARENA_HEIGHT;
    const WALL = WALL_THICKNESS;
    const innerW = W - WALL * 2 - 80;
    const innerH = H - WALL * 2 - 80;

    for (let i = 0; i < 10; i++) {
      // Deterministic base positions distributed across arena
      const baseX = WALL + 40 + ((i * 197 + 53) % innerW);
      const baseY = WALL + 40 + ((i * 269 + 89) % innerH);

      // Gentle drifting offsets based on timestampMs
      const t = timestampMs * 0.001;
      const driftX = Math.sin(t * 0.75 + i * 1.35) * 16;
      let driftY = Math.cos(t * 0.6 + i * 1.85) * 16;

      // Floor 2 rising smelter embers behavior
      if (floorNum === 2) {
        driftY -= ((t * 22 + i * 24) % 64) - 32;
      }

      const x = baseX + driftX;
      const y = baseY + driftY;
      const r = 2.0 + (i % 3) * 0.6;
      const alpha = 0.45 + 0.25 * Math.sin(t * 1.5 + i * 1.2);

      // Safe comic ambient mote outer glow / body
      g.circle(x, y, r).fill({ color: moteColor, alpha });
      // Specular core for comic aesthetic
      g.circle(x, y, Math.max(0.8, r * 0.45)).fill({ color: 0xffffff, alpha: alpha * 0.8 });
    }
  }

  public renderRoomDecor = this.renderAmbientMotes;

  // Alias for renderFloor matching spec terminology
  public renderArena(g: Graphics, room: Room, floorNum: number, timestampMs: number): void {
    this.renderFloor(g, room, floorNum, timestampMs);
  }

  private renderSkids(g: Graphics, room: Room): void {
    for (const sk of room.skids) {
      const cos = Math.cos(sk.angle);
      const sin = Math.sin(sk.angle);

      const drawTread = (offY: number) => {
        const p1x = sk.x + cos * -6 - sin * offY;
        const p1y = sk.y + sin * -6 + cos * offY;
        const p2x = sk.x + cos * 6 - sin * offY;
        const p2y = sk.y + sin * 6 + cos * offY;
        g.moveTo(p1x, p1y).lineTo(p2x, p2y).stroke({ color: 0x0a0a0e, width: 3, alpha: 0.35 });
      };

      drawTread(-3.5);
      drawTread(3.5);
    }
  }

  private renderShadows(g: Graphics, player: PlayerState, room: Room): void {
    // Bike underglow neon shadow
    const wDef = WEAPONS[player.weapon] || WEAPONS.pistol;
    const wColor = parseColor(wDef.color, 0xffd166);

    g.ellipse(player.x, player.y + 2, 22, 14)
      .fill({ color: 0x0a0b10, alpha: 0.5 });

    g.ellipse(player.x, player.y + 2, 18, 10)
      .fill({ color: wColor, alpha: 0.18 });

    // Obstacle drop shadows
    for (const ob of room.obstacles) {
      const hs = ob.size / 2;
      g.ellipse(ob.x, ob.y + hs - 2, hs + 4, hs * 0.42)
        .fill({ color: 0x000000, alpha: 0.45 });
    }

    // Enemy shadows
    for (const en of room.enemies) {
      g.ellipse(en.x, en.y + en.radius * 0.8, en.radius * 1.1, en.radius * 0.4)
        .fill({ color: 0x000000, alpha: 0.4 });
    }
  }

  private renderEntities(
    g: Graphics,
    player: PlayerState,
    room: Room,
    dungeon: Dungeon,
    timestampMs: number
  ): void {
    const W = ARENA_WIDTH;
    const H = ARENA_HEIGHT;
    const WALL = WALL_THICKNESS;

    // 1. Heavy industrial walls
    g.rect(0, 0, W, WALL).fill({ color: 0x0d0d14 });
    g.rect(0, H - WALL, W, WALL).fill({ color: 0x0d0d14 });
    g.rect(0, 0, WALL, H).fill({ color: 0x0d0d14 });
    g.rect(W - WALL, 0, WALL, H).fill({ color: 0x0d0d14 });

    // Metallic frame border
    g.rect(WALL, WALL, W - WALL * 2, H - WALL * 2)
      .stroke({ color: 0x323546, width: 4 });

    // Corner rivet plates
    const rivetSize = 14;
    const corners = [
      [WALL - 2, WALL - 2],
      [W - WALL - rivetSize + 2, WALL - 2],
      [WALL - 2, H - WALL - rivetSize + 2],
      [W - WALL - rivetSize + 2, H - WALL - rivetSize + 2]
    ];
    corners.forEach(([rx, ry]) => {
      g.rect(rx, ry, rivetSize, rivetSize)
        .fill({ color: 0x3a3d52 })
        .stroke({ color: 0x1b1c26, width: 2 });
    });

    // 2. Blast Doors
    const deltas: Record<Direction, [number, number]> = {
      N: [0, -1],
      S: [0, 1],
      W: [-1, 0],
      E: [1, 0]
    };
    (['N', 'S', 'W', 'E'] as Direction[]).forEach(dir => {
      if (!room.doors[dir]) return;
      const [dx, dy] = deltas[dir];
      const neighbor = dungeon[`${room.x + dx},${room.y + dy}`];
      const nType = neighbor ? neighbor.type : 'combat';

      let frameColor = '#6c757d';
      if (nType === 'boss' || room.type === 'boss') frameColor = '#e63946';
      else if (nType === 'treasure' || room.type === 'treasure') frameColor = '#ffd166';
      else if (nType === 'shop' || room.type === 'shop') frameColor = '#06d6a0';

      drawDoor(g, dir, room.doors[dir], room.cleared, frameColor);
    });

    // 3. Obstacles
    this.renderObstacles(g, room.obstacles);

    // 4. Pickups & Pedestals
    this.renderPickups(g, room.pickups, timestampMs);

    // 5. Enemies & Bosses
    this.renderEnemies(g, room.enemies, timestampMs);

    // 6. Player Motorcycle & Contextual 30px Drift/NOS Arc
    this.renderPlayer(g, player, timestampMs);
  }

  public renderObstacles(g: Graphics, obstacles: Room['obstacles']): void {
    for (const ob of obstacles) {
      drawObstacle(g, ob);
    }
  }

  private renderPickups(g: Graphics, pickups: Room['pickups'], timestampMs: number): void {
    // Draw Choice Pedestal "VS / OR" energy tether line between paired choiceGroup pedestals
    const choiceGroups = new Map<string, Room['pickups']>();
    for (const p of pickups) {
      const cg = (p as any).choiceGroup;
      if (p.type === 'mod_pedestal' && typeof cg === 'string' && cg.length > 0) {
        const list = choiceGroups.get(cg) || [];
        list.push(p);
        choiceGroups.set(cg, list);
      }
    }

    for (const group of choiceGroups.values()) {
      if (group.length >= 2) {
        const p1 = group[0];
        const p2 = group[1];
        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const pulse = 0.65 + 0.3 * Math.sin(timestampMs / 140);

        // Outer comic ink backing line
        g.moveTo(p1.x, p1.y)
          .lineTo(p2.x, p2.y)
          .stroke({ color: 0x0a0b10, width: 7, alpha: 0.85 });
        // Gold energy conduit
        g.moveTo(p1.x, p1.y)
          .lineTo(p2.x, p2.y)
          .stroke({ color: 0xffd60a, width: 3.5, alpha: 0.9 });
        // Cyan animated core filament
        g.moveTo(p1.x, p1.y)
          .lineTo(p2.x, p2.y)
          .stroke({ color: 0x00f5d4, width: 1.8, alpha: pulse });

        // Central "VS / OR" choice node medallion
        g.circle(midX, midY, 9)
          .fill({ color: 0xffd60a, alpha: 0.95 })
          .stroke({ color: 0x0a0b10, width: 2.5 });
        g.circle(midX, midY, 4)
          .fill({ color: 0x00f5d4, alpha: pulse });
      }
    }

    for (const p of pickups) {
      drawPickup(g, p, timestampMs);
    }
  }

  private renderEnemies(g: Graphics, enemies: Room['enemies'], timestampMs: number): void {
    for (const en of enemies) {
      // Boss Phase-2 Enrage crimson-gold aura ring beneath the Boss
      if (en.type === 'boss' && ((en as any).phase === 2 || en.hp <= en.maxHp * 0.5)) {
        const enragePulse = 0.65 + 0.25 * Math.sin(timestampMs / 90);
        const auraR = en.radius + 12 + Math.sin(timestampMs / 110) * 4;
        g.circle(en.x, en.y, auraR)
          .fill({ color: 0xff1f4b, alpha: 0.22 * enragePulse })
          .stroke({ color: 0xff1f4b, width: 3.5, alpha: enragePulse });
        g.circle(en.x, en.y, en.radius + 6)
          .stroke({ color: 0xffd60a, width: 2.2, alpha: 0.9 });
      }

      // Elite affix color-coded outer double halo ring
      if (en.isElite) {
        g.circle(en.x, en.y, en.radius + 5)
          .stroke({ color: getEliteAffixColor((en as any).eliteAffix), width: 2.2, alpha: 0.85 });
      }

      drawEnemy(g, en, timestampMs);

      // Enemy Hit-Flash pure-white comic impact overlay & hit sparks
      const hitFlashTimer = Number((en as any).hitFlashTimer) || 0;
      if (hitFlashTimer > 0) {
        g.circle(en.x, en.y, en.radius)
          .fill({ color: 0xffffff, alpha: 0.75 });
        if (hitFlashTimer > 0.05) {
          (this.vfx as any).addHitSpark(en.x, en.y, 0x00f5d4, 4);
        }
      }

      // High-contrast collapsing crimson-and-white Pre-Fire Telegraph Ring
      const telegraphTimer = Number((en as any).telegraphTimer) || 0;
      if (telegraphTimer > 0) {
        const teleRadius = en.radius + 4 + telegraphTimer * 36;
        g.circle(en.x, en.y, teleRadius)
          .stroke({ color: 0xff1f4b, width: 3, alpha: 0.92 });
        g.circle(en.x, en.y, Math.max(2, teleRadius - 2))
          .stroke({ color: 0xffffff, width: 1.5, alpha: 0.95 });
      }
    }
  }

  private renderPlayer(g: Graphics, player: PlayerState, timestampMs: number): void {
    // Contextual 30px Bike-Tethered Drift & NOS Overheat Arc directly beneath the player bike
    const driftCharge = Number((player as any).driftCharge) || 0;
    const driftBoostTimer = Number((player as any).driftBoostTimer) || 0;
    if (driftCharge > 0.05 || driftBoostTimer > 0 || player.nosLock) {
      if (driftCharge > 0.05 || driftBoostTimer > 0) {
        const prog = driftBoostTimer > 0 ? 1 : Math.min(1, driftCharge);
        const startAngle = -Math.PI * 0.75;
        const sweep = Math.PI * 1.5;
        const arcColor = (driftCharge >= 0.95 || driftBoostTimer > 0) ? 0x00f5d4 : 0xffd60a;

        const arcStartX = player.x + Math.cos(startAngle) * 30;
        const arcStartY = player.y + Math.sin(startAngle) * 30;
        g.moveTo(arcStartX, arcStartY)
          .arc(player.x, player.y, 30, startAngle, startAngle + sweep)
          .stroke({ color: 0x0a0b10, width: 6, alpha: 0.85 });
        g.moveTo(arcStartX, arcStartY)
          .arc(player.x, player.y, 30, startAngle, startAngle + sweep * prog)
          .stroke({ color: arcColor, width: 3.5, alpha: 0.95 });
      }

      if (player.nosLock === true) {
        const lockPulse = 0.55 + 0.35 * Math.abs(Math.sin(timestampMs / 90));
        g.circle(player.x, player.y, 30)
          .stroke({ color: 0x0a0b10, width: 5.5, alpha: 0.8 });
        g.circle(player.x, player.y, 30)
          .stroke({ color: 0xff1f4b, width: 3, alpha: lockPulse });
      }
    }

    // Directional afterburner jet cones and subtle rim aura rendered UNDER player motorcycle
    const isBoosting = (player.nos > 0 && !player.nosLock);
    this.vfx.renderKiAura(g, player, isBoosting);

    // Player Motorcycle (Always on top of aura and exhaust plumes)
    drawMotorcycle(g, player, timestampMs);
  }

  private renderVFX(
    g: Graphics,
    player: PlayerState,
    room: Room,
    bullets: PlayerBullet[],
    enemyBullets: EnemyBullet[],
    grenades: Grenade[],
    enemyBombs: EnemyBomb[],
    particles: Particle[],
    beamEffects: BeamEffect[],
    _timestampMs: number
  ): void {
    // Tier 1: Floor Fire Hazards
    for (const hz of room.hazards) {
      const alpha = Math.min(0.65, (hz.life / hz.maxLife) * 0.7);
      g.circle(hz.x, hz.y, hz.radius)
        .fill({ color: 0xff5400, alpha })
        .stroke({ color: 0xffd166, width: 2, alpha });
    }

    // Tier 2: Player Bullets, Flames & Arcing Grenades
    const bulletCount = Math.min(bullets.length, 120);
    for (let i = 0; i < bulletCount; i++) {
      const b = bullets[i];
      const alpha = b.isFlame ? Math.max(0.2, b.life / (b.maxLife || 0.36)) : 1.0;
      const bColor = parseColor(b.color, 0xffd166);

      g.circle(b.x, b.y, b.radius)
        .fill({ color: bColor, alpha });

      if (!b.isFlame && b.radius > 2.5) {
        g.circle(b.x, b.y, b.radius * 0.45)
          .fill({ color: 0xffffff, alpha });
      }
    }

    for (const gr of grenades) {
      // Crosshair landing target
      g.circle(gr.targetX, gr.targetY, 16)
        .stroke({ color: 0xf72585, width: 1.5, alpha: 0.45 });

      // Ballistic parabolic arc height
      const arcLift = Math.sin(gr.t * Math.PI) * 50;
      // Shadow
      g.circle(gr.x, gr.y, 6).fill({ color: 0x000000, alpha: 0.4 });
      // Shell
      g.circle(gr.x, gr.y - arcLift, gr.radius)
        .fill({ color: 0xf72585 })
        .stroke({ color: 0x0a0b10, width: 2 });
    }

    // Tier 3: Action Beams & Lightning
    this.vfx.renderBeams(g, beamEffects);

    // Tier 4: Shockwaves, Manga Hit Sparks, Normal Particle Sparks & Anime Speed Lines
    this.vfx.renderShockwaves(g, particles);
    this.vfx.renderHitSparks(g);

    const particleCount = Math.min(particles.length, 150);
    for (let i = 0; i < particleCount; i++) {
      const pt = particles[i];
      if (!pt.shockwaveMax) {
        const alpha = Math.max(0, pt.life / pt.maxLife);
        const col = parseColor(pt.color, 0xffd166);
        g.circle(pt.x, pt.y, pt.radius)
          .fill({ color: col, alpha });
      }
    }

    const isBoosting = (player.nos > 0 && !player.nosLock);
    this.vfx.renderSpeedLines(g, player, isBoosting);

    // Tier 5 (TOP OF ALL PLAYER VFX): Enemy Mortar Bombs & High-Contrast Enemy Bullets
    for (const eb of enemyBombs) {
      g.circle(eb.targetX, eb.targetY, 36)
        .stroke({ color: 0xff9f1c, width: 2, alpha: 0.55 });
      const arcLift = Math.sin(eb.t * Math.PI) * 60;
      g.circle(eb.x, eb.y - arcLift, 7)
        .fill({ color: 0xff9f1c })
        .stroke({ color: 0x0a0b10, width: 2 });
    }

    const enemyBulletCount = Math.min(enemyBullets.length, 120);
    for (let i = 0; i < enemyBulletCount; i++) {
      const eb = enemyBullets[i];
      const ebRadius = Math.max(2.5, eb.radius || 5);
      g.circle(eb.x, eb.y, ebRadius)
        .fill({ color: 0xff1f4b })
        .stroke({ color: 0x0a0b10, width: 2.5 });
      g.circle(eb.x, eb.y, ebRadius * 0.45)
        .fill({ color: 0xffffff });
    }
  }

  private renderHUD(
    g: Graphics,
    player: PlayerState,
    room: Room,
    damageNumbers: DamageNumber[],
    timestampMs: number = performance.now()
  ): void {
    // Price text labels are pooled: children of priceTextContainer are reused each frame
    // (previously removeChildren() + new Text/TextStyle per frame leaked textures).
    const pricePool = this.priceTextContainer.children;
    let priceUsed = 0;

    // Render price tags below each shop/priced item & wider badges for hub NPCs
    for (const p of room.pickups) {
      if ((p as any).type === 'hub_npc') {
        const npc = p as any;
        const npcId = npc.npcId;
        const badgeY = p.y + (p.radius || 34) + 16;
        const distToPlayer = Math.hypot(player.x - p.x, player.y - p.y);
        const isNear = distToPlayer <= (player.radius || 16) + (p.radius || 34) + 24;

        let textStr = isNear ? '[E] INTERACT' : 'STATION [E]';
        let col = 0xffd166;
        if (npcId === 'garage') {
          textStr = isNear ? '[E] OPEN GARAGE' : 'GARAGE & ARMORY [E]';
          col = 0xffd60a;
        } else if (npcId === 'blacksmith') {
          textStr = isNear ? '[E] USE FORGE (12⚙️)' : 'SCRAP FORGE [E]';
          col = 0x2ee6ff;
        } else if (npcId === 'codex') {
          textStr = isNear ? '[E] INTEL & +DMG BUFF' : 'INTEL & SCANNER [E]';
          col = 0x9d4edd;
        } else if (npcId === 'bounty') {
          textStr = isNear ? '[E] CACHE & HEAT LVL' : 'WAR ROOM & HEAT [E]';
          col = 0x06d6a0;
        } else if (npcId === 'launch') {
          textStr = isNear ? '[E] LAUNCH RUN ►' : 'DEPLOY: SECTOR 1 [E]';
          col = 0xe5203a;
        }

        // Proximity glow & high-visibility pulsing [PRESS E] interaction ring
        if (isNear) {
          const ringPulse = 0.75 + 0.25 * Math.sin(timestampMs / 110);
          // Outer glow ring
          g.circle(p.x, p.y, (p.radius || 34) + 12)
            .stroke({ color: col, width: 5, alpha: 0.65 * ringPulse });
          // High-visibility pulsing white interaction ring
          g.circle(p.x, p.y, (p.radius || 34) + 12)
            .stroke({ color: 0xffffff, width: 3, alpha: ringPulse });
        } else if (distToPlayer < 115) {
          const haloPulse = 0.35 + 0.15 * Math.sin(timestampMs / 160);
          g.circle(p.x, p.y, (p.radius || 34) + 10)
            .stroke({ color: col, width: 2, alpha: haloPulse });
        }

        // Wider slanted comic nameplate badge (halfW = 68)
        const halfW = 68;
        const halfH = 10;
        const slant = 6;
        const badge = [
          p.x - halfW + slant, badgeY - halfH,
          p.x + halfW + slant, badgeY - halfH,
          p.x + halfW - slant, badgeY + halfH,
          p.x - halfW - slant, badgeY + halfH
        ];
        g.poly(badge.map((v) => v + 3))
          .fill({ color: 0x0a0b10, alpha: 0.85 });
        g.poly(badge)
          .fill({ color: col, alpha: 1 })
          .stroke({ color: isNear ? 0xffffff : 0x0a0b10, width: isNear ? 3 : 2.5, join: 'miter' });

        let priceText = pricePool[priceUsed] as Text | undefined;
        if (!priceText) {
          priceText = new Text({
            text: textStr,
            style: new TextStyle({
              fontFamily: "'Impact', 'Haettenschweiler', 'Arial Black', sans-serif",
              fontSize: 12,
              fontStyle: 'italic',
              fontWeight: '900',
              fill: '#ffffff',
              stroke: { color: '#0a0b10', width: 3.5, join: 'round' },
              padding: 4
            })
          });
          priceText.anchor.set(0.5, 0.5);
          this.priceTextContainer.addChild(priceText);
        }
        priceUsed++;
        if (priceText.text !== textStr) priceText.text = textStr;
        if (priceText.style.fontSize !== 12) priceText.style.fontSize = 12;
        priceText.visible = true;
        priceText.position.set(p.x, badgeY);
      } else if ('cost' in p && typeof p.cost === 'number') {
        const badgeY = p.y + p.radius + 15;
        const isFree = p.cost === 0;
        const textStr = isFree ? 'FREE' : `${p.cost} 🪙`;
        const col = isFree ? 0x06d6a0 : 0xffd166;

        // Slanted comic parallelogram badge (drop shadow + fill + black ink border)
        const halfW = 27;
        const halfH = 10;
        const slant = 6;
        const badge = [
          p.x - halfW + slant, badgeY - halfH,
          p.x + halfW + slant, badgeY - halfH,
          p.x + halfW - slant, badgeY + halfH,
          p.x - halfW - slant, badgeY + halfH
        ];
        g.poly(badge.map((v) => v + 3))
          .fill({ color: 0x0a0b10, alpha: 0.85 });
        g.poly(badge)
          .fill({ color: col, alpha: 1 })
          .stroke({ color: 0x0a0b10, width: 2.5, join: 'miter' });

        let priceText = pricePool[priceUsed] as Text | undefined;
        if (!priceText) {
          priceText = new Text({
            text: textStr,
            style: new TextStyle({
              fontFamily: "'Impact', 'Haettenschweiler', 'Arial Black', sans-serif",
              fontSize: 13,
              fontStyle: 'italic',
              fontWeight: '900',
              fill: '#ffffff',
              stroke: { color: '#0a0b10', width: 3.5, join: 'round' },
              padding: 4
            })
          });
          priceText.anchor.set(0.5, 0.5);
          this.priceTextContainer.addChild(priceText);
        }
        priceUsed++;
        if (priceText.text !== textStr) priceText.text = textStr;
        priceText.visible = true;
        priceText.position.set(p.x, badgeY);
      }
    }

    // In Home Base Hub, render slanted comic nameplate badge below the Armored Target Dummy bay
    if ((room.type as string) === 'hub') {
      const targetX = 360;
      const badgeY = 594;
      const halfW = 54;
      const halfH = 10;
      const slant = 6;
      const badge = [
        targetX - halfW + slant, badgeY - halfH,
        targetX + halfW + slant, badgeY - halfH,
        targetX + halfW - slant, badgeY + halfH,
        targetX - halfW - slant, badgeY + halfH
      ];
      g.poly(badge.map((v) => v + 3))
        .fill({ color: 0x0a0b10, alpha: 0.85 });
      g.poly(badge)
        .fill({ color: 0xff9f1c, alpha: 1 })
        .stroke({ color: 0x0a0b10, width: 2.5, join: 'miter' });

      let targetLabel = pricePool[priceUsed] as Text | undefined;
      if (!targetLabel) {
        targetLabel = new Text({
          text: 'TARGET RANGE',
          style: new TextStyle({
            fontFamily: "'Impact', 'Haettenschweiler', 'Arial Black', sans-serif",
            fontSize: 13,
            fontStyle: 'italic',
            fontWeight: '900',
            fill: '#ffffff',
            stroke: { color: '#0a0b10', width: 3.5, join: 'round' },
            padding: 4
          })
        });
        targetLabel.anchor.set(0.5, 0.5);
        this.priceTextContainer.addChild(targetLabel);
      }
      priceUsed++;
      if (targetLabel.text !== 'TARGET RANGE') targetLabel.text = 'TARGET RANGE';
      targetLabel.visible = true;
      targetLabel.position.set(targetX, badgeY);
    }

    // Hide leftover pooled price labels
    for (let i = priceUsed; i < pricePool.length; i++) {
      pricePool[i].visible = false;
    }

    // Enemy Health Bars (Boss HP is displayed on the top HUD Boss Bar)
    for (const en of room.enemies) {
      if (en.type !== 'boss' && (en.hp < en.maxHp || en.isElite)) {
        const barWidth = en.radius * 2.2;
        const barY = en.y - en.radius - 12;
        const frac = Math.max(0, Math.min(1, en.hp / en.maxHp));

        // Background
        g.rect(en.x - barWidth / 2, barY, barWidth, 6)
          .fill({ color: 0x0a0b10, alpha: 0.85 })
          .stroke({ color: 0x0a0b10, width: 1.5 });

        // Health fill
        const hpColor = en.isElite ? 0xffd166 : 0xef233c;
        g.rect(en.x - barWidth / 2, barY, barWidth * frac, 6)
          .fill({ color: hpColor });
      }
    }

    // Anime Player Stun Indicator (3 spinning golden/cyan stars & lightning arcs in ellipse orbit)
    if ((player.stunTimer || 0) > 0) {
      const headX = player.x;
      const headY = player.y - 24;
      const rx = 18;
      const ry = 7;
      const spinSpeed = 4.2; // rad/sec
      const t = (timestampMs / 1000) * spinSpeed;

      // Orbit halo ring
      g.ellipse(headX, headY, rx + 1, ry + 1)
        .stroke({ color: 0xffd166, width: 1.5, alpha: 0.35 });

      // Faint electric arcs between orbiting stars
      for (let i = 0; i < 3; i++) {
        const nextIdx = (i + 1) % 3;
        const a1 = t + (i * Math.PI * 2) / 3;
        const a2 = t + (nextIdx * Math.PI * 2) / 3;
        const x1 = headX + Math.cos(a1) * rx;
        const y1 = headY + Math.sin(a1) * ry;
        const x2 = headX + Math.cos(a2) * rx;
        const y2 = headY + Math.sin(a2) * ry;
        const midX = (x1 + x2) / 2 + (Math.sin(t * 8 + i) * 3);
        const midY = (y1 + y2) / 2 + (Math.cos(t * 8 + i) * 2);
        g.moveTo(x1, y1).lineTo(midX, midY).lineTo(x2, y2)
          .stroke({ color: 0x2ee6ff, width: 1.2, alpha: 0.45 });
      }

      const starColors = [0xffd166, 0x2ee6ff, 0xffd166];

      for (let i = 0; i < 3; i++) {
        const starAngle = t + (i * Math.PI * 2) / 3;
        const sx = headX + Math.cos(starAngle) * rx;
        const sy = headY + Math.sin(starAngle) * ry;

        // Depth perspective scaling (stars further back are smaller)
        const depthScale = 0.8 + 0.35 * ((Math.sin(starAngle) + 1) / 2);
        const outerR = 6.5 * depthScale;
        const innerR = 2.4 * depthScale;
        const selfRot = t * 2.5 + i * 1.5;

        // 4-point anime star polygon
        const pts: number[] = [];
        for (let p = 0; p < 8; p++) {
          const a = selfRot + (p * Math.PI) / 4;
          const r = (p % 2 === 0) ? outerR : innerR;
          pts.push(sx + Math.cos(a) * r, sy + Math.sin(a) * r);
        }

        // Star drop shadow for high contrast visibility
        g.poly(pts.map((val, idx) => (idx % 2 === 1 ? val + 2 : val)))
          .fill({ color: 0x0a0b10, alpha: 0.5 });

        // Outer dark comic outline & vibrant fill
        g.poly(pts)
          .fill({ color: starColors[i], alpha: 0.95 })
          .stroke({ color: 0x0a0b10, width: 1.8 });

        // Crisp white specular core
        g.circle(sx, sy, 1.2 * depthScale)
          .fill({ color: 0xffffff, alpha: 0.95 });

        // Tiny trailing spark on the orbit
        const sparkAngle = starAngle - 0.28;
        const spX = headX + Math.cos(sparkAngle) * rx;
        const spY = headY + Math.sin(sparkAngle) * ry;
        g.circle(spX, spY, 1.2 * depthScale)
          .fill({ color: starColors[i], alpha: 0.55 });
      }
    }

    // Comic Floating Combat Text
    this.vfx.renderFloatingText(this.floatingTextContainer, damageNumbers);

    // Anime Player Crash / Death Border Pulse
    if ((player.deathTimer || 0) > 0) {
      const pulseAlpha = 0.5 + Math.sin(timestampMs / 70) * 0.22;
      g.rect(0, 0, ARENA_WIDTH, ARENA_HEIGHT)
        .stroke({ color: 0xff1744, width: 10, alpha: pulseAlpha });
      g.rect(5, 5, ARENA_WIDTH - 10, ARENA_HEIGHT - 10)
        .stroke({ color: 0x0a0b10, width: 4, alpha: 0.85 });
    }
  }
}
