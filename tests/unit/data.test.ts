/**
 * Automated Unit Test Suite for Milestone 1 Data Modules
 * Tests:
 * - src/data/weapons.ts
 * - src/data/upgrades.ts
 * - src/data/equipment.ts
 */

import { describe, it, expect } from 'vitest';
import { formatWeaponMasteryHint, formatHubNpcTooltip, HubNpcTooltipInfo, formatStyleRankTooltip, formatWeaponEvolutionTooltipHint } from '@/ui/tooltip';
import {
  WEAPONS,
  UNLOCKABLE_IDS,
  isWeaponId,
  getWeaponDef,
  WeaponId,
  WEAPON_EVOLUTIONS,
  isWeaponEvolved,
  getEvolutionsForMod,
  WEAPON_PROC_COEFFICIENTS,
  getWeaponEvolutionProgress,
  WeaponEvolutionProgress,
  WeaponTacticalProfile,
  getWeaponTacticalProfile
} from '@/data/weapons';
import {
  META_UPGRADES,
  RUN_MOD_POOL,
  KISS_CURSE_MOD_POOL,
  ALL_RUN_MOD_POOL,
  DUO_SYNERGIES,
  getActiveDuoSynergies,
  getPotentialDuoSynergiesForItem,
  DROP_ITEMS,
  DROP_ITEM_IDS,
  calcUpgradeCost,
  ModPlayerTarget
} from '@/data/upgrades';
import {
  EQUIP_SLOTS,
  RARITY,
  STAT_BASE,
  STAT_LABELS,
  LEGENDARY_SLOT_PASSIVES,
  getEquippedSetBonus,
  rollRarity,
  genLoot,
  itemScore,
  fmtStat,
  applyItemStats,
  EquipmentItem,
  EquipmentTargetPlayer,
  RarityTier
} from '@/data/equipment';

describe('Data Module: weapons.ts', () => {
  const weaponIds: WeaponId[] = [
    'pistol',
    'machine_gun',
    'flamethrower',
    'grenade_launcher',
    'shotgun',
    'railgun',
    'arc_coil'
  ];

  it('defines all 7 canonical weapons with exact IDs', () => {
    expect(Object.keys(WEAPONS).length).toBe(7);
    for (const id of weaponIds) {
      expect(WEAPONS[id]).toBeDefined();
      expect(WEAPONS[id].id).toBe(id);
      expect(isWeaponId(id)).toBe(true);
    }
  });

  it('has UNLOCKABLE_IDS containing exactly 6 non-pistol weapons', () => {
    expect(UNLOCKABLE_IDS.length).toBe(6);
    expect(UNLOCKABLE_IDS).not.toContain('pistol');
    for (const id of UNLOCKABLE_IDS) {
      expect(WEAPONS[id].cost).toBeGreaterThan(0);
    }
    expect(WEAPONS.pistol.cost).toBe(0);
  });

  it('verifies exact numerical stats and aliases for each weapon', () => {
    // Pistol
    expect(WEAPONS.pistol.damage).toBe(13);
    expect(WEAPONS.pistol.baseDmg).toBe(13);
    expect(WEAPONS.pistol.cooldown).toBe(0.27);
    expect(WEAPONS.pistol.speed).toBe(540);
    expect(WEAPONS.pistol.radius).toBe(5);
    expect(WEAPONS.pistol.life).toBe(1.15);
    expect(WEAPONS.pistol.color).toBe('#ffd166');

    // Machine Gun
    expect(WEAPONS.machine_gun.damage).toBe(5.5);
    expect(WEAPONS.machine_gun.cooldown).toBe(0.095);
    expect(WEAPONS.machine_gun.speed).toBe(620);
    expect(WEAPONS.machine_gun.radius).toBe(4);
    expect(WEAPONS.machine_gun.life).toBe(0.95);
    expect(WEAPONS.machine_gun.cost).toBe(55);

    // Flamethrower
    expect(WEAPONS.flamethrower.damage).toBe(3.2);
    expect(WEAPONS.flamethrower.cooldown).toBe(0.09);
    expect(WEAPONS.flamethrower.speed).toBe(290);
    expect(WEAPONS.flamethrower.radius).toBe(6);
    expect(WEAPONS.flamethrower.life).toBe(0.36);
    expect(WEAPONS.flamethrower.cost).toBe(95);

    // Grenade Launcher
    expect(WEAPONS.grenade_launcher.damage).toBe(18);
    expect(WEAPONS.grenade_launcher.cooldown).toBe(1.17);
    expect(WEAPONS.grenade_launcher.speed).toBe(410);
    expect(WEAPONS.grenade_launcher.radius).toBe(8);
    expect(WEAPONS.grenade_launcher.life).toBe(0.95);
    expect(WEAPONS.grenade_launcher.cost).toBe(140);

    // Shotgun
    expect(WEAPONS.shotgun.damage).toBe(5.2);
    expect(WEAPONS.shotgun.cooldown).toBe(0.56);
    expect(WEAPONS.shotgun.speed).toBe(560);
    expect(WEAPONS.shotgun.radius).toBe(4.5);
    expect(WEAPONS.shotgun.life).toBe(0.46);
    expect(WEAPONS.shotgun.cost).toBe(70);

    // Railgun
    expect(WEAPONS.railgun.damage).toBe(35);
    expect(WEAPONS.railgun.cooldown).toBe(0.80);
    expect(WEAPONS.railgun.speed).toBe(980);
    expect(WEAPONS.railgun.radius).toBe(6.5);
    expect(WEAPONS.railgun.life).toBe(0.85);
    expect(WEAPONS.railgun.cost).toBe(120);

    // Arc Coil
    expect(WEAPONS.arc_coil.damage).toBe(15);
    expect(WEAPONS.arc_coil.cooldown).toBe(0.40);
    expect(WEAPONS.arc_coil.speed).toBe(520);
    expect(WEAPONS.arc_coil.radius).toBe(6);
    expect(WEAPONS.arc_coil.life).toBe(1.0);
    expect(WEAPONS.arc_coil.cost).toBe(165);
  });

  it('getWeaponDef safely falls back to pistol on unknown weapon IDs', () => {
    expect(getWeaponDef('railgun').name).toBe('Plasma Railgun');
    expect(getWeaponDef('unknown_laser').name).toBe('Pistol');
  });

  it('BUG-01: isWeaponEvolved matches signatureModDisplayName, signatureModId, signatureModName, and >=3 itemStacks', () => {
    expect(WEAPON_EVOLUTIONS.pistol.signatureModId).toBe('ricochet_mod');
    expect(WEAPON_EVOLUTIONS.pistol.signatureModDisplayName).toBe('Rubberized Casings');
    expect(WEAPON_EVOLUTIONS.pistol.signatureModName).toBe('Ricochet Rounds');

    expect(isWeaponEvolved('pistol', { items: ['Rubberized Casings'] })).toBe(true);
    expect(isWeaponEvolved('pistol', { items: ['ricochet_mod'] })).toBe(true);
    expect(isWeaponEvolved('pistol', { items: ['Ricochet Rounds'] })).toBe(true);
    expect(isWeaponEvolved('pistol', { items: ['Hollow-Point Rounds'] })).toBe(false);

    expect(isWeaponEvolved('machine_gun', { items: ['Hair-Trigger Servo'] })).toBe(true);
    expect(isWeaponEvolved('flamethrower', { items: ['Thermobaric Mix'] })).toBe(true);
    expect(isWeaponEvolved('grenade_launcher', { items: ['Thermobaric Mix'] })).toBe(true);
    expect(isWeaponEvolved('shotgun', { items: ['Twin Barrel Adapter'] })).toBe(true);
    expect(isWeaponEvolved('railgun', { items: ['Tungsten Sabot'] })).toBe(true);
    expect(isWeaponEvolved('arc_coil', { items: ['Scrap Siphon'] })).toBe(true);

    expect(isWeaponEvolved('pistol', { itemStacks: { nitro_syringe: 2, gasoline: 1 } })).toBe(true);
    expect(isWeaponEvolved('pistol', { itemStacks: { nitro_syringe: 2 } })).toBe(false);
  });

  it('getEvolutionsForMod returns matching weapon evolutions and WEAPON_PROC_COEFFICIENTS covers all weapons', () => {
    const thermoEvos = getEvolutionsForMod('Thermobaric Mix');
    expect(thermoEvos.map(e => e.weaponId)).toEqual(['flamethrower', 'grenade_launcher']);
    expect(getEvolutionsForMod('high_explosive').length).toBe(2);
    expect(getEvolutionsForMod('ricochet_mod')[0].weaponId).toBe('pistol');

    expect(WEAPON_PROC_COEFFICIENTS.pistol).toBe(1.0);
    expect(WEAPON_PROC_COEFFICIENTS.machine_gun).toBe(0.45);
    expect(WEAPON_PROC_COEFFICIENTS.flamethrower).toBe(0.35);
    expect(WEAPON_PROC_COEFFICIENTS.shotgun).toBe(0.35);
    expect(WEAPON_PROC_COEFFICIENTS.grenade_launcher).toBe(1.0);
    expect(WEAPON_PROC_COEFFICIENTS.railgun).toBe(1.0);
    expect(WEAPON_PROC_COEFFICIENTS.arc_coil).toBe(0.75);
  });
});

describe('Data Module: upgrades.ts', () => {
  it('defines 4 permanent garage meta upgrades with exact progression math', () => {
    expect(Object.keys(META_UPGRADES).length).toBe(4);

    // dmg
    expect(META_UPGRADES.dmg.baseCost).toBe(25);
    expect(META_UPGRADES.dmg.costScale).toBe(1.6);
    expect(META_UPGRADES.dmg.maxRank).toBe(5);
    expect(calcUpgradeCost('dmg', 0)).toBe(25);
    expect(calcUpgradeCost('dmg', 1)).toBe(40); // 25 * 1.6 = 40
    expect(calcUpgradeCost('dmg', 2)).toBe(64); // 25 * 1.6^2 = 64
    expect(calcUpgradeCost('dmg', 5)).toBe(Infinity); // Capped at maxRank 5

    // fireRate
    expect(META_UPGRADES.fireRate.baseCost).toBe(25);
    expect(calcUpgradeCost('fireRate', 0)).toBe(25);
    expect(calcUpgradeCost('fireRate', 1)).toBe(40);

    // speed
    expect(META_UPGRADES.speed.baseCost).toBe(20);
    expect(META_UPGRADES.speed.costScale).toBe(1.55);
    expect(calcUpgradeCost('speed', 0)).toBe(20);
    expect(calcUpgradeCost('speed', 1)).toBe(31); // 20 * 1.55 = 31

    // maxHp
    expect(META_UPGRADES.maxHp.baseCost).toBe(35);
    expect(META_UPGRADES.maxHp.costScale).toBe(1.75);
    expect(calcUpgradeCost('maxHp', 0)).toBe(35);
    expect(calcUpgradeCost('maxHp', 1)).toBe(61); // 35 * 1.75 = 61.25 -> 61
  });

  it('defines all 15 in-run pedestal mods with costs and valid apply functions', () => {
    expect(RUN_MOD_POOL.length).toBe(15);

    const initialPlayer: ModPlayerTarget = {
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
    };

    // Test each mod application
    for (const mod of RUN_MOD_POOL) {
      expect(mod.cost).toBeGreaterThan(0);
      expect(mod.name.length).toBeGreaterThan(0);
      expect(mod.desc.length).toBeGreaterThan(0);

      const p: ModPlayerTarget = { ...initialPlayer };
      mod.apply(p);

      // Verify at least one stat changed as described in statDeltas
      let changed = false;
      for (const [key] of Object.entries(mod.statDeltas)) {
        if (key === 'healHp') continue;
        const statKey = key as keyof ModPlayerTarget;
        if (p[statKey] !== initialPlayer[statKey]) {
          changed = true;
          break;
        }
      }
      expect(changed).toBe(true);
    }
  });

  it('verifies boundary clamping on split_chamber and vamp_siphon', () => {
    const p: ModPlayerTarget = {
      hp: 1,
      maxHp: 6,
      dmgMult: 0.65,
      fireRateMult: 1,
      speedMult: 1,
      projSpeedMult: 1,
      blastMult: 1,
      pierce: 0,
      bounce: 0,
      multiShot: 1,
      vampChance: 0.55
    };

    const splitChamber = RUN_MOD_POOL.find(m => m.id === 'split_chamber')!;
    splitChamber.apply(p);
    // 0.65 - 0.15 = 0.50, but clamped to Math.max(0.6, ...)
    expect(p.dmgMult).toBe(0.6);
    expect(p.multiShot).toBe(2);

    const vampSiphon = RUN_MOD_POOL.find(m => m.id === 'vamp_siphon')!;
    vampSiphon.apply(p);
    // 0.55 + 0.20 = 0.75, but clamped to Math.min(0.6, ...)
    expect(p.vampChance).toBe(0.6);
  });

  it('defines 12 RoR2 stacking drop items with badges and icons', () => {
    expect(DROP_ITEM_IDS.length).toBe(12);
    for (const id of DROP_ITEM_IDS) {
      const it = DROP_ITEMS[id];
      expect(it).toBeDefined();
      expect(it.id).toBe(id);
      expect(it.color).toMatch(/^#[0-9a-f]{6}$/i);
      expect(it.icon.length).toBe(1);
      expect(it.desc.length).toBeGreaterThan(0);
      expect(it.ror2Inspiration.length).toBeGreaterThan(0);
    }
  });

  it('defines KISS_CURSE_MOD_POOL (4 mods) and ALL_RUN_MOD_POOL (19 mods) with proper clamping', () => {
    expect(KISS_CURSE_MOD_POOL.length).toBe(4);
    expect(ALL_RUN_MOD_POOL.length).toBe(19);

    const p: ModPlayerTarget = {
      hp: 3,
      maxHp: 3,
      dmgMult: 1.0,
      fireRateMult: 0.6,
      speedMult: 1.0,
      projSpeedMult: 0.65,
      blastMult: 1.0,
      pierce: 0,
      bounce: 0,
      multiShot: 1,
      vampChance: 0.0
    };

    const gc = KISS_CURSE_MOD_POOL.find(m => m.id === 'glass_cannon')!;
    gc.apply(p);
    expect(p.dmgMult).toBeCloseTo(1.65);
    expect(p.maxHp).toBe(2); // clamped at 2
    expect(p.hp).toBe(2);

    const ho = KISS_CURSE_MOD_POOL.find(m => m.id === 'heavy_ordnance')!;
    ho.apply(p);
    expect(p.dmgMult).toBeCloseTo(2.50);
    expect(p.blastMult).toBeCloseTo(1.40);
    expect(p.fireRateMult).toBe(0.5); // clamped at 0.5

    const pb = KISS_CURSE_MOD_POOL.find(m => m.id === 'point_blank')!;
    pb.apply(p);
    expect(p.multiShot).toBe(2);
    expect(p.projSpeedMult).toBe(0.55); // clamped at 0.55

    const oc = KISS_CURSE_MOD_POOL.find(m => m.id === 'overclock_core')!;
    oc.apply(p);
    expect(p.pierce).toBe(1);
  });

  it('evaluates DUO_SYNERGIES, getActiveDuoSynergies, and getPotentialDuoSynergiesForItem accurately', () => {
    expect(DUO_SYNERGIES.length).toBe(5);

    const active1 = getActiveDuoSynergies({
      weapon: 'flamethrower',
      items: ['Cryo-Jacketed Shells']
    });
    expect(active1.map(s => s.id)).toContain('thermal_shock');

    const active2 = getActiveDuoSynergies({
      weapon: 'arc_coil',
      items: ['cryo_rounds']
    });
    expect(active2.map(s => s.id)).toContain('superconductor');

    const active3 = getActiveDuoSynergies({
      weapon: 'pistol',
      items: ['Thermobaric Mix'],
      itemStacks: { magnet_coil: 1 }
    });
    expect(active3.map(s => s.id)).toContain('void_vortex');

    const active4 = getActiveDuoSynergies({
      items: ['Nitrous Injector'],
      itemStacks: { titanium_spikes: 1 }
    });
    expect(active4.map(s => s.id)).toContain('juggernaut_overdrive');

    const active5 = getActiveDuoSynergies({
      itemStacks: { exhaust_afterburner: 1, tesla_capacitor: 1 }
    });
    expect(active5.map(s => s.id)).toContain('voltaic_wake');

    const potential = getPotentialDuoSynergiesForItem('gasoline', {
      items: ['Cryo-Jacketed Shells'],
      itemStacks: {}
    });
    expect(potential.map(s => s.id)).toContain('thermal_shock');
  });
});

describe('Data Module: equipment.ts', () => {
  it('defines 6 equipment slots with valid primary stats', () => {
    expect(EQUIP_SLOTS.length).toBe(6);
    const expectedSlots = ['tires', 'engine', 'handlebars', 'exhaust', 'frame', 'tank'];
    expect(EQUIP_SLOTS.map(s => s.id)).toEqual(expectedSlots);
    for (const slot of EQUIP_SLOTS) {
      expect(STAT_BASE[slot.stat]).toBeDefined();
      expect(STAT_LABELS[slot.stat]).toBeDefined();
    }
  });

  it('defines 4 rarity tiers with strictly ascending multipliers and scrap sell values', () => {
    expect(RARITY.length).toBe(4);
    for (let i = 1; i < RARITY.length; i++) {
      expect(RARITY[i].mult).toBeGreaterThan(RARITY[i - 1].mult);
      expect(RARITY[i].sell).toBeGreaterThan(RARITY[i - 1].sell);
    }
  });

  it('rollRarity produces valid rarity tiers [0..3] deterministically', () => {
    // Inject deterministic min/max RNG
    expect(rollRarity(1, () => 0.0)).toBe(0); // Common
    expect(rollRarity(1, () => 0.999999)).toBe(3); // Legendary
  });

  it('genLoot generates well-formed equipment items with correct primary and secondary stats', () => {
    const rarityTiers: readonly RarityTier[] = [0, 1, 2, 3];
    for (const rarityTier of rarityTiers) {
      const item = genLoot(1, rarityTier, () => 0.4);
      expect(item.rarity).toBe(rarityTier);
      expect(item.name).toBeTruthy();
      expect(Object.keys(item.stats).length).toBeGreaterThanOrEqual(1);

      // Verify score is positive
      expect(itemScore(item)).toBeGreaterThan(0);
    }
  });

  it('itemScore strictly rewards higher rarity on identical slot rolls', () => {
    const commonItem = genLoot(1, 0, () => 0.1);
    const legendItem = genLoot(1, 3, () => 0.1);

    // Legendary item must have higher score than common
    expect(itemScore(legendItem)).toBeGreaterThan(itemScore(commonItem));
  });

  it('fmtStat correctly formats HP and percentage stats', () => {
    expect(fmtStat('hp', 2)).toBe('+2 Max Fuel');
    expect(fmtStat('dmg', 0.15)).toBe('+15% Damage');
    expect(fmtStat('speed', 0.08)).toBe('+8% Speed');
  });

  it('applyItemStats correctly equips (+1) and unequips (-1) stats with round-trip fidelity', () => {
    const player: EquipmentTargetPlayer = {
      dmgMult: 1.0,
      fireRateMult: 1.0,
      speedMult: 1.0,
      blastMult: 1.0,
      vampChance: 0.0,
      maxHp: 6,
      hp: 6
    };

    const item: EquipmentItem = {
      slot: 'engine',
      rarity: 2,
      name: 'Racing Engine',
      stats: {
        dmg: 0.168,
        hp: 1,
        speed: 0.084
      }
    };

    // Equip
    applyItemStats(item, 1, player);
    expect(player.dmgMult).toBeCloseTo(1.168);
    expect(player.speedMult).toBeCloseTo(1.084);
    expect(player.maxHp).toBe(7);
    expect(player.hp).toBe(7);

    // Unequip
    applyItemStats(item, -1, player);
    expect(player.dmgMult).toBeCloseTo(1.0);
    expect(player.speedMult).toBeCloseTo(1.0);
    expect(player.maxHp).toBe(6);
    expect(player.hp).toBe(6);
  });

  it('defines LEGENDARY_SLOT_PASSIVES for all 6 slots and calculates getEquippedSetBonus', () => {
    expect(LEGENDARY_SLOT_PASSIVES.tires.title).toBe('APEX DRIFT TURBO');
    expect(LEGENDARY_SLOT_PASSIVES.engine.title).toBe('TWIN-CAM OVERCLOCK');
    expect(LEGENDARY_SLOT_PASSIVES.handlebars.title).toBe('GYRO STABILIZER');
    expect(LEGENDARY_SLOT_PASSIVES.exhaust.title).toBe('PLASMA AFTERBURNER');
    expect(LEGENDARY_SLOT_PASSIVES.frame.title).toBe('REACTIVE AEGIS');
    expect(LEGENDARY_SLOT_PASSIVES.tank.title).toBe('OVERHEAL CONVERTER');

    const emptyBonus = getEquippedSetBonus({});
    expect(emptyBonus.rareCount).toBe(0);
    expect(emptyBonus.legendaryCount).toBe(0);
    expect(emptyBonus.dmgBonus).toBe(0);

    const legendarySet = getEquippedSetBonus({
      tires: { slot: 'tires', rarity: 3, name: 'Valhalla Tires', stats: { speed: 0.2 } },
      engine: { slot: 'engine', rarity: 3, name: 'Valhalla Engine', stats: { dmg: 0.2 } },
      frame: { slot: 'frame', rarity: 3, name: 'Valhalla Frame', stats: { hp: 2 } },
      tank: { slot: 'tank', rarity: 2, name: 'Racing Tank', stats: { siphon: 0.1 } }
    });
    expect(legendarySet.legendaryCount).toBe(3);
    expect(legendarySet.rareCount).toBe(4);
    expect(legendarySet.dmgBonus).toBeGreaterThan(0);
    expect(legendarySet.speedBonus).toBeGreaterThan(0);
    expect(legendarySet.label.length).toBeGreaterThan(0);
  });
});

describe('Tooltip: formatWeaponMasteryHint', () => {
  it('formats unranked tier correctly for 0 and 9 kills', () => {
    expect(formatWeaponMasteryHint(0)).toBe('Mastery: ☆☆☆ UNRANKED (0/10 kills to ★☆☆ ROOKIE I +5% DMG)');
    expect(formatWeaponMasteryHint(9)).toBe('Mastery: ☆☆☆ UNRANKED (9/10 kills to ★☆☆ ROOKIE I +5% DMG)');
  });

  it('formats rookie tier I correctly for 10 and 39 kills', () => {
    expect(formatWeaponMasteryHint(10)).toBe('Mastery: ★☆☆ ROOKIE I (+5% DMG · 10/40 kills to ★★☆ ADEPT II)');
    expect(formatWeaponMasteryHint(39)).toBe('Mastery: ★☆☆ ROOKIE I (+5% DMG · 39/40 kills to ★★☆ ADEPT II)');
  });

  it('formats adept tier II correctly for 40 and 99 kills', () => {
    expect(formatWeaponMasteryHint(40)).toBe('Mastery: ★★☆ ADEPT II (+10% DMG · 40/100 kills to ★★★ MASTER III)');
    expect(formatWeaponMasteryHint(99)).toBe('Mastery: ★★☆ ADEPT II (+10% DMG · 99/100 kills to ★★★ MASTER III)');
  });

  it('formats master tier III correctly for 100 and 250 kills', () => {
    expect(formatWeaponMasteryHint(100)).toBe('Mastery: ★★★ MASTER III (+15% DMG · MAX RANK! · 100 kills)');
    expect(formatWeaponMasteryHint(250)).toBe('Mastery: ★★★ MASTER III (+15% DMG · MAX RANK! · 250 kills)');
  });

  it('handles negative numbers and NaN gracefully by falling back to 0', () => {
    expect(formatWeaponMasteryHint(-1)).toBe('Mastery: ☆☆☆ UNRANKED (0/10 kills to ★☆☆ ROOKIE I +5% DMG)');
    expect(formatWeaponMasteryHint(-100)).toBe('Mastery: ☆☆☆ UNRANKED (0/10 kills to ★☆☆ ROOKIE I +5% DMG)');
    expect(formatWeaponMasteryHint(NaN)).toBe('Mastery: ☆☆☆ UNRANKED (0/10 kills to ★☆☆ ROOKIE I +5% DMG)');
  });
});

describe('Tooltip: formatHubNpcTooltip', () => {
  it('formats garage tooltip for default floor/heat and sector >= 4 progress', () => {
    const tipDefault: HubNpcTooltipInfo = formatHubNpcTooltip('garage');
    expect(tipDefault).toEqual({
      title: 'CHIEF MECHANIC VEX',
      subtitle: 'SANCTUARY STATION // GARAGE',
      quote: '"Tune your V8 and equip high-grade salvage before hitting the highway."',
      accentColor: '#ffd60a'
    });

    const tipSector5: HubNpcTooltipInfo = formatHubNpcTooltip('garage', 5);
    expect(tipSector5.quote).toBe('"Chassis survived Sector 5! Bolt on your finest parts, Rider."');
    expect(tipSector5.title).toBe('CHIEF MECHANIC VEX');
    expect(tipSector5.subtitle).toBe('SANCTUARY STATION // GARAGE');
    expect(tipSector5.accentColor).toBe('#ffd60a');
  });

  it('formats blacksmith forge station tooltip', () => {
    const tip: HubNpcTooltipInfo = formatHubNpcTooltip('blacksmith');
    expect(tip).toEqual({
      title: 'IRONSMITH KORR',
      subtitle: 'SANCTUARY STATION // BLACKSMITH',
      quote: '"12 Scrap for a fresh black-market part! Step onto the forge."',
      accentColor: '#2ee6ff'
    });
  });

  it('formats bounty broker tooltip for default heat and heatLevel: 2', () => {
    const tipDefault: HubNpcTooltipInfo = formatHubNpcTooltip('bounty');
    expect(tipDefault).toEqual({
      title: 'VALKYRIE BROKER',
      subtitle: 'SANCTUARY STATION // BOUNTY',
      quote: '"Raise the Bounty Heat for massive Scrap payouts, outlaw!"',
      accentColor: '#06d6a0'
    });

    const tipHeat2: HubNpcTooltipInfo = formatHubNpcTooltip('bounty', 1, 2);
    expect(tipHeat2).toEqual({
      title: 'VALKYRIE BROKER',
      subtitle: 'SANCTUARY STATION // BOUNTY',
      quote: '"HEAT 2 ACTIVE! +50% Scrap from all hostiles."',
      accentColor: '#06d6a0'
    });
  });

  it('formats codex station tooltip', () => {
    const tip: HubNpcTooltipInfo = formatHubNpcTooltip('codex');
    expect(tip).toEqual({
      title: 'DOC CULLEN',
      subtitle: 'SANCTUARY STATION // CODEX',
      quote: '"Tactical Scanner calibrated: +8% DMG & +15% Bullet Speed locked in."',
      accentColor: '#9d4edd'
    });
  });

  it('formats launch pad dispatch tooltip', () => {
    const tip: HubNpcTooltipInfo = formatHubNpcTooltip('launch');
    expect(tip).toEqual({
      title: 'HIGHWAY DISPATCH',
      subtitle: 'SANCTUARY STATION // LAUNCH',
      quote: '"Blast doors unlocked. Hit the throttle when ready!"',
      accentColor: '#e5203a'
    });
  });

  it('handles unknown station fallback cleanly', () => {
    const tipUnknown: HubNpcTooltipInfo = formatHubNpcTooltip('cantina');
    expect(tipUnknown).toEqual({
      title: 'OUTLAW DRIFTER',
      subtitle: 'SANCTUARY STATION // CANTINA',
      quote: '"Keep your NOS cool and your barrels hot."',
      accentColor: '#ffd166'
    });

    const tipEmpty: HubNpcTooltipInfo = formatHubNpcTooltip('');
    expect(tipEmpty).toEqual({
      title: 'OUTLAW DRIFTER',
      subtitle: 'SANCTUARY STATION // UNKNOWN',
      quote: '"Keep your NOS cool and your barrels hot."',
      accentColor: '#ffd166'
    });
  });

  it('computes getWeaponEvolutionProgress across 0%, partial, 50%, and 100% evolved states', () => {
    const p0: WeaponEvolutionProgress = getWeaponEvolutionProgress('pistol', { items: [], itemStacks: {} });
    expect(p0.evolved).toBe(false);
    expect(p0.progressPct).toBe(0);
    expect(p0.hasSignatureMod).toBe(false);
    expect(p0.maxStackCount).toBe(0);

    const pSig = getWeaponEvolutionProgress('pistol', { items: ['Ricochet Rounds'], itemStacks: {} });
    expect(pSig.hasSignatureMod).toBe(true);
    expect(pSig.progressPct).toBe(50);

    const pFull = getWeaponEvolutionProgress('pistol', { items: ['Ricochet Rounds'], itemStacks: { lens: 3 } });
    expect(pFull.evolved).toBe(true);
    expect(pFull.progressPct).toBe(100);
    expect(pFull.statusText).toContain('OVERCLOCK EVOLVED');
  });

  describe('Style Rank Tooltip Formatter (formatStyleRankTooltip - M62)', () => {
    const rankTiers: Array<{ grade: string; score: number; driftPct: number }> = [
      { grade: 'D', score: 12, driftPct: 0 },
      { grade: 'C', score: 28, driftPct: 20 },
      { grade: 'B', score: 45, driftPct: 40 },
      { grade: 'A', score: 58, driftPct: 60 },
      { grade: 'S', score: 72, driftPct: 80 },
      { grade: 'SS', score: 85, driftPct: 90 },
      { grade: 'SSS', score: 96, driftPct: 100 }
    ];

    it('formats default tooltip with score 12 and rank D', () => {
      const html = formatStyleRankTooltip();
      expect(html).toContain('OUTLAW STYLE RANK (D — 12%)');
      expect(html).toContain('HOW TO IMPROVE:');
      expect(html).toContain('RANK REWARDS:');
    });

    it('formats style rank tooltip across all 7 rank tiers (D, C, B, A, S, SS, SSS)', () => {
      for (const { grade, score, driftPct } of rankTiers) {
        const html = formatStyleRankTooltip(score, grade);

        // 1. Current rank header & score
        expect(html).toContain(`OUTLAW STYLE RANK (${grade} — ${score}%)`);

        // 2. Active combat bonus description
        expect(html).toContain('Higher Style Ranks grant live combat buffs');
        expect(html).toContain('Fire Rate, Bike Speed, Loot Luck, and passive NOS Regeneration');

        // 3. How to build style: [SPACE], drift, graze, kills
        expect(html).toContain('HOW TO IMPROVE:');
        expect(html).toContain('[SPACE]');
        expect(html).toContain('Powerslide Drift');
        expect(html).toContain('Graze');
        expect(html).toContain('Chain Enemy Kills');

        // 4. All 7 rank tiers & reward thresholds
        expect(html).toContain('RANK REWARDS:');
        expect(html).toContain('C (24%): +3% Spd/Rate');
        expect(html).toContain('B (38%): +6% Spd/Rate');
        expect(html).toContain('A (52%): +10% Spd/Rate');
        expect(html).toContain('S (66%): +15% Spd/Rate +1.5 NOS/s');
        expect(html).toContain('SS (80%): +20% Spd/Rate +2.5 NOS/s');
        expect(html).toContain('SSS (92%): +25% Spd/Rate +4 NOS/s');

        // Also check robustness when called with driftPct parameter
        const htmlWithDrift = formatStyleRankTooltip(score, String(driftPct));
        expect(htmlWithDrift).toContain(`OUTLAW STYLE RANK (${driftPct} — ${score}%)`);
        expect(htmlWithDrift).toContain('[SPACE]');
        expect(htmlWithDrift).toContain('Graze');
        expect(htmlWithDrift).toContain('Chain Enemy Kills');
      }
    });

    it('rounds floating-point style scores correctly', () => {
      const html = formatStyleRankTooltip(79.6, 'SS');
      expect(html).toContain('OUTLAW STYLE RANK (SS — 80%)');

      const htmlLow = formatStyleRankTooltip(23.4, 'C');
      expect(htmlLow).toContain('OUTLAW STYLE RANK (C — 23%)');
    });
  });

  describe('Weapon Evolution Progress Tooltip Formatter (formatWeaponEvolutionTooltipHint - M86)', () => {
    const allWeapons: WeaponId[] = [
      'pistol',
      'machine_gun',
      'flamethrower',
      'grenade_launcher',
      'shotgun',
      'railgun',
      'arc_coil'
    ];

    it('formats unevolved baseline hint at 0/3 stacks across all 7 weapons', () => {
      for (const id of allWeapons) {
        const evo = WEAPON_EVOLUTIONS[id];
        const hint = formatWeaponEvolutionTooltipHint(id, { items: [], itemStacks: {} });
        expect(hint).toBe(
          `🔧 OVERCLOCK TO ${evo.evolvedName.toUpperCase()}: Need "${evo.signatureModName}" Mod OR 0/3 Item Stacks (${evo.desc})`
        );
        expect(hint).not.toContain('ACTIVE');
        expect(hint).not.toContain('⚡ OVERCLOCKED');
      }
    });

    it('formats partial unevolved progression at 2/3 stacks correctly', () => {
      const hint = formatWeaponEvolutionTooltipHint('pistol', {
        items: [],
        itemStacks: { lens: 2 }
      });
      expect(hint).toBe(
        '🔧 OVERCLOCK TO RICOCHET REVOLVER: Need "Ricochet Rounds" Mod OR 2/3 Item Stacks (+2 Bounces, +35% Damage & Golden Tracer Rounds)'
      );
      expect(hint).toContain('2/3 Item Stacks');
      expect(hint).not.toContain('ACTIVE');
      expect(hint).not.toContain('⚡ OVERCLOCKED');
    });

    it('formats evolved state when player possesses weapon signature mod across all 7 weapons', () => {
      for (const id of allWeapons) {
        const evo = WEAPON_EVOLUTIONS[id];
        // Signature mod by name
        const hintByName = formatWeaponEvolutionTooltipHint(id, {
          items: [evo.signatureModName],
          itemStacks: {}
        });
        expect(hintByName).toBe(
          `⚡ OVERCLOCKED: ${evo.evolvedName.toUpperCase()} ACTIVE (${evo.desc})`
        );
        expect(hintByName).toContain('ACTIVE');
        expect(hintByName).not.toContain('Need');

        // Signature mod by id
        const hintById = formatWeaponEvolutionTooltipHint(id, {
          items: [evo.signatureModId],
          itemStacks: {}
        });
        expect(hintById).toBe(
          `⚡ OVERCLOCKED: ${evo.evolvedName.toUpperCase()} ACTIVE (${evo.desc})`
        );
      }
    });

    it('formats evolved state when player reaches 3/3 item stacks without signature mod', () => {
      // 3 stacks on single item
      const hintSingle = formatWeaponEvolutionTooltipHint('machine_gun', {
        items: [],
        itemStacks: { scrap: 3 }
      });
      expect(hintSingle).toBe(
        '⚡ OVERCLOCKED: HYPER-VULCAN GATLING ACTIVE (Twin Parallel Streams & Tightened Spread)'
      );

      // 3 stacks split across multiple items
      const hintSplit = formatWeaponEvolutionTooltipHint('shotgun', {
        items: [],
        itemStacks: { lens: 1, armor_plate: 2 }
      });
      expect(hintSplit).toBe(
        '⚡ OVERCLOCKED: HELLFIRE FLAK CANNON ACTIVE (10 Incendiary Pellets & 20px Blast Knockback)'
      );
    });

    it('formats evolved state when player has both signature mod and 3/3 stacks', () => {
      const hintBoth = formatWeaponEvolutionTooltipHint('railgun', {
        items: ['Piercing Core'],
        itemStacks: { lens: 3 }
      });
      expect(hintBoth).toBe(
        '⚡ OVERCLOCKED: ORBITAL ION LANCE ACTIVE (Hyper-Wide Golden Ion Lance & +35% Damage)'
      );
      expect(hintBoth).toContain('ACTIVE');
    });

    it('gracefully handles null, undefined, empty player, and stack overflow boundaries', () => {
      // Undefined player parameter
      const hintUndefined = formatWeaponEvolutionTooltipHint('arc_coil');
      expect(hintUndefined).toBe(
        '🔧 OVERCLOCK TO THUNDERLORD STORM COIL: Need "Vampiric Siphon" Mod OR 0/3 Item Stacks (Chains to 6 Targets for 85% Damage)'
      );

      // Explicit null player parameter
      const hintNull = formatWeaponEvolutionTooltipHint('flamethrower', null);
      expect(hintNull).toBe(
        '🔧 OVERCLOCK TO PLASMA MELTDOWN TORCH: Need "High Explosive" Mod OR 0/3 Item Stacks (Blue-White Plasma Cone & +45% Burn Power)'
      );

      // Empty object player
      const hintEmpty = formatWeaponEvolutionTooltipHint('grenade_launcher', {});
      expect(hintEmpty).toBe(
        '🔧 OVERCLOCK TO CARPET CLUSTER MORTAR: Need "High Explosive" Mod OR 0/3 Item Stacks (Spawns 3 Secondary Cluster Bomblets on Impact)'
      );

      // Overflow stacks (> 3) triggers overclocked state
      const hintOverflow = formatWeaponEvolutionTooltipHint('pistol', {
        items: [],
        itemStacks: { scrap: 5 }
      });
      expect(hintOverflow).toBe(
        '⚡ OVERCLOCKED: RICOCHET REVOLVER ACTIVE (+2 Bounces, +35% Damage & Golden Tracer Rounds)'
      );
    });
  });

  describe('Weapon Tactical Role & Base DPS Classifier (M91: getWeaponTacticalProfile)', () => {
    it('returns distinct tactical role profiles and computed base DPS for all 7 weapons', () => {
      const expectedProfiles: Record<
        WeaponId,
        {
          roleTag: WeaponTacticalProfile['roleTag'];
          optimalRangeText: string;
          baseDps: number;
          summaryLine: string;
        }
      > = {
        pistol: {
          roleTag: 'PRECISION SIDEARM',
          optimalRangeText: 'MID RANGE',
          baseDps: 48,
          summaryLine: 'PRECISION SIDEARM · 48 BASE DPS · MID RANGE'
        },
        machine_gun: {
          roleTag: 'RAPID SUPPRESSION',
          optimalRangeText: 'CLOSE-TO-MID RANGE',
          baseDps: 58,
          summaryLine: 'RAPID SUPPRESSION · 58 BASE DPS · CLOSE-TO-MID RANGE'
        },
        flamethrower: {
          roleTag: 'AREA DENIAL',
          optimalRangeText: 'SHORT RANGE',
          baseDps: 36,
          summaryLine: 'AREA DENIAL · 36 BASE DPS · SHORT RANGE'
        },
        grenade_launcher: {
          roleTag: 'HEAVY ARTILLERY',
          optimalRangeText: 'MID-TO-LONG RANGE',
          baseDps: 15,
          summaryLine: 'HEAVY ARTILLERY · 15 BASE DPS · MID-TO-LONG RANGE'
        },
        shotgun: {
          roleTag: 'CLOSE-QUARTERS BURST',
          optimalRangeText: 'POINT-BLANK RANGE',
          baseDps: 56,
          summaryLine: 'CLOSE-QUARTERS BURST · 56 BASE DPS · POINT-BLANK RANGE'
        },
        railgun: {
          roleTag: 'SNIPER PIERCE',
          optimalRangeText: 'LONG RANGE',
          baseDps: 44,
          summaryLine: 'SNIPER PIERCE · 44 BASE DPS · LONG RANGE'
        },
        arc_coil: {
          roleTag: 'CHAIN CROWD-CONTROL',
          optimalRangeText: 'MID-RANGE CHAIN',
          baseDps: 38,
          summaryLine: 'CHAIN CROWD-CONTROL · 38 BASE DPS · MID-RANGE CHAIN'
        }
      };

      const rolesSet = new Set<string>();
      const rangeSet = new Set<string>();

      for (const [id, expected] of Object.entries(expectedProfiles) as Array<[WeaponId, typeof expectedProfiles[WeaponId]]>) {
        const profile = getWeaponTacticalProfile(id);
        expect(profile.weaponId).toBe(id);
        expect(profile.roleTag).toBe(expected.roleTag);
        expect(profile.optimalRangeText).toBe(expected.optimalRangeText);
        expect(profile.baseDps).toBe(expected.baseDps);
        expect(profile.summaryLine).toBe(expected.summaryLine);

        rolesSet.add(profile.roleTag);
        rangeSet.add(profile.optimalRangeText);
      }

      // All 7 weapons have distinct role tags and distinct optimal range texts
      expect(rolesSet.size).toBe(7);
      expect(rangeSet.size).toBe(7);
    });

    it('safely falls back to pistol tactical profile on unknown weapon IDs', () => {
      const fallbackProfile = getWeaponTacticalProfile('plasma_cutter' as WeaponId);
      expect(fallbackProfile.weaponId).toBe('pistol');
      expect(fallbackProfile.roleTag).toBe('PRECISION SIDEARM');
      expect(fallbackProfile.baseDps).toBe(48);
      expect(fallbackProfile.summaryLine).toBe('PRECISION SIDEARM · 48 BASE DPS · MID RANGE');
    });

    it('matches mathematical formula Math.round((w.dmg * (w.count || 1)) / Math.max(0.05, w.fireRate))', () => {
      for (const [id, w] of Object.entries(WEAPONS) as Array<[WeaponId, typeof WEAPONS[WeaponId]]>) {
        const profile = getWeaponTacticalProfile(id);
        const expectedDps = Math.round((w.dmg * (w.count || 1)) / Math.max(0.05, w.fireRate));
        expect(profile.baseDps).toBe(expectedDps);
      }
    });
  });
});
