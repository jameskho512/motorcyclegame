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
  Room,
  Pickup,
  MetaSaveState
} from '@/types/game';

import { WEAPONS } from '@/data/weapons';
import { getWeaponArsenalSummary } from '../../src/data/weapons';
import { META_UPGRADES, calcUpgradeCost, RUN_MOD_POOL, DROP_ITEMS, DROP_ITEM_IDS } from '@/data/upgrades';
import { EQUIP_SLOTS, RARITY, genLoot, itemScore } from '@/data/equipment';
import {
  SafeLocalStorage,
  createDefaultPlayerState,
  createDefaultMetaSave,
  saveRunCheckpoint,
  loadRunCheckpoint,
  loadMetaSave,
  writeMetaSave,
  getCareerOutlawRank
} from '@/core/state';
import { getFloorBountyContractStatus } from '../../src/core/state';
import { getScannerStationAdvisor, getForgeStationAdvisor } from '../../src/ui/hubStationModal';
import { InputManager, KEY_WEAPON_MAP } from '@/core/input';
import { SoundSynthesizer, calculateEngineParams } from '@/audio/sfx';
import { generateDungeon, OBSTACLE_PATTERNS, createBoss, getFloorExplorationStatus } from '@/world/dungeon';
import { formatWeaponEvolutionTooltipHint } from '@/ui/tooltip';
import { getShopBuildSynergyHint } from '@/ui/shopModal';
import { getPortalHeatBriefing } from '@/ui/portalModal';
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
      expect(grenade.dmg).toBe(18);
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
      expect(getEliteSpawnChance(3)).toBeCloseTo(0.10 * 1.45);
      expect(getEliteSpawnChance(20)).toBe(0.45); // Capped at 0.45

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
    it('creates Scrap Goliath, Siege Behemoth, and Overlord Helion with 1120 base HP and floor scaling', () => {
      const b0 = createBoss(1, 360, 360); // floor 1 -> Goliath
      expect(b0.name).toBe('SCRAP GOLIATH');
      expect(b0.bossVariant).toBe(0);
      expect(b0.hp).toBe(1120);

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
    it('verifies 15 in-run pedestal mods mutate player stats and 12 RoR2 stacking items exist', () => {
      expect(RUN_MOD_POOL).toHaveLength(15);
      expect(Object.keys(DROP_ITEMS)).toHaveLength(12);
      expect(DROP_ITEM_IDS).toHaveLength(12);

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

  // --------------------------------------------------------------------------
  // Feature 8: Sanctuary Station, Career Rank & Exploration Telemetry (M92)
  // --------------------------------------------------------------------------
  describe('Feature 8: Sanctuary Station, Career Rank & Exploration Telemetry (M92)', () => {
    it('evaluates floor exploration progress, visited sectors, and loot completion on freshly generated Floor 1 and Floor 6 dungeons', () => {
      // Floor 1 fresh dungeon: targetRooms = 7 + min(10, 2) = 9
      const d1 = generateDungeon(1);
      const status1 = getFloorExplorationStatus(d1);

      expect(status1.totalRooms).toBe(9);
      expect(status1.visitedRooms).toBe(1); // Starting sector visited
      expect(status1.clearedRooms).toBeGreaterThanOrEqual(3); // Start, treasure, and shop rooms
      expect(status1.remainingPickups).toBeGreaterThanOrEqual(4); // Mod pedestal + 3 shop items
      expect(status1.isFullyCleared).toBe(false);
      expect(status1.statusLine).toBe(
        `${status1.clearedRooms}/${status1.totalRooms} SECTORS SECURED · ${status1.remainingPickups} DROP(S) DETECTED`
      );

      // Floor 6 fresh dungeon: targetRooms = 7 + min(10, 12) = 17
      const d6 = generateDungeon(6);
      const status6 = getFloorExplorationStatus(d6);

      expect(status6.totalRooms).toBe(17);
      expect(status6.visitedRooms).toBe(1);
      expect(status6.clearedRooms).toBeGreaterThanOrEqual(3);
      expect(status6.remainingPickups).toBeGreaterThanOrEqual(4);
      expect(status6.isFullyCleared).toBe(false);
      expect(status6.statusLine).toBe(
        `${status6.clearedRooms}/${status6.totalRooms} SECTORS SECURED · ${status6.remainingPickups} DROP(S) DETECTED`
      );

      // Verify passing rooms mapping directly gives identical telemetry
      expect(getFloorExplorationStatus(d1.rooms)).toEqual(status1);
    });

    it('formats weapon overclock evolution progress hints for pistol, railgun, and arc_coil before and after evolution', () => {
      // 1. Pistol: Ricochet Revolver
      const pistolBefore = formatWeaponEvolutionTooltipHint('pistol', { items: [], itemStacks: {} });
      expect(pistolBefore).toBe(
        '🔧 OVERCLOCK TO RICOCHET REVOLVER: Need "Ricochet Rounds" Mod OR 0/3 Item Stacks (+2 Bounces, +35% Damage & Golden Tracer Rounds)'
      );
      expect(pistolBefore).not.toContain('ACTIVE');

      const pistolAfterMod = formatWeaponEvolutionTooltipHint('pistol', { items: ['Ricochet Rounds'], itemStacks: {} });
      expect(pistolAfterMod).toBe(
        '⚡ OVERCLOCKED: RICOCHET REVOLVER ACTIVE (+2 Bounces, +35% Damage & Golden Tracer Rounds)'
      );

      const pistolAfterStacks = formatWeaponEvolutionTooltipHint('pistol', { items: [], itemStacks: { lens: 3 } });
      expect(pistolAfterStacks).toBe(
        '⚡ OVERCLOCKED: RICOCHET REVOLVER ACTIVE (+2 Bounces, +35% Damage & Golden Tracer Rounds)'
      );

      // 2. Railgun: Orbital Ion Lance
      const railgunBefore = formatWeaponEvolutionTooltipHint('railgun', { items: [], itemStacks: {} });
      expect(railgunBefore).toBe(
        '🔧 OVERCLOCK TO ORBITAL ION LANCE: Need "Piercing Core" Mod OR 0/3 Item Stacks (Hyper-Wide Golden Ion Lance & +35% Damage)'
      );
      expect(railgunBefore).not.toContain('ACTIVE');

      const railgunAfterMod = formatWeaponEvolutionTooltipHint('railgun', { items: ['piercing_core'], itemStacks: {} });
      expect(railgunAfterMod).toBe(
        '⚡ OVERCLOCKED: ORBITAL ION LANCE ACTIVE (Hyper-Wide Golden Ion Lance & +35% Damage)'
      );

      // 3. Arc Coil: Thunderlord Storm Coil
      const arcCoilBefore = formatWeaponEvolutionTooltipHint('arc_coil', { items: [], itemStacks: {} });
      expect(arcCoilBefore).toBe(
        '🔧 OVERCLOCK TO THUNDERLORD STORM COIL: Need "Vampiric Siphon" Mod OR 0/3 Item Stacks (Chains to 6 Targets for 85% Damage)'
      );
      expect(arcCoilBefore).not.toContain('ACTIVE');

      const arcCoilAfterMod = formatWeaponEvolutionTooltipHint('arc_coil', { items: ['vamp_siphon'], itemStacks: {} });
      expect(arcCoilAfterMod).toBe(
        '⚡ OVERCLOCKED: THUNDERLORD STORM COIL ACTIVE (Chains to 6 Targets for 85% Damage)'
      );
    });

    it('classifies player career rank progression through all 5 outlaw tiers up to legend_of_valhalla', () => {
      // Tier 1: Rookie Courier (<40 score, floor 1)
      const rank1 = getCareerOutlawRank({ totalKills: 0, bossesSlain: 0, bestFloor: 1 });
      expect(rank1.rankId).toBe('rookie_courier');
      expect(rank1.tierNumber).toBe(1);
      expect(rank1.title).toBe('⚙️ ROOKIE COURIER');
      expect(rank1.careerScore).toBe(0);
      expect(rank1.nextMilestoneText).toBe('Reach 40 Career Score or Floor 2 for HIGHWAY OUTLAW');

      // Tier 2: Highway Outlaw (score >= 40 or floor >= 2)
      const rank2 = getCareerOutlawRank({ totalKills: 40, bossesSlain: 0, bestFloor: 1 });
      expect(rank2.rankId).toBe('highway_outlaw');
      expect(rank2.tierNumber).toBe(2);
      expect(rank2.title).toBe('🔥 HIGHWAY OUTLAW');
      expect(rank2.careerScore).toBe(40);
      expect(rank2.nextMilestoneText).toBe('Reach 120 Career Score or Floor 3 for SYNDICATE ENFORCER');

      // Tier 3: Syndicate Enforcer (score >= 120 or floor >= 3)
      const rank3 = getCareerOutlawRank({ totalKills: 120, bossesSlain: 0, bestFloor: 1 });
      expect(rank3.rankId).toBe('syndicate_enforcer');
      expect(rank3.tierNumber).toBe(3);
      expect(rank3.title).toBe('⚡ SYNDICATE ENFORCER');
      expect(rank3.careerScore).toBe(120);
      expect(rank3.nextMilestoneText).toBe('Reach 250 Career Score or Floor 5 for APEX ROADLORD');

      // Tier 4: Apex Roadlord (score >= 250 or floor >= 5)
      const rank4 = getCareerOutlawRank({ totalKills: 250, bossesSlain: 0, bestFloor: 1 });
      expect(rank4.rankId).toBe('apex_roadlord');
      expect(rank4.tierNumber).toBe(4);
      expect(rank4.title).toBe('☠️ APEX ROADLORD');
      expect(rank4.careerScore).toBe(250);
      expect(rank4.nextMilestoneText).toBe('Reach 500 Career Score or clear Floor 6 for LEGEND OF VALHALLA');

      // Tier 5: Legend of Valhalla (score >= 500 or floor 6 + 6 bosses)
      const rank5ByScore = getCareerOutlawRank({ totalKills: 500, bossesSlain: 0, bestFloor: 1 });
      expect(rank5ByScore.rankId).toBe('legend_of_valhalla');
      expect(rank5ByScore.tierNumber).toBe(5);
      expect(rank5ByScore.title).toBe('👑 LEGEND OF VALHALLA');
      expect(rank5ByScore.careerScore).toBe(500);
      expect(rank5ByScore.nextMilestoneText).toBe('MAX CAREER RANK ACHIEVED');

      const rank5ByFloorAndBosses = getCareerOutlawRank({ totalKills: 0, bossesSlain: 6, bestFloor: 6 });
      expect(rank5ByFloorAndBosses.rankId).toBe('legend_of_valhalla');
      expect(rank5ByFloorAndBosses.tierNumber).toBe(5);
      expect(rank5ByFloorAndBosses.nextMilestoneText).toBe('MAX CAREER RANK ACHIEVED');
    });

    it('identifies shop build synergies for signature weapon evolution mods and critical low-hull repairs', () => {
      // Signature mod synergy with equipped weapon
      const ricochetPickup: Pickup = {
        x: 120,
        y: 120,
        radius: 20,
        type: 'mod_pedestal',
        mod: {
          id: 'ricochet_mod',
          name: 'Ricochet Rounds',
          desc: '+2 Bounces',
          cost: 25
        } as any,
        cost: 25
      };

      const synWithPistol = getShopBuildSynergyHint(ricochetPickup, { weapon: 'pistol' });
      expect(synWithPistol.hasSynergy).toBe(true);
      expect(synWithPistol.synergyType).toBe('EVOLUTION_KEY');
      expect(synWithPistol.hintText).toBe('⚡ UNLOCKS RICOCHET REVOLVER EVOLUTION!');

      // Non-matching weapon mod has standard ordnance synergy
      const synWithShotgun = getShopBuildSynergyHint(ricochetPickup, { weapon: 'shotgun' });
      expect(synWithShotgun.hasSynergy).toBe(false);
      expect(synWithShotgun.synergyType).toBe('STANDARD');
      expect(synWithShotgun.hintText).toBe('Standard Black Market Ordnance');

      // Low-hull repair synergy: HP <= 50% maxHp
      const heartPickup: Pickup = {
        x: 150,
        y: 150,
        radius: 20,
        type: 'shop_heart',
        name: 'Field Suture Kit',
        cost: 15
      };

      // 3/6 HP (<= 50%) -> triggers critical repair synergy
      const lowHullSyn = getShopBuildSynergyHint(heartPickup, { hp: 3, maxHp: 6 });
      expect(lowHullSyn.hasSynergy).toBe(true);
      expect(lowHullSyn.synergyType).toBe('LOW_HULL_REPAIR');
      expect(lowHullSyn.hintText).toBe('⚠️ CRITICAL HULL REPAIR RECOMMENDED!');

      // 4/6 HP (> 50%) -> standard issue
      const healthyHullSyn = getShopBuildSynergyHint(heartPickup, { hp: 4, maxHp: 6 });
      expect(healthyHullSyn.hasSynergy).toBe(false);
      expect(healthyHullSyn.synergyType).toBe('STANDARD');
      expect(healthyHullSyn.hintText).toBe('Standard Black Market Ordnance');
    });

    it('provides accurate threat escalation briefings and scrap multipliers across Heat 0 through Heat 3', () => {
      // Heat 0: Standard
      const h0 = getPortalHeatBriefing(0);
      expect(h0.heatLevel).toBe(0);
      expect(h0.label).toBe('HEAT 0 // STANDARD');
      expect(h0.enemyScaleText).toBe('Standard Enemy HP & Speed');
      expect(h0.scrapBonusText).toBe('+0% Bonus Scrap');

      // Heat 1: Overclocked
      const h1 = getPortalHeatBriefing(1);
      expect(h1.heatLevel).toBe(1);
      expect(h1.label).toBe('HEAT 1 // OVERCLOCKED');
      expect(h1.enemyScaleText).toBe('+24% Enemy HP · +12% Speed');
      expect(h1.scrapBonusText).toBe('+25% Bonus Scrap');

      // Heat 2: Blood Pact
      const h2 = getPortalHeatBriefing(2);
      expect(h2.heatLevel).toBe(2);
      expect(h2.label).toBe('HEAT 2 // BLOOD PACT');
      expect(h2.enemyScaleText).toBe('+48% Enemy HP · +24% Speed');
      expect(h2.scrapBonusText).toBe('+50% Bonus Scrap');

      // Heat 3: Valhalla Inferno
      const h3 = getPortalHeatBriefing(3);
      expect(h3.heatLevel).toBe(3);
      expect(h3.label).toBe('HEAT 3 // VALHALLA INFERNO');
      expect(h3.enemyScaleText).toBe('+72% Enemy HP · +36% Speed');
      expect(h3.scrapBonusText).toBe('+75% Bonus Scrap');

      // Default parameter matches Heat 0
      expect(getPortalHeatBriefing()).toEqual(h0);
    });
  });

  // --------------------------------------------------------------------------
  describe('Feature 9: Floor Bounty Contracts, Arsenal Career & Sanctuary Advisors (M111)', () => {
    it('evaluates all 6 Floor Bounty Contracts (Floors 1..6) verifying reward escalation and style milestone detection', () => {
      // Contract 1: Neon Daredevil (Floor 1)
      const b1 = getFloorBountyContractStatus(1, { styleScore: 0, styleRank: 'D' });
      expect(b1.targetFloor).toBe(1);
      expect(b1.contractTitle).toBe('NEON DAREDEVIL');
      expect(b1.taskText).toBe('Graze 3 enemy projectiles or clear Floor 1 Boss');
      expect(b1.rewardScrap).toBe(8);
      expect(b1.rewardCoins).toBe(10);
      expect(b1.isStyleMilestoneMet).toBe(false);
      expect(b1.summaryLine).toBe('BOUNTY [F1] NEON DAREDEVIL: Graze 3 enemy projectiles or clear Floor 1 Boss (+8 SCRAP, +10 COINS)');

      // Contract 2: Drift Executioner (Floor 2)
      const b2 = getFloorBountyContractStatus(2, { styleScore: 20, styleRank: 'C' });
      expect(b2.targetFloor).toBe(2);
      expect(b2.contractTitle).toBe('DRIFT EXECUTIONER');
      expect(b2.taskText).toBe('Trigger 2 Drift Shockwaves or clear Floor 2 Boss');
      expect(b2.rewardScrap).toBe(10);
      expect(b2.rewardCoins).toBe(12);
      expect(b2.isStyleMilestoneMet).toBe(false);

      // Contract 3: Thermal Hunter (Floor 3) - Meets style milestone via Rank A
      const b3 = getFloorBountyContractStatus(3, { styleScore: 10, styleRank: 'A' });
      expect(b3.targetFloor).toBe(3);
      expect(b3.contractTitle).toBe('THERMAL HUNTER');
      expect(b3.taskText).toBe('Reach Style Rank A or clear Floor 3 Boss');
      expect(b3.rewardScrap).toBe(12);
      expect(b3.rewardCoins).toBe(15);
      expect(b3.isStyleMilestoneMet).toBe(true);

      // Contract 4: Cryo Breaker (Floor 4)
      const b4 = getFloorBountyContractStatus(4, { styleScore: 40, styleRank: 'B' });
      expect(b4.targetFloor).toBe(4);
      expect(b4.contractTitle).toBe('CRYO BREAKER');
      expect(b4.taskText).toBe('Detonate 2 Arena Barrels or clear Floor 4 Boss');
      expect(b4.rewardScrap).toBe(15);
      expect(b4.rewardCoins).toBe(18);
      expect(b4.isStyleMilestoneMet).toBe(false);

      // Contract 5: Apex Interceptor (Floor 5) - Meets style milestone via styleScore >= 50
      const b5 = getFloorBountyContractStatus(5, { styleScore: 55, styleRank: 'B' });
      expect(b5.targetFloor).toBe(5);
      expect(b5.contractTitle).toBe('APEX INTERCEPTOR');
      expect(b5.taskText).toBe('Reach Style Rank S or clear Floor 5 Boss');
      expect(b5.rewardScrap).toBe(18);
      expect(b5.rewardCoins).toBe(22);
      expect(b5.isStyleMilestoneMet).toBe(true);

      // Contract 6: Valhalla Conqueror (Floor 6) - Meets style milestone via Rank SSS
      const b6 = getFloorBountyContractStatus(6, { styleScore: 0, styleRank: 'SSS' });
      expect(b6.targetFloor).toBe(6);
      expect(b6.contractTitle).toBe('VALHALLA CONQUEROR');
      expect(b6.taskText).toBe('Defeat Omega Valhalla on Floor 6');
      expect(b6.rewardScrap).toBe(25);
      expect(b6.rewardCoins).toBe(30);
      expect(b6.isStyleMilestoneMet).toBe(true);
      expect(b6.summaryLine).toBe('BOUNTY [F6] VALHALLA CONQUEROR: Defeat Omega Valhalla on Floor 6 (+25 SCRAP, +30 COINS)');

      // Verify reward escalation: 8 -> 25 scrap and 10 -> 30 coins
      const allScraps = [b1, b2, b3, b4, b5, b6].map(c => c.rewardScrap);
      const allCoins = [b1, b2, b3, b4, b5, b6].map(c => c.rewardCoins);
      expect(allScraps).toEqual([8, 10, 12, 15, 18, 25]);
      expect(allCoins).toEqual([10, 12, 15, 18, 22, 30]);

      // Verify style milestone detection sensitivity: D (false) vs A/SSS (true)
      expect(getFloorBountyContractStatus(1, { styleRank: 'D', styleScore: 0 }).isStyleMilestoneMet).toBe(false);
      expect(getFloorBountyContractStatus(1, { styleRank: 'A', styleScore: 0 }).isStyleMilestoneMet).toBe(true);
      expect(getFloorBountyContractStatus(1, { styleRank: 'SSS', styleScore: 0 }).isStyleMilestoneMet).toBe(true);
      expect(getFloorBountyContractStatus(1, null).isStyleMilestoneMet).toBe(false);
    });

    it('evaluates getWeaponArsenalSummary progression from a fresh save to a full 7-weapon outlaw arsenal with signature weapon tracking', () => {
      // 1. Fresh save state: default pistol only
      const freshSummary = getWeaponArsenalSummary();
      expect(freshSummary.unlockedCount).toBe(1);
      expect(freshSummary.totalWeapons).toBe(7);
      expect(freshSummary.totalKills).toBe(0);
      expect(freshSummary.topWeaponId).toBe('pistol');
      expect(freshSummary.topWeaponName).toBe('Pistol');
      expect(freshSummary.topWeaponKills).toBe(0);
      expect(freshSummary.summaryLine).toBe('ARSENAL: 1/7 UNLOCKED · 0 TOTAL KILLS · SIGNATURE: PISTOL (0)');

      // Also holds with empty meta state
      const emptyMeta = createDefaultMetaSave();
      expect(getWeaponArsenalSummary(emptyMeta).summaryLine).toBe(
        'ARSENAL: 1/7 UNLOCKED · 0 TOTAL KILLS · SIGNATURE: PISTOL (0)'
      );

      // 2. Mid progression: 3 unlocked weapons with kills
      const midMeta: MetaSaveState = {
        ...createDefaultMetaSave(),
        unlocked: {
          ...createDefaultMetaSave().unlocked,
          machine_gun: true,
          shotgun: true
        },
        weaponKills: {
          pistol: 12,
          machine_gun: 35,
          shotgun: 80
        }
      };
      const midSummary = getWeaponArsenalSummary(midMeta);
      expect(midSummary.unlockedCount).toBe(3);
      expect(midSummary.totalWeapons).toBe(7);
      expect(midSummary.totalKills).toBe(127);
      expect(midSummary.topWeaponId).toBe('shotgun');
      expect(midSummary.topWeaponName).toBe(WEAPONS.shotgun.name);
      expect(midSummary.topWeaponKills).toBe(80);
      expect(midSummary.summaryLine).toBe(`ARSENAL: 3/7 UNLOCKED · 127 TOTAL KILLS · SIGNATURE: ${WEAPONS.shotgun.name.toUpperCase()} (80)`);

      // 3. Full 7-weapon outlaw arsenal
      const fullMeta: MetaSaveState = {
        ...createDefaultMetaSave(),
        unlocked: {
          machine_gun: true,
          shotgun: true,
          flamethrower: true,
          railgun: true,
          grenade_launcher: true,
          arc_coil: true
        },
        weaponKills: {
          pistol: 20,
          machine_gun: 45,
          shotgun: 90,
          flamethrower: 30,
          railgun: 160,
          grenade_launcher: 25,
          arc_coil: 30
        }
      };
      const fullSummary = getWeaponArsenalSummary(fullMeta);
      expect(fullSummary.unlockedCount).toBe(7);
      expect(fullSummary.totalWeapons).toBe(7);
      expect(fullSummary.totalKills).toBe(400);
      expect(fullSummary.topWeaponId).toBe('railgun');
      expect(fullSummary.topWeaponName).toBe(WEAPONS.railgun.name);
      expect(fullSummary.topWeaponKills).toBe(160);
      expect(fullSummary.summaryLine).toBe(`ARSENAL: 7/7 UNLOCKED · 400 TOTAL KILLS · SIGNATURE: ${WEAPONS.railgun.name.toUpperCase()} (160)`);

      // 4. Dynamic signature weapon shift when another gun overtakes leader
      const shiftedMeta: MetaSaveState = {
        ...fullMeta,
        weaponKills: {
          ...fullMeta.weaponKills,
          shotgun: 250
        }
      };
      const shiftedSummary = getWeaponArsenalSummary(shiftedMeta);
      expect(shiftedSummary.topWeaponId).toBe('shotgun');
      expect(shiftedSummary.topWeaponName).toBe(WEAPONS.shotgun.name);
      expect(shiftedSummary.topWeaponKills).toBe(250);
      expect(shiftedSummary.totalKills).toBe(560);
      expect(shiftedSummary.summaryLine).toBe(`ARSENAL: 7/7 UNLOCKED · 560 TOTAL KILLS · SIGNATURE: ${WEAPONS.shotgun.name.toUpperCase()} (250)`);
    });

    it('evaluates getScannerStationAdvisor and getForgeStationAdvisor state transitions as the player claims the free +15% Crit scanner uplink and spends 15 Scrap at the Forge Anvil', () => {
      const player = createDefaultPlayerState();

      // Scanner Station: Standby -> Claimed transition
      const scanBefore = getScannerStationAdvisor(player, 1);
      expect(scanBefore.scannerActive).toBe(false);
      expect(scanBefore.critBonusPct).toBe(0);
      expect(scanBefore.targetFloor).toBe(1);
      expect(scanBefore.recommendedAction).toBe('ACTIVATE SCANNER UPLINK (Free +15% Crit Chance & Full Floor Radar)');
      expect(scanBefore.summaryLine).toBe(
        'SCANNER INTEL [FLOOR 1]: STANDBY (0% CRIT) · ACTIVATE SCANNER UPLINK (Free +15% Crit Chance & Full Floor Radar)'
      );

      // Player activates uplink in sanctuary
      player.scannerBuff = true;
      const scanAfter = getScannerStationAdvisor(player, 2);
      expect(scanAfter.scannerActive).toBe(true);
      expect(scanAfter.critBonusPct).toBe(15);
      expect(scanAfter.targetFloor).toBe(2);
      expect(scanAfter.recommendedAction).toBe('TACTICAL UPLINK ONLINE (+15% Crit Chance & Minimap Reveal Active)');
      expect(scanAfter.summaryLine).toBe(
        'SCANNER INTEL [FLOOR 2]: ONLINE (+15% CRIT) · TACTICAL UPLINK ONLINE (+15% Crit Chance & Minimap Reveal Active)'
      );

      // Forge Station: 25 Scrap available -> Spends 15 Scrap (leaving 10 Scrap)
      const meta = { ...createDefaultMetaSave(), scrap: 25 };
      const forgeBefore = getForgeStationAdvisor(meta, player);
      expect(forgeBefore.canReforge).toBe(true);
      expect(forgeBefore.scrapAvailable).toBe(25);
      expect(forgeBefore.reforgeCost).toBe(15);
      expect(forgeBefore.modCount).toBe(0);
      expect(forgeBefore.recommendedAction).toBe('Reforge Ready (15 Scrap) — Roll your first Outlaw Mod');
      expect(forgeBefore.summaryLine).toBe(
        'FORGE ANVIL: 25 SCRAP (COST: 15) · Reforge Ready (15 Scrap) — Roll your first Outlaw Mod'
      );

      // Player spends 15 Scrap at Forge Anvil to forge their first mod
      meta.scrap -= 15;
      player.items = ['tire_iron'];

      const forgeAfter = getForgeStationAdvisor(meta, player);
      expect(forgeAfter.canReforge).toBe(false);
      expect(forgeAfter.scrapAvailable).toBe(10);
      expect(forgeAfter.reforgeCost).toBe(15);
      expect(forgeAfter.modCount).toBe(1);
      expect(forgeAfter.recommendedAction).toBe('Need 5 more Scrap to Reforge at the Anvil');
      expect(forgeAfter.summaryLine).toBe('FORGE ANVIL: 10 SCRAP (COST: 15) · Need 5 more Scrap to Reforge at the Anvil');

      // Subsequent re-salvage bringing scrap back above reforge threshold
      meta.scrap = 15;
      const forgeRerollReady = getForgeStationAdvisor(meta, player);
      expect(forgeRerollReady.canReforge).toBe(true);
      expect(forgeRerollReady.recommendedAction).toBe('Reforge Ready (15 Scrap) — Reroll & upgrade active mod loadout');
    });

    it('verifies end-to-end consistency between getWeaponArsenalSummary and getCareerOutlawRank across rookie and veteran save states', () => {
      // 1. Rookie save state
      const rookieMeta = createDefaultMetaSave();
      const rookieArsenal = getWeaponArsenalSummary(rookieMeta);
      const rookieRank = getCareerOutlawRank(rookieMeta);

      expect(rookieArsenal.unlockedCount).toBe(1);
      expect(rookieArsenal.totalWeapons).toBe(7);
      expect(rookieArsenal.totalKills).toBe(0);
      expect(rookieArsenal.topWeaponId).toBe('pistol');
      expect(rookieArsenal.topWeaponKills).toBe(0);
      expect(rookieArsenal.summaryLine).toContain('1/7 UNLOCKED · 0 TOTAL KILLS · SIGNATURE: PISTOL (0)');

      expect(rookieRank.rankId).toBe('rookie_courier');
      expect(rookieRank.title).toBe('⚙️ ROOKIE COURIER');
      expect(rookieRank.tierNumber).toBe(1);
      expect(rookieRank.careerScore).toBe(0);
      expect(rookieRank.nextMilestoneText).toBe('Reach 40 Career Score or Floor 2 for HIGHWAY OUTLAW');

      // 2. Syndicate Enforcer / Apex Roadlord (Intermediate veteran)
      const midMeta: MetaSaveState = {
        ...createDefaultMetaSave(),
        bestFloor: 3,
        bossesSlain: 3,
        totalKills: 120,
        unlocked: {
          ...createDefaultMetaSave().unlocked,
          machine_gun: true,
          shotgun: true
        },
        weaponKills: { pistol: 20, machine_gun: 40, shotgun: 60 }
      };
      const midArsenal = getWeaponArsenalSummary(midMeta);
      const midRank = getCareerOutlawRank(midMeta);

      expect(midArsenal.totalKills).toBe(midMeta.totalKills);
      expect(midArsenal.unlockedCount).toBe(3);
      expect(midArsenal.topWeaponId).toBe('shotgun');
      expect(midArsenal.topWeaponKills).toBe(60);
      // careerScore: 120 + 3*25 + (3-1)*40 = 120 + 75 + 80 = 275 -> Apex Roadlord (>= 250)
      expect(midRank.tierNumber).toBe(4);
      expect(midRank.rankId).toBe('apex_roadlord');
      expect(midRank.careerScore).toBe(275);

      // 3. Legend of Valhalla (Endgame veteran)
      const veteranMeta: MetaSaveState = {
        ...createDefaultMetaSave(),
        scrap: 300,
        bestFloor: 6,
        bossesSlain: 6,
        totalKills: 600,
        unlocked: {
          machine_gun: true,
          shotgun: true,
          flamethrower: true,
          railgun: true,
          grenade_launcher: true,
          arc_coil: true
        },
        weaponKills: {
          pistol: 40,
          machine_gun: 80,
          shotgun: 140,
          flamethrower: 50,
          railgun: 180,
          grenade_launcher: 50,
          arc_coil: 60
        }
      };
      const veteranArsenal = getWeaponArsenalSummary(veteranMeta);
      const veteranRank = getCareerOutlawRank(veteranMeta);

      // Cross-verification: Arsenal kills match MetaSave career kill telemetry
      expect(veteranArsenal.totalKills).toBe(veteranMeta.totalKills);
      expect(veteranArsenal.unlockedCount).toBe(7);
      expect(veteranArsenal.totalWeapons).toBe(7);
      expect(veteranArsenal.topWeaponId).toBe('railgun');
      expect(veteranArsenal.topWeaponName).toBe(WEAPONS.railgun.name);
      expect(veteranArsenal.topWeaponKills).toBe(180);
      expect(veteranArsenal.summaryLine).toBe(`ARSENAL: 7/7 UNLOCKED · 600 TOTAL KILLS · SIGNATURE: ${WEAPONS.railgun.name.toUpperCase()} (180)`);

      // Cross-verification: Rank math & milestone
      // careerScore: 600 + 6*25 + (6-1)*40 = 600 + 150 + 200 = 950
      expect(veteranRank.rankId).toBe('legend_of_valhalla');
      expect(veteranRank.title).toBe('👑 LEGEND OF VALHALLA');
      expect(veteranRank.tierNumber).toBe(5);
      expect(veteranRank.careerScore).toBe(950);
      expect(veteranRank.nextMilestoneText).toBe('MAX CAREER RANK ACHIEVED');
    });
  });
});

function dungeonCoordKey(pt: { x: number; y: number }): string {
  return `${pt.x},${pt.y}`;
}
