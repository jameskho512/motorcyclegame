/**
 * Unit Tests: Next-floor portal confirmation popup
 *
 * Verifies:
 * 1. shouldPromptPortal / isClearOfPortal pure proximity + hysteresis helpers.
 * 2. PortalModalController open/confirm/cancel/close lifecycle and callbacks.
 * 3. Keyboard handling (Enter/E/Space confirm, Escape cancel) with
 *    stopPropagation so the bubble-phase InputManager listener never sees it.
 * 4. Backdrop click cancels, focus moves to confirm and is restored on close,
 *    Tab is trapped between the two buttons.
 * 5. Headless safety (no matching DOM nodes).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PortalModalController,
  shouldPromptPortal,
  isClearOfPortal,
  PORTAL_X,
  PORTAL_Y,
  PORTAL_RADIUS,
  PORTAL_CLEAR_HYSTERESIS
} from '../../src/ui/portalModal';
import { ARENA_WIDTH, ARENA_HEIGHT } from '../../src/types/game';

const MARKUP = `
  <button id="outside-btn">outside</button>
  <div id="portal-confirm-overlay" aria-hidden="true">
    <div class="portal-card" role="dialog" aria-modal="true">
      <h2 id="portal-floor-label">DESCEND TO FLOOR 2?</h2>
      <button id="btn-portal-confirm" type="button">[E] DESCEND</button>
      <button id="btn-portal-cancel" type="button">[ESC] STAY</button>
    </div>
  </div>`;

function key(k: string, extra: KeyboardEventInit = {}): KeyboardEvent {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
  (document.activeElement || document.body).dispatchEvent(ev);
  return ev;
}

describe('Portal proximity helpers', () => {
  const base = { trapdoor: true, playerX: PORTAL_X, playerY: PORTAL_Y, dismissed: false, modalOpen: false };

  it('uses the arena-centre trapdoor geometry', () => {
    expect(PORTAL_X).toBe(ARENA_WIDTH / 2);
    expect(PORTAL_Y).toBe(ARENA_HEIGHT / 2 - 45);
    expect(PORTAL_RADIUS).toBe(36);
    expect(PORTAL_CLEAR_HYSTERESIS).toBe(24);
  });

  it('prompts when standing on an open trapdoor', () => {
    expect(shouldPromptPortal(base)).toBe(true);
    expect(shouldPromptPortal({ ...base, playerX: PORTAL_X + 35 })).toBe(true);
  });

  it('does not prompt without a trapdoor, when far, dismissed, or already open', () => {
    expect(shouldPromptPortal({ ...base, trapdoor: false })).toBe(false);
    expect(shouldPromptPortal({ ...base, playerX: PORTAL_X + 36 })).toBe(false);
    expect(shouldPromptPortal({ ...base, dismissed: true })).toBe(false);
    expect(shouldPromptPortal({ ...base, modalOpen: true })).toBe(false);
  });

  it('isClearOfPortal applies 24px hysteresis beyond the trigger radius', () => {
    expect(isClearOfPortal(PORTAL_X, PORTAL_Y)).toBe(false);
    expect(isClearOfPortal(PORTAL_X + 40, PORTAL_Y)).toBe(false);
    expect(isClearOfPortal(PORTAL_X + 60, PORTAL_Y)).toBe(false);
    expect(isClearOfPortal(PORTAL_X + 61, PORTAL_Y)).toBe(true);
    expect(isClearOfPortal(PORTAL_X, PORTAL_Y - 100)).toBe(true);
  });
});

describe('PortalModalController', () => {
  let modal: PortalModalController;
  let overlay: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = MARKUP;
    overlay = document.getElementById('portal-confirm-overlay')!;
    modal = new PortalModalController();
  });

  afterEach(() => {
    modal.close();
    document.body.innerHTML = '';
  });

  it('opens with the next floor number and visible state', () => {
    modal.open({ floorNum: 3 }, vi.fn());
    expect(modal.isOpen()).toBe(true);
    expect(overlay.classList.contains('visible')).toBe(true);
    expect(overlay.getAttribute('aria-hidden')).toBe('false');
    expect(document.getElementById('portal-floor-label')!.textContent).toBe('DESCEND TO FLOOR 4?');
  });

  it('confirm() fires onConfirm once and closes', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    modal.open({ floorNum: 1 }, onConfirm, onCancel);
    modal.confirm();
    modal.confirm();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
    expect(modal.isOpen()).toBe(false);
    expect(overlay.classList.contains('visible')).toBe(false);
    expect(overlay.getAttribute('aria-hidden')).toBe('true');
  });

  it('cancel() fires onCancel once and closes', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    modal.open({ floorNum: 1 }, onConfirm, onCancel);
    modal.cancel();
    modal.cancel();
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
    expect(modal.isOpen()).toBe(false);
  });

  it('close() hides without firing callbacks', () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    modal.open({ floorNum: 1 }, onConfirm, onCancel);
    modal.close();
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onCancel).not.toHaveBeenCalled();
    expect(modal.isOpen()).toBe(false);
  });

  it('button clicks route to confirm/cancel', () => {
    const onConfirm = vi.fn();
    modal.open({ floorNum: 1 }, onConfirm);
    (document.getElementById('btn-portal-confirm') as HTMLButtonElement).click();
    expect(onConfirm).toHaveBeenCalledTimes(1);

    const onCancel = vi.fn();
    modal.open({ floorNum: 1 }, vi.fn(), onCancel);
    (document.getElementById('btn-portal-cancel') as HTMLButtonElement).click();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('backdrop click cancels; clicks inside the card do not', () => {
    const onCancel = vi.fn();
    modal.open({ floorNum: 1 }, vi.fn(), onCancel);
    document.getElementById('portal-floor-label')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onCancel).not.toHaveBeenCalled();
    overlay.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it.each(['Enter', 'e', 'E', ' '])('key %j confirms and is swallowed', (k) => {
    const onConfirm = vi.fn();
    const bubbleSpy = vi.fn();
    window.addEventListener('keydown', bubbleSpy);
    modal.open({ floorNum: 1 }, onConfirm);
    const ev = key(k);
    window.removeEventListener('keydown', bubbleSpy);
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
    expect(bubbleSpy).not.toHaveBeenCalled();
  });

  it('Escape cancels and is swallowed (never reaches garage toggle)', () => {
    const onCancel = vi.fn();
    const bubbleSpy = vi.fn();
    window.addEventListener('keydown', bubbleSpy);
    modal.open({ floorNum: 1 }, vi.fn(), onCancel);
    const ev = key('Escape');
    window.removeEventListener('keydown', bubbleSpy);
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(ev.defaultPrevented).toBe(true);
    expect(bubbleSpy).not.toHaveBeenCalled();
  });

  it('keyboard listener is removed once closed', () => {
    const onConfirm = vi.fn();
    modal.open({ floorNum: 1 }, onConfirm);
    modal.close();
    const ev = key('e');
    expect(onConfirm).not.toHaveBeenCalled();
    expect(ev.defaultPrevented).toBe(false);
  });

  it('unhandled keys pass through while open', () => {
    const bubbleSpy = vi.fn();
    window.addEventListener('keydown', bubbleSpy);
    modal.open({ floorNum: 1 }, vi.fn());
    key('w');
    window.removeEventListener('keydown', bubbleSpy);
    expect(bubbleSpy).toHaveBeenCalledTimes(1);
    expect(modal.isOpen()).toBe(true);
  });

  it('focuses confirm on open and restores prior focus on close', () => {
    const outside = document.getElementById('outside-btn') as HTMLButtonElement;
    outside.focus();
    modal.open({ floorNum: 1 }, vi.fn());
    expect(document.activeElement?.id).toBe('btn-portal-confirm');
    modal.cancel();
    expect(document.activeElement).toBe(outside);
  });

  it('traps Tab between the two buttons', () => {
    modal.open({ floorNum: 1 }, vi.fn());
    const confirmBtn = document.getElementById('btn-portal-confirm') as HTMLButtonElement;
    const cancelBtn = document.getElementById('btn-portal-cancel') as HTMLButtonElement;

    cancelBtn.focus();
    const fwd = key('Tab');
    expect(fwd.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(confirmBtn);

    const back = key('Tab', { shiftKey: true });
    expect(back.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(cancelBtn);
  });

  it('works headless when DOM nodes are missing', () => {
    document.body.innerHTML = '';
    const headless = new PortalModalController();
    const onConfirm = vi.fn();
    headless.open({ floorNum: 5 }, onConfirm);
    expect(headless.isOpen()).toBe(true);
    headless.confirm();
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(headless.isOpen()).toBe(false);
  });
});
