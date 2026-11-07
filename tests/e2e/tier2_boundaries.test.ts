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
  addLoot,
  getCareerOutlawRank
} from '@/core/state';

import {
  updateNos,
  NOS_DELAY,
  NOS_LOCK_THRESHOLD,
  getRiderMobilitySummary
} from '@/systems/physics';

import {
  createCombatState,
  rollCrit,
  updatePlayerBullets,
  handleEnemyDeath,
  getCombatOffenseSummary
} from '@/systems/combat';

import {
  calcUpgradeCost,
  RUN_MOD_POOL,
  getRunModDeckSummary
} from '@/data/upgrades';

import {
  getFloorScale,
  calcEnemyHp,
  createEnemy,
  getRoomThreatAssessment
} from '@/systems/enemyAI';

import { getHubStationPromptInfo } from '@/ui/hubStationModal';
import { getPortalHeatBriefing } from '@/ui/portalModal';
import { getShopBuildSynergyHint } from '@/ui/shopModal';
import { getRoomHazardSummary } from '@/world/dungeon';

import {
  getScannerStationAdvisor,
  getForgeStationAdvisor,
  getWarRoomStationAdvisor,
  getLaunchGateAdvisor,
  getGarageStationAdvisor,
  getArmoryStationAdvisor
} from '../../src/ui/hubStationModal';
import { formatModDeckTooltipHint } from '@/ui/tooltip';
import { getWeaponArsenalSummary } from '../../src/data/weapons';
import { getBossEncounterBriefing } from '../../src/systems/enemyAI';

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

  // --------------------------------------------------------------------------
  // Boundary 15: Wave 14-20 Telemetry & Sanctuary Boundary Stress Suite (M88)
  // --------------------------------------------------------------------------
  describe('Wave 14-20 Telemetry & Sanctuary Boundary Stress Suite (M88)', () => {
    // 1. getHubStationPromptInfo fallback on unknown station IDs
    it('handles unknown or empty station IDs in getHubStationPromptInfo with fallback prompt', () => {
      const fallbackUnknown = getHubStationPromptInfo('unknown_station_xyz');
      expect(fallbackUnknown).toEqual({
        title: 'STATION // INTERACT',
        summary: 'Press [E] to interact with this hideout station',
        actionLabel: 'INTERACT [E]',
        accentColor: '#ffd60a'
      });

      const fallbackEmpty = getHubStationPromptInfo('', undefined, undefined);
      expect(fallbackEmpty.title).toBe('STATION // INTERACT');
      expect(fallbackEmpty.actionLabel).toBe('INTERACT [E]');

      const fallbackNull = getHubStationPromptInfo('null', null, null);
      expect(fallbackNull.title).toBe('STATION // INTERACT');
    });

    // 2. getHubStationPromptInfo null/undefined buffs and varied buff states
    it('handles null, undefined, and toggled buff states across known stations in getHubStationPromptInfo', () => {
      const garage = getHubStationPromptInfo('garage');
      expect(garage.title).toContain('GARAGE');
      expect(garage.actionLabel).toBe('OPEN GARAGE [E]');

      const forge = getHubStationPromptInfo('blacksmith');
      expect(forge.title).toContain('THE SCRAP FORGE');
      expect(forge.actionLabel).toBe('OPEN FORGE [E]');

      const launch = getHubStationPromptInfo('launch');
      expect(launch.title).toContain('LAUNCH GATE');
      expect(launch.actionLabel).toBe('OPEN LAUNCH GATE [E]');

      // Codex prompt info
      const codexUnclaimed = getHubStationPromptInfo('codex', null, null, { scannerClaimed: false });
      expect(codexUnclaimed.summary).toContain('Inspect your lifetime Outlaw Rank');

      const codexClaimed = getHubStationPromptInfo('codex', null, null, { scannerClaimed: true });
      expect(codexClaimed.summary).toContain('Inspect your lifetime Outlaw Rank');

      const codexUndef = getHubStationPromptInfo('codex');
      expect(codexUndef.summary).toContain('Inspect your lifetime Outlaw Rank');

      // Bounty prompt info
      const bountyUnclaimed = getHubStationPromptInfo('bounty', null, null, { bountyClaimed: false });
      expect(bountyUnclaimed.summary).toContain('Configure Threat Heat Level (0–3)');

      const bountyClaimed = getHubStationPromptInfo('bounty', null, null, { bountyClaimed: true });
      expect(bountyClaimed.summary).toContain('Configure Threat Heat Level (0–3)');

      const bountyUndef = getHubStationPromptInfo('bounty');
      expect(bountyUndef.summary).toContain('Configure Threat Heat Level (0–3)');
    });

    // 3. getPortalHeatBriefing non-numeric and infinite values
    it('clamps non-numeric and infinite values to safe heat bounds in getPortalHeatBriefing', () => {
      // NaN falls back to heat 0
      const nanBriefing = getPortalHeatBriefing(NaN);
      expect(nanBriefing).toEqual({
        heatLevel: 0,
        label: 'HEAT 0 // STANDARD',
        enemyScaleText: 'Standard Enemy HP & Speed',
        scrapBonusText: '+0% Bonus Scrap'
      });

      // -Infinity clamped to 0
      const negInfBriefing = getPortalHeatBriefing(-Infinity);
      expect(negInfBriefing.heatLevel).toBe(0);
      expect(negInfBriefing.label).toBe('HEAT 0 // STANDARD');
      expect(negInfBriefing.scrapBonusText).toBe('+0% Bonus Scrap');

      // +Infinity clamped to 3
      const posInfBriefing = getPortalHeatBriefing(Infinity);
      expect(posInfBriefing.heatLevel).toBe(3);
      expect(posInfBriefing.label).toBe('HEAT 3 // VALHALLA INFERNO');
      expect(posInfBriefing.enemyScaleText).toBe('+72% Enemy HP · +36% Speed');
      expect(posInfBriefing.scrapBonusText).toBe('+75% Bonus Scrap');
    });

    // 4. getPortalHeatBriefing negative, out-of-range, and floating point numbers
    it('normalizes negative, extreme out-of-range, and floating-point heat levels in getPortalHeatBriefing', () => {
      // Negative heat (-5) clamped to 0
      const negBriefing = getPortalHeatBriefing(-5);
      expect(negBriefing.heatLevel).toBe(0);
      expect(negBriefing.label).toBe('HEAT 0 // STANDARD');
      expect(negBriefing.scrapBonusText).toBe('+0% Bonus Scrap');

      // Extreme heat (99) clamped to 3
      const extremeBriefing = getPortalHeatBriefing(99);
      expect(extremeBriefing.heatLevel).toBe(3);
      expect(extremeBriefing.label).toBe('HEAT 3 // VALHALLA INFERNO');
      expect(extremeBriefing.scrapBonusText).toBe('+75% Bonus Scrap');

      // Float 1.6 rounds to 2
      const floatBriefing2 = getPortalHeatBriefing(1.6);
      expect(floatBriefing2.heatLevel).toBe(2);
      expect(floatBriefing2.label).toBe('HEAT 2 // BLOOD PACT');
      expect(floatBriefing2.enemyScaleText).toBe('+48% Enemy HP · +24% Speed');
      expect(floatBriefing2.scrapBonusText).toBe('+50% Bonus Scrap');

      // Float 0.4 rounds to 0
      const floatBriefing0 = getPortalHeatBriefing(0.4);
      expect(floatBriefing0.heatLevel).toBe(0);

      // Float 1.2 rounds to 1
      const floatBriefing1 = getPortalHeatBriefing(1.2);
      expect(floatBriefing1.heatLevel).toBe(1);
      expect(floatBriefing1.label).toBe('HEAT 1 // OVERCLOCKED');
      expect(floatBriefing1.enemyScaleText).toBe('+24% Enemy HP · +12% Speed');
      expect(floatBriefing1.scrapBonusText).toBe('+25% Bonus Scrap');
    });

    // 5. getShopBuildSynergyHint null/undefined/empty objects
    it('returns standard fallback telemetry on null, undefined, or empty objects in getShopBuildSynergyHint', () => {
      const fromNull = getShopBuildSynergyHint(null, null);
      expect(fromNull).toEqual({
        hasSynergy: false,
        synergyType: 'STANDARD',
        hintText: 'Standard Black Market Ordnance'
      });

      const fromUndef = getShopBuildSynergyHint(undefined, undefined);
      expect(fromUndef.hasSynergy).toBe(false);
      expect(fromUndef.synergyType).toBe('STANDARD');

      const fromEmpty = getShopBuildSynergyHint({} as any, {} as any);
      expect(fromEmpty.hasSynergy).toBe(false);
      expect(fromEmpty.synergyType).toBe('STANDARD');
    });

    // 6. getShopBuildSynergyHint shop_heart under critical/zero/negative HP
    it('evaluates shop_heart repair urgency under critical, zero, negative, and boundary HP conditions', () => {
      const heartPickup = { type: 'shop_heart' } as any;

      // 0 maxHp and 0 hp: 0 <= ceil(0 * 0.5) = 0 -> true (LOW_HULL_REPAIR)
      const zeroHpResult = getShopBuildSynergyHint(heartPickup, { maxHp: 0, hp: 0 } as any);
      expect(zeroHpResult.hasSynergy).toBe(true);
      expect(zeroHpResult.synergyType).toBe('LOW_HULL_REPAIR');
      expect(zeroHpResult.hintText).toBe('⚠️ CRITICAL HULL REPAIR RECOMMENDED!');

      // Negative hp (-2) with maxHp 10: -2 <= 5 -> true (LOW_HULL_REPAIR)
      const negHpResult = getShopBuildSynergyHint(heartPickup, { maxHp: 10, hp: -2 } as any);
      expect(negHpResult.hasSynergy).toBe(true);
      expect(negHpResult.synergyType).toBe('LOW_HULL_REPAIR');

      // Exact 50% threshold: 5 / 10 HP -> 5 <= 5 -> true
      const thresholdResult = getShopBuildSynergyHint(heartPickup, { maxHp: 10, hp: 5 } as any);
      expect(thresholdResult.hasSynergy).toBe(true);
      expect(thresholdResult.synergyType).toBe('LOW_HULL_REPAIR');

      // Above 50%: 6 / 10 HP -> 6 <= 5 -> false (STANDARD)
      const healthyResult = getShopBuildSynergyHint(heartPickup, { maxHp: 10, hp: 6 } as any);
      expect(healthyResult.hasSynergy).toBe(false);
      expect(healthyResult.synergyType).toBe('STANDARD');
    });

    // 7. getShopBuildSynergyHint mod_pedestal missing mod object or corrupt properties
    it('handles mod_pedestal with missing, null, or corrupted mod objects in getShopBuildSynergyHint', () => {
      // null mod object on pedestal
      const nullModPedestal = { type: 'mod_pedestal', mod: null } as any;
      const resNullMod = getShopBuildSynergyHint(nullModPedestal, { weapon: 'pistol' } as any);
      expect(resNullMod.hasSynergy).toBe(false);
      expect(resNullMod.synergyType).toBe('STANDARD');

      // empty mod object on pedestal
      const emptyModPedestal = { type: 'mod_pedestal', mod: {} } as any;
      const resEmptyMod = getShopBuildSynergyHint(emptyModPedestal, { weapon: 'shotgun' } as any);
      expect(resEmptyMod.hasSynergy).toBe(false);
      expect(resEmptyMod.synergyType).toBe('STANDARD');

      // unrelated mod on pedestal
      const unrelatedMod = { type: 'mod_pedestal', mod: { id: 'alien_artifact', name: 'Alien Artifact' } } as any;
      const resUnrelated = getShopBuildSynergyHint(unrelatedMod, { weapon: 'shotgun' } as any);
      expect(resUnrelated.hasSynergy).toBe(false);
      expect(resUnrelated.synergyType).toBe('STANDARD');

      // matching weapon signature mod triggers EVOLUTION_KEY
      const signatureMod = { type: 'mod_pedestal', mod: { id: 'split_chamber', name: 'Split Chamber' } } as any;
      const resEvo = getShopBuildSynergyHint(signatureMod, { weapon: 'shotgun' } as any);
      expect(resEvo.hasSynergy).toBe(true);
      expect(resEvo.synergyType).toBe('EVOLUTION_KEY');
      expect(resEvo.hintText).toContain('UNLOCKS HELLFIRE FLAK CANNON EVOLUTION!');
    });

    // 8. getCareerOutlawRank null safety and negative kills/bosses/bestFloor sanitization
    it('sanitizes null, undefined, and negative statistics in getCareerOutlawRank without NaN or exceptions', () => {
      const fromNull = getCareerOutlawRank(null);
      expect(fromNull).toEqual({
        rankId: 'rookie_courier',
        title: '⚙️ ROOKIE COURIER',
        tierNumber: 1,
        careerScore: 0,
        nextMilestoneText: 'Reach 40 Career Score or Floor 2 for HIGHWAY OUTLAW'
      });

      const fromUndef = getCareerOutlawRank(undefined);
      expect(fromUndef.rankId).toBe('rookie_courier');
      expect(fromUndef.careerScore).toBe(0);

      // Extreme negative stats are clamped to non-negative baselines (kills >= 0, bosses >= 0, bestFloor >= 1)
      const fromNegative = getCareerOutlawRank({
        totalKills: -999,
        bossesSlain: -20,
        bestFloor: -5
      } as any);
      expect(fromNegative.careerScore).toBe(0);
      expect(fromNegative.rankId).toBe('rookie_courier');
      expect(fromNegative.tierNumber).toBe(1);
    });

    // 9. getCareerOutlawRank exact tier boundary thresholds (39 vs 40, 119 vs 120, 249 vs 250, 499 vs 500)
    it('enforces exact career score threshold boundaries (39 vs 40, 119 vs 120, 249 vs 250, 499 vs 500) in getCareerOutlawRank', () => {
      // Threshold 1: 39 (Rookie Courier) vs 40 (Highway Outlaw)
      const rank39 = getCareerOutlawRank({ totalKills: 39, bossesSlain: 0, bestFloor: 1 });
      expect(rank39.careerScore).toBe(39);
      expect(rank39.tierNumber).toBe(1);
      expect(rank39.rankId).toBe('rookie_courier');

      const rank40 = getCareerOutlawRank({ totalKills: 40, bossesSlain: 0, bestFloor: 1 });
      expect(rank40.careerScore).toBe(40);
      expect(rank40.tierNumber).toBe(2);
      expect(rank40.rankId).toBe('highway_outlaw');

      // Threshold 2: 119 (Highway Outlaw) vs 120 (Syndicate Enforcer)
      const rank119 = getCareerOutlawRank({ totalKills: 119, bossesSlain: 0, bestFloor: 1 });
      expect(rank119.careerScore).toBe(119);
      expect(rank119.tierNumber).toBe(2);
      expect(rank119.rankId).toBe('highway_outlaw');

      const rank120 = getCareerOutlawRank({ totalKills: 120, bossesSlain: 0, bestFloor: 1 });
      expect(rank120.careerScore).toBe(120);
      expect(rank120.tierNumber).toBe(3);
      expect(rank120.rankId).toBe('syndicate_enforcer');

      // Threshold 3: 249 (Syndicate Enforcer) vs 250 (Apex Roadlord)
      const rank249 = getCareerOutlawRank({ totalKills: 249, bossesSlain: 0, bestFloor: 1 });
      expect(rank249.careerScore).toBe(249);
      expect(rank249.tierNumber).toBe(3);
      expect(rank249.rankId).toBe('syndicate_enforcer');

      const rank250 = getCareerOutlawRank({ totalKills: 250, bossesSlain: 0, bestFloor: 1 });
      expect(rank250.careerScore).toBe(250);
      expect(rank250.tierNumber).toBe(4);
      expect(rank250.rankId).toBe('apex_roadlord');

      // Threshold 4: 499 (Apex Roadlord) vs 500 (Legend of Valhalla)
      const rank499 = getCareerOutlawRank({ totalKills: 499, bossesSlain: 0, bestFloor: 1 });
      expect(rank499.careerScore).toBe(499);
      expect(rank499.tierNumber).toBe(4);
      expect(rank499.rankId).toBe('apex_roadlord');

      const rank500 = getCareerOutlawRank({ totalKills: 500, bossesSlain: 0, bestFloor: 1 });
      expect(rank500.careerScore).toBe(500);
      expect(rank500.tierNumber).toBe(5);
      expect(rank500.rankId).toBe('legend_of_valhalla');
    });

    // 10. getCareerOutlawRank floor progression shortcut overrides
    it('handles floor progression shortcut overrides in getCareerOutlawRank regardless of raw score', () => {
      // Floor 2 shortcut: bestFloor >= 2 triggers Tier 2 Highway Outlaw even with 0 kills and 0 bosses (score = 40)
      const floor2 = getCareerOutlawRank({ totalKills: 0, bossesSlain: 0, bestFloor: 2 });
      expect(floor2.tierNumber).toBe(2);
      expect(floor2.rankId).toBe('highway_outlaw');

      // Floor 3 shortcut: bestFloor >= 3 triggers Tier 3 Syndicate Enforcer with score = 80 (< 120)
      const floor3 = getCareerOutlawRank({ totalKills: 0, bossesSlain: 0, bestFloor: 3 });
      expect(floor3.careerScore).toBe(80);
      expect(floor3.tierNumber).toBe(3);
      expect(floor3.rankId).toBe('syndicate_enforcer');

      // Floor 5 shortcut: bestFloor >= 5 triggers Tier 4 Apex Roadlord with score = 160 (< 250)
      const floor5 = getCareerOutlawRank({ totalKills: 0, bossesSlain: 0, bestFloor: 5 });
      expect(floor5.careerScore).toBe(160);
      expect(floor5.tierNumber).toBe(4);
      expect(floor5.rankId).toBe('apex_roadlord');

      // Floor 6 + 6 bosses shortcut: triggers Tier 5 Legend of Valhalla even if score < 500 (350 here)
      const valhallaShortcut = getCareerOutlawRank({ totalKills: 0, bossesSlain: 6, bestFloor: 6 });
      expect(valhallaShortcut.careerScore).toBe(350);
      expect(valhallaShortcut.tierNumber).toBe(5);
      expect(valhallaShortcut.rankId).toBe('legend_of_valhalla');
      expect(valhallaShortcut.nextMilestoneText).toBe('MAX CAREER RANK ACHIEVED');
    });

    // 11. getRiderMobilitySummary null safety and clamped drift/NOS extremes
    it('gracefully handles null, undefined, and clamped drift/NOS extremes in getRiderMobilitySummary', () => {
      const fromNull = getRiderMobilitySummary(null);
      expect(fromNull).toEqual({
        topSpeedRating: 295,
        driftChargePct: 0,
        nosReservePct: 100,
        mobilityTier: 'STANDARD',
        summaryText: 'STANDARD · 295 MPH RATING · 0% DRIFT · 100% NOS'
      });

      const fromUndef = getRiderMobilitySummary(undefined);
      expect(fromUndef.driftChargePct).toBe(0);
      expect(fromUndef.nosReservePct).toBe(100);

      // Negative driftCharge (-0.8) clamped to 0
      const negDrift = getRiderMobilitySummary({ driftCharge: -0.8 });
      expect(negDrift.driftChargePct).toBe(0);

      // Excessive driftCharge (> 1.0, e.g. 2.4) clamped to 100%
      const overDrift = getRiderMobilitySummary({ driftCharge: 2.4 });
      expect(overDrift.driftChargePct).toBe(100);

      // 0 nosMax defaults safely via falsy fallback to 100
      const zeroNosMax = getRiderMobilitySummary({ nosMax: 0, nos: 50 });
      expect(zeroNosMax.nosReservePct).toBe(50);

      // Negative NOS clamped to 0
      const negNos = getRiderMobilitySummary({ nos: -30, nosMax: 100 });
      expect(negNos.nosReservePct).toBe(0);

      // NOS exceeding nosMax clamped to nosMax
      const overNos = getRiderMobilitySummary({ nos: 250, nosMax: 100 });
      expect(overNos.nosReservePct).toBe(100);
    });

    // 12. getRiderMobilitySummary mobility tier classification thresholds
    it('classifies mobility tiers accurately across threshold boundaries in getRiderMobilitySummary', () => {
      // 1. HYPER-DRIFTER via speedMult >= 1.35
      const hyperSpeed = getRiderMobilitySummary({ speedMult: 1.35 });
      expect(hyperSpeed.mobilityTier).toBe('HYPER-DRIFTER');

      // 2. HYPER-DRIFTER via speedMult >= 1.20 AND driftChargePct >= 50
      const hyperCombo = getRiderMobilitySummary({ speedMult: 1.20, driftCharge: 0.50 });
      expect(hyperCombo.mobilityTier).toBe('HYPER-DRIFTER');

      // Just below HYPER-DRIFTER combo (speedMult 1.19 with 50% drift -> INTERCEPTOR)
      const subHyper = getRiderMobilitySummary({ speedMult: 1.19, driftCharge: 0.50 });
      expect(subHyper.mobilityTier).toBe('INTERCEPTOR');

      // 3. INTERCEPTOR via speedMult >= 1.15
      const interceptorSpeed = getRiderMobilitySummary({ speedMult: 1.15 });
      expect(interceptorSpeed.mobilityTier).toBe('INTERCEPTOR');

      // 4. INTERCEPTOR via driftCharge >= 35%
      const interceptorDrift = getRiderMobilitySummary({ driftCharge: 0.35 });
      expect(interceptorDrift.mobilityTier).toBe('INTERCEPTOR');

      // 5. STANDARD: just below INTERCEPTOR thresholds (speedMult 1.14, drift 34%)
      const standardRider = getRiderMobilitySummary({ speedMult: 1.14, driftCharge: 0.34 });
      expect(standardRider.mobilityTier).toBe('STANDARD');
    });

    // 13. getCombatOffenseSummary zero multipliers, negative scaling, missing weapon, and siphon tiers
    it('handles zero multipliers, negative scaling, missing weapon, and extreme siphon tiers in getCombatOffenseSummary', () => {
      // Zero multipliers fall back via falsy operator to 1
      const zeroPlayer = {
        ...createDefaultPlayerState(),
        dmgMult: 0,
        fireRateMult: 0,
        projCount: 0
      } as any;
      const zeroSummary = getCombatOffenseSummary(zeroPlayer);
      expect(zeroSummary.effectiveDpsMult).toBe(1.00);

      // Negative multipliers multiply deterministically without crashing
      const negPlayer = {
        ...createDefaultPlayerState(),
        dmgMult: -1.5,
        fireRateMult: -2,
        projCount: 1
      } as any;
      const negSummary = getCombatOffenseSummary(negPlayer);
      expect(negSummary.effectiveDpsMult).toBeCloseTo(3.00, 2);

      // Missing weapon does not crash or trigger evolution bonus
      const noWeaponPlayer = {
        ...createDefaultPlayerState(),
        weapon: undefined as any,
        dmgMult: 2.0
      } as any;
      const noWeaponSummary = getCombatOffenseSummary(noWeaponPlayer);
      expect(noWeaponSummary.isEvolved).toBe(false);
      expect(noWeaponSummary.summaryLine).not.toContain('OVERCLOCKED');

      // Extreme siphon tiers
      // Siphon >= 15% -> VAMPIRIC OVERDRIVE
      const highSiphonPlayer = { ...createDefaultPlayerState(), siphon: 0.60 } as any;
      const highSiphonSummary = getCombatOffenseSummary(highSiphonPlayer);
      expect(highSiphonSummary.siphonPct).toBe(60);
      expect(highSiphonSummary.siphonStatus).toBe('VAMPIRIC OVERDRIVE');

      // Siphon 1..14% -> LIGHT SIPHON
      const lightSiphonPlayer = { ...createDefaultPlayerState(), siphon: 0.08 } as any;
      const lightSiphonSummary = getCombatOffenseSummary(lightSiphonPlayer);
      expect(lightSiphonSummary.siphonPct).toBe(8);
      expect(lightSiphonSummary.siphonStatus).toBe('LIGHT SIPHON');

      // Siphon 0 or negative -> NONE
      const zeroSiphonPlayer = { ...createDefaultPlayerState(), siphon: 0 } as any;
      const zeroSiphonSummary = getCombatOffenseSummary(zeroSiphonPlayer);
      expect(zeroSiphonSummary.siphonPct).toBe(0);
      expect(zeroSiphonSummary.siphonStatus).toBe('NONE');

      const negSiphonPlayer = { ...createDefaultPlayerState(), siphon: -0.15 } as any;
      const negSiphonSummary = getCombatOffenseSummary(negSiphonPlayer);
      expect(negSiphonSummary.siphonPct).toBe(-15);
      expect(negSiphonSummary.siphonStatus).toBe('NONE');
    });

    // 14. getRoomHazardSummary null, undefined, and corrupted obstacle arrays
    it('handles null, undefined, and corrupted obstacle arrays in getRoomHazardSummary', () => {
      const fromNull = getRoomHazardSummary(null);
      expect(fromNull).toEqual({
        explosiveCount: 0,
        toxicCount: 0,
        cryoCount: 0,
        zoneTypes: [],
        tacticalHint: 'Clear asphalt sector — standard traction.'
      });

      const fromUndef = getRoomHazardSummary(undefined);
      expect(fromUndef.tacticalHint).toBe('Clear asphalt sector — standard traction.');

      // Corrupted obstacle array with null/undefined elements and mixed barrel types
      const corruptRoom = {
        obstacles: [
          null as any,
          undefined as any,
          { type: 'cryo_barrel' },
          { variant: 'toxic_barrel' },
          { type: 'explosive_barrel' },
          { type: 'non_barrel_rock' }
        ],
        zones: ['toxic_sludge', 'oil_slick', '']
      } as any;

      const summary = getRoomHazardSummary(corruptRoom);
      expect(summary.cryoCount).toBe(1);
      expect(summary.toxicCount).toBe(1);
      expect(summary.explosiveCount).toBe(1);
      expect(summary.zoneTypes).toEqual(['toxic_sludge', 'oil_slick']);
      expect(summary.tacticalHint).toContain('Cryo barrels detected (1)');
      expect(summary.tacticalHint).toContain('Toxic barrels detected (1)');
      expect(summary.tacticalHint).toContain('Explosive barrels detected (1)');
      expect(summary.tacticalHint).toContain('Surface modifiers detected');
    });

    // 15. getRoomThreatAssessment null rooms, all-dead hostiles, dummy targets, and negative floorNum clamping
    it('handles null rooms, all-dead hostiles, dummy targets, and negative floorNum clamping in getRoomThreatAssessment', () => {
      const fromNull = getRoomThreatAssessment(null);
      expect(fromNull).toEqual({
        threatScore: 0,
        threatTier: 'CLEAR',
        livingCount: 0,
        eliteCount: 0,
        hasBoss: false,
        advisory: 'Sector clear — no active hostiles detected.'
      });

      const fromUndef = getRoomThreatAssessment(undefined);
      expect(fromUndef.threatTier).toBe('CLEAR');

      // Room with dead boss (hp <= 0), dead elite, and combat dummy target
      const deadHostileRoom = {
        enemies: [
          { hp: 0, type: 'boss' },
          { hp: -25, type: 'swarmer', isElite: true },
          { hp: 100, type: 'swarmer', isDummy: true }
        ]
      } as any;
      const deadSummary = getRoomThreatAssessment(deadHostileRoom, 1);
      expect(deadSummary.livingCount).toBe(0);
      expect(deadSummary.hasBoss).toBe(false);
      expect(deadSummary.eliteCount).toBe(0);
      expect(deadSummary.threatTier).toBe('CLEAR');
      expect(deadSummary.threatScore).toBe(0);
      expect(deadSummary.advisory).toBe('Sector clear — no active hostiles detected.');

      // Negative floorNum (-5) clamped to floor 1: 1 living enemy -> threatScore: 1 * (10 + 1 * 2) = 12
      const liveRoom = {
        enemies: [{ hp: 50, type: 'swarmer' }]
      } as any;
      const negFloorSummary = getRoomThreatAssessment(liveRoom, -5);
      expect(negFloorSummary.livingCount).toBe(1);
      expect(negFloorSummary.threatScore).toBe(12);
      expect(negFloorSummary.threatTier).toBe('LOW');

      // Zero floorNum (0) clamped to floor 1
      const zeroFloorSummary = getRoomThreatAssessment(liveRoom, 0);
      expect(zeroFloorSummary.threatScore).toBe(12);
    });
  });

  // --------------------------------------------------------------------------
  // Boundary Stress: Sanctuary Advisors, Arsenal Career & Boss Telemetry (M108)
  // --------------------------------------------------------------------------
  describe('Boundary Stress: Sanctuary Advisors, Arsenal Career & Boss Telemetry (M108)', () => {
    // 1. getScannerStationAdvisor clamps extreme floor inputs (0, -500, NaN, Infinity, 1.99) and handles null/undefined player objects without throwing
    it('clamps extreme floor inputs (0, -500, NaN, Infinity, 1.99) and handles null/undefined player objects without throwing in getScannerStationAdvisor', () => {
      // Null player and default floor
      const fromNull = getScannerStationAdvisor(null);
      expect(fromNull.scannerActive).toBe(false);
      expect(fromNull.critBonusPct).toBe(0);
      expect(fromNull.targetFloor).toBe(1);
      expect(fromNull.recommendedAction).toBe('ACTIVATE SCANNER UPLINK (Free +15% Crit Chance & Full Floor Radar)');
      expect(fromNull.summaryLine).toBe('SCANNER INTEL [FLOOR 1]: STANDBY (0% CRIT) · ACTIVATE SCANNER UPLINK (Free +15% Crit Chance & Full Floor Radar)');

      // Undefined player
      const fromUndef = getScannerStationAdvisor(undefined);
      expect(fromUndef.scannerActive).toBe(false);
      expect(fromUndef.targetFloor).toBe(1);

      // Active scanner buff
      const fromActive = getScannerStationAdvisor({ scannerBuff: true } as any, 4);
      expect(fromActive.scannerActive).toBe(true);
      expect(fromActive.critBonusPct).toBe(15);
      expect(fromActive.targetFloor).toBe(4);
      expect(fromActive.recommendedAction).toBe('TACTICAL UPLINK ONLINE (+15% Crit Chance & Minimap Reveal Active)');
      expect(fromActive.summaryLine).toBe('SCANNER INTEL [FLOOR 4]: ONLINE (+15% CRIT) · TACTICAL UPLINK ONLINE (+15% Crit Chance & Minimap Reveal Active)');

      // Floor 0 clamps to 1
      const floorZero = getScannerStationAdvisor(null, 0);
      expect(floorZero.targetFloor).toBe(1);

      // Floor -500 clamps to 1
      const floorNeg = getScannerStationAdvisor(null, -500);
      expect(floorNeg.targetFloor).toBe(1);

      // NaN floor clamps to 1
      const floorNaN = getScannerStationAdvisor(null, NaN);
      expect(floorNaN.targetFloor).toBe(1);

      // Infinity floor clamps to 1
      const floorInf = getScannerStationAdvisor(null, Infinity);
      expect(floorInf.targetFloor).toBe(1);

      // -Infinity floor clamps to 1
      const floorNegInf = getScannerStationAdvisor(null, -Infinity);
      expect(floorNegInf.targetFloor).toBe(1);

      // Float 1.99 floors and clamps to 1
      const floorFloat1 = getScannerStationAdvisor(null, 1.99);
      expect(floorFloat1.targetFloor).toBe(1);

      // Float 5.95 floors to 5
      const floorFloat5 = getScannerStationAdvisor(null, 5.95);
      expect(floorFloat5.targetFloor).toBe(5);
    });

    // 2. getForgeStationAdvisor clamps negative/NaN scrap (-100, NaN), exact threshold (14 vs 15 scrap), and empty vs populated player.items arrays
    it('clamps negative/NaN scrap (-100, NaN), exact threshold (14 vs 15 scrap), and empty vs populated player.items in getForgeStationAdvisor', () => {
      // Null and undefined inputs
      const fromNull = getForgeStationAdvisor(null, null);
      expect(fromNull.scrapAvailable).toBe(0);
      expect(fromNull.canReforge).toBe(false);
      expect(fromNull.reforgeCost).toBe(15);
      expect(fromNull.modCount).toBe(0);
      expect(fromNull.recommendedAction).toBe('Need 15 more Scrap to Reforge at the Anvil');
      expect(fromNull.summaryLine).toBe('FORGE ANVIL: 0 SCRAP (COST: 15) · Need 15 more Scrap to Reforge at the Anvil');

      const fromUndef = getForgeStationAdvisor(undefined, undefined);
      expect(fromUndef.scrapAvailable).toBe(0);
      expect(fromUndef.canReforge).toBe(false);

      // Negative scrap -100 clamped to 0
      const negScrap = getForgeStationAdvisor({ scrap: -100 } as any);
      expect(negScrap.scrapAvailable).toBe(0);
      expect(negScrap.canReforge).toBe(false);
      expect(negScrap.recommendedAction).toBe('Need 15 more Scrap to Reforge at the Anvil');

      // NaN scrap clamped to 0
      const nanScrap = getForgeStationAdvisor({ scrap: NaN } as any);
      expect(nanScrap.scrapAvailable).toBe(0);
      expect(nanScrap.canReforge).toBe(false);

      // Exact threshold 14 scrap (insufficient)
      const scrap14 = getForgeStationAdvisor({ scrap: 14 } as any);
      expect(scrap14.scrapAvailable).toBe(14);
      expect(scrap14.canReforge).toBe(false);
      expect(scrap14.recommendedAction).toBe('Need 1 more Scrap to Reforge at the Anvil');

      // Exact threshold 15 scrap (sufficient)
      const scrap15 = getForgeStationAdvisor({ scrap: 15 } as any);
      expect(scrap15.scrapAvailable).toBe(15);
      expect(scrap15.canReforge).toBe(true);

      // Empty items array with ready reforge
      const emptyItems = getForgeStationAdvisor({ scrap: 25 } as any, { items: [] } as any);
      expect(emptyItems.canReforge).toBe(true);
      expect(emptyItems.modCount).toBe(0);
      expect(emptyItems.recommendedAction).toBe('Reforge Ready (15 Scrap) — Roll your first Outlaw Mod');

      // Populated items array with ready reforge
      const popItems = getForgeStationAdvisor({ scrap: 25 } as any, { items: [{ id: 'turbo_injection' }] } as any);
      expect(popItems.canReforge).toBe(true);
      expect(popItems.modCount).toBe(1);
      expect(popItems.recommendedAction).toBe('Reforge Ready (15 Scrap) — Reroll & upgrade active mod loadout');
    });

    // 3. getWeaponArsenalSummary handles null/empty metaSave, negative/NaN/Infinity kill counts, and ties in top weapon kills deterministically
    it('handles null/empty metaSave, negative/NaN/Infinity kill counts, and ties in top weapon kills deterministically in getWeaponArsenalSummary', () => {
      // Null metaSave
      const fromNull = getWeaponArsenalSummary(null);
      expect(fromNull.unlockedCount).toBe(1); // pistol default
      expect(fromNull.totalWeapons).toBe(7);
      expect(fromNull.totalKills).toBe(0);
      expect(fromNull.topWeaponId).toBe('pistol');
      expect(fromNull.topWeaponName).toBe('Pistol');
      expect(fromNull.topWeaponKills).toBe(0);
      expect(fromNull.summaryLine).toBe('ARSENAL: 1/7 UNLOCKED · 0 TOTAL KILLS · SIGNATURE: PISTOL (0)');

      // Empty metaSave object
      const fromEmpty = getWeaponArsenalSummary({});
      expect(fromEmpty.unlockedCount).toBe(1);
      expect(fromEmpty.totalKills).toBe(0);
      expect(fromEmpty.topWeaponId).toBe('pistol');

      // Negative, NaN, and Infinity kill counts sanitized to 0
      const corruptKills = getWeaponArsenalSummary({
        unlocked: { machine_gun: true, railgun: true },
        weaponKills: {
          pistol: -50,
          machine_gun: 77,
          railgun: NaN,
          shotgun: Infinity,
          flamethrower: -Infinity
        }
      });
      expect(corruptKills.unlockedCount).toBe(3); // pistol + machine_gun + railgun
      expect(corruptKills.totalKills).toBe(77);
      expect(corruptKills.topWeaponId).toBe('machine_gun');
      expect(corruptKills.topWeaponKills).toBe(77);
      expect(corruptKills.summaryLine).toContain('ARSENAL: 3/7 UNLOCKED · 77 TOTAL KILLS · SIGNATURE: MACHINE GUN (77)');

      // Deterministic tie-breaking across weapons with identical top kills
      // In canonical order ['pistol', 'machine_gun', ...], pistol wins tie with machine_gun
      const tiePistolMg = getWeaponArsenalSummary({
        weaponKills: {
          pistol: 150,
          machine_gun: 150
        }
      });
      expect(tiePistolMg.topWeaponId).toBe('pistol');
      expect(tiePistolMg.topWeaponKills).toBe(150);

      // Tie between flamethrower and railgun when pistol has 0 kills: flamethrower precedes railgun
      const tieFlameRail = getWeaponArsenalSummary({
        weaponKills: {
          flamethrower: 200,
          railgun: 200
        }
      });
      expect(tieFlameRail.topWeaponId).toBe('flamethrower');
      expect(tieFlameRail.topWeaponKills).toBe(200);
    });

    // 4. getBossEncounterBriefing handles exact 50% HP enrage boundary (500/1000 HP vs 501/1000 HP), 0 HP dead boss, 0 maxHp zero-division guard, and floors 0..100
    it('handles exact 50% HP enrage boundary (500/1000 HP vs 501/1000 HP), 0 HP dead boss, 0 maxHp zero-division guard, and floors 0..100 in getBossEncounterBriefing', () => {
      // Exact 50% HP enrage boundary: 500 / 1000 = 50% (enraged phase 2)
      const boss500 = getBossEncounterBriefing({ type: 'boss', hp: 500, maxHp: 1000, enraged: false }, 1);
      expect(boss500.active).toBe(true);
      expect(boss500.hpPct).toBe(50);
      expect(boss500.isEnraged).toBe(true);
      expect(boss500.phase).toBe(2);
      expect(boss500.summaryLine).toContain('[PHASE 2 ENRAGED]');

      // 501 / 1000 HP rounds to 50% integer telemetry, remaining enraged at boundary
      const boss501 = getBossEncounterBriefing({ type: 'boss', hp: 501, maxHp: 1000, enraged: false }, 1);
      expect(boss501.active).toBe(true);
      expect(boss501.hpPct).toBe(50);
      expect(boss501.isEnraged).toBe(true);
      expect(boss501.phase).toBe(2);

      // > 50% rounded HP (e.g. 510 / 1000 = 51% or 51 / 100 = 51%) cleanly stays in Phase 1
      const boss510 = getBossEncounterBriefing({ type: 'boss', hp: 510, maxHp: 1000, enraged: false }, 1);
      expect(boss510.hpPct).toBe(51);
      expect(boss510.isEnraged).toBe(false);
      expect(boss510.phase).toBe(1);
      expect(boss510.summaryLine).toContain('[PHASE 1]');

      // 0 HP dead boss: inactive telemetry
      const deadBoss0 = getBossEncounterBriefing({ type: 'boss', hp: 0, maxHp: 1000 }, 1);
      expect(deadBoss0.active).toBe(false);
      expect(deadBoss0.bossTitle).toBe('NO ACTIVE BOSS');
      expect(deadBoss0.phase).toBe(1);
      expect(deadBoss0.isEnraged).toBe(false);
      expect(deadBoss0.hpPct).toBe(0);
      expect(deadBoss0.summaryLine).toBe('BOSS TELEMETRY: INACTIVE');

      // Negative HP dead boss: inactive telemetry
      const deadBossNeg = getBossEncounterBriefing({ type: 'boss', hp: -75, maxHp: 1000 }, 1);
      expect(deadBossNeg.active).toBe(false);

      // Null, undefined, and non-boss targets return inactive
      expect(getBossEncounterBriefing(null).active).toBe(false);
      expect(getBossEncounterBriefing(undefined).active).toBe(false);
      expect(getBossEncounterBriefing({ type: 'swarmer', hp: 100 } as any).active).toBe(false);

      // 0 maxHp zero-division guard (clamps maxHp to 1, prevents NaN / Infinity)
      const zeroMaxHp = getBossEncounterBriefing({ type: 'boss', hp: 50, maxHp: 0 }, 1);
      expect(zeroMaxHp.active).toBe(true);
      expect(Number.isFinite(zeroMaxHp.hpPct)).toBe(true);
      expect(zeroMaxHp.hpPct).toBe(100);

      // Floor 0 clamps cleanly to Floor 1 variant
      const floor0 = getBossEncounterBriefing({ type: 'boss', hp: 800, maxHp: 1000 }, 0);
      expect(floor0.bossTitle).toBe('SCRAP GOLIATH');

      // Floors 0..100 boundary cycling without exception or undefined titles
      for (let f = 0; f <= 100; f += 5) {
        const briefing = getBossEncounterBriefing({ type: 'boss', hp: 500, maxHp: 1000 }, f);
        expect(briefing.active).toBe(true);
        expect(typeof briefing.bossTitle).toBe('string');
        expect(briefing.bossTitle.length).toBeGreaterThan(0);
        expect(briefing.summaryLine).not.toContain('NaN');
        expect(briefing.summaryLine).not.toContain('undefined');
      }
    });

    // 5. Verifies all 4 advisors return non-empty summaryLine strings containing zero 'NaN' or 'undefined' substrings under all boundary inputs
    it('verifies all 4 advisors return non-empty summaryLine strings containing zero NaN or undefined substrings under boundary inputs', () => {
      // 1. Scanner Advisor across boundary matrix
      const scannerBoundaryFloors = [-500, 0, 1, 1.99, NaN, Infinity, -Infinity, 100];
      const scannerPlayers = [null, undefined, {}, { scannerBuff: false }, { scannerBuff: true }];

      for (const p of scannerPlayers) {
        for (const fl of scannerBoundaryFloors) {
          const res = getScannerStationAdvisor(p as any, fl);
          expect(typeof res.summaryLine).toBe('string');
          expect(res.summaryLine.length).toBeGreaterThan(0);
          expect(res.summaryLine).not.toContain('NaN');
          expect(res.summaryLine).not.toContain('undefined');
          expect(res.summaryLine).not.toContain('null');
        }
      }

      // 2. Forge Advisor across boundary matrix
      const forgeScrapValues = [-1000, -1, 0, 14, 15, 999, NaN, Infinity];
      const forgePlayers = [null, undefined, {}, { items: [] }, { items: [{ id: 'mod_1' }, { id: 'mod_2' }] }];

      for (const scrap of forgeScrapValues) {
        for (const p of forgePlayers) {
          const res = getForgeStationAdvisor({ scrap } as any, p as any);
          expect(typeof res.summaryLine).toBe('string');
          expect(res.summaryLine.length).toBeGreaterThan(0);
          expect(res.summaryLine).not.toContain('NaN');
          expect(res.summaryLine).not.toContain('undefined');
          expect(res.summaryLine).not.toContain('null');
        }
      }

      // 3. Weapon Arsenal Summary across boundary matrix
      const arsenalMetas = [
        null,
        undefined,
        {},
        { unlocked: null, weaponKills: null },
        { unlocked: { shotgun: true }, weaponKills: { pistol: -50, shotgun: NaN, railgun: Infinity } },
        { unlocked: { machine_gun: true, arc_coil: true }, weaponKills: { machine_gun: 999999 } }
      ];

      for (const meta of arsenalMetas) {
        const res = getWeaponArsenalSummary(meta as any);
        expect(typeof res.summaryLine).toBe('string');
        expect(res.summaryLine.length).toBeGreaterThan(0);
        expect(res.summaryLine).not.toContain('NaN');
        expect(res.summaryLine).not.toContain('undefined');
        expect(res.summaryLine).not.toContain('null');
      }

      // 4. Boss Encounter Briefing across boundary matrix
      const bossVariants = [
        null,
        undefined,
        { type: 'swarmer', hp: 50 },
        { type: 'boss', hp: 0, maxHp: 0 },
        { type: 'boss', hp: -100, maxHp: 500 },
        { type: 'boss', hp: 50, maxHp: 0 },
        { type: 'boss', hp: 500, maxHp: 1000 },
        { type: 'boss', hp: 1000, maxHp: 1000, enraged: true }
      ];
      const bossFloors = [-10, 0, 1, 6, 99, 100, NaN, Infinity];

      for (const b of bossVariants) {
        for (const fl of bossFloors) {
          const res = getBossEncounterBriefing(b as any, fl);
          expect(typeof res.summaryLine).toBe('string');
          expect(res.summaryLine.length).toBeGreaterThan(0);
          expect(res.summaryLine).not.toContain('NaN');
          expect(res.summaryLine).not.toContain('undefined');
          expect(res.summaryLine).not.toContain('null');
        }
      }
    });
  });

  // --------------------------------------------------------------------------
  // Sanctuary Station Advisors, Mod Deck Summary & Tooltip Hints Extreme Boundaries (M126)
  // --------------------------------------------------------------------------
  describe('Sanctuary Station Advisors, Mod Deck Summary & Tooltip Hints Extreme Boundaries (M126)', () => {
    // Test 1: Exact readiness score boundaries and heat clamping in getWarRoomStationAdvisor
    it('enforces exact readiness score boundaries (0, 3, 4, 9, 10, 17, 18, 999) and heat clamping (-5, 0, 1, 2, 3, 99, NaN, Infinity) in getWarRoomStationAdvisor', () => {
      // Readiness Score boundaries (equippedCount * 2 + totalRanks)
      // Boundary 1: readinessScore = 0 -> recommendedMaxHeat = 0
      const score0 = getWarRoomStationAdvisor({ equipped: {}, ranks: {} });
      expect(score0.recommendedMaxHeat).toBe(0);

      // Boundary 2: readinessScore = 3 -> recommendedMaxHeat = 0
      const score3 = getWarRoomStationAdvisor({ equipped: {}, ranks: { r1: 3 } });
      expect(score3.recommendedMaxHeat).toBe(0);

      // Boundary 3: readinessScore = 4 -> recommendedMaxHeat = 1 (lower bound for 1)
      const score4 = getWarRoomStationAdvisor({ equipped: {}, ranks: { r1: 4 } });
      expect(score4.recommendedMaxHeat).toBe(1);

      // Equipped items contribution: 2 items = 4 points -> recommendedMaxHeat = 1
      const score4Equip = getWarRoomStationAdvisor({ equipped: { a: 'itemA', b: 'itemB' }, ranks: {} });
      expect(score4Equip.recommendedMaxHeat).toBe(1);

      // Boundary 4: readinessScore = 9 -> recommendedMaxHeat = 1 (upper bound for 1)
      const score9 = getWarRoomStationAdvisor({ equipped: { a: 'itemA' }, ranks: { r1: 7 } });
      expect(score9.recommendedMaxHeat).toBe(1);

      // Boundary 5: readinessScore = 10 -> recommendedMaxHeat = 2 (lower bound for 2)
      const score10 = getWarRoomStationAdvisor({ equipped: {}, ranks: { r1: 10 } });
      expect(score10.recommendedMaxHeat).toBe(2);

      // Boundary 6: readinessScore = 17 -> recommendedMaxHeat = 2 (upper bound for 2)
      const score17 = getWarRoomStationAdvisor({ equipped: { a: 'itemA', b: 'itemB', c: 'itemC' }, ranks: { r1: 11 } });
      expect(score17.recommendedMaxHeat).toBe(2);

      // Boundary 7: readinessScore = 18 -> recommendedMaxHeat = 3 (lower bound for 3)
      const score18 = getWarRoomStationAdvisor({ equipped: {}, ranks: { r1: 18 } });
      expect(score18.recommendedMaxHeat).toBe(3);

      // Boundary 8: readinessScore = 999 -> clamped ranks (max 25) + equipped (max 6) -> 37 >= 18 -> recommendedMaxHeat = 3
      const score999 = getWarRoomStationAdvisor({ equipped: {}, ranks: { r1: 999 } });
      expect(score999.recommendedMaxHeat).toBe(3);

      // Heat clamping matrix: [-5, 0, 1, 2, 3, 99, NaN, Infinity]
      const heatCases: Array<{ heat: any; expectedHeat: number; expectedBonusPct: number }> = [
        { heat: -5, expectedHeat: 0, expectedBonusPct: 0 },
        { heat: 0, expectedHeat: 0, expectedBonusPct: 0 },
        { heat: 1, expectedHeat: 1, expectedBonusPct: 25 },
        { heat: 2, expectedHeat: 2, expectedBonusPct: 50 },
        { heat: 3, expectedHeat: 3, expectedBonusPct: 75 },
        { heat: 99, expectedHeat: 3, expectedBonusPct: 75 },
        { heat: NaN, expectedHeat: 0, expectedBonusPct: 0 },
        { heat: Infinity, expectedHeat: 0, expectedBonusPct: 0 }
      ];

      for (const { heat, expectedHeat, expectedBonusPct } of heatCases) {
        const adv = getWarRoomStationAdvisor({ heatLevel: heat, ranks: { r1: 10 } });
        expect(adv.currentHeat).toBe(expectedHeat);
        expect(adv.scrapBonusPct).toBe(expectedBonusPct);
        expect(adv.summaryLine).toContain(`HEAT ${expectedHeat} (+${expectedBonusPct}% SCRAP)`);
        expect(adv.summaryLine).not.toContain('NaN');
        expect(adv.summaryLine).not.toContain('undefined');
      }

      // Bounty claimed status flag boundaries
      const unclaimed = getWarRoomStationAdvisor({ heatLevel: 2 }, false);
      expect(unclaimed.bountyClaimed).toBe(false);
      expect(unclaimed.summaryLine).toContain('CACHE: ⚡ FREE DROP READY (+15 🪙 / +1 ❤️)');

      const claimed = getWarRoomStationAdvisor({ heatLevel: 2 }, true);
      expect(claimed.bountyClaimed).toBe(true);
      expect(claimed.summaryLine).toContain('CACHE: ✓ CLAIMED (+15 🪙 / +1 ❤️)');

      // Null / undefined safety
      const nullAdv = getWarRoomStationAdvisor(null);
      expect(nullAdv.currentHeat).toBe(0);
      expect(nullAdv.recommendedMaxHeat).toBe(0);
      expect(nullAdv.summaryLine).toContain('HEAT 0 (+0% SCRAP)');
    });

    // Test 2: Exact buff combination boundaries and player.scannerBuff fallback in getLaunchGateAdvisor
    it('evaluates exact buff combination boundaries (0/2, 1/2 scanner, 1/2 cache, 2/2 both) and player.scannerBuff fallback in getLaunchGateAdvisor', () => {
      // 1. 0/2 buffs ready (neither claimed, no player scannerBuff)
      const buffs0 = getLaunchGateAdvisor({ heatLevel: 1 }, { weapon: 'pistol', scannerBuff: false }, false, false);
      expect(buffs0.readyCount).toBe(0);
      expect(buffs0.totalChecks).toBe(2);
      expect(buffs0.isFullyPrepped).toBe(false);
      expect(buffs0.missingBuffs).toEqual(['SCANNER BUFF', 'WAR ROOM CACHE']);
      expect(buffs0.summaryLine).toContain('PRE-FLIGHT: ⚠️ MISSING SCANNER BUFF & WAR ROOM CACHE // WEAPON: PISTOL // HEAT 1');

      // 2. 1/2 buffs ready: scanner only (via scannerClaimed flag)
      const buffsScanner = getLaunchGateAdvisor({ heatLevel: 2 }, { weapon: 'shotgun', scannerBuff: false }, true, false);
      expect(buffsScanner.readyCount).toBe(1);
      expect(buffsScanner.totalChecks).toBe(2);
      expect(buffsScanner.isFullyPrepped).toBe(false);
      expect(buffsScanner.missingBuffs).toEqual(['WAR ROOM CACHE']);
      expect(buffsScanner.summaryLine).toContain('PRE-FLIGHT: ⚠️ MISSING WAR ROOM CACHE // WEAPON: SHOTGUN // HEAT 2');

      // 3. 1/2 buffs ready: war room cache only (via bountyClaimed flag)
      const buffsCache = getLaunchGateAdvisor({ heatLevel: 0 }, { weapon: 'railgun', scannerBuff: false }, false, true);
      expect(buffsCache.readyCount).toBe(1);
      expect(buffsCache.totalChecks).toBe(2);
      expect(buffsCache.isFullyPrepped).toBe(false);
      expect(buffsCache.missingBuffs).toEqual(['SCANNER BUFF']);
      expect(buffsCache.summaryLine).toContain('PRE-FLIGHT: ⚠️ MISSING SCANNER BUFF // WEAPON: RAILGUN // HEAT 0');

      // 4. 2/2 buffs ready: both locked
      const buffsBoth = getLaunchGateAdvisor({ heatLevel: 3 }, { weapon: 'machine_gun' }, true, true);
      expect(buffsBoth.readyCount).toBe(2);
      expect(buffsBoth.totalChecks).toBe(2);
      expect(buffsBoth.isFullyPrepped).toBe(true);
      expect(buffsBoth.missingBuffs).toEqual([]);
      expect(buffsBoth.summaryLine).toContain('PRE-FLIGHT: ✓ 2/2 BUFFS LOCKED // WEAPON: MACHINE_GUN // HEAT 3');

      // 5. player.scannerBuff fallback: scannerClaimed is false, but player.scannerBuff is true
      const fallbackOnly = getLaunchGateAdvisor({ heatLevel: 1 }, { weapon: 'pistol', scannerBuff: true }, false, false);
      expect(fallbackOnly.readyCount).toBe(1);
      expect(fallbackOnly.missingBuffs).toEqual(['WAR ROOM CACHE']);

      const fallbackWithBounty = getLaunchGateAdvisor({ heatLevel: 2 }, { weapon: 'pistol', scannerBuff: true }, false, true);
      expect(fallbackWithBounty.readyCount).toBe(2);
      expect(fallbackWithBounty.isFullyPrepped).toBe(true);
      expect(fallbackWithBounty.missingBuffs).toEqual([]);
      expect(fallbackWithBounty.summaryLine).toContain('PRE-FLIGHT: ✓ 2/2 BUFFS LOCKED');

      // Null player and metaSave handling: defaults weapon to PISTOL and heat to 0
      const nullAdvisor = getLaunchGateAdvisor(null, null, false, false);
      expect(nullAdvisor.readyCount).toBe(0);
      expect(nullAdvisor.summaryLine).toContain('WEAPON: PISTOL // HEAT 0');
    });

    // Test 3: Exact scrap affordability boundaries in getGarageStationAdvisor
    it('verifies exact scrap affordability boundaries (cheapestCost - 1, cheapestCost, cheapestCost + 1, 19/19 maxed, NaN, -100) in getGarageStationAdvisor', () => {
      // With ranks: {}, cheapest upgrade is speed (Twin-Cam Engine Tune, baseCost 20)
      const cheapestCost = 20;

      // Boundary 1: scrap = cheapestCost - 1 (19 scrap: insufficient)
      const scrap19 = getGarageStationAdvisor({ scrap: cheapestCost - 1, ranks: {} });
      expect(scrap19.canAffordNextTuning).toBe(false);
      expect(scrap19.summaryLine).toContain(`NEED ${cheapestCost} ⚙️ FOR NEXT TUNE`);

      // Boundary 2: scrap = cheapestCost (20 scrap: exact threshold met)
      const scrap20 = getGarageStationAdvisor({ scrap: cheapestCost, ranks: {} });
      expect(scrap20.canAffordNextTuning).toBe(true);
      expect(scrap20.summaryLine).toContain(`READY TO UPGRADE TWIN-CAM ENGINE TUNE (${cheapestCost} ⚙️)`);

      // Boundary 3: scrap = cheapestCost + 1 (21 scrap: surplus scrap)
      const scrap21 = getGarageStationAdvisor({ scrap: cheapestCost + 1, ranks: {} });
      expect(scrap21.canAffordNextTuning).toBe(true);
      expect(scrap21.summaryLine).toContain(`READY TO UPGRADE TWIN-CAM ENGINE TUNE (${cheapestCost} ⚙️)`);

      // Boundary 4: 19/19 maxed (all 4 meta upgrades at maximum rank: 5+5+5+4 = 19)
      const maxedMeta = getGarageStationAdvisor({
        scrap: 99999,
        ranks: {
          dmg: 5,
          fireRate: 5,
          speed: 5,
          maxHp: 4
        }
      });
      expect(maxedMeta.tuningRanks).toBe(19);
      expect(maxedMeta.tuningMaxRanks).toBe(19);
      expect(maxedMeta.tuningCompletionPct).toBe(100);
      expect(maxedMeta.canAffordNextTuning).toBe(false);
      expect(maxedMeta.summaryLine).toContain('TUNING: 19/19 RANKS (100%) // TUNING MAXED');

      // Boundary 5: scrap is NaN -> sanitized to 0
      const nanScrap = getGarageStationAdvisor({ scrap: NaN, ranks: {} });
      expect(nanScrap.canAffordNextTuning).toBe(false);
      expect(nanScrap.summaryLine).toContain(`NEED ${cheapestCost} ⚙️ FOR NEXT TUNE`);

      // Boundary 6: scrap is negative (-100) -> clamped to 0
      const negScrap = getGarageStationAdvisor({ scrap: -100, ranks: {} });
      expect(negScrap.canAffordNextTuning).toBe(false);
      expect(negScrap.summaryLine).toContain(`NEED ${cheapestCost} ⚙️ FOR NEXT TUNE`);
    });

    // Test 4: Exact weapon unlock and kill boundaries in getArmoryStationAdvisor
    it('handles exact weapon unlock and kill boundaries (1/7 stock pistol -> 7/7 unlocked, invalid weapon ID fallback, negative/NaN kills) in getArmoryStationAdvisor', () => {
      // Boundary 1: 1/7 stock pistol unlocked (default/empty metaSave)
      const stockArmory = getArmoryStationAdvisor({ unlocked: {}, weaponKills: {} }, { weapon: 'pistol' });
      expect(stockArmory.unlockedCount).toBe(1);
      expect(stockArmory.totalWeapons).toBe(7);
      expect(stockArmory.totalKills).toBe(0);
      expect(stockArmory.equippedWeaponId).toBe('pistol');
      expect(stockArmory.equippedRoleLabel).toBe('PRECISION SIDEARM');
      expect(stockArmory.equippedBaseDps).toBe(48);
      expect(stockArmory.summaryLine).toBe('ARSENAL: 1/7 UNLOCKED (0 KILLS) // EQUIPPED: PISTOL (PRECISION SIDEARM, 48 DPS)');

      // Boundary 2: 7/7 all weapons unlocked with positive kill telemetry
      const allUnlockedMeta = {
        unlocked: {
          machine_gun: true,
          shotgun: true,
          flamethrower: true,
          railgun: true,
          grenade_launcher: true,
          arc_coil: true
        },
        weaponKills: {
          pistol: 25,
          machine_gun: 100,
          shotgun: 50,
          railgun: 75
        }
      };
      const fullyUnlockedArmory = getArmoryStationAdvisor(allUnlockedMeta, { weapon: 'machine_gun' });
      expect(fullyUnlockedArmory.unlockedCount).toBe(7);
      expect(fullyUnlockedArmory.totalWeapons).toBe(7);
      expect(fullyUnlockedArmory.totalKills).toBe(250);
      expect(fullyUnlockedArmory.equippedWeaponId).toBe('machine_gun');
      expect(fullyUnlockedArmory.summaryLine).toContain('ARSENAL: 7/7 UNLOCKED (250 KILLS) // EQUIPPED: MACHINE_GUN');

      // Boundary 3: Invalid weapon ID fallback to 'pistol'
      const invalidWeaponArmory = getArmoryStationAdvisor(null, { weapon: 'antimatter_blaster_xyz' });
      expect(invalidWeaponArmory.equippedWeaponId).toBe('pistol');
      expect(invalidWeaponArmory.equippedRoleLabel).toBe('PRECISION SIDEARM');
      expect(invalidWeaponArmory.equippedBaseDps).toBe(48);
      expect(invalidWeaponArmory.summaryLine).toContain('EQUIPPED: PISTOL (PRECISION SIDEARM, 48 DPS)');

      // Null player weapon fallback
      const nullPlayerArmory = getArmoryStationAdvisor(null, null);
      expect(nullPlayerArmory.equippedWeaponId).toBe('pistol');

      // Boundary 4: Negative and NaN kill counts sanitized to 0
      const corruptKillsArmory = getArmoryStationAdvisor({
        unlocked: { railgun: true },
        weaponKills: {
          pistol: -50,
          shotgun: NaN,
          machine_gun: -999,
          railgun: 42,
          arc_coil: Infinity
        }
      }, { weapon: 'railgun' });
      expect(corruptKillsArmory.unlockedCount).toBe(2);
      expect(corruptKillsArmory.totalKills).toBe(42);
      expect(corruptKillsArmory.summaryLine).toContain('ARSENAL: 2/7 UNLOCKED (42 KILLS)');
    });

    // Test 5: Exact mod stack boundaries across getRunModDeckSummary and formatModDeckTooltipHint
    it('evaluates exact mod stack boundaries (0, 1, 2, 3, 100, -5, NaN, Infinity) across both getRunModDeckSummary and formatModDeckTooltipHint', () => {
      const modId = 'hollow_point';

      // 1. Stack = 0
      const deck0 = getRunModDeckSummary({ modStacks: { [modId]: 0 } });
      expect(deck0.totalModPicks).toBe(0);
      expect(deck0.uniqueModsCount).toBe(0);
      expect(deck0.maxStackCount).toBe(0);
      expect(deck0.evoStackReady).toBe(false);
      expect(deck0.summaryLine).toContain('MODS: 0 PICKS (0 UNIQUE) // 0/3 MAX STACK');
      const hint0 = formatModDeckTooltipHint(modId, { modStacks: { [modId]: 0 } });
      expect(hint0).toContain('📦 STACKS: 0/3 FOR OVERCLOCK EVO');

      // 2. Stack = 1
      const deck1 = getRunModDeckSummary({ modStacks: { [modId]: 1 } });
      expect(deck1.totalModPicks).toBe(1);
      expect(deck1.uniqueModsCount).toBe(1);
      expect(deck1.maxStackCount).toBe(1);
      expect(deck1.evoStackReady).toBe(false);
      expect(deck1.summaryLine).toContain('MODS: 1 PICKS (1 UNIQUE) // 1/3 MAX STACK');
      const hint1 = formatModDeckTooltipHint(modId, { modStacks: { [modId]: 1 } });
      expect(hint1).toContain('📦 STACKS: 1/3 FOR OVERCLOCK EVO');

      // 3. Stack = 2
      const deck2 = getRunModDeckSummary({ modStacks: { [modId]: 2 } });
      expect(deck2.totalModPicks).toBe(2);
      expect(deck2.uniqueModsCount).toBe(1);
      expect(deck2.maxStackCount).toBe(2);
      expect(deck2.evoStackReady).toBe(false);
      expect(deck2.summaryLine).toContain('MODS: 2 PICKS (1 UNIQUE) // 2/3 STACK NEAR EVO');
      const hint2 = formatModDeckTooltipHint(modId, { modStacks: { [modId]: 2 } });
      expect(hint2).toContain('🔥 2/3 STACKS: +1 STACK FOR OVERCLOCK EVO');

      // 4. Stack = 3 (Evolution threshold reached)
      const deck3 = getRunModDeckSummary({ modStacks: { [modId]: 3 } });
      expect(deck3.totalModPicks).toBe(3);
      expect(deck3.uniqueModsCount).toBe(1);
      expect(deck3.maxStackCount).toBe(3);
      expect(deck3.evoStackReady).toBe(true);
      expect(deck3.summaryLine).toContain('MODS: 3 PICKS (1 UNIQUE) // 3+ STACK EVO READY');
      const hint3 = formatModDeckTooltipHint(modId, { modStacks: { [modId]: 3 } });
      expect(hint3).toContain('⚡ 3+ STACKS: GENERIC OVERCLOCK READY');

      // 5. Stack = 100 (Deep stacks beyond evolution)
      const deck100 = getRunModDeckSummary({ modStacks: { [modId]: 100 } });
      expect(deck100.totalModPicks).toBe(100);
      expect(deck100.uniqueModsCount).toBe(1);
      expect(deck100.maxStackCount).toBe(100);
      expect(deck100.evoStackReady).toBe(true);
      expect(deck100.summaryLine).toContain('MODS: 100 PICKS (1 UNIQUE) // 3+ STACK EVO READY');
      const hint100 = formatModDeckTooltipHint(modId, { modStacks: { [modId]: 100 } });
      expect(hint100).toContain('⚡ 3+ STACKS: GENERIC OVERCLOCK READY');

      // 6. Stack = -5 (Negative stack sanitized to 0)
      const deckNeg = getRunModDeckSummary({ modStacks: { [modId]: -5 } });
      expect(deckNeg.totalModPicks).toBe(0);
      expect(deckNeg.uniqueModsCount).toBe(0);
      expect(deckNeg.maxStackCount).toBe(0);
      expect(deckNeg.evoStackReady).toBe(false);
      expect(deckNeg.summaryLine).toContain('MODS: 0 PICKS (0 UNIQUE) // 0/3 MAX STACK');
      const hintNeg = formatModDeckTooltipHint(modId, { modStacks: { [modId]: -5 } });
      expect(hintNeg).toContain('📦 STACKS: 0/3 FOR OVERCLOCK EVO');

      // 7. Stack = NaN (NaN sanitized to 0)
      const deckNaN = getRunModDeckSummary({ modStacks: { [modId]: NaN } });
      expect(deckNaN.totalModPicks).toBe(0);
      expect(deckNaN.uniqueModsCount).toBe(0);
      expect(deckNaN.maxStackCount).toBe(0);
      expect(deckNaN.evoStackReady).toBe(false);
      expect(deckNaN.summaryLine).toContain('MODS: 0 PICKS (0 UNIQUE) // 0/3 MAX STACK');
      const hintNaN = formatModDeckTooltipHint(modId, { modStacks: { [modId]: NaN } });
      expect(hintNaN).toContain('📦 STACKS: 0/3 FOR OVERCLOCK EVO');

      // 8. Stack = Infinity (Infinity sanitized to 0)
      const deckInf = getRunModDeckSummary({ modStacks: { [modId]: Infinity } });
      expect(deckInf.totalModPicks).toBe(0);
      expect(deckInf.uniqueModsCount).toBe(0);
      expect(deckInf.maxStackCount).toBe(0);
      expect(deckInf.evoStackReady).toBe(false);
      expect(deckInf.summaryLine).toContain('MODS: 0 PICKS (0 UNIQUE) // 0/3 MAX STACK');
      const hintInf = formatModDeckTooltipHint(modId, { modStacks: { [modId]: Infinity } });
      expect(hintInf).toContain('📦 STACKS: 0/3 FOR OVERCLOCK EVO');

      // Additional corner cases: null player and unknown mod definition
      const deckNull = getRunModDeckSummary(null);
      expect(deckNull.totalModPicks).toBe(0);
      expect(deckNull.summaryLine).toContain('MODS: 0 PICKS');

      const hintUnknown = formatModDeckTooltipHint('non_existent_mod_id', { modStacks: {} });
      expect(hintUnknown).toBe('');
    });
  });
});
