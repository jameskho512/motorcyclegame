/**
 * Unit Tests: Core State Management, Persistence & Equipment Systems
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createDefaultMetaSave,
  createDefaultPlayerState,
  loadMetaSave,
  writeMetaSave,
  saveRunCheckpoint,
  loadRunCheckpoint,
  clearRunSave,
  isMuted,
  setMuted,
  getStartingWeapon,
  isWeaponAvailable,
  resetPlayerStatsForRun,
  applyMetaStats,
  applyItemStats,
  equipItem,
  unequipSlot,
  sellItem,
  addLoot,
  SafeLocalStorage,
  StateManager
} from '../../src/core/state';

import {
  SAVE_KEY_META,
  SAVE_KEY_RUN,
  SAVE_KEY_MUTED,
  EquipmentItem,
  MAX_STASH_SIZE
} from '../../src/types/game';

describe('Core State Management & Persistence', () => {
  let mockStorage: SafeLocalStorage;

  beforeEach(() => {
    mockStorage = new SafeLocalStorage();
  });

  describe('Default State Factories', () => {
    it('creates default player state with exact baseline metrics', () => {
      const player = createDefaultPlayerState();
      expect(player.hp).toBe(6);
      expect(player.maxHp).toBe(6);
      expect(player.baseSpeed).toBe(265);
      expect(player.radius).toBe(17);
      expect(player.weapon).toBe('pistol');
      expect(player.coins).toBe(0);
      expect(player.dmgMult).toBe(1);
      expect(player.fireRateMult).toBe(1);
      expect(player.speedMult).toBe(1);
      expect(player.nos).toBe(100);
      expect(player.nosMax).toBe(100);
      expect(player.nosLock).toBe(false);
    });

    it('creates default meta save with 0 scrap, locked weapons, and 0 ranks', () => {
      const meta = createDefaultMetaSave();
      expect(meta.scrap).toBe(0);
      expect(meta.ranks.dmg).toBe(0);
      expect(meta.ranks.fireRate).toBe(0);
      expect(meta.ranks.speed).toBe(0);
      expect(meta.ranks.maxHp).toBe(0);
      expect(meta.unlocked.machine_gun).toBe(false);
      expect(meta.unlocked.arc_coil).toBe(false);
      expect(meta.stash).toEqual([]);
      expect(meta.equipped).toEqual({});
      expect(meta.weaponKills).toEqual({});
    });
  });

  describe('Meta Persistence Round-Trip', () => {
    it('saves and restores meta progression using SAVE_KEY_META', () => {
      const meta = createDefaultMetaSave();
      meta.scrap = 150;
      meta.ranks.dmg = 2;
      meta.ranks.maxHp = 1;
      meta.unlocked.shotgun = true;

      writeMetaSave(meta, mockStorage);
      const raw = mockStorage.getItem(SAVE_KEY_META);
      expect(raw).toBeTruthy();

      const loaded = loadMetaSave(mockStorage);
      expect(loaded.scrap).toBe(150);
      expect(loaded.ranks.dmg).toBe(2);
      expect(loaded.ranks.maxHp).toBe(1);
      expect(loaded.unlocked.shotgun).toBe(true);
      expect(loaded.unlocked.railgun).toBe(false);
    });

    it('falls back gracefully to defaults on corrupt storage payload', () => {
      mockStorage.setItem(SAVE_KEY_META, '{{corrupt_json');
      const loaded = loadMetaSave(mockStorage);
      expect(loaded.scrap).toBe(0);
      expect(loaded.ranks.dmg).toBe(0);
    });
  });

  describe('In-Run Checkpoint Autosave', () => {
    it('serializes and restores active run state via SAVE_KEY_RUN', () => {
      const player = createDefaultPlayerState();
      const meta = createDefaultMetaSave();

      player.hp = 4;
      player.maxHp = 8;
      player.coins = 42;
      player.dmgMult = 1.35;
      player.items = ['nitro_syringe', 'tire_iron'];
      player.itemStacks = { nitro_syringe: 2, tire_iron: 1 };
      player.runWeapons = { shotgun: true };
      player.weapon = 'shotgun';
      player.killCount = 19;

      saveRunCheckpoint(player, 3, mockStorage);
      const raw = mockStorage.getItem(SAVE_KEY_RUN);
      expect(raw).toBeTruthy();

      const restorePlayer = createDefaultPlayerState();
      const result = loadRunCheckpoint(restorePlayer, meta, mockStorage);

      expect(result.restored).toBe(true);
      expect(result.floorNum).toBe(3);
      expect(restorePlayer.hp).toBe(4);
      expect(restorePlayer.maxHp).toBe(8);
      expect(restorePlayer.coins).toBe(42);
      expect(restorePlayer.dmgMult).toBe(1.35);
      expect(restorePlayer.items).toEqual(['nitro_syringe', 'tire_iron']);
      expect(restorePlayer.itemStacks).toEqual({ nitro_syringe: 2, tire_iron: 1 });
      expect(restorePlayer.weapon).toBe('shotgun');
      expect(restorePlayer.killCount).toBe(19);
    });

    it('rejects dead player checkpoints (hp <= 0)', () => {
      const player = createDefaultPlayerState();
      const meta = createDefaultMetaSave();
      player.hp = 0;

      saveRunCheckpoint(player, 2, mockStorage);
      const restorePlayer = createDefaultPlayerState();
      const result = loadRunCheckpoint(restorePlayer, meta, mockStorage);

      expect(result.restored).toBe(false);
      expect(result.floorNum).toBe(1);
    });

    it('clears checkpoint cleanly upon clearRunSave()', () => {
      const player = createDefaultPlayerState();
      saveRunCheckpoint(player, 2, mockStorage);
      expect(mockStorage.getItem(SAVE_KEY_RUN)).toBeTruthy();

      clearRunSave(mockStorage);
      expect(mockStorage.getItem(SAVE_KEY_RUN)).toBeNull();
    });
  });

  describe('Audio Mute Preference Persistence', () => {
    it('reads and writes mute flag using SAVE_KEY_MUTED', () => {
      expect(isMuted(mockStorage)).toBe(false);
      setMuted(true, mockStorage);
      expect(mockStorage.getItem(SAVE_KEY_MUTED)).toBe('1');
      expect(isMuted(mockStorage)).toBe(true);

      setMuted(false, mockStorage);
      expect(mockStorage.getItem(SAVE_KEY_MUTED)).toBe('0');
      expect(isMuted(mockStorage)).toBe(false);
    });
  });

  describe('Weapon Rules & Starting Weapon Priority', () => {
    it('selects pistol when no weapons are permanently unlocked', () => {
      const meta = createDefaultMetaSave();
      expect(getStartingWeapon(meta)).toBe('pistol');
    });

    it('prioritizes highest unlocked weapon tier', () => {
      const meta = createDefaultMetaSave();
      meta.unlocked.machine_gun = true;
      expect(getStartingWeapon(meta)).toBe('machine_gun');

      meta.unlocked.shotgun = true;
      expect(getStartingWeapon(meta)).toBe('shotgun');

      meta.unlocked.arc_coil = true;
      expect(getStartingWeapon(meta)).toBe('arc_coil');
    });

    it('validates weapon availability across permanent and in-run weapons', () => {
      const meta = createDefaultMetaSave();
      const player = createDefaultPlayerState();

      expect(isWeaponAvailable('pistol', meta, player)).toBe(true);
      expect(isWeaponAvailable('railgun', meta, player)).toBe(false);

      player.runWeapons = { railgun: true };
      expect(isWeaponAvailable('railgun', meta, player)).toBe(true);

      meta.unlocked.flamethrower = true;
      expect(isWeaponAvailable('flamethrower', meta, player)).toBe(true);
    });
  });

  describe('Player Stat Calculation & Equipment Mechanics', () => {
    it('applies meta ranks correctly on run reset', () => {
      const player = createDefaultPlayerState();
      const meta = createDefaultMetaSave();

      meta.ranks.dmg = 3;       // +30% -> 1.30
      meta.ranks.fireRate = 2;  // +16% -> 1.16
      meta.ranks.speed = 4;     // +24% -> 1.24
      meta.ranks.maxHp = 2;     // +2 HP -> 8

      resetPlayerStatsForRun(player, meta);

      expect(player.dmgMult).toBeCloseTo(1.30);
      expect(player.fireRateMult).toBeCloseTo(1.16);
      expect(player.speedMult).toBeCloseTo(1.24);
      expect(player.maxHp).toBe(8);
      expect(player.hp).toBe(8);
    });

    it('applies weapon mastery damage bonus via applyMetaStats across kill tiers', () => {
      // 0 kills: +0% bonus (exact parity)
      const p0 = createDefaultPlayerState();
      p0.weapon = 'pistol';
      const m0 = createDefaultMetaSave();
      m0.weaponKills = { pistol: 0 };
      applyMetaStats(p0, m0);
      expect(p0.dmg).toBe(1.0);
      expect(p0.dmgMult).toBe(1.0);

      // 10 kills: +5% bonus
      const p10 = createDefaultPlayerState();
      p10.weapon = 'pistol';
      const m10 = createDefaultMetaSave();
      m10.weaponKills = { pistol: 10 };
      applyMetaStats(p10, m10);
      expect(p10.dmg).toBe(1.05);
      expect(p10.dmgMult).toBe(1.05);

      // 40 kills: +10% bonus
      const p40 = createDefaultPlayerState();
      p40.weapon = 'pistol';
      const m40 = createDefaultMetaSave();
      m40.weaponKills = { pistol: 40 };
      applyMetaStats(p40, m40);
      expect(p40.dmg).toBe(1.10);
      expect(p40.dmgMult).toBe(1.10);

      // 100 kills: +15% bonus
      const p100 = createDefaultPlayerState();
      p100.weapon = 'pistol';
      const m100 = createDefaultMetaSave();
      m100.weaponKills = { pistol: 100 };
      applyMetaStats(p100, m100);
      expect(p100.dmg).toBe(1.15);
      expect(p100.dmgMult).toBe(1.15);
    });

    it('multiplies custom player.dmg baseline correctly on mastery rank thresholds', () => {
      const player = createDefaultPlayerState();
      player.weapon = 'shotgun';
      player.dmg = 20;

      const meta = createDefaultMetaSave();
      meta.weaponKills = { shotgun: 100 };

      applyMetaStats(player, meta);
      expect(player.dmg).toBe(23); // 20 * 1.15 = 23
    });

    it('applies and unapplies equipment stats cleanly', () => {
      const player = createDefaultPlayerState();
      const item: EquipmentItem = {
        slot: 'engine',
        rarity: 2,
        name: 'Racing Engine',
        stats: { dmg: 0.18, speed: 0.05, hp: 2 }
      };

      applyItemStats(player, item, 1);
      expect(player.dmgMult).toBeCloseTo(1.18);
      expect(player.speedMult).toBeCloseTo(1.05);
      expect(player.maxHp).toBe(8);

      applyItemStats(player, item, -1);
      expect(player.dmgMult).toBeCloseTo(1.0);
      expect(player.speedMult).toBeCloseTo(1.0);
      expect(player.maxHp).toBe(6);
    });

    it('auto-equips when slot is empty and swaps out inferior equipment', () => {
      const meta = createDefaultMetaSave();
      const player = createDefaultPlayerState();

      const item1: EquipmentItem = {
        slot: 'tires',
        rarity: 0,
        name: 'Stock Tires',
        stats: { speed: 0.05 }
      };

      const item2: EquipmentItem = {
        slot: 'tires',
        rarity: 2,
        name: 'Racing Tires',
        stats: { speed: 0.14, blast: 0.04 }
      };

      // First item equips automatically
      const res1 = addLoot(meta, item1, player, mockStorage);
      expect(res1.equipped).toBe(true);
      expect(meta.equipped.tires?.name).toBe('Stock Tires');

      // Second higher-tier item equips, displacing item1 into stash
      const res2 = addLoot(meta, item2, player, mockStorage);
      expect(res2.equipped).toBe(true);
      expect(meta.equipped.tires?.name).toBe('Racing Tires');
      expect(meta.stash).toContain(item1);
    });

    it('auto-sells weakest stash item when stash exceeds MAX_STASH_SIZE (18)', () => {
      const meta = createDefaultMetaSave();
      meta.equipped.engine = {
        slot: 'engine',
        rarity: 3,
        name: 'Apex Engine',
        stats: { dmg: 0.50 }
      };

      // Fill stash with 18 items
      for (let i = 0; i < MAX_STASH_SIZE; i++) {
        meta.stash.push({
          slot: 'frame',
          rarity: 1,
          name: `Frame ${i}`,
          stats: { hp: 2 + i * 0.1 }
        });
      }

      const weakItem: EquipmentItem = {
        slot: 'frame',
        rarity: 0,
        name: 'Rusty Broken Frame',
        stats: { hp: 0.1 }
      };
      meta.stash.push(weakItem); // Stash now 19 items

      const initialScrap = meta.scrap;
      const newItem: EquipmentItem = {
        slot: 'frame',
        rarity: 1,
        name: 'Solid Frame',
        stats: { hp: 3.5 }
      };

      const result = addLoot(meta, newItem, undefined, mockStorage);
      expect(meta.stash.length).toBeLessThanOrEqual(MAX_STASH_SIZE);
      expect(result.soldWeakest).toBeTruthy();
      expect(result.soldWeakest?.name).toBe('Rusty Broken Frame');
      expect(meta.scrap).toBeGreaterThan(initialScrap);
    });

    it('sells items from stash and awards scrap matching rarity', () => {
      const meta = createDefaultMetaSave();
      const rareItem: EquipmentItem = {
        slot: 'tank',
        rarity: 2,
        name: 'Rare Fuel Tank',
        stats: { siphon: 0.08 }
      };

      meta.stash.push(rareItem);
      const earned = sellItem(meta, rareItem, mockStorage);

      expect(earned).toBe(18); // Rare sell value = 18
      expect(meta.scrap).toBe(18);
      expect(meta.stash.length).toBe(0);
    });

    it('unequips slot and moves item to stash', () => {
      const meta = createDefaultMetaSave();
      const player = createDefaultPlayerState();
      const item: EquipmentItem = {
        slot: 'handlebars',
        rarity: 1,
        name: 'Sport Handlebars',
        stats: { fireRate: 0.09 }
      };

      equipItem(meta, item, player, mockStorage);
      expect(meta.equipped.handlebars).toBe(item);
      expect(player.fireRateMult).toBeCloseTo(1.09);

      const unequipped = unequipSlot(meta, 'handlebars', player, mockStorage);
      expect(unequipped).toBe(item);
      expect(meta.equipped.handlebars).toBeUndefined();
      expect(meta.stash).toContain(item);
      expect(player.fireRateMult).toBeCloseTo(1.0);
    });
  });

  describe('Reactive StateManager Class', () => {
    it('notifies subscribers upon state modifications', () => {
      const sm = new StateManager(mockStorage);
      let notified = false;

      const unsubscribe = sm.subscribe(() => {
        notified = true;
      });

      sm.setMuted(true);
      expect(notified).toBe(true);
      expect(sm.isMuted()).toBe(true);

      notified = false;
      unsubscribe();
      sm.setMuted(false);
      expect(notified).toBe(false);
    });

    it('handles run reset and persistence cycles', () => {
      const sm = new StateManager(mockStorage);
      sm.player.hp = 2;
      sm.floorNum = 4;
      sm.saveRun();

      const newSm = new StateManager(mockStorage);
      const loaded = newSm.loadRun();
      expect(loaded).toBe(true);
      expect(newSm.player.hp).toBe(2);
      expect(newSm.floorNum).toBe(4);

      newSm.resetRun();
      expect(newSm.floorNum).toBe(1);
      expect(newSm.player.hp).toBe(6);
    });
  });

  describe('InputManager System', () => {
    it('initializes with default zeroed input state', async () => {
      const { InputManager } = await import('../../src/core/input');
      const input = new InputManager();
      const state = input.getState();

      expect(state.up).toBe(false);
      expect(state.down).toBe(false);
      expect(state.left).toBe(false);
      expect(state.right).toBe(false);
      expect(state.boost).toBe(false);
      expect(state.fire).toBe(false);
      expect(state.mouseX).toBe(360);
      expect(state.mouseY).toBe(360);
    });

    it('tracks movement and boost keys accurately', async () => {
      const { InputManager } = await import('../../src/core/input');
      const input = new InputManager();

      // Simulate keyboard events manually via handleKeyDown/handleKeyUp
      const win = new EventTarget() as unknown as Window & typeof globalThis;
      input.attach(null, win);

      win.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
      win.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));
      win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
      input.update();

      expect(input.getState().up).toBe(true);
      expect(input.getState().right).toBe(true);
      expect(input.getState().boost).toBe(true);
      expect(input.getState().left).toBe(false);

      win.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
      input.update();
      expect(input.getState().up).toBe(false);
      expect(input.getState().right).toBe(true);

      input.reset();
      expect(input.getState().right).toBe(false);
      expect(input.getState().boost).toBe(false);
      input.detach();
    });

    it('dispatches weapon selection callbacks on numeric keys 1-7', async () => {
      const { InputManager } = await import('../../src/core/input');
      let selectedWeapon = '';
      const input = new InputManager({
        onWeaponSelect: (w) => {
          selectedWeapon = w;
        }
      });

      const win = new EventTarget() as unknown as Window & typeof globalThis;
      input.attach(null, win);

      win.dispatchEvent(new KeyboardEvent('keydown', { key: '1' }));
      expect(selectedWeapon).toBe('pistol');

      win.dispatchEvent(new KeyboardEvent('keydown', { key: '6' }));
      expect(selectedWeapon).toBe('railgun');

      win.dispatchEvent(new KeyboardEvent('keydown', { key: '7' }));
      expect(selectedWeapon).toBe('arc_coil');

      input.detach();
    });

    it('handles modal confirmation and cancel shortcuts', async () => {
      const { InputManager } = await import('../../src/core/input');
      let confirmed = false;
      let cancelled = false;

      const input = new InputManager({
        onShopConfirm: () => { confirmed = true; },
        onShopCancel: () => { cancelled = true; }
      });

      const win = new EventTarget() as unknown as Window & typeof globalThis;
      input.attach(null, win);
      input.setModals(true, false);

      win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(confirmed).toBe(true);

      win.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(cancelled).toBe(true);

      input.detach();
    });

    it('scales canvas mouse coordinates and calculates aim angle', async () => {
      const { InputManager } = await import('../../src/core/input');
      const input = new InputManager();

      // Mock canvas element with getBoundingClientRect
      const mockCanvas = document.createElement('canvas');
      mockCanvas.getBoundingClientRect = () => ({
        left: 100,
        top: 50,
        width: 360, // Half width -> scale factor = 2.0
        height: 360,
        right: 460,
        bottom: 410,
        x: 100,
        y: 50,
        toJSON: () => {}
      });

      input.attach(mockCanvas);

      mockCanvas.dispatchEvent(new MouseEvent('mousemove', {
        clientX: 280, // (280 - 100) * (720 / 360) = 180 * 2 = 360
        clientY: 230  // (230 - 50) * (720 / 360) = 180 * 2 = 360
      }));

      // Player at center (360, 360), mouse at (360, 360) -> angle = 0
      input.update(360, 360);
      expect(input.getState().mouseX).toBe(360);
      expect(input.getState().mouseY).toBe(360);

      // Mouse moved to right
      mockCanvas.dispatchEvent(new MouseEvent('mousemove', {
        clientX: 370, // (370 - 100) * 2 = 540
        clientY: 230  // 360
      }));

      input.update(360, 360);
      expect(input.getState().mouseX).toBe(540);
      expect(input.getState().aimAngle).toBeCloseTo(0); // Aiming directly East

      mockCanvas.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      input.update();
      expect(input.getState().fire).toBe(true);

      mockCanvas.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
      input.update();
      expect(input.getState().fire).toBe(false);

      input.destroy();
    });

    it('triggers wheel weapon switching callback', async () => {
      const { InputManager } = await import('../../src/core/input');
      let wheelDir = 0;
      const input = new InputManager({
        onWheelWeaponChange: (dir) => {
          wheelDir = dir;
        }
      });

      const win = new EventTarget() as unknown as Window & typeof globalThis;
      input.attach(null, win);

      win.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
      expect(wheelDir).toBe(1);

      win.dispatchEvent(new WheelEvent('wheel', { deltaY: -50 }));
      expect(wheelDir).toBe(-1);

      input.detach();
    });
  });
});
