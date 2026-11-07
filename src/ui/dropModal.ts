/**
 * MOTO-ROGUE: Item Drop Selection Modal Controller
 *
 * Displays a 3-choice upgrade modal when opening toolbox crates or elite drops,
 * reflecting stack upgrades, weapon evolution readiness, and new passive items.
 *
 * M140: Emits telemetry attributes onto #drop-overlay and .drop-choice-card elements:
 * - data-drop-new-count
 * - data-drop-stack-upgrade-count
 * - data-drop-evo-ready-count
 * - data-drop-summary
 * - data-choice-stack-tier
 * - data-choice-current-stacks
 * - data-choice-next-stacks
 */

import { DropItemId, DropItemDef, PlayerState } from '../types/game';
import { DROP_ITEMS } from '../data/upgrades';
import { DROP_ITEM_HI_FI_SVG } from './icons';

export type DropChoiceStackTier = 'NEW' | 'STACK_2' | 'EVO_READY' | 'OVERSTACK';

export interface DropChoiceStackBreakdown {
  id: string;
  name: string;
  currentStacks: number;
  nextStacks: number;
  nextTier: DropChoiceStackTier;
}

export interface DropModalStackSummary {
  newItemsCount: number;
  stackUpgradeCount: number;
  evoReadyCount: number;
  totalChoices: number;
  summaryLine: string;
  choiceBreakdown: DropChoiceStackBreakdown[];
}

export type DropChoice =
  | string
  | DropItemDef
  | {
      id?: string;
      itemId?: string;
      name?: string;
      desc?: string;
      color?: string;
      icon?: string;
      [key: string]: any;
    };

/**
 * Pure evaluator computing telemetry breakdowns for drop item choices against
 * current player item stacks.
 */
export function getDropItemStackSummary(
  choices?: DropChoice[] | null,
  player?: Partial<PlayerState> | { itemStacks?: Partial<Record<string, number>> | null } | null
): DropModalStackSummary {
  const safeChoices = Array.isArray(choices) ? choices : [];
  let newItemsCount = 0;
  let stackUpgradeCount = 0;
  let evoReadyCount = 0;

  const choiceBreakdown: DropChoiceStackBreakdown[] = safeChoices.map((c) => {
    let id = '';
    let name = '';
    if (typeof c === 'string') {
      id = c;
      const def = DROP_ITEMS[c as DropItemId];
      name = def ? def.name : c;
    } else if (c && typeof c === 'object') {
      id = (c.id || (c as any).itemId || '') as string;
      const def = DROP_ITEMS[id as DropItemId];
      name = c.name || (def ? def.name : id);
    }

    const raw = player?.itemStacks?.[id];
    const currentStacks =
      typeof raw === 'number' && Number.isFinite(raw) && raw > 0
        ? Math.floor(raw)
        : 0;
    const nextStacks = currentStacks + 1;

    let nextTier: DropChoiceStackTier = 'NEW';
    if (currentStacks === 0) {
      nextTier = 'NEW';
      newItemsCount++;
    } else if (currentStacks === 1) {
      nextTier = 'STACK_2';
      stackUpgradeCount++;
    } else if (currentStacks === 2) {
      nextTier = 'EVO_READY';
      evoReadyCount++;
    } else {
      nextTier = 'OVERSTACK';
      stackUpgradeCount++;
    }

    return {
      id,
      name,
      currentStacks,
      nextStacks,
      nextTier
    };
  });

  const totalChoices = safeChoices.length;
  const summaryLine =
    totalChoices === 0
      ? 'DROPS: NO ITEMS AVAILABLE'
      : `DROPS: ${totalChoices} CHOICES // ${newItemsCount} NEW · ${stackUpgradeCount} UPGRADE · ${evoReadyCount} EVO-READY`;

  return {
    newItemsCount,
    stackUpgradeCount,
    evoReadyCount,
    totalChoices,
    summaryLine,
    choiceBreakdown
  };
}

/**
 * Controller managing the interactive drop item selection dialog.
 */
export class DropModalController {
  public static getDropItemStackSummary = getDropItemStackSummary;
  public getDropItemStackSummary = getDropItemStackSummary;

  private overlay: HTMLElement | null = null;
  private choicesContainer: HTMLElement | null = null;
  private choices: DropChoice[] = [];
  private onSelectCallback: ((choice: DropChoice, index: number) => void) | null = null;
  private visible: boolean = false;
  private lastSummary: DropModalStackSummary | null = null;
  private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

  public get overlayEl(): HTMLElement | null {
    if (!this.overlay && typeof document !== 'undefined') {
      this.overlay = document.getElementById('drop-overlay');
    }
    return this.overlay;
  }

  public set overlayEl(el: HTMLElement | null) {
    this.overlay = el;
  }

  constructor() {
    if (typeof document !== 'undefined') {
      this.overlay = document.getElementById('drop-overlay');
      this.choicesContainer = document.getElementById('drop-choices');
    }
  }

  public isOpen(): boolean {
    return this.visible;
  }

  public getActiveChoices(): DropChoice[] {
    return this.choices;
  }

  public getChoices(): DropChoice[] {
    return this.choices;
  }

  public getStackSummary(): DropModalStackSummary | null {
    return this.lastSummary;
  }

  public select(index: number): void {
    const choice = this.choices[index];
    if (choice !== undefined && this.onSelectCallback) {
      this.onSelectCallback(choice, index);
    }
    this.close();
  }

  public selectChoice(index: number): void {
    this.select(index);
  }

  public close(): void {
    this.visible = false;
    const overlay = this.overlayEl;
    if (overlay) {
      overlay.classList.add('hidden');
      overlay.style.display = 'none';
    }
    if (typeof window !== 'undefined' && this.keydownHandler) {
      window.removeEventListener('keydown', this.keydownHandler, true);
      this.keydownHandler = null;
    }
  }

  /**
   * Opens the drop selection modal, computes stack telemetry, and reflects
   * data attributes on `#drop-overlay` and `.drop-choice-card` elements.
   */
  public open(
    choices: DropChoice[],
    player?: Partial<PlayerState> | { itemStacks?: Partial<Record<string, number>> | null } | null,
    onSelect?: (choice: DropChoice, index: number) => void
  ): void {
    this.choices = choices || [];
    this.onSelectCallback = onSelect || null;
    this.visible = true;

    if (!this.overlay && typeof document !== 'undefined') {
      this.overlay = document.getElementById('drop-overlay');
    }
    const overlay = this.overlay;

    const stackSummary = getDropItemStackSummary(choices, player);
    this.lastSummary = stackSummary;

    if (overlay) {
      overlay.setAttribute('data-drop-new-count', String(stackSummary.newItemsCount));
      overlay.setAttribute('data-drop-stack-upgrade-count', String(stackSummary.stackUpgradeCount));
      overlay.setAttribute('data-drop-evo-ready-count', String(stackSummary.evoReadyCount));
      overlay.setAttribute('data-drop-summary', stackSummary.summaryLine);
      overlay.classList.remove('hidden');
      overlay.style.display = 'flex';
    }

    this.renderChoices(stackSummary);

    // Keyboard navigation (1, 2, 3 to choose, Escape to dismiss)
    if (typeof window !== 'undefined') {
      if (this.keydownHandler) {
        window.removeEventListener('keydown', this.keydownHandler, true);
      }
      this.keydownHandler = (e: KeyboardEvent) => {
        if (!this.visible) return;
        if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          this.close();
          return;
        }
        const digit = parseInt(e.key, 10);
        if (!isNaN(digit) && digit >= 1 && digit <= this.choices.length) {
          e.preventDefault();
          e.stopPropagation();
          this.select(digit - 1);
        }
      };
      window.addEventListener('keydown', this.keydownHandler, true);
    }
  }

  private renderChoices(stackSummary: DropModalStackSummary): void {
    const overlay = this.overlayEl;
    const doc = typeof document !== 'undefined' ? document : null;

    // Check if .drop-choice-card elements already exist in the DOM
    const existingCards = (overlay || doc)?.querySelectorAll('.drop-choice-card');
    if (existingCards && existingCards.length > 0) {
      existingCards.forEach((card, i) => {
        const breakdown = stackSummary.choiceBreakdown[i];
        if (breakdown) {
          card.setAttribute('data-choice-stack-tier', breakdown.nextTier);
          card.setAttribute('data-choice-current-stacks', String(breakdown.currentStacks));
          card.setAttribute('data-choice-next-stacks', String(breakdown.nextStacks));
        }
        card.addEventListener('click', () => this.select(i));
      });
      return;
    }

    if (!doc) return;

    // Look for container
    let container =
      this.choicesContainer ||
      overlay?.querySelector('#drop-choices') ||
      overlay?.querySelector('.drop-choices-container') ||
      overlay?.querySelector('.drop-choices') ||
      doc.getElementById('drop-choices');

    if (!container && overlay) {
      container = doc.createElement('div');
      container.id = 'drop-choices';
      container.className = 'drop-choices';
      overlay.appendChild(container);
    }

    if (container) {
      container.innerHTML = '';
      this.choices.forEach((choice, i) => {
        const breakdown = stackSummary.choiceBreakdown[i];
        const card = doc.createElement('div');
        card.className = 'drop-choice-card';
        if (breakdown) {
          card.setAttribute('data-choice-stack-tier', breakdown.nextTier);
          card.setAttribute('data-choice-current-stacks', String(breakdown.currentStacks));
          card.setAttribute('data-choice-next-stacks', String(breakdown.nextStacks));
        }

        const id = breakdown?.id || (typeof choice === 'string' ? choice : (choice?.id || ''));
        const name = breakdown?.name || (typeof choice === 'string' ? choice : (choice?.name || 'Item'));
        const def = DROP_ITEMS[id as DropItemId];
        const desc = def?.desc || (typeof choice === 'object' && choice?.desc) || '';
        const iconSvg = DROP_ITEM_HI_FI_SVG[id] || (def ? def.icon : '📦');
        const color = def?.color || '#ffd60a';

        card.innerHTML = `
          <div class="drop-choice-icon" style="color: ${color}">${iconSvg}</div>
          <div class="drop-choice-content">
            <div class="drop-choice-title">${name}</div>
            <div class="drop-choice-desc">${desc}</div>
            <div class="drop-choice-stacks-badge">x${breakdown?.nextStacks || 1} [${breakdown?.nextTier || 'NEW'}]</div>
          </div>
        `;
        card.addEventListener('click', () => this.select(i));
        container.appendChild(card);
      });
    }
  }
}
