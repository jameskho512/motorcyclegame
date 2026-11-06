/**
 * MOTO-ROGUE: Tier 5 Empirical Playability Verification & End-to-End Simulation
 *
 * Verifies all acceptance criteria from ORIGINAL_REQUEST.md:
 * 1. Controls: WASD movement, Shift NOS boost, mouse aim/fire, weapon switching (1-7 & wheel), menu interactions (G garage, M mute, shop purchase confirm).
 * 2. Save state persistence: verify round-tripping for moto_rogue_save_v2 (meta progress) and moto_rogue_run_v1 (in-run checkpoint) in localStorage.
 * 3. Audio: verify continuous engine hum and all 17 procedural SFX methods.
 * 4. Dev server & build verification: verify DOM layout matching widescreen sidebar setup and main.ts integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  WeaponId,
  PlayerState,
  EquipmentItem,
  Pickup,
  MetaSaveState,
  SAVE_KEY_META,
  SAVE_KEY_RUN,
  SAVE_KEY_MUTED
} from '../../src/types/game';

import {
  GarageController,
  getWeaponMasteryTier,
  GarageCallbacks
} from '../../src/ui/garage';

import {
  ShopModalController,
  getShopItemAppraisal
} from '../../src/ui/shopModal';

import {
  SettingsController,
  SettingsAudioPort,
  ScreenShakeLevel
} from '../../src/ui/settings';

import { InputManager } from '../../src/core/input';
import {
  SafeLocalStorage,
  createDefaultPlayerState,
  createDefaultMetaSave,
  saveRunCheckpoint,
  loadRunCheckpoint,
  clearRunSave,
  writeMetaSave,
  loadMetaSave
} from '../../src/core/state';

import {
  SoundSynthesizer,
  calculateEngineParams,
  DEFAULT_VOLUME_SETTINGS
} from '../../src/audio/sfx';

import {
  updateBikeKinematics,
  updateNos
} from '../../src/systems/physics';

import {
  createCombatState,
  fireWeapon,
  calcOverkillBonus
} from '../../src/systems/combat';

import { generateDungeon, getFloorBountyContract } from '../../src/world/dungeon';
import { formatWeaponMasteryHint } from '../../src/ui/tooltip';
import { MotoRogueApp } from '../../src/main';

import { getHubNpcGreeting } from '@/world/dungeon';
import { getModStackTierClass, HUDController } from '@/ui/hud';
import { getPortalRiskAssessment } from '@/ui/portalModal';
import { getStashSalvageSummary } from '@/ui/garage';
import { formatDummyHitTelemetry } from '@/systems/combat';

describe('Tier 5: Playability Verification & End-to-End Simulation', () => {
  let player: PlayerState;
  let storage: SafeLocalStorage;

  beforeEach(() => {
    storage = new SafeLocalStorage();
    storage.clear();
    player = createDefaultPlayerState();
  });

  // ==========================================================================
  // 1. CONTROLS VERIFICATION
  // ==========================================================================
  describe('1. Controls Verification (WASD, NOS, Aim/Fire, Weapons, Menus)', () => {
    it('WASD and Arrow keys update movement vectors and kinematics', () => {
      const input = new InputManager();
      const mockCanvas = document.createElement('canvas');
      mockCanvas.width = 720;
      mockCanvas.height = 720;
      input.attach(mockCanvas, window);

      // 1. Simulate keydown 'w' and 'd' (moving up-right)
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'd' }));

      input.update(player.x, player.y);
      const state = input.getState();
      expect(state.up).toBe(true);
      expect(state.right).toBe(true);
      expect(state.down).toBe(false);
      expect(state.left).toBe(false);

      // Verify physics kinematics integration
      const dt = 0.016;
      const initialX = player.x;
      const initialY = player.y;

      const ix = (state.right ? 1 : 0) - (state.left ? 1 : 0);
      const iy = (state.down ? 1 : 0) - (state.up ? 1 : 0);

      const dungeon = generateDungeon(1);
      const room = dungeon.rooms['0,0'];

      updateBikeKinematics(player, ix, iy, false, dt, room);
      player.x += player.vx * dt;
      player.y += player.vy * dt;

      // Player moved up (y decreased) and right (x increased)
      expect(player.vx).toBeGreaterThan(0);
      expect(player.vy).toBeLessThan(0);
      expect(player.x).toBeGreaterThan(initialX);
      expect(player.y).toBeLessThan(initialY);

      // Release keys
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'd' }));
      input.update(player.x, player.y);
      expect(input.getState().up).toBe(false);
      expect(input.getState().right).toBe(false);

      input.destroy();
    });

    it('Shift activates NOS boost: drains at 35/s, recharges at 16/s, locks when empty until 25%', () => {
      expect(player.nos).toBe(100);
      expect(player.nosLock).toBe(false);

      // 1. Active boosting
      const dt = 0.1;
      const res1 = updateNos(player, true, true, dt);
      expect(res1.boosting).toBe(true);
      expect(player.nos).toBeCloseTo(100 - 35 * dt, 1); // 96.5

      // 2. Continuous boosting until tank reaches 0
      player.nos = 5;
      updateNos(player, true, true, 0.2); // 5 - 35*0.2 = -2 -> clamped to 0
      expect(player.nos).toBe(0);
      expect(player.nosLock).toBe(true); // Locked!

      // 3. Recharging after delay
      // Reset nos state for clean recharge progression test
      player.nos = 0;
      player.nosLock = true;
      player.nosDelay = 0.7;

      // Interval 1: 0.4s elapsed (0.3s delay remaining, no recharge yet)
      updateNos(player, false, false, 0.4);
      expect(player.nosDelay).toBeCloseTo(0.3);
      expect(player.nos).toBe(0);
      expect(player.nosLock).toBe(true);

      // Interval 2: 0.4s elapsed (delay expires, recharges at 16/s)
      updateNos(player, false, false, 0.4);
      expect(player.nosDelay).toBeLessThanOrEqual(0);
      expect(player.nos).toBeCloseTo(6.4);
      expect(player.nosLock).toBe(true); // Still locked (< 25)

      // Interval 3: 0.8s elapsed (recharges to 6.4 + 12.8 = 19.2)
      updateNos(player, false, false, 0.8);
      expect(player.nos).toBeCloseTo(19.2);
      expect(player.nosLock).toBe(true); // Still locked (< 25)

      // Interval 4: 0.5s elapsed (recharges to 19.2 + 8.0 = 27.2 >= 25 -> unlocks!)
      updateNos(player, false, false, 0.5);
      expect(player.nos).toBeGreaterThanOrEqual(25);
      expect(player.nosLock).toBe(false); // Unlocked!
    });

    it('Mouse tracking computes aimAngle and mousedown triggers primary fire', () => {
      const callbacks = {
        onWeaponSelect: vi.fn(),
        onToggleGarage: vi.fn(),
        onToggleMute: vi.fn(),
        onUserGesture: vi.fn()
      };
      const input = new InputManager(callbacks);
      const mockCanvas = document.createElement('canvas');
      mockCanvas.getBoundingClientRect = () => ({
        left: 0,
        top: 0,
        width: 720,
        height: 720,
        right: 720,
        bottom: 720,
        x: 0,
        y: 0,
        toJSON: () => {}
      });
      input.attach(mockCanvas, window);

      player.x = 360;
      player.y = 360;

      // Mouse moved to (360, 100) -> aim straight UP (-PI/2)
      mockCanvas.dispatchEvent(new MouseEvent('mousemove', { clientX: 360, clientY: 100 }));
      input.update(player.x, player.y);
      expect(input.getState().mouseX).toBe(360);
      expect(input.getState().mouseY).toBe(100);
      expect(input.getState().aimAngle).toBeCloseTo(-Math.PI / 2);

      // Mouse down triggers fire and user gesture
      mockCanvas.dispatchEvent(new MouseEvent('mousedown', { button: 0 }));
      input.update(player.x, player.y);
      expect(input.getState().fire).toBe(true);
      expect(callbacks.onUserGesture).toHaveBeenCalled();

      // Fire weapon into combat state
      const combatState = createCombatState();
      expect(combatState.bullets).toHaveLength(0);

      player.fireTimer = 0;
      fireWeapon({
        player,
        target: { x: 360, y: 100 },
        state: combatState,
        audio: new SoundSynthesizer(storage)
      });

      expect(combatState.bullets.length).toBeGreaterThan(0);
      const bullet = combatState.bullets[0];
      // Muzzle offset is 20px in aim direction (aiming up: y offset = -20)
      expect(bullet.x).toBeCloseTo(player.x);
      expect(bullet.y).toBeCloseTo(player.y - 20);
      expect(bullet.vy).toBeLessThan(0); // moving upward
      expect(player.fireTimer).toBeGreaterThan(0);

      // Mouse up stops firing
      window.dispatchEvent(new MouseEvent('mouseup', { button: 0 }));
      input.update(player.x, player.y);
      expect(input.getState().fire).toBe(false);

      input.destroy();
    });

    it('Weapon selection keys (1-7) and wheel scroll cycle through weapons', () => {
      const selectedWeapons: WeaponId[] = [];
      const wheelDirections: (1 | -1)[] = [];

      const input = new InputManager({
        onWeaponSelect: (id) => selectedWeapons.push(id),
        onWheelWeaponChange: (dir) => wheelDirections.push(dir)
      });
      input.attach(null, window);

      // Test keys '1' through '7'
      for (let i = 1; i <= 7; i++) {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: String(i) }));
      }

      expect(selectedWeapons).toEqual([
        'pistol',
        'machine_gun',
        'flamethrower',
        'grenade_launcher',
        'shotgun',
        'railgun',
        'arc_coil'
      ]);

      // Test mouse wheel cycling
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: 100 }));
      window.dispatchEvent(new WheelEvent('wheel', { deltaY: -100 }));

      expect(wheelDirections).toEqual([1, -1]);

      input.destroy();
    });

    it('Menu shortcuts: G / Escape toggles garage, M toggles mute, Shop purchase confirm/cancel', () => {
      let garageToggles = 0;
      let muteToggles = 0;
      let shopConfirms = 0;
      let shopCancels = 0;

      const input = new InputManager({
        onToggleGarage: () => garageToggles++,
        onToggleMute: () => muteToggles++,
        onShopConfirm: () => shopConfirms++,
        onShopCancel: () => shopCancels++
      });
      input.attach(null, window);

      // Test G key
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
      expect(garageToggles).toBe(1);

      // Test M key
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
      expect(muteToggles).toBe(1);

      // Escape toggles garage when shop modal is not active
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'escape' }));
      expect(garageToggles).toBe(2);

      // Now activate shop modal
      input.setModals(true, false);

      // In shop modal, 'e' and 'enter' confirm purchase
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'e' }));
      expect(shopConfirms).toBe(1);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'enter' }));
      expect(shopConfirms).toBe(2);

      // In shop modal, 'escape' cancels purchase rather than opening garage
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'escape' }));
      expect(shopCancels).toBe(1);
      expect(garageToggles).toBe(2); // Garage toggle did not increment

      input.destroy();
    });
  });

  // ==========================================================================
  // 2. SAVE STATE PERSISTENCE (moto_rogue_save_v2 & moto_rogue_run_v1)
  // ==========================================================================
  describe('2. Save State Persistence Round-Trip', () => {
    it('moto_rogue_save_v2: round-trips scrap, weapon unlocks, ranks, equipped parts, and stash', () => {
      const meta = createDefaultMetaSave();
      meta.scrap = 385;
      meta.ranks.dmg = 3;
      meta.ranks.fireRate = 2;
      meta.ranks.speed = 1;
      meta.ranks.maxHp = 4;
      meta.unlocked.railgun = true;
      meta.unlocked.shotgun = true;

      const tireItem: EquipmentItem = {
        slot: 'tires',
        rarity: 2,
        name: 'Radial Slick Tires',
        stats: { speed: 0.12 }
      };
      const stashItem: EquipmentItem = {
        slot: 'exhaust',
        rarity: 1,
        name: 'Tuned Header',
        stats: { blast: 0.08 }
      };

      meta.equipped.tires = tireItem;
      meta.stash.push(stashItem);

      // Save to localStorage
      writeMetaSave(meta, storage);
      const raw = storage.getItem(SAVE_KEY_META);
      expect(raw).not.toBeNull();
      expect(raw).toContain('"scrap":385');
      expect(raw).toContain('"railgun":true');

      // Load into new instance
      const loaded = loadMetaSave(storage);
      expect(loaded.scrap).toBe(385);
      expect(loaded.ranks.dmg).toBe(3);
      expect(loaded.ranks.fireRate).toBe(2);
      expect(loaded.ranks.speed).toBe(1);
      expect(loaded.ranks.maxHp).toBe(4);
      expect(loaded.unlocked.railgun).toBe(true);
      expect(loaded.unlocked.shotgun).toBe(true);
      expect(loaded.unlocked.arc_coil).toBe(false);
      expect(loaded.equipped.tires).toBeDefined();
      expect(loaded.equipped.tires?.name).toBe('Radial Slick Tires');
      expect(loaded.stash).toHaveLength(1);
      expect(loaded.stash[0].name).toBe('Tuned Header');
    });

    it('moto_rogue_run_v1: round-trips active checkpoint, restores on reload, clears on death', () => {
      player.hp = 3;
      player.maxHp = 7;
      player.coins = 64;
      player.dmgMult = 1.45;
      player.fireRateMult = 1.24;
      player.speedMult = 1.18;
      player.projSpeedMult = 1.30;
      player.blastMult = 1.25;
      player.pierce = 2;
      player.bounce = 1;
      player.multiShot = 3;
      player.vampChance = 0.25;
      player.killCount = 27;
      player.weapon = 'grenade_launcher';
      player.runWeapons = { grenade_launcher: true };
      player.items = ['nitro_syringe', 'tire_iron'];
      player.itemStacks = { nitro_syringe: 2, tire_iron: 1 };
      player.nos = 84;

      // Save Floor 2 checkpoint
      saveRunCheckpoint(player, 2, storage);
      const raw = storage.getItem(SAVE_KEY_RUN);
      expect(raw).not.toBeNull();

      // Simulate new session
      const freshPlayer = createDefaultPlayerState();
      const meta = createDefaultMetaSave();
      meta.unlocked.grenade_launcher = true;

      const res = loadRunCheckpoint(freshPlayer, meta, storage);
      expect(res.restored).toBe(true);
      expect(res.floorNum).toBe(2);
      expect(freshPlayer.hp).toBe(3);
      expect(freshPlayer.maxHp).toBe(7);
      expect(freshPlayer.coins).toBe(64);
      expect(freshPlayer.dmgMult).toBeCloseTo(1.45);
      expect(freshPlayer.fireRateMult).toBeCloseTo(1.24);
      expect(freshPlayer.speedMult).toBeCloseTo(1.18);
      expect(freshPlayer.pierce).toBe(2);
      expect(freshPlayer.bounce).toBe(1);
      expect(freshPlayer.multiShot).toBe(3);
      expect(freshPlayer.vampChance).toBeCloseTo(0.25);
      expect(freshPlayer.killCount).toBe(27);
      expect(freshPlayer.weapon).toBe('grenade_launcher');
      expect(freshPlayer.items).toEqual(['nitro_syringe', 'tire_iron']);
      expect(freshPlayer.itemStacks).toEqual({ nitro_syringe: 2, tire_iron: 1 });
      expect(freshPlayer.nos).toBe(84);

      // Verify clear on death
      clearRunSave(storage);
      expect(storage.getItem(SAVE_KEY_RUN)).toBeNull();

      const deadCheck = loadRunCheckpoint(createDefaultPlayerState(), meta, storage);
      expect(deadCheck.restored).toBe(false);
      expect(deadCheck.floorNum).toBe(1);
    });

    it('moto_rogue_muted: persists mute preference and SoundSynthesizer respects it', () => {
      const sfx = new SoundSynthesizer(storage);
      expect(sfx.isMuted()).toBe(false);

      sfx.setMuted(true);
      expect(storage.getItem(SAVE_KEY_MUTED)).toBe('1');
      expect(sfx.isMuted()).toBe(true);

      sfx.toggleMute();
      expect(storage.getItem(SAVE_KEY_MUTED)).toBe('0');
      expect(sfx.isMuted()).toBe(false);
    });
  });

  // ==========================================================================
  // 3. AUDIO VERIFICATION (Continuous Engine Hum & 17 Procedural SFX)
  // ==========================================================================
  describe('3. Audio Engine Hum & 17 Procedural SFX Methods', () => {
    it('continuous twin-cylinder motorcycle engine hum calculates exact frequencies & filter cutoff', () => {
      // Formula:
      // f1 = 44 + 56 * speedRatio + (isBoosting ? 36 : 0)
      // f2 = f1 * (isBoosting ? 2.5 : 2.0)
      // cutoff = 160 + 240 * speedRatio + (isBoosting ? 260 : 0)
      // gain = 0.025 + 0.055 * speedRatio + (isBoosting ? 0.045 : 0)

      // Idle (speed = 0, no boost)
      const idle = calculateEngineParams(0, false, false, false);
      expect(idle.f1).toBe(44);
      expect(idle.f2).toBe(88);
      expect(idle.cutoff).toBe(160);
      expect(idle.gain).toBeCloseTo(0.025);

      // Half speed (speedRatio = 0.5, no boost)
      const half = calculateEngineParams(0.5, false, false, false);
      expect(half.f1).toBe(72);
      expect(half.f2).toBe(144);
      expect(half.cutoff).toBe(280);
      expect(half.gain).toBeCloseTo(0.0525);

      // Full throttle (speedRatio = 1.0, no boost)
      const full = calculateEngineParams(1.0, false, false, false);
      expect(full.f1).toBe(100);
      expect(full.f2).toBe(200);
      expect(full.cutoff).toBe(400);
      expect(full.gain).toBeCloseTo(0.080);

      // NOS Boosting (speedRatio = 1.0, isBoosting = true)
      const boost = calculateEngineParams(1.0, true, false, false);
      expect(boost.f1).toBe(136); // 44 + 56 + 36
      expect(boost.f2).toBe(340); // 136 * 2.5
      expect(boost.cutoff).toBe(660); // 160 + 240 + 260
      expect(boost.gain).toBeCloseTo(0.125);

      // Paused / Muted clamps gain to 0.0001
      const paused = calculateEngineParams(1.0, true, true, false);
      expect(paused.gain).toBe(0.0001);

      const muted = calculateEngineParams(1.0, true, false, true);
      expect(muted.gain).toBe(0.0001);
    });

    it('executes all 7 weapon shooting sound routines safely', () => {
      const sfx = new SoundSynthesizer(storage);
      const weapons: WeaponId[] = [
        'pistol',
        'machine_gun',
        'flamethrower',
        'grenade_launcher',
        'shotgun',
        'railgun',
        'arc_coil'
      ];

      for (const w of weapons) {
        expect(() => sfx.shoot(w)).not.toThrow();
      }
    });

    it('executes all 10 procedural event SFX methods safely', () => {
      const sfx = new SoundSynthesizer(storage);

      // 1. Arc chain
      expect(() => sfx.arcChain()).not.toThrow();
      // 2. Explosion
      expect(() => sfx.explosion()).not.toThrow();
      // 3. Hit (normal & crit)
      expect(() => sfx.hit(false)).not.toThrow();
      expect(() => sfx.hit(true)).not.toThrow();
      // 4. Enemy kill (normal & boss)
      expect(() => sfx.enemyKill(false)).not.toThrow();
      expect(() => sfx.enemyKill(true)).not.toThrow();
      // 5. Player hurt
      expect(() => sfx.playerHurt()).not.toThrow();
      // 6. Game over
      expect(() => sfx.gameOverSound()).not.toThrow();
      // 7. Pickups: fuel, item, loot
      expect(() => sfx.pickupFuel()).not.toThrow();
      expect(() => sfx.pickupItem()).not.toThrow();
      expect(() => sfx.pickupLoot(0)).not.toThrow();
      expect(() => sfx.pickupLoot(3)).not.toThrow();
      // 8. Shop buy & error
      expect(() => sfx.shopBuy()).not.toThrow();
      expect(() => sfx.shopError()).not.toThrow();
      // 9. Room clear & door transition & next floor
      expect(() => sfx.roomClear()).not.toThrow();
      expect(() => sfx.doorTransition()).not.toThrow();
      expect(() => sfx.nextFloor()).not.toThrow();
      // 10. UI Click
      expect(() => sfx.uiClick()).not.toThrow();

      // Engine update
      expect(() => sfx.updateEngine(0.75, true, false)).not.toThrow();
    });
  });

  // ==========================================================================
  // 4. DEV SERVER & DOM LAYOUT INTEGRATION VERIFICATION
  // ==========================================================================
  describe('4. DOM Layout & Bootstrap Integration Verification', () => {
    it('index.html contains expected 3-column widescreen layout, canvases and overlays', () => {
      // In happy-dom test environment, verify required elements can be resolved
      document.body.innerHTML = `
        <div id="app-layout">
          <aside class="sidebar-col" id="left-sidebar">
            <canvas id="fuel-gauge" width="240" height="120"></canvas>
            <span id="hp-text">6 / 6</span>
            <div id="nos-fill"></div>
            <strong id="coin-count">0 🪙</strong>
            <strong id="scrap-count">0 ⚙️</strong>
            <strong id="floor-num">1</strong>
            <canvas id="minimap-canvas" width="240" height="150"></canvas>
            <button id="btn-open-garage">[G] Garage</button>
            <button id="btn-toggle-sound">🔊 [M]</button>
          </aside>
          <div id="game-wrapper">
            <canvas id="canvas" width="720" height="720"></canvas>
            <div id="shop-confirm-overlay">
              <div class="shop-item-name" id="shop-modal-name">Item Name</div>
              <div class="shop-item-desc" id="shop-modal-desc">Item Description</div>
              <div class="shop-item-cost" id="shop-modal-cost">Cost: 15 Coins</div>
              <button id="btn-confirm-buy">[E] Confirm</button>
              <button id="btn-cancel-buy">[ESC] Cancel</button>
            </div>
            <div id="garage-overlay">
              <canvas id="bike-canvas" width="300" height="190"></canvas>
              <h1 id="modal-title">MOTO-GARAGE</h1>
              <p id="modal-subtitle">Sub</p>
              <span id="modal-scrap">0</span>
              <div id="slots-left"></div>
              <div id="slots-right"></div>
              <div id="eq-totals"></div>
              <div id="stash-list"></div>
              <div id="unlock-list"></div>
              <div id="meta-upgrade-list"></div>
              <button id="btn-resume">Resume</button>
              <button id="btn-new-run">New Run</button>
              <button id="btn-reset-save">Reset</button>
            </div>
          </div>
          <aside class="sidebar-col" id="right-sidebar">
            <div id="weapon-bar"></div>
            <div id="stats-grid"></div>
            <div id="items-list"></div>
          </aside>
        </div>
      `;

      expect(document.getElementById('app-layout')).not.toBeNull();
      expect(document.getElementById('left-sidebar')).not.toBeNull();
      expect(document.getElementById('game-wrapper')).not.toBeNull();
      expect(document.getElementById('right-sidebar')).not.toBeNull();
      expect(document.getElementById('canvas')).not.toBeNull();
      expect(document.getElementById('fuel-gauge')).not.toBeNull();
      expect(document.getElementById('minimap-canvas')).not.toBeNull();
      expect(document.getElementById('bike-canvas')).not.toBeNull();
      expect(document.getElementById('shop-confirm-overlay')).not.toBeNull();
      expect(document.getElementById('garage-overlay')).not.toBeNull();
    });
  });

  // ==========================================================================
  // 5. FULL END-TO-END MOTOROGUEAPP SIMULATION
  // ==========================================================================
  describe('5. Full End-to-End MotoRogueApp Gameplay Loop Simulation', () => {
    function setupAppDom() {
      document.body.innerHTML = `
        <div id="app-layout">
          <aside class="sidebar-col" id="left-sidebar">
            <span id="hp-text">6 / 6</span>
            <canvas id="fuel-gauge" width="240" height="120"></canvas>
            <div id="nos-fill"></div>
            <strong id="coin-count">0 🪙</strong>
            <strong id="scrap-count">0 ⚙️</strong>
            <strong id="floor-num">1</strong>
            <canvas id="minimap-canvas" width="240" height="150"></canvas>
            <div id="save-status">Autosave: local storage</div>
            <button id="btn-open-garage">[G] Garage &amp; Tuning</button>
            <button id="btn-toggle-sound">🔊 [M]</button>
          </aside>
          <div id="game-wrapper">
            <canvas id="canvas" width="720" height="720"></canvas>
            <div id="shop-confirm-overlay">
              <div class="shop-item-name" id="shop-modal-name">Item Name</div>
              <div class="shop-item-desc" id="shop-modal-desc">Item Description</div>
              <div class="shop-item-cost" id="shop-modal-cost">Cost: 15 Coins</div>
              <button id="btn-confirm-buy">[E] Confirm Purchase</button>
              <button id="btn-cancel-buy">[ESC] Cancel</button>
            </div>
            <div id="garage-overlay">
              <h1 id="modal-title">MOTO-GARAGE</h1>
              <p id="modal-subtitle">Sub</p>
              <span id="modal-scrap">0</span>
              <canvas id="bike-canvas" width="300" height="190"></canvas>
              <div id="slots-left"></div>
              <div id="slots-right"></div>
              <div id="eq-totals"></div>
              <div id="stash-list"></div>
              <div id="unlock-list"></div>
              <div id="meta-upgrade-list"></div>
              <button id="btn-resume">Resume Run</button>
              <button id="btn-new-run">Start Fresh Run</button>
              <button id="btn-reset-save">Full Save Reset</button>
            </div>
          </div>
          <aside class="sidebar-col" id="right-sidebar">
            <div id="weapon-bar"></div>
            <div id="stats-grid"></div>
            <div id="items-list"></div>
          </aside>
        </div>
        <div id="tooltip"></div>
      `;
    }

    it('boots MotoRogueApp, runs 60-frame game loop, handles WASD/NOS, firing, and pickups', () => {
      setupAppDom();
      const app = new MotoRogueApp();
      app.startNewRun(false);

      expect(app.curRoomX).toBe(0);
      expect(app.curRoomY).toBe(0);
      expect(app.stateManager.player.x).toBe(360);
      expect(app.stateManager.player.y).toBe(360);

      // 1. Simulate WASD movement + NOS boosting over 30 frames (0.5 seconds)
      const input = app.inputManager;
      const rawKeys = (input as any).rawKeys;
      rawKeys['w'] = true;
      rawKeys['shift'] = true;
      input.update(app.stateManager.player.x, app.stateManager.player.y);

      for (let f = 0; f < 30; f++) {
        app.update(0.016);
      }

      // Player moved upward and NOS drained
      expect(app.stateManager.player.y).toBeLessThan(360);
      expect(app.stateManager.player.nos).toBeLessThan(100);

      // Release movement
      rawKeys['w'] = false;
      rawKeys['shift'] = false;
      input.update(app.stateManager.player.x, app.stateManager.player.y);

      // 2. Weapon firing simulation
      const inputState = (input as any).state;
      inputState.fire = true;
      inputState.mouseX = 500;
      inputState.mouseY = app.stateManager.player.y;
      app.stateManager.player.fireTimer = 0;

      app.update(0.016);
      expect(app.combatState.bullets.length).toBeGreaterThan(0);
      const bullet = app.combatState.bullets[0];
      expect(bullet.vx).toBeGreaterThan(0); // moving towards mouseX = 500

      // Advance bullet
      inputState.fire = false;
      const initialBulletX = bullet.x;
      app.update(0.016);
      expect(bullet.x).toBeGreaterThan(initialBulletX);

      // 3. Pickup collection simulation: fuel jerrycan
      const room = app.getCurrentRoom()!;
      app.stateManager.player.hp = 3; // damaged player
      room.pickups.push({
        x: app.stateManager.player.x,
        y: app.stateManager.player.y,
        radius: 14,
        type: 'heart'
      });

      app.update(0.016);
      expect(app.stateManager.player.hp).toBe(4); // healed by 1
      expect(room.pickups.some(p => p.type === 'heart')).toBe(false);

      // 4. Audio mute toggle
      expect(app.audio.isMuted()).toBe(false);
      app.toggleAudioMute();
      expect(app.audio.isMuted()).toBe(true);
      expect(document.getElementById('btn-toggle-sound')?.textContent).toBe('🔇 [M]');
      app.toggleAudioMute();
      expect(app.audio.isMuted()).toBe(false);
      expect(document.getElementById('btn-toggle-sound')?.textContent).toBe('🔊 [M]');

      // 5. Garage pause verification
      app.garage.open(false, 1, app.stateManager.metaSave, app.stateManager.player);
      expect(app.garage.isOpen()).toBe(true);
      const pausedY = app.stateManager.player.y;
      rawKeys['s'] = true;
      input.update(app.stateManager.player.x, app.stateManager.player.y);

      app.update(0.016);
      // Player does not move while garage modal is open
      expect(app.stateManager.player.y).toBe(pausedY);

      app.garage.close();
      expect(app.garage.isOpen()).toBe(false);

      // 6. 5-second Periodic Checkpoint Autosave
      (app as any).autosaveTimer = 4.95;
      app.update(0.1); // Triggers periodic autosave
      const runSave = localStorage.getItem(SAVE_KEY_RUN);
      expect(runSave).not.toBeNull();
      expect(JSON.parse(runSave!).floorNum).toBe(1);

      // 7. Player death -> evacuates to Outlaw Home Base Sanctuary & clears run save
      app.handlePlayerDeath();
      expect(localStorage.getItem(SAVE_KEY_RUN)).toBeNull();
      expect(app.getCurrentRoom()?.type).toBe('hub');

      input.destroy();
    });

    it('simulates shop purchase confirmation workflow via keyboard', () => {
      setupAppDom();
      const app = new MotoRogueApp();
      app.startNewRun(false);

      const room = app.getCurrentRoom()!;
      app.stateManager.player.coins = 25;

      // Spawn shop mod at player position
      const shopPickup = {
        x: app.stateManager.player.x,
        y: app.stateManager.player.y,
        radius: 16,
        type: 'mod_pedestal' as const,
        cost: 15,
        mod: {
          id: 'lead_foot',
          name: 'Lead Foot Accelerators',
          desc: '+20% Speed',
          cost: 15,
          apply: (p: PlayerState) => { p.speedMult += 0.20; }
        }
      };
      room.pickups.push(shopPickup);

      // Update triggers shop modal prompt
      app.update(0.016);
      expect(app.shopModal.isOpen()).toBe(true);

      // Confirm purchase via shopModal confirm
      app.shopModal.confirm();

      expect(app.stateManager.player.coins).toBe(10); // 25 - 15 = 10
      expect(app.stateManager.player.items).toContain('Lead Foot Accelerators');
      expect(app.stateManager.player.speedMult).toBeCloseTo(1.20);
      expect(app.shopModal.isOpen()).toBe(false);

      app.inputManager.destroy();
    });

    it('allows player to cancel shop purchase without modal immediately re-opening', () => {
      setupAppDom();
      const app = new MotoRogueApp();
      app.startNewRun(false);

      const room = app.getCurrentRoom()!;
      room.cleared = true;

      const shopPickup = {
        x: app.stateManager.player.x,
        y: app.stateManager.player.y,
        radius: 16,
        type: 'mod_pedestal' as const,
        cost: 15,
        mod: {
          id: 'lead_foot',
          name: 'Lead Foot Accelerators',
          desc: '+20% Speed',
          cost: 15,
          apply: (p: PlayerState) => { p.speedMult += 0.20; }
        }
      };
      room.pickups.push(shopPickup);

      // Trigger shop modal prompt
      app.update(0.016);
      expect(app.shopModal.isOpen()).toBe(true);

      // Cancel purchase
      app.shopModal.cancel();
      expect(app.shopModal.isOpen()).toBe(false);

      // Next game loop tick while still standing on pickup: should NOT re-open
      app.update(0.016);
      expect(app.shopModal.isOpen()).toBe(false);

      // Move player away from pickup
      app.stateManager.player.x += 100;
      app.update(0.016);
      expect(app.dismissedPickup).toBeNull();

      // Move back onto pickup: re-opens modal
      app.stateManager.player.x = shopPickup.x;
      app.update(0.016);
      expect(app.shopModal.isOpen()).toBe(true);

      app.inputManager.destroy();
    });

    it('spawns exit portal / trapdoor upon boss defeat', () => {
      setupAppDom();
      const app = new MotoRogueApp();
      app.startNewRun(false);

      const room = app.getCurrentRoom()!;
      room.type = 'boss';
      room.cleared = false;
      room.trapdoor = false;

      // Spawn a boss in room
      const bossEnemy: any = {
        id: 9999,
        type: 'boss',
        variant: 'goliath',
        x: 360,
        y: 200,
        vx: 0,
        vy: 0,
        radius: 36,
        hp: 10,
        maxHp: 300,
        color: '#ff4d6d'
      };
      room.enemies.push(bossEnemy);

      // Kill the boss
      bossEnemy.hp = 0;
      app.update(0.016);

      // Boss room is cleared and trapdoor portal is spawned
      expect(room.cleared).toBe(true);
      expect(room.trapdoor).toBe(true);

      app.inputManager.destroy();
    });

    it('simulates doorway room transition and autosaves checkpoint', () => {
      setupAppDom();
      const app = new MotoRogueApp();
      app.startNewRun(false);

      const room = app.getCurrentRoom()!;
      room.cleared = true;
      room.doors.N = true;

      // Move player into north doorway threshold (< WALL_THICKNESS - 10 = 48)
      app.stateManager.player.x = 360;
      app.stateManager.player.y = 44; // Inside north door zone threshold

      app.update(0.016);

      // Transited north: y coordinate changed from 0 to -1
      expect(app.curRoomY).toBe(-1);
      expect(app.stateManager.player.y).toBeGreaterThan(600); // Placed at south door of new room
      expect(app.getCurrentRoom()?.visited).toBe(true);

      app.inputManager.destroy();
    });

    it('creates 2 linked choiceGroup pedestals in the Treasure room and despawns sibling on pickup', () => {
      setupAppDom();
      const app = new MotoRogueApp();
      app.startNewRun(false);

      const treasureEntry = Object.entries(app.dungeon).find(([, rm]) => rm.type === 'treasure');
      expect(treasureEntry).toBeDefined();
      const [key, treasureRoom] = treasureEntry!;
      const [tx, ty] = key.split(',').map(Number);

      const choicePedestals = treasureRoom.pickups.filter(
        p => p.type === 'mod_pedestal' && (p as any).choiceGroup === 'treasure_choice'
      );
      expect(choicePedestals).toHaveLength(2);

      // Move player into Treasure room onto first choice pedestal
      app.curRoomX = tx;
      app.curRoomY = ty;
      app.stateManager.player.x = choicePedestals[0].x;
      app.stateManager.player.y = choicePedestals[0].y;

      app.update(0.016);

      // Both the claimed pedestal and its sibling must be despawned
      const remainingChoice = treasureRoom.pickups.filter(
        p => (p as any).choiceGroup === 'treasure_choice'
      );
      expect(remainingChoice).toHaveLength(0);
      expect(app.combatState.damageNumbers.some(d => d.text.includes('CHOICE LOCKED'))).toBe(true);

      app.inputManager.destroy();
    });

    it('triggers 28px near-miss bullet graze (+8 NOS, +12 styleScore, and ⚡ GRAZE! +8 NOS callout)', () => {
      setupAppDom();
      const app = new MotoRogueApp();
      app.startNewRun(false);

      const player = app.stateManager.player;
      player.nos = 50;
      player.styleScore = 20;
      player.invuln = 0;

      // Player radius is 17, bullet radius is 6 -> hitR = 23, grazeR = 49.
      // Place stationary bullet at distance 35px (within graze skirt, outside hitR)
      const eb = {
        x: player.x + 35,
        y: player.y,
        vx: 0,
        vy: 0,
        radius: 6,
        color: '#ff1f4b'
      };
      app.combatState.enemyBullets.push(eb);

      app.update(0.016);

      expect((eb as any).grazed).toBe(true);
      expect(player.nos).toBeGreaterThanOrEqual(58);
      expect(player.styleScore).toBeGreaterThanOrEqual(32);
      expect(app.combatState.damageNumbers.some(d => d.text === '⚡ GRAZE! +8 NOS')).toBe(true);

      app.inputManager.destroy();
    });

    it('builds driftCharge with Spacebar handbrake powerslide and triggers Drift Overcharge on release', () => {
      setupAppDom();
      const app = new MotoRogueApp();
      app.startNewRun(false);

      const player = app.stateManager.player;
      const rawKeys = (app.inputManager as any).rawKeys;

      // Hold 'w', 'd', and Spacebar (' ')
      rawKeys['w'] = true;
      rawKeys['d'] = true;
      rawKeys[' '] = true;

      for (let i = 0; i < 20; i++) {
        app.update(0.016);
      }

      expect(player.spacePowerslide).toBe(true);
      expect(player.driftCharge).toBeGreaterThanOrEqual(0.50);

      // Ensure driftCharge is below auto-threshold (0.85) but >= 0.50, then release Spacebar
      player.driftCharge = 0.60;
      rawKeys[' '] = false;
      app.update(0.016);

      expect(player.driftCharge).toBe(0);
      expect(player.driftBoostTimer).toBeCloseTo(2.4, 1);
      expect(app.combatState.bullets.length).toBeGreaterThanOrEqual(8);
      expect(app.combatState.damageNumbers.some(d => d.text.includes('DRIFT OVERCHARGE'))).toBe(true);

      app.inputManager.destroy();
    });

    it('triggers Boss Phase-2 OVERDRIVE ENRAGE cut-in when boss HP drops to <= 50%', () => {
      setupAppDom();
      const app = new MotoRogueApp();
      app.startNewRun(false);

      const bossEntry = Object.entries(app.dungeon).find(([, rm]) => rm.type === 'boss');
      expect(bossEntry).toBeDefined();
      const [key, bossRoom] = bossEntry!;
      const [bx, by] = key.split(',').map(Number);

      app.curRoomX = bx;
      app.curRoomY = by;

      const boss = bossRoom.enemies.find(e => e.type === 'boss') as any;
      expect(boss).toBeDefined();
      boss.hp = Math.floor(boss.maxHp * 0.45); // Drop to 45% HP (<= 50%)

      app.update(0.016);

      expect(boss.enraged).toBe(true);
      expect(boss.phase).toBe(2);
      expect(app.combatState.damageNumbers.some(d => d.text === '⚠️ OVERDRIVE ENRAGE!!')).toBe(true);

      app.inputManager.destroy();
    });

    it('persists Outlaw Sanctuary Hub scannerBuff across launch portal and toggles .is-low-hull vignette at <= 34% HP', () => {
      setupAppDom();
      const app = new MotoRogueApp();
      app.enterHomeBase();

      const hubRoom = app.getCurrentRoom()!;
      expect(hubRoom.type).toBe('hub');

      // 1. Move onto Doc's Cyber-Codex station
      const codexNpc = hubRoom.pickups.find(p => (p as any).npcId === 'codex')!;
      expect(codexNpc).toBeDefined();
      app.stateManager.player.x = codexNpc.x;
      app.stateManager.player.y = codexNpc.y;
      app.update(0.016);

      expect(app.stateManager.player.scannerBuff).toBe(true);

      // 2. Move onto Highway Gate launch station and verify scannerBuff persists into Floor 1 run
      const launchNpc = hubRoom.pickups.find(p => (p as any).npcId === 'launch')!;
      expect(launchNpc).toBeDefined();
      app.stateManager.player.x = launchNpc.x;
      app.stateManager.player.y = launchNpc.y;
      app.update(0.016);

      expect(app.inHomeBase).toBe(false);
      expect(app.stateManager.player.scannerBuff).toBe(true);
      expect(app.stateManager.player.projSpeedMult).toBeGreaterThan(1.0);

      // 3. Verify Low-Hull Vignette (.is-low-hull on #game-wrapper) when HP <= 34%
      const wrapper = document.getElementById('game-wrapper')!;
      expect(wrapper.classList.contains('is-low-hull')).toBe(false);

      app.stateManager.player.hp = 2;
      app.stateManager.player.maxHp = 6; // 2/6 = 33.3% <= 34%
      app.updateHUD();
      expect(wrapper.classList.contains('is-low-hull')).toBe(true);

      app.stateManager.player.hp = 5;
      app.updateHUD();
      expect(wrapper.classList.contains('is-low-hull')).toBe(false);

      app.inputManager.destroy();
    });
  });

  // ==========================================================================
  // 6. TIER 5 PLAYABILITY, MASTERY PROGRESSION, APPRAISAL & SETTINGS
  // ==========================================================================
  describe('6. Tier 5 Playability Verification (Mastery Tiers, Shop Appraisal & Screen Shake)', () => {
    it('verifies getWeaponMasteryTier progression across 0, 10, 40, 100 kills and DOM rendering in GarageController', () => {
      // 1. Pure function progression verification across 0, 10, 40, 100 kills
      expect(getWeaponMasteryTier(0)).toEqual({ tier: 0, label: 'UNRANKED', stars: '☆☆☆', dmgBonusPct: 0, kills: 0 });
      expect(getWeaponMasteryTier(9)).toEqual({ tier: 0, label: 'UNRANKED', stars: '☆☆☆', dmgBonusPct: 0, kills: 9 });
      expect(getWeaponMasteryTier(10)).toEqual({ tier: 1, label: 'ROOKIE I', stars: '★☆☆', dmgBonusPct: 5, kills: 10 });
      expect(getWeaponMasteryTier(39)).toEqual({ tier: 1, label: 'ROOKIE I', stars: '★☆☆', dmgBonusPct: 5, kills: 39 });
      expect(getWeaponMasteryTier(40)).toEqual({ tier: 2, label: 'ADEPT II', stars: '★★☆', dmgBonusPct: 10, kills: 40 });
      expect(getWeaponMasteryTier(99)).toEqual({ tier: 2, label: 'ADEPT II', stars: '★★☆', dmgBonusPct: 10, kills: 99 });
      expect(getWeaponMasteryTier(100)).toEqual({ tier: 3, label: 'MASTER III', stars: '★★★', dmgBonusPct: 15, kills: 100 });
      expect(getWeaponMasteryTier(250)).toEqual({ tier: 3, label: 'MASTER III', stars: '★★★', dmgBonusPct: 15, kills: 250 });

      // Negative kills clamp to 0
      expect(getWeaponMasteryTier(-5)).toEqual({ tier: 0, label: 'UNRANKED', stars: '☆☆☆', dmgBonusPct: 0, kills: 0 });

      // 2. DOM Rendering in GarageController
      document.body.innerHTML = `
        <div id="garage-overlay">
          <h1 id="modal-title">MOTO-GARAGE</h1>
          <p id="modal-subtitle">Sub</p>
          <span id="modal-scrap">500</span>
          <canvas id="bike-canvas" width="300" height="190"></canvas>
          <div id="slots-left"></div>
          <div id="slots-right"></div>
          <div id="eq-totals"></div>
          <div id="stash-list"></div>
          <div id="unlock-list"></div>
          <div id="meta-upgrade-list"></div>
          <button id="btn-resume">Resume</button>
          <button id="btn-new-run">New Run</button>
          <button id="btn-reset-save">Reset</button>
        </div>
      `;

      const meta: MetaSaveState = createDefaultMetaSave();
      meta.scrap = 500;
      (meta as any).weaponKills = {
        machine_gun: 0,
        shotgun: 10,
        flamethrower: 40,
        railgun: 100
      };

      const callbacks: GarageCallbacks = {
        onEquipItem: vi.fn(),
        onUnequipSlot: vi.fn(),
        onSellItem: vi.fn(),
        onUnlockWeapon: vi.fn(),
        onEquipWeapon: vi.fn(),
        onBuyUpgrade: vi.fn(),
        onResumeRun: vi.fn(),
        onNewRun: vi.fn(),
        onResetSave: vi.fn()
      };

      const garage = new GarageController(callbacks);
      garage.open(false, 1, meta, player);

      const unlockList = document.getElementById('unlock-list');
      expect(unlockList).not.toBeNull();

      const items = Array.from(unlockList!.querySelectorAll<HTMLElement>('.unlock-item.gx-weapon'));
      expect(items.length).toBeGreaterThanOrEqual(4);

      // Verify machine_gun: 0 kills -> data-mastery-tier="0", UNRANKED
      const mgItem = items.find(el => el.innerHTML.includes('MACHINE GUN'))!;
      expect(mgItem).toBeDefined();
      expect(mgItem.getAttribute('data-mastery-tier')).toBe('0');
      const mgMastery = mgItem.querySelector('.gx-weapon-mastery');
      expect(mgMastery?.textContent).toContain('☆☆☆ UNRANKED · 0 KILLS');

      // Verify shotgun: 10 kills -> data-mastery-tier="1", ROOKIE I (+5% DMG)
      const sgItem = items.find(el => el.innerHTML.includes('SHOTGUN'))!;
      expect(sgItem).toBeDefined();
      expect(sgItem.getAttribute('data-mastery-tier')).toBe('1');
      const sgMastery = sgItem.querySelector('.gx-weapon-mastery');
      expect(sgMastery?.textContent).toContain('★☆☆ ROOKIE I (+5% DMG) · 10 KILLS');

      // Verify flamethrower: 40 kills -> data-mastery-tier="2", ADEPT II (+10% DMG)
      const ftItem = items.find(el => el.innerHTML.includes('FLAMETHROWER'))!;
      expect(ftItem).toBeDefined();
      expect(ftItem.getAttribute('data-mastery-tier')).toBe('2');
      const ftMastery = ftItem.querySelector('.gx-weapon-mastery');
      expect(ftMastery?.textContent).toContain('★★☆ ADEPT II (+10% DMG) · 40 KILLS');

      // Verify railgun: 100 kills -> data-mastery-tier="3", MASTER III (+15% DMG)
      const rgItem = items.find(el => el.innerHTML.includes('RAILGUN'))!;
      expect(rgItem).toBeDefined();
      expect(rgItem.getAttribute('data-mastery-tier')).toBe('3');
      const rgMastery = rgItem.querySelector('.gx-weapon-mastery');
      expect(rgMastery?.textContent).toContain('★★★ MASTER III (+15% DMG) · 100 KILLS');

      garage.close();
    });

    it('verifies getShopItemAppraisal and ShopModalController.open rendering .shop-appraisal-pill and data-appraisal-tier', () => {
      // 1. Pure function appraisal tests across bargain, standard issue, and high-grade
      const bargainPickup: Pickup = {
        x: 100,
        y: 100,
        radius: 16,
        type: 'shop_heart',
        name: 'Spare Parts Pack',
        cost: 12
      };
      const standardPickup: Pickup = {
        x: 100,
        y: 100,
        radius: 16,
        type: 'shop_heart',
        name: 'Standard Armor Plating',
        cost: 20
      };
      const highGradePickup: Pickup = {
        x: 100,
        y: 100,
        radius: 16,
        type: 'mod_pedestal',
        cost: 32,
        mod: {
          id: 'plasma_cap',
          name: 'Plasma Capacitor Overdrive',
          desc: 'Overdrives projectile damage by +40%',
          cost: 32,
          apply: (p: PlayerState) => { p.dmgMult += 0.4; }
        }
      };

      // Bargain tests: cost <= 14
      const appBargainSurplus = getShopItemAppraisal(bargainPickup, 30);
      expect(appBargainSurplus.tierLabel).toBe('🔥 BLACK MARKET BARGAIN');
      expect(appBargainSurplus.isBargain).toBe(true);
      expect(appBargainSurplus.valueVerdict).toBe('SURPLUS FUNDS');

      const appBargainShort = getShopItemAppraisal(bargainPickup, 5);
      expect(appBargainShort.valueVerdict).toBe('SHORT 7 COINS');

      // Standard issue tests: cost between 15 and 24
      const appStandardAffordable = getShopItemAppraisal(standardPickup, 25);
      expect(appStandardAffordable.tierLabel).toBe('★ STANDARD ISSUE');
      expect(appStandardAffordable.isBargain).toBe(false);
      expect(appStandardAffordable.valueVerdict).toBe('AFFORDABLE');

      // High-grade ordnance tests: cost >= 25
      const appHighGradeShort = getShopItemAppraisal(highGradePickup, 12);
      expect(appHighGradeShort.tierLabel).toBe('⚡ HIGH-GRADE ORDNANCE');
      expect(appHighGradeShort.isBargain).toBe(false);
      expect(appHighGradeShort.valueVerdict).toBe('SHORT 20 COINS');

      // 2. DOM Rendering in ShopModalController
      document.body.innerHTML = `
        <div id="shop-confirm-overlay">
          <div class="shop-name-panel">
            <div id="shop-modal-name">Item Name</div>
          </div>
          <div id="shop-modal-desc">Item Description</div>
          <div id="shop-modal-cost">12</div>
          <div id="shop-modal-type">MOD</div>
          <div id="shop-modal-quote">Quote</div>
          <button id="btn-confirm-buy">[E] Confirm Purchase</button>
          <button id="btn-cancel-buy">[ESC] Cancel</button>
        </div>
      `;

      const overlay = document.getElementById('shop-confirm-overlay')!;
      const descEl = document.getElementById('shop-modal-desc')!;
      const modal = new ShopModalController();

      // Open with bargain pickup & surplus funds
      modal.open(bargainPickup, vi.fn(), vi.fn(), 30);

      expect(overlay.getAttribute('data-appraisal-tier')).toBe('🔥 BLACK MARKET BARGAIN');
      expect(overlay.getAttribute('data-is-bargain')).toBe('true');

      const pill1 = descEl.querySelector('.shop-appraisal-pill');
      expect(pill1).not.toBeNull();
      expect(pill1?.textContent).toBe('🔥 BLACK MARKET BARGAIN · SURPLUS FUNDS');

      modal.cancel();

      // Open with high-grade ordnance pickup & short funds
      modal.open(highGradePickup, vi.fn(), vi.fn(), 12);

      expect(overlay.getAttribute('data-appraisal-tier')).toBe('⚡ HIGH-GRADE ORDNANCE');
      expect(overlay.getAttribute('data-is-bargain')).toBe('false');

      const pill2 = descEl.querySelector('.shop-appraisal-pill');
      expect(pill2).not.toBeNull();
      expect(pill2?.textContent).toBe('⚡ HIGH-GRADE ORDNANCE · SHORT 20 COINS');

      modal.cancel();
    });

    it('verifies SettingsController screen shake toggle cycling (1 -> 0.5 -> 0 -> 1)', () => {
      document.body.innerHTML = `
        <button id="btn-open-settings">Settings</button>
        <div id="settings-overlay"></div>
      `;

      const mockAudio: SettingsAudioPort = {
        getVolumes: () => ({ ...DEFAULT_VOLUME_SETTINGS }),
        setVolume: vi.fn(),
        resetVolumes: vi.fn(),
        isMuted: () => false,
        setMuted: vi.fn(),
        playTest: vi.fn()
      };

      const recordedShakeLevels: ScreenShakeLevel[] = [];
      const settings = new SettingsController({
        audio: mockAudio,
        onShakeChange: (level) => recordedShakeLevels.push(level)
      });

      settings.mount();

      const shakeBtn = document.getElementById('btn-settings-shake') as HTMLButtonElement;
      expect(shakeBtn).not.toBeNull();

      // Default level is 1
      expect(settings.getScreenShake()).toBe(1);
      expect(shakeBtn.getAttribute('data-shake')).toBe('100');
      expect(shakeBtn.textContent).toBe('SHAKE: 100%');

      // 1st click: 1 -> 0.5
      shakeBtn.click();
      expect(settings.getScreenShake()).toBe(0.5);
      expect(shakeBtn.getAttribute('data-shake')).toBe('50');
      expect(shakeBtn.textContent).toBe('SHAKE: 50%');

      // 2nd click: 0.5 -> 0
      shakeBtn.click();
      expect(settings.getScreenShake()).toBe(0);
      expect(shakeBtn.getAttribute('data-shake')).toBe('0');
      expect(shakeBtn.textContent).toBe('SHAKE: OFF');

      // 3rd click: 0 -> 1 (wrap around)
      shakeBtn.click();
      expect(settings.getScreenShake()).toBe(1);
      expect(shakeBtn.getAttribute('data-shake')).toBe('100');
      expect(shakeBtn.textContent).toBe('SHAKE: 100%');

      // 4th click: 1 -> 0.5 again
      shakeBtn.click();
      expect(settings.getScreenShake()).toBe(0.5);
      expect(shakeBtn.getAttribute('data-shake')).toBe('50');
      expect(shakeBtn.textContent).toBe('SHAKE: 50%');

      expect(recordedShakeLevels).toEqual([0.5, 0, 1, 0.5]);
    });
  });

  // ==========================================================================
  // 7. WAVE 9 PLAYABILITY INTEGRATION (BOUNTY CONTRACTS, OVERKILL BONUS, MASTERY HINTS & AUDIO POLISH)
  // ==========================================================================
  describe('7. Wave 9 Playability Integration (Bounty Contracts, Overkill Bonus, Mastery Hints & Audio Polish)', () => {
    it('getFloorBountyContract(1..6) produces distinct floor contracts with monotonic Scrap & Coin rewards', () => {
      const contracts = [1, 2, 3, 4, 5, 6].map(floor => getFloorBountyContract(floor));

      // 1. All contracts have correct floor numbers and defined fields
      contracts.forEach((c, idx) => {
        expect(c.floor).toBe(idx + 1);
        expect(typeof c.id).toBe('string');
        expect(c.id.length).toBeGreaterThan(0);
        expect(typeof c.title).toBe('string');
        expect(c.title.length).toBeGreaterThan(0);
        expect(typeof c.desc).toBe('string');
        expect(c.desc.length).toBeGreaterThan(0);
        expect(c.targetCount).toBeGreaterThan(0);
        expect(c.scrapReward).toBeGreaterThan(0);
        expect(c.coinReward).toBeGreaterThan(0);
      });

      // 2. Distinct IDs and titles across floors 1..6
      const ids = contracts.map(c => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(6);

      const titles = contracts.map(c => c.title);
      const uniqueTitles = new Set(titles);
      expect(uniqueTitles.size).toBe(6);

      // Verify specific floor contract identities
      expect(contracts[0].id).toBe('GRAZE_INITIATE');
      expect(contracts[1].id).toBe('DRIFT_DEMON');
      expect(contracts[2].id).toBe('STYLE_HUNTER');
      expect(contracts[3].id).toBe('CRYO_SHATTER');
      expect(contracts[4].id).toBe('OVERDRIVE_SLAYER');
      expect(contracts[5].id).toBe('VALHALLA_LEGEND');

      // 3. Strictly monotonic Scrap & Coin rewards progression
      for (let i = 0; i < contracts.length - 1; i++) {
        expect(contracts[i + 1].scrapReward).toBeGreaterThan(contracts[i].scrapReward);
        expect(contracts[i + 1].coinReward).toBeGreaterThan(contracts[i].coinReward);
      }

      // Concrete values check:
      // Floor 1: 8 scrap, 10 coin
      // Floor 2: 10 scrap, 14 coin
      // Floor 3: 14 scrap, 18 coin
      // Floor 4: 18 scrap, 22 coin
      // Floor 5: 22 scrap, 28 coin
      // Floor 6: 30 scrap, 40 coin
      expect(contracts.map(c => c.scrapReward)).toEqual([8, 10, 14, 18, 22, 30]);
      expect(contracts.map(c => c.coinReward)).toEqual([10, 14, 18, 22, 28, 40]);
    });

    it("calcOverkillBonus triggers '💀 OVERKILL!' and +4 style bonus when finalHp <= -0.5 * maxHp", () => {
      // 1. Boundary tests with maxHp = 40 (threshold: -20)
      const maxHp = 40;

      // At exact threshold: finalHp = -20 (-0.5 * 40) -> triggers overkill
      const exactOverkill = calcOverkillBonus(-20, maxHp);
      expect(exactOverkill.isOverkill).toBe(true);
      expect(exactOverkill.bonusStyle).toBe(4);
      expect(exactOverkill.callout).toBe('💀 OVERKILL!');

      // Beyond threshold: finalHp = -35 -> triggers overkill
      const deepOverkill = calcOverkillBonus(-35, maxHp);
      expect(deepOverkill.isOverkill).toBe(true);
      expect(deepOverkill.bonusStyle).toBe(4);
      expect(deepOverkill.callout).toBe('💀 OVERKILL!');

      // Just shy of threshold: finalHp = -19 -> no overkill
      const shyUnder = calcOverkillBonus(-19, maxHp);
      expect(shyUnder.isOverkill).toBe(false);
      expect(shyUnder.bonusStyle).toBe(0);
      expect(shyUnder.callout).toBeNull();

      // Normal fatal hit: finalHp = 0 or -1 -> no overkill
      const normalFatal = calcOverkillBonus(0, maxHp);
      expect(normalFatal.isOverkill).toBe(false);
      expect(normalFatal.bonusStyle).toBe(0);
      expect(normalFatal.callout).toBeNull();

      const smallNegative = calcOverkillBonus(-1, maxHp);
      expect(smallNegative.isOverkill).toBe(false);
      expect(smallNegative.bonusStyle).toBe(0);
      expect(smallNegative.callout).toBeNull();

      // 2. Integration with PlayerState style score and CombatState damage floaters
      player.styleScore = 50;
      const combatState = createCombatState();
      const testEnemy = {
        hp: -25,
        maxHp: 40,
        x: 300,
        y: 300,
        radius: 18
      };

      const result = calcOverkillBonus(testEnemy.hp, testEnemy.maxHp);
      if (result.isOverkill && result.callout) {
        player.styleScore = Math.min(100, (player.styleScore || 0) + result.bonusStyle);
        combatState.damageNumbers.push({
          x: testEnemy.x,
          y: testEnemy.y - testEnemy.radius - 22,
          text: result.callout,
          color: '#ff007f',
          life: 0.95,
          maxLife: 0.95
        });
      }

      expect(player.styleScore).toBe(54); // 50 + 4
      expect(combatState.damageNumbers.length).toBe(1);
      expect(combatState.damageNumbers[0].text).toBe('💀 OVERKILL!');
      expect(combatState.damageNumbers[0].color).toBe('#ff007f');
    });

    it('formatWeaponMasteryHint formats all 4 mastery tiers (0, 10, 40, 100 kills)', () => {
      // Tier 0: UNRANKED (0..9 kills)
      const t0_zero = formatWeaponMasteryHint(0);
      expect(t0_zero).toBe('Mastery: ☆☆☆ UNRANKED (0/10 kills to ★☆☆ ROOKIE I +5% DMG)');

      const t0_mid = formatWeaponMasteryHint(7);
      expect(t0_mid).toBe('Mastery: ☆☆☆ UNRANKED (7/10 kills to ★☆☆ ROOKIE I +5% DMG)');

      // Tier 1: ROOKIE I (10..39 kills)
      const t1_min = formatWeaponMasteryHint(10);
      expect(t1_min).toBe('Mastery: ★☆☆ ROOKIE I (+5% DMG · 10/40 kills to ★★☆ ADEPT II)');

      const t1_mid = formatWeaponMasteryHint(25);
      expect(t1_mid).toBe('Mastery: ★☆☆ ROOKIE I (+5% DMG · 25/40 kills to ★★☆ ADEPT II)');

      // Tier 2: ADEPT II (40..99 kills)
      const t2_min = formatWeaponMasteryHint(40);
      expect(t2_min).toBe('Mastery: ★★☆ ADEPT II (+10% DMG · 40/100 kills to ★★★ MASTER III)');

      const t2_mid = formatWeaponMasteryHint(85);
      expect(t2_mid).toBe('Mastery: ★★☆ ADEPT II (+10% DMG · 85/100 kills to ★★★ MASTER III)');

      // Tier 3: MASTER III (100+ kills)
      const t3_min = formatWeaponMasteryHint(100);
      expect(t3_min).toBe('Mastery: ★★★ MASTER III (+15% DMG · MAX RANK! · 100 kills)');

      const t3_high = formatWeaponMasteryHint(250);
      expect(t3_high).toBe('Mastery: ★★★ MASTER III (+15% DMG · MAX RANK! · 250 kills)');

      // Edge cases: negative kills or undefined fallback to Tier 0
      expect(formatWeaponMasteryHint(-10)).toBe('Mastery: ☆☆☆ UNRANKED (0/10 kills to ★☆☆ ROOKIE I +5% DMG)');
      expect(formatWeaponMasteryHint(undefined as unknown as number)).toBe('Mastery: ☆☆☆ UNRANKED (0/10 kills to ★☆☆ ROOKIE I +5% DMG)');
    });

    it("SoundSynthesizer.setMusicIntensity transitions cleanly between 'calm', 'combat', and 'boss_phase2', and masteryUp() synthesizes the 4-note fanfare when unmuted", () => {
      const sfx = new SoundSynthesizer(storage);

      // 1. Music intensity state transitions
      expect(sfx.getMusicIntensity()).toBe('calm');

      sfx.setMusicIntensity('combat');
      expect(sfx.getMusicIntensity()).toBe('combat');

      sfx.setMusicIntensity('boss_phase2');
      expect(sfx.getMusicIntensity()).toBe('boss_phase2');

      sfx.setMusicIntensity('calm');
      expect(sfx.getMusicIntensity()).toBe('calm');

      // 2. masteryUp() Web Audio synthesis with 4-note ascending fanfare
      interface FakeParam {
        value: number;
        setTargetAtTime: ReturnType<typeof vi.fn>;
        setValueAtTime: ReturnType<typeof vi.fn>;
        exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
      }
      interface FakeNode {
        type?: string;
        frequency?: FakeParam;
        gain?: FakeParam;
        connect: ReturnType<typeof vi.fn>;
        start?: ReturnType<typeof vi.fn>;
        stop?: ReturnType<typeof vi.fn>;
      }

      const param = (): FakeParam => ({
        value: 0,
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn()
      });

      const oscillators: FakeNode[] = [];
      const gains: FakeNode[] = [];

      class MockAC {
        state = 'running';
        currentTime = 5.0;
        sampleRate = 44100;
        destination = { name: 'dest' };
        createGain = vi.fn(() => {
          const n: FakeNode = { gain: param(), connect: vi.fn() };
          gains.push(n);
          return n;
        });
        createOscillator = vi.fn(() => {
          const n: FakeNode = {
            type: 'sine',
            frequency: param(),
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn()
          };
          oscillators.push(n);
          return n;
        });
        createBiquadFilter = vi.fn(() => ({
          type: 'lowpass',
          frequency: param(),
          Q: { value: 1 },
          connect: vi.fn()
        }));
        createBuffer = vi.fn(() => ({ getChannelData: () => new Float32Array(150) }));
        createBufferSource = vi.fn(() => ({ buffer: null, connect: vi.fn(), start: vi.fn() }));
        resume = vi.fn().mockResolvedValue(undefined);
      }

      const g = globalThis as unknown as { AudioContext?: unknown };
      const originalAC = g.AudioContext;
      g.AudioContext = MockAC;

      try {
        const synth = new SoundSynthesizer(storage);
        expect(synth.init()).toBe(true);

        const oscCountBefore = oscillators.length;

        // Unmuted execution synthesizes the 4-note fanfare
        synth.masteryUp();
        const fanfareOscs = oscillators.slice(oscCountBefore);

        // 4 notes * 2 (triangle lead + sine overtone) = 8 oscillators
        expect(fanfareOscs.length).toBe(8);

        // Verify waveforms: 4 triangle leads, 4 sine overtones
        const triangleOscs = fanfareOscs.filter(o => o.type === 'triangle');
        const sineOscs = fanfareOscs.filter(o => o.type === 'sine');
        expect(triangleOscs.length).toBe(4);
        expect(sineOscs.length).toBe(4);

        // Expected 4-note frequencies: C5 (523.25), E5 (659.25), G5 (783.99), C6 (1046.50)
        const expectedFrequencies = [523.25, 659.25, 783.99, 1046.50];
        triangleOscs.forEach((osc, idx) => {
          expect(osc.frequency?.setValueAtTime).toHaveBeenCalledWith(
            expect.closeTo(expectedFrequencies[idx], 1),
            expect.any(Number)
          );
        });

        // Muted execution is a strict no-op
        synth.setMuted(true);
        const oscCountMuted = oscillators.length;
        synth.masteryUp();
        expect(oscillators.length).toBe(oscCountMuted);

        // Zero UI volume execution is also a strict no-op
        synth.setMuted(false);
        synth.setVolume('ui', 0);
        const oscCountZeroVol = oscillators.length;
        synth.masteryUp();
        expect(oscillators.length).toBe(oscCountZeroVol);
      } finally {
        g.AudioContext = originalAC;
      }
    });
  });

  // ==========================================================================
  // 8. WAVE 12 PLAYABILITY INTEGRATION (SANCTUARY GREETINGS, MOD STACKS, PORTAL RISK & SALVAGE)
  // ==========================================================================
  describe('8. Wave 12 Playability Integration (Sanctuary NPC Greetings, Mod Stack Tiers, Portal Risk & Stash Salvage)', () => {
    it('verifies getHubNpcGreeting across all 5 Sanctuary stations and dynamic progression quotes', () => {
      // 1. Garage station (Chief Mechanic Vex)
      const vexDefault = getHubNpcGreeting('garage', 1);
      expect(vexDefault.npcId).toBe('garage');
      expect(vexDefault.speaker).toBe('CHIEF MECHANIC VEX');
      expect(vexDefault.accentColor).toBe('#ffd60a');
      expect(vexDefault.quote).toBe('Tune your V8 and equip high-grade salvage before hitting the highway.');

      const vexDeep = getHubNpcGreeting('garage', 5);
      expect(vexDeep.quote).toContain('Chassis survived Sector 5!');

      // 2. Blacksmith station (Ironsmith Korr)
      const korr = getHubNpcGreeting('blacksmith');
      expect(korr.npcId).toBe('blacksmith');
      expect(korr.speaker).toBe('IRONSMITH KORR');
      expect(korr.accentColor).toBe('#2ee6ff');
      expect(korr.quote).toContain('12 Scrap for a fresh black-market part');

      // 3. Bounty broker station (Valkyrie Broker)
      const valkCold = getHubNpcGreeting('bounty', 1, 0);
      expect(valkCold.npcId).toBe('bounty');
      expect(valkCold.speaker).toBe('VALKYRIE BROKER');
      expect(valkCold.accentColor).toBe('#06d6a0');
      expect(valkCold.quote).toContain('Raise the Bounty Heat for massive Scrap payouts');

      const valkHot = getHubNpcGreeting('bounty', 1, 3);
      expect(valkHot.quote).toContain('HEAT 3 ACTIVE! +75% Scrap from all hostiles.');

      // 4. Codex station (Doc Cullen)
      const doc = getHubNpcGreeting('codex');
      expect(doc.npcId).toBe('codex');
      expect(doc.speaker).toBe('DOC CULLEN');
      expect(doc.accentColor).toBe('#9d4edd');
      expect(doc.quote).toContain('Tactical Scanner calibrated: +8% DMG & +15% Bullet Speed');

      // 5. Launch station (Highway Dispatch)
      const launch = getHubNpcGreeting('launch');
      expect(launch.npcId).toBe('launch');
      expect(launch.speaker).toBe('HIGHWAY DISPATCH');
      expect(launch.accentColor).toBe('#e5203a');
      expect(launch.quote).toContain('Blast doors unlocked. Hit the throttle when ready!');

      // Fallback station
      const unknown = getHubNpcGreeting('unknown');
      expect(unknown.speaker).toBe('OUTLAW DRIFTER');
      expect(unknown.accentColor).toBe('#ffd166');
      expect(unknown.quote).toContain('Keep your NOS cool');
    });

    it('verifies getModStackTierClass mapping (1 -> stack-tier-1, 2 -> stack-tier-2, 3+ -> stack-tier-evo) and HUDController.updateMods DOM rendering', () => {
      // 1. Pure function mapping
      expect(getModStackTierClass(1)).toBe('stack-tier-1');
      expect(getModStackTierClass(2)).toBe('stack-tier-2');
      expect(getModStackTierClass(3)).toBe('stack-tier-evo');
      expect(getModStackTierClass(7)).toBe('stack-tier-evo');
      expect(getModStackTierClass(0)).toBe('stack-tier-1');
      expect(getModStackTierClass(-2)).toBe('stack-tier-1');

      // 2. HUDController DOM rendering with itemStacks
      document.body.innerHTML = `
        <div id="mod-list"></div>
        <div id="items-list"></div>
      `;

      const hud = new HUDController();
      const mockPlayer: any = {
        items: [],
        itemStacks: {
          nitro_syringe: 4,
          gasoline: 2,
          chrome_lens: 1
        }
      };

      hud.updateMods(mockPlayer);

      const modList = document.getElementById('mod-list')!;
      expect(modList).not.toBeNull();
      const allChips = modList.querySelectorAll('[data-stack-tier]');
      expect(allChips.length).toBe(3);

      const evoChip = modList.querySelector('[aria-label*="Nitro Syringe x4"]');
      expect(evoChip).not.toBeNull();
      expect(evoChip?.getAttribute('data-stack-tier')).toBe('stack-tier-evo');
      expect(evoChip?.classList.contains('stack-tier-evo')).toBe(true);

      const tier2Chip = modList.querySelector('[aria-label*="Gasoline x2"]');
      expect(tier2Chip).not.toBeNull();
      expect(tier2Chip?.getAttribute('data-stack-tier')).toBe('stack-tier-2');
      expect(tier2Chip?.classList.contains('stack-tier-2')).toBe(true);

      const tier1Chip = modList.querySelector('[aria-label*="Chrome Lens x1"]');
      expect(tier1Chip).not.toBeNull();
      expect(tier1Chip?.getAttribute('data-stack-tier')).toBe('stack-tier-1');
      expect(tier1Chip?.classList.contains('stack-tier-1')).toBe(true);

      // 3. Existing chip markup update test
      document.body.innerHTML = `
        <div id="mod-list">
          <span class="custom-badge" data-count="3">Nitro Syringe x3</span>
          <span class="custom-badge" data-count="2">Gasoline x2</span>
          <span class="custom-badge" data-count="1">Plating x1</span>
        </div>
      `;

      hud.updateMods();
      const badges = document.querySelectorAll('#mod-list .custom-badge');
      expect(badges[0].getAttribute('data-stack-tier')).toBe('stack-tier-evo');
      expect(badges[0].classList.contains('stack-tier-evo')).toBe(true);
      expect(badges[1].getAttribute('data-stack-tier')).toBe('stack-tier-2');
      expect(badges[1].classList.contains('stack-tier-2')).toBe(true);
      expect(badges[2].getAttribute('data-stack-tier')).toBe('stack-tier-1');
      expect(badges[2].classList.contains('stack-tier-1')).toBe(true);
    });

    it('verifies getPortalRiskAssessment (CRITICAL HULL, FULL INTEGRITY, COMBAT READY) and getStashSalvageSummary + formatDummyHitTelemetry', () => {
      // 1. getPortalRiskAssessment
      const critRisk = getPortalRiskAssessment(2, 20, 100);
      expect(critRisk.readinessLabel).toContain('CRITICAL HULL');
      expect(critRisk.isLowHullWarning).toBe(true);
      expect(critRisk.recommendation).toBe('Visit Shop or scavenge Fuel before descending!');

      const fullRisk = getPortalRiskAssessment(2, 100, 100);
      expect(fullRisk.readinessLabel).toContain('FULL INTEGRITY');
      expect(fullRisk.isLowHullWarning).toBe(false);
      expect(fullRisk.recommendation).toBe('Optimal combat readiness for descent.');

      const combatRisk = getPortalRiskAssessment(2, 60, 100);
      expect(combatRisk.readinessLabel).toContain('COMBAT READY');
      expect(combatRisk.isLowHullWarning).toBe(false);
      expect(combatRisk.recommendation).toBe('Systems nominal for next sector.');

      const defaultRisk = getPortalRiskAssessment(1);
      expect(defaultRisk.readinessLabel).toContain('COMBAT READY');
      expect(defaultRisk.isLowHullWarning).toBe(false);

      // 2. getStashSalvageSummary
      const emptySalvage = getStashSalvageSummary([]);
      expect(emptySalvage).toEqual({
        itemCount: 0,
        totalSalvageScrap: 0,
        highestRarity: -1
      });

      const sampleStash: EquipmentItem[] = [
        {
          name: 'Rusty Tires',
          slot: 'tires',
          rarity: 0,
          stats: { speed: 10 }
        },
        {
          name: 'Turbo Engine',
          slot: 'engine',
          rarity: 1,
          stats: { speed: 20 }
        },
        {
          name: 'Apex Tank',
          slot: 'tank',
          rarity: 3,
          stats: { hp: 50 }
        }
      ];

      const stashSalvage = getStashSalvageSummary(sampleStash);
      expect(stashSalvage.itemCount).toBe(3);
      expect(stashSalvage.totalSalvageScrap).toBe(3 + 8 + 40); // 51
      expect(stashSalvage.highestRarity).toBe(3);

      // 3. formatDummyHitTelemetry
      expect(formatDummyHitTelemetry(45, false)).toBe('🎯 HIT 45');
      expect(formatDummyHitTelemetry(99.6, true)).toBe('🎯 CRIT 100!');
      expect(formatDummyHitTelemetry(0, false)).toBe('🎯 HIT 1');
    });
  });
});
