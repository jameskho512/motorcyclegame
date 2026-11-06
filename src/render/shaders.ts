/**
 * MOTO-ROGUE: PixiJS v8 Shader Filters & Post-Processing Module
 *
 * Provides:
 * 1. BloomFilter for weapons and engine exhaust glow.
 * 2. GlowFilter for legendary loot drops and boss aura.
 * 3. ImpactFlashFilter for high-contrast anime impact frames.
 * 4. ShockwaveFilter for heavy explosions.
 * 5. Environment-safe filter instantiation supporting headless testing.
 */

import { Filter, ColorMatrixFilter } from 'pixi.js';
import { BloomFilter, GlowFilter, ShockwaveFilter } from 'pixi-filters';

export interface ShaderFilterSuite {
  bloom: Filter | null;
  impactFlash: ColorMatrixFilter | null;
  shockwave: ShockwaveFilter | null;
  isSupported: boolean;
}

/**
 * Checks if WebGL shader creation is supported in the current environment.
 */
export function isShaderFilterSupported(): boolean {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return false;
  }
  try {
    const canvas = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    return false;
  }
}

/**
 * Creates an anime manga impact flash filter using ColorMatrixFilter.
 * Inverts colors or saturates brightness for 2-3 frames during critical hits.
 */
export function createImpactFlashFilter(): ColorMatrixFilter | null {
  if (!isShaderFilterSupported()) return null;
  try {
    const cm = new ColorMatrixFilter();
    cm.brightness(1.8, false);
    return cm;
  } catch {
    return null;
  }
}

/**
 * Creates weapon and explosion Bloom filter.
 */
export function createBloomFilter(strength: number = 1.5, quality: number = 4): Filter | null {
  if (!isShaderFilterSupported()) return null;
  try {
    return new BloomFilter({
      strength,
      quality
    });
  } catch {
    return null;
  }
}

/**
 * Creates radial shockwave filter for explosions and TNT blasts.
 */
export function createShockwaveFilter(
  center: { x: number; y: number } = { x: 0.5, y: 0.5 },
  radius: number = 80
): ShockwaveFilter | null {
  if (!isShaderFilterSupported()) return null;
  try {
    return new ShockwaveFilter({
      center,
      radius,
      wavelength: 40,
      amplitude: 20,
      brightness: 1.2
    });
  } catch {
    return null;
  }
}

/**
 * Creates colored outline glow filter for legendary loot and boss cars.
 */
export function createGlowFilter(
  color: number = 0xffd166,
  distance: number = 10,
  outerStrength: number = 2
): Filter | null {
  if (!isShaderFilterSupported()) return null;
  try {
    return new GlowFilter({
      distance,
      outerStrength,
      color,
      quality: 0.1
    });
  } catch {
    return null;
  }
}

export class FilterManager {
  private bloomFilter: Filter | null = null;
  private flashFilter: ColorMatrixFilter | null = null;
  private shockwaveFilter: ShockwaveFilter | null = null;
  private impactFrameActive: boolean = false;
  private impactFrameTimer: number = 0;

  constructor() {
    this.initFilters();
  }

  private initFilters(): void {
    if (!isShaderFilterSupported()) return;
    try {
      this.bloomFilter = createBloomFilter(1.2, 3);
      this.flashFilter = createImpactFlashFilter();
      this.shockwaveFilter = createShockwaveFilter({ x: 0.5, y: 0.5 }, 100);
    } catch {
      // Graceful fallback
    }
  }

  /**
   * Triggers a brief manga impact flash for the specified duration (seconds).
   */
  public triggerImpactFlash(duration: number = 0.05): void {
    this.impactFrameActive = true;
    this.impactFrameTimer = duration;
    if (this.flashFilter) {
      this.flashFilter.negative(false);
    }
  }

  /**
   * Updates active impact flash timer.
   */
  public update(dt: number): void {
    if (this.impactFrameActive) {
      this.impactFrameTimer -= dt;
      if (this.impactFrameTimer <= 0) {
        this.impactFrameActive = false;
        if (this.flashFilter) {
          this.flashFilter.reset();
        }
      }
    }
  }

  public getFilters(): Filter[] {
    const list: Filter[] = [];
    if (this.bloomFilter) list.push(this.bloomFilter);
    if (this.impactFrameActive && this.flashFilter) list.push(this.flashFilter);
    if (this.shockwaveFilter) list.push(this.shockwaveFilter);
    return list;
  }

  public isImpactActive(): boolean {
    return this.impactFrameActive;
  }
}
