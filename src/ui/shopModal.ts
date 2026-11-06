/**
 * MOTO-ROGUE: Shop Confirmation Modal Controller
 *
 * Prompts user confirmation with cost and item description before purchasing
 * shop mods, weapons, or hull repairs in Shop rooms.
 * Parity reference: moto-rogue/index.html L309-L402, L1267-L1330
 */

import { Pickup } from '../types/game';
import { WEAPONS } from '../data/weapons';
import { WEAPON_HI_FI_SVG, getModIconSvg } from './icons';

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

/** Cel-shaded crimson Jerry-Can / Hull Repair illustration with bold #0a0b10 comic ink outlines. */
const SHOP_HEART_HI_FI_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <!-- Hard comic drop shadow -->
  <rect x="10" y="13" width="30" height="31" rx="4" fill="#0a0b10" transform="translate(2.5, 2.5)"/>
  <!-- Brass angled pouring spout -->
  <path d="M11 6h8l-1.5 7h-7z" fill="#ffd166" stroke="#0a0b10" stroke-width="2.6" stroke-linejoin="round"/>
  <rect x="9.5" y="4" width="10" height="3" rx="1" fill="#ffbe0b" stroke="#0a0b10" stroke-width="2.2"/>
  <!-- Heavy steel carry handle -->
  <path d="M21 7h15v6H21z" fill="#adb5bd" stroke="#0a0b10" stroke-width="2.6" stroke-linejoin="round"/>
  <rect x="24" y="9" width="9" height="2.2" rx="1" fill="#1b1d26"/>
  <!-- Crimson military jerry-can hull body -->
  <rect x="9" y="12" width="30" height="30" rx="4" fill="#e5203a" stroke="#0a0b10" stroke-width="3" stroke-linejoin="round"/>
  <!-- Upper cel-shaded specular bevel -->
  <path d="M12 14.5h24v4H12z" fill="#ff758f"/>
  <!-- Lower cel-shaded shadow bevel -->
  <path d="M11 36h26v4H11z" fill="#9e0e22"/>
  <!-- Embossed white & gold Hull Repair cross emblem -->
  <path d="M21 19h6v5h5v6h-5v5h-6v-5h-5v-6h5z" fill="#ffffff" stroke="#0a0b10" stroke-width="2.6" stroke-linejoin="round"/>
  <path d="M22.5 20.5h3v5h5v3h-5v5h-3v-5h-5v-3h5z" fill="#ffd60a"/>
</svg>`;

/** Cel-shaded mystery supply crate fallback illustration. */
const SHOP_CRATE_HI_FI_SVG = `<svg viewBox="0 0 48 48" aria-hidden="true" focusable="false">
  <rect x="9" y="10" width="30" height="30" rx="3" fill="#0a0b10" transform="translate(2.5, 2.5)"/>
  <rect x="8" y="9" width="30" height="30" rx="3" fill="#ff9f1c" stroke="#0a0b10" stroke-width="3" stroke-linejoin="round"/>
  <path d="M10 11h26v4H10z" fill="#ffd60a"/>
  <line x1="8" y1="24" x2="38" y2="24" stroke="#0a0b10" stroke-width="2.8"/>
  <line x1="23" y1="9" x2="23" y2="39" stroke="#0a0b10" stroke-width="2.8"/>
  <rect x="17" y="18" width="12" height="12" rx="2" fill="#181b26" stroke="#0a0b10" stroke-width="2.4"/>
</svg>`;

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
    let artSvg = SHOP_CRATE_HI_FI_SVG;
    let accentColor = '#ffd60a';

    if (pickup.type === 'shop_heart') {
      title = pickup.name || 'Hull Repair';
      desc = 'Restores +2 Hull Fuel Integrity.';
      cost = pickup.cost;
      kind = 'REPAIR';
      artSvg = SHOP_HEART_HI_FI_SVG;
      accentColor = '#ff4d6d';
    } else if (pickup.type === 'mod_pedestal') {
      title = pickup.mod.name;
      desc = pickup.mod.desc;
      cost = pickup.cost;
      kind = 'MOD';
      artSvg = getModIconSvg(pickup.mod.id || pickup.mod.name);
      accentColor = '#ffd60a';
    } else if (pickup.type === 'run_weapon') {
      const w = WEAPONS[pickup.weaponId];
      title = `${w ? w.name : pickup.name} (This Run)`;
      desc = w ? w.desc : 'Equip this weapon for the remainder of this run.';
      cost = pickup.cost;
      kind = 'WEAPON';
      artSvg = WEAPON_HI_FI_SVG[pickup.weaponId] || SHOP_CRATE_HI_FI_SVG;
      accentColor = w ? w.color : '#4cc9f0';
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
