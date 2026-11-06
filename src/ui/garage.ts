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
 * Visual layer: anime fighting-game "GARAGE BAY" menu (see src/styles/garage.css).
 * The bike lift canvas is a cel-shaded sport bike on a scissor lift with a
 * speed-line burst; connector lines join each of the 6 slot frames to its part.
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
  UnlockableWeaponId,
  StatKey,
  BikeLiveryId
} from '../types/game';

import { WEAPONS, UNLOCKABLE_IDS } from '../data/weapons';
import { META_UPGRADES, calcUpgradeCost, DUO_SYNERGIES, getActiveDuoSynergies } from '../data/upgrades';
import {
  EQUIP_SLOTS,
  RARITY,
  MAX_STASH,
  fmtStat,
  itemScore,
  LEGENDARY_SLOT_PASSIVES,
  getEquippedSetBonus
} from '../data/equipment';
import { EQUIP_SLOT_HI_FI_SVG, WEAPON_HI_FI_SVG } from './icons';
import { SET08_ASSETS } from './set08Assets';

export interface BikeLiveryDef {
  id: BikeLiveryId;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
}

export const BIKE_LIVERIES: readonly BikeLiveryDef[] = [
  { id: 'crimson_kaneda', name: 'KANEDA RED', primary: '#ff5c00', secondary: '#b33000', accent: '#ffd60a' },
  { id: 'cyber_neon', name: 'CYBER NEON', primary: '#00bbf9', secondary: '#00509d', accent: '#00f5d4' },
  { id: 'golden_valhalla', name: 'VALHALLA GOLD', primary: '#ffbe0b', secondary: '#b5651d', accent: '#ffee99' },
  { id: 'midnight_stealth', name: 'NIGHT STEALTH', primary: '#7b2cbf', secondary: '#240046', accent: '#e0aaff' },
  { id: 'toxic_hazard', name: 'TOXIC HAZARD', primary: '#38b000', secondary: '#004b23', accent: '#b5e48c' }
] as const;

export interface WeaponMasteryInfo {
  tier: 0 | 1 | 2 | 3;
  label: string;
  stars: string;
  dmgBonusPct: number;
  kills: number;
}

export function getWeaponMasteryTier(kills: number = 0): WeaponMasteryInfo {
  const safeKills = Math.max(0, Math.floor(Number(kills) || 0));
  if (safeKills >= 100) {
    return { tier: 3, label: 'MASTER III', stars: '★★★', dmgBonusPct: 15, kills: safeKills };
  }
  if (safeKills >= 40) {
    return { tier: 2, label: 'ADEPT II', stars: '★★☆', dmgBonusPct: 10, kills: safeKills };
  }
  if (safeKills >= 10) {
    return { tier: 1, label: 'ROOKIE I', stars: '★☆☆', dmgBonusPct: 5, kills: safeKills };
  }
  return { tier: 0, label: 'UNRANKED', stars: '☆☆☆', dmgBonusPct: 0, kills: safeKills };
}

export interface RunPostMortemSummary {
  rankGrade: 'S' | 'A' | 'B' | 'C';
  headline: string;
  statsLine: string;
}

export function buildRunPostMortemSummary(
  floorNum: number,
  player: PlayerState,
  _metaSave?: MetaSaveState
): RunPostMortemSummary {
  const safeFloor = Math.max(1, Math.floor(Number(floorNum) || 1));
  const kills = Math.max(0, Math.floor(Number(player?.killCount) || 0));
  const wepName = (WEAPONS[player?.weapon] || WEAPONS.pistol).name.toUpperCase();
  let rankGrade: 'S' | 'A' | 'B' | 'C' = 'C';
  let headline = 'ROOKIE WIPEOUT';
  if (safeFloor >= 5 || kills >= 40) {
    rankGrade = 'S';
    headline = 'VALHALLA OUTLAW LEGEND';
  } else if (safeFloor >= 3 || kills >= 20) {
    rankGrade = 'A';
    headline = 'HIGH-OCTANE VETERAN';
  } else if (safeFloor >= 2 || kills >= 8) {
    rankGrade = 'B';
    headline = 'HIGHWAY CONTENDER';
  }
  const statsLine = `FLOOR ${safeFloor} · ${kills} KILLS · ${wepName} · GRADE ${rankGrade}`;
  return { rankGrade, headline, statsLine };
}

export interface StashSalvageSummary {
  itemCount: number;
  totalSalvageScrap: number;
  highestRarity: number;
}

export function getStashSalvageSummary(stash: EquipmentItem[] = []): StashSalvageSummary {
  if (!Array.isArray(stash) || stash.length === 0) {
    return { itemCount: 0, totalSalvageScrap: 0, highestRarity: -1 };
  }
  let totalSalvageScrap = 0;
  let highestRarity = -1;
  for (const item of stash) {
    const r = item?.rarity ?? 0;
    totalSalvageScrap += RARITY[r]?.sell ?? 0;
    if (r > highestRarity) highestRarity = r;
  }
  return { itemCount: stash.length, totalSalvageScrap, highestRarity };
}

/**
 * Returns all items in the stash where the corresponding equipment slot is equipped
 * and the stash item's score is strictly lower than the equipped item's score (downgrade).
 */
export function getDowngradeStashItems(
  stash: EquipmentItem[],
  equipped: Partial<Record<EquipSlot, EquipmentItem | null>>
): EquipmentItem[] {
  if (!Array.isArray(stash) || stash.length === 0 || !equipped) {
    return [];
  }
  return stash.filter(item => {
    if (!item || !item.slot) return false;
    const eqItem = equipped[item.slot];
    if (!eqItem) return false;
    return itemScore(item) < itemScore(eqItem);
  });
}

export interface GarageCallbacks {
  onEquipItem: (item: EquipmentItem) => void;
  onUnequipSlot: (slotId: EquipSlot) => void;
  onSellItem: (item: EquipmentItem) => void;
  onUnlockWeapon: (weaponId: UnlockableWeaponId) => void;
  onEquipWeapon: (weaponId: WeaponId) => void;
  onBuyUpgrade: (upgradeId: MetaUpgradeId) => void;
  onSelectLivery?: (liveryId: BikeLiveryId) => void;
  onResumeRun: () => void;
  onNewRun: () => void;
  onResetSave: () => void;
  onPlayUiClick?: () => void;
  onPlayShopBuy?: () => void;
}

/** Slot layout around the bike (matches the GARAGE BAY concept art). */
const LEFT_SLOTS: readonly EquipSlot[] = ['tires', 'engine', 'exhaust'];
const RIGHT_SLOTS: readonly EquipSlot[] = ['handlebars', 'frame', 'tank'];

/** Logical drawing space of the bike lift illustration. */
const BIKE_W = 400;
const BIKE_H = 300;

/** Where each slot's connector line lands around the bike perimeter (logical coords, non-crossing). */
const PART_ANCHORS: Record<EquipSlot, readonly [number, number]> = {
  tires: [118, 78],
  engine: [134, 150],
  exhaust: [142, 216],
  handlebars: [274, 78],
  frame: [268, 150],
  tank: [258, 216]
};

/** Neutral paint for empty (uninstalled) parts, chosen to keep the bike readable. */
const EMPTY_PART_COLOR: Record<EquipSlot, string> = {
  tires: '#ff6b2b',
  engine: '#7d8390',
  exhaust: '#b8bec9',
  handlebars: '#3b3f4a',
  frame: '#4a4f5a',
  tank: '#ff8a3d'
};

const INK = '#0a0b10';

const GEAR_SVG =
  '<svg class="gx-gear" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/></svg>';

const LOCK_SVG =
  '<svg class="gx-lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="#0a0b10" stroke-width="2.5"/><rect x="4" y="10" width="16" height="11" rx="2" fill="#ffffff" stroke="#0a0b10" stroke-width="2.5"/><circle cx="12" cy="15.5" r="2" fill="#0a0b10"/></svg>';

const CHECK_SVG =
  '<svg class="gx-lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#ffd60a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Escapes text before interpolating it into innerHTML templates. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Formats an item's stat block as "a, b, c". */
function statsText(stats: EquipmentItem['stats']): string {
  return (Object.entries(stats) as [StatKey, number | undefined][])
    .map(([k, v]) => fmtStat(k, v ?? 0))
    .join(', ');
}

function slotIcon(slot: EquipSlot): string {
  return EQUIP_SLOT_HI_FI_SVG[slot] || '';
}

export class GarageController {
  private overlay: HTMLElement | null = null;
  private modalTitle: HTMLElement | null = null;
  private modalScrap: HTMLElement | null = null;
  private koBurst: HTMLElement | null = null;
  private koFloor: HTMLElement | null = null;
  private slotsLeft: HTMLElement | null = null;
  private slotsRight: HTMLElement | null = null;
  private bikeCanvas: HTMLCanvasElement | null = null;
  private bikeCtx: CanvasRenderingContext2D | null = null;
  private liveryBar: HTMLElement | null = null;
  private eqTotals: HTMLElement | null = null;
  private stashList: HTMLElement | null = null;
  private unlockList: HTMLElement | null = null;
  private metaUpgradeList: HTMLElement | null = null;
  private resumeBtn: HTMLButtonElement | null = null;
  private backBtn: HTMLButtonElement | null = null;
  private newRunBtn: HTMLButtonElement | null = null;
  private resetSaveBtn: HTMLButtonElement | null = null;

  private isVisible: boolean = false;
  private isDead: boolean = false;
  private callbacks: GarageCallbacks;
  private set08BikeImg: HTMLImageElement | null = null;
  private set08BikeLoaded: boolean = false;
  private lastMetaSave: MetaSaveState | null = null;
  private lastPlayer: PlayerState | null = null;
  private confirmResetPending: boolean = false;
  private confirmResetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: GarageCallbacks) {
    this.callbacks = callbacks;

    if (typeof Image !== 'undefined') {
      const img = new Image();
      img.onload = () => {
        this.set08BikeLoaded = true;
        if (this.lastMetaSave && this.isVisible) {
          this.drawBikeLift(this.lastMetaSave);
        }
      };
      img.src = SET08_ASSETS.bike_player || '/assets/set08/bike_player.png';
      this.set08BikeImg = img;
    }

    if (typeof document !== 'undefined') {
      this.overlay = document.getElementById('garage-overlay');
      this.modalTitle = document.getElementById('modal-title');
      this.modalScrap = document.getElementById('modal-scrap');
      this.koBurst = document.getElementById('garage-ko') || document.getElementById('ko-burst');
      this.koFloor = document.getElementById('garage-ko-floor') || document.getElementById('ko-floor');
      this.slotsLeft = document.getElementById('slots-left');
      this.slotsRight = document.getElementById('slots-right');
      this.bikeCanvas = document.getElementById('bike-canvas') as HTMLCanvasElement | null;
      if (this.bikeCanvas) {
        this.bikeCtx = this.bikeCanvas.getContext('2d');
      }
      this.liveryBar = document.getElementById('livery-bar');
      this.eqTotals = document.getElementById('eq-totals');
      this.stashList = document.getElementById('stash-list');
      this.unlockList = document.getElementById('unlock-list');
      this.metaUpgradeList = document.getElementById('meta-upgrade-list');
      this.resumeBtn = document.getElementById('btn-resume') as HTMLButtonElement | null;
      this.backBtn = document.getElementById('btn-back') as HTMLButtonElement | null;
      this.newRunBtn = document.getElementById('btn-new-run') as HTMLButtonElement | null;
      this.resetSaveBtn = document.getElementById('btn-reset-save') as HTMLButtonElement | null;

      this.resumeBtn?.addEventListener('click', () => {
        this.callbacks.onPlayUiClick?.();
        if (this.isDead) {
          this.callbacks.onNewRun();
        } else {
          this.callbacks.onResumeRun();
        }
        this.close();
      });

      this.backBtn?.addEventListener('click', () => {
        this.callbacks.onPlayUiClick?.();
        if (this.isDead) {
          this.callbacks.onNewRun();
        }
        this.close();
      });

      this.newRunBtn?.addEventListener('click', () => {
        this.callbacks.onPlayUiClick?.();
        this.callbacks.onNewRun();
        this.close();
      });

      this.resetSaveBtn?.addEventListener('click', () => {
        this.callbacks.onPlayUiClick?.();
        if (!this.confirmResetPending) {
          this.confirmResetPending = true;
          const originalLabel = this.resetSaveBtn?.dataset.origLabel || this.resetSaveBtn?.textContent || 'Reset';
          if (this.resetSaveBtn) {
            this.resetSaveBtn.dataset.origLabel = originalLabel;
            this.resetSaveBtn.textContent = 'CONFIRM FULL RESET?';
            this.resetSaveBtn.classList.add('is-confirming');
          }
          if (this.confirmResetTimer) clearTimeout(this.confirmResetTimer);
          this.confirmResetTimer = setTimeout(() => {
            this.confirmResetPending = false;
            if (this.resetSaveBtn) {
              this.resetSaveBtn.textContent = this.resetSaveBtn.dataset.origLabel || 'Reset';
              this.resetSaveBtn.classList.remove('is-confirming');
            }
          }, 3000);
          return;
        }

        if (this.confirmResetTimer) {
          clearTimeout(this.confirmResetTimer);
          this.confirmResetTimer = null;
        }
        this.confirmResetPending = false;
        if (this.resetSaveBtn) {
          this.resetSaveBtn.textContent = this.resetSaveBtn.dataset.origLabel || 'Reset';
          this.resetSaveBtn.classList.remove('is-confirming');
        }
        this.callbacks.onResetSave();
      });

      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', (ev: KeyboardEvent) => {
          if (!this.isVisible) return;
          if (ev.key === 'Enter') {
            ev.preventDefault();
            this.callbacks.onPlayUiClick?.();
            if (this.isDead) {
              this.callbacks.onNewRun();
            } else {
              this.callbacks.onResumeRun();
            }
            this.close();
          }
        });
      }
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
    this.lastPlayer = player;

    if (this.overlay) {
      this.overlay.classList.add('visible');
      this.overlay.classList.toggle('is-dead', isDead);
    }

    if (this.modalTitle) {
      this.modalTitle.textContent = 'GARAGE BAY';
    }

    const postMortem = buildRunPostMortemSummary(floorNum, player, metaSave);

    // Fighting-game style defeat burst ("K.O." + floor reached)
    if (this.koBurst) {
      this.koBurst.hidden = !isDead;
      this.koBurst.setAttribute('data-run-grade', postMortem.rankGrade);
    }
    if (this.koFloor) {
      this.koFloor.textContent = `RUN OVER \u00b7 ${postMortem.statsLine}`;
    }

    if (this.resumeBtn) {
      const label = isDead ? 'RIDE OUT (NEW RUN)' : 'RIDE OUT';
      this.resumeBtn.innerHTML = `<span class="gx-btn-key">[ENTER]</span> <span class="gx-btn-text">${label}</span>`;
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
   * Builds the rich Outlaw Duo Synergies & Career Telemetry HTML tooltip.
   */
  public buildSynergyCodexTooltip(metaSave: MetaSaveState, player?: PlayerState | null): string {
    const telemetry = `Runs: ${metaSave.totalRuns || 0} · Best Floor: ${metaSave.bestFloor || 1} · Bosses Slain: ${metaSave.bossesSlain || 0}`;
    const activeDuoIds = new Set(player ? getActiveDuoSynergies(player).map(d => d.id) : []);

    const DUO_TITLES: Record<string, string> = {
      thermal_shock: 'Thermal Shock',
      superconductor: 'Superconductor',
      void_vortex: 'Void Vortex',
      juggernaut_overdrive: 'Juggernaut Overdrive',
      voltaic_wake: 'Voltaic Wake'
    };

    const duoHtml = DUO_SYNERGIES.map(d => {
      const isActive = activeDuoIds.has(d.id);
      const title = DUO_TITLES[d.id] || d.name;
      const statusBadge = isActive
        ? ' <span style="color:#00f5d4;font-weight:900;">[ACTIVE]</span>'
        : '';
      return `<div style="margin-top:6px;line-height:1.3;"><b style="color:${d.color}">${esc(title)} (${esc(d.name)})</b>${statusBadge}<br/><span style="color:#d0d4dc;font-size:11px;">${esc(d.desc)}</span></div>`;
    }).join('');

    return `<div class="gx-tooltip-codex" style="text-align:left;max-width:360px;"><div style="font-family:'Impact',sans-serif;font-size:14px;letter-spacing:1px;color:#ffd60a;">CAREER TELEMETRY</div><div style="color:#a8b2d1;font-size:11px;margin-bottom:4px;">${esc(telemetry)}</div><hr style="border:0;border-top:1px solid rgba(255,255,255,0.18);margin:6px 0;"/><div style="font-family:'Impact',sans-serif;font-size:13px;letter-spacing:1px;color:#00f5d4;">OUTLAW DUO SYNERGIES</div>${duoHtml}</div>`.trim();
  }

  /**
   * Renders the Garage Bay header, scrap count, and exposes the Career & Duo tooltip.
   */
  public renderHeader(metaSave: MetaSaveState, player?: PlayerState | null): void {
    if (this.modalScrap) {
      this.modalScrap.textContent = `${metaSave.scrap}`;
    }
    const tipContent = this.buildSynergyCodexTooltip(metaSave, player);
    if (this.modalTitle) {
      this.modalTitle.textContent = 'GARAGE BAY';
      this.modalTitle.setAttribute('data-tip', tipContent);
      this.modalTitle.setAttribute(
        'title',
        `Career Telemetry: Runs: ${metaSave.totalRuns || 0} · Best Floor: ${metaSave.bestFloor || 1} · Bosses Slain: ${metaSave.bossesSlain || 0}`
      );
    }
    const subTitle = document.getElementById('modal-subtitle');
    if (subTitle) {
      subTitle.setAttribute('data-tip', tipContent);
    }
  }

  /**
   * Renders the Garage Bay footer with hint, action buttons, and exposes the Career & Duo tooltip.
   */
  public renderFooter(metaSave: MetaSaveState, player?: PlayerState | null): void {
    const tipContent = this.buildSynergyCodexTooltip(metaSave, player);
    const footerHint = document.querySelector('.gx-hint') as HTMLElement | null;
    if (footerHint) {
      footerHint.setAttribute('data-tip', tipContent);
      footerHint.setAttribute(
        'title',
        `Career Telemetry: Runs: ${metaSave.totalRuns || 0} · Best Floor: ${metaSave.bestFloor || 1} · Bosses Slain: ${metaSave.bossesSlain || 0}`
      );
    }
  }

  /**
   * Renders the entire garage workshop UI.
   */
  public render(metaSave: MetaSaveState, player?: PlayerState | null): void {
    if (player) {
      this.lastPlayer = player;
    }
    const curPlayer = player || this.lastPlayer;

    this.renderHeader(metaSave, curPlayer);
    this.renderEquipmentBay(metaSave, curPlayer);
    this.renderLiveryBar(metaSave, curPlayer || ({} as any));
    this.renderStash(metaSave);
    this.renderWeaponUnlocks(metaSave, curPlayer || ({} as any));
    this.renderMetaUpgrades(metaSave);
    this.renderFooter(metaSave, curPlayer);
    this.drawBikeLift(metaSave);
  }

  /**
   * Alias / helper for renderEquipmentBay to satisfy contract.
   */
  public renderEquipmentSlots(metaSave: MetaSaveState, player?: PlayerState | null): void {
    this.renderEquipmentBay(metaSave, player);
  }

  /**
   * Renders the 5 custom bike paint livery swatches.
   */
  private renderLiveryBar(metaSave: MetaSaveState, player: PlayerState): void {
    if (!this.liveryBar) return;
    this.liveryBar.innerHTML = '';
    const activeId: BikeLiveryId = metaSave.livery || player.livery || 'crimson_kaneda';

    for (const liv of BIKE_LIVERIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isActive = liv.id === activeId;
      btn.className = `gx-livery-btn${isActive ? ' is-active' : ''}`;
      btn.style.setProperty('--liv-col', liv.primary);
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      btn.innerHTML = `<span class="gx-livery-dot"></span><span>${esc(liv.name)}</span>`;
      btn.onclick = () => {
        this.callbacks.onPlayUiClick?.();
        metaSave.livery = liv.id;
        player.livery = liv.id;
        this.callbacks.onSelectLivery?.(liv.id);
        this.renderLiveryBar(metaSave, player);
        this.drawBikeLift(metaSave);
      };
      this.liveryBar.appendChild(btn);
    }
  }

  /**
   * Renders the 6 equipment slot bay around the bike lift canvas.
   */
  public renderEquipmentBay(metaSave: MetaSaveState, player?: PlayerState | null): void {
    if (!this.slotsLeft || !this.slotsRight) return;

    this.slotsLeft.innerHTML = '';
    this.slotsRight.innerHTML = '';

    const renderSlot = (slotId: EquipSlot, container: HTMLElement) => {
      const slotDef = EQUIP_SLOTS.find(s => s.id === slotId);
      if (!slotDef) return;
      const it = metaSave.equipped[slotDef.id];

      if (it) {
        const R = RARITY[it.rarity];
        const statsStr = statsText(it.stats);
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `eq-slot is-filled rarity-${R.id}`;
        el.style.setProperty('--rar', R.color);
        el.title = `${it.name} (${R.name}) - ${statsStr}. Click to remove.`;
        el.setAttribute('aria-label', `${slotDef.label}: ${it.name}, ${R.name}. ${statsStr}. Remove part`);
        el.innerHTML = `
          <span class="gx-slot-icon sl-icon">${slotIcon(slotDef.id)}</span>
          <span class="sl-name">${esc(it.name)}</span>
          <span class="sl-stats">${esc(statsStr)}</span>
          <span class="sl-label">${esc(slotDef.label.toUpperCase())}</span>
        `;
        el.onclick = () => {
          this.callbacks.onUnequipSlot(slotDef.id);
        };
        container.appendChild(el);
      } else {
        const el = document.createElement('div');
        el.className = 'eq-slot is-empty';
        el.setAttribute('aria-label', `${slotDef.label}: Empty Slot`);
        el.innerHTML = `
          <span class="gx-slot-icon sl-icon">${slotIcon(slotDef.id)}</span>
          <span class="sl-name">Empty Slot</span>
          <span class="sl-stats">No part installed</span>
          <span class="sl-label">${esc(slotDef.label.toUpperCase())}</span>
        `;
        container.appendChild(el);
      }
    };

    LEFT_SLOTS.forEach(id => renderSlot(id, this.slotsLeft!));
    RIGHT_SLOTS.forEach(id => renderSlot(id, this.slotsRight!));

    // Compute total installed equipment stats
    const totals: Partial<Record<StatKey, number>> = {};
    if (metaSave.equipped) {
      Object.values(metaSave.equipped).forEach(it => {
        if (!it) return;
        (Object.entries(it.stats) as [StatKey, number | undefined][]).forEach(([k, v]) => {
          totals[k] = (totals[k] || 0) + (v || 0);
        });
      });
    }

    const totalStrings = (Object.entries(totals) as [StatKey, number][]).map(([k, v]) => fmtStat(k, v));
    const baseSummary = totalStrings.length > 0
      ? `Installed Bonuses: ${totalStrings.join(' | ')}`
      : 'Installed Bonuses: None';

    // Active legendary slot passives (rarity === 3)
    const activeLegendaries: { slot: EquipSlot; title: string; desc: string }[] = [];
    if (metaSave.equipped) {
      (Object.entries(metaSave.equipped) as [EquipSlot, EquipmentItem | undefined][]).forEach(([slotKey, item]) => {
        if (item && item.rarity === 3) {
          const passive = LEGENDARY_SLOT_PASSIVES[slotKey];
          if (passive) {
            activeLegendaries.push({ slot: slotKey, title: passive.title, desc: passive.desc });
          }
        }
      });
    }

    // Equipped set bonuses
    const setBonus = getEquippedSetBonus(metaSave.equipped);

    // Build rich summary markup & tooltip
    const curPlayer = player || this.lastPlayer;
    const tipContent = this.buildSynergyCodexTooltip(metaSave, curPlayer);
    const telemetryText = `Runs: ${metaSave.totalRuns || 0} · Best Floor: ${metaSave.bestFloor || 1} · Bosses Slain: ${metaSave.bossesSlain || 0}`;

    let summaryHtml = `<span class="gx-totals-base">${esc(baseSummary)}</span>`;
    if (setBonus && setBonus.label) {
      summaryHtml += ` <span class="gx-set-bonus" style="color:#00f5d4;">★ <b>SET:</b> ${esc(setBonus.label)}</span>`;
    }
    if (activeLegendaries.length > 0) {
      const legHtml = activeLegendaries.map(
        l => `<span class="gx-legendary-passive" style="color:#ffd60a;">⚡ <b>LEGENDARY (${esc(l.slot.toUpperCase())}):</b> ${esc(l.title)} <small>(${esc(l.desc)})</small></span>`
      ).join(' ');
      summaryHtml += ` ${legHtml}`;
    }

    let summaryEl = document.getElementById('equip-bonus-summary');
    if (!summaryEl && this.eqTotals) {
      summaryEl = this.eqTotals.querySelector('#equip-bonus-summary');
      if (!summaryEl) {
        summaryEl = document.createElement('div');
        summaryEl.id = 'equip-bonus-summary';
        summaryEl.className = 'equip-bonus-summary';
        this.eqTotals.innerHTML = '';
        this.eqTotals.appendChild(summaryEl);
      }
    }

    if (summaryEl) {
      summaryEl.innerHTML = summaryHtml;
      summaryEl.setAttribute('data-tip', tipContent);
      summaryEl.setAttribute('title', `Career Telemetry: ${telemetryText}`);
    }

    if (this.eqTotals && this.eqTotals !== summaryEl && !this.eqTotals.contains(summaryEl)) {
      this.eqTotals.innerHTML = summaryHtml;
      this.eqTotals.setAttribute('data-tip', tipContent);
      this.eqTotals.setAttribute('title', `Career Telemetry: ${telemetryText}`);
    }
  }

  /**
   * Renders the parts stash grid.
   */
  private renderStash(metaSave: MetaSaveState): void {
    if (!this.stashList) return;
    this.stashList.innerHTML = '';

    const stash = metaSave.stash || [];
    const salvage = getStashSalvageSummary(stash);
    const downgrades = getDowngradeStashItems(metaSave.stash, metaSave.equipped);
    this.stashList.setAttribute('data-stash-count', String(salvage.itemCount));
    this.stashList.setAttribute('data-downgrade-count', String(downgrades.length));
    this.stashList.setAttribute('data-total-salvage', String(salvage.totalSalvageScrap));
    this.stashList.setAttribute('data-highest-rarity', String(salvage.highestRarity));

    const GHOST_FILL = 11;

    if (stash.length === 0) {
      const msg = document.createElement('div');
      msg.className = 'gx-stash-empty';
      msg.textContent = 'Stash empty — kill bosses & elites for loot parts!';
      this.stashList.appendChild(msg);
    }

    stash.forEach(it => {
      const R = RARITY[it.rarity];
      const slotDef = EQUIP_SLOTS.find(s => s.id === it.slot);
      const slotLabel = slotDef ? slotDef.label : it.slot;
      const statsStr = statsText(it.stats);

      const eqItem = metaSave.equipped[it.slot] || null;
      const diffScore = eqItem ? itemScore(it) - itemScore(eqItem) : itemScore(it);
      let diffBadgeHtml = '';
      let vsEquippedLine = '';
      if (!eqItem || diffScore > 0.05) {
        diffBadgeHtml = '<span class="gx-stash-diff is-up">▲ UPGRADE</span>';
        vsEquippedLine = eqItem
          ? `▲ UPGRADE vs Equipped: ${eqItem.name} (${statsText(eqItem.stats)})`
          : `▲ UPGRADE (${slotLabel} slot empty)`;
      } else if (diffScore < -0.05) {
        diffBadgeHtml = '<span class="gx-stash-diff is-down">▼</span>';
        vsEquippedLine = `▼ Downgrade vs Equipped: ${eqItem.name} (${statsText(eqItem.stats)})`;
      } else {
        vsEquippedLine = `= Equal to Equipped: ${eqItem.name} (${statsText(eqItem.stats)})`;
      }

      const el = document.createElement('button');
      el.type = 'button';
      el.className = `stash-item rarity-${R.id}`;
      el.style.setProperty('--rar', R.color);
      const isDowngrade = Boolean(eqItem && itemScore(it) < itemScore(eqItem));
      el.setAttribute('data-is-downgrade', isDowngrade ? 'true' : 'false');
      el.title = `${it.name} - ${R.name} ${slotLabel}\n${statsStr}\n${vsEquippedLine}\nClick: install | Right-click / Del: sell for ${R.sell} scrap`;
      el.setAttribute('aria-label', `${it.name}, ${R.name} ${slotLabel}. ${statsStr}. ${vsEquippedLine}. Install. Press Delete to sell for ${R.sell} scrap`);
      el.innerHTML = `
        ${diffBadgeHtml}
        <div class="gx-stash-art">${EQUIP_SLOT_HI_FI_SVG[it.slot] || ''}</div>
        <b>${esc(it.name)}</b>
        <span class="gx-stash-meta">${esc(R.name)} ${esc(slotLabel)}</span>
        <span class="gx-stash-stats">${esc(statsStr)}</span>
        <span class="gx-stash-sell">${GEAR_SVG}${R.sell}</span>
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

      // Keyboard parity for selling
      el.onkeydown = (ev) => {
        if (ev.key === 'Delete' || ev.key === 'Backspace') {
          ev.preventDefault();
          this.callbacks.onSellItem(it);
        }
      };

      this.stashList!.appendChild(el);
    });

    // Ghost tiles keep the 2-row stash grid shape from the concept art
    const used = stash.length === 0 ? 3 : stash.length;
    for (let i = used; i < Math.min(GHOST_FILL, MAX_STASH); i++) {
      const ghost = document.createElement('div');
      ghost.className = 'gx-stash-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      this.stashList.appendChild(ghost);
    }
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
      const canAfford = metaSave.scrap >= w.cost;
      const rawKills = (metaSave as any).weaponKills?.[id] ?? 0;
      const mastery = getWeaponMasteryTier(rawKills);

      const row = document.createElement('div');
      const state = isEquipped ? 'is-equipped' : isUnlocked ? 'is-unlocked' : 'is-locked';
      row.className = `unlock-item gx-weapon ${state}`;
      row.setAttribute('data-mastery-tier', String(mastery.tier));
      row.style.setProperty('--wc', w.color);
      row.innerHTML = `
        <div class="gx-weapon-art">${WEAPON_HI_FI_SVG[id]}<span class="gx-weapon-status">${isUnlocked ? CHECK_SVG : LOCK_SVG}</span></div>
        <div class="info">
          <strong><span class="gx-key">${esc(w.key)}</span>${esc(w.name.toUpperCase())}</strong>
          <span>${esc(w.desc)}</span>
          <span class="gx-weapon-mastery tier-${mastery.tier}">${mastery.stars} ${mastery.label}${mastery.dmgBonusPct > 0 ? ` (+${mastery.dmgBonusPct}% DMG)` : ''} · ${mastery.kills} KILLS</span>
        </div>
      `;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';

      if (isUnlocked) {
        btn.textContent = isEquipped ? 'Equipped' : 'Equip';
        btn.disabled = isEquipped;
        btn.onclick = () => {
          this.callbacks.onEquipWeapon(id);
        };
      } else {
        btn.classList.add('gx-price');
        btn.innerHTML = `<span class="gx-price-label">Unlock</span>${GEAR_SVG}<span class="gx-price-val">${w.cost}</span>`;
        btn.setAttribute('aria-label', `Unlock ${w.name} for ${w.cost} scrap`);
        btn.disabled = !canAfford;
        if (!canAfford) btn.title = `Need ${w.cost - metaSave.scrap} more scrap`;
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

      let pips = '';
      for (let i = 0; i < up.maxRank; i++) {
        pips += `<i class="gx-pip${i < rank ? ' on' : ''}"></i>`;
      }

      const row = document.createElement('div');
      row.className = `unlock-item gx-upgrade${isMax ? ' is-max' : ''}`;
      row.innerHTML = `
        <div class="info">
          <strong>${esc(up.statLabel ? up.statLabel.toUpperCase() : up.name)}</strong>
          <div class="gx-rank" role="img" aria-label="Rank ${rank} of ${up.maxRank}">
            <span class="gx-pips">${pips}</span>
            <span class="gx-rank-txt">RANK PIPS ${rank}</span>
          </div>
          <span>${esc(up.desc)}</span>
        </div>
      `;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn gx-upgrade-btn';

      if (isMax) {
        btn.textContent = 'MAXED';
        btn.disabled = true;
      } else {
        btn.innerHTML = `<span class="gx-price-label">UPGRADE</span><span class="gx-cost">${GEAR_SVG}${cost}</span>`;
        btn.setAttribute('aria-label', `Upgrade ${up.name} for ${cost} scrap`);
        btn.disabled = metaSave.scrap < cost;
        if (btn.disabled) btn.title = `Need ${cost - metaSave.scrap} more scrap`;
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
   * The backing store is sized to the canvas's CSS box (garage.css stretches it
   * to fill the bay), so the illustration stays crisp and undistorted.
   */
  public drawBikeLift(metaSave: MetaSaveState): void {
    this.lastMetaSave = metaSave;
    if (!this.bikeCanvas || !this.bikeCtx) return;
    const c = this.bikeCanvas;
    const g = this.bikeCtx;

    const rect = c.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return; // Hidden overlay: nothing to draw
    const W = rect.width;
    const H = rect.height;
    const dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const bw = Math.round(W * dpr);
    const bh = Math.round(H * dpr);
    if (c.width !== bw) c.width = bw;
    if (c.height !== bh) c.height = bh;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    // Uniform fit of the logical illustration inside the canvas box
    const s = Math.min(W / BIKE_W, H / BIKE_H);
    const ox = (W - BIKE_W * s) / 2;
    const oy = (H - BIKE_H * s) / 2;
    const toScreen = (x: number, y: number): [number, number] => [ox + x * s, oy + y * s];

    const equipped = (slot: EquipSlot): EquipmentItem | null => metaSave.equipped[slot] || null;
    const colorOf = (slot: EquipSlot): string => {
      const it = equipped(slot);
      return it ? RARITY[it.rarity].color : EMPTY_PART_COLOR[slot];
    };
    const glow = (slot: EquipSlot) => {
      const it = equipped(slot);
      g.shadowColor = it ? RARITY[it.rarity].color : 'transparent';
      g.shadowBlur = it && it.rarity >= 1 ? 6 + it.rarity * 5 : 0;
    };
    const noGlow = () => {
      g.shadowColor = 'transparent';
      g.shadowBlur = 0;
    };

    // 0. Speed-line burst behind the bike (screen space)
    const [bcx, bcy] = toScreen(220, 150);
    const reach = Math.hypot(W, H);
    g.save();
    g.fillStyle = 'rgba(40, 28, 20, 0.16)';
    const rays = 44;
    for (let i = 0; i < rays; i++) {
      const a0 = (i / rays) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / rays * (0.25 + 0.3 * ((i * 7) % 3) / 2);
      g.beginPath();
      g.moveTo(bcx + Math.cos(a0) * 40 * s, bcy + Math.sin(a0) * 40 * s);
      g.lineTo(bcx + Math.cos(a0) * reach, bcy + Math.sin(a0) * reach);
      g.lineTo(bcx + Math.cos(a1) * reach, bcy + Math.sin(a1) * reach);
      g.closePath();
      g.fill();
    }
    g.restore();

    // 1. Connector lines from the slot frames to each part (aligned to live DOM slot centers)
    const drawConnector = (slot: EquipSlot, side: 'left' | 'right', idx: number) => {
      const colEl = side === 'left' ? this.slotsLeft : this.slotsRight;
      const slotEl = colEl?.querySelectorAll('.eq-slot')[idx] as HTMLElement | undefined;
      let sy = (H * (idx * 2 + 1)) / 6;
      if (slotEl) {
        const sr = slotEl.getBoundingClientRect();
        if (sr.height > 2) {
          sy = sr.top + sr.height / 2 - rect.top;
        }
      }
      const sx = side === 'left' ? 0 : W;
      const [ax, ay] = toScreen(PART_ANCHORS[slot][0], PART_ANCHORS[slot][1]);
      const kneeX = side === 'left' ? Math.min(ax - 14, sx + 38) : Math.max(ax + 14, sx - 38);
      const it = equipped(slot);
      const lineCol = it ? RARITY[it.rarity].color : 'rgba(255, 214, 10, 0.65)';
      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(kneeX, sy);
      g.lineTo(ax, ay);
      g.strokeStyle = INK;
      g.lineWidth = 4.5;
      g.stroke();
      g.strokeStyle = lineCol;
      g.lineWidth = 2;
      g.stroke();
      g.beginPath();
      g.arc(ax, ay, 4.5, 0, Math.PI * 2);
      g.fillStyle = it ? RARITY[it.rarity].color : '#ffd60a';
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.stroke();
      g.restore();
    };

    // Logical-space illustration
    g.save();
    g.translate(ox, oy);
    g.scale(s, s);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    const poly = (pts: readonly (readonly [number, number])[]) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.closePath();
    };
    const inkFill = (fill: string, lw: number = 3.5) => {
      g.fillStyle = fill;
      g.fill();
      noGlow();
      g.strokeStyle = INK;
      g.lineWidth = lw;
      g.stroke();
    };
    const inkLine = (color: string, width: number) => {
      g.strokeStyle = INK;
      g.lineWidth = width + 4;
      g.stroke();
      noGlow();
      g.strokeStyle = color;
      g.lineWidth = width;
      g.stroke();
    };

    // 2. Scissor lift (legs, base, platform with caution stripes)
    g.beginPath();
    g.moveTo(122, 246);
    g.lineTo(298, 286);
    g.moveTo(298, 246);
    g.lineTo(122, 286);
    inkLine('#6c7787', 6);
    poly([[104, 284], [316, 284], [316, 292], [104, 292]]);
    inkFill('#56606e', 3);
    [[114, 296], [306, 296]].forEach(([x, y]) => {
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      inkFill('#22252c', 2.5);
    });
    poly([[86, 236], [334, 236], [334, 249], [86, 249]]);
    inkFill('#8893a3', 3);
    g.save();
    poly([[88, 243], [332, 243], [332, 248], [88, 248]]);
    g.clip();
    g.fillStyle = '#ffd60a';
    for (let x = 80; x < 340; x += 18) {
      g.beginPath();
      g.moveTo(x, 248);
      g.lineTo(x + 9, 248);
      g.lineTo(x + 14, 243);
      g.lineTo(x + 5, 243);
      g.closePath();
      g.fill();
    }
    g.restore();

    // 2.5 Set 08 High-Res Spider-Verse Halftone Comic Pop-Art Motorcycle Sprite Overlay
    if (this.set08BikeLoaded && this.set08BikeImg && this.set08BikeImg.naturalWidth > 0) {
      g.restore();

      // Draw slot connectors BEHIND the Set 08 bike so lines never cross over the bike artwork
      LEFT_SLOTS.forEach((slot, i) => drawConnector(slot, 'left', i));
      RIGHT_SLOTS.forEach((slot, i) => drawConnector(slot, 'right', i));

      const activeLivery =
        BIKE_LIVERIES.find(l => l.id === metaSave.livery) || BIKE_LIVERIES[0];

      g.save();
      g.translate(ox, oy);
      g.scale(s, s);
      // Ben-Day Halftone Dot Matrix Halo behind the Set 08 Bike (tinted by active livery)
      for (let hx = 85; hx <= 325; hx += 10) {
        for (let hy = 25; hy <= 220; hy += 10) {
          const dist = Math.hypot(hx - 205, (hy - 125) * 1.2);
          if (dist < 115) {
            const dotR = Math.max(0.8, (1 - dist / 115) * 2.4);
            g.beginPath();
            g.arc(hx, hy, dotR, 0, Math.PI * 2);
            g.fillStyle = (hx + hy) % 20 === 0 ? activeLivery.accent : activeLivery.primary;
            g.globalAlpha = 0.26;
            g.fill();
          }
        }
      }
      g.globalAlpha = 1;
      // Chromatic Livery Rim-Light Aura beneath the Set 08 Bike seated on the lift
      g.shadowColor = activeLivery.primary;
      g.shadowBlur = 22;
      g.drawImage(this.set08BikeImg, 36, -32, 328, 308);
      g.restore();
      return;
    }

    // 3. Wheels & tires (Procedural fallback when image hasn't loaded yet)
    const tireAccent = colorOf('tires');
    const drawWheel = (wx: number, wy: number, front: boolean) => {
      g.save();
      glow('tires');
      g.beginPath();
      g.arc(wx, wy, 40, 0, Math.PI * 2);
      g.fillStyle = '#141318';
      g.fill();
      noGlow();
      g.strokeStyle = INK;
      g.lineWidth = 3.5;
      g.stroke();
      // Sidewall stripe (rarity accent when tires installed)
      g.beginPath();
      g.arc(wx, wy, 33, 0, Math.PI * 2);
      g.strokeStyle = equipped('tires') ? tireAccent : '#3a3844';
      g.lineWidth = 3;
      g.stroke();
      // Rim
      g.beginPath();
      g.arc(wx, wy, 28, 0, Math.PI * 2);
      g.fillStyle = '#26242c';
      g.fill();
      if (front) {
        g.beginPath();
        g.arc(wx, wy, 17, 0, Math.PI * 2);
        g.strokeStyle = '#b8bec9';
        g.lineWidth = 4;
        g.stroke();
      }
      for (let k = 0; k < 5; k++) {
        const a = (k * Math.PI * 2) / 5 - Math.PI / 2;
        g.beginPath();
        g.moveTo(wx + Math.cos(a) * 6, wy + Math.sin(a) * 6);
        g.lineTo(wx + Math.cos(a) * 27, wy + Math.sin(a) * 27);
        g.strokeStyle = INK;
        g.lineWidth = 7;
        g.stroke();
        g.strokeStyle = tireAccent;
        g.lineWidth = 4;
        g.stroke();
      }
      g.beginPath();
      g.arc(wx, wy, 28, 0, Math.PI * 2);
      g.strokeStyle = tireAccent;
      g.lineWidth = 3;
      g.stroke();
      g.beginPath();
      g.arc(wx, wy, 6, 0, Math.PI * 2);
      inkFill('#c9ced8', 2.5);
      g.restore();
    };
    drawWheel(128, 196, false);
    drawWheel(300, 196, true);

    // 4. Swingarm / trellis frame
    g.save();
    glow('frame');
    poly([[124, 190], [128, 203], [204, 190], [202, 174]]);
    inkFill(colorOf('frame'));
    g.beginPath();
    g.moveTo(200, 176);
    g.lineTo(226, 136);
    g.lineTo(292, 118);
    inkLine(colorOf('frame'), 5);
    g.restore();

    // 5. Exhaust (header pipe + side can)
    g.save();
    glow('exhaust');
    g.beginPath();
    g.moveTo(236, 206);
    g.quadraticCurveTo(200, 222, 156, 196);
    inkLine(colorOf('exhaust'), 6);
    glow('exhaust');
    poly([[160, 186], [104, 164], [96, 182], [152, 204]]);
    inkFill(colorOf('exhaust'));
    g.beginPath();
    g.ellipse(100, 173, 5, 9, 0.38, 0, Math.PI * 2);
    inkFill('#26242c', 2.5);
    g.beginPath();
    g.moveTo(150, 190);
    g.lineTo(112, 175);
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 2;
    g.stroke();
    g.restore();

    // 6. Engine block
    g.save();
    glow('engine');
    poly([[182, 160], [246, 156], [256, 196], [236, 214], [194, 210], [178, 186]]);
    inkFill(colorOf('engine'));
    g.strokeStyle = 'rgba(10, 11, 16, 0.75)';
    g.lineWidth = 2.5;
    for (let f = 0; f < 4; f++) {
      g.beginPath();
      g.moveTo(188, 168 + f * 9);
      g.lineTo(244, 166 + f * 9);
      g.stroke();
    }
    g.beginPath();
    g.arc(214, 198, 8, 0, Math.PI * 2);
    inkFill('#c9ced8', 2.5);
    g.restore();

    // 7. Front fork (gold USD forks)
    g.beginPath();
    g.moveTo(300, 196);
    g.lineTo(318, 108);
    inkLine('#ffb627', 7);

    // 8. Tail section + seat (uses active livery colors)
    const activeLivery = BIKE_LIVERIES.find(l => l.id === (metaSave.livery || 'crimson_kaneda')) || BIKE_LIVERIES[0];
    poly([[94, 116], [150, 122], [200, 126], [204, 150], [166, 158], [128, 150], [108, 134]]);
    inkFill(activeLivery.primary);
    poly([[128, 150], [166, 158], [204, 150], [204, 142], [150, 146], [112, 136]]);
    g.fillStyle = activeLivery.secondary;
    g.fill();
    poly([[146, 120], [206, 122], [216, 132], [150, 130]]);
    inkFill('#1d1b22', 3);

    // 9. Main fairing (cel shaded) — uses active livery primary/secondary colors
    poly([[214, 128], [252, 110], [300, 104], [334, 116], [356, 134], [344, 150], [314, 160], [290, 188], [262, 198], [244, 172], [222, 150]]);
    inkFill(activeLivery.primary);
    poly([[244, 172], [262, 198], [290, 188], [314, 160], [344, 150], [304, 162], [270, 176]]);
    g.fillStyle = activeLivery.secondary;
    g.fill();
    poly([[262, 150], [300, 140], [292, 152], [258, 162]]);
    g.fillStyle = INK;
    g.fill();
    g.beginPath();
    g.moveTo(258, 118);
    g.lineTo(330, 122);
    g.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    g.lineWidth = 3;
    g.stroke();
    // re-ink the fairing outline over the shading
    poly([[214, 128], [252, 110], [300, 104], [334, 116], [356, 134], [344, 150], [314, 160], [290, 188], [262, 198], [244, 172], [222, 150]]);
    g.strokeStyle = INK;
    g.lineWidth = 3.5;
    g.stroke();

    // 10. Fuel tank
    g.save();
    glow('tank');
    g.beginPath();
    g.moveTo(204, 124);
    g.quadraticCurveTo(226, 98, 262, 102);
    g.lineTo(270, 114);
    g.lineTo(252, 138);
    g.lineTo(210, 140);
    g.closePath();
    inkFill(equipped('tank') ? colorOf('tank') : activeLivery.primary);
    g.beginPath();
    g.moveTo(218, 116);
    g.quadraticCurveTo(234, 106, 254, 107);
    g.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    g.lineWidth = 3;
    g.stroke();
    g.restore();

    // 11. Windscreen + headlight
    poly([[300, 104], [318, 84], [340, 112], [334, 116]]);
    inkFill('rgba(46, 230, 255, 0.55)', 3);
    poly([[340, 128], [356, 134], [348, 142]]);
    inkFill('#ffd60a', 2.5);

    // 12. Clip-on handlebars
    g.save();
    glow('handlebars');
    g.beginPath();
    g.moveTo(318, 106);
    g.lineTo(298, 92);
    inkLine(colorOf('handlebars'), 5);
    g.beginPath();
    g.arc(296, 91, 4, 0, Math.PI * 2);
    inkFill(colorOf('handlebars'), 2.5);
    g.restore();

    // 13. Cel-shaded anime racer leaning against the bike (matches concept art)
    g.save();
    // Helmet
    g.beginPath();
    g.arc(282, 88, 15, 0, Math.PI * 2);
    inkFill('#ff6b2b', 3.5);
    // Helmet Visor
    poly([[273, 82], [295, 82], [293, 94], [275, 94]]);
    inkFill('#0a0b10', 2);
    g.beginPath();
    g.moveTo(277, 85);
    g.lineTo(291, 85);
    g.strokeStyle = '#2ee6ff';
    g.lineWidth = 1.5;
    g.stroke();

    // Collar
    poly([[275, 102], [289, 102], [291, 108], [273, 108]]);
    inkFill('#1d1b22', 2.5);

    // Torso / Jacket
    poly([[267, 108], [297, 108], [302, 142], [262, 142]]);
    inkFill('#ff6b2b', 3.5);
    // Shoulder armor pads
    poly([[265, 108], [275, 108], [273, 120], [263, 118]]);
    inkFill('#1d1b22', 2);
    poly([[289, 108], [299, 108], [301, 118], [291, 120]]);
    inkFill('#1d1b22', 2);
    // Crossed arms
    poly([[265, 118], [299, 118], [295, 136], [269, 136]]);
    inkFill('#ff6b2b', 3);
    poly([[273, 124], [291, 124], [289, 135], [275, 135]]);
    inkFill('#1d1b22', 2);

    // Belt
    poly([[263, 142], [301, 142], [301, 147], [263, 147]]);
    inkFill('#1d1b22', 2.5);

    // Left leg
    poly([[279, 147], [297, 147], [295, 215], [281, 215]]);
    inkFill('#ff6b2b', 3.5);
    // Left boot
    poly([[279, 215], [297, 215], [303, 238], [277, 238]]);
    inkFill('#1d1b22', 3);

    // Right leg (bent knee resting on bike footpeg)
    poly([[265, 147], [279, 147], [267, 185], [253, 180]]);
    inkFill('#e05318', 3);
    poly([[253, 180], [267, 185], [271, 210], [259, 210]]);
    inkFill('#ff6b2b', 3);
    poly([[259, 210], [271, 210], [273, 226], [257, 226]]);
    inkFill('#1d1b22', 3);
    g.restore();

    g.restore();

    // Connectors drawn last so they read above the burst and bike edges
    LEFT_SLOTS.forEach((slot, i) => drawConnector(slot, 'left', i));
    RIGHT_SLOTS.forEach((slot, i) => drawConnector(slot, 'right', i));
  }
}
