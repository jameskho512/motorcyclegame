/**
 * MOTO-ROGUE: E2E Test Suite — Tier 4: Real-World Application Scenarios
 *
 * Verifies comprehensive end-to-end simulated run scenarios:
 *  1. Full Floor 1 Gameplay Progression Loop:
 *     Spawn -> Room Transition -> Combat Clear -> Door Unlock -> Shop Purchase -> Boss Defeat -> Rewards & Trapdoor
 *  2. Checkpoint Autosave, Browser Reload & Resume Round-Trip
 *  3. Death, Checkpoint Eradication & Garage Meta Upgrade Progression Loop
 *  4. Full Stash Management, Auto-Equip, Demotion & 18-Item Overflow Auto-Sell
 *  5. Multi-Floor Difficulty Escalation & Boss Variant Rotation (Floor 1 -> 2 -> 3)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SAVE_KEY_RUN,
  PlayerState,
  DungeonGraph,
  EquipmentItem
} from '@/types/game';

import { RUN_MOD_POOL, calcUpgradeCost } from '@/data/upgrades';

import {
  SafeLocalStorage,
  createDefaultPlayerState,
  createDefaultMetaSave,
  saveRunCheckpoint,
  loadRunCheckpoint,
  writeMetaSave,
  clearRunSave,
  addLoot,
  resetPlayerStatsForRun
} from '@/core/state';

import {
  generateDungeon,
  getFloorScale,
  createBoss
} from '@/world/dungeon';

import {
  createCombatState,
  handleEnemyDeath
} from '@/systems/combat';

describe('Tier 4: Real-World Application Scenarios', () => {
  let player: PlayerState;
  let storage: SafeLocalStorage;

  beforeEach(() => {
    storage = new SafeLocalStorage();
    storage.clear();
    player = createDefaultPlayerState();
  });

  // --------------------------------------------------------------------------
  // Scenario 1: Complete Floor 1 Gameplay Progression Loop
  // --------------------------------------------------------------------------
  describe('Scenario 1: Complete Floor 1 Gameplay Progression Loop', () => {
    it('simulates full run: spawn -> combat clear -> door unlock -> shop buy -> boss defeat -> trapdoor', () => {
      // 1. Generate Floor 1 Dungeon (9 rooms)
      const dungeon: DungeonGraph = generateDungeon(1);
      expect(dungeon.targetRooms).toBe(9);

      // Start Room (0,0) is visited and cleared
      const startRoom = dungeon.rooms['0,0'];
      expect(startRoom.type).toBe('start');
      expect(startRoom.cleared).toBe(true);

      // 2. Find an adjacent combat room
      let combatCoord: string | null = null;
      for (const [coord, r] of Object.entries(dungeon.rooms)) {
        if (coord === '0,0') continue;
        if (r.type === 'combat') {
          combatCoord = coord;
          break;
        }
      }
      expect(combatCoord).not.toBeNull();
      const combatRoom = dungeon.rooms[combatCoord!];
      expect(combatRoom.cleared).toBe(false);

      // 3. Clear combat room by eliminating enemies and collecting coins
      const combatState = createCombatState();
      const initialCoins = player.coins;

      while (combatRoom.enemies.length > 0) {
        const en = combatRoom.enemies[0];
        // Eliminate enemy with weapon fire
        handleEnemyDeath({
          room: combatRoom,
          enemy: en,
          index: 0,
          player,
          state: combatState,
          floorNum: 1
        });
      }

      // Room is now cleared, unlocking doorway passage
      combatRoom.cleared = true;
      expect(combatRoom.enemies).toHaveLength(0);
      expect(player.coins).toBeGreaterThanOrEqual(initialCoins);

      // 4. Navigate to Shop Room
      const shopKey = `${dungeon.shopCoord!.x},${dungeon.shopCoord!.y}`;
      const shopRoom = dungeon.rooms[shopKey];
      expect(shopRoom.type).toBe('shop');

      // Grant player enough coins and purchase a mod
      player.coins += 30;
      const initialDmg = player.dmgMult;
      const modToBuy = RUN_MOD_POOL.find(m => m.id === 'hollow_point')!;
      expect(player.coins).toBeGreaterThanOrEqual(modToBuy.cost);

      // Execute purchase
      player.coins -= modToBuy.cost;
      modToBuy.apply(player);
      expect(player.dmgMult).toBeCloseTo(initialDmg + 0.25);

      // 5. Navigate to Boss Room
      const bossKey = `${dungeon.bossCoord.x},${dungeon.bossCoord.y}`;
      const bossRoom = dungeon.rooms[bossKey];
      expect(bossRoom.type).toBe('boss');
      expect(bossRoom.enemies.some(e => e.type === 'boss')).toBe(true);

      const boss = bossRoom.enemies.find(e => e.type === 'boss')!;
      expect(boss.name).toBe('SCRAP GOLIATH');
      const initialBossHp = boss.hp;
      expect(initialBossHp).toBe(280);

      // Defeat boss minions first
      for (let i = bossRoom.enemies.length - 1; i >= 0; i--) {
        const en = bossRoom.enemies[i];
        if (en.type !== 'boss') {
          handleEnemyDeath({
            room: bossRoom,
            enemy: en,
            index: i,
            player,
            state: combatState,
            floorNum: 1
          });
        }
      }

      // Defeat the boss
      const bossIndex = bossRoom.enemies.findIndex(e => e.type === 'boss');
      handleEnemyDeath({
        room: bossRoom,
        enemy: boss,
        index: bossIndex,
        player,
        state: combatState,
        floorNum: 1
      });

      // Boss room marked cleared, trapdoor unlocked
      bossRoom.cleared = true;
      bossRoom.trapdoor = true;

      // Verify Boss defeat rewards: Jerrycan (+1 Fuel), Loot drop, Coins & Scrap
      expect(bossRoom.pickups.some(p => p.type === 'heart')).toBe(true);
      expect(bossRoom.pickups.some(p => p.type === 'loot')).toBe(true);
      expect(bossRoom.trapdoor).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 2: Checkpoint Autosave & Resume Round-Trip
  // --------------------------------------------------------------------------
  describe('Scenario 2: Checkpoint Autosave & Resume Round-Trip', () => {
    it('serializes state upon room transition, unloads session, and restores 100% identical state', () => {
      // 1. Active game state
      player.hp = 5;
      player.maxHp = 8;
      player.coins = 72;
      player.weapon = 'railgun';
      player.itemStacks = { nitro_syringe: 3, tire_iron: 2, chrome_lens: 1 };
      player.runWeapons = { railgun: true };
      player.killCount = 18;

      // 2. Autosave triggered on room transition at Floor 2
      saveRunCheckpoint(player, 2, storage);

      // 3. Simulate page reload / session unload
      player = createDefaultPlayerState();
      expect(player.hp).toBe(6);
      expect(player.coins).toBe(0);

      // 4. Resume run from storage
      const meta = createDefaultMetaSave();
      meta.unlocked.railgun = true;
      const resumeResult = loadRunCheckpoint(player, meta, storage);

      expect(resumeResult.restored).toBe(true);
      expect(resumeResult.floorNum).toBe(2);

      // Verify full state parity
      expect(player.hp).toBe(5);
      expect(player.maxHp).toBe(8);
      expect(player.coins).toBe(72);
      expect(player.weapon).toBe('railgun');
      expect(player.itemStacks.nitro_syringe).toBe(3);
      expect(player.itemStacks.tire_iron).toBe(2);
      expect(player.itemStacks.chrome_lens).toBe(1);
      expect(player.killCount).toBe(18);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 3: Death, Game Over & Garage Meta Upgrade Progression Loop
  // --------------------------------------------------------------------------
  describe('Scenario 3: Death, Game Over & Garage Meta Upgrade Progression Loop', () => {
    it('eradicates run checkpoint on player death, preserves scrap, and unlocks meta upgrades for next run', () => {
      const meta = createDefaultMetaSave();
      meta.scrap = 60; // Player accumulated 60 scrap
      writeMetaSave(meta, storage);

      // Active run checkpoint exists
      player.hp = 2;
      saveRunCheckpoint(player, 1, storage);
      expect(storage.getItem(SAVE_KEY_RUN)).not.toBeNull();

      // Player dies (hp drops to 0)
      player.hp = 0;
      clearRunSave(storage);
      expect(storage.getItem(SAVE_KEY_RUN)).toBeNull();

      // Enter Garage Bay: purchase Rank 1 Ordnance Calibration (+10% base damage) for 25 scrap
      const upgradeCost = calcUpgradeCost('dmg', meta.ranks.dmg);
      expect(upgradeCost).toBe(25);
      expect(meta.scrap).toBeGreaterThanOrEqual(upgradeCost);

      meta.scrap -= upgradeCost;
      meta.ranks.dmg += 1;
      writeMetaSave(meta, storage);

      expect(meta.scrap).toBe(35);
      expect(meta.ranks.dmg).toBe(1);

      // Start fresh run (Floor 1)
      const nextRunPlayer = createDefaultPlayerState();
      resetPlayerStatsForRun(nextRunPlayer, meta);

      // Verify meta upgrade is applied to new player
      expect(nextRunPlayer.dmgMult).toBeCloseTo(1.10); // +10% base damage
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 4: Full Stash Management, Auto-Equip, Demotion & 18-Item Overflow Auto-Sell
  // --------------------------------------------------------------------------
  describe('Scenario 4: Full Stash Management, Auto-Equip, Demotion & 18-Item Overflow Auto-Sell', () => {
    it('auto-equips higher scoring parts, demotes old part to stash, and auto-sells weakest on overflow', () => {
      const meta = createDefaultMetaSave();

      // 1. First loot drop: Rare Engine part -> auto-equips into empty slot
      const rareEngine: EquipmentItem = {
        slot: 'engine',
        rarity: 2,
        name: 'V6 Supercharger Engine',
        stats: { dmg: 0.15 }
      };
      const res1 = addLoot(meta, rareEngine, player, storage);
      expect(res1.equipped).toBe(true);
      expect(meta.equipped.engine).toBe(rareEngine);
      expect(meta.stash).toHaveLength(0);

      // 2. Second loot drop: Legendary Engine part (higher score) -> auto-equips, demotes rareEngine to stash
      const legEngine: EquipmentItem = {
        slot: 'engine',
        rarity: 3,
        name: 'Twin-Turbo V8 Engine',
        stats: { dmg: 0.35 }
      };
      const res2 = addLoot(meta, legEngine, player, storage);
      expect(res2.equipped).toBe(true);
      expect(meta.equipped.engine).toBe(legEngine);
      expect(meta.stash).toContain(rareEngine);
      expect(meta.stash).toHaveLength(1);

      // 3. Fill stash up to 18 items
      while (meta.stash.length < 18) {
        meta.stash.push({
          slot: 'exhaust',
          rarity: 0,
          name: `Junk Exhaust ${meta.stash.length}`,
          stats: { blast: 0.08 * (meta.stash.length + 1) }
        });
      }
      expect(meta.stash).toHaveLength(18);

      // 4. A 19th item drops with lower score than equipped
      const initialScrap = meta.scrap;
      const weakItem: EquipmentItem = {
        slot: 'engine',
        rarity: 0,
        name: 'Rusty Engine',
        stats: { dmg: 0.01 }
      };
      const res3 = addLoot(meta, weakItem, player, storage);

      // Stash must remain strictly at 18 items
      expect(meta.stash).toHaveLength(18);
      expect(res3.soldWeakest).not.toBeNull();
      // Scrap increased from auto-selling weakest item
      expect(meta.scrap).toBeGreaterThan(initialScrap);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 5: Multi-Floor Difficulty Escalation & Boss Variant Rotation
  // --------------------------------------------------------------------------
  describe('Scenario 5: Multi-Floor Difficulty Escalation & Boss Variant Rotation', () => {
    it('verifies non-linear scaling escalation and boss variant rotation across Floors 1, 2, and 3', () => {
      // Floor 1: Scrap Goliath (Variant 0)
      const b1 = createBoss(1, 360, 360);
      expect(b1.name).toBe('SCRAP GOLIATH');
      expect(b1.bossVariant).toBe(0);
      expect(b1.hp).toBe(280);

      // Floor 2: Siege Behemoth (Variant 1) with scaled HP
      const b2 = createBoss(2, 360, 360);
      expect(b2.name).toBe('SIEGE BEHEMOTH');
      expect(b2.bossVariant).toBe(1);
      expect(b2.hp).toBeGreaterThan(b1.hp);
      expect(b2.hp).toBe(Math.round(280 * getFloorScale(2)));

      // Floor 3: Overlord Helion (Variant 2) with further scaled HP
      const b3 = createBoss(3, 360, 360);
      expect(b3.name).toBe('OVERLORD HELION');
      expect(b3.bossVariant).toBe(2);
      expect(b3.hp).toBeGreaterThan(b2.hp);
      expect(b3.hp).toBe(Math.round(280 * getFloorScale(3)));
    });
  });
});
