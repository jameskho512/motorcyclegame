/**
 * MOTO-ROGUE: Empirical Adversarial Challenge Suite (Milestone 1)
 *
 * Stress tests:
 * 1. Type coverage & untyped any escapes
 * 2. Prototype pollution & defensive lookup guards
 * 3. Edge-case states (empty inventory, max stash 18, zero/negative health, negative inputs)
 * 4. Run mod application boundary clamps (split_chamber min 0.6x, vamp_siphon max 0.60 cap)
 * 5. Deterministic generators & scoring oracles under extreme inputs
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  isWeaponId,
  getWeaponDef
} from '@/data/weapons';
import {
  RUN_MOD_POOL,
  calcUpgradeCost,
  ModPlayerTarget
} from '@/data/upgrades';
import {
  MAX_STASH,
  rollRarity,
  genLoot,
  itemScore,
  fmtStat,
  applyItemStats,
  EquipmentItem,
  EquipmentTargetPlayer,
  RarityTier
} from '@/data/equipment';
import {
  PlayerState,
  ARENA_WIDTH,
  ARENA_HEIGHT,
  MAX_STASH_SIZE
} from '@/types/game';
import { getFloorBountyContract, getHubNpcGreeting } from '@/world/dungeon';
import { getStyleAdrenalineBonus } from '@/systems/physics';
import {
  getPortalRiskAssessment,
  getNextSectorBriefing
} from '@/ui/portalModal';
import { HUDController } from '@/ui/hud';
import { MotoRogueApp } from '@/main';

describe('Adversarial Challenge 1: Type Strictness & Untyped Any Audit', () => {
  it('scans all src/ TypeScript files for ts-ignore, ts-expect-error, and ts-nocheck directives', () => {
    const srcDir = path.resolve(__dirname, '../../src');
    const files: string[] = [];

    function findTsFiles(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          findTsFiles(fullPath);
        } else if (entry.isFile() && entry.name.endsWith('.ts')) {
          files.push(fullPath);
        }
      }
    }

    findTsFiles(srcDir);
    expect(files.length).toBeGreaterThan(0);

    const violations: { file: string; line: number; directive: string }[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      const lines = content.split('\n');
      lines.forEach((line, idx) => {
        if (/@ts-ignore|@ts-expect-error|@ts-nocheck/.test(line)) {
          violations.push({ file: path.relative(srcDir, file), line: idx + 1, directive: line.trim() });
        }
      });
    }

    expect(violations).toEqual([]);
  });

  it('audits src/ for untyped any escapes in interface declarations', () => {
    const upgradesFile = path.resolve(__dirname, '../../src/data/upgrades.ts');
    const content = fs.readFileSync(upgradesFile, 'utf8');
    const lines = content.split('\n');

    const anyEscapes: { line: number; content: string }[] = [];
    lines.forEach((line, idx) => {
      // Look for untyped any escapes like "[key: string]: any;" or ": any"
      if (/:\s*any\b/.test(line)) {
        anyEscapes.push({ line: idx + 1, content: line.trim() });
      }
    });

    // We report this finding empirically:
    // If [key: string]: any exists, this test highlights the escape.
    // In strict TypeScript architecture, ModPlayerTarget should either extend PlayerState
    // or avoid untyped any index signatures.
    const hasAnyEscape = anyEscapes.length > 0;
    // Log the finding for our handoff report
    if (hasAnyEscape) {
      console.warn('CONFIRMED ESCAPE in upgrades.ts:', anyEscapes);
    }
    // We expect zero untyped any escapes according to the objective
    expect(anyEscapes, `Found untyped any escapes in src/data/upgrades.ts: ${JSON.stringify(anyEscapes)}`).toHaveLength(0);
  });
});

describe('Adversarial Challenge 2: Prototype Pollution & Defensive Lookups', () => {
  it('challenges isWeaponId against Object.prototype properties', () => {
    const prototypeKeys = ['toString', 'valueOf', 'constructor', 'hasOwnProperty', '__proto__'];

    for (const key of prototypeKeys) {
      const isValid = isWeaponId(key);
      // Bug check: 'toString' in WEAPONS is true in JS if not guarded with hasOwn!
      expect(isValid, `isWeaponId('${key}') must be false for prototype property`).toBe(false);
    }
  });

  it('challenges getWeaponDef against Object.prototype properties and unknown weapons', () => {
    // Calling getWeaponDef on prototype properties must fall back to pistol, NOT return a function!
    const def = getWeaponDef('toString');
    expect(def.id, "getWeaponDef('toString') must return fallback pistol, not Object.prototype.toString").toBe('pistol');
    expect(typeof def.damage).toBe('number');
    expect(typeof def.cooldown).toBe('number');

    const defConstructor = getWeaponDef('constructor');
    expect(defConstructor.id).toBe('pistol');

    const defNull = getWeaponDef('');
    expect(defNull.id).toBe('pistol');
  });

  it('challenges calcUpgradeCost against prototype properties and invalid inputs', () => {
    // If an invalid or prototype key is passed, cost should be Infinity (cannot purchase), not NaN!
    const costToString = calcUpgradeCost('toString' as any, 0);
    expect(Number.isNaN(costToString), "calcUpgradeCost('toString', 0) returned NaN instead of Infinity").toBe(false);
    expect(costToString).toBe(Infinity);

    const costInvalid = calcUpgradeCost('non_existent' as any, 0);
    expect(costInvalid).toBe(Infinity);
  });
});

describe('Adversarial Challenge 3: Edge-Case States (Empty Inventory, Max Stash, Health, Negatives)', () => {
  it('handles empty inventory, zero kill count, and default player state safely', () => {
    const emptyPlayer: PlayerState = {
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT / 2,
      vx: 0,
      vy: 0,
      radius: 17,
      bikeAngle: 0,
      aimAngle: 0,
      baseSpeed: 210,
      hp: 6,
      maxHp: 6,
      coins: 0,
      invuln: 0,
      weapon: 'pistol',
      runWeapons: {},
      fireTimer: 0,
      dmgMult: 1.0,
      fireRateMult: 1.0,
      speedMult: 1.0,
      projSpeedMult: 1.0,
      blastMult: 1.0,
      pierce: 0,
      bounce: 0,
      multiShot: 1,
      vampChance: 0.0,
      items: [],
      itemStacks: {},
      killCount: 0,
      nos: 100,
      nosMax: 100,
      nosLock: false,
      nosDelay: 0
    };

    expect(emptyPlayer.items).toHaveLength(0);
    expect(Object.keys(emptyPlayer.itemStacks)).toHaveLength(0);
    expect(emptyPlayer.runWeapons.pistol).toBeUndefined();

    // Verify all 9 mods apply cleanly to an empty/initial player
    for (const mod of RUN_MOD_POOL) {
      const p = { ...emptyPlayer };
      expect(() => mod.apply(p)).not.toThrow();
    }
  });

  it('stress tests MAX_STASH boundary and auto-sell lowest score item algorithm', () => {
    expect(MAX_STASH).toBe(18);
    expect(MAX_STASH_SIZE).toBe(18);

    // Simulate filling the stash to 18 items
    const stash: EquipmentItem[] = [];
    for (let i = 0; i < 18; i++) {
      stash.push(genLoot(1, (i % 4) as RarityTier, () => (i + 1) / 20));
    }
    expect(stash.length).toBe(18);

    // Generate 19th item
    const newItem = genLoot(5, 3, () => 0.5); // Floor 5 Legendary item
    stash.push(newItem);
    expect(stash.length).toBe(19);

    // Auto-sell weakest part algorithm from index.html L1205-1210
    let worst = stash[0];
    stash.forEach(s => {
      if (itemScore(s) < itemScore(worst)) worst = s;
    });

    const worstIndex = stash.indexOf(worst);
    expect(worstIndex).toBeGreaterThanOrEqual(0);
    stash.splice(worstIndex, 1);
    expect(stash.length).toBe(18);

    // The newly added high-tier legendary must NOT be the worst item
    expect(stash).toContain(newItem);
  });

  it('tests zero health and dead player state under applyItemStats and mod applications', () => {
    const deadPlayer: EquipmentTargetPlayer = {
      dmgMult: 1.0,
      fireRateMult: 1.0,
      speedMult: 1.0,
      blastMult: 1.0,
      vampChance: 0.0,
      maxHp: 6,
      hp: 0 // DEAD
    };

    const hpItem: EquipmentItem = {
      slot: 'frame',
      rarity: 1,
      name: 'Reinforced Frame',
      stats: { hp: 2 }
    };

    // Equipping item on dead player: maxHp increases, hp becomes Math.max(1, Math.min(maxHp, 0 + 2)) = 2
    applyItemStats(hpItem, 1, deadPlayer);
    expect(deadPlayer.maxHp).toBe(8);
    expect(deadPlayer.hp).toBe(2);

    // Kill player again
    deadPlayer.hp = 0;

    // UNEQUIPPING item when player is dead (hp = 0):
    // In equipment.ts: player.hp = Math.max(1, Math.min(player.maxHp, player.hp + 0))
    // Math.max(1, 0) forces hp to 1! Unequipping an item revives a dead player!
    applyItemStats(hpItem, -1, deadPlayer);
    // Observe this empirical behavior:
    expect(deadPlayer.maxHp).toBe(6);
    expect(deadPlayer.hp).toBe(1); // Revived to 1 HP by unequipping!
  });

  it('tests negative inputs across progression and generator functions', () => {
    // calcUpgradeCost with negative rank
    const costNeg = calcUpgradeCost('dmg', -1);
    // 25 * 1.6^-1 = 15.625 -> 16
    expect(costNeg).toBe(16);

    // rollRarity with floor 0 or negative floor
    const rZero = rollRarity(0, () => 0.1);
    expect([0, 1, 2, 3]).toContain(rZero);

    // Negative floor: tests whether weights produce NaN or invalid indices
    const rNeg = rollRarity(-5, () => 0.5);
    expect([0, 1, 2, 3]).toContain(rNeg);

    // genLoot with floor 1
    const lootFloor1 = genLoot(1, 0, () => 0.2);
    expect(itemScore(lootFloor1)).toBeGreaterThan(0);

    // itemScore with empty or zero stats
    const emptyItem: EquipmentItem = {
      slot: 'tires',
      rarity: 0,
      name: 'Empty Tires',
      stats: {}
    };
    expect(itemScore(emptyItem)).toBe(0);

    // fmtStat with zero and negative numbers
    expect(fmtStat('hp', 0)).toBe('+0 Max Fuel');
    expect(fmtStat('dmg', -0.1)).toBe('-10% Damage');
  });
});

describe('Adversarial Challenge 4: Stress Testing Run Mod Clamps', () => {
  const getInitialPlayer = (): ModPlayerTarget => ({
    hp: 4,
    maxHp: 6,
    dmgMult: 1.0,
    fireRateMult: 1.0,
    speedMult: 1.0,
    projSpeedMult: 1.0,
    blastMult: 1.0,
    pierce: 0,
    bounce: 0,
    multiShot: 1,
    vampChance: 0.0
  });

  it('stress tests split_chamber: clamp at min 0.6x across 100 consecutive applications', () => {
    const splitMod = RUN_MOD_POOL.find(m => m.id === 'split_chamber')!;
    expect(splitMod).toBeDefined();

    const p = getInitialPlayer();
    // 1st application: 1.0 - 0.15 = 0.85, multiShot = 2
    splitMod.apply(p);
    expect(p.dmgMult).toBeCloseTo(0.85);
    expect(p.multiShot).toBe(2);

    // 2nd application: 0.85 - 0.15 = 0.70, multiShot = 3
    splitMod.apply(p);
    expect(p.dmgMult).toBeCloseTo(0.70);
    expect(p.multiShot).toBe(3);

    // 3rd application: 0.70 - 0.15 = 0.55 -> clamped to 0.60
    splitMod.apply(p);
    expect(p.dmgMult).toBe(0.6);
    expect(p.multiShot).toBe(4);

    // Apply 97 more times (total 100 times)
    for (let i = 0; i < 97; i++) {
      splitMod.apply(p);
    }
    expect(p.dmgMult).toBe(0.6);
    expect(p.multiShot).toBe(101);
  });

  it('tests split_chamber behavior when starting with debuffed dmgMult < 0.6', () => {
    const splitMod = RUN_MOD_POOL.find(m => m.id === 'split_chamber')!;
    const p = getInitialPlayer();
    p.dmgMult = 0.3; // Already severely debuffed

    splitMod.apply(p);
    // Math.max(0.6, 0.3 - 0.15) = Math.max(0.6, 0.15) = 0.6
    // Note: this raises damage from 0.3 to 0.6 due to Math.max(0.6, ...)
    expect(p.dmgMult).toBe(0.6);
  });

  it('stress tests vamp_siphon: clamp at max 0.60 cap across 100 consecutive applications', () => {
    const vampMod = RUN_MOD_POOL.find(m => m.id === 'vamp_siphon')!;
    expect(vampMod).toBeDefined();

    const p = getInitialPlayer();
    // 1st: 0.20
    vampMod.apply(p);
    expect(p.vampChance).toBeCloseTo(0.20);

    // 2nd: 0.40
    vampMod.apply(p);
    expect(p.vampChance).toBeCloseTo(0.40);

    // 3rd: 0.60
    vampMod.apply(p);
    expect(p.vampChance).toBeCloseTo(0.60);

    // Apply 97 more times
    for (let i = 0; i < 97; i++) {
      vampMod.apply(p);
    }
    expect(p.vampChance).toBe(0.6);
  });

  it('tests non-commutative behavior of split_chamber clamp and hollow_point damage bonus', () => {
    const splitMod = RUN_MOD_POOL.find(m => m.id === 'split_chamber')!;
    const hollowMod = RUN_MOD_POOL.find(m => m.id === 'hollow_point')!;

    // Scenario A: Player at 0.65 dmgMult
    // Order 1: split then hollow
    const p1 = getInitialPlayer();
    p1.dmgMult = 0.65;
    splitMod.apply(p1); // 0.65 - 0.15 = 0.50 -> clamped to 0.60
    hollowMod.apply(p1); // 0.60 + 0.25 = 0.85
    expect(p1.dmgMult).toBeCloseTo(0.85);

    // Order 2: hollow then split
    const p2 = getInitialPlayer();
    p2.dmgMult = 0.65;
    hollowMod.apply(p2); // 0.65 + 0.25 = 0.90
    splitMod.apply(p2); // 0.90 - 0.15 = 0.75 (clamp not hit!)
    expect(p2.dmgMult).toBeCloseTo(0.75);

    // Clamping causes order-dependence:
    expect(p1.dmgMult).not.toBe(p2.dmgMult);
  });

  it('stress tests armor_plate: maxHp increase and heal cap', () => {
    const armorMod = RUN_MOD_POOL.find(m => m.id === 'armor_plate')!;
    const p = getInitialPlayer(); // hp: 4, maxHp: 6

    armorMod.apply(p); // maxHp -> 8, hp -> min(8, 4 + 2) = 6
    expect(p.maxHp).toBe(8);
    expect(p.hp).toBe(6);

    // When hp is already full
    p.hp = p.maxHp; // 8
    armorMod.apply(p); // maxHp -> 10, hp -> min(10, 8 + 2) = 10
    expect(p.maxHp).toBe(10);
    expect(p.hp).toBe(10);

    // Apply 50 times
    for (let i = 0; i < 50; i++) {
      armorMod.apply(p);
    }
    expect(p.maxHp).toBe(110);
    expect(p.hp).toBe(110);
  });

  describe('Adversarial Challenge 5: Floor Bounty Contracts & Reward Invariants', () => {
    it('verifies explicit contracts for Floors 1 through 6', () => {
      const f1 = getFloorBountyContract(1);
      expect(f1).toEqual({
        id: 'GRAZE_INITIATE',
        floor: 1,
        title: 'NEON DAREDEVIL',
        desc: 'Dodge 3 enemy projectiles or clear Floor 1 Boss',
        targetCount: 3,
        scrapReward: 8,
        coinReward: 10
      });

      const f2 = getFloorBountyContract(2);
      expect(f2).toEqual({
        id: 'DRIFT_DEMON',
        floor: 2,
        title: 'ASPHALT DRIFTER',
        desc: 'Trigger 2 Handbrake Drift Boosts or clear Floor 2 Boss',
        targetCount: 2,
        scrapReward: 10,
        coinReward: 14
      });

      const f3 = getFloorBountyContract(3);
      expect(f3).toEqual({
        id: 'THERMAL_HUNTER',
        floor: 3,
        title: 'THERMAL HUNTER',
        desc: 'Eliminate 6 hostiles or clear Floor 3 Boss',
        targetCount: 6,
        scrapReward: 14,
        coinReward: 18
      });

      const f4 = getFloorBountyContract(4);
      expect(f4).toEqual({
        id: 'CRYO_SHATTER',
        floor: 4,
        title: 'CRYO BREAKER',
        desc: 'Detonate 2 Cryo/Explosive Barrels or clear Floor 4 Boss',
        targetCount: 2,
        scrapReward: 18,
        coinReward: 22
      });

      const f5 = getFloorBountyContract(5);
      expect(f5).toEqual({
        id: 'OVERDRIVE_SLAYER',
        floor: 5,
        title: 'FORGE EXECUTIONER',
        desc: 'Achieve a 5x Rampage Killstreak or clear Floor 5 Boss',
        targetCount: 5,
        scrapReward: 22,
        coinReward: 28
      });

      const f6 = getFloorBountyContract(6);
      expect(f6).toEqual({
        id: 'VALHALLA_LEGEND',
        floor: 6,
        title: 'VALHALLA ASCENDANT',
        desc: 'Defeat the Sector Boss to claim Valhalla bounty',
        targetCount: 1,
        scrapReward: 30,
        coinReward: 40
      });
    });

    it('verifies strictly monotonic reward scaling across floors 1 to 10', () => {
      for (let f = 1; f < 10; f++) {
        const cur = getFloorBountyContract(f);
        const next = getFloorBountyContract(f + 1);
        expect(next.scrapReward).toBeGreaterThan(cur.scrapReward);
        expect(next.coinReward).toBeGreaterThan(cur.coinReward);
        expect(cur.targetCount).toBeGreaterThan(0);
        expect(cur.title.length).toBeGreaterThan(0);
        expect(cur.desc.length).toBeGreaterThan(0);
      }
    });

    it('handles negative, zero, fractional, and NaN input defensively', () => {
      const fNeg = getFloorBountyContract(-3);
      expect(fNeg.floor).toBe(1);
      expect(fNeg.id).toBe('GRAZE_INITIATE');

      const fZero = getFloorBountyContract(0);
      expect(fZero.floor).toBe(1);
      expect(fZero.id).toBe('GRAZE_INITIATE');

      const fFloat = getFloorBountyContract(3.8);
      expect(fFloat.floor).toBe(3);
      expect(fFloat.id).toBe('THERMAL_HUNTER');

      const fNaN = getFloorBountyContract(NaN as any);
      expect(fNaN.floor).toBe(1);
      expect(fNaN.id).toBe('GRAZE_INITIATE');
    });

    it('validates bounty progression and reward payout state transition semantics', () => {
      const contract = getFloorBountyContract(1);
      const mockState = {
        floorNum: 1,
        metaSave: { scrap: 0 },
        player: { coins: 0 },
        saved: false,
        saveMeta() { this.saved = true; }
      };

      let floorBountyProgress = 0;
      let floorBountyCompleted = false;

      const advance = (amount: number = 1, forceComplete: boolean = false) => {
        if (floorBountyCompleted) return;
        floorBountyProgress = forceComplete ? contract.targetCount : floorBountyProgress + amount;
        if (floorBountyProgress >= contract.targetCount) {
          floorBountyCompleted = true;
          mockState.metaSave.scrap += contract.scrapReward;
          mockState.player.coins += contract.coinReward;
          mockState.saveMeta();
        }
      };

      // Incremental progress: 1 of 3
      advance(1);
      expect(floorBountyProgress).toBe(1);
      expect(floorBountyCompleted).toBe(false);
      expect(mockState.metaSave.scrap).toBe(0);
      expect(mockState.player.coins).toBe(0);

      // Incremental progress: 2 of 3
      advance(1);
      expect(floorBountyProgress).toBe(2);
      expect(floorBountyCompleted).toBe(false);

      // Complete: 3 of 3
      advance(1);
      expect(floorBountyProgress).toBe(3);
      expect(floorBountyCompleted).toBe(true);
      expect(mockState.metaSave.scrap).toBe(contract.scrapReward);
      expect(mockState.player.coins).toBe(contract.coinReward);
      expect(mockState.saved).toBe(true);

      // Subsequent calls must be no-op
      advance(5);
      expect(floorBountyProgress).toBe(3);
      expect(mockState.metaSave.scrap).toBe(contract.scrapReward);
      expect(mockState.player.coins).toBe(contract.coinReward);
    });

    it('validates forceComplete behavior (boss room clear override)', () => {
      const contract = getFloorBountyContract(4);
      const mockState = {
        metaSave: { scrap: 10 },
        player: { coins: 5 },
        saveMeta() {}
      };

      let floorBountyProgress = 0;
      let floorBountyCompleted = false;

      const advance = (amount: number = 1, forceComplete: boolean = false) => {
        if (floorBountyCompleted) return;
        floorBountyProgress = forceComplete ? contract.targetCount : floorBountyProgress + amount;
        if (floorBountyProgress >= contract.targetCount) {
          floorBountyCompleted = true;
          mockState.metaSave.scrap += contract.scrapReward;
          mockState.player.coins += contract.coinReward;
          mockState.saveMeta();
        }
      };

      advance(1, true);

      expect(floorBountyCompleted).toBe(true);
      expect(floorBountyProgress).toBe(contract.targetCount);
      expect(mockState.metaSave.scrap).toBe(10 + contract.scrapReward);
      expect(mockState.player.coins).toBe(5 + contract.coinReward);
    });
  });

  describe('Adversarial Challenge 7: Sector Descent Briefing & Portal Risk Assessment Integration', () => {
    it('correctly maps upcoming sectors, boss names, and threat multipliers across floors 1 to 6', () => {
      // Current floor 1 -> Floor 2: SMELTER FOUNDRY / SIEGE BEHEMOTH (1.55x)
      const b1 = getNextSectorBriefing(1);
      expect(b1.nextFloor).toBe(2);
      expect(b1.biomeName).toBe('SMELTER FOUNDRY');
      expect(b1.bossName).toBe('SIEGE BEHEMOTH');
      expect(b1.threatMult).toBe('1.55x');

      // Current floor 2 -> Floor 3: NEON CYBER-FREEWAY / OVERLORD HELION (2.40x)
      const b2 = getNextSectorBriefing(2);
      expect(b2.nextFloor).toBe(3);
      expect(b2.biomeName).toBe('NEON CYBER-FREEWAY');
      expect(b2.bossName).toBe('OVERLORD HELION');
      expect(b2.threatMult).toBe('2.40x');

      // Current floor 3 -> Floor 4: SUB-ZERO CRYO LAB / CRYO VALKYRIE (3.72x)
      const b3 = getNextSectorBriefing(3);
      expect(b3.nextFloor).toBe(4);
      expect(b3.biomeName).toBe('SUB-ZERO CRYO LAB');
      expect(b3.bossName).toBe('CRYO VALKYRIE');
      expect(b3.threatMult).toBe('3.72x');

      // Current floor 4 -> Floor 5: MAGMA CORE / INFERNO COLOSSUS (5.77x)
      const b4 = getNextSectorBriefing(4);
      expect(b4.nextFloor).toBe(5);
      expect(b4.biomeName).toBe('MAGMA CORE');
      expect(b4.bossName).toBe('INFERNO COLOSSUS');
      expect(b4.threatMult).toBe('5.77x');

      // Current floor 5 -> Floor 6: CHROME CITADEL / OMEGA VALHALLA (8.95x)
      const b5 = getNextSectorBriefing(5);
      expect(b5.nextFloor).toBe(6);
      expect(b5.biomeName).toBe('CHROME CITADEL');
      expect(b5.bossName).toBe('OMEGA VALHALLA');
      expect(b5.threatMult).toBe('8.95x');

      // Current floor 6 -> Floor 7+: ENDLESS VALHALLA OVERDRIVE / OMEGA VALHALLA (13.87x)
      const b6 = getNextSectorBriefing(6);
      expect(b6.nextFloor).toBe(7);
      expect(b6.biomeName).toBe('ENDLESS VALHALLA OVERDRIVE');
      expect(b6.bossName).toBe('OMEGA VALHALLA');
      expect(b6.threatMult).toBe('13.87x');
    });

    it('accurately evaluates hull integrity across critical, nominal, full, and edge states', () => {
      // Critical Hull: <= 35%
      const critical1 = getPortalRiskAssessment(1, 2, 6); // 33.3%
      expect(critical1.isLowHullWarning).toBe(true);
      expect(critical1.readinessLabel).toBe('⚠️ CRITICAL HULL');
      expect(critical1.recommendation).toContain('Visit Shop or scavenge Fuel');

      const criticalBoundary = getPortalRiskAssessment(4, 35, 100); // 35.0%
      expect(criticalBoundary.isLowHullWarning).toBe(true);
      expect(criticalBoundary.readinessLabel).toBe('⚠️ CRITICAL HULL');

      const nearZero = getPortalRiskAssessment(2, 1, 10); // 10.0%
      expect(nearZero.isLowHullWarning).toBe(true);
      expect(nearZero.readinessLabel).toBe('⚠️ CRITICAL HULL');

      // Full Integrity: hp >= maxHp
      const full = getPortalRiskAssessment(3, 6, 6);
      expect(full.isLowHullWarning).toBe(false);
      expect(full.readinessLabel).toBe('★ FULL INTEGRITY');
      expect(full.recommendation).toBe('Optimal combat readiness for descent.');

      const overhealed = getPortalRiskAssessment(5, 10, 8);
      expect(overhealed.isLowHullWarning).toBe(false);
      expect(overhealed.readinessLabel).toBe('★ FULL INTEGRITY');

      // Nominal / Combat Ready: 35% < hp < maxHp
      const nominal = getPortalRiskAssessment(2, 4, 6); // 66.7%
      expect(nominal.isLowHullWarning).toBe(false);
      expect(nominal.readinessLabel).toBe('⚡ COMBAT READY');
      expect(nominal.recommendation).toBe('Systems nominal for next sector.');

      // Edge cases: missing, negative maxHp, or zero maxHp
      const missingHp = getPortalRiskAssessment(1);
      expect(missingHp.isLowHullWarning).toBe(false);
      expect(missingHp.readinessLabel).toBe('⚡ COMBAT READY');

      const zeroMaxHp = getPortalRiskAssessment(1, 0, 0);
      expect(zeroMaxHp.isLowHullWarning).toBe(false);
      expect(zeroMaxHp.readinessLabel).toBe('⚡ COMBAT READY');
    });

    it('validates integrated sector briefing and portal readiness synthesis across all floors', () => {
      for (let floor = 1; floor <= 6; floor++) {
        const briefing = getNextSectorBriefing(floor);
        expect(briefing.nextFloor).toBe(floor + 1);
        expect(briefing.threatMult).toMatch(/^\d+\.\d{2}x$/);

        // In critical condition
        const riskCritical = getPortalRiskAssessment(floor, 1, 6);
        expect(riskCritical.isLowHullWarning).toBe(true);

        // In full health condition
        const riskFull = getPortalRiskAssessment(floor, 6, 6);
        expect(riskFull.isLowHullWarning).toBe(false);
        expect(riskFull.readinessLabel).toBe('★ FULL INTEGRITY');
      }
    });
  });

  describe('Adversarial Challenge 7: Runtime Hub NPC Dialogue & Style Adrenaline Integration (M57)', () => {
    it('verifies getHubNpcGreeting resilience across extreme bestFloor inputs (0..99) and all NPC types', () => {
      const npcIds = ['garage', 'blacksmith', 'bounty', 'codex', 'launch', 'unknown_vendor'];
      const floorCases = [0, 1, 2, 3, 4, 10, 50, 99];

      for (const npcId of npcIds) {
        for (const floor of floorCases) {
          const greeting = getHubNpcGreeting(npcId, floor, 0);
          expect(greeting).toBeDefined();
          expect(greeting.speaker).toBeTruthy();
          expect(greeting.quote).toBeTruthy();
          expect(greeting.accentColor).toMatch(/^#[0-9a-fA-F]{6}$/);

          if (npcId === 'garage') {
            if (floor >= 4) {
              expect(greeting.quote).toBe(`Chassis survived Sector ${floor}! Bolt on your finest parts, Rider.`);
            } else {
              expect(greeting.quote).toBe('Tune your V8 and equip high-grade salvage before hitting the highway.');
            }
          }
        }
      }
    });

    it('verifies getHubNpcGreeting dynamic bounty scaling across heatLevel edge cases (0..3)', () => {
      // heatLevel = 0
      const heat0 = getHubNpcGreeting('bounty', 1, 0);
      expect(heat0.speaker).toBe('VALKYRIE BROKER');
      expect(heat0.quote).toBe('Raise the Bounty Heat for massive Scrap payouts, outlaw!');
      expect(heat0.accentColor).toBe('#06d6a0');

      // heatLevel = 1..3
      for (let heat = 1; heat <= 3; heat++) {
        const greeting = getHubNpcGreeting('bounty', 1, heat);
        expect(greeting.quote).toBe(`HEAT ${heat} ACTIVE! +${heat * 25}% Scrap from all hostiles.`);
      }

      // Negative heat edge case gracefully handled
      const negHeat = getHubNpcGreeting('bounty', 1, -5);
      expect(negHeat.quote).toBe('Raise the Bounty Heat for massive Scrap payouts, outlaw!');
    });

    it('verifies getStyleAdrenalineBonus boundary clamps and monotonic scaling (-10..150)', () => {
      // Underflow / clamped to D
      const underflow = getStyleAdrenalineBonus(-10);
      expect(underflow.rank).toBe('D');
      expect(underflow.nosRegenBonusPerSec).toBe(0);
      expect(underflow.speedBonusMult).toBe(1.0);

      const zero = getStyleAdrenalineBonus(0);
      expect(zero.rank).toBe('D');
      expect(zero.nosRegenBonusPerSec).toBe(0);

      // Score 20: C rank
      const score20 = getStyleAdrenalineBonus(20);
      expect(score20.rank).toBe('C');
      expect(score20.nosRegenBonusPerSec).toBe(0.5);

      // Score 36: B rank
      const score36 = getStyleAdrenalineBonus(36);
      expect(score36.rank).toBe('B');
      expect(score36.nosRegenBonusPerSec).toBe(1.5);

      // Score 52: A rank
      const score52 = getStyleAdrenalineBonus(52);
      expect(score52.rank).toBe('A');
      expect(score52.nosRegenBonusPerSec).toBe(3);

      // Score 68: S rank
      const score68 = getStyleAdrenalineBonus(68);
      expect(score68.rank).toBe('S');
      expect(score68.nosRegenBonusPerSec).toBe(5);

      // Score 80: SS rank
      const score80 = getStyleAdrenalineBonus(80);
      expect(score80.rank).toBe('SS');
      expect(score80.nosRegenBonusPerSec).toBe(8);

      // Score 92: SSS rank
      const score92 = getStyleAdrenalineBonus(92);
      expect(score92.rank).toBe('SSS');
      expect(score92.nosRegenBonusPerSec).toBe(12);
      expect(score92.speedBonusMult).toBe(1.15);

      // Overflow / clamped to SSS
      const overflow = getStyleAdrenalineBonus(150);
      expect(overflow.rank).toBe('SSS');
      expect(overflow.nosRegenBonusPerSec).toBe(12);
      expect(overflow.speedBonusMult).toBe(1.15);

      // Monotonic progression across step increments from -10 to 150
      let prevNos = -1;
      let prevSpeed = 0.99;
      for (let s = -10; s <= 150; s += 5) {
        const bonus = getStyleAdrenalineBonus(s);
        expect(bonus.nosRegenBonusPerSec).toBeGreaterThanOrEqual(prevNos);
        expect(bonus.speedBonusMult).toBeGreaterThanOrEqual(prevSpeed);
        prevNos = bonus.nosRegenBonusPerSec;
        prevSpeed = bonus.speedBonusMult;
      }
    });

    it('verifies NOS regen integration with player state conforms to clamp and cap invariants', () => {
      const player = {
        nos: 95,
        nosMax: 100,
        styleScore: 95
      };

      const dt = 0.5;
      const curStyle = player.styleScore || 12;
      const styleAdrenaline = getStyleAdrenalineBonus(curStyle) as any;
      if (styleAdrenaline.nosRegenBonus === undefined) {
        styleAdrenaline.nosRegenBonus = styleAdrenaline.nosRegenBonusPerSec ?? 0;
      }

      if (styleAdrenaline.nosRegenBonus > 0) {
        player.nos = Math.min(player.nosMax, player.nos + dt * styleAdrenaline.nosRegenBonus);
      }

      // 95 + 0.5 * 12 = 101, capped at 100
      expect(player.nos).toBe(100);
    });
  });
});

describe('Adversarial Challenge 8: HUD Combat Offense Telemetry Attributes (M70)', () => {
  function createTestPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
    return {
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT / 2,
      vx: 0,
      vy: 0,
      radius: 17,
      bikeAngle: 0,
      aimAngle: 0,
      baseSpeed: 210,
      hp: 6,
      maxHp: 6,
      coins: 0,
      invuln: 0,
      weapon: 'pistol',
      runWeapons: {},
      fireTimer: 0,
      dmgMult: 1.0,
      fireRateMult: 1.0,
      speedMult: 1.0,
      projSpeedMult: 1.0,
      blastMult: 1.0,
      pierce: 0,
      bounce: 0,
      multiShot: 1,
      vampChance: 0.0,
      items: [],
      itemStacks: {},
      killCount: 0,
      nos: 100,
      nosMax: 100,
      nosLock: false,
      nosDelay: 0,
      ...overrides
    };
  }

  it('sets baseline telemetry attributes on #hud-left and #stat-dmg elements', () => {
    document.body.innerHTML = `
      <div id="hud-left"></div>
      <div id="stat-dmg"></div>
    `;
    const hud = new HUDController();
    const player = createTestPlayer({
      weapon: 'pistol',
      dmgMult: 1.0,
      fireRateMult: 1.0,
      multiShot: 1,
      vampChance: 0
    });

    hud.updateSidebar(player, 1);

    const hudLeft = document.getElementById('hud-left')!;
    const statDmg = document.getElementById('stat-dmg')!;

    expect(hudLeft.getAttribute('data-effective-dps')).toBe('1');
    expect(hudLeft.getAttribute('data-siphon-status')).toBe('NONE');
    expect(hudLeft.getAttribute('data-offense-summary')).toBe('DPS x1.00 · NONE (0% Siphon)');

    expect(statDmg.getAttribute('data-effective-dps')).toBe('1');
    expect(statDmg.getAttribute('data-siphon-status')).toBe('NONE');
    expect(statDmg.getAttribute('data-offense-summary')).toBe('DPS x1.00 · NONE (0% Siphon)');
  });

  it('sets high-siphon telemetry attributes with VAMPIRIC OVERDRIVE (>= 15%)', () => {
    document.body.innerHTML = `
      <div id="hud-left"></div>
      <div id="stats-grid"></div>
    `;
    const hud = new HUDController();
    const player = createTestPlayer({
      weapon: 'shotgun',
      dmgMult: 1.5,
      fireRateMult: 1.2,
      multiShot: 2,
      vampChance: 0.20
    });

    hud.updateSidebar(player, 2);

    const hudLeft = document.getElementById('hud-left')!;
    const statDmg = document.getElementById('stat-dmg')!;

    // 1.5 * 1.2 * 2 = 3.6
    expect(hudLeft.getAttribute('data-effective-dps')).toBe('3.6');
    expect(hudLeft.getAttribute('data-siphon-status')).toBe('VAMPIRIC OVERDRIVE');
    expect(hudLeft.getAttribute('data-offense-summary')).toBe('DPS x3.60 · VAMPIRIC OVERDRIVE (20% Siphon)');

    expect(statDmg.getAttribute('data-effective-dps')).toBe('3.6');
    expect(statDmg.getAttribute('data-siphon-status')).toBe('VAMPIRIC OVERDRIVE');
    expect(statDmg.getAttribute('data-offense-summary')).toBe('DPS x3.60 · VAMPIRIC OVERDRIVE (20% Siphon)');
  });

  it('sets evolved weapon overclock telemetry attributes (1.35x bonus and OVERCLOCKED tag)', () => {
    document.body.innerHTML = `
      <div id="hud-left"></div>
      <div id="stat-dmg"></div>
    `;
    const hud = new HUDController();
    // Evolution triggered via 3 passive item stacks
    const player = createTestPlayer({
      weapon: 'pistol',
      dmgMult: 2.0,
      fireRateMult: 1.0,
      multiShot: 1,
      vampChance: 0.08,
      itemStacks: { item_plating: 3 }
    });

    hud.updateSidebar(player, 3);

    const hudLeft = document.getElementById('hud-left')!;
    const statDmg = document.getElementById('stat-dmg')!;

    // 2.0 * 1.0 * 1 * 1.35 = 2.7
    expect(hudLeft.getAttribute('data-effective-dps')).toBe('2.7');
    expect(hudLeft.getAttribute('data-siphon-status')).toBe('LIGHT SIPHON');
    expect(hudLeft.getAttribute('data-offense-summary')).toBe('DPS x2.70 · LIGHT SIPHON (8% Siphon) · OVERCLOCKED');

    expect(statDmg.getAttribute('data-effective-dps')).toBe('2.7');
    expect(statDmg.getAttribute('data-siphon-status')).toBe('LIGHT SIPHON');
    expect(statDmg.getAttribute('data-offense-summary')).toBe('DPS x2.70 · LIGHT SIPHON (8% Siphon) · OVERCLOCKED');
  });

  it('handles DOM permutations defensively (isolated hud-left, isolated stat-dmg, neither present)', () => {
    const hud = new HUDController();
    const player = createTestPlayer({ dmgMult: 2.0, fireRateMult: 1.0, multiShot: 1, vampChance: 0.05 });

    // Case 1: only hud-left present
    document.body.innerHTML = '<div id="hud-left"></div>';
    expect(() => hud.updateSidebar(player, 1)).not.toThrow();
    const hudLeft = document.getElementById('hud-left')!;
    expect(hudLeft.getAttribute('data-effective-dps')).toBe('2');
    expect(hudLeft.getAttribute('data-siphon-status')).toBe('LIGHT SIPHON');

    // Case 2: only stat-dmg present
    document.body.innerHTML = '<div id="stat-dmg"></div>';
    expect(() => hud.updateSidebar(player, 1)).not.toThrow();
    const statDmg = document.getElementById('stat-dmg')!;
    expect(statDmg.getAttribute('data-effective-dps')).toBe('2');
    expect(statDmg.getAttribute('data-siphon-status')).toBe('LIGHT SIPHON');

    // Case 3: neither present
    document.body.innerHTML = '<div></div>';
    expect(() => hud.updateSidebar(player, 1)).not.toThrow();
  });
});

describe('Adversarial Challenge 9: HUD Rider Mobility Telemetry Attributes (M77)', () => {
  function createTestPlayer(overrides: Partial<PlayerState> = {}): PlayerState {
    return {
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT / 2,
      vx: 0,
      vy: 0,
      radius: 17,
      bikeAngle: 0,
      aimAngle: 0,
      baseSpeed: 295,
      speedMult: 1.0,
      driftCharge: 0,
      nos: 100,
      nosMax: 100,
      nosLock: false,
      nosDelay: 0,
      hp: 6,
      maxHp: 6,
      coins: 0,
      invuln: 0,
      weapon: 'pistol',
      runWeapons: {},
      fireTimer: 0,
      dmgMult: 1.0,
      fireRateMult: 1.0,
      projSpeedMult: 1.0,
      blastMult: 1.0,
      pierce: 0,
      bounce: 0,
      multiShot: 1,
      vampChance: 0.0,
      items: [],
      itemStacks: {},
      killCount: 0,
      ...overrides
    };
  }

  it('sets STANDARD mobility telemetry attributes on #hud-left and #stat-spd elements', () => {
    document.body.innerHTML = `
      <div id="hud-left"></div>
      <div id="stat-spd"></div>
    `;
    const hud = new HUDController();
    const player = createTestPlayer({
      baseSpeed: 295,
      speedMult: 1.0,
      driftCharge: 0,
      nos: 100,
      nosMax: 100
    });

    hud.updateSidebar(player, 1);

    const hudLeft = document.getElementById('hud-left')!;
    const statSpd = document.getElementById('stat-spd')!;

    expect(hudLeft.getAttribute('data-mobility-tier')).toBe('STANDARD');
    expect(hudLeft.getAttribute('data-top-speed-rating')).toBe('295');
    expect(hudLeft.getAttribute('data-mobility-summary')).toBe('STANDARD · 295 MPH RATING · 0% DRIFT · 100% NOS');

    expect(statSpd.getAttribute('data-mobility-tier')).toBe('STANDARD');
    expect(statSpd.getAttribute('data-top-speed-rating')).toBe('295');
    expect(statSpd.getAttribute('data-mobility-summary')).toBe('STANDARD · 295 MPH RATING · 0% DRIFT · 100% NOS');
  });

  it('sets INTERCEPTOR mobility telemetry attributes when speed or drift increases', () => {
    document.body.innerHTML = `
      <div id="hud-left"></div>
      <div id="stat-spd"></div>
    `;
    const hud = new HUDController();
    const player = createTestPlayer({
      baseSpeed: 300,
      speedMult: 1.15,
      driftCharge: 0.4,
      nos: 80,
      nosMax: 100
    });

    hud.updateSidebar(player, 2);

    const hudLeft = document.getElementById('hud-left')!;
    const statSpd = document.getElementById('stat-spd')!;

    expect(hudLeft.getAttribute('data-mobility-tier')).toBe('INTERCEPTOR');
    expect(hudLeft.getAttribute('data-top-speed-rating')).toBe('345');
    expect(hudLeft.getAttribute('data-mobility-summary')).toBe('INTERCEPTOR · 345 MPH RATING · 40% DRIFT · 80% NOS');

    expect(statSpd.getAttribute('data-mobility-tier')).toBe('INTERCEPTOR');
    expect(statSpd.getAttribute('data-top-speed-rating')).toBe('345');
    expect(statSpd.getAttribute('data-mobility-summary')).toBe('INTERCEPTOR · 345 MPH RATING · 40% DRIFT · 80% NOS');
  });

  it('sets HYPER-DRIFTER mobility telemetry attributes under high speed and drift charge', () => {
    document.body.innerHTML = `
      <div id="hud-left"></div>
      <div id="stat-spd"></div>
    `;
    const hud = new HUDController();
    const player = createTestPlayer({
      baseSpeed: 300,
      speedMult: 1.4,
      driftCharge: 0.6,
      nos: 90,
      nosMax: 100
    });

    hud.updateSidebar(player, 3);

    const hudLeft = document.getElementById('hud-left')!;
    const statSpd = document.getElementById('stat-spd')!;

    expect(hudLeft.getAttribute('data-mobility-tier')).toBe('HYPER-DRIFTER');
    expect(hudLeft.getAttribute('data-top-speed-rating')).toBe('420');
    expect(hudLeft.getAttribute('data-mobility-summary')).toBe('HYPER-DRIFTER · 420 MPH RATING · 60% DRIFT · 90% NOS');

    expect(statSpd.getAttribute('data-mobility-tier')).toBe('HYPER-DRIFTER');
    expect(statSpd.getAttribute('data-top-speed-rating')).toBe('420');
    expect(statSpd.getAttribute('data-mobility-summary')).toBe('HYPER-DRIFTER · 420 MPH RATING · 60% DRIFT · 90% NOS');
  });

  it('populates telemetry attributes on #stat-spd rendered by stats-grid innerHTML', () => {
    document.body.innerHTML = '<div id="stats-grid"></div>';
    const hud = new HUDController();
    const player = createTestPlayer({ baseSpeed: 295, speedMult: 1.0 });

    hud.updateSidebar(player, 1);

    const statSpd = document.getElementById('stat-spd');
    expect(statSpd).not.toBeNull();
    expect(statSpd?.getAttribute('data-mobility-tier')).toBe('STANDARD');
    expect(statSpd?.getAttribute('data-top-speed-rating')).toBe('295');
    expect(statSpd?.getAttribute('data-mobility-summary')).toBe('STANDARD · 295 MPH RATING · 0% DRIFT · 100% NOS');
  });

  it('handles DOM permutations defensively (isolated hud-left, isolated stat-spd, neither present)', () => {
    const hud = new HUDController();
    const player = createTestPlayer({ baseSpeed: 295, speedMult: 1.0 });

    // Case 1: only hud-left present
    document.body.innerHTML = '<div id="hud-left"></div>';
    expect(() => hud.updateSidebar(player, 1)).not.toThrow();
    const hudLeft = document.getElementById('hud-left')!;
    expect(hudLeft.getAttribute('data-mobility-tier')).toBe('STANDARD');

    // Case 2: only stat-spd present
    document.body.innerHTML = '<div id="stat-spd"></div>';
    expect(() => hud.updateSidebar(player, 1)).not.toThrow();
    const statSpd = document.getElementById('stat-spd')!;
    expect(statSpd.getAttribute('data-mobility-tier')).toBe('STANDARD');

    // Case 3: neither present
    document.body.innerHTML = '<div></div>';
    expect(() => hud.updateSidebar(player, 1)).not.toThrow();
  });
});

describe('MotoRogueApp openDropChoiceModal live stack telemetry (M144)', () => {
  it('sets data-drop-* telemetry on #drop-overlay and data-choice-* on .drop-card for mixed stack tiers (NEW, STACK_2, EVO_READY)', () => {
    document.body.innerHTML = `
      <div id="drop-overlay" class="hidden">
        <div id="drop-choices"></div>
      </div>
    `;

    const app = new MotoRogueApp();
    app.stateManager.player.itemStacks = {
      nitro_syringe: 0,
      tire_iron: 1,
      gasoline: 2
    };

    const pickup = {
      type: 'item_drop',
      choices: ['nitro_syringe', 'tire_iron', 'gasoline']
    } as any;

    (app as any).openDropChoiceModal(pickup);

    const overlay = document.getElementById('drop-overlay')!;
    expect(overlay.getAttribute('data-drop-new-count')).toBe('1');
    expect(overlay.getAttribute('data-drop-stack-upgrade-count')).toBe('1');
    expect(overlay.getAttribute('data-drop-evo-ready-count')).toBe('1');
    expect(overlay.getAttribute('data-drop-summary')).toContain('3 CHOICES');
    expect(overlay.getAttribute('data-drop-summary')).toContain('1 NEW');
    expect(overlay.getAttribute('data-drop-summary')).toContain('1 UPGRADE');
    expect(overlay.getAttribute('data-drop-summary')).toContain('1 EVO-READY');
    expect(overlay.classList.contains('hidden')).toBe(false);

    const cards = document.querySelectorAll('.drop-card');
    expect(cards.length).toBe(3);

    expect(cards[0].getAttribute('data-choice-stack-tier')).toBe('NEW');
    expect(cards[0].getAttribute('data-choice-current-stacks')).toBe('0');
    expect(cards[0].getAttribute('data-choice-next-stacks')).toBe('1');

    expect(cards[1].getAttribute('data-choice-stack-tier')).toBe('STACK_2');
    expect(cards[1].getAttribute('data-choice-current-stacks')).toBe('1');
    expect(cards[1].getAttribute('data-choice-next-stacks')).toBe('2');

    expect(cards[2].getAttribute('data-choice-stack-tier')).toBe('EVO_READY');
    expect(cards[2].getAttribute('data-choice-current-stacks')).toBe('2');
    expect(cards[2].getAttribute('data-choice-next-stacks')).toBe('3');
  });

  it('populates all-NEW telemetry and default data-choice-* attributes when player has zero item stacks', () => {
    document.body.innerHTML = `
      <div id="drop-overlay"></div>
    `;

    const app = new MotoRogueApp();
    app.stateManager.player.itemStacks = {};

    const pickup = {
      type: 'item_drop',
      choices: ['adrenaline_shot', 'heavy_plating', 'nano_repair']
    } as any;

    (app as any).openDropChoiceModal(pickup);

    const overlay = document.getElementById('drop-overlay')!;
    expect(overlay.getAttribute('data-drop-new-count')).toBe('3');
    expect(overlay.getAttribute('data-drop-stack-upgrade-count')).toBe('0');
    expect(overlay.getAttribute('data-drop-evo-ready-count')).toBe('0');
    expect(overlay.getAttribute('data-drop-summary')).toBe('DROPS: 3 CHOICES // 3 NEW · 0 UPGRADE · 0 EVO-READY');

    const cards = document.querySelectorAll('.drop-card');
    expect(cards.length).toBe(3);

    cards.forEach((card) => {
      expect(card.getAttribute('data-choice-stack-tier')).toBe('NEW');
      expect(card.getAttribute('data-choice-current-stacks')).toBe('0');
      expect(card.getAttribute('data-choice-next-stacks')).toBe('1');
    });
  });

  it('correctly tracks OVERSTACK tier and stack counts on pre-existing .drop-card elements', () => {
    document.body.innerHTML = `
      <div id="drop-overlay">
        <div class="drop-card" id="pre-card-0"></div>
        <div class="drop-card" id="pre-card-1"></div>
      </div>
    `;

    const app = new MotoRogueApp();
    app.stateManager.player.itemStacks = {
      gasoline: 3,
      tire_iron: 5
    };

    const pickup = {
      type: 'item_drop',
      choices: ['gasoline', 'tire_iron']
    } as any;

    (app as any).openDropChoiceModal(pickup);

    const overlay = document.getElementById('drop-overlay')!;
    expect(overlay.getAttribute('data-drop-new-count')).toBe('0');
    expect(overlay.getAttribute('data-drop-stack-upgrade-count')).toBe('2');
    expect(overlay.getAttribute('data-drop-evo-ready-count')).toBe('0');
    expect(overlay.getAttribute('data-drop-summary')).toBe('DROPS: 2 CHOICES // 0 NEW · 2 UPGRADE · 0 EVO-READY');

    const card0 = document.getElementById('pre-card-0')!;
    const card1 = document.getElementById('pre-card-1')!;

    expect(card0.getAttribute('data-choice-stack-tier')).toBe('OVERSTACK');
    expect(card0.getAttribute('data-choice-current-stacks')).toBe('3');
    expect(card0.getAttribute('data-choice-next-stacks')).toBe('4');

    expect(card1.getAttribute('data-choice-stack-tier')).toBe('OVERSTACK');
    expect(card1.getAttribute('data-choice-current-stacks')).toBe('5');
    expect(card1.getAttribute('data-choice-next-stacks')).toBe('6');
  });

  it('handles empty drop choices and absent DOM elements defensively without throwing', () => {
    // Sub-case A: Empty choices array with overlay present
    document.body.innerHTML = '<div id="drop-overlay"></div>';
    const app = new MotoRogueApp();
    const emptyPickup = { type: 'item_drop', choices: [] } as any;

    expect(() => (app as any).openDropChoiceModal(emptyPickup)).not.toThrow();

    const overlay = document.getElementById('drop-overlay')!;
    expect(overlay.getAttribute('data-drop-new-count')).toBe('0');
    expect(overlay.getAttribute('data-drop-stack-upgrade-count')).toBe('0');
    expect(overlay.getAttribute('data-drop-evo-ready-count')).toBe('0');
    expect(overlay.getAttribute('data-drop-summary')).toBe('DROPS: NO ITEMS AVAILABLE');
    expect(document.querySelectorAll('.drop-card').length).toBe(0);

    // Sub-case B: DOM without #drop-overlay present (should not throw)
    document.body.innerHTML = '<div></div>';
    const validPickup = { type: 'item_drop', choices: ['gasoline'] } as any;
    expect(() => (app as any).openDropChoiceModal(validPickup)).not.toThrow();
  });
});
