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
});
