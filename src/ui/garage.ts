/**
 * MOTO-ROGUE: Garage Workshop Modal Controller
 *
 * Implements:
 * 1. Full-viewport workshop modal with Garage Bay 01 roller door header.
 * 2. 6-slot motorcycle equipment bay with bike lift canvas preview.
 * 3. Parts stash grid (max 18 items) with click-to-equip and right-click-to-sell.
 * 4. Permanent arsenal weapon unlocks and bike tuning upgrade rows.
 * 5. Run resume, fresh run launch, and full save reset actions.
 *
 * Visual layer: anime fighting-game "GARAGE BAY" menu (see src/styles/garage.css).
 * The bike lift canvas is a cel-shaded sport bike on a scissor lift with a
 * speed-line burst; connector lines join each of the 6 slot frames to its part.
 *
 * Parity reference: moto-rogue/index.html L236-L300, L3363-L3456, L3867-L4011
 */

import {
  MetaSaveState,
  PlayerState,
  EquipSlot,
  EquipmentItem,
  WeaponId,
  MetaUpgradeId,
  UnlockableWeaponId,
  StatKey,
  BikeLiveryId
} from '../types/game';

import { WEAPONS, UNLOCKABLE_IDS, getWeaponArsenalSummary } from '../data/weapons';
import { META_UPGRADES, calcUpgradeCost, DUO_SYNERGIES, getActiveDuoSynergies, getMetaTuningSummary } from '../data/upgrades';
import {
  EQUIP_SLOTS,
  RARITY,
  MAX_STASH,
  fmtStat,
  itemScore,
  LEGENDARY_SLOT_PASSIVES,
  getEquippedSetBonus,
  getEquipmentLoadoutSummary
} from '../data/equipment';
import {
  EQUIP_SLOT_HI_FI_SVG,
  WEAPON_HI_FI_SVG,
  getEquipmentItemModelSvg,
  getEquipmentVisualSpec
} from './icons';
import { SET08_ASSETS } from './set08Assets';
import { getCareerOutlawRank } from '@/core/state';

export { getEquipmentLoadoutSummary, getWeaponArsenalSummary, getMetaTuningSummary };

export interface BikeLiveryDef {
  id: BikeLiveryId;
  name: string;
  primary: string;
  secondary: string;
  accent: string;
}

export const BIKE_LIVERIES: readonly BikeLiveryDef[] = [
  { id: 'crimson_kaneda', name: 'KANEDA RED', primary: '#ff5c00', secondary: '#b33000', accent: '#ffd60a' },
  { id: 'cyber_neon', name: 'CYBER NEON', primary: '#00bbf9', secondary: '#00509d', accent: '#00f5d4' },
  { id: 'golden_valhalla', name: 'VALHALLA GOLD', primary: '#ffbe0b', secondary: '#b5651d', accent: '#ffee99' },
  { id: 'midnight_stealth', name: 'NIGHT STEALTH', primary: '#7b2cbf', secondary: '#240046', accent: '#e0aaff' },
  { id: 'toxic_hazard', name: 'TOXIC HAZARD', primary: '#38b000', secondary: '#004b23', accent: '#b5e48c' }
] as const;

export interface LiveryCollectionSummary {
  activeLiveryId: BikeLiveryId;
  activeLiveryName: string;
  primaryColor: string;
  secondaryColor: string;
  totalLiveries: number;
  summaryLine: string;
}

const LIVERY_ALIASES: Record<string, BikeLiveryId> = {
  valhalla_gold: 'golden_valhalla',
  cyber_cyan: 'cyber_neon',
  toxic_viper: 'toxic_hazard'
};

export function getLiveryCollectionSummary(metaSave?: MetaSaveState | null): LiveryCollectionSummary {
  const rawId = metaSave?.livery;
  const normalizedId = rawId ? (LIVERY_ALIASES[rawId] || rawId) : rawId;
  const matched = BIKE_LIVERIES.find(l => l.id === normalizedId || l.id === rawId) || BIKE_LIVERIES[0];
  const totalLiveries = BIKE_LIVERIES.length;
  const summaryLine =
    'LIVERY: ' +
    matched.name.toUpperCase() +
    ' (' +
    matched.primary +
    ' / ' +
    matched.secondary +
    ') // ' +
    totalLiveries +
    ' CUSTOM PAINTS AVAILABLE';
  return {
    activeLiveryId: matched.id,
    activeLiveryName: matched.name,
    primaryColor: matched.primary,
    secondaryColor: matched.secondary,
    totalLiveries,
    summaryLine
  };
}

export interface WeaponMasteryInfo {
  tier: 0 | 1 | 2 | 3;
  label: string;
  stars: string;
  dmgBonusPct: number;
  kills: number;
}

export function getWeaponMasteryTier(kills: number = 0): WeaponMasteryInfo {
  const safeKills = Math.max(0, Math.floor(Number(kills) || 0));
  if (safeKills >= 100) {
    return { tier: 3, label: 'MASTER III', stars: '★★★', dmgBonusPct: 15, kills: safeKills };
  }
  if (safeKills >= 40) {
    return { tier: 2, label: 'ADEPT II', stars: '★★☆', dmgBonusPct: 10, kills: safeKills };
  }
  if (safeKills >= 10) {
    return { tier: 1, label: 'ROOKIE I', stars: '★☆☆', dmgBonusPct: 5, kills: safeKills };
  }
  return { tier: 0, label: 'UNRANKED', stars: '☆☆☆', dmgBonusPct: 0, kills: safeKills };
}

export interface RunPostMortemSummary {
  rankGrade: 'S' | 'A' | 'B' | 'C';
  headline: string;
  statsLine: string;
}

export function buildRunPostMortemSummary(
  floorNum: number,
  player: PlayerState,
  _metaSave?: MetaSaveState
): RunPostMortemSummary {
  const safeFloor = Math.max(1, Math.floor(Number(floorNum) || 1));
  const kills = Math.max(0, Math.floor(Number(player?.killCount) || 0));
  const wepName = (WEAPONS[player?.weapon] || WEAPONS.pistol).name.toUpperCase();
  let rankGrade: 'S' | 'A' | 'B' | 'C' = 'C';
  let headline = 'ROOKIE WIPEOUT';
  if (safeFloor >= 5 || kills >= 40) {
    rankGrade = 'S';
    headline = 'VALHALLA OUTLAW LEGEND';
  } else if (safeFloor >= 3 || kills >= 20) {
    rankGrade = 'A';
    headline = 'HIGH-OCTANE VETERAN';
  } else if (safeFloor >= 2 || kills >= 8) {
    rankGrade = 'B';
    headline = 'HIGHWAY CONTENDER';
  }
  const statsLine = `FLOOR ${safeFloor} · ${kills} KILLS · ${wepName} · GRADE ${rankGrade}`;
  return { rankGrade, headline, statsLine };
}

export interface StashSalvageSummary {
  itemCount: number;
  totalSalvageScrap: number;
  highestRarity: number;
}

export function getStashSalvageSummary(stash: EquipmentItem[] = []): StashSalvageSummary {
  if (!Array.isArray(stash) || stash.length === 0) {
    return { itemCount: 0, totalSalvageScrap: 0, highestRarity: -1 };
  }
  let totalSalvageScrap = 0;
  let highestRarity = -1;
  for (const item of stash) {
    const r = item?.rarity ?? 0;
    totalSalvageScrap += RARITY[r]?.sell ?? 0;
    if (r > highestRarity) highestRarity = r;
  }
  return { itemCount: stash.length, totalSalvageScrap, highestRarity };
}

/**
 * Returns all items in the stash where the corresponding equipment slot is equipped
 * and the stash item's score is strictly lower than the equipped item's score (downgrade).
 */
export function getDowngradeStashItems(
  stash: EquipmentItem[],
  equipped: Partial<Record<EquipSlot, EquipmentItem | null>>
): EquipmentItem[] {
  if (!Array.isArray(stash) || stash.length === 0 || !equipped) {
    return [];
  }
  return stash.filter(item => {
    if (!item || !item.slot) return false;
    const eqItem = equipped[item.slot];
    if (!eqItem) return false;
    return itemScore(item) < itemScore(eqItem);
  });
}

export interface BuildArchetypeSummary {
  id: string;
  title: string;
  badgeColor: string;
  description: string;
}

export type Player = PlayerState | (Partial<PlayerState> & { siphon?: number; [key: string]: any });
export type MetaSave = MetaSaveState | (Partial<MetaSaveState> & Record<string, any>);

/**
 * Classifies player's current outlaw build into thematic gameplay archetypes.
 */
export function getBuildArchetypeSummary(
  player?: Player | null,
  _metaSave?: MetaSave | null
): BuildArchetypeSummary {
  const p = (player || {}) as any;
  const siphon = Math.max(Number(p.siphon || 0), Number(p.vampChance || 0));
  const maxHp = Number(p.maxHp || 6);
  const speedMult = Number(p.speedMult || 1);
  const dmgMult = Number(p.dmgMult || 1);
  const fireRateMult = Number(p.fireRateMult || 1);

  if (siphon >= 0.12) {
    return {
      id: 'vampiric_reaper',
      title: '🩸 VAMPIRIC REAPER',
      badgeColor: '#ff1f4b',
      description: 'High-siphon hull regeneration build that thrives in aggressive close-quarters combat.'
    };
  }
  if (maxHp >= 10) {
    return {
      id: 'iron_juggernaut',
      title: '🛡️ IRON JUGGERNAUT',
      badgeColor: '#00f5d4',
      description: 'Heavy-armored tank chassis built to absorb boss salvos and crush obstacles.'
    };
  }
  if (speedMult >= 1.25) {
    return {
      id: 'nitro_drifter',
      title: '🏎️ NITRO DRIFTER',
      badgeColor: '#ffd60a',
      description: 'High-velocity powerslide specialist built for SSS Style Rank and drift discharges.'
    };
  }
  if (dmgMult >= 1.35 || fireRateMult >= 1.35) {
    return {
      id: 'hellfire_gunner',
      title: '🔥 HELLFIRE GUNNER',
      badgeColor: '#ff5400',
      description: 'Overclocked ordnance build focused on overwhelming ballistic output.'
    };
  }
  return {
    id: 'road_freelancer',
    title: '⚙️ ROAD FREELANCER',
    badgeColor: '#a8dadc',
    description: 'Balanced outlaw interceptor ready for modular specialization.'
  };
}

export interface GarageCallbacks {
  onEquipItem: (item: EquipmentItem) => void;
  onUnequipSlot: (slotId: EquipSlot) => void;
  onSellItem: (item: EquipmentItem) => void;
  onUnlockWeapon: (weaponId: UnlockableWeaponId) => void;
  onEquipWeapon: (weaponId: WeaponId) => void;
  onBuyUpgrade: (upgradeId: MetaUpgradeId) => void;
  onSelectLivery?: (liveryId: BikeLiveryId) => void;
  onResumeRun: () => void;
  onNewRun: () => void;
  onResetSave: () => void;
  onPlayUiClick?: () => void;
  onPlayShopBuy?: () => void;
}

/** Slot layout around the bike (matches the GARAGE BAY concept art). */
const LEFT_SLOTS: readonly EquipSlot[] = ['tires', 'engine', 'exhaust'];
const RIGHT_SLOTS: readonly EquipSlot[] = ['handlebars', 'frame', 'tank'];

/** Logical drawing space of the bike lift illustration. */
const BIKE_W = 400;
const BIKE_H = 300;

/** Anatomical part anchor coordinates on the large motorcycle model (logical 400x300 space, non-crossing). */
export const PART_ANCHORS: Record<EquipSlot, readonly [number, number]> = {
  tires: [110, 122],
  engine: [198, 160],
  exhaust: [148, 174],
  handlebars: [262, 82],
  frame: [232, 128],
  tank: [238, 152]
};

export interface EquippedBikePartVisual {
  slot: EquipSlot;
  itemName: string;
  rarity: number;
  rarityId: string;
  modelCode: string;
  tierBadge: 'MK-I' | 'MK-II' | 'MK-III' | 'OMEGA';
  subAssemblyLabel: string;
  anchor: readonly [number, number];
  primaryColor: string;
}

export interface EquippedBikeVisualState {
  equippedCount: number;
  equippedSlots: EquipSlot[];
  modelCodes: string[];
  parts: Partial<Record<EquipSlot, EquippedBikePartVisual>>;
  summaryLine: string;
}

/**
 * Pure helper computing the active high-resolution visual models mounted on the large motorcycle.
 */
export function getEquippedBikeVisualState(metaSave?: MetaSaveState | null): EquippedBikeVisualState {
  const equipped = metaSave?.equipped || {};
  const equippedSlots: EquipSlot[] = [];
  const modelCodes: string[] = [];
  const parts: Partial<Record<EquipSlot, EquippedBikePartVisual>> = {};

  for (const slotDef of EQUIP_SLOTS) {
    const slot = slotDef.id;
    const item = equipped[slot];
    if (!item) continue;
    const spec = getEquipmentVisualSpec(item, slot);
    const rarDef = RARITY[item.rarity] || RARITY[0];
    equippedSlots.push(slot);
    modelCodes.push(spec.modelCode);
    parts[slot] = {
      slot,
      itemName: item.name,
      rarity: item.rarity,
      rarityId: rarDef.id,
      modelCode: spec.modelCode,
      tierBadge: spec.tierBadge,
      subAssemblyLabel: spec.subAssemblyLabel,
      anchor: PART_ANCHORS[slot],
      primaryColor: spec.primaryColor
    };
  }

  const summaryLine =
    equippedSlots.length > 0
      ? `MOUNTED MODELS (${equippedSlots.length}/6): ${modelCodes.join(' · ')}`
      : 'MOUNTED MODELS (0/6): STOCK CHASSIS';

  return {
    equippedCount: equippedSlots.length,
    equippedSlots,
    modelCodes,
    parts,
    summaryLine
  };
}

/** Neutral paint for empty (uninstalled) parts, chosen to keep the bike readable. */
const EMPTY_PART_COLOR: Record<EquipSlot, string> = {
  tires: '#ff6b2b',
  engine: '#7d8390',
  exhaust: '#b8bec9',
  handlebars: '#3b3f4a',
  frame: '#4a4f5a',
  tank: '#ff8a3d'
};

const INK = '#0a0b10';

const GEAR_SVG =
  '<svg class="gx-gear" viewBox="0 0 24 24" aria-hidden="true"><path d="M10.3 2h3.4l.5 2.6 1.9.8 2.2-1.5 2.4 2.4-1.5 2.2.8 1.9 2.6.5v3.4l-2.6.5-.8 1.9 1.5 2.2-2.4 2.4-2.2-1.5-1.9.8-.5 2.6h-3.4l-.5-2.6-1.9-.8-2.2 1.5-2.4-2.4 1.5-2.2-.8-1.9L2 13.7v-3.4l2.6-.5.8-1.9-1.5-2.2 2.4-2.4 2.2 1.5 1.9-.8zM12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7z"/></svg>';

const LOCK_SVG =
  '<svg class="gx-lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="#0a0b10" stroke-width="2.5"/><rect x="4" y="10" width="16" height="11" rx="2" fill="#ffffff" stroke="#0a0b10" stroke-width="2.5"/><circle cx="12" cy="15.5" r="2" fill="#0a0b10"/></svg>';

const CHECK_SVG =
  '<svg class="gx-lock" viewBox="0 0 24 24" aria-hidden="true"><path d="M4 12.5l5 5L20 6.5" fill="none" stroke="#ffd60a" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';

/** Escapes text before interpolating it into innerHTML templates. */
function esc(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Formats an item's stat block as "a, b, c". */
function statsText(stats: EquipmentItem['stats']): string {
  return (Object.entries(stats) as [StatKey, number | undefined][])
    .map(([k, v]) => fmtStat(k, v ?? 0))
    .join(', ');
}

function slotIcon(slot: EquipSlot, item?: EquipmentItem | null): string {
  if (item) {
    return getEquipmentItemModelSvg(item, slot);
  }
  return EQUIP_SLOT_HI_FI_SVG[slot] || '';
}

export class GarageController {
  public static getLiveryCollectionSummary = getLiveryCollectionSummary;
  public getLiveryCollectionSummary = getLiveryCollectionSummary;
  private overlay: HTMLElement | null = null;
  public get overlayEl(): HTMLElement | null {
    if (!this.overlay && typeof document !== 'undefined') {
      this.overlay = document.getElementById('garage-overlay');
    }
    return this.overlay;
  }
  public set overlayEl(el: HTMLElement | null) {
    this.overlay = el;
  }
  public player: PlayerState | null = null;
  public metaSave: MetaSaveState | null = null;
  private modalTitle: HTMLElement | null = null;
  private modalScrap: HTMLElement | null = null;
  private koBurst: HTMLElement | null = null;
  private koFloor: HTMLElement | null = null;
  private slotsLeft: HTMLElement | null = null;
  private slotsRight: HTMLElement | null = null;
  private bikeCanvas: HTMLCanvasElement | null = null;
  private bikeCtx: CanvasRenderingContext2D | null = null;
  private liveryBar: HTMLElement | null = null;
  private eqTotals: HTMLElement | null = null;
  private stashList: HTMLElement | null = null;
  private unlockList: HTMLElement | null = null;
  private metaUpgradeList: HTMLElement | null = null;
  private resumeBtn: HTMLButtonElement | null = null;
  private backBtn: HTMLButtonElement | null = null;
  private newRunBtn: HTMLButtonElement | null = null;
  private resetSaveBtn: HTMLButtonElement | null = null;

  private isVisible: boolean = false;
  private isDead: boolean = false;
  private callbacks: GarageCallbacks;
  private set08BikeImg: HTMLImageElement | null = null;
  private set08BikeLoaded: boolean = false;
  private set08EquipImgs: Partial<Record<EquipSlot, HTMLImageElement>> = {};
  private set08EquipLoaded: Partial<Record<EquipSlot, boolean>> = {};
  private lastMetaSave: MetaSaveState | null = null;
  private lastPlayer: PlayerState | null = null;
  private confirmResetPending: boolean = false;
  private confirmResetTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(callbacks: GarageCallbacks) {
    this.callbacks = callbacks;

    if (typeof Image !== 'undefined') {
      const img = new Image();
      img.onload = () => {
        this.set08BikeLoaded = true;
        if (this.lastMetaSave && this.isVisible) {
          this.drawBikeLift(this.lastMetaSave);
        }
      };
      img.src = SET08_ASSETS.bike_player || '/assets/set08/bike_player.png';
      this.set08BikeImg = img;

      const equipAssetKeys: Record<EquipSlot, string> = {
        tires: 'equip_tires',
        engine: 'equip_engine',
        exhaust: 'equip_exhaust',
        frame: 'equip_frame',
        handlebars: 'equip_handlebars',
        tank: 'equip_tank'
      };
      (Object.keys(equipAssetKeys) as EquipSlot[]).forEach(slot => {
        const eqImg = new Image();
        eqImg.onload = () => {
          this.set08EquipLoaded[slot] = true;
          if (this.lastMetaSave && this.isVisible) {
            this.drawBikeLift(this.lastMetaSave);
          }
        };
        const assetKey = equipAssetKeys[slot];
        eqImg.src = SET08_ASSETS[assetKey] || `/assets/set08/${assetKey}.png`;
        this.set08EquipImgs[slot] = eqImg;
      });
    }

    if (typeof document !== 'undefined') {
      this.overlay = document.getElementById('garage-overlay');
      this.modalTitle = document.getElementById('modal-title');
      this.modalScrap = document.getElementById('modal-scrap');
      this.koBurst = document.getElementById('garage-ko') || document.getElementById('ko-burst');
      this.koFloor = document.getElementById('garage-ko-floor') || document.getElementById('ko-floor');
      this.slotsLeft = document.getElementById('slots-left');
      this.slotsRight = document.getElementById('slots-right');
      this.bikeCanvas = document.getElementById('bike-canvas') as HTMLCanvasElement | null;
      if (this.bikeCanvas) {
        this.bikeCtx = this.bikeCanvas.getContext('2d');
      }
      this.liveryBar = document.getElementById('livery-bar');
      this.eqTotals = document.getElementById('eq-totals');
      this.stashList = document.getElementById('stash-list');
      this.unlockList = document.getElementById('unlock-list');
      this.metaUpgradeList = document.getElementById('meta-upgrade-list');
      this.resumeBtn = document.getElementById('btn-resume') as HTMLButtonElement | null;
      this.backBtn = document.getElementById('btn-back') as HTMLButtonElement | null;
      this.newRunBtn = document.getElementById('btn-new-run') as HTMLButtonElement | null;
      this.resetSaveBtn = document.getElementById('btn-reset-save') as HTMLButtonElement | null;

      this.resumeBtn?.addEventListener('click', () => {
        this.callbacks.onPlayUiClick?.();
        if (this.isDead) {
          this.callbacks.onNewRun();
        } else {
          this.callbacks.onResumeRun();
        }
        this.close();
      });

      this.backBtn?.addEventListener('click', () => {
        this.callbacks.onPlayUiClick?.();
        if (this.isDead) {
          this.callbacks.onNewRun();
        }
        this.close();
      });

      this.newRunBtn?.addEventListener('click', () => {
        this.callbacks.onPlayUiClick?.();
        this.callbacks.onNewRun();
        this.close();
      });

      this.resetSaveBtn?.addEventListener('click', () => {
        this.callbacks.onPlayUiClick?.();
        if (!this.confirmResetPending) {
          this.confirmResetPending = true;
          const originalLabel = this.resetSaveBtn?.dataset.origLabel || this.resetSaveBtn?.textContent || 'Reset';
          if (this.resetSaveBtn) {
            this.resetSaveBtn.dataset.origLabel = originalLabel;
            this.resetSaveBtn.textContent = 'CONFIRM FULL RESET?';
            this.resetSaveBtn.classList.add('is-confirming');
          }
          if (this.confirmResetTimer) clearTimeout(this.confirmResetTimer);
          this.confirmResetTimer = setTimeout(() => {
            this.confirmResetPending = false;
            if (this.resetSaveBtn) {
              this.resetSaveBtn.textContent = this.resetSaveBtn.dataset.origLabel || 'Reset';
              this.resetSaveBtn.classList.remove('is-confirming');
            }
          }, 3000);
          return;
        }

        if (this.confirmResetTimer) {
          clearTimeout(this.confirmResetTimer);
          this.confirmResetTimer = null;
        }
        this.confirmResetPending = false;
        if (this.resetSaveBtn) {
          this.resetSaveBtn.textContent = this.resetSaveBtn.dataset.origLabel || 'Reset';
          this.resetSaveBtn.classList.remove('is-confirming');
        }
        this.callbacks.onResetSave();
      });

      if (typeof window !== 'undefined') {
        window.addEventListener('keydown', (ev: KeyboardEvent) => {
          if (!this.isVisible) return;
          if (ev.key === 'Enter') {
            ev.preventDefault();
            this.callbacks.onPlayUiClick?.();
            if (this.isDead) {
              this.callbacks.onNewRun();
            } else {
              this.callbacks.onResumeRun();
            }
            this.close();
          }
        });
      }
    }
  }

  public isOpen(): boolean {
    return this.isVisible;
  }

  /**
   * Opens the Garage Workshop modal overlay.
   */
  public open(
    isDead: boolean,
    floorNum: number,
    metaSave: MetaSaveState,
    player: PlayerState
  ): void {
    this.isDead = isDead;
    this.isVisible = true;
    this.lastPlayer = player;
    this.player = player;
    this.lastMetaSave = metaSave;
    this.metaSave = metaSave;

    if (this.overlay) {
      this.overlay.classList.add('visible');
      this.overlay.classList.toggle('is-dead', isDead);
    }

    const archetype = getBuildArchetypeSummary(this.player, this.metaSave);
    this.overlayEl?.setAttribute('data-build-archetype', archetype.id);
    this.overlayEl?.setAttribute('data-build-archetype-title', archetype.title);

    const careerRank = getCareerOutlawRank(this.metaSave);
    this.overlayEl?.setAttribute('data-career-rank', careerRank.rankId);
    this.overlayEl?.setAttribute('data-career-title', careerRank.title);
    this.overlayEl?.setAttribute('data-career-score', String(careerRank.careerScore));

    const livSummary = getLiveryCollectionSummary(this.metaSave);
    this.overlayEl?.setAttribute('data-active-livery-id', livSummary.activeLiveryId);
    this.overlayEl?.setAttribute('data-active-livery-name', livSummary.activeLiveryName);
    this.overlayEl?.setAttribute('data-livery-summary', livSummary.summaryLine);

    if (!this.bikeCanvas && typeof document !== 'undefined') {
      this.bikeCanvas = document.getElementById('bike-canvas') as HTMLCanvasElement | null;
    }
    if (this.bikeCanvas) {
      this.bikeCanvas.setAttribute('data-active-livery-id', livSummary.activeLiveryId);
      this.bikeCanvas.setAttribute('data-active-livery-name', livSummary.activeLiveryName);
      this.bikeCanvas.setAttribute('data-livery-summary', livSummary.summaryLine);
    }

    if (this.modalTitle) {
      this.modalTitle.textContent = 'GARAGE BAY';
    }

    const postMortem = buildRunPostMortemSummary(floorNum, player, metaSave);

    // Fighting-game style defeat burst ("K.O." + floor reached)
    if (this.koBurst) {
      this.koBurst.hidden = !isDead;
      this.koBurst.setAttribute('data-run-grade', postMortem.rankGrade);
    }
    if (this.koFloor) {
      this.koFloor.textContent = `RUN OVER \u00b7 ${postMortem.statsLine}`;
    }

    if (this.resumeBtn) {
      const label = isDead ? 'RIDE OUT (NEW RUN)' : 'RIDE OUT';
      this.resumeBtn.innerHTML = `<span class="gx-btn-key">[ENTER]</span> <span class="gx-btn-text">${label}</span>`;
    }

    this.render(metaSave, player);
  }

  /**
   * Closes the Garage Workshop overlay.
   */
  public close(): void {
    if (this.overlay) {
      this.overlay.classList.remove('visible');
    }
    this.isVisible = false;
  }

  /**
   * Toggles the Garage Workshop visibility.
   */
  public toggle(
    isDead: boolean,
    floorNum: number,
    metaSave: MetaSaveState,
    player: PlayerState
  ): void {
    this.callbacks.onPlayUiClick?.();
    if (this.isVisible) {
      if (this.isDead) {
        this.callbacks.onNewRun();
      }
      this.close();
    } else {
      this.open(isDead, floorNum, metaSave, player);
    }
  }

  /**
   * Builds the rich Outlaw Duo Synergies & Career Telemetry HTML tooltip.
   */
  public buildSynergyCodexTooltip(metaSave: MetaSaveState, player?: PlayerState | null): string {
    const telemetry = `Runs: ${metaSave.totalRuns || 0} · Best Floor: ${metaSave.bestFloor || 1} · Bosses Slain: ${metaSave.bossesSlain || 0}`;
    const activeDuoIds = new Set(player ? getActiveDuoSynergies(player).map(d => d.id) : []);

    const DUO_TITLES: Record<string, string> = {
      thermal_shock: 'Thermal Shock',
      superconductor: 'Superconductor',
      void_vortex: 'Void Vortex',
      juggernaut_overdrive: 'Juggernaut Overdrive',
      voltaic_wake: 'Voltaic Wake'
    };

    const duoHtml = DUO_SYNERGIES.map(d => {
      const isActive = activeDuoIds.has(d.id);
      const title = DUO_TITLES[d.id] || d.name;
      const statusBadge = isActive
        ? ' <span style="color:#00f5d4;font-weight:900;">[ACTIVE]</span>'
        : '';
      return `<div style="margin-top:6px;line-height:1.3;"><b style="color:${d.color}">${esc(title)} (${esc(d.name)})</b>${statusBadge}<br/><span style="color:#d0d4dc;font-size:11px;">${esc(d.desc)}</span></div>`;
    }).join('');

    return `<div class="gx-tooltip-codex" style="text-align:left;max-width:360px;"><div style="font-family:'Impact',sans-serif;font-size:14px;letter-spacing:1px;color:#ffd60a;">CAREER TELEMETRY</div><div style="color:#a8b2d1;font-size:11px;margin-bottom:4px;">${esc(telemetry)}</div><hr style="border:0;border-top:1px solid rgba(255,255,255,0.18);margin:6px 0;"/><div style="font-family:'Impact',sans-serif;font-size:13px;letter-spacing:1px;color:#00f5d4;">OUTLAW DUO SYNERGIES</div>${duoHtml}</div>`.trim();
  }

  /**
   * Renders the Garage Bay header, scrap count, and exposes the Career & Duo tooltip.
   */
  public renderHeader(metaSave: MetaSaveState, player?: PlayerState | null): void {
    if (this.modalScrap) {
      this.modalScrap.textContent = `${metaSave.scrap}`;
    }
    const tipContent = this.buildSynergyCodexTooltip(metaSave, player);
    if (this.modalTitle) {
      this.modalTitle.textContent = 'GARAGE BAY';
      this.modalTitle.setAttribute('data-tip', tipContent);
      this.modalTitle.setAttribute(
        'title',
        `Career Telemetry: Runs: ${metaSave.totalRuns || 0} · Best Floor: ${metaSave.bestFloor || 1} · Bosses Slain: ${metaSave.bossesSlain || 0}`
      );
    }
    const subTitle = document.getElementById('modal-subtitle');
    if (subTitle) {
      subTitle.setAttribute('data-tip', tipContent);
    }
  }

  /**
   * Renders the Garage Bay footer with hint, action buttons, and exposes the Career & Duo tooltip.
   */
  public renderFooter(metaSave: MetaSaveState, player?: PlayerState | null): void {
    const tipContent = this.buildSynergyCodexTooltip(metaSave, player);
    const footerHint = document.querySelector('.gx-hint') as HTMLElement | null;
    if (footerHint) {
      footerHint.setAttribute('data-tip', tipContent);
      footerHint.setAttribute(
        'title',
        `Career Telemetry: Runs: ${metaSave.totalRuns || 0} · Best Floor: ${metaSave.bestFloor || 1} · Bosses Slain: ${metaSave.bossesSlain || 0}`
      );
    }
  }

  /**
   * Renders the entire garage workshop UI.
   */
  public render(metaSave: MetaSaveState, player?: PlayerState | null): void {
    if (player) {
      this.lastPlayer = player;
      this.player = player;
    }
    this.lastMetaSave = metaSave;
    this.metaSave = metaSave;
    const curPlayer = player || this.lastPlayer || this.player;

    const archetype = getBuildArchetypeSummary(curPlayer, this.metaSave);
    this.overlayEl?.setAttribute('data-build-archetype', archetype.id);
    this.overlayEl?.setAttribute('data-build-archetype-title', archetype.title);

    const careerRank = getCareerOutlawRank(this.metaSave);
    this.overlayEl?.setAttribute('data-career-rank', careerRank.rankId);
    this.overlayEl?.setAttribute('data-career-title', careerRank.title);
    this.overlayEl?.setAttribute('data-career-score', String(careerRank.careerScore));

    const livSummary = getLiveryCollectionSummary(this.metaSave);
    this.overlayEl?.setAttribute('data-active-livery-id', livSummary.activeLiveryId);
    this.overlayEl?.setAttribute('data-active-livery-name', livSummary.activeLiveryName);
    this.overlayEl?.setAttribute('data-livery-summary', livSummary.summaryLine);

    if (!this.bikeCanvas && typeof document !== 'undefined') {
      this.bikeCanvas = document.getElementById('bike-canvas') as HTMLCanvasElement | null;
    }
    if (this.bikeCanvas) {
      this.bikeCanvas.setAttribute('data-active-livery-id', livSummary.activeLiveryId);
      this.bikeCanvas.setAttribute('data-active-livery-name', livSummary.activeLiveryName);
      this.bikeCanvas.setAttribute('data-livery-summary', livSummary.summaryLine);
    }

    const bikeVisuals = getEquippedBikeVisualState(metaSave);
    this.overlayEl?.setAttribute('data-equipped-visual-count', String(bikeVisuals.equippedCount));
    this.overlayEl?.setAttribute('data-equipped-visual-slots', bikeVisuals.equippedSlots.join(','));
    this.overlayEl?.setAttribute('data-equipped-model-codes', bikeVisuals.modelCodes.join(','));
    this.overlayEl?.setAttribute('data-equipped-visual-summary', bikeVisuals.summaryLine);
    if (this.bikeCanvas) {
      this.bikeCanvas.setAttribute('data-equipped-visual-count', String(bikeVisuals.equippedCount));
      this.bikeCanvas.setAttribute('data-equipped-visual-slots', bikeVisuals.equippedSlots.join(','));
      this.bikeCanvas.setAttribute('data-equipped-model-codes', bikeVisuals.modelCodes.join(','));
      this.bikeCanvas.setAttribute('data-equipped-visual-summary', bikeVisuals.summaryLine);
    }

    this.renderHeader(metaSave, curPlayer);
    this.renderEquipmentBay(metaSave, curPlayer);
    this.renderLiverySwatches(metaSave, curPlayer || ({} as any));
    this.renderStash(metaSave);
    this.renderWeaponUnlocks(metaSave, curPlayer || ({} as any));
    this.renderMetaUpgrades(metaSave);
    this.renderFooter(metaSave, curPlayer);
    this.drawBikeLift(metaSave);
  }

  /**
   * Alias / helper for renderEquipmentBay to satisfy contract.
   */
  public renderEquipmentSlots(metaSave: MetaSaveState, player?: PlayerState | null): void {
    this.renderEquipmentBay(metaSave, player);
  }

  /**
   * Renders the custom bike paint livery swatches and syncs paint telemetry.
   */
  public renderLiverySwatches(metaSave: MetaSaveState, player?: PlayerState | null): void {
    const curPlayer = player || this.player || ({} as any);
    const livSummary = getLiveryCollectionSummary(metaSave);

    if (this.overlayEl) {
      this.overlayEl.setAttribute('data-active-livery-id', livSummary.activeLiveryId);
      this.overlayEl.setAttribute('data-active-livery-name', livSummary.activeLiveryName);
      this.overlayEl.setAttribute('data-livery-summary', livSummary.summaryLine);
    }

    if (!this.bikeCanvas && typeof document !== 'undefined') {
      this.bikeCanvas = document.getElementById('bike-canvas') as HTMLCanvasElement | null;
    }
    if (this.bikeCanvas) {
      this.bikeCanvas.setAttribute('data-active-livery-id', livSummary.activeLiveryId);
      this.bikeCanvas.setAttribute('data-active-livery-name', livSummary.activeLiveryName);
      this.bikeCanvas.setAttribute('data-livery-summary', livSummary.summaryLine);
    }

    if (!this.liveryBar && typeof document !== 'undefined') {
      this.liveryBar = document.getElementById('livery-bar') || document.getElementById('livery-swatches');
    }
    if (!this.liveryBar) return;
    this.liveryBar.innerHTML = '';
    const activeId: BikeLiveryId = metaSave.livery || curPlayer.livery || 'crimson_kaneda';

    for (const liv of BIKE_LIVERIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      const isActive = liv.id === activeId;
      btn.className = `gx-livery-btn${isActive ? ' is-active' : ''}`;
      btn.style.setProperty('--liv-col', liv.primary);
      btn.setAttribute('role', 'radio');
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      btn.setAttribute('data-livery-id', liv.id);
      btn.innerHTML = `<span class="gx-livery-dot"></span><span>${esc(liv.name)}</span>`;
      btn.onclick = () => {
        this.callbacks.onPlayUiClick?.();
        metaSave.livery = liv.id;
        curPlayer.livery = liv.id;
        this.callbacks.onSelectLivery?.(liv.id);
        this.renderLiverySwatches(metaSave, curPlayer);
        this.drawBikeLift(metaSave);
      };
      this.liveryBar.appendChild(btn);
    }
  }

  /**
   * Backward-compatibility alias for renderLiverySwatches.
   */
  public renderLiveryBar(metaSave: MetaSaveState, player: PlayerState): void {
    this.renderLiverySwatches(metaSave, player);
  }

  /**
   * Renders the 6 equipment slot bay around the bike lift canvas.
   */
  public renderEquipmentBay(metaSave: MetaSaveState, player?: PlayerState | null): void {
    const loadout = getEquipmentLoadoutSummary(metaSave.equipped);
    if (this.overlayEl) {
      this.overlayEl.setAttribute('data-loadout-power-score', loadout.totalPowerScore.toFixed(1));
      this.overlayEl.setAttribute('data-next-set-goal', loadout.nextSetGoalText);
      this.overlayEl.setAttribute('data-loadout-summary', loadout.summaryLine);
    }
    if (this.eqTotals) {
      this.eqTotals.setAttribute('data-loadout-power-score', loadout.totalPowerScore.toFixed(1));
      this.eqTotals.setAttribute('data-next-set-goal', loadout.nextSetGoalText);
      this.eqTotals.setAttribute('data-loadout-summary', loadout.summaryLine);
    }

    if (!this.slotsLeft || !this.slotsRight) return;

    this.slotsLeft.innerHTML = '';
    this.slotsRight.innerHTML = '';

    const renderSlot = (slotId: EquipSlot, container: HTMLElement) => {
      const slotDef = EQUIP_SLOTS.find(s => s.id === slotId);
      if (!slotDef) return;
      const it = metaSave.equipped[slotDef.id];

      if (it) {
        const R = RARITY[it.rarity];
        const statsStr = statsText(it.stats);
        const spec = getEquipmentVisualSpec(it, slotDef.id);
        const el = document.createElement('button');
        el.type = 'button';
        el.className = `eq-slot is-filled rarity-${R.id}`;
        el.style.setProperty('--rar', R.color);
        el.setAttribute('data-slot-id', slotDef.id);
        el.setAttribute('data-model-code', spec.modelCode);
        el.setAttribute('data-tier-badge', spec.tierBadge);
        el.title = `${it.name} [${spec.modelCode} · ${spec.tierBadge}] (${R.name})\n${spec.subAssemblyLabel}\n${statsStr}\nClick to remove.`;
        el.setAttribute('aria-label', `${slotDef.label}: ${it.name}, ${R.name} (${spec.modelCode}). ${statsStr}. Remove part`);
        el.innerHTML = `
          <span class="gx-slot-icon sl-icon">${slotIcon(slotDef.id, it)}</span>
          <span class="sl-name">${esc(it.name)}</span>
          <span class="sl-model-tag">${esc(spec.modelCode)}</span>
          <span class="sl-stats">${esc(statsStr)}</span>
          <span class="sl-label">${esc(slotDef.label.toUpperCase())}</span>
        `;
        el.onclick = () => {
          this.callbacks.onUnequipSlot(slotDef.id);
        };
        container.appendChild(el);
      } else {
        const el = document.createElement('div');
        el.className = 'eq-slot is-empty';
        el.setAttribute('data-slot-id', slotDef.id);
        el.setAttribute('aria-label', `${slotDef.label}: Empty Slot`);
        el.innerHTML = `
          <span class="gx-slot-icon sl-icon">${slotIcon(slotDef.id, null)}</span>
          <span class="sl-name">Empty Slot</span>
          <span class="sl-stats">No part installed</span>
          <span class="sl-label">${esc(slotDef.label.toUpperCase())}</span>
        `;
        container.appendChild(el);
      }
    };

    LEFT_SLOTS.forEach(id => renderSlot(id, this.slotsLeft!));
    RIGHT_SLOTS.forEach(id => renderSlot(id, this.slotsRight!));

    // Compute total installed equipment stats
    const totals: Partial<Record<StatKey, number>> = {};
    if (metaSave.equipped) {
      Object.values(metaSave.equipped).forEach(it => {
        if (!it) return;
        (Object.entries(it.stats) as [StatKey, number | undefined][]).forEach(([k, v]) => {
          totals[k] = (totals[k] || 0) + (v || 0);
        });
      });
    }

    const totalStrings = (Object.entries(totals) as [StatKey, number][]).map(([k, v]) => fmtStat(k, v));
    const baseSummary = totalStrings.length > 0
      ? `Installed Bonuses: ${totalStrings.join(' | ')}`
      : 'Installed Bonuses: None';

    // Active legendary slot passives (rarity === 3)
    const activeLegendaries: { slot: EquipSlot; title: string; desc: string }[] = [];
    if (metaSave.equipped) {
      (Object.entries(metaSave.equipped) as [EquipSlot, EquipmentItem | undefined][]).forEach(([slotKey, item]) => {
        if (item && item.rarity === 3) {
          const passive = LEGENDARY_SLOT_PASSIVES[slotKey];
          if (passive) {
            activeLegendaries.push({ slot: slotKey, title: passive.title, desc: passive.desc });
          }
        }
      });
    }

    // Equipped set bonuses
    const setBonus = getEquippedSetBonus(metaSave.equipped);

    // Build rich summary markup & tooltip
    const curPlayer = player || this.lastPlayer;
    const tipContent = this.buildSynergyCodexTooltip(metaSave, curPlayer);
    const telemetryText = `Runs: ${metaSave.totalRuns || 0} · Best Floor: ${metaSave.bestFloor || 1} · Bosses Slain: ${metaSave.bossesSlain || 0}`;

    const archetype = getBuildArchetypeSummary(curPlayer, metaSave);
    let summaryHtml = `<span class="gx-totals-base">${esc(baseSummary)}</span>`;
    summaryHtml += ` <span class="gx-archetype-badge" style="color:${archetype.badgeColor};font-weight:bold;margin-left:8px;" title="${esc(archetype.description)}">${esc(archetype.title)}</span>`;
    if (setBonus && setBonus.label) {
      summaryHtml += ` <span class="gx-set-bonus" style="color:#00f5d4;">★ <b>SET:</b> ${esc(setBonus.label)}</span>`;
    } else {
      summaryHtml += ` <span class="gx-set-goal-hint" style="color:#8892b0;font-size:11px;">🎯 ${esc(loadout.nextSetGoalText)}</span>`;
    }
    if (activeLegendaries.length > 0) {
      const legHtml = activeLegendaries.map(
        l => `<span class="gx-legendary-passive" style="color:#ffd60a;">⚡ <b>LEGENDARY (${esc(l.slot.toUpperCase())}):</b> ${esc(l.title)} <small>(${esc(l.desc)})</small></span>`
      ).join(' ');
      summaryHtml += ` ${legHtml}`;
    }

    let summaryEl = document.getElementById('equip-bonus-summary');
    if (!summaryEl && this.eqTotals) {
      summaryEl = this.eqTotals.querySelector('#equip-bonus-summary');
      if (!summaryEl) {
        summaryEl = document.createElement('div');
        summaryEl.id = 'equip-bonus-summary';
        summaryEl.className = 'equip-bonus-summary';
        this.eqTotals.innerHTML = '';
        this.eqTotals.appendChild(summaryEl);
      }
    }

    if (summaryEl) {
      summaryEl.innerHTML = summaryHtml;
      summaryEl.setAttribute('data-tip', tipContent);
      summaryEl.setAttribute('title', `Career Telemetry: ${telemetryText}`);
      summaryEl.setAttribute('data-loadout-power-score', loadout.totalPowerScore.toFixed(1));
      summaryEl.setAttribute('data-next-set-goal', loadout.nextSetGoalText);
      summaryEl.setAttribute('data-loadout-summary', loadout.summaryLine);
    }

    if (this.eqTotals) {
      this.eqTotals.setAttribute('data-loadout-power-score', loadout.totalPowerScore.toFixed(1));
      this.eqTotals.setAttribute('data-next-set-goal', loadout.nextSetGoalText);
      this.eqTotals.setAttribute('data-loadout-summary', loadout.summaryLine);
      if (this.eqTotals !== summaryEl && !this.eqTotals.contains(summaryEl)) {
        this.eqTotals.innerHTML = summaryHtml;
        this.eqTotals.setAttribute('data-tip', tipContent);
        this.eqTotals.setAttribute('title', `Career Telemetry: ${telemetryText}`);
      }
    }
  }

  /**
   * Renders the parts stash grid.
   */
  private renderStash(metaSave: MetaSaveState): void {
    if (!this.stashList) return;
    this.stashList.innerHTML = '';

    const stash = metaSave.stash || [];
    const salvage = getStashSalvageSummary(stash);
    const downgrades = getDowngradeStashItems(metaSave.stash, metaSave.equipped);
    this.stashList.setAttribute('data-stash-count', String(salvage.itemCount));
    this.stashList.setAttribute('data-downgrade-count', String(downgrades.length));
    this.stashList.setAttribute('data-total-salvage', String(salvage.totalSalvageScrap));
    this.stashList.setAttribute('data-highest-rarity', String(salvage.highestRarity));

    const GHOST_FILL = 11;

    if (stash.length === 0) {
      const msg = document.createElement('div');
      msg.className = 'gx-stash-empty';
      msg.textContent = 'Stash empty — kill bosses & elites for loot parts!';
      this.stashList.appendChild(msg);
    }

    stash.forEach(it => {
      const R = RARITY[it.rarity];
      const slotDef = EQUIP_SLOTS.find(s => s.id === it.slot);
      const slotLabel = slotDef ? slotDef.label : it.slot;
      const statsStr = statsText(it.stats);

      const eqItem = metaSave.equipped[it.slot] || null;
      const diffScore = eqItem ? itemScore(it) - itemScore(eqItem) : itemScore(it);
      let diffBadgeHtml = '';
      let vsEquippedLine = '';
      if (!eqItem || diffScore > 0.05) {
        diffBadgeHtml = '<span class="gx-stash-diff is-up">▲ UPGRADE</span>';
        vsEquippedLine = eqItem
          ? `▲ UPGRADE vs Equipped: ${eqItem.name} (${statsText(eqItem.stats)})`
          : `▲ UPGRADE (${slotLabel} slot empty)`;
      } else if (diffScore < -0.05) {
        diffBadgeHtml = '<span class="gx-stash-diff is-down">▼</span>';
        vsEquippedLine = `▼ Downgrade vs Equipped: ${eqItem.name} (${statsText(eqItem.stats)})`;
      } else {
        vsEquippedLine = `= Equal to Equipped: ${eqItem.name} (${statsText(eqItem.stats)})`;
      }

      const spec = getEquipmentVisualSpec(it, it.slot);
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `stash-item rarity-${R.id}`;
      el.style.setProperty('--rar', R.color);
      const isDowngrade = Boolean(eqItem && itemScore(it) < itemScore(eqItem));
      el.setAttribute('data-is-downgrade', isDowngrade ? 'true' : 'false');
      el.setAttribute('data-model-code', spec.modelCode);
      el.setAttribute('data-tier-badge', spec.tierBadge);
      el.title = `${it.name} [${spec.modelCode} · ${spec.tierBadge}] - ${R.name} ${slotLabel}\n${spec.subAssemblyLabel}\n${statsStr}\n${vsEquippedLine}\nClick: install | Right-click / Del: sell for ${R.sell} scrap`;
      el.setAttribute('aria-label', `${it.name}, ${R.name} ${slotLabel} (${spec.modelCode}). ${statsStr}. ${vsEquippedLine}. Install. Press Delete to sell for ${R.sell} scrap`);
      el.innerHTML = `
        ${diffBadgeHtml}
        <div class="gx-stash-art">${getEquipmentItemModelSvg(it, it.slot)}</div>
        <b>${esc(it.name)}</b>
        <span class="gx-stash-meta">${esc(spec.modelCode)} · ${esc(R.name)}</span>
        <span class="gx-stash-stats">${esc(statsStr)}</span>
        <span class="gx-stash-sell">${GEAR_SVG}${R.sell}</span>
      `;

      // Left-click equips
      el.onclick = () => {
        this.callbacks.onEquipItem(it);
      };

      // Right-click sells for scrap
      el.oncontextmenu = (ev) => {
        ev.preventDefault();
        this.callbacks.onSellItem(it);
      };

      // Keyboard parity for selling
      el.onkeydown = (ev) => {
        if (ev.key === 'Delete' || ev.key === 'Backspace') {
          ev.preventDefault();
          this.callbacks.onSellItem(it);
        }
      };

      this.stashList!.appendChild(el);
    });

    // Ghost tiles keep the 2-row stash grid shape from the concept art
    const used = stash.length === 0 ? 3 : stash.length;
    for (let i = used; i < Math.min(GHOST_FILL, MAX_STASH); i++) {
      const ghost = document.createElement('div');
      ghost.className = 'gx-stash-ghost';
      ghost.setAttribute('aria-hidden', 'true');
      this.stashList.appendChild(ghost);
    }
  }

  /**
   * Renders the permanent weapon unlocks list.
   */
  public renderWeaponUnlocks(metaSave: MetaSaveState, player?: PlayerState | null): void {
    const curPlayer = player || this.player || ({} as PlayerState);
    const arsenal = getWeaponArsenalSummary(metaSave);

    if (!this.unlockList && typeof document !== 'undefined') {
      this.unlockList = document.getElementById('unlock-list');
    }
    if (!this.overlay && typeof document !== 'undefined') {
      this.overlay = document.getElementById('garage-overlay');
    }

    if (this.unlockList) {
      this.unlockList.setAttribute('data-arsenal-unlocked-count', `${arsenal.unlockedCount}`);
      this.unlockList.setAttribute('data-arsenal-total-kills', `${arsenal.totalKills}`);
      this.unlockList.setAttribute('data-arsenal-signature-weapon', `${arsenal.topWeaponId}`);
      this.unlockList.setAttribute('data-arsenal-summary', `${arsenal.summaryLine}`);
    }

    if (this.overlayEl) {
      this.overlayEl.setAttribute('data-arsenal-unlocked-count', `${arsenal.unlockedCount}`);
      this.overlayEl.setAttribute('data-arsenal-total-kills', `${arsenal.totalKills}`);
      this.overlayEl.setAttribute('data-arsenal-signature-weapon', `${arsenal.topWeaponId}`);
      this.overlayEl.setAttribute('data-arsenal-summary', `${arsenal.summaryLine}`);
    }

    if (!this.unlockList) return;
    this.unlockList.innerHTML = '';

    UNLOCKABLE_IDS.forEach(id => {
      const w = WEAPONS[id];
      const isUnlocked = !!metaSave.unlocked?.[id];
      const isEquipped = curPlayer.weapon === id;
      const canAfford = metaSave.scrap >= w.cost;
      const rawKills = (metaSave as any).weaponKills?.[id] ?? 0;
      const mastery = getWeaponMasteryTier(rawKills);

      const row = document.createElement('div');
      const state = isEquipped ? 'is-equipped' : isUnlocked ? 'is-unlocked' : 'is-locked';
      row.className = `unlock-item gx-weapon ${state}`;
      row.setAttribute('data-mastery-tier', String(mastery.tier));
      row.style.setProperty('--wc', w.color);
      row.innerHTML = `
        <div class="gx-weapon-art">${WEAPON_HI_FI_SVG[id]}<span class="gx-weapon-status">${isUnlocked ? CHECK_SVG : LOCK_SVG}</span></div>
        <div class="info">
          <strong><span class="gx-key">${esc(w.key)}</span>${esc(w.name.toUpperCase())}</strong>
          <span>${esc(w.desc)}</span>
          <span class="gx-weapon-mastery tier-${mastery.tier}">${mastery.stars} ${mastery.label}${mastery.dmgBonusPct > 0 ? ` (+${mastery.dmgBonusPct}% DMG)` : ''} · ${mastery.kills} KILLS</span>
        </div>
      `;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn';

      if (isUnlocked) {
        btn.textContent = isEquipped ? 'Equipped' : 'Equip';
        btn.disabled = isEquipped;
        btn.onclick = () => {
          this.callbacks.onEquipWeapon(id);
        };
      } else {
        btn.classList.add('gx-price');
        btn.innerHTML = `<span class="gx-price-label">Unlock</span>${GEAR_SVG}<span class="gx-price-val">${w.cost}</span>`;
        btn.setAttribute('aria-label', `Unlock ${w.name} for ${w.cost} scrap`);
        btn.disabled = !canAfford;
        if (!canAfford) btn.title = `Need ${w.cost - metaSave.scrap} more scrap`;
        btn.onclick = () => {
          this.callbacks.onUnlockWeapon(id);
        };
      }

      row.appendChild(btn);
      this.unlockList!.appendChild(row);
    });
  }

  /**
   * Renders the permanent bike tuning meta upgrades.
   */
  public renderMetaUpgrades(metaSave: MetaSaveState): void {
    if (!this.metaUpgradeList && typeof document !== 'undefined') {
      this.metaUpgradeList = document.getElementById('meta-upgrade-list');
    }
    if (!this.overlay && typeof document !== 'undefined') {
      this.overlay = document.getElementById('garage-overlay');
    }

    const baseTuning = getMetaTuningSummary(metaSave);
    const canAffordCheapest = baseTuning.cheapestNextCost !== null &&
      typeof metaSave?.scrap === 'number' &&
      metaSave.scrap >= baseTuning.cheapestNextCost;
    const tuning = {
      ...baseTuning,
      canAffordCheapest
    };

    if (this.metaUpgradeList) {
      this.metaUpgradeList.setAttribute('data-tuning-total-ranks', String(tuning.totalRanks));
      this.metaUpgradeList.setAttribute('data-tuning-completion-pct', String(tuning.completionPct));
      this.metaUpgradeList.setAttribute('data-tuning-next-upgrade', tuning.cheapestNextUpgradeId || 'MAXED');
      this.metaUpgradeList.setAttribute('data-tuning-can-afford-next', tuning.canAffordCheapest ? 'true' : 'false');
      this.metaUpgradeList.setAttribute('data-tuning-summary', tuning.summaryLine);
    }

    if (this.overlayEl) {
      this.overlayEl.setAttribute('data-tuning-total-ranks', String(tuning.totalRanks));
      this.overlayEl.setAttribute('data-tuning-completion-pct', String(tuning.completionPct));
      this.overlayEl.setAttribute('data-tuning-next-upgrade', tuning.cheapestNextUpgradeId || 'MAXED');
      this.overlayEl.setAttribute('data-tuning-can-afford-next', tuning.canAffordCheapest ? 'true' : 'false');
      this.overlayEl.setAttribute('data-tuning-summary', tuning.summaryLine);
    }

    if (!this.metaUpgradeList) return;
    this.metaUpgradeList.innerHTML = '';

    Object.values(META_UPGRADES).forEach(up => {
      const rank = metaSave.ranks[up.id] || 0;
      const isMax = rank >= up.maxRank;
      const cost = calcUpgradeCost(up, rank);

      let pips = '';
      for (let i = 0; i < up.maxRank; i++) {
        pips += `<i class="gx-pip${i < rank ? ' on' : ''}"></i>`;
      }

      const row = document.createElement('div');
      row.className = `unlock-item gx-upgrade${isMax ? ' is-max' : ''}`;
      row.innerHTML = `
        <div class="info">
          <strong>${esc(up.statLabel ? up.statLabel.toUpperCase() : up.name)}</strong>
          <div class="gx-rank" role="img" aria-label="Rank ${rank} of ${up.maxRank}">
            <span class="gx-pips">${pips}</span>
            <span class="gx-rank-txt">RANK PIPS ${rank}</span>
          </div>
          <span>${esc(up.desc)}</span>
        </div>
      `;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn gx-upgrade-btn';

      if (isMax) {
        btn.textContent = 'MAXED';
        btn.disabled = true;
      } else {
        btn.innerHTML = `<span class="gx-price-label">UPGRADE</span><span class="gx-cost">${GEAR_SVG}${cost}</span>`;
        btn.setAttribute('aria-label', `Upgrade ${up.name} for ${cost} scrap`);
        btn.disabled = metaSave.scrap < cost;
        if (btn.disabled) btn.title = `Need ${cost - metaSave.scrap} more scrap`;
        btn.onclick = () => {
          this.callbacks.onBuyUpgrade(up.id);
        };
      }

      row.appendChild(btn);
      this.metaUpgradeList!.appendChild(row);
    });
  }

  /**
   * Draws the interactive motorcycle preview on the bike lift canvas.
   * The backing store is sized to the canvas's CSS box (garage.css stretches it
   * to fill the bay), so the illustration stays crisp and undistorted.
   */
  public drawBikeLift(metaSave: MetaSaveState): void {
    this.lastMetaSave = metaSave;
    const bikeVisuals = getEquippedBikeVisualState(metaSave);
    this.overlayEl?.setAttribute('data-equipped-visual-count', String(bikeVisuals.equippedCount));
    this.overlayEl?.setAttribute('data-equipped-visual-slots', bikeVisuals.equippedSlots.join(','));
    this.overlayEl?.setAttribute('data-equipped-model-codes', bikeVisuals.modelCodes.join(','));
    this.overlayEl?.setAttribute('data-equipped-visual-summary', bikeVisuals.summaryLine);

    const livSummary = getLiveryCollectionSummary(metaSave);
    this.overlayEl?.setAttribute('data-active-livery-id', livSummary.activeLiveryId);
    this.overlayEl?.setAttribute('data-active-livery-name', livSummary.activeLiveryName);
    this.overlayEl?.setAttribute('data-livery-summary', livSummary.summaryLine);

    if (!this.bikeCanvas && typeof document !== 'undefined') {
      this.bikeCanvas = document.getElementById('bike-canvas') as HTMLCanvasElement | null;
    }
    if (this.bikeCanvas) {
      this.bikeCanvas.setAttribute('data-equipped-visual-count', String(bikeVisuals.equippedCount));
      this.bikeCanvas.setAttribute('data-equipped-visual-slots', bikeVisuals.equippedSlots.join(','));
      this.bikeCanvas.setAttribute('data-equipped-model-codes', bikeVisuals.modelCodes.join(','));
      this.bikeCanvas.setAttribute('data-equipped-visual-summary', bikeVisuals.summaryLine);

      this.bikeCanvas.setAttribute('data-active-livery-id', livSummary.activeLiveryId);
      this.bikeCanvas.setAttribute('data-active-livery-name', livSummary.activeLiveryName);
      this.bikeCanvas.setAttribute('data-livery-summary', livSummary.summaryLine);
    }

    if (!this.bikeCanvas || !this.bikeCtx) return;
    const c = this.bikeCanvas;
    const g = this.bikeCtx;

    const rect = c.getBoundingClientRect();
    if (rect.width < 2 || rect.height < 2) return; // Hidden overlay: nothing to draw
    const W = rect.width;
    const H = rect.height;
    const dpr = Math.min(3, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const bw = Math.round(W * dpr);
    const bh = Math.round(H * dpr);
    if (c.width !== bw) c.width = bw;
    if (c.height !== bh) c.height = bh;

    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);

    // Uniform fit of the logical illustration inside the canvas box
    const s = Math.min(W / BIKE_W, H / BIKE_H);
    const ox = (W - BIKE_W * s) / 2;
    const oy = (H - BIKE_H * s) / 2;
    const toScreen = (x: number, y: number): [number, number] => [ox + x * s, oy + y * s];

    const equipped = (slot: EquipSlot): EquipmentItem | null => metaSave.equipped[slot] || null;
    const colorOf = (slot: EquipSlot): string => {
      const it = equipped(slot);
      return it ? RARITY[it.rarity].color : EMPTY_PART_COLOR[slot];
    };
    const glow = (slot: EquipSlot) => {
      const it = equipped(slot);
      g.shadowColor = it ? RARITY[it.rarity].color : 'transparent';
      g.shadowBlur = it && it.rarity >= 1 ? 6 + it.rarity * 5 : 0;
    };
    const noGlow = () => {
      g.shadowColor = 'transparent';
      g.shadowBlur = 0;
    };

    // 0. Speed-line burst behind the bike (screen space)
    const [bcx, bcy] = toScreen(220, 150);
    const reach = Math.hypot(W, H);
    g.save();
    g.fillStyle = 'rgba(40, 28, 20, 0.16)';
    const rays = 44;
    for (let i = 0; i < rays; i++) {
      const a0 = (i / rays) * Math.PI * 2;
      const a1 = a0 + (Math.PI * 2) / rays * (0.25 + 0.3 * ((i * 7) % 3) / 2);
      g.beginPath();
      g.moveTo(bcx + Math.cos(a0) * 40 * s, bcy + Math.sin(a0) * 40 * s);
      g.lineTo(bcx + Math.cos(a0) * reach, bcy + Math.sin(a0) * reach);
      g.lineTo(bcx + Math.cos(a1) * reach, bcy + Math.sin(a1) * reach);
      g.closePath();
      g.fill();
    }
    g.restore();

    // 1. Connector lines from the slot frames to each part (aligned to live DOM slot centers)
    const drawConnector = (slot: EquipSlot, side: 'left' | 'right', idx: number) => {
      const colEl = side === 'left' ? this.slotsLeft : this.slotsRight;
      const slotEl = colEl?.querySelectorAll('.eq-slot')[idx] as HTMLElement | undefined;
      let sy = (H * (idx * 2 + 1)) / 6;
      if (slotEl) {
        const sr = slotEl.getBoundingClientRect();
        if (sr.height > 2) {
          sy = sr.top + sr.height / 2 - rect.top;
        }
      }
      const sx = side === 'left' ? 0 : W;
      const [ax, ay] = toScreen(PART_ANCHORS[slot][0], PART_ANCHORS[slot][1]);
      const kneeX = side === 'left' ? Math.min(ax - 18, sx + 34) : Math.max(ax + 18, sx - 34);
      const it = equipped(slot);
      const spec = it ? getEquipmentVisualSpec(it, slot) : null;
      const lineCol = spec ? spec.primaryColor : 'rgba(255, 214, 10, 0.55)';
      g.save();
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(sx, sy);
      g.lineTo(kneeX, sy);
      g.lineTo(ax, ay);
      g.strokeStyle = INK;
      g.lineWidth = it ? 5.5 : 4;
      g.stroke();
      if (spec) {
        g.shadowColor = spec.glowColor;
        g.shadowBlur = 8;
      }
      g.strokeStyle = lineCol;
      g.lineWidth = it ? 2.6 : 1.8;
      g.stroke();
      g.shadowBlur = 0;

      // Target reticle node on the motorcycle component
      g.beginPath();
      g.arc(ax, ay, it ? 6 : 4, 0, Math.PI * 2);
      g.fillStyle = spec ? spec.primaryColor : '#ffd60a';
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 2;
      g.stroke();

      if (spec) {
        g.beginPath();
        g.arc(ax, ay, 10, 0, Math.PI * 2);
        g.strokeStyle = spec.accentColor;
        g.lineWidth = 1.4;
        g.setLineDash([4, 3]);
        g.stroke();
        g.setLineDash([]);
      }
      g.restore();
    };

    // Logical-space illustration
    g.save();
    g.translate(ox, oy);
    g.scale(s, s);
    g.lineCap = 'round';
    g.lineJoin = 'round';

    const poly = (pts: readonly (readonly [number, number])[]) => {
      g.beginPath();
      pts.forEach(([x, y], i) => (i === 0 ? g.moveTo(x, y) : g.lineTo(x, y)));
      g.closePath();
    };
    const inkFill = (fill: string, lw: number = 3.5) => {
      g.fillStyle = fill;
      g.fill();
      noGlow();
      g.strokeStyle = INK;
      g.lineWidth = lw;
      g.stroke();
    };
    const inkLine = (color: string, width: number) => {
      g.strokeStyle = INK;
      g.lineWidth = width + 4;
      g.stroke();
      noGlow();
      g.strokeStyle = color;
      g.lineWidth = width;
      g.stroke();
    };

    // 2. Scissor lift (legs, base, platform with caution stripes)
    g.beginPath();
    g.moveTo(122, 246);
    g.lineTo(298, 286);
    g.moveTo(298, 246);
    g.lineTo(122, 286);
    inkLine('#6c7787', 6);
    poly([[104, 284], [316, 284], [316, 292], [104, 292]]);
    inkFill('#56606e', 3);
    [[114, 296], [306, 296]].forEach(([x, y]) => {
      g.beginPath();
      g.arc(x, y, 5, 0, Math.PI * 2);
      inkFill('#22252c', 2.5);
    });
    poly([[86, 236], [334, 236], [334, 249], [86, 249]]);
    inkFill('#8893a3', 3);
    g.save();
    poly([[88, 243], [332, 243], [332, 248], [88, 248]]);
    g.clip();
    g.fillStyle = '#ffd60a';
    for (let x = 80; x < 340; x += 18) {
      g.beginPath();
      g.moveTo(x, 248);
      g.lineTo(x + 9, 248);
      g.lineTo(x + 14, 243);
      g.lineTo(x + 5, 243);
      g.closePath();
      g.fill();
    }
    g.restore();

    // 2.5 Set 08 High-Res Spider-Verse Halftone Comic Pop-Art Motorcycle Sprite + Dynamic Equipped Part Models
    if (this.set08BikeLoaded && this.set08BikeImg && this.set08BikeImg.naturalWidth > 0) {
      g.restore();

      const activeLivery =
        BIKE_LIVERIES.find(l => l.id === metaSave.livery) || BIKE_LIVERIES[0];

      g.save();
      g.translate(ox, oy);
      g.scale(s, s);
      // Ben-Day Halftone Dot Matrix Halo behind the Set 08 Bike (tinted by active livery)
      for (let hx = 85; hx <= 325; hx += 10) {
        for (let hy = 25; hy <= 220; hy += 10) {
          const dist = Math.hypot(hx - 205, (hy - 125) * 1.2);
          if (dist < 115) {
            const dotR = Math.max(0.8, (1 - dist / 115) * 2.4);
            g.beginPath();
            g.arc(hx, hy, dotR, 0, Math.PI * 2);
            g.fillStyle = (hx + hy) % 20 === 0 ? activeLivery.accent : activeLivery.primary;
            g.globalAlpha = 0.26;
            g.fill();
          }
        }
      }
      g.globalAlpha = 1;
      // Chromatic Livery Rim-Light Aura beneath the Set 08 Bike seated on the lift
      g.shadowColor = activeLivery.primary;
      g.shadowBlur = 22;
      g.drawImage(this.set08BikeImg, 36, -32, 328, 308);
      g.shadowBlur = 0;

      // Render high-resolution equipped part models directly onto the large motorcycle!
      this.drawEquippedBikeModels(g, metaSave);
      g.restore();

      // Draw slot connectors & target reticles on top so lines visibly land on each mounted model
      LEFT_SLOTS.forEach((slot, i) => drawConnector(slot, 'left', i));
      RIGHT_SLOTS.forEach((slot, i) => drawConnector(slot, 'right', i));

      // Draw on-bike model callout badges in logical space above the connector reticles
      g.save();
      g.translate(ox, oy);
      g.scale(s, s);
      this.drawEquippedCalloutBadges(g, metaSave);
      g.restore();
      return;
    }

    // 3. Wheels & tires (Procedural fallback when image hasn't loaded yet)
    const tireAccent = colorOf('tires');
    const drawWheel = (wx: number, wy: number, front: boolean) => {
      g.save();
      glow('tires');
      g.beginPath();
      g.arc(wx, wy, 40, 0, Math.PI * 2);
      g.fillStyle = '#141318';
      g.fill();
      noGlow();
      g.strokeStyle = INK;
      g.lineWidth = 3.5;
      g.stroke();
      // Sidewall stripe (rarity accent when tires installed)
      g.beginPath();
      g.arc(wx, wy, 33, 0, Math.PI * 2);
      g.strokeStyle = equipped('tires') ? tireAccent : '#3a3844';
      g.lineWidth = 3;
      g.stroke();
      // Rim
      g.beginPath();
      g.arc(wx, wy, 28, 0, Math.PI * 2);
      g.fillStyle = '#26242c';
      g.fill();
      if (front) {
        g.beginPath();
        g.arc(wx, wy, 17, 0, Math.PI * 2);
        g.strokeStyle = '#b8bec9';
        g.lineWidth = 4;
        g.stroke();
      }
      for (let k = 0; k < 5; k++) {
        const a = (k * Math.PI * 2) / 5 - Math.PI / 2;
        g.beginPath();
        g.moveTo(wx + Math.cos(a) * 6, wy + Math.sin(a) * 6);
        g.lineTo(wx + Math.cos(a) * 27, wy + Math.sin(a) * 27);
        g.strokeStyle = INK;
        g.lineWidth = 7;
        g.stroke();
        g.strokeStyle = tireAccent;
        g.lineWidth = 4;
        g.stroke();
      }
      g.beginPath();
      g.arc(wx, wy, 28, 0, Math.PI * 2);
      g.strokeStyle = tireAccent;
      g.lineWidth = 3;
      g.stroke();
      g.beginPath();
      g.arc(wx, wy, 6, 0, Math.PI * 2);
      inkFill('#c9ced8', 2.5);
      g.restore();
    };
    drawWheel(128, 196, false);
    drawWheel(300, 196, true);

    // 4. Swingarm / trellis frame
    g.save();
    glow('frame');
    poly([[124, 190], [128, 203], [204, 190], [202, 174]]);
    inkFill(colorOf('frame'));
    g.beginPath();
    g.moveTo(200, 176);
    g.lineTo(226, 136);
    g.lineTo(292, 118);
    inkLine(colorOf('frame'), 5);
    g.restore();

    // 5. Exhaust (header pipe + side can)
    g.save();
    glow('exhaust');
    g.beginPath();
    g.moveTo(236, 206);
    g.quadraticCurveTo(200, 222, 156, 196);
    inkLine(colorOf('exhaust'), 6);
    glow('exhaust');
    poly([[160, 186], [104, 164], [96, 182], [152, 204]]);
    inkFill(colorOf('exhaust'));
    g.beginPath();
    g.ellipse(100, 173, 5, 9, 0.38, 0, Math.PI * 2);
    inkFill('#26242c', 2.5);
    g.beginPath();
    g.moveTo(150, 190);
    g.lineTo(112, 175);
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    g.lineWidth = 2;
    g.stroke();
    g.restore();

    // 6. Engine block
    g.save();
    glow('engine');
    poly([[182, 160], [246, 156], [256, 196], [236, 214], [194, 210], [178, 186]]);
    inkFill(colorOf('engine'));
    g.strokeStyle = 'rgba(10, 11, 16, 0.75)';
    g.lineWidth = 2.5;
    for (let f = 0; f < 4; f++) {
      g.beginPath();
      g.moveTo(188, 168 + f * 9);
      g.lineTo(244, 166 + f * 9);
      g.stroke();
    }
    g.beginPath();
    g.arc(214, 198, 8, 0, Math.PI * 2);
    inkFill('#c9ced8', 2.5);
    g.restore();

    // 7. Front fork (gold USD forks)
    g.beginPath();
    g.moveTo(300, 196);
    g.lineTo(318, 108);
    inkLine('#ffb627', 7);

    // 8. Tail section + seat (uses active livery colors)
    const activeLivery = BIKE_LIVERIES.find(l => l.id === (metaSave.livery || 'crimson_kaneda')) || BIKE_LIVERIES[0];
    poly([[94, 116], [150, 122], [200, 126], [204, 150], [166, 158], [128, 150], [108, 134]]);
    inkFill(activeLivery.primary);
    poly([[128, 150], [166, 158], [204, 150], [204, 142], [150, 146], [112, 136]]);
    g.fillStyle = activeLivery.secondary;
    g.fill();
    poly([[146, 120], [206, 122], [216, 132], [150, 130]]);
    inkFill('#1d1b22', 3);

    // 9. Main fairing (cel shaded) — uses active livery primary/secondary colors
    poly([[214, 128], [252, 110], [300, 104], [334, 116], [356, 134], [344, 150], [314, 160], [290, 188], [262, 198], [244, 172], [222, 150]]);
    inkFill(activeLivery.primary);
    poly([[244, 172], [262, 198], [290, 188], [314, 160], [344, 150], [304, 162], [270, 176]]);
    g.fillStyle = activeLivery.secondary;
    g.fill();
    poly([[262, 150], [300, 140], [292, 152], [258, 162]]);
    g.fillStyle = INK;
    g.fill();
    g.beginPath();
    g.moveTo(258, 118);
    g.lineTo(330, 122);
    g.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    g.lineWidth = 3;
    g.stroke();
    // re-ink the fairing outline over the shading
    poly([[214, 128], [252, 110], [300, 104], [334, 116], [356, 134], [344, 150], [314, 160], [290, 188], [262, 198], [244, 172], [222, 150]]);
    g.strokeStyle = INK;
    g.lineWidth = 3.5;
    g.stroke();

    // 10. Fuel tank
    g.save();
    glow('tank');
    g.beginPath();
    g.moveTo(204, 124);
    g.quadraticCurveTo(226, 98, 262, 102);
    g.lineTo(270, 114);
    g.lineTo(252, 138);
    g.lineTo(210, 140);
    g.closePath();
    inkFill(equipped('tank') ? colorOf('tank') : activeLivery.primary);
    g.beginPath();
    g.moveTo(218, 116);
    g.quadraticCurveTo(234, 106, 254, 107);
    g.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    g.lineWidth = 3;
    g.stroke();
    g.restore();

    // 11. Windscreen + headlight
    poly([[300, 104], [318, 84], [340, 112], [334, 116]]);
    inkFill('rgba(46, 230, 255, 0.55)', 3);
    poly([[340, 128], [356, 134], [348, 142]]);
    inkFill('#ffd60a', 2.5);

    // 12. Clip-on handlebars
    g.save();
    glow('handlebars');
    g.beginPath();
    g.moveTo(318, 106);
    g.lineTo(298, 92);
    inkLine(colorOf('handlebars'), 5);
    g.beginPath();
    g.arc(296, 91, 4, 0, Math.PI * 2);
    inkFill(colorOf('handlebars'), 2.5);
    g.restore();

    // 13. Cel-shaded anime racer leaning against the bike (matches concept art)
    g.save();
    // Helmet
    g.beginPath();
    g.arc(282, 88, 15, 0, Math.PI * 2);
    inkFill('#ff6b2b', 3.5);
    // Helmet Visor
    poly([[273, 82], [295, 82], [293, 94], [275, 94]]);
    inkFill('#0a0b10', 2);
    g.beginPath();
    g.moveTo(277, 85);
    g.lineTo(291, 85);
    g.strokeStyle = '#2ee6ff';
    g.lineWidth = 1.5;
    g.stroke();

    // Collar
    poly([[275, 102], [289, 102], [291, 108], [273, 108]]);
    inkFill('#1d1b22', 2.5);

    // Torso / Jacket
    poly([[267, 108], [297, 108], [302, 142], [262, 142]]);
    inkFill('#ff6b2b', 3.5);
    // Shoulder armor pads
    poly([[265, 108], [275, 108], [273, 120], [263, 118]]);
    inkFill('#1d1b22', 2);
    poly([[289, 108], [299, 108], [301, 118], [291, 120]]);
    inkFill('#1d1b22', 2);
    // Crossed arms
    poly([[265, 118], [299, 118], [295, 136], [269, 136]]);
    inkFill('#ff6b2b', 3);
    poly([[273, 124], [291, 124], [289, 135], [275, 135]]);
    inkFill('#1d1b22', 2);

    // Belt
    poly([[263, 142], [301, 142], [301, 147], [263, 147]]);
    inkFill('#1d1b22', 2.5);

    // Left leg
    poly([[279, 147], [297, 147], [295, 215], [281, 215]]);
    inkFill('#ff6b2b', 3.5);
    // Left boot
    poly([[279, 215], [297, 215], [303, 238], [277, 238]]);
    inkFill('#1d1b22', 3);

    // Right leg (bent knee resting on bike footpeg)
    poly([[265, 147], [279, 147], [267, 185], [253, 180]]);
    inkFill('#e05318', 3);
    poly([[253, 180], [267, 185], [271, 210], [259, 210]]);
    inkFill('#ff6b2b', 3);
    poly([[259, 210], [271, 210], [273, 226], [257, 226]]);
    inkFill('#1d1b22', 3);
    g.restore();

    // Render high-resolution equipped models over procedural fallback too
    this.drawEquippedBikeModels(g, metaSave);

    g.restore();

    // Connectors drawn last so they read above the burst and bike edges
    LEFT_SLOTS.forEach((slot, i) => drawConnector(slot, 'left', i));
    RIGHT_SLOTS.forEach((slot, i) => drawConnector(slot, 'right', i));

    g.save();
    g.translate(ox, oy);
    g.scale(s, s);
    this.drawEquippedCalloutBadges(g, metaSave);
    g.restore();
  }

  /**
   * Renders bespoke, high-resolution 3D comic equipment models and mechanical
   * sub-assemblies directly onto the Large Motorcycle Model (`#bike-canvas` in 400x300 logical space).
   */
  private drawEquippedBikeModels(g: CanvasRenderingContext2D, metaSave: MetaSaveState): void {
    const eq = metaSave.equipped || {};

    const drawPartImg = (
      slot: EquipSlot,
      cx: number,
      cy: number,
      w: number,
      h: number,
      rotRad: number,
      glowCol: string,
      rarity: number
    ) => {
      const img = this.set08EquipImgs[slot];
      if (!img || !this.set08EquipLoaded[slot] || img.naturalWidth <= 0) return;
      g.save();
      g.translate(cx, cy);
      if (rotRad !== 0) g.rotate(rotRad);
      g.shadowColor = glowCol;
      g.shadowBlur = 10 + rarity * 4;
      g.drawImage(img, -w / 2, -h / 2, w, h);
      g.restore();
    };

    // 1. TIRES (Transforms BOTH Rear Wheel [120, 142] and Front Wheel [298, 196] in isometric 3D perspective)
    if (eq.tires) {
      const spec = getEquipmentVisualSpec(eq.tires, 'tires');
      const wheels: readonly { cx: number; cy: number; rx: number; ry: number; rot: number }[] = [
        { cx: 120, cy: 142, rx: 22, ry: 30, rot: -0.36 },
        { cx: 298, cy: 196, rx: 25, ry: 34, rot: -0.36 }
      ];

      wheels.forEach(({ cx, cy, rx, ry, rot }) => {
        g.save();
        g.translate(cx, cy);
        g.rotate(rot);

        // Clip and composite high-res Set 08 Tire & Rim inside the isometric wheel hub
        const tireImg = this.set08EquipImgs.tires;
        if (tireImg && this.set08EquipLoaded.tires && tireImg.naturalWidth > 0) {
          g.save();
          g.beginPath();
          g.ellipse(0, 0, rx * 0.92, ry * 0.92, 0, 0, Math.PI * 2);
          g.clip();
          g.globalAlpha = 0.88;
          g.drawImage(tireImg, -rx * 1.1, -ry * 1.1, rx * 2.2, ry * 2.2);
          g.restore();
        }

        // Glowing compound sidewall rim-lip ring
        g.shadowColor = spec.glowColor;
        g.shadowBlur = 10 + spec.rarity * 4;
        g.beginPath();
        g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
        g.strokeStyle = INK;
        g.lineWidth = 5;
        g.stroke();
        g.strokeStyle = spec.primaryColor;
        g.lineWidth = 2.6 + spec.rarity * 0.4;
        g.stroke();

        // Vented ceramic brake rotor ring
        g.beginPath();
        g.ellipse(0, 0, rx * 0.62, ry * 0.62, 0, 0, Math.PI * 2);
        g.strokeStyle = spec.accentColor;
        g.lineWidth = 2;
        g.setLineDash([4, 3]);
        g.stroke();
        g.setLineDash([]);

        // Twin-piston racing brake caliper
        g.beginPath();
        g.roundRect(-rx * 0.82, -8, 9, 15, 3);
        g.fillStyle = spec.secondaryColor;
        g.fill();
        g.strokeStyle = INK;
        g.lineWidth = 2;
        g.stroke();

        // Center axle lock-nut
        g.beginPath();
        g.arc(0, 0, 4.5, 0, Math.PI * 2);
        g.fillStyle = spec.accentColor;
        g.fill();
        g.strokeStyle = INK;
        g.lineWidth = 2;
        g.stroke();
        g.restore();
      });

      // Comic speed-sparks hugging the tire contact patch on the lift deck
      if (spec.rarity >= 2) {
        g.save();
        g.shadowColor = spec.glowColor;
        g.shadowBlur = 8;
        [
          [98, 174, 72, 166],
          [272, 232, 240, 226]
        ].forEach(([x0, y0, x1, y1]) => {
          g.beginPath();
          g.moveTo(x0, y0);
          g.lineTo(x1, y1);
          g.lineTo(x0 - 12, y0 - 8);
          g.closePath();
          g.fillStyle = spec.accentColor;
          g.fill();
          g.strokeStyle = INK;
          g.lineWidth = 1.8;
          g.stroke();
        });
        g.restore();
      }
    }

    // 2. FRAME (Reinforced Trellis Exoskeleton Chassis [154..258, 98..156])
    if (eq.frame) {
      const spec = getEquipmentVisualSpec(eq.frame, 'frame');
      g.save();
      g.shadowColor = spec.glowColor;
      g.shadowBlur = 10 + spec.rarity * 3;

      const struts: readonly [number, number, number, number][] = [
        [256, 106, 218, 126],
        [218, 126, 184, 154],
        [256, 106, 232, 146],
        [232, 146, 184, 154],
        [218, 126, 154, 98],
        [184, 154, 154, 98],
        [218, 126, 232, 146]
      ];
      struts.forEach(([x1, y1, x2, y2]) => {
        g.beginPath();
        g.moveTo(x1, y1);
        g.lineTo(x2, y2);
        g.strokeStyle = INK;
        g.lineWidth = 6.5;
        g.stroke();
        g.strokeStyle = spec.primaryColor;
        g.lineWidth = 3.2;
        g.stroke();
      });

      // Hexagonal reactive shield emitter nodes at frame joints
      const joints: readonly [number, number][] = [
        [256, 106],
        [218, 126],
        [184, 154],
        [232, 146]
      ];
      joints.forEach(([jx, jy]) => {
        g.beginPath();
        g.arc(jx, jy, 4 + spec.rarity * 0.6, 0, Math.PI * 2);
        g.fillStyle = spec.accentColor;
        g.fill();
        g.strokeStyle = INK;
        g.lineWidth = 1.8;
        g.stroke();
      });
      g.restore();
    }

    // 3. EXHAUST (Twin Afterburner Megaphone Cannons along [160, 148] -> [108, 86])
    if (eq.exhaust) {
      const spec = getEquipmentVisualSpec(eq.exhaust, 'exhaust');
      g.save();
      // Multi-stage roaring afterburner jet plumes shooting from tailpipes
      const plumeLen = 34 + spec.rarity * 12;
      g.shadowColor = spec.glowColor;
      g.shadowBlur = 14 + spec.rarity * 4;

      [
        [104, 82],
        [96, 96]
      ].forEach(([px, py]) => {
        g.beginPath();
        g.moveTo(px, py);
        g.lineTo(px - plumeLen, py - plumeLen * 0.72);
        g.lineTo(px - plumeLen * 0.58, py - plumeLen * 0.32);
        g.lineTo(px - plumeLen * 1.1, py - plumeLen * 0.45);
        g.lineTo(px - 8, py + 6);
        g.closePath();
        g.fillStyle = spec.primaryColor;
        g.fill();
        g.strokeStyle = INK;
        g.lineWidth = 2;
        g.stroke();

        // Inner white-gold plasma shock cone
        g.beginPath();
        g.moveTo(px - 2, py - 2);
        g.lineTo(px - plumeLen * 0.6, py - plumeLen * 0.42);
        g.lineTo(px - 6, py + 3);
        g.closePath();
        g.fillStyle = spec.accentColor;
        g.fill();
      });
      g.restore();

      // Mount high-res Set 08 Twin Megaphone Exhaust model aligned with the bike's tailpipes
      drawPartImg('exhaust', 132, 112, 56, 56, -0.78, spec.glowColor, spec.rarity);
    }

    // 4. ENGINE (Supercharged V-Twin Powerplant Core [198, 160])
    if (eq.engine) {
      const spec = getEquipmentVisualSpec(eq.engine, 'engine');
      g.save();
      g.shadowColor = spec.glowColor;
      g.shadowBlur = 12 + spec.rarity * 4;

      // Glowing reactor cradle & chrome manifold header bezel
      g.beginPath();
      g.arc(198, 160, 22, 0, Math.PI * 2);
      g.fillStyle = 'rgba(10, 11, 16, 0.75)';
      g.fill();
      g.strokeStyle = spec.primaryColor;
      g.lineWidth = 2.6;
      g.stroke();

      // Mount high-res Set 08 V-Twin Engine Block model
      drawPartImg('engine', 198, 158, 50, 50, 0, spec.glowColor, spec.rarity);

      // NOS bottle & blower accents for Rare/Legendary engines
      if (spec.rarity >= 2) {
        g.beginPath();
        g.roundRect(170, 146, 10, 22, 4);
        g.fillStyle = spec.secondaryColor;
        g.fill();
        g.strokeStyle = INK;
        g.lineWidth = 2;
        g.stroke();
      }
      g.restore();
    }

    // 5. FUEL TANK (Sculpted Cryo / Blood-Siphon Fuel Cell [230, 82])
    if (eq.tank) {
      const spec = getEquipmentVisualSpec(eq.tank, 'tank');
      g.save();
      // Pressurized siphon conduit line from Tank down to V-Twin Engine / Lower Fairing
      g.beginPath();
      g.moveTo(228, 90);
      g.quadraticCurveTo(236, 124, 238, 152);
      g.strokeStyle = INK;
      g.lineWidth = 5;
      g.stroke();
      g.strokeStyle = spec.secondaryColor;
      g.lineWidth = 2.4;
      g.setLineDash([4, 3]);
      g.stroke();
      g.setLineDash([]);
      g.restore();

      // Mount high-res Set 08 Sculpted Fuel Tank model contoured to the upper tank dome
      drawPartImg('tank', 230, 82, 48, 38, -0.22, spec.glowColor, spec.rarity);
    }

    // 6. HANDLEBARS (Cyber-Cockpit, Clip-On Yoke & Holo-Targeting Visor [262, 82])
    if (eq.handlebars) {
      const spec = getEquipmentVisualSpec(eq.handlebars, 'handlebars');
      // Mount high-res Set 08 Cyber-Handlebars & Tachometer model at the cockpit
      drawPartImg('handlebars', 260, 84, 42, 42, 0.12, spec.glowColor, spec.rarity);

      // Projected Holographic HUD Targeting Visor & Forward Laser Sights
      g.save();
      g.shadowColor = spec.glowColor;
      g.shadowBlur = 10 + spec.rarity * 3;
      g.beginPath();
      g.arc(286, 70, 12 + spec.rarity * 1.2, -Math.PI * 0.65, Math.PI * 0.65);
      g.strokeStyle = spec.secondaryColor;
      g.lineWidth = 2.2;
      g.stroke();

      if (spec.rarity >= 2) {
        g.beginPath();
        g.moveTo(312, 118);
        g.lineTo(378, 132);
        g.moveTo(298, 124);
        g.lineTo(370, 142);
        g.strokeStyle = spec.accentColor;
        g.lineWidth = 1.8;
        g.setLineDash([6, 4]);
        g.stroke();
        g.setLineDash([]);
      }
      g.restore();
    }
  }

  /**
   * Renders a clean blueprint telemetry plate on the lower hydraulic lift base
   * showing the count of active custom 3D equipment models without obscuring the bike.
   */
  private drawEquippedCalloutBadges(g: CanvasRenderingContext2D, metaSave: MetaSaveState): void {
    const visualState = getEquippedBikeVisualState(metaSave);
    if (visualState.equippedCount === 0) return;

    g.save();
    const bannerText = `★ CUSTOM CHASSIS MODELS MOUNTED: ${visualState.equippedCount}/6`;
    g.font = "900 10px Impact, 'Arial Black', sans-serif";
    const tw = Math.max(196, g.measureText(bannerText).width + 24);
    const bx = (BIKE_W - tw) / 2 + 10;
    const by = 262;
    g.fillStyle = 'rgba(10, 11, 16, 0.92)';
    g.strokeStyle = '#00f5d4';
    g.lineWidth = 1.8;
    g.beginPath();
    g.roundRect(bx, by, tw, 17, 4);
    g.fill();
    g.stroke();
    g.fillStyle = '#00f5d4';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(bannerText, bx + tw / 2, by + 9);
    g.restore();
  }
}
