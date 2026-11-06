/**
 * MOTO-ROGUE: Sanctuary Home Base Station Modal & Proximity Banner Controller
 *
 * Provides immersive, contextual anime interfaces for each hideout station:
 * - Garage & Armory Bay (Wrench)
 * - The Scrap Forge (Ironsmith Korr)
 * - Tactical Intel & Scanner Lab (Chief Tactician Doc)
 * - Outlaw War Room & Bounties (Valkyrie Vex)
 * - Sector 1 Highway Launch Gate (Dispatch Operator)
 *
 * Implements proximity interaction prompts ([E] to Interact) and rich modal
 * dialogs with capture-phase keyboard ownership (ESC, E/Enter, Tab trapping).
 */

import { RARITY, getEquipmentLoadoutSummary } from '../data/equipment';
import { META_UPGRADES, getMetaTuningSummary } from '../data/upgrades';
import { getCareerOutlawRank } from '@/core/state';
import { WEAPONS, WeaponId, getWeaponTacticalProfile } from '@/data/weapons';
import type { MetaSaveState, PlayerState } from '@/types/game';

export type HubStationId = 'garage' | 'blacksmith' | 'codex' | 'bounty' | 'launch' | 'armory' | 'forge' | 'scanner';

export interface ScannerStationAdvisor {
  scannerActive: boolean;
  critBonusPct: number;
  targetFloor: number;
  recommendedAction: string;
  summaryLine: string;
}

/**
 * Computes sanctuary tactical scanner uplink and crit bonus telemetry advisor intelligence.
 */
export function getScannerStationAdvisor(
  player?: Partial<PlayerState> | null,
  floorNum: number = 1
): ScannerStationAdvisor {
  const scannerActive = Boolean(player?.scannerBuff);
  const critBonusPct = scannerActive ? 15 : 0;
  const targetFloor = Math.max(1, Math.floor(Number.isFinite(floorNum) ? floorNum : 1));
  const recommendedAction = scannerActive
    ? 'TACTICAL UPLINK ONLINE (+15% Crit Chance & Minimap Reveal Active)'
    : 'ACTIVATE SCANNER UPLINK (Free +15% Crit Chance & Full Floor Radar)';
  const summaryLine = `SCANNER INTEL [FLOOR ${targetFloor}]: ${scannerActive ? 'ONLINE (+15% CRIT)' : 'STANDBY (0% CRIT)'} · ${recommendedAction}`;

  return {
    scannerActive,
    critBonusPct,
    targetFloor,
    recommendedAction,
    summaryLine
  };
}

export interface ForgeStationAdvisor {
  canReforge: boolean;
  scrapAvailable: number;
  reforgeCost: number;
  modCount: number;
  recommendedAction: string;
  summaryLine: string;
}

/**
 * Computes sanctuary forge salvage and reforge advisor intelligence.
 */
export function getForgeStationAdvisor(
  metaSave?: Partial<MetaSaveState> | null,
  player?: Partial<PlayerState> | null
): ForgeStationAdvisor {
  const rawScrap = Number(metaSave?.scrap || 0);
  const scrapAvailable = Math.max(0, isNaN(rawScrap) ? 0 : rawScrap);
  const reforgeCost = 15;
  const modCount = Array.isArray(player?.items) ? player!.items!.length : 0;
  const canReforge = scrapAvailable >= reforgeCost;

  let recommendedAction: string;
  if (!canReforge) {
    recommendedAction = 'Need ' + (reforgeCost - scrapAvailable) + ' more Scrap to Reforge at the Anvil';
  } else if (modCount === 0) {
    recommendedAction = 'Reforge Ready (15 Scrap) — Roll your first Outlaw Mod';
  } else {
    recommendedAction = 'Reforge Ready (15 Scrap) — Reroll & upgrade active mod loadout';
  }

  const summaryLine = `FORGE ANVIL: ${scrapAvailable} SCRAP (COST: ${reforgeCost}) · ${recommendedAction}`;

  return {
    canReforge,
    scrapAvailable,
    reforgeCost,
    modCount,
    recommendedAction,
    summaryLine
  };
}

export interface WarRoomStationAdvisor {
  bountyClaimed: boolean;
  currentHeat: number;
  scrapBonusPct: number;
  recommendedMaxHeat: number;
  summaryLine: string;
}

/**
 * Computes sanctuary outlaw war room heat risk/reward and pre-run cache readiness advisor intelligence.
 */
export function getWarRoomStationAdvisor(
  metaSave: any,
  bountyClaimed: boolean = false
): WarRoomStationAdvisor {
  const currentHeat =
    typeof metaSave?.heatLevel === 'number' && Number.isFinite(metaSave.heatLevel)
      ? Math.max(0, Math.min(3, Math.floor(metaSave.heatLevel)))
      : 0;

  const scrapBonusPct = currentHeat * 25;

  let equippedCount = 0;
  if (metaSave && metaSave.equipped && typeof metaSave.equipped === 'object') {
    equippedCount = Object.values(metaSave.equipped).filter(
      (item) => item !== null && item !== undefined && item !== false
    ).length;
  }
  equippedCount = Math.max(0, Math.min(6, equippedCount));

  let totalRanks = 0;
  if (metaSave && metaSave.ranks && typeof metaSave.ranks === 'object') {
    for (const val of Object.values(metaSave.ranks)) {
      if (typeof val === 'number' && Number.isFinite(val)) {
        totalRanks += Math.max(0, Math.floor(val));
      }
    }
  }
  totalRanks = Math.max(0, Math.min(25, totalRanks));

  const readinessScore = equippedCount * 2 + totalRanks;

  let recommendedMaxHeat = 0;
  if (readinessScore >= 18) {
    recommendedMaxHeat = 3;
  } else if (readinessScore >= 10) {
    recommendedMaxHeat = 2;
  } else if (readinessScore >= 4) {
    recommendedMaxHeat = 1;
  } else {
    recommendedMaxHeat = 0;
  }

  const isBountyClaimed = Boolean(bountyClaimed);
  const cachePrefix = isBountyClaimed
    ? 'CACHE: ✓ CLAIMED (+15 🪙 / +1 ❤️)'
    : 'CACHE: ⚡ FREE DROP READY (+15 🪙 / +1 ❤️)';

  const summaryLine =
    cachePrefix +
    ' // HEAT ' +
    currentHeat +
    ' (+' +
    scrapBonusPct +
    '% SCRAP) // REC HEAT: <= ' +
    recommendedMaxHeat;

  return {
    bountyClaimed: isBountyClaimed,
    currentHeat,
    scrapBonusPct,
    recommendedMaxHeat,
    summaryLine
  };
}

export interface LaunchGateAdvisor {
  readyCount: number;
  totalChecks: number;
  missingBuffs: string[];
  isFullyPrepped: boolean;
  summaryLine: string;
}

/**
 * Computes sanctuary launch gate pre-flight readiness and missing buff advisor intelligence.
 */
export function getLaunchGateAdvisor(
  metaSave?: any,
  player?: any,
  scannerClaimed: boolean = false,
  bountyClaimed: boolean = false
): LaunchGateAdvisor {
  const hasScanner = !!(scannerClaimed || player?.scannerBuff);
  const hasCache = !!bountyClaimed;
  const missingBuffs: string[] = [];
  if (!hasScanner) missingBuffs.push('SCANNER BUFF');
  if (!hasCache) missingBuffs.push('WAR ROOM CACHE');
  const totalChecks = 2;
  const readyCount = (hasScanner ? 1 : 0) + (hasCache ? 1 : 0);
  const isFullyPrepped = readyCount === totalChecks;
  const weaponName = String(player?.weapon || 'pistol').toUpperCase();
  const heat =
    typeof metaSave?.heatLevel === 'number' && Number.isFinite(metaSave.heatLevel)
      ? Math.max(0, Math.min(3, Math.floor(metaSave.heatLevel)))
      : 0;
  const statusPart = isFullyPrepped
    ? 'PRE-FLIGHT: ✓ 2/2 BUFFS LOCKED'
    : 'PRE-FLIGHT: ⚠️ MISSING ' + missingBuffs.join(' & ');
  const summaryLine = statusPart + ' // WEAPON: ' + weaponName + ' // HEAT ' + heat;

  return {
    readyCount,
    totalChecks,
    missingBuffs,
    isFullyPrepped,
    summaryLine
  };
}

export interface GarageStationAdvisor {
  equippedCount: number;
  powerScore: number;
  tuningRanks: number;
  tuningMaxRanks: number;
  tuningCompletionPct: number;
  canAffordNextTuning: boolean;
  summaryLine: string;
}

/**
 * Computes sanctuary garage workbench chassis loadout and meta tuning advisor intelligence.
 */
export function getGarageStationAdvisor(metaSave?: any): GarageStationAdvisor {
  const loadoutEquipped = (metaSave && typeof metaSave === 'object' && metaSave.equipped)
    ? metaSave.equipped
    : metaSave;
  const rawLoadout = getEquipmentLoadoutSummary(loadoutEquipped);
  const equippedCount = typeof (rawLoadout as any)?.equippedCount === 'number'
    ? (rawLoadout as any).equippedCount
    : (rawLoadout?.installedCount ?? (metaSave && typeof (metaSave as any).equippedCount === 'number' ? (metaSave as any).equippedCount : 0));
  const powerScore = typeof (rawLoadout as any)?.powerScore === 'number'
    ? (rawLoadout as any).powerScore
    : (rawLoadout?.totalPowerScore ?? (metaSave && typeof (metaSave as any).powerScore === 'number' ? (metaSave as any).powerScore : 0));
  const loadout = {
    ...rawLoadout,
    equippedCount,
    powerScore
  };

  const baseTuning = getMetaTuningSummary(metaSave);
  const isFullyMaxed = (baseTuning as any)?.isFullyMaxed ?? (baseTuning.totalRanks >= baseTuning.maxPossibleRanks || baseTuning.cheapestNextCost === null);
  const rawScrap = metaSave?.scrap;
  const scrap = typeof rawScrap === 'number' && !Number.isNaN(rawScrap) ? Math.max(0, rawScrap) : 0;
  const canAffordCheapest = (baseTuning as any)?.canAffordCheapest ?? (!isFullyMaxed && baseTuning.cheapestNextCost !== null && scrap >= baseTuning.cheapestNextCost);
  const cheapestNextUpgradeName = (baseTuning as any)?.cheapestNextUpgradeName ?? (baseTuning.cheapestNextUpgradeId ? (META_UPGRADES[baseTuning.cheapestNextUpgradeId]?.name || String(baseTuning.cheapestNextUpgradeId)) : '');

  const tuning = {
    ...baseTuning,
    isFullyMaxed,
    canAffordCheapest,
    cheapestNextUpgradeName
  };

  const nextAction = tuning.isFullyMaxed
    ? 'TUNING MAXED'
    : tuning.canAffordCheapest
      ? 'READY TO UPGRADE ' + (tuning.cheapestNextUpgradeName || '').toUpperCase() + ' (' + tuning.cheapestNextCost + ' ⚙️)'
      : 'NEED ' + tuning.cheapestNextCost + ' ⚙️ FOR NEXT TUNE';

  const summaryLine =
    'CHASSIS: ' +
    loadout.equippedCount +
    '/6 EQUIPPED (PWR ' +
    loadout.powerScore +
    ') // TUNING: ' +
    tuning.totalRanks +
    '/' +
    tuning.maxPossibleRanks +
    ' RANKS (' +
    tuning.completionPct +
    '%) // ' +
    nextAction;

  return {
    equippedCount: loadout.equippedCount,
    powerScore: loadout.powerScore,
    tuningRanks: tuning.totalRanks,
    tuningMaxRanks: tuning.maxPossibleRanks,
    tuningCompletionPct: tuning.completionPct,
    canAffordNextTuning: tuning.canAffordCheapest,
    summaryLine
  };
}

export interface HubStationPromptInfo {
  title: string;
  summary: string;
  actionLabel: string;
  accentColor: string;
}

export interface HubStationBuffState {
  scannerClaimed?: boolean;
  bountyClaimed?: boolean;
}

export interface HubStationOpenOptions {
  npcId: string;
  metaSave: any;
  player: any;
  scannerClaimed: boolean;
  bountyClaimed: boolean;
  onReforge: () => { ok: boolean; message: string };
  onClaimScanner: () => { ok: boolean; message: string };
  onClaimBountyCache: () => { ok: boolean; message: string };
  onSelectHeat: (heat: number) => void;
  onLaunchRun: () => void;
  onClose?: () => void;
}

/**
 * Returns contextual title, summary, action label, and neon accent color
 * for the home base hideout station based on current state and claimed buffs.
 */
export function getHubStationPromptInfo(
  npcId: string,
  _metaSave?: any,
  _player?: any,
  buffs?: HubStationBuffState
): HubStationPromptInfo {
  switch (npcId) {
    case 'garage':
      return {
        title: '🔧 GARAGE & ARMORY BAY',
        summary: 'Equip & salvage Stash parts, upgrade permanent Bike stats, and unlock new Weapons',
        actionLabel: 'OPEN GARAGE [E]',
        accentColor: '#ffd60a'
      };

    case 'blacksmith':
    case 'forge':
      return {
        title: '⚒️ THE SCRAP FORGE',
        summary: "Spend 12 Scrap ⚙️ to upgrade an equipped item's Rarity (+25% stats) or craft new Gear",
        actionLabel: 'OPEN FORGE [E]',
        accentColor: '#2ee6ff'
      };

    case 'scanner':
    case 'codex':
      return {
        title: '📡 TACTICAL INTEL & SCANNER LAB',
        summary: buffs?.scannerClaimed
          ? 'Inspect Career Telemetry (✓ Tactical Scanner +DMG/+SPD Buff Active!)'
          : 'Claim FREE +8–20% Weapon DMG & +15% Bullet Speed Buff + View Career Dossier',
        actionLabel: 'OPEN INTEL LAB [E]',
        accentColor: '#9d4edd'
      };

    case 'bounty':
      return {
        title: '🎖️ OUTLAW WAR ROOM & BOUNTIES',
        summary: buffs?.bountyClaimed
          ? 'Configure Threat Heat Level (0–3) for up to +75% Bonus Scrap (✓ Free Cache Claimed!)'
          : 'Claim FREE +15 Coins 🪙 & +1 Max Hull ❤️ Cache + Set Threat Heat Level (0–3)',
        actionLabel: 'OPEN WAR ROOM [E]',
        accentColor: '#06d6a0'
      };

    case 'launch':
      return {
        title: '🚀 SECTOR 1 HIGHWAY LAUNCH GATE',
        summary: 'Review Pre-Run Readiness Checklist & Deploy into Sector 1 (Rust Belt Outskirts)',
        actionLabel: 'OPEN LAUNCH GATE [E]',
        accentColor: '#e5203a'
      };

    case 'armory':
      return {
        title: '🔫 TACTICAL ARMORY & BALLISTICS',
        summary: 'Inspect tactical combat roles, optimal ranges, and base DPS for all weapons',
        actionLabel: 'OPEN ARMORY [E]',
        accentColor: '#ff0055'
      };

    default:
      return {
        title: 'STATION // INTERACT',
        summary: 'Press [E] to interact with this hideout station',
        actionLabel: 'INTERACT [E]',
        accentColor: '#ffd60a'
      };
  }
}

/**
 * Controller for Sanctuary Home Base interaction banner and station modal overlay.
 */
export class HubStationModalController {
  private overlayEl: HTMLElement | null = null;
  private cardEl: HTMLElement | null = null;
  private kickerEl: HTMLElement | null = null;
  private titleEl: HTMLElement | null = null;
  private speakerEl: HTMLElement | null = null;
  private quoteEl: HTMLElement | null = null;
  private purposeEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private feedbackEl: HTMLElement | null = null;
  private primaryBtn: HTMLButtonElement | null = null;
  private closeBtn: HTMLButtonElement | null = null;

  private interactBannerEl: HTMLButtonElement | null = null;
  private interactTitleEl: HTMLElement | null = null;
  private interactDescEl: HTMLElement | null = null;

  private visible: boolean = false;
  private keyListenerAttached: boolean = false;
  private currentOptions: HubStationOpenOptions | null = null;
  private bannerClickCallback: (() => void) | null = null;
  private restoreFocusEl: HTMLElement | null = null;

  public static getForgeStationAdvisor = getForgeStationAdvisor;
  public getForgeStationAdvisor = getForgeStationAdvisor;
  public static getScannerStationAdvisor = getScannerStationAdvisor;
  public getScannerStationAdvisor = getScannerStationAdvisor;
  public static getWarRoomStationAdvisor = getWarRoomStationAdvisor;
  public getWarRoomStationAdvisor = getWarRoomStationAdvisor;
  public static getLaunchGateAdvisor = getLaunchGateAdvisor;
  public getLaunchGateAdvisor = getLaunchGateAdvisor;
  public static getGarageStationAdvisor = getGarageStationAdvisor;
  public getGarageStationAdvisor = getGarageStationAdvisor;

  constructor() {
    if (typeof document !== 'undefined') {
      this.overlayEl = document.getElementById('hub-station-overlay');
      this.cardEl = this.overlayEl?.querySelector('.hub-station-card') || null;
      this.kickerEl = document.getElementById('hub-station-kicker');
      this.titleEl = document.getElementById('hub-station-title');
      this.speakerEl = document.getElementById('hub-station-speaker');
      this.quoteEl = document.getElementById('hub-station-quote');
      this.purposeEl = document.getElementById('hub-station-purpose');
      this.bodyEl = document.getElementById('hub-station-body');
      this.feedbackEl = document.getElementById('hub-station-feedback');
      this.primaryBtn = document.getElementById('btn-hub-station-primary') as HTMLButtonElement | null;
      this.closeBtn = document.getElementById('btn-hub-station-close') as HTMLButtonElement | null;

      this.interactBannerEl = document.getElementById('hub-interact-banner') as HTMLButtonElement | null;
      this.interactTitleEl = document.getElementById('hub-interact-title');
      this.interactDescEl = document.getElementById('hub-interact-desc');

      if (this.closeBtn) {
        this.closeBtn.addEventListener('click', () => this.close());
      }
    }
  }

  /**
   * Returns whether the Sanctuary Station modal dialog is currently visible.
   */
  public isOpen(): boolean {
    return this.visible;
  }

  /**
   * Returns the station card element inside the overlay.
   */
  public getCard(): HTMLElement | null {
    return this.cardEl;
  }

  /**
   * Returns the station modal overlay element.
   */
  public get overlay(): HTMLElement | null {
    return this.overlayEl;
  }

  /**
   * Displays the bottom-center proximity interaction banner for the given station.
   */
  public showBanner(
    npcId: string,
    metaSave: any,
    player: any,
    buffs: { scannerClaimed: boolean; bountyClaimed: boolean },
    onInteract: () => void
  ): void {
    if (this.visible) {
      this.hideBanner();
      return;
    }

    const info = getHubStationPromptInfo(npcId, metaSave, player, buffs);

    if (this.interactTitleEl) {
      this.interactTitleEl.textContent = info.title;
    }
    if (this.interactDescEl) {
      this.interactDescEl.textContent = info.summary;
    }

    if (this.interactBannerEl) {
      this.interactBannerEl.style.setProperty('--banner-accent', info.accentColor);
      this.interactBannerEl.setAttribute('data-station', npcId);
      this.interactBannerEl.removeAttribute('hidden');

      if (this.bannerClickCallback) {
        this.interactBannerEl.removeEventListener('click', this.bannerClickCallback);
      }
      this.bannerClickCallback = () => onInteract();
      this.interactBannerEl.addEventListener('click', this.bannerClickCallback);
    }
  }

  /**
   * Hides the proximity interaction banner.
   */
  public hideBanner(): void {
    if (this.interactBannerEl) {
      this.interactBannerEl.setAttribute('hidden', '');
      if (this.bannerClickCallback) {
        this.interactBannerEl.removeEventListener('click', this.bannerClickCallback);
        this.bannerClickCallback = null;
      }
    }
  }

  /**
   * Opens the Sanctuary Station modal for the active station NPC.
   */
  public open(options: HubStationOpenOptions): void;
  public open(
    npcId: string,
    metaSave?: any,
    player?: any,
    scannerClaimed?: boolean,
    bountyClaimed?: boolean,
    extraOptions?: Partial<HubStationOpenOptions>
  ): void;
  public open(
    optionsOrNpcId: HubStationOpenOptions | string,
    metaSave?: any,
    player?: any,
    scannerClaimed: boolean = false,
    bountyClaimed: boolean = false,
    extraOptions?: Partial<HubStationOpenOptions>
  ): void {
    let options: HubStationOpenOptions;
    if (typeof optionsOrNpcId === 'string') {
      options = {
        npcId: optionsOrNpcId,
        metaSave: metaSave ?? {},
        player: player ?? {},
        scannerClaimed,
        bountyClaimed,
        onReforge: extraOptions?.onReforge ?? (() => ({ ok: false, message: '' })),
        onClaimScanner: extraOptions?.onClaimScanner ?? (() => ({ ok: false, message: '' })),
        onClaimBountyCache: extraOptions?.onClaimBountyCache ?? (() => ({ ok: false, message: '' })),
        onSelectHeat: extraOptions?.onSelectHeat ?? (() => {}),
        onLaunchRun: extraOptions?.onLaunchRun ?? (() => {}),
        onClose: extraOptions?.onClose,
        ...extraOptions
      };
    } else {
      options = optionsOrNpcId;
    }

    this.currentOptions = options;
    this.hideBanner();

    if (!this.visible && typeof document !== 'undefined') {
      const active = document.activeElement;
      this.restoreFocusEl = active instanceof HTMLElement && active !== document.body ? active : null;
    }

    this.visible = true;
    const careerRank = getCareerOutlawRank(options.metaSave);
    if (this.overlay) {
      this.overlay.classList.add('visible');
      this.overlay.setAttribute('aria-hidden', 'false');
      this.overlay.setAttribute('data-career-rank', careerRank.rankId);
      this.overlay.setAttribute('data-career-title', careerRank.title);
      this.overlay.setAttribute('data-career-score', String(careerRank.careerScore));

      if (options.npcId === 'forge' || options.npcId === 'blacksmith') {
        const advisor = getForgeStationAdvisor(options.metaSave, options.player);
        this.overlay.setAttribute('data-forge-can-reforge', advisor.canReforge ? 'true' : 'false');
        this.overlay.setAttribute('data-forge-advisor', advisor.summaryLine);
      }

      if (options.npcId === 'scanner' || options.npcId === 'codex') {
        const scanAdv = getScannerStationAdvisor(options.player, 1);
        this.overlay.setAttribute('data-scanner-active', scanAdv.scannerActive ? 'true' : 'false');
        this.overlay.setAttribute('data-scanner-advisor', scanAdv.summaryLine);
      }

      if (options.npcId === 'bounty') {
        const warAdv = getWarRoomStationAdvisor(options.metaSave, !!options.bountyClaimed);
        this.overlay.setAttribute('data-war-room-heat', String(warAdv.currentHeat));
        this.overlay.setAttribute('data-war-room-rec-heat', String(warAdv.recommendedMaxHeat));
        this.overlay.setAttribute('data-war-room-advisor', warAdv.summaryLine);
      }

      if (options.npcId === 'launch') {
        const launchAdv = getLaunchGateAdvisor(
          options.metaSave,
          options.player,
          !!options.scannerClaimed,
          !!options.bountyClaimed
        );
        this.overlay.setAttribute('data-launch-ready-count', String(launchAdv.readyCount));
        this.overlay.setAttribute('data-launch-fully-prepped', launchAdv.isFullyPrepped ? 'true' : 'false');
        this.overlay.setAttribute('data-launch-advisor', launchAdv.summaryLine);
      }

      if (options.npcId === 'garage') {
        const advisor = getGarageStationAdvisor(options.metaSave);
        this.overlay.setAttribute('data-garage-equipped-count', String(advisor.equippedCount));
        this.overlay.setAttribute('data-garage-tuning-pct', String(advisor.tuningCompletionPct));
        this.overlay.setAttribute('data-garage-advisor', advisor.summaryLine);
      }
    }

    this.renderHeaderAndPurpose(options.npcId);
    this.clearFeedback();
    this.renderBody();

    this.attachKeys();
    this.primaryBtn?.focus();
  }

  /**
   * Re-renders the current station modal view and synchronizes telemetry attributes.
   */
  public render(): void {
    if (!this.currentOptions) return;
    const careerRank = getCareerOutlawRank(this.currentOptions.metaSave);
    if (this.overlay) {
      this.overlay.setAttribute('data-career-rank', careerRank.rankId);
      this.overlay.setAttribute('data-career-title', careerRank.title);
      this.overlay.setAttribute('data-career-score', String(careerRank.careerScore));

      if (this.currentOptions.npcId === 'forge' || this.currentOptions.npcId === 'blacksmith') {
        const advisor = getForgeStationAdvisor(this.currentOptions.metaSave, this.currentOptions.player);
        this.overlay.setAttribute('data-forge-can-reforge', advisor.canReforge ? 'true' : 'false');
        this.overlay.setAttribute('data-forge-advisor', advisor.summaryLine);
      }

      if (this.currentOptions.npcId === 'scanner' || this.currentOptions.npcId === 'codex') {
        const scanAdv = getScannerStationAdvisor(this.currentOptions.player, 1);
        this.overlay.setAttribute('data-scanner-active', scanAdv.scannerActive ? 'true' : 'false');
        this.overlay.setAttribute('data-scanner-advisor', scanAdv.summaryLine);
      }

      if (this.currentOptions.npcId === 'bounty') {
        const warAdv = getWarRoomStationAdvisor(this.currentOptions.metaSave, !!this.currentOptions.bountyClaimed);
        this.overlay.setAttribute('data-war-room-heat', String(warAdv.currentHeat));
        this.overlay.setAttribute('data-war-room-rec-heat', String(warAdv.recommendedMaxHeat));
        this.overlay.setAttribute('data-war-room-advisor', warAdv.summaryLine);
      }

      if (this.currentOptions.npcId === 'launch') {
        const launchAdv = getLaunchGateAdvisor(
          this.currentOptions.metaSave,
          this.currentOptions.player,
          !!this.currentOptions.scannerClaimed,
          !!this.currentOptions.bountyClaimed
        );
        this.overlay.setAttribute('data-launch-ready-count', String(launchAdv.readyCount));
        this.overlay.setAttribute('data-launch-fully-prepped', launchAdv.isFullyPrepped ? 'true' : 'false');
        this.overlay.setAttribute('data-launch-advisor', launchAdv.summaryLine);
      }

      if (this.currentOptions.npcId === 'garage') {
        const advisor = getGarageStationAdvisor(this.currentOptions.metaSave);
        this.overlay.setAttribute('data-garage-equipped-count', String(advisor.equippedCount));
        this.overlay.setAttribute('data-garage-tuning-pct', String(advisor.tuningCompletionPct));
        this.overlay.setAttribute('data-garage-advisor', advisor.summaryLine);
      }
    }
    this.renderHeaderAndPurpose(this.currentOptions.npcId);
    this.renderBody();
  }

  /**
   * Renders the forge station view.
   */
  public renderForge(options?: HubStationOpenOptions): void {
    const opts = options || this.currentOptions;
    if (opts) {
      this.renderForgeBody(opts.metaSave, opts.player);
    }
  }

  /**
   * Renders the codex station view.
   */
  public renderCodex(options?: HubStationOpenOptions): void {
    const opts = options || this.currentOptions;
    if (opts) {
      if (options?.player && this.currentOptions) {
        this.currentOptions.player = options.player;
      }
      this.renderCodexBody(opts.metaSave, opts.scannerClaimed);
    }
  }

  /**
   * Renders the tactical scanner station view.
   */
  public renderScanner(options?: HubStationOpenOptions): void {
    this.renderCodex(options);
  }

  public renderScannerBody(metaSave: any, scannerClaimed: boolean): void {
    this.renderCodexBody(metaSave, scannerClaimed);
  }

  /**
   * Renders the armory station view.
   */
  public renderArmory(options?: HubStationOpenOptions): void {
    const opts = options || this.currentOptions;
    if (opts) {
      this.renderArmoryBody(opts.metaSave, opts.player);
    }
  }

  /**
   * Renders the outlaw war room & bounty station view.
   */
  public renderBounty(options?: HubStationOpenOptions): void {
    const opts = options || this.currentOptions;
    if (opts) {
      if (options?.metaSave && this.currentOptions) {
        this.currentOptions.metaSave = options.metaSave;
      }
      if (options?.bountyClaimed !== undefined && this.currentOptions) {
        this.currentOptions.bountyClaimed = options.bountyClaimed;
      }
      this.renderBountyBody(opts.metaSave, opts.bountyClaimed);
    }
  }

  /**
   * Renders the sector 1 launch gate station view.
   */
  public renderLaunch(options?: HubStationOpenOptions): void {
    const opts = options || this.currentOptions;
    if (opts) {
      if (options?.metaSave && this.currentOptions) {
        this.currentOptions.metaSave = options.metaSave;
      }
      if (options?.player && this.currentOptions) {
        this.currentOptions.player = options.player;
      }
      if (options?.scannerClaimed !== undefined && this.currentOptions) {
        this.currentOptions.scannerClaimed = options.scannerClaimed;
      }
      if (options?.bountyClaimed !== undefined && this.currentOptions) {
        this.currentOptions.bountyClaimed = options.bountyClaimed;
      }
      this.renderLaunchBody(opts.metaSave, opts.player, opts.scannerClaimed, opts.bountyClaimed);
    }
  }

  /**
   * Renders the garage station view.
   */
  public renderGarage(options?: HubStationOpenOptions): void {
    const opts = options || this.currentOptions;
    if (opts) {
      if (options?.metaSave && this.currentOptions) {
        this.currentOptions.metaSave = options.metaSave;
      }
      this.renderGarageBody(opts.metaSave);
    }
  }

  /**
   * Closes the modal and restores focus.
   */
  public close(): void {
    if (!this.visible) return;
    this.visible = false;

    this.detachKeys();

    if (this.overlayEl) {
      this.overlayEl.classList.remove('visible');
      this.overlayEl.setAttribute('aria-hidden', 'true');
    }

    const cb = this.currentOptions?.onClose;
    this.currentOptions = null;
    cb?.();

    if (this.restoreFocusEl && this.restoreFocusEl.isConnected) {
      this.restoreFocusEl.focus();
    } else if (typeof document !== 'undefined') {
      const active = document.activeElement;
      if (active instanceof HTMLElement && this.overlayEl?.contains(active)) {
        active.blur();
      }
    }
    this.restoreFocusEl = null;
  }

  private renderHeaderAndPurpose(npcId: string): void {
    switch (npcId) {
      case 'blacksmith':
      case 'forge':
        if (this.kickerEl) this.kickerEl.textContent = 'SANCTUARY HIDEOUT // REFORGE STATION';
        if (this.titleEl) this.titleEl.textContent = '⚒️ THE SCRAP FORGE';
        if (this.speakerEl) this.speakerEl.textContent = 'IRONSMITH KORR';
        if (this.quoteEl) this.quoteEl.textContent = '"12 Scrap for a fresh black-market part! Step onto the forge."';
        if (this.purposeEl) {
          this.purposeEl.textContent =
            'Spend Scrap salvaged from runs to permanently upgrade your equipped gear\'s rarity (+25% to all stats) or forge a brand-new piece of equipment.';
        }
        break;

      case 'scanner':
      case 'codex':
        if (this.kickerEl) this.kickerEl.textContent = 'SANCTUARY HIDEOUT // INTEL ARCHIVE';
        if (this.titleEl) this.titleEl.textContent = '📡 TACTICAL INTEL & SCANNER LAB';
        if (this.speakerEl) this.speakerEl.textContent = 'CHIEF TACTICIAN DOC';
        if (this.quoteEl) {
          this.quoteEl.textContent =
            '"Knowledge is the sharpest blade out on the asphalt. Calibrate your sensors before rolling out."';
        }
        if (this.purposeEl) {
          this.purposeEl.textContent =
            'Review your lifetime outlaw dossier and calibrate tactical scanner sensors for +15% bullet speed and up to +20% weapon damage.';
        }
        break;

      case 'bounty':
        if (this.kickerEl) this.kickerEl.textContent = 'SANCTUARY HIDEOUT // WAR ROOM';
        if (this.titleEl) this.titleEl.textContent = '🎖️ OUTLAW WAR ROOM & BOUNTIES';
        if (this.speakerEl) this.speakerEl.textContent = 'VALKYRIE VEX';
        if (this.quoteEl) {
          this.quoteEl.textContent =
            '"High risk, high yield. Dial up the heat if you crave extra scrap, or grab your survival cache."';
        }
        if (this.purposeEl) {
          this.purposeEl.textContent =
            'Claim free pre-run supplies (+15 Coins & +1 Max Hull) and adjust threat Heat Level (0–3) for up to +75% bonus Scrap.';
        }
        break;

      case 'launch':
        if (this.kickerEl) this.kickerEl.textContent = 'SANCTUARY HIDEOUT // DEPLOYMENT GATE';
        if (this.titleEl) this.titleEl.textContent = '🚀 SECTOR 1 HIGHWAY LAUNCH GATE';
        if (this.speakerEl) this.speakerEl.textContent = 'DISPATCH OPERATOR';
        if (this.quoteEl) {
          this.quoteEl.textContent =
            '"Engines hot, perimeter clear. Check your gear before you drop into the wasteland."';
        }
        if (this.purposeEl) {
          this.purposeEl.textContent =
            'Final pre-flight readiness inspection. Ensure free lab scanner buffs and war room caches are secured before dropping onto Floor 1.';
        }
        break;

      case 'armory':
        if (this.kickerEl) this.kickerEl.textContent = 'SANCTUARY HIDEOUT // BALLISTICS & ARMORY';
        if (this.titleEl) this.titleEl.textContent = '🔫 TACTICAL ARMORY & BALLISTICS';
        if (this.speakerEl) this.speakerEl.textContent = 'QUARTERMASTER VEX';
        if (this.quoteEl) {
          this.quoteEl.textContent =
            '"Check your tactical profile and engagement range before hitting the highway."';
        }
        if (this.purposeEl) {
          this.purposeEl.textContent =
            'Review tactical combat roles, optimal engagement ranges, and base DPS for all sanctuary weapons.';
        }
        break;

      case 'garage':
      default:
        if (this.kickerEl) this.kickerEl.textContent = 'SANCTUARY HIDEOUT // WORKSHOP';
        if (this.titleEl) this.titleEl.textContent = '🔧 GARAGE & ARMORY BAY';
        if (this.speakerEl) this.speakerEl.textContent = 'CHIEF MECHANIC VEX';
        if (this.quoteEl) {
          this.quoteEl.textContent =
            '"Got fresh parts in from the rustlands. Let\'s tune your chassis."';
        }
        if (this.purposeEl) {
          this.purposeEl.textContent =
            'Equip and salvage Stash gear, upgrade permanent bike stats, and unlock secondary ordnance.';
        }
        break;
    }
  }

  private renderBody(): void {
    if (!this.bodyEl || !this.currentOptions) return;
    const { npcId, metaSave, player, scannerClaimed, bountyClaimed } = this.currentOptions;

    if (npcId === 'bounty') {
      const advisor = getWarRoomStationAdvisor(metaSave, bountyClaimed);
      if (this.overlayEl) {
        this.overlayEl.setAttribute('data-war-room-heat', String(advisor.currentHeat));
        this.overlayEl.setAttribute('data-war-room-rec-heat', String(advisor.recommendedMaxHeat));
        this.overlayEl.setAttribute('data-war-room-advisor', advisor.summaryLine);
      }
    }

    if (npcId === 'launch') {
      const advisor = getLaunchGateAdvisor(metaSave, player, scannerClaimed, bountyClaimed);
      if (this.overlayEl) {
        this.overlayEl.setAttribute('data-launch-ready-count', String(advisor.readyCount));
        this.overlayEl.setAttribute('data-launch-fully-prepped', advisor.isFullyPrepped ? 'true' : 'false');
        this.overlayEl.setAttribute('data-launch-advisor', advisor.summaryLine);
      }
    }

    switch (npcId) {
      case 'blacksmith':
      case 'forge':
        this.renderForgeBody(metaSave, player);
        break;
      case 'scanner':
      case 'codex':
        this.renderCodexBody(metaSave, scannerClaimed);
        break;
      case 'bounty':
        this.renderBountyBody(metaSave, bountyClaimed);
        break;
      case 'launch':
        this.renderLaunchBody(metaSave, player, scannerClaimed, bountyClaimed);
        break;
      case 'armory':
        this.renderArmoryBody(metaSave, player);
        break;
      case 'garage':
      default:
        if (this.overlayEl && npcId === 'garage') {
          const advisor = getGarageStationAdvisor(metaSave);
          this.overlayEl.setAttribute('data-garage-equipped-count', String(advisor.equippedCount));
          this.overlayEl.setAttribute('data-garage-tuning-pct', String(advisor.tuningCompletionPct));
          this.overlayEl.setAttribute('data-garage-advisor', advisor.summaryLine);
        }
        this.renderGarageBody(metaSave);
        break;
    }
  }

  public renderBlacksmith(options?: HubStationOpenOptions): void {
    this.renderForge(options);
  }

  public renderBlacksmithBody(metaSave: any, player?: any): void {
    this.renderForgeBody(metaSave, player);
  }

  public renderForgeBody(metaSave: any, player?: any): void {
    const effectivePlayer = player !== undefined ? player : this.currentOptions?.player;
    const advisor = getForgeStationAdvisor(metaSave, effectivePlayer);
    if (this.overlay) {
      this.overlay.setAttribute('data-forge-can-reforge', advisor.canReforge ? 'true' : 'false');
      this.overlay.setAttribute('data-forge-advisor', advisor.summaryLine);
    }

    if (!this.bodyEl || !this.currentOptions) return;
    const scrap = metaSave?.scrap || 0;
    const equipped = metaSave?.equipped || {};
    const upgradeable = Object.values(equipped).find(
      (it: any) => it && typeof it.rarity === 'number' && it.rarity < 3
    ) as any;

    let targetCardHtml = '';
    if (upgradeable) {
      const curRarity = RARITY[upgradeable.rarity] || RARITY[0];
      const nextRarity = RARITY[upgradeable.rarity + 1] || RARITY[3];
      targetCardHtml = `
        <div class="hub-forge-target-card">
          <div class="hub-forge-target-head">
            <span class="hub-forge-slot">${(upgradeable.slot || 'EQUIPMENT').toUpperCase()}</span>
            <strong class="hub-forge-name">${upgradeable.name || 'Outlaw Component'}</strong>
          </div>
          <div class="hub-forge-tiers">
            <span class="hub-tier-badge" style="--tier-col: ${curRarity.color}">
              CURRENT: ${curRarity.name.toUpperCase()}
            </span>
            <span class="hub-tier-arrow">➔</span>
            <span class="hub-tier-badge next" style="--tier-col: ${nextRarity.color}">
              UPGRADED: ${nextRarity.name.toUpperCase()} (+25% Stats)
            </span>
          </div>
          <p class="hub-forge-desc">
            Forging will immediately raise this equipped part's tier to <strong>${nextRarity.name}</strong>, granting a permanent +25% stat bonus.
          </p>
        </div>
      `;
    } else {
      targetCardHtml = `
        <div class="hub-forge-target-card hub-forge-legendary">
          <strong class="hub-legendary-title">★ ALL SLOTS LEGENDARY / OPTIMAL</strong>
          <p class="hub-forge-desc">
            All equipped slots are Legendary (or empty) — Forging will craft a brand-new high-grade part for your Stash!
          </p>
        </div>
      `;
    }

    this.bodyEl.innerHTML = `
      <div class="hub-scrap-bar">
        <div class="hub-scrap-stat">
          <span class="hub-stat-label">BANKED SCRAP</span>
          <span class="hub-stat-val hub-gold">⚙️ ${scrap} SCRAP</span>
        </div>
        <div class="hub-scrap-stat">
          <span class="hub-stat-label">REFORGE COST</span>
          <span class="hub-stat-val hub-cyan">12 ⚙️ SCRAP</span>
        </div>
      </div>
      <div class="hub-forge-advisor-banner" data-can-reforge="${advisor.canReforge ? 'true' : 'false'}">
        <span class="hub-forge-advisor-text">${advisor.summaryLine}</span>
      </div>
      ${targetCardHtml}
    `;

    if (this.primaryBtn) {
      this.primaryBtn.hidden = false;
      this.primaryBtn.innerHTML = '<kbd>E</kbd> ⚡ REFORGE GEAR (12 ⚙️)';
      this.primaryBtn.onclick = () => {
        if (!this.currentOptions) return;
        const res = this.currentOptions.onReforge();
        this.showFeedback(res.message, res.ok);
        this.renderBody();
      };
    }
  }

  private renderCodexBody(metaSave: any, scannerClaimed: boolean): void {
    if (!this.bodyEl || !this.currentOptions) return;
    const effectivePlayer = this.currentOptions?.player;
    const scanAdv = getScannerStationAdvisor(effectivePlayer, 1);
    if (this.overlay) {
      this.overlay.setAttribute('data-scanner-active', scanAdv.scannerActive ? 'true' : 'false');
      this.overlay.setAttribute('data-scanner-advisor', scanAdv.summaryLine);
    }
    const bestFloor = metaSave?.bestFloor || 1;
    const totalKills = metaSave?.totalKills || 0;
    const bossesSlain = metaSave?.bossesSlain || 0;
    const totalRuns = metaSave?.totalRuns || 0;

    const dmgBonusPct = Math.round((0.08 + Math.min(0.12, bossesSlain * 0.02)) * 100);
    const careerRank = getCareerOutlawRank(metaSave);

    this.bodyEl.innerHTML = `
      <div class="hub-career-rank-banner" data-career-rank="${careerRank.rankId}">
        <span class="hub-career-rank-badge">CAREER RANK</span>
        <span class="hub-career-rank-text">${careerRank.title} (SCORE: ${careerRank.careerScore}) — ${careerRank.nextMilestoneText}</span>
      </div>

      <div class="hub-dossier-grid">
        <div class="hub-dossier-cell">
          <span class="hub-dossier-label">BEST SECTOR</span>
          <span class="hub-dossier-value hub-cyan">Floor ${bestFloor}</span>
        </div>
        <div class="hub-dossier-cell">
          <span class="hub-dossier-label">HOSTILES SLAIN</span>
          <span class="hub-dossier-value hub-gold">${totalKills}</span>
        </div>
        <div class="hub-dossier-cell">
          <span class="hub-dossier-label">BOSSES DEFEATED</span>
          <span class="hub-dossier-value hub-magenta">${bossesSlain}</span>
        </div>
        <div class="hub-dossier-cell">
          <span class="hub-dossier-label">TOTAL RUNS</span>
          <span class="hub-dossier-value hub-green">${totalRuns}</span>
        </div>
      </div>

      <div class="hub-scanner-box ${scannerClaimed ? 'is-active' : ''}">
        <div class="hub-scanner-header">
          <strong>TACTICAL SCANNER PRE-RUN CALIBRATION</strong>
          <span class="hub-scanner-status-pill">${scannerClaimed ? '✓ ACTIVE' : '⚡ READY TO CALIBRATE'}</span>
        </div>
        <p class="hub-scanner-desc">
          Grants +15% Projectile Speed and +${dmgBonusPct}% Weapon Damage for your entire upcoming run.
        </p>
        <div class="hub-scanner-status-note">
          ${
            scannerClaimed
              ? '✓ Tactical telemetry synchronized. Sensor feeds locked into bike firing arrays.'
              : '⚠️ Uncalibrated. Calibrate scanner now to lock in free damage & velocity bonuses before departure.'
          }
        </div>
      </div>
    `;

    if (this.primaryBtn) {
      this.primaryBtn.hidden = false;
      if (scannerClaimed) {
        this.primaryBtn.innerHTML = '<kbd>E</kbd> ✓ SCANNER CALIBRATED & ACTIVE';
        this.primaryBtn.onclick = () => this.close();
      } else {
        this.primaryBtn.innerHTML = '<kbd>E</kbd> 📡 CALIBRATE TACTICAL SCANNER (FREE)';
        this.primaryBtn.onclick = () => {
          if (!this.currentOptions) return;
          const res = this.currentOptions.onClaimScanner();
          this.currentOptions.scannerClaimed = true;
          if (this.currentOptions.player) {
            this.currentOptions.player.scannerBuff = true;
          } else {
            this.currentOptions.player = { scannerBuff: true };
          }
          this.showFeedback(res.message, res.ok);
          this.renderBody();
        };
      }
    }
  }

  private renderBountyBody(metaSave: any, bountyClaimed: boolean): void {
    if (!this.bodyEl || !this.currentOptions) return;
    const effectiveMetaSave = metaSave ?? this.currentOptions?.metaSave;
    const effectiveBountyClaimed = bountyClaimed !== undefined ? !!bountyClaimed : !!this.currentOptions?.bountyClaimed;
    const advisor = getWarRoomStationAdvisor(effectiveMetaSave, effectiveBountyClaimed);
    if (this.overlayEl) {
      this.overlayEl.setAttribute('data-war-room-heat', String(advisor.currentHeat));
      this.overlayEl.setAttribute('data-war-room-rec-heat', String(advisor.recommendedMaxHeat));
      this.overlayEl.setAttribute('data-war-room-advisor', advisor.summaryLine);
    }
    const currentHeat = advisor.currentHeat;

    this.bodyEl.innerHTML = `
      <div class="hub-war-room-advisor-banner" data-heat="${advisor.currentHeat}" data-rec-heat="${advisor.recommendedMaxHeat}">
        <span class="hub-war-room-advisor-text">${advisor.summaryLine.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
      </div>

      <!-- 1. War Room Supply Cache Box -->
      <div class="hub-bounty-box hub-supply-box ${effectiveBountyClaimed ? 'is-claimed' : ''}">
        <div class="hub-box-head">
          <strong>1. WAR ROOM SUPPLY CACHE</strong>
          <span class="hub-status-tag ${effectiveBountyClaimed ? 'claimed' : 'free'}">
            ${effectiveBountyClaimed ? '✓ CLAIMED' : 'FREE DROP'}
          </span>
        </div>
        <p class="hub-box-copy">Free pre-run supply drop: +15 Coins 🪙 (for Shop rooms) and +1 Max Hull Integrity ❤️.</p>
        <button type="button" class="hub-action-btn ${effectiveBountyClaimed ? 'is-claimed' : ''}" id="btn-hub-claim-cache" ${effectiveBountyClaimed ? 'disabled' : ''}>
          ${effectiveBountyClaimed ? '✓ SUPPLY CACHE CLAIMED (+15 🪙 & +1 ❤️)' : '🎁 CLAIM FREE SUPPLY CACHE (+15 🪙 & +1 ❤️)'}
        </button>
      </div>

      <!-- 2. Outlaw Bounty Heat Selector -->
      <div class="hub-bounty-box hub-heat-box">
        <div class="hub-box-head">
          <strong>2. OUTLAW BOUNTY HEAT SELECTOR</strong>
          <span class="hub-heat-current">CURRENT: HEAT ${currentHeat}</span>
        </div>
        <p class="hub-box-copy">Increase enemy aggression in exchange for +25% / +50% / +75% Bonus Scrap ⚙️ drops.</p>
        <div class="hub-heat-btn-row">
          <button type="button" class="hub-heat-btn ${currentHeat === 0 ? 'active' : ''}" data-heat="0">
            <strong>HEAT 0</strong><span>Standard Threat (0% Bonus Scrap)</span>
          </button>
          <button type="button" class="hub-heat-btn ${currentHeat === 1 ? 'active' : ''}" data-heat="1">
            <strong>HEAT 1</strong><span>Elevated Threat (+25% Scrap ⚙️)</span>
          </button>
          <button type="button" class="hub-heat-btn ${currentHeat === 2 ? 'active' : ''}" data-heat="2">
            <strong>HEAT 2</strong><span>High Threat (+50% Scrap ⚙️)</span>
          </button>
          <button type="button" class="hub-heat-btn ${currentHeat === 3 ? 'active' : ''}" data-heat="3">
            <strong>HEAT 3</strong><span>Overdrive Threat (+75% Scrap ⚙️)</span>
          </button>
        </div>
      </div>

      <!-- 3. Sector 1 Bounty Contract Box -->
      <div class="hub-bounty-box hub-contract-box">
        <div class="hub-box-head">
          <strong>3. SECTOR 1 BOUNTY CONTRACT</strong>
          <span class="hub-status-tag contract">BOUNTY</span>
        </div>
        <p class="hub-contract-copy">
          🏆 <strong>NEON DAREDEVIL:</strong> Graze 3 enemy projectiles or defeat the Floor 1 Boss &rarr;
          <span class="hub-gold">Reward: +8 ⚙️ Scrap &amp; +10 🪙 Coins</span>
        </p>
      </div>
    `;

    const cacheBtn = this.bodyEl.querySelector('#btn-hub-claim-cache') as HTMLButtonElement | null;
    if (cacheBtn && !effectiveBountyClaimed) {
      cacheBtn.onclick = () => {
        if (!this.currentOptions) return;
        const res = this.currentOptions.onClaimBountyCache();
        this.currentOptions.bountyClaimed = true;
        this.showFeedback(res.message, res.ok);
        this.renderBody();
      };
    }

    const heatButtons = this.bodyEl.querySelectorAll<HTMLButtonElement>('.hub-heat-btn');
    heatButtons.forEach((btn) => {
      btn.onclick = () => {
        if (!this.currentOptions) return;
        const heat = parseInt(btn.getAttribute('data-heat') || '0', 10);
        this.currentOptions.onSelectHeat(heat);
        if (this.currentOptions.metaSave) {
          this.currentOptions.metaSave.heatLevel = heat;
        }
        this.showFeedback(`Bounty Heat configured to HEAT ${heat} (+${heat * 25}% Bonus Scrap ⚙️)`, true);
        this.renderBody();
      };
    });

    if (this.primaryBtn) {
      this.primaryBtn.hidden = false;
      this.primaryBtn.innerHTML = '<kbd>E</kbd> ✓ CONFIRM WAR ROOM SETUP';
      this.primaryBtn.onclick = () => this.close();
    }
  }

  private renderLaunchBody(
    metaSave: any,
    player: any,
    scannerClaimed: boolean,
    bountyClaimed: boolean
  ): void {
    if (!this.bodyEl || !this.currentOptions) return;
    const advisor = getLaunchGateAdvisor(metaSave, player, scannerClaimed, bountyClaimed);
    if (this.overlay) {
      this.overlay.setAttribute('data-launch-ready-count', String(advisor.readyCount));
      this.overlay.setAttribute('data-launch-fully-prepped', advisor.isFullyPrepped ? 'true' : 'false');
      this.overlay.setAttribute('data-launch-advisor', advisor.summaryLine);
    }
    const weaponName = (player?.weapon || 'pistol').toUpperCase();
    const heat = metaSave?.heatLevel || 0;
    const heatBonus = heat * 25;

    const allBuffsClaimed = scannerClaimed && bountyClaimed;

    this.bodyEl.innerHTML = `
      <div class="hub-launch-checklist">
        <div class="hub-check-row">
          <span class="hub-check-label">PRIMARY WEAPON</span>
          <strong class="hub-check-val hub-gold">${weaponName}</strong>
        </div>
        <div class="hub-check-row">
          <span class="hub-check-label">TACTICAL SCANNER BUFF</span>
          <span class="hub-check-val ${scannerClaimed ? 'status-ok' : 'status-warn'}">
            ${scannerClaimed ? '✓ ACTIVE (+DMG &amp; +15% Bullet Speed)' : '⚠️ NOT CLAIMED (Free in Intel Lab)'}
          </span>
        </div>
        <div class="hub-check-row">
          <span class="hub-check-label">WAR ROOM SUPPLY CACHE</span>
          <span class="hub-check-val ${bountyClaimed ? 'status-ok' : 'status-warn'}">
            ${bountyClaimed ? '✓ CLAIMED (+15 Coins &amp; +1 Max Hull)' : '⚠️ NOT CLAIMED (Free in War Room)'}
          </span>
        </div>
        <div class="hub-check-row">
          <span class="hub-check-label">BOUNTY HEAT LEVEL</span>
          <strong class="hub-check-val hub-magenta">HEAT ${heat} (+${heatBonus}% Bonus Scrap)</strong>
        </div>
      </div>

      ${
        !allBuffsClaimed
          ? `
        <div class="hub-autoclaim-bar">
          <p class="hub-autoclaim-note">You have unclaimed free pre-run buffs! Secure them with one click:</p>
          <button type="button" class="hub-action-btn autoclaim-btn" id="btn-hub-autoclaim">
            ⚡ AUTO-CLAIM ALL FREE PRE-RUN BUFFS
          </button>
        </div>
      `
          : `
        <div class="hub-ready-banner">
          ✓ All free pre-run systems calibrated and loaded! You are fully prepped for Floor 1.
        </div>
      `
      }
    `;

    const autoClaimBtn = this.bodyEl.querySelector('#btn-hub-autoclaim') as HTMLButtonElement | null;
    if (autoClaimBtn) {
      autoClaimBtn.onclick = () => {
        if (!this.currentOptions) return;
        if (!this.currentOptions.scannerClaimed) {
          this.currentOptions.onClaimScanner();
          this.currentOptions.scannerClaimed = true;
        }
        if (!this.currentOptions.bountyClaimed) {
          this.currentOptions.onClaimBountyCache();
          this.currentOptions.bountyClaimed = true;
        }
        this.showFeedback('All free pre-run buffs claimed! Ready for deployment.', true);
        this.renderBody();
      };
    }

    if (this.primaryBtn) {
      this.primaryBtn.hidden = false;
      this.primaryBtn.innerHTML = '<kbd>E</kbd> 🚀 DEPLOY TO SECTOR 1 ►';
      this.primaryBtn.onclick = () => {
        const onLaunch = this.currentOptions?.onLaunchRun;
        this.close();
        onLaunch?.();
      };
    }
  }

  public renderGarageBody(metaSave: any): void {
    const advisor = getGarageStationAdvisor(metaSave);
    if (this.overlayEl) {
      this.overlayEl.setAttribute('data-garage-equipped-count', String(advisor.equippedCount));
      this.overlayEl.setAttribute('data-garage-tuning-pct', String(advisor.tuningCompletionPct));
      this.overlayEl.setAttribute('data-garage-advisor', advisor.summaryLine);
    }
    if (!this.bodyEl) return;
    const scrap = metaSave?.scrap || 0;
    const stashCount = (metaSave?.stash || []).length;

    this.bodyEl.innerHTML = `
      <div class="hub-garage-summary">
        <div class="hub-scrap-bar">
          <div class="hub-scrap-stat">
            <span class="hub-stat-label">BANKED SCRAP</span>
            <span class="hub-stat-val hub-gold">⚙️ ${scrap} SCRAP</span>
          </div>
          <div class="hub-scrap-stat">
            <span class="hub-stat-label">STASH INVENTORY</span>
            <span class="hub-stat-val hub-cyan">${stashCount} PARTS STORED</span>
          </div>
        </div>
        <div class="hub-garage-advisor-banner" data-equipped="${advisor.equippedCount}" data-tuning-pct="${advisor.tuningCompletionPct}">
          <span class="hub-garage-advisor-text">${advisor.summaryLine.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</span>
        </div>
        <div class="hub-garage-card">
          <strong>WORKBENCH TUNING &amp; ARMORY</strong>
          <p>
            Equip &amp; salvage Stash gear, tune bike handling, and unlock primary weapons before you deploy.
          </p>
        </div>
      </div>
    `;

    if (this.primaryBtn) {
      this.primaryBtn.hidden = false;
      this.primaryBtn.innerHTML = '<kbd>E</kbd> 🔧 OPEN FULL GARAGE';
      this.primaryBtn.onclick = () => this.close();
    }
  }

  private renderArmoryBody(metaSave: any, player: any): void {
    if (!this.bodyEl) return;
    const scrap = metaSave?.scrap || 0;
    const unlocked = metaSave?.unlocked || {};
    const equippedWeaponId = player?.weapon || 'pistol';

    const weaponCardsHtml = (Object.keys(WEAPONS) as WeaponId[])
      .map((weaponId) => {
        const w = WEAPONS[weaponId];
        const tac = getWeaponTacticalProfile(weaponId);
        const isUnlocked = weaponId === 'pistol' || !!unlocked[weaponId];
        const isEquipped = equippedWeaponId === weaponId;
        const statusLabel = isEquipped ? 'EQUIPPED' : isUnlocked ? 'UNLOCKED' : `${w.cost} ⚙️ SCRAP`;
        const statusClass = isEquipped ? 'is-equipped' : isUnlocked ? 'is-unlocked' : 'is-locked';

        return `
          <div class="hub-weapon-card hub-weapon-row ${statusClass}"
               data-weapon-id="${weaponId}"
               data-tactical-role="${tac.roleTag}"
               data-base-dps="${tac.baseDps}">
            <div class="hub-weapon-head">
              <strong class="hub-weapon-name" style="color: ${w.color}">${w.name}</strong>
              <span class="hub-weapon-badge ${statusClass}">${statusLabel}</span>
            </div>
            <span class="hub-weapon-tactical">${tac.summaryLine}</span>
            <p class="hub-weapon-desc">${w.desc}</p>
          </div>
        `;
      })
      .join('');

    this.bodyEl.innerHTML = `
      <div class="hub-scrap-bar">
        <div class="hub-scrap-stat">
          <span class="hub-stat-label">AVAILABLE SCRAP</span>
          <span class="hub-stat-val hub-gold">⚙️ ${scrap} SCRAP</span>
        </div>
        <div class="hub-scrap-stat">
          <span class="hub-stat-label">ACTIVE SIDEARM</span>
          <span class="hub-stat-val hub-cyan">${(WEAPONS[equippedWeaponId as WeaponId] || WEAPONS.pistol).name.toUpperCase()}</span>
        </div>
      </div>
      <div class="hub-armory-list">
        ${weaponCardsHtml}
      </div>
    `;

    if (this.primaryBtn) {
      this.primaryBtn.hidden = false;
      this.primaryBtn.innerHTML = '<kbd>E</kbd> ✓ CONFIRM ARMORY LOADOUT';
      this.primaryBtn.onclick = () => this.close();
    }
  }

  private showFeedback(message: string, ok: boolean): void {
    if (!this.feedbackEl) return;
    this.feedbackEl.textContent = message;
    this.feedbackEl.className = `hub-station-feedback ${ok ? 'is-success' : 'is-error'}`;
    this.feedbackEl.removeAttribute('hidden');
  }

  private clearFeedback(): void {
    if (!this.feedbackEl) return;
    this.feedbackEl.textContent = '';
    this.feedbackEl.setAttribute('hidden', '');
    this.feedbackEl.className = 'hub-station-feedback';
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.visible) return;

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.close();
      return;
    }

    if (e.key === 'Enter' || e.key === 'e' || e.key === 'E') {
      if (this.primaryBtn && !this.primaryBtn.disabled && !this.primaryBtn.hidden) {
        e.preventDefault();
        e.stopPropagation();
        this.primaryBtn.click();
        return;
      }
    }

    // Modal focus trap
    if (e.key === 'Tab' && this.overlayEl) {
      const focusables = Array.from(
        this.overlayEl.querySelectorAll<HTMLElement>(
          'button:not([disabled]):not([hidden]), [tabindex="0"]'
        )
      );
      if (focusables.length > 0) {
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  };

  private attachKeys(): void {
    if (this.keyListenerAttached || typeof window === 'undefined') return;
    window.addEventListener('keydown', this.handleKeyDown, true);
    this.keyListenerAttached = true;
  }

  private detachKeys(): void {
    if (!this.keyListenerAttached || typeof window === 'undefined') return;
    window.removeEventListener('keydown', this.handleKeyDown, true);
    this.keyListenerAttached = false;
  }
}
