/**
 * Items & Synergy Telemetry Data Module (M145)
 * Defines canonical item pairs, Duo Synergy recipes, and active/near-miss recipe advisor.
 *
 * NOTE: Strict constraint: No Outlaw Style mechanics or pre-run buffs.
 */

import type { PlayerState } from '../types/game';

export interface PartialDuoSynergyInfo {
  id: string;
  name: string;
  ownedItem: string;
  missingItem: string;
  effectDesc: string;
}

export interface DuoSynergyAdvisorSummary {
  unlockedDuos: string[];
  partialDuos: PartialDuoSynergyInfo[];
  unlockedCount: number;
  nearMissCount: number;
  summaryLine: string;
}

export interface DuoSynergyRecipe {
  id: string;
  name: string;
  items: readonly [string, string];
  desc: string;
}

export const DUO_SYNERGIES: readonly DuoSynergyRecipe[] = [
  {
    id: 'thermal_shock',
    name: 'THERMAL SHOCK',
    items: ['cryo_rounds', 'high_explosive'],
    desc: 'Chilled enemies hit by Fire/Blast trigger a Cyan-Gold Shatter Nova'
  },
  {
    id: 'superconductor',
    name: 'SUPERCONDUCTOR',
    items: ['cryo_rounds', 'tesla_capacitor'],
    desc: 'Chilled enemies double Lightning chain range (220px) & +40% Arc Dmg'
  },
  {
    id: 'juggernaut_overdrive',
    name: 'JUGGERNAUT OVERDRIVE',
    items: ['titanium_spikes', 'turbo_charger'],
    desc: 'NOS Ram kills refund +35 NOS & unleash a 75px Golden Shockwave'
  },
  {
    id: 'voltaic_wake',
    name: 'VOLTAIC WAKE',
    items: ['exhaust_afterburner', 'gasoline'],
    desc: 'NOS Boost leaves Blue-Gold Plasma Pools that ignite & shock enemies'
  }
] as const;

const ITEM_SYNONYMS: Record<string, string[]> = {
  cryo_rounds: ['cryo_rounds', 'cryo rounds', 'cryo-jacketed shells', 'cryo jacketed shells'],
  high_explosive: ['high_explosive', 'high explosive', 'thermobaric mix', 'thermobaric_mix'],
  tesla_capacitor: ['tesla_capacitor', 'tesla capacitor'],
  titanium_spikes: ['titanium_spikes', 'titanium spikes', 'titanium ram spikes', 'titanium_ram_spikes'],
  turbo_charger: ['turbo_charger', 'turbo charger', 'nitrous injector', 'nitrous_injector'],
  exhaust_afterburner: ['exhaust_afterburner', 'exhaust afterburner'],
  gasoline: ['gasoline', 'spilled gasoline', 'spilled_gasoline']
};

function normalizeKey(str: string): string {
  return str.trim().toLowerCase().replace(/[-_\s]+/g, '');
}

function matchesItem(candidate: string, target: string): boolean {
  const candNorm = candidate.trim().toLowerCase();
  const targetNorm = target.trim().toLowerCase();
  if (candNorm === targetNorm) return true;

  if (normalizeKey(candidate) === normalizeKey(target)) return true;

  const syns = ITEM_SYNONYMS[targetNorm];
  if (syns) {
    for (const s of syns) {
      if (candNorm === s.toLowerCase() || normalizeKey(candidate) === normalizeKey(s)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Pure function evaluating a player's inventory against paired Duo Synergy recipes (M145).
 * Computes unlocked pairs, single-item near-misses, and a compact HUD summary line.
 */
export function getDuoSynergyAdvisor(
  player: Partial<PlayerState> | null | undefined
): DuoSynergyAdvisorSummary {
  const rawItems: readonly string[] = Array.isArray(player?.items) ? player.items : [];
  const itemStacks =
    player?.itemStacks && typeof player.itemStacks === 'object'
      ? (player.itemStacks as Record<string, unknown>)
      : {};
  const modStacks =
    (player as any)?.modStacks && typeof (player as any).modStacks === 'object'
      ? ((player as any).modStacks as Record<string, unknown>)
      : {};

  const countOwnedCopies = (targetItem: string): number => {
    let fromArray = 0;
    for (const item of rawItems) {
      if (typeof item === 'string' && matchesItem(item, targetItem)) {
        fromArray += 1;
      }
    }
    let fromItemStacks = 0;
    for (const [key, count] of Object.entries(itemStacks)) {
      if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
        if (matchesItem(key, targetItem)) {
          fromItemStacks += Math.floor(count);
        }
      }
    }
    let fromModStacks = 0;
    for (const [key, count] of Object.entries(modStacks)) {
      if (typeof count === 'number' && Number.isFinite(count) && count > 0) {
        if (matchesItem(key, targetItem)) {
          fromModStacks += Math.floor(count);
        }
      }
    }
    return Math.max(fromArray, fromItemStacks, fromModStacks);
  };

  const targetKeys = Object.keys(ITEM_SYNONYMS);
  const availableCopies: Record<string, number> = {};
  for (const tk of targetKeys) {
    availableCopies[tk] = countOwnedCopies(tk);
  }

  const unlockedSet = new Set<string>();
  const chosenList = Array.isArray((player as any)?.chosenDuoSynergies)
    ? ((player as any).chosenDuoSynergies as string[])
    : [];

  // 1. Prioritize explicitly chosen duo synergies (each consumes 1 copy of itemA and itemB)
  for (const chosenId of chosenList) {
    const syn = DUO_SYNERGIES.find(s => s.id === chosenId);
    if (syn && !unlockedSet.has(syn.id)) {
      const [itemA, itemB] = syn.items;
      if ((availableCopies[itemA] ?? 0) >= 1 && (availableCopies[itemB] ?? 0) >= 1) {
        availableCopies[itemA] -= 1;
        availableCopies[itemB] -= 1;
        unlockedSet.add(syn.id);
      }
    }
  }

  // 2. Allocate remaining copies in canonical order (1 duo per item copy)
  for (const synergy of DUO_SYNERGIES) {
    if (unlockedSet.has(synergy.id)) continue;
    const [itemA, itemB] = synergy.items;
    if ((availableCopies[itemA] ?? 0) >= 1 && (availableCopies[itemB] ?? 0) >= 1) {
      availableCopies[itemA] -= 1;
      availableCopies[itemB] -= 1;
      unlockedSet.add(synergy.id);
    }
  }

  const unlockedDuos: string[] = [];
  const partialDuos: PartialDuoSynergyInfo[] = [];

  for (const synergy of DUO_SYNERGIES) {
    if (unlockedSet.has(synergy.id)) {
      unlockedDuos.push(synergy.name);
      continue;
    }
    const [itemA, itemB] = synergy.items;
    const hasA = (availableCopies[itemA] ?? 0) >= 1;
    const hasB = (availableCopies[itemB] ?? 0) >= 1;
    if (hasA !== hasB) {
      partialDuos.push({
        id: synergy.id,
        name: synergy.name,
        ownedItem: hasA ? itemA : itemB,
        missingItem: hasA ? itemB : itemA,
        effectDesc: synergy.desc
      });
    }
  }

  const unlockedCount = unlockedDuos.length;
  const nearMissCount = partialDuos.length;

  let summaryLine: string;
  if (unlockedCount > 0 && nearMissCount > 0) {
    summaryLine = `DUOS: ${unlockedCount} ACTIVE (${unlockedDuos.join(', ')}) · ${nearMissCount} NEAR-MISS`;
  } else if (unlockedCount > 0) {
    summaryLine = `DUOS: ${unlockedCount} ACTIVE (${unlockedDuos.join(', ')})`;
  } else if (nearMissCount > 0) {
    summaryLine = `DUOS: 0 ACTIVE · ${nearMissCount} NEAR-MISS (NEED ${partialDuos[0].missingItem.toUpperCase()})`;
  } else {
    summaryLine = 'DUOS: 0 ACTIVE · COLLECT PAIRED MODS TO UNLOCK';
  }

  return {
    unlockedDuos,
    partialDuos,
    unlockedCount,
    nearMissCount,
    summaryLine
  };
}
