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
  StateManager,
  CareerOutlawRank,
  getCareerOutlawRank,
  FloorBountyContractStatus,
  getFloorBountyContractStatus
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

  describe('Career Milestone & Outlaw Rank Classifier', () => {
    it('handles null, undefined, and empty objects safely with default tier 1', () => {
      const fromNull: CareerOutlawRank = getCareerOutlawRank(null);
      expect(fromNull.rankId).toBe('rookie_courier');
      expect(fromNull.title).toBe('⚙️ ROOKIE COURIER');
      expect(fromNull.tierNumber).toBe(1);
      expect(fromNull.careerScore).toBe(0);
      expect(fromNull.nextMilestoneText).toBe('Reach 40 Career Score or Floor 2 for HIGHWAY OUTLAW');

      const fromUndefined = getCareerOutlawRank(undefined);
      expect(fromUndefined.rankId).toBe('rookie_courier');
      expect(fromUndefined.tierNumber).toBe(1);
      expect(fromUndefined.careerScore).toBe(0);

      const fromEmpty = getCareerOutlawRank({});
      expect(fromEmpty.rankId).toBe('rookie_courier');
      expect(fromEmpty.tierNumber).toBe(1);
      expect(fromEmpty.careerScore).toBe(0);

      const fromDefault = getCareerOutlawRank(createDefaultMetaSave());
      expect(fromDefault.rankId).toBe('rookie_courier');
      expect(fromDefault.tierNumber).toBe(1);
      expect(fromDefault.careerScore).toBe(0);
    });

    it('sanitizes negative values in meta progression', () => {
      const result = getCareerOutlawRank({
        totalKills: -100,
        bossesSlain: -5,
        bestFloor: -10
      });
      expect(result.careerScore).toBe(0);
      expect(result.tierNumber).toBe(1);
      expect(result.rankId).toBe('rookie_courier');
    });

    it('calculates careerScore accurately according to formula (kills + bosses*25 + (floor-1)*40)', () => {
      const result = getCareerOutlawRank({
        totalKills: 15,
        bossesSlain: 2,
        bestFloor: 3
      });
      // 15 + (2 * 25) + ((3 - 1) * 40) = 15 + 50 + 80 = 145
      expect(result.careerScore).toBe(145);
      expect(result.tierNumber).toBe(3);
      expect(result.rankId).toBe('syndicate_enforcer');
    });

    it('classifies Tier 1 (rookie_courier) when score < 40 and bestFloor < 2', () => {
      const result = getCareerOutlawRank({
        totalKills: 39,
        bossesSlain: 0,
        bestFloor: 1
      });
      expect(result.careerScore).toBe(39);
      expect(result.tierNumber).toBe(1);
      expect(result.rankId).toBe('rookie_courier');
      expect(result.title).toBe('⚙️ ROOKIE COURIER');
      expect(result.nextMilestoneText).toBe('Reach 40 Career Score or Floor 2 for HIGHWAY OUTLAW');
    });

    it('classifies Tier 2 (highway_outlaw) when score >= 40 or bestFloor >= 2', () => {
      // By score
      const byScore = getCareerOutlawRank({
        totalKills: 40,
        bossesSlain: 0,
        bestFloor: 1
      });
      expect(byScore.careerScore).toBe(40);
      expect(byScore.tierNumber).toBe(2);
      expect(byScore.rankId).toBe('highway_outlaw');
      expect(byScore.title).toBe('🔥 HIGHWAY OUTLAW');
      expect(byScore.nextMilestoneText).toBe('Reach 120 Career Score or Floor 3 for SYNDICATE ENFORCER');

      // By floor reached
      const byFloor = getCareerOutlawRank({
        totalKills: 0,
        bossesSlain: 0,
        bestFloor: 2
      });
      expect(byFloor.careerScore).toBe(40);
      expect(byFloor.tierNumber).toBe(2);
      expect(byFloor.rankId).toBe('highway_outlaw');
    });

    it('classifies Tier 3 (syndicate_enforcer) when score >= 120 or bestFloor >= 3', () => {
      // By score
      const byScore = getCareerOutlawRank({
        totalKills: 120,
        bossesSlain: 0,
        bestFloor: 1
      });
      expect(byScore.careerScore).toBe(120);
      expect(byScore.tierNumber).toBe(3);
      expect(byScore.rankId).toBe('syndicate_enforcer');
      expect(byScore.title).toBe('⚡ SYNDICATE ENFORCER');
      expect(byScore.nextMilestoneText).toBe('Reach 250 Career Score or Floor 5 for APEX ROADLORD');

      // By floor reached (score = 80 < 120)
      const byFloor = getCareerOutlawRank({
        totalKills: 0,
        bossesSlain: 0,
        bestFloor: 3
      });
      expect(byFloor.careerScore).toBe(80);
      expect(byFloor.tierNumber).toBe(3);
      expect(byFloor.rankId).toBe('syndicate_enforcer');
    });

    it('classifies Tier 4 (apex_roadlord) when score >= 250 or bestFloor >= 5', () => {
      // By score
      const byScore = getCareerOutlawRank({
        totalKills: 250,
        bossesSlain: 0,
        bestFloor: 1
      });
      expect(byScore.careerScore).toBe(250);
      expect(byScore.tierNumber).toBe(4);
      expect(byScore.rankId).toBe('apex_roadlord');
      expect(byScore.title).toBe('☠️ APEX ROADLORD');
      expect(byScore.nextMilestoneText).toBe('Reach 500 Career Score or clear Floor 6 for LEGEND OF VALHALLA');

      // By floor reached (score = 160 < 250)
      const byFloor = getCareerOutlawRank({
        totalKills: 0,
        bossesSlain: 0,
        bestFloor: 5
      });
      expect(byFloor.careerScore).toBe(160);
      expect(byFloor.tierNumber).toBe(4);
      expect(byFloor.rankId).toBe('apex_roadlord');
    });

    it('classifies Tier 5 (legend_of_valhalla) when score >= 500 or (bestFloor >= 6 && bosses >= 6)', () => {
      // By score
      const byScore = getCareerOutlawRank({
        totalKills: 500,
        bossesSlain: 0,
        bestFloor: 1
      });
      expect(byScore.careerScore).toBe(500);
      expect(byScore.tierNumber).toBe(5);
      expect(byScore.rankId).toBe('legend_of_valhalla');
      expect(byScore.title).toBe('👑 LEGEND OF VALHALLA');
      expect(byScore.nextMilestoneText).toBe('MAX CAREER RANK ACHIEVED');

      // By dual condition (bestFloor >= 6 && bosses >= 6) with careerScore < 500
      // 0 + 6*25 + 5*40 = 150 + 200 = 350
      const byDual = getCareerOutlawRank({
        totalKills: 0,
        bossesSlain: 6,
        bestFloor: 6
      });
      expect(byDual.careerScore).toBe(350);
      expect(byDual.tierNumber).toBe(5);
      expect(byDual.rankId).toBe('legend_of_valhalla');

      // Edge case: bestFloor >= 6 but bosses < 6 and score < 500 falls back to Tier 4
      // 0 + 5*25 + 5*40 = 125 + 200 = 325
      const edgeNotTier5 = getCareerOutlawRank({
        totalKills: 0,
        bossesSlain: 5,
        bestFloor: 6
      });
      expect(edgeNotTier5.careerScore).toBe(325);
      expect(edgeNotTier5.tierNumber).toBe(4);
      expect(edgeNotTier5.rankId).toBe('apex_roadlord');
    });
  });

  describe('Floor Bounty Contract Progress Evaluator', () => {
    it('maps canonical floor bounties for Floors 1 through 6', () => {
      const canonicalExpected = [
        {
          floor: 1,
          title: 'NEON DAREDEVIL',
          task: 'Dodge 3 enemy projectiles or clear Floor 1 Boss',
          scrap: 8,
          coins: 10
        },
        {
          floor: 2,
          title: 'DRIFT EXECUTIONER',
          task: 'Trigger 2 Drift Shockwaves or clear Floor 2 Boss',
          scrap: 10,
          coins: 12
        },
        {
          floor: 3,
          title: 'THERMAL HUNTER',
          task: 'Eliminate 6 hostiles or clear Floor 3 Boss',
          scrap: 12,
          coins: 15
        },
        {
          floor: 4,
          title: 'CRYO BREAKER',
          task: 'Detonate 2 Arena Barrels or clear Floor 4 Boss',
          scrap: 15,
          coins: 18
        },
        {
          floor: 5,
          title: 'APEX INTERCEPTOR',
          task: 'Clear 3 combat rooms or defeat Floor 5 Boss',
          scrap: 18,
          coins: 22
        },
        {
          floor: 6,
          title: 'VALHALLA CONQUEROR',
          task: 'Defeat Omega Valhalla on Floor 6',
          scrap: 25,
          coins: 30
        }
      ];

      for (const expected of canonicalExpected) {
        const bounty: FloorBountyContractStatus = getFloorBountyContractStatus(expected.floor);
        expect(bounty.targetFloor).toBe(expected.floor);
        expect(bounty.contractTitle).toBe(expected.title);
        expect(bounty.taskText).toBe(expected.task);
        expect(bounty.rewardScrap).toBe(expected.scrap);
        expect(bounty.rewardCoins).toBe(expected.coins);
        expect(bounty.summaryLine).toBe(
          `BOUNTY [F${expected.floor}] ${expected.title}: ${expected.task} (+${expected.scrap} SCRAP, +${expected.coins} COINS)`
        );
        expect(bounty.isStyleMilestoneMet).toBe(false);
      }
    });

    it('wraps cyclically on higher floors (Floor 7 -> Neon Daredevil, Floor 12 -> Valhalla Conqueror)', () => {
      const bountyF7 = getFloorBountyContractStatus(7);
      expect(bountyF7.targetFloor).toBe(7);
      expect(bountyF7.contractTitle).toBe('NEON DAREDEVIL');
      expect(bountyF7.rewardScrap).toBe(8);
      expect(bountyF7.rewardCoins).toBe(10);
      expect(bountyF7.summaryLine).toBe(
        'BOUNTY [F7] NEON DAREDEVIL: Dodge 3 enemy projectiles or clear Floor 1 Boss (+8 SCRAP, +10 COINS)'
      );

      const bountyF12 = getFloorBountyContractStatus(12);
      expect(bountyF12.targetFloor).toBe(12);
      expect(bountyF12.contractTitle).toBe('VALHALLA CONQUEROR');
      expect(bountyF12.rewardScrap).toBe(25);
      expect(bountyF12.rewardCoins).toBe(30);

      const bountyF13 = getFloorBountyContractStatus(13);
      expect(bountyF13.targetFloor).toBe(13);
      expect(bountyF13.contractTitle).toBe('NEON DAREDEVIL');
    });

    it('clamps negative, zero, float, and NaN floor inputs safely to floor >= 1', () => {
      const defaultBounty = getFloorBountyContractStatus();
      expect(defaultBounty.targetFloor).toBe(1);
      expect(defaultBounty.contractTitle).toBe('NEON DAREDEVIL');

      const negativeBounty = getFloorBountyContractStatus(-5);
      expect(negativeBounty.targetFloor).toBe(1);
      expect(negativeBounty.contractTitle).toBe('NEON DAREDEVIL');

      const zeroBounty = getFloorBountyContractStatus(0);
      expect(zeroBounty.targetFloor).toBe(1);

      const nanBounty = getFloorBountyContractStatus(NaN);
      expect(nanBounty.targetFloor).toBe(1);

      const infinityBounty = getFloorBountyContractStatus(Infinity);
      expect(infinityBounty.targetFloor).toBe(1);

      const floatBounty = getFloorBountyContractStatus(3.9);
      expect(floatBounty.targetFloor).toBe(3);
      expect(floatBounty.contractTitle).toBe('THERMAL HUNTER');
    });

    it('evaluates isStyleMilestoneMet correctly across cruising (D) vs high-style (A/S/SS/SSS) states', () => {
      // Missing or null player
      expect(getFloorBountyContractStatus(1, null).isStyleMilestoneMet).toBe(false);
      expect(getFloorBountyContractStatus(1, undefined).isStyleMilestoneMet).toBe(false);

      // Low style rank and low score
      expect(getFloorBountyContractStatus(1, { styleScore: 0, styleRank: 'D' }).isStyleMilestoneMet).toBe(false);
      expect(getFloorBountyContractStatus(1, { styleScore: 49, styleRank: 'B' }).isStyleMilestoneMet).toBe(false);

      // Met via styleScore >= 50 with low rank
      expect(getFloorBountyContractStatus(1, { styleScore: 50, styleRank: 'D' }).isStyleMilestoneMet).toBe(true);
      expect(getFloorBountyContractStatus(1, { styleScore: 85, styleRank: 'C' }).isStyleMilestoneMet).toBe(true);

      // Met via high rank (A, S, SS, SSS) even with score < 50
      expect(getFloorBountyContractStatus(1, { styleScore: 0, styleRank: 'A' }).isStyleMilestoneMet).toBe(true);
      expect(getFloorBountyContractStatus(1, { styleScore: 10, styleRank: 'S' }).isStyleMilestoneMet).toBe(true);
      expect(getFloorBountyContractStatus(1, { styleScore: 25, styleRank: 'SS' }).isStyleMilestoneMet).toBe(true);
      expect(getFloorBountyContractStatus(1, { styleScore: 0, styleRank: 'SSS' }).isStyleMilestoneMet).toBe(true);

      // Both met
      expect(getFloorBountyContractStatus(1, { styleScore: 120, styleRank: 'SSS' }).isStyleMilestoneMet).toBe(true);
    });
  });
});
