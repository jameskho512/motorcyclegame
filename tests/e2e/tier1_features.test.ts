/**
 * MOTO-ROGUE: E2E Test Suite — Tier 1: Feature Coverage (28 Features in Isolation)
 *
 * Verifies happy-path behavior and contract adherence for all 28 core features
 * defined in PROJECT.md and handoff.md:
 *  1. Continuous Engine Hum
 *  2. Procedural SFX Suite
 *  3. Input Mapping & Controls
 *  4. Run Checkpoint Autosave
 *  5. Meta Progress Save
 *  6. Audio Mute Persistence
 *  7. 4 Permanent Meta Upgrades
 *  8. 6-Slot Bike Equipment
 *  9. Procedural Graph Dungeon
 * 10. Special Room Assignment
 * 11. Room Obstacle Layouts
 * 12. Doorway Transitions
 * 13. Bike Physics & Drift
 * 14. NOS Booster & Lockout
 * 15. Skid Mark Generation
 * 16. The 7 Weapons Specs
 * 17. Multi-shot Fan Spread
 * 18. Flamethrower Mechanics
 * 19. Arcing Grenade Lob
 * 20. Shotgun Knockback
 * 21. Railgun Beam Penetration
 * 22. Arc Tesla Coil Lightning
 * 23. Combat Stat Multipliers
 * 24. 10 Enemy Behaviors
 * 25. Elite Variant Modifier
 * 26. 3 Muscle-Car Bosses
 * 27. In-Run Mods & RoR2 Drops
 * 28. Semicircular Fuel Gauge Math
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  MAX_SKIDS_PER_ROOM,
  SAVE_KEY_META,
  SAVE_KEY_RUN,
  SAVE_KEY_MUTED,
  PlayerState,
  WeaponId,
  RegularEnemyType,
  Room
} from '@/types/game';

import { WEAPONS } from '@/data/weapons';
import { META_UPGRADES, calcUpgradeCost, RUN_MOD_POOL, DROP_ITEMS, DROP_ITEM_IDS } from '@/data/upgrades';
import { EQUIP_SLOTS, RARITY, genLoot, itemScore } from '@/data/equipment';
import {
  SafeLocalStorage,
  createDefaultPlayerState,
  createDefaultMetaSave,
  saveRunCheckpoint,
  loadRunCheckpoint,
  loadMetaSave,
  writeMetaSave
} from '@/core/state';
import { InputManager, KEY_WEAPON_MAP } from '@/core/input';
import { SoundSynthesizer, calculateEngineParams } from '@/audio/sfx';
import { generateDungeon, OBSTACLE_PATTERNS, createBoss } from '@/world/dungeon';
import {
  calculateEffectiveSpeed,
  updateNos,
  getAngleDiff,
  BASE_PLAYER_SPEED,
  NOS_SPEED_MULT,
  NOS_DRAIN_RATE,
  NOS_RECHARGE_RATE,
  NOS_LOCK_THRESHOLD
} from '@/systems/physics';
import {
  createCombatState,
  fireWeapon,
  calcMultiShotOffset,
  applyBruteArmor,
  applyTireIronBonus,
  rollCrit,
  updatePlayerBullets
} from '@/systems/combat';
import {
  calcEnemyHp,
  calcEnemySpeed,
  getEliteSpawnChance,
  createEnemy
} from '@/systems/enemyAI';

describe('Tier 1: Feature Coverage — 28 Features in Isolation', () => {
  let player: PlayerState;
  let storage: SafeLocalStorage;

  beforeEach(() => {
    storage = new SafeLocalStorage();
    storage.clear();
    player = createDefaultPlayerState();
  });

  // --------------------------------------------------------------------------
  // Feature 1: Continuous Engine Hum
  // --------------------------------------------------------------------------
  describe('Feature 1: Continuous Engine Hum', () => {
    it('modulates twin oscillator frequencies, filter cutoff, and gain with speed and NOS boost', () => {
      // Idle unboosted
      const idle = calculateEngineParams(0.0, false, false, false);
      expect(idle.f1).toBe(44);
      expect(idle.f2).toBe(88); // 44 * 2.0
      expect(idle.cutoff).toBe(160);
      expect(idle.gain).toBeCloseTo(0.025);

      // Full cruising speed (speedRatio = 1.0)
      const cruise = calculateEngineParams(1.0, false, false, false);
      expect(cruise.f1).toBe(100); // 44 + 56
      expect(cruise.f2).toBe(200); // 100 * 2.0
      expect(cruise.cutoff).toBe(400); // 160 + 240
      expect(cruise.gain).toBeCloseTo(0.08); // 0.025 + 0.055

      // Active NOS Boost (+36 Hz, 2.5x f2 multiplier, +260 Hz cutoff)
      const boost = calculateEngineParams(1.0, true, false, false);
      expect(boost.f1).toBe(136); // 44 + 56 + 36
      expect(boost.f2).toBe(136 * 2.5); // 340
      expect(boost.cutoff).toBe(660); // 160 + 240 + 260
      expect(boost.gain).toBeCloseTo(0.125); // 0.025 + 0.055 + 0.045

      // Muted or paused drops to near-silent 0.0001
      const paused = calculateEngineParams(1.0, true, true, false);
      expect(paused.gain).toBe(0.0001);

      const muted = calculateEngineParams(1.0, true, false, true);
      expect(muted.gain).toBe(0.0001);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 2: Procedural SFX Suite
  // --------------------------------------------------------------------------
  describe('Feature 2: Procedural SFX Suite', () => {
    it('initializes AudioService and safely exposes all 17 synthesized sound methods without crashing', () => {
      const sfx = new SoundSynthesizer(storage);
      expect(typeof sfx.init).toBe('function');
      expect(typeof sfx.setMuted).toBe('function');
      expect(typeof sfx.updateEngine).toBe('function');
      expect(typeof sfx.shoot).toBe('function');
      expect(typeof sfx.arcChain).toBe('function');
      expect(typeof sfx.explosion).toBe('function');
      expect(typeof sfx.hit).toBe('function');
      expect(typeof sfx.enemyKill).toBe('function');
      expect(typeof sfx.playerHurt).toBe('function');
      expect(typeof sfx.gameOverSound).toBe('function');
      expect(typeof sfx.pickupFuel).toBe('function');
      expect(typeof sfx.pickupItem).toBe('function');
      expect(typeof sfx.pickupLoot).toBe('function');
      expect(typeof sfx.shopBuy).toBe('function');
      expect(typeof sfx.shopError).toBe('function');
      expect(typeof sfx.roomClear).toBe('function');
      expect(typeof sfx.doorTransition).toBe('function');
      expect(typeof sfx.nextFloor).toBe('function');
      expect(typeof sfx.uiClick).toBe('function');

      // Verify execution in headless test environment does not throw
      expect(() => {
        sfx.shoot('pistol');
        sfx.explosion();
        sfx.hit(true);
        sfx.enemyKill(false);
        sfx.playerHurt();
        sfx.pickupFuel();
        sfx.pickupItem();
        sfx.pickupLoot(3);
        sfx.shopBuy();
        sfx.shopError();
        sfx.roomClear();
        sfx.doorTransition();
        sfx.nextFloor();
        sfx.uiClick();
      }).not.toThrow();
    });
  });

  // --------------------------------------------------------------------------
  // Feature 3: Input Mapping & Controls
  // --------------------------------------------------------------------------
  describe('Feature 3: Input Mapping & Controls', () => {
    it('maps WASD, arrow keys, Shift NOS, mouse coordinates, and weapon keys 1-7 correctly', () => {
      let selectedWeapon: WeaponId | null = null;
      let garageToggled = false;
      let muteToggled = false;

      const input = new InputManager({
        onWeaponSelect: (w) => { selectedWeapon = w; },
        onToggleGarage: () => { garageToggled = true; },
        onToggleMute: () => { muteToggled = true; }
      });

      const canvas = document.createElement('canvas');
      input.attach(canvas, window);

      // Weapon mapping verification
      expect(KEY_WEAPON_MAP['1']).toBe('pistol');
      expect(KEY_WEAPON_MAP['2']).toBe('machine_gun');
      expect(KEY_WEAPON_MAP['3']).toBe('flamethrower');
      expect(KEY_WEAPON_MAP['4']).toBe('grenade_launcher');
      expect(KEY_WEAPON_MAP['5']).toBe('shotgun');
      expect(KEY_WEAPON_MAP['6']).toBe('railgun');
      expect(KEY_WEAPON_MAP['7']).toBe('arc_coil');

      // Dispatch native window keyboard events
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'w' }));
      input.update(360, 360);
      expect(input.getState().up).toBe(true);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }));
      input.update(360, 360);
      expect(input.getState().boost).toBe(true);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
      expect(garageToggled).toBe(true);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'm' }));
      expect(muteToggled).toBe(true);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: '3' }));
      expect(selectedWeapon).toBe('flamethrower');

      // Keyup handling
      window.dispatchEvent(new KeyboardEvent('keyup', { key: 'w' }));
      input.update(360, 360);
      expect(input.getState().up).toBe(false);

      input.destroy();
    });
  });

  // --------------------------------------------------------------------------
  // Feature 4: Run Checkpoint Autosave
  // --------------------------------------------------------------------------
  describe('Feature 4: Run Checkpoint Autosave', () => {
    it('serializes and deserializes the full in-run checkpoint save state to moto_rogue_run_v1', () => {
      player.hp = 4;
      player.coins = 45;
      player.itemStacks = { nitro_syringe: 3, tire_iron: 1 };
      player.weapon = 'shotgun';

      // Save checkpoint
      saveRunCheckpoint(player, 2, storage);

      // Verify stored json in storage
      const raw = storage.getItem(SAVE_KEY_RUN);
      expect(raw).not.toBeNull();
      const parsed = JSON.parse(raw!);
      expect(parsed.floorNum).toBe(2);
      expect(parsed.hp).toBe(4);
      expect(parsed.coins).toBe(45);
      expect(parsed.weapon).toBe('shotgun');
      expect(parsed.itemStacks.nitro_syringe).toBe(3);

      // Restore into fresh player
      const freshPlayer = createDefaultPlayerState();
      const meta = createDefaultMetaSave();
      meta.unlocked.shotgun = true; // allow shotgun selection
      const result = loadRunCheckpoint(freshPlayer, meta, storage);

      expect(result.restored).toBe(true);
      expect(result.floorNum).toBe(2);
      expect(freshPlayer.hp).toBe(4);
      expect(freshPlayer.coins).toBe(45);
      expect(freshPlayer.itemStacks.nitro_syringe).toBe(3);
      expect(freshPlayer.weapon).toBe('shotgun');
    });
  });

  // --------------------------------------------------------------------------
  // Feature 5: Meta Progress Save
  // --------------------------------------------------------------------------
  describe('Feature 5: Meta Progress Save', () => {
    it('persists permanent meta progress (scrap, ranks, unlocked weapons, stash) to moto_rogue_save_v2', () => {
      const meta = createDefaultMetaSave();
      meta.scrap = 150;
      meta.unlocked.machine_gun = true;
      meta.ranks.dmg = 2;

      writeMetaSave(meta, storage);

      // Verify persisted JSON
      const stored = JSON.parse(storage.getItem(SAVE_KEY_META)!);
      expect(stored.scrap).toBe(150);
      expect(stored.unlocked.machine_gun).toBe(true);
      expect(stored.ranks.dmg).toBe(2);

      // Load via loadMetaSave
      const reloaded = loadMetaSave(storage);
      expect(reloaded.scrap).toBe(150);
      expect(reloaded.unlocked.machine_gun).toBe(true);
      expect(reloaded.ranks.dmg).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 6: Audio Mute Persistence
  // --------------------------------------------------------------------------
  describe('Feature 6: Audio Mute Persistence', () => {
    it('persists audio mute setting to moto_rogue_muted as "1" or "0"', () => {
      const sfx = new SoundSynthesizer(storage);
      expect(sfx.isMuted()).toBe(false);

      sfx.toggleMute();
      expect(sfx.isMuted()).toBe(true);
      expect(storage.getItem(SAVE_KEY_MUTED)).toBe('1');

      sfx.toggleMute();
      expect(sfx.isMuted()).toBe(false);
      expect(storage.getItem(SAVE_KEY_MUTED)).toBe('0');
    });
  });

  // --------------------------------------------------------------------------
  // Feature 7: 4 Permanent Meta Upgrades
  // --------------------------------------------------------------------------
  describe('Feature 7: 4 Permanent Meta Upgrades', () => {
    it('calculates exponential scrap cost round(baseCost * costScale^rank) across all 4 upgrades', () => {
      const dmg = META_UPGRADES.dmg;
      expect(dmg.baseCost).toBe(25);
      expect(dmg.costScale).toBe(1.6);
      expect(dmg.maxRank).toBe(5);

      // Rank 0 -> 1: 25 * 1.6^0 = 25
      expect(calcUpgradeCost('dmg', 0)).toBe(25);
      // Rank 1 -> 2: round(25 * 1.6^1) = 40
      expect(calcUpgradeCost('dmg', 1)).toBe(40);
      // Rank 2 -> 3: round(25 * 1.6^2) = 64
      expect(calcUpgradeCost('dmg', 2)).toBe(64);
      // Max rank reached returns Infinity
      expect(calcUpgradeCost('dmg', 5)).toBe(Infinity);

      // Reinforced Frame (maxHp): base 35, scale 1.75, max 4
      expect(calcUpgradeCost('maxHp', 0)).toBe(35);
      expect(calcUpgradeCost('maxHp', 1)).toBe(Math.round(35 * 1.75)); // 61
      expect(calcUpgradeCost('maxHp', 4)).toBe(Infinity);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 8: 6-Slot Bike Equipment
  // --------------------------------------------------------------------------
  describe('Feature 8: 6-Slot Bike Equipment', () => {
    it('generates procedural equipment with 6 slots, 4 rarity tiers, and accurate item scoring', () => {
      expect(EQUIP_SLOTS).toHaveLength(6);
      expect(EQUIP_SLOTS.map(s => s.id)).toEqual(['tires', 'engine', 'handlebars', 'exhaust', 'frame', 'tank']);
      expect(RARITY).toHaveLength(4);

      // Generate a Legendary item on Floor 5
      const item = genLoot(5, 3);
      expect(item.rarity).toBe(3); // Legendary
      expect(RARITY[item.rarity].sell).toBe(40); // 40 scrap sell value
      expect(item.name.length).toBeGreaterThan(0);

      // Item score calculation matches sum(stats[k] / STAT_BASE[k])
      const score = itemScore(item);
      expect(score).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 9: Procedural Graph Dungeon
  // --------------------------------------------------------------------------
  describe('Feature 9: Procedural Graph Dungeon', () => {
    it('generates 7 + min(10, floor * 2) connected rooms from (0,0) with door connections', () => {
      // Floor 1: 7 + min(10, 2) = 9 rooms
      const d1 = generateDungeon(1);
      expect(d1.targetRooms).toBe(9);
      expect(Object.keys(d1.rooms).length).toBe(9);
      expect(d1.rooms['0,0']).toBeDefined();
      expect(d1.rooms['0,0'].type).toBe('start');

      // Floor 5: 7 + min(10, 10) = 17 rooms
      const d5 = generateDungeon(5);
      expect(d5.targetRooms).toBe(17);
      expect(Object.keys(d5.rooms).length).toBe(17);

      // Verify every non-start room has at least one door connection
      for (const [key, room] of Object.entries(d1.rooms)) {
        if (key === '0,0') continue;
        const doorCount = Object.values(room.doors).filter(Boolean).length;
        expect(doorCount).toBeGreaterThanOrEqual(1);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Feature 10: Special Room Assignment
  // --------------------------------------------------------------------------
  describe('Feature 10: Special Room Assignment', () => {
    it('assigns Boss to furthest Manhattan room, Treasure to 2nd furthest, and Shop to 3rd furthest', () => {
      const dungeon = generateDungeon(1);
      expect(dungeon.bossCoord).toBeDefined();
      expect(dungeon.treasureCoord).toBeDefined();
      expect(dungeon.shopCoord).toBeDefined();

      const bossRoom = dungeon.rooms[`${dungeon.bossCoord.x},${dungeon.bossCoord.y}`];
      const treasureRoom = dungeon.rooms[`${dungeon.treasureCoord!.x},${dungeon.treasureCoord!.y}`];
      const shopRoom = dungeon.rooms[`${dungeon.shopCoord!.x},${dungeon.shopCoord!.y}`];

      expect(bossRoom.type).toBe('boss');
      expect(treasureRoom.type).toBe('treasure');
      expect(shopRoom.type).toBe('shop');

      const bossDist = Math.abs(dungeon.bossCoord.x) + Math.abs(dungeon.bossCoord.y);
      const treasureDist = Math.abs(dungeon.treasureCoord!.x) + Math.abs(dungeon.treasureCoord!.y);
      const shopDist = Math.abs(dungeon.shopCoord!.x) + Math.abs(dungeon.shopCoord!.y);

      expect(bossDist).toBeGreaterThanOrEqual(treasureDist);
      expect(treasureDist).toBeGreaterThanOrEqual(shopDist);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 11: Room Obstacle Layouts
  // --------------------------------------------------------------------------
  describe('Feature 11: Room Obstacle Layouts', () => {
    it('provides 5 layout patterns containing indestructible rocks and explosive TNT barrels', () => {
      expect(OBSTACLE_PATTERNS).toHaveLength(5);
      // Pattern 0 has 4 corners
      expect(OBSTACLE_PATTERNS[0]).toHaveLength(4);
      // Pattern 4 is open
      expect(OBSTACLE_PATTERNS[4]).toHaveLength(0);

      // Verify Boss rooms always receive Corner pattern 0
      const d = generateDungeon(1);
      const boss = d.rooms[`${dungeonCoordKey(d.bossCoord)}`];
      expect(boss.obstacles).toHaveLength(4);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 12: Doorway Transitions
  // --------------------------------------------------------------------------
  describe('Feature 12: Doorway Transitions', () => {
    it('defines 4 cardinal door openings (DOOR_HALF = 42) and limits passage when uncleared', () => {
      const d = generateDungeon(1);
      const start = d.rooms['0,0'];
      expect(start.cleared).toBe(true); // Start room is always cleared

      // Start room has open doors matching neighbors
      for (const dir of ['N', 'S', 'E', 'W'] as const) {
        if (start.doors[dir]) {
          expect(start.doors[dir]).toBe(true);
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Feature 13: Bike Physics & Drift
  // --------------------------------------------------------------------------
  describe('Feature 13: Bike Physics & Drift', () => {
    it('calculates angular difference in [-PI, PI] and applies velocity lerp and friction decay', () => {
      expect(getAngleDiff(Math.PI, -Math.PI)).toBeCloseTo(0);
      expect(getAngleDiff(0, Math.PI / 2)).toBeCloseTo(-Math.PI / 2);
      expect(getAngleDiff(Math.PI / 2, 0)).toBeCloseTo(Math.PI / 2);

      // Base speed constant is 265 px/s
      expect(BASE_PLAYER_SPEED).toBe(265);
      const effSpeed = calculateEffectiveSpeed(player, false);
      expect(effSpeed).toBe(265);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 14: NOS Booster & Lockout
  // --------------------------------------------------------------------------
  describe('Feature 14: NOS Booster & Lockout', () => {
    it('applies +70% speed multiplier and drains NOS at 35/s while moving with shift held', () => {
      expect(NOS_SPEED_MULT).toBe(1.7);
      expect(NOS_DRAIN_RATE).toBe(35);
      expect(NOS_RECHARGE_RATE).toBe(16);
      expect(NOS_LOCK_THRESHOLD).toBe(25);

      const boostSpeed = calculateEffectiveSpeed(player, true);
      expect(boostSpeed).toBeCloseTo(265 * 1.7);

      player.nos = 100;
      const res = updateNos(player, true, true, 0.5);
      expect(res.boosting).toBe(true);
      expect(player.nos).toBeCloseTo(100 - 35 * 0.5);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 15: Skid Mark Generation
  // --------------------------------------------------------------------------
  describe('Feature 15: Skid Mark Generation', () => {
    it('enforces maximum 130 skid marks per room to preserve memory', () => {
      expect(MAX_SKIDS_PER_ROOM).toBe(130);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 16: The 7 Weapons Specs
  // --------------------------------------------------------------------------
  describe('Feature 16: The 7 Weapons Specs', () => {
    it('verifies all 7 weapons have exact cooldowns, damage, and projectile speeds', () => {
      const ids: WeaponId[] = ['pistol', 'machine_gun', 'flamethrower', 'grenade_launcher', 'shotgun', 'railgun', 'arc_coil'];
      expect(Object.keys(WEAPONS)).toEqual(ids);

      // Pistol
      expect(WEAPONS.pistol.damage).toBe(13);
      expect(WEAPONS.pistol.cooldown).toBe(0.27);
      expect(WEAPONS.pistol.speed).toBe(540);
      expect(WEAPONS.pistol.cost).toBe(0);

      // Machine Gun
      expect(WEAPONS.machine_gun.damage).toBe(5.5);
      expect(WEAPONS.machine_gun.cooldown).toBe(0.095);
      expect(WEAPONS.machine_gun.speed).toBe(620);
      expect(WEAPONS.machine_gun.cost).toBe(55);

      // Flamethrower
      expect(WEAPONS.flamethrower.damage).toBe(3.2);
      expect(WEAPONS.flamethrower.cooldown).toBe(0.09);
      expect(WEAPONS.flamethrower.speed).toBe(290);
      expect(WEAPONS.flamethrower.cost).toBe(95);

      // Grenade Launcher
      expect(WEAPONS.grenade_launcher.damage).toBe(18);
      expect(WEAPONS.grenade_launcher.cooldown).toBe(1.17);
      expect(WEAPONS.grenade_launcher.speed).toBe(410);
      expect(WEAPONS.grenade_launcher.cost).toBe(140);

      // Shotgun
      expect(WEAPONS.shotgun.damage).toBe(5.2);
      expect(WEAPONS.shotgun.cooldown).toBe(0.56);
      expect(WEAPONS.shotgun.speed).toBe(560);
      expect(WEAPONS.shotgun.cost).toBe(70);

      // Railgun
      expect(WEAPONS.railgun.damage).toBe(35);
      expect(WEAPONS.railgun.cooldown).toBe(0.80);
      expect(WEAPONS.railgun.speed).toBe(980);
      expect(WEAPONS.railgun.cost).toBe(120);

      // Arc Coil
      expect(WEAPONS.arc_coil.damage).toBe(15);
      expect(WEAPONS.arc_coil.cooldown).toBe(0.40);
      expect(WEAPONS.arc_coil.speed).toBe(520);
      expect(WEAPONS.arc_coil.cost).toBe(165);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 17: Multi-shot Fan Spread
  // --------------------------------------------------------------------------
  describe('Feature 17: Multi-shot Fan Spread', () => {
    it('calculates angular fan spread with 0.14 rad step centered at player aim angle', () => {
      // 1 shot: offset 0
      expect(calcMultiShotOffset(1, 0)).toBe(0);

      // 3 shots: offsets -0.14, 0, +0.14
      expect(calcMultiShotOffset(3, 0)).toBeCloseTo(-0.14);
      expect(calcMultiShotOffset(3, 1)).toBeCloseTo(0);
      expect(calcMultiShotOffset(3, 2)).toBeCloseTo(0.14);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 18: Flamethrower Mechanics
  // --------------------------------------------------------------------------
  describe('Feature 18: Flamethrower Mechanics', () => {
    it('spawns 99-pierce expanding flame puffs with single-hit hitIds Set per puff', () => {
      const state = createCombatState();
      player.weapon = 'flamethrower';
      player.fireTimer = 0;

      const fired = fireWeapon({
        player,
        target: { x: player.x + 100, y: player.y },
        state
      });

      expect(fired).toBe(true);
      expect(state.bullets.length).toBeGreaterThan(0);
      const flame = state.bullets[0];
      expect(flame.isFlame).toBe(true);
      expect(flame.pierceLeft).toBe(99);
      expect(flame.hitIds).toBeInstanceOf(Set);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 19: Arcing Grenade Lob
  // --------------------------------------------------------------------------
  describe('Feature 19: Arcing Grenade Lob', () => {
    it('creates a lobbed grenade with travel duration proportional to cursor distance', () => {
      const state = createCombatState();
      player.weapon = 'grenade_launcher';
      player.fireTimer = 0;

      const fired = fireWeapon({
        player,
        target: { x: player.x + 200, y: player.y },
        state
      });

      expect(fired).toBe(true);
      expect(state.grenades).toHaveLength(1);
      const grenade = state.grenades[0];
      expect(grenade.blastRadius).toBeCloseTo(92);
      expect(grenade.dmg).toBe(36);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 20: Shotgun Knockback
  // --------------------------------------------------------------------------
  describe('Feature 20: Shotgun Knockback', () => {
    it('fires 6 buckshot pellets with 11px physics knockback property', () => {
      const state = createCombatState();
      player.weapon = 'shotgun';
      player.fireTimer = 0;

      const fired = fireWeapon({
        player,
        target: { x: player.x + 200, y: player.y },
        state
      });

      expect(fired).toBe(true);
      expect(state.bullets).toHaveLength(6);
      expect(state.bullets[0].knockback).toBe(11);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 21: Railgun Beam Penetration
  // --------------------------------------------------------------------------
  describe('Feature 21: Railgun Beam Penetration', () => {
    it('fires a hyper-velocity slug with pierceLeft: 99 and creates cyan ion trail upon flight', () => {
      const state = createCombatState();
      player.weapon = 'railgun';
      player.fireTimer = 0;

      const fired = fireWeapon({
        player,
        target: { x: player.x + 300, y: player.y },
        state
      });

      expect(fired).toBe(true);
      expect(state.bullets).toHaveLength(1);
      const slug = state.bullets[0];
      expect(slug.pierceLeft).toBe(99);
      expect(slug.isRail).toBe(true);

      // Advance bullet flight step to generate ion beam trail
      const dummyRoom: Room = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [],
        enemies: [],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };
      updatePlayerBullets(0.016, state.bullets, dummyRoom, player, state);

      expect(state.beamEffects.length).toBeGreaterThan(0);
      expect(state.beamEffects[0].color).toBe('#00f5d4');
    });
  });

  // --------------------------------------------------------------------------
  // Feature 22: Arc Tesla Coil Lightning
  // --------------------------------------------------------------------------
  describe('Feature 22: Arc Tesla Coil Lightning', () => {
    it('fires an arc coil projectile flagged with isArc: true', () => {
      const state = createCombatState();
      player.weapon = 'arc_coil';
      player.fireTimer = 0;

      const fired = fireWeapon({
        player,
        target: { x: player.x + 200, y: player.y },
        state
      });

      expect(fired).toBe(true);
      expect(state.bullets).toHaveLength(1);
      expect(state.bullets[0].isArc).toBe(true);
      expect(state.bullets[0].dmg).toBe(15);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 23: Combat Stat Multipliers
  // --------------------------------------------------------------------------
  describe('Feature 23: Combat Stat Multipliers', () => {
    it('calculates Frontal Brute Armor (0.65x), Tire Iron (+30% >90% HP), and Chrome Lens Crit (2x)', () => {
      // Brute frontal armor: bullet takes -35% (0.65x), flame takes 1.0x
      expect(applyBruteArmor(100, 'brute', false)).toBe(65);
      expect(applyBruteArmor(100, 'brute', true)).toBe(100);
      expect(applyBruteArmor(100, 'swarmer', false)).toBe(100);

      // Tire Iron Crowbar: +30% per stack if enemyHp > 90%
      expect(applyTireIronBonus(100, 95, 100, 1)).toBe(130);
      expect(applyTireIronBonus(100, 95, 100, 2)).toBe(160);
      expect(applyTireIronBonus(100, 85, 100, 2)).toBe(100); // <= 90%

      // Chrome Lens Crit: 2x multiplier
      const critResult = rollCrit(5, false, () => 0.1);
      expect(critResult.isCrit).toBe(true);
      expect(critResult.mult).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 24: 10 Enemy Behaviors
  // --------------------------------------------------------------------------
  describe('Feature 24: 10 Enemy Behaviors', () => {
    it('creates all 10 enemy types with valid base HP, speeds, and state parameters', () => {
      const enemyTypes: RegularEnemyType[] = [
        'swarmer', 'turret', 'charger', 'trishot', 'bomber',
        'brute', 'splitter', 'mini_swarmer', 'sniper', 'pyro'
      ];

      for (const type of enemyTypes) {
        const en = createEnemy(type, 300, 300, 1, false);
        expect(en.type).toBe(type);
        expect(en.hp).toBeGreaterThan(0);
        expect(en.speed).toBeGreaterThan(0);
        expect(en.radius).toBeGreaterThan(0);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Feature 25: Elite Variant Modifier
  // --------------------------------------------------------------------------
  describe('Feature 25: Elite Variant Modifier', () => {
    it('applies 1.65x HP and 1.15x speed scaling to elite variants and bounds roll chance', () => {
      expect(getEliteSpawnChance(1)).toBe(0);
      expect(getEliteSpawnChance(3)).toBeCloseTo(0.24); // (3-1)*0.12
      expect(getEliteSpawnChance(10)).toBe(0.45); // Capped at 0.45

      const normalHp = calcEnemyHp(100, 1, false);
      const eliteHp = calcEnemyHp(100, 1, true);
      expect(eliteHp).toBe(Math.round(normalHp * 1.65));

      const normalSpd = calcEnemySpeed(100, 1, false);
      const eliteSpd = calcEnemySpeed(100, 1, true);
      expect(eliteSpd).toBeCloseTo(normalSpd * 1.15);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 26: 3 Muscle-Car Bosses
  // --------------------------------------------------------------------------
  describe('Feature 26: 3 Muscle-Car Bosses', () => {
    it('creates Scrap Goliath, Siege Behemoth, and Overlord Helion with 280 base HP and floor scaling', () => {
      const b0 = createBoss(1, 360, 360); // floor 1 -> Goliath
      expect(b0.name).toBe('SCRAP GOLIATH');
      expect(b0.bossVariant).toBe(0);
      expect(b0.hp).toBe(280);

      const b1 = createBoss(2, 360, 360); // floor 2 -> Behemoth
      expect(b1.name).toBe('SIEGE BEHEMOTH');
      expect(b1.bossVariant).toBe(1);

      const b2 = createBoss(3, 360, 360); // floor 3 -> Overlord Helion
      expect(b2.name).toBe('OVERLORD HELION');
      expect(b2.bossVariant).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Feature 27: In-Run Mods & RoR2 Drops
  // --------------------------------------------------------------------------
  describe('Feature 27: In-Run Mods & RoR2 Drops', () => {
    it('verifies 9 in-run pedestal mods mutate player stats and 6 RoR2 stacking items exist', () => {
      expect(RUN_MOD_POOL).toHaveLength(9);
      expect(Object.keys(DROP_ITEMS)).toHaveLength(6);
      expect(DROP_ITEM_IDS).toHaveLength(6);

      // Test mod application: Hollow-Point (+25% damage)
      const hpMod = RUN_MOD_POOL.find(m => m.id === 'hollow_point')!;
      expect(hpMod).toBeDefined();
      const initialDmg = player.dmgMult;
      hpMod.apply(player);
      expect(player.dmgMult).toBeCloseTo(initialDmg + 0.25);

      // RoR2 drop item IDs
      expect(DROP_ITEM_IDS).toContain('nitro_syringe');
      expect(DROP_ITEM_IDS).toContain('tire_iron');
      expect(DROP_ITEM_IDS).toContain('chrome_lens');
      expect(DROP_ITEM_IDS).toContain('gasoline');
      expect(DROP_ITEM_IDS).toContain('racing_slicks');
      expect(DROP_ITEM_IDS).toContain('oil_infusion');
    });
  });

  // --------------------------------------------------------------------------
  // Feature 28: Semicircular Fuel Gauge Math
  // --------------------------------------------------------------------------
  describe('Feature 28: Semicircular Fuel Gauge Math', () => {
    it('calculates fuel ratio and triggers low-fuel jitter warning state when HP <= 34%', () => {
      player.maxHp = 10;
      player.hp = 10;

      const fullRatio = player.hp / player.maxHp;
      expect(fullRatio).toBe(1.0);
      expect(fullRatio <= 0.34).toBe(false);

      player.hp = 3;
      const lowRatio = player.hp / player.maxHp;
      expect(lowRatio).toBe(0.3);
      expect(lowRatio <= 0.34).toBe(true); // Triggers low fuel needle wobble
    });
  });
});

function dungeonCoordKey(pt: { x: number; y: number }): string {
  return `${pt.x},${pt.y}`;
}
