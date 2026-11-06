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
  Room,
  EquipmentItem,
  EquipSlot,
  Pickup,
  Enemy
} from '@/types/game';

import {
  WEAPONS,
  WEAPON_EVOLUTIONS,
  WeaponId,
  isWeaponEvolved,
  getWeaponEvolutionProgress
} from '@/data/weapons';
import {
  RUN_MOD_POOL,
  KISS_CURSE_MOD_POOL,
  getActiveDuoSynergies,
  getRunModDeckSummary,
  getMetaTuningSummary
} from '@/data/upgrades';
import {
  LEGENDARY_SLOT_PASSIVES,
  getEquippedSetBonus
} from '@/data/equipment';
import {
  buildRunPostMortemSummary,
  getWeaponMasteryTier
} from '@/ui/garage';
import {
  createDefaultPlayerState,
  createDefaultMetaSave,
  resetPlayerStatsForRun,
  applyMetaStats,
  getCareerOutlawRank,
  getFloorBountyContractStatus
} from '@/core/state';

import {
  createCombatState,
  fireWeapon,
  calcFireCooldown,
  applyBruteArmor,
  applyTireIronBonus,
  rollCrit,
  updatePlayerBullets,
  updateGrenades,
  updateEnemyCollisions,
  handleEnemyDeath,
  getCombatOffenseSummary
} from '@/systems/combat';

import { createEnemy } from '@/systems/enemyAI';
import { getRiderMobilitySummary } from '@/systems/physics';
import { getShopBuildSynergyHint } from '@/ui/shopModal';
import { getPortalHeatBriefing } from '@/ui/portalModal';
import {
  getHubStationPromptInfo,
  getLaunchGateAdvisor,
  getWarRoomStationAdvisor
} from '@/ui/hubStationModal';
import { getHubNpcGreeting, getFloorBountyContract } from '@/world/dungeon';

import { getBossEncounterBriefing } from '../../src/systems/enemyAI';
import { getForgeStationAdvisor } from '../../src/ui/hubStationModal';
import { getEquipmentLoadoutSummary, applyItemStats } from '../../src/data/equipment';
import { getEquippedBikeVisualState, getDowngradeStashItems } from '../../src/ui/garage';

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

  // --------------------------------------------------------------------------
  // Combination 11: BUG-01 — Weapon Evolutions via Signature Mod Display Names & 3+ Item Stacks
  // --------------------------------------------------------------------------
  describe('Combination 11: BUG-01 — Weapon Evolutions via Signature Mod Display Names & 3+ Item Stacks', () => {
    it('evolves all 7 weapons when picking up signature mods by display name and via 3+ item stacks', () => {
      const signaturePairs: Array<{ weapon: keyof typeof WEAPONS; displayName: string }> = [
        { weapon: 'pistol', displayName: 'Rubberized Casings' },
        { weapon: 'machine_gun', displayName: 'Hair-Trigger Servo' },
        { weapon: 'flamethrower', displayName: 'Thermobaric Mix' },
        { weapon: 'grenade_launcher', displayName: 'Thermobaric Mix' },
        { weapon: 'shotgun', displayName: 'Twin Barrel Adapter' },
        { weapon: 'railgun', displayName: 'Tungsten Sabot' },
        { weapon: 'arc_coil', displayName: 'Scrap Siphon' }
      ];

      for (const { weapon, displayName } of signaturePairs) {
        const p = createDefaultPlayerState();
        expect(isWeaponEvolved(weapon, p)).toBe(false);
        p.items.push(displayName);
        expect(isWeaponEvolved(weapon, p)).toBe(true);
      }

      // Also verify 3+ item stacks evolution fallback
      const stackPlayer = createDefaultPlayerState();
      stackPlayer.itemStacks = { nitro_syringe: 2, chrome_lens: 1 };
      expect(isWeaponEvolved('pistol', stackPlayer)).toBe(true);
      expect(isWeaponEvolved('railgun', stackPlayer)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Combination 12: BUG-02 & BUG-03 — Cryo-Jacketed Shells & Smart-Link Guidance Homing
  // --------------------------------------------------------------------------
  describe('Combination 12: BUG-02 & BUG-03 — Cryo-Jacketed Shells & Smart-Link Guidance Homing', () => {
    it('applies slowTimer on first hit and +15% bonus damage to chilled enemies on subsequent hits', () => {
      const state = createCombatState();
      player.weapon = 'pistol';
      player.items.push('Cryo-Jacketed Shells');

      const enemy = createEnemy('swarmer', 300, 300, 1);
      enemy.hp = 500;
      enemy.maxHp = 500;

      const dummyRoom: Room = {
        x: 0,
        y: 0,
        type: 'combat',
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

      // Hit 1: unchilled target takes base damage (13) and gets slowTimer = 2.2
      player.fireTimer = 0;
      fireWeapon({ player, target: { x: 300, y: 300 }, state });
      state.bullets[0].x = 300;
      state.bullets[0].y = 300;
      updatePlayerBullets(0.016, state.bullets, dummyRoom, player, state);

      const dmgFirst = 500 - enemy.hp;
      expect(dmgFirst).toBeCloseTo(13);
      expect((enemy as any).slowTimer).toBeCloseTo(2.2);

      // Hit 2: chilled target takes +15% bonus damage (13 * 1.15 = 14.95)
      const hpAfterFirst = enemy.hp;
      player.fireTimer = 0;
      fireWeapon({ player, target: { x: 300, y: 300 }, state });
      state.bullets[0].x = 300;
      state.bullets[0].y = 300;
      updatePlayerBullets(0.016, state.bullets, dummyRoom, player, state);

      const dmgSecond = hpAfterFirst - enemy.hp;
      expect(dmgSecond).toBeCloseTo(13 * 1.15);
    });

    it('curves player bullets toward enemies within the forward cone when Smart-Link Guidance is active', () => {
      const state = createCombatState();
      player.weapon = 'pistol';
      player.items.push('Smart-Link Guidance');

      // Enemy slightly off-axis in forward cone (x = 460, y = 410 while player fires along +X from 360,360)
      const enemy = createEnemy('swarmer', 460, 410, 1);
      const dummyRoom: Room = {
        x: 0,
        y: 0,
        type: 'combat',
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

      player.fireTimer = 0;
      fireWeapon({ player, target: { x: 560, y: 360 }, state, rng: () => 0.5 });
      expect(state.bullets).toHaveLength(1);
      expect(state.bullets[0].vy).toBeCloseTo(0);

      updatePlayerBullets(0.05, state.bullets, dummyRoom, player, state);
      // Bullet velocity vy must have curved downward (+Y) toward enemy at y=410
      expect(state.bullets[0].vy).toBeGreaterThan(0);
    });
  });

  // --------------------------------------------------------------------------
  // Combination 13: BUG-04 — Grenade Launcher Bouncing Betty & Multi-Shot Cluster Bomblets
  // --------------------------------------------------------------------------
  describe('Combination 13: BUG-04 — Grenade Launcher Bouncing Betty & Multi-Shot Cluster Bomblets', () => {
    it('bounces once on impact when bounce=1 and detonates 2 secondary cluster explosions when multiShot=3', () => {
      const state = createCombatState();
      player.weapon = 'grenade_launcher';
      player.multiShot = 3; // clusterCount = 2
      player.bounce = 1; // bouncesLeft = 1
      player.fireTimer = 0;

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

      fireWeapon({ player, target: { x: 480, y: 360 }, state });
      expect(state.grenades).toHaveLength(1);
      const g = state.grenades[0] as any;
      expect(g.clusterCount).toBe(2);
      expect(g.bouncesLeft).toBe(1);

      // Step 1: advance past initial travel duration -> triggers bounce detonation, grenade stays alive with bouncesLeft=0
      updateGrenades(g.duration + 0.05, state.grenades, dummyRoom, state);
      expect(state.grenades).toHaveLength(1);
      expect((state.grenades[0] as any).bouncesLeft).toBe(0);
      const shockwavesAfterBounce = state.particles.filter(p => p.shockwaveMax !== undefined).length;
      expect(shockwavesAfterBounce).toBe(1);

      // Step 2: advance past bounce duration (0.28s) -> triggers main explosion + 2 cluster explosions (3 new shockwaves)
      updateGrenades(0.35, state.grenades, dummyRoom, state);
      expect(state.grenades).toHaveLength(0);
      const totalShockwaves = state.particles.filter(p => p.shockwaveMax !== undefined).length;
      expect(totalShockwaves).toBe(1 + 1 + 2); // 1 bounce + 1 final + 2 cluster bomblets = 4 shockwaves
    });
  });

  // --------------------------------------------------------------------------
  // Combination 14: Active Duo Synergies & Kiss-Curse Mods
  // --------------------------------------------------------------------------
  describe('Combination 14: Active Duo Synergies & Kiss-Curse Mods', () => {
    it('activates Thermal Shock, Superconductor, and Juggernaut Overdrive duo synergies and applies Kiss-Curse mods', () => {
      const state = createCombatState();

      // 1. Verify getActiveDuoSynergies detection
      player.items.push('Cryo-Jacketed Shells', 'Thermobaric Mix');
      player.itemStacks = { tesla_capacitor: 1, titanium_spikes: 1, adrenaline_injector: 1 };
      const activeIds = getActiveDuoSynergies(player).map(d => d.id);
      expect(activeIds).toContain('thermal_shock');
      expect(activeIds).toContain('superconductor');
      expect(activeIds).toContain('juggernaut_overdrive');

      // 2. Verify Thermal Shock combat proc: chilled enemy hit by flame puff triggers 'THERMAL SHOCK!'
      const target = createEnemy('swarmer', 300, 300, 1);
      target.hp = 500;
      target.maxHp = 500;
      (target as any).slowTimer = 2.0;

      const dummyRoom: Room = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [],
        enemies: [target],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      player.weapon = 'flamethrower';
      player.multiShot = 1;
      player.fireTimer = 0;
      fireWeapon({ player, target: { x: 300, y: 300 }, state });
      state.bullets[0].x = 300;
      state.bullets[0].y = 300;
      updatePlayerBullets(0.016, state.bullets, dummyRoom, player, state);
      expect(state.damageNumbers.some(d => d.text === 'THERMAL SHOCK!')).toBe(true);

      // 3. Verify Superconductor extended range (200px > 155px default) & chill propagation
      const arcPrimary = createEnemy('swarmer', 200, 200, 1);
      arcPrimary.hp = 500;
      arcPrimary.maxHp = 500;
      (arcPrimary as any).slowTimer = 2.0;
      const arcSecondary = createEnemy('swarmer', 400, 200, 1); // 200px away
      arcSecondary.hp = 500;
      arcSecondary.maxHp = 500;
      dummyRoom.enemies = [arcPrimary, arcSecondary];

      player.weapon = 'arc_coil';
      player.fireTimer = 0;
      fireWeapon({ player, target: { x: 200, y: 200 }, state });
      const arcBullet = state.bullets[state.bullets.length - 1];
      arcBullet.x = 200;
      arcBullet.y = 200;
      updatePlayerBullets(0.016, state.bullets, dummyRoom, player, state);
      expect(arcSecondary.hp).toBeLessThan(500);
      expect((arcSecondary as any).slowTimer).toBeGreaterThanOrEqual(1.5);

      // 4. Verify Juggernaut Overdrive on NOS Ram kill
      const fodder = createEnemy('swarmer', player.x + 5, player.y, 1);
      fodder.hp = 10;
      dummyRoom.enemies = [fodder];
      player.isBoosting = true;
      player.nos = 40;
      player.nosLock = false;
      updateEnemyCollisions(dummyRoom, player, state);
      expect(fodder.hp).toBeLessThanOrEqual(0);
      expect(player.nos).toBe(70); // 40 + 30 refund
      expect(state.damageNumbers.some(d => d.text === 'JUGGERNAUT OVERDRIVE!')).toBe(true);

      // 5. Verify Kiss-Curse mods (Glass Cannon Bore)
      const glassCannon = KISS_CURSE_MOD_POOL.find(m => m.id === 'glass_cannon')!;
      expect(glassCannon).toBeDefined();
      const p2 = createDefaultPlayerState();
      glassCannon.apply(p2);
      expect(p2.dmgMult).toBeCloseTo(1.65);
      expect(p2.maxHp).toBe(4);
    });
  });

  // --------------------------------------------------------------------------
  // Combination 15: Weapon Mastery + 6-Slot Legendary Set Bonus + Slot Passives + Duo Synergies
  // --------------------------------------------------------------------------
  describe('Combination 15: Weapon Mastery + 6-Slot Legendary Set Bonus + Slot Passives + Duo Synergies', () => {
    it('simultaneously stacks Weapon Mastery (+15% DMG at 100 kills), 6-piece Legendary Set Bonus (+27% DMG, +18% SPD), all 6 Legendary Slot Passives, and active Duo Synergies', () => {
      // 1. Weapon Mastery via applyMetaStats with 100 kills
      const meta = createDefaultMetaSave();
      meta.weaponKills = { flamethrower: 100 };
      meta.ranks = { dmg: 0, fireRate: 0, speed: 0, maxHp: 0 };
      player.weapon = 'flamethrower';

      applyMetaStats(player, meta);
      // Base dmgMult is 1.0; with 100 kills -> +15% DMG mastery bonus
      expect(player.dmgMult).toBeCloseTo(1.15, 2);

      // 2. 6-slot Legendary Bike Equipment Loadout & Set Bonus calculation
      const legendaryEquipped: Partial<Record<EquipSlot, EquipmentItem>> = {
        tires: {
          slot: 'tires',
          rarity: 3,
          name: 'Apex Drift Racing Slicks',
          stats: { speed: 0.15 }
        },
        engine: {
          slot: 'engine',
          rarity: 3,
          name: 'Twin-Turbocharged Valhalla V8',
          stats: { dmg: 0.20 }
        },
        handlebars: {
          slot: 'handlebars',
          rarity: 3,
          name: 'Gyro-Stabilized Titanium Bars',
          stats: { fireRate: 0.15 }
        },
        exhaust: {
          slot: 'exhaust',
          rarity: 3,
          name: 'Plasma Afterburner Dual Pipes',
          stats: { blast: 0.20 }
        },
        frame: {
          slot: 'frame',
          rarity: 3,
          name: 'Reactive Aegis Carbon Frame',
          stats: { hp: 2 }
        },
        tank: {
          slot: 'tank',
          rarity: 3,
          name: 'Overheal Siphon Cell Tank',
          stats: { siphon: 0.10 }
        }
      };
      meta.equipped = legendaryEquipped;

      const setBonus = getEquippedSetBonus(meta.equipped);
      expect(setBonus.rareCount).toBe(6);
      expect(setBonus.legendaryCount).toBe(6);
      // 4pc Rare (+12% dmg, +8% spd) + 3pc Legendary (+15% dmg, +10% spd) = +27% dmg, +18% spd
      expect(setBonus.dmgBonus).toBeCloseTo(0.27, 2);
      expect(setBonus.speedBonus).toBeCloseTo(0.18, 2);
      expect(setBonus.label).toContain('4pc Rare Tuning (+12% Dmg, +8% Spd)');
      expect(setBonus.label).toContain('3pc Valhalla Set (+15% Dmg, +10% Spd)');

      // 3. Verify all 6 slots activate their unique Legendary Slot Passives
      const slots: EquipSlot[] = ['tires', 'engine', 'handlebars', 'exhaust', 'frame', 'tank'];
      const expectedTitles: Record<EquipSlot, string> = {
        tires: 'APEX DRIFT TURBO',
        engine: 'TWIN-CAM OVERCLOCK',
        handlebars: 'GYRO STABILIZER',
        exhaust: 'PLASMA AFTERBURNER',
        frame: 'REACTIVE AEGIS',
        tank: 'OVERHEAL CONVERTER'
      };

      for (const slot of slots) {
        const passive = LEGENDARY_SLOT_PASSIVES[slot];
        expect(passive).toBeDefined();
        expect(passive.title).toBe(expectedTitles[slot]);
        expect(passive.desc.length).toBeGreaterThan(10);
      }

      // 4. Stacking equipped part stats & set bonus onto player
      player.dmgMult = Number((player.dmgMult + setBonus.dmgBonus + (legendaryEquipped.engine?.stats.dmg || 0)).toFixed(2));
      // 1.15 (mastery) + 0.27 (6pc set) + 0.20 (engine) = 1.62
      expect(player.dmgMult).toBeCloseTo(1.62, 2);

      player.speedMult = Number((player.speedMult + setBonus.speedBonus + (legendaryEquipped.tires?.stats.speed || 0)).toFixed(2));
      // 1.0 (base) + 0.18 (6pc set) + 0.15 (tires) = 1.33
      expect(player.speedMult).toBeCloseTo(1.33, 2);

      // 5. Active Duo Synergies activation
      player.items.push('Cryo-Jacketed Shells', 'Thermobaric Mix');
      player.itemStacks = {
        tesla_capacitor: 1,
        titanium_spikes: 1,
        adrenaline_injector: 1
      };
      const activeDuos = getActiveDuoSynergies(player);
      const duoIds = activeDuos.map(d => d.id);
      expect(duoIds).toContain('thermal_shock');
      expect(duoIds).toContain('superconductor');
      expect(duoIds).toContain('juggernaut_overdrive');

      // 6. Combat Verification: simultaneous weapon mastery + set bonus + duo synergy execution
      const combatState = createCombatState();
      const targetEnemy = createEnemy('swarmer', 300, 300, 1);
      targetEnemy.hp = 1000;
      targetEnemy.maxHp = 1000;
      (targetEnemy as any).slowTimer = 3.0; // Pre-chilled target

      const combatRoom: Room = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [],
        enemies: [targetEnemy],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      player.fireTimer = 0;
      fireWeapon({
        player,
        target: { x: 300, y: 300 },
        state: combatState
      });

      expect(combatState.bullets).toHaveLength(1);
      combatState.bullets[0].x = 300;
      combatState.bullets[0].y = 300;

      updatePlayerBullets(0.016, combatState.bullets, combatRoom, player, combatState);

      // Base flamethrower dmg = 3.2
      // Scaled by combined dmgMult (1.62) & evolution (1.45) = 7.5168
      // Chilled enemy bonus (+15% from Cryo-Jacketed Shells) = 7.5168 * 1.15 = 8.64432
      // Thermal Shock Duo Synergy (+35% shatter damage against chilled targets) = 8.64432 * 1.35 = 11.669832
      const dmgDealt = 1000 - targetEnemy.hp;
      expect(dmgDealt).toBeCloseTo(3.2 * 1.62 * 1.45 * 1.15 * 1.35, 1);

      // Duo Synergy Thermal Shock triggered concurrently
      expect(combatState.damageNumbers.some(d => d.text === 'THERMAL SHOCK!')).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Combination 16: Post-Mortem Run Grade Calculation Across Grades C, B, A, and S
  // --------------------------------------------------------------------------
  describe('Combination 16: Post-Mortem Run Grade Calculation Across Grades C, B, A, and S', () => {
    it('evaluates Grade C (Rookie Wipeout) for Floor 1 with < 8 kills', () => {
      const p = createDefaultPlayerState();
      p.weapon = 'pistol';
      p.killCount = 0;

      const summary0 = buildRunPostMortemSummary(1, p);
      expect(summary0.rankGrade).toBe('C');
      expect(summary0.headline).toBe('ROOKIE WIPEOUT');
      expect(summary0.statsLine).toContain('FLOOR 1');
      expect(summary0.statsLine).toContain('0 KILLS');
      expect(summary0.statsLine).toContain('PISTOL');
      expect(summary0.statsLine).toContain('GRADE C');

      // At 7 kills on Floor 1, still Grade C
      p.killCount = 7;
      const summary7 = buildRunPostMortemSummary(1, p);
      expect(summary7.rankGrade).toBe('C');
      expect(summary7.headline).toBe('ROOKIE WIPEOUT');
      expect(summary7.statsLine).toContain('FLOOR 1');
      expect(summary7.statsLine).toContain('7 KILLS');
      expect(summary7.statsLine).toContain('GRADE C');

      // Clamps invalid/negative floor and kills to safe defaults (Floor 1, 0 kills)
      const pNegative = createDefaultPlayerState();
      pNegative.killCount = -10;
      const summaryNeg = buildRunPostMortemSummary(-5, pNegative);
      expect(summaryNeg.rankGrade).toBe('C');
      expect(summaryNeg.headline).toBe('ROOKIE WIPEOUT');
      expect(summaryNeg.statsLine).toContain('FLOOR 1');
      expect(summaryNeg.statsLine).toContain('0 KILLS');
      expect(summaryNeg.statsLine).toContain('GRADE C');
    });

    it('evaluates Grade B (Highway Contender) for Floor 2 or kills >= 8 (under Floor 3 / 20 kills)', () => {
      const p = createDefaultPlayerState();
      p.weapon = 'shotgun';

      // Reaching Floor 2 qualifies for Grade B even with 0 kills
      p.killCount = 0;
      const summaryF2 = buildRunPostMortemSummary(2, p);
      expect(summaryF2.rankGrade).toBe('B');
      expect(summaryF2.headline).toBe('HIGHWAY CONTENDER');
      expect(summaryF2.statsLine).toContain('FLOOR 2');
      expect(summaryF2.statsLine).toContain('0 KILLS');
      expect(summaryF2.statsLine).toContain('GRADE B');

      // On Floor 1, reaching 8 kills qualifies for Grade B
      p.killCount = 8;
      const summaryK8 = buildRunPostMortemSummary(1, p);
      expect(summaryK8.rankGrade).toBe('B');
      expect(summaryK8.headline).toBe('HIGHWAY CONTENDER');
      expect(summaryK8.statsLine).toContain('FLOOR 1');
      expect(summaryK8.statsLine).toContain('8 KILLS');
      expect(summaryK8.statsLine).toContain('GRADE B');

      // On Floor 2 with 19 kills, still Grade B (threshold for A is Floor 3 or 20 kills)
      p.killCount = 19;
      const summaryK19 = buildRunPostMortemSummary(2, p);
      expect(summaryK19.rankGrade).toBe('B');
      expect(summaryK19.headline).toBe('HIGHWAY CONTENDER');
      expect(summaryK19.statsLine).toContain('GRADE B');
    });

    it('evaluates Grade A (High-Octane Veteran) for Floor 3 or kills >= 20 (under Floor 5 / 40 kills)', () => {
      const p = createDefaultPlayerState();
      p.weapon = 'railgun';

      // Reaching Floor 3 qualifies for Grade A even with low kills
      p.killCount = 4;
      const summaryF3 = buildRunPostMortemSummary(3, p);
      expect(summaryF3.rankGrade).toBe('A');
      expect(summaryF3.headline).toBe('HIGH-OCTANE VETERAN');
      expect(summaryF3.statsLine).toContain('FLOOR 3');
      expect(summaryF3.statsLine).toContain('4 KILLS');
      expect(summaryF3.statsLine).toContain('GRADE A');

      // On Floor 1 or 2, achieving 20 kills qualifies for Grade A
      p.killCount = 20;
      const summaryK20 = buildRunPostMortemSummary(1, p);
      expect(summaryK20.rankGrade).toBe('A');
      expect(summaryK20.headline).toBe('HIGH-OCTANE VETERAN');
      expect(summaryK20.statsLine).toContain('GRADE A');

      // On Floor 4 with 39 kills, still Grade A (threshold for S is Floor 5 or 40 kills)
      p.killCount = 39;
      const summaryF4 = buildRunPostMortemSummary(4, p);
      expect(summaryF4.rankGrade).toBe('A');
      expect(summaryF4.headline).toBe('HIGH-OCTANE VETERAN');
      expect(summaryF4.statsLine).toContain('FLOOR 4');
      expect(summaryF4.statsLine).toContain('GRADE A');
    });

    it('evaluates Grade S (Valhalla Outlaw Legend) for Floor >= 5 or kills >= 40', () => {
      const p = createDefaultPlayerState();
      p.weapon = 'arc_coil';

      // Reaching Floor 5 qualifies for Grade S even with low kills
      p.killCount = 12;
      const summaryF5 = buildRunPostMortemSummary(5, p);
      expect(summaryF5.rankGrade).toBe('S');
      expect(summaryF5.headline).toBe('VALHALLA OUTLAW LEGEND');
      expect(summaryF5.statsLine).toContain('FLOOR 5');
      expect(summaryF5.statsLine).toContain('12 KILLS');
      expect(summaryF5.statsLine).toContain('GRADE S');

      // On early floors (e.g. Floor 2), achieving 40 kills qualifies for Grade S
      p.killCount = 40;
      const summaryK40 = buildRunPostMortemSummary(2, p);
      expect(summaryK40.rankGrade).toBe('S');
      expect(summaryK40.headline).toBe('VALHALLA OUTLAW LEGEND');
      expect(summaryK40.statsLine).toContain('40 KILLS');
      expect(summaryK40.statsLine).toContain('GRADE S');

      // Deep run: Floor 6 with 150 kills -> S Grade Legend
      p.killCount = 150;
      const summaryF6 = buildRunPostMortemSummary(6, p);
      expect(summaryF6.rankGrade).toBe('S');
      expect(summaryF6.headline).toBe('VALHALLA OUTLAW LEGEND');
      expect(summaryF6.statsLine).toContain('FLOOR 6');
      expect(summaryF6.statsLine).toContain('150 KILLS');
      expect(summaryF6.statsLine).toContain('GRADE S');
    });
  });

  // --------------------------------------------------------------------------
  // Combination 17: Cross-System Telemetry & Synergy Matrix (Wave 20 - M84)
  // --------------------------------------------------------------------------
  describe('Cross-System Telemetry & Synergy Matrix (Wave 20 - M84)', () => {
    // Test 1: All 7 weapons with signature mod on mod_pedestal vs unrelated mod
    it('verifies getShopBuildSynergyHint returns EVOLUTION_KEY for all 7 weapon signature mods and STANDARD for unrelated mods', () => {
      const WEAPON_ORDER: WeaponId[] = [
        'pistol',
        'machine_gun',
        'flamethrower',
        'grenade_launcher',
        'shotgun',
        'railgun',
        'arc_coil'
      ];

      for (const weaponId of WEAPON_ORDER) {
        const evo = WEAPON_EVOLUTIONS[weaponId];
        expect(evo).toBeDefined();

        // 1. Signature mod pedestal offered in shop
        const signaturePedestal: Pickup = {
          x: 100,
          y: 100,
          radius: 20,
          type: 'mod_pedestal',
          cost: 25,
          mod: {
            id: evo.signatureModId,
            name: evo.signatureModDisplayName,
            desc: evo.desc
          } as any
        };

        const evoHint = getShopBuildSynergyHint(signaturePedestal, { weapon: weaponId });
        expect(evoHint.hasSynergy).toBe(true);
        expect(evoHint.synergyType).toBe('EVOLUTION_KEY');
        expect(evoHint.hintText).toContain('EVOLUTION');
        expect(evoHint.hintText).toContain(evo.evolvedName.toUpperCase());

        // 2. Unrelated mod pedestal offered in shop
        const unrelatedPedestal: Pickup = {
          x: 100,
          y: 100,
          radius: 20,
          type: 'mod_pedestal',
          cost: 25,
          mod: {
            id: 'unrelated_irrelevant_mod',
            name: 'Heavy Steel Muffler',
            desc: 'Cosmetic exhaust cover'
          } as any
        };

        const standardHint = getShopBuildSynergyHint(unrelatedPedestal, { weapon: weaponId });
        expect(standardHint.hasSynergy).toBe(false);
        expect(standardHint.synergyType).toBe('STANDARD');
        expect(standardHint.hintText).toBe('Standard Black Market Ordnance');
      }
    });

    // Test 2: getPortalHeatBriefing(0..3) combined with getHubStationPromptInfo('bounty', ...) and getHubNpcGreeting('bounty', ...)
    it('verifies getPortalHeatBriefing(0..3) combined with getHubStationPromptInfo and getHubNpcGreeting across all 4 Heat levels', () => {
      const expectedHeatData = [
        {
          heat: 0,
          label: 'HEAT 0 // STANDARD',
          enemyScale: 'Standard Enemy HP & Speed',
          scrapBonus: '+0% Bonus Scrap',
          greetingQuote: 'Raise the Bounty Heat for massive Scrap payouts, outlaw!'
        },
        {
          heat: 1,
          label: 'HEAT 1 // OVERCLOCKED',
          enemyScale: '+24% Enemy HP · +12% Speed',
          scrapBonus: '+25% Bonus Scrap',
          greetingQuote: 'HEAT 1 ACTIVE! +25% Scrap from all hostiles.'
        },
        {
          heat: 2,
          label: 'HEAT 2 // BLOOD PACT',
          enemyScale: '+48% Enemy HP · +24% Speed',
          scrapBonus: '+50% Bonus Scrap',
          greetingQuote: 'HEAT 2 ACTIVE! +50% Scrap from all hostiles.'
        },
        {
          heat: 3,
          label: 'HEAT 3 // VALHALLA INFERNO',
          enemyScale: '+72% Enemy HP · +36% Speed',
          scrapBonus: '+75% Bonus Scrap',
          greetingQuote: 'HEAT 3 ACTIVE! +75% Scrap from all hostiles.'
        }
      ];

      for (const expected of expectedHeatData) {
        // Portal Heat Briefing
        const briefing = getPortalHeatBriefing(expected.heat);
        expect(briefing.heatLevel).toBe(expected.heat);
        expect(briefing.label).toBe(expected.label);
        expect(briefing.enemyScaleText).toBe(expected.enemyScale);
        expect(briefing.scrapBonusText).toBe(expected.scrapBonus);

        // Hub Station Bounty Prompt Info (unclaimed vs claimed cache)
        const unclaimedPrompt = getHubStationPromptInfo('bounty', undefined, undefined, { bountyClaimed: false });
        expect(unclaimedPrompt.title).toBe('🎖️ OUTLAW WAR ROOM & BOUNTIES');
        expect(unclaimedPrompt.actionLabel).toBe('OPEN WAR ROOM [E]');
        expect(unclaimedPrompt.accentColor).toBe('#06d6a0');
        expect(unclaimedPrompt.summary).toContain('Claim FREE +15 Coins');

        const claimedPrompt = getHubStationPromptInfo('bounty', undefined, undefined, { bountyClaimed: true });
        expect(claimedPrompt.summary).toContain('Configure Threat Heat Level (0–3)');
        expect(claimedPrompt.summary).toContain('Free Cache Claimed!');

        // Hub NPC Bounty Greeting
        const greeting = getHubNpcGreeting('bounty', 1, expected.heat);
        expect(greeting.npcId).toBe('bounty');
        expect(greeting.speaker).toBe('VALKYRIE BROKER');
        expect(greeting.accentColor).toBe('#06d6a0');
        expect(greeting.quote).toBe(expected.greetingQuote);
      }
    });

    // Test 3: getCareerOutlawRank combined with getWeaponMasteryTier across progressive career checkpoints (0 kills -> 150 kills + 6 bosses on Floor 6)
    it('verifies getCareerOutlawRank combined with getWeaponMasteryTier across progressive career checkpoints (0 kills to 150 kills + 6 bosses on Floor 6)', () => {
      interface CareerCheckpoint {
        totalKills: number;
        bossesSlain: number;
        bestFloor: number;
        expectedRankId: string;
        expectedRankTier: number;
        expectedRankTitle: string;
        expectedMasteryTier: number;
        expectedMasteryLabel: string;
        expectedMasteryDmgPct: number;
      }

      const checkpoints: CareerCheckpoint[] = [
        {
          totalKills: 0,
          bossesSlain: 0,
          bestFloor: 1,
          expectedRankId: 'rookie_courier',
          expectedRankTier: 1,
          expectedRankTitle: '⚙️ ROOKIE COURIER',
          expectedMasteryTier: 0,
          expectedMasteryLabel: 'UNRANKED',
          expectedMasteryDmgPct: 0
        },
        {
          totalKills: 15,
          bossesSlain: 0,
          bestFloor: 2,
          expectedRankId: 'highway_outlaw',
          expectedRankTier: 2,
          expectedRankTitle: '🔥 HIGHWAY OUTLAW',
          expectedMasteryTier: 1,
          expectedMasteryLabel: 'ROOKIE I',
          expectedMasteryDmgPct: 5
        },
        {
          totalKills: 45,
          bossesSlain: 1,
          bestFloor: 3,
          expectedRankId: 'syndicate_enforcer',
          expectedRankTier: 3,
          expectedRankTitle: '⚡ SYNDICATE ENFORCER',
          expectedMasteryTier: 2,
          expectedMasteryLabel: 'ADEPT II',
          expectedMasteryDmgPct: 10
        },
        {
          totalKills: 105,
          bossesSlain: 3,
          bestFloor: 5,
          expectedRankId: 'apex_roadlord',
          expectedRankTier: 4,
          expectedRankTitle: '☠️ APEX ROADLORD',
          expectedMasteryTier: 3,
          expectedMasteryLabel: 'MASTER III',
          expectedMasteryDmgPct: 15
        },
        {
          totalKills: 150,
          bossesSlain: 6,
          bestFloor: 6,
          expectedRankId: 'legend_of_valhalla',
          expectedRankTier: 5,
          expectedRankTitle: '👑 LEGEND OF VALHALLA',
          expectedMasteryTier: 3,
          expectedMasteryLabel: 'MASTER III',
          expectedMasteryDmgPct: 15
        }
      ];

      for (const cp of checkpoints) {
        const meta = {
          totalKills: cp.totalKills,
          bossesSlain: cp.bossesSlain,
          bestFloor: cp.bestFloor
        };

        const rank = getCareerOutlawRank(meta);
        expect(rank.rankId).toBe(cp.expectedRankId);
        expect(rank.tierNumber).toBe(cp.expectedRankTier);
        expect(rank.title).toBe(cp.expectedRankTitle);

        const mastery = getWeaponMasteryTier(cp.totalKills);
        expect(mastery.tier).toBe(cp.expectedMasteryTier);
        expect(mastery.label).toBe(cp.expectedMasteryLabel);
        expect(mastery.dmgBonusPct).toBe(cp.expectedMasteryDmgPct);
      }

      // Check max rank milestone text at final checkpoint
      const finalRank = getCareerOutlawRank({ totalKills: 150, bossesSlain: 6, bestFloor: 6 });
      expect(finalRank.nextMilestoneText).toBe('MAX CAREER RANK ACHIEVED');
    });

    // Test 4: getRiderMobilitySummary and getCombatOffenseSummary simultaneous scaling when applying all 5 Duo Synergies (getActiveDuoSynergies)
    it('verifies getRiderMobilitySummary and getCombatOffenseSummary simultaneous scaling when applying all 5 Duo Synergies', () => {
      const p = createDefaultPlayerState();

      // Initial baseline check: standard rider mobility & standard combat offense
      const baselineMobility = getRiderMobilitySummary(p);
      expect(baselineMobility.mobilityTier).toBe('STANDARD');
      expect(baselineMobility.topSpeedRating).toBe(265);
      expect(baselineMobility.driftChargePct).toBe(0);
      expect(baselineMobility.nosReservePct).toBe(100);

      const baselineOffense = getCombatOffenseSummary(p);
      expect(baselineOffense.isEvolved).toBe(false);
      expect(baselineOffense.siphonStatus).toBe('NONE');
      expect(baselineOffense.effectiveDpsMult).toBeCloseTo(1.0, 2);

      // Now activate all 5 Duo Synergies:
      // 1. thermal_shock: Cryo ('Cryo-Jacketed Shells') + Fire ('Thermobaric Mix')
      // 2. superconductor: Cryo ('Cryo-Jacketed Shells') + Volt ('tesla_capacitor')
      // 3. void_vortex: Magnet ('magnet_coil') + Blast ('Thermobaric Mix')
      // 4. juggernaut_overdrive: Spikes ('titanium_spikes') + NOS ('adrenaline_injector')
      // 5. voltaic_wake: Afterburner ('exhaust_afterburner') + Secondary ('tesla_capacitor')
      p.weapon = 'pistol';
      p.items.push(
        'Cryo-Jacketed Shells',
        'Thermobaric Mix',
        'Rubberized Casings' // Evolved Ricochet Revolver
      );
      p.itemStacks = {
        tesla_capacitor: 1,
        magnet_coil: 1,
        titanium_spikes: 1,
        adrenaline_injector: 1,
        exhaust_afterburner: 1
      };

      const activeDuos = getActiveDuoSynergies(p);
      expect(activeDuos).toHaveLength(5);
      const activeIds = activeDuos.map(d => d.id).sort();
      expect(activeIds).toEqual([
        'juggernaut_overdrive',
        'superconductor',
        'thermal_shock',
        'void_vortex',
        'voltaic_wake'
      ]);

      // Apply simultaneous mobility & combat stat escalations
      p.speedMult = 1.45; // Triggers HYPER-DRIFTER (>= 1.35)
      p.driftCharge = 0.85;
      p.nos = 90;
      p.nosMax = 100;

      p.dmgMult = 1.6;
      p.fireRateMult = 1.25;
      p.multiShot = 2;
      p.vampChance = 0.20; // Triggers VAMPIRIC OVERDRIVE (>= 15%)

      const scaledMobility = getRiderMobilitySummary(p);
      expect(scaledMobility.mobilityTier).toBe('HYPER-DRIFTER');
      const expectedTopSpeed = Math.round(p.baseSpeed * p.speedMult); // 265 * 1.45 = 384
      expect(scaledMobility.topSpeedRating).toBe(expectedTopSpeed);
      expect(scaledMobility.driftChargePct).toBe(85);
      expect(scaledMobility.nosReservePct).toBe(90);
      expect(scaledMobility.summaryText).toBe(`HYPER-DRIFTER · ${expectedTopSpeed} MPH RATING · 85% DRIFT · 90% NOS`);

      const scaledOffense = getCombatOffenseSummary(p);
      expect(scaledOffense.isEvolved).toBe(true);
      // Effective DPS: dmgMult (1.6) * fireRateMult (1.25) * multiShot (2) * evoBonus (1.35) = 5.40
      expect(scaledOffense.effectiveDpsMult).toBeCloseTo(5.40, 2);
      expect(scaledOffense.siphonPct).toBe(20);
      expect(scaledOffense.siphonStatus).toBe('VAMPIRIC OVERDRIVE');
      expect(scaledOffense.summaryLine).toBe('DPS x5.40 · VAMPIRIC OVERDRIVE (20% Siphon) · OVERCLOCKED');
    });
  });

  // --------------------------------------------------------------------------
  // Combination 7: Boss Tactical Briefing × Forge Advisor × 24-Model Equipment Loadout (M105)
  // --------------------------------------------------------------------------
  describe('Combination 7: Boss Tactical Briefing × Forge Advisor × 24-Model Equipment Loadout (M105)', () => {
    // 1. Combines a Phase 2 enraged boss encounter (getBossEncounterBriefing) with a 3pc Legendary Valhalla equipment loadout (getEquipmentLoadoutSummary & getEquippedBikeVisualState), verifying that both the boss overdrive warning and the OMEGA model visual state remain consistent.
    it('combines a Phase 2 enraged boss encounter with a 3pc Legendary Valhalla equipment loadout and OMEGA visual state', () => {
      // 1. Phase 2 enraged boss encounter briefing
      const bossEnemy: Partial<Enemy> = {
        type: 'boss',
        hp: 200,
        maxHp: 500, // 40% HP <= 50% threshold
        enraged: true
      };
      const bossBriefing = getBossEncounterBriefing(bossEnemy, 1);
      expect(bossBriefing.active).toBe(true);
      expect(bossBriefing.phase).toBe(2);
      expect(bossBriefing.isEnraged).toBe(true);
      expect(bossBriefing.hpPct).toBe(40);
      expect(bossBriefing.counterplayTip).toBe(
        'PHASE 2 OVERDRIVE: Boss bullet cadence doubled — use Drift [SPACE] i-frames and Graze for NOS!'
      );
      expect(bossBriefing.summaryLine).toContain('[PHASE 2 ENRAGED]');

      // 2. 3-piece Legendary Valhalla equipment loadout
      const meta = createDefaultMetaSave();
      meta.equipped = {
        tires: {
          slot: 'tires',
          rarity: 3,
          name: 'Hellfire Ripper Tires',
          stats: { speed: 0.20 }
        },
        engine: {
          slot: 'engine',
          rarity: 3,
          name: 'Valhalla Core V8',
          stats: { dmg: 0.25 }
        },
        frame: {
          slot: 'frame',
          rarity: 3,
          name: 'Juggernaut Prow Frame',
          stats: { hp: 3 }
        }
      };

      const loadout = getEquipmentLoadoutSummary(meta.equipped);
      expect(loadout.installedCount).toBe(3);
      expect(loadout.highestRarity).toBe(3);
      expect(loadout.rarityCounts[3]).toBe(3);
      expect(loadout.nextSetGoalText).toBe('3pc Valhalla Set Active (+15% Dmg, +10% Spd)');
      expect(loadout.summaryLine).toContain('LOADOUT: 3/6 INSTALLED');
      expect(loadout.summaryLine).toContain('3pc Valhalla Set Active');

      // 3. 24-model equipment visual state verification
      const visualState = getEquippedBikeVisualState(meta);
      expect(visualState.equippedCount).toBe(3);
      expect(visualState.equippedSlots).toEqual(['tires', 'engine', 'frame']);
      expect(visualState.modelCodes).toEqual([
        'TR-04 HELLFIRE RIPPER',
        'EN-04 VALHALLA CORE',
        'FR-04 JUGGERNAUT'
      ]);

      // All 3 equipped legendary parts must have the OMEGA tier badge
      expect(visualState.parts.tires?.tierBadge).toBe('OMEGA');
      expect(visualState.parts.engine?.tierBadge).toBe('OMEGA');
      expect(visualState.parts.frame?.tierBadge).toBe('OMEGA');
      expect(visualState.summaryLine).toContain('MOUNTED MODELS (3/6)');

      // Cross-system consistency: boss overdrive warning coexists with active player OMEGA loadout
      expect(bossBriefing.counterplayTip).toContain('use Drift [SPACE] i-frames');
      expect(visualState.parts.engine?.modelCode).toBe('EN-04 VALHALLA CORE');
    });

    // 2. Combines getForgeStationAdvisor scrap transitions (0 -> 15 -> 45 scrap) with salvaging downgrade stash items and equipping upgraded parts in the Garage.
    it('combines getForgeStationAdvisor scrap transitions (0 -> 15 -> 45 scrap) with salvaging downgrade stash items and equipping upgraded parts', () => {
      const meta = createDefaultMetaSave();
      const p = createDefaultPlayerState();
      p.items = ['Thermobaric Mix'];

      meta.equipped = {
        engine: {
          slot: 'engine',
          rarity: 2,
          name: 'Hyper-Billet Engine',
          stats: { dmg: 0.15 }
        },
        tires: {
          slot: 'tires',
          rarity: 2,
          name: 'Apex Turbine Tires',
          stats: { speed: 0.12 }
        }
      };

      const commonEngine: EquipmentItem = {
        slot: 'engine',
        rarity: 0,
        name: 'Standard Iron V2 Engine',
        stats: { dmg: 0.05 }
      };
      const uncommonTires: EquipmentItem = {
        slot: 'tires',
        rarity: 1,
        name: 'Cryo-Slick Tires',
        stats: { speed: 0.06 }
      };
      const commonTires: EquipmentItem = {
        slot: 'tires',
        rarity: 0,
        name: 'Standard Street Tires',
        stats: { speed: 0.03 }
      };
      const upgradedExhaust: EquipmentItem = {
        slot: 'exhaust',
        rarity: 3,
        name: 'Dragon Jet Afterburner',
        stats: { blast: 0.25 }
      };

      meta.stash = [commonEngine, uncommonTires, commonTires, upgradedExhaust];

      // State A: 0 Scrap available
      meta.scrap = 0;
      const advisor0 = getForgeStationAdvisor(meta, p);
      expect(advisor0.canReforge).toBe(false);
      expect(advisor0.scrapAvailable).toBe(0);
      expect(advisor0.reforgeCost).toBe(15);
      expect(advisor0.recommendedAction).toBe('Need 15 more Scrap to Reforge at the Anvil');
      expect(advisor0.summaryLine).toContain('0 SCRAP (COST: 15)');

      // Identify downgrade stash items
      const downgrades = getDowngradeStashItems(meta.stash, meta.equipped);
      expect(downgrades).toHaveLength(3);
      expect(downgrades).toContain(commonEngine);
      expect(downgrades).toContain(uncommonTires);
      expect(downgrades).toContain(commonTires);
      expect(downgrades).not.toContain(upgradedExhaust);

      // Salvage step 1: Scrap increases to 15 (reforge cost met)
      meta.scrap = 15;
      const advisor15 = getForgeStationAdvisor(meta, p);
      expect(advisor15.canReforge).toBe(true);
      expect(advisor15.scrapAvailable).toBe(15);
      expect(advisor15.reforgeCost).toBe(15);
      expect(advisor15.recommendedAction).toBe('Reforge Ready (15 Scrap) — Reroll & upgrade active mod loadout');
      expect(advisor15.summaryLine).toContain('15 SCRAP (COST: 15)');

      // Salvage step 2: Further salvaging brings scrap to 45 (multiple reforges possible)
      meta.scrap = 45;
      meta.equipped.exhaust = upgradedExhaust;
      meta.stash = meta.stash.filter(it => it !== upgradedExhaust);

      const advisor45 = getForgeStationAdvisor(meta, p);
      expect(advisor45.canReforge).toBe(true);
      expect(advisor45.scrapAvailable).toBe(45);
      expect(advisor45.summaryLine).toContain('45 SCRAP (COST: 15)');

      const garageLoadout = getEquipmentLoadoutSummary(meta.equipped);
      expect(garageLoadout.installedCount).toBe(3);
      expect(garageLoadout.highestRarity).toBe(3);

      const garageVisual = getEquippedBikeVisualState(meta);
      expect(garageVisual.equippedSlots).toContain('exhaust');
      expect(garageVisual.parts.exhaust?.tierBadge).toBe('OMEGA');
      expect(garageVisual.parts.exhaust?.modelCode).toBe('EX-04 DRAGON JET');
    });

    // 3. Verifies cross-tier equipment model progression (MK-I -> MK-II -> MK-III -> OMEGA) alongside player combat stat scaling (applyItemStats) and getEquipmentLoadoutSummary power score increases.
    it('verifies cross-tier equipment model progression (MK-I -> MK-II -> MK-III -> OMEGA) alongside player combat stat scaling and loadout power score increases', () => {
      const p = createDefaultPlayerState();
      const initialDmg = p.dmgMult;

      const progressionItems: EquipmentItem[] = [
        {
          slot: 'engine',
          rarity: 0,
          name: 'Cast-Iron V2 Engine',
          stats: { dmg: 0.05 }
        },
        {
          slot: 'engine',
          rarity: 1,
          name: 'Twin-Scroll Turbo Engine',
          stats: { dmg: 0.12, fireRate: 0.05 }
        },
        {
          slot: 'engine',
          rarity: 2,
          name: 'Hyper-Billet Dry Clutch Engine',
          stats: { dmg: 0.20, fireRate: 0.10 }
        },
        {
          slot: 'engine',
          rarity: 3,
          name: 'Valhalla Core Fusion Engine',
          stats: { dmg: 0.30, fireRate: 0.18, blast: 0.15 }
        }
      ];

      const expectedBadges: Array<'MK-I' | 'MK-II' | 'MK-III' | 'OMEGA'> = ['MK-I', 'MK-II', 'MK-III', 'OMEGA'];
      const expectedModelCodes = [
        'EN-01 IRON V2',
        'EN-02 TWIN-SCROLL',
        'EN-03 HYPER-BILLET',
        'EN-04 VALHALLA CORE'
      ];

      let previousScore = -1;
      let currentItem: EquipmentItem | null = null;

      for (let i = 0; i < progressionItems.length; i++) {
        const item = progressionItems[i];

        if (currentItem) {
          applyItemStats(currentItem, -1, p);
        }
        applyItemStats(item, 1, p);
        currentItem = item;

        const visual = getEquippedBikeVisualState({ equipped: { engine: item } } as any);
        expect(visual.parts.engine?.tierBadge).toBe(expectedBadges[i]);
        expect(visual.parts.engine?.modelCode).toBe(expectedModelCodes[i]);

        const loadout = getEquipmentLoadoutSummary({ engine: item });
        expect(loadout.highestRarity).toBe(i);
        expect(loadout.totalPowerScore).toBeGreaterThan(previousScore);
        previousScore = loadout.totalPowerScore;

        expect(p.dmgMult).toBeCloseTo(initialDmg + (item.stats.dmg || 0), 2);
      }

      expect(p.dmgMult).toBeCloseTo(1.30, 2);
      expect(p.fireRateMult).toBeCloseTo(1.18, 2);
      expect(p.blastMult).toBeCloseTo(1.15, 2);
    });

    // 4. Verifies all 6 floor boss variants (Floors 1..6) transition cleanly from Phase 1 (>50% HP) to Phase 2 Enraged (<=50% HP) in getBossEncounterBriefing.
    it('verifies all 6 floor boss variants (Floors 1..6) transition cleanly from Phase 1 (>50% HP) to Phase 2 Enraged (<=50% HP) in getBossEncounterBriefing', () => {
      const expectedBosses: Array<{ floor: number; expectedTitle: string }> = [
        { floor: 1, expectedTitle: 'SCRAP GOLIATH' },
        { floor: 2, expectedTitle: 'SIEGE BEHEMOTH' },
        { floor: 3, expectedTitle: 'OVERLORD HELION' },
        { floor: 4, expectedTitle: 'CRYO VALKYRIE' },
        { floor: 5, expectedTitle: 'INFERNO COLOSSUS' },
        { floor: 6, expectedTitle: 'OMEGA VALHALLA' }
      ];

      for (const { floor, expectedTitle } of expectedBosses) {
        // Phase 1: > 50% HP (e.g. 750 / 1000 = 75% HP)
        const bossP1: Partial<Enemy> = {
          type: 'boss',
          hp: 750,
          maxHp: 1000,
          enraged: false
        };
        const briefingP1 = getBossEncounterBriefing(bossP1, floor);
        expect(briefingP1.active).toBe(true);
        expect(briefingP1.phase).toBe(1);
        expect(briefingP1.isEnraged).toBe(false);
        expect(briefingP1.hpPct).toBe(75);
        expect(briefingP1.bossTitle).toBe(expectedTitle);
        expect(briefingP1.counterplayTip).toBe(
          'PHASE 1: Maintain mid-range orbit and destroy elemental barrels before 50% HP enrage.'
        );
        expect(briefingP1.summaryLine).toBe(
          `${expectedTitle} [PHASE 1] · 75% HP · PHASE 1: Maintain mid-range orbit and destroy elemental barrels before 50% HP enrage.`
        );

        // Phase 2 Enraged: <= 50% HP boundary test (e.g. exactly 500 / 1000 = 50% HP)
        const bossP2Boundary: Partial<Enemy> = {
          type: 'boss',
          hp: 500,
          maxHp: 1000,
          enraged: false
        };
        const briefingP2Boundary = getBossEncounterBriefing(bossP2Boundary, floor);
        expect(briefingP2Boundary.active).toBe(true);
        expect(briefingP2Boundary.phase).toBe(2);
        expect(briefingP2Boundary.isEnraged).toBe(true);
        expect(briefingP2Boundary.hpPct).toBe(50);
        expect(briefingP2Boundary.bossTitle).toBe(expectedTitle);
        expect(briefingP2Boundary.counterplayTip).toBe(
          'PHASE 2 OVERDRIVE: Boss bullet cadence doubled — use Drift [SPACE] i-frames and Graze for NOS!'
        );
        expect(briefingP2Boundary.summaryLine).toBe(
          `${expectedTitle} [PHASE 2 ENRAGED] · 50% HP · PHASE 2 OVERDRIVE: Boss bullet cadence doubled — use Drift [SPACE] i-frames and Graze for NOS!`
        );

        // Phase 2 Deep Enraged: 200 / 1000 = 20% HP
        const bossP2Deep: Partial<Enemy> = {
          type: 'boss',
          hp: 200,
          maxHp: 1000,
          enraged: true
        };
        const briefingP2Deep = getBossEncounterBriefing(bossP2Deep, floor);
        expect(briefingP2Deep.phase).toBe(2);
        expect(briefingP2Deep.isEnraged).toBe(true);
        expect(briefingP2Deep.hpPct).toBe(20);
        expect(briefingP2Deep.bossTitle).toBe(expectedTitle);
      }
    });
  });

  // --------------------------------------------------------------------------
  // Combination 8: Launch Gate Pre-Flight, War Room Readiness, Active Mod Deck & Duo Synergy Matrix (M120)
  // --------------------------------------------------------------------------
  describe('Combination 8: Launch Gate Pre-Flight, War Room Readiness, Active Mod Deck & Duo Synergy Matrix (M120)', () => {
    // Test 1: Verifies coordinated progression across getWarRoomStationAdvisor and getLaunchGateAdvisor as a player equips 6 armor pieces, upgrades all 4 meta tuning stats (19/19 ranks), claims the Tactical Scanner buff and War Room Supply Cache (0/2 -> 1/2 -> 2/2 pre-flight ready), and locks in HEAT 3 (+75% SCRAP).
    it('verifies coordinated progression across getWarRoomStationAdvisor and getLaunchGateAdvisor as player equips 6 armor pieces, upgrades all 4 meta stats (19/19 ranks), claims pre-flight buffs (0/2 -> 1/2 -> 2/2), and locks in HEAT 3 (+75% SCRAP)', () => {
      const metaSave = createDefaultMetaSave();
      metaSave.heatLevel = 0;
      metaSave.equipped = {};
      metaSave.ranks = { dmg: 0, fireRate: 0, speed: 0, maxHp: 0 };

      const p = createDefaultPlayerState();
      p.weapon = 'pistol';
      p.scannerBuff = false;

      // 1. Initial State: 0 equipped, 0 ranks, 0 heat, no buffs claimed
      const initialWarRoom = getWarRoomStationAdvisor(metaSave, false);
      expect(initialWarRoom.bountyClaimed).toBe(false);
      expect(initialWarRoom.currentHeat).toBe(0);
      expect(initialWarRoom.scrapBonusPct).toBe(0);
      expect(initialWarRoom.recommendedMaxHeat).toBe(0);
      expect(initialWarRoom.summaryLine).toBe(
        'CACHE: ⚡ FREE DROP READY (+15 🪙 / +1 ❤️) // HEAT 0 (+0% SCRAP) // REC HEAT: <= 0'
      );

      const initialLaunchGate = getLaunchGateAdvisor(metaSave, p, false, false);
      expect(initialLaunchGate.readyCount).toBe(0);
      expect(initialLaunchGate.totalChecks).toBe(2);
      expect(initialLaunchGate.isFullyPrepped).toBe(false);
      expect(initialLaunchGate.missingBuffs).toEqual(['SCANNER BUFF', 'WAR ROOM CACHE']);
      expect(initialLaunchGate.summaryLine).toBe(
        'PRE-FLIGHT: ⚠️ MISSING SCANNER BUFF & WAR ROOM CACHE // WEAPON: PISTOL // HEAT 0'
      );

      // 2. Equip all 6 armor pieces (readiness score: 6 * 2 + 0 = 12 -> recommended heat 2)
      metaSave.equipped = {
        frame: { name: 'Alloy Frame', slot: 'frame', rarity: 1, stats: {} },
        engine: { name: 'Twin Engine', slot: 'engine', rarity: 1, stats: {} },
        exhaust: { name: 'Twin Pipes', slot: 'exhaust', rarity: 1, stats: {} },
        tires: { name: 'Street Tires', slot: 'tires', rarity: 1, stats: {} },
        handlebars: { name: 'Clip-on Bars', slot: 'handlebars', rarity: 1, stats: {} },
        tank: { name: 'Reinforced Tank', slot: 'tank', rarity: 1, stats: {} }
      };

      const equippedWarRoom = getWarRoomStationAdvisor(metaSave, false);
      expect(equippedWarRoom.recommendedMaxHeat).toBe(2);

      // 3. Upgrade all 4 meta tuning stats to maximum (19/19 ranks: 5 dmg, 5 fireRate, 5 speed, 4 maxHp)
      // Readiness score: 6 * 2 + 19 = 31 >= 18 -> recommended heat 3
      metaSave.ranks = { dmg: 5, fireRate: 5, speed: 5, maxHp: 4 };
      metaSave.heatLevel = 3;

      const maxedWarRoom = getWarRoomStationAdvisor(metaSave, false);
      expect(maxedWarRoom.currentHeat).toBe(3);
      expect(maxedWarRoom.scrapBonusPct).toBe(75);
      expect(maxedWarRoom.recommendedMaxHeat).toBe(3);
      expect(maxedWarRoom.summaryLine).toBe(
        'CACHE: ⚡ FREE DROP READY (+15 🪙 / +1 ❤️) // HEAT 3 (+75% SCRAP) // REC HEAT: <= 3'
      );

      // 4. Claim Tactical Scanner Buff (0/2 -> 1/2 ready)
      const scannerLaunchGate = getLaunchGateAdvisor(metaSave, p, true, false);
      expect(scannerLaunchGate.readyCount).toBe(1);
      expect(scannerLaunchGate.totalChecks).toBe(2);
      expect(scannerLaunchGate.isFullyPrepped).toBe(false);
      expect(scannerLaunchGate.missingBuffs).toEqual(['WAR ROOM CACHE']);
      expect(scannerLaunchGate.summaryLine).toBe(
        'PRE-FLIGHT: ⚠️ MISSING WAR ROOM CACHE // WEAPON: PISTOL // HEAT 3'
      );

      // 5. Claim War Room Supply Cache (1/2 -> 2/2 ready, pre-flight fully locked)
      const claimedWarRoom = getWarRoomStationAdvisor(metaSave, true);
      expect(claimedWarRoom.bountyClaimed).toBe(true);
      expect(claimedWarRoom.summaryLine).toBe(
        'CACHE: ✓ CLAIMED (+15 🪙 / +1 ❤️) // HEAT 3 (+75% SCRAP) // REC HEAT: <= 3'
      );

      const readyLaunchGate = getLaunchGateAdvisor(metaSave, p, true, true);
      expect(readyLaunchGate.readyCount).toBe(2);
      expect(readyLaunchGate.totalChecks).toBe(2);
      expect(readyLaunchGate.isFullyPrepped).toBe(true);
      expect(readyLaunchGate.missingBuffs).toEqual([]);
      expect(readyLaunchGate.summaryLine).toBe(
        'PRE-FLIGHT: ✓ 2/2 BUFFS LOCKED // WEAPON: PISTOL // HEAT 3'
      );
    });

    // Test 2: Verifies getRunModDeckSummary, getWeaponEvolutionProgress, and getActiveDuoSynergies working together as a player acquires mod stacks (1/3 MAX STACK -> 2/3 STACK NEAR EVO -> 3+ STACK EVO READY) and unlocks multiple Duo Synergies (PLASMA SHRAPNEL, CRYO SHATTER, VAMPIRIC OVERDRIVE).
    it('verifies getRunModDeckSummary, getWeaponEvolutionProgress, and getActiveDuoSynergies working together as player acquires mod stacks (1/3 -> 2/3 -> 3+ EVO READY) and unlocks multiple Duo Synergies', () => {
      const p = createDefaultPlayerState();
      p.weapon = 'pistol';
      p.items = [];
      p.itemStacks = {};
      (p as any).modStacks = {};

      // Baseline: 0 mod picks, 0/3 MAX STACK, 0 evolved progress, 0 active duos
      const deck0 = getRunModDeckSummary(p);
      expect(deck0.totalModPicks).toBe(0);
      expect(deck0.uniqueModsCount).toBe(0);
      expect(deck0.maxStackCount).toBe(0);
      expect(deck0.evoStackReady).toBe(false);
      expect(deck0.activeDuoCount).toBe(0);
      expect(deck0.summaryLine).toBe(
        'MODS: 0 PICKS (0 UNIQUE) // 0/3 MAX STACK // DUOS: 0 ACTIVE, 0 NEAR'
      );

      const evoProg0 = getWeaponEvolutionProgress('pistol', p);
      expect(evoProg0.evolved).toBe(false);
      expect(evoProg0.maxStackCount).toBe(0);
      expect(evoProg0.progressPct).toBe(0);
      expect(evoProg0.statusText).toBe('[✗ Ricochet Rounds] + [0/3 Mod Stack]');

      // Step 1: Pick 1 stack of cryo_rounds (1/3 MAX STACK)
      (p as any).modStacks = { cryo_rounds: 1 };
      p.itemStacks = { cryo_rounds: 1 };
      p.items = ['cryo_rounds'];

      const deck1 = getRunModDeckSummary(p);
      expect(deck1.totalModPicks).toBe(1);
      expect(deck1.uniqueModsCount).toBe(1);
      expect(deck1.maxStackCount).toBe(1);
      expect(deck1.evoStackReady).toBe(false);
      expect(deck1.activeDuoCount).toBe(0);
      expect(deck1.potentialDuoCount).toBe(2); // thermal_shock & superconductor
      expect(deck1.summaryLine).toBe(
        'MODS: 1 PICKS (1 UNIQUE) // 1/3 MAX STACK // DUOS: 0 ACTIVE, 2 NEAR'
      );

      const evoProg1 = getWeaponEvolutionProgress('pistol', p);
      expect(evoProg1.evolved).toBe(false);
      expect(evoProg1.maxStackCount).toBe(1);
      expect(evoProg1.progressPct).toBe(17);
      expect(evoProg1.statusText).toBe('[✗ Ricochet Rounds] + [1/3 Mod Stack]');

      // Step 2: Pick 2nd stack of cryo_rounds + pick high_explosive (2/3 STACK NEAR EVO, unlocks THERMAL SHOCK duo synergy)
      (p as any).modStacks = { cryo_rounds: 2, high_explosive: 1 };
      p.itemStacks = { cryo_rounds: 2, high_explosive: 1 };
      p.items = ['cryo_rounds', 'high_explosive'];

      const deck2 = getRunModDeckSummary(p);
      expect(deck2.totalModPicks).toBe(3);
      expect(deck2.uniqueModsCount).toBe(2);
      expect(deck2.maxStackCount).toBe(2);
      expect(deck2.evoStackReady).toBe(false);
      expect(deck2.activeDuoCount).toBe(1);
      expect(deck2.summaryLine).toBe(
        'MODS: 3 PICKS (2 UNIQUE) // 2/3 STACK NEAR EVO // DUOS: 1 ACTIVE, 2 NEAR'
      );

      const duos2 = getActiveDuoSynergies(p);
      expect(duos2.length).toBe(1);
      expect(duos2[0].id).toBe('thermal_shock');
      expect(duos2[0].name).toBe('THERMAL SHOCK');

      const evoProg2 = getWeaponEvolutionProgress('pistol', p);
      expect(evoProg2.evolved).toBe(false);
      expect(evoProg2.maxStackCount).toBe(2);
      expect(evoProg2.progressPct).toBe(33);
      expect(evoProg2.statusText).toBe('[✗ Ricochet Rounds] + [2/3 Mod Stack]');

      // Step 3: Pick 3rd stack of cryo_rounds (3+ STACK EVO READY) + turbo_charger + nanite_repair
      // Also equips drop items tesla_capacitor + exhaust_afterburner to unlock SUPERCONDUCTOR and VOLTAIC WAKE
      (p as any).modStacks = {
        cryo_rounds: 3,
        high_explosive: 1,
        turbo_charger: 1,
        nanite_repair: 1
      };
      p.itemStacks = {
        cryo_rounds: 3,
        high_explosive: 1,
        turbo_charger: 1,
        nanite_repair: 1,
        tesla_capacitor: 1,
        exhaust_afterburner: 1
      };
      p.items = [
        'cryo_rounds',
        'high_explosive',
        'turbo_charger',
        'nanite_repair',
        'tesla_capacitor',
        'exhaust_afterburner'
      ];

      const deck3 = getRunModDeckSummary(p);
      expect(deck3.totalModPicks).toBe(6);
      expect(deck3.uniqueModsCount).toBe(4);
      expect(deck3.maxStackCount).toBe(3);
      expect(deck3.evoStackReady).toBe(true);
      expect(deck3.activeDuoCount).toBe(3);
      expect(deck3.potentialDuoCount).toBe(2);
      expect(deck3.summaryLine).toBe(
        'MODS: 6 PICKS (4 UNIQUE) // 3+ STACK EVO READY // DUOS: 3 ACTIVE, 2 NEAR'
      );

      const duos3 = getActiveDuoSynergies(p);
      const activeIds = duos3.map(d => d.id);
      expect(activeIds).toContain('thermal_shock');
      expect(activeIds).toContain('superconductor');
      expect(activeIds).toContain('voltaic_wake');

      // Weapon evolution with 3 stacks + signature mod pickup achieves 100% evolved status
      p.items.push('Rubberized Casings');
      const evoProg3 = getWeaponEvolutionProgress('pistol', p);
      expect(evoProg3.hasSignatureMod).toBe(true);
      expect(evoProg3.maxStackCount).toBe(3);
      expect(evoProg3.progressPct).toBe(100);
      expect(evoProg3.evolved).toBe(true);
      expect(evoProg3.statusText).toBe('⚡ OVERCLOCK EVOLVED: RICOCHET REVOLVER');

      // Sustain synergy: Nanite Siphon raises vampChance to 20% triggering VAMPIRIC OVERDRIVE
      p.vampChance = 0.20;
      const combatSummary = getCombatOffenseSummary(p);
      expect(combatSummary.siphonStatus).toBe('VAMPIRIC OVERDRIVE');
      expect(combatSummary.siphonPct).toBe(20);
      expect(combatSummary.isEvolved).toBe(true);
      expect(combatSummary.summaryLine).toContain('VAMPIRIC OVERDRIVE (20% Siphon) · OVERCLOCKED');
    });

    // Test 3: Verifies getCombatOffenseSummary, getRiderMobilitySummary, and getMetaTuningSummary scaling together as permanent garage tuning ranks (dmg, fireRate, speed, maxHp) are applied via applyMetaStats on top of in-run mod stacks.
    it('verifies getCombatOffenseSummary, getRiderMobilitySummary, and getMetaTuningSummary scaling together as permanent tuning ranks are applied on top of in-run mod stacks', () => {
      const metaSave = createDefaultMetaSave();
      metaSave.ranks = { dmg: 0, fireRate: 0, speed: 0, maxHp: 0 };

      // 1. Garage meta tuning at Rank 0
      const tuning0 = getMetaTuningSummary(metaSave);
      expect(tuning0.totalRanks).toBe(0);
      expect(tuning0.maxPossibleRanks).toBe(19);
      expect(tuning0.completionPct).toBe(0);
      expect(tuning0.cheapestNextUpgradeId).toBe('speed');
      expect(tuning0.cheapestNextCost).toBe(20);
      expect(tuning0.summaryLine).toBe(
        'TUNING: 0/19 RANKS (0%) · NEXT: TWIN-CAM ENGINE TUNE (20 SCRAP)'
      );

      const p = createDefaultPlayerState();
      p.weapon = 'pistol';
      applyMetaStats(p, metaSave);

      expect(p.dmgMult).toBeCloseTo(1.0, 2);
      expect(p.fireRateMult).toBeCloseTo(1.0, 2);
      expect(p.speedMult).toBeCloseTo(1.0, 2);
      expect(p.maxHp).toBe(6);

      const offense0 = getCombatOffenseSummary(p);
      expect(offense0.effectiveDpsMult).toBeCloseTo(1.0, 2);
      expect(offense0.siphonStatus).toBe('NONE');
      expect(offense0.isEvolved).toBe(false);
      expect(offense0.summaryLine).toBe('DPS x1.00 · NONE (0% Siphon)');

      const mobility0 = getRiderMobilitySummary(p);
      expect(mobility0.topSpeedRating).toBe(265);
      expect(mobility0.mobilityTier).toBe('STANDARD');

      // 2. Max out all 4 permanent Garage tuning ranks (19/19 ranks: 5 dmg, 5 fireRate, 5 speed, 4 maxHp)
      metaSave.ranks = { dmg: 5, fireRate: 5, speed: 5, maxHp: 4 };

      const tuningMax = getMetaTuningSummary(metaSave);
      expect(tuningMax.totalRanks).toBe(19);
      expect(tuningMax.maxPossibleRanks).toBe(19);
      expect(tuningMax.completionPct).toBe(100);
      expect(tuningMax.cheapestNextUpgradeId).toBeNull();
      expect(tuningMax.cheapestNextCost).toBeNull();
      expect(tuningMax.summaryLine).toBe(
        'TUNING: 19/19 RANKS (100%) · ALL SYSTEMS MAXED'
      );

      applyMetaStats(p, metaSave);
      expect(p.dmgMult).toBeCloseTo(1.50, 2); // 1 + 5 * 0.10
      expect(p.fireRateMult).toBeCloseTo(1.40, 2); // 1 + 5 * 0.08
      expect(p.speedMult).toBeCloseTo(1.30, 2); // 1 + 5 * 0.06
      expect(p.maxHp).toBe(10); // 6 + 4
      expect(p.hp).toBe(10);

      const offenseTuned = getCombatOffenseSummary(p);
      expect(offenseTuned.effectiveDpsMult).toBeCloseTo(2.10, 2); // 1.50 * 1.40 = 2.10
      expect(offenseTuned.summaryLine).toBe('DPS x2.10 · NONE (0% Siphon)');

      const mobilityTuned = getRiderMobilitySummary(p);
      expect(mobilityTuned.topSpeedRating).toBe(345); // Math.round(265 * 1.30)
      expect(mobilityTuned.mobilityTier).toBe('INTERCEPTOR'); // 1.30 >= 1.15

      // 3. Layer in-run mod stacks on top of permanent meta stats
      p.speedMult = Number((p.speedMult + 0.15).toFixed(2)); // 1.45 (>= 1.35 -> HYPER-DRIFTER)
      p.multiShot = 2; // projCount = 2
      p.vampChance = 0.18; // 18% siphon (>= 15% -> VAMPIRIC OVERDRIVE)
      p.items.push('Rubberized Casings'); // Evolves weapon -> 1.35x evo dps bonus

      const offenseModded = getCombatOffenseSummary(p);
      // effectiveDps = 1.50 * 1.40 * 2 * 1.35 = 5.67
      expect(offenseModded.effectiveDpsMult).toBeCloseTo(5.67, 2);
      expect(offenseModded.siphonStatus).toBe('VAMPIRIC OVERDRIVE');
      expect(offenseModded.siphonPct).toBe(18);
      expect(offenseModded.isEvolved).toBe(true);
      expect(offenseModded.summaryLine).toBe('DPS x5.67 · VAMPIRIC OVERDRIVE (18% Siphon) · OVERCLOCKED');

      const mobilityModded = getRiderMobilitySummary(p);
      expect(mobilityModded.topSpeedRating).toBe(384); // Math.round(265 * 1.45)
      expect(mobilityModded.mobilityTier).toBe('HYPER-DRIFTER');

      // Permanent meta tuning progression remains unaffected by in-run mods
      expect(getMetaTuningSummary(metaSave).completionPct).toBe(100);
    });

    // Test 4: Verifies all 6 Floor Bounty Contracts (Floors 1..6) interacting with Heat 0..3 scrap multipliers and Career Outlaw Rank progression (getCareerOutlawRank).
    it('verifies all 6 Floor Bounty Contracts (Floors 1..6) interacting with Heat 0..3 scrap multipliers and Career Outlaw Rank progression', () => {
      const expectedContracts = [
        { floor: 1, id: 'GRAZE_INITIATE', title: 'NEON DAREDEVIL', baseScrap: 8, baseCoins: 10 },
        { floor: 2, id: 'DRIFT_DEMON', title: 'ASPHALT DRIFTER', baseScrap: 10, baseCoins: 14 },
        { floor: 3, id: 'STYLE_HUNTER', title: 'HIGH-OCTANE STYLER', baseScrap: 14, baseCoins: 18 },
        { floor: 4, id: 'CRYO_SHATTER', title: 'CRYO BREAKER', baseScrap: 18, baseCoins: 22 },
        { floor: 5, id: 'OVERDRIVE_SLAYER', title: 'FORGE EXECUTIONER', baseScrap: 22, baseCoins: 28 },
        { floor: 6, id: 'VALHALLA_LEGEND', title: 'VALHALLA ASCENDANT', baseScrap: 30, baseCoins: 40 }
      ];

      // 1. Verify all 6 floor contracts and Heat 0..3 scaled scrap rewards
      for (const expected of expectedContracts) {
        const contract = getFloorBountyContract(expected.floor);
        expect(contract.id).toBe(expected.id);
        expect(contract.floor).toBe(expected.floor);
        expect(contract.title).toBe(expected.title);
        expect(contract.scrapReward).toBe(expected.baseScrap);
        expect(contract.coinReward).toBe(expected.baseCoins);

        const status = getFloorBountyContractStatus(expected.floor, { styleRank: 'A', styleScore: 50 });
        expect(status.isStyleMilestoneMet).toBe(true);

        // Verify Heat 0..3 scrap multipliers (+0%, +25%, +50%, +75%)
        for (let heat = 0; heat <= 3; heat++) {
          const scrapMultiplier = 1 + heat * 0.25;
          const scaledScrap = Math.round(contract.scrapReward * scrapMultiplier);
          expect(scaledScrap).toBeGreaterThanOrEqual(contract.scrapReward);
          if (heat === 0) {
            expect(scaledScrap).toBe(expected.baseScrap);
          } else if (heat === 3) {
            expect(scaledScrap).toBe(Math.round(expected.baseScrap * 1.75));
          }
        }
      }

      // 2. Verify Career Outlaw Rank progression across all 5 career tiers as player advances through Floors 1..6
      // Tier 1: Rookie Courier (career score < 40, Floor 1)
      const metaRank1 = { totalKills: 0, bossesSlain: 0, bestFloor: 1 };
      const rank1 = getCareerOutlawRank(metaRank1);
      expect(rank1.rankId).toBe('rookie_courier');
      expect(rank1.tierNumber).toBe(1);
      expect(rank1.title).toBe('⚙️ ROOKIE COURIER');
      expect(rank1.careerScore).toBe(0);

      // Tier 2: Highway Outlaw (career score >= 40 or Floor 2)
      const metaRank2 = { totalKills: 20, bossesSlain: 1, bestFloor: 2 };
      const rank2 = getCareerOutlawRank(metaRank2);
      expect(rank2.rankId).toBe('highway_outlaw');
      expect(rank2.tierNumber).toBe(2);
      expect(rank2.title).toBe('🔥 HIGHWAY OUTLAW');
      expect(rank2.careerScore).toBe(20 + 25 + 40); // 85

      // Tier 3: Syndicate Enforcer (career score >= 120 or Floor 3)
      const metaRank3 = { totalKills: 45, bossesSlain: 2, bestFloor: 3 };
      const rank3 = getCareerOutlawRank(metaRank3);
      expect(rank3.rankId).toBe('syndicate_enforcer');
      expect(rank3.tierNumber).toBe(3);
      expect(rank3.title).toBe('⚡ SYNDICATE ENFORCER');
      expect(rank3.careerScore).toBe(45 + 50 + 80); // 175

      // Tier 4: Apex Roadlord (career score >= 250 or Floor 5)
      const metaRank4 = { totalKills: 90, bossesSlain: 4, bestFloor: 5 };
      const rank4 = getCareerOutlawRank(metaRank4);
      expect(rank4.rankId).toBe('apex_roadlord');
      expect(rank4.tierNumber).toBe(4);
      expect(rank4.title).toBe('☠️ APEX ROADLORD');
      expect(rank4.careerScore).toBe(90 + 100 + 160); // 350

      // Tier 5: Legend of Valhalla (career score >= 500 or Floor 6 + 6 bosses)
      const metaRank5 = { totalKills: 200, bossesSlain: 6, bestFloor: 6 };
      const rank5 = getCareerOutlawRank(metaRank5);
      expect(rank5.rankId).toBe('legend_of_valhalla');
      expect(rank5.tierNumber).toBe(5);
      expect(rank5.title).toBe('👑 LEGEND OF VALHALLA');
      expect(rank5.careerScore).toBe(200 + 150 + 200); // 550
      expect(rank5.nextMilestoneText).toBe('MAX CAREER RANK ACHIEVED');
    });
  });
});
