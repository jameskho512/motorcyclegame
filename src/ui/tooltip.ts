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

/**
 * Comic speech-box title: ink heading text with the item's accent color shown
 * as a marker swatch + kicker label (keeps text contrast on the white box).
 */
function tipTitle(name: string, accent: string, kicker: string): string {
  return `<span class="tip-kicker" style="--tip-accent:${accent}">${kicker}</span><b class="tip-title" style="--tip-accent:${accent}">${name}</b>`;
}

/** Gold price chip used for shop cost lines. */
function tipCost(text: string): string {
  return `<span class="tip-cost">${text}</span>`;
}

const EVOLUTION_MOD_MAP: Record<string, string> = {
  'Rubberized Casings': 'Pistol',
  'bounce_rounds': 'Pistol',
  'Hair-Trigger Servo': 'Machine Gun',
  'hair_trigger': 'Machine Gun',
  'Thermobaric Mix': 'Flamethrower / Grenade Launcher',
  'napalm_mix': 'Flamethrower / Grenade Launcher',
  'Twin Barrel Adapter': 'Shotgun',
  'split_barrel': 'Shotgun',
  'Tungsten Sabot': 'Plasma Railgun',
  'pierce_core': 'Plasma Railgun',
  'Scrap Siphon': 'Arc Tesla Coil',
  'vampiric_siphon': 'Arc Tesla Coil'
};

const DELTA_LABELS: Record<string, string> = {
  dmgMult: 'Damage',
  dmg: 'Damage',
  fireRateMult: 'Fire Rate',
  fireRate: 'Fire Rate',
  speedMult: 'Speed',
  speed: 'Speed',
  projSpeedMult: 'Proj Speed',
  blastMult: 'Blast Radius',
  blast: 'Blast Radius',
  pierce: 'Pierce',
  bounce: 'Ricochet',
  multiShot: 'Multi-Shot',
  vampChance: 'Siphon',
  maxHp: 'Max Fuel',
  hp: 'Fuel'
};

export function formatModStatDeltas(statDeltas?: Record<string, number>): string {
  if (!statDeltas || typeof statDeltas !== 'object') return '';
  const chips: string[] = [];
  for (const [key, rawVal] of Object.entries(statDeltas)) {
    if (typeof rawVal !== 'number' || rawVal === 0) continue;
    const isPositive = rawVal > 0;
    const color = isPositive ? '#06d6a0' : '#ff4d6d';
    const sign = isPositive ? '+' : '';
    const label = DELTA_LABELS[key] || key;
    const isFlat = key === 'pierce' || key === 'bounce' || key === 'multiShot' || key === 'maxHp' || key === 'hp';
    const valStr = isFlat || Math.abs(rawVal) >= 1
      ? `${sign}${rawVal} ${label}`
      : `${sign}${Math.round(rawVal * 100)}% ${label}`;
    chips.push(`<span style="color:${color};font-weight:700">${valStr}</span>`);
  }
  return chips.length > 0 ? `<div style="margin-top:3px">${chips.join(' &middot; ')}</div>` : '';
}

export function getModEvolutionTarget(mod: { id?: string; name?: string; [k: string]: any }): string | null {
  if (!mod) return null;
  if (typeof mod.evolutionWeapon === 'string' && mod.evolutionWeapon) return mod.evolutionWeapon;
  if (mod.name && EVOLUTION_MOD_MAP[mod.name]) return EVOLUTION_MOD_MAP[mod.name];
  if (mod.id && EVOLUTION_MOD_MAP[mod.id]) return EVOLUTION_MOD_MAP[mod.id];
  return null;
}

export function formatWeaponMasteryHint(kills: number = 0): string {
  const safeKills = Math.max(0, Math.floor(Number(kills) || 0));
  if (safeKills >= 100) {
    return `Mastery: ★★★ MASTER III (+15% DMG · MAX RANK! · ${safeKills} kills)`;
  }
  if (safeKills >= 40) {
    return `Mastery: ★★☆ ADEPT II (+10% DMG · ${safeKills}/100 kills to ★★★ MASTER III)`;
  }
  if (safeKills >= 10) {
    return `Mastery: ★☆☆ ROOKIE I (+5% DMG · ${safeKills}/40 kills to ★★☆ ADEPT II)`;
  }
  return `Mastery: ☆☆☆ UNRANKED (${safeKills}/10 kills to ★☆☆ ROOKIE I +5% DMG)`;
}

export class TooltipManager {
  private tipEl: HTMLElement | null = null;
  private isVisible: boolean = false;
  private hoveringMouse: boolean = false;
  private autoInspectActive: boolean = false;

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
    let flipX = false;
    let flipY = false;

    if (x + rect.width > winWidth - 6) {
      x = clientX - rect.width - 12;
      flipX = true;
    }
    if (y + rect.height > winHeight - 6) {
      y = clientY - rect.height - 12;
      flipY = true;
    }

    // Speech-box tail points back toward the cursor corner.
    this.tipEl.classList.toggle('tip-flip-x', flipX);
    this.tipEl.classList.toggle('tip-flip-y', flipY);

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
    if ((p as any).type === 'hub_npc') {
      const npc = p as any;
      const costLine = npc.cost > 0 ? `<br/><span class="tip-cost">Cost: ${npc.cost} Scrap ⚙️</span>` : '<br/><span class="tip-free">Ride onto station to interact</span>';
      return `${tipTitle(npc.name, '#ffd60a', 'Home Base')}<br/>${npc.subtitle}${costLine}`;
    }

    const choiceBadge = (p as any).choiceGroup
      ? '<div style="color:#ffd60a;font-weight:800;margin-top:3px">⚖️ CHOICE PEDESTAL — OTHER DESPAWNS</div>'
      : '';

    if (p.type === 'mod_pedestal') {
      const costHtml = p.cost > 0
        ? tipCost(`Cost: ${p.cost} coins`)
        : '<span class="tip-free">Free</span>';
      const deltasHtml = formatModStatDeltas((p.mod as any).statDeltas);
      const evoTarget = getModEvolutionTarget(p.mod as any);
      const evoBadge = evoTarget
        ? '<div style="color:#00f5d4;font-weight:800;margin-top:3px">⚡ OVERCLOCK EVOLUTION MOD</div>'
        : '';
      return `${tipTitle(p.mod.name, '#ffd166', 'Mod')}<br/>${p.mod.desc}${deltasHtml}${evoBadge}${choiceBadge}<br/>${costHtml}`;
    }

    if (p.type === 'loot') {
      const R = RARITY[p.item.rarity];
      const statsList = Object.keys(p.item.stats)
        .map(k => fmtStat(k as any, (p.item.stats as any)[k]))
        .join('<br/>');
      return `${tipTitle(`${R.name} ${p.item.name}`, R.color, 'Gear')}<br/>${statsList}${choiceBadge}`;
    }

    if (p.type === 'item_drop') {
      const it = DROP_ITEMS[p.itemId];
      if (!it) return null;
      const evoTarget = getModEvolutionTarget({ id: p.itemId, name: it.name });
      const evoBadge = evoTarget
        ? '<div style="color:#00f5d4;font-weight:800;margin-top:3px">⚡ OVERCLOCK EVOLUTION MOD</div>'
        : '';
      return `${tipTitle(it.name, it.color, 'Item')}<br/>${it.desc}${evoBadge}${choiceBadge}`;
    }

    if (p.type === 'run_weapon') {
      const w = WEAPONS[p.weaponId];
      if (!w) return null;
      return `${tipTitle(`${w.name} (this run)`, w.color, 'Weapon')}<br/>${w.desc}${choiceBadge}<br/>${tipCost(`Cost: ${p.cost} coins`)}`;
    }

    if (p.type === 'shop_heart') {
      return `${tipTitle('Hull Repair', '#e5203a', 'Repair')}<br/>Restores 2 fuel<br/>${tipCost(`Cost: ${p.cost} coins`)}`;
    }

    if (p.type === 'heart') {
      return `${tipTitle('Gas Can', '#e5203a', 'Pickup')}<br/>Restores 1 fuel`;
    }

    return null;
  }

  /** Alias for formatPickupTooltip matching spec terminology. */
  public buildPickupHTML(p: Pickup): string | null {
    return this.formatPickupTooltip(p);
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
        this.hoveringMouse = true;
        this.autoInspectActive = false;
        this.show(tipTarget.dataset.tip, e.clientX, e.clientY);
        return;
      }

      // 2. In-room pickup proximity hover (when not in modal)
      if (getPickupsUnderMouse && (!isModalOpen || !isModalOpen())) {
        const pickup = getPickupsUnderMouse(e.clientX, e.clientY);
        if (pickup) {
          const html = this.formatPickupTooltip(pickup);
          if (html) {
            this.hoveringMouse = true;
            this.autoInspectActive = false;
            this.show(html, e.clientX, e.clientY);
            return;
          }
        }
      }

      this.hoveringMouse = false;
      if (!this.autoInspectActive) {
        this.hide();
      }
    };

    document.addEventListener('mousemove', handler);
    return () => document.removeEventListener('mousemove', handler);
  }

  /**
   * Auto-inspects the nearest pickup within <75px when combat is cleared and no modal/mouse-hover is active.
   */
  public updateProximityAutoInspect(
    pickup: Pickup | null,
    clientX: number,
    clientY: number,
    modalOpen: boolean
  ): void {
    if (modalOpen) {
      if (this.autoInspectActive) {
        this.autoInspectActive = false;
        this.hide();
      }
      return;
    }
    if (this.hoveringMouse) return;

    if (pickup) {
      const html = this.formatPickupTooltip(pickup);
      if (html) {
        this.autoInspectActive = true;
        this.show(html, clientX, clientY);
        return;
      }
    }

    if (this.autoInspectActive) {
      this.autoInspectActive = false;
      this.hide();
    }
  }
}
