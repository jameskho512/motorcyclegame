/**
 * MOTO-ROGUE: Action VFX Module
 *
 * Implements Arc System Works / Dragon Ball FighterZ / Anime fighting game visual effects:
 * 1. Anime Speed Lines during NOS boost.
 * 2. Ki / NOS flame aura and electric arcs.
 * 3. Manga-style star-burst hit sparks and impact frames.
 * 4. Shockwave rings and shrapnel bursts.
 * 5. Cyan Ion beam trails and Tesla lightning arcs.
 * 6. Comic-style floating combat text ('CRIT!', damage numbers).
 */

import { Graphics, Container, Text, TextStyle, FillGradient } from 'pixi.js';
import {
  Particle,
  BeamEffect,
  DamageNumber,
  PlayerState
} from '../types/game';

export interface MangaHitSpark {
  x: number;
  y: number;
  color: string;
  isCrit: boolean;
  scale: number;
  life: number;
  maxLife: number;
  rotation: number;
}

export class VFXManager {
  private speedLineTimer: number = 0;
  private hitSparks: MangaHitSpark[] = [];
  // Floating combat text pools (reused every frame by renderFloatingText)
  private floatingTextPool: Text[] = [];
  private floatingTextStyles: Map<string, TextStyle> = new Map();
  private floatingBurstGfx: Graphics = new Graphics();

  /**
   * Spawns a manga-style starburst hit spark on weapon impact.
   */
  public addHitSpark(x: number, y: number, isCrit: boolean, color: string = '#ffd166'): void {
    this.hitSparks.push({
      x,
      y,
      color,
      isCrit,
      scale: isCrit ? 1.6 : 1.0,
      life: isCrit ? 0.22 : 0.14,
      maxLife: isCrit ? 0.22 : 0.14,
      rotation: Math.random() * Math.PI * 2
    });
  }

  /**
   * Updates VFX timers and internal spark particle lifetimes.
   */
  public update(dt: number): void {
    this.speedLineTimer += dt;
    for (let i = this.hitSparks.length - 1; i >= 0; i--) {
      const spark = this.hitSparks[i];
      spark.life -= dt;
      if (spark.life <= 0) {
        this.hitSparks.splice(i, 1);
      }
    }
  }

  /**
   * Clears all temporary VFX sparks.
   */
  public clear(): void {
    this.hitSparks = [];
  }

  /**
   * Renders Anime Speed Lines when NOS boost is active.
   * Speed lines behind motorcycle removed per design specification.
   */
  public renderSpeedLines(_g: Graphics, _player: PlayerState, _isBoosting: boolean): void {
    // Removed speed lines behind motorcycle for cleaner visual clarity
  }

  /**
   * Renders directional twin-exhaust afterburner jet cones and subtle perimeter aura during NOS boost.
   * Rendered underneath the player motorcycle to keep chassis, rider helmet, and turret unobstructed.
   */
  public renderKiAura(g: Graphics, player: PlayerState, isBoosting: boolean): void {
    if (!isBoosting || player.nosLock || player.nos <= 0) return;

    const angle = player.bikeAngle;
    const cosB = Math.cos(angle);
    const sinB = Math.sin(angle);
    const oppAngle = angle + Math.PI;
    const cosOpp = Math.cos(oppAngle);
    const sinOpp = Math.sin(oppAngle);
    const perpX = -sinOpp;
    const perpY = cosOpp;

    // Local-to-world transform along player bike orientation
    const toWorld = (lx: number, ly: number): [number, number] => {
      return [
        player.x + cosB * lx - sinB * ly,
        player.y + sinB * lx + cosB * ly
      ];
    };

    // 1. Subtle translucent rim contour around bike perimeter (soft, non-distracting)
    const rimPoints: number[] = [];
    const rimSteps = 16;
    const rx = 27; // Longitudinal semi-axis
    const ry = 15; // Lateral semi-axis
    for (let i = 0; i < rimSteps; i++) {
      const theta = (i / rimSteps) * Math.PI * 2;
      const [wx, wy] = toWorld(Math.cos(theta) * rx, Math.sin(theta) * ry);
      rimPoints.push(wx, wy);
    }
    const pulseAlpha = 0.16 + Math.sin(this.speedLineTimer * 10) * 0.08;
    g.poly(rimPoints)
      .stroke({ color: 0x4cc9f0, width: 1.5, alpha: pulseAlpha });

    // 2. Twin-exhaust subtle jet cones shooting backward from rear pipes (-23, -8) and (-23, 8)
    const pipeYOffsets = [-8, 8];
    const flicker = Math.sin(this.speedLineTimer * 46) * 2.0 + Math.cos(this.speedLineTimer * 31) * 1.5;
    const outerLen = Math.max(9, 14 + flicker);
    const coreLen = outerLen * 0.55;

    for (const pyOff of pipeYOffsets) {
      const [tipX, tipY] = toWorld(-23, pyOff);

      // Outer gentle cyan flame plume
      const outerCone = [
        tipX + perpX * 1.5, tipY + perpY * 1.5,
        tipX + cosOpp * (outerLen * 0.4) + perpX * 2.2, tipY + sinOpp * (outerLen * 0.4) + perpY * 2.2,
        tipX + cosOpp * outerLen, tipY + sinOpp * outerLen,
        tipX + cosOpp * (outerLen * 0.4) - perpX * 2.2, tipY + sinOpp * (outerLen * 0.4) - perpY * 2.2,
        tipX - perpX * 1.5, tipY - perpY * 1.5
      ];

      g.poly(outerCone)
        .fill({ color: 0x4895ef, alpha: 0.28 });

      // Mid electric cyan core
      const midCone = [
        tipX + perpX * 1.0, tipY + perpY * 1.0,
        tipX + cosOpp * coreLen, tipY + sinOpp * coreLen,
        tipX - perpX * 1.0, tipY - perpY * 1.0
      ];

      g.poly(midCone)
        .fill({ color: 0x4cc9f0, alpha: 0.45 });

      // Soft white nozzle heat core
      const whiteCore = [
        tipX + perpX * 0.6, tipY + perpY * 0.6,
        tipX + cosOpp * (coreLen * 0.5), tipY + sinOpp * (coreLen * 0.5),
        tipX - perpX * 0.6, tipY - perpY * 0.6
      ];

      g.poly(whiteCore)
        .fill({ color: 0xffffff, alpha: 0.55 });

      // Subtle pulse dot
      const diamondDist = outerLen * 0.4;
      const dX = tipX + cosOpp * diamondDist;
      const dY = tipY + sinOpp * diamondDist;
      g.circle(dX, dY, 1.2)
        .fill({ color: 0xffffff, alpha: 0.25 });
    }
  }

  /**
   * Renders manga starburst hit sparks.
   */
  public renderHitSparks(g: Graphics): void {
    for (const spark of this.hitSparks) {
      const progress = 1 - spark.life / spark.maxLife;
      const r1 = 18 * spark.scale * (1 + progress * 0.4);
      const r2 = 5 * spark.scale;
      const numPoints = spark.isCrit ? 8 : 4;
      const starCoords: number[] = [];

      for (let i = 0; i < numPoints * 2; i++) {
        const a = spark.rotation + (i * Math.PI) / numPoints;
        const radius = i % 2 === 0 ? r1 : r2;
        starCoords.push(spark.x + Math.cos(a) * radius, spark.y + Math.sin(a) * radius);
      }

      const alpha = Math.max(0, 1 - progress);
      const colorHex = spark.isCrit ? 0xffd166 : 0xffffff;

      // Black ink shadow contour
      g.poly(starCoords)
        .stroke({ color: 0x0a0b10, width: 2.5, alpha });

      // Starburst color fill
      g.poly(starCoords)
        .fill({ color: colorHex, alpha });

      // Core white flash
      g.circle(spark.x, spark.y, r2 * 0.7)
        .fill({ color: 0xffffff, alpha });
    }
  }

  /**
   * Renders active shockwave expansion rings.
   */
  public renderShockwaves(g: Graphics, particles: Particle[]): void {
    for (const pt of particles) {
      if (pt.shockwaveMax) {
        const progress = 1 - pt.life / pt.maxLife;
        const currentRadius = pt.shockwaveMax * progress;
        const alpha = Math.max(0, pt.life / pt.maxLife);
        const col = parseInt(pt.color.replace('#', '0x'), 16) || 0xf72585;

        // Outer bold shockwave outline
        g.circle(pt.x, pt.y, currentRadius)
          .stroke({ color: 0x0a0b10, width: 4.5, alpha: alpha * 0.85 });

        // Inner shockwave color crest
        g.circle(pt.x, pt.y, currentRadius)
          .stroke({ color: col, width: 2.5, alpha });
      }
    }
  }

  /**
   * Renders hyper-velocity cyan ion beams (Railgun) and Tesla lightning arcs.
   */
  public renderBeams(g: Graphics, beamEffects: BeamEffect[]): void {
    for (const bm of beamEffects) {
      const alpha = Math.max(0, bm.life / bm.maxLife);
      const col = parseInt(bm.color.replace('#', '0x'), 16) || 0x00f5d4;

      if (bm.isLightning) {
        // 4-step jagged electric arc
        const steps = 4;
        const points: { x: number; y: number }[] = [{ x: bm.x1, y: bm.y1 }];
        for (let s = 1; s < steps; s++) {
          const t = s / steps;
          const jx = bm.x1 + (bm.x2 - bm.x1) * t + (Math.sin(s * 7 + bm.life * 20) * 16);
          const jy = bm.y1 + (bm.y2 - bm.y1) * t + (Math.cos(s * 7 + bm.life * 20) * 16);
          points.push({ x: jx, y: jy });
        }
        points.push({ x: bm.x2, y: bm.y2 });

        // Outer ink contour
        g.moveTo(points[0].x, points[0].y);
        for (let p = 1; p < points.length; p++) {
          g.lineTo(points[p].x, points[p].y);
        }
        g.stroke({ color: 0x0a0b10, width: bm.width + 2, alpha });

        // Inner neon arc
        g.moveTo(points[0].x, points[0].y);
        for (let p = 1; p < points.length; p++) {
          g.lineTo(points[p].x, points[p].y);
        }
        g.stroke({ color: col, width: bm.width, alpha });
      } else {
        // Straight hyper-velocity Ion Beam Slug (Railgun)
        // Outer black ink edge
        g.moveTo(bm.x1, bm.y1)
          .lineTo(bm.x2, bm.y2)
          .stroke({ color: 0x0a0b10, width: bm.width + 3, alpha: alpha * 0.9 });

        // Cyan glow core
        g.moveTo(bm.x1, bm.y1)
          .lineTo(bm.x2, bm.y2)
          .stroke({ color: col, width: bm.width, alpha });

        // Inner white laser core
        g.moveTo(bm.x1, bm.y1)
          .lineTo(bm.x2, bm.y2)
          .stroke({ color: 0xffffff, width: Math.max(1, bm.width * 0.4), alpha });
      }
    }
  }

  /**
   * Renders floating comic combat text ('CRIT!', damage numbers).
   */
  public renderFloatingText(container: Container, damageNumbers: DamageNumber[]): void {
    // Pooled rendering: Text objects and TextStyles are reused across frames instead of
    // being recreated (the old removeChildren() + new Text per frame leaked GPU textures).
    if (this.floatingBurstGfx.parent !== container) {
      container.addChildAt(this.floatingBurstGfx, 0);
    }
    const burst = this.floatingBurstGfx;
    burst.clear();

    let used = 0;
    for (const dn of damageNumbers) {
      const alpha = Math.max(0, dn.life / dn.maxLife);
      if (alpha <= 0) continue;
      // Only explicit 'CRIT' text gets the big comic burst; other '!' texts
      // (e.g. "NEED X COINS!") are emphasized but keep their color override.
      const isCrit = dn.text.includes('CRIT');
      const isLoud = !isCrit && dn.text.includes('!');

      let text = this.floatingTextPool[used];
      if (!text) {
        text = new Text({ text: '', style: this.getFloatingTextStyle('normal', '#ffffff') });
        text.anchor.set(0.5, 0.5);
        this.floatingTextPool.push(text);
      }
      if (text.parent !== container) container.addChild(text);
      used++;

      const kind: FloatingTextKind = isCrit ? 'crit' : isLoud ? 'loud' : 'normal';
      const style = this.getFloatingTextStyle(kind, dn.color || '#ffffff');
      if (text.style !== style) text.style = style;
      if (text.text !== dn.text) text.text = dn.text;

      // Deterministic per-number tilt (no per-frame randomness => no jitter)
      const h = floatingTextHash(dn.text, dn.x, dn.maxLife);
      const tilt = ((h % 1000) / 1000 - 0.5) * (isCrit ? 0.36 : 0.26);

      // Crit pop-in: scale overshoot during the first ~15% of life
      const age = 1 - alpha;
      const pop = isCrit && age < 0.15 ? 1 + (0.15 - age) * 3 : 1;

      text.visible = true;
      text.position.set(dn.x, dn.y);
      text.rotation = tilt;
      text.scale.set(pop);
      text.alpha = alpha;

      if (isCrit) {
        drawComicStarburst(burst, dn.x, dn.y, 34 * pop, 20 * pop, tilt, h, alpha);
      }
    }

    // Hide leftover pooled Text objects
    for (let i = used; i < this.floatingTextPool.length; i++) {
      this.floatingTextPool[i].visible = false;
    }
  }

  /** Cached TextStyle lookup for floating combat text (one instance per kind+color). */
  private getFloatingTextStyle(kind: FloatingTextKind, color: string): TextStyle {
    const key = `${kind}|${color}`;
    const cached = this.floatingTextStyles.get(key);
    if (cached) return cached;

    let style: TextStyle;
    if (kind === 'crit') {
      style = new TextStyle({
        fontFamily: FLOATING_TEXT_FONT,
        fontSize: 24,
        fontStyle: 'italic',
        fontWeight: '900',
        fill: new FillGradient({
          type: 'linear',
          start: { x: 0, y: 0 },
          end: { x: 0, y: 1 },
          colorStops: [
            { offset: 0, color: '#fff275' },
            { offset: 0.55, color: '#ffb703' },
            { offset: 1, color: '#ff6b00' }
          ],
          textureSpace: 'local'
        }),
        stroke: { color: '#0a0b10', width: 5, join: 'round' },
        padding: 6
      });
    } else {
      style = new TextStyle({
        fontFamily: FLOATING_TEXT_FONT,
        fontSize: kind === 'loud' ? 17 : 15,
        fontStyle: 'italic',
        fontWeight: '900',
        fill: color,
        stroke: { color: '#0a0b10', width: 4, join: 'round' },
        padding: 4
      });
    }
    this.floatingTextStyles.set(key, style);
    return style;
  }
}

// --- Floating combat text helpers (used by VFXManager.renderFloatingText) ---

type FloatingTextKind = 'normal' | 'loud' | 'crit';

const FLOATING_TEXT_FONT = "'Impact', 'Haettenschweiler', 'Arial Black', sans-serif";

/** Cheap deterministic hash (FNV-1a style) so each number gets a stable tilt/burst shape. */
function floatingTextHash(text: string, x: number, maxLife: number): number {
  let h = 2166136261 ^ Math.floor(x * 7) ^ Math.floor(maxLife * 1000);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Draws a spiky comic "CRIT!" starburst: black ink outer burst + white inner burst. */
function drawComicStarburst(
  g: Graphics,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  rotation: number,
  seed: number,
  alpha: number
): void {
  const spikes = 12;
  const outer: number[] = [];
  const inner: number[] = [];
  const cos = Math.cos(rotation);
  const sin = Math.sin(rotation);
  for (let i = 0; i < spikes * 2; i++) {
    const a = (i / (spikes * 2)) * Math.PI * 2;
    const isTip = i % 2 === 0;
    // Deterministic per-spike jitter in [0.85, 1.15]
    const jitter = 0.85 + (((seed >>> (i % 24)) & 0xff) / 255) * 0.3;
    const k = isTip ? jitter : 0.62;
    const lx = Math.cos(a) * rx * k;
    const ly = Math.sin(a) * ry * k;
    const px = lx * cos - ly * sin;
    const py = lx * sin + ly * cos;
    outer.push(cx + px * 1.12, cy + py * 1.12);
    inner.push(cx + px, cy + py);
  }
  g.poly(outer).fill({ color: 0x0a0b10, alpha });
  g.poly(inner).fill({ color: 0xffffff, alpha });
}
