/**
 * MOTO-ROGUE: E2E Test Suite — Tier 3: Cross-Feature Combinations & Synergies
 *
 * Verifies pairwise and multi-system mechanical interactions:
 *  1. Multi-Shot with Flamethrower (multiple puffs, independent hitIds)
 *  2. Tire Iron Crowbar with Shotgun buckshot pellets
 *  3. Brute Frontal Armor vs Railgun Pierce vs Flamethrower DoT
 *  4. Soldier's Syringe Stacking with Weapon Cooldown Calculations
 *  5. Gasoline On-Kill AoE Explosion chaining
 *  6. Split Chamber (+1 shot, -15% dmg) combined with Multi-Shot
 *  7. Chrome Lens Critical Strike stacking multiplicatively with Tire Iron
 *  8. 6-Slot Bike Equipment combined with Garage Meta Upgrade Ranks
 *  9. Arc Tesla Coil Primary Hit & Multi-Target Secondary Chain Damage (0.65x)
 * 10. Piercing Core (+1 pierce) combined with Rubberized Ricochet (+1 bounce)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  PlayerState,
  Room
} from '@/types/game';

import { WEAPONS } from '@/data/weapons';
import { RUN_MOD_POOL } from '@/data/upgrades';
import {
  createDefaultPlayerState,
  createDefaultMetaSave,
  resetPlayerStatsForRun
} from '@/core/state';

import {
  createCombatState,
  fireWeapon,
  calcFireCooldown,
  applyBruteArmor,
  applyTireIronBonus,
  rollCrit,
  updatePlayerBullets,
  handleEnemyDeath
} from '@/systems/combat';

import { createEnemy } from '@/systems/enemyAI';

describe('Tier 3: Cross-Feature Combinations & Synergies', () => {
  let player: PlayerState;

  beforeEach(() => {
    player = createDefaultPlayerState();
  });

  // --------------------------------------------------------------------------
  // Combination 1: Multi-Shot with Flamethrower
  // --------------------------------------------------------------------------
  describe('Combination 1: Multi-Shot with Flamethrower', () => {
    it('spawns multiple flame puffs simultaneously, each with an isolated hitIds Set', () => {
      const state = createCombatState();
      player.weapon = 'flamethrower';
      player.multiShot = 3; // 3 flame puffs fanned out
      player.fireTimer = 0;

      const fired = fireWeapon({
        player,
        target: { x: player.x + 150, y: player.y },
        state
      });

      expect(fired).toBe(true);
      expect(state.bullets).toHaveLength(3);

      // Verify all 3 bullets are flame puffs with independent hitIds sets
      for (const puff of state.bullets) {
        expect(puff.isFlame).toBe(true);
        expect(puff.pierceLeft).toBe(99);
        expect(puff.hitIds).toBeInstanceOf(Set);
      }
      expect(state.bullets[0].hitIds).not.toBe(state.bullets[1].hitIds);
    });
  });

  // --------------------------------------------------------------------------
  // Combination 2: Tire Iron Crowbar with Shotgun Buckshot Pellets
  // --------------------------------------------------------------------------
  describe('Combination 2: Tire Iron Crowbar with Shotgun Buckshot Pellets', () => {
    it('applies the +30% per stack damage multiplier to every shotgun pellet hitting healthy enemies (>90% HP)', () => {
      const tireIronStacks = 2; // +60% damage
      const basePelletDmg = WEAPONS.shotgun.damage; // 5.2

      // Target with 95% HP (qualifies for Crowbar)
      const healthyHp = 95;
      const maxHp = 100;
      const boostedDmg = applyTireIronBonus(basePelletDmg, healthyHp, maxHp, tireIronStacks);
      expect(boostedDmg).toBeCloseTo(basePelletDmg * (1 + 0.3 * 2)); // 5.2 * 1.6 = 8.32

      // Target with 85% HP (does NOT qualify)
      const injuredHp = 85;
      const regularDmg = applyTireIronBonus(basePelletDmg, injuredHp, maxHp, tireIronStacks);
      expect(regularDmg).toBe(basePelletDmg);
    });
  });

  // --------------------------------------------------------------------------
  // Combination 3: Brute Frontal Armor vs Railgun Pierce vs Flamethrower DoT
  // --------------------------------------------------------------------------
  describe('Combination 3: Brute Frontal Armor vs Railgun Pierce vs Flamethrower DoT', () => {
    it('mitigates Railgun bullet damage by 35% on Brute, but Flamethrower fire bypasses armor completely', () => {
      const railDmg = WEAPONS.railgun.damage; // 35
      const flameDmg = WEAPONS.flamethrower.damage; // 3.2

      // Non-flame Railgun vs Brute: mitigated to 0.65x
      const railVsBrute = applyBruteArmor(railDmg, 'brute', false);
      expect(railVsBrute).toBeCloseTo(railDmg * 0.65);

      // Flamethrower vs Brute: bypasses armor (1.0x)
      const flameVsBrute = applyBruteArmor(flameDmg, 'brute', true);
      expect(flameVsBrute).toBe(flameDmg);

      // Non-flame bullet vs regular enemy: no armor mitigation
      const railVsSwarmer = applyBruteArmor(railDmg, 'swarmer', false);
      expect(railVsSwarmer).toBe(railDmg);
    });
  });

  // --------------------------------------------------------------------------
  // Combination 4: Soldier's Syringe Stacking with Weapon Cooldown Calculations
  // --------------------------------------------------------------------------
  describe('Combination 4: Soldier\'s Syringe Stacking with Weapon Cooldown Calculations', () => {
    it('reduces fire cooldown via cooldown / (fireRateMult * (1 + 0.15 * stacks))', () => {
      const baseCd = WEAPONS.machine_gun.cooldown; // 0.095s

      // 0 stacks, base fireRateMult 1.0
      expect(calcFireCooldown(baseCd, 1.0, 0)).toBeCloseTo(baseCd);

      // 4 stacks (+60% fire rate), base fireRateMult 1.0
      // 0.095 / (1.0 * 1.60) = 0.059375s
      const cd4 = calcFireCooldown(baseCd, 1.0, 4);
      expect(cd4).toBeCloseTo(baseCd / 1.60);

      // 4 stacks + 1.25x player fireRateMult
      // 0.095 / (1.25 * 1.60) = 0.095 / 2.0 = 0.0475s
      const cdCombined = calcFireCooldown(baseCd, 1.25, 4);
      expect(cdCombined).toBeCloseTo(baseCd / 2.0);
    });
  });

  // --------------------------------------------------------------------------
  // Combination 5: Gasoline On-Kill AoE Explosion Chaining
  // --------------------------------------------------------------------------
  describe('Combination 5: Gasoline On-Kill AoE Explosion Chaining', () => {
    it('triggers radius 50 + 14N and damage 10 + 8N AoE explosion on enemy kill', () => {
      player.itemStacks = { gasoline: 2 };
      const state = createCombatState();

      // Enemy 1 dies at (300, 300)
      const en1 = createEnemy('swarmer', 300, 300, 1);
      // Enemy 2 is nearby at (330, 300) within explosion radius (50 + 14*2 = 78px)
      const en2 = createEnemy('swarmer', 330, 300, 1);
      const en2InitialHp = en2.hp;

      const dummyRoom: Room = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [],
        enemies: [en1, en2],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      handleEnemyDeath({
        room: dummyRoom,
        enemy: en1,
        index: 0,
        player,
        state,
        floorNum: 1
      });

      // Enemy 2 must have taken explosion damage from en1's death
      expect(en2.hp).toBeLessThan(en2InitialHp);
    });
  });

  // --------------------------------------------------------------------------
  // Combination 6: Split Chamber (+1 shot, -15% dmg) combined with Multi-Shot
  // --------------------------------------------------------------------------
  describe('Combination 6: Split Chamber (+1 shot, -15% dmg) combined with Multi-Shot', () => {
    it('increases player multiShot by 1 and decreases dmgMult by 15%', () => {
      const splitChamber = RUN_MOD_POOL.find(m => m.id === 'split_chamber')!;
      expect(splitChamber).toBeDefined();

      const initialShots = player.multiShot; // 1
      const initialDmg = player.dmgMult; // 1.0

      splitChamber.apply(player);

      expect(player.multiShot).toBe(initialShots + 1); // 2
      expect(player.dmgMult).toBeCloseTo(initialDmg - 0.15); // 0.85
    });
  });

  // --------------------------------------------------------------------------
  // Combination 7: Chrome Lens Critical Strike stacking multiplicatively with Tire Iron
  // --------------------------------------------------------------------------
  describe('Combination 7: Chrome Lens Critical Strike stacking multiplicatively with Tire Iron', () => {
    it('multiplies base damage by 2x crit and then by Crowbar bonus on healthy targets', () => {
      const baseDmg = 20;
      const tireIronStacks = 2; // +60% bonus

      // Enemy with 95% HP
      const hp = 95;
      const maxHp = 100;

      // 1. Apply Tire Iron bonus: 20 * 1.6 = 32
      const crowbarDmg = applyTireIronBonus(baseDmg, hp, maxHp, tireIronStacks);
      expect(crowbarDmg).toBe(32);

      // 2. Critical strike rolls true (2x multiplier)
      const critResult = rollCrit(5, false, () => 0.01);
      expect(critResult.isCrit).toBe(true);
      expect(critResult.mult).toBe(2);

      // Combined damage: 32 * 2 = 64
      const totalDmg = crowbarDmg * critResult.mult;
      expect(totalDmg).toBe(64);
    });
  });

  // --------------------------------------------------------------------------
  // Combination 8: 6-Slot Bike Equipment + Garage Meta Ranks Stat Combination
  // --------------------------------------------------------------------------
  describe('Combination 8: 6-Slot Bike Equipment + Garage Meta Ranks Stat Combination', () => {
    it('aggregates equipped part stat multipliers and garage upgrade ranks onto player baseline stats', () => {
      const meta = createDefaultMetaSave();

      // Meta upgrades: +20% dmg (rank 2), +16% fireRate (rank 2), +12% speed (rank 2), +2 maxHp (rank 2)
      meta.ranks.dmg = 2;
      meta.ranks.fireRate = 2;
      meta.ranks.speed = 2;
      meta.ranks.maxHp = 2;

      // Equip Legendary Tires (+21% speed) and Engine (+25% dmg)
      meta.equipped.tires = {
        slot: 'tires',
        rarity: 3,
        name: 'Apex Racing Tires',
        stats: { speed: 0.21 }
      };
      meta.equipped.engine = {
        slot: 'engine',
        rarity: 3,
        name: 'Twin-Turbo V8',
        stats: { dmg: 0.25 }
      };

      resetPlayerStatsForRun(player, meta);

      // Expected dmgMult: 1.0 + (2 * 0.10) + 0.25 = 1.45
      expect(player.dmgMult).toBeCloseTo(1.45);

      // Expected speedMult: 1.0 + (2 * 0.06) + 0.21 = 1.33
      expect(player.speedMult).toBeCloseTo(1.33);

      // Expected fireRateMult: 1.0 + (2 * 0.08) = 1.16
      expect(player.fireRateMult).toBeCloseTo(1.16);

      // Expected maxHp: 6 + 2 = 8
      expect(player.maxHp).toBe(8);
      expect(player.hp).toBe(8);
    });
  });

  // --------------------------------------------------------------------------
  // Combination 9: Arc Tesla Coil Primary Hit & Secondary Chain Lightning
  // --------------------------------------------------------------------------
  describe('Combination 9: Arc Tesla Coil Primary Hit & Secondary Chain Lightning', () => {
    it('inflicts 100% damage on primary target and chains 65% damage to up to 3 nearby enemies', () => {
      const state = createCombatState();
      player.weapon = 'arc_coil';
      player.fireTimer = 0;

      // Primary target at (300, 300)
      const primary = createEnemy('swarmer', 300, 300, 1);
      // Secondary target within 155px at (350, 300)
      const secondary = createEnemy('swarmer', 350, 300, 1);
      const priInitHp = primary.hp;
      const secInitHp = secondary.hp;

      const dummyRoom: Room = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [],
        enemies: [primary, secondary],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      // Fire weapon towards primary target
      fireWeapon({
        player,
        target: { x: 300, y: 300 },
        state
      });

      expect(state.bullets).toHaveLength(1);
      // Place bullet directly overlapping primary target
      state.bullets[0].x = 300;
      state.bullets[0].y = 300;

      // Update bullets to resolve impact and arc chaining
      updatePlayerBullets(0.016, state.bullets, dummyRoom, player, state);

      // Primary enemy hit for base damage (15)
      expect(primary.hp).toBeCloseTo(priInitHp - 15);
      // Secondary enemy hit for chained damage (15 * 0.65 = 9.75)
      expect(secondary.hp).toBeCloseTo(secInitHp - 15 * 0.65);
      // Lightning beam effect created between primary and secondary
      expect(state.beamEffects.some(b => b.isLightning)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Combination 10: Piercing Core (+1 pierce) + Rubberized Ricochet (+1 bounce)
  // --------------------------------------------------------------------------
  describe('Combination 10: Piercing Core (+1 pierce) + Rubberized Ricochet (+1 bounce)', () => {
    it('applies both pierce and bounce properties simultaneously to player bullets', () => {
      const piercingCore = RUN_MOD_POOL.find(m => m.id === 'piercing_core')!;
      const ricochetMod = RUN_MOD_POOL.find(m => m.id === 'ricochet_mod')!;

      piercingCore.apply(player);
      ricochetMod.apply(player);

      expect(player.pierce).toBe(1);
      expect(player.bounce).toBe(1);

      const state = createCombatState();
      player.weapon = 'pistol';
      player.fireTimer = 0;

      fireWeapon({
        player,
        target: { x: player.x + 200, y: player.y },
        state
      });

      expect(state.bullets).toHaveLength(1);
      expect(state.bullets[0].pierceLeft).toBe(1);
      expect(state.bullets[0].bounceLeft).toBe(1);
    });
  });
});
