/**
 * MOTO-ROGUE: HUD & Sidebar Controller
 *
 * Implements:
 * 1. Semicircular Fuel Gauge canvas with HP needle and low-fuel jitter
 *    (legacy; the canvas is hidden by the anime HUD, math helpers stay exported).
 * 2. Isometric 2.5D tilted diamond floor minimap canvas (neon yellow/cyan/magenta palette).
 * 3. Anime fighting-game overlay HUD: hexagonal rider portrait, comic ink splash,
 *    segmented HULL / NOS meters with LV. badge, high-fidelity cel-shaded weapon deck,
 *    and die-cut vinyl sticker badges for power-ups & run mods.
 * 4. Top-spanning Boss Health Bar (#boss-hud) with delayed damage-lag bar.
 * 5. Guilty Gear / Persona 5 style Boss Room Entry Intro Banner (#boss-intro-banner).
 */

import {
  PlayerState,
  Dungeon,
  WeaponId,
  DropItemId,
  Boss
} from '../types/game';

import { WEAPONS } from '../data/weapons';
import { DROP_ITEMS, RUN_MOD_POOL } from '../data/upgrades';
import {
  WEAPON_HI_FI_SVG,
  DROP_ITEM_HI_FI_SVG,
  getModIconSvg
} from './icons';

export interface MinimapCoord {
  rx: number;
  ry: number;
  cell: number;
  visible: boolean;
}

/**
 * Pure calculation: determines if fuel is at or below the low threshold (<= 34%).
 */
export function isLowFuel(hp: number, maxHp: number): boolean {
  if (maxHp <= 0) return true;
  return (hp / maxHp) <= 0.34;
}

/**
 * Pure calculation: computes needle angle in radians for fuel gauge.
 * Angle ranges from PI (Empty) to 2*PI (Full).
 */
export function calcNeedleAngle(
  hp: number,
  maxHp: number,
  timestampMs: number = 0
): { angle: number; frac: number; isLow: boolean } {
  const frac = maxHp > 0 ? Math.max(0, Math.min(1, hp / maxHp)) : 0;
  const isLow = isLowFuel(hp, maxHp);
  const wobble = isLow ? Math.sin(timestampMs / 70) * 0.03 : 0;
  const angle = Math.PI + frac * Math.PI + wobble;
  return { angle, frac, isLow };
}

/**
 * Pure calculation: maps room grid coordinates to minimap canvas screen coordinates.
 * Kept with exact signature for backward compatibility.
 */
export function calcMinimapRoomCoords(
  roomX: number,
  roomY: number,
  curX: number,
  curY: number,
  mapWidth: number = 240,
  mapHeight: number = 145,
  cellSize: number = 18,
  gap: number = 3
): MinimapCoord {
  const step = cellSize + gap;
  const cx = mapWidth / 2;
  const cy = mapHeight / 2;
  const rx = cx + (roomX - curX) * step - cellSize / 2;
  const ry = cy + (roomY - curY) * step - cellSize / 2;
  const visible = !(rx < 2 || rx > mapWidth - cellSize - 2 || ry < 2 || ry > mapHeight - cellSize - 2);
  return { rx, ry, cell: cellSize, visible };
}

/** Short card labels matching anime fighting-game HUD mockup (all uppercase). */
const WEAPON_CARD_LABEL: Record<WeaponId, string> = {
  pistol: 'PISTOL',
  machine_gun: 'SMG',
  flamethrower: 'FLAMETHROWER',
  grenade_launcher: 'GRENADE LAUNCHER',
  shotgun: 'SHOTGUN',
  railgun: 'RAILGUN',
  arc_coil: 'TESLA COIL'
};

const LOCK_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7zm2 0h4V5a2 2 0 0 0-4 0z"/></svg>';

/** Boss metadata & custom cel-shaded vehicle/mech emblem SVGs by bossVariant (0..5) */
interface BossMetaProfile {
  subtitle: string;
  accent: string;
  svg: string;
}

const BOSS_META_PROFILES: Record<number, BossMetaProfile> = {
  0: {
    subtitle: 'THE RUSTYARD JUGGERNAUT — SHRAPNEL NOVA & RAM CHARGE',
    accent: '#ff4d6d',
    svg: `<svg viewBox="0 0 140 100" aria-hidden="true" focusable="false">
      <!-- Spiked Dozer-Rig Juggernaut -->
      <path d="M12 68 L28 32 L112 32 L128 68 L116 86 L24 86 Z" fill="#3a1018" stroke="#0a0b10" stroke-width="4" stroke-linejoin="round"/>
      <!-- Twin Heavy Treads -->
      <rect x="8" y="56" width="22" height="34" rx="5" fill="#1e202b" stroke="#0a0b10" stroke-width="3.5"/>
      <rect x="110" y="56" width="22" height="34" rx="5" fill="#1e202b" stroke="#0a0b10" stroke-width="3.5"/>
      <!-- Armored Hull & Hazard Plow -->
      <path d="M24 62 L116 62 L106 84 L34 84 Z" fill="#ff2a4b" stroke="#0a0b10" stroke-width="3.5" stroke-linejoin="round"/>
      <path d="M32 68 L42 68 L36 80 L26 80 Z M56 68 L66 68 L60 80 L50 80 Z M80 68 L90 68 L84 80 L74 80 Z M102 68 L112 68 L106 80 L96 80 Z" fill="#ffd60a"/>
      <!-- Front Ram Spikes -->
      <path d="M32 84 L26 98 L40 84 Z M55 84 L52 99 L64 84 Z M76 84 L88 99 L85 84 Z M100 84 L114 98 L108 84 Z" fill="#e0e6f5" stroke="#0a0b10" stroke-width="2.5" stroke-linejoin="round"/>
      <!-- Central Supercharged Skull Core & Rotary Cannons -->
      <circle cx="70" cy="44" r="20" fill="#232634" stroke="#0a0b10" stroke-width="3.5"/>
      <circle cx="70" cy="44" r="12" fill="#ff9f1c" stroke="#0a0b10" stroke-width="2.5"/>
      <path d="M62 40 L67 45 L62 49 M78 40 L73 45 L78 49" stroke="#0a0b10" stroke-width="3" stroke-linecap="round" fill="none"/>
      <rect x="34" y="16" width="12" height="28" fill="#6c758c" stroke="#0a0b10" stroke-width="3"/>
      <rect x="94" y="16" width="12" height="28" fill="#6c758c" stroke="#0a0b10" stroke-width="3"/>
    </svg>`
  },
  1: {
    subtitle: 'ARMORED ARTILLERY CRAWLER — NAPALM MORTARS & SHOCKWAVE',
    accent: '#ff9f1c',
    svg: `<svg viewBox="0 0 140 100" aria-hidden="true" focusable="false">
      <!-- Siege Behemoth Hexagonal Tank Chassis -->
      <polygon points="30,18 110,18 130,52 110,86 30,86 10,52" fill="#2b2118" stroke="#0a0b10" stroke-width="4" stroke-linejoin="round"/>
      <polygon points="36,26 104,26 120,52 104,78 36,78 20,52" fill="#d97706" stroke="#0a0b10" stroke-width="3.2" stroke-linejoin="round"/>
      <!-- Twin Heavy Siege Mortar Tubes -->
      <rect x="32" y="8" width="20" height="36" rx="4" fill="#4f566b" stroke="#0a0b10" stroke-width="3.2"/>
      <rect x="88" y="8" width="20" height="36" rx="4" fill="#4f566b" stroke="#0a0b10" stroke-width="3.2"/>
      <ellipse cx="42" cy="12" rx="7" ry="3.5" fill="#ff5400"/>
      <ellipse cx="98" cy="12" rx="7" ry="3.5" fill="#ff5400"/>
      <!-- Reactive Armor Plates & Core Turret -->
      <circle cx="70" cy="54" r="22" fill="#1e2230" stroke="#0a0b10" stroke-width="3.5"/>
      <circle cx="70" cy="54" r="11" fill="#ffd60a" stroke="#0a0b10" stroke-width="2.5"/>
      <path d="M54 54 H86 M70 38 V70" stroke="#0a0b10" stroke-width="3"/>
    </svg>`
  },
  2: {
    subtitle: 'CYBER-VALKYRIE INTERCEPTOR — SOLAR SPREAD & PLASMA SWEEP',
    accent: '#c77dff',
    svg: `<svg viewBox="0 0 140 100" aria-hidden="true" focusable="false">
      <!-- Overlord Helion Swept Cyber-Wings -->
      <path d="M70 8 L134 38 L108 88 L84 68 L70 94 L56 68 L32 88 L6 38 Z" fill="#3c1654" stroke="#0a0b10" stroke-width="4" stroke-linejoin="round"/>
      <path d="M70 16 L120 40 L102 74 L82 58 L70 82 L58 58 L38 74 L20 40 Z" fill="#9d4edd" stroke="#0a0b10" stroke-width="3" stroke-linejoin="round"/>
      <!-- Glowing Cyan / Gold Energy Blades -->
      <path d="M18 42 L50 28 L42 54 Z M122 42 L90 28 L98 54 Z" fill="#00f5d4" stroke="#0a0b10" stroke-width="2.5"/>
      <!-- Helion Solar Core -->
      <circle cx="70" cy="48" r="16" fill="#ffd60a" stroke="#0a0b10" stroke-width="3.5"/>
      <circle cx="70" cy="48" r="7" fill="#ffffff"/>
    </svg>`
  },
  3: {
    subtitle: 'SUB-ZERO DREADNOUGHT — FROST TURBINES & SHATTER LANCE',
    accent: '#00f5d4',
    svg: `<svg viewBox="0 0 140 100" aria-hidden="true" focusable="false">
      <path d="M20 50 L48 16 L92 16 L120 50 L96 86 L44 86 Z" fill="#0b3948" stroke="#0a0b10" stroke-width="4" stroke-linejoin="round"/>
      <path d="M32 50 L54 24 L86 24 L108 50 L88 78 L52 78 Z" fill="#00bbf9" stroke="#0a0b10" stroke-width="3" stroke-linejoin="round"/>
      <polygon points="70,12 84,48 70,88 56,48" fill="#e0fbfc" stroke="#0a0b10" stroke-width="3"/>
      <circle cx="70" cy="48" r="10" fill="#00f5d4" stroke="#0a0b10" stroke-width="2.5"/>
    </svg>`
  },
  4: {
    subtitle: 'HIGH-VOLTAGE HEX-MECH — TESLA PYLONS & ARC MATRIX',
    accent: '#ffd60a',
    svg: `<svg viewBox="0 0 140 100" aria-hidden="true" focusable="false">
      <path d="M12 24 L42 42 M128 24 L98 42 M10 76 L42 58 M130 76 L98 58" stroke="#ffd60a" stroke-width="6" stroke-linecap="round"/>
      <polygon points="45,20 95,20 112,50 95,80 45,80 28,50" fill="#2d2342" stroke="#0a0b10" stroke-width="4" stroke-linejoin="round"/>
      <circle cx="52" cy="48" r="12" fill="#7bdff2" stroke="#0a0b10" stroke-width="3"/>
      <circle cx="88" cy="48" r="12" fill="#7bdff2" stroke="#0a0b10" stroke-width="3"/>
      <path d="M52 48 L64 36 L76 60 L88 48" fill="none" stroke="#ffd60a" stroke-width="3.5" stroke-linejoin="round"/>
    </svg>`
  },
  5: {
    subtitle: 'TWIN-REACTOR DOOM CHOPPER — HELLFIRE NOVA & ORBITAL BEAM',
    accent: '#ff2a4b',
    svg: `<svg viewBox="0 0 140 100" aria-hidden="true" focusable="false">
      <path d="M8 48 L38 14 L102 14 L132 48 L104 86 L36 86 Z" fill="#2b0912" stroke="#0a0b10" stroke-width="4" stroke-linejoin="round"/>
      <path d="M22 48 L46 22 L94 22 L118 48 L96 76 L44 76 Z" fill="#e5203a" stroke="#0a0b10" stroke-width="3" stroke-linejoin="round"/>
      <circle cx="48" cy="50" r="14" fill="#ff9f1c" stroke="#0a0b10" stroke-width="3"/>
      <circle cx="92" cy="50" r="14" fill="#ff9f1c" stroke="#0a0b10" stroke-width="3"/>
      <polygon points="70,18 82,50 70,82 58,50" fill="#ffd60a" stroke="#0a0b10" stroke-width="3"/>
    </svg>`
  }
};

function getBossProfile(boss: Boss): BossMetaProfile {
  const variant = typeof boss.bossVariant === 'number' ? boss.bossVariant : 0;
  if (BOSS_META_PROFILES[variant]) return BOSS_META_PROFILES[variant];
  const upper = (boss.name || '').toUpperCase();
  if (upper.includes('BEHEMOTH')) return BOSS_META_PROFILES[1];
  if (upper.includes('HELION')) return BOSS_META_PROFILES[2];
  return BOSS_META_PROFILES[0];
}

export class HUDController {
  private fuelGaugeCanvas: HTMLCanvasElement | null = null;
  private fuelGaugeCtx: CanvasRenderingContext2D | null = null;

  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapCtx: CanvasRenderingContext2D | null = null;

  private onSelectWeapon?: (id: WeaponId) => void;

  /** Last player reference passed to updateSidebar; used by the per-frame NOS sync loop. */
  private trackedPlayer: PlayerState | null = null;
  private nosLoopStarted = false;
  private lastNosKey = '';
  private lastNosValue = -1;
  private lastHullMax = -1;

  /** Boss Intro Banner state */
  private bossIntroActive = false;
  private bossIntroTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private bossIntroDismissHandler: ((e: Event) => void) | null = null;

  constructor(callbacks?: { onSelectWeapon?: (id: WeaponId) => void }) {
    this.onSelectWeapon = callbacks?.onSelectWeapon;
    if (typeof document !== 'undefined') {
      this.fuelGaugeCanvas = document.getElementById('fuel-gauge') as HTMLCanvasElement | null;
      if (this.fuelGaugeCanvas) {
        this.fuelGaugeCtx = this.fuelGaugeCanvas.getContext('2d');
      }

      this.minimapCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement | null;
      if (this.minimapCanvas) {
        this.minimapCtx = this.minimapCanvas.getContext('2d');
      }
    }
  }

  /**
   * Draws the semicircular fuel gauge dial with needle tracking Hull HP.
   */
  public drawFuelGauge(hp: number, maxHp: number, timestampMs: number = performance.now()): void {
    if (!this.fuelGaugeCanvas || !this.fuelGaugeCtx) return;
    const g = this.fuelGaugeCtx;
    const gc = this.fuelGaugeCanvas;
    const cw = (gc as any)._lw || 240;
    const ch = (gc as any)._lh || 120;

    const scaleX = gc.width / cw;
    const scaleY = gc.height / ch;
    g.setTransform(scaleX, 0, 0, scaleY, 0, 0);

    const cx = cw / 2;
    const cy = ch - 14;
    const r = 92;

    const { angle: na, frac, isLow } = calcNeedleAngle(hp, maxHp, timestampMs);

    g.clearRect(0, 0, cw, ch);

    // Bezel & background dial face
    g.beginPath();
    g.arc(cx, cy, r + 8, Math.PI, 0);
    g.closePath();
    g.fillStyle = '#2a2b36';
    g.fill();
    g.strokeStyle = '#adb5bd';
    g.lineWidth = 3;
    g.stroke();

    g.beginPath();
    g.arc(cx, cy, r, Math.PI, 0);
    g.closePath();
    g.fillStyle = '#0e0f14';
    g.fill();

    // Colored arc: red low -> amber middle -> green full
    const grad = g.createLinearGradient(cx - r, 0, cx + r, 0);
    grad.addColorStop(0, '#e63946');
    grad.addColorStop(0.35, '#ff9f1c');
    grad.addColorStop(1, '#06d6a0');

    g.beginPath();
    g.arc(cx, cy, r - 10, Math.PI, Math.PI + Math.PI * frac);
    g.strokeStyle = grad;
    g.lineWidth = 8;
    g.stroke();

    // Tick marks: one per Max HP
    g.strokeStyle = '#cfd3dc';
    g.lineWidth = 2;
    const safeMaxHp = Math.max(1, maxHp);
    for (let i = 0; i <= safeMaxHp; i++) {
      const a = Math.PI + (i / safeMaxHp) * Math.PI;
      const major = i === 0 || i === safeMaxHp || i * 2 === safeMaxHp;
      const r1 = r - (major ? 24 : 20);
      const r2 = r - 14;
      g.beginPath();
      g.moveTo(cx + Math.cos(a) * r1, cy + Math.sin(a) * r1);
      g.lineTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
      g.stroke();
    }

    // Fuel Labels: E (empty), F (full), Pump icon
    g.fillStyle = '#e63946';
    g.font = 'bold 16px sans-serif';
    g.textAlign = 'center';
    g.fillText('E', cx - r + 26, cy - 8);

    g.fillStyle = '#06d6a0';
    g.fillText('F', cx + r - 26, cy - 8);

    g.fillStyle = '#ffd166';
    g.font = '15px sans-serif';
    g.fillText('⛽', cx, cy - 48);

    // Animated Needle with Low Fuel Jitter
    g.strokeStyle = isLow ? '#ff4d6d' : '#ff6b2b';
    g.lineWidth = 3;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + Math.cos(na) * (r - 16), cy + Math.sin(na) * (r - 16));
    g.stroke();

    // Center pivot rivet
    g.fillStyle = '#adb5bd';
    g.beginPath();
    g.arc(cx, cy, 6, 0, Math.PI * 2);
    g.fill();
  }

  /**
   * Draws the floor minimap as an Isometric 2.5D Tilted Diamond Holomap
   * matching mockup_2_anime_fighter_1793946285714.jpg:
   * - Subtle dark isometric grid lines in background
   * - Glowing Cyan (#2ee6ff) diamond rooms & corridors for cleared/visited rooms
   * - Glowing Magenta/Pink (#ff2e93) diamond rooms & corridors for unvisited/combat rooms
   * - Glowing Yellow (#ffd60a) diamond room with beacon icon for the current room
   * - 3D bottom thickness lip on every diamond tile
   */
  public drawMinimap(dungeon: Dungeon, curRoomX: number, curRoomY: number): void {
    if (!this.minimapCanvas || !this.minimapCtx) return;
    const mc = this.minimapCanvas;
    const g = this.minimapCtx;

    const dpr = typeof window !== 'undefined' ? Math.min(3, window.devicePixelRatio || 1) : 1;
    const mw = Math.max(120, Math.round(mc.clientWidth || 240));
    const mh = Math.max(80, Math.round(mc.clientHeight || 150));
    const bw = Math.round(mw * dpr);
    const bh = Math.round(mh * dpr);

    if (mc.width !== bw || mc.height !== bh) {
      mc.width = bw;
      mc.height = bh;
    }

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, mw, mh);

    // Deep dark isometric void background
    g.fillStyle = '#08070f';
    g.fillRect(0, 0, mw, mh);

    const cx = mw / 2;
    const cy = mh / 2 - 2;

    // Isometric tile dimensions & grid step
    const scale = Math.min(mw / 230, mh / 140);
    const tileW = Math.max(12, Math.round(17 * scale));
    const tileH = Math.max(7, Math.round(10 * scale));
    const stepX = Math.round(tileW * 1.52);
    const stepY = Math.round(tileH * 1.52);
    const lipDepth = Math.max(2.5, Math.round(3.5 * scale));

    const CYAN = '#2ee6ff';
    const MAGENTA = '#ff2e93';
    const YELLOW = '#ffd60a';

    // 1. Subtle dark isometric background grid lines (matching concept art)
    g.save();
    g.strokeStyle = 'rgba(255, 46, 147, 0.08)';
    g.lineWidth = 1;
    const slope = stepY / stepX;
    for (let i = -8; i <= 8; i++) {
      const offset = i * stepY * 2;
      // Down-right iso lines
      g.beginPath();
      g.moveTo(0, cy + offset - cx * slope);
      g.lineTo(mw, cy + offset + (mw - cx) * slope);
      g.stroke();
      // Up-right iso lines
      g.beginPath();
      g.moveTo(0, cy + offset + cx * slope);
      g.lineTo(mw, cy + offset - (mw - cx) * slope);
      g.stroke();
    }
    g.restore();

    const projectIso = (rx: number, ry: number): { x: number; y: number } => {
      const dx = rx - curRoomX;
      const dy = ry - curRoomY;
      return {
        x: cx + (dx - dy) * stepX,
        y: cy + (dx + dy) * stepY
      };
    };

    const rooms = Object.values(dungeon);
    // Sort rooms back-to-front by (x + y) so isometric 2.5D lips layer cleanly
    rooms.sort((a, b) => (a.x + a.y) - (b.x + b.y));

    // 2. First pass: Draw isometric corridor bridges between rooms
    for (const r of rooms) {
      if (!r.doors) continue;
      const p1 = projectIso(r.x, r.y);
      if (p1.x < -tileW || p1.x > mw + tileW || p1.y < -tileH || p1.y > mh + tileH) continue;

      const neighbors: Array<{ dir: 'N' | 'S' | 'E' | 'W'; nx: number; ny: number }> = [
        { dir: 'N', nx: r.x, ny: r.y - 1 },
        { dir: 'S', nx: r.x, ny: r.y + 1 },
        { dir: 'E', nx: r.x + 1, ny: r.y },
        { dir: 'W', nx: r.x - 1, ny: r.y }
      ];

      for (const nb of neighbors) {
        if (!r.doors[nb.dir]) continue;
        // Draw each undirected edge once
        if (nb.dir === 'N' || nb.dir === 'W') continue;
        const target = dungeon[`${nb.nx},${nb.ny}`];
        const p2 = projectIso(nb.nx, nb.ny);

        const bothCleared = (r.cleared || (r.x === curRoomX && r.y === curRoomY)) &&
          Boolean(target && (target.cleared || target.visited));
        const corrColor = bothCleared ? CYAN : MAGENTA;

        g.save();
        // Dark corridor backing
        g.strokeStyle = '#120e1c';
        g.lineWidth = Math.max(4, tileH * 0.55);
        g.lineCap = 'round';
        g.beginPath();
        g.moveTo(p1.x, p1.y);
        g.lineTo(p2.x, p2.y);
        g.stroke();

        // Neon glowing corridor line
        g.strokeStyle = corrColor;
        g.shadowColor = corrColor;
        g.shadowBlur = 6;
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(p1.x, p1.y);
        g.lineTo(p2.x, p2.y);
        g.stroke();
        g.restore();
      }
    }

    // 3. Second pass: Draw 2.5D Isometric Diamond Room Tiles + Vector Icons
    for (const r of rooms) {
      const { x: isoX, y: isoY } = projectIso(r.x, r.y);
      if (isoX < -tileW * 0.8 || isoX > mw + tileW * 0.8 || isoY < -tileH * 0.8 || isoY > mh + tileH * 0.8) {
        continue;
      }

      const isCurrent = r.x === curRoomX && r.y === curRoomY;
      let stroke: string;
      let topFill: string;
      let lipFill: string;

      if (isCurrent) {
        stroke = YELLOW;
        topFill = 'rgba(255, 214, 10, 0.34)';
        lipFill = '#9e7800';
      } else if (r.visited && r.cleared) {
        stroke = CYAN;
        topFill = 'rgba(46, 230, 255, 0.22)';
        lipFill = '#0b5c6b';
      } else {
        stroke = MAGENTA;
        topFill = r.visited ? 'rgba(255, 46, 147, 0.28)' : 'rgba(255, 46, 147, 0.14)';
        lipFill = '#590d34';
      }

      g.save();

      // 3A. 3D Bottom Thickness Lip
      g.beginPath();
      g.moveTo(isoX - tileW, isoY);
      g.lineTo(isoX, isoY + tileH);
      g.lineTo(isoX + tileW, isoY);
      g.lineTo(isoX + tileW, isoY + lipDepth);
      g.lineTo(isoX, isoY + tileH + lipDepth);
      g.lineTo(isoX - tileW, isoY + lipDepth);
      g.closePath();
      g.fillStyle = lipFill;
      g.fill();
      g.strokeStyle = '#0a0b10';
      g.lineWidth = 1.2;
      g.stroke();

      // 3B. Top Isometric Diamond Platform
      g.beginPath();
      g.moveTo(isoX, isoY - tileH);
      g.lineTo(isoX + tileW, isoY);
      g.lineTo(isoX, isoY + tileH);
      g.lineTo(isoX - tileW, isoY);
      g.closePath();

      g.shadowColor = stroke;
      g.shadowBlur = isCurrent ? 14 : 7;
      g.fillStyle = '#0c0b16';
      g.fill();
      g.fillStyle = topFill;
      g.fill();

      g.lineWidth = isCurrent ? 2.4 : 1.7;
      g.strokeStyle = stroke;
      g.stroke();
      g.shadowBlur = 0;

      // 3C. Inner Isometric Frame Line (matches concept art double-lined rooms)
      const iw = tileW * 0.72;
      const ih = tileH * 0.72;
      g.beginPath();
      g.moveTo(isoX, isoY - ih);
      g.lineTo(isoX + iw, isoY);
      g.lineTo(isoX, isoY + ih);
      g.lineTo(isoX - iw, isoY);
      g.closePath();
      g.strokeStyle = isCurrent ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.18)';
      g.lineWidth = 0.9;
      g.stroke();

      // 3D. Crisp Special Room / Current Room Vector Emblems
      if (r.type === 'boss' || r.type === 'treasure' || r.type === 'shop') {
        const iconColor = r.type === 'boss'
          ? (isCurrent ? '#ffffff' : MAGENTA)
          : (r.type === 'treasure' ? YELLOW : CYAN);
        g.fillStyle = iconColor;
        g.shadowColor = iconColor;
        g.shadowBlur = 6;
        const iconSize = Math.max(9, Math.round(tileH * 1.15));
        g.font = `900 ${iconSize}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const icon = r.type === 'boss'
          ? '☠'
          : (r.type === 'treasure' ? '★' : '$');
        g.fillText(icon, isoX, isoY - 0.5);
      } else if (isCurrent) {
        // Glowing yellow/white rider beacon marker in current room
        g.fillStyle = '#ffffff';
        g.shadowColor = YELLOW;
        g.shadowBlur = 8;
        g.beginPath();
        g.arc(isoX, isoY - 1, Math.max(2.8, tileH * 0.34), 0, Math.PI * 2);
        g.fill();
        g.strokeStyle = '#0a0b10';
        g.lineWidth = 1.2;
        g.stroke();
      }

      g.restore();
    }
  }

  /**
   * Syncs the segmented NOS meter (fill width, readout, lock/boost state).
   * Safe to call every frame: DOM writes only happen when values change.
   */
  public updateNos(nos: number, nosMax: number, nosLock: boolean, boosting: boolean = false): void {
    if (typeof document === 'undefined') return;
    const pct = Math.max(0, Math.min(100, (nos / (nosMax || 100)) * 100));
    const rounded = Math.round(pct);

    const nosFill = document.getElementById('nos-fill');
    if (nosFill) nosFill.style.width = `${pct}%`;

    const key = `${rounded}|${nosLock ? 1 : 0}|${boosting ? 1 : 0}`;
    if (key === this.lastNosKey) return;
    this.lastNosKey = key;

    const meter = document.getElementById('nos-meter');
    if (meter) {
      meter.classList.toggle('is-locked', nosLock);
      meter.classList.toggle('is-boosting', boosting && !nosLock);
    }
    const nosText = document.getElementById('nos-text');
    if (nosText) nosText.textContent = nosLock ? 'LOCK' : `${rounded}%`;
  }

  /**
   * Starts a lightweight rAF loop that mirrors the tracked player's NOS into the
   * HUD every frame (NOS drains/recharges between updateSidebar calls).
   * Only runs in a real page that contains the anime HUD (#nos-meter).
   */
  private ensureNosLoop(): void {
    if (this.nosLoopStarted) return;
    if (typeof window === 'undefined' || typeof window.requestAnimationFrame !== 'function') return;
    if (!document.getElementById('nos-meter')) return;
    this.nosLoopStarted = true;

    const step = (): void => {
      const p = this.trackedPlayer;
      if (p) {
        const boosting = this.lastNosValue >= 0 && p.nos < this.lastNosValue - 0.01;
        this.lastNosValue = p.nos;
        this.updateNos(p.nos, p.nosMax, p.nosLock, boosting);
      }
      window.requestAnimationFrame(step);
    };
    window.requestAnimationFrame(step);
  }

  /** Rebuilds / updates the segmented HULL bar (one segment per max HP). */
  private updateHull(hp: number, maxHp: number): void {
    const hullBar = document.getElementById('hull-bar');
    if (hullBar) {
      const segs = Math.max(1, Math.round(maxHp));
      if (this.lastHullMax !== segs || hullBar.children.length !== segs) {
        hullBar.innerHTML = '';
        for (let i = 0; i < segs; i++) {
          const s = document.createElement('span');
          s.className = 'hud-seg';
          hullBar.appendChild(s);
        }
        this.lastHullMax = segs;
      }
      Array.from(hullBar.children).forEach((el, i) => {
        el.classList.toggle('is-filled', i < hp);
      });
    }

    const meter = document.getElementById('hull-meter');
    if (meter) {
      meter.classList.toggle('is-low', isLowFuel(hp, maxHp));
      meter.setAttribute('aria-valuenow', `${Math.max(0, hp)}`);
      meter.setAttribute('aria-valuemax', `${maxHp}`);
    }
  }

  /**
   * Updates the top-spanning Boss Health Bar (#boss-hud).
   * Shows the bar when a living boss is present in the room, or hides it when null/dead.
   */
  public updateBossBar(boss: Boss | null, floorNum: number = 1): void {
    if (typeof document === 'undefined') return;
    const bossHud = document.getElementById('boss-hud');
    if (!bossHud) return;

    if (!boss || boss.hp <= 0) {
      bossHud.classList.remove('is-visible');
      bossHud.hidden = true;
      return;
    }

    const profile = getBossProfile(boss);
    bossHud.hidden = false;
    bossHud.classList.add('is-visible');
    bossHud.style.setProperty('--boss-accent', profile.accent);

    const nameEl = document.getElementById('boss-hud-name');
    if (nameEl) nameEl.textContent = boss.name || 'SCRAP GOLIATH';

    const subEl = document.getElementById('boss-hud-sub');
    if (subEl) subEl.textContent = `FLOOR ${floorNum} // ${profile.subtitle.split('—')[0].trim()}`;

    const hpEl = document.getElementById('boss-hud-hp');
    const curHp = Math.max(0, Math.ceil(boss.hp));
    const maxHp = Math.max(1, Math.ceil(boss.maxHp));
    if (hpEl) {
      hpEl.textContent = `${curHp.toLocaleString('en-US')} / ${maxHp.toLocaleString('en-US')}`;
    }

    const pct = Math.max(0, Math.min(100, (boss.hp / maxHp) * 100));
    const fillEl = document.getElementById('boss-bar-fill');
    if (fillEl) fillEl.style.width = `${pct}%`;

    const lagEl = document.getElementById('boss-bar-lag');
    if (lagEl) lagEl.style.width = `${pct}%`;
  }

  /**
   * Triggers the Guilty Gear / Persona 5 style VS Boss Intro Banner (#boss-intro-banner)
   * when entering an uncleared boss room.
   */
  public showBossIntro(boss: Boss, floorNum: number, onComplete?: () => void): void {
    if (typeof document === 'undefined') {
      onComplete?.();
      return;
    }

    this.updateBossBar(boss, floorNum);

    const banner = document.getElementById('boss-intro-banner');
    if (!banner) {
      onComplete?.();
      return;
    }

    // Clear any existing intro timer/listeners
    if (this.bossIntroTimeoutId !== null) {
      clearTimeout(this.bossIntroTimeoutId);
      this.bossIntroTimeoutId = null;
    }
    if (this.bossIntroDismissHandler && typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.bossIntroDismissHandler);
      banner.removeEventListener('click', this.bossIntroDismissHandler);
      this.bossIntroDismissHandler = null;
    }

    const profile = getBossProfile(boss);
    banner.style.setProperty('--boss-accent', profile.accent);

    const artEl = document.getElementById('boss-intro-art');
    if (artEl) artEl.innerHTML = profile.svg;

    const kickerEl = document.getElementById('boss-intro-kicker');
    if (kickerEl) kickerEl.textContent = `FLOOR ${floorNum} // BOSS ENCOUNTER`;

    const nameEl = document.getElementById('boss-intro-name');
    if (nameEl) nameEl.textContent = boss.name || 'SCRAP GOLIATH';

    const subEl = document.getElementById('boss-intro-sub');
    if (subEl) subEl.textContent = profile.subtitle;

    const timerFill = document.getElementById('boss-intro-timer-fill');
    if (timerFill) {
      timerFill.style.transition = 'none';
      timerFill.style.width = '100%';
      // Trigger reflow so the countdown bar animates smoothly from 100% to 0%
      void timerFill.offsetWidth;
      timerFill.style.transition = 'width 2.35s linear';
      timerFill.style.width = '0%';
    }

    this.bossIntroActive = true;
    banner.setAttribute('aria-hidden', 'false');
    banner.classList.add('is-open');

    const startedAt = typeof performance !== 'undefined' ? performance.now() : Date.now();

    const finish = (): void => {
      if (!this.bossIntroActive) return;
      this.bossIntroActive = false;
      if (this.bossIntroTimeoutId !== null) {
        clearTimeout(this.bossIntroTimeoutId);
        this.bossIntroTimeoutId = null;
      }
      if (this.bossIntroDismissHandler && typeof window !== 'undefined') {
        window.removeEventListener('keydown', this.bossIntroDismissHandler);
        banner.removeEventListener('click', this.bossIntroDismissHandler);
        this.bossIntroDismissHandler = null;
      }
      banner.classList.remove('is-open');
      banner.setAttribute('aria-hidden', 'true');
      onComplete?.();
    };

    this.bossIntroDismissHandler = (e: Event): void => {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - startedAt < 450) return; // Prevent accidental instant skip on entry frame
      if (e.type === 'keydown') {
        const ke = e as KeyboardEvent;
        if (ke.code !== 'Space' && ke.code !== 'Enter' && ke.code !== 'Escape') return;
        ke.preventDefault();
      }
      finish();
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.bossIntroDismissHandler);
      banner.addEventListener('click', this.bossIntroDismissHandler);
    }

    this.bossIntroTimeoutId = setTimeout(finish, 2400);
  }

  /**
   * Returns true while the Boss Intro Banner overlay is active on screen.
   */
  public isBossIntroActive(): boolean {
    return this.bossIntroActive;
  }

  /**
   * Updates HUD DOM widgets: Hull meter, NOS meter, LV badge, stats, currency,
   * high-fidelity weapon cards, die-cut mod stickers, boss bar, and isometric minimap.
   */
  public updateSidebar(
    player: PlayerState,
    metaScrap: number,
    floorNum: number,
    unlockedWeapons: Record<string, boolean>,
    dungeon?: Dungeon,
    curRoomX?: number,
    curRoomY?: number
  ): void {
    if (typeof document === 'undefined') return;

    // 1. Hull (segmented bar; legacy fuel gauge canvas is hidden by CSS)
    const hpText = document.getElementById('hp-text');
    if (hpText) hpText.textContent = `${player.hp} / ${player.maxHp}`;
    this.updateHull(player.hp, player.maxHp);

    // 2. NOS meter (+ per-frame sync loop) & Concept-Art LV. Badge
    this.trackedPlayer = player;
    this.updateNos(player.nos, player.nosMax, player.nosLock);
    this.ensureNosLoop();

    const lvBadge = document.getElementById('hud-lv-badge');
    if (lvBadge) lvBadge.textContent = `LV. ${floorNum}`;

    // 3. Currency & Floor
    const coinCount = document.getElementById('coin-count');
    if (coinCount) coinCount.textContent = player.coins.toLocaleString('en-US');

    const scrapCount = document.getElementById('scrap-count');
    if (scrapCount) scrapCount.textContent = metaScrap.toLocaleString('en-US');

    const floorNumEl = document.getElementById('floor-num');
    if (floorNumEl) floorNumEl.textContent = `${floorNum}`;

    // 4. Weapon card bar (High-Fidelity Cel-Shaded SVGs from src/ui/icons.ts)
    const bar = document.getElementById('weapon-bar');
    if (bar) {
      bar.innerHTML = '';
      Object.values(WEAPONS).forEach(w => {
        const isPermanentlyUnlocked = unlockedWeapons[w.id] || w.id === 'pistol';
        const isRunOnly = !isPermanentlyUnlocked && !!player.runWeapons[w.id];
        const avail = isPermanentlyUnlocked || isRunOnly;
        const isActive = player.weapon === w.id;

        const card = document.createElement('button');
        card.type = 'button';
        card.className = [
          'wcard',
          'weapon-slot',
          avail ? 'unlocked' : 'locked is-locked',
          isActive ? 'active is-active' : '',
          isRunOnly ? 'is-run' : ''
        ].filter(Boolean).join(' ');
        card.dataset.weapon = w.id;
        card.style.setProperty('--wc', `var(--w-${w.id}, ${w.color})`);
        card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        card.setAttribute(
          'aria-label',
          `[${w.key}] ${w.name}${isRunOnly ? ' (run only)' : ''}${avail ? '' : ` — locked, ${w.cost} scrap in Garage`}`
        );
        if (!avail) card.setAttribute('aria-disabled', 'true');

        card.innerHTML = `
          <span class="wcard-flame" aria-hidden="true"></span>
          <span class="wcard-key">${w.key}</span>
          ${isRunOnly ? '<span class="wcard-run">RUN</span>' : ''}
          <span class="wcard-icon">${WEAPON_HI_FI_SVG[w.id]}</span>
          <span class="wcard-name">${WEAPON_CARD_LABEL[w.id]}</span>
          ${avail ? '' : `<span class="wcard-lock">${LOCK_ICON}<span>${w.cost}</span></span>`}
        `;
        if (avail && this.onSelectWeapon) {
          card.onclick = () => this.onSelectWeapon!(w.id);
        }
        card.dataset.tip = `<b style="color:${w.color}">${w.name}</b><br/>${w.desc}<br/>Damage ${w.baseDmg} | Cooldown ${w.cooldown}s${avail ? '' : `<br/>🔒 Unlock in Garage: ${w.cost} scrap`}`;
        bar.appendChild(card);
      });
    }

    // 5. Live Stats strip
    const statsGrid = document.getElementById('stats-grid');
    if (statsGrid) {
      statsGrid.innerHTML = `
        <div class="stat-item" title="Damage"><span>DMG</span><strong>${Math.round(player.dmgMult * 100)}%</strong></div>
        <div class="stat-item" title="Fire Rate"><span>RATE</span><strong>${Math.round(player.fireRateMult * 100)}%</strong></div>
        <div class="stat-item" title="Bike Speed"><span>SPD</span><strong>${Math.round(player.speedMult * 100)}%</strong></div>
        <div class="stat-item" title="Projectiles"><span>PROJ</span><strong>x${player.multiShot}</strong></div>
        <div class="stat-item" title="Pierce / Bounce"><span>PRC/BNC</span><strong>${player.pierce}/${player.bounce}</strong></div>
        <div class="stat-item" title="Siphon"><span>SIPHON</span><strong>${Math.round(player.vampChance * 100)}%</strong></div>
      `;
    }

    // 6. Installed Run Mods & RoR2 Item Stacks (High-Fidelity Die-Cut Vinyl Stickers)
    const itemsEl = document.getElementById('items-list');
    if (itemsEl) {
      const stackBadges = Object.keys(player.itemStacks)
        .filter(id => player.itemStacks[id] > 0)
        .map((id, index) => {
          const it = DROP_ITEMS[id as DropItemId];
          const n = player.itemStacks[id];
          if (!it) return '';
          const svgIcon = DROP_ITEM_HI_FI_SVG[id as DropItemId] || it.icon;
          const rotClass = `rot-${(index % 6) + 1}`;
          return `<span class="item-badge sticker ${rotClass}" style="--ic:${it.color}" aria-label="${it.name} x${n}" data-tip="<b style='color:${it.color}'>${it.name} x${n}</b><br/>${it.desc}<br/><i>Stacks with duplicates</i>"><span class="sticker-glyph">${svgIcon}</span><span class="sticker-count">x${n}</span><span class="sticker-peel" aria-hidden="true"></span></span>`;
        });

      const modBadges = player.items.map((name, index) => {
        const m = RUN_MOD_POOL.find(x => x.name === name);
        const svgIcon = getModIconSvg(m ? m.id : name);
        const rotClass = `rot-${((index + 3) % 6) + 1}`;
        return `<span class="item-badge sticker is-mod ${rotClass}" style="--ic:#ffd60a" aria-label="${name}" data-tip="<b style='color:#ffd166'>${name}</b><br/>${m ? m.desc : ''}"><span class="sticker-glyph">${svgIcon}</span><span class="sticker-peel" aria-hidden="true"></span></span>`;
      });

      const all = stackBadges.concat(modBadges).filter(Boolean);
      itemsEl.classList.toggle('is-empty', all.length === 0);
      itemsEl.innerHTML = all.length === 0
        ? '<span class="items-empty">No mods yet — kill enemies for toolbox drops!</span>'
        : all.join('');
    }

    // 7. Minimap & Automatic Boss Bar Sync
    if (dungeon && curRoomX !== undefined && curRoomY !== undefined) {
      this.drawMinimap(dungeon, curRoomX, curRoomY);
      const curRoom = dungeon[`${curRoomX},${curRoomY}`];
      const activeBoss = curRoom?.enemies?.find((e): e is Boss => e.type === 'boss' && e.hp > 0) ?? null;
      this.updateBossBar(activeBoss, floorNum);
    }
  }
}
