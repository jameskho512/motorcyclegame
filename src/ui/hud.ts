/**
 * MOTO-ROGUE: HUD & Sidebar Controller
 *
 * Implements:
 * 1. Semicircular Fuel Gauge canvas with HP needle and low-fuel jitter.
 * 2. Centered dynamic floor minimap canvas.
 * 3. Sidebar live stats grid, weapon bar, and installed mod badges.
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

export class HUDController {
  private fuelGaugeCanvas: HTMLCanvasElement | null = null;
  private fuelGaugeCtx: CanvasRenderingContext2D | null = null;

  private minimapCanvas: HTMLCanvasElement | null = null;
  private minimapCtx: CanvasRenderingContext2D | null = null;

  private onSelectWeapon?: (id: WeaponId) => void;

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
   */
  public drawMinimap(dungeon: Dungeon, curRoomX: number, curRoomY: number): void {
    if (!this.minimapCanvas || !this.minimapCtx) return;
    const mc = this.minimapCanvas;
    const g = this.minimapCtx;
    const mw = (mc as any)._lw || 240;
    const mh = (mc as any)._lh || 145;

    const scale = mc.width / mw;
    g.setTransform(scale, 0, 0, scale, 0, 0);
    g.clearRect(0, 0, mw, mh);

    for (const key in dungeon) {
      const r = dungeon[key];
      const { rx, ry, cell, visible } = calcMinimapRoomCoords(r.x, r.y, curRoomX, curRoomY, mw, mh);
      if (!visible) continue;

      if (r.x === curRoomX && r.y === curRoomY) {
        g.fillStyle = '#ff6b2b';
      } else if (r.visited) {
        g.fillStyle = r.cleared ? '#5c677d' : '#9d4edd';
      } else {
        g.fillStyle = '#262638';
      }

      g.fillRect(rx, ry, cell, cell);
      g.strokeStyle = '#0a0b10';
      g.lineWidth = 1.5;
      g.strokeRect(rx, ry, cell, cell);

      // Special room markers: Boss ☠, Mod ★, Shop $
      if (r.type === 'boss' || r.type === 'treasure' || r.type === 'shop') {
        g.fillStyle = r.type === 'boss'
          ? '#ff4d6d'
          : (r.type === 'treasure' ? '#ffd166' : '#06d6a0');
        g.font = 'bold 11px sans-serif';
        g.textAlign = 'center';
        const icon = r.type === 'boss'
          ? '☠'
          : (r.type === 'treasure' ? '★' : '$');
        g.fillText(icon, rx + cell / 2, ry + cell - 4);
      }
    }
  }

  /**
   * Updates sidebar DOM widgets: Hull text, NOS bar, stats, currency, weapon bar, and mod badges.
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

    // 1. Hull & Fuel Gauge
    const hpText = document.getElementById('hp-text');
    if (hpText) hpText.textContent = `${player.hp} / ${player.maxHp}`;
    this.drawFuelGauge(player.hp, player.maxHp);

    // 2. NOS Bar
    const nosFill = document.getElementById('nos-fill');
    if (nosFill) {
      const nosPct = Math.max(0, Math.min(100, (player.nos / (player.nosMax || 100)) * 100));
      nosFill.style.width = `${nosPct}%`;
      nosFill.style.background = player.nosLock
        ? '#ef233c'
        : 'linear-gradient(90deg, #4895ef, #4cc9f0)';
    }

    // 3. Currency & Floor
    const coinCount = document.getElementById('coin-count');
    if (coinCount) coinCount.textContent = `${player.coins} 🪙`;

    const scrapCount = document.getElementById('scrap-count');
    if (scrapCount) scrapCount.textContent = `${metaScrap} ⚙️`;

    const floorNumEl = document.getElementById('floor-num');
    if (floorNumEl) floorNumEl.textContent = `${floorNum}`;

    // 4. Weapons Arsenal Bar
    const bar = document.getElementById('weapon-bar');
    if (bar) {
      bar.innerHTML = '';
      Object.values(WEAPONS).forEach(w => {
        const isPermanentlyUnlocked = unlockedWeapons[w.id] || w.id === 'pistol';
        const isRunOnly = !isPermanentlyUnlocked && !!player.runWeapons[w.id];
        const avail = isPermanentlyUnlocked || isRunOnly;
        const isActive = player.weapon === w.id;

        const slot = document.createElement('div');
        slot.className = `weapon-slot ${avail ? 'unlocked' : 'locked'} ${isActive ? 'active' : ''}`;
        slot.innerHTML = `
          <span>[${w.key}] ${w.name}${isRunOnly ? ' (Run)' : ''}</span>
          <span>${avail ? 'READY' : `🔒 ${w.cost}⚙️`}</span>
        `;
        if (avail && this.onSelectWeapon) {
          slot.onclick = () => this.onSelectWeapon!(w.id);
        }
        slot.dataset.tip = `<b style="color:${w.color}">${w.name}</b><br/>${w.desc}<br/>Damage ${w.baseDmg} | Cooldown ${w.cooldown}s`;
        bar.appendChild(slot);
      });
    }

    // 5. Live Stats Grid
    const statsGrid = document.getElementById('stats-grid');
    if (statsGrid) {
      statsGrid.innerHTML = `
        <div class="stat-item"><span>Damage</span><strong>${Math.round(player.dmgMult * 100)}%</strong></div>
        <div class="stat-item"><span>Fire Rate</span><strong>${Math.round(player.fireRateMult * 100)}%</strong></div>
        <div class="stat-item"><span>Bike Speed</span><strong>${Math.round(player.speedMult * 100)}%</strong></div>
        <div class="stat-item"><span>Projectiles</span><strong>x${player.multiShot}</strong></div>
        <div class="stat-item"><span>Pierce / Bounce</span><strong>${player.pierce} / ${player.bounce}</strong></div>
        <div class="stat-item"><span>Siphon</span><strong>${Math.round(player.vampChance * 100)}%</strong></div>
      `;
    }

    // 6. Installed Run Mods & RoR2 Item Stacks
    const itemsEl = document.getElementById('items-list');
    if (itemsEl) {
      const stackBadges = Object.keys(player.itemStacks)
        .filter(id => player.itemStacks[id] > 0)
        .map(id => {
          const it = DROP_ITEMS[id as DropItemId];
          const n = player.itemStacks[id];
          if (!it) return '';
          return `<span class="item-badge" style="color:${it.color}" data-tip="<b style='color:${it.color}'>${it.name} x${n}</b><br/>${it.desc}<br/><i>Stacks with duplicates</i>">${it.name} x${n}</span>`;
        });

      const modBadges = player.items.map(name => {
        const m = RUN_MOD_POOL.find(x => x.name === name);
        return `<span class="item-badge" data-tip="<b style='color:#ffd166'>${name}</b><br/>${m ? m.desc : ''}">${name}</span>`;
      });

      const all = stackBadges.concat(modBadges).filter(Boolean);
      itemsEl.innerHTML = all.length === 0
        ? '<span style="color:#666666; font-size:11px;">None yet — kill enemies for toolbox drops!</span>'
        : all.join('');
    }

    // 7. Minimap
    if (dungeon && curRoomX !== undefined && curRoomY !== undefined) {
      this.drawMinimap(dungeon, curRoomX, curRoomY);
    }
  }
}
