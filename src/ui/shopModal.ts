/**
 * MOTO-ROGUE: Shop Confirmation Modal Controller
 *
 * Prompts user confirmation with cost and item description before purchasing
 * shop mods, weapons, or hull repairs in Shop rooms.
 * Parity reference: moto-rogue/index.html L309-L402, L1267-L1330
 */

import { Pickup, PlayerState } from '../types/game';
import { WEAPONS, WEAPON_EVOLUTIONS } from '../data/weapons';
import { WEAPON_HI_FI_SVG, getModIconSvg } from './icons';
import { SET08_ASSETS } from './set08Assets';
import { formatModStatDeltas, getModEvolutionTarget } from './tooltip';

export interface ShopModalCallbacks {
  onConfirm?: () => void;
  onCancel?: () => void;
}

export interface ShopItemAppraisal {
  tierLabel: string;
  valueVerdict: string;
  isBargain: boolean;
}

export interface ShopBuildSynergyHint {
  hasSynergy: boolean;
  synergyType: 'EVOLUTION_KEY' | 'LOW_HULL_REPAIR' | 'WEAPON_UPGRADE' | 'STANDARD';
  hintText: string;
}

export interface ShopBudgetSummary {
  playerCoins: number;
  totalItems: number;
  affordableCount: number;
  cheapestCost: number | null;
  totalBuyoutCost: number;
  canBuyoutAll: boolean;
  summaryLine: string;
}

export function getShopBudgetSummary(
  pickups: any[] | null | undefined,
  playerCoins: number = 0
): ShopBudgetSummary {
  const coins =
    typeof playerCoins === 'number' && Number.isFinite(playerCoins) && playerCoins > 0
      ? Math.floor(playerCoins)
      : 0;
  const items = Array.isArray(pickups) ? pickups.filter(Boolean) : [];
  const totalItems = items.length;

  let affordableCount = 0;
  let totalBuyoutCost = 0;
  let cheapestCost: number | null = null;

  for (const item of items) {
    const cost =
      typeof item.cost === 'number' && Number.isFinite(item.cost) && item.cost >= 0
        ? Math.floor(item.cost)
        : 0;
    if (coins >= cost) {
      affordableCount++;
    }
    totalBuyoutCost += cost;
    if (cheapestCost === null || cost < cheapestCost) {
      cheapestCost = cost;
    }
  }

  const canBuyoutAll = totalItems > 0 && coins >= totalBuyoutCost;

  let summaryLine: string;
  if (totalItems === 0) {
    summaryLine = 'BUDGET: ' + coins + ' COINS 🪙 // SHOP SOLD OUT';
  } else {
    summaryLine =
      'BUDGET: ' +
      coins +
      ' COINS 🪙 // AFFORDABLE: ' +
      affordableCount +
      '/' +
      totalItems +
      ' ITEMS // BUYOUT: ' +
      totalBuyoutCost +
      ' 🪙';
  }

  return {
    playerCoins: coins,
    totalItems,
    affordableCount,
    cheapestCost,
    totalBuyoutCost,
    canBuyoutAll,
    summaryLine
  };
}

export function getShopBuildSynergyHint(
  pickup?: Pickup | null,
  player?: Partial<PlayerState> | null
): ShopBuildSynergyHint {
  if (pickup?.type === 'mod_pedestal' && player?.weapon) {
    const evo = (WEAPON_EVOLUTIONS as any)[player.weapon];
    if (evo) {
      const mod = (pickup as any).mod;
      const modName = mod?.name;
      const modId = mod?.id;
      const matchesName =
        Boolean(modName) &&
        (modName === evo.requiredModName ||
          modName === evo.signatureModName ||
          modName === evo.signatureModDisplayName);
      const matchesId =
        Boolean(modId) &&
        (modId === evo.requiredModId || modId === evo.signatureModId);

      if (matchesName || matchesId) {
        const evolvedName = String(evo.evolvedName ?? '').toUpperCase();
        return {
          hasSynergy: true,
          synergyType: 'EVOLUTION_KEY',
          hintText: `⚡ UNLOCKS ${evolvedName} EVOLUTION!`
        };
      }
    }
  } else if (
    pickup?.type === 'shop_heart' &&
    (player?.hp ?? 6) <= Math.ceil((player?.maxHp ?? 6) * 0.5)
  ) {
    return {
      hasSynergy: true,
      synergyType: 'LOW_HULL_REPAIR',
      hintText: '⚠️ CRITICAL HULL REPAIR RECOMMENDED!'
    };
  } else if (
    pickup?.type === 'run_weapon' &&
    player?.weapon &&
    (pickup as any).weaponId !== player.weapon
  ) {
    return {
      hasSynergy: true,
      synergyType: 'WEAPON_UPGRADE',
      hintText: '🔫 ADDS NEW WEAPON TO RUN DECK!'
    };
  }

  return {
    hasSynergy: false,
    synergyType: 'STANDARD',
    hintText: 'Standard Black Market Ordnance'
  };
}

export function getShopItemAppraisal(pickup: Pickup, playerCoins?: number): ShopItemAppraisal {
  const cost = (pickup as any).cost ?? 0;
  const isBargain = cost > 0 && cost <= 14;
  const tierLabel = isBargain
    ? '🔥 BLACK MARKET BARGAIN'
    : cost >= 25
      ? '⚡ HIGH-GRADE ORDNANCE'
      : '★ STANDARD ISSUE';
  let valueVerdict = 'AVAILABLE';
  if (typeof playerCoins === 'number') {
    if (playerCoins < cost) {
      valueVerdict = `SHORT ${cost - playerCoins} COINS`;
    } else if (playerCoins >= cost * 2) {
      valueVerdict = 'SURPLUS FUNDS';
    } else {
      valueVerdict = 'AFFORDABLE';
    }
  }
  return { tierLabel, valueVerdict, isBargain };
}

/** Category label shown in the popup's type tag. */
export type ShopItemKind = 'MOD' | 'WEAPON' | 'REPAIR' | 'ITEM';

/** Shopkeeper one-liners shown in the speech bubble (picked per item kind). */
const SHOPKEEPER_LINES: Record<ShopItemKind, string> = {
  MOD: 'GOOD CHOICE, RIDER!',
  WEAPON: 'NOW THAT\'S FIREPOWER!',
  REPAIR: 'PATCH HER UP?',
  ITEM: 'NO REFUNDS, RIDER.'
};

const BROKE_LINE = 'COME BACK WITH CASH!';

/** Set 08 3D Halftone Comic Pop-Art Hull Repair Jerry-Can illustration. */
const SHOP_HEART_HI_FI_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <!-- Set 08 3D Halftone Comic Pop-Art Crimson Hull Repair Jerry-Can -->
  <image href="${SET08_ASSETS.shop_hull_repair || '/assets/set08/shop_hull_repair.png'}" x="1" y="1" width="46" height="46" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

/** Set 08 3D Halftone Comic Pop-Art mystery supply crate fallback illustration. */
const SHOP_CRATE_HI_FI_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <!-- Set 08 3D Halftone Comic Pop-Art Mystery Supply Crate -->
  <image href="${SET08_ASSETS.shop_mystery_crate || '/assets/set08/shop_mystery_crate.png'}" x="1" y="1" width="46" height="46" preserveAspectRatio="xMidYMid meet"/>
</svg>`;

export class ShopModalController {
  public static getShopItemAppraisal = getShopItemAppraisal;
  public getShopItemAppraisal = getShopItemAppraisal;
  public static getShopBuildSynergyHint = getShopBuildSynergyHint;
  public getShopBuildSynergyHint = getShopBuildSynergyHint;
  public static getShopBudgetSummary = getShopBudgetSummary;
  public getShopBudgetSummary = getShopBudgetSummary;

  private overlay: HTMLElement | null = null;
  private nameEl: HTMLElement | null = null;
  private descEl: HTMLElement | null = null;
  private costEl: HTMLElement | null = null;
  private typeEl: HTMLElement | null = null;
  private quoteEl: HTMLElement | null = null;
  private confirmBtn: HTMLButtonElement | null = null;
  private cancelBtn: HTMLButtonElement | null = null;

  private pendingConfirm: (() => void) | null = null;
  private pendingCancel: (() => void) | null = null;
  private activePickup: Pickup | null = null;
  private activePickups: any[] = [];
  private currentCoins: number = 0;
  private visible: boolean = false;
  /** Element focused before the modal opened; focus is restored to it on close. */
  private restoreFocusEl: HTMLElement | null = null;

  public get overlayEl(): HTMLElement | null {
    return this.overlay;
  }

  public set overlayEl(el: HTMLElement | null) {
    this.overlay = el;
  }

  constructor() {
    if (typeof document !== 'undefined') {
      this.overlay = document.getElementById('shop-confirm-overlay');
      this.nameEl = document.getElementById('shop-modal-name');
      this.descEl = document.getElementById('shop-modal-desc');
      this.costEl = document.getElementById('shop-modal-cost');
      this.typeEl = document.getElementById('shop-modal-type');
      this.quoteEl = document.getElementById('shop-modal-quote');
      this.confirmBtn = document.getElementById('btn-confirm-buy') as HTMLButtonElement | null;
      this.cancelBtn = document.getElementById('btn-cancel-buy') as HTMLButtonElement | null;

      this.confirmBtn?.addEventListener('click', () => this.confirm());
      this.cancelBtn?.addEventListener('click', () => this.cancel());
      this.overlay?.addEventListener('click', (e) => {
        const card = this.overlay?.querySelector('.shop-confirm-card');
        if (!card || !card.contains(e.target as Node)) {
          this.cancel();
        }
      });
      // Keep Tab focus trapped between the two dialog buttons while open; Escape cancels.
      this.overlay?.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          e.preventDefault();
          this.cancel();
          return;
        }
        if (e.key !== 'Tab' || !this.confirmBtn || !this.cancelBtn) return;
        const first = this.confirmBtn;
        const last = this.cancelBtn;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      });
    }
  }

  public isOpen(): boolean {
    return this.visible;
  }

  public getActivePickup(): Pickup | null {
    return this.activePickup;
  }

  /**
   * Re-renders the shop economy budget summary and updates DOM attributes on overlay.
   */
  public render(pickups?: any, playerCoins?: number): void {
    const rawItems =
      pickups !== undefined
        ? Array.isArray(pickups)
          ? pickups
          : pickups
            ? [pickups]
            : []
        : this.activePickups.length > 0
          ? this.activePickups
          : this.activePickup
            ? [this.activePickup]
            : [];
    const coins = playerCoins !== undefined ? playerCoins : this.currentCoins;
    const budget = getShopBudgetSummary(rawItems, coins);

    if (this.overlayEl) {
      this.overlayEl.setAttribute('data-shop-affordable-count', String(budget.affordableCount));
      this.overlayEl.setAttribute('data-shop-buyout-cost', String(budget.totalBuyoutCost));
      this.overlayEl.setAttribute('data-shop-budget-summary', budget.summaryLine);
    }
  }

  /**
   * Opens the confirmation dialog for a shop pickup item.
   * `playerCoins` is optional; when provided and below the cost, the popup
   * renders its "NOT ENOUGH COINS" state (confirm still routes to onConfirm so
   * the caller keeps ownership of the purchase/error logic).
   */
  public open(
    pickup: Pickup | Pickup[],
    onConfirm: () => void,
    onCancel?: () => void,
    playerCoins?: number,
    player?: Partial<PlayerState> | null,
    allPickups?: Pickup[]
  ): void {
    const singlePickup: Pickup = Array.isArray(pickup) ? pickup[0] : pickup;
    this.activePickup = singlePickup || null;
    this.activePickups = allPickups ?? (Array.isArray(pickup) ? pickup : (pickup ? [pickup] : []));
    this.currentCoins = typeof playerCoins === 'number' && Number.isFinite(playerCoins) ? playerCoins : 0;
    this.pendingConfirm = onConfirm;
    this.pendingCancel = onCancel || null;

    const appraisal = singlePickup
      ? getShopItemAppraisal(singlePickup, playerCoins)
      : { tierLabel: '★ STANDARD ISSUE', valueVerdict: 'AVAILABLE', isBargain: false };
    const syn = singlePickup
      ? getShopBuildSynergyHint(singlePickup, player)
      : { hasSynergy: false, synergyType: 'STANDARD' as const, hintText: 'Standard Black Market Ordnance' };

    let title = 'Mysterious Crate';
    let desc = 'Unknown item contents.';
    let cost = 0;
    let kind: ShopItemKind = 'ITEM';
    let artSvg = SHOP_CRATE_HI_FI_SVG;
    let accentColor = '#ffd60a';

    if (singlePickup?.type === 'shop_heart') {
      title = singlePickup.name || 'Hull Repair';
      desc = 'Restores +2 Hull Fuel Integrity.';
      cost = singlePickup.cost;
      kind = 'REPAIR';
      artSvg = SHOP_HEART_HI_FI_SVG;
      accentColor = '#ff4d6d';
    } else if (singlePickup?.type === 'mod_pedestal') {
      title = singlePickup.mod.name;
      desc = singlePickup.mod.desc;
      cost = singlePickup.cost;
      kind = 'MOD';
      artSvg = getModIconSvg(singlePickup.mod.id || singlePickup.mod.name);
      accentColor = '#ffd60a';
    } else if (singlePickup?.type === 'run_weapon') {
      const w = WEAPONS[singlePickup.weaponId];
      title = `${w ? w.name : singlePickup.name} (This Run)`;
      desc = w ? w.desc : 'Equip this weapon for the remainder of this run.';
      cost = singlePickup.cost;
      kind = 'WEAPON';
      artSvg = WEAPON_HI_FI_SVG[singlePickup.weaponId] || SHOP_CRATE_HI_FI_SVG;
      accentColor = w ? w.color : '#4cc9f0';
    }

    const insufficient = typeof playerCoins === 'number' && playerCoins < cost;

    if (this.nameEl) this.nameEl.textContent = title;
    if (this.descEl) {
      let badgeHtml = '';
      if (singlePickup?.type === 'mod_pedestal') {
        badgeHtml += formatModStatDeltas((singlePickup.mod as any).statDeltas);
        if (getModEvolutionTarget(singlePickup.mod as any)) {
          badgeHtml += '<div style="color:#00f5d4;font-weight:800;margin-top:3px">⚡ OVERCLOCK EVOLUTION MOD</div>';
        }
      }
      if ((singlePickup as any)?.choiceGroup) {
        badgeHtml += '<div style="color:#ffd60a;font-weight:800;margin-top:3px">⚖️ CHOICE PEDESTAL — OTHER DESPAWNS</div>';
      }
      if (badgeHtml) {
        this.descEl.innerHTML = `${desc}${badgeHtml}`;
      } else {
        this.descEl.textContent = desc;
      }
      if (typeof document !== 'undefined') {
        const appraisalPill = document.createElement('div');
        appraisalPill.className = 'shop-appraisal-pill';
        appraisalPill.textContent = `${appraisal.tierLabel} · ${appraisal.valueVerdict}`;
        this.descEl.appendChild(appraisalPill);
      }
    }
    if (this.costEl) {
      this.costEl.textContent = `${cost}`;
      this.costEl.setAttribute('aria-label', `Cost: ${cost} coins`);
    }
    if (this.typeEl) this.typeEl.textContent = kind;
    if (this.quoteEl) this.quoteEl.textContent = insufficient ? BROKE_LINE : SHOPKEEPER_LINES[kind];

    if (typeof document !== 'undefined') {
      const panel =
        this.overlay?.querySelector<HTMLElement>('.shop-name-panel') ??
        this.nameEl?.closest<HTMLElement>('.shop-name-panel') ??
        this.nameEl?.parentElement ??
        null;
      if (panel) {
        let artEl = panel.querySelector<HTMLElement>('.shop-item-art');
        if (!artEl) {
          artEl = document.createElement('div');
          artEl.className = 'shop-item-art';
          artEl.setAttribute('aria-hidden', 'true');
          panel.insertBefore(artEl, this.nameEl ?? panel.firstChild);
        }
        artEl.dataset.kind = kind.toLowerCase();
        artEl.style.setProperty('--shop-art-accent', accentColor);
        artEl.innerHTML = artSvg;
      }
    }

    if (this.overlay) {
      this.overlay.dataset.kind = kind.toLowerCase();
      this.overlay.classList.toggle('insufficient', insufficient);
      this.overlay.classList.add('visible');
      this.overlay.setAttribute('aria-hidden', 'false');
      this.overlay.setAttribute('data-appraisal-tier', appraisal.tierLabel);
      this.overlay.setAttribute('data-is-bargain', String(appraisal.isBargain));
      this.overlay.setAttribute('data-shop-synergy', syn.synergyType);
      this.overlay.setAttribute('data-shop-synergy-hint', syn.hintText);
    }
    this.render(this.activePickups, playerCoins);
    this.visible = true;

    if (typeof document !== 'undefined' && this.confirmBtn) {
      const active = document.activeElement;
      this.restoreFocusEl = active instanceof HTMLElement && !this.overlay?.contains(active) ? active : null;
      this.confirmBtn.focus({ preventScroll: true });
    }
  }

  /**
   * Executes the confirmed purchase callback and closes modal.
   */
  public confirm(): void {
    if (!this.visible) return;
    const cb = this.pendingConfirm;
    this.close();
    if (cb) cb();
  }

  /**
   * Cancels the purchase and closes modal.
   */
  public cancel(): void {
    if (!this.visible) return;
    const cb = this.pendingCancel;
    this.close();
    if (cb) cb();
  }

  /**
   * Closes the shop modal overlay without triggering callbacks.
   */
  public close(): void {
    if (this.overlay) {
      this.overlay.classList.remove('visible');
      this.overlay.classList.remove('insufficient');
      this.overlay.setAttribute('aria-hidden', 'true');
    }
    const wasVisible = this.visible;
    this.visible = false;
    this.activePickup = null;
    this.activePickups = [];
    this.pendingConfirm = null;
    this.pendingCancel = null;

    if (wasVisible && typeof document !== 'undefined') {
      const target = this.restoreFocusEl;
      this.restoreFocusEl = null;
      const active = document.activeElement;
      // Only move focus if it is still inside the (now hidden) dialog.
      if (active instanceof HTMLElement && this.overlay?.contains(active)) {
        if (target && target.isConnected) {
          target.focus({ preventScroll: true });
        } else {
          active.blur();
        }
      }
    }
  }
}
