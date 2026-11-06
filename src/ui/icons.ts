/**
 * MOTO-ROGUE: High-Fidelity Anime Cel-Shaded SVG Icon Library
 *
 * Provides rich, multi-layered, comic-inked (`#0a0b10`) cel-shaded vector illustrations
 * matching the Guilty Gear / DBFZ / Persona 5 concept art for:
 * 1. All 7 Player Weapons (angled dynamic silhouettes with receivers, stocks, coils & muzzle flash)
 * 2. All 6 Stacking Power-Up Items (die-cut sticker illustrations)
 * 3. All 9 In-Run Pedestal Mods (die-cut tactical mod illustrations)
 * 4. All 6 Motorcycle Equipment Part Slots (Garage & Stash part illustrations)
 * 5. Shop & Utility Emblems (Hull Repair Kit, Mystery Crate)
 */

import { WeaponId, DropItemId, EquipSlot } from '../types/game';

/**
 * 1. HIGH-FIDELITY WEAPON ILLUSTRATIONS (viewBox 0 0 80 52)
 * Drawn at a dynamic ~22-degree upward battle tilt like the concept art weapon deck.
 */
export const WEAPON_HI_FI_SVG: Record<WeaponId, string> = {
  pistol: `<svg viewBox="0 0 80 52" aria-hidden="true" focusable="false">
    <g transform="rotate(-20 40 26)">
      <!-- Drop shadow -->
      <path d="M14 14h48l3 4v7H41l-5 19H21l4-19H14z" fill="#0a0b10" transform="translate(2.5, 3)"/>
      <!-- Lower receiver & trigger guard -->
      <path d="M24 22h18v9H31V24h-7z" fill="#2b2e3d" stroke="#0a0b10" stroke-width="2.4" stroke-linejoin="round"/>
      <!-- Ergonomic grip with textured panels -->
      <path d="M23 23h14l-4 18H19z" fill="#3a261e" stroke="#0a0b10" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M24 26h9l-2.5 12h-8z" fill="#593a2e"/>
      <line x1="23" y1="29" x2="32" y2="29" stroke="#0a0b10" stroke-width="1.5"/>
      <line x1="22" y1="33" x2="31" y2="33" stroke="#0a0b10" stroke-width="1.5"/>
      <!-- Magazine baseplate -->
      <path d="M17 40h15l-1 3H16z" fill="#ffd166" stroke="#0a0b10" stroke-width="2"/>
      <!-- Heavy slide & barrel -->
      <path d="M13 12h47l3 3v8H13l-2-5z" fill="#7a8299" stroke="#0a0b10" stroke-width="2.8" stroke-linejoin="round"/>
      <!-- Slide top cel-highlight -->
      <path d="M15 13.5h44l1.5 2H15z" fill="#cfd6e6"/>
      <!-- Slide lower shadow bevel -->
      <path d="M14 19h48v3.5H14z" fill="#464b5c"/>
      <!-- Ejection port & serrations -->
      <rect x="33" y="14" width="9" height="4" fill="#181a24" stroke="#0a0b10" stroke-width="1.4"/>
      <line x1="18" y1="15" x2="17" y2="20" stroke="#0a0b10" stroke-width="1.8"/>
      <line x1="21" y1="15" x2="20" y2="20" stroke="#0a0b10" stroke-width="1.8"/>
      <line x1="24" y1="15" x2="23" y2="20" stroke="#0a0b10" stroke-width="1.8"/>
      <!-- Golden compensator & sights -->
      <path d="M60 12h5v11h-5z" fill="#ffd166" stroke="#0a0b10" stroke-width="2.2"/>
      <rect x="15" y="9.5" width="4" height="2.5" fill="#ffd166" stroke="#0a0b10" stroke-width="1.5"/>
      <rect x="57" y="9.5" width="3.5" height="2.5" fill="#ffd166" stroke="#0a0b10" stroke-width="1.5"/>
    </g>
  </svg>`,

  machine_gun: `<svg viewBox="0 0 80 52" aria-hidden="true" focusable="false">
    <g transform="rotate(-22 40 26)">
      <!-- Drop shadow -->
      <path d="M6 15h56v9H46l5 16H43l-5-16H31l-4 13H19l2-13H6z" fill="#0a0b10" transform="translate(2.5, 3)"/>
      <!-- Collapsible wire stock -->
      <path d="M5 17h11v5H8v7H4V17z" fill="#323646" stroke="#0a0b10" stroke-width="2.4" stroke-linejoin="round"/>
      <!-- Curved extended SMG magazine -->
      <path d="M39 22h8c2 7 4 13 7 18l-7 2c-3-5-6-11-8-20z" fill="#262936" stroke="#0a0b10" stroke-width="2.5" stroke-linejoin="round"/>
      <path d="M42 25c1.5 5 3 9 5 13" stroke="#4cc9f0" stroke-width="2" fill="none"/>
      <!-- Rear pistol grip -->
      <path d="M21 23h10l-3 14h-9z" fill="#1b1d26" stroke="#0a0b10" stroke-width="2.5" stroke-linejoin="round"/>
      <!-- Upper & lower receiver body -->
      <path d="M15 12h39l3 3v9H15z" fill="#4f566b" stroke="#0a0b10" stroke-width="2.8" stroke-linejoin="round"/>
      <!-- Specular top receiver rail -->
      <path d="M17 13h35v3H17z" fill="#9aa3ba"/>
      <!-- Cyan neon cooling shroud slots -->
      <rect x="36" y="16.5" width="4.5" height="3" rx="1" fill="#4cc9f0" stroke="#0a0b10" stroke-width="1.2"/>
      <rect x="43" y="16.5" width="4.5" height="3" rx="1" fill="#4cc9f0" stroke="#0a0b10" stroke-width="1.2"/>
      <rect x="50" y="16.5" width="4.5" height="3" rx="1" fill="#4cc9f0" stroke="#0a0b10" stroke-width="1.2"/>
      <!-- Suppressor / heavy vented barrel & muzzle flash -->
      <rect x="57" y="14" width="11" height="6.5" fill="#252836" stroke="#0a0b10" stroke-width="2.4"/>
      <path d="M68 17l9-5-3 5 4 3-10-1z" fill="#4cc9f0" stroke="#0a0b10" stroke-width="1.6"/>
      <!-- Optic reflex sight -->
      <path d="M26 8h9l1 4H25z" fill="#252836" stroke="#0a0b10" stroke-width="2"/>
      <rect x="28" y="9" width="5" height="2" fill="#4cc9f0"/>
    </g>
  </svg>`,

  flamethrower: `<svg viewBox="0 0 80 52" aria-hidden="true" focusable="false">
    <g transform="rotate(-20 40 26)">
      <!-- Underslung pressurized napalm canister -->
      <ellipse cx="26" cy="31" rx="12" ry="6.5" fill="#d62828" stroke="#0a0b10" stroke-width="2.6"/>
      <path d="M16 29c5-2 15-2 20 0" stroke="#ff9f1c" stroke-width="2" fill="none"/>
      <!-- Rear grip & fuel hose -->
      <path d="M11 21h9l-3 12h-8z" fill="#262936" stroke="#0a0b10" stroke-width="2.4" stroke-linejoin="round"/>
      <!-- Main heavy heat-shielded projector barrel -->
      <path d="M10 13h40l4 2v8H10z" fill="#596075" stroke="#0a0b10" stroke-width="2.8" stroke-linejoin="round"/>
      <path d="M12 14.5h36v2.5H12z" fill="#9ea6bd"/>
      <!-- Perforated heat cage -->
      <rect x="36" y="12" width="18" height="10" fill="#323645" stroke="#0a0b10" stroke-width="2.4"/>
      <circle cx="40" cy="17" r="1.6" fill="#ff6b2b"/>
      <circle cx="45" cy="17" r="1.6" fill="#ff6b2b"/>
      <circle cx="50" cy="17" r="1.6" fill="#ff6b2b"/>
      <!-- Igniter nozzle & roaring anime flame plume -->
      <path d="M54 14h6v6h-6z" fill="#ff9f1c" stroke="#0a0b10" stroke-width="2"/>
      <path d="M60 17c4-8 11-9 17-5-4 3-3 5 2 6-6 4-13 5-19-1z" fill="#ff5400" stroke="#0a0b10" stroke-width="2.2" stroke-linejoin="round"/>
      <path d="M61 17c3-4 7-4 11-2-2 2-1 3 1 4-4 2-8 2-12-2z" fill="#ffd60a"/>
    </g>
  </svg>`,

  grenade_launcher: `<svg viewBox="0 0 80 52" aria-hidden="true" focusable="false">
    <g transform="rotate(-20 40 26)">
      <!-- Tactical stock & grip -->
      <path d="M5 16h14v9l-11 4-3-4z" fill="#2d3142" stroke="#0a0b10" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M19 24h8l-2 12h-8z" fill="#1b1d26" stroke="#0a0b10" stroke-width="2.4" stroke-linejoin="round"/>
      <!-- Massive 6-shot revolving rotary drum cylinder -->
      <rect x="24" y="10" width="21" height="18" rx="4" fill="#f72585" stroke="#0a0b10" stroke-width="2.8"/>
      <rect x="26" y="12" width="17" height="4" rx="1.5" fill="#ff70a6"/>
      <line x1="25" y1="19" x2="44" y2="19" stroke="#0a0b10" stroke-width="2.2"/>
      <line x1="25" y1="24" x2="44" y2="24" stroke="#0a0b10" stroke-width="2.2"/>
      <!-- Wide-bore heavy mortar barrel & foregrip -->
      <path d="M45 11h22v13H45z" fill="#4f566b" stroke="#0a0b10" stroke-width="2.8" stroke-linejoin="round"/>
      <path d="M47 12.5h18v3H47z" fill="#9ea6bd"/>
      <rect x="52" y="24" width="6" height="9" rx="1.5" fill="#262936" stroke="#0a0b10" stroke-width="2.2"/>
      <!-- Flared muzzle rim with hazard stripe -->
      <rect x="64" y="10" width="5" height="15" fill="#ffd166" stroke="#0a0b10" stroke-width="2.4"/>
      <!-- Top rangefinder ladder sight -->
      <path d="M22 6h28v4H22z" fill="#262936" stroke="#0a0b10" stroke-width="2"/>
    </g>
  </svg>`,

  shotgun: `<svg viewBox="0 0 80 52" aria-hidden="true" focusable="false">
    <g transform="rotate(-22 40 26)">
      <!-- Classic sawed-off walnut stock with cel-shaded wood grain -->
      <path d="M4 21l18-5h7v9l-19 9-6-5z" fill="#8d4925" stroke="#0a0b10" stroke-width="2.8" stroke-linejoin="round"/>
      <path d="M6 22l15-4.5v3L7 25z" fill="#c46d3b"/>
      <!-- Break-action steel receiver -->
      <path d="M26 14h12v10H26z" fill="#4a5063" stroke="#0a0b10" stroke-width="2.6" stroke-linejoin="round"/>
      <!-- Twin heavy double-barrel tubes -->
      <path d="M36 12h34v6H36z" fill="#6c758c" stroke="#0a0b10" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M36 18h34v5.5H36z" fill="#3b4052" stroke="#0a0b10" stroke-width="2.6" stroke-linejoin="round"/>
      <!-- Bright top barrel specular highlight -->
      <path d="M38 13.5h30v2H38z" fill="#d0d7e6"/>
      <!-- Wooden handguard pump/forend -->
      <path d="M40 21h18l-2 5H38z" fill="#a3562a" stroke="#0a0b10" stroke-width="2.4" stroke-linejoin="round"/>
      <!-- Golden brass shell rim & muzzle band -->
      <rect x="35" y="13" width="3" height="9.5" fill="#ffbe0b" stroke="#0a0b10" stroke-width="1.5"/>
      <rect x="66" y="11.5" width="4" height="12.5" fill="#ffbe0b" stroke="#0a0b10" stroke-width="2"/>
    </g>
  </svg>`,

  railgun: `<svg viewBox="0 0 80 52" aria-hidden="true" focusable="false">
    <g transform="rotate(-20 40 26)">
      <!-- Futuristic bullpup stock & grip -->
      <path d="M4 13h22v14l-9 8H7l3-8H4z" fill="#232838" stroke="#0a0b10" stroke-width="2.6" stroke-linejoin="round"/>
      <path d="M24 23h9l-2 11h-8z" fill="#181b26" stroke="#0a0b10" stroke-width="2.4"/>
      <!-- Glowing cyan plasma energy core running between rails -->
      <rect x="24" y="15" width="48" height="6" fill="#00f5d4"/>
      <line x1="25" y1="18" x2="72" y2="18" stroke="#ffffff" stroke-width="2.2"/>
      <!-- Upper electromagnetic accelerator rail -->
      <path d="M20 10h52l4 3v3H20z" fill="#e0e6f5" stroke="#0a0b10" stroke-width="2.6" stroke-linejoin="round"/>
      <!-- Lower electromagnetic accelerator rail -->
      <path d="M22 20h52l-3 4H22z" fill="#8c96b0" stroke="#0a0b10" stroke-width="2.6" stroke-linejoin="round"/>
      <!-- Magnetic induction coils along barrel -->
      <rect x="34" y="9" width="4.5" height="16" rx="1" fill="#00bbf9" stroke="#0a0b10" stroke-width="2"/>
      <rect x="46" y="9" width="4.5" height="16" rx="1" fill="#00bbf9" stroke="#0a0b10" stroke-width="2"/>
      <rect x="58" y="9" width="4.5" height="16" rx="1" fill="#00bbf9" stroke="#0a0b10" stroke-width="2"/>
    </g>
  </svg>`,

  arc_coil: `<svg viewBox="0 0 80 52" aria-hidden="true" focusable="false">
    <g transform="rotate(-20 40 26)">
      <!-- Insulated high-voltage chassis & grip -->
      <path d="M6 14h32v11H26l-3 12h-9l2-12H6z" fill="#322645" stroke="#0a0b10" stroke-width="2.8" stroke-linejoin="round"/>
      <path d="M8 15.5h28v3H8z" fill="#6b5294"/>
      <!-- Copper & violet induction rings -->
      <rect x="38" y="11" width="5" height="16" rx="2" fill="#ffd60a" stroke="#0a0b10" stroke-width="2.2"/>
      <rect x="46" y="12" width="5" height="14" rx="2" fill="#c77dff" stroke="#0a0b10" stroke-width="2.2"/>
      <rect x="54" y="13" width="5" height="12" rx="2" fill="#ffd60a" stroke="#0a0b10" stroke-width="2.2"/>
      <!-- Tesla emitter sphere -->
      <circle cx="63" cy="19" r="5.5" fill="#7bdff2" stroke="#0a0b10" stroke-width="2.4"/>
      <circle cx="61.5" cy="17.5" r="2" fill="#ffffff"/>
      <!-- Crackling anime lightning arcs -->
      <path d="M67 15l5-6-2 6 6-2-6 7 5 4-7-1 2 5-5-6" fill="none" stroke="#ffd60a" stroke-width="2.4" stroke-linejoin="round"/>
      <path d="M40 9l5-4 3 4 5-4 3 4" fill="none" stroke="#e0aaff" stroke-width="2" stroke-linejoin="round"/>
    </g>
  </svg>`
};

/**
 * 2. HIGH-FIDELITY STACKING POWER-UP STICKER ILLUSTRATIONS (viewBox 0 0 36 36)
 * Matches the die-cut sticker badges on the bottom-right of the anime HUD concept art.
 */
export const DROP_ITEM_HI_FI_SVG: Record<DropItemId, string> = {
  nitro_syringe: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <g transform="rotate(-30 18 18)">
      <!-- Plunger & thumb ring -->
      <path d="M14 3h8v3h-3v4h-2V6h-3z" fill="#cfd6e6" stroke="#0a0b10" stroke-width="2" stroke-linejoin="round"/>
      <!-- Glass barrel -->
      <rect x="11" y="9" width="14" height="17" rx="2" fill="#1e2230" stroke="#0a0b10" stroke-width="2.4"/>
      <!-- Glowing Nitrous Fuel Fill -->
      <rect x="13" y="13" width="10" height="11" fill="#ff9f1c"/>
      <rect x="13" y="13" width="4" height="11" fill="#ffd60a"/>
      <!-- Measurement ticks -->
      <line x1="19" y1="13" x2="23" y2="13" stroke="#0a0b10" stroke-width="1.5"/>
      <line x1="19" y1="17" x2="23" y2="17" stroke="#0a0b10" stroke-width="1.5"/>
      <line x1="19" y1="21" x2="23" y2="21" stroke="#0a0b10" stroke-width="1.5"/>
      <!-- Steel hypodermic needle & glowing drop -->
      <path d="M16 26h4l-1.5 7h-1z" fill="#e0e6f5" stroke="#0a0b10" stroke-width="1.6"/>
      <circle cx="18" cy="34" r="2" fill="#00f5d4"/>
    </g>
  </svg>`,

  tire_iron: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Forged steel angled crowbar / tire iron -->
    <path d="M7 29L22 8c2-2.5 5-3 7.5-1l2 2-3.5 3.5-3-2-13 19.5z" fill="#adb5bd" stroke="#0a0b10" stroke-width="2.4" stroke-linejoin="round"/>
    <!-- Specular steel edge -->
    <path d="M9 27L22 9.5" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>
    <!-- Red mechanic handle grip -->
    <path d="M5 27l5-7 4 3-5 7z" fill="#ff4d6d" stroke="#0a0b10" stroke-width="2.2" stroke-linejoin="round"/>
    <!-- Impact spark -->
    <path d="M27 16l3-2-1 3.5 3 1-3.5 1.5-.5 3-2-3-3 1 1.5-3z" fill="#ffd60a"/>
  </svg>`,

  chrome_lens: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Twin cyber-aviator racing goggles -->
    <path d="M2 16h32v5H2z" fill="#3a261e" stroke="#0a0b10" stroke-width="2"/>
    <ellipse cx="11" cy="19" rx="7.5" ry="6.5" fill="#4cc9f0" stroke="#0a0b10" stroke-width="2.5"/>
    <ellipse cx="25" cy="19" rx="7.5" ry="6.5" fill="#4cc9f0" stroke="#0a0b10" stroke-width="2.5"/>
    <!-- Chrome bridge -->
    <rect x="16" y="16" width="4" height="3.5" fill="#e0e6f5" stroke="#0a0b10" stroke-width="1.8"/>
    <!-- Anime diagonal lens glare slashes -->
    <path d="M7 16l5-2-4 7-2-1z" fill="#ffffff"/>
    <path d="M21 16l5-2-4 7-2-1z" fill="#ffffff"/>
    <!-- Crit target reticle glint -->
    <path d="M28 8l1.5 3.5L33 13l-3.5 1.5L28 18l-1.5-3.5L23 13l3.5-1.5z" fill="#ffd60a" stroke="#0a0b10" stroke-width="1.2"/>
  </svg>`,

  gasoline: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Brass spout & top handle -->
    <path d="M9 5h6l-1 5H8z" fill="#ffd166" stroke="#0a0b10" stroke-width="2" stroke-linejoin="round"/>
    <path d="M17 6h10v4H17z" fill="#adb5bd" stroke="#0a0b10" stroke-width="2" stroke-linejoin="round"/>
    <!-- Red military steel jerry-can body -->
    <rect x="7" y="10" width="22" height="22" rx="3" fill="#e63946" stroke="#0a0b10" stroke-width="2.5"/>
    <path d="M9 12h18v3H9z" fill="#ff758f"/>
    <!-- Embossed flame crest in center -->
    <path d="M18 14c3 4 5 6 4 10-1 3-4 4-6 3-2-1-3-4-1-7 1 1 2 1 3-6z" fill="#ffd60a" stroke="#0a0b10" stroke-width="1.8" stroke-linejoin="round"/>
  </svg>`,

  racing_slicks: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Wide performance slick tire -->
    <circle cx="18" cy="18" r="14" fill="#1b1d26" stroke="#0a0b10" stroke-width="2.6"/>
    <!-- Neon turquoise speed rim ring -->
    <circle cx="18" cy="18" r="9.5" fill="#2b2e3d" stroke="#00f5d4" stroke-width="2.4"/>
    <!-- 5-spoke alloy wheel star -->
    <path d="M18 9v18M9 18h18M12 12l12 12M24 12L12 24" stroke="#cfd6e6" stroke-width="2"/>
    <!-- Gold center hub & brake caliper -->
    <circle cx="18" cy="18" r="3.8" fill="#ffd60a" stroke="#0a0b10" stroke-width="1.8"/>
  </svg>`,

  oil_infusion: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Alchemical flask neck & cork -->
    <rect x="15" y="4" width="6" height="4" rx="1" fill="#c46d3b" stroke="#0a0b10" stroke-width="1.8"/>
    <path d="M14 8h8v5l8 14c1 2-0.5 5-3 5H9c-2.5 0-4-3-3-5l8-14z" fill="#241938" stroke="#0a0b10" stroke-width="2.5" stroke-linejoin="round"/>
    <!-- Shimmering purple/gold oil liquid level -->
    <path d="M10 21h16l4 7c0.5 1-0.5 2-2 2H8c-1.5 0-2.5-1-2-2z" fill="#9d4edd"/>
    <ellipse cx="18" cy="21" rx="8" ry="2.2" fill="#e0aaff"/>
    <!-- Rising energy bubbles -->
    <circle cx="16" cy="26" r="2" fill="#ffd60a"/>
    <circle cx="21" cy="24" r="1.5" fill="#00f5d4"/>
    <circle cx="18" cy="16" r="1.6" fill="#ffd60a"/>
  </svg>`
};

/**
 * 3. HIGH-FIDELITY IN-RUN PEDESTAL MOD ILLUSTRATIONS (viewBox 0 0 36 36)
 */
export const MOD_HI_FI_SVG: Record<string, string> = {
  hollow_point: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Expanding hollow-point heavy cartridge -->
    <path d="M11 29h14l-1-12-6-12-6 12z" fill="#ffbe0b" stroke="#0a0b10" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M13 17l5-10 5 10z" fill="#e63946" stroke="#0a0b10" stroke-width="2" stroke-linejoin="round"/>
    <rect x="10" y="29" width="16" height="3.5" rx="1" fill="#d97706" stroke="#0a0b10" stroke-width="2"/>
    <!-- Impact burst rays -->
    <path d="M6 12l4 2M30 12l-4 2M7 6l4 4M29 6l-4 4" stroke="#ff4d6d" stroke-width="2.2" stroke-linecap="round"/>
  </svg>`,

  hair_trigger: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Golden competition hair-trigger & lightning bolt -->
    <path d="M12 6h12v6h-5c0 6 3 11 8 14l-4 5c-7-4-11-11-11-19z" fill="#ffd60a" stroke="#0a0b10" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M24 8l-5 8h5l-6 11 2-8h-4z" fill="#00f5d4" stroke="#0a0b10" stroke-width="1.6" stroke-linejoin="round"/>
  </svg>`,

  turbo_charger: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Twin-scroll turbocharger snail housing -->
    <path d="M18 5c8 0 14 6 14 14s-6 13-14 13S5 26 5 19c0-5 3-9 7-11V4h14v5" fill="#9ea6bd" stroke="#0a0b10" stroke-width="2.5" stroke-linejoin="round"/>
    <circle cx="18" cy="19" r="7.5" fill="#181b26" stroke="#0a0b10" stroke-width="2.2"/>
    <!-- Glowing cyan compressor impeller -->
    <path d="M18 12v14M11 19h14M13 14l10 10M23 14L13 24" stroke="#00f5d4" stroke-width="2"/>
    <circle cx="18" cy="19" r="2.8" fill="#ffd60a"/>
  </svg>`,

  armor_plate: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Heavy hexagonal reactive armor shield -->
    <path d="M18 3l13 5v11c0 8-6 13-13 15C11 32 5 27 5 19V8z" fill="#5c677d" stroke="#0a0b10" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M18 6l9 3.5v9c0 5.5-4 9.5-9 11-5-1.5-9-5.5-9-11v-9z" fill="#8d99ae"/>
    <!-- Medical / Hull integrity cross -->
    <path d="M16 12h4v4h4v4h-4v4h-4v-4h-4v-4h4z" fill="#ff4d6d" stroke="#0a0b10" stroke-width="1.8"/>
  </svg>`,

  piercing_core: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Depleted uranium armor-piercing sabot dart punching through steel -->
    <rect x="14" y="5" width="8" height="26" rx="2" fill="#4f566b" stroke="#0a0b10" stroke-width="2.2"/>
    <path d="M4 25L32 11l-7 13-3-4-18 5z" fill="#00f5d4" stroke="#0a0b10" stroke-width="2.2" stroke-linejoin="round"/>
    <line x1="6" y1="24" x2="29" y2="12.5" stroke="#ffffff" stroke-width="2"/>
  </svg>`,

  ricochet_mod: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Ricochet bank-shot laser off steel wall -->
    <rect x="4" y="12" width="5" height="16" fill="#8d99ae" stroke="#0a0b10" stroke-width="2"/>
    <path d="M28 6L9 19l20 11" fill="none" stroke="#ffd60a" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="9" cy="19" r="4.5" fill="#ff6b2b" stroke="#0a0b10" stroke-width="1.8"/>
    <circle cx="9" cy="19" r="2" fill="#ffffff"/>
  </svg>`,

  vamp_siphon: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Crimson vampiric fuel droplet & twin cyber fangs -->
    <path d="M18 4c5 7 10 12 10 18a10 10 0 0 1-20 0c0-6 5-11 10-18z" fill="#e63946" stroke="#0a0b10" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M13 20c-1 4 1 7 4 8" stroke="#ff8fa3" stroke-width="2.2" stroke-linecap="round" fill="none"/>
    <path d="M12 6l3 9 3-6 3 6 3-9" fill="#ffffff" stroke="#0a0b10" stroke-width="2" stroke-linejoin="round"/>
  </svg>`,

  split_chamber: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Triple-split multi-shot volley -->
    <path d="M6 26L28 8M6 26l25 0M6 26L24 32" stroke="#ffd60a" stroke-width="3" stroke-linecap="round"/>
    <circle cx="28" cy="8" r="3.5" fill="#ff6b2b" stroke="#0a0b10" stroke-width="1.8"/>
    <circle cx="30" cy="25" r="3.5" fill="#ff6b2b" stroke="#0a0b10" stroke-width="1.8"/>
    <circle cx="24" cy="31" r="3.5" fill="#ff6b2b" stroke="#0a0b10" stroke-width="1.8"/>
  </svg>`,

  high_explosive: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Starburst detonation shockwave -->
    <path d="M18 2l4 8 9-3-5 8 8 5-9 2 3 9-8-5-5 8-2-9-9 2 6-7-6-7 9 2z" fill="#ff5400" stroke="#0a0b10" stroke-width="2.2" stroke-linejoin="round"/>
    <circle cx="18" cy="18" r="6" fill="#ffd60a"/>
    <circle cx="18" cy="18" r="2.8" fill="#ffffff"/>
  </svg>`
};

/**
 * 4. HIGH-FIDELITY GARAGE EQUIPMENT SLOT & STASH PART ILLUSTRATIONS (viewBox 0 0 36 36)
 */
export const EQUIP_SLOT_HI_FI_SVG: Record<EquipSlot, string> = {
  tires: DROP_ITEM_HI_FI_SVG.racing_slicks,

  engine: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- V-Twin Motorcycle Engine Block with Cooling Fins & Gold Clutch -->
    <path d="M5 12l7-6 6 5 6-5 7 6-4 10H9z" fill="#5c6478" stroke="#0a0b10" stroke-width="2.4" stroke-linejoin="round"/>
    <rect x="9" y="20" width="18" height="11" rx="2" fill="#2b2e3d" stroke="#0a0b10" stroke-width="2.4"/>
    <line x1="8" y1="13" x2="15" y2="17" stroke="#cfd6e6" stroke-width="2"/>
    <line x1="28" y1="13" x2="21" y2="17" stroke="#cfd6e6" stroke-width="2"/>
    <circle cx="14" cy="25.5" r="3.5" fill="#ff9f1c" stroke="#0a0b10" stroke-width="1.8"/>
    <circle cx="22" cy="25.5" r="2.5" fill="#adb5bd" stroke="#0a0b10" stroke-width="1.6"/>
  </svg>`,

  exhaust: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Twin Chrome Header Pipes & Flared Megaphone Muffler -->
    <path d="M4 11h9l6 7h12l2 7H17l-7-8H4z" fill="#9ea6bd" stroke="#0a0b10" stroke-width="2.4" stroke-linejoin="round"/>
    <path d="M6 13h6l6 7h11" stroke="#ffffff" stroke-width="1.8" fill="none"/>
    <ellipse cx="32" cy="21.5" rx="2.5" ry="4" fill="#ff6b2b" stroke="#0a0b10" stroke-width="1.8"/>
  </svg>`,

  handlebars: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Swept Racing Clip-On Handlebars with Grips & Triple Clamp -->
    <path d="M3 14l9-4h12l9 4-2 5-8-3H13l-8 3z" fill="#adb5bd" stroke="#0a0b10" stroke-width="2.4" stroke-linejoin="round"/>
    <rect x="2" y="13" width="7" height="5" rx="1.5" transform="rotate(-18 5 15)" fill="#ff5c00" stroke="#0a0b10" stroke-width="2"/>
    <rect x="27" y="13" width="7" height="5" rx="1.5" transform="rotate(18 30 15)" fill="#ff5c00" stroke="#0a0b10" stroke-width="2"/>
    <rect x="14" y="14" width="8" height="12" rx="2" fill="#2b2e3d" stroke="#0a0b10" stroke-width="2.2"/>
    <circle cx="18" cy="18" r="2.5" fill="#ffd60a"/>
  </svg>`,

  frame: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Tubular Steel Trellis Motorcycle Chassis Frame -->
    <path d="M5 26L13 8h13l5 12-9 6H5z" fill="none" stroke="#0a0b10" stroke-width="6" stroke-linejoin="round"/>
    <path d="M5 26L13 8h13l5 12-9 6H5z" fill="none" stroke="#ff5c00" stroke-width="3.2" stroke-linejoin="round"/>
    <path d="M13 8l9 18M26 8L14 26" stroke="#ffd60a" stroke-width="2.4"/>
    <circle cx="13" cy="8" r="2.5" fill="#ffffff" stroke="#0a0b10" stroke-width="1.5"/>
    <circle cx="26" cy="8" r="2.5" fill="#ffffff" stroke="#0a0b10" stroke-width="1.5"/>
    <circle cx="22" cy="26" r="2.5" fill="#ffffff" stroke="#0a0b10" stroke-width="1.5"/>
  </svg>`,

  tank: `<svg viewBox="0 0 36 36" aria-hidden="true" focusable="false">
    <!-- Sculpted Teardrop Sportbike Fuel Tank with Racing Stripe & Chrome Cap -->
    <path d="M4 22c0-7 6-12 15-12h7l6 6v7c0 3-2 4-6 4H8c-3 0-4-2-4-5z" fill="#ff5c00" stroke="#0a0b10" stroke-width="2.6" stroke-linejoin="round"/>
    <path d="M7 17c3-4 8-5 16-5l3 3H7z" fill="#ff9e44"/>
    <path d="M6 20h24v3H6z" fill="#0a0b10"/>
    <rect x="18" y="7" width="5" height="3" rx="1" fill="#e0e6f5" stroke="#0a0b10" stroke-width="1.8"/>
  </svg>`
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
  if (lower.includes('pierc') || lower.includes('uranium')) return MOD_HI_FI_SVG.piercing_core;
  if (lower.includes('ricochet') || lower.includes('deflect')) return MOD_HI_FI_SVG.ricochet_mod;
  if (lower.includes('vamp') || lower.includes('siphon')) return MOD_HI_FI_SVG.vamp_siphon;
  if (lower.includes('split') || lower.includes('chamber')) return MOD_HI_FI_SVG.split_chamber;
  return MOD_HI_FI_SVG.high_explosive;
}
