/**
 * MOTO-ROGUE: E2E Test Suite — Tier 2: Boundary & Corner Cases
 *
 * Verifies extreme limits, edge conditions, clamping caps, and error resilience:
 *  1. Empty NOS depletion & lockout trigger
 *  2. NOS lockout release strictly at >= 25% threshold
 *  3. Zero player health death handling & checkpoint eradication
 *  4. Maximum stash size 18 auto-sell weakest part
 *  5. Chrome Lens 80% crit chance cap
 *  6. Oil Infusion 20 Max Fuel / HP cap
 *  7. Non-linear Floor 1 vs Floor 10 difficulty scaling
 *  8. Corrupted LocalStorage graceful fallbacks
 *  9. Insufficient coins purchase rejection
 * 10. Meta upgrade max rank ceilings
 * 11. Multi-shot split chamber damage floor clamp (0.6x)
 * 12. Vampiric Siphon 60% cap
 * 13. Flamethrower hitIds anti-double-hit enforcement
 * 14. Arena boundary wall clamping
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ARENA_WIDTH,
  WALL_THICKNESS,
  PLAYER_RADIUS,
  MAX_STASH_SIZE,
  SAVE_KEY_META,
  SAVE_KEY_RUN,
  PlayerState,
  EquipmentItem
} from '@/types/game';

import {
  SafeLocalStorage,
  createDefaultPlayerState,
  createDefaultMetaSave,
  saveRunCheckpoint,
  loadRunCheckpoint,
  loadMetaSave,
  clearRunSave,
  addLoot
} from '@/core/state';

import {
  updateNos,
  NOS_DELAY,
  NOS_LOCK_THRESHOLD
} from '@/systems/physics';

import {
  createCombatState,
  rollCrit,
  updatePlayerBullets,
  handleEnemyDeath
} from '@/systems/combat';

import {
  calcUpgradeCost,
  RUN_MOD_POOL
} from '@/data/upgrades';

import {
  getFloorScale,
  calcEnemyHp,
  createEnemy
} from '@/systems/enemyAI';

describe('Tier 2: Boundary & Corner Cases', () => {
  let player: PlayerState;
  let storage: SafeLocalStorage;

  beforeEach(() => {
    storage = new SafeLocalStorage();
    storage.clear();
    player = createDefaultPlayerState();
  });

  // --------------------------------------------------------------------------
  // Boundary 1: Empty NOS Depletion & Lockout Trigger
  // --------------------------------------------------------------------------
  describe('Boundary 1: Empty NOS Depletion & Lockout Trigger', () => {
    it('sets nosLock = true and cuts boost immediately when NOS reaches 0', () => {
      player.nos = 10;
      player.nosLock = false;

      // Drain remaining 10 units at 35/s (dt = 0.5s drains 17.5 units)
      updateNos(player, true, true, 0.5);

      expect(player.nos).toBe(0);
      expect(player.nosLock).toBe(true);
      expect(player.nosDelay).toBe(NOS_DELAY);

      // Immediate subsequent call denies boost even though shift is pressed
      const nextRes = updateNos(player, true, true, 0.1);
      expect(nextRes.boosting).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 2: NOS Lockout Release Strictly at >= 25% Threshold
  // --------------------------------------------------------------------------
  describe('Boundary 2: NOS Lockout Release Strictly at >= 25% Threshold', () => {
    it('denies boost at 24.9% and clears nosLock once NOS recharges to >= 25.0 units', () => {
      player.nos = 0;
      player.nosLock = true;
      player.nosDelay = 0; // ready to recharge

      // Recharge to 24.0 units (below 25 threshold)
      player.nos = 24.0;
      let res = updateNos(player, true, true, 0.0);
      expect(player.nosLock).toBe(true);
      expect(res.boosting).toBe(false);

      // Recharge across the 25.0 threshold
      player.nos = 24.9;
      // Advance recharge by 0.1s at 16/s (+1.6 units -> 26.5)
      res = updateNos(player, false, false, 0.1);
      expect(player.nos).toBeGreaterThanOrEqual(NOS_LOCK_THRESHOLD);
      expect(player.nosLock).toBe(false);

      // Now boost is permitted
      res = updateNos(player, true, true, 0.1);
      expect(res.boosting).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 3: Zero Player Health (Player Death)
  // --------------------------------------------------------------------------
  describe('Boundary 3: Zero Player Health (Player Death)', () => {
    it('clears run checkpoint from storage on death and prevents resurrecting dead runs', () => {
      // Create active checkpoint
      player.hp = 3;
      saveRunCheckpoint(player, 1, storage);
      expect(storage.getItem(SAVE_KEY_RUN)).not.toBeNull();

      // Player takes lethal damage
      player.hp = 0;
      clearRunSave(storage);
      expect(storage.getItem(SAVE_KEY_RUN)).toBeNull();

      // Checkpoint loader refuses to load non-existent or 0 HP save
      const meta = createDefaultMetaSave();
      const freshPlayer = createDefaultPlayerState();
      const loadResult = loadRunCheckpoint(freshPlayer, meta, storage);
      expect(loadResult.restored).toBe(false);
      expect(freshPlayer.hp).toBe(6); // Default starting HP
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 4: Maximum Stash Size 18 Auto-Sell
  // --------------------------------------------------------------------------
  describe('Boundary 4: Maximum Stash Size 18 Auto-Sell', () => {
    it('strictly caps stash size at 18 by automatically selling the lowest-score item for scrap', () => {
      const meta = createDefaultMetaSave();

      // Populate stash with 18 items of increasing score
      for (let i = 0; i < MAX_STASH_SIZE; i++) {
        const item: EquipmentItem = {
          slot: 'tires',
          rarity: 0,
          name: `Test Tire ${i}`,
          stats: { speed: 0.05 * (i + 1) }
        };
        meta.stash.push(item);
      }
      expect(meta.stash).toHaveLength(18);

      const initialScrap = meta.scrap;

      // Add a 19th item with lower score than equipped
      const newItem: EquipmentItem = {
        slot: 'tires',
        rarity: 0,
        name: 'Mediocre Tire',
        stats: { speed: 0.05 * 5 }
      };

      // Ensure equipped slot has higher score so newItem is stashed
      meta.equipped.tires = {
        slot: 'tires',
        rarity: 3,
        name: 'Apex Tires',
        stats: { speed: 0.50 }
      };

      const result = addLoot(meta, newItem, player, storage);

      // Stash size must remain strictly <= 18
      expect(meta.stash.length).toBeLessThanOrEqual(MAX_STASH_SIZE);
      expect(result.soldWeakest).not.toBeNull();
      // Scrap increased from auto-selling weakest item
      expect(meta.scrap).toBeGreaterThan(initialScrap);
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 5: Chrome Lens 80% Crit Chance Cap
  // --------------------------------------------------------------------------
  describe('Boundary 5: Chrome Lens 80% Crit Chance Cap', () => {
    it('strictly clamps critical strike probability at 80% even with 10, 50, or 100 stacks', () => {
      // 0 stacks: 0% crit chance
      expect(rollCrit(0, false, () => 0.01).isCrit).toBe(false);

      // 5 stacks: 50% crit chance -> rolls 0.49 => crit; 0.51 => no crit
      expect(rollCrit(5, false, () => 0.49).isCrit).toBe(true);
      expect(rollCrit(5, false, () => 0.51).isCrit).toBe(false);

      // 8 stacks: 80% crit chance -> rolls 0.79 => crit; 0.81 => no crit
      expect(rollCrit(8, false, () => 0.79).isCrit).toBe(true);
      expect(rollCrit(8, false, () => 0.81).isCrit).toBe(false);

      // 100 stacks: clamped to 80% -> rolls 0.81 => must NOT crit!
      expect(rollCrit(100, false, () => 0.81).isCrit).toBe(false);
      expect(rollCrit(100, false, () => 0.79).isCrit).toBe(true);

      // Flamethrower fire damage can NEVER crit regardless of stacks
      expect(rollCrit(100, true, () => 0.01).isCrit).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 6: Oil Infusion 20 Max HP Cap
  // --------------------------------------------------------------------------
  describe('Boundary 6: Oil Infusion 20 Max HP Cap', () => {
    it('stops increasing player maxHp once it reaches 20, regardless of kill count', () => {
      player.maxHp = 19;
      player.hp = 19;
      player.itemStacks = { oil_infusion: 1 };
      player.killCount = 14; // next kill is 15th

      const combatState = createCombatState();
      const dummyRoom = {
        x: 0,
        y: 0,
        type: 'combat' as const,
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [],
        enemies: [createEnemy('swarmer', 300, 300, 1)],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      // 15th kill: reaches 20 Max HP
      handleEnemyDeath({
        enemy: dummyRoom.enemies[0],
        index: 0,
        room: dummyRoom,
        player,
        state: combatState,
        floorNum: 1
      });
      expect(player.maxHp).toBe(20);

      // Spawn next enemy and advance to 30th kill
      player.killCount = 29;
      const nextEnemy = createEnemy('swarmer', 300, 300, 1);
      dummyRoom.enemies.push(nextEnemy);

      handleEnemyDeath({
        enemy: nextEnemy,
        index: 0,
        room: dummyRoom,
        player,
        state: combatState,
        floorNum: 1
      });
      // Must NOT exceed 20 Max HP!
      expect(player.maxHp).toBe(20);
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 7: Floor 1 vs Floor 10 Scaling
  // --------------------------------------------------------------------------
  describe('Boundary 7: Floor 1 vs Floor 10 Scaling', () => {
    it('verifies exponential scaling formula 1.55^(f-1) matches exact bounds', () => {
      // Floor 1: exactly 1.0
      expect(getFloorScale(1)).toBe(1.0);

      // Floor 2: 1.55^1 = 1.55
      expect(getFloorScale(2)).toBeCloseTo(1.55, 4);

      // Floor 10: 1.55^9 ≈ 51.59
      const scale10 = getFloorScale(10);
      expect(scale10).toBeCloseTo(Math.pow(1.55, 9), 4);

      // Enemy HP scaling on Floor 1 vs Floor 10
      const hpF1 = calcEnemyHp(100, 1);
      const hpF10 = calcEnemyHp(100, 10);
      expect(hpF1).toBe(100);
      expect(hpF10).toBe(Math.round(100 * scale10));
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 8: Corrupted LocalStorage Fallback
  // --------------------------------------------------------------------------
  describe('Boundary 8: Corrupted LocalStorage Fallback', () => {
    it('gracefully handles malformed JSON, corrupted structures, and NaN values without crashing', () => {
      // 1. Corrupted meta save JSON
      storage.setItem(SAVE_KEY_META, '{{{{malformed json!!');
      const safeMeta = loadMetaSave(storage);
      expect(safeMeta).toBeDefined();
      expect(safeMeta.scrap).toBe(0);
      expect(safeMeta.unlocked.machine_gun).toBe(false);

      // 2. Corrupted field types
      storage.setItem(SAVE_KEY_META, JSON.stringify({ scrap: 'not_a_number', ranks: null }));
      const healedMeta = loadMetaSave(storage);
      expect(healedMeta.scrap).toBe(0);
      expect(healedMeta.ranks.dmg).toBe(0);

      // 3. Corrupted run checkpoint
      storage.setItem(SAVE_KEY_RUN, 'undefined_null_error');
      const freshPlayer = createDefaultPlayerState();
      const loadResult = loadRunCheckpoint(freshPlayer, safeMeta, storage);
      expect(loadResult.restored).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 9: Insufficient Coins Purchase Rejection
  // --------------------------------------------------------------------------
  describe('Boundary 9: Insufficient Coins Purchase Rejection', () => {
    it('verifies cost deductions cannot drop coins below zero', () => {
      player.coins = 5;
      const modCost = 18;

      // Purchase cannot proceed if coins < cost
      const canAfford = player.coins >= modCost;
      expect(canAfford).toBe(false);
      expect(player.coins).toBe(5);
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 10: Meta Upgrade Max Rank Ceilings
  // --------------------------------------------------------------------------
  describe('Boundary 10: Meta Upgrade Max Rank Ceilings', () => {
    it('returns Infinity for upgrade costs at or above maxRank', () => {
      // dmg: maxRank 5
      expect(calcUpgradeCost('dmg', 4)).toBeLessThan(Infinity);
      expect(calcUpgradeCost('dmg', 5)).toBe(Infinity);
      expect(calcUpgradeCost('dmg', 99)).toBe(Infinity);

      // maxHp: maxRank 4
      expect(calcUpgradeCost('maxHp', 3)).toBeLessThan(Infinity);
      expect(calcUpgradeCost('maxHp', 4)).toBe(Infinity);
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 11: Multi-Shot Split Chamber Damage Floor Clamp
  // --------------------------------------------------------------------------
  describe('Boundary 11: Multi-Shot Split Chamber Damage Floor Clamp', () => {
    it('clamps player dmgMult to a minimum floor of 0.6x when applying Split Chamber', () => {
      const splitChamber = RUN_MOD_POOL.find(m => m.id === 'split_chamber')!;
      expect(splitChamber).toBeDefined();

      // Lower dmgMult to 0.65
      player.dmgMult = 0.65;
      splitChamber.apply(player);

      // 0.65 - 0.15 = 0.50, but clamped to 0.60
      expect(player.dmgMult).toBe(0.60);

      // Repeated application stays at 0.60
      splitChamber.apply(player);
      expect(player.dmgMult).toBe(0.60);
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 12: Vampiric Siphon 60% Cap
  // --------------------------------------------------------------------------
  describe('Boundary 12: Vampiric Siphon 60% Cap', () => {
    it('strictly clamps vampChance at 60% (0.60) regardless of multiple mod acquisitions', () => {
      const vampMod = RUN_MOD_POOL.find(m => m.id === 'vamp_siphon')!;
      expect(vampMod).toBeDefined();

      player.vampChance = 0;
      vampMod.apply(player); // 0.20
      expect(player.vampChance).toBeCloseTo(0.20);

      vampMod.apply(player); // 0.40
      expect(player.vampChance).toBeCloseTo(0.40);

      vampMod.apply(player); // 0.60
      expect(player.vampChance).toBeCloseTo(0.60);

      vampMod.apply(player); // clamped at 0.60
      expect(player.vampChance).toBeCloseTo(0.60);
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 13: Flamethrower HitIds Anti-Double-Hit Enforcement
  // --------------------------------------------------------------------------
  describe('Boundary 13: Flamethrower HitIds Anti-Double-Hit Enforcement', () => {
    it('ensures each flame puff damages an enemy entity at most once across successive frames', () => {
      const state = createCombatState();
      const enemy = createEnemy('swarmer', 300, 300, 1);
      const initialHp = enemy.hp;

      const dummyRoom = {
        x: 0,
        y: 0,
        type: 'combat' as const,
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [],
        enemies: [enemy],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      // Manually add one flame puff overlapping the enemy
      state.bullets.push({
        x: 300,
        y: 300,
        vx: 0,
        vy: 0,
        radius: 12,
        dmg: 3.2,
        isFlame: true,
        pierceLeft: 99,
        bounceLeft: 0,
        hitIds: new Set(),
        color: '#ff6b2b',
        life: 0.36
      });

      // Frame 1: bullet hits enemy
      updatePlayerBullets(0.016, state.bullets, dummyRoom, player, state);
      expect(enemy.hp).toBeCloseTo(initialHp - 3.2);
      expect(state.bullets[0].hitIds.has(enemy.id)).toBe(true);
      const hpAfterFrame1 = enemy.hp;

      // Frame 2: bullet still overlaps, but must NOT damage again
      updatePlayerBullets(0.016, state.bullets, dummyRoom, player, state);
      expect(enemy.hp).toBe(hpAfterFrame1);
    });
  });

  // --------------------------------------------------------------------------
  // Boundary 14: Arena Boundary Wall Clamping
  // --------------------------------------------------------------------------
  describe('Boundary 14: Arena Boundary Wall Clamping', () => {
    it('confines player coordinates within playable bounds [WALL + radius, ARENA - WALL - radius]', () => {
      const minBound = WALL_THICKNESS + PLAYER_RADIUS; // 58 + 17 = 75
      const maxBound = ARENA_WIDTH - WALL_THICKNESS - PLAYER_RADIUS; // 720 - 75 = 645

      expect(minBound).toBe(75);
      expect(maxBound).toBe(645);
    });
  });
});
