/**
 * MOTO-ROGUE: Shop Confirmation Modal Controller
 *
 * Prompts user confirmation with cost and item description before purchasing
 * shop mods, weapons, or hull repairs in Shop rooms.
 * Parity reference: moto-rogue/index.html L309-L402, L1267-L1330
 */

import { Pickup } from '../types/game';
import { WEAPONS } from '../data/weapons';

export interface ShopModalCallbacks {
  onConfirm?: () => void;
  onCancel?: () => void;
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

export class ShopModalController {
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
  private visible: boolean = false;
  /** Element focused before the modal opened; focus is restored to it on close. */
  private restoreFocusEl: HTMLElement | null = null;

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
   * Opens the confirmation dialog for a shop pickup item.
   * `playerCoins` is optional; when provided and below the cost, the popup
   * renders its "NOT ENOUGH COINS" state (confirm still routes to onConfirm so
   * the caller keeps ownership of the purchase/error logic).
   */
  public open(pickup: Pickup, onConfirm: () => void, onCancel?: () => void, playerCoins?: number): void {
    this.activePickup = pickup;
    this.pendingConfirm = onConfirm;
    this.pendingCancel = onCancel || null;

    let title = 'Mysterious Crate';
    let desc = 'Unknown item contents.';
    let cost = 0;
    let kind: ShopItemKind = 'ITEM';

    if (pickup.type === 'shop_heart') {
      title = pickup.name || 'Hull Repair';
      desc = 'Restores +2 Hull Fuel Integrity.';
      cost = pickup.cost;
      kind = 'REPAIR';
    } else if (pickup.type === 'mod_pedestal') {
      title = pickup.mod.name;
      desc = pickup.mod.desc;
      cost = pickup.cost;
      kind = 'MOD';
    } else if (pickup.type === 'run_weapon') {
      const w = WEAPONS[pickup.weaponId];
      title = `${w ? w.name : pickup.name} (This Run)`;
      desc = w ? w.desc : 'Equip this weapon for the remainder of this run.';
      cost = pickup.cost;
      kind = 'WEAPON';
    }

    const insufficient = typeof playerCoins === 'number' && playerCoins < cost;

    if (this.nameEl) this.nameEl.textContent = title;
    if (this.descEl) this.descEl.textContent = desc;
    if (this.costEl) {
      this.costEl.textContent = `${cost}`;
      this.costEl.setAttribute('aria-label', `Cost: ${cost} coins`);
    }
    if (this.typeEl) this.typeEl.textContent = kind;
    if (this.quoteEl) this.quoteEl.textContent = insufficient ? BROKE_LINE : SHOPKEEPER_LINES[kind];

    if (this.overlay) {
      this.overlay.dataset.kind = kind.toLowerCase();
      this.overlay.classList.toggle('insufficient', insufficient);
      this.overlay.classList.add('visible');
      this.overlay.setAttribute('aria-hidden', 'false');
    }
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
