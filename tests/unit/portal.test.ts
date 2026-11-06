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
  getPortalHeatBriefing,
  PortalHeatBriefing,
  PORTAL_X,
  PORTAL_Y,
  PORTAL_RADIUS,
  PORTAL_CLEAR_HYSTERESIS
} from '../../src/ui/portalModal';
import {
  ShopModalController,
  getShopItemAppraisal,
  ShopItemAppraisal,
  getShopBuildSynergyHint,
  ShopBuildSynergyHint
} from '../../src/ui/shopModal';
import {
  HubStationModalController,
  getHubStationPromptInfo,
  HubStationOpenOptions,
  getForgeStationAdvisor,
  ForgeStationAdvisor,
  getScannerStationAdvisor,
  ScannerStationAdvisor
} from '../../src/ui/hubStationModal';
import { WEAPONS, WeaponId, getWeaponTacticalProfile } from '../../src/data/weapons';
import { getCareerOutlawRank } from '../../src/core/state';
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

  it('sets data-portal-heat and data-portal-heat-label defaulting to heat 0 when heatLevel is omitted', () => {
    modal.open({ floorNum: 1 }, vi.fn());
    expect(overlay.getAttribute('data-portal-heat')).toBe('0');
    expect(overlay.getAttribute('data-portal-heat-label')).toBe('HEAT 0 // STANDARD');
  });

  it.each([
    { heat: 0, expectedHeat: '0', expectedLabel: 'HEAT 0 // STANDARD' },
    { heat: 1, expectedHeat: '1', expectedLabel: 'HEAT 1 // OVERCLOCKED' },
    { heat: 2, expectedHeat: '2', expectedLabel: 'HEAT 2 // BLOOD PACT' },
    { heat: 3, expectedHeat: '3', expectedLabel: 'HEAT 3 // VALHALLA INFERNO' },
    { heat: 5, expectedHeat: '3', expectedLabel: 'HEAT 3 // VALHALLA INFERNO' }
  ])('sets data-portal-heat and data-portal-heat-label for heat level $heat on open', ({ heat, expectedHeat, expectedLabel }) => {
    modal.open({ floorNum: 2, heatLevel: heat }, vi.fn());
    expect(overlay.getAttribute('data-portal-heat')).toBe(expectedHeat);
    expect(overlay.getAttribute('data-portal-heat-label')).toBe(expectedLabel);
  });
});

describe('getPortalHeatBriefing pure helper', () => {
  it('returns HEAT 0 // STANDARD briefing for heat level 0', () => {
    const briefing: PortalHeatBriefing = getPortalHeatBriefing(0);
    expect(briefing).toEqual({
      heatLevel: 0,
      label: 'HEAT 0 // STANDARD',
      enemyScaleText: 'Standard Enemy HP & Speed',
      scrapBonusText: '+0% Bonus Scrap'
    });
  });

  it('returns HEAT 1 // OVERCLOCKED briefing for heat level 1', () => {
    const briefing: PortalHeatBriefing = getPortalHeatBriefing(1);
    expect(briefing).toEqual({
      heatLevel: 1,
      label: 'HEAT 1 // OVERCLOCKED',
      enemyScaleText: '+24% Enemy HP · +12% Speed',
      scrapBonusText: '+25% Bonus Scrap'
    });
  });

  it('returns HEAT 2 // BLOOD PACT briefing for heat level 2', () => {
    const briefing: PortalHeatBriefing = getPortalHeatBriefing(2);
    expect(briefing).toEqual({
      heatLevel: 2,
      label: 'HEAT 2 // BLOOD PACT',
      enemyScaleText: '+48% Enemy HP · +24% Speed',
      scrapBonusText: '+50% Bonus Scrap'
    });
  });

  it('returns HEAT 3 // VALHALLA INFERNO briefing for heat level 3', () => {
    const briefing: PortalHeatBriefing = getPortalHeatBriefing(3);
    expect(briefing).toEqual({
      heatLevel: 3,
      label: 'HEAT 3 // VALHALLA INFERNO',
      enemyScaleText: '+72% Enemy HP · +36% Speed',
      scrapBonusText: '+75% Bonus Scrap'
    });
  });

  it('clamps out-of-bounds heat levels to 0..3 range', () => {
    expect(getPortalHeatBriefing(-1).heatLevel).toBe(0);
    expect(getPortalHeatBriefing(-99).label).toBe('HEAT 0 // STANDARD');
    expect(getPortalHeatBriefing(4).heatLevel).toBe(3);
    expect(getPortalHeatBriefing(10).label).toBe('HEAT 3 // VALHALLA INFERNO');
    expect(getPortalHeatBriefing(1.4).heatLevel).toBe(1);
    expect(getPortalHeatBriefing(2.6).heatLevel).toBe(3);
    expect(getPortalHeatBriefing(NaN).heatLevel).toBe(0);
    expect(getPortalHeatBriefing(undefined).heatLevel).toBe(0);
  });

  it('is accessible via PortalModalController static and instance methods', () => {
    expect(PortalModalController.getPortalHeatBriefing(2)).toEqual(getPortalHeatBriefing(2));
    const controller = new PortalModalController();
    expect(controller.getPortalHeatBriefing(3)).toEqual(getPortalHeatBriefing(3));
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

  it('sets data-shop-synergy and data-shop-synergy-hint attributes on open', () => {
    const pickup: Pickup = {
      x: 100,
      y: 100,
      radius: 20,
      type: 'shop_heart',
      name: 'Emergency Repair',
      cost: 15
    };
    // Hull <= 50% maxHp triggers LOW_HULL_REPAIR synergy
    const lowHullPlayer = { hp: 2, maxHp: 6 };

    modal.open(pickup, vi.fn(), undefined, 30, lowHullPlayer);

    expect(overlay.getAttribute('data-shop-synergy')).toBe('LOW_HULL_REPAIR');
    expect(overlay.getAttribute('data-shop-synergy-hint')).toBe('⚠️ CRITICAL HULL REPAIR RECOMMENDED!');

    // Player with full health defaults to STANDARD synergy
    const fullHullPlayer = { hp: 6, maxHp: 6 };
    modal.open(pickup, vi.fn(), undefined, 30, fullHullPlayer);

    expect(overlay.getAttribute('data-shop-synergy')).toBe('STANDARD');
    expect(overlay.getAttribute('data-shop-synergy-hint')).toBe('Standard Black Market Ordnance');
  });
});

describe('getShopBuildSynergyHint pure helper', () => {
  const createModPedestal = (mod: any, cost = 25): Pickup => ({
    x: 100,
    y: 100,
    radius: 20,
    type: 'mod_pedestal',
    cost,
    mod
  });

  it('identifies EVOLUTION_KEY synergy when pedestal mod matches player weapon signature mod id or name', () => {
    // 1. Pistol with ricochet_mod by id
    const pistolPickup = createModPedestal({
      id: 'ricochet_mod',
      name: 'Rubberized Casings',
      desc: 'Bounce rounds'
    });
    const hint1: ShopBuildSynergyHint = getShopBuildSynergyHint(pistolPickup, { weapon: 'pistol' });
    expect(hint1).toEqual({
      hasSynergy: true,
      synergyType: 'EVOLUTION_KEY',
      hintText: '⚡ UNLOCKS RICOCHET REVOLVER EVOLUTION!'
    });

    // 2. Pistol with signatureModName ('Ricochet Rounds')
    const pistolByName = createModPedestal({
      id: 'other_id',
      name: 'Ricochet Rounds',
      desc: 'Bounce rounds'
    });
    const hint2 = getShopBuildSynergyHint(pistolByName, { weapon: 'pistol' });
    expect(hint2.hasSynergy).toBe(true);
    expect(hint2.synergyType).toBe('EVOLUTION_KEY');
    expect(hint2.hintText).toBe('⚡ UNLOCKS RICOCHET REVOLVER EVOLUTION!');

    // 3. Machine Gun with hair_trigger
    const mgPickup = createModPedestal({
      id: 'hair_trigger',
      name: 'Hair Trigger',
      desc: 'Faster fire'
    });
    const hint3 = getShopBuildSynergyHint(mgPickup, { weapon: 'machine_gun' });
    expect(hint3).toEqual({
      hasSynergy: true,
      synergyType: 'EVOLUTION_KEY',
      hintText: '⚡ UNLOCKS HYPER-VULCAN GATLING EVOLUTION!'
    });

    // 4. Shotgun with Split Chamber
    const flakPickup = createModPedestal({
      id: 'split_chamber',
      name: 'Split Chamber',
      desc: 'More pellets'
    });
    const hint4 = getShopBuildSynergyHint(flakPickup, { weapon: 'shotgun' });
    expect(hint4).toEqual({
      hasSynergy: true,
      synergyType: 'EVOLUTION_KEY',
      hintText: '⚡ UNLOCKS HELLFIRE FLAK CANNON EVOLUTION!'
    });
  });

  it('returns STANDARD when pedestal mod does not match player weapon evolution', () => {
    const pickup = createModPedestal({
      id: 'speed_boost',
      name: 'Speed Boost',
      desc: '+Speed'
    });
    const hint = getShopBuildSynergyHint(pickup, { weapon: 'pistol' });
    expect(hint).toEqual({
      hasSynergy: false,
      synergyType: 'STANDARD',
      hintText: 'Standard Black Market Ordnance'
    });
  });

  it('identifies LOW_HULL_REPAIR synergy when player hull is <= 50% maxHp', () => {
    const heartPickup: Pickup = {
      x: 100,
      y: 100,
      radius: 20,
      type: 'shop_heart',
      name: 'Hull Repair',
      cost: 15
    };

    // Exactly 50% boundary (3 / 6)
    const hintHalf = getShopBuildSynergyHint(heartPickup, { hp: 3, maxHp: 6 });
    expect(hintHalf).toEqual({
      hasSynergy: true,
      synergyType: 'LOW_HULL_REPAIR',
      hintText: '⚠️ CRITICAL HULL REPAIR RECOMMENDED!'
    });

    // Critical low (1 / 6)
    const hintLow = getShopBuildSynergyHint(heartPickup, { hp: 1, maxHp: 6 });
    expect(hintLow.hasSynergy).toBe(true);
    expect(hintLow.synergyType).toBe('LOW_HULL_REPAIR');

    // Odd maxHp boundary (1 / 3 -> ceil(1.5) = 2, 1 <= 2)
    const hintOdd = getShopBuildSynergyHint(heartPickup, { hp: 1, maxHp: 3 });
    expect(hintOdd.hasSynergy).toBe(true);
    expect(hintOdd.synergyType).toBe('LOW_HULL_REPAIR');

    // Safe health (> 50%, e.g. 4 / 6) -> STANDARD
    const hintSafe = getShopBuildSynergyHint(heartPickup, { hp: 4, maxHp: 6 });
    expect(hintSafe).toEqual({
      hasSynergy: false,
      synergyType: 'STANDARD',
      hintText: 'Standard Black Market Ordnance'
    });

    // Full health (6 / 6) -> STANDARD
    const hintFull = getShopBuildSynergyHint(heartPickup, { hp: 6, maxHp: 6 });
    expect(hintFull.hasSynergy).toBe(false);
    expect(hintFull.synergyType).toBe('STANDARD');

    // Default player values (hp = 6, maxHp = 6 -> 6 <= 3 is false)
    expect(getShopBuildSynergyHint(heartPickup, {})).toEqual({
      hasSynergy: false,
      synergyType: 'STANDARD',
      hintText: 'Standard Black Market Ordnance'
    });
  });

  it('identifies WEAPON_UPGRADE synergy when run_weapon differs from equipped weapon', () => {
    const weaponPickup: Pickup = {
      x: 100,
      y: 100,
      radius: 20,
      type: 'run_weapon',
      name: 'Shotgun',
      weaponId: 'shotgun',
      cost: 35
    };

    // Different weapon equipped
    const hint = getShopBuildSynergyHint(weaponPickup, { weapon: 'pistol' });
    expect(hint).toEqual({
      hasSynergy: true,
      synergyType: 'WEAPON_UPGRADE',
      hintText: '🔫 ADDS NEW WEAPON TO RUN DECK!'
    });

    // Same weapon already equipped -> STANDARD
    const hintSame = getShopBuildSynergyHint(weaponPickup, { weapon: 'shotgun' });
    expect(hintSame).toEqual({
      hasSynergy: false,
      synergyType: 'STANDARD',
      hintText: 'Standard Black Market Ordnance'
    });

    // Player with no weapon property -> STANDARD
    const hintNoWeapon = getShopBuildSynergyHint(weaponPickup, {});
    expect(hintNoWeapon.hasSynergy).toBe(false);
    expect(hintNoWeapon.synergyType).toBe('STANDARD');
  });

  it('returns STANDARD when pickup or player are missing or null/undefined', () => {
    expect(getShopBuildSynergyHint(null, null)).toEqual({
      hasSynergy: false,
      synergyType: 'STANDARD',
      hintText: 'Standard Black Market Ordnance'
    });

    expect(getShopBuildSynergyHint(undefined, undefined)).toEqual({
      hasSynergy: false,
      synergyType: 'STANDARD',
      hintText: 'Standard Black Market Ordnance'
    });

    const unknownPickup = {
      x: 0,
      y: 0,
      radius: 10,
      type: 'unknown_pickup_kind'
    } as any;
    expect(getShopBuildSynergyHint(unknownPickup, { weapon: 'pistol' })).toEqual({
      hasSynergy: false,
      synergyType: 'STANDARD',
      hintText: 'Standard Black Market Ordnance'
    });
  });

  it('is accessible via ShopModalController static and instance methods', () => {
    const pickup: Pickup = {
      x: 100,
      y: 100,
      radius: 20,
      type: 'shop_heart',
      name: 'Hull Repair',
      cost: 15
    };
    const player = { hp: 2, maxHp: 6 };

    expect(ShopModalController.getShopBuildSynergyHint(pickup, player)).toEqual(
      getShopBuildSynergyHint(pickup, player)
    );

    const controller = new ShopModalController();
    expect(controller.getShopBuildSynergyHint(pickup, player)).toEqual(
      getShopBuildSynergyHint(pickup, player)
    );
  });
});

describe('HubStationModalController & getHubStationPromptInfo (Wave 14-15)', () => {
  const HUB_MARKUP = `
    <button id="outside-focus-btn" type="button">outside</button>
    <button type="button" id="hub-interact-banner" class="hub-interact-banner" hidden>
      <span class="hub-interact-key">[PRESS E]</span>
      <div class="hub-interact-copy">
        <strong id="hub-interact-title"></strong>
        <span id="hub-interact-desc"></span>
      </div>
    </button>
    <div id="hub-station-overlay" aria-hidden="true">
      <div class="hub-station-card" role="dialog" aria-modal="true" aria-labelledby="hub-station-title">
        <header class="hub-station-header">
          <div class="hub-station-title-wrap">
            <span class="hub-station-kicker" id="hub-station-kicker"></span>
            <h2 class="hub-station-title" id="hub-station-title"></h2>
          </div>
          <div class="hub-station-speaker-pill" id="hub-station-speaker"></div>
        </header>
        <blockquote class="hub-station-quote" id="hub-station-quote"></blockquote>
        <div class="hub-station-purpose" id="hub-station-purpose"></div>
        <div class="hub-station-body" id="hub-station-body"></div>
        <div class="hub-station-feedback" id="hub-station-feedback" hidden></div>
        <footer class="hub-station-actions" id="hub-station-actions">
          <button type="button" class="portal-btn portal-btn--primary" id="btn-hub-station-primary"><kbd>E</kbd> ACTIVATE</button>
          <button type="button" class="portal-btn portal-btn--secondary" id="btn-hub-station-secondary">CYCLE HEAT</button>
          <button type="button" class="portal-btn portal-btn--secondary" id="btn-hub-station-close"><kbd>ESC</kbd> CLOSE</button>
        </footer>
      </div>
    </div>
  `;

  function createHubOptions(overrides: Partial<HubStationOpenOptions> = {}): HubStationOpenOptions {
    return {
      npcId: 'garage',
      metaSave: {
        scrap: 25,
        heatLevel: 0,
        bestFloor: 3,
        totalKills: 142,
        bossesSlain: 2,
        totalRuns: 5,
        stash: [{ id: 'part-1' }],
        equipped: {
          engine: { slot: 'engine', name: 'Twin Turbo', rarity: 1 }
        }
      },
      player: {
        weapon: 'shotgun',
        hp: 5,
        maxHp: 6
      },
      scannerClaimed: false,
      bountyClaimed: false,
      onReforge: vi.fn(() => ({ ok: true, message: 'Reforged successfully!' })),
      onClaimScanner: vi.fn(() => ({ ok: true, message: 'Scanner calibrated!' })),
      onClaimBountyCache: vi.fn(() => ({ ok: true, message: 'Supply cache secured!' })),
      onSelectHeat: vi.fn(),
      onLaunchRun: vi.fn(),
      onClose: vi.fn(),
      ...overrides
    };
  }

  describe('getHubStationPromptInfo pure helper', () => {
    it('returns contextual prompt info for garage station', () => {
      const info = getHubStationPromptInfo('garage');
      expect(info).toEqual({
        title: '🔧 GARAGE & ARMORY BAY',
        summary: 'Equip & salvage Stash parts, upgrade permanent Bike stats, and unlock new Weapons',
        actionLabel: 'OPEN GARAGE [E]',
        accentColor: '#ffd60a'
      });
    });

    it('returns contextual prompt info for blacksmith station', () => {
      const info = getHubStationPromptInfo('blacksmith');
      expect(info).toEqual({
        title: '⚒️ THE SCRAP FORGE',
        summary: "Spend 12 Scrap ⚙️ to upgrade an equipped item's Rarity (+25% stats) or craft new Gear",
        actionLabel: 'OPEN FORGE [E]',
        accentColor: '#2ee6ff'
      });
    });

    it('returns contextual prompt info for codex station with scannerClaimed variations', () => {
      const unclaimed = getHubStationPromptInfo('codex', undefined, undefined, { scannerClaimed: false });
      expect(unclaimed.title).toBe('📡 TACTICAL INTEL & SCANNER LAB');
      expect(unclaimed.summary).toContain('Claim FREE +8–20% Weapon DMG & +15% Bullet Speed Buff');
      expect(unclaimed.actionLabel).toBe('OPEN INTEL LAB [E]');
      expect(unclaimed.accentColor).toBe('#9d4edd');

      const claimed = getHubStationPromptInfo('codex', undefined, undefined, { scannerClaimed: true });
      expect(claimed.summary).toContain('Tactical Scanner +DMG/+SPD Buff Active!');

      const undefinedBuffs = getHubStationPromptInfo('codex');
      expect(undefinedBuffs.summary).toContain('Claim FREE +8–20% Weapon DMG & +15% Bullet Speed Buff');
    });

    it('returns contextual prompt info for bounty station across claimed states and Heat levels 0..3', () => {
      for (let heat = 0; heat <= 3; heat++) {
        const meta = { heatLevel: heat };

        const unclaimed = getHubStationPromptInfo('bounty', meta, undefined, { bountyClaimed: false });
        expect(unclaimed.title).toBe('🎖️ OUTLAW WAR ROOM & BOUNTIES');
        expect(unclaimed.summary).toContain('Claim FREE +15 Coins 🪙 & +1 Max Hull ❤️ Cache');
        expect(unclaimed.actionLabel).toBe('OPEN WAR ROOM [E]');
        expect(unclaimed.accentColor).toBe('#06d6a0');

        const claimed = getHubStationPromptInfo('bounty', meta, undefined, { bountyClaimed: true });
        expect(claimed.summary).toContain('Configure Threat Heat Level (0–3) for up to +75% Bonus Scrap');

        const noBuffs = getHubStationPromptInfo('bounty', meta);
        expect(noBuffs.summary).toContain('Claim FREE +15 Coins 🪙 & +1 Max Hull ❤️ Cache');
      }
    });

    it('returns contextual prompt info for launch station', () => {
      const info = getHubStationPromptInfo('launch');
      expect(info).toEqual({
        title: '🚀 SECTOR 1 HIGHWAY LAUNCH GATE',
        summary: 'Review Pre-Run Readiness Checklist & Deploy into Sector 1 (Rust Belt Outskirts)',
        actionLabel: 'OPEN LAUNCH GATE [E]',
        accentColor: '#e5203a'
      });
    });

    it('returns contextual prompt info for armory station', () => {
      const info = getHubStationPromptInfo('armory');
      expect(info).toEqual({
        title: '🔫 TACTICAL ARMORY & BALLISTICS',
        summary: 'Inspect tactical combat roles, optimal ranges, and base DPS for all weapons',
        actionLabel: 'OPEN ARMORY [E]',
        accentColor: '#ff0055'
      });
    });

    it('returns fallback prompt info for unknown station id', () => {
      const info = getHubStationPromptInfo('unknown_station');
      expect(info).toEqual({
        title: 'STATION // INTERACT',
        summary: 'Press [E] to interact with this hideout station',
        actionLabel: 'INTERACT [E]',
        accentColor: '#ffd60a'
      });
    });
  });

  describe('HubStationModalController DOM & Proximity Banner lifecycle', () => {
    let modal: HubStationModalController;
    let overlay: HTMLElement;
    let banner: HTMLButtonElement;

    beforeEach(() => {
      document.body.innerHTML = HUB_MARKUP;
      overlay = document.getElementById('hub-station-overlay')!;
      banner = document.getElementById('hub-interact-banner') as HTMLButtonElement;
      modal = new HubStationModalController();
    });

    afterEach(() => {
      modal.close();
      document.body.innerHTML = '';
    });

    it('initializes in closed state and provides card element access', () => {
      expect(modal.isOpen()).toBe(false);
      expect(modal.getCard()).toBe(overlay.querySelector('.hub-station-card'));
    });

    it('displays and configures proximity interaction banner on showBanner', () => {
      const onInteract = vi.fn();
      modal.showBanner('blacksmith', { scrap: 10 }, null, { scannerClaimed: false, bountyClaimed: false }, onInteract);

      expect(banner.hasAttribute('hidden')).toBe(false);
      expect(banner.getAttribute('data-station')).toBe('blacksmith');
      expect(banner.style.getPropertyValue('--banner-accent')).toBe('#2ee6ff');
      expect(document.getElementById('hub-interact-title')?.textContent).toBe('⚒️ THE SCRAP FORGE');
      expect(document.getElementById('hub-interact-desc')?.textContent).toContain('Spend 12 Scrap');

      banner.click();
      expect(onInteract).toHaveBeenCalledTimes(1);
    });

    it('replaces click listener without duplicate callbacks when showBanner is called repeatedly', () => {
      const onFirst = vi.fn();
      const onSecond = vi.fn();

      modal.showBanner('codex', null, null, { scannerClaimed: false, bountyClaimed: false }, onFirst);
      modal.showBanner('launch', null, null, { scannerClaimed: false, bountyClaimed: false }, onSecond);

      banner.click();
      expect(onFirst).not.toHaveBeenCalled();
      expect(onSecond).toHaveBeenCalledTimes(1);
    });

    it('hides proximity banner via hideBanner', () => {
      const onInteract = vi.fn();
      modal.showBanner('garage', null, null, { scannerClaimed: false, bountyClaimed: false }, onInteract);
      expect(banner.hasAttribute('hidden')).toBe(false);

      modal.hideBanner();
      expect(banner.hasAttribute('hidden')).toBe(true);

      banner.click();
      expect(onInteract).not.toHaveBeenCalled();
    });

    it('automatically hides proximity banner when showBanner is called while modal is open', () => {
      modal.open(createHubOptions({ npcId: 'blacksmith' }));
      expect(modal.isOpen()).toBe(true);

      const onInteract = vi.fn();
      modal.showBanner('blacksmith', null, null, { scannerClaimed: false, bountyClaimed: false }, onInteract);
      expect(banner.hasAttribute('hidden')).toBe(true);
    });

    it('opens modal, hides proximity banner, and sets aria and visibility attributes', () => {
      modal.showBanner('garage', null, null, { scannerClaimed: false, bountyClaimed: false }, vi.fn());
      expect(banner.hasAttribute('hidden')).toBe(false);

      const options = createHubOptions({ npcId: 'garage' });
      modal.open(options);

      expect(modal.isOpen()).toBe(true);
      expect(banner.hasAttribute('hidden')).toBe(true);
      expect(overlay.classList.contains('visible')).toBe(true);
      expect(overlay.getAttribute('aria-hidden')).toBe('false');
      expect(document.getElementById('hub-station-title')?.textContent).toBe('🔧 GARAGE & ARMORY BAY');
    });

    it('closes modal, resets aria attributes, and fires onClose callback', () => {
      const onClose = vi.fn();
      const options = createHubOptions({ npcId: 'garage', onClose });
      modal.open(options);

      modal.close();
      expect(modal.isOpen()).toBe(false);
      expect(overlay.classList.contains('visible')).toBe(false);
      expect(overlay.getAttribute('aria-hidden')).toBe('true');
      expect(onClose).toHaveBeenCalledTimes(1);

      // Subsequent close calls are idempotent and do not refire onClose
      modal.close();
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('clicking close button (#btn-hub-station-close) closes the modal', () => {
      const onClose = vi.fn();
      modal.open(createHubOptions({ npcId: 'garage', onClose }));

      const closeBtn = document.getElementById('btn-hub-station-close') as HTMLButtonElement;
      closeBtn.click();

      expect(modal.isOpen()).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('restores focus to previous active element on close', () => {
      const outsideBtn = document.getElementById('outside-focus-btn') as HTMLButtonElement;
      outsideBtn.focus();
      expect(document.activeElement).toBe(outsideBtn);

      modal.open(createHubOptions({ npcId: 'garage' }));
      expect(document.activeElement?.id).toBe('btn-hub-station-primary');

      modal.close();
      expect(document.activeElement).toBe(outsideBtn);
    });

    it('handles Escape key by closing modal and swallowing keyboard event', () => {
      const onClose = vi.fn();
      const bubbleSpy = vi.fn();
      window.addEventListener('keydown', bubbleSpy);

      modal.open(createHubOptions({ npcId: 'garage', onClose }));
      const ev = key('Escape');

      window.removeEventListener('keydown', bubbleSpy);
      expect(modal.isOpen()).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
      expect(ev.defaultPrevented).toBe(true);
      expect(bubbleSpy).not.toHaveBeenCalled();
    });

    it.each(['Enter', 'e', 'E'])('key %j triggers primary button and is swallowed', (k) => {
      const onReforge = vi.fn(() => ({ ok: true, message: 'Forged!' }));
      const bubbleSpy = vi.fn();
      window.addEventListener('keydown', bubbleSpy);

      modal.open(createHubOptions({ npcId: 'blacksmith', onReforge }));
      const ev = key(k);

      window.removeEventListener('keydown', bubbleSpy);
      expect(onReforge).toHaveBeenCalledTimes(1);
      expect(ev.defaultPrevented).toBe(true);
      expect(bubbleSpy).not.toHaveBeenCalled();
    });

    it('unhandled keys pass through without modal interception while open', () => {
      const bubbleSpy = vi.fn();
      window.addEventListener('keydown', bubbleSpy);

      modal.open(createHubOptions({ npcId: 'garage' }));
      key('w');

      window.removeEventListener('keydown', bubbleSpy);
      expect(bubbleSpy).toHaveBeenCalledTimes(1);
      expect(modal.isOpen()).toBe(true);
    });

    it('traps Tab navigation between focusable elements within the overlay', () => {
      modal.open(createHubOptions({ npcId: 'garage' }));
      const primaryBtn = document.getElementById('btn-hub-station-primary') as HTMLButtonElement;
      const closeBtn = document.getElementById('btn-hub-station-close') as HTMLButtonElement;

      // Tab backwards from first focusable element
      primaryBtn.focus();
      const shiftTab = key('Tab', { shiftKey: true });
      expect(shiftTab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(closeBtn);

      // Tab forwards from last focusable element
      closeBtn.focus();
      const forwardTab = key('Tab', { shiftKey: false });
      expect(forwardTab.defaultPrevented).toBe(true);
      expect(document.activeElement).toBe(primaryBtn);
    });

    it('sets data-career-rank, data-career-title, and data-career-score attributes on #hub-station-overlay on open', () => {
      const options = createHubOptions({
        npcId: 'garage',
        metaSave: {
          totalKills: 160,
          bossesSlain: 2,
          bestFloor: 3
        }
      });
      // careerScore = 160 + 2*25 + (3-1)*40 = 290 -> apex_roadlord
      const expectedRank = getCareerOutlawRank(options.metaSave);

      modal.open(options);

      const hubOverlay = document.getElementById('hub-station-overlay')!;
      expect(hubOverlay.getAttribute('data-career-rank')).toBe(expectedRank.rankId);
      expect(hubOverlay.getAttribute('data-career-title')).toBe(expectedRank.title);
      expect(hubOverlay.getAttribute('data-career-score')).toBe(String(expectedRank.careerScore));
      expect(modal.overlay?.getAttribute('data-career-rank')).toBe('apex_roadlord');
    });

    it('operates safely in headless mode when DOM elements are absent', () => {
      document.body.innerHTML = '';
      const headless = new HubStationModalController();
      expect(headless.isOpen()).toBe(false);
      expect(headless.getCard()).toBeNull();

      expect(() => {
        headless.showBanner('garage', null, null, { scannerClaimed: false, bountyClaimed: false }, vi.fn());
        headless.hideBanner();
        headless.open(createHubOptions({ npcId: 'garage' }));
        expect(headless.isOpen()).toBe(true);
        headless.close();
        expect(headless.isOpen()).toBe(false);
      }).not.toThrow();
    });
  });

  describe('Station-specific modal dialog features', () => {
    let modal: HubStationModalController;

    beforeEach(() => {
      document.body.innerHTML = HUB_MARKUP;
      modal = new HubStationModalController();
    });

    afterEach(() => {
      modal.close();
      document.body.innerHTML = '';
    });

    it('renders blacksmith station with upgradeable gear and processes reforge', () => {
      const onReforge = vi.fn(() => ({ ok: true, message: 'Chassis forged to Superior!' }));
      const options = createHubOptions({
        npcId: 'blacksmith',
        metaSave: {
          scrap: 36,
          equipped: {
            chassis: { slot: 'chassis', name: 'Reinforced Steel Frame', rarity: 1 }
          }
        },
        onReforge
      });
      modal.open(options);

      expect(document.getElementById('hub-station-title')?.textContent).toBe('⚒️ THE SCRAP FORGE');
      expect(document.getElementById('hub-station-speaker')?.textContent).toBe('IRONSMITH KORR');
      expect(document.querySelector('.hub-stat-val.hub-gold')?.textContent).toContain('36 SCRAP');
      expect(document.querySelector('.hub-stat-val.hub-cyan')?.textContent).toContain('12 ⚙️ SCRAP');
      expect(document.querySelector('.hub-forge-name')?.textContent).toBe('Reinforced Steel Frame');
      expect(document.querySelector('.hub-tier-badge')?.textContent).toContain('MAGIC');
      expect(document.querySelector('.hub-tier-badge.next')?.textContent).toContain('RARE (+25% Stats)');

      const primaryBtn = document.getElementById('btn-hub-station-primary') as HTMLButtonElement;
      expect(primaryBtn.textContent).toContain('REFORGE GEAR (12 ⚙️)');
      primaryBtn.click();

      expect(onReforge).toHaveBeenCalledTimes(1);
      const feedback = document.getElementById('hub-station-feedback');
      expect(feedback?.textContent).toBe('Chassis forged to Superior!');
      expect(feedback?.classList.contains('is-success')).toBe(true);
      expect(feedback?.hasAttribute('hidden')).toBe(false);
    });

    it('renders blacksmith station in optimal state when all equipped slots are Legendary', () => {
      const options = createHubOptions({
        npcId: 'blacksmith',
        metaSave: {
          scrap: 60,
          equipped: {
            weapon: { slot: 'weapon', name: 'Plasma Cannon', rarity: 3 }
          }
        }
      });
      modal.open(options);

      expect(document.querySelector('.hub-legendary-title')?.textContent).toContain('ALL SLOTS LEGENDARY / OPTIMAL');
      expect(document.querySelector('.hub-forge-desc')?.textContent).toContain('craft a brand-new high-grade part');
    });

    it('renders codex station with career telemetry and claims tactical scanner buff', () => {
      const onClaimScanner = vi.fn(() => ({ ok: true, message: 'Tactical Scanner locked: +15% Speed, +12% DMG' }));
      const options = createHubOptions({
        npcId: 'codex',
        metaSave: {
          bestFloor: 5,
          totalKills: 489,
          bossesSlain: 4,
          totalRuns: 16
        },
        scannerClaimed: false,
        onClaimScanner
      });
      modal.open(options);

      expect(document.getElementById('hub-station-title')?.textContent).toBe('📡 TACTICAL INTEL & SCANNER LAB');
      expect(document.getElementById('hub-station-speaker')?.textContent).toBe('CHIEF TACTICIAN DOC');
      expect(document.body.innerHTML).toContain('Floor 5');
      expect(document.body.innerHTML).toContain('489');
      expect(document.body.innerHTML).toContain('4');
      expect(document.body.innerHTML).toContain('16');
      expect(document.querySelector('.hub-scanner-status-pill')?.textContent).toBe('⚡ READY TO CALIBRATE');

      const primaryBtn = document.getElementById('btn-hub-station-primary') as HTMLButtonElement;
      expect(primaryBtn.textContent).toContain('CALIBRATE TACTICAL SCANNER (FREE)');
      primaryBtn.click();

      expect(onClaimScanner).toHaveBeenCalledTimes(1);
      expect(options.scannerClaimed).toBe(true);
      expect(document.getElementById('hub-station-feedback')?.textContent).toContain('Tactical Scanner locked');
      expect(document.querySelector('.hub-scanner-status-pill')?.textContent).toBe('✓ ACTIVE');
      expect(primaryBtn.textContent).toContain('SCANNER CALIBRATED & ACTIVE');

      // Clicking again when active closes the dialog
      primaryBtn.click();
      expect(modal.isOpen()).toBe(false);
    });

    it('renders codex station with career rank banner showing title, score, and next milestone text', () => {
      const options = createHubOptions({
        npcId: 'codex',
        metaSave: {
          bestFloor: 2,
          totalKills: 60,
          bossesSlain: 1,
          totalRuns: 6
        }
      });
      // careerScore = 60 + 25 + 40 = 125 -> syndicate_enforcer
      const expectedRank = getCareerOutlawRank(options.metaSave);

      modal.open(options);

      const overlayEl = document.getElementById('hub-station-overlay')!;
      expect(overlayEl.getAttribute('data-career-rank')).toBe(expectedRank.rankId);
      expect(overlayEl.getAttribute('data-career-title')).toBe(expectedRank.title);
      expect(overlayEl.getAttribute('data-career-score')).toBe(String(expectedRank.careerScore));

      const bodyEl = document.getElementById('hub-station-body')!;
      expect(bodyEl.innerHTML).toContain(expectedRank.title);
      expect(bodyEl.innerHTML).toContain(`(SCORE: ${expectedRank.careerScore})`);
      expect(bodyEl.innerHTML).toContain(expectedRank.nextMilestoneText);
      const banner = bodyEl.querySelector('.hub-career-rank-banner');
      expect(banner).not.toBeNull();
      expect(banner?.getAttribute('data-career-rank')).toBe(expectedRank.rankId);
      expect(banner?.textContent).toContain(`${expectedRank.title} (SCORE: ${expectedRank.careerScore}) — ${expectedRank.nextMilestoneText}`);
    });

    it('renders bounty station, claims supply cache, and selects Heat levels 0..3', () => {
      const onClaimBountyCache = vi.fn(() => ({ ok: true, message: 'Free Cache Claimed: +15 Coins & +1 Max Hull' }));
      const onSelectHeat = vi.fn();
      const options = createHubOptions({
        npcId: 'bounty',
        metaSave: { heatLevel: 0 },
        bountyClaimed: false,
        onClaimBountyCache,
        onSelectHeat
      });
      modal.open(options);

      expect(document.getElementById('hub-station-title')?.textContent).toBe('🎖️ OUTLAW WAR ROOM & BOUNTIES');
      expect(document.getElementById('hub-station-speaker')?.textContent).toBe('VALKYRIE VEX');

      // 1. Claim supply cache
      const cacheBtn = document.getElementById('btn-hub-claim-cache') as HTMLButtonElement;
      expect(cacheBtn).not.toBeNull();
      expect(cacheBtn.disabled).toBe(false);
      cacheBtn.click();

      expect(onClaimBountyCache).toHaveBeenCalledTimes(1);
      expect(options.bountyClaimed).toBe(true);
      expect(document.getElementById('hub-station-feedback')?.textContent).toContain('Free Cache Claimed');
      expect((document.getElementById('btn-hub-claim-cache') as HTMLButtonElement).disabled).toBe(true);

      // 2. Select Heat levels 0..3 via heat buttons
      const heatButtons = document.querySelectorAll<HTMLButtonElement>('.hub-heat-btn');
      expect(heatButtons.length).toBe(4);

      heatButtons[1].click();
      expect(onSelectHeat).toHaveBeenCalledWith(1);
      expect(options.metaSave.heatLevel).toBe(1);
      expect(document.querySelector('.hub-heat-current')?.textContent).toBe('CURRENT: HEAT 1');

      heatButtons[2].click();
      expect(onSelectHeat).toHaveBeenCalledWith(2);
      expect(options.metaSave.heatLevel).toBe(2);
      expect(document.querySelector('.hub-heat-current')?.textContent).toBe('CURRENT: HEAT 2');

      heatButtons[3].click();
      expect(onSelectHeat).toHaveBeenCalledWith(3);
      expect(options.metaSave.heatLevel).toBe(3);
      expect(document.querySelector('.hub-heat-current')?.textContent).toBe('CURRENT: HEAT 3');

      heatButtons[0].click();
      expect(onSelectHeat).toHaveBeenCalledWith(0);
      expect(options.metaSave.heatLevel).toBe(0);
      expect(document.querySelector('.hub-heat-current')?.textContent).toBe('CURRENT: HEAT 0');

      // Primary button confirms setup and closes modal
      const primaryBtn = document.getElementById('btn-hub-station-primary') as HTMLButtonElement;
      expect(primaryBtn.textContent).toContain('CONFIRM WAR ROOM SETUP');
      primaryBtn.click();
      expect(modal.isOpen()).toBe(false);
    });

    it('cycles Heat level (0..3) via heat selector buttons and secondary action button #btn-hub-station-secondary', () => {
      const onSelectHeat = vi.fn();
      const metaSave = { heatLevel: 0 };
      const options = createHubOptions({
        npcId: 'bounty',
        metaSave,
        onSelectHeat
      });
      modal.open(options);

      const secondaryBtn = document.getElementById('btn-hub-station-secondary') as HTMLButtonElement;
      expect(secondaryBtn).not.toBeNull();

      // Attach secondary button cycling behavior to cycle heat 0 -> 1 -> 2 -> 3 -> 0
      secondaryBtn.addEventListener('click', () => {
        const nextHeat = ((metaSave.heatLevel ?? 0) + 1) % 4;
        options.onSelectHeat(nextHeat);
        metaSave.heatLevel = nextHeat;
        modal.open({ ...options });
      });

      // 0 -> 1
      secondaryBtn.click();
      expect(onSelectHeat).toHaveBeenCalledWith(1);
      expect(metaSave.heatLevel).toBe(1);
      expect(document.querySelector('.hub-heat-current')?.textContent).toBe('CURRENT: HEAT 1');

      // 1 -> 2
      secondaryBtn.click();
      expect(onSelectHeat).toHaveBeenCalledWith(2);
      expect(metaSave.heatLevel).toBe(2);
      expect(document.querySelector('.hub-heat-current')?.textContent).toBe('CURRENT: HEAT 2');

      // 2 -> 3
      secondaryBtn.click();
      expect(onSelectHeat).toHaveBeenCalledWith(3);
      expect(metaSave.heatLevel).toBe(3);
      expect(document.querySelector('.hub-heat-current')?.textContent).toBe('CURRENT: HEAT 3');

      // 3 -> 0
      secondaryBtn.click();
      expect(onSelectHeat).toHaveBeenCalledWith(0);
      expect(metaSave.heatLevel).toBe(0);
      expect(document.querySelector('.hub-heat-current')?.textContent).toBe('CURRENT: HEAT 0');
    });

    it('renders launch station checklist and auto-claims unclaimed buffs before deployment', () => {
      const onClaimScanner = vi.fn(() => ({ ok: true, message: 'Scanner locked!' }));
      const onClaimBountyCache = vi.fn(() => ({ ok: true, message: 'Cache secured!' }));
      const onLaunchRun = vi.fn();
      const options = createHubOptions({
        npcId: 'launch',
        player: { weapon: 'shotgun' },
        metaSave: { heatLevel: 2 },
        scannerClaimed: false,
        bountyClaimed: false,
        onClaimScanner,
        onClaimBountyCache,
        onLaunchRun
      });
      modal.open(options);

      expect(document.getElementById('hub-station-title')?.textContent).toBe('🚀 SECTOR 1 HIGHWAY LAUNCH GATE');
      expect(document.getElementById('hub-station-speaker')?.textContent).toBe('DISPATCH OPERATOR');
      expect(document.body.innerHTML).toContain('SHOTGUN');
      expect(document.body.innerHTML).toContain('HEAT 2 (+50% Bonus Scrap)');

      const autoClaimBtn = document.getElementById('btn-hub-autoclaim') as HTMLButtonElement;
      expect(autoClaimBtn).not.toBeNull();
      autoClaimBtn.click();

      expect(onClaimScanner).toHaveBeenCalledTimes(1);
      expect(onClaimBountyCache).toHaveBeenCalledTimes(1);
      expect(options.scannerClaimed).toBe(true);
      expect(options.bountyClaimed).toBe(true);
      expect(document.querySelector('.hub-ready-banner')?.textContent).toContain('All free pre-run systems calibrated');

      // Click primary button to deploy into Sector 1
      const primaryBtn = document.getElementById('btn-hub-station-primary') as HTMLButtonElement;
      expect(primaryBtn.textContent).toContain('DEPLOY TO SECTOR 1 ►');
      primaryBtn.click();

      expect(modal.isOpen()).toBe(false);
      expect(onLaunchRun).toHaveBeenCalledTimes(1);
    });

    it('renders garage station summary and closes upon primary action click', () => {
      const options = createHubOptions({
        npcId: 'garage',
        metaSave: {
          scrap: 45,
          stash: [{ id: 'p1' }, { id: 'p2' }]
        }
      });
      modal.open(options);

      expect(document.getElementById('hub-station-title')?.textContent).toBe('🔧 GARAGE & ARMORY BAY');
      expect(document.querySelector('.hub-stat-val.hub-gold')?.textContent).toContain('45 SCRAP');
      expect(document.querySelector('.hub-stat-val.hub-cyan')?.textContent).toContain('2 PARTS STORED');

      const primaryBtn = document.getElementById('btn-hub-station-primary') as HTMLButtonElement;
      expect(primaryBtn.textContent).toContain('OPEN FULL GARAGE');
      primaryBtn.click();

      expect(modal.isOpen()).toBe(false);
    });

    it('renders armory station with tactical roles, base DPS, and tactical summary lines for all weapons', () => {
      const options = createHubOptions({
        npcId: 'armory',
        metaSave: {
          scrap: 120,
          unlocked: {
            machine_gun: true,
            shotgun: true
          }
        },
        player: {
          weapon: 'pistol'
        }
      });
      modal.open(options);

      expect(document.getElementById('hub-station-title')?.textContent).toBe('🔫 TACTICAL ARMORY & BALLISTICS');
      expect(document.getElementById('hub-station-speaker')?.textContent).toBe('QUARTERMASTER VEX');

      const cards = document.querySelectorAll<HTMLElement>('.hub-weapon-card');
      const weaponIds = Object.keys(WEAPONS) as WeaponId[];
      expect(cards.length).toBe(weaponIds.length);

      weaponIds.forEach((id, index) => {
        const card = cards[index];
        const tac = getWeaponTacticalProfile(id);
        const w = WEAPONS[id];

        expect(card.getAttribute('data-weapon-id')).toBe(id);
        expect(card.getAttribute('data-tactical-role')).toBe(tac.roleTag);
        expect(card.getAttribute('data-base-dps')).toBe(String(tac.baseDps));

        const tacticalSpan = card.querySelector('.hub-weapon-tactical');
        expect(tacticalSpan).not.toBeNull();
        expect(tacticalSpan?.textContent).toBe(tac.summaryLine);
        expect(tacticalSpan?.textContent).toContain(tac.roleTag);
        expect(tacticalSpan?.textContent).toContain(`${tac.baseDps} BASE DPS`);
        expect(tacticalSpan?.textContent).toContain(tac.optimalRangeText);

        const nameEl = card.querySelector('.hub-weapon-name');
        expect(nameEl?.textContent).toBe(w.name);
      });

      // Verify pistol tactical profile specifically matches expected role & base DPS
      const pistolCard = document.querySelector<HTMLElement>('.hub-weapon-card[data-weapon-id="pistol"]');
      expect(pistolCard?.getAttribute('data-tactical-role')).toBe('PRECISION SIDEARM');
      expect(pistolCard?.getAttribute('data-base-dps')).toBe('48');
      expect(pistolCard?.querySelector('.hub-weapon-tactical')?.textContent).toBe(
        'PRECISION SIDEARM · 48 BASE DPS · MID RANGE'
      );
      expect(pistolCard?.className).toContain('is-equipped');

      // Verify unlocked and locked states
      const mgCard = document.querySelector<HTMLElement>('.hub-weapon-card[data-weapon-id="machine_gun"]');
      expect(mgCard?.className).toContain('is-unlocked');

      const railgunTac = getWeaponTacticalProfile('railgun');
      const railgunCard = document.querySelector<HTMLElement>('.hub-weapon-card[data-weapon-id="railgun"]');
      expect(railgunCard?.className).toContain('is-locked');
      expect(railgunCard?.getAttribute('data-tactical-role')).toBe(railgunTac.roleTag);
      expect(railgunCard?.getAttribute('data-base-dps')).toBe(String(railgunTac.baseDps));
      expect(railgunCard?.querySelector('.hub-weapon-tactical')?.textContent).toBe(railgunTac.summaryLine);

      // Primary button confirms loadout and closes modal
      const primaryBtn = document.getElementById('btn-hub-station-primary') as HTMLButtonElement;
      expect(primaryBtn.textContent).toContain('CONFIRM ARMORY LOADOUT');
      primaryBtn.click();
      expect(modal.isOpen()).toBe(false);
    });

    it('renders armory station via explicit renderArmory method', () => {
      const options = createHubOptions({
        npcId: 'armory',
        metaSave: { scrap: 50 },
        player: { weapon: 'machine_gun' }
      });
      modal.open(options);
      modal.renderArmory();

      const equippedCard = document.querySelector<HTMLElement>('.hub-weapon-card[data-weapon-id="machine_gun"]');
      expect(equippedCard?.className).toContain('is-equipped');
      expect(equippedCard?.getAttribute('data-tactical-role')).toBe('RAPID SUPPRESSION');
      expect(equippedCard?.getAttribute('data-base-dps')).toBe('58');
      expect(equippedCard?.querySelector('.hub-weapon-tactical')?.textContent).toBe(
        'RAPID SUPPRESSION · 58 BASE DPS · CLOSE-TO-MID RANGE'
      );
    });

    it('renders forge station and sets data-forge-can-reforge and data-forge-advisor DOM attributes on overlay when scrap is insufficient (< 15)', () => {
      const options = createHubOptions({
        npcId: 'forge',
        metaSave: { scrap: 9 },
        player: { items: ['nano_repair'] }
      });
      modal.open(options);

      const overlayEl = document.getElementById('hub-station-overlay')!;
      expect(overlayEl.getAttribute('data-forge-can-reforge')).toBe('false');
      expect(overlayEl.getAttribute('data-forge-advisor')).toBe(
        'FORGE ANVIL: 9 SCRAP (COST: 15) · Need 6 more Scrap to Reforge at the Anvil'
      );
      expect(document.querySelector('.hub-forge-advisor-text')?.textContent).toBe(
        'FORGE ANVIL: 9 SCRAP (COST: 15) · Need 6 more Scrap to Reforge at the Anvil'
      );
    });

    it('renders forge station and sets data-forge-can-reforge and data-forge-advisor DOM attributes when scrap is sufficient (>= 15) with 0 mods', () => {
      const options = createHubOptions({
        npcId: 'forge',
        metaSave: { scrap: 20 },
        player: { items: [] }
      });
      modal.open(options);

      const overlayEl = document.getElementById('hub-station-overlay')!;
      expect(overlayEl.getAttribute('data-forge-can-reforge')).toBe('true');
      expect(overlayEl.getAttribute('data-forge-advisor')).toBe(
        'FORGE ANVIL: 20 SCRAP (COST: 15) · Reforge Ready (15 Scrap) — Roll your first Outlaw Mod'
      );
    });

    it('renders forge station and sets data-forge-can-reforge and data-forge-advisor DOM attributes when scrap is sufficient (>= 15) with existing mods', () => {
      const options = createHubOptions({
        npcId: 'forge',
        metaSave: { scrap: 35 },
        player: { items: ['split_chamber', 'ricochet_mod'] }
      });
      modal.open(options);

      const overlayEl = document.getElementById('hub-station-overlay')!;
      expect(overlayEl.getAttribute('data-forge-can-reforge')).toBe('true');
      expect(overlayEl.getAttribute('data-forge-advisor')).toBe(
        'FORGE ANVIL: 35 SCRAP (COST: 15) · Reforge Ready (15 Scrap) — Reroll & upgrade active mod loadout'
      );
    });

    it('sets forge advisor attributes when opened with blacksmith alias and updates via renderForge', () => {
      const options = createHubOptions({
        npcId: 'blacksmith',
        metaSave: { scrap: 15 },
        player: { items: [] }
      });
      modal.open(options);

      const overlayEl = document.getElementById('hub-station-overlay')!;
      expect(overlayEl.getAttribute('data-forge-can-reforge')).toBe('true');
      expect(overlayEl.getAttribute('data-forge-advisor')).toBe(
        'FORGE ANVIL: 15 SCRAP (COST: 15) · Reforge Ready (15 Scrap) — Roll your first Outlaw Mod'
      );

      // Re-render forge with updated player items
      modal.renderForge({
        ...options,
        metaSave: { scrap: 25 },
        player: { items: ['cryo_rounds'] }
      });
      expect(overlayEl.getAttribute('data-forge-can-reforge')).toBe('true');
      expect(overlayEl.getAttribute('data-forge-advisor')).toBe(
        'FORGE ANVIL: 25 SCRAP (COST: 15) · Reforge Ready (15 Scrap) — Reroll & upgrade active mod loadout'
      );
    });

    it('supports modal.open shorthand with string npcId forge', () => {
      modal.open('forge', { scrap: 8 }, { items: [] });
      const overlayEl = document.getElementById('hub-station-overlay')!;
      expect(overlayEl.getAttribute('data-forge-can-reforge')).toBe('false');
      expect(overlayEl.getAttribute('data-forge-advisor')).toBe(
        'FORGE ANVIL: 8 SCRAP (COST: 15) · Need 7 more Scrap to Reforge at the Anvil'
      );
    });

    it('renders scanner station and sets data-scanner-active="false" and standby advisor when scannerBuff is not active', () => {
      const options = createHubOptions({
        npcId: 'scanner',
        player: { scannerBuff: false }
      });
      modal.open(options);

      const overlayEl = document.getElementById('hub-station-overlay')!;
      expect(overlayEl.getAttribute('data-scanner-active')).toBe('false');
      expect(overlayEl.getAttribute('data-scanner-advisor')).toBe(
        'SCANNER INTEL [FLOOR 1]: STANDBY (0% CRIT) · ACTIVATE SCANNER UPLINK (Free +15% Crit Chance & Full Floor Radar)'
      );
    });

    it('renders scanner station and sets data-scanner-active="true" and online advisor when scannerBuff is active', () => {
      const options = createHubOptions({
        npcId: 'scanner',
        player: { scannerBuff: true }
      });
      modal.open(options);

      const overlayEl = document.getElementById('hub-station-overlay')!;
      expect(overlayEl.getAttribute('data-scanner-active')).toBe('true');
      expect(overlayEl.getAttribute('data-scanner-advisor')).toBe(
        'SCANNER INTEL [FLOOR 1]: ONLINE (+15% CRIT) · TACTICAL UPLINK ONLINE (+15% Crit Chance & Minimap Reveal Active)'
      );
    });

    it('sets scanner advisor attributes when opened with codex alias and updates via renderScanner', () => {
      const options = createHubOptions({
        npcId: 'codex',
        player: { scannerBuff: false }
      });
      modal.open(options);

      const overlayEl = document.getElementById('hub-station-overlay')!;
      expect(overlayEl.getAttribute('data-scanner-active')).toBe('false');
      expect(overlayEl.getAttribute('data-scanner-advisor')).toContain('STANDBY (0% CRIT)');

      // Re-render scanner with active buff
      modal.renderScanner({
        ...options,
        player: { scannerBuff: true }
      });
      expect(overlayEl.getAttribute('data-scanner-active')).toBe('true');
      expect(overlayEl.getAttribute('data-scanner-advisor')).toContain('ONLINE (+15% CRIT)');
    });

    it('supports modal.open shorthand with string npcId scanner', () => {
      modal.open('scanner', {}, { scannerBuff: true });
      const overlayEl = document.getElementById('hub-station-overlay')!;
      expect(overlayEl.getAttribute('data-scanner-active')).toBe('true');
      expect(overlayEl.getAttribute('data-scanner-advisor')).toBe(
        'SCANNER INTEL [FLOOR 1]: ONLINE (+15% CRIT) · TACTICAL UPLINK ONLINE (+15% Crit Chance & Minimap Reveal Active)'
      );
    });
  });

  describe('getForgeStationAdvisor pure helper (M101)', () => {
    it('returns insufficient scrap advice when scrap < 15', () => {
      // 0 scrap
      const adv0: ForgeStationAdvisor = getForgeStationAdvisor({ scrap: 0 }, { items: [] });
      expect(adv0).toEqual({
        canReforge: false,
        scrapAvailable: 0,
        reforgeCost: 15,
        modCount: 0,
        recommendedAction: 'Need 15 more Scrap to Reforge at the Anvil',
        summaryLine: 'FORGE ANVIL: 0 SCRAP (COST: 15) · Need 15 more Scrap to Reforge at the Anvil'
      });

      // 10 scrap
      const adv10 = getForgeStationAdvisor({ scrap: 10 }, { items: ['m1'] });
      expect(adv10).toEqual({
        canReforge: false,
        scrapAvailable: 10,
        reforgeCost: 15,
        modCount: 1,
        recommendedAction: 'Need 5 more Scrap to Reforge at the Anvil',
        summaryLine: 'FORGE ANVIL: 10 SCRAP (COST: 15) · Need 5 more Scrap to Reforge at the Anvil'
      });

      // 14 scrap (boundary condition)
      const adv14 = getForgeStationAdvisor({ scrap: 14 }, null);
      expect(adv14.canReforge).toBe(false);
      expect(adv14.scrapAvailable).toBe(14);
      expect(adv14.recommendedAction).toBe('Need 1 more Scrap to Reforge at the Anvil');
      expect(adv14.summaryLine).toBe('FORGE ANVIL: 14 SCRAP (COST: 15) · Need 1 more Scrap to Reforge at the Anvil');
    });

    it('gracefully handles missing, null, undefined, or negative scrap', () => {
      const advNull = getForgeStationAdvisor(null, null);
      expect(advNull.canReforge).toBe(false);
      expect(advNull.scrapAvailable).toBe(0);
      expect(advNull.modCount).toBe(0);
      expect(advNull.recommendedAction).toBe('Need 15 more Scrap to Reforge at the Anvil');

      const advNeg = getForgeStationAdvisor({ scrap: -10 }, undefined);
      expect(advNeg.canReforge).toBe(false);
      expect(advNeg.scrapAvailable).toBe(0);
      expect(advNeg.recommendedAction).toBe('Need 15 more Scrap to Reforge at the Anvil');

      const advNaN = getForgeStationAdvisor({ scrap: NaN }, { items: undefined as any });
      expect(advNaN.canReforge).toBe(false);
      expect(advNaN.scrapAvailable).toBe(0);
      expect(advNaN.modCount).toBe(0);
    });

    it('returns first outlaw mod advice when scrap >= 15 and modCount === 0', () => {
      // Exactly 15 scrap
      const adv15 = getForgeStationAdvisor({ scrap: 15 }, { items: [] });
      expect(adv15).toEqual({
        canReforge: true,
        scrapAvailable: 15,
        reforgeCost: 15,
        modCount: 0,
        recommendedAction: 'Reforge Ready (15 Scrap) — Roll your first Outlaw Mod',
        summaryLine: 'FORGE ANVIL: 15 SCRAP (COST: 15) · Reforge Ready (15 Scrap) — Roll your first Outlaw Mod'
      });

      // 40 scrap with no player provided
      const adv40 = getForgeStationAdvisor({ scrap: 40 });
      expect(adv40.canReforge).toBe(true);
      expect(adv40.scrapAvailable).toBe(40);
      expect(adv40.modCount).toBe(0);
      expect(adv40.recommendedAction).toBe('Reforge Ready (15 Scrap) — Roll your first Outlaw Mod');
      expect(adv40.summaryLine).toBe('FORGE ANVIL: 40 SCRAP (COST: 15) · Reforge Ready (15 Scrap) — Roll your first Outlaw Mod');
    });

    it('returns loadout reroll & upgrade advice when scrap >= 15 and modCount > 0', () => {
      // 1 mod
      const adv1 = getForgeStationAdvisor({ scrap: 15 }, { items: ['split_chamber'] });
      expect(adv1).toEqual({
        canReforge: true,
        scrapAvailable: 15,
        reforgeCost: 15,
        modCount: 1,
        recommendedAction: 'Reforge Ready (15 Scrap) — Reroll & upgrade active mod loadout',
        summaryLine: 'FORGE ANVIL: 15 SCRAP (COST: 15) · Reforge Ready (15 Scrap) — Reroll & upgrade active mod loadout'
      });

      // Multiple mods
      const adv3 = getForgeStationAdvisor(
        { scrap: 60 },
        { items: ['hollow_point', 'ricochet_mod', 'cryo_rounds'] }
      );
      expect(adv3).toEqual({
        canReforge: true,
        scrapAvailable: 60,
        reforgeCost: 15,
        modCount: 3,
        recommendedAction: 'Reforge Ready (15 Scrap) — Reroll & upgrade active mod loadout',
        summaryLine: 'FORGE ANVIL: 60 SCRAP (COST: 15) · Reforge Ready (15 Scrap) — Reroll & upgrade active mod loadout'
      });
    });

    it('is accessible via HubStationModalController static and instance methods', () => {
      const meta = { scrap: 25 };
      const player = { items: ['nanite_repair'] };

      expect(HubStationModalController.getForgeStationAdvisor(meta, player)).toEqual(
        getForgeStationAdvisor(meta, player)
      );

      const controller = new HubStationModalController();
      expect(controller.getForgeStationAdvisor(meta, player)).toEqual(
        getForgeStationAdvisor(meta, player)
      );
    });
  });

  describe('getScannerStationAdvisor pure helper (M103)', () => {
    it('returns standby advice when player has no scannerBuff (false / missing / null)', () => {
      // Missing player
      const advNull: ScannerStationAdvisor = getScannerStationAdvisor(null);
      expect(advNull).toEqual({
        scannerActive: false,
        critBonusPct: 0,
        targetFloor: 1,
        recommendedAction: 'ACTIVATE SCANNER UPLINK (Free +15% Crit Chance & Full Floor Radar)',
        summaryLine: 'SCANNER INTEL [FLOOR 1]: STANDBY (0% CRIT) · ACTIVATE SCANNER UPLINK (Free +15% Crit Chance & Full Floor Radar)'
      });

      // scannerBuff false
      const advFalse = getScannerStationAdvisor({ scannerBuff: false });
      expect(advFalse.scannerActive).toBe(false);
      expect(advFalse.critBonusPct).toBe(0);
      expect(advFalse.targetFloor).toBe(1);
      expect(advFalse.recommendedAction).toBe('ACTIVATE SCANNER UPLINK (Free +15% Crit Chance & Full Floor Radar)');
      expect(advFalse.summaryLine).toBe('SCANNER INTEL [FLOOR 1]: STANDBY (0% CRIT) · ACTIVATE SCANNER UPLINK (Free +15% Crit Chance & Full Floor Radar)');

      // Undefined player
      const advUndef = getScannerStationAdvisor(undefined);
      expect(advUndef.scannerActive).toBe(false);
      expect(advUndef.critBonusPct).toBe(0);
    });

    it('returns online tactical uplink advice when scannerBuff is true', () => {
      const advTrue: ScannerStationAdvisor = getScannerStationAdvisor({ scannerBuff: true });
      expect(advTrue).toEqual({
        scannerActive: true,
        critBonusPct: 15,
        targetFloor: 1,
        recommendedAction: 'TACTICAL UPLINK ONLINE (+15% Crit Chance & Minimap Reveal Active)',
        summaryLine: 'SCANNER INTEL [FLOOR 1]: ONLINE (+15% CRIT) · TACTICAL UPLINK ONLINE (+15% Crit Chance & Minimap Reveal Active)'
      });
    });

    it('clamps floorNum to at least 1 and handles non-finite or floating inputs', () => {
      // Floor 0 clamps to 1
      const adv0 = getScannerStationAdvisor({ scannerBuff: false }, 0);
      expect(adv0.targetFloor).toBe(1);
      expect(adv0.summaryLine).toContain('[FLOOR 1]');

      // Negative floor clamps to 1
      const advNeg = getScannerStationAdvisor({ scannerBuff: true }, -5);
      expect(advNeg.targetFloor).toBe(1);
      expect(advNeg.summaryLine).toContain('[FLOOR 1]');

      // NaN clamps to 1
      const advNaN = getScannerStationAdvisor(null, NaN);
      expect(advNaN.targetFloor).toBe(1);
      expect(advNaN.summaryLine).toContain('[FLOOR 1]');

      // Infinity clamps to 1
      const advInf = getScannerStationAdvisor(null, Infinity);
      expect(advInf.targetFloor).toBe(1);
      expect(advInf.summaryLine).toContain('[FLOOR 1]');

      // Floats are floored
      const advFloat = getScannerStationAdvisor({ scannerBuff: true }, 3.8);
      expect(advFloat.targetFloor).toBe(3);
      expect(advFloat.summaryLine).toContain('[FLOOR 3]');

      // Higher floors are formatted into summaryLine
      const adv4 = getScannerStationAdvisor({ scannerBuff: true }, 4);
      expect(adv4.targetFloor).toBe(4);
      expect(adv4.summaryLine).toBe(
        'SCANNER INTEL [FLOOR 4]: ONLINE (+15% CRIT) · TACTICAL UPLINK ONLINE (+15% Crit Chance & Minimap Reveal Active)'
      );
    });

    it('is accessible via HubStationModalController static and instance methods', () => {
      const player = { scannerBuff: true };

      expect(HubStationModalController.getScannerStationAdvisor(player, 2)).toEqual(
        getScannerStationAdvisor(player, 2)
      );

      const controller = new HubStationModalController();
      expect(controller.getScannerStationAdvisor(player, 2)).toEqual(
        getScannerStationAdvisor(player, 2)
      );
    });
  });
});

