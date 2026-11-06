/**
 * MOTO-ROGUE: Hi-Fi Set 08 3D Halftone Comic Pop-Art Icon Atlas
 *
 * Centralised SVG icon wrappers around extracted Set 08 (Spider-Verse / Hi-Fi Rush
 * 3D Halftone Comic Pop-Art) transparent PNG assets in `/assets/set08/`:
 *   - 7 Weapons (`WEAPON_HI_FI_SVG`, viewBox 0 0 80 52)
 *   - 12 Stacking Power-Up Drops (`DROP_ITEM_HI_FI_SVG`, viewBox 0 0 36 36)
 *   - 15 In-Run Pedestal Mods (`MOD_HI_FI_SVG`, viewBox 0 0 36 36)
 *   - 6 Garage Equipment Slots (`EQUIP_SLOT_HI_FI_SVG`, viewBox 0 0 36 36)
 */

import { SET08_ASSETS } from './set08Assets';

const resolveAssetHref = (assetFile: string): string => {
  const key = assetFile.replace(/\.png$/, '');
  return SET08_ASSETS[key] || `/assets/set08/${assetFile}`;
};

const weaponIconSvg = (assetFile: string, comment: string): string => `<svg viewBox="0 0 80 52" aria-hidden="true" focusable="false">
  <!-- ${comment} -->
  <image href="${resolveAssetHref(assetFile)}" x="1" y="1" width="78" height="50" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

const squareIconSvg = (assetFile: string, comment: string): string => `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
  <!-- ${comment} -->
  <image href="${resolveAssetHref(assetFile)}" x="0.5" y="0.5" width="35" height="35" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

export const WEAPON_HI_FI_SVG: Record<string, string> = {
  pistol: weaponIconSvg(
    'weapon_pistol.png',
    'Set 08 3D Halftone Comic Pop-Art Heavy Combat Pistol'
  ),
  shotgun: weaponIconSvg(
    'weapon_shotgun.png',
    'Set 08 3D Halftone Comic Pop-Art Sawed-Off Double-Barrel Combat Shotgun'
  ),
  machine_gun: weaponIconSvg(
    'weapon_machine_gun.png',
    'Set 08 3D Halftone Comic Pop-Art Compact Futuristic SMG'
  ),
  flamethrower: weaponIconSvg(
    'weapon_flamethrower.png',
    'Set 08 3D Halftone Comic Pop-Art Heavy Napalm Flamethrower'
  ),
  grenade_launcher: weaponIconSvg(
    'weapon_grenade_launcher.png',
    'Set 08 3D Halftone Comic Pop-Art 6-Shot Rotary Drum Grenade Launcher'
  ),
  railgun: weaponIconSvg(
    'weapon_railgun.png',
    'Set 08 3D Halftone Comic Pop-Art Twin-Rail Electromagnetic Plasma Railgun'
  ),
  arc_coil: weaponIconSvg(
    'weapon_arc_coil.png',
    'Set 08 3D Halftone Comic Pop-Art High-Voltage Tesla Arc Coil Rifle'
  )
};

export const DROP_ITEM_HI_FI_SVG: Record<string, string> = {
  nitro_syringe: squareIconSvg(
    'drop_nitro_syringe.png',
    'Set 08 3D Halftone Comic Pop-Art Pressurized Nitrous Syringe'
  ),
  tire_iron: squareIconSvg(
    'drop_tire_iron.png',
    'Set 08 3D Halftone Comic Pop-Art Forged Steel Tire Iron Crowbar'
  ),
  chrome_lens: squareIconSvg(
    'drop_chrome_lens.png',
    'Set 08 3D Halftone Comic Pop-Art Cyber-Aviator Chrome Goggles'
  ),
  gasoline: squareIconSvg(
    'drop_gasoline.png',
    'Set 08 3D Halftone Comic Pop-Art High-Octane Gasoline Jerry-Can'
  ),
  oil_infusion: squareIconSvg(
    'drop_oil_infusion.png',
    'Set 08 3D Halftone Comic Pop-Art Alchemical Synthetic Oil Flask'
  ),
  racing_slicks: squareIconSvg(
    'drop_racing_slicks.png',
    'Set 08 3D Halftone Comic Pop-Art Soft-Compound Racing Slicks Tire'
  ),
  tesla_capacitor: squareIconSvg(
    'drop_tesla_capacitor.png',
    'Set 08 3D Halftone Comic Pop-Art High-Voltage Tesla Capacitor Cell'
  ),
  exhaust_afterburner: squareIconSvg(
    'drop_exhaust_afterburner.png',
    'Set 08 3D Halftone Comic Pop-Art Jet Turbine Exhaust Afterburner'
  ),
  reactive_plating: squareIconSvg(
    'drop_reactive_plating.png',
    'Set 08 3D Halftone Comic Pop-Art Hexagonal Reactive Armor Plating'
  ),
  magnet_coil: squareIconSvg(
    'drop_magnet_coil.png',
    'Set 08 3D Halftone Comic Pop-Art Horseshoe Electromagnet Coil'
  ),
  adrenaline_injector: squareIconSvg(
    'drop_adrenaline_injector.png',
    'Set 08 3D Halftone Comic Pop-Art Neon-Emerald Adrenaline Auto-Injector'
  ),
  titanium_spikes: squareIconSvg(
    'drop_titanium_spikes.png',
    'Set 08 3D Halftone Comic Pop-Art Triple-Bladed Titanium Ram Spikes'
  )
};

export const MOD_HI_FI_SVG: Record<string, string> = {
  hollow_point: squareIconSvg(
    'mod_hollow_point.png',
    'Set 08 3D Halftone Comic Pop-Art Expanding Hollow-Point Heavy Cartridge'
  ),
  hair_trigger: squareIconSvg(
    'mod_hair_trigger.png',
    'Set 08 3D Halftone Comic Pop-Art Gold Competition Hair-Trigger Assembly'
  ),
  turbo_charger: squareIconSvg(
    'mod_turbo_charger.png',
    'Set 08 3D Halftone Comic Pop-Art Twin-Scroll Chrome Turbocharger'
  ),
  armor_plate: squareIconSvg(
    'mod_armor_plate.png',
    'Set 08 3D Halftone Comic Pop-Art Reinforced Hull Armor Shield Plate'
  ),
  piercing_core: squareIconSvg(
    'mod_piercing_core.png',
    'Set 08 3D Halftone Comic Pop-Art Depleted-Uranium Armor-Piercing Sabot Core'
  ),
  ricochet_mod: squareIconSvg(
    'mod_ricochet_mod.png',
    'Set 08 3D Halftone Comic Pop-Art Ricochet Deflector Bank-Shot Mod'
  ),
  vamp_siphon: squareIconSvg(
    'mod_vamp_siphon.png',
    'Set 08 3D Halftone Comic Pop-Art Vampiric Fuel Siphon Fangs'
  ),
  split_chamber: squareIconSvg(
    'mod_split_chamber.png',
    'Set 08 3D Halftone Comic Pop-Art Split-Chamber Multi-Shot Volley'
  ),
  high_explosive: squareIconSvg(
    'mod_high_explosive.png',
    'Set 08 3D Halftone Comic Pop-Art High-Explosive Ordnance Starburst'
  ),
  cryo_rounds: squareIconSvg(
    'mod_cryo_rounds.png',
    'Set 08 3D Halftone Comic Pop-Art Sub-Zero Cryo Rounds Core'
  ),
  homing_missiles: squareIconSvg(
    'mod_homing_missiles.png',
    'Set 08 3D Halftone Comic Pop-Art Radar-Locked Homing Micro-Missile'
  ),
  overcharge_dynamo: squareIconSvg(
    'mod_overcharge_dynamo.png',
    'Set 08 3D Halftone Comic Pop-Art Overcharge Electromagnetic Rotor Dynamo'
  ),
  executioner_optics: squareIconSvg(
    'mod_executioner_optics.png',
    'Set 08 3D Halftone Comic Pop-Art Executioner Thermal Sniper Optics'
  ),
  berserker_chassis: squareIconSvg(
    'mod_berserker_chassis.png',
    'Set 08 3D Halftone Comic Pop-Art Berserker Horned War-Rig Skull Emblem'
  ),
  nanite_repair: squareIconSvg(
    'mod_nanite_repair.png',
    'Set 08 3D Halftone Comic Pop-Art Hexagonal Emerald Nanite Repair Matrix'
  ),
  glass_cannon: squareIconSvg(
    'mod_glass_cannon.png',
    'Set 08 3D Halftone Comic Pop-Art Crystalline Glass Cannon Bore'
  ),
  heavy_ordnance: squareIconSvg(
    'mod_heavy_ordnance.png',
    'Set 08 3D Halftone Comic Pop-Art Heavy Ordnance Artillery Cylinder'
  ),
  point_blank: squareIconSvg(
    'mod_point_blank.png',
    'Set 08 3D Halftone Comic Pop-Art Sawed-Off Dragon-Breath Point-Blank Choke'
  ),
  overclock_core: squareIconSvg(
    'mod_overclock_core.png',
    'Set 08 3D Halftone Comic Pop-Art Pulsing Overclock Synergy Core'
  )
};

export const EQUIP_SLOT_HI_FI_SVG: Record<string, string> = {
  tires: squareIconSvg(
    'equip_tires.png',
    'Set 08 3D Halftone Comic Pop-Art Wide Racing Slicks Motorcycle Tire'
  ),
  engine: squareIconSvg(
    'equip_engine.png',
    'Set 08 3D Halftone Comic Pop-Art V-Twin Chrome Motorcycle Engine Block'
  ),
  exhaust: squareIconSvg(
    'equip_exhaust.png',
    'Set 08 3D Halftone Comic Pop-Art Twin Chrome Megaphone Exhaust Pipes'
  ),
  frame: squareIconSvg(
    'equip_frame.png',
    'Set 08 3D Halftone Comic Pop-Art Tubular Steel Trellis Motorcycle Frame'
  ),
  handlebars: squareIconSvg(
    'equip_handlebars.png',
    'Set 08 3D Halftone Comic Pop-Art Cyber-Ape Hanger Motorcycle Handlebars'
  ),
  tank: squareIconSvg(
    'equip_tank.png',
    'Set 08 3D Halftone Comic Pop-Art Sculpted Teardrop Sportbike Fuel Tank'
  )
};

/**
 * Helper to look up a mod icon by Mod ID or Mod display name.
 */
export function getModIconSvg(idOrName: string): string {
  if (MOD_HI_FI_SVG[idOrName]) return MOD_HI_FI_SVG[idOrName];
  const lower = idOrName.toLowerCase();
  if (lower.includes('hollow') || lower.includes('round')) return MOD_HI_FI_SVG.hollow_point;
  if (lower.includes('trigger') || lower.includes('hair')) return MOD_HI_FI_SVG.hair_trigger;
  if (lower.includes('nitrous') || lower.includes('turbo')) return MOD_HI_FI_SVG.turbo_charger;
  if (lower.includes('fairing') || lower.includes('armor') || lower.includes('reinforced')) return MOD_HI_FI_SVG.armor_plate;
  if (lower.includes('pierc') || lower.includes('uranium') || lower.includes('sabot')) return MOD_HI_FI_SVG.piercing_core;
  if (lower.includes('ricochet') || lower.includes('deflect') || lower.includes('rubber')) return MOD_HI_FI_SVG.ricochet_mod;
  if (lower.includes('vamp') || lower.includes('siphon')) return MOD_HI_FI_SVG.vamp_siphon;
  if (lower.includes('split') || lower.includes('chamber') || lower.includes('twin')) return MOD_HI_FI_SVG.split_chamber;
  if (lower.includes('cryo') || lower.includes('chill')) return MOD_HI_FI_SVG.cryo_rounds;
  if (lower.includes('homing') || lower.includes('smart')) return MOD_HI_FI_SVG.homing_missiles;
  if (lower.includes('overcharge') || lower.includes('dynamo')) return MOD_HI_FI_SVG.overcharge_dynamo;
  if (lower.includes('executioner') || lower.includes('optics')) return MOD_HI_FI_SVG.executioner_optics;
  if (lower.includes('berserker')) return MOD_HI_FI_SVG.berserker_chassis;
  if (lower.includes('nanite')) return MOD_HI_FI_SVG.nanite_repair;
  if (lower.includes('glass')) return MOD_HI_FI_SVG.glass_cannon;
  if (lower.includes('ordnance') || lower.includes('heavy')) return MOD_HI_FI_SVG.heavy_ordnance;
  if (lower.includes('point-blank') || lower.includes('choke')) return MOD_HI_FI_SVG.point_blank;
  if (lower.includes('overclock') || lower.includes('synergy')) return MOD_HI_FI_SVG.overclock_core;
  return MOD_HI_FI_SVG.high_explosive;
}

export type EquipModelSlotId = 'tires' | 'engine' | 'handlebars' | 'exhaust' | 'frame' | 'tank';
export type EquipModelRarityTier = 0 | 1 | 2 | 3;

export interface EquipmentVisualSpec {
  slot: EquipModelSlotId;
  rarity: EquipModelRarityTier;
  tierBadge: 'MK-I' | 'MK-II' | 'MK-III' | 'OMEGA';
  modelCode: string;
  subAssemblyLabel: string;
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  glowColor: string;
}

const RARITY_PALETTES: Record<
  EquipModelRarityTier,
  {
    tierBadge: 'MK-I' | 'MK-II' | 'MK-III' | 'OMEGA';
    primaryColor: string;
    secondaryColor: string;
    accentColor: string;
    glowColor: string;
  }
> = {
  0: {
    tierBadge: 'MK-I',
    primaryColor: '#c9ced8',
    secondaryColor: '#6c7787',
    accentColor: '#e2e8f0',
    glowColor: '#94a3b8'
  },
  1: {
    tierBadge: 'MK-II',
    primaryColor: '#4895ef',
    secondaryColor: '#00f5d4',
    accentColor: '#90e0ef',
    glowColor: '#00bbf9'
  },
  2: {
    tierBadge: 'MK-III',
    primaryColor: '#ffd166',
    secondaryColor: '#ff9f1c',
    accentColor: '#fff3b0',
    glowColor: '#ffd60a'
  },
  3: {
    tierBadge: 'OMEGA',
    primaryColor: '#ff6b2b',
    secondaryColor: '#ff1f4b',
    accentColor: '#ffd60a',
    glowColor: '#ff5400'
  }
};

const SLOT_MODEL_META: Record<
  EquipModelSlotId,
  Record<EquipModelRarityTier, { code: string; subAssembly: string }>
> = {
  tires: {
    0: { code: 'TR-01 STREET', subAssembly: '5-Spoke Alloy & Street Compound' },
    1: { code: 'TR-02 CRYO-SLICK', subAssembly: 'Cryo-Grip Sidewall & Twin-Piston Rotor' },
    2: { code: 'TR-03 APEX TURBINE', subAssembly: 'Forged Gold 10-Spoke & Ceramic Rotor' },
    3: { code: 'TR-04 HELLFIRE RIPPER', subAssembly: 'Sawtooth Titanium Spikes & Plasma Tread' }
  },
  engine: {
    0: { code: 'EN-01 IRON V2', subAssembly: 'Cast-Iron V-Twin & Chrome Covers' },
    1: { code: 'EN-02 TWIN-SCROLL', subAssembly: 'Sapphire Turbo Intake & Intercooler' },
    2: { code: 'EN-03 HYPER-BILLET', subAssembly: 'Gold Dry-Clutch & Twin NOS Rails' },
    3: { code: 'EN-04 VALHALLA CORE', subAssembly: 'Triple-Valve Blower & Fusion Reactor' }
  },
  handlebars: {
    0: { code: 'HB-01 STEEL YOKE', subAssembly: 'Chromoly Ape-Hangers & Analog Dial' },
    1: { code: 'HB-02 CYBER-CLIP', subAssembly: 'Telemetry HUD Tach & Braided Lines' },
    2: { code: 'HB-03 APEX RADAR', subAssembly: 'Carbon GP Yoke & Holo-Reticle' },
    3: { code: 'HB-04 NEURAL CROWN', subAssembly: 'Valhalla War-Visor & Twin Laser Sights' }
  },
  exhaust: {
    0: { code: 'EX-01 MEGAPHONE', subAssembly: 'Twin Chrome Baffled Tailpipes' },
    1: { code: 'EX-02 PIE-CUT TI', subAssembly: 'Anodized Titanium & Ion Cones' },
    2: { code: 'EX-03 AKRA-GOLD', subAssembly: 'Quad-Port Carbon-Gold Cannons' },
    3: { code: 'EX-04 DRAGON JET', subAssembly: 'Twin Afterburner Turbines & Shock Plumes' }
  },
  frame: {
    0: { code: 'FR-01 TRELLIS', subAssembly: 'Welded Chromoly Tubular Cage' },
    1: { code: 'FR-02 EXO-STRUT', subAssembly: 'Sapphire Truss & Nitrogen Mono-Shock' },
    2: { code: 'FR-03 MONOCOQUE', subAssembly: 'Carbon-Gold Spine & Shield Nodes' },
    3: { code: 'FR-04 JUGGERNAUT', subAssembly: 'Valhalla Ram-Prow & Hardlight Barrier' }
  },
  tank: {
    0: { code: 'TK-01 TEARDROP', subAssembly: 'Stamped Steel Cell & Chrome Cap' },
    1: { code: 'TK-02 CRYO-CELL', subAssembly: 'Pressurized Sight-Glass & Boost Lines' },
    2: { code: 'TK-03 ENDURANCE', subAssembly: 'Carbon-Gold Cell & Dual Dry-Breaks' },
    3: { code: 'TK-04 BLOOD SIPHON', subAssembly: 'Vampiric Plasma Core & Siphon Fangs' }
  }
};

/**
 * Returns deterministic, high-resolution visual model metadata for any equipment item.
 */
export function getEquipmentVisualSpec(
  item?: { slot?: string; rarity?: number; name?: string } | null,
  fallbackSlot: EquipModelSlotId = 'engine'
): EquipmentVisualSpec {
  const rawSlot = (item?.slot || fallbackSlot) as EquipModelSlotId;
  const slot: EquipModelSlotId = SLOT_MODEL_META[rawSlot] ? rawSlot : fallbackSlot;
  const rawRarity =
    typeof item?.rarity === 'number' && Number.isFinite(item.rarity) ? item.rarity : 0;
  const rarity = Math.max(0, Math.min(3, Math.floor(rawRarity))) as EquipModelRarityTier;
  const pal = RARITY_PALETTES[rarity];
  const meta = SLOT_MODEL_META[slot][rarity];

  return {
    slot,
    rarity,
    tierBadge: pal.tierBadge,
    modelCode: meta.code,
    subAssemblyLabel: meta.subAssembly,
    primaryColor: pal.primaryColor,
    secondaryColor: pal.secondaryColor,
    accentColor: pal.accentColor,
    glowColor: pal.glowColor
  };
}

/**
 * Renders the bespoke high-resolution 3D comic mechanical overlay vector layers
 * for each slot and rarity tier inside the 128x128 model viewBox.
 */
function renderSlotSubAssemblySvg(spec: EquipmentVisualSpec): string {
  const { slot, rarity, primaryColor, secondaryColor, accentColor } = spec;

  if (slot === 'tires') {
    const spikes =
      rarity >= 3
        ? `<g stroke="#0a0b10" stroke-width="1.8" fill="${accentColor}">
            <polygon points="64,6 68,16 60,16"/>
            <polygon points="96,16 92,26 85,20"/>
            <polygon points="116,42 105,46 104,37"/>
            <polygon points="118,76 107,74 109,65"/>
            <polygon points="32,18 39,26 30,28"/>
            <polygon points="12,48 23,48 20,57"/>
          </g>`
        : '';
    const caliper =
      rarity >= 1
        ? `<g>
            <circle cx="66" cy="66" r="24" fill="none" stroke="${primaryColor}" stroke-width="${1.8 + rarity * 0.6}" stroke-dasharray="${rarity >= 2 ? '6 3' : '10 4'}"/>
            <path d="M78,42 L95,48 L92,64 L76,58 Z" fill="${secondaryColor}" stroke="#0a0b10" stroke-width="2.2"/>
            <circle cx="85" cy="53" r="3" fill="${accentColor}" stroke="#0a0b10" stroke-width="1.4"/>
          </g>`
        : '';
    const flameArc =
      rarity >= 2
        ? `<path d="M18,98 Q56,118 112,88 L104,106 Q54,124 14,106 Z" fill="${primaryColor}" stroke="#0a0b10" stroke-width="2"/>`
        : '';
    return `${spikes}${caliper}${flameArc}`;
  }

  if (slot === 'engine') {
    const turboCore =
      rarity >= 1
        ? `<g>
            <circle cx="64" cy="40" r="${8 + rarity * 1.5}" fill="#0a0b10" stroke="${primaryColor}" stroke-width="2.5"/>
            <circle cx="64" cy="40" r="${4 + rarity}" fill="${secondaryColor}"/>
          </g>`
        : '';
    const nosRails =
      rarity >= 2
        ? `<g stroke="#0a0b10" stroke-width="2">
            <rect x="16" y="48" width="14" height="34" rx="5" transform="rotate(-18 23 65)" fill="${primaryColor}"/>
            <rect x="96" y="48" width="14" height="34" rx="5" transform="rotate(18 103 65)" fill="${secondaryColor}"/>
          </g>`
        : '';
    const blowerScoop =
      rarity >= 3
        ? `<g stroke="#0a0b10" stroke-width="2.2">
            <polygon points="42,14 86,14 94,28 34,28" fill="${primaryColor}"/>
            <circle cx="52" cy="21" r="3.5" fill="${accentColor}"/>
            <circle cx="64" cy="21" r="3.5" fill="${accentColor}"/>
            <circle cx="76" cy="21" r="3.5" fill="${accentColor}"/>
          </g>`
        : '';
    return `${nosRails}${turboCore}${blowerScoop}`;
  }

  if (slot === 'exhaust') {
    const plumes =
      rarity >= 1
        ? `<g stroke="#0a0b10" stroke-width="2">
            <path d="M74,26 L104,6 L96,28 L116,16 L94,40 Z" fill="${primaryColor}"/>
            <path d="M88,42 L118,24 L108,44 L124,36 L102,56 Z" fill="${accentColor}"/>
          </g>`
        : '';
    const shockRings =
      rarity >= 2
        ? `<g fill="none" stroke="${secondaryColor}" stroke-width="2.4">
            <ellipse cx="88" cy="24" rx="10" ry="5" transform="rotate(-38 88 24)"/>
            <ellipse cx="102" cy="36" rx="12" ry="6" transform="rotate(-38 102 36)"/>
          </g>`
        : '';
    const turbineCans =
      rarity >= 3
        ? `<g stroke="#0a0b10" stroke-width="2">
            <polygon points="24,78 46,52 54,58 32,84" fill="${primaryColor}"/>
            <polygon points="42,92 64,66 72,72 50,98" fill="${accentColor}"/>
          </g>`
        : '';
    return `${plumes}${shockRings}${turbineCans}`;
  }

  if (slot === 'frame') {
    const shockUnit =
      rarity >= 1
        ? `<g stroke="#0a0b10" stroke-width="2">
            <line x1="48" y1="42" x2="66" y2="82" stroke="${secondaryColor}" stroke-width="5"/>
            <line x1="48" y1="42" x2="66" y2="82" stroke="#0a0b10" stroke-width="2" stroke-dasharray="4 3"/>
          </g>`
        : '';
    const shieldNodes =
      rarity >= 2
        ? `<g stroke="#0a0b10" stroke-width="1.8" fill="${accentColor}">
            <polygon points="52,44 58,48 58,55 52,59 46,55 46,48"/>
            <polygon points="84,32 90,36 90,43 84,47 78,43 78,36"/>
            <polygon points="44,86 50,90 50,97 44,101 38,97 38,90"/>
          </g>`
        : '';
    const ramProw =
      rarity >= 3
        ? `<polygon points="104,22 124,30 108,44" fill="${primaryColor}" stroke="#0a0b10" stroke-width="2.2"/>`
        : '';
    return `${shockUnit}${shieldNodes}${ramProw}`;
  }

  if (slot === 'handlebars') {
    const hudRing =
      rarity >= 1
        ? `<g fill="none" stroke="${secondaryColor}" stroke-width="2.2">
            <circle cx="64" cy="58" r="${18 + rarity * 2}" stroke-dasharray="8 4"/>
            <line x1="56" y1="58" x2="72" y2="58"/>
            <line x1="64" y1="50" x2="64" y2="66"/>
          </g>`
        : '';
    const leverGuards =
      rarity >= 2
        ? `<g stroke="#0a0b10" stroke-width="2" fill="${primaryColor}">
            <path d="M12,32 L4,44 L18,48 Z"/>
            <path d="M116,32 L124,44 L110,48 Z"/>
          </g>`
        : '';
    const laserCrown =
      rarity >= 3
        ? `<g stroke="#0a0b10" stroke-width="2" fill="${accentColor}">
            <polygon points="52,34 64,14 76,34 64,28"/>
            <line x1="20" y1="24" x2="4" y2="8" stroke="${secondaryColor}" stroke-width="2.5"/>
            <line x1="108" y1="24" x2="124" y2="8" stroke="${secondaryColor}" stroke-width="2.5"/>
          </g>`
        : '';
    return `${hudRing}${leverGuards}${laserCrown}`;
  }

  // tank
  const sightGlass =
    rarity >= 1
      ? `<g stroke="#0a0b10" stroke-width="2">
          <rect x="48" y="48" width="36" height="12" rx="6" transform="rotate(-22 66 54)" fill="#0a0b10"/>
          <rect x="51" y="50" width="${18 + rarity * 4}" height="8" rx="4" transform="rotate(-22 66 54)" fill="${secondaryColor}"/>
        </g>`
      : '';
  const siphonCoils =
    rarity >= 2
      ? `<g fill="none" stroke="${accentColor}" stroke-width="2.5">
          <path d="M26,84 Q48,98 76,84"/>
          <circle cx="38" cy="34" r="9" stroke="${primaryColor}" stroke-width="2.2"/>
        </g>`
      : '';
  const vampFangs =
    rarity >= 3
      ? `<g stroke="#0a0b10" stroke-width="2" fill="${primaryColor}">
          <polygon points="22,68 10,88 28,80"/>
          <polygon points="34,76 24,96 42,86"/>
          <polygon points="64,18 72,6 76,22" fill="${accentColor}"/>
        </g>`
      : '';
  return `${sightGlass}${siphonCoils}${vampFangs}`;
}

/**
 * Generates a high-resolution (`128x128` viewBox) 3D Halftone Comic model SVG
 * for a specific equipment item (differentiated by slot, rarity tier, and sub-assembly).
 */
export function getEquipmentItemModelSvg(
  item?: { slot?: string; rarity?: number; name?: string } | null,
  fallbackSlot: EquipModelSlotId = 'engine'
): string {
  const spec = getEquipmentVisualSpec(item, fallbackSlot);
  const assetHref = resolveAssetHref(`equip_${spec.slot}.png`);
  const uid = `eqm-${spec.slot}-r${spec.rarity}`;

  // Rarity-specific pedestal geometry
  const haloRing =
    spec.rarity === 3
      ? `<polygon points="64,4 80,14 98,10 104,28 120,38 114,56 124,72 110,86 112,104 94,108 82,122 64,114 46,122 34,108 16,104 18,86 4,72 14,56 8,38 24,28 30,10 48,14" fill="url(#${uid}-bg)" stroke="${spec.primaryColor}" stroke-width="2.8"/>`
      : spec.rarity === 2
      ? `<polygon points="64,6 114,35 114,93 64,122 14,93 14,35" fill="url(#${uid}-bg)" stroke="${spec.primaryColor}" stroke-width="2.5"/>`
      : spec.rarity === 1
      ? `<circle cx="64" cy="64" r="56" fill="url(#${uid}-bg)" stroke="${spec.primaryColor}" stroke-width="2.4" stroke-dasharray="18 5"/>`
      : `<circle cx="64" cy="64" r="54" fill="url(#${uid}-bg)" stroke="${spec.primaryColor}" stroke-width="1.8" stroke-opacity="0.65"/>`;

  return `<svg class="gx-equip-model rarity-tier-${spec.rarity}" data-slot="${spec.slot}" data-rarity="${spec.rarity}" data-model-code="${spec.modelCode}" viewBox="0 0 128 128" aria-hidden="true" focusable="false">
  <defs>
    <radialGradient id="${uid}-bg" cx="50%" cy="48%" r="54%">
      <stop offset="0%" stop-color="${spec.glowColor}" stop-opacity="${0.22 + spec.rarity * 0.1}"/>
      <stop offset="65%" stop-color="${spec.primaryColor}" stop-opacity="${0.08 + spec.rarity * 0.05}"/>
      <stop offset="100%" stop-color="#0a0b10" stop-opacity="0.85"/>
    </radialGradient>
    <filter id="${uid}-rim" x="-15%" y="-15%" width="130%" height="130%">
      <feDropShadow dx="0" dy="2" stdDeviation="${1.5 + spec.rarity * 1.1}" flood-color="${spec.primaryColor}" flood-opacity="${0.55 + spec.rarity * 0.14}"/>
    </filter>
  </defs>
  <!-- 1. Rarity Isometric Blueprint Halo -->
  ${haloRing}
  <!-- 2. Isometric Mech Lift Base Ring -->
  <ellipse cx="64" cy="102" rx="42" ry="10" fill="#0a0b10" fill-opacity="0.7" stroke="${spec.secondaryColor}" stroke-width="1.8"/>
  <!-- 3. High-Res Set 08 3D Halftone Comic Base Model -->
  <image href="${assetHref}" x="12" y="10" width="104" height="100" preserveAspectRatio="xMidYMid meet" filter="url(#${uid}-rim)"/>
  <!-- 4. Slot & Rarity 3D Mechanical Sub-Assembly Overlay -->
  ${renderSlotSubAssemblySvg(spec)}
  <!-- 5. Model Tier Tag Plate -->
  <g transform="translate(64, 116)">
    <rect x="-26" y="-9" width="52" height="14" rx="4" fill="#0a0b10" stroke="${spec.primaryColor}" stroke-width="1.6"/>
    <text x="0" y="1.5" text-anchor="middle" fill="${spec.accentColor}" font-family="Impact, 'Arial Black', sans-serif" font-size="9.5" letter-spacing="0.8">${spec.tierBadge}</text>
  </g>
</svg>`;
}
