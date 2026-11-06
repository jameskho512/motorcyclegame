# MOTO-ROGUE — Authoritative Game Design Ground Truth & Cross-Critiqued Architecture

> **Epistemic Status & Provenance:** Synthesized via a 3-Agent Deep Research & Adversarial Cross-Critique Swarm across **Track 1 (Stat & Item Interactions / Mechanics)**, **Track 2 (Holistic Gameplay Experience & Pacing)**, and **Track 3 (Design, Visual Hierarchy & UI/UX)**, anchored in primary industry post-mortems (*Hades*, *Risk of Rain 2*, *Vampire Survivors*, *Brotato*, *Enter the Gungeon*, *Dead Cells*, *Nuclear Throne*, *Slay the Spire*, *Persona 5*, *Guilty Gear Strive*, *Hi-Fi Rush*, *Spider-Verse*) and direct line-by-line inspection of the `moto-rogue` codebase.

---

## Executive Summary (BLUF)

**MOTO-ROGUE** occupies a distinct action-roguelite niche: **high-inertia vehicular drift combat** combined with **modular twin-stick gunplay** and **Spider-Verse / Hi-Fi Rush comic pop-art aesthetics**. Standard twin-stick roguelite conventions fail when transplanted uncritically onto a momentum-governed motorcycle at `265–500+ px/s`.

Across two rounds of multi-agent deep research and adversarial cross-critique, all three specialist tracks converged on **Five Non-Negotiable Ground Truth Laws**:

1. **Zero Dead Drops (Weapon-Adaptive Modifiers):** Every run modifier and item must dynamically adapt its behavior to all 7 weapon archetypes (`pistol`, `machine_gun`, `flamethrower`, `grenade_launcher`, `shotgun`, `railgun`, `arc_coil`). No item may ever act as a silent no-op or net-negative trap.
2. **Bounded Compounding With Hard Guardrails:** Power scaling must transition from flat additive sums (`1 + \sum \Delta`) to **4 distinct multiplicative buckets** (`Base \times GlobalDmg \times Crit/Cond \times TakenVuln`), paired with **per-weapon Proc Coefficients (`0.25`–`1.0`)**, a **1-Hop Proc Chain Rule (`procMask`)**, **Hyperbolic Survivability Curves**, and **Overcrit (`>100%` Crit $\rightarrow$ `3.0x` Super-Crit)**.
3. **Momentum-Preserving Combat Feel ("Juice Without Stutter"):** Hit-sparks (`VFXManager.addHitSpark`) and `0.07s` white flash frames fire on every hit, while **Hit-Stop (`0.035s–0.055s`) is strictly gated to heavy kinetic events** (NOS Rams, Railgun multi-pierces, Explosion chains, Boss kills) with a **`0.45s` global cooldown** so high-RoF proc chains never stutter bike steering.
4. **Vehicular Agency & Fair Telegraphs:** `Spacebar` acts as an active **Powerslide / Handbrake** while turning (`|diff| > 0.25 rad`) to charge Drift Overcharge on demand; **NOS Ramming** acts as a universal battering ram against all non-boss enemies (consuming `+18 NOS` burst on heavy/elite mass `>20.4` rather than punishing the player with self-damage); and all ranged enemies display a **`0.30s` pre-fire telegraph** with a **`0.18s` aim-lock window** so high-speed perpendicular drifts reliably evade fire.
5. **Peripheral-First Combat Readability & Hero-Scale Set 08 UI:** The 720×720 arena enforces a strict **5-Tier Z-Order Hierarchy** where enemy projectiles (`#ff1f4b` + white core + dark outline) always render *above* player VFX, paired with a **Contextual `30px` Bike-Tethered Drift/Lock Arc**, **Combat-Cleared Proximity Auto-Inspect (`<75px`, nearest-winner)**, and **Full-Viewport Set 08 3D Pop-Art Showcases** in the Garage and Shop with live stat-diff badges (`▲ +12% vs Equipped`).

---

## Part 1: Codebase Audit — Critical Bugs & Disconnected Systems To Fix First

Before adding new items or floors, the following verified defects in `moto-rogue` must be resolved:

| ID | File & Lines | Verified Defect (`[FACT]`) | Ground Truth Fix |
| :--- | :--- | :--- | :--- |
| **BUG-01** | [`src/data/weapons.ts`](file:///c:/Users/User/Documents/Antigravity/Games/moto-rogue/src/data/weapons.ts#L212-L275) vs. [`src/data/upgrades.ts`](file:///c:/Users/User/Documents/Antigravity/Games/moto-rogue/src/data/upgrades.ts#L60-L195) | `WEAPON_EVOLUTIONS[w].signatureModName` checks legacy strings (`'Ricochet Rounds'`, `'Hair Trigger'`, `'High Explosive'`, `'Split Chamber'`, `'Piercing Core'`, `'Vampiric Siphon'`), whereas `RUN_MOD_POOL` pushes `'Rubberized Casings'`, `'Hair-Trigger Servo'`, `'Thermobaric Mix'`, `'Twin Barrel Adapter'`, `'Tungsten Sabot'`, and `'Scrap Siphon'`. **Signature mods never trigger weapon evolutions**; players can only evolve via the generic `totalStacks >= 3` fallback. | Key `WEAPON_EVOLUTIONS` by stable `signatureModId` (`'ricochet_mod'`, `'hair_trigger'`, `'high_explosive'`, `'split_chamber'`, `'piercing_core'`, `'vamp_siphon'`) and match both `mod.id` and `mod.name`. |
| **BUG-02** | [`src/systems/combat.ts`](file:///c:/Users/User/Documents/Antigravity/Games/moto-rogue/src/systems/combat.ts#L928) | `Cryo-Jacketed Shells` (`id: 'cryo_rounds'`) checks `player.mods.includes('cryo_rounds')`. `player.mods` is never populated (`main.ts` pushes `mod.name` to `player.items`), making the `-35%` cryo slow **100% dead code**. | Check `player.items.includes('Cryo-Jacketed Shells') \|\| player.mods?.includes('cryo_rounds')` and apply visible cyan frost tint + `slowTimer = 2.0`. |
| **BUG-03** | [`src/data/upgrades.ts`](file:///c:/Users/User/Documents/Antigravity/Games/moto-rogue/src/data/upgrades.ts#L156-L166) & [`src/systems/combat.ts`](file:///c:/Users/User/Documents/Antigravity/Games/moto-rogue/src/systems/combat.ts#L330-L390) | `Smart-Link Guidance` (`id: 'homing_missiles'`) only grants `+20% projSpeedMult` and `+1 pierce`; bullets have zero homing logic in `combat.ts`. | Add gentle forward-cone steering (`1.6 rad/s` max turn rate within a `35°` forward cone, `180px` range) in `updateProjectiles`. |
| **BUG-04** | [`src/systems/combat.ts`](file:///c:/Users/User/Documents/Antigravity/Games/moto-rogue/src/systems/combat.ts#L298) | `grenade_launcher` hardcodes `const shots = 1;`, ignoring `player.multiShot`. Taking `Twin Barrel Adapter` (`split_chamber`: `+1 multiShot, -15% dmgMult`) is a **strictly negative `-15%` damage trap** on Grenade Launcher. | Allow `grenade_launcher` to lob `player.multiShot` shells with slight angular/range spread (`70%` secondary shell damage) so `split_chamber` is a net DPS & AoE buff. |
| **BUG-05** | [`src/render/vfx.ts`](file:///c:/Users/User/Documents/Antigravity/Games/moto-rogue/src/render/vfx.ts#L43) & [`src/render/shaders.ts`](file:///c:/Users/User/Documents/Antigravity/Games/moto-rogue/src/render/shaders.ts) | `VFXManager.addHitSpark()` and `FilterManager.triggerImpactFlash()` are fully implemented in the render pipeline but **never called anywhere in `combat.ts` or `main.ts`**. | Wire `addHitSpark()` + `0.07s` enemy white hit-flash (`en.hitFlashTimer = 0.07`) on every projectile/beam/ram impact, and trigger `triggerImpactFlash()` on heavy kinetic hits. |
| **BUG-06** | [`src/render/stage.ts`](file:///c:/Users/User/Documents/Antigravity/Games/moto-rogue/src/render/stage.ts#L868-L913) | `renderVFX()` draws `enemyBullets` *before* player `beamEffects`, `shockwaves`, and `hitSparks`, allowing player VFX to occlude lethal incoming enemy projectiles. | Reorder `renderVFX()` so `enemyBombs` and `enemyBullets` render **last** on top of all player beams and particles, with a dark `#0a0b10` outer stroke and pure `#ffffff` core. |

---

## Part 2: Track 1 — Stat & Item Interactions, Synergy Math & Buildcraft

### 2.1 Four-Bucket Multiplicative Damage Pipeline
Replace the single flat additive pool (`player.dmgMult += delta`) with **4 orthogonal buckets** that multiply together while summing additively *within* each bucket:

$$\text{FinalHitDmg} = \text{BaseWeaponDmg} \times B_{\text{Global}} \times B_{\text{AttackSpeedConv}} \times B_{\text{Crit/Cond}} \times B_{\text{TargetVuln}}$$

1. **Bucket A — Base & Evolution Scaling ($B_{\text{Base}}$):** Weapon base damage, permanent Garage `Ordnance Calibration` (`+10%/rank`), and Overclock Evolution base multipliers (`+35%` on Evolved Pistol/Railgun).
2. **Bucket B — Global Damage Mods ($B_{\text{Global}}$):** `Hollow-Point Rounds` (`+25%`), `Executioner Optics` (`+32%`), Equipment `dmg` affixes.
3. **Bucket C — Conditional & Crit Multipliers ($B_{\text{Crit/Cond}}$):**
   - `Tire Iron` (`+30%` per stack vs. enemies `>90%` HP — opener burst bucket).
   - **Executes / Finisher Scaling:** `+35%` damage vs. enemies `<30%` HP or afflicted with `2+` statuses.
   - **Overcrit Tiering (`Chrome Lens`):** Each stack grants `+10%` Crit Chance (`2.0x` damage). When Crit Chance exceeds `100%`, excess probability converts into **Tier-2 Super-Crits (`3.0x` damage, `#ff007f` magenta-gold comic popup)**.
4. **Bucket D — Target Vulnerability ($B_{\text{TargetVuln}}$):**
   - **Cryo-Chilled Targets:** Take `+15%` kinetic/explosive shatter damage.
   - **Oil-Soaked / Burn-Afflicted Targets:** Take `+20%` elemental damage.

### 2.2 Weapon-Adaptive Modifiers Matrix (Zero Dead Drops Law)
Every modifier in `RUN_MOD_POOL` and `POWERUP_DROP_POOL` must have a meaningful mechanical translation across all 7 weapons:

| Modifier / Stat | Standard Projectile (`Pistol`, `SMG`, `Shotgun`) | `Flamethrower` (Short Cone + Burn) | `Grenade Launcher` (Lobbed AoE) | `Plasma Railgun` (Hitscan/Pierce Slug) | `Arc Tesla Coil` (Chain Orb) |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **`multiShot` (`+1`)** (`Twin Barrel Adapter`) | `+1` projectile in spread cone | `+1` parallel flame stream & `+25%` cone width | Lobs `+1` secondary cluster mortar (`0.12 rad` spread) | Fires a twin-linked parallel ion beam (`+45%` total beam damage) | Fires `+1` forked orb (`+1` max chain target) |
| **`pierce` (`+1`)** (`Tungsten Sabot`) | Pierces `+1` additional enemy | Flame puffs penetrate `+35%` deeper & ignore Brute frontal armor | Direct hull impact pierces target before detonating (`+25%` blast radius) | Already infinite pierce $\rightarrow$ converts each `+1 pierce` into **`+18%` beam width & `+15%` pierce damage** | Orb pierces `+1` target & chains `+1` extra jump |
| **`bounce` (`+1`)** (`Rubberized Casings`) | Bounces off arena walls/rocks `+1` time (`+20%` ricochet dmg) | Flame puffs reflect off walls & leave a `1.2s` scorching wall patch | **Bouncing Betty:** Grenade bounces once on ground impact, detonating **twice** (`60%` + `100%` blast) | Beam reflects off arena boundary walls `+1` time (`75%` reflected lance dmg) | Orb bounces off walls `+1` time & refreshes chain counter |
| **`blastMult` (`+30%`)** (`Thermobaric Mix`) | Every 4th hit triggers a mini-concussive blast (`28px` radius) | `+30%` Burn DoT tick damage & `+20%` flame puff radius | `+30%` explosion damage & `+25%` blast radius | Railgun slug leaves a detonating plasma wake along its line (`25%` weapon dmg) | Chain arcs trigger a `24px` static shockwave on final jump |
| **`Chrome Lens` (`+10%` Crit)** | `2.0x` Crit on projectile hit | **Burn DoT ticks can Crit (`2.0x`)** + extends Burn duration by `+0.5s` | Direct & AoE blast can Crit (`2.0x`) + `+15%` knockback | Guaranteed weak-point bonus: Crits deal `2.25x` along entire beam | Chain lightning jumps inherit Crit status (`2.0x` across all arcs) |
| **`Smart-Link Guidance`** (`homing_missiles`) | `1.6 rad/s` forward-cone homing (`35°` cone) | Flame puffs curve toward nearest enemy within `140px` | Lobbed grenades magnetize `45px` toward nearest enemy in flight | Widens auto-aim snap assistance cone by `8°` & `+20%` crit dmg | Orb curves `2.2 rad/s` toward enemies & `+30%` chain snap range |

### 2.3 Proc Coefficients, 1-Hop Chains & Hyperbolic Survivability
To prevent high-frequency weapons (`Machine Gun` at `10.5 shots/s`, `Flamethrower` at `11.1 puffs/s`) from making `Pistol`, `Railgun`, and `Grenade Launcher` obsolete on proc builds (`Tesla Capacitor`, `Cryo-Jacketed Shells`):

1. **Weapon Proc Coefficients ($P_w$) & Damage Scaling:**
   - `Pistol`: $P_w = 1.00$
   - `Machine Gun`: $P_w = 0.45$
   - `Flamethrower`: $P_w = 0.35$
   - `Shotgun`: $P_w = 0.30$ per pellet (`6–10` pellets $\rightarrow$ high reliability per blast)
   - `Grenade Launcher`: $P_w = 1.00$ (direct/primary blast)
   - `Plasma Railgun`: $P_w = 1.00$ per pierced enemy
   - `Arc Tesla Coil`: $P_w = 0.75$ primary orb / $0.40$ chain jump
   - **Crucial Scaling Rule:** On-hit procs (`Tesla Capacitor`) scale off **Actual Hit Damage Dealt** ($0.35 \times \text{HitDmg} \times \text{stacks}$), NOT flat base damage, so slow heavy weapons trigger massive lightning arcs while rapid weapons trigger frequent smaller arcs.
2. **1-Hop Proc Chain Rule (`procMask` Bitmask):**
   - Depth-0 weapon hits can trigger Depth-1 item procs (e.g., `Shotgun` $\rightarrow$ `Tesla Capacitor` arc $\rightarrow$ `Cryo` chill).
   - Depth-1 procs can trigger on-kill effects (`Spilled Gasoline` explosion), which can trigger a different item family once, but **no item may ever proc itself recursively** (`procMask & itemBit !== 0`), and chain depth is hard-capped at `Depth <= 2`.
3. **Hyperbolic Survivability & Siphon Scaling:**
   - Replace linear `vampChance` (`Math.min(0.6, vampChance + 0.2)`) with hyperbolic scaling:
     $$P_{\text{siphon}}(v) = \frac{v}{v + 0.50}$$
     Paired with a **`1.0s` internal cooldown per heal** and **Overheal Scrap Conversion** (healing at full Hull spawns `+2 Coins` or grants `+15 NOS`), ensuring Siphon remains valuable even at `100%` HP.

### 2.4 Curated Duo Synergies & Kiss-Curse Modifiers
When the player collects specific 2-item combinations, activate a named **Duo Synergy** (announced via HUD Toast and tracked in `#synergy-list` with a **`0.35s` per-target internal cooldown** and distinct **Player Faction Colors: Cyan `#00f5d4`, Gold `#ffd60a`, Electric Violet `#c77dff`**—never enemy crimson/orange):

| Duo Synergy Name | Required Pair | Mechanical Payoff (With `0.35s` ICD & Safe Faction Palette) |
| :--- | :--- | :--- |
| **THERMAL SHOCK** | `Cryo-Jacketed Shells` + (`Flamethrower` OR `Thermobaric Mix` OR `Spilled Gasoline`) | Hitting a **Chilled** enemy with Fire/Explosion consumes Chill to detonate a **Cyan-Gold Shatter Nova** (`65px` radius, `60%` weapon dmg + `15%` target max HP, capped at `8%` vs. Bosses). |
| **SUPERCONDUCTOR** | `Cryo-Jacketed Shells` + (`Tesla Capacitor` OR `Arc Tesla Coil`) | Lightning arcs jumping to a **Chilled** enemy have **`2.0x` jump range (`220px`)**, `+40%` arc damage, and propagate `1.5s` Chill to every chained target. |
| **VOID VORTEX** | `Magnet Coil` + (`Grenade Launcher` OR `Thermobaric Mix`) | Explosions generate a **Cyan Magnetic Implosion** that pulls enemies within `95px` toward the blast center for `0.35s` before knockback. |
| **JUGGERNAUT OVERDRIVE** | `Titanium Ram Spikes` + `Adrenaline Injector` | NOS Ram kills refund **`+35 NOS` immediately**, trigger a `75px` golden shockwave, and extend graze invulnerability by `+0.25s`. |
| **VOLTAic WAKE** | `Exhaust Afterburner` + `Spilled Gasoline` | Boosting leaves **Blue-Gold Plasma Puddles** (`65%` alpha beneath all actors) that ignite enemies and detonate when struck by player bullets. |

**Kiss-Curse Tradeoff Pedestal Mods (3 New High-Variance Builds):**
- **Glass Cannon Bore (`glass_cannon`):** `+65% Weapon Damage`, `-2 Max Hull HP` (cannot reduce Max HP below `2`).
- **Heavy Ordnance Chamber (`heavy_ordnance`):** `+90% Weapon Damage`, `+45% Knockback & Blast Radius`, `-28% Fire Rate`.
- **Point-Blank Choke (`point_blank`):** `+55% Weapon Damage` and `+2 Projectiles`, `-35% Projectile Lifetime (Range)`.

---

## Part 3: Track 2 — Holistic Gameplay Experience, Vehicular Feel & Encounter Pacing

### 3.1 The 30-Second Core Loop & Momentum-Preserving Juice
Every combat room must deliver a kinetic rhythm of **Read (0–2s) $\rightarrow$ Commit & Powerslide (2–10s) $\rightarrow$ Overcharge Climax (10–18s) $\rightarrow$ Magnetic Vacuum Payoff (18–22s)**:

1. **Immediate Visual/Audio Impact Confirmations:**
   - Every projectile, beam, and ram hit calls `VFXManager.addHitSpark(x, y, color, angle)` and sets `en.hitFlashTimer = 0.07` (rendering a crisp white silhouette flash on the struck enemy).
   - **Momentum-Preserving Hit-Stop Law:** Do **not** freeze the game on ordinary gun hits. Trigger `hitStopTimer = 0.04s` **only** on:
     1. NOS Ram impacts (`updateEnemyCollisions`),
     2. Railgun shots piercing `3+` enemies simultaneously,
     3. Multi-kill explosions (`2+` enemies killed in one frame),
     4. Boss phase transitions / kills (`0.08s`).
     Enforce a strict **`0.45s` global cooldown** between hit-stops so steering and drift timing remain 100% fluid at 60 FPS.

### 3.2 Fixing the Two Vehicular Combat Traps
1. **Active Powerslide (`Spacebar`) & Drift Overcharge (`src/systems/physics.ts`):**
   - *Current Flaw:* `driftCharge` only builds when `|diff| > 0.45 rad` (`physics.ts:L202`), which decays in `<0.1s` because `STEER_LERP_FACTOR = 12` snaps `bikeAngle` to velocity almost instantly.
   - *Ground Truth Mechanics:* Holding `Spacebar` while steering (`|diff| > 0.22 rad`) engages an **Active Powerslide**:
     - Temporarily lowers angular snap (`STEER_LERP_FACTOR` from `12` to `4.5`) and lateral traction so the bike carves a wide, controllable arc while firing freely with the mouse.
     - Builds `driftCharge` at `1.6x/sec` with continuous twin tire-skid ribbons and cyan/gold sparks.
     - Releasing `Spacebar` at `driftCharge >= 0.50` triggers **DRIFT OVERCHARGE** (`1.5s` of `+22%` speed, `+25%` fire rate, and a `75px` shockwave at `100%` charge).
2. **Universal NOS Battering Ram (`src/systems/combat.ts:L1175`):**
   - *Current Flaw:* `updateEnemyCollisions` disables NOS Ramming whenever `enemyMass > 20.4`, causing players who boost into a Brute (`22`) or Elite (`21.25–25`) to take `-1 Hull HP` self-damage and `0.3s` stun—invalidating `Titanium Ram Spikes` on Floors 3–6.
   - *Ground Truth Mechanics:*
     - While `player.isBoosting` (`Shift` + moving with `NOS > 0`), the bike is a **Universal Battering Ram** against **all non-boss enemies** (`swarmer`, `turret`, `charger`, `trishot`, `bomber`, `brute`, `splitter`, `sniper`, `pyro`, including Elites).
     - Ramming a **Heavy/Elite enemy (`enemyMass > 20.4`)** deals full NOS Ram damage (`(28 + 14 * floor) * dmgMult * (1 + 0.45 * spikes)`), applies heavy knockback, grants **`0.25s` graze invulnerability** so the player never takes contact damage on the follow-through, and consumes an extra **`18 NOS` burst** on impact so heavy Brutes cannot be infinitely stun-locked for free.

### 3.3 Fair Enemy Telegraphs & Curated Encounter Templates
1. **Universal Pre-Fire Telegraph & Aim-Lock Window (`src/systems/enemyAI.ts`):**
   - During the final **`0.30s` before firing**, ranged enemies (`turret`, `trishot`, `bomber`, `sniper`, `pyro`) render a high-contrast **crimson-and-white growing muzzle ring** (`#ff1f4b` outer ring collapsing toward a `#ffffff` core).
   - During the final **`0.18s` before projectile spawn**, **lock `en.angle`** so enemies lead shots toward the player's current vector rather than tracking with infinite angular velocity on the exact frame of release. This guarantees that a perpendicular drift or NOS burst reliably dodges incoming fire.
2. **Curated Encounter Templates (`src/systems/mapGen.ts`):**
   - Replace pure uniform random enemy rolling with **Role-Budgeted Encounter Archetypes**:
     - *Crossfire Alley:* `2–3` corner `Turrets`/`Snipers` + `4–6` central `Swarmers`.
     - *Demolition Derby:* `2–3` `Chargers` + `1–2` `Brutes` + `2` Explosive Barrels.
     - *Zone Control:* `2` `Bombers` + `2` `Pyros` + `3` `Trishot` flankers.
   - **Hard Cap on Simultaneous Snipers/Turrets:** Maximum `3` ranged zoning units active at once on Floors 1–3 (`4` on Floors 4–6) to prevent unavoidable hitscan/bullet-curtain overlap.
3. **Floor Scaling & Choice-of-2 Pedestals:**
   - Flatten the exponential enemy HP wall from `1.55^(floor - 1)` (`8.13x` HP on Floor 6) to **`1.42^(floor - 1)` for regular enemies (`5.77x` on Floor 6)** and **`1.48^(floor - 1)` for Elites/Bosses (`7.10x` on Floor 6)** so skill-based builds remain viable alongside god-roll synergy runs.
   - **Choice-of-2 Treasure Rooms (`wp` in `mapGen.ts`):** Spawn **2 distinct pedestals (`A` OR `B`)** in Treasure Rooms; claiming one despawns the other in a comic smoke puff, turning every Treasure Room into an active build-crafting decision.
   - **Guaranteed Boss Dual-Reward:** Every Boss kill drops **both** a Power-Up Drop (`POWERUP_DROP_POOL`) and a Rarity-Boosted Garage Equipment Piece, plus banking `+20%` of unspent Run Coins as bonus Scrap on Floor 6 victory.

---

## Part 4: Track 3 — Design, Visual Hierarchy & Set 08 UI/UX Architecture

### 4.1 5-Tier Arena Z-Order & Threat-First Contrast Hierarchy
To maintain 100% peripheral readability at `500 px/s`, the PixiJS arena (`src/render/stage.ts`) enforces five strict visual planes:

| Plane | Z-Layer | Visual Treatment & Contrast Rules |
| :--- | :--- | :--- |
| **Tier 1 (Highest)** | **Lethal Threats** (`enemyBullets`, `enemyBombs`, Sniper laser sights, Boss telegraphs) | Rendered **LAST** in `vfxLayer` (above all player beams/particles). Mandatory **`2.5px` `#0a0b10` ink outline**, **`#ff1f4b` crimson/magenta body**, and **pure `#ffffff` center core**. Reserved exclusively for enemy hazards. |
| **Tier 2** | **Player & Enemy Actors** (`vehicleLayer` +Contextual Bike Arc) | Crisp 2D top-down comic pop-art (`z = 0`), `#0a0b10` heavy comic outlines, `0.07s` white hit-flash on damage, and `0.30s` muzzle-charge rings on enemies. |
| **Tier 3** | **Interactive Pickups & Obstacles** (`pickupLayer`, `obstacleLayer`) | Floating Set 08 / vector icons with rarity rings and clear collision silhouettes. |
| **Tier 4** | **Player Projectiles, Beams & Synergies** (`bulletLayer`, player VFX) | Strictly **Cool / Gold / Violet Faction Palette** (`#00f5d4` cyan, `#ffd60a` gold, `#c77dff` electric violet, `#4cc9f0` sky blue). Capped at `<=0.80` alpha on large AoE novas so enemy bullets on Tier 1 always punch through. |
| **Tier 5 (Lowest)** | **Arena Floor, Biome Zones & Tire Skids** (`bgLayer`, `skidLayer`) | Desaturated dark value (`L < 22%`), subtle Ben-Day halftone dot matrices, and `<0.65` alpha on ground puddles (`Napalm Slicks`, `Oil Slicks`). |

### 4.2 Peripheral Combat Telemetry (Zero-Eye-Travel HUD)
1. **Contextual `30px` Bike-Tethered Drift & NOS Arc (`src/render/stage.ts`):**
   - Drawn directly beneath the player bike in `vfxLayer` at radius `30px`:
     - **Hidden (`alpha = 0`) during normal cruising** so the bike sprite stays 100% clean.
     - **Fades in (`alpha = 0.85`) during active Drift (`driftCharge > 0.05`)**, filling clockwise from `#ffd60a` (50% threshold tick) to `#00f5d4` (100% Overcharge ready).
     - **Flashes crimson (`#ff1f4b`) when `player.nosLock === true`** (`NOS OVERHEAT` until `25%` recovery).
2. **Low-Hull (`<=34%`) Screen-Edge Vignette:**
   - Pulses a subtle crimson comic-halftone vignette around `#game-wrapper` when `player.hp / player.maxHp <= 0.34`, alerting the player in peripheral vision without looking away from the bike.

### 4.3 Combat-Cleared Proximity Auto-Inspect & Synergy Badges
1. **Combat-Cleared Auto-Tooltip (`src/main.ts` & `src/ui/tooltip.ts`):**
   - When **`room.cleared === true`** (zero active enemies) and the bike drives within **`75px`** of any pedestal, weapon crate, or Hub NPC, automatically open `#tooltip` anchored **`48px` above the pickup** for the **single nearest pickup (`argmin` distance)**—never covering the player bike and never popping up mid-combat while `room.enemies.length > 0`.
2. **Dynamic Synergy & Kiss-Curse Callout Pills in `#tooltip` & `ShopModal`:**
   - **Evolution Badge:** If a pedestal mod or weapon completes an Overclock Evolution, render a gold badge: `⚡ EVOLVES [WEAPON] ➔ [EVOLVED NAME]`.
   - **Duo Synergy Badge:** If an item completes a Duo Synergy with an already-owned item, render a cyan badge: `🔗 SYNERGY: [SYNERGY NAME]`.
   - **Choice-of-2 Pedestal Tag:** In Treasure Rooms with twin pedestals, display `⚖️ CHOICE PEDESTAL (OTHER DESPAWNS)`.
   - **Kiss-Curse Stat Pills:** Render positive `statDeltas` as green pills (`+1 MULTI-SHOT`) and negative `statDeltas` as crimson pills (`-15% DAMAGE`).

### 4.4 Full-Viewport Set 08 Garage & Shop UI Standards
1. **High-Clarity Set 08 3D Asset Scale (`src/styles/garage.css` & `src/ui/garage.ts`):**
   - **Garage Modal Frame:** `min(1840px, 97vw) × min(980px, 95vh)` utilizing the full widescreen viewport.
   - **Center Hydraulic Lift Bay:** Unconstrained responsive `#bike-canvas` (`width: 100% !important; height: 100% !important`) rendering the **Set 08 3D Halftone Comic Pop-Art Motorcycle** at hero scale (`~500px` wide) with dynamic **Livery Rim-Glow & Ben-Day Halftone Aura** matching the selected paint livery (`KANEDA RED`, `CYBER NEON`, `VALHALLA GOLD`, `NIGHT STEALTH`, `TOXIC HAZARD`) and live DOM-aligned connector lines to all 6 slots.
   - **6 Equipment Slot Cards (`.eq-slot`):** `144px × 134px` cards with **`88px × 88px` Set 08 3D icons**, visible item names, and rarity glow borders.
   - **Armory Weapon Cards (`.gx-weapon-art`):** `118px × 74px` showcase frames (`112px × 70px` Set 08 3D weapon renders—`4.4x` larger area than legacy icons).
   - **Stash Inventory Grid (`.stash-item`):** `76px × 66px` cards with **`52px × 52px` Set 08 3D icons** across a 9×2 grid.
2. **Forgiving Destructive Flows & Live Affordability Feedback:**
   - Pass `player.coins` into `ShopModal.open(pickup, onConfirm, onCancel, player.coins)` so unaffordable items immediately show the `.insufficient` state (`NOT ENOUGH COINS` + disabled Buy button).
   - Require a 2-step confirmation click (`"CONFIRM RESET?"` for `3.0s`) on `#btn-reset-save` before wiping permanent save data.

---

## Part 5: Prioritized Implementation Roadmap

| Priority Tier | Scope & Target Files | Verification Gate |
| :--- | :--- | :--- |
| **Phase A — Core Bug Fixes & Set 08 UI Completion** | 1. Fix `signatureModName` / `signatureModId` evolution matching in `src/data/weapons.ts`.<br>2. Fix `cryo_rounds` slow application & `homing_missiles` gentle curve in `src/systems/combat.ts`.<br>3. Fix `grenade_launcher` `multiShot` scaling in `src/systems/combat.ts`.<br>4. Pass `player.coins` to `shopModal.open` in `src/main.ts` & remove `fitAll()` inline `260x165` clamp on `#bike-canvas`. | Unit tests in `tests/unit/data_models.test.ts`, `tests/unit/systems_combat.test.ts`, and visual verification of `preview_set08_garage.png`. |
| **Phase B — Vehicular Feel, Hit Sparks & Threat Z-Order** | 1. Wire `addHitSpark()` + `0.07s` enemy hit-flash + gated `0.04s` heavy-impact hit-stop (`0.45s` ICD).<br>2. Enable active `Spacebar` powerslide (`STEER_LERP_FACTOR = 4.5`) & universal NOS Ramming (`+18 NOS` on heavy mass `>20.4`).<br>3. Reorder `renderVFX()` in `src/render/stage.ts` so `enemyBullets` & `enemyBombs` draw on top of all player VFX + add contextual `30px` Bike Drift/Lock Arc.<br>4. Add `0.30s` enemy pre-fire muzzle ring & `0.18s` aim-lock window in `src/systems/enemyAI.ts`. | Unit tests in `tests/unit/systems_physics.test.ts`, `tests/unit/systems_enemies.test.ts`, and `tests/unit/render_ui.test.ts`. |
| **Phase C — Synergy Matrix, Choice Pedestals & Auto-Inspect** | 1. Implement 4-bucket damage math, Overcrit (`>100%` $\rightarrow$ `3.0x`), weapon proc coefficients, and 1-hop `procMask`.<br>2. Implement the 5 Curated Duo Synergies (`Thermal Shock`, `Superconductor`, `Void Vortex`, `Juggernaut Overdrive`, `Voltaic Wake`) + 3 Kiss-Curse Mods.<br>3. Add Choice-of-2 Treasure Pedestals, `1.42^(f-1)` regular HP curve, and Combat-Cleared Proximity Auto-Inspect (`<75px`) with Evolution/Synergy badges. | E2E synergy & balance tests in `tests/e2e/tier3_combinations.test.ts` and `tests/e2e/tier5_playability.test.ts`. |


---

## Part 6: Studio Expansion Amendment — The 5 Novel Ready-to-Ship Gameplay Pillars

Following the Wave-1 Deep Studio Research Audit (`Lead Game Design Researcher`), this Ground Truth document is formally amended with **5 Novel Gameplay & UX Pillars** that elevate *Deadly Delivery (Moto-Rogue)* from a solid prototype into a cohesive, ship-ready vehicular action roguelike:

### 6.1 Functional Outlaw Style Rank Engine (`D` $\rightarrow$ `SSS`)
- **Problem Diagnosed**: `src/ui/hud.ts` rendered a static `#style-badge` (`D` through `SSS`), while `styleScore` was never updated in `src/main.ts` (`[FACT: src/ui/hud.ts:L1166-L1190]`).
- **Studio Specification**:
  - Continuous `player.styleScore` (`0` to `100`) and `player.styleRank` (`D`, `C`, `B`, `A`, `S`, `SS`, `SSS`) updated every frame during active combat.
  - **Style Builders**: High-speed maneuvering (`+2.2/s`), active powersliding (`+6.5/s`), projectile hits (`+2.5`), enemy kills (`+9`), NOS Battering Ram impacts (`+16`), and Near-Miss Bullet Grazes (`+12`).
  - **Decay & Hull Fracture**: Decays at `-6.0/s` after a `2.2s` grace timer (`styleTimer`) while unengaged in combat; taking Hull damage fractures `styleScore` by `-35`.
  - **Mechanical Payoff (Adrenaline Multipliers)**:
    - Rank `B` (`30+`): `+6%` Fire Rate & Speed, `+15%` Coin/Toolbox Drop Luck.
    - Rank `A` (`50+`): `+10%` Fire Rate & Speed, `+25%` Luck.
    - Rank `S` (`70+`): `+15%` Fire Rate & Speed, `+35%` Luck, `+1.5/s` passive NOS regen.
    - Rank `SS` (`85+`): `+20%` Fire Rate & Speed, `+45%` Luck, `+2.5/s` passive NOS regen.
    - Rank `SSS` (`95+`): `+25%` Fire Rate & Speed, `+55%` Luck, `+4.0/s` passive NOS regen.

### 6.2 28px Near-Miss Bullet Graze & Active `Spacebar` Powerslide
- **Near-Miss Bullet Graze**:
  - Passing within `player.radius + eb.r + 24px` (`~28px` graze skirt) of a live `EnemyBullet` without taking collision damage flags `eb.grazed = true`.
  - **Reward**: Instant `+8 NOS`, `+12 Style`, a cyan/white electric tether spark between projectile and chassis, and a throttled floating callout (`⚡ GRAZE! +8 NOS`).
- **Active `Spacebar` Handbrake Powerslide**:
  - Holding `Spacebar` (`player.spacePowerslide = true`) while steering engages a deliberate handbrake drift that multiplies `driftCharge` buildup (`2.5x` charge rate) even below top speed.
  - Releasing `Spacebar` once `driftCharge >= 0.50` (or auto-triggering at `>= 0.85`) detonates an immediate **Drift Overcharge Shockwave** (`8 radial bullets` + `2.5s` of `+35%` fire rate & `+18%` speed).

### 6.3 Boss Phase-2 "OVERDRIVE ENRAGE" Transitions (`<= 50% HP`)
- **Problem Diagnosed**: Bosses scaled linearly from `100%` to `0%` HP with zero phase transition (`[FACT: src/systems/enemyAI.ts:L113-L198]`).
- **Studio Specification**:
  - Crossing `hp <= maxHp * 0.5` triggers `enraged = true` once per boss encounter.
  - **Visual & Tactical Escalation**: Triggers a one-time `0.08s` dramatic hit-stop, screen shake (`14`), full-width HUD warning banner (`⚠️ PHASE II OVERDRIVE // LIMITER RELEASED!`), pulsing magenta/crimson comic halftone aura around the boss chassis, `+30%` boss speed, and `1.4x` faster attack cadence with multi-projectile patterns.

### 6.4 Outlaw Sanctuary Hub Depth & Treasure Choice-of-2 Pedestals
- **Doc's Cyber-Codex Scanner Fix & Scaling (`src/main.ts:L935`)**:
  - Activating Doc's clinic now properly sets `player.scannerBuff = true` (persisting across `launch`), lighting up the HUD `#scanner-buff-pill` (`+15% CRIT`) and scaling with `metaSave.bossesSlain`.
- **Valkyrie's Bounty Board Heat Multipliers**:
  - Each stack of `bountyHeat` (`0–3`) grants `+25%` Scrap drops, `+15%` Coin drops, and boosts floor item rarity rolls.
- **Treasure Room Choice-of-2 Pedestals (`enableChoicePedestalsInTreasureRooms`)**:
  - Treasure rooms in active runs spawn two linked pedestals (`choiceGroup`): **Pedestal A (Standard Run Mod)** vs. **Pedestal B (High-Voltage Kiss-Curse Mod: `Glass Cannon`, `Heavy Ordnance`, `Point-Blank Protocol`, `Overclocked Core`)** joined by a pulsing gold/magenta decision tether. Picking one dissolves the sibling with a comic `"CHOICE LOCKED!"` callout.

### 6.5 Arcade Killstreak Announcer, Low-Hull Vignette, Gated Hit-Stop & Combat-Cleared Auto-Inspect
- **Arcade Killstreak Combo Announcer**: Multi-kills within a `3.2s` rolling window trigger comic callouts (`DOUBLE TAP!` at `3`, `🔥 RAMPAGE! +10 NOS` at `5`, `⚡ ROADKILL OVERDRIVE!` at `8`, `☠️ VALHALLA UNSTOPPABLE!!` at `12+`).
- **Gated Heavy-Impact Hit-Stop (`0.45s` ICD)**: Micro-freeze (`0.04s`) only fires on heavy kinetic events (NOS Battering Ram kills, Grenade/Barrel/Thermal Shock explosions, Boss Phase/Kill) with a `0.45s` global cooldown so automatic weapons (`smg`, `laser`) never stutter frame pacing.
- **Low-Hull Peripheral Vignette**: Toggles `.is-low-hull` on `#game-wrapper` whenever `player.hp / player.maxHp <= 0.34`.
- **Combat-Cleared Proximity Auto-Inspect (`< 75px`)**: When `room.cleared === true` and no modal is open, approaching within `75px` of any ground pickup automatically pops open the rich inspection tooltip (`#tooltip`) anchored cleanly in world-to-screen coordinates without requiring mouse hover.
