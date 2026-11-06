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
  playerHp?: number;
  playerMaxHp?: number;
  heatLevel?: number;
}

export type PortalModalContext = PortalModalInfo;
export type PortalContext = PortalModalInfo;

export interface PortalRiskAssessment {
  readinessLabel: string;
  recommendation: string;
  isLowHullWarning: boolean;
}

export function getPortalRiskAssessment(
  _floorNum: number = 1,
  playerHp?: number,
  playerMaxHp?: number
): PortalRiskAssessment {
  if (typeof playerHp === 'number' && typeof playerMaxHp === 'number' && playerMaxHp > 0) {
    const ratio = playerHp / playerMaxHp;
    if (ratio <= 0.35) {
      return {
        readinessLabel: '⚠️ CRITICAL HULL',
        recommendation: 'Visit Shop or scavenge Fuel before descending!',
        isLowHullWarning: true
      };
    }
    if (playerHp >= playerMaxHp) {
      return {
        readinessLabel: '★ FULL INTEGRITY',
        recommendation: 'Optimal combat readiness for descent.',
        isLowHullWarning: false
      };
    }
  }
  return {
    readinessLabel: '⚡ COMBAT READY',
    recommendation: 'Systems nominal for next sector.',
    isLowHullWarning: false
  };
}

export interface SectorBriefing {
  nextFloor: number;
  biomeName: string;
  bossName: string;
  threatMult: string;
}

/**
 * Pure helper calculating the upcoming sector, upcoming boss encounter, and threat multiplier.
 * Threat scale is computed as 1.55^(nextFloor - 1).
 */
export function getNextSectorBriefing(currentFloor: number): SectorBriefing {
  const nextFloor = currentFloor + 1;
  let biomeName = 'ENDLESS VALHALLA OVERDRIVE';
  let bossName = 'OMEGA VALHALLA';

  if (nextFloor <= 2) {
    biomeName = 'SMELTER FOUNDRY';
    bossName = 'SIEGE BEHEMOTH';
  } else if (nextFloor === 3) {
    biomeName = 'NEON CYBER-FREEWAY';
    bossName = 'OVERLORD HELION';
  } else if (nextFloor === 4) {
    biomeName = 'SUB-ZERO CRYO LAB';
    bossName = 'CRYO VALKYRIE';
  } else if (nextFloor === 5) {
    biomeName = 'MAGMA CORE';
    bossName = 'INFERNO COLOSSUS';
  } else if (nextFloor === 6) {
    biomeName = 'CHROME CITADEL';
    bossName = 'OMEGA VALHALLA';
  }

  const exponent = Math.max(0, nextFloor - 1);
  const mult = Math.pow(1.55, exponent);
  const threatMult = `${mult.toFixed(2)}x`;

  return {
    nextFloor,
    biomeName,
    bossName,
    threatMult
  };
}

export interface PortalHeatBriefing {
  heatLevel: number;
  label: string;
  enemyScaleText: string;
  scrapBonusText: string;
}

/**
 * Pure helper calculating the portal descent heat threat briefing and bonus scrap scaling.
 * Heat is clamped to 0..3.
 */
export function getPortalHeatBriefing(heatLevel: number = 0): PortalHeatBriefing {
  const clamped = Math.max(0, Math.min(3, Math.round(Number(heatLevel) || 0)));
  switch (clamped) {
    case 1:
      return {
        heatLevel: 1,
        label: 'HEAT 1 // OVERCLOCKED',
        enemyScaleText: '+24% Enemy HP · +12% Speed',
        scrapBonusText: '+25% Bonus Scrap'
      };
    case 2:
      return {
        heatLevel: 2,
        label: 'HEAT 2 // BLOOD PACT',
        enemyScaleText: '+48% Enemy HP · +24% Speed',
        scrapBonusText: '+50% Bonus Scrap'
      };
    case 3:
      return {
        heatLevel: 3,
        label: 'HEAT 3 // VALHALLA INFERNO',
        enemyScaleText: '+72% Enemy HP · +36% Speed',
        scrapBonusText: '+75% Bonus Scrap'
      };
    case 0:
    default:
      return {
        heatLevel: 0,
        label: 'HEAT 0 // STANDARD',
        enemyScaleText: 'Standard Enemy HP & Speed',
        scrapBonusText: '+0% Bonus Scrap'
      };
  }
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

  public static getNextSectorBriefing(currentFloor: number): SectorBriefing {
    return getNextSectorBriefing(currentFloor);
  }

  public getNextSectorBriefing(currentFloor: number): SectorBriefing {
    return getNextSectorBriefing(currentFloor);
  }

  public static getPortalRiskAssessment(
    floorNum: number = 1,
    playerHp?: number,
    playerMaxHp?: number
  ): PortalRiskAssessment {
    return getPortalRiskAssessment(floorNum, playerHp, playerMaxHp);
  }

  public getPortalRiskAssessment(
    floorNum: number = 1,
    playerHp?: number,
    playerMaxHp?: number
  ): PortalRiskAssessment {
    return getPortalRiskAssessment(floorNum, playerHp, playerMaxHp);
  }

  public static getPortalHeatBriefing(heatLevel: number = 0): PortalHeatBriefing {
    return getPortalHeatBriefing(heatLevel);
  }

  public getPortalHeatBriefing(heatLevel: number = 0): PortalHeatBriefing {
    return getPortalHeatBriefing(heatLevel);
  }

  public open(context: PortalContext, onConfirm: () => void, onCancel?: () => void): void {
    this.pendingConfirm = onConfirm;
    this.pendingCancel = onCancel || null;

    const briefing = getNextSectorBriefing(context.floorNum);
    const assessment = getPortalRiskAssessment(context.floorNum, context.playerHp, context.playerMaxHp);
    const heatBrief = getPortalHeatBriefing(context.heatLevel ?? 0);

    if (context.floorNum === 6) {
      if (this.floorLabelEl) {
        this.floorLabelEl.textContent = 'VALHALLA CONQUERED! ENTER OVERDRIVE FLR 7?';
      }
      if (this.warningEl) {
        this.warningEl.textContent = 'Victory Bonus (+50 Scrap) ready! Enter Endless Overdrive for 2x Scrap & Elite swarms.';
      }
    } else if (context.floorNum > 6) {
      if (this.floorLabelEl) {
        this.floorLabelEl.textContent = `ENDLESS OVERDRIVE // FLOOR ${context.floorNum + 1}?`;
      }
      if (this.warningEl) {
        this.warningEl.textContent = 'Overdrive scaling intensifies. Unbought items on this floor will be lost.';
      }
    } else {
      const nextFloor = context.floorNum + 1;
      const biomePreviews: Record<number, string> = {
        2: 'NEXT SECTOR: SMELTER FOUNDRY (Molten Lava Vents & Boost Strips).',
        3: 'NEXT SECTOR: NEON CYBER-FREEWAY (High-Speed Boost Strips & Oil Slicks).',
        4: 'NEXT SECTOR: SUB-ZERO CRYO LAB (Crystalline Ice Patches & Cryo Barrels).',
        5: 'NEXT SECTOR: MAGMA CORE (Volatile Magma Grates & Elite Convoys).',
        6: 'NEXT SECTOR: CHROME CITADEL (Final Valhalla Boss Encounter!).'
      };
      if (this.floorLabelEl) {
        this.floorLabelEl.textContent = `DESCEND TO FLOOR ${nextFloor}?`;
      }
      if (this.warningEl) {
        const preview = biomePreviews[nextFloor] ? `${biomePreviews[nextFloor]} ` : '';
        this.warningEl.textContent = `${preview}Unexplored rooms and unbought items on this floor will be lost.`;
      }
    }

    if (this.floorLabelEl) {
      this.floorLabelEl.setAttribute('title', `Sector: ${briefing.biomeName} | Boss: ${briefing.bossName} | Threat: ${briefing.threatMult}`);
      this.floorLabelEl.setAttribute('data-subtitle', `Sector: ${briefing.biomeName} // Threat: ${briefing.threatMult} // Boss: ${briefing.bossName}`);
      this.floorLabelEl.setAttribute('data-next-biome', briefing.biomeName);
      this.floorLabelEl.setAttribute('data-next-boss', briefing.bossName);
      this.floorLabelEl.setAttribute('data-threat-mult', briefing.threatMult);
    }

    if (this.overlay) {
      this.overlay.setAttribute('data-next-sector', briefing.biomeName);
      this.overlay.setAttribute('data-next-boss', briefing.bossName);
      this.overlay.setAttribute('data-threat-mult', briefing.threatMult);
      this.overlay.setAttribute('title', `Next: ${briefing.biomeName} (Boss: ${briefing.bossName}, Threat: ${briefing.threatMult})`);
      this.overlay.setAttribute('data-readiness', assessment.readinessLabel);
      this.overlay.setAttribute('data-low-hull-warning', String(assessment.isLowHullWarning));
      this.overlay.setAttribute('data-portal-heat', `${heatBrief.heatLevel}`);
      this.overlay.setAttribute('data-portal-heat-label', heatBrief.label);
    }

    if (this.warningEl) {
      this.warningEl.setAttribute('data-boss-warning', `BOSS DETECTED: ${briefing.bossName} [Threat: ${briefing.threatMult}]`);
      this.warningEl.setAttribute('title', `Boss: ${briefing.bossName} (${briefing.threatMult})`);
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
