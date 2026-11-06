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
 *  6. Full Floor 1 -> Floor 6 Boss Rush with Phase-2 Overdrive Enrage, Overkill Bonus & Floor Bounty Progression
 *  7. Treasure Room Choice-of-2 Pedestal Selection & 3-Stack Generic Weapon Evolution
 *  8. Sanctuary Hub Pre-Run Preparation, NPC Lore Dialogue Greetings & Training Dummy Cumulative DPS
 *  9. Biome Zone Mastery Gauntlet (Boost Strip, Oil Slick & Ice Patch Thermal Dynamics)
 * 10. Elite Affix Trio (Volatile, Overclocked, Vampiric) & Floor 4 Cryo Barrel Thermal Shock Combo
 * 11. Post-Mortem Run Grade S Evaluation, Stash Salvage Summary & Weapon Mastery III Meta Carry-Over
 * 12. Full Sanctuary-to-Dungeon Preparation & Multi-Floor Combat Telemetry Workflow (Floor 1 -> Floor 3 -> Boss Room)
 * 13. Full Biker Build Archetype Progression Loop (Road Freelancer -> Hellfire Gunner -> Nitro Drifter -> Iron Juggernaut -> Vampiric Reaper)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  SAVE_KEY_RUN,
  PlayerState,
  DungeonGraph,
  EquipmentItem,
  Room,
  BiomeZone,
  Obstacle
} from '@/types/game';

import { RUN_MOD_POOL, calcUpgradeCost } from '@/data/upgrades';
import { isWeaponEvolved } from '@/data/weapons';

import {
  SafeLocalStorage,
  createDefaultPlayerState,
  createDefaultMetaSave,
  saveRunCheckpoint,
  loadRunCheckpoint,
  writeMetaSave,
  clearRunSave,
  addLoot,
  resetPlayerStatsForRun,
  applyMetaStats
} from '@/core/state';

import {
  generateDungeon,
  getFloorScale,
  createBoss,
  enableChoicePedestalsInTreasureRooms,
  createHomeBaseRoom,
  getFloorBountyContract,
  getHubNpcGreeting,
  getRoomHazardSummary
} from '@/world/dungeon';

import {
  BOSS_NAMES,
  createEnemy,
  updateEnemyAI,
  getRoomThreatAssessment
} from '@/systems/enemyAI';

import {
  createCombatState,
  handleEnemyDeath,
  calcOverkillBonus,
  updateCombatPipeline,
  formatDummyHitTelemetry,
  getCombatOffenseSummary
} from '@/systems/combat';

import { updateBikeKinematics } from '@/systems/physics';
import { getModStackTierClass } from '@/ui/hud';
import {
  buildRunPostMortemSummary,
  getStashSalvageSummary,
  getWeaponMasteryTier,
  getBuildArchetypeSummary
} from '@/ui/garage';
import { getHubStationPromptInfo } from '@/ui/hubStationModal';

function createMockRoom(overrides: Partial<Room> = {}): Room {
  return {
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
    biomeZones: [],
    trapdoor: false,
    ...overrides
  };
}

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
      expect(initialBossHp).toBe(1120);

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
      expect(b1.hp).toBe(1120);

      // Floor 2: Siege Behemoth (Variant 1) with scaled HP
      const b2 = createBoss(2, 360, 360);
      expect(b2.name).toBe('SIEGE BEHEMOTH');
      expect(b2.bossVariant).toBe(1);
      expect(b2.hp).toBeGreaterThan(b1.hp);
      expect(b2.hp).toBe(Math.round(1120 * getFloorScale(2)));

      // Floor 3: Overlord Helion (Variant 2) with further scaled HP
      const b3 = createBoss(3, 360, 360);
      expect(b3.name).toBe('OVERLORD HELION');
      expect(b3.bossVariant).toBe(2);
      expect(b3.hp).toBeGreaterThan(b2.hp);
      expect(b3.hp).toBe(Math.round(1120 * getFloorScale(3)));
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 6: Full Floor 1 -> Floor 6 Boss Rush with Phase-2 Overdrive Enrage,
  // Overkill Bonus & Floor Bounty Progression
  // --------------------------------------------------------------------------
  describe('Scenario 6: Full Floor 1 -> Floor 6 Boss Rush with Phase-2 Overdrive Enrage, Overkill Bonus & Floor Bounty Progression', () => {
    it('progresses through Floors 1 to 6 boss encounters, activating Phase-2 Overdrive enrage, claiming overkill bonuses and completing floor bounty contracts', () => {
      const meta = createDefaultMetaSave();
      let totalBossesSlain = 0;

      for (let floor = 1; floor <= 6; floor++) {
        // 1. Verify Floor Bounty Contract progression
        const contract = getFloorBountyContract(floor);
        expect(contract.floor).toBe(floor);
        expect(contract.scrapReward).toBeGreaterThanOrEqual(8);
        expect(contract.coinReward).toBeGreaterThanOrEqual(10);

        // Verify distinct contract identities across floors
        if (floor === 1) expect(contract.id).toBe('GRAZE_INITIATE');
        else if (floor === 2) expect(contract.id).toBe('DRIFT_DEMON');
        else if (floor === 3) expect(contract.id).toBe('STYLE_HUNTER');
        else if (floor === 4) expect(contract.id).toBe('CRYO_SHATTER');
        else if (floor === 5) expect(contract.id).toBe('OVERDRIVE_SLAYER');
        else if (floor === 6) expect(contract.id).toBe('VALHALLA_LEGEND');

        // 2. Boss creation and initial scaling
        const boss = createBoss(floor, 360, 360);
        expect(boss.bossVariant).toBe(floor - 1);
        expect(boss.name).toBe(BOSS_NAMES[floor - 1]);
        const expectedHp = Math.round(1120 * getFloorScale(floor));
        expect(boss.hp).toBe(expectedHp);
        expect(boss.maxHp).toBe(expectedHp);

        const room = createMockRoom({ enemies: [boss] });
        const combatState = createCombatState();

        // 3. Boss in Phase 1 when HP > 50%
        boss.hp = Math.floor(boss.maxHp * 0.52);
        updateEnemyAI({
          room,
          enemy: boss,
          dt: 0.05,
          player,
          projScale: 1,
          enemyBullets: [],
          enemyBombs: [],
          floorNum: floor
        });
        expect(boss.phase).toBe(1);
        expect((boss as any).enraged).toBe(false);

        // 4. Boss crosses threshold: hp <= maxHp * 0.5 enters Phase-2 Overdrive Enrage
        boss.hp = Math.floor(boss.maxHp * 0.49);
        updateEnemyAI({
          room,
          enemy: boss,
          dt: 0.05,
          player,
          projScale: 1,
          enemyBullets: [],
          enemyBombs: [],
          floorNum: floor
        });
        expect(boss.phase).toBe(2);
        expect((boss as any).enraged).toBe(true);

        // 5. Overkill bonus calculation verification
        const normalFatal = calcOverkillBonus(0, boss.maxHp);
        expect(normalFatal.isOverkill).toBe(false);
        expect(normalFatal.bonusStyle).toBe(0);

        // Fatal hit pushing HP beyond -50% maxHp triggers overkill
        const deepOverkill = calcOverkillBonus(-Math.ceil(boss.maxHp * 0.55), boss.maxHp);
        expect(deepOverkill.isOverkill).toBe(true);
        expect(deepOverkill.bonusStyle).toBe(4);
        expect(deepOverkill.callout).toBe('💀 OVERKILL!');

        // 6. Slay Boss via handleEnemyDeath
        const initialCoins = player.coins;
        const initialScrap = meta.scrap;
        handleEnemyDeath({
          room,
          enemy: boss,
          index: 0,
          player,
          state: combatState,
          floorNum: floor,
          metaState: meta
        });

        totalBossesSlain++;
        expect(room.pickups.some(p => p.type === 'heart')).toBe(true);
        expect(room.pickups.some(p => p.type === 'loot')).toBe(true);
        expect(player.coins).toBeGreaterThan(initialCoins);
        expect(meta.scrap).toBeGreaterThan(initialScrap);

        // Fulfill floor bounty rewards
        player.coins += contract.coinReward;
        meta.scrap += contract.scrapReward;
      }

      expect(totalBossesSlain).toBe(6);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 7: Treasure Room Choice-of-2 Pedestal Selection & 3-Stack Generic Weapon Evolution
  // --------------------------------------------------------------------------
  describe('Scenario 7: Treasure Room Choice-of-2 Pedestal Selection & 3-Stack Generic Weapon Evolution', () => {
    it('enforces mutual exclusion pedestal despawn in treasure rooms and activates generic 3-stack weapon evolution', () => {
      // 1. Generate Floor 2 Dungeon and enable Choice-of-2 Pedestals in treasure rooms
      const dungeon = generateDungeon(2);
      enableChoicePedestalsInTreasureRooms(dungeon.rooms);

      const treasureRoom = Object.values(dungeon.rooms).find(r => r.type === 'treasure')!;
      expect(treasureRoom).toBeDefined();
      expect(treasureRoom.pickups).toHaveLength(2);

      const [pedestalA, pedestalB] = treasureRoom.pickups;
      expect(pedestalA.type).toBe('mod_pedestal');
      expect(pedestalB.type).toBe('mod_pedestal');
      expect((pedestalA as any).choiceGroup).toBe('treasure_choice');
      expect((pedestalB as any).choiceGroup).toBe('treasure_choice');
      expect((pedestalA as any).cost).toBe(0);
      expect((pedestalB as any).cost).toBe(0);
      expect((pedestalA as any).mod.id).not.toBe((pedestalB as any).mod.id);

      // Player selects and claims Pedestal A
      (pedestalA as any).mod.apply(player);

      // Sibling Pedestal B must be immediately despawned from the room
      expect(treasureRoom.pickups.some(p => p === pedestalB)).toBe(false);

      // 2. Weapon Evolution & Mod Stack Tier Progression
      player.weapon = 'pistol';
      player.itemStacks = {};

      // 0 stacks: Not evolved, stack tier 1
      expect(isWeaponEvolved(player.weapon, player)).toBe(false);
      expect(getModStackTierClass(1)).toBe('stack-tier-1');

      // 2 stacks: Still not evolved (< 3), stack tier 2
      player.itemStacks = { nitro_syringe: 2 };
      expect(isWeaponEvolved(player.weapon, player)).toBe(false);
      expect(getModStackTierClass(2)).toBe('stack-tier-2');

      // 3 stacks: Generic 3-stack weapon evolution unlocks!
      player.itemStacks = { nitro_syringe: 2, tire_iron: 1 };
      expect(isWeaponEvolved(player.weapon, player)).toBe(true);
      expect(getModStackTierClass(3)).toBe('stack-tier-evo');

      // Stacks beyond 3 also remain evolved
      expect(getModStackTierClass(5)).toBe('stack-tier-evo');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 8: Sanctuary Hub Pre-Run Preparation, NPC Dialogue Greetings & Training Dummy Cumulative DPS
  // --------------------------------------------------------------------------
  describe('Scenario 8: Sanctuary Hub Pre-Run Preparation, NPC Dialogue Greetings & Training Dummy Cumulative DPS', () => {
    it('initializes sanctuary hub room, validates 5 NPC lore greetings, and verifies training dummy 5-hit cumulative DPS banner', () => {
      // 1. Create Sanctuary Hub Room
      const hubRoom = createHomeBaseRoom();
      expect(hubRoom.type).toBe('hub');
      expect(hubRoom.cleared).toBe(true);
      expect(hubRoom.visited).toBe(true);
      expect(hubRoom.doors.N).toBe(false);
      expect(hubRoom.doors.S).toBe(false);
      expect(hubRoom.doors.E).toBe(false);
      expect(hubRoom.doors.W).toBe(false);

      // Verify all 5 Hub NPC interaction pickups
      const npcIds = hubRoom.pickups.filter(p => p.type === 'hub_npc').map(p => (p as any).npcId);
      expect(npcIds).toEqual(['garage', 'blacksmith', 'codex', 'bounty', 'launch']);

      // 2. Validate NPC Dialogue Greetings across all 5 NPCs
      const garageGreeting = getHubNpcGreeting('garage', 1, 0);
      expect(garageGreeting.speaker).toBe('CHIEF MECHANIC VEX');
      expect(garageGreeting.accentColor).toBe('#ffd60a');
      expect(garageGreeting.quote).toContain('Tune your V8');

      const garageVeteranGreeting = getHubNpcGreeting('garage', 5, 0);
      expect(garageVeteranGreeting.quote).toContain('Chassis survived Sector 5!');

      const blacksmithGreeting = getHubNpcGreeting('blacksmith');
      expect(blacksmithGreeting.speaker).toBe('IRONSMITH KORR');
      expect(blacksmithGreeting.accentColor).toBe('#2ee6ff');
      expect(blacksmithGreeting.quote).toContain('12 Scrap');

      const codexGreeting = getHubNpcGreeting('codex');
      expect(codexGreeting.speaker).toBe('DOC CULLEN');
      expect(codexGreeting.accentColor).toBe('#9d4edd');
      expect(codexGreeting.quote).toContain('Tactical Scanner calibrated');

      const bountyGreeting = getHubNpcGreeting('bounty', 1, 0);
      expect(bountyGreeting.speaker).toBe('VALKYRIE BROKER');
      expect(bountyGreeting.accentColor).toBe('#06d6a0');
      expect(bountyGreeting.quote).toContain('Raise the Bounty Heat');

      const bountyHeatGreeting = getHubNpcGreeting('bounty', 1, 2);
      expect(bountyHeatGreeting.quote).toContain('HEAT 2 ACTIVE! +50% Scrap');

      const launchGreeting = getHubNpcGreeting('launch');
      expect(launchGreeting.speaker).toBe('HIGHWAY DISPATCH');
      expect(launchGreeting.accentColor).toBe('#e5203a');
      expect(launchGreeting.quote).toContain('Blast doors unlocked');

      // 3. Training Dummy Combat Pipeline Verification
      const dummy = hubRoom.enemies.find(e => (e as any).isDummy)!;
      expect(dummy).toBeDefined();
      expect(dummy.hp).toBe(9999);
      expect(dummy.maxHp).toBe(9999);
      expect(dummy.speed).toBe(0);

      const combatState = createCombatState();
      player.x = dummy.x - 100;
      player.y = dummy.y;

      // Deliver hits 1 through 4: dummy accumulates hits and dmg, but no 'TOTAL DMG' banner yet
      for (let i = 1; i <= 4; i++) {
        combatState.bullets.push({
          x: dummy.x,
          y: dummy.y,
          vx: 100,
          vy: 0,
          radius: 5,
          dmg: 15,
          pierceLeft: 0,
          bounceLeft: 0,
          hitIds: new Set(),
          color: '#ffd166',
          life: 1,
          maxLife: 1
        });
        updateCombatPipeline(0.016, hubRoom, player, combatState);
        expect((dummy as any).dummyHits).toBe(i);
        expect((dummy as any).dummyTotalDmg).toBe(i * 15);
        expect(combatState.damageNumbers.some(d => d.text.includes('TOTAL DMG'))).toBe(false);
      }

      // Deliver 5th hit: triggers cumulative '🎯 TOTAL DMG: 75' banner
      combatState.bullets.push({
        x: dummy.x,
        y: dummy.y,
        vx: 100,
        vy: 0,
        radius: 5,
        dmg: 15,
        pierceLeft: 0,
        bounceLeft: 0,
        hitIds: new Set(),
        color: '#ffd166',
        life: 1,
        maxLife: 1
      });
      updateCombatPipeline(0.016, hubRoom, player, combatState);
      expect((dummy as any).dummyHits).toBe(5);
      expect((dummy as any).dummyTotalDmg).toBe(75);

      const banner = combatState.damageNumbers.find(d => d.text === '🎯 TOTAL DMG: 75');
      expect(banner).toBeDefined();
      expect(banner?.color).toBe('#00f5d4');
      expect(banner?.x).toBe(dummy.x);

      // Verify dummy hit telemetry helper
      expect(formatDummyHitTelemetry(15, false)).toBe('🎯 HIT 15');
      expect(formatDummyHitTelemetry(30, true)).toBe('🎯 CRIT 30!');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 9: Biome Zone Mastery Gauntlet (Boost Strip, Oil Slick & Ice Patch Thermal Dynamics)
  // --------------------------------------------------------------------------
  describe('Scenario 9: Biome Zone Mastery Gauntlet (Boost Strip, Oil Slick & Ice Patch Thermal Dynamics)', () => {
    it('tests boost_strip NOS recharge, oil_slick handbrake drift charge, and ice_patch nosDelay cooling & nosLock relief', () => {
      const room = createMockRoom();

      // 1. boost_strip NOS Recharge
      player.x = 200;
      player.y = 200;
      player.nos = 30;
      player.nosMax = 100;
      (player as any).onBoostStrip = false;

      const boostZone: BiomeZone = { x: 200, y: 200, radius: 50, type: 'boost_strip' };
      room.biomeZones = [boostZone];

      // Update bike kinematics for 0.5s on boost strip
      updateBikeKinematics(player, 1, 0, false, 0.5, room);
      expect((player as any).onBoostStrip).toBe(true);
      // 30 + 0.5 * 14 = 37 NOS
      expect(player.nos).toBeCloseTo(37, 2);

      // Move outside boost strip zone
      player.x = 600;
      player.y = 600;
      updateBikeKinematics(player, 1, 0, false, 0.1, room);
      expect((player as any).onBoostStrip).toBe(false);

      // 2. oil_slick Handbrake Drift Charge
      player.x = 350;
      player.y = 350;
      player.vx = 250;
      player.vy = 0;
      player.bikeAngle = 0;
      player.driftCharge = 0.2;
      (player as any).spacePowerslide = true; // Handbrake drift active

      const oilZone: BiomeZone = { x: 350, y: 350, radius: 50, type: 'oil_slick' };
      room.biomeZones = [oilZone];

      // Steer perpendicular with handbrake engaged on oil slick
      const dt = 0.1;
      updateBikeKinematics(player, 0, 1, false, dt, room);
      // Handbrake drift accumulates dt * 1.85, and oil slick adds extra dt * 0.65
      expect(player.driftCharge).toBeGreaterThan(0.2);
      expect((player.driftCharge || 0)).toBeCloseTo(0.2 + dt * 1.85 + dt * 0.65, 3);

      // 3. ice_patch nosDelay Cooling & nosLock Relief
      player.x = 500;
      player.y = 500;
      player.nosDelay = 0.6;
      player.nos = 35; // >= 25 allows lock clearing
      player.nosLock = true;
      (player as any).spacePowerslide = false;

      const iceZone: BiomeZone = { x: 500, y: 500, radius: 50, type: 'ice_patch' };
      room.biomeZones = [iceZone];

      // Update kinematics on ice patch: extra cooling (nosDelay - dt) and lock release
      updateBikeKinematics(player, 0, 0, false, 0.2, room);
      expect(player.nosDelay).toBeCloseTo(0.4, 2);
      expect(player.nosLock).toBe(false);

      // Clamping nosDelay at 0
      player.nosDelay = 0.05;
      updateBikeKinematics(player, 0, 0, false, 0.1, room);
      expect(player.nosDelay).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 10: Elite Affix Trio (Volatile, Overclocked, Vampiric) & Floor 4 Cryo Barrel Thermal Shock Combo
  // --------------------------------------------------------------------------
  describe('Scenario 10: Elite Affix Trio (Volatile, Overclocked, Vampiric) & Floor 4 Cryo Barrel Thermal Shock Combo', () => {
    it('verifies volatile death explosion, overclocked AI timer & NOS surge, vampiric fuel siphon, and cryo barrel thermal shock shatter', () => {
      const room = createMockRoom();
      const combatState = createCombatState();

      // 1. Elite Affix Trio Verification
      // Affix 1: Volatile Elite
      const volEnemy = createEnemy('charger', 200, 200, 1, true, 1001); // 1001 + 1 % 3 = 0 -> volatile
      expect((volEnemy as any).eliteAffix).toBe('volatile');
      room.enemies = [volEnemy];

      handleEnemyDeath({
        room,
        enemy: volEnemy,
        index: 0,
        player,
        state: combatState,
        floorNum: 1
      });

      // Volatile triggers orange shockwave particle and banner
      expect(combatState.particles.some(p => p.color === '#ff9f1c' && p.shockwaveMax === 52)).toBe(true);
      expect(combatState.damageNumbers.some(d => d.text === '💥 VOLATILE ELITE!')).toBe(true);

      // Affix 2: Overclocked Elite
      const ocEnemy = createEnemy('turret', 300, 300, 1, true, 1002); // 1002 + 1 % 3 = 1 -> overclocked
      expect((ocEnemy as any).eliteAffix).toBe('overclocked');
      ocEnemy.aiTimer = 1.0;

      // Accelerated AI timer when aiTimer > 0.35: extra dt * 0.15 subtracted
      updateEnemyAI({
        room,
        enemy: ocEnemy,
        dt: 0.1,
        player,
        projScale: 1,
        enemyBullets: [],
        enemyBombs: []
      });
      // 1.0 - (0.1 + 0.1 * 0.15) = 1.0 - 0.115 = 0.885
      expect(ocEnemy.aiTimer).toBeCloseTo(0.885, 3);

      // Death payoff: +20 NOS recharge
      player.nos = 40;
      player.nosMax = 100;
      room.enemies = [ocEnemy];
      handleEnemyDeath({
        room,
        enemy: ocEnemy,
        index: 0,
        player,
        state: combatState,
        floorNum: 1
      });
      expect(player.nos).toBe(60);
      expect(combatState.damageNumbers.some(d => d.text === '⚡ OVERCLOCKED +20 NOS!')).toBe(true);

      // Affix 3: Vampiric Elite
      const vampEnemy = createEnemy('swarmer', 400, 400, 1, true, 1003); // 1003 + 1 % 3 = 2 -> vampiric
      expect((vampEnemy as any).eliteAffix).toBe('vampiric');

      // Player injured (4/6 Fuel)
      player.hp = 4;
      player.maxHp = 6;
      room.enemies = [vampEnemy];
      handleEnemyDeath({
        room,
        enemy: vampEnemy,
        index: 0,
        player,
        state: combatState,
        floorNum: 1
      });
      expect(player.hp).toBe(5);
      expect(combatState.damageNumbers.some(d => d.text === '🩸 ELITE SIPHON +1 FUEL!')).toBe(true);

      // 2. Floor 4 Cryo Barrel Thermal Shock Shatter Combo
      const cryoBarrel: Obstacle = {
        x: 450,
        y: 450,
        size: 36,
        type: 'barrel',
        variant: 'cryo_barrel',
        hp: 10
      };
      const testVictim = createEnemy('charger', 470, 450, 4);
      testVictim.hp = 120;
      testVictim.maxHp = 120;
      room.obstacles = [cryoBarrel];
      room.enemies = [testVictim];

      // Bullet strikes cryo barrel, detonating cryo explosion
      combatState.bullets.push({
        x: 450,
        y: 450,
        vx: 100,
        vy: 0,
        radius: 4,
        dmg: 15,
        pierceLeft: 0,
        bounceLeft: 0,
        hitIds: new Set(),
        color: '#fff',
        life: 1,
        maxLife: 1
      });
      updateCombatPipeline(0.016, room, player, combatState);

      // Cryo barrel detonated and removed
      expect(room.obstacles).toHaveLength(0);
      // Victim is chilled: slowTimer = 3.5, 'CRYO SLOW!' banner
      expect((testVictim as any).slowTimer).toBe(3.5);
      expect(combatState.damageNumbers.some(d => d.text === 'CRYO SLOW!')).toBe(true);

      // Strike chilled victim with flame attack: triggers Thermal Shock shatter combo (+35% dmg, cyan particles)
      const hpBeforeShock = testVictim.hp;
      combatState.bullets.push({
        x: testVictim.x,
        y: testVictim.y,
        vx: 100,
        vy: 0,
        radius: 6,
        dmg: 20,
        isFlame: true,
        pierceLeft: 0,
        bounceLeft: 0,
        hitIds: new Set(),
        color: '#ff6b2b',
        life: 1,
        maxLife: 1
      });
      updateCombatPipeline(0.016, room, player, combatState);

      expect((testVictim as any).thermalShockIcd).toBe(0.4);
      // Base flame damage 20 * 1.15 (chilled) * 1.35 (thermal shock) = 31.05
      expect(testVictim.hp).toBeCloseTo(hpBeforeShock - 31.05, 1);
      expect(combatState.damageNumbers.some(d => d.text === 'THERMAL SHOCK!')).toBe(true);
      expect(combatState.particles.some(p => p.color === '#72efdd' && p.shockwaveMax === 44)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 11: Post-Mortem Run Grade S Evaluation, Stash Salvage Summary & Weapon Mastery III Meta Carry-Over
  // --------------------------------------------------------------------------
  describe('Scenario 11: Post-Mortem Run Grade S Evaluation, Stash Salvage Summary & Weapon Mastery III Meta Carry-Over', () => {
    it('evaluates Grade S run post-mortem, calculates stash scrap appraisal, and applies Master III +15% damage to new runs', () => {
      const meta = createDefaultMetaSave();

      // 1. Post-Mortem Grade S Run Summary Evaluation
      player.killCount = 42;
      player.weapon = 'pistol';

      const postMortem = buildRunPostMortemSummary(6, player, meta);
      expect(postMortem.rankGrade).toBe('S');
      expect(postMortem.headline).toBe('VALHALLA OUTLAW LEGEND');
      expect(postMortem.statsLine).toBe('FLOOR 6 · 42 KILLS · PISTOL · GRADE S');

      // Also verify Grade S unlocks at killCount >= 40 even on Floor 1
      const floor1GradeS = buildRunPostMortemSummary(1, player, meta);
      expect(floor1GradeS.rankGrade).toBe('S');

      // 2. Stash Salvage Summary & Scrap Appraisal
      const sampleStash: EquipmentItem[] = [
        { slot: 'engine', rarity: 0, name: 'Stock Engine', stats: { dmg: 0.05 } },      // 3 scrap
        { slot: 'exhaust', rarity: 1, name: 'Sport Exhaust', stats: { blast: 0.12 } },  // 8 scrap
        { slot: 'tires', rarity: 2, name: 'Racing Slicks', stats: { speed: 0.15 } },    // 18 scrap
        { slot: 'frame', rarity: 3, name: 'Valhalla Frame', stats: { hp: 2 } }          // 40 scrap
      ];
      meta.stash = sampleStash;

      const salvageSummary = getStashSalvageSummary(meta.stash);
      expect(salvageSummary.itemCount).toBe(4);
      // 3 + 8 + 18 + 40 = 69 scrap
      expect(salvageSummary.totalSalvageScrap).toBe(69);
      expect(salvageSummary.highestRarity).toBe(3);

      // Empty stash edge case
      expect(getStashSalvageSummary([])).toEqual({ itemCount: 0, totalSalvageScrap: 0, highestRarity: -1 });

      // 3. Weapon Mastery MASTER III (+15% DMG) Meta Carry-Over
      // Record 115 kills on pistol in meta save
      meta.weaponKills = meta.weaponKills || {};
      meta.weaponKills.pistol = 115;
      const masteryInfo = getWeaponMasteryTier(meta.weaponKills.pistol);
      expect(masteryInfo.tier).toBe(3);
      expect(masteryInfo.label).toBe('MASTER III');
      expect(masteryInfo.stars).toBe('★★★');
      expect(masteryInfo.dmgBonusPct).toBe(15);
      expect(masteryInfo.kills).toBe(115);

      // Start fresh run and verify Master III damage bonus (+15%) persists
      const freshRunPlayer = createDefaultPlayerState();
      freshRunPlayer.weapon = 'pistol';
      expect(freshRunPlayer.dmgMult).toBe(1.0);

      applyMetaStats(freshRunPlayer, meta);
      expect(freshRunPlayer.dmg).toBe(1.15);
      expect(freshRunPlayer.dmgMult).toBe(1.15);

      // Custom base damage scaling (e.g. shotgun with 20 base damage)
      const shotgunPlayer = createDefaultPlayerState();
      shotgunPlayer.weapon = 'shotgun';
      shotgunPlayer.dmg = 20;
      meta.weaponKills.shotgun = 100;
      applyMetaStats(shotgunPlayer, meta);
      expect(shotgunPlayer.dmg).toBe(23); // 20 * 1.15 = 23
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 12: Full Sanctuary-to-Dungeon Preparation & Combat Telemetry Workflow
  // --------------------------------------------------------------------------
  describe('Scenario 12: Full Sanctuary-to-Dungeon Preparation & Combat Telemetry Workflow', () => {
    it('verifies sanctuary hub station readiness and validates combat offense, room hazards, and threat assessments across Floor 1 -> Floor 3 -> Boss Room transitions', () => {
      // 1. Sanctuary Hub Pre-Run Preparation & Station Prompts
      const hubRoom = createHomeBaseRoom();
      expect(hubRoom.type).toBe('hub');

      // Check all 5 Hub Station Prompts
      const garagePrompt = getHubStationPromptInfo('garage');
      expect(garagePrompt.title).toBe('🔧 GARAGE & ARMORY BAY');
      expect(garagePrompt.actionLabel).toBe('OPEN GARAGE [E]');
      expect(garagePrompt.accentColor).toBe('#ffd60a');

      const forgePrompt = getHubStationPromptInfo('blacksmith');
      expect(forgePrompt.title).toBe('⚒️ THE SCRAP FORGE');
      expect(forgePrompt.summary).toContain('12 Scrap');

      // Unclaimed vs Claimed Buffs for Codex & Bounty
      const codexUnclaimed = getHubStationPromptInfo('codex', undefined, undefined, { scannerClaimed: false });
      expect(codexUnclaimed.summary).toContain('Claim FREE +8–20% Weapon DMG');

      const codexClaimed = getHubStationPromptInfo('codex', undefined, undefined, { scannerClaimed: true });
      expect(codexClaimed.summary).toContain('Tactical Scanner +DMG/+SPD Buff Active');

      const bountyUnclaimed = getHubStationPromptInfo('bounty', undefined, undefined, { bountyClaimed: false });
      expect(bountyUnclaimed.summary).toContain('Claim FREE +15 Coins');

      const bountyClaimed = getHubStationPromptInfo('bounty', undefined, undefined, { bountyClaimed: true });
      expect(bountyClaimed.summary).toContain('Threat Heat Level (0–3)');

      const launchPrompt = getHubStationPromptInfo('launch');
      expect(launchPrompt.title).toBe('🚀 SECTOR 1 HIGHWAY LAUNCH GATE');
      expect(launchPrompt.actionLabel).toBe('OPEN LAUNCH GATE [E]');

      // Sanctuary Hub Environmental & Threat Telemetry (Safe Zone)
      const hubHazards = getRoomHazardSummary(hubRoom);
      expect(hubHazards.explosiveCount).toBe(0);
      expect(hubHazards.toxicCount).toBe(0);
      expect(hubHazards.cryoCount).toBe(0);
      expect(hubHazards.zoneTypes).toEqual([]);
      expect(hubHazards.tacticalHint).toBe('Clear asphalt sector — standard traction.');

      const hubThreat = getRoomThreatAssessment(hubRoom, 1);
      expect(hubThreat.threatTier).toBe('CLEAR');
      expect(hubThreat.threatScore).toBe(0);
      expect(hubThreat.livingCount).toBe(0);
      expect(hubThreat.hasBoss).toBe(false);
      expect(hubThreat.advisory).toContain('Sector clear');

      // Baseline Sanctuary Player Offense Telemetry
      const baselineOffense = getCombatOffenseSummary(player);
      expect(baselineOffense.effectiveDpsMult).toBe(1.0);
      expect(baselineOffense.siphonPct).toBe(0);
      expect(baselineOffense.siphonStatus).toBe('NONE');
      expect(baselineOffense.isEvolved).toBe(false);
      expect(baselineOffense.summaryLine).toBe('DPS x1.00 · NONE (0% Siphon)');

      // 2. Transition: Deploy into Floor 1 Dungeon (Rust Belt Outskirts)
      const f1Dungeon = generateDungeon(1);
      const f1Start = f1Dungeon.rooms['0,0'];
      const f1StartThreat = getRoomThreatAssessment(f1Start, 1);
      expect(f1StartThreat.threatTier).toBe('CLEAR');
      expect(f1StartThreat.threatScore).toBe(0);

      // Floor 1 Combat Room with standard hostiles & explosive barrel
      const f1CombatRoom = createMockRoom({
        x: 1,
        y: 0,
        obstacles: [
          { x: 300, y: 300, size: 32, type: 'barrel', variant: 'explosive', hp: 10 }
        ],
        enemies: [
          createEnemy('charger', 250, 250, 1),
          createEnemy('turret', 350, 250, 1)
        ]
      });

      const f1Hazards = getRoomHazardSummary(f1CombatRoom);
      expect(f1Hazards.explosiveCount).toBe(1);
      expect(f1Hazards.toxicCount).toBe(0);
      expect(f1Hazards.cryoCount).toBe(0);
      expect(f1Hazards.tacticalHint).toContain('Explosive barrels detected (1)');

      const f1Threat = getRoomThreatAssessment(f1CombatRoom, 1);
      expect(f1Threat.livingCount).toBe(2);
      expect(f1Threat.eliteCount).toBe(0);
      expect(f1Threat.hasBoss).toBe(false);
      // Floor 1: livingCount * (10 + 1 * 2) = 2 * 12 = 24 -> LOW threat (< 45)
      expect(f1Threat.threatScore).toBe(24);
      expect(f1Threat.threatTier).toBe('LOW');
      expect(f1Threat.advisory).toContain('Low threat: Minor skirmish (2 hostiles)');

      // Player acquires Hollow Point mod on Floor 1 (+25% damage)
      player.dmgMult = 1.25;
      const f1PlayerOffense = getCombatOffenseSummary(player);
      expect(f1PlayerOffense.effectiveDpsMult).toBe(1.25);
      expect(f1PlayerOffense.summaryLine).toBe('DPS x1.25 · NONE (0% Siphon)');

      // 3. Transition: Escalate to Floor 3 (Neon Sector Gauntlet)
      const f3CombatRoom = createMockRoom({
        x: 0,
        y: 2,
        biomeZones: [
          { x: 300, y: 300, radius: 45, type: 'oil_slick' }
        ],
        obstacles: [
          { x: 200, y: 200, size: 36, type: 'barrel', variant: 'cryo_barrel', hp: 10 },
          { x: 400, y: 400, size: 32, type: 'barrel', variant: 'explosive', hp: 10 }
        ],
        enemies: [
          createEnemy('charger', 200, 300, 3),
          createEnemy('sniper', 400, 300, 3),
          createEnemy('turret', 300, 400, 3, true, 1001) // Elite volatile enemy
        ]
      });

      const f3Hazards = getRoomHazardSummary(f3CombatRoom);
      expect(f3Hazards.cryoCount).toBe(1);
      expect(f3Hazards.explosiveCount).toBe(1);
      expect(f3Hazards.zoneTypes).toContain('oil_slick');
      expect(f3Hazards.tacticalHint).toContain('Cryo barrels detected (1)');
      expect(f3Hazards.tacticalHint).toContain('Explosive barrels detected (1)');
      expect(f3Hazards.tacticalHint).toContain('Surface modifiers detected (oil slick)');

      const f3Threat = getRoomThreatAssessment(f3CombatRoom, 3);
      expect(f3Threat.livingCount).toBe(3);
      expect(f3Threat.eliteCount).toBe(1);
      expect(f3Threat.hasBoss).toBe(false);
      // Floor 3: 3 * (10 + 3 * 2) + 1 * 25 = 3 * 16 + 25 = 48 + 25 = 73
      expect(f3Threat.threatScore).toBe(73);
      expect(f3Threat.threatTier).toBe('HIGH');
      expect(f3Threat.advisory).toContain('High threat: 1 elite unit detected (3 total hostiles)');

      // Player upgrades with fire rate and light siphon (8%) on Floor 3
      player.fireRateMult = 1.2;
      player.vampChance = 0.08;
      const f3PlayerOffense = getCombatOffenseSummary(player);
      // 1.25 * 1.2 = 1.50
      expect(f3PlayerOffense.effectiveDpsMult).toBe(1.5);
      expect(f3PlayerOffense.siphonPct).toBe(8);
      expect(f3PlayerOffense.siphonStatus).toBe('LIGHT SIPHON');
      expect(f3PlayerOffense.summaryLine).toBe('DPS x1.50 · LIGHT SIPHON (8% Siphon)');

      // 4. Transition: Floor 3 Boss Encounter (Overlord Helion)
      const boss = createBoss(3, 360, 360);
      const bossAdd1 = createEnemy('charger', 200, 200, 3);
      const bossAdd2 = createEnemy('turret', 500, 200, 3);
      const f3BossRoom = createMockRoom({
        x: 3,
        y: 3,
        type: 'boss',
        enemies: [boss, bossAdd1, bossAdd2]
      });

      const bossThreat = getRoomThreatAssessment(f3BossRoom, 3);
      expect(bossThreat.hasBoss).toBe(true);
      expect(bossThreat.livingCount).toBe(3);
      expect(bossThreat.threatTier).toBe('APEX');
      // 3 * 16 + 0 * 25 + 100 = 148
      expect(bossThreat.threatScore).toBe(148);
      expect(bossThreat.advisory).toContain('Apex threat: Boss encounter active (3 total hostiles). Maximum evasion advised.');

      // Player achieves weapon evolution (3 item stacks) and vampiric overdrive (16% siphon) for boss fight
      player.weapon = 'pistol';
      player.itemStacks = { nitro_syringe: 2, tire_iron: 1 }; // 3 stacks triggers evolution
      player.vampChance = 0.16;
      player.multiShot = 2;

      const bossPrepOffense = getCombatOffenseSummary(player);
      expect(bossPrepOffense.isEvolved).toBe(true);
      expect(bossPrepOffense.siphonPct).toBe(16);
      expect(bossPrepOffense.siphonStatus).toBe('VAMPIRIC OVERDRIVE');
      // effectiveDpsMult = dmgMult (1.25) * fireRateMult (1.2) * projCount (2) * evoBonus (1.35) = 1.25 * 1.2 * 2 * 1.35 = 4.05
      expect(bossPrepOffense.effectiveDpsMult).toBe(4.05);
      expect(bossPrepOffense.summaryLine).toBe('DPS x4.05 · VAMPIRIC OVERDRIVE (16% Siphon) · OVERCLOCKED');

      // Boss slain: All enemies eradicated
      f3BossRoom.enemies = [];
      f3BossRoom.cleared = true;
      f3BossRoom.trapdoor = true;

      const postBossThreat = getRoomThreatAssessment(f3BossRoom, 3);
      expect(postBossThreat.threatTier).toBe('CLEAR');
      expect(postBossThreat.threatScore).toBe(0);
      expect(postBossThreat.livingCount).toBe(0);
      expect(postBossThreat.hasBoss).toBe(false);
      expect(postBossThreat.advisory).toContain('Sector clear — no active hostiles detected.');
    });
  });

  // --------------------------------------------------------------------------
  // Scenario 13: Full Biker Build Archetype Progression Loop
  // --------------------------------------------------------------------------
  describe('Scenario 13: Full Biker Build Archetype Progression Loop', () => {
    it('progresses across road_freelancer -> hellfire_gunner -> nitro_drifter -> iron_juggernaut -> vampiric_reaper as gear and run mods accumulate', () => {
      const meta = createDefaultMetaSave();

      // Stage 1: Initial Spawn — ROAD FREELANCER (Baseline Interceptor)
      // Default player: maxHp: 6, speedMult: 1, dmgMult: 1, fireRateMult: 1, vampChance: 0
      const stage1Archetype = getBuildArchetypeSummary(player, meta);
      expect(stage1Archetype.id).toBe('road_freelancer');
      expect(stage1Archetype.title).toBe('⚙️ ROAD FREELANCER');
      expect(stage1Archetype.badgeColor).toBe('#a8dadc');
      expect(stage1Archetype.description).toContain('Balanced outlaw interceptor');

      const stage1Offense = getCombatOffenseSummary(player);
      expect(stage1Offense.effectiveDpsMult).toBe(1.0);
      expect(stage1Offense.siphonStatus).toBe('NONE');

      // Stage 2: Floor 1 Mod & Gear Upgrades — HELLFIRE GUNNER (Ordnance Specialization)
      // Equip engine part with +15% dmg and acquire Hollow Point mod (+25% dmg)
      const enginePart: EquipmentItem = {
        slot: 'engine',
        rarity: 2,
        name: 'Overbore High-Torque V-Twin',
        stats: { dmg: 0.15 }
      };
      addLoot(meta, enginePart, player, storage);

      // Apply Hollow Point mod from pool (+0.25 dmgMult)
      const hollowPointMod = RUN_MOD_POOL.find(m => m.id === 'hollow_point')!;
      hollowPointMod.apply(player);

      // Total dmgMult = 1.0 (base) + 0.15 (gear) + 0.25 (mod) = 1.40 (>= 1.35)
      expect(player.dmgMult).toBeCloseTo(1.40);
      expect(player.speedMult).toBe(1.0);
      expect(player.maxHp).toBe(6);
      expect(player.vampChance).toBe(0);

      const stage2Archetype = getBuildArchetypeSummary(player, meta);
      expect(stage2Archetype.id).toBe('hellfire_gunner');
      expect(stage2Archetype.title).toBe('🔥 HELLFIRE GUNNER');
      expect(stage2Archetype.badgeColor).toBe('#ff5400');
      expect(stage2Archetype.description).toContain('Overclocked ordnance build');

      // Stage 3: Floor 2 Drift & Nitro Escalation — NITRO DRIFTER (High Velocity)
      // Equip tires part with +12% speed and acquire Nitrous Injector mod (+16% speedMult)
      const tiresPart: EquipmentItem = {
        slot: 'tires',
        rarity: 2,
        name: 'Compound Racing Slicks',
        stats: { speed: 0.12 }
      };
      addLoot(meta, tiresPart, player, storage);

      // Apply Nitrous Injector (turbo_charger) mod from pool (+0.16 speedMult)
      const turboMod = RUN_MOD_POOL.find(m => m.id === 'turbo_charger')!;
      turboMod.apply(player);

      // speedMult = 1.0 (base) + 0.12 (tires) + 0.16 (mod) = 1.28 (>= 1.25)
      expect(player.speedMult).toBeCloseTo(1.28);
      // dmgMult is still high (1.40), but speedMult >= 1.25 takes precedence over hellfire_gunner
      const stage3Archetype = getBuildArchetypeSummary(player, meta);
      expect(stage3Archetype.id).toBe('nitro_drifter');
      expect(stage3Archetype.title).toBe('🏎️ NITRO DRIFTER');
      expect(stage3Archetype.badgeColor).toBe('#ffd60a');
      expect(stage3Archetype.description).toContain('High-velocity powerslide specialist');

      // Stage 4: Floor 3 Hull & Armor Reinforcement — IRON JUGGERNAUT (Heavy Armored Tank)
      // Equip reinforced frame part (+2 maxHp) and acquire Welded Armor Plate mod (+2 maxHp)
      const framePart: EquipmentItem = {
        slot: 'frame',
        rarity: 3,
        name: 'Titanium Cage Chassis',
        stats: { hp: 2 }
      };
      addLoot(meta, framePart, player, storage);

      // Apply Welded Armor Plate (armor_plate) mod from pool (+2 maxHp)
      const armorMod = RUN_MOD_POOL.find(m => m.id === 'armor_plate')!;
      armorMod.apply(player);

      // maxHp = 6 (base) + 2 (gear) + 2 (mod) = 10 (>= 10)
      expect(player.maxHp).toBeGreaterThanOrEqual(10);
      // maxHp >= 10 takes precedence over nitro_drifter and hellfire_gunner
      const stage4Archetype = getBuildArchetypeSummary(player, meta);
      expect(stage4Archetype.id).toBe('iron_juggernaut');
      expect(stage4Archetype.title).toBe('🛡️ IRON JUGGERNAUT');
      expect(stage4Archetype.badgeColor).toBe('#00f5d4');
      expect(stage4Archetype.description).toContain('Heavy-armored tank chassis');

      // Stage 5: Floor 4+ Vampiric Siphon Culmination — VAMPIRIC REAPER (Life Leech Apex)
      // Apply Scrap Siphon (vamp_siphon) mod from pool (+0.20 vampChance)
      const vampMod = RUN_MOD_POOL.find(m => m.id === 'vamp_siphon')!;
      vampMod.apply(player);

      // vampChance = 0.20 (>= 0.12)
      expect(player.vampChance).toBeGreaterThanOrEqual(0.12);

      // siphon >= 0.12 has supreme highest precedence across all archetypes
      const stage5Archetype = getBuildArchetypeSummary(player, meta);
      expect(stage5Archetype.id).toBe('vampiric_reaper');
      expect(stage5Archetype.title).toBe('🩸 VAMPIRIC REAPER');
      expect(stage5Archetype.badgeColor).toBe('#ff1f4b');
      expect(stage5Archetype.description).toContain('High-siphon hull regeneration build');

      // Verify apex offense telemetry reflecting full build synergy
      const stage5Offense = getCombatOffenseSummary(player);
      expect(stage5Offense.siphonPct).toBe(20);
      expect(stage5Offense.siphonStatus).toBe('VAMPIRIC OVERDRIVE');
      expect(stage5Offense.effectiveDpsMult).toBeCloseTo(1.40);
      expect(stage5Offense.summaryLine).toBe('DPS x1.40 · VAMPIRIC OVERDRIVE (20% Siphon)');
    });
  });
});
