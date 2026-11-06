/**
 * MOTO-ROGUE: HUD & Sidebar Controller
 *
 * Implements:
 * 1. Semicircular Fuel Gauge canvas with HP needle and low-fuel jitter
 *    (legacy; the canvas is hidden by the anime HUD, math helpers stay exported).
 * 2. Centered dynamic floor minimap canvas (neon cyan/magenta/yellow palette).
 * 3. Anime fighting-game overlay HUD: segmented HULL / NOS meters, bike stats strip,
 *    weapon card bar, and installed mod sticker badges.
 *
 * Parity reference: moto-rogue/index.html L3699-L3865
 */

import {
  PlayerState,
  Dungeon,
  WeaponId,
  DropItemId
} from '../types/game';

import { WEAPONS } from '../data/weapons';
import { DROP_ITEMS, RUN_MOD_POOL } from '../data/upgrades';

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

const SVG_ATTRS = 'viewBox="0 0 64 40" aria-hidden="true" focusable="false"';
const BODY = 'fill="#f4f1ea" stroke="#0a0b10" stroke-width="2.5" stroke-linejoin="round"';

/** Inline-SVG weapon silhouettes (offline-safe, no external assets). */
const WEAPON_ICON: Record<WeaponId, string> = {
  pistol: `<svg ${SVG_ATTRS}><path ${BODY} d="M10 10H52V19H30L26 33H16L19 19H10Z"/><path fill="#0a0b10" d="M30 19h6v5h-6z"/></svg>`,
  machine_gun: `<svg ${SVG_ATTRS}><path ${BODY} d="M3 13H48V10H58V17H50V22H38L35 34H28L30 22H22L19 29H13L15 22H3Z"/><path ${BODY} d="M24 22h7l-1 9h-6z"/></svg>`,
  flamethrower: `<svg ${SVG_ATTRS}><path ${BODY} d="M4 15H40L48 11H56V23H48L40 19H28L25 32H18L20 19H4Z"/><circle ${BODY} cx="12" cy="24" r="5"/><path fill="#ffd60a" stroke="#0a0b10" stroke-width="1.5" d="M57 17c5-5 2-9 6-11-1 5 2 7 0 12-2 4-6 3-6-1z"/></svg>`,
  grenade_launcher: `<svg ${SVG_ATTRS}><path ${BODY} d="M4 12H50V22H38L35 34H26L28 22H18V20H4Z"/><circle ${BODY} cx="38" cy="17" r="9"/><circle fill="#0a0b10" cx="38" cy="17" r="3"/></svg>`,
  shotgun: `<svg ${SVG_ATTRS}><path ${BODY} d="M2 14H61V20H26L14 31H4L11 20H2Z"/><path ${BODY} d="M30 20h12v4H30z"/></svg>`,
  railgun: `<svg ${SVG_ATTRS}><path ${BODY} d="M2 12H55L62 15V19L55 22H30L26 33H18L20 22H2Z"/><path fill="none" stroke="#2ee6ff" stroke-width="2.5" d="M8 17H52"/></svg>`,
  arc_coil: `<svg ${SVG_ATTRS}><path ${BODY} d="M5 12H34V22H25L22 33H14L16 22H5Z"/><path fill="none" stroke="#ffd60a" stroke-width="3" stroke-linejoin="round" d="M36 17l4-7 4 12 4-12 4 12 4-12 4 7"/></svg>`
};

const LOCK_ICON = '<svg viewBox="0 0 16 16" aria-hidden="true" focusable="false"><path fill="currentColor" d="M4 7V5a4 4 0 0 1 8 0v2h1v8H3V7zm2 0h4V5a2 2 0 0 0-4 0z"/></svg>';

/** Two-letter monogram for sticker badges (e.g. "Nitro Syringe" -> "NS"). */
function monogram(name: string): string {
  const words = name.replace(/[^A-Za-z0-9\s-]/g, '').split(/[\s-]+/).filter(Boolean);
  if (words.length === 0) return '?';
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
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
   * Draws the floor minimap centered on player's current room.
   * The canvas backing store is sized to its CSS box x devicePixelRatio so the
   * neon map stays crisp inside the responsive minimap panel.
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

    // Dynamic cell size scaled to fill the minimap panel
    const cellSize = Math.min(28, Math.max(14, Math.round(Math.min(mw, mh) * 0.16)));
    const gap = Math.max(4, Math.round(cellSize * 0.32));

    const CYAN = '#2ee6ff';
    const MAGENTA = '#ff2e93';
    const YELLOW = '#ffd60a';

    // Tactical neon grid background (faint cyber lines)
    g.strokeStyle = 'rgba(46, 230, 255, 0.06)';
    g.lineWidth = 1;
    for (let x = 0; x <= mw; x += 18) {
      g.beginPath();
      g.moveTo(x, 0);
      g.lineTo(x, mh);
      g.stroke();
    }
    for (let y = 0; y <= mh; y += 18) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(mw, y);
      g.stroke();
    }

    for (const key in dungeon) {
      const r = dungeon[key];
      const { rx, ry, cell, visible } = calcMinimapRoomCoords(r.x, r.y, curRoomX, curRoomY, mw, mh, cellSize, gap);
      if (!visible) continue;

      // Draw corridor connections between adjacent rooms (neon glow)
      if (r.doors && (r.visited || (r.x === curRoomX && r.y === curRoomY))) {
        g.strokeStyle = r.cleared ? CYAN : MAGENTA;
        g.shadowColor = g.strokeStyle;
        g.shadowBlur = 6;
        g.lineWidth = 2.5;
        if (r.doors.N) {
          g.beginPath();
          g.moveTo(rx + cell / 2, ry);
          g.lineTo(rx + cell / 2, ry - gap);
          g.stroke();
        }
        if (r.doors.S) {
          g.beginPath();
          g.moveTo(rx + cell / 2, ry + cell);
          g.lineTo(rx + cell / 2, ry + cell + gap);
          g.stroke();
        }
        if (r.doors.W) {
          g.beginPath();
          g.moveTo(rx, ry + cell / 2);
          g.lineTo(rx - gap, ry + cell / 2);
          g.stroke();
        }
        if (r.doors.E) {
          g.beginPath();
          g.moveTo(rx + cell, ry + cell / 2);
          g.lineTo(rx + cell + gap, ry + cell / 2);
          g.stroke();
        }
      }

      // Room block fill + neon outline
      const isCurrent = (r.x === curRoomX && r.y === curRoomY);
      let fill: string;
      let stroke: string;
      if (isCurrent) {
        fill = 'rgba(255, 214, 10, 0.35)';
        stroke = YELLOW;
      } else if (r.visited) {
        fill = r.cleared ? 'rgba(46, 230, 255, 0.14)' : 'rgba(255, 46, 147, 0.22)';
        stroke = r.cleared ? CYAN : MAGENTA;
      } else {
        fill = '#151320';
        stroke = '#4a3f5e';
      }

      g.shadowBlur = isCurrent ? 12 : (r.visited ? 6 : 0);
      g.shadowColor = stroke;
      g.fillStyle = fill;
      g.fillRect(rx, ry, cell, cell);
      g.strokeStyle = stroke;
      g.lineWidth = isCurrent ? 2.5 : 1.75;
      g.strokeRect(rx, ry, cell, cell);
      g.shadowBlur = 0;

      // Special room markers: Boss ☠, Mod ★, Shop $
      if (r.type === 'boss' || r.type === 'treasure' || r.type === 'shop') {
        g.fillStyle = r.type === 'boss'
          ? MAGENTA
          : (r.type === 'treasure' ? YELLOW : CYAN);
        const iconSize = Math.round(cell * 0.6);
        g.font = `bold ${iconSize}px sans-serif`;
        g.textAlign = 'center';
        g.textBaseline = 'middle';
        const icon = r.type === 'boss'
          ? '☠'
          : (r.type === 'treasure' ? '★' : '$');
        g.fillText(icon, rx + cell / 2, ry + cell / 2);
      }
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
   * Updates HUD DOM widgets: Hull meter, NOS meter, stats, currency, weapon cards, and mod stickers.
   * (Name kept for API compatibility with main.ts.)
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

    // 2. NOS meter (+ per-frame sync loop)
    this.trackedPlayer = player;
    this.updateNos(player.nos, player.nosMax, player.nosLock);
    this.ensureNosLoop();

    // 3. Currency & Floor
    const coinCount = document.getElementById('coin-count');
    if (coinCount) coinCount.textContent = player.coins.toLocaleString('en-US');

    const scrapCount = document.getElementById('scrap-count');
    if (scrapCount) scrapCount.textContent = metaScrap.toLocaleString('en-US');

    const floorNumEl = document.getElementById('floor-num');
    if (floorNumEl) floorNumEl.textContent = `${floorNum}`;

    // 4. Weapon card bar
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
          <span class="wcard-icon">${WEAPON_ICON[w.id]}</span>
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

    // 6. Installed Run Mods & RoR2 Item Stacks (sticker badges)
    const itemsEl = document.getElementById('items-list');
    if (itemsEl) {
      const stackBadges = Object.keys(player.itemStacks)
        .filter(id => player.itemStacks[id] > 0)
        .map((id, index) => {
          const it = DROP_ITEMS[id as DropItemId];
          const n = player.itemStacks[id];
          if (!it) return '';
          const glyph = it.icon || monogram(it.name);
          const rotClass = `rot-${(index % 6) + 1}`;
          return `<span class="item-badge sticker ${rotClass}" style="--ic:${it.color}" aria-label="${it.name} x${n}" data-tip="<b style='color:${it.color}'>${it.name} x${n}</b><br/>${it.desc}<br/><i>Stacks with duplicates</i>"><span class="sticker-glyph">${glyph}</span><span class="sticker-count">x${n}</span><span class="sticker-peel" aria-hidden="true"></span></span>`;
        });

      const modBadges = player.items.map((name, index) => {
        const m = RUN_MOD_POOL.find(x => x.name === name);
        const rotClass = `rot-${((index + 3) % 6) + 1}`;
        return `<span class="item-badge sticker is-mod ${rotClass}" style="--ic:#ffd60a" aria-label="${name}" data-tip="<b style='color:#ffd166'>${name}</b><br/>${m ? m.desc : ''}"><span class="sticker-glyph">${monogram(name)}</span><span class="sticker-peel" aria-hidden="true"></span></span>`;
      });

      const all = stackBadges.concat(modBadges).filter(Boolean);
      itemsEl.classList.toggle('is-empty', all.length === 0);
      itemsEl.innerHTML = all.length === 0
        ? '<span class="items-empty">No mods yet — kill enemies for toolbox drops!</span>'
        : all.join('');
    }

    // 7. Minimap
    if (dungeon && curRoomX !== undefined && curRoomY !== undefined) {
      this.drawMinimap(dungeon, curRoomX, curRoomY);
    }
  }
}
