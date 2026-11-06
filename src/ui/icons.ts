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
