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
  updateWeaponDeck,
  updateModDeck,
  type ModStackTierClass,
  type MinimapFloorSummary,
  type DungeonGrid
} from '../../src/ui/hud';
import { getRunModDeckSummary } from '../../src/data/upgrades';
import { parseColor, drawObstacle } from '../../src/render/vectorArt';
import { TooltipManager, formatModDeckTooltipHint } from '../../src/ui/tooltip';
import { ShopModalController } from '../../src/ui/shopModal';
import { FilterManager } from '../../src/render/shaders';
import { StageManager, getFloorMoteColor, getEliteAffixColor } from '../../src/render/stage';
import { Pickup, MetaSaveState, PlayerState, Obstacle, Dungeon, Room, EquipmentItem, Enemy } from '../../src/types/game';
import {
  GarageController,
  getWeaponMasteryTier,
  getStashSalvageSummary,
  getDowngradeStashItems,
  getBuildArchetypeSummary,
  getEquippedBikeVisualState,
  getEquipmentLoadoutSummary,
  getWeaponArsenalSummary,
  getMetaTuningSummary,
  PART_ANCHORS,
  type StashSalvageSummary
} from '../../src/ui/garage';
import {
  getEquipmentVisualSpec,
  getEquipmentItemModelSvg
} from '../../src/ui/icons';

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
      expect(sectorBiome.getAttribute('data-room-threat-tier')).toBe('CLEAR');
      expect(sectorBiome.getAttribute('data-room-threat-score')).toBe('0');
      expect(sectorBiome.getAttribute('data-room-threat-advisory')).toBe('Sector clear — no active hostiles detected.');
    });

    it('sets room threat telemetry attributes to CLEAR for cleared rooms via renderMinimap', () => {
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
      const clearedRoom = makeRoom({
        x: 0,
        y: 0,
        type: 'combat',
        cleared: true,
        enemies: [
          { hp: 0, isDummy: false, type: 'swarmer' } as any
        ]
      });

      const dungeon: DungeonGrid = {
        '0,0': clearedRoom
      };

      hud.renderMinimap(dungeon, 0, 0, 1);

      expect(canvas.getAttribute('data-room-threat-tier')).toBe('CLEAR');
      expect(canvas.getAttribute('data-room-threat-score')).toBe('0');
      expect(canvas.getAttribute('data-room-threat-advisory')).toBe('Sector clear — no active hostiles detected.');

      expect(sectorBiome.getAttribute('data-room-threat-tier')).toBe('CLEAR');
      expect(sectorBiome.getAttribute('data-room-threat-score')).toBe('0');
      expect(sectorBiome.getAttribute('data-room-threat-advisory')).toBe('Sector clear — no active hostiles detected.');
    });

    it('sets room threat telemetry attributes to HIGH for elite skirmishes via renderMinimap', () => {
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
      const eliteRoom = makeRoom({
        x: 1,
        y: 0,
        type: 'combat',
        cleared: false,
        enemies: [
          {
            id: 1,
            hp: 60,
            isDummy: false,
            type: 'swarmer',
            isElite: true
          } as any
        ]
      });

      const dungeon: DungeonGrid = {
        '1,0': eliteRoom
      };

      hud.renderMinimap(dungeon, 1, 0, 2);

      // Floor 2, 1 living elite: threatScore = 1 * (10 + 2*2) + 1*25 = 39 -> HIGH tier
      expect(canvas.getAttribute('data-room-threat-tier')).toBe('HIGH');
      expect(canvas.getAttribute('data-room-threat-score')).toBe('39');
      expect(canvas.getAttribute('data-room-threat-advisory')).toBe(
        'High threat: 1 elite unit detected (1 total hostile). Prioritize hardened hostiles.'
      );

      expect(sectorBiome.getAttribute('data-room-threat-tier')).toBe('HIGH');
      expect(sectorBiome.getAttribute('data-room-threat-score')).toBe('39');
      expect(sectorBiome.getAttribute('data-room-threat-advisory')).toBe(
        'High threat: 1 elite unit detected (1 total hostile). Prioritize hardened hostiles.'
      );
    });

    it('sets room threat telemetry attributes to APEX for boss rooms via renderMinimap', () => {
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
      const bossRoom = makeRoom({
        x: 2,
        y: 1,
        type: 'boss',
        cleared: false,
        enemies: [
          {
            id: 99,
            hp: 1200,
            isDummy: false,
            type: 'boss',
            isElite: false
          } as any
        ]
      });

      const dungeon: DungeonGrid = {
        '2,1': bossRoom
      };

      hud.renderMinimap(dungeon, 2, 1, 3);

      // Floor 3, 1 boss: threatScore = 1 * (10 + 3*2) + 0 + 100 = 116 -> APEX tier
      expect(canvas.getAttribute('data-room-threat-tier')).toBe('APEX');
      expect(canvas.getAttribute('data-room-threat-score')).toBe('116');
      expect(canvas.getAttribute('data-room-threat-advisory')).toBe(
        'Apex threat: Boss encounter active (1 total hostile). Maximum evasion advised.'
      );

      expect(sectorBiome.getAttribute('data-room-threat-tier')).toBe('APEX');
      expect(sectorBiome.getAttribute('data-room-threat-score')).toBe('116');
      expect(sectorBiome.getAttribute('data-room-threat-advisory')).toBe(
        'Apex threat: Boss encounter active (1 total hostile). Maximum evasion advised.'
      );
    });

    it('sets floor exploration status and remaining pickups on #minimap-canvas and #hud-sector-biome via renderMinimap / updateRoomHazardTelemetry', () => {
      document.body.innerHTML = `
        <div id="game-wrapper">
          <canvas id="minimap-canvas" width="240" height="150"></canvas>
          <div id="hud-sector-biome"></div>
        </div>
      `;

      const canvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
      const sectorBiome = document.getElementById('hud-sector-biome') as HTMLElement;
      const hud = new HUDController();

      const dungeon: DungeonGrid = {
        '0,0': makeRoom({
          x: 0,
          y: 0,
          type: 'combat',
          cleared: true,
          visited: true,
          pickups: []
        }),
        '1,0': makeRoom({
          x: 1,
          y: 0,
          type: 'combat',
          cleared: false,
          visited: false,
          pickups: [
            { x: 200, y: 200, type: 'heart', radius: 15 } as any,
            { x: 300, y: 300, type: 'hub_npc', name: 'Mechanic', cost: 0, subtitle: '', radius: 25 } as any
          ]
        })
      };

      hud.updateRoomHazardTelemetry(dungeon, 0, 0, 1);

      // Total 2 rooms: 1 cleared, 1 pickup (excluding hub_npc)
      expect(canvas.getAttribute('data-floor-exploration-status')).toBe('1/2 SECTORS SECURED · 1 DROP(S) DETECTED');
      expect(canvas.getAttribute('data-remaining-pickups')).toBe('1');
      expect(sectorBiome.getAttribute('data-floor-exploration-status')).toBe('1/2 SECTORS SECURED · 1 DROP(S) DETECTED');
      expect(sectorBiome.getAttribute('data-remaining-pickups')).toBe('1');

      // Test 100% swept & looted condition
      const clearedDungeon: DungeonGrid = {
        '0,0': makeRoom({ x: 0, y: 0, type: 'combat', cleared: true, visited: true, pickups: [] }),
        '1,0': makeRoom({ x: 1, y: 0, type: 'combat', cleared: true, visited: true, pickups: [] })
      };
      hud.updateRoomHazardTelemetry(clearedDungeon, 0, 0, 1);
      expect(canvas.getAttribute('data-floor-exploration-status')).toBe('★ SECTOR 100% SWEPT & LOOTED');
      expect(canvas.getAttribute('data-remaining-pickups')).toBe('0');
      expect(sectorBiome.getAttribute('data-floor-exploration-status')).toBe('★ SECTOR 100% SWEPT & LOOTED');
      expect(sectorBiome.getAttribute('data-remaining-pickups')).toBe('0');
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
    let overlayEl: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div id="shop-confirm-overlay">
          <div class="shop-name-panel">
            <div id="shop-modal-name"></div>
            <div id="shop-modal-desc"></div>
            <div id="shop-modal-cost"></div>
            <div id="shop-modal-type"></div>
            <div id="shop-modal-quote"></div>
          </div>
          <button id="btn-confirm-buy"></button>
          <button id="btn-cancel-buy"></button>
        </div>
      `;
      overlayEl = document.getElementById('shop-confirm-overlay')!;
    });

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

    it('sets EVOLUTION_KEY synergy attributes when mod pedestal matches current weapon evolution requirement', () => {
      const modal = new ShopModalController();
      const pickup: Pickup = {
        x: 100,
        y: 100,
        radius: 20,
        type: 'mod_pedestal',
        cost: 20,
        mod: {
          id: 'ricochet_mod',
          name: 'Ricochet Rounds',
          desc: '+2 Bounces & +35% Damage',
          cost: 20,
          apply: vi.fn()
        }
      };
      const player: Partial<PlayerState> = {
        weapon: 'pistol',
        hp: 6,
        maxHp: 6
      };

      modal.open(pickup, vi.fn(), vi.fn(), 50, player);

      expect(overlayEl.getAttribute('data-shop-synergy')).toBe('EVOLUTION_KEY');
      expect(overlayEl.getAttribute('data-shop-synergy-hint')).toBe('⚡ UNLOCKS RICOCHET REVOLVER EVOLUTION!');
    });

    it('sets LOW_HULL_REPAIR synergy attributes when purchasing hull repair at or below 50% max HP', () => {
      const modal = new ShopModalController();
      const pickup: Pickup = {
        x: 100,
        y: 100,
        radius: 20,
        type: 'shop_heart',
        name: 'Hull Repair',
        cost: 10
      };
      const player: Partial<PlayerState> = {
        weapon: 'pistol',
        hp: 3,
        maxHp: 6
      };

      modal.open(pickup, vi.fn(), vi.fn(), 50, player);

      expect(overlayEl.getAttribute('data-shop-synergy')).toBe('LOW_HULL_REPAIR');
      expect(overlayEl.getAttribute('data-shop-synergy-hint')).toBe('⚠️ CRITICAL HULL REPAIR RECOMMENDED!');
    });

    it('sets WEAPON_UPGRADE synergy attributes when purchasing a new weapon for the run deck', () => {
      const modal = new ShopModalController();
      const pickup: any = {
        x: 100,
        y: 100,
        radius: 20,
        type: 'run_weapon',
        weaponId: 'shotgun',
        name: 'Sawed-Off Shotgun',
        cost: 25
      };
      const player: Partial<PlayerState> = {
        weapon: 'pistol',
        hp: 6,
        maxHp: 6
      };

      modal.open(pickup, vi.fn(), vi.fn(), 50, player);

      expect(overlayEl.getAttribute('data-shop-synergy')).toBe('WEAPON_UPGRADE');
      expect(overlayEl.getAttribute('data-shop-synergy-hint')).toBe('🔫 ADDS NEW WEAPON TO RUN DECK!');
    });

    it('sets STANDARD synergy attributes when pickup has no special build synergy', () => {
      const modal = new ShopModalController();
      const pickup: Pickup = {
        x: 100,
        y: 100,
        radius: 20,
        type: 'shop_heart',
        name: 'Hull Repair',
        cost: 10
      };
      const player: Partial<PlayerState> = {
        weapon: 'pistol',
        hp: 6,
        maxHp: 6
      };

      modal.open(pickup, vi.fn(), vi.fn(), 50, player);

      expect(overlayEl.getAttribute('data-shop-synergy')).toBe('STANDARD');
      expect(overlayEl.getAttribute('data-shop-synergy-hint')).toBe('Standard Black Market Ordnance');
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

    it('sets data-build-archetype and data-build-archetype-title on #garage-overlay during open() and renders archetype badge', () => {
      const garage = new GarageController(callbacks);
      // With default player (maxHp: 6, speedMult: 1, dmgMult: 1, fireRateMult: 1, vampChance: 0)
      garage.open(false, 1, metaSave, player);
      const overlay = document.getElementById('garage-overlay');
      expect(overlay?.getAttribute('data-build-archetype')).toBe('road_freelancer');
      expect(overlay?.getAttribute('data-build-archetype-title')).toBe('⚙️ ROAD FREELANCER');

      const badge = document.querySelector('.gx-archetype-badge');
      expect(badge).not.toBeNull();
      expect(badge?.textContent).toContain('ROAD FREELANCER');

      // Now with vampiric build
      const vampPlayer = { ...player, vampChance: 0.15 };
      garage.open(false, 2, metaSave, vampPlayer);
      expect(overlay?.getAttribute('data-build-archetype')).toBe('vampiric_reaper');
      expect(overlay?.getAttribute('data-build-archetype-title')).toBe('🩸 VAMPIRIC REAPER');

      // Now with iron juggernaut build
      const tankPlayer = { ...player, maxHp: 12 };
      garage.open(false, 3, metaSave, tankPlayer);
      expect(overlay?.getAttribute('data-build-archetype')).toBe('iron_juggernaut');
      expect(overlay?.getAttribute('data-build-archetype-title')).toBe('🛡️ IRON JUGGERNAUT');

      // Now with nitro drifter build
      const speedPlayer = { ...player, speedMult: 1.3 };
      garage.open(false, 4, metaSave, speedPlayer);
      expect(overlay?.getAttribute('data-build-archetype')).toBe('nitro_drifter');
      expect(overlay?.getAttribute('data-build-archetype-title')).toBe('🏎️ NITRO DRIFTER');

      // Now with hellfire gunner build
      const gunnerPlayer = { ...player, dmgMult: 1.4 };
      garage.open(false, 5, metaSave, gunnerPlayer);
      expect(overlay?.getAttribute('data-build-archetype')).toBe('hellfire_gunner');
      expect(overlay?.getAttribute('data-build-archetype-title')).toBe('🔥 HELLFIRE GUNNER');
    });

    it('sets data-career-rank, data-career-title, and data-career-score on #garage-overlay during open() across rookie and veteran profiles', () => {
      const garage = new GarageController(callbacks);

      // Rookie profile: 0 kills, 0 bosses, floor 1 -> score 0 -> rookie_courier
      const rookieSave: MetaSaveState = {
        ...metaSave,
        totalKills: 0,
        bossesSlain: 0,
        bestFloor: 1
      };
      garage.open(false, 1, rookieSave, player);
      const overlay = document.getElementById('garage-overlay');
      expect(overlay?.getAttribute('data-career-rank')).toBe('rookie_courier');
      expect(overlay?.getAttribute('data-career-title')).toBe('⚙️ ROOKIE COURIER');
      expect(overlay?.getAttribute('data-career-score')).toBe('0');

      // Mid-tier profile (Highway Outlaw): 15 kills, 1 boss (25), floor 2 (40) -> 15 + 25 + 40 = 80 -> highway_outlaw
      const outlawSave: MetaSaveState = {
        ...metaSave,
        totalKills: 15,
        bossesSlain: 1,
        bestFloor: 2
      };
      garage.open(false, 2, outlawSave, player);
      expect(overlay?.getAttribute('data-career-rank')).toBe('highway_outlaw');
      expect(overlay?.getAttribute('data-career-title')).toBe('🔥 HIGHWAY OUTLAW');
      expect(overlay?.getAttribute('data-career-score')).toBe('80');

      // Veteran / Legend profile: 300 kills, 8 bosses (200), floor 6 (200) -> 300 + 200 + 200 = 700 -> legend_of_valhalla
      const veteranSave: MetaSaveState = {
        ...metaSave,
        totalKills: 300,
        bossesSlain: 8,
        bestFloor: 6
      };
      garage.open(false, 6, veteranSave, player);
      expect(overlay?.getAttribute('data-career-rank')).toBe('legend_of_valhalla');
      expect(overlay?.getAttribute('data-career-title')).toBe('👑 LEGEND OF VALHALLA');
      expect(overlay?.getAttribute('data-career-score')).toBe('700');

      // Also verify render() updates the career rank attributes dynamically
      const enforcerSave: MetaSaveState = {
        ...metaSave,
        totalKills: 80,
        bossesSlain: 2,
        bestFloor: 3
      };
      // score: 80 + 2*25 + (3-1)*40 = 80 + 50 + 80 = 210 -> syndicate_enforcer
      garage.render(enforcerSave, player);
      expect(overlay?.getAttribute('data-career-rank')).toBe('syndicate_enforcer');
      expect(overlay?.getAttribute('data-career-title')).toBe('⚡ SYNDICATE ENFORCER');
      expect(overlay?.getAttribute('data-career-score')).toBe('210');
    });

    it('sets data-loadout-power-score, data-next-set-goal, data-loadout-summary, and renders .gx-set-goal-hint when no set bonus active in renderEquipmentBay', () => {
      const garage = new GarageController(callbacks);
      // metaSave.equipped from beforeEach has 1 Legendary tire ({ slot: 'tires', rarity: 3, name: 'Apex Tires', stats: { speed: 0.25 } })
      garage.open(false, 1, metaSave, player);

      const overlay = document.getElementById('garage-overlay')!;
      const eqTotals = document.getElementById('eq-totals')!;
      const summaryEl = document.getElementById('equip-bonus-summary')!;

      const expectedSummary = getEquipmentLoadoutSummary(metaSave.equipped);
      expect(expectedSummary.installedCount).toBe(1);
      expect(expectedSummary.nextSetGoalText).toBe('Need 2 more Legendary for 3pc Valhalla Set');

      // Verify attributes on overlay
      expect(overlay.getAttribute('data-loadout-power-score')).toBe(expectedSummary.totalPowerScore.toFixed(1));
      expect(overlay.getAttribute('data-next-set-goal')).toBe(expectedSummary.nextSetGoalText);
      expect(overlay.getAttribute('data-loadout-summary')).toBe(expectedSummary.summaryLine);

      // Verify attributes on eqTotals / summaryEl
      expect(eqTotals.getAttribute('data-loadout-power-score')).toBe(expectedSummary.totalPowerScore.toFixed(1));
      expect(eqTotals.getAttribute('data-next-set-goal')).toBe(expectedSummary.nextSetGoalText);
      expect(eqTotals.getAttribute('data-loadout-summary')).toBe(expectedSummary.summaryLine);
      expect(summaryEl.getAttribute('data-loadout-power-score')).toBe(expectedSummary.totalPowerScore.toFixed(1));
      expect(summaryEl.getAttribute('data-next-set-goal')).toBe(expectedSummary.nextSetGoalText);
      expect(summaryEl.getAttribute('data-loadout-summary')).toBe(expectedSummary.summaryLine);

      // Since setBonus?.label is empty, .gx-set-goal-hint should be rendered and .gx-set-bonus should not be rendered
      const hint = summaryEl.querySelector('.gx-set-goal-hint');
      expect(hint).not.toBeNull();
      expect(hint?.textContent).toContain('🎯');
      expect(hint?.textContent).toContain('Need 2 more Legendary for 3pc Valhalla Set');
      expect(summaryEl.querySelector('.gx-set-bonus')).toBeNull();

      // Empty equipped: verify goal changes to Rare+ requirement and telemetry updates via direct renderEquipmentBay call
      metaSave.equipped = {};
      garage.renderEquipmentBay(metaSave, player);

      const emptySummary = getEquipmentLoadoutSummary(metaSave.equipped);
      expect(emptySummary.installedCount).toBe(0);
      expect(emptySummary.totalPowerScore).toBe(0);
      expect(emptySummary.nextSetGoalText).toBe('Need 4 more Rare+ for 4pc Rare Tuning Set');

      expect(overlay.getAttribute('data-loadout-power-score')).toBe('0.0');
      expect(overlay.getAttribute('data-next-set-goal')).toBe('Need 4 more Rare+ for 4pc Rare Tuning Set');
      expect(overlay.getAttribute('data-loadout-summary')).toBe(emptySummary.summaryLine);
      expect(eqTotals.getAttribute('data-loadout-power-score')).toBe('0.0');

      const emptyHint = summaryEl.querySelector('.gx-set-goal-hint');
      expect(emptyHint).not.toBeNull();
      expect(emptyHint?.textContent).toContain('Need 4 more Rare+ for 4pc Rare Tuning Set');
    });

    it('renders .gx-set-bonus and hides .gx-set-goal-hint when a set bonus is active', () => {
      const garage = new GarageController(callbacks);

      // 2 Rare parts -> 2pc Rare Tuning (+6% Dmg, +4% Spd)
      metaSave.equipped = {
        tires: { slot: 'tires', rarity: 2, name: 'Rare Tires', stats: { speed: 0.1 } },
        engine: { slot: 'engine', rarity: 2, name: 'Rare Engine', stats: { dmg: 0.12 } }
      };

      garage.open(false, 1, metaSave, player);

      const summaryEl = document.getElementById('equip-bonus-summary')!;
      const setBonusEl = summaryEl.querySelector('.gx-set-bonus');
      expect(setBonusEl).not.toBeNull();
      expect(setBonusEl?.textContent).toContain('2pc Rare Tuning');

      // .gx-set-goal-hint must NOT be present when set bonus is active
      const hint = summaryEl.querySelector('.gx-set-goal-hint');
      expect(hint).toBeNull();

      const loadout = getEquipmentLoadoutSummary(metaSave.equipped);
      const overlay = document.getElementById('garage-overlay')!;
      expect(overlay.getAttribute('data-loadout-power-score')).toBe(loadout.totalPowerScore.toFixed(1));
      expect(overlay.getAttribute('data-next-set-goal')).toBe(loadout.nextSetGoalText);
      expect(overlay.getAttribute('data-loadout-summary')).toBe(loadout.summaryLine);

      // 3 Legendary parts -> 3pc Valhalla Set (+15% Dmg, +10% Spd)
      metaSave.equipped = {
        tires: { slot: 'tires', rarity: 3, name: 'Valhalla Tires', stats: { speed: 0.25 } },
        engine: { slot: 'engine', rarity: 3, name: 'Valhalla Engine', stats: { dmg: 0.3 } },
        exhaust: { slot: 'exhaust', rarity: 3, name: 'Valhalla Exhaust', stats: { blast: 0.2 } }
      };

      garage.renderEquipmentBay(metaSave, player);

      const valhallaBonusEl = summaryEl.querySelector('.gx-set-bonus');
      expect(valhallaBonusEl).not.toBeNull();
      expect(valhallaBonusEl?.textContent).toContain('3pc Valhalla Set');
      expect(summaryEl.querySelector('.gx-set-goal-hint')).toBeNull();

      const valhallaLoadout = getEquipmentLoadoutSummary(metaSave.equipped);
      expect(overlay.getAttribute('data-next-set-goal')).toBe('3pc Valhalla Set Active (+15% Dmg, +10% Spd)');
      expect(overlay.getAttribute('data-loadout-power-score')).toBe(valhallaLoadout.totalPowerScore.toFixed(1));
    });

    it('populates data-arsenal telemetry attributes on #unlock-list and #garage-overlay for initial save via render', () => {
      const garage = new GarageController(callbacks);
      const initialSave: MetaSaveState = {
        ...metaSave,
        unlocked: {
          machine_gun: false,
          shotgun: false,
          flamethrower: false,
          railgun: false,
          grenade_launcher: false,
          arc_coil: false
        },
        weaponKills: {}
      };

      garage.render(initialSave, player);

      const unlockList = document.getElementById('unlock-list')!;
      const overlay = document.getElementById('garage-overlay')!;
      const expectedArsenal = getWeaponArsenalSummary(initialSave);

      expect(expectedArsenal.unlockedCount).toBe(1);
      expect(expectedArsenal.totalKills).toBe(0);
      expect(expectedArsenal.topWeaponId).toBe('pistol');
      expect(expectedArsenal.summaryLine).toBe('ARSENAL: 1/7 UNLOCKED · 0 TOTAL KILLS · SIGNATURE: PISTOL (0)');

      // Verify on #unlock-list
      expect(unlockList.getAttribute('data-arsenal-unlocked-count')).toBe('1');
      expect(unlockList.getAttribute('data-arsenal-total-kills')).toBe('0');
      expect(unlockList.getAttribute('data-arsenal-signature-weapon')).toBe('pistol');
      expect(unlockList.getAttribute('data-arsenal-summary')).toBe('ARSENAL: 1/7 UNLOCKED · 0 TOTAL KILLS · SIGNATURE: PISTOL (0)');

      // Verify on #garage-overlay
      expect(overlay.getAttribute('data-arsenal-unlocked-count')).toBe('1');
      expect(overlay.getAttribute('data-arsenal-total-kills')).toBe('0');
      expect(overlay.getAttribute('data-arsenal-signature-weapon')).toBe('pistol');
      expect(overlay.getAttribute('data-arsenal-summary')).toBe('ARSENAL: 1/7 UNLOCKED · 0 TOTAL KILLS · SIGNATURE: PISTOL (0)');
    });

    it('populates data-arsenal telemetry attributes on #unlock-list and #garage-overlay for veteran save via renderWeaponUnlocks and render', () => {
      const garage = new GarageController(callbacks);
      const veteranSave: MetaSaveState = {
        ...metaSave,
        unlocked: {
          machine_gun: true,
          shotgun: true,
          railgun: true,
          flamethrower: false,
          grenade_launcher: false,
          arc_coil: false
        },
        weaponKills: {
          pistol: 25,
          machine_gun: 150,
          shotgun: 480,
          railgun: 110
        }
      };

      // Direct renderWeaponUnlocks call
      garage.renderWeaponUnlocks(veteranSave, player);

      const unlockList = document.getElementById('unlock-list')!;
      const overlay = document.getElementById('garage-overlay')!;
      const expectedArsenal = getWeaponArsenalSummary(veteranSave);

      expect(expectedArsenal.unlockedCount).toBe(4);
      expect(expectedArsenal.totalKills).toBe(765);
      expect(expectedArsenal.topWeaponId).toBe('shotgun');
      expect(expectedArsenal.summaryLine).toBe('ARSENAL: 4/7 UNLOCKED · 765 TOTAL KILLS · SIGNATURE: SAWED-OFF SHOTGUN (480)');

      expect(unlockList.getAttribute('data-arsenal-unlocked-count')).toBe('4');
      expect(unlockList.getAttribute('data-arsenal-total-kills')).toBe('765');
      expect(unlockList.getAttribute('data-arsenal-signature-weapon')).toBe('shotgun');
      expect(unlockList.getAttribute('data-arsenal-summary')).toBe(expectedArsenal.summaryLine);

      expect(overlay.getAttribute('data-arsenal-unlocked-count')).toBe('4');
      expect(overlay.getAttribute('data-arsenal-total-kills')).toBe('765');
      expect(overlay.getAttribute('data-arsenal-signature-weapon')).toBe('shotgun');
      expect(overlay.getAttribute('data-arsenal-summary')).toBe(expectedArsenal.summaryLine);

      // Also verify via full garage.render call
      garage.render(veteranSave, player);
      expect(unlockList.getAttribute('data-arsenal-unlocked-count')).toBe('4');
      expect(unlockList.getAttribute('data-arsenal-total-kills')).toBe('765');
      expect(unlockList.getAttribute('data-arsenal-signature-weapon')).toBe('shotgun');
      expect(unlockList.getAttribute('data-arsenal-summary')).toBe(expectedArsenal.summaryLine);
      expect(overlay.getAttribute('data-arsenal-unlocked-count')).toBe('4');
      expect(overlay.getAttribute('data-arsenal-total-kills')).toBe('765');
      expect(overlay.getAttribute('data-arsenal-signature-weapon')).toBe('shotgun');
      expect(overlay.getAttribute('data-arsenal-summary')).toBe(expectedArsenal.summaryLine);
    });

    it('populates data-tuning telemetry attributes on #meta-upgrade-list and #garage-overlay for fresh save via open and renderMetaUpgrades', () => {
      const garage = new GarageController(callbacks);
      const freshSave: MetaSaveState = {
        ...metaSave,
        scrap: 0,
        ranks: { dmg: 0, fireRate: 0, speed: 0, maxHp: 0 }
      };

      garage.open(false, 1, freshSave, player);

      const list = document.getElementById('meta-upgrade-list')!;
      const overlay = document.getElementById('garage-overlay')!;
      const expectedTuning = getMetaTuningSummary(freshSave);

      expect(expectedTuning.totalRanks).toBe(0);
      expect(expectedTuning.completionPct).toBe(0);
      expect(expectedTuning.cheapestNextUpgradeId).toBe('speed');
      expect(expectedTuning.cheapestNextCost).toBe(20);
      expect(expectedTuning.summaryLine).toBe('TUNING: 0/19 RANKS (0%) · NEXT: TWIN-CAM ENGINE TUNE (20 SCRAP)');

      // Verify on #meta-upgrade-list
      expect(list.getAttribute('data-tuning-total-ranks')).toBe('0');
      expect(list.getAttribute('data-tuning-completion-pct')).toBe('0');
      expect(list.getAttribute('data-tuning-next-upgrade')).toBe('speed');
      expect(list.getAttribute('data-tuning-can-afford-next')).toBe('false');
      expect(list.getAttribute('data-tuning-summary')).toBe(expectedTuning.summaryLine);

      // Verify on #garage-overlay
      expect(overlay.getAttribute('data-tuning-total-ranks')).toBe('0');
      expect(overlay.getAttribute('data-tuning-completion-pct')).toBe('0');
      expect(overlay.getAttribute('data-tuning-next-upgrade')).toBe('speed');
      expect(overlay.getAttribute('data-tuning-can-afford-next')).toBe('false');
      expect(overlay.getAttribute('data-tuning-summary')).toBe(expectedTuning.summaryLine);

      // Test with sufficient scrap to afford cheapest next upgrade
      const affordableFreshSave: MetaSaveState = {
        ...freshSave,
        scrap: 20
      };
      garage.renderMetaUpgrades(affordableFreshSave);
      expect(list.getAttribute('data-tuning-can-afford-next')).toBe('true');
      expect(overlay.getAttribute('data-tuning-can-afford-next')).toBe('true');
    });

    it('populates data-tuning telemetry attributes for partial save across affordable and unaffordable scrap levels', () => {
      const garage = new GarageController(callbacks);
      // Partial save: dmg 2, fireRate 1, speed 0, maxHp 0 (cheapest next is speed at 20 scrap)
      // With scrap = 120, can afford is true
      garage.renderMetaUpgrades(metaSave);

      const list = document.getElementById('meta-upgrade-list')!;
      const overlay = document.getElementById('garage-overlay')!;
      const expectedTuning = getMetaTuningSummary(metaSave);

      expect(expectedTuning.totalRanks).toBe(3);
      expect(expectedTuning.completionPct).toBe(16);
      expect(expectedTuning.cheapestNextUpgradeId).toBe('speed');
      expect(expectedTuning.cheapestNextCost).toBe(20);

      expect(list.getAttribute('data-tuning-total-ranks')).toBe('3');
      expect(list.getAttribute('data-tuning-completion-pct')).toBe('16');
      expect(list.getAttribute('data-tuning-next-upgrade')).toBe('speed');
      expect(list.getAttribute('data-tuning-can-afford-next')).toBe('true');
      expect(list.getAttribute('data-tuning-summary')).toBe(expectedTuning.summaryLine);

      expect(overlay.getAttribute('data-tuning-total-ranks')).toBe('3');
      expect(overlay.getAttribute('data-tuning-completion-pct')).toBe('16');
      expect(overlay.getAttribute('data-tuning-next-upgrade')).toBe('speed');
      expect(overlay.getAttribute('data-tuning-can-afford-next')).toBe('true');
      expect(overlay.getAttribute('data-tuning-summary')).toBe(expectedTuning.summaryLine);

      // Unaffordable scenario: speed 1, cheapest next is dmg at 25 scrap, with only 10 scrap
      const unaffordableSave: MetaSaveState = {
        ...metaSave,
        scrap: 10,
        ranks: { dmg: 0, fireRate: 0, speed: 1, maxHp: 0 }
      };
      garage.open(false, 1, unaffordableSave, player);

      const unaffordableTuning = getMetaTuningSummary(unaffordableSave);
      expect(unaffordableTuning.totalRanks).toBe(1);
      expect(unaffordableTuning.completionPct).toBe(5);
      expect(unaffordableTuning.cheapestNextUpgradeId).toBe('dmg');
      expect(unaffordableTuning.cheapestNextCost).toBe(25);

      expect(list.getAttribute('data-tuning-total-ranks')).toBe('1');
      expect(list.getAttribute('data-tuning-completion-pct')).toBe('5');
      expect(list.getAttribute('data-tuning-next-upgrade')).toBe('dmg');
      expect(list.getAttribute('data-tuning-can-afford-next')).toBe('false');
      expect(list.getAttribute('data-tuning-summary')).toBe(unaffordableTuning.summaryLine);

      expect(overlay.getAttribute('data-tuning-total-ranks')).toBe('1');
      expect(overlay.getAttribute('data-tuning-completion-pct')).toBe('5');
      expect(overlay.getAttribute('data-tuning-next-upgrade')).toBe('dmg');
      expect(overlay.getAttribute('data-tuning-can-afford-next')).toBe('false');
      expect(overlay.getAttribute('data-tuning-summary')).toBe(unaffordableTuning.summaryLine);
    });

    it('populates data-tuning telemetry attributes for fully maxed save with MAXED and can-afford-next false', () => {
      const garage = new GarageController(callbacks);
      const maxedSave: MetaSaveState = {
        ...metaSave,
        scrap: 9999,
        ranks: {
          dmg: 5,
          fireRate: 5,
          speed: 5,
          maxHp: 4
        }
      };

      garage.renderMetaUpgrades(maxedSave);

      const list = document.getElementById('meta-upgrade-list')!;
      const overlay = document.getElementById('garage-overlay')!;
      const expectedTuning = getMetaTuningSummary(maxedSave);

      expect(expectedTuning.totalRanks).toBe(19);
      expect(expectedTuning.completionPct).toBe(100);
      expect(expectedTuning.cheapestNextUpgradeId).toBeNull();
      expect(expectedTuning.cheapestNextCost).toBeNull();
      expect(expectedTuning.summaryLine).toBe('TUNING: 19/19 RANKS (100%) · ALL SYSTEMS MAXED');

      expect(list.getAttribute('data-tuning-total-ranks')).toBe('19');
      expect(list.getAttribute('data-tuning-completion-pct')).toBe('100');
      expect(list.getAttribute('data-tuning-next-upgrade')).toBe('MAXED');
      expect(list.getAttribute('data-tuning-can-afford-next')).toBe('false');
      expect(list.getAttribute('data-tuning-summary')).toBe(expectedTuning.summaryLine);

      expect(overlay.getAttribute('data-tuning-total-ranks')).toBe('19');
      expect(overlay.getAttribute('data-tuning-completion-pct')).toBe('100');
      expect(overlay.getAttribute('data-tuning-next-upgrade')).toBe('MAXED');
      expect(overlay.getAttribute('data-tuning-can-afford-next')).toBe('false');
      expect(overlay.getAttribute('data-tuning-summary')).toBe(expectedTuning.summaryLine);

      // Verify via garage.open as well
      garage.open(false, 1, maxedSave, player);
      expect(list.getAttribute('data-tuning-next-upgrade')).toBe('MAXED');
      expect(list.getAttribute('data-tuning-can-afford-next')).toBe('false');
      expect(overlay.getAttribute('data-tuning-next-upgrade')).toBe('MAXED');
      expect(overlay.getAttribute('data-tuning-can-afford-next')).toBe('false');
    });

    it('lazily resolves metaUpgradeList and overlay elements if initially unlinked when renderMetaUpgrades is invoked', () => {
      const garage = new GarageController(callbacks);
      // Clear references to simulate late or unlinked DOM elements
      (garage as any).metaUpgradeList = null;
      (garage as any).overlay = null;

      garage.renderMetaUpgrades(metaSave);

      const list = document.getElementById('meta-upgrade-list')!;
      const overlay = document.getElementById('garage-overlay')!;

      expect(list.getAttribute('data-tuning-total-ranks')).toBe('3');
      expect(list.getAttribute('data-tuning-next-upgrade')).toBe('speed');
      expect(overlay.getAttribute('data-tuning-total-ranks')).toBe('3');
      expect(overlay.getAttribute('data-tuning-next-upgrade')).toBe('speed');
    });
  });

  describe('Garage Build Archetype Classification (getBuildArchetypeSummary)', () => {
    it('classifies as vampiric_reaper when siphon >= 0.12 or vampChance >= 0.12', () => {
      const res1 = getBuildArchetypeSummary({ siphon: 0.15 } as any);
      expect(res1.id).toBe('vampiric_reaper');
      expect(res1.title).toBe('🩸 VAMPIRIC REAPER');
      expect(res1.badgeColor).toBe('#ff1f4b');
      expect(res1.description).toContain('High-siphon hull regeneration');

      const res2 = getBuildArchetypeSummary({ vampChance: 0.12 } as any);
      expect(res2.id).toBe('vampiric_reaper');
      expect(res2.title).toBe('🩸 VAMPIRIC REAPER');
    });

    it('classifies as iron_juggernaut when maxHp >= 10', () => {
      const res = getBuildArchetypeSummary({ maxHp: 10 } as any);
      expect(res.id).toBe('iron_juggernaut');
      expect(res.title).toBe('🛡️ IRON JUGGERNAUT');
      expect(res.badgeColor).toBe('#00f5d4');
      expect(res.description).toContain('Heavy-armored tank chassis');

      const resHigh = getBuildArchetypeSummary({ maxHp: 14 } as any);
      expect(resHigh.id).toBe('iron_juggernaut');
    });

    it('classifies as nitro_drifter when speedMult >= 1.25', () => {
      const res = getBuildArchetypeSummary({ speedMult: 1.25 } as any);
      expect(res.id).toBe('nitro_drifter');
      expect(res.title).toBe('🏎️ NITRO DRIFTER');
      expect(res.badgeColor).toBe('#ffd60a');
      expect(res.description).toContain('High-velocity powerslide specialist');

      const resBoosted = getBuildArchetypeSummary({ speedMult: 1.4 } as any);
      expect(resBoosted.id).toBe('nitro_drifter');
    });

    it('classifies as hellfire_gunner when dmgMult >= 1.35 or fireRateMult >= 1.35', () => {
      const resDmg = getBuildArchetypeSummary({ dmgMult: 1.35 } as any);
      expect(resDmg.id).toBe('hellfire_gunner');
      expect(resDmg.title).toBe('🔥 HELLFIRE GUNNER');
      expect(resDmg.badgeColor).toBe('#ff5400');
      expect(resDmg.description).toContain('Overclocked ordnance build');

      const resFire = getBuildArchetypeSummary({ fireRateMult: 1.35 } as any);
      expect(resFire.id).toBe('hellfire_gunner');

      const resBoth = getBuildArchetypeSummary({ dmgMult: 1.4, fireRateMult: 1.5 } as any);
      expect(resBoth.id).toBe('hellfire_gunner');
    });

    it('classifies as road_freelancer for baseline, sub-threshold, empty, or undefined player', () => {
      const resDefault = getBuildArchetypeSummary();
      expect(resDefault.id).toBe('road_freelancer');
      expect(resDefault.title).toBe('⚙️ ROAD FREELANCER');
      expect(resDefault.badgeColor).toBe('#a8dadc');
      expect(resDefault.description).toContain('Balanced outlaw interceptor');

      const resNull = getBuildArchetypeSummary(null);
      expect(resNull.id).toBe('road_freelancer');

      const resEmpty = getBuildArchetypeSummary({} as any);
      expect(resEmpty.id).toBe('road_freelancer');

      const resSubThreshold = getBuildArchetypeSummary({
        maxHp: 8,
        speedMult: 1.2,
        dmgMult: 1.25,
        fireRateMult: 1.1,
        siphon: 0.05
      } as any);
      expect(resSubThreshold.id).toBe('road_freelancer');
    });

    describe('Precedence Rules', () => {
      it('prioritizes vampiric_reaper over iron_juggernaut, nitro_drifter, and hellfire_gunner', () => {
        const omniPlayer = {
          siphon: 0.15,
          maxHp: 12,
          speedMult: 1.5,
          dmgMult: 1.5,
          fireRateMult: 1.5
        } as any;
        const res = getBuildArchetypeSummary(omniPlayer);
        expect(res.id).toBe('vampiric_reaper');
      });

      it('prioritizes iron_juggernaut over nitro_drifter and hellfire_gunner when siphon < 0.12', () => {
        const tankSpeedPlayer = {
          siphon: 0.05,
          maxHp: 10,
          speedMult: 1.35,
          dmgMult: 1.5
        } as any;
        const res = getBuildArchetypeSummary(tankSpeedPlayer);
        expect(res.id).toBe('iron_juggernaut');
      });

      it('prioritizes nitro_drifter over hellfire_gunner when siphon < 0.12 and maxHp < 10', () => {
        const speedGunnerPlayer = {
          siphon: 0,
          maxHp: 8,
          speedMult: 1.25,
          dmgMult: 1.5,
          fireRateMult: 1.5
        } as any;
        const res = getBuildArchetypeSummary(speedGunnerPlayer);
        expect(res.id).toBe('nitro_drifter');
      });

      it('prioritizes hellfire_gunner over road_freelancer when speedMult < 1.25 and maxHp < 10', () => {
        const gunnerPlayer = {
          siphon: 0,
          maxHp: 6,
          speedMult: 1.1,
          dmgMult: 1.35
        } as any;
        const res = getBuildArchetypeSummary(gunnerPlayer);
        expect(res.id).toBe('hellfire_gunner');
      });
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

    it('renders weapon deck cards with Weapon Evolution Progress tooltip hints in data-tip via updateWeaponDeck and renderWeaponDeck', () => {
      const metaSave: any = {
        unlocked: { pistol: true, machine_gun: true, shotgun: true },
        weaponKills: { pistol: 15 }
      };

      // Player with 1 item stack
      const playerWithItem = {
        ...player,
        items: ['coffee'] as any,
        itemStacks: { coffee: 1 } as any,
        mods: []
      } as unknown as PlayerState;

      hud.updateWeaponDeck(playerWithItem, metaSave);

      const pistolCard = document.querySelector('[data-weapon="pistol"]') as HTMLElement;
      expect(pistolCard).not.toBeNull();
      const pistolTip = pistolCard.getAttribute('data-tip') || '';
      expect(pistolTip).toContain('Mastery: ★☆☆ ROOKIE I');
      expect(pistolTip).toContain('🔧 OVERCLOCK TO RICOCHET REVOLVER:');
      expect(pistolTip).toContain('Need "Ricochet Rounds" Mod OR 1/3 Item Stacks');

      // Player with evolved weapon (e.g. signature mod in items or >=3 stacks)
      const playerEvolved = {
        ...player,
        items: ['Rubberized Casings'] as any,
        itemStacks: {},
        mods: [{ id: 'ricochet_mod', name: 'Ricochet Rounds', desc: '' }] as any
      } as unknown as PlayerState;

      // Test standalone function updateWeaponDeck
      updateWeaponDeck(playerEvolved, metaSave);

      const evolvedPistolCard = document.querySelector('[data-weapon="pistol"]') as HTMLElement;
      expect(evolvedPistolCard).not.toBeNull();
      const evolvedTip = evolvedPistolCard.getAttribute('data-tip') || '';
      expect(evolvedTip).toContain('⚡ OVERCLOCKED: RICOCHET REVOLVER ACTIVE');
      expect(evolvedTip).toContain('+2 Bounces, +35% Damage & Golden Tracer Rounds');
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

    it('sets data-bounty-contract-title, data-bounty-style-met, and data-bounty-summary telemetry attributes across Floor 1 and Floor 3', () => {
      const metaSave: any = { scrap: 50, unlocked: {}, weaponKills: {} };

      // Floor 1: NEON DAREDEVIL, cruising D rank -> isStyleMilestoneMet is false
      const playerFloor1 = {
        ...player,
        styleScore: 10,
        styleRank: 'D'
      } as unknown as PlayerState;

      hud.updateSidebar(playerFloor1, 1, metaSave);

      const hudList1 = document.getElementById('hud-synergy-list')!;
      const synList1 = document.getElementById('synergy-list')!;

      expect(hudList1.getAttribute('data-bounty-contract-title')).toBe('NEON DAREDEVIL');
      expect(hudList1.getAttribute('data-bounty-style-met')).toBe('false');
      expect(hudList1.getAttribute('data-bounty-summary')).toBe(
        'BOUNTY [F1] NEON DAREDEVIL: Graze 3 enemy projectiles or clear Floor 1 Boss (+8 SCRAP, +10 COINS)'
      );

      expect(synList1.getAttribute('data-bounty-contract-title')).toBe('NEON DAREDEVIL');
      expect(synList1.getAttribute('data-bounty-style-met')).toBe('false');
      expect(synList1.getAttribute('data-bounty-summary')).toBe(
        'BOUNTY [F1] NEON DAREDEVIL: Graze 3 enemy projectiles or clear Floor 1 Boss (+8 SCRAP, +10 COINS)'
      );

      expect(hud.synergyListEl).not.toBeNull();
      expect(hud.synergyListEl?.getAttribute('data-bounty-contract-title')).toBe('NEON DAREDEVIL');
      expect(hud.synergyListEl?.getAttribute('data-bounty-style-met')).toBe('false');
      expect(hud.synergyListEl?.getAttribute('data-bounty-summary')).toBe(
        'BOUNTY [F1] NEON DAREDEVIL: Graze 3 enemy projectiles or clear Floor 1 Boss (+8 SCRAP, +10 COINS)'
      );

      // Floor 3: THERMAL HUNTER, high style A rank -> isStyleMilestoneMet is true
      const playerFloor3A = {
        ...player,
        styleScore: 60,
        styleRank: 'A'
      } as unknown as PlayerState;

      hud.updateSidebar(playerFloor3A, 3, metaSave);

      expect(hudList1.getAttribute('data-bounty-contract-title')).toBe('THERMAL HUNTER');
      expect(hudList1.getAttribute('data-bounty-style-met')).toBe('true');
      expect(hudList1.getAttribute('data-bounty-summary')).toBe(
        'BOUNTY [F3] THERMAL HUNTER: Reach Style Rank A or clear Floor 3 Boss (+12 SCRAP, +15 COINS)'
      );

      expect(synList1.getAttribute('data-bounty-contract-title')).toBe('THERMAL HUNTER');
      expect(synList1.getAttribute('data-bounty-style-met')).toBe('true');
      expect(synList1.getAttribute('data-bounty-summary')).toBe(
        'BOUNTY [F3] THERMAL HUNTER: Reach Style Rank A or clear Floor 3 Boss (+12 SCRAP, +15 COINS)'
      );

      expect(hud.synergyListEl?.getAttribute('data-bounty-contract-title')).toBe('THERMAL HUNTER');
      expect(hud.synergyListEl?.getAttribute('data-bounty-style-met')).toBe('true');
      expect(hud.synergyListEl?.getAttribute('data-bounty-summary')).toBe(
        'BOUNTY [F3] THERMAL HUNTER: Reach Style Rank A or clear Floor 3 Boss (+12 SCRAP, +15 COINS)'
      );

      // Floor 3: THERMAL HUNTER, high style SSS rank -> isStyleMilestoneMet is true
      const playerFloor3SSS = {
        ...player,
        styleScore: 98,
        styleRank: 'SSS'
      } as unknown as PlayerState;

      hud.updateSidebar(playerFloor3SSS, 3, metaSave);

      expect(hudList1.getAttribute('data-bounty-contract-title')).toBe('THERMAL HUNTER');
      expect(hudList1.getAttribute('data-bounty-style-met')).toBe('true');
      expect(hudList1.getAttribute('data-bounty-summary')).toBe(
        'BOUNTY [F3] THERMAL HUNTER: Reach Style Rank A or clear Floor 3 Boss (+12 SCRAP, +15 COINS)'
      );

      expect(synList1.getAttribute('data-bounty-contract-title')).toBe('THERMAL HUNTER');
      expect(synList1.getAttribute('data-bounty-style-met')).toBe('true');
      expect(synList1.getAttribute('data-bounty-summary')).toBe(
        'BOUNTY [F3] THERMAL HUNTER: Reach Style Rank A or clear Floor 3 Boss (+12 SCRAP, +15 COINS)'
      );
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

  describe('High-Resolution Equipment Item Models & Dynamic Large Motorcycle Model (M93)', () => {
    it('generates 24 distinct high-resolution 128x128 3D models across all 6 slots and 4 rarity tiers', () => {
      const slots = ['tires', 'engine', 'handlebars', 'exhaust', 'frame', 'tank'] as const;
      const rarities = [0, 1, 2, 3] as const;
      const modelCodes = new Set<string>();
      const svgOutputs = new Set<string>();

      for (const slot of slots) {
        for (const rarity of rarities) {
          const item: EquipmentItem = {
            slot,
            rarity,
            name: `Test ${slot} R${rarity}`,
            stats: { dmg: 0.1 }
          };
          const spec = getEquipmentVisualSpec(item, slot);
          expect(spec.slot).toBe(slot);
          expect(spec.rarity).toBe(rarity);
          expect(spec.modelCode.length).toBeGreaterThan(4);
          expect(spec.subAssemblyLabel.length).toBeGreaterThan(8);
          modelCodes.add(spec.modelCode);

          const svg = getEquipmentItemModelSvg(item, slot);
          expect(svg).toContain('viewBox="0 0 128 128"');
          expect(svg).toContain(`data-model-code="${spec.modelCode}"`);
          expect(svg).toContain(spec.tierBadge);
          svgOutputs.add(svg);
        }
      }

      // Every single (slot, rarity) combination produces a unique model code and unique SVG model
      expect(modelCodes.size).toBe(24);
      expect(svgOutputs.size).toBe(24);
    });

    it('updates #bike-canvas and #garage-overlay equipped visual telemetry and slot models when items are equipped or unequipped', () => {
      document.body.innerHTML = `
        <div id="garage-overlay">
          <div id="slots-left"></div>
          <div id="slots-right"></div>
          <canvas id="bike-canvas" width="400" height="300"></canvas>
          <div id="stash-list"></div>
          <div id="eq-totals"></div>
        </div>
      `;

      const garage = new GarageController({
        onEquipItem: vi.fn(),
        onUnequipSlot: vi.fn(),
        onSellItem: vi.fn(),
        onUnlockWeapon: vi.fn(),
        onEquipWeapon: vi.fn(),
        onBuyUpgrade: vi.fn(),
        onResumeRun: vi.fn(),
        onNewRun: vi.fn(),
        onResetSave: vi.fn()
      });

      const metaSave: MetaSaveState = {
        scrap: 500,
        unlocked: { machine_gun: true, shotgun: false, flamethrower: false, grenade_launcher: false, railgun: false, arc_coil: false },
        ranks: { dmg: 1, fireRate: 0, speed: 0, maxHp: 0 },
        equipped: {
          engine: { slot: 'engine', rarity: 3, name: 'Valhalla Engine', stats: { dmg: 0.25 } },
          tires: { slot: 'tires', rarity: 2, name: 'Hyper Tires', stats: { speed: 0.18 } },
          exhaust: { slot: 'exhaust', rarity: 1, name: 'Tuned Exhaust', stats: { blast: 0.14 } }
        },
        stash: [
          { slot: 'tank', rarity: 3, name: 'Hellfire Fuel Tank', stats: { siphon: 0.12 } }
        ]
      };

      const vState = getEquippedBikeVisualState(metaSave);
      expect(vState.equippedCount).toBe(3);
      expect(vState.modelCodes).toContain('EN-04 VALHALLA CORE');

      garage.render(metaSave, null);

      const overlay = document.getElementById('garage-overlay')!;
      const bikeCanvas = document.getElementById('bike-canvas')!;
      expect(overlay.getAttribute('data-equipped-visual-count')).toBe('3');
      expect(bikeCanvas.getAttribute('data-equipped-visual-count')).toBe('3');
      expect(bikeCanvas.getAttribute('data-equipped-model-codes')).toContain('TR-03 APEX TURBINE');
      expect(bikeCanvas.getAttribute('data-equipped-model-codes')).toContain('EN-04 VALHALLA CORE');
      expect(bikeCanvas.getAttribute('data-equipped-model-codes')).toContain('EX-02 PIE-CUT TI');

      // Verify filled slot cards render the bespoke 128x128 model and .sl-model-tag
      const filledEngineSlot = document.querySelector('.eq-slot.is-filled[data-slot-id="engine"]') as HTMLElement;
      expect(filledEngineSlot).not.toBeNull();
      expect(filledEngineSlot.getAttribute('data-model-code')).toBe('EN-04 VALHALLA CORE');
      expect(filledEngineSlot.getAttribute('data-tier-badge')).toBe('OMEGA');
      expect(filledEngineSlot.innerHTML).toContain('gx-equip-model');

      // Verify stash card renders the bespoke 128x128 model
      const stashCard = document.querySelector('#stash-list .stash-item') as HTMLElement;
      expect(stashCard).not.toBeNull();
      expect(stashCard.getAttribute('data-model-code')).toBe('TK-04 BLOOD SIPHON');
      expect(stashCard.innerHTML).toContain('gx-equip-model');

      // Unequip all and verify bike visual state resets to 0/6 Stock Chassis
      metaSave.equipped = {};
      garage.render(metaSave, null);
      expect(bikeCanvas.getAttribute('data-equipped-visual-count')).toBe('0');
      expect(bikeCanvas.getAttribute('data-equipped-visual-summary')).toContain('STOCK CHASSIS');
      expect(PART_ANCHORS.engine).toEqual([198, 160]);
    });
  });

  describe('HUD Live Boss Encounter Tactical Telemetry (updateBossBar & data telemetry attributes)', () => {
    let hud: HUDController;
    let bossBarEl: HTMLElement;

    beforeEach(() => {
      document.body.innerHTML = `
        <div id="boss-hud">
          <div id="boss-hud-name"></div>
          <div id="boss-hud-sub"></div>
          <div id="boss-hud-hp"></div>
          <div id="boss-bar-fill"></div>
          <div id="boss-bar-lag"></div>
        </div>
      `;
      hud = new HUDController();
      bossBarEl = document.getElementById('boss-hud')!;
    });

    it('sets telemetry attributes for null or inactive boss', () => {
      hud.updateBossBar(null, 1);

      expect(hud.bossBar?.getAttribute('data-boss-active')).toBe('false');
      expect(hud.bossBar?.getAttribute('data-boss-phase')).toBe('1');
      expect(hud.bossBar?.getAttribute('data-boss-enraged')).toBe('false');
      expect(hud.bossBar?.getAttribute('data-boss-hp-pct')).toBe('0');
      expect(hud.bossBar?.getAttribute('data-boss-counterplay')).toBe('Sector clear of boss signatures.');
      expect(hud.bossBar?.getAttribute('data-boss-briefing')).toBe('BOSS TELEMETRY: INACTIVE');
      expect(bossBarEl.classList.contains('is-visible')).toBe(false);
      expect(bossBarEl.hidden).toBe(true);

      // Dead boss (hp <= 0)
      const deadBoss = {
        id: 1,
        type: 'boss',
        bossVariant: 0,
        name: 'SCRAP GOLIATH',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 36,
        hp: 0,
        maxHp: 100,
        speed: 50,
        color: '#ff0055',
        subTimer: 0
      } as unknown as Enemy;
      hud.updateBossBar(deadBoss);
      expect(hud.bossBar?.getAttribute('data-boss-active')).toBe('false');
      expect(hud.bossBar?.getAttribute('data-boss-briefing')).toBe('BOSS TELEMETRY: INACTIVE');
    });

    it('sets telemetry attributes for Phase 1 healthy boss (80% HP)', () => {
      const healthyBoss = {
        id: 2,
        type: 'boss',
        bossVariant: 0,
        name: 'SCRAP JUGGERNAUT',
        x: 200,
        y: 200,
        vx: 0,
        vy: 0,
        radius: 40,
        hp: 80,
        maxHp: 100,
        speed: 60,
        color: '#ff0055',
        subTimer: 0
      } as unknown as Enemy;

      hud.updateBossBar(healthyBoss, 1);

      expect(hud.bossBar?.getAttribute('data-boss-active')).toBe('true');
      expect(hud.bossBar?.getAttribute('data-boss-phase')).toBe('1');
      expect(hud.bossBar?.getAttribute('data-boss-enraged')).toBe('false');
      expect(hud.bossBar?.getAttribute('data-boss-hp-pct')).toBe('80');
      expect(hud.bossBar?.getAttribute('data-boss-counterplay')).toBe('PHASE 1: Maintain mid-range orbit and destroy elemental barrels before 50% HP enrage.');
      expect(hud.bossBar?.getAttribute('data-boss-briefing')).toContain('80% HP');
      expect(hud.bossBar?.getAttribute('data-boss-briefing')).toContain('PHASE 1');
      expect(bossBarEl.classList.contains('is-visible')).toBe(true);
      expect(bossBarEl.classList.contains('is-enraged')).toBe(false);
    });

    it('sets telemetry attributes for Phase 2 enraged boss (35% HP)', () => {
      const enragedBoss = {
        id: 3,
        type: 'boss',
        bossVariant: 0,
        name: 'SCRAP JUGGERNAUT',
        x: 200,
        y: 200,
        vx: 0,
        vy: 0,
        radius: 40,
        hp: 35,
        maxHp: 100,
        speed: 90,
        color: '#ff0055',
        subTimer: 0
      } as unknown as Enemy;

      hud.updateBossBar(enragedBoss, 1);

      expect(hud.bossBar?.getAttribute('data-boss-active')).toBe('true');
      expect(hud.bossBar?.getAttribute('data-boss-phase')).toBe('2');
      expect(hud.bossBar?.getAttribute('data-boss-enraged')).toBe('true');
      expect(hud.bossBar?.getAttribute('data-boss-hp-pct')).toBe('35');
      expect(hud.bossBar?.getAttribute('data-boss-counterplay')).toBe('PHASE 2 OVERDRIVE: Boss bullet cadence doubled — use Drift [SPACE] i-frames and Graze for NOS!');
      expect(hud.bossBar?.getAttribute('data-boss-briefing')).toContain('35% HP');
      expect(hud.bossBar?.getAttribute('data-boss-briefing')).toContain('PHASE 2 ENRAGED');
      expect(bossBarEl.classList.contains('is-visible')).toBe(true);
      expect(bossBarEl.classList.contains('is-enraged')).toBe(true);
    });

    it('preserves backward compatibility when floorNum is omitted and handles #boss-bar element', () => {
      document.body.innerHTML = '<div id="boss-bar"></div>';
      const customHud = new HUDController();
      const boss = {
        id: 4,
        type: 'boss',
        bossVariant: 1,
        name: 'IRON BEHEMOTH',
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        radius: 40,
        hp: 40,
        maxHp: 100,
        speed: 80,
        color: '#ff3300',
        subTimer: 0
      } as unknown as Enemy;

      customHud.updateBossBar(boss); // floorNum omitted -> defaults to 1

      expect(customHud.bossBar?.getAttribute('data-boss-active')).toBe('true');
      expect(customHud.bossBar?.getAttribute('data-boss-phase')).toBe('2');
      expect(customHud.bossBar?.getAttribute('data-boss-enraged')).toBe('true');
      expect(customHud.bossBar?.getAttribute('data-boss-hp-pct')).toBe('40');
      expect(customHud.bossBar?.getAttribute('data-boss-briefing')).toContain('40% HP');
    });
  });

  describe('HUD Active Mod Deck & Duo Synergy Readiness Telemetry (M118)', () => {
    type TestPlayer = PlayerState & { modStacks?: Record<string, number> };
    const createBasePlayer = (overrides?: Partial<PlayerState> & { modStacks?: Record<string, number> }): TestPlayer => ({
      hp: 6,
      maxHp: 6,
      coins: 20,
      nos: 100,
      nosMax: 100,
      nosLock: false,
      items: [],
      itemStacks: {},
      modStacks: {},
      weapon: 'pistol',
      runWeapons: {},
      dmgMult: 1.0,
      fireRateMult: 1.0,
      speedMult: 1.0,
      multiShot: 1,
      pierce: 0,
      bounce: 0,
      vampChance: 0,
      killCount: 0,
      ...overrides
    } as unknown as TestPlayer);

    it('populates telemetry on #hud-mods-bar, #hud-synergy-list, and #sidebar for empty mod deck', () => {
      document.body.innerHTML = `
        <div id="hud-mods-bar"></div>
        <div id="hud-synergy-list"></div>
        <aside id="sidebar"></aside>
      `;

      const hud = new HUDController();
      const player = createBasePlayer();
      const summary = getRunModDeckSummary(player);

      hud.updateModDeckTelemetry(player);

      const modsBar = document.getElementById('hud-mods-bar')!;
      const synergyEl = document.getElementById('hud-synergy-list')!;
      const sidebarEl = document.getElementById('sidebar')!;

      for (const el of [modsBar, synergyEl, sidebarEl]) {
        expect(el.getAttribute('data-mod-total-picks')).toBe('0');
        expect(el.getAttribute('data-mod-unique-count')).toBe('0');
        expect(el.getAttribute('data-mod-evo-ready')).toBe('false');
        expect(el.getAttribute('data-mod-active-duos')).toBe('0');
        expect(el.getAttribute('data-mod-deck-summary')).toBe(summary.summaryLine);
        expect(el.getAttribute('data-mod-deck-summary')).toContain('MODS: 0 PICKS (0 UNIQUE)');
        expect(el.getAttribute('data-mod-deck-summary')).toContain('0/3 MAX STACK');
        expect(el.getAttribute('data-mod-deck-summary')).toContain('DUOS: 0 ACTIVE');
      }
    });

    it('populates telemetry for 2/3 STACK NEAR EVO mod deck state via updateSidebar and updateModDeckTelemetry', () => {
      document.body.innerHTML = `
        <div id="mod-bar"></div>
        <div id="synergy-list"></div>
        <aside id="hud-sidebar"></aside>
      `;

      const hud = new HUDController();
      const player = createBasePlayer({
        modStacks: {
          hollow_point: 2,
          turbo_charger: 1
        }
      });
      const summary = getRunModDeckSummary(player);
      expect(summary.maxStackCount).toBe(2);
      expect(summary.evoStackReady).toBe(false);
      expect(summary.totalModPicks).toBe(3);
      expect(summary.uniqueModsCount).toBe(2);

      hud.updateSidebar(player, 1);

      const modsBar = document.getElementById('mod-bar')!;
      const synergyEl = document.getElementById('synergy-list')!;
      const sidebarEl = document.getElementById('hud-sidebar')!;

      for (const el of [modsBar, synergyEl, sidebarEl]) {
        expect(el.getAttribute('data-mod-total-picks')).toBe('3');
        expect(el.getAttribute('data-mod-unique-count')).toBe('2');
        expect(el.getAttribute('data-mod-evo-ready')).toBe('false');
        expect(el.getAttribute('data-mod-active-duos')).toBe('0');
        expect(el.getAttribute('data-mod-deck-summary')).toBe(summary.summaryLine);
        expect(el.getAttribute('data-mod-deck-summary')).toContain('2/3 STACK NEAR EVO');
      }
    });

    it('populates telemetry for 3+ STACK EVO READY mod deck state', () => {
      document.body.innerHTML = `
        <div id="hud-mods-bar"></div>
        <div id="synergy-list"></div>
      `;

      const hud = new HUDController();
      const player = createBasePlayer({
        modStacks: {
          armor_plate: 3,
          hair_trigger: 2
        }
      });
      const summary = getRunModDeckSummary(player);
      expect(summary.evoStackReady).toBe(true);
      expect(summary.totalModPicks).toBe(5);
      expect(summary.uniqueModsCount).toBe(2);

      hud.updateModDeckTelemetry(player);

      const modsBar = document.getElementById('hud-mods-bar')!;
      const synergyEl = document.getElementById('synergy-list')!;

      expect(modsBar.getAttribute('data-mod-total-picks')).toBe('5');
      expect(modsBar.getAttribute('data-mod-unique-count')).toBe('2');
      expect(modsBar.getAttribute('data-mod-evo-ready')).toBe('true');
      expect(modsBar.getAttribute('data-mod-deck-summary')).toContain('3+ STACK EVO READY');

      expect(synergyEl.getAttribute('data-mod-evo-ready')).toBe('true');
      expect(synergyEl.getAttribute('data-mod-deck-summary')).toContain('3+ STACK EVO READY');
    });

    it('populates active Duo Synergy telemetry count and summary when synergy conditions are met', () => {
      document.body.innerHTML = `
        <div id="hud-mods-bar"></div>
        <div id="hud-synergy-list"></div>
      `;

      const hud = new HUDController();
      // thermal_shock requires cryo (e.g. cryo_rounds) and fire (e.g. high_explosive)
      const player = createBasePlayer({
        modStacks: {
          cryo_rounds: 1,
          high_explosive: 1
        }
      });
      const summary = getRunModDeckSummary(player);
      expect(summary.activeDuoCount).toBeGreaterThanOrEqual(1);

      hud.updateModDeckTelemetry(player);

      const modsBar = document.getElementById('hud-mods-bar')!;
      const synergyEl = document.getElementById('hud-synergy-list')!;

      expect(modsBar.getAttribute('data-mod-active-duos')).toBe(String(summary.activeDuoCount));
      expect(modsBar.getAttribute('data-mod-deck-summary')).toContain(`DUOS: ${summary.activeDuoCount} ACTIVE`);
      expect(synergyEl.getAttribute('data-mod-active-duos')).toBe(String(summary.activeDuoCount));
    });

    it('updates directly assigned modBarEl, synergyListEl, and sidebarEl instances via updateModDeckTelemetry and updateEvolutionMatrix', () => {
      const customHud = new HUDController();
      const customModBar = document.createElement('section');
      const customSynergyList = document.createElement('div');
      const customSidebar = document.createElement('aside');

      customHud.modBarEl = customModBar;
      customHud.synergyListEl = customSynergyList;
      customHud.sidebarEl = customSidebar;

      const player = createBasePlayer({
        modStacks: {
          nanite_repair: 3
        }
      });

      customHud.updateEvolutionMatrix(player);

      for (const el of [customModBar, customSynergyList, customSidebar]) {
        expect(el.getAttribute('data-mod-total-picks')).toBe('3');
        expect(el.getAttribute('data-mod-unique-count')).toBe('1');
        expect(el.getAttribute('data-mod-evo-ready')).toBe('true');
        expect(el.getAttribute('data-mod-active-duos')).toBe('0');
        expect(el.getAttribute('data-mod-deck-summary')).toContain('3+ STACK EVO READY');
      }
    });

    it('standalone updateModDeck helper and hud.updateModDeck method update DOM telemetry attributes seamlessly', () => {
      document.body.innerHTML = `
        <div id="hud-mods-bar"></div>
        <div id="hud-synergy-list"></div>
      `;

      const player = createBasePlayer({
        modStacks: {
          split_chamber: 1
        }
      });

      updateModDeck(player);

      const modsBar = document.getElementById('hud-mods-bar')!;
      expect(modsBar.getAttribute('data-mod-total-picks')).toBe('1');
      expect(modsBar.getAttribute('data-mod-unique-count')).toBe('1');
      expect(modsBar.getAttribute('data-mod-evo-ready')).toBe('false');

      const hud = new HUDController();
      hud.updateModDeck(player);
      expect(modsBar.getAttribute('data-mod-total-picks')).toBe('1');
    });

    it('handles null / empty DOM gracefully without throwing', () => {
      document.body.innerHTML = '';
      const hud = new HUDController();
      const player = createBasePlayer();

      expect(() => {
        hud.updateModDeckTelemetry(player);
      }).not.toThrow();
    });
  });

  describe('HUD Mod Badge Tooltip Duo Synergy & Overclock Readiness Wiring (M124)', () => {
    type TestPlayer = PlayerState & { modStacks?: Record<string, number> };
    const createTestPlayer = (overrides?: Partial<PlayerState> & { modStacks?: Record<string, number> }): TestPlayer => ({
      hp: 6,
      maxHp: 6,
      coins: 20,
      nos: 100,
      nosMax: 100,
      nosLock: false,
      items: [],
      itemStacks: {},
      modStacks: {},
      weapon: 'pistol',
      runWeapons: {},
      dmgMult: 1.0,
      fireRateMult: 1.0,
      speedMult: 1.0,
      multiShot: 1,
      pierce: 0,
      bounce: 0,
      vampChance: 0,
      killCount: 0,
      ...overrides
    } as unknown as TestPlayer);

    it('renders .mod-badge elements in #hud-mods-bar with 1/3 stack overclock evolution hints in data-tip and data-mod-evo-hint', () => {
      document.body.innerHTML = `
        <div id="hud-mods-bar"></div>
        <div id="hud-synergy-list"></div>
      `;

      const hud = new HUDController();
      const player = createTestPlayer({
        modStacks: {
          armor_plate: 1
        }
      });

      const expectedHint = formatModDeckTooltipHint('armor_plate', player);
      expect(expectedHint).toContain('1/3');
      expect(expectedHint).toContain('FOR OVERCLOCK EVO');

      hud.updateSidebar(player, 1);

      const badge = document.querySelector('#hud-mods-bar .mod-badge') as HTMLElement;
      expect(badge).not.toBeNull();
      expect(badge.classList.contains('mod-badge')).toBe(true);
      expect(badge.getAttribute('data-mod-id')).toBe('armor_plate');
      expect(badge.getAttribute('data-mod-evo-hint')).toBe(expectedHint);
      expect(badge.getAttribute('data-tip')).toContain(expectedHint);
      expect(badge.getAttribute('data-tip')).toContain('1/3');
    });

    it('renders .mod-badge elements with 2/3 stack near-evo hints (+1 STACK FOR OVERCLOCK EVO) in data-tip and data-mod-evo-hint', () => {
      document.body.innerHTML = `
        <div id="hud-mods-bar"></div>
      `;

      const hud = new HUDController();
      const player = createTestPlayer({
        modStacks: {
          hollow_point: 2
        }
      });

      const expectedHint = formatModDeckTooltipHint('hollow_point', player);
      expect(expectedHint).toContain('2/3 STACKS');
      expect(expectedHint).toContain('+1 STACK FOR OVERCLOCK EVO');

      hud.updateMods(player);

      const badge = document.querySelector('#hud-mods-bar .mod-badge') as HTMLElement;
      expect(badge).not.toBeNull();
      expect(badge.getAttribute('data-mod-evo-hint')).toBe(expectedHint);
      expect(badge.getAttribute('data-tip')).toContain(expectedHint);
      expect(badge.getAttribute('data-tip')).toContain('+1 STACK FOR OVERCLOCK EVO');
    });

    it('renders .mod-badge elements with 3+ stack generic overclock ready state (GENERIC OVERCLOCK READY) in data-tip and data-mod-evo-hint', () => {
      document.body.innerHTML = `
        <div id="hud-mods-bar"></div>
      `;

      const hud = new HUDController();
      const player = createTestPlayer({
        modStacks: {
          hair_trigger: 3,
          turbo_charger: 4
        }
      });

      hud.updateSidebar(player, 1);

      const badges = document.querySelectorAll('#hud-mods-bar .mod-badge');
      expect(badges.length).toBe(2);

      const htBadge = Array.from(badges).find(b => b.getAttribute('data-mod-id') === 'hair_trigger') as HTMLElement;
      const tcBadge = Array.from(badges).find(b => b.getAttribute('data-mod-id') === 'turbo_charger') as HTMLElement;

      expect(htBadge).not.toBeUndefined();
      expect(tcBadge).not.toBeUndefined();

      const expectedHtHint = formatModDeckTooltipHint('hair_trigger', player);
      const expectedTcHint = formatModDeckTooltipHint('turbo_charger', player);

      expect(expectedHtHint).toContain('3+ STACKS: GENERIC OVERCLOCK READY');
      expect(expectedTcHint).toContain('3+ STACKS: GENERIC OVERCLOCK READY');

      expect(htBadge.getAttribute('data-mod-evo-hint')).toBe(expectedHtHint);
      expect(htBadge.getAttribute('data-tip')).toContain(expectedHtHint);
      expect(htBadge.getAttribute('data-tip')).toContain('GENERIC OVERCLOCK READY');

      expect(tcBadge.getAttribute('data-mod-evo-hint')).toBe(expectedTcHint);
      expect(tcBadge.getAttribute('data-tip')).toContain(expectedTcHint);
      expect(tcBadge.getAttribute('data-tip')).toContain('GENERIC OVERCLOCK READY');
    });

    it('renders active Duo Synergy states and updates data-tip and data-mod-evo-hint on both component .mod-badge elements', () => {
      document.body.innerHTML = `
        <div id="hud-mods-bar"></div>
      `;

      const hud = new HUDController();
      // thermal_shock duo requires cryo_rounds and high_explosive
      const player = createTestPlayer({
        modStacks: {
          cryo_rounds: 1,
          high_explosive: 2
        }
      });

      hud.updateSidebar(player, 1);

      const cryoBadge = document.querySelector('#hud-mods-bar [data-mod-id="cryo_rounds"]') as HTMLElement;
      const heBadge = document.querySelector('#hud-mods-bar [data-mod-id="high_explosive"]') as HTMLElement;

      expect(cryoBadge).not.toBeNull();
      expect(heBadge).not.toBeNull();

      const expectedCryoHint = formatModDeckTooltipHint('cryo_rounds', player);
      const expectedHeHint = formatModDeckTooltipHint('high_explosive', player);

      expect(expectedCryoHint).toContain('✓ DUO ACTIVE: THERMAL SHOCK');
      expect(expectedHeHint).toContain('✓ DUO ACTIVE: THERMAL SHOCK');

      expect(cryoBadge.getAttribute('data-mod-evo-hint')).toBe(expectedCryoHint);
      expect(cryoBadge.getAttribute('data-tip')).toContain(expectedCryoHint);
      expect(cryoBadge.getAttribute('data-tip')).toContain('✓ DUO ACTIVE: THERMAL SHOCK');

      expect(heBadge.getAttribute('data-mod-evo-hint')).toBe(expectedHeHint);
      expect(heBadge.getAttribute('data-tip')).toContain(expectedHeHint);
      expect(heBadge.getAttribute('data-tip')).toContain('✓ DUO ACTIVE: THERMAL SHOCK');
      expect(heBadge.getAttribute('data-tip')).toContain('+1 STACK FOR OVERCLOCK EVO');
    });

    it('appends evoHint to title if title is set and updates pre-existing .mod-badge elements via updateModDeckTelemetry', () => {
      document.body.innerHTML = `
        <div id="hud-mods-bar">
          <span class="mod-badge" data-mod-id="armor_plate" title="Armor Plating" data-tip="Armor Plating Description"></span>
        </div>
      `;

      const hud = new HUDController();
      const player = createTestPlayer({
        modStacks: {
          armor_plate: 3
        }
      });

      const expectedHint = formatModDeckTooltipHint('armor_plate', player);
      hud.updateModDeckTelemetry(player);

      const badge = document.querySelector('#hud-mods-bar .mod-badge') as HTMLElement;
      expect(badge.getAttribute('data-mod-evo-hint')).toBe(expectedHint);
      expect(badge.getAttribute('data-tip')).toContain('Armor Plating Description');
      expect(badge.getAttribute('data-tip')).toContain(expectedHint);
      expect(badge.getAttribute('title')).toContain('Armor Plating');
      expect(badge.getAttribute('title')).toContain(expectedHint);
    });

    it('standalone updateModDeck helper renders .mod-badge in #hud-mods-bar with evolution hints', () => {
      document.body.innerHTML = `
        <div id="hud-mods-bar"></div>
      `;

      const player = createTestPlayer({
        modStacks: {
          cryo_rounds: 2
        }
      });

      updateModDeck(player);

      const badge = document.querySelector('#hud-mods-bar .mod-badge') as HTMLElement;
      expect(badge).not.toBeNull();
      const expectedHint = formatModDeckTooltipHint('cryo_rounds', player);
      expect(badge.getAttribute('data-mod-evo-hint')).toBe(expectedHint);
      expect(badge.getAttribute('data-tip')).toContain('+1 STACK FOR OVERCLOCK EVO');
    });
  });
});
