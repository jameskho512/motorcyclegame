/**
 * MOTO-ROGUE: Garage Workshop Modal Controller
 *
 * Implements:
 * 1. Full-viewport workshop modal with Garage Bay 01 roller door header.
 * 2. 6-slot motorcycle equipment bay with bike lift canvas preview.
 * 3. Parts stash grid (max 18 items) with click-to-equip and right-click-to-sell.
 * 4. Permanent arsenal weapon unlocks and bike tuning upgrade rows.
 * 5. Run resume, fresh run launch, and full save reset actions.
 *
 * Parity reference: moto-rogue/index.html L236-L300, L3363-L3456, L3867-L4011
 */

import {
  MetaSaveState,
  PlayerState,
  EquipSlot,
  EquipmentItem,
  WeaponId,
  MetaUpgradeId,
  UnlockableWeaponId
} from '../types/game';

import { WEAPONS, UNLOCKABLE_IDS } from '../data/weapons';
import { META_UPGRADES, calcUpgradeCost } from '../data/upgrades';
import { EQUIP_SLOTS, RARITY, fmtStat } from '../data/equipment';

export interface GarageCallbacks {
  onEquipItem: (item: EquipmentItem) => void;
  onUnequipSlot: (slotId: EquipSlot) => void;
  onSellItem: (item: EquipmentItem) => void;
  onUnlockWeapon: (weaponId: UnlockableWeaponId) => void;
  onEquipWeapon: (weaponId: WeaponId) => void;
  onBuyUpgrade: (upgradeId: MetaUpgradeId) => void;
  onResumeRun: () => void;
  onNewRun: () => void;
  onResetSave: () => void;
  onPlayUiClick?: () => void;
  onPlayShopBuy?: () => void;
}

export class GarageController {
  private overlay: HTMLElement | null = null;
  private modalTitle: HTMLElement | null = null;
  private modalScrap: HTMLElement | null = null;
  private slotsLeft: HTMLElement | null = null;
  private slotsRight: HTMLElement | null = null;
  private bikeCanvas: HTMLCanvasElement | null = null;
  private bikeCtx: CanvasRenderingContext2D | null = null;
  private eqTotals: HTMLElement | null = null;
  private stashList: HTMLElement | null = null;
  private unlockList: HTMLElement | null = null;
  private metaUpgradeList: HTMLElement | null = null;
  private resumeBtn: HTMLButtonElement | null = null;
  private newRunBtn: HTMLButtonElement | null = null;
  private resetSaveBtn: HTMLButtonElement | null = null;

  private isVisible: boolean = false;
  private isDead: boolean = false;
  private callbacks: GarageCallbacks;

  constructor(callbacks: GarageCallbacks) {
    this.callbacks = callbacks;

    if (typeof document !== 'undefined') {
      this.overlay = document.getElementById('garage-overlay');
      this.modalTitle = document.getElementById('modal-title');
      this.modalScrap = document.getElementById('modal-scrap');
      this.slotsLeft = document.getElementById('slots-left');
      this.slotsRight = document.getElementById('slots-right');
      this.bikeCanvas = document.getElementById('bike-canvas') as HTMLCanvasElement | null;
      if (this.bikeCanvas) {
        this.bikeCtx = this.bikeCanvas.getContext('2d');
      }
      this.eqTotals = document.getElementById('eq-totals');
      this.stashList = document.getElementById('stash-list');
      this.unlockList = document.getElementById('unlock-list');
      this.metaUpgradeList = document.getElementById('meta-upgrade-list');
      this.resumeBtn = document.getElementById('btn-resume') as HTMLButtonElement | null;
      this.newRunBtn = document.getElementById('btn-new-run') as HTMLButtonElement | null;
      this.resetSaveBtn = document.getElementById('btn-reset-save') as HTMLButtonElement | null;

      this.resumeBtn?.addEventListener('click', () => {
        this.callbacks.onPlayUiClick?.();
        this.callbacks.onResumeRun();
        this.close();
      });

      this.newRunBtn?.addEventListener('click', () => {
        this.callbacks.onPlayUiClick?.();
        this.callbacks.onNewRun();
        this.close();
      });

      this.resetSaveBtn?.addEventListener('click', () => {
        this.callbacks.onPlayUiClick?.();
        this.callbacks.onResetSave();
      });
    }
  }

  public isOpen(): boolean {
    return this.isVisible;
  }

  /**
   * Opens the Garage Workshop modal overlay.
   */
  public open(
    isDead: boolean,
    floorNum: number,
    metaSave: MetaSaveState,
    player: PlayerState
  ): void {
    this.isDead = isDead;
    this.isVisible = true;

    if (this.overlay) {
      this.overlay.classList.add('visible');
    }

    if (this.modalTitle) {
      this.modalTitle.textContent = isDead
        ? `MOTORCYCLE WRECKED ON FLOOR ${floorNum} // GARAGE`
        : 'MOTO-GARAGE & PERMANENT TUNING';
    }

    if (this.resumeBtn) {
      this.resumeBtn.textContent = isDead
        ? 'Launch New Run (Floor 1)'
        : 'Resume Current Run';
    }

    this.render(metaSave, player);
  }

  /**
   * Closes the Garage Workshop overlay.
   */
  public close(): void {
    if (this.overlay) {
      this.overlay.classList.remove('visible');
    }
    this.isVisible = false;
  }

  /**
   * Toggles the Garage Workshop visibility.
   */
  public toggle(
    isDead: boolean,
    floorNum: number,
    metaSave: MetaSaveState,
    player: PlayerState
  ): void {
    this.callbacks.onPlayUiClick?.();
    if (this.isVisible) {
      if (this.isDead) {
        this.callbacks.onNewRun();
      }
      this.close();
    } else {
      this.open(isDead, floorNum, metaSave, player);
    }
  }

  /**
   * Renders the entire garage workshop UI.
   */
  public render(metaSave: MetaSaveState, player: PlayerState): void {
    if (this.modalScrap) {
      this.modalScrap.textContent = `${metaSave.scrap}`;
    }

    this.renderEquipmentBay(metaSave);
    this.renderStash(metaSave);
    this.renderWeaponUnlocks(metaSave, player);
    this.renderMetaUpgrades(metaSave);
    this.drawBikeLift(metaSave);
  }

  /**
   * Renders the 6 equipment slot bay around the bike lift canvas.
   */
  private renderEquipmentBay(metaSave: MetaSaveState): void {
    if (!this.slotsLeft || !this.slotsRight) return;

    this.slotsLeft.innerHTML = '';
    this.slotsRight.innerHTML = '';

    const leftSlots: EquipSlot[] = ['tires', 'engine', 'handlebars'];
    const rightSlots: EquipSlot[] = ['exhaust', 'frame', 'tank'];

    const renderSlot = (slotDef: typeof EQUIP_SLOTS[number], container: HTMLElement) => {
      const it = metaSave.equipped[slotDef.id];
      const el = document.createElement('div');
      el.className = 'eq-slot';

      if (it) {
        const R = RARITY[it.rarity];
        const statsStr = Object.keys(it.stats)
          .map(k => fmtStat(k as any, (it.stats as any)[k]))
          .join(', ');

        el.style.borderColor = R.color;
        el.innerHTML = `
          <div class="sl-label">${slotDef.label}</div>
          <div class="sl-name" style="color:${R.color}">${it.name}</div>
          <div class="sl-stats">${statsStr}</div>
        `;
        el.onclick = () => {
          this.callbacks.onUnequipSlot(slotDef.id);
        };
      } else {
        el.innerHTML = `
          <div class="sl-label">${slotDef.label}</div>
          <div class="sl-name" style="color:#666677;">Empty Slot</div>
          <div class="sl-stats" style="color:#555566;">No part installed</div>
        `;
      }
      container.appendChild(el);
    };

    EQUIP_SLOTS.forEach(slotDef => {
      if (leftSlots.includes(slotDef.id)) {
        renderSlot(slotDef, this.slotsLeft!);
      } else if (rightSlots.includes(slotDef.id)) {
        renderSlot(slotDef, this.slotsRight!);
      }
    });

    // Compute total installed equipment stats
    if (this.eqTotals) {
      const totals: Record<string, number> = {};
      Object.values(metaSave.equipped).forEach(it => {
        if (!it) return;
        Object.entries(it.stats).forEach(([k, v]) => {
          totals[k] = (totals[k] || 0) + (v || 0);
        });
      });

      const totalStrings = Object.keys(totals).map(k => fmtStat(k as any, totals[k]));
      this.eqTotals.textContent = totalStrings.length > 0
        ? `Installed Bonuses: ${totalStrings.join(' | ')}`
        : 'Installed Bonuses: None';
    }
  }

  /**
   * Renders the parts stash grid.
   */
  private renderStash(metaSave: MetaSaveState): void {
    if (!this.stashList) return;
    this.stashList.innerHTML = '';

    if (!metaSave.stash || metaSave.stash.length === 0) {
      this.stashList.innerHTML = '<span style="color:#666677;font-size:11px;grid-column:span 3;">Stash empty — kill bosses &amp; elites for loot parts!</span>';
      return;
    }

    metaSave.stash.forEach(it => {
      const R = RARITY[it.rarity];
      const slotDef = EQUIP_SLOTS.find(s => s.id === it.slot);
      const slotLabel = slotDef ? slotDef.label : it.slot;
      const statsStr = Object.keys(it.stats)
        .map(k => fmtStat(k as any, (it.stats as any)[k]))
        .join(', ');

      const el = document.createElement('div');
      el.className = 'stash-item';
      el.style.borderColor = R.color;
      el.innerHTML = `
        <b style="color:${R.color}">${it.name}</b>
        <span>${R.name} ${slotLabel}</span><br/>
        <span style="color:#aeb3c2;">${statsStr}</span><br/>
        <span style="color:#ffd166;">Sell: ${R.sell} ⚙️</span>
      `;

      // Left-click equips
      el.onclick = () => {
        this.callbacks.onEquipItem(it);
      };

      // Right-click sells for scrap
      el.oncontextmenu = (ev) => {
        ev.preventDefault();
        this.callbacks.onSellItem(it);
      };

      this.stashList!.appendChild(el);
    });
  }

  /**
   * Renders the permanent weapon unlocks list.
   */
  private renderWeaponUnlocks(metaSave: MetaSaveState, player: PlayerState): void {
    if (!this.unlockList) return;
    this.unlockList.innerHTML = '';

    UNLOCKABLE_IDS.forEach(id => {
      const w = WEAPONS[id];
      const isUnlocked = !!metaSave.unlocked[id];
      const isEquipped = player.weapon === id;

      const row = document.createElement('div');
      row.className = 'unlock-item';
      row.innerHTML = `
        <div class="info">
          <strong style="color:${w.color}">[${w.key}] ${w.name}</strong>
          <span>${w.desc}</span>
        </div>
      `;

      const btn = document.createElement('button');
      btn.className = 'btn';

      if (isUnlocked) {
        btn.textContent = isEquipped ? 'Equipped' : 'Equip';
        btn.disabled = isEquipped;
        btn.onclick = () => {
          this.callbacks.onEquipWeapon(id);
        };
      } else {
        btn.textContent = `Unlock (${w.cost} ⚙️)`;
        btn.disabled = metaSave.scrap < w.cost;
        btn.onclick = () => {
          this.callbacks.onUnlockWeapon(id);
        };
      }

      row.appendChild(btn);
      this.unlockList!.appendChild(row);
    });
  }

  /**
   * Renders the permanent bike tuning meta upgrades.
   */
  private renderMetaUpgrades(metaSave: MetaSaveState): void {
    if (!this.metaUpgradeList) return;
    this.metaUpgradeList.innerHTML = '';

    Object.values(META_UPGRADES).forEach(up => {
      const rank = metaSave.ranks[up.id] || 0;
      const isMax = rank >= up.maxRank;
      const cost = calcUpgradeCost(up, rank);

      const row = document.createElement('div');
      row.className = 'unlock-item';
      row.innerHTML = `
        <div class="info">
          <strong>${up.name} <span style="display:inline;color:#7bdff2;">(Lv ${rank}/${up.maxRank})</span></strong>
          <span>${up.desc}</span>
        </div>
      `;

      const btn = document.createElement('button');
      btn.className = 'btn';

      if (isMax) {
        btn.textContent = 'MAXED';
        btn.disabled = true;
      } else {
        btn.textContent = `Upgrade (${cost} ⚙️)`;
        btn.disabled = metaSave.scrap < cost;
        btn.onclick = () => {
          this.callbacks.onBuyUpgrade(up.id);
        };
      }

      row.appendChild(btn);
      this.metaUpgradeList!.appendChild(row);
    });
  }

  /**
   * Draws the interactive motorcycle preview on the bike lift canvas.
   */
  public drawBikeLift(metaSave: MetaSaveState): void {
    if (!this.bikeCanvas || !this.bikeCtx) return;
    const c = this.bikeCanvas;
    const g = this.bikeCtx;
    const cw = (c as any)._lw || 300;
    const ch = (c as any)._lh || 190;

    g.setTransform(c.width / cw, 0, 0, c.height / ch, 0, 0);
    g.clearRect(0, 0, cw, ch);

    const colorOf = (slot: EquipSlot): string => {
      const it = metaSave.equipped[slot];
      return it ? RARITY[it.rarity].color : '#5b606c';
    };

    const glow = (slot: EquipSlot) => {
      const it = metaSave.equipped[slot];
      g.shadowColor = it ? RARITY[it.rarity].color : 'transparent';
      g.shadowBlur = it && it.rarity >= 2 ? 14 : 0;
    };

    // 1. Hydraulic Lift Platform with Caution Stripes
    g.fillStyle = '#3a3d46';
    g.fillRect(20, 168, 260, 10);
    g.fillStyle = '#ffd60a';
    for (let x = 20; x < 280; x += 26) {
      g.fillRect(x, 168, 13, 10);
    }

    g.lineCap = 'round';
    g.lineJoin = 'round';

    // 2. Bike Frame
    g.save();
    glow('frame');
    g.strokeStyle = colorOf('frame');
    g.lineWidth = 7;
    g.beginPath();
    g.moveTo(70, 140);
    g.lineTo(135, 95);
    g.lineTo(195, 95);
    g.lineTo(230, 140);
    g.lineTo(135, 140);
    g.closePath();
    g.stroke();
    g.restore();

    // 3. Engine Block
    g.save();
    glow('engine');
    g.fillStyle = colorOf('engine');
    g.fillRect(125, 110, 45, 30);
    g.strokeStyle = '#1a1b20';
    g.lineWidth = 2;
    g.strokeRect(125, 110, 45, 30);
    // Cylinder fins
    for (let f = 0; f < 3; f++) {
      g.fillStyle = '#fff';
      g.fillRect(130, 116 + f * 7, 35, 2);
    }
    g.restore();

    // 4. Exhaust Pipe
    g.save();
    glow('exhaust');
    g.strokeStyle = colorOf('exhaust');
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(150, 135);
    g.lineTo(100, 145);
    g.lineTo(65, 138);
    g.stroke();
    g.restore();

    // 5. Fuel Tank
    g.save();
    glow('tank');
    g.fillStyle = colorOf('tank');
    g.beginPath();
    g.moveTo(135, 95);
    g.quadraticCurveTo(165, 75, 195, 95);
    g.closePath();
    g.fill();
    g.strokeStyle = '#222';
    g.lineWidth = 2;
    g.stroke();
    g.restore();

    // 6. Handlebars & Fork
    g.save();
    glow('handlebars');
    g.strokeStyle = colorOf('handlebars');
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(195, 95);
    g.lineTo(210, 65);
    g.moveTo(200, 68);
    g.lineTo(220, 68);
    g.stroke();
    g.restore();

    // 7. Wheels & Tires
    g.save();
    glow('tires');
    const drawWheel = (wx: number, wy: number) => {
      // Outer tire rubber
      g.strokeStyle = '#1b1c20';
      g.lineWidth = 9;
      g.beginPath();
      g.arc(wx, wy, 28, 0, Math.PI * 2);
      g.stroke();

      // Rim colored by part rarity
      g.strokeStyle = colorOf('tires');
      g.lineWidth = 3.5;
      g.beginPath();
      g.arc(wx, wy, 22, 0, Math.PI * 2);
      g.stroke();

      // Spokes
      g.lineWidth = 1.5;
      for (let s = 0; s < 4; s++) {
        const a = (s * Math.PI) / 4;
        g.beginPath();
        g.moveTo(wx + Math.cos(a) * 20, wy + Math.sin(a) * 20);
        g.lineTo(wx - Math.cos(a) * 20, wy - Math.sin(a) * 20);
        g.stroke();
      }
    };
    drawWheel(70, 140);
    drawWheel(230, 140);
    g.restore();
  }
}
