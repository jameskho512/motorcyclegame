/**
 * MOTO-ROGUE: Next-Floor Portal Confirmation Modal Controller
 *
 * Shows a cancelable "DESCEND TO FLOOR N+1?" popup when the player rides onto
 * an open trapdoor. Mirrors ShopModalController's pattern: DOM lookups are
 * guarded so the controller works headless (tests / SSR).
 *
 * While open, a capture-phase window keydown listener owns the keyboard:
 *   Enter / E / Space = confirm, Escape = cancel, Tab = trapped between buttons.
 * Handled keys are preventDefault'ed and propagation is stopped so the
 * bubble-phase InputManager listener (garage toggle on Escape, etc.) never
 * receives them.
 */

import { ARENA_WIDTH, ARENA_HEIGHT } from '../types/game';

/** Portal (trapdoor) centre in logical arena coordinates. */
export const PORTAL_X = ARENA_WIDTH / 2;
export const PORTAL_Y = ARENA_HEIGHT / 2 - 45;
/** Trigger radius: standing closer than this opens the prompt. */
export const PORTAL_RADIUS = 36;
/** Extra distance the player must ride away before a dismissed prompt can re-open. */
export const PORTAL_CLEAR_HYSTERESIS = 24;

export interface PortalPromptState {
  trapdoor: boolean;
  playerX: number;
  playerY: number;
  dismissed: boolean;
  modalOpen: boolean;
}

/** True when the confirmation popup should open this frame. */
export function shouldPromptPortal(state: PortalPromptState): boolean {
  if (!state.trapdoor || state.dismissed || state.modalOpen) return false;
  return Math.hypot(state.playerX - PORTAL_X, state.playerY - PORTAL_Y) < PORTAL_RADIUS;
}

/** True once the player is far enough from the portal to reset a dismissal. */
export function isClearOfPortal(playerX: number, playerY: number): boolean {
  return Math.hypot(playerX - PORTAL_X, playerY - PORTAL_Y) > PORTAL_RADIUS + PORTAL_CLEAR_HYSTERESIS;
}

export interface PortalModalInfo {
  /** Current floor number; the popup offers floorNum + 1. */
  floorNum: number;
}

const CONFIRM_KEYS = new Set(['enter', 'e', ' ', 'spacebar']);

export class PortalModalController {
  private overlay: HTMLElement | null = null;
  private floorLabelEl: HTMLElement | null = null;
  private warningEl: HTMLElement | null = null;
  private confirmBtn: HTMLButtonElement | null = null;
  private cancelBtn: HTMLButtonElement | null = null;

  private pendingConfirm: (() => void) | null = null;
  private pendingCancel: (() => void) | null = null;
  private visible: boolean = false;
  /** Element focused before the modal opened; focus is restored to it on close. */
  private restoreFocusEl: HTMLElement | null = null;
  private keyListenerAttached: boolean = false;
  private readonly handleKeyDownBound: (e: KeyboardEvent) => void;

  constructor() {
    this.handleKeyDownBound = this.handleKeyDown.bind(this);

    if (typeof document !== 'undefined') {
      this.overlay = document.getElementById('portal-confirm-overlay');
      this.floorLabelEl = document.getElementById('portal-floor-label');
      this.warningEl = document.getElementById('portal-warning');
      this.confirmBtn = document.getElementById('btn-portal-confirm') as HTMLButtonElement | null;
      this.cancelBtn = document.getElementById('btn-portal-cancel') as HTMLButtonElement | null;

      this.confirmBtn?.addEventListener('click', () => this.confirm());
      this.cancelBtn?.addEventListener('click', () => this.cancel());
      this.overlay?.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          this.cancel();
        }
      });
    }
  }

  public isOpen(): boolean {
    return this.visible;
  }

  public open(info: PortalModalInfo, onConfirm: () => void, onCancel?: () => void): void {
    this.pendingConfirm = onConfirm;
    this.pendingCancel = onCancel || null;

    if (info.floorNum === 6) {
      if (this.floorLabelEl) {
        this.floorLabelEl.textContent = 'VALHALLA CONQUERED! ENTER OVERDRIVE FLR 7?';
      }
      if (this.warningEl) {
        this.warningEl.textContent = 'Victory Bonus (+50 Scrap) ready! Enter Endless Overdrive for 2x Scrap & Elite swarms.';
      }
    } else if (info.floorNum > 6) {
      if (this.floorLabelEl) {
        this.floorLabelEl.textContent = `ENDLESS OVERDRIVE // FLOOR ${info.floorNum + 1}?`;
      }
      if (this.warningEl) {
        this.warningEl.textContent = 'Overdrive scaling intensifies. Unbought items on this floor will be lost.';
      }
    } else {
      if (this.floorLabelEl) {
        this.floorLabelEl.textContent = `DESCEND TO FLOOR ${info.floorNum + 1}?`;
      }
      if (this.warningEl) {
        this.warningEl.textContent = 'Unexplored rooms and unbought items on this floor will be lost.';
      }
    }

    if (!this.visible && typeof document !== 'undefined') {
      const active = document.activeElement;
      this.restoreFocusEl = active instanceof HTMLElement && active !== document.body ? active : null;
    }

    this.visible = true;
    if (this.overlay) {
      this.overlay.classList.add('visible');
      this.overlay.setAttribute('aria-hidden', 'false');
    }
    this.attachKeys();
    this.confirmBtn?.focus();
  }

  public confirm(): void {
    if (!this.visible) return;
    const cb = this.pendingConfirm;
    this.close();
    cb?.();
  }

  public cancel(): void {
    if (!this.visible) return;
    const cb = this.pendingCancel;
    this.close();
    cb?.();
  }

  /** Hides the popup without firing any callback. */
  public close(): void {
    const wasVisible = this.visible;
    this.visible = false;
    this.pendingConfirm = null;
    this.pendingCancel = null;
    this.detachKeys();

    if (this.overlay) {
      this.overlay.classList.remove('visible');
      this.overlay.setAttribute('aria-hidden', 'true');
    }

    if (wasVisible) {
      const restore = this.restoreFocusEl;
      this.restoreFocusEl = null;
      if (restore && restore.isConnected) {
        restore.focus();
      } else if (typeof document !== 'undefined') {
        const active = document.activeElement;
        if (active instanceof HTMLElement && this.overlay?.contains(active)) active.blur();
      }
    }
  }

  private attachKeys(): void {
    if (this.keyListenerAttached || typeof window === 'undefined') return;
    window.addEventListener('keydown', this.handleKeyDownBound, true);
    this.keyListenerAttached = true;
  }

  private detachKeys(): void {
    if (!this.keyListenerAttached || typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.handleKeyDownBound, true);
    this.keyListenerAttached = false;
  }

  private swallow(e: KeyboardEvent): void {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (!this.visible) return;
    const k = e.key ? e.key.toLowerCase() : '';

    if (k === 'tab') {
      if (!this.confirmBtn || !this.cancelBtn || typeof document === 'undefined') {
        this.swallow(e);
        return;
      }
      const active = document.activeElement;
      const target = e.shiftKey
        ? (active === this.confirmBtn ? this.cancelBtn : this.confirmBtn)
        : (active === this.cancelBtn ? this.confirmBtn : this.cancelBtn);
      // Only two focusable controls: always move explicitly so focus never escapes.
      this.swallow(e);
      target.focus();
      return;
    }

    if (CONFIRM_KEYS.has(k)) {
      // Repeated keydown from a held key should not instantly descend.
      if (e.repeat) {
        this.swallow(e);
        return;
      }
      this.swallow(e);
      this.confirm();
      return;
    }

    if (k === 'escape' || k === 'esc') {
      this.swallow(e);
      this.cancel();
    }
  }
}
