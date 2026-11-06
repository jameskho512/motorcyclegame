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
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  isLowFuel,
  calcNeedleAngle,
  calcMinimapRoomCoords
} from '../../src/ui/hud';
import { parseColor } from '../../src/render/vectorArt';
import { TooltipManager } from '../../src/ui/tooltip';
import { ShopModalController } from '../../src/ui/shopModal';
import { FilterManager } from '../../src/render/shaders';
import { StageManager } from '../../src/render/stage';
import { Pickup, MetaSaveState, PlayerState } from '../../src/types/game';
import { GarageController } from '../../src/ui/garage';

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
  });
});
