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
  getNextSectorBriefing,
  getPortalRiskAssessment,
  PortalRiskAssessment,
  PORTAL_X,
  PORTAL_Y,
  PORTAL_RADIUS,
  PORTAL_CLEAR_HYSTERESIS
} from '../../src/ui/portalModal';
import {
  ShopModalController,
  getShopItemAppraisal,
  ShopItemAppraisal
} from '../../src/ui/shopModal';
import { ARENA_WIDTH, ARENA_HEIGHT, Pickup } from '../../src/types/game';

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

  it('sets sector briefing attributes and tooltips on modal elements without altering text content', () => {
    modal.open({ floorNum: 1 }, vi.fn());
    const label = document.getElementById('portal-floor-label')!;
    expect(label.textContent).toBe('DESCEND TO FLOOR 2?');
    expect(label.getAttribute('data-next-biome')).toBe('SMELTER FOUNDRY');
    expect(label.getAttribute('data-next-boss')).toBe('SIEGE BEHEMOTH');
    expect(label.getAttribute('data-threat-mult')).toBe('1.55x');
    expect(label.getAttribute('title')).toContain('SMELTER FOUNDRY');
    expect(label.getAttribute('title')).toContain('SIEGE BEHEMOTH');
    expect(overlay.getAttribute('data-next-sector')).toBe('SMELTER FOUNDRY');
    expect(overlay.getAttribute('data-next-boss')).toBe('SIEGE BEHEMOTH');
    expect(overlay.getAttribute('data-threat-mult')).toBe('1.55x');
    expect(overlay.getAttribute('data-readiness')).toBe('⚡ COMBAT READY');
    expect(overlay.getAttribute('data-low-hull-warning')).toBe('false');
  });

  it('sets data-readiness and data-low-hull-warning attributes for critical hull on open', () => {
    modal.open({ floorNum: 1, playerHp: 2, playerMaxHp: 6 }, vi.fn());
    expect(overlay.getAttribute('data-readiness')).toBe('⚠️ CRITICAL HULL');
    expect(overlay.getAttribute('data-low-hull-warning')).toBe('true');
  });

  it('sets data-readiness and data-low-hull-warning attributes for full integrity on open', () => {
    modal.open({ floorNum: 2, playerHp: 6, playerMaxHp: 6 }, vi.fn());
    expect(overlay.getAttribute('data-readiness')).toBe('★ FULL INTEGRITY');
    expect(overlay.getAttribute('data-low-hull-warning')).toBe('false');
  });

  it('sets data-readiness and data-low-hull-warning attributes for moderate combat ready on open', () => {
    modal.open({ floorNum: 3, playerHp: 4, playerMaxHp: 6 }, vi.fn());
    expect(overlay.getAttribute('data-readiness')).toBe('⚡ COMBAT READY');
    expect(overlay.getAttribute('data-low-hull-warning')).toBe('false');
  });
});

describe('getPortalRiskAssessment pure helper', () => {
  it('returns FULL INTEGRITY when playerHp >= playerMaxHp', () => {
    const assessment: PortalRiskAssessment = getPortalRiskAssessment(1, 6, 6);
    expect(assessment).toEqual({
      readinessLabel: '★ FULL INTEGRITY',
      recommendation: 'Optimal combat readiness for descent.',
      isLowHullWarning: false
    });

    // Overhealed or bonus health above max
    const overhealed = getPortalRiskAssessment(2, 7, 6);
    expect(overhealed.readinessLabel).toBe('★ FULL INTEGRITY');
    expect(overhealed.isLowHullWarning).toBe(false);
  });

  it('returns COMBAT READY when playerHp is moderate (> 35% and < 100%)', () => {
    const assessment = getPortalRiskAssessment(1, 4, 6);
    expect(assessment).toEqual({
      readinessLabel: '⚡ COMBAT READY',
      recommendation: 'Systems nominal for next sector.',
      isLowHullWarning: false
    });

    const assessment3 = getPortalRiskAssessment(1, 3, 6); // 50%
    expect(assessment3.readinessLabel).toBe('⚡ COMBAT READY');
    expect(assessment3.isLowHullWarning).toBe(false);
  });

  it('returns CRITICAL HULL when playerHp / playerMaxHp <= 0.35', () => {
    // 2/6 = 0.333... <= 0.35
    const assessment2 = getPortalRiskAssessment(1, 2, 6);
    expect(assessment2).toEqual({
      readinessLabel: '⚠️ CRITICAL HULL',
      recommendation: 'Visit Shop or scavenge Fuel before descending!',
      isLowHullWarning: true
    });

    // 1/6 = 0.166... <= 0.35
    const assessment1 = getPortalRiskAssessment(1, 1, 6);
    expect(assessment1).toEqual({
      readinessLabel: '⚠️ CRITICAL HULL',
      recommendation: 'Visit Shop or scavenge Fuel before descending!',
      isLowHullWarning: true
    });

    // 0 HP
    const assessment0 = getPortalRiskAssessment(1, 0, 6);
    expect(assessment0).toEqual({
      readinessLabel: '⚠️ CRITICAL HULL',
      recommendation: 'Visit Shop or scavenge Fuel before descending!',
      isLowHullWarning: true
    });

    // Exactly 35% boundary (35 / 100)
    const exact35 = getPortalRiskAssessment(1, 35, 100);
    expect(exact35.readinessLabel).toBe('⚠️ CRITICAL HULL');
    expect(exact35.isLowHullWarning).toBe(true);

    // Just above 35% (36 / 100)
    const above35 = getPortalRiskAssessment(1, 36, 100);
    expect(above35.readinessLabel).toBe('⚡ COMBAT READY');
    expect(above35.isLowHullWarning).toBe(false);
  });

  it('returns default COMBAT READY when playerHp or playerMaxHp are missing or invalid', () => {
    expect(getPortalRiskAssessment(1)).toEqual({
      readinessLabel: '⚡ COMBAT READY',
      recommendation: 'Systems nominal for next sector.',
      isLowHullWarning: false
    });

    expect(getPortalRiskAssessment(1, undefined, 6)).toEqual({
      readinessLabel: '⚡ COMBAT READY',
      recommendation: 'Systems nominal for next sector.',
      isLowHullWarning: false
    });

    expect(getPortalRiskAssessment(1, 4, undefined)).toEqual({
      readinessLabel: '⚡ COMBAT READY',
      recommendation: 'Systems nominal for next sector.',
      isLowHullWarning: false
    });

    expect(getPortalRiskAssessment(1, 4, 0)).toEqual({
      readinessLabel: '⚡ COMBAT READY',
      recommendation: 'Systems nominal for next sector.',
      isLowHullWarning: false
    });
  });

  it('is accessible via PortalModalController static and instance methods', () => {
    expect(PortalModalController.getPortalRiskAssessment(1, 6, 6)).toEqual(getPortalRiskAssessment(1, 6, 6));
    const controller = new PortalModalController();
    expect(controller.getPortalRiskAssessment(1, 2, 6)).toEqual(getPortalRiskAssessment(1, 2, 6));
  });
});

describe('getNextSectorBriefing pure helper', () => {
  it('returns accurate sector 2 briefing when on floor 1', () => {
    const briefing = getNextSectorBriefing(1);
    expect(briefing).toEqual({
      nextFloor: 2,
      biomeName: 'SMELTER FOUNDRY',
      bossName: 'SIEGE BEHEMOTH',
      threatMult: '1.55x'
    });
  });

  it('returns accurate sector 3 briefing when on floor 2', () => {
    const briefing = getNextSectorBriefing(2);
    expect(briefing).toEqual({
      nextFloor: 3,
      biomeName: 'NEON CYBER-FREEWAY',
      bossName: 'OVERLORD HELION',
      threatMult: '2.40x'
    });
  });

  it('returns accurate sector 4 briefing when on floor 3', () => {
    const briefing = getNextSectorBriefing(3);
    expect(briefing).toEqual({
      nextFloor: 4,
      biomeName: 'SUB-ZERO CRYO LAB',
      bossName: 'CRYO VALKYRIE',
      threatMult: '3.72x'
    });
  });

  it('returns accurate sector 5 briefing when on floor 4', () => {
    const briefing = getNextSectorBriefing(4);
    expect(briefing).toEqual({
      nextFloor: 5,
      biomeName: 'MAGMA CORE',
      bossName: 'INFERNO COLOSSUS',
      threatMult: '5.77x'
    });
  });

  it('returns accurate sector 6 briefing when on floor 5', () => {
    const briefing = getNextSectorBriefing(5);
    expect(briefing).toEqual({
      nextFloor: 6,
      biomeName: 'CHROME CITADEL',
      bossName: 'OMEGA VALHALLA',
      threatMult: '8.95x'
    });
  });

  it('returns accurate overdrive sector 7 briefing when on floor 6', () => {
    const briefing = getNextSectorBriefing(6);
    expect(briefing).toEqual({
      nextFloor: 7,
      biomeName: 'ENDLESS VALHALLA OVERDRIVE',
      bossName: 'OMEGA VALHALLA',
      threatMult: '13.87x'
    });
  });

  it('returns accurate endless overdrive scaling for floor 7 and beyond (7+)', () => {
    const briefing7 = getNextSectorBriefing(7);
    expect(briefing7).toEqual({
      nextFloor: 8,
      biomeName: 'ENDLESS VALHALLA OVERDRIVE',
      bossName: 'OMEGA VALHALLA',
      threatMult: '21.49x'
    });

    const briefing8 = getNextSectorBriefing(8);
    expect(briefing8).toEqual({
      nextFloor: 9,
      biomeName: 'ENDLESS VALHALLA OVERDRIVE',
      bossName: 'OMEGA VALHALLA',
      threatMult: '33.32x'
    });
  });

  it('is accessible via PortalModalController static and instance methods', () => {
    expect(PortalModalController.getNextSectorBriefing(1)).toEqual(getNextSectorBriefing(1));
    const controller = new PortalModalController();
    expect(controller.getNextSectorBriefing(2)).toEqual(getNextSectorBriefing(2));
  });
});

describe('getShopItemAppraisal pure helper', () => {
  const createMockPickup = (cost: number): Pickup => ({
    x: 100,
    y: 100,
    radius: 20,
    type: 'shop_heart',
    name: 'Hull Repair',
    cost
  });

  it('correctly appraises bargain items (cost: 12)', () => {
    const appraisal: ShopItemAppraisal = getShopItemAppraisal(createMockPickup(12));
    expect(appraisal).toEqual({
      tierLabel: '🔥 BLACK MARKET BARGAIN',
      valueVerdict: 'AVAILABLE',
      isBargain: true
    });
  });

  it('correctly appraises standard issue items (cost: 18)', () => {
    const appraisal = getShopItemAppraisal(createMockPickup(18));
    expect(appraisal).toEqual({
      tierLabel: '★ STANDARD ISSUE',
      valueVerdict: 'AVAILABLE',
      isBargain: false
    });
  });

  it('correctly appraises high-grade ordnance items (cost: 28)', () => {
    const appraisal = getShopItemAppraisal(createMockPickup(28));
    expect(appraisal).toEqual({
      tierLabel: '⚡ HIGH-GRADE ORDNANCE',
      valueVerdict: 'AVAILABLE',
      isBargain: false
    });
  });

  it('verifies cost boundary conditions (0, 14, 15, 24, 25)', () => {
    expect(getShopItemAppraisal(createMockPickup(0)).tierLabel).toBe('★ STANDARD ISSUE');
    expect(getShopItemAppraisal(createMockPickup(0)).isBargain).toBe(false);

    expect(getShopItemAppraisal(createMockPickup(14)).tierLabel).toBe('🔥 BLACK MARKET BARGAIN');
    expect(getShopItemAppraisal(createMockPickup(14)).isBargain).toBe(true);

    expect(getShopItemAppraisal(createMockPickup(15)).tierLabel).toBe('★ STANDARD ISSUE');
    expect(getShopItemAppraisal(createMockPickup(15)).isBargain).toBe(false);

    expect(getShopItemAppraisal(createMockPickup(24)).tierLabel).toBe('★ STANDARD ISSUE');
    expect(getShopItemAppraisal(createMockPickup(24)).isBargain).toBe(false);

    expect(getShopItemAppraisal(createMockPickup(25)).tierLabel).toBe('⚡ HIGH-GRADE ORDNANCE');
    expect(getShopItemAppraisal(createMockPickup(25)).isBargain).toBe(false);
  });

  it('correctly computes value verdicts based on playerCoins', () => {
    const pickup = createMockPickup(20);

    // No coins provided
    expect(getShopItemAppraisal(pickup).valueVerdict).toBe('AVAILABLE');

    // SHORT state
    expect(getShopItemAppraisal(pickup, 15).valueVerdict).toBe('SHORT 5 COINS');
    expect(getShopItemAppraisal(pickup, 0).valueVerdict).toBe('SHORT 20 COINS');

    // AFFORDABLE state (cost <= coins < cost * 2)
    expect(getShopItemAppraisal(pickup, 20).valueVerdict).toBe('AFFORDABLE');
    expect(getShopItemAppraisal(pickup, 39).valueVerdict).toBe('AFFORDABLE');

    // SURPLUS FUNDS state (coins >= cost * 2)
    expect(getShopItemAppraisal(pickup, 40).valueVerdict).toBe('SURPLUS FUNDS');
    expect(getShopItemAppraisal(pickup, 100).valueVerdict).toBe('SURPLUS FUNDS');
  });
});

describe('ShopModalController appraisal DOM attributes & pills', () => {
  const SHOP_MARKUP = `
    <div id="shop-confirm-overlay" aria-hidden="true">
      <div class="shop-confirm-card">
        <div class="shop-name-panel">
          <div id="shop-modal-name"></div>
        </div>
        <div id="shop-modal-desc"></div>
        <div id="shop-modal-cost"></div>
        <div id="shop-modal-type"></div>
        <div id="shop-modal-quote"></div>
        <button id="btn-confirm-buy" type="button">Confirm</button>
        <button id="btn-cancel-buy" type="button">Cancel</button>
      </div>
    </div>
  `;

  let modal: ShopModalController;
  let overlay: HTMLElement;
  let descEl: HTMLElement;

  beforeEach(() => {
    document.body.innerHTML = SHOP_MARKUP;
    overlay = document.getElementById('shop-confirm-overlay')!;
    descEl = document.getElementById('shop-modal-desc')!;
    modal = new ShopModalController();
  });

  afterEach(() => {
    modal.close();
    document.body.innerHTML = '';
  });

  it('renders bargain appraisal attributes and pill on open', () => {
    const pickup: Pickup = {
      x: 100,
      y: 100,
      radius: 20,
      type: 'shop_heart',
      name: 'Discount Patch',
      cost: 12
    };

    modal.open(pickup, vi.fn(), undefined, 30);

    expect(overlay.getAttribute('data-appraisal-tier')).toBe('🔥 BLACK MARKET BARGAIN');
    expect(overlay.getAttribute('data-is-bargain')).toBe('true');

    const pill = descEl.querySelector('.shop-appraisal-pill');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe('🔥 BLACK MARKET BARGAIN · SURPLUS FUNDS');
  });

  it('renders standard issue appraisal attributes and short funds pill on open', () => {
    const pickup: Pickup = {
      x: 100,
      y: 100,
      radius: 20,
      type: 'shop_heart',
      name: 'Standard Repair',
      cost: 18
    };

    modal.open(pickup, vi.fn(), undefined, 10);

    expect(overlay.getAttribute('data-appraisal-tier')).toBe('★ STANDARD ISSUE');
    expect(overlay.getAttribute('data-is-bargain')).toBe('false');

    const pill = descEl.querySelector('.shop-appraisal-pill');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe('★ STANDARD ISSUE · SHORT 8 COINS');
  });

  it('renders high-grade ordnance appraisal attributes and affordable pill on open', () => {
    const pickup: Pickup = {
      x: 100,
      y: 100,
      radius: 20,
      type: 'shop_heart',
      name: 'Heavy Repair Kit',
      cost: 28
    };

    modal.open(pickup, vi.fn(), undefined, 35);

    expect(overlay.getAttribute('data-appraisal-tier')).toBe('⚡ HIGH-GRADE ORDNANCE');
    expect(overlay.getAttribute('data-is-bargain')).toBe('false');

    const pill = descEl.querySelector('.shop-appraisal-pill');
    expect(pill).not.toBeNull();
    expect(pill?.textContent).toBe('⚡ HIGH-GRADE ORDNANCE · AFFORDABLE');
  });
});
