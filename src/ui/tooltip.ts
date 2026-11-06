/**
 * MOTO-ROGUE: Hover Tooltip Manager
 *
 * Manages hover tooltips for sidebar mods, weapon slots, and in-room pickups.
 * Parity reference: moto-rogue/index.html L4052-L4098
 */

import { Pickup } from '../types/game';
import { WEAPONS } from '../data/weapons';
import { DROP_ITEMS } from '../data/upgrades';
import { RARITY, fmtStat } from '../data/equipment';

export class TooltipManager {
  private tipEl: HTMLElement | null = null;
  private isVisible: boolean = false;

  constructor(elementId: string = 'tooltip') {
    if (typeof document !== 'undefined') {
      this.tipEl = document.getElementById(elementId);
    }
  }

  public getElement(): HTMLElement | null {
    return this.tipEl;
  }

  /**
   * Shows the tooltip with HTML content at cursor coordinates,
   * clamping to viewport bounds.
   */
  public show(html: string, clientX: number, clientY: number): void {
    if (!this.tipEl) return;
    this.tipEl.innerHTML = html;
    this.tipEl.style.display = 'block';
    this.isVisible = true;

    const rect = this.tipEl.getBoundingClientRect();
    const winWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
    const winHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;

    let x = clientX + 16;
    let y = clientY + 16;

    if (x + rect.width > winWidth - 6) {
      x = clientX - rect.width - 12;
    }
    if (y + rect.height > winHeight - 6) {
      y = clientY - rect.height - 12;
    }

    this.tipEl.style.left = `${Math.max(4, x)}px`;
    this.tipEl.style.top = `${Math.max(4, y)}px`;
  }

  /**
   * Hides the active tooltip.
   */
  public hide(): void {
    if (!this.tipEl) return;
    this.tipEl.style.display = 'none';
    this.isVisible = false;
  }

  /**
   * Checks if tooltip is currently displayed.
   */
  public isOpen(): boolean {
    return this.isVisible;
  }

  /**
   * Generates tooltip HTML for any in-room pickup.
   */
  public formatPickupTooltip(p: Pickup): string | null {
    if (p.type === 'mod_pedestal') {
      const costHtml = p.cost > 0
        ? `Cost: ${p.cost} coins`
        : '<span style="color:#06d6a0">Free</span>';
      return `<b style="color:#ffd166">${p.mod.name}</b><br/>${p.mod.desc}<br/>${costHtml}`;
    }

    if (p.type === 'loot') {
      const R = RARITY[p.item.rarity];
      const statsList = Object.keys(p.item.stats)
        .map(k => fmtStat(k as any, (p.item.stats as any)[k]))
        .join('<br/>');
      return `<b style="color:${R.color}">${R.name} ${p.item.name}</b><br/>${statsList}`;
    }

    if (p.type === 'item_drop') {
      const it = DROP_ITEMS[p.itemId];
      if (!it) return null;
      return `<b style="color:${it.color}">${it.name}</b><br/>${it.desc}`;
    }

    if (p.type === 'run_weapon') {
      const w = WEAPONS[p.weaponId];
      if (!w) return null;
      return `<b style="color:${w.color}">${w.name} (this run)</b><br/>${w.desc}<br/>Cost: ${p.cost} coins`;
    }

    if (p.type === 'shop_heart') {
      return `<b>Hull Repair</b><br/>Restores 2 fuel<br/>Cost: ${p.cost} coins`;
    }

    if (p.type === 'heart') {
      return '<b>Gas Can</b><br/>Restores 1 fuel';
    }

    return null;
  }

  /**
   * Attaches global mousemove delegation for data-tip elements and pickups.
   */
  public attachGlobalListener(
    getPickupsUnderMouse?: (clientX: number, clientY: number) => Pickup | null,
    isModalOpen?: () => boolean
  ): () => void {
    if (typeof document === 'undefined') return () => {};

    const handler = (e: MouseEvent) => {
      // 1. Data-tip hover on DOM elements
      const target = e.target as HTMLElement | null;
      const tipTarget = target?.closest ? target.closest('[data-tip]') as HTMLElement | null : null;
      if (tipTarget && tipTarget.dataset.tip) {
        this.show(tipTarget.dataset.tip, e.clientX, e.clientY);
        return;
      }

      // 2. In-room pickup proximity hover (when not in modal)
      if (getPickupsUnderMouse && (!isModalOpen || !isModalOpen())) {
        const pickup = getPickupsUnderMouse(e.clientX, e.clientY);
        if (pickup) {
          const html = this.formatPickupTooltip(pickup);
          if (html) {
            this.show(html, e.clientX, e.clientY);
            return;
          }
        }
      }

      this.hide();
    };

    document.addEventListener('mousemove', handler);
    return () => document.removeEventListener('mousemove', handler);
  }
}
