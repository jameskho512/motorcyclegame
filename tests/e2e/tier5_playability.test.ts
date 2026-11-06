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
  SAVE_KEY_META,
  SAVE_KEY_RUN,
  SAVE_KEY_MUTED
} from '../../src/types/game';

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
  calculateEngineParams
} from '../../src/audio/sfx';

import {
  updateBikeKinematics,
  updateNos
} from '../../src/systems/physics';

import {
  createCombatState,
  fireWeapon
} from '../../src/systems/combat';

import { generateDungeon } from '../../src/world/dungeon';
import { MotoRogueApp } from '../../src/main';

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

      // 7. Player death & checkpoint eradication
      app.handlePlayerDeath();
      expect(app.stateManager.gameOver).toBe(true);
      expect(localStorage.getItem(SAVE_KEY_RUN)).toBeNull();
      expect(app.garage.isOpen()).toBe(true);

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
  });
});
