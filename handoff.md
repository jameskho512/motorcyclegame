# MOTO-ROGUE: Engine Port & Anime Vector Overhaul — Orchestrator Handoff (`handoff.md`)

## 1. Executive Summary & Mission

You are tasked with porting **MOTO-ROGUE** from its current 4,143-line monolithic single-file prototype (`moto-rogue/index.html`) into a modular,pure-code **TypeScript + Vite + PixiJS v8 (WebGL2/WebGPU)** architecture, while upgrading the visual presentation to a **Dragon Ball Super / Anime Vector Cel-Shaded** art style.

### Core Objectives
1. **100% Feature, Balance, and Save Parity:** Every weapon, enemy AI pattern, boss variant, RoR2 stacking item, 6-slot garage equipment piece, procedural Web Audio sound effect, HUD widget, and `localStorage` save format from `moto-rogue/index.html` must be preserved without regression.
2. **Modular TypeScript Architecture:** Split the monolith into clean, strictly-typed modules (`src/core`, `src/data`, `src/entities`, `src/systems`, `src/render`, `src/shaders`, `src/audio`, `src/ui`) with `<50ms` Vite HMR and zero `tsc --noEmit` errors.
3. **Dragon Ball Super Vector Aesthetic:** Replace flat HTML5 `<canvas>` 2D primitives with GPU-accelerated PixiJS vector graphics (`Graphics`), bold black ink outlines (`#0a0a0f`), hard-edged 2-to-3 tone anime cel-shading, HDR bloom/glow shaders, NOS Ki-like flame auras, speed lines, and 2-frame black-and-white "anime impact frames" on critical hits, explosions, and boss kills.

---

## 2. Source of Truth Map (`moto-rogue/index.html`)

Do not guess game numbers or mechanics. Reference these exact line ranges in `moto-rogue/index.html`:

| System / Module | Lines in `index.html` | Key Contents & Rules |
| :--- | :--- | :--- |
| **DOM Layout & CSS Styling** | `L1–L622` | 3-column widescreen grid (`#left-sidebar`, `#game-wrapper` 1:1 aspect ratio, `#right-sidebar`), `#shop-confirm-overlay`, `#garage-overlay` (roller door, checker bay, 6 equipment slots, stash, unlocks), `#tooltip`. |
| **Constants & Arena Geometry** | `L630–L634` | Logical arena `W = 720`, `H = 720`, `WALL = 58`, `DOOR_HALF = 42`. |
| **Procedural Web Audio (`SFX`)** | `L635–L889` | Zero external audio assets. Uses `AudioContext`, white noise buffer, dual-oscillator continuous motorcycle engine hum (`engOsc1` sawtooth + `engOsc2` triangle + lowpass filter modulated by speed & NOS boost), plus 15 procedural SFX functions (`shoot`, `arcChain`, `explosion`, `hit`, `enemyKill`, `playerHurt`, `gameOverSound`, `pickupFuel`, `pickupItem`, `pickupLoot`, `shopBuy`, `shopError`, `roomClear`, `doorTransition`, `nextFloor`, `uiClick`). |
| **7 Weapons (`WEAPONS`)** | `L891–L973`, `L1811–L1957` | `pistol` [1], `machine_gun` [2], `flamethrower` [3] (cone puff, hits each enemy once via `hitIds`, applies 2.4s Burn DoT), `grenade_launcher` [4] (lobbed arc + AoE blast), `shotgun` [5] (6 pellets + knockback), `railgun` [6] (pierces 99 + ion beam trail), `arc_coil` [7] (chains lightning to up to 3 enemies within `155px` for `0.65x` dmg). |
| **Permanent Meta Upgrades** | `L975–L1009` | `dmg` (+10%/rank, max 5), `fireRate` (+8%/rank, max 5), `speed` (+6%/rank, max 5), `maxHp` (+1 HP/rank, max 4). |
| **9 In-Run Pedestal/Shop Mods** | `L1011–L1076` | `hollow_point`, `hair_trigger`, `turbo_charger`, `armor_plate`, `piercing_core`, `ricochet_mod`, `vamp_siphon`, `split_chamber`, `high_explosive`. |
| **6 RoR2 Stacking Drop Items** | `L1078–L1094` | `nitro_syringe` (+15% fire rate/stack), `tire_iron` (+30% dmg vs >90% HP/stack), `chrome_lens` (+10% 2x crit chance/stack, cap 80%), `gasoline` (kills explode, radius `50 + 14*stacks`, dmg `10 + 8*stacks`), `racing_slicks` (+10% speed/stack), `oil_infusion` (every 15 kills: `+1 * stacks` max HP up to 20). |
| **6-Slot Bike Equipment & Rarity** | `L1096–L1212` | Slots: `tires` (speed), `engine` (dmg), `handlebars` (fireRate), `exhaust` (blast), `frame` (hp), `tank` (siphon). Rarities: Common (`1.0x`), Magic (`1.8x`), Rare (`2.8x`), Legendary (`4.2x`). Auto-equips if `itemScore` beats current slot; max stash 18 (auto-sells weakest part for scrap). |
| **Save & Persistence** | `L1214–L1263`, `L4012–L4049` | `localStorage` keys MUST remain compatible: `moto_rogue_save_v2` (meta progression, scrap, unlocked weapons, ranks, equipped parts, stash), `moto_rogue_run_v1` (in-run checkpoint autosaved every 5s and on room transition/beforeunload), `moto_rogue_muted` (`'1'` or `'0'`). |
| **Dungeon Generation** | `L1482–L1704` | Grid graph of `7 + Math.min(10, floor * 2)` square rooms. Start at `(0,0)`. Furthest Manhattan distance = `boss`, 2nd furthest = `treasure` (free mod pedestal), 3rd furthest = `shop` (Hull Repair, Mod Pedestal, Run Weapon Rental). Obstacles: indestructible `rock` and explosive `barrel` (TNT). |
| **Enemies & 3 Boss Variants** | `L1706–L1770`, `L2498–L2750` | Regular enemies: `swarmer`, `turret`, `charger` (Floor 1+); `trishot`, `bomber`, `brute` (35% frontal bullet resistance) (Floor 2+); `splitter` (spawns 2 `mini_swarmer` on death), `sniper`, `pyro` (Floor 3+). Elites (`1.65x` HP, `1.15x` speed, golden outline). Bosses (`createBoss`): `SCRAP GOLIATH` (v0), `SIEGE BEHEMOTH` (v1, mortar bombs), `OVERLORD HELION` (v2, 5-way aimed burst) — rendered as road-raging muscle cars (`drawBossCar`). |
| **Physics, NOS & Controls** | `L1345–L1405`, `L2033–L2496` | WASD/Arrows movement with smooth velocity & angle interpolation, skid marks on sharp turns (`Math.abs(diff) > 0.45`), `Shift` NOS boost (+70% speed, drains `35/s`, 0.7s recharge delay, recharges `16/s`, locks on empty until `25%`). |
| **HUD, Minimap, Fuel Gauge & Garage** | `L3363–L4125` | Semicircular Fuel Gauge (`#fuel-gauge`, needle wobbles when `<= 34%`), Garage Bike Lift preview (`#bike-canvas` colored/glowing by equipped part rarity), Minimap (`#minimap-canvas`), and hover tooltips (`#tooltip`). |

---

## 3. Target Tech Stack & Directory Structure

### Stack
- **Build Tool:** Vite (`vite`, `typescript`)
- **Renderer:** **PixiJS v8** (`pixi.js`) + `pixi-filters` (for GPU Bloom / Shockwave / Glitch / Outline filters) or lightweight custom WebGL2/WGSL post-processing shaders.
- **UI Layer:** Hybrid approach — keep the ultra-responsive HTML/CSS sidebars, Garage Workshop modal, and Shop modal (ported into clean TypeScript UI controllers + modular CSS), while rendering the 720×720 arena, custom vector Fuel Gauge, Garage Bike Lift, and Minimap via crisp HiDPI Canvas / PixiJS.

### Target Project Layout
Create the project inside `moto-rogue/` (preserving `moto-rogue/revisions/` and backing up the original monolithic `index.html` to `moto-rogue/revisions/v8-monolith-backup.html`):

```text
moto-rogue/
├── index.html                  # Clean Vite entry HTML shell + UI containers
├── package.json                # scripts: dev, build, preview, typecheck
├── tsconfig.json               # Strict TypeScript configuration
├── vite.config.ts
└── src/
    ├── main.ts                 # App bootstrap, PixiJS Application init, main loop
    ├── styles/
    │   └── main.css            # Extracted & polished CSS for layout, sidebars, garage, shop, tooltips
    ├── types/
    │   └── game.ts             # Shared interfaces: Player, Enemy, Room, Bullet, WeaponDef, LootItem, SaveState
    ├── data/
    │   ├── weapons.ts          # WEAPONS & UNLOCKABLE_IDS
    │   ├── upgrades.ts         # META_UPGRADES, RUN_MOD_POOL, DROP_ITEMS
    │   └── equipment.ts        # EQUIP_SLOTS, RARITY, STAT_BASE, genLoot(), rollRarity()
    ├── core/
    │   ├── state.ts            # Central reactive/mutable game state & save/load managers
    │   └── input.ts            # Keyboard, Mouse, Wheel, and Shortcut bindings
    ├── audio/
    │   └── sfx.ts              # Procedural Web Audio synthesizer (SFX module)
    ├── world/
    │   └── dungeon.ts          # Procedural floor layout, room population, shop & boss setup
    ├── systems/
    │   ├── physics.ts          # Circle-AABB collision, wall/door transitions, NOS boost, movement
    │   ├── combat.ts           # Weapon firing, projectile updates, crits, knockback, explosions, DoT
    │   └── enemyAI.ts          # AI behaviors for all 10 enemy types + 3 muscle-car boss variants
    ├── render/
    │   ├── stage.ts            # PixiJS Stage hierarchy (FloorLayer, SkidLayer, ShadowLayer, EntityLayer, VfxLayer, HudOverlayLayer)
    │   ├── vectorArt.ts        # Dragon Ball Super style vector drawing routines (Bike, Boss Car, Enemies, Props)
    │   ├── vfx.ts              # Anime speed lines, Ki/NOS flame aura, lightning arcs, shockwaves, impact frames
    │   └── shaders.ts          # Custom GLSL post-processing filters (HDR Bloom, Impact Frame B&W invert, Chromatic Aberration)
    └── ui/
        ├── hud.ts              # Sidebar stats, weapon bar, item badges, semicircular Fuel Gauge, Minimap
        ├── garage.ts           # Garage modal controller, 6-slot equipment bay, bike lift vector preview, stash
        ├── shopModal.ts        # Shop purchase confirmation modal controller
        └── tooltip.ts          # Floating hover tooltip manager (DOM + in-room pickup proximity)
```

---

## 4. "Dragon Ball Super" Vector Art & Visual Upgrade Spec

When porting the rendering layer (`src/render/vectorArt.ts`, `src/render/vfx.ts`, `src/render/shaders.ts`), elevate the visuals from basic Canvas shapes to a **Dragon Ball Super: Broly / Anime Vector** look:

1. **Bold Ink Outlines & Hard Cel-Shading:**
   - Every entity (Player Motorcycle, Boss Muscle Car, Enemies, TNT Barrels, Rocks, Pedestals) must be drawn with a crisp, dark ink outer stroke (`#08080c`, width `2.5px–3.5px`) and sharp interior cel-shading (a base tone, a hard-edged shadow polygon on the opposite side of the light source, and a crisp specular highlight strip).
2. **Super-Charged NOS & Weapon Auras (Ki Aura Effect):**
   - When the player holds `Shift` (NOS Boost), render a jagged, multi-layered anime energy aura (`#4cc9f0` outer flame, `#ffffff` inner core) rippling backward from the motorcycle, accompanied by radial or directional anime **speed lines** at the screen edges.
3. **HDR Bloom / Energy Glow:**
   - Apply a GPU Bloom filter to the `VfxLayer` and projectiles so plasma railgun beams (`#00f5d4`), Arc Tesla Coil lightning (`#c77dff`), flamethrower fire, and rarity loot crates emit a genuine anime energy glow.
4. **Anime Impact Frames & Hit-Stop:**
   - On **Boss Kills**, **TNT Barrel Chain Explosions**, or high-damage **Railgun Crits**, trigger a `35ms–50ms` visual **Impact Frame** (brief high-contrast black-and-white / inverted flash with radial impact spikes at the hit location) via a post-processing shader uniform.
5. **Dynamic Procedural Lightning & Beams:**
   - Render `railgun` and `arc_coil` beams with a thick outer colored glow and a razor-sharp white core (`#ffffff`) with animated jagged vertices.

---

## 5. Phased Execution Plan for the Agent Orchestrator

To maximize speed and avoid merge conflicts, execute this port in **4 structured phases** (using parallel subagents in Phases 2 and 3):

### Phase 1: Project Scaffolding & Type Contract (Sequential — Orchestrator)
1. Copy `moto-rogue/index.html` to `moto-rogue/revisions/v8-monolith-backup.html` so the original monolith is safely archived.
2. Initialize `package.json`, `tsconfig.json`, and `vite.config.ts` in `moto-rogue/`. Install `pixi.js`, `pixi-filters`, `typescript`, and `vite`.
3. Create `src/types/game.ts` defining every shared data structure (`WeaponId`, `WeaponDef`, `EnemyType`, `Enemy`, `Player`, `Bullet`, `Grenade`, `EnemyBomb`, `BeamEffect`, `Particle`, `Pickup`, `Obstacle`, `Room`, `SaveState`, `LootItem`).
   - *Rule:* Once `src/types/game.ts` is locked, subagents can build all modules in parallel against these exact interfaces.

### Phase 2: Core Logic, Data, Audio & World Extraction (Parallel Subagents)
- **Worker A (`src/data/*` + `src/core/*` + `src/audio/sfx.ts`):**
  - Port `WEAPONS`, `META_UPGRADES`, `RUN_MOD_POOL`, `DROP_ITEMS`, `EQUIP_SLOTS`, `RARITY`, and loot generation into `src/data/`.
  - Port `saveState`, `player` state, `loadSave`/`writeSave`, `saveRun`/`loadRun`, and `input.ts` into `src/core/`.
  - Port the procedural Web Audio synthesizer (`SFX`) into `src/audio/sfx.ts` with full TypeScript types.
- **Worker B (`src/world/dungeon.ts` + `src/systems/*`):**
  - Port `generateDungeon`, `populateRoom`, and `populateShop` into `src/world/dungeon.ts`.
  - Port `physics.ts` (movement, NOS boost, skid generation, obstacle AABB resolution, wall/door transitions).
  - Port `combat.ts` (`fireWeapon` for all 7 weapons, bullet/grenade/bomb updates, `triggerExplosion`, `damageEnemy`, `handleEnemyDeath`, RoR2 item procs).
  - Port `enemyAI.ts` (all 10 enemy types + 3 boss variants).

### Phase 3: Anime Vector Renderer, Shaders & UI Controllers (Parallel Subagents)
- **Worker C (`src/render/*`):**
  - Build the PixiJS v8 stage (`stage.ts`), custom anime shaders/filters (`shaders.ts`), and Dragon Ball Super vector drawing routines (`vectorArt.ts`, `vfx.ts`) for the arena, walls, doors, motorcycle, muscle-car bosses, enemies, projectiles, Ki/NOS aura, and impact frames.
- **Worker D (`src/ui/*` + `src/styles/main.css` + `index.html`):**
  - Extract the CSS into `src/styles/main.css` and HTML shell into `index.html`.
  - Port `hud.ts` (including the vector semicircular Fuel Gauge and Minimap), `garage.ts` (including the vector Garage Bike Lift and 6-slot equipment/stash interactions), `shopModal.ts`, and `tooltip.ts`.

### Phase 4: Integration & Verification Checklist (Sequential — Orchestrator)
1. Wire `src/main.ts` to connect Input, Systems, PixiJS Renderer, Audio, and UI.
2. Run `npx tsc --noEmit` and `npm run build` — verify **0 TypeScript or bundler errors**.
3. Start the dev server (`npm run dev`) and verify:
   - [ ] Driving with `WASD`, boosting with `Shift` (NOS bar drains/locks/recharges + anime aura/speed lines appear), aiming and firing with Mouse.
   - [ ] Switching all 7 weapons (`1–7` and mouse scroll wheel) and verifying their distinct projectiles, beams, arcs, and procedural audio.
   - [ ] Clearing a combat room, transitioning through `N/S/E/W` doors, visiting `$ Shop` (confirm modal via `E`/`Esc`), `★ Treasure` room, and `☠ Boss` room.
   - [ ] Opening `[G] Garage & Tuning`, equipping/unequipping/selling boss loot parts, unlocking weapons/tuning with Scrap, and verifying `localStorage` persistence across page reloads.
