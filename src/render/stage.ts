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

  private renderFloor(g: Graphics, room: Room, _floorNum: number, timestampMs: number): void {
    const W = ARENA_WIDTH;
    const H = ARENA_HEIGHT;
    const WALL = WALL_THICKNESS;

    // 1. Outer deep bunker hull abyss
    g.rect(0, 0, W, H).fill({ color: 0x090a10 });

    // 2. Inner room floor base color by room type (warm industrial slate/brown-grey like concept art)
    const themeColors: Record<string, { floor: number; plateHi: number; plateLo: number; accent: number }> = {
      start:    { floor: 0x26242c, plateHi: 0x33303b, plateLo: 0x1b1920, accent: 0xff6b2b },
      combat:   { floor: 0x25232b, plateHi: 0x312e39, plateLo: 0x19181f, accent: 0xe5203a },
      treasure: { floor: 0x292434, plateHi: 0x373046, plateLo: 0x1c1824, accent: 0xffd60a },
      shop:     { floor: 0x1d2a2d, plateHi: 0x27383c, plateLo: 0x141d20, accent: 0x2ee6ff },
      boss:     { floor: 0x2c1921, plateHi: 0x3b222c, plateLo: 0x1d0f15, accent: 0xff2a55 },
      hub:      { floor: 0x161a26, plateHi: 0x20273a, plateLo: 0x10131d, accent: 0x2ee6ff }
    };
    const palette = themeColors[room.type] || themeColors.combat;
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
          .fill({ color: checker ? palette.plateHi : palette.floor, alpha: checker ? 0.42 : 0.2 });

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
      g.circle(cx, cy, 82)
        .stroke({ color: palette.accent, width: 1.5, alpha: 0.22 });
      // Diagonal structural floor seams
      g.moveTo(cx - 65, cy - 65).lineTo(cx - 28, cy - 28).stroke({ color: palette.accent, width: 2, alpha: 0.25 });
      g.moveTo(cx + 65, cy - 65).lineTo(cx + 28, cy - 28).stroke({ color: palette.accent, width: 2, alpha: 0.25 });
      g.moveTo(cx - 65, cy + 65).lineTo(cx - 28, cy + 28).stroke({ color: palette.accent, width: 2, alpha: 0.25 });
      g.moveTo(cx + 65, cy + 65).lineTo(cx + 28, cy + 28).stroke({ color: palette.accent, width: 2, alpha: 0.25 });
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
      .fill({ color: 0x2c2836 })
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
        .stroke({ color: palette.accent, width: 1.5, alpha: 0.55 });
    }

    // Crisp inner arena 3D bounding contour
    g.rect(WALL, WALL, innerW, innerH)
      .stroke({ color: 0x0a0b10, width: 3.5 });

    // Trapdoor in cleared Boss Room
    if (room.trapdoor) {
      drawTrapdoor(g, timestampMs);
    }
  }

  /**
   * Renders the safe sanctuary Outlaw Skull & Gear emblem in the center of the Home Base hub.
   */
  private renderHubSanctuaryDecal(g: Graphics, cx: number, cy: number, timestampMs: number): void {
    // 1. Four glowing diagonal power tracks radiating out to the 4 NPC stations
    const stations = [
      [195, 215],
      [525, 215],
      [195, 505],
      [525, 505]
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

  // Alias for renderFloor matching spec terminology
  public renderArena = this.renderFloor;

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
    for (const ob of room.obstacles) {
      drawObstacle(g, ob);
    }

    // 4. Pickups & Pedestals
    for (const p of room.pickups) {
      drawPickup(g, p, timestampMs);
    }

    // 5. Enemies & Bosses
    for (const en of room.enemies) {
      drawEnemy(g, en, timestampMs);
    }

    // Directional afterburner jet cones and subtle rim aura rendered UNDER player motorcycle
    const isBoosting = (player.nos > 0 && !player.nosLock);
    this.vfx.renderKiAura(g, player, isBoosting);

    // 6. Player Motorcycle (Always on top of aura and exhaust plumes)
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
    // 1. Floor Fire Hazards
    for (const hz of room.hazards) {
      const alpha = Math.min(0.65, (hz.life / hz.maxLife) * 0.7);
      g.circle(hz.x, hz.y, hz.radius)
        .fill({ color: 0xff5400, alpha })
        .stroke({ color: 0xffd166, width: 2, alpha });
    }

    // 2. Player Bullets & Flames (Streamlined single circle fill, capped at 120)
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

    // 3. Enemy Bullets (Streamlined single circle fill, capped at 120)
    const enemyBulletCount = Math.min(enemyBullets.length, 120);
    for (let i = 0; i < enemyBulletCount; i++) {
      const eb = enemyBullets[i];
      const ebColor = parseColor(eb.color, 0xef233c);
      g.circle(eb.x, eb.y, eb.radius)
        .fill({ color: ebColor });
      if (eb.radius > 2.5) {
        g.circle(eb.x, eb.y, eb.radius * 0.45)
          .fill({ color: 0xffffff });
      }
    }

    // 4. Arcing Grenades
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

    // 5. Enemy Mortar Bombs
    for (const eb of enemyBombs) {
      g.circle(eb.targetX, eb.targetY, 36)
        .stroke({ color: 0xff9f1c, width: 2, alpha: 0.55 });
      const arcLift = Math.sin(eb.t * Math.PI) * 60;
      g.circle(eb.x, eb.y - arcLift, 7)
        .fill({ color: 0xff9f1c })
        .stroke({ color: 0x0a0b10, width: 2 });
    }

    // 6. Action Beams & Lightning
    this.vfx.renderBeams(g, beamEffects);

    // 7. Shockwaves & Manga Hit Sparks
    this.vfx.renderShockwaves(g, particles);
    this.vfx.renderHitSparks(g);

    // 8. Normal Particle Sparks (Streamlined single circle fill, capped at 150)
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

    // 9. Anime Speed Lines during NOS Boost (Ki aura rendered underneath player in entityLayer)
    const isBoosting = (player.nos > 0 && !player.nosLock);
    this.vfx.renderSpeedLines(g, player, isBoosting);
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
        let textStr = 'STATION';
        let col = 0xffd166;
        if (npcId === 'garage') {
          textStr = 'GARAGE [G]';
          col = 0xffd60a;
        } else if (npcId === 'blacksmith') {
          textStr = 'FORGE 12⚙️';
          col = 0x2ee6ff;
        } else if (npcId === 'bounty') {
          textStr = 'WAR ROOM';
          col = 0x06d6a0;
        } else if (npcId === 'launch') {
          textStr = 'RIDE OUT ►';
          col = 0xe5203a;
        }

        // Wider slanted comic nameplate badge (halfW = 54)
        const halfW = 54;
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
