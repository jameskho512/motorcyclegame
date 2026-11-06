// @vitest-environment happy-dom
/**
 * Unit Tests: Renderer, Vector Art & UI Components
 *
 * Verifies:
 * 1. Semicircular Fuel Gauge math, needle angles, and <= 34% low-fuel jitter.
 * 2. Floor minimap coordinate transforms, centering, and clipping bounds.
 * 3. Color parsing and hex conversion utilities.
 * 4. Tooltip content generation for all pickup types.
 * 5. Shop modal purchase confirmation callbacks and state.
 * 6. Stage hierarchy layer ordering and filter manager behavior.
 * 7. Cryo Barrel vs Explosive TNT Barrel vector art and 10 per-floor atmospheric ambient motes.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Graphics } from 'pixi.js';
import {
  isLowFuel,
  calcNeedleAngle,
  calcMinimapRoomCoords,
  getMinimapFloorSummary,
  HUDController,
  getModStackTierClass,
  type ModStackTierClass,
  type MinimapFloorSummary,
  type DungeonGrid
} from '../../src/ui/hud';
import { parseColor, drawObstacle } from '../../src/render/vectorArt';
import { TooltipManager } from '../../src/ui/tooltip';
import { ShopModalController } from '../../src/ui/shopModal';
import { FilterManager } from '../../src/render/shaders';
import { StageManager, getFloorMoteColor, getEliteAffixColor } from '../../src/render/stage';
import { Pickup, MetaSaveState, PlayerState, Obstacle, Dungeon, Room, EquipmentItem } from '../../src/types/game';
import {
  GarageController,
  getWeaponMasteryTier,
  getStashSalvageSummary,
  getDowngradeStashItems,
  type StashSalvageSummary
} from '../../src/ui/garage';

describe('Render & UI Subsystems', () => {
  describe('Semicircular Fuel Gauge Math', () => {
    it('correctly identifies low fuel at or below 34% hull HP', () => {
      expect(isLowFuel(2, 6)).toBe(true);  // 33.3% <= 34%
      expect(isLowFuel(1, 6)).toBe(true);  // 16.7% <= 34%
      expect(isLowFuel(0, 6)).toBe(true);  // 0% <= 34%
      expect(isLowFuel(0, 0)).toBe(true);  // 0 HP
      expect(isLowFuel(3, 6)).toBe(false); // 50% > 34%
      expect(isLowFuel(6, 6)).toBe(false); // 100% > 34%
    });

    it('computes needle angle ranging from PI (empty) to 2*PI (full)', () => {
      const empty = calcNeedleAngle(0, 6, 0);
      expect(empty.frac).toBe(0);
      expect(empty.angle).toBeCloseTo(Math.PI, 4);

      const full = calcNeedleAngle(6, 6, 0);
      expect(full.frac).toBe(1);
      expect(full.angle).toBeCloseTo(Math.PI * 2, 4);

      const half = calcNeedleAngle(3, 6, 0);
      expect(half.frac).toBe(0.5);
      expect(half.angle).toBeCloseTo(Math.PI * 1.5, 4);
    });

    it('applies low-fuel jitter wobble only when hp/maxHp <= 34%', () => {
      const highFuelTime0 = calcNeedleAngle(5, 6, 0);
      const highFuelTime100 = calcNeedleAngle(5, 6, 100);
      expect(highFuelTime0.angle).toEqual(highFuelTime100.angle);

      const lowFuelTime0 = calcNeedleAngle(2, 6, 0);
      const lowFuelTime100 = calcNeedleAngle(2, 6, 100);
      expect(lowFuelTime0.angle).not.toEqual(lowFuelTime100.angle);
    });
  });

  describe('Minimap Coordinate Transforms', () => {
    it('centers current room at (width/2, height/2)', () => {
      const coord = calcMinimapRoomCoords(2, -3, 2, -3, 240, 145, 18, 3);
      expect(coord.rx).toBe(120 - 9); // cx - cell/2
      expect(coord.ry).toBe(72.5 - 9); // cy - cell/2
      expect(coord.visible).toBe(true);
    });

    it('offsets adjacent neighbor rooms by cellSize + gap (21px)', () => {
      const current = calcMinimapRoomCoords(0, 0, 0, 0, 240, 145, 18, 3);
      const eastNeighbor = calcMinimapRoomCoords(1, 0, 0, 0, 240, 145, 18, 3);
      const southNeighbor = calcMinimapRoomCoords(0, 1, 0, 0, 240, 145, 18, 3);

      expect(eastNeighbor.rx - current.rx).toBe(21);
      expect(eastNeighbor.ry).toBe(current.ry);

      expect(southNeighbor.ry - current.ry).toBe(21);
      expect(southNeighbor.rx).toBe(current.rx);
    });

    it('marks distant rooms as not visible when clipped outside minimap boundaries', () => {
      const distant = calcMinimapRoomCoords(20, 20, 0, 0, 240, 145, 18, 3);
      expect(distant.visible).toBe(false);
    });
  });

  describe('Minimap Tactical Telemetry & Sector Radar', () => {
    const makeDoors = (d: Partial<Record<'N' | 'S' | 'E' | 'W', boolean>> = {}) => ({
      N: false,
      S: false,
      E: false,
      W: false,
      ...d
    });

    const makeRoom = (overrides: Partial<Room> & { x: number; y: number; type: Room['type'] }): Room => ({
      cleared: false,
      visited: false,
      doors: makeDoors(),
      obstacles: [],
      enemies: [],
      pickups: [],
      hazards: [],
      skids: [],
      trapdoor: false,
      ...overrides
    });

    it('computes default summary for empty dungeons', () => {
      const emptyDungeon = {} as Dungeon;
      const summary: MinimapFloorSummary = getMinimapFloorSummary(emptyDungeon);
      expect(summary).toEqual({
        totalRooms: 0,
        visitedRooms: 0,
        clearedRooms: 0,
        completionPct: 0,
        hasVisitedBoss: false,
        hasVisitedShop: false
      });
    });

    it('computes completion percentage and shop/boss visited status for partially cleared dungeons', () => {
      const dungeon: Dungeon = {
        '0,0': makeRoom({ x: 0, y: 0, type: 'combat', cleared: true, visited: true, doors: makeDoors({ E: true }) }),
        '1,0': makeRoom({ x: 1, y: 0, type: 'shop', cleared: false, visited: true, doors: makeDoors({ W: true, S: true }) }),
        '0,1': makeRoom({ x: 0, y: 1, type: 'combat', cleared: false, visited: false, doors: makeDoors({ N: true }) }),
        '1,1': makeRoom({ x: 1, y: 1, type: 'boss', cleared: false, visited: false, doors: makeDoors({ N: true }) })
      };

      const summary: MinimapFloorSummary = getMinimapFloorSummary(dungeon);
      expect(summary.totalRooms).toBe(4);
      expect(summary.visitedRooms).toBe(2);
      expect(summary.clearedRooms).toBe(1);
      expect(summary.completionPct).toBe(25); // 1 / 4 = 25%
      expect(summary.hasVisitedShop).toBe(true);
      expect(summary.hasVisitedBoss).toBe(false);
    });

    it('computes 100% completion when all rooms are cleared with boss & shop visited', () => {
      const dungeon: Dungeon = {
        '0,0': makeRoom({ x: 0, y: 0, type: 'combat', cleared: true, visited: true, doors: makeDoors({ E: true }) }),
        '1,0': makeRoom({ x: 1, y: 0, type: 'shop', cleared: true, visited: true, doors: makeDoors({ W: true, E: true }) }),
        '2,0': makeRoom({ x: 2, y: 0, type: 'boss', cleared: true, visited: true, doors: makeDoors({ W: true }) })
      };

      const summary: MinimapFloorSummary = getMinimapFloorSummary(dungeon);
      expect(summary.totalRooms).toBe(3);
      expect(summary.visitedRooms).toBe(3);
      expect(summary.clearedRooms).toBe(3);
      expect(summary.completionPct).toBe(100);
      expect(summary.hasVisitedBoss).toBe(true);
      expect(summary.hasVisitedShop).toBe(true);
    });

    it('updates minimapCanvas DOM attributes and renders telemetry pill in drawMinimap', () => {
      document.body.innerHTML = `
        <div id="game-wrapper">
          <canvas id="minimap-canvas" width="240" height="150"></canvas>
          <canvas id="fuel-gauge" width="240" height="120"></canvas>
          <div id="boss-hud"></div>
          <div id="boss-hud-sub"></div>
        </div>
      `;

      const canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
      const mockCtx = {
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        closePath: vi.fn(),
        arc: vi.fn(),
        fillText: vi.fn(),
        strokeText: vi.fn(),
        measureText: vi.fn().mockReturnValue({ width: 24 }),
        rect: vi.fn(),
        roundRect: vi.fn(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        lineCap: 'round',
        shadowColor: '',
        shadowBlur: 0,
        font: '',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        lineJoin: 'miter'
      };
      vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx as any);

      const hud = new HUDController();
      const dungeon: Dungeon = {
        '0,0': makeRoom({ x: 0, y: 0, type: 'combat', cleared: true, visited: true, doors: makeDoors({ E: true }) }),
        '1,0': makeRoom({ x: 1, y: 0, type: 'shop', cleared: true, visited: true, doors: makeDoors({ W: true, E: true }) }),
        '2,0': makeRoom({ x: 2, y: 0, type: 'boss', cleared: false, visited: false, doors: makeDoors({ W: true }) }),
        '0,1': makeRoom({ x: 0, y: 1, type: 'combat', cleared: false, visited: false, doors: makeDoors({}) })
      };

      hud.drawMinimap(dungeon, 0, 0);

      // Verify DOM attributes on minimap canvas
      expect(canvas.getAttribute('data-completion-pct')).toBe('50');
      expect(canvas.getAttribute('data-cleared-rooms')).toBe('2/4');
      expect(canvas.getAttribute('aria-label')).toBe('Sector Radar: 2 of 4 rooms cleared (50%)');

      // Verify telemetry pill text was drawn
      expect(mockCtx.strokeText).toHaveBeenCalledWith('2/4 (50%)', 8, 14);
      expect(mockCtx.fillText).toHaveBeenCalledWith('2/4 (50%)', 8, 14);
    });

    it('sets room hazard telemetry attributes on #hud-sector-biome and minimap-canvas via renderMinimap for hazardous room', () => {
      document.body.innerHTML = `
        <div id="game-wrapper">
          <canvas id="minimap-canvas" width="240" height="150"></canvas>
          <div id="hud-sector-biome"></div>
        </div>
      `;

      const canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
      const sectorBiome = document.getElementById('hud-sector-biome') as HTMLElement;
      const mockCtx = {
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        closePath: vi.fn(),
        arc: vi.fn(),
        fillText: vi.fn(),
        strokeText: vi.fn(),
        measureText: vi.fn().mockReturnValue({ width: 24 }),
        rect: vi.fn(),
        roundRect: vi.fn(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        lineCap: 'round',
        shadowColor: '',
        shadowBlur: 0,
        font: '',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        lineJoin: 'miter'
      };
      vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx as any);

      const hud = new HUDController();
      const hazardousRoom = makeRoom({
        x: 0,
        y: 0,
        type: 'combat',
        obstacles: [
          { x: 100, y: 100, type: 'cryo_barrel' },
          { x: 120, y: 100, type: 'toxic_barrel' },
          { x: 140, y: 100, type: 'barrel' },
          { x: 160, y: 100, type: 'explosive_barrel' }
        ] as any,
        doors: makeDoors({ E: true })
      });
      (hazardousRoom as any).zones = [{ type: 'oil_slick' }, { type: 'acid_pool' }];

      const dungeon: DungeonGrid = {
        '0,0': hazardousRoom
      };

      hud.renderMinimap(dungeon, 0, 0, 1);

      // Total hazards = 1 cryo + 1 toxic + 2 explosive = 4
      expect(canvas.getAttribute('data-room-hazards')).toBe('4');
      expect(canvas.getAttribute('data-room-zones')).toBe('oil_slick,acid_pool');
      expect(canvas.getAttribute('data-room-tactical-hint')).toContain('Cryo barrels detected (1)');
      expect(canvas.getAttribute('data-room-tactical-hint')).toContain('Toxic barrels detected (1)');
      expect(canvas.getAttribute('data-room-tactical-hint')).toContain('Explosive barrels detected (2)');
      expect(canvas.getAttribute('data-room-tactical-hint')).toContain('Surface modifiers detected (oil slick, acid pool)');

      // Verify #hud-sector-biome receives identical telemetry attributes
      expect(sectorBiome.getAttribute('data-room-hazards')).toBe('4');
      expect(sectorBiome.getAttribute('data-room-zones')).toBe('oil_slick,acid_pool');
      expect(sectorBiome.getAttribute('data-room-tactical-hint')).toBe(canvas.getAttribute('data-room-tactical-hint'));
    });

    it('sets room hazard telemetry attributes to 0, "none", and standard asphalt hint for empty room', () => {
      document.body.innerHTML = `
        <div id="game-wrapper">
          <canvas id="minimap-canvas" width="240" height="150"></canvas>
          <div id="hud-sector-biome"></div>
        </div>
      `;

      const canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
      const sectorBiome = document.getElementById('hud-sector-biome') as HTMLElement;
      const mockCtx = {
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        fillRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        fill: vi.fn(),
        closePath: vi.fn(),
        arc: vi.fn(),
        fillText: vi.fn(),
        strokeText: vi.fn(),
        measureText: vi.fn().mockReturnValue({ width: 24 }),
        rect: vi.fn(),
        roundRect: vi.fn(),
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        lineCap: 'round',
        shadowColor: '',
        shadowBlur: 0,
        font: '',
        textAlign: 'left',
        textBaseline: 'alphabetic',
        lineJoin: 'miter'
      };
      vi.spyOn(canvas, 'getContext').mockReturnValue(mockCtx as any);

      const hud = new HUDController();
      const emptyRoom = makeRoom({
        x: 1,
        y: 0,
        type: 'combat',
        obstacles: [],
        doors: makeDoors({ W: true })
      });

      const dungeon: DungeonGrid = {
        '1,0': emptyRoom
      };

      hud.renderMinimap(dungeon, 1, 0, 1);

      expect(canvas.getAttribute('data-room-hazards')).toBe('0');
      expect(canvas.getAttribute('data-room-zones')).toBe('none');
      expect(canvas.getAttribute('data-room-tactical-hint')).toBe('Clear asphalt sector — standard traction.');

      expect(sectorBiome.getAttribute('data-room-hazards')).toBe('0');
      expect(sectorBiome.getAttribute('data-room-zones')).toBe('none');
      expect(sectorBiome.getAttribute('data-room-tactical-hint')).toBe('Clear asphalt sector — standard traction.');
    });

    it('gracefully handles missing room coordinates and non-existent DOM elements', () => {
      document.body.innerHTML = `
        <div id="game-wrapper">
          <div id="hud-sector-biome"></div>
        </div>
      `;

      const sectorBiome = document.getElementById('hud-sector-biome') as HTMLElement;
      const hud = new HUDController();
      const dungeon: DungeonGrid = {};

      // Coordinates 5,5 do not exist in dungeon
      hud.renderMinimap(dungeon, 5, 5, 2);

      expect(sectorBiome.getAttribute('data-room-hazards')).toBe('0');
      expect(sectorBiome.getAttribute('data-room-zones')).toBe('none');
      expect(sectorBiome.getAttribute('data-room-tactical-hint')).toBe('Clear asphalt sector — standard traction.');
    });
  });

  describe('Vector Art Color Parsing', () => {
    it('parses hex strings to numeric colors', () => {
      expect(parseColor('#ffd166')).toBe(0xffd166);
      expect(parseColor('#00f5d4')).toBe(0x00f5d4);
      expect(parseColor('#0a0b10')).toBe(0x0a0b10);
    });

    it('falls back gracefully on empty or malformed input', () => {
      expect(parseColor('')).toBe(0xffffff);
      expect(parseColor('invalid', 0x123456)).toBe(0x123456);
    });
  });

  describe('Tooltip Manager Content Generation', () => {
    let tooltip: TooltipManager;

    beforeEach(() => {
      tooltip = new TooltipManager('tooltip');
    });

    it('generates HTML for mod pedestal pickups', () => {
      const pickup: Pickup = {
        x: 100,
        y: 100,
        radius: 20,
        type: 'mod_pedestal',
        mod: {
          id: 'turbo_charger',
          name: 'Nitrous Injector',
          desc: '+16% Bike Speed',
          cost: 14,
          apply: vi.fn()
        },
        cost: 14
      };

      const html = tooltip.formatPickupTooltip(pickup);
      expect(html).toContain('Nitrous Injector');
      expect(html).toContain('+16% Bike Speed');
      expect(html).toContain('Cost: 14 coins');
    });

    it('generates HTML for free mod pedestals', () => {
      const pickup: Pickup = {
        x: 100,
        y: 100,
        radius: 20,
        type: 'mod_pedestal',
        mod: {
          id: 'hollow_point',
          name: 'Hollow-Point Rounds',
          desc: '+25% Weapon Damage',
          cost: 18,
          apply: vi.fn()
        },
        cost: 0
      };

      const html = tooltip.formatPickupTooltip(pickup);
      expect(html).toContain('Free');
    });

    it('generates HTML for loot equipment crate', () => {
      const pickup: Pickup = {
        x: 100,
        y: 100,
        radius: 20,
        type: 'loot',
        item: {
          slot: 'tires',
          rarity: 2, // Rare
          name: 'Racing Tires',
          stats: { speed: 0.15 }
        }
      };

      const html = tooltip.formatPickupTooltip(pickup);
      expect(html).toContain('Rare Racing Tires');
      expect(html).toContain('Speed');
    });

    it('generates HTML for heart and shop_heart pickups', () => {
      const heart: Pickup = { x: 50, y: 50, radius: 10, type: 'heart' };
      const shopHeart: Pickup = {
        x: 50,
        y: 50,
        radius: 10,
        type: 'shop_heart',
        name: 'Hull Repair',
        cost: 12
      };

      expect(tooltip.formatPickupTooltip(heart)).toContain('Gas Can');
      expect(tooltip.formatPickupTooltip(shopHeart)).toContain('Hull Repair');
      expect(tooltip.formatPickupTooltip(shopHeart)).toContain('Cost: 12 coins');
    });

    it('renders choice pedestal badge, kiss-curse statDeltas, and overclock evolution badge in tooltips', () => {
      const pickup: any = {
        x: 100,
        y: 100,
        radius: 20,
        type: 'mod_pedestal',
        choiceGroup: 'treasure_choice_1',
        mod: {
          id: 'bounce_rounds',
          name: 'Rubberized Casings',
          desc: '+1 Wall Ricochet',
          cost: 0,
          statDeltas: { bounce: 1, dmgMult: -0.1 },
          apply: vi.fn()
        },
        cost: 0
      };

      const html = tooltip.formatPickupTooltip(pickup);
      expect(html).toContain('⚖️ CHOICE PEDESTAL — OTHER DESPAWNS');
      expect(html).toContain('⚡ OVERCLOCK EVOLUTION MOD');
      expect(html).toContain('#06d6a0');
      expect(html).toContain('#ff4d6d');
    });
  });

  describe('Shop Modal Controller', () => {
    it('manages open, confirm, and cancel states with callbacks', () => {
      const modal = new ShopModalController();
      const onConfirm = vi.fn();
      const onCancel = vi.fn();

      const pickup: Pickup = {
        x: 100,
        y: 100,
        radius: 20,
        type: 'shop_heart',
        name: 'Hull Repair',
        cost: 10
      };

      modal.open(pickup, onConfirm, onCancel);
      expect(modal.isOpen()).toBe(true);
      expect(modal.getActivePickup()).toBe(pickup);

      modal.confirm();
      expect(onConfirm).toHaveBeenCalledTimes(1);
      expect(modal.isOpen()).toBe(false);

      // Cancel check
      modal.open(pickup, onConfirm, onCancel);
      modal.cancel();
      expect(onCancel).toHaveBeenCalledTimes(1);
      expect(modal.isOpen()).toBe(false);
    });
  });

  describe('Stage Hierarchy & Filter Manager', () => {
    it('instantiates StageManager with strict 6-layer ordering', () => {
      const stage = new StageManager();
      expect(stage.floorLayer).toBeDefined();
      expect(stage.skidLayer).toBeDefined();
      expect(stage.shadowLayer).toBeDefined();
      expect(stage.entityLayer).toBeDefined();
      expect(stage.vfxLayer).toBeDefined();
      expect(stage.hudLayer).toBeDefined();
    });

    it('FilterManager manages impact flash timer decay', () => {
      const fm = new FilterManager();
      expect(fm.isImpactActive()).toBe(false);

      fm.triggerImpactFlash(0.08);
      expect(fm.isImpactActive()).toBe(true);

      fm.update(0.04);
      expect(fm.isImpactActive()).toBe(true);

      fm.update(0.05);
      expect(fm.isImpactActive()).toBe(false);
    });

    it('renders 5-tier VFX z-order (enemyBullets on top), enemy hit-flash/telegraph, choice tether, and bike drift/lock arc', () => {
      const stage = new StageManager();
      const hitSparkSpy = vi.spyOn(stage.vfx, 'addHitSpark');
      const g = (stage as any).vfxGraphics;
      const circleSpy = vi.spyOn(g, 'circle');
      const strokeSpy = vi.spyOn(g, 'stroke');

      const dummyPlayer: any = {
        x: 360,
        y: 360,
        vx: 0,
        vy: 0,
        radius: 17,
        bikeAngle: 0,
        aimAngle: 0,
        weapon: 'pistol',
        nos: 0,
        nosMax: 100,
        nosLock: true,
        driftCharge: 0.96,
        driftBoostTimer: 0
      };
      const dummyRoom: any = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        doors: {},
        obstacles: [],
        hazards: [],
        skids: [],
        pickups: [
          { x: 260, y: 360, radius: 18, type: 'mod_pedestal', choiceGroup: 'cg1', cost: 0, mod: { id: 'm1', name: 'M1', desc: '', cost: 0, apply: vi.fn() } },
          { x: 460, y: 360, radius: 18, type: 'mod_pedestal', choiceGroup: 'cg1', cost: 0, mod: { id: 'm2', name: 'M2', desc: '', cost: 0, apply: vi.fn() } }
        ],
        enemies: [
          {
            x: 200,
            y: 200,
            vx: 0,
            vy: 0,
            radius: 28,
            type: 'boss',
            hp: 40,
            maxHp: 100,
            phase: 2,
            hitFlashTimer: 0.08,
            telegraphTimer: 0.25
          }
        ]
      };

      (stage as any).renderPickups(g, dummyRoom.pickups, 1000);
      (stage as any).renderEnemies(g, dummyRoom.enemies, 1000);
      expect(hitSparkSpy).toHaveBeenCalledWith(200, 200, 0x00f5d4, 4);

      (stage as any).renderPlayer(g, dummyPlayer, 1000);
      (stage as any).renderVFX(
        g,
        dummyPlayer,
        dummyRoom,
        [{ x: 100, y: 100, vx: 1, vy: 0, radius: 4, dmg: 1, life: 1, maxLife: 1, color: '#ffd166', pierce: 0, bounce: 0 }],
        [{ x: 300, y: 300, vx: -1, vy: 0, radius: 5, dmg: 1, color: '#ef233c' }],
        [],
        [],
        [{ x: 150, y: 150, vx: 0, vy: 0, radius: 3, life: 0.5, maxLife: 1, color: '#ffffff' }],
        [],
        1000
      );

      // Verify enemy bullet (300, 300) was drawn after particle (150, 150)
      const calls = circleSpy.mock.calls.map(c => `${c[0]},${c[1]}`);
      const partIdx = calls.lastIndexOf('150,150');
      const ebIdx = calls.lastIndexOf('300,300');
      expect(ebIdx).toBeGreaterThan(partIdx);
      expect(strokeSpy).toHaveBeenCalled();
    });
  });

  describe('GarageController & Game Over Polish', () => {
    let callbacks: any;
    let metaSave: MetaSaveState;
    let player: PlayerState;

    beforeEach(() => {
      document.body.innerHTML = `
        <div id="garage-overlay">
          <div class="overlay-card garage-card">
            <header class="gx-header">
              <div class="gx-banner">
                <h1 id="modal-title">GARAGE BAY</h1>
                <span class="gx-banner-stripes"></span>
              </div>
              <div class="gx-ko" id="garage-ko" hidden>
                <span class="gx-ko-main">K.O.</span>
                <span class="gx-ko-sub" id="garage-ko-floor">RUN OVER</span>
              </div>
              <div class="gx-scrap">
                <span class="gx-scrap-val" id="modal-scrap">0</span>
              </div>
            </header>
            <div class="bay gx-bay">
              <div class="slot-col" id="slots-left"></div>
              <canvas id="bike-canvas" width="300" height="190"></canvas>
              <div class="slot-col" id="slots-right"></div>
            </div>
            <div id="eq-totals"></div>
            <div id="meta-upgrade-list"></div>
            <div id="unlock-list"></div>
            <div id="stash-list"></div>
            <div class="gx-actions">
              <button id="btn-resume">Resume</button>
              <button id="btn-back">Back</button>
              <button id="btn-new-run">New Run</button>
              <button id="btn-reset-save">Reset</button>
            </div>
          </div>
        </div>
      `;

      callbacks = {
        onEquipItem: vi.fn(),
        onUnequipSlot: vi.fn(),
        onSellItem: vi.fn(),
        onUnlockWeapon: vi.fn(),
        onEquipWeapon: vi.fn(),
        onBuyUpgrade: vi.fn(),
        onResumeRun: vi.fn(),
        onNewRun: vi.fn(),
        onResetSave: vi.fn(),
        onPlayUiClick: vi.fn(),
        onPlayShopBuy: vi.fn()
      };

      metaSave = {
        scrap: 120,
        unlocked: {
          machine_gun: true,
          shotgun: false,
          flamethrower: false,
          railgun: false,
          grenade_launcher: false,
          arc_coil: false
        },
        ranks: { dmg: 2, fireRate: 1, speed: 0, maxHp: 0 },
        equipped: {
          tires: { slot: 'tires', rarity: 3, name: 'Apex Tires', stats: { speed: 0.25 } }
        },
        stash: [
          { slot: 'engine', rarity: 1, name: 'Sport Engine', stats: { dmg: 0.1 } }
        ]
      };

      player = {
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
        coins: 10,
        invuln: 0,
        weapon: 'machine_gun',
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
        nosDelay: 0
      };
    });

    it('opens garage, renders title "GARAGE BAY", scrap count, and equipment slots', () => {
      const garage = new GarageController(callbacks);
      garage.open(false, 1, metaSave, player);

      expect(garage.isOpen()).toBe(true);
      const title = document.getElementById('modal-title');
      expect(title?.textContent).toBe('GARAGE BAY');

      const scrap = document.getElementById('modal-scrap');
      expect(scrap?.textContent).toBe('120');

      const leftSlots = document.getElementById('slots-left');
      expect(leftSlots?.children.length).toBe(3); // tires, engine, exhaust

      const rightSlots = document.getElementById('slots-right');
      expect(rightSlots?.children.length).toBe(3); // handlebars, frame, tank

      // Tires equipped
      const tiresSlot = leftSlots?.firstElementChild as HTMLElement;
      expect(tiresSlot.className).toContain('is-filled');
      expect(tiresSlot.className).toContain('rarity-legendary');
      expect(tiresSlot.innerHTML).toContain('TIRES');

      // Engine empty
      const engineSlot = leftSlots?.children[1] as HTMLElement;
      expect(engineSlot.className).toContain('is-empty');
      expect(engineSlot.innerHTML).toContain('ENGINE');
    });

    it('displays dramatic K.O. / RUN OVER defeat header when isDead is true', () => {
      const garage = new GarageController(callbacks);
      garage.open(true, 3, metaSave, player);

      const ko = document.getElementById('garage-ko');
      expect(ko?.hidden).toBe(false);

      const koFloor = document.getElementById('garage-ko-floor');
      expect(koFloor?.textContent).toContain('RUN OVER · FLOOR 3');

      const resumeBtn = document.getElementById('btn-resume');
      expect(resumeBtn?.innerHTML).toContain('RIDE OUT (NEW RUN)');
      expect(resumeBtn?.innerHTML).toContain('[ENTER]');
    });

    it('hides K.O. burst and shows standard RIDE OUT when alive', () => {
      const garage = new GarageController(callbacks);
      garage.open(false, 2, metaSave, player);

      const ko = document.getElementById('garage-ko');
      expect(ko?.hidden).toBe(true);

      const resumeBtn = document.getElementById('btn-resume');
      expect(resumeBtn?.innerHTML).toContain('RIDE OUT');
      expect(resumeBtn?.innerHTML).not.toContain('NEW RUN');
    });

    it('renders TUNING upgrades with rank pips and UPGRADE buttons', () => {
      const garage = new GarageController(callbacks);
      garage.open(false, 1, metaSave, player);

      const list = document.getElementById('meta-upgrade-list');
      expect(list?.children.length).toBeGreaterThan(0);

      const firstRow = list?.firstElementChild as HTMLElement;
      expect(firstRow.innerHTML).toContain('RANK PIPS');
      expect(firstRow.querySelector('.gx-upgrade-btn')).not.toBeNull();
      expect(firstRow.querySelectorAll('.gx-pip.on').length).toBe(2);
    });

    it('renders ARMORY weapons with locks for locked and equip button for unlocked', () => {
      const garage = new GarageController(callbacks);
      garage.open(false, 1, metaSave, player);

      const list = document.getElementById('unlock-list');
      expect(list?.children.length).toBe(6);

      const mg = list?.firstElementChild as HTMLElement; // machine_gun is unlocked & equipped
      expect(mg.className).toContain('is-equipped');
      expect(mg.textContent).toContain('Equipped');

      const shotgun = list?.children[1] as HTMLElement; // shotgun is locked
      expect(shotgun.className).toContain('is-locked');
      expect(shotgun.querySelector('.gx-lock')).not.toBeNull();
      expect(shotgun.querySelector('.gx-price')).not.toBeNull();
    });

    it('triggers resume or new run on action button clicks and closes overlay', () => {
      const garage = new GarageController(callbacks);
      garage.open(false, 1, metaSave, player);

      const resumeBtn = document.getElementById('btn-resume');
      resumeBtn?.click();
      expect(callbacks.onResumeRun).toHaveBeenCalledTimes(1);
      expect(garage.isOpen()).toBe(false);

      // Dead run check
      garage.open(true, 1, metaSave, player);
      resumeBtn?.click();
      expect(callbacks.onNewRun).toHaveBeenCalledTimes(1);
      expect(garage.isOpen()).toBe(false);
    });

    it('triggers close on [ESC] BACK button click', () => {
      const garage = new GarageController(callbacks);
      garage.open(false, 1, metaSave, player);

      const backBtn = document.getElementById('btn-back');
      backBtn?.click();
      expect(garage.isOpen()).toBe(false);
    });

    it('renders live stat-diff upgrade/downgrade badges on stash items and enforces 2-step safe reset', () => {
      metaSave.stash = [
        { slot: 'engine', rarity: 2, name: 'Racing Engine', stats: { dmg: 0.2 } },
        { slot: 'tires', rarity: 0, name: 'Worn Tires', stats: { speed: 0.05 } }
      ];
      const garage = new GarageController(callbacks);
      garage.open(false, 1, metaSave, player);

      const stashItems = document.querySelectorAll('#stash-list .stash-item');
      expect(stashItems.length).toBe(2);
      // Engine slot is empty -> ▲ UPGRADE
      expect(stashItems[0].innerHTML).toContain('gx-stash-diff is-up');
      expect(stashItems[0].innerHTML).toContain('▲ UPGRADE');
      // Tires slot has Legendary Apex Tires (0.25) vs Worn Tires (0.05) -> ▼ downgrade
      expect(stashItems[1].innerHTML).toContain('gx-stash-diff is-down');
      expect(stashItems[1].innerHTML).toContain('▼');

      // 2-step reset confirmation
      const resetBtn = document.getElementById('btn-reset-save') as HTMLButtonElement;
      resetBtn.click();
      expect(callbacks.onResetSave).not.toHaveBeenCalled();
      expect(resetBtn.textContent).toBe('CONFIRM FULL RESET?');

      resetBtn.click();
      expect(callbacks.onResetSave).toHaveBeenCalledTimes(1);
    });

    it('renders weapon mastery badge and data-mastery-tier attribute for unlocked and locked weapons', () => {
      (metaSave as any).weaponKills = {
        machine_gun: 120,
        shotgun: 45,
        flamethrower: 12,
        railgun: 0
      };

      const garage = new GarageController(callbacks);
      garage.open(false, 1, metaSave, player);

      const list = document.getElementById('unlock-list');
      expect(list).not.toBeNull();
      const rows = list?.querySelectorAll('.unlock-item.gx-weapon');
      expect(rows?.length).toBe(6);

      // machine_gun: 120 kills -> Tier 3 MASTER III (★★★)
      const mgRow = rows?.[0] as HTMLElement;
      expect(mgRow.getAttribute('data-mastery-tier')).toBe('3');
      const mgBadge = mgRow.querySelector('.gx-weapon-mastery');
      expect(mgBadge).not.toBeNull();
      expect(mgBadge?.className).toContain('tier-3');
      expect(mgBadge?.textContent).toContain('★★★ MASTER III (+15% DMG) · 120 KILLS');

      // shotgun: 45 kills -> Tier 2 ADEPT II (★★☆)
      const shotgunRow = rows?.[1] as HTMLElement;
      expect(shotgunRow.getAttribute('data-mastery-tier')).toBe('2');
      const shotgunBadge = shotgunRow.querySelector('.gx-weapon-mastery');
      expect(shotgunBadge?.className).toContain('tier-2');
      expect(shotgunBadge?.textContent).toContain('★★☆ ADEPT II (+10% DMG) · 45 KILLS');

      // flamethrower: 12 kills -> Tier 1 ROOKIE I (★☆☆)
      const flameRow = rows?.[2] as HTMLElement;
      expect(flameRow.getAttribute('data-mastery-tier')).toBe('1');
      const flameBadge = flameRow.querySelector('.gx-weapon-mastery');
      expect(flameBadge?.className).toContain('tier-1');
      expect(flameBadge?.textContent).toContain('★☆☆ ROOKIE I (+5% DMG) · 12 KILLS');

      // railgun: 0 kills -> Tier 0 UNRANKED (☆☆☆)
      const railgunRow = rows?.[3] as HTMLElement;
      expect(railgunRow.getAttribute('data-mastery-tier')).toBe('0');
      const railgunBadge = railgunRow.querySelector('.gx-weapon-mastery');
      expect(railgunBadge?.className).toContain('tier-0');
      expect(railgunBadge?.textContent).toContain('☆☆☆ UNRANKED · 0 KILLS');
      // No (+0% DMG) text when dmgBonusPct is 0
      expect(railgunBadge?.textContent).not.toContain('+0% DMG');
    });

    it('sets telemetry attributes (data-stash-count, data-downgrade-count, data-total-salvage, data-highest-rarity) on #stash-list', () => {
      // Empty stash case
      metaSave.stash = [];
      const garage = new GarageController(callbacks);
      garage.open(false, 1, metaSave, player);

      const stashList = document.getElementById('stash-list');
      expect(stashList).not.toBeNull();
      expect(stashList?.getAttribute('data-stash-count')).toBe('0');
      expect(stashList?.getAttribute('data-downgrade-count')).toBe('0');
      expect(stashList?.getAttribute('data-total-salvage')).toBe('0');
      expect(stashList?.getAttribute('data-highest-rarity')).toBe('-1');

      // Populated stash case: 1 Common (sell 3) + 1 Rare (sell 18) + 1 Legendary (sell 40) = 61 scrap, highest rarity 3
      metaSave.stash = [
        { slot: 'frame', rarity: 0, name: 'Stock Frame', stats: { hp: 1 } },
        { slot: 'engine', rarity: 2, name: 'Racing Engine', stats: { dmg: 0.2 } },
        { slot: 'tires', rarity: 3, name: 'Apex Tires', stats: { speed: 0.25 } }
      ];
      garage.render(metaSave, player);

      expect(stashList?.getAttribute('data-stash-count')).toBe('3');
      expect(stashList?.getAttribute('data-downgrade-count')).toBe('0');
      expect(stashList?.getAttribute('data-total-salvage')).toBe('61');
      expect(stashList?.getAttribute('data-highest-rarity')).toBe('3');
    });

    it('sets data-downgrade-count and data-is-downgrade attributes on stash cards correctly', () => {
      metaSave.equipped = {
        engine: { slot: 'engine', rarity: 2, name: 'High-End Engine', stats: { dmg: 0.18 } },
        tires: { slot: 'tires', rarity: 1, name: 'Standard Tires', stats: { speed: 0.1 } },
        exhaust: { slot: 'exhaust', rarity: 1, name: 'Stock Exhaust', stats: { speed: 0.1 } }
      };

      metaSave.stash = [
        // Downgrade: engine with dmg 0.06 < equipped dmg 0.18
        { slot: 'engine', rarity: 0, name: 'Rusty Engine', stats: { dmg: 0.06 } },
        // Upgrade: tires with speed 0.25 > equipped speed 0.10
        { slot: 'tires', rarity: 3, name: 'Apex Tires', stats: { speed: 0.25 } },
        // Equal: exhaust with speed 0.10 == equipped speed 0.10
        { slot: 'exhaust', rarity: 1, name: 'Matching Exhaust', stats: { speed: 0.1 } },
        // Unequipped slot: frame is empty in equipped -> not a downgrade
        { slot: 'frame', rarity: 0, name: 'Standard Frame', stats: { hp: 1 } }
      ];

      const garage = new GarageController(callbacks);
      garage.open(false, 1, metaSave, player);

      const stashList = document.getElementById('stash-list');
      expect(stashList).not.toBeNull();
      expect(stashList?.getAttribute('data-stash-count')).toBe('4');
      // Only 1 item (Rusty Engine) is a downgrade
      expect(stashList?.getAttribute('data-downgrade-count')).toBe('1');

      const cards = stashList?.querySelectorAll('.stash-item');
      expect(cards?.length).toBe(4);

      // card 0: Rusty Engine -> downgrade
      expect(cards?.[0].getAttribute('data-is-downgrade')).toBe('true');
      // card 1: Apex Tires -> upgrade
      expect(cards?.[1].getAttribute('data-is-downgrade')).toBe('false');
      // card 2: Matching Exhaust -> equal
      expect(cards?.[2].getAttribute('data-is-downgrade')).toBe('false');
      // card 3: Standard Frame -> unequipped slot
      expect(cards?.[3].getAttribute('data-is-downgrade')).toBe('false');
    });
  });

  describe('Garage Stash Salvage Telemetry Math (getStashSalvageSummary)', () => {
    it('returns zero values and highestRarity -1 for empty or invalid stashes', () => {
      expect(getStashSalvageSummary([])).toEqual({
        itemCount: 0,
        totalSalvageScrap: 0,
        highestRarity: -1
      });
      expect(getStashSalvageSummary(undefined as any)).toEqual({
        itemCount: 0,
        totalSalvageScrap: 0,
        highestRarity: -1
      });
      expect(getStashSalvageSummary(null as any)).toEqual({
        itemCount: 0,
        totalSalvageScrap: 0,
        highestRarity: -1
      });
      expect(getStashSalvageSummary('invalid' as any)).toEqual({
        itemCount: 0,
        totalSalvageScrap: 0,
        highestRarity: -1
      });
    });

    it('correctly sums scrap salvage values and identifies highest rarity tier', () => {
      const summary: StashSalvageSummary = getStashSalvageSummary([
        { slot: 'frame', rarity: 0, name: 'Common Frame', stats: {} },       // sell: 3, rarity 0
        { slot: 'handlebars', rarity: 1, name: 'Magic Bars', stats: {} },    // sell: 8, rarity 1
        { slot: 'engine', rarity: 2, name: 'Rare Engine', stats: {} },       // sell: 18, rarity 2
        { slot: 'tires', rarity: 3, name: 'Legendary Tires', stats: {} },    // sell: 40, rarity 3
      ]);

      expect(summary).toEqual({
        itemCount: 4,
        totalSalvageScrap: 69, // 3 + 8 + 18 + 40
        highestRarity: 3
      });
    });

    it('handles single-item stash and defaults item rarity gracefully', () => {
      const single = getStashSalvageSummary([
        { slot: 'tank', rarity: 1, name: 'Magic Tank', stats: {} }
      ]);
      expect(single).toEqual({
        itemCount: 1,
        totalSalvageScrap: 8,
        highestRarity: 1
      });

      const missingRarity = getStashSalvageSummary([
        { slot: 'exhaust', name: 'Unknown Exhaust', stats: {} } as any
      ]);
      expect(missingRarity).toEqual({
        itemCount: 1,
        totalSalvageScrap: 3, // defaults to rarity 0 -> sell 3
        highestRarity: 0
      });
    });
  });

  describe('Garage Stash Salvage Downgrades Filter (getDowngradeStashItems)', () => {
    it('returns empty array for empty or invalid stashes or missing equipped map', () => {
      expect(getDowngradeStashItems([], {})).toEqual([]);
      expect(getDowngradeStashItems(undefined as any, {})).toEqual([]);
      expect(getDowngradeStashItems(null as any, {})).toEqual([]);
      expect(getDowngradeStashItems('invalid' as any, {})).toEqual([]);
      expect(getDowngradeStashItems([
        { slot: 'frame', rarity: 0, name: 'Frame', stats: { hp: 1 } } as EquipmentItem
      ], undefined as any)).toEqual([]);
      expect(getDowngradeStashItems([
        { slot: 'frame', rarity: 0, name: 'Frame', stats: { hp: 1 } } as EquipmentItem
      ], null as any)).toEqual([]);
    });

    it('returns empty array when equipped slots are empty, null, or undefined', () => {
      const stash: EquipmentItem[] = [
        { slot: 'frame', rarity: 0, name: 'Frame', stats: { hp: 1 } },
        { slot: 'tires', rarity: 1, name: 'Tires', stats: { speed: 0.1 } }
      ];
      const equipped = {
        frame: null,
        tires: undefined
      };
      expect(getDowngradeStashItems(stash, equipped)).toEqual([]);
    });

    it('does not include higher-score stash items (upgrades)', () => {
      const stash: EquipmentItem[] = [
        { slot: 'engine', rarity: 2, name: 'Upgrade Engine', stats: { dmg: 0.24 } }
      ];
      const equipped = {
        engine: { slot: 'engine' as const, rarity: 1 as const, name: 'Stock Engine', stats: { dmg: 0.06 } }
      };
      expect(getDowngradeStashItems(stash, equipped)).toEqual([]);
    });

    it('does not include equal-score stash items', () => {
      const stash: EquipmentItem[] = [
        { slot: 'tank', rarity: 1, name: 'Twin Tank', stats: { hp: 2 } }
      ];
      const equipped = {
        tank: { slot: 'tank' as const, rarity: 1 as const, name: 'Current Tank', stats: { hp: 2 } }
      };
      expect(getDowngradeStashItems(stash, equipped)).toEqual([]);
    });

    it('correctly returns strictly lower-score stash items (downgrades)', () => {
      const downgradeItem: EquipmentItem = { slot: 'exhaust', rarity: 0, name: 'Rusty Pipe', stats: { speed: 0.05 } };
      const stash: EquipmentItem[] = [downgradeItem];
      const equipped = {
        exhaust: { slot: 'exhaust' as const, rarity: 2 as const, name: 'Titanium Exhaust', stats: { speed: 0.15 } }
      };
      expect(getDowngradeStashItems(stash, equipped)).toEqual([downgradeItem]);
    });

    it('filters mixed stash containing upgrades, downgrades, equal scores, and unequipped slots', () => {
      const downgrade1: EquipmentItem = { slot: 'frame', rarity: 0, name: 'Basic Frame', stats: { hp: 1 } };
      const downgrade2: EquipmentItem = { slot: 'exhaust', rarity: 1, name: 'Old Pipe', stats: { speed: 0.05 } };
      const upgrade: EquipmentItem = { slot: 'engine', rarity: 3, name: 'Supercharged V8', stats: { dmg: 0.36 } };
      const equalItem: EquipmentItem = { slot: 'tires', rarity: 2, name: 'Equal Tires', stats: { speed: 0.2 } };
      const unequippedSlotItem: EquipmentItem = { slot: 'tank', rarity: 2, name: 'Big Tank', stats: { hp: 3 } };

      const stash: EquipmentItem[] = [downgrade1, upgrade, equalItem, downgrade2, unequippedSlotItem];
      const equipped = {
        frame: { slot: 'frame' as const, rarity: 2 as const, name: 'Reinforced Frame', stats: { hp: 3 } },
        exhaust: { slot: 'exhaust' as const, rarity: 2 as const, name: 'Dual Exhaust', stats: { speed: 0.15 } },
        engine: { slot: 'engine' as const, rarity: 1 as const, name: 'Stock Engine', stats: { dmg: 0.06 } },
        tires: { slot: 'tires' as const, rarity: 2 as const, name: 'Stock Tires', stats: { speed: 0.2 } },
        tank: null
      };

      const result = getDowngradeStashItems(stash, equipped);
      expect(result).toEqual([downgrade1, downgrade2]);
    });
  });

  describe('Weapon Mastery Tier Math & Thresholds', () => {
    it('returns UNRANKED tier 0 for 0 kills, negative numbers, or invalid inputs', () => {
      expect(getWeaponMasteryTier(0)).toEqual({
        tier: 0,
        label: 'UNRANKED',
        stars: '☆☆☆',
        dmgBonusPct: 0,
        kills: 0
      });
      expect(getWeaponMasteryTier(-15)).toEqual({
        tier: 0,
        label: 'UNRANKED',
        stars: '☆☆☆',
        dmgBonusPct: 0,
        kills: 0
      });
      expect(getWeaponMasteryTier(NaN as any)).toEqual({
        tier: 0,
        label: 'UNRANKED',
        stars: '☆☆☆',
        dmgBonusPct: 0,
        kills: 0
      });
      expect(getWeaponMasteryTier(undefined as any)).toEqual({
        tier: 0,
        label: 'UNRANKED',
        stars: '☆☆☆',
        dmgBonusPct: 0,
        kills: 0
      });
    });

    it('returns ROOKIE I tier 1 for 10-39 kills with +5% DMG', () => {
      expect(getWeaponMasteryTier(10)).toEqual({
        tier: 1,
        label: 'ROOKIE I',
        stars: '★☆☆',
        dmgBonusPct: 5,
        kills: 10
      });
      expect(getWeaponMasteryTier(39.9)).toEqual({
        tier: 1,
        label: 'ROOKIE I',
        stars: '★☆☆',
        dmgBonusPct: 5,
        kills: 39
      });
    });

    it('returns ADEPT II tier 2 for 40-99 kills with +10% DMG', () => {
      expect(getWeaponMasteryTier(40)).toEqual({
        tier: 2,
        label: 'ADEPT II',
        stars: '★★☆',
        dmgBonusPct: 10,
        kills: 40
      });
      expect(getWeaponMasteryTier(99)).toEqual({
        tier: 2,
        label: 'ADEPT II',
        stars: '★★☆',
        dmgBonusPct: 10,
        kills: 99
      });
    });

    it('returns MASTER III tier 3 for 100+ kills with +15% DMG', () => {
      expect(getWeaponMasteryTier(100)).toEqual({
        tier: 3,
        label: 'MASTER III',
        stars: '★★★',
        dmgBonusPct: 15,
        kills: 100
      });
      expect(getWeaponMasteryTier(500)).toEqual({
        tier: 3,
        label: 'MASTER III',
        stars: '★★★',
        dmgBonusPct: 15,
        kills: 500
      });
    });
  });

  describe('Cryo Barrel vs Explosive Barrel & Per-Floor Ambient Motes Polish', () => {
    it('draws explosive TNT barrel with red body and gold hazard markings', () => {
      const g = new Graphics();
      const fillSpy = vi.spyOn(g, 'fill');
      const strokeSpy = vi.spyOn(g, 'stroke');

      const tntBarrel: Obstacle = {
        x: 100,
        y: 100,
        size: 24,
        type: 'barrel',
        variant: 'explosive',
        hp: 1
      };

      drawObstacle(g, tntBarrel);

      const fillColors = fillSpy.mock.calls.map(c => (c[0] as any)?.color);
      const strokeColors = strokeSpy.mock.calls.map(c => (c[0] as any)?.color);

      // Red barrel body & yellow hazard
      expect(fillColors).toContain(0xc92a37);
      expect(strokeColors).toContain(0xffd166);
      expect(strokeColors).toContain(0x0a0b10);
      // Explosive barrel should not have icy cyan body
      expect(fillColors).not.toContain(0x00bbf9);
    });

    it('draws cryo_barrel with high-contrast icy cyan body, dark comic outline, and white frost diamond & snowflake chevrons', () => {
      const g = new Graphics();
      const fillSpy = vi.spyOn(g, 'fill');
      const strokeSpy = vi.spyOn(g, 'stroke');
      const polySpy = vi.spyOn(g, 'poly');

      const cryoBarrel: Obstacle = {
        x: 150,
        y: 150,
        size: 24,
        type: 'barrel',
        variant: 'cryo_barrel',
        hp: 1
      };

      drawObstacle(g, cryoBarrel);

      const fillColors = fillSpy.mock.calls.map(c => (c[0] as any)?.color);
      const strokeColors = strokeSpy.mock.calls.map(c => (c[0] as any)?.color);

      // High-contrast icy cyan body (0x00bbf9 / 0x72efdd)
      expect(fillColors).toContain(0x00bbf9);
      expect(fillColors).toContain(0x72efdd);
      // Dark comic ink outline
      expect(strokeColors).toContain(0x0a0b10);
      // White frost diamond fill (0xffffff)
      expect(fillColors).toContain(0xffffff);
      // White snowflake chevrons stroke
      expect(strokeColors).toContain(0xffffff);
      expect(polySpy).toHaveBeenCalled();
    });

    it('maps floor numbers 1 to 6+ to specified atmospheric ambient mote color palettes', () => {
      expect(getFloorMoteColor(1)).toBe(0xff9f1c); // Floor 1: Warm rust/amber dust
      expect(getFloorMoteColor(2)).toBe(0xff5400); // Floor 2: Smelter orange embers
      expect(getFloorMoteColor(3)).toBe(0x00f5d4); // Floor 3: Neon cyan cyber-streaks
      expect(getFloorMoteColor(4)).toBe(0x72efdd); // Floor 4: Crisp icy cryo crystals
      expect(getFloorMoteColor(5)).toBe(0xff2a4b); // Floor 5: Crimson magma sparks
      expect(getFloorMoteColor(6)).toBe(0xffd60a); // Floor 6+: Golden Valhalla stars/motes
      expect(getFloorMoteColor(7)).toBe(0xffd60a); // Floor 6+ extended
    });

    it('draws exactly 10 deterministic gently drifting ambient motes across the arena for floors 1–6', () => {
      const stage = new StageManager();
      const g = new Graphics();
      const circleSpy = vi.spyOn(g, 'circle');
      const fillSpy = vi.spyOn(g, 'fill');

      // Test floor 1 ambient motes
      stage.renderAmbientMotes(g, 1, 1000);

      // Verify outer mote circles filled with floor 1 color
      const floor1MoteCalls = fillSpy.mock.calls.filter(c => (c[0] as any)?.color === 0xff9f1c);
      expect(floor1MoteCalls.length).toBe(10);

      // Test floor 4 (cryo floor) ambient motes
      fillSpy.mockClear();
      stage.renderAmbientMotes(g, 4, 1000);
      const floor4MoteCalls = fillSpy.mock.calls.filter(c => (c[0] as any)?.color === 0x72efdd);
      expect(floor4MoteCalls.length).toBe(10);

      // Test floor 6+ golden motes
      fillSpy.mockClear();
      stage.renderAmbientMotes(g, 6, 1000);
      const floor6MoteCalls = fillSpy.mock.calls.filter(c => (c[0] as any)?.color === 0xffd60a);
      expect(floor6MoteCalls.length).toBe(10);

      // Verify gentle drift: positions at t=1000 vs t=5000 differ
      circleSpy.mockClear();
      stage.renderAmbientMotes(g, 1, 1000);
      const callsTime1 = circleSpy.mock.calls.map(c => `${c[0]},${c[1]}`);

      circleSpy.mockClear();
      stage.renderAmbientMotes(g, 1, 5000);
      const callsTime2 = circleSpy.mock.calls.map(c => `${c[0]},${c[1]}`);

      expect(callsTime1).not.toEqual(callsTime2);
    });

    it('renderArena delegates to renderFloor and includes ambient motes and obstacles', () => {
      const stage = new StageManager();
      const g = new Graphics();
      const fillSpy = vi.spyOn(g, 'fill');

      const dummyRoom: any = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        doors: {},
        obstacles: [
          { x: 200, y: 200, size: 24, type: 'barrel', variant: 'cryo_barrel', hp: 1 }
        ],
        hazards: [],
        skids: [],
        pickups: [],
        enemies: []
      };

      stage.renderArena(g, dummyRoom, 3, 2000);

      // Floor 3 motes color 0x00f5d4 present in fills
      const cyanMoteFills = fillSpy.mock.calls.filter(c => (c[0] as any)?.color === 0x00f5d4);
      expect(cyanMoteFills.length).toBeGreaterThanOrEqual(10);

      // Test renderObstacles method on stage
      fillSpy.mockClear();
      stage.renderObstacles(g, dummyRoom.obstacles);
      const cryoFills = fillSpy.mock.calls.filter(c => (c[0] as any)?.color === 0x00bbf9);
      expect(cryoFills.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Elite Halo & Biome Zone VFX Polish', () => {
    it('maps elite affixes to specified color hex values', () => {
      expect(getEliteAffixColor('volatile')).toBe(0xff9f1c);
      expect(getEliteAffixColor('overclocked')).toBe(0x00f5d4);
      expect(getEliteAffixColor('vampiric')).toBe(0xff1f4b);
      expect(getEliteAffixColor(undefined)).toBe(0xffd60a);
      expect(getEliteAffixColor('unknown')).toBe(0xffd60a);
    });

    it('renders color-coded outer affix halo ring for elite enemies in renderEnemies', () => {
      const stage = new StageManager();
      const g = (stage as any).entityGraphics;
      const circleSpy = vi.spyOn(g, 'circle');
      const strokeSpy = vi.spyOn(g, 'stroke');

      const enemies: any[] = [
        {
          x: 120,
          y: 140,
          radius: 20,
          type: 'rusher',
          isElite: true,
          eliteAffix: 'overclocked',
          hp: 50,
          maxHp: 50,
          angle: 0,
          burnTimer: 0
        },
        {
          x: 220,
          y: 240,
          radius: 18,
          type: 'swarmer',
          isElite: false,
          hp: 20,
          maxHp: 20,
          angle: 0,
          burnTimer: 0
        }
      ];

      (stage as any).renderEnemies(g, enemies, 1000);

      // Verify circle at (120, 140) with radius 20 + 5 = 25 was called
      expect(circleSpy).toHaveBeenCalledWith(120, 140, 25);

      // Verify stroke with overclocked color (0x00f5d4), width 2.2, alpha 0.85
      const haloStrokeCall = strokeSpy.mock.calls.find(c => {
        const opts = c[0] as any;
        return opts && opts.color === 0x00f5d4 && opts.width === 2.2 && opts.alpha === 0.85;
      });
      expect(haloStrokeCall).toBeDefined();

      // Verify non-elite enemy at (220, 240) does NOT get outer halo at radius 18 + 5 = 23
      expect(circleSpy).not.toHaveBeenCalledWith(220, 240, 23);
    });

    it('renders extra inner glowing chevron ring for boost_strip and specular ring for ice_patch', () => {
      const stage = new StageManager();
      const g = (stage as any).floorGraphics;
      const circleSpy = vi.spyOn(g, 'circle');
      const strokeSpy = vi.spyOn(g, 'stroke');

      const roomWithZones: any = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        doors: {},
        obstacles: [],
        hazards: [],
        skids: [],
        pickups: [],
        enemies: [],
        biomeZones: [
          { type: 'boost_strip', x: 250, y: 300, radius: 40 },
          { type: 'ice_patch', x: 450, y: 350, radius: 50 }
        ]
      };

      stage.renderFloor(g, roomWithZones, 1, 1000);

      // For boost_strip: inner chevron ring at radius * 0.55 = 40 * 0.55 = 22
      expect(circleSpy).toHaveBeenCalledWith(250, 300, 22);
      const boostStroke = strokeSpy.mock.calls.find(c => {
        const opts = c[0] as any;
        return opts && opts.color === 0xffffff && opts.width === 2 && opts.alpha === 0.75;
      });
      expect(boostStroke).toBeDefined();

      // For ice_patch: inner specular ring at radius * 0.6 = 50 * 0.6 = 30
      expect(circleSpy).toHaveBeenCalledWith(450, 350, 30);
      const iceStroke = strokeSpy.mock.calls.find(c => {
        const opts = c[0] as any;
        return opts && opts.color === 0xffffff && opts.width === 1.5 && opts.alpha === 0.65;
      });
      expect(iceStroke).toBeDefined();
    });
  });

  describe('HUD Weapon Deck Mastery & Floor Bounty Matrix', () => {
    let hud: HUDController;
    let player: PlayerState;

    beforeEach(() => {
      document.body.innerHTML = `
        <div id="weapon-bar"></div>
        <div id="hud-synergy-list"></div>
        <div id="synergy-list"></div>
        <div id="hp-text"></div>
        <div id="hud-lv-badge"></div>
        <div id="coin-count"></div>
        <div id="scrap-count"></div>
        <div id="floor-num"></div>
        <div id="stats-grid"></div>
        <div id="items-list"></div>
      `;
      hud = new HUDController();
      player = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 17,
        bikeAngle: 0,
        aimAngle: 0,
        baseSpeed: 265,
        hp: 6,
        maxHp: 6,
        coins: 10,
        invuln: 0,
        stunTimer: 0,
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
        livery: 'crimson_kaneda',
        heatLevel: 0
      };
    });

    it('renders weapon deck cards with Mastery hints in data-tip (☆☆☆ UNRANKED at 0 kills, ★★★ MASTER III at 120 kills)', () => {
      const metaSave: any = {
        unlocked: { pistol: true, machine_gun: true },
        weaponKills: {
          pistol: 0,
          machine_gun: 120
        }
      };

      hud.renderWeaponDeck(player, metaSave);

      const pistolCard = document.querySelector('[data-weapon="pistol"]') as HTMLElement;
      expect(pistolCard).not.toBeNull();
      const pistolTip = pistolCard.getAttribute('data-tip') || '';
      expect(pistolTip).toContain('Mastery:');
      expect(pistolTip).toContain('☆☆☆ UNRANKED');

      const smgCard = document.querySelector('[data-weapon="machine_gun"]') as HTMLElement;
      expect(smgCard).not.toBeNull();
      const smgTip = smgCard.getAttribute('data-tip') || '';
      expect(smgTip).toContain('Mastery:');
      expect(smgTip).toContain('★★★ MASTER III');
    });

    it('populates #hud-synergy-list with active Floor Bounty Contract (.is-bounty-contract) for Floor 1 and Floor 4', () => {
      const metaSave: any = { scrap: 50, unlocked: {}, weaponKills: {} };

      // Floor 1 -> NEON DAREDEVIL
      hud.updateSidebar(player, 1, metaSave);
      const hudList1 = document.getElementById('hud-synergy-list')!;
      const bountyRow1 = hudList1.querySelector('.is-bounty-contract') as HTMLElement;
      expect(bountyRow1).not.toBeNull();
      expect(bountyRow1.textContent).toContain('NEON DAREDEVIL');
      expect(bountyRow1.textContent).toContain('+8⚙️ +10🪙');
      expect(bountyRow1.getAttribute('data-tip')).toContain('NEON DAREDEVIL: Graze 3 enemy projectiles or clear Floor 1 Boss (Reward: +8 Scrap, +10 Coins)');

      // Floor 4 -> CRYO BREAKER
      hud.updateSidebar(player, 4, metaSave);
      const hudList4 = document.getElementById('hud-synergy-list')!;
      const bountyRow4 = hudList4.querySelector('.is-bounty-contract') as HTMLElement;
      expect(bountyRow4).not.toBeNull();
      expect(bountyRow4.textContent).toContain('CRYO BREAKER');
      expect(bountyRow4.textContent).toContain('+18⚙️ +22🪙');
      expect(bountyRow4.getAttribute('data-tip')).toContain('CRYO BREAKER: Detonate 2 Cryo/Explosive Barrels or clear Floor 4 Boss (Reward: +18 Scrap, +22 Coins)');
    });
  });

  describe('HUD Mod Stack Tier & Evolution Readiness (getModStackTierClass & updateMods)', () => {
    it('returns stack-tier-1 for count 1, and handles defaults/edge cases gracefully', () => {
      expect(getModStackTierClass(1)).toBe('stack-tier-1');
      expect(getModStackTierClass(0)).toBe('stack-tier-1');
      expect(getModStackTierClass(-2)).toBe('stack-tier-1');
      expect(getModStackTierClass(undefined)).toBe('stack-tier-1');
      expect(getModStackTierClass(NaN as any)).toBe('stack-tier-1');
    });

    it('returns stack-tier-2 for count 2', () => {
      expect(getModStackTierClass(2)).toBe('stack-tier-2');
      expect(getModStackTierClass(2.7)).toBe('stack-tier-2');
    });

    it('returns stack-tier-evo for count 3 and higher (count 3, count 5)', () => {
      const evoTier: ModStackTierClass = getModStackTierClass(3);
      expect(evoTier).toBe('stack-tier-evo');
      expect(getModStackTierClass(5)).toBe('stack-tier-evo');
      expect(getModStackTierClass(10)).toBe('stack-tier-evo');
    });

    it('applies stack-tier classes and data-stack-tier attribute to #mod-list elements when updating mods', () => {
      document.body.innerHTML = `
        <div id="mod-list"></div>
      `;

      const hud = new HUDController();
      const dummyPlayer: any = {
        items: [],
        itemStacks: {
          nitro_syringe: 3,
          gasoline: 2,
          chrome_lens: 1
        }
      };

      hud.updateMods(dummyPlayer);

      const list = document.getElementById('mod-list')!;
      expect(list).not.toBeNull();
      const chips = list.querySelectorAll('[data-stack-tier]');
      expect(chips.length).toBe(3);

      const evoChip = list.querySelector('[aria-label*="Nitro Syringe x3"]') || list.children[0];
      expect(evoChip.getAttribute('data-stack-tier')).toBe('stack-tier-evo');
      expect(evoChip.classList.contains('stack-tier-evo')).toBe(true);

      const tier2Chip = list.querySelector('[aria-label*="Gasoline x2"]') || list.children[1];
      expect(tier2Chip.getAttribute('data-stack-tier')).toBe('stack-tier-2');
      expect(tier2Chip.classList.contains('stack-tier-2')).toBe(true);

      const tier1Chip = list.querySelector('[aria-label*="Chrome Lens x1"]') || list.children[2];
      expect(tier1Chip.getAttribute('data-stack-tier')).toBe('stack-tier-1');
      expect(tier1Chip.classList.contains('stack-tier-1')).toBe(true);
    });

    it('sets data-stack-tier="stack-tier-evo" on #mod-list elements when stacked 3+ times via updateSidebar', () => {
      document.body.innerHTML = `
        <div id="mod-list"></div>
        <div id="items-list"></div>
      `;

      const hud = new HUDController();
      const dummyPlayer: any = {
        hp: 6,
        maxHp: 6,
        coins: 10,
        nos: 100,
        nosMax: 100,
        nosLock: false,
        items: [],
        itemStacks: {
          nitro_syringe: 5
        },
        weapon: 'pistol',
        runWeapons: {}
      };

      hud.updateSidebar(dummyPlayer, 1);

      const modList = document.getElementById('mod-list')!;
      const evoMod = modList.querySelector('[data-stack-tier="stack-tier-evo"]');
      expect(evoMod).not.toBeNull();
      expect(evoMod?.classList.contains('stack-tier-evo')).toBe(true);

      const itemsList = document.getElementById('items-list')!;
      const evoItem = itemsList.querySelector('[data-stack-tier="stack-tier-evo"]');
      expect(evoItem).not.toBeNull();
      expect(evoItem?.classList.contains('stack-tier-evo')).toBe(true);
    });

    it('updates pre-existing #mod-list elements preserving existing classes and text', () => {
      document.body.innerHTML = `
        <div id="mod-list">
          <span class="custom-chip existing-badge" data-count="3">Nitro Syringe x3</span>
          <span class="custom-chip existing-badge" data-count="2">Speed x2</span>
          <span class="custom-chip existing-badge" data-count="1">Plating x1</span>
        </div>
      `;

      const hud = new HUDController();
      hud.updateMods();

      const chips = document.querySelectorAll('#mod-list .custom-chip');
      expect(chips.length).toBe(3);

      // Verify chip 0 (count 3)
      expect(chips[0].getAttribute('data-stack-tier')).toBe('stack-tier-evo');
      expect(chips[0].classList.contains('stack-tier-evo')).toBe(true);
      expect(chips[0].classList.contains('custom-chip')).toBe(true);
      expect(chips[0].classList.contains('existing-badge')).toBe(true);
      expect(chips[0].textContent).toBe('Nitro Syringe x3');

      // Verify chip 1 (count 2)
      expect(chips[1].getAttribute('data-stack-tier')).toBe('stack-tier-2');
      expect(chips[1].classList.contains('stack-tier-2')).toBe(true);
      expect(chips[1].classList.contains('custom-chip')).toBe(true);

      // Verify chip 2 (count 1)
      expect(chips[2].getAttribute('data-stack-tier')).toBe('stack-tier-1');
      expect(chips[2].classList.contains('stack-tier-1')).toBe(true);
      expect(chips[2].classList.contains('custom-chip')).toBe(true);
    });
  });

  describe('Left HUD Clarity & Style Rank Tooltip (M62)', () => {
    let hud: HUDController;
    let player: PlayerState;

    beforeEach(() => {
      // Ensure HUDController has update alias if tests call hud.update
      if (typeof (HUDController.prototype as any).update !== 'function') {
        (HUDController.prototype as any).update = function (...args: any[]) {
          return (this as any).updateSidebar(...args);
        };
      }

      document.body.innerHTML = `
        <div id="game-wrapper">
          <div id="weapon-bar"></div>
          <div id="hud-synergy-list"></div>
          <div id="synergy-list"></div>
          <div id="hp-text"></div>
          <div id="hull-bar"></div>
          <div id="hull-meter"></div>
          <div id="nos-fill"></div>
          <div id="nos-meter"></div>
          <div id="nos-text"></div>
          <div id="hud-lv-badge"></div>
          <div id="coin-count"></div>
          <div id="scrap-count"></div>
          <div id="floor-num"></div>
          <div id="stats-grid"></div>
          <div id="mod-list"></div>
          <div id="items-list"></div>
          <div id="style-rank-card">
            <div id="style-rank-grade"></div>
            <div id="style-rank-title"></div>
            <div id="style-rank-fill"></div>
            <div id="style-rank-sub"></div>
            <div id="style-rank-howto"></div>
          </div>
          <div id="synergy-tracker-card"></div>
        </div>
      `;

      hud = new HUDController();
      player = {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 17,
        bikeAngle: 0,
        aimAngle: 0,
        baseSpeed: 265,
        hp: 6,
        maxHp: 6,
        coins: 10,
        invuln: 0,
        stunTimer: 0,
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
        livery: 'crimson_kaneda',
        heatLevel: 0,
        styleScore: 12,
        driftCharge: 0
      };
    });

    it('populates #style-rank-sub with BUFF: (BUFF: None at Rank D, ACTIVE BUFF: at higher ranks)', () => {
      // 1. Rank D case
      player.styleScore = 12;
      (hud as any).update(player, 1);

      const subEl = document.getElementById('style-rank-sub');
      expect(subEl).not.toBeNull();
      expect(subEl?.textContent).toContain('BUFF:');
      expect(subEl?.textContent).toBe('BUFF: None (Reach Rank C at 24% for +3% Fire Rate & Speed)');

      // 2. Rank S case
      player.styleScore = 70;
      (hud as any).update(player, 1);
      expect(subEl?.textContent).toContain('BUFF:');
      expect(subEl?.textContent).toContain('ACTIVE BUFF: +15% SPD/RATE · +35% LUCK · +1.5 NOS/s');

      // 3. Rank SSS case
      player.styleScore = 95;
      (hud as any).update(player, 1);
      expect(subEl?.textContent).toContain('BUFF:');
      expect(subEl?.textContent).toContain('ACTIVE BUFF: +25% SPD/RATE · +55% LUCK · +4 NOS/s');
    });

    it('populates #style-rank-howto with HOW TO RAISE: and live drift percentage', () => {
      player.driftCharge = 0.45;
      (hud as any).update(player, 1);

      const howtoEl = document.getElementById('style-rank-howto');
      expect(howtoEl).not.toBeNull();
      expect(howtoEl?.textContent).toContain('HOW TO RAISE:');
      expect(howtoEl?.textContent).toContain('Hold [SPACE] Drift (45%)');
      expect(howtoEl?.textContent).toContain('Graze Bullets');
      expect(howtoEl?.textContent).toContain('Kill Hostiles');
    });

    it('creates #style-rank-howto dynamically if not already present in DOM', () => {
      const existing = document.getElementById('style-rank-howto');
      if (existing) existing.remove();

      expect(document.getElementById('style-rank-howto')).toBeNull();
      (hud as any).update(player, 1);

      const created = document.getElementById('style-rank-howto');
      expect(created).not.toBeNull();
      expect(created?.textContent).toContain('HOW TO RAISE:');
    });

    it('populates #synergy-list with sub-elements containing Effect: and Task:', () => {
      (hud as any).update(player, 1);

      const synList = document.getElementById('synergy-list')!;
      expect(synList).not.toBeNull();

      // Check for sub-elements containing "Effect:" (Weapon Evolution) and "Task:" (Floor Bounty)
      const subRows = synList.querySelectorAll('.synergy-pill-desc, .synergy-row-sub');
      expect(subRows.length).toBeGreaterThanOrEqual(2);

      const effectRow = Array.from(subRows).find(el => el.textContent?.includes('Effect:'));
      expect(effectRow).toBeDefined();
      expect(effectRow?.textContent).toContain('Effect:');

      const taskRow = Array.from(subRows).find(el => el.textContent?.includes('Task:'));
      expect(taskRow).toBeDefined();
      expect(taskRow?.textContent).toContain('Task:');
    });

    it('maintains Effect: in #synergy-list when weapon is evolved', () => {
      // Evolve pistol via signature mod
      player.weapon = 'pistol';
      player.items = ['Rubberized Casings'];
      (hud as any).update(player, 1);

      const synList = document.getElementById('synergy-list')!;
      const subRows = synList.querySelectorAll('.synergy-pill-desc, .synergy-row-sub');

      const effectRow = Array.from(subRows).find(el => el.textContent?.includes('Effect:'));
      expect(effectRow).toBeDefined();
      expect(effectRow?.textContent).toContain('Effect:');
      expect(synList.innerHTML).toContain('★ EVOLVED');
    });

    it('sets rich style rank tooltip on #style-rank-card via update', () => {
      player.styleScore = 55; // Rank A
      (hud as any).update(player, 1);

      const card = document.getElementById('style-rank-card')!;
      const tip = card.getAttribute('data-tip') || '';
      expect(tip).toContain('OUTLAW STYLE RANK (A — 55%)');
      expect(tip).toContain('HOW TO IMPROVE:');
      expect(tip).toContain('[SPACE]');
      expect(tip).toContain('RANK REWARDS:');
    });
  });
});
