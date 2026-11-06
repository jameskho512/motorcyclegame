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

export class ShopModalController {
  private overlay: HTMLElement | null = null;
  private nameEl: HTMLElement | null = null;
  private descEl: HTMLElement | null = null;
  private costEl: HTMLElement | null = null;
  private confirmBtn: HTMLButtonElement | null = null;
  private cancelBtn: HTMLButtonElement | null = null;

  private pendingConfirm: (() => void) | null = null;
  private pendingCancel: (() => void) | null = null;
  private activePickup: Pickup | null = null;
  private visible: boolean = false;

  constructor() {
    if (typeof document !== 'undefined') {
      this.overlay = document.getElementById('shop-confirm-overlay');
      this.nameEl = document.getElementById('shop-modal-name');
      this.descEl = document.getElementById('shop-modal-desc');
      this.costEl = document.getElementById('shop-modal-cost');
      this.confirmBtn = document.getElementById('btn-confirm-buy') as HTMLButtonElement | null;
      this.cancelBtn = document.getElementById('btn-cancel-buy') as HTMLButtonElement | null;

      this.confirmBtn?.addEventListener('click', () => this.confirm());
      this.cancelBtn?.addEventListener('click', () => this.cancel());
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
   */
  public open(pickup: Pickup, onConfirm: () => void, onCancel?: () => void): void {
    this.activePickup = pickup;
    this.pendingConfirm = onConfirm;
    this.pendingCancel = onCancel || null;

    let title = 'Mysterious Crate';
    let desc = 'Unknown item contents.';
    let cost = 0;

    if (pickup.type === 'shop_heart') {
      title = pickup.name || 'Hull Repair';
      desc = 'Restores +2 Hull Fuel Integrity.';
      cost = pickup.cost;
    } else if (pickup.type === 'mod_pedestal') {
      title = pickup.mod.name;
      desc = pickup.mod.desc;
      cost = pickup.cost;
    } else if (pickup.type === 'run_weapon') {
      const w = WEAPONS[pickup.weaponId];
      title = `${w ? w.name : pickup.name} (This Run)`;
      desc = w ? w.desc : 'Equip this weapon for the remainder of this run.';
      cost = pickup.cost;
    }

    if (this.nameEl) this.nameEl.textContent = title;
    if (this.descEl) this.descEl.textContent = desc;
    if (this.costEl) this.costEl.textContent = `Cost: ${cost} Coins 🪙`;

    if (this.overlay) {
      this.overlay.classList.add('visible');
    }
    this.visible = true;
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
    }
    this.visible = false;
    this.activePickup = null;
    this.pendingConfirm = null;
    this.pendingCancel = null;
  }
}
