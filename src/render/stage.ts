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

import { Application, Container, Graphics } from 'pixi.js';
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
    this.renderHUD(this.hudGraphics, room, damageNumbers);
  }

  private renderFloor(g: Graphics, room: Room, _floorNum: number, timestampMs: number): void {
    const W = ARENA_WIDTH;
    const H = ARENA_HEIGHT;
    const WALL = WALL_THICKNESS;

    // Outer boundary fill
    g.rect(0, 0, W, H).fill({ color: 0x0e0f16 });

    // Inner room floor fill by room type
    const themeColors: Record<string, number> = {
      start: 0x1b1d28,
      combat: 0x1c1c27,
      treasure: 0x231f2c,
      shop: 0x162323,
      boss: 0x24141c
    };
    const baseColor = themeColors[room.type] || 0x1c1c27;
    g.rect(WALL, WALL, W - WALL * 2, H - WALL * 2).fill({ color: baseColor });

    // 12x12 grid lines
    const tile = (W - WALL * 2) / 12;
    for (let x = WALL; x <= W - WALL + 1; x += tile) {
      g.moveTo(x, WALL)
        .lineTo(x, H - WALL)
        .stroke({ color: 0xffffff, width: 1, alpha: 0.035 });
    }
    for (let y = WALL; y <= H - WALL + 1; y += tile) {
      g.moveTo(WALL, y)
        .lineTo(W - WALL, y)
        .stroke({ color: 0xffffff, width: 1, alpha: 0.035 });
    }

    // Trapdoor in cleared Boss Room
    if (room.trapdoor) {
      drawTrapdoor(g, timestampMs);
    }
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

  private renderHUD(g: Graphics, room: Room, damageNumbers: DamageNumber[]): void {
    // Enemy & Boss Health Bars
    for (const en of room.enemies) {
      if (en.hp < en.maxHp || en.type === 'boss' || en.isElite) {
        const barWidth = en.type === 'boss' ? 90 : en.radius * 2.2;
        const barY = en.y - en.radius - (en.type === 'boss' ? 24 : 12);
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

    // Comic Floating Combat Text
    this.vfx.renderFloatingText(this.floatingTextContainer, damageNumbers);
  }
}
