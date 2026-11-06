/**
 * MOTO-ROGUE: Procedural Web Audio Sound Synthesizer
 *
 * Implements:
 * 1. Continuous twin-cylinder motorcycle engine hum (sawtooth + triangle + biquad lowpass).
 *    Modulated in real time via speedRatio and NOS isBoosting:
 *    - f1 = 44 + 56 * speedRatio + (isBoosting ? 36 : 0)
 *    - f2 = f1 * (isBoosting ? 2.5 : 2.0)
 *    - cutoff = 160 + 240 * speedRatio + (isBoosting ? 260 : 0)
 *    - gain = 0.025 + 0.055 * speedRatio + (isBoosting ? 0.045 : 0)
 * 2. 1-channel white noise buffer for gunshots, flamethrower, and explosions.
 * 3. Complete suite of 17 procedural SFX functions.
 * 4. Safe user-gesture audio context initialization (`init()`), resume from suspension,
 *    graceful fallback when Web Audio API is unavailable in headless environments.
 * 5. Mute preference persistence via 'moto_rogue_muted'.
 * 6. Per-category volume mixer: one GainNode bus per channel (engine / weapons / impacts /
 *    pickups / ui) feeding masterGain. Slider values persist to 'moto_rogue_audio_v1'.
 *    Mute is independent: it silences masterGain but preserves all slider values.
 *
 * Parity reference: moto-rogue/index.html L635-L890
 */

import { AudioService, SAVE_KEY_MUTED, WeaponId } from '../types/game';
import { StorageDriver, defaultStorage } from '../core/state';

// ============================================================================
// PER-CATEGORY VOLUME MIXER (pure helpers)
// ============================================================================

/** localStorage key for persisted mixer settings. */
export const SAVE_KEY_AUDIO = 'moto_rogue_audio_v1';

/** Base master output level (pre-mixer headroom) used since the original build. */
export const MASTER_BASE_GAIN = 0.38;

/** Bus channels that individual sounds route through (master is applied on top). */
export const VOLUME_CHANNELS = ['music', 'engine', 'weapons', 'impacts', 'pickups', 'ui'] as const;
export type VolumeChannel = (typeof VOLUME_CHANNELS)[number];

/** All user-adjustable volume keys, master first. */
export const VOLUME_KEYS = ['master', ...VOLUME_CHANNELS] as const;
export type VolumeKey = (typeof VOLUME_KEYS)[number];

export type VolumeSettings = Record<VolumeKey, number>;

/** Dynamic Synthwave BGM intensity modes. */
export type MusicIntensityMode = 'calm' | 'combat' | 'boss_phase2';

export const DEFAULT_VOLUME_SETTINGS: Readonly<VolumeSettings> = Object.freeze({
  master: 1,
  music: 0.75,
  engine: 1,
  weapons: 1,
  impacts: 1,
  pickups: 1,
  ui: 1
});

/**
 * Sound method -> mixer channel mapping (every public sound routine belongs to exactly one).
 *   engine : updateEngine, updateEngineHum (continuous hum oscillator chain -> engGain)
 *   weapons: shoot, arcChain
 *   impacts: hit, explosion, enemyKill, playerHurt
 *   pickups: pickupFuel, pickupItem, pickupLoot, shopBuy, shopError
 *   ui     : roomClear, doorTransition, nextFloor, gameOverSound, uiClick
 */
export const SOUND_CHANNEL_MAP: Readonly<Record<string, VolumeChannel>> = Object.freeze({
  updateEngine: 'engine',
  updateEngineHum: 'engine',
  shoot: 'weapons',
  arcChain: 'weapons',
  hit: 'impacts',
  explosion: 'impacts',
  enemyKill: 'impacts',
  playerHurt: 'impacts',
  pickupFuel: 'pickups',
  pickupItem: 'pickups',
  pickupLoot: 'pickups',
  shopBuy: 'pickups',
  shopError: 'pickups',
  roomClear: 'ui',
  doorTransition: 'ui',
  nextFloor: 'ui',
  gameOverSound: 'ui',
  uiClick: 'ui',
  graze: 'impacts',
  driftBoost: 'engine',
  phaseEnrage: 'ui',
  killStreak: 'ui',
  choiceLock: 'ui',
  masteryUp: 'ui',
  stationOpen: 'ui',
  heatToggle: 'ui'
});

function clampUnit(v: number): number {
  return Math.max(0, Math.min(1, v));
}

/**
 * Validates arbitrary (possibly JSON-string) input into a complete VolumeSettings object.
 * Missing / non-numeric / non-finite fields fall back to defaults; numbers are clamped to 0..1.
 * Never throws.
 */
export function sanitizeVolumeSettings(raw: unknown): VolumeSettings {
  let src: unknown = raw;
  if (typeof src === 'string') {
    try {
      src = JSON.parse(src);
    } catch {
      src = null;
    }
  }
  const out: VolumeSettings = { ...DEFAULT_VOLUME_SETTINGS };
  if (typeof src !== 'object' || src === null || Array.isArray(src)) {
    return out;
  }
  const rec = src as Record<string, unknown>;
  for (const key of VOLUME_KEYS) {
    const v = rec[key];
    if (typeof v === 'number' && Number.isFinite(v)) {
      out[key] = clampUnit(v);
    }
  }
  return out;
}

/**
 * Effective linear gain (0..1, before MASTER_BASE_GAIN) for a channel: master * channel.
 * Returns 0 when muted.
 */
export function effectiveGain(channel: VolumeKey, settings: VolumeSettings, muted: boolean = false): number {
  if (muted) return 0;
  const master = clampUnit(settings.master);
  return channel === 'master' ? master : master * clampUnit(settings[channel]);
}

export interface EngineParams {
  f1: number;
  f2: number;
  cutoff: number;
  gain: number;
}

/**
 * Pure calculation function for engine hum frequencies and filter cutoff.
 */
export function calculateEngineParams(
  speedRatio: number,
  isBoosting: boolean,
  paused: boolean = false,
  muted: boolean = false
): EngineParams {
  const f1 = 44 + speedRatio * 56 + (isBoosting ? 36 : 0);
  const f2 = f1 * (isBoosting ? 2.5 : 2.0);
  const cutoff = 160 + speedRatio * 240 + (isBoosting ? 260 : 0);
  const targetGain = muted || paused ? 0.0001 : 0.025 + speedRatio * 0.055 + (isBoosting ? 0.045 : 0);

  return { f1, f2, cutoff, gain: targetGain };
}

export class SoundSynthesizer implements AudioService {
  private actx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private engOsc1: OscillatorNode | null = null;
  private engOsc2: OscillatorNode | null = null;
  private engGain: GainNode | null = null;
  private engFilter: BiquadFilterNode | null = null;
  private muted: boolean = false;
  private storage: StorageDriver;
  private volumes: VolumeSettings = { ...DEFAULT_VOLUME_SETTINGS };
  private buses: Partial<Record<VolumeChannel, GainNode>> = {};

  private lastFlameSfx: number = 0;
  private lastHitSfx: number = 0;

  // Dynamic Synthwave BGM intensity mode
  private musicIntensity: MusicIntensityMode = 'calm';

  // Stateful 5-gear motorcycle transmission & synthwave BGM clock
  private gear: number = 1;
  private throttleTime: number = 0;
  private shiftCutTimer: number = 0;
  private lfoPhase: number = 0;
  private lastEngineUpdateTime: number = 0;
  private bgmStepTimer: number = 0;
  private bgmStepIndex: number = 0;

  constructor(storage: StorageDriver = defaultStorage) {
    this.storage = storage;
    try {
      this.muted = this.storage.getItem(SAVE_KEY_MUTED) === '1';
    } catch {
      this.muted = false;
    }
    try {
      this.volumes = sanitizeVolumeSettings(this.storage.getItem(SAVE_KEY_AUDIO));
    } catch {
      this.volumes = { ...DEFAULT_VOLUME_SETTINGS };
    }
  }

  private masterTarget(): number {
    return this.muted ? 0 : MASTER_BASE_GAIN * this.volumes.master;
  }

  /**
   * Initializes or resumes the AudioContext on user gesture.
   */
  public init(): boolean {
    if (this.actx) {
      if (this.actx.state === 'suspended') {
        this.actx.resume().catch(() => {});
      }
      return true;
    }

    // Inspect window / global environment for AudioContext
    const AudioContextClass =
      (typeof window !== 'undefined'
        ? (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : null) ||
      (typeof globalThis !== 'undefined'
        ? ((globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ||
           (globalThis as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).webkitAudioContext)
        : null);

    if (!AudioContextClass) {
      return false;
    }

    try {
      this.actx = new AudioContextClass();
      this.masterGain = this.actx.createGain();
      this.masterGain.gain.value = this.masterTarget();
      this.masterGain.connect(this.actx.destination);

      // Per-category mixer buses -> masterGain
      for (const ch of VOLUME_CHANNELS) {
        const bus = this.actx.createGain();
        bus.gain.value = this.volumes[ch];
        bus.connect(this.masterGain);
        this.buses[ch] = bus;
      }

      // White noise buffer for explosions, gunshots, flamethrower
      const sampleRate = this.actx.sampleRate || 44100;
      const bufferLength = Math.floor(sampleRate * 1.5);
      this.noiseBuffer = this.actx.createBuffer(1, bufferLength, sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < bufferLength; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      // Continuous twin-cylinder motorcycle engine hum
      this.engOsc1 = this.actx.createOscillator();
      this.engOsc2 = this.actx.createOscillator();
      this.engFilter = this.actx.createBiquadFilter();
      this.engGain = this.actx.createGain();

      this.engOsc1.type = 'sawtooth';
      this.engOsc2.type = 'triangle';
      this.engOsc1.frequency.value = 46;
      this.engOsc2.frequency.value = 92;

      this.engFilter.type = 'lowpass';
      this.engFilter.frequency.value = 180;
      this.engGain.gain.value = 0.0001;

      this.engOsc1.connect(this.engFilter);
      this.engOsc2.connect(this.engFilter);
      this.engFilter.connect(this.engGain);
      this.engGain.connect(this.buses.engine ?? this.masterGain);

      this.engOsc1.start();
      this.engOsc2.start();

      return true;
    } catch {
      return false;
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }

  public setMuted(muted: boolean): void {
    this.muted = muted;
    try {
      this.storage.setItem(SAVE_KEY_MUTED, this.muted ? '1' : '0');
    } catch {
      // Fail-safe
    }

    if (!this.actx) {
      this.init();
    }

    if (this.masterGain && this.actx) {
      this.masterGain.gain.setTargetAtTime(
        this.masterTarget(),
        this.actx.currentTime,
        0.02
      );
    }
  }

  // ==========================================================================
  // PER-CATEGORY VOLUME MIXER
  // ==========================================================================

  /** Dynamic Synthwave Music Intensity accessor. */
  public getMusicIntensity(): MusicIntensityMode {
    return this.musicIntensity;
  }

  /** Sets the dynamic synthwave music intensity mode ('calm' | 'combat' | 'boss_phase2'). */
  public setMusicIntensity(mode: MusicIntensityMode): void {
    this.musicIntensity = mode;
  }

  /** Returns effective linear gain for a channel (0..1), respecting mute. */
  public getEffectiveVolume(channel: VolumeKey): number {
    return effectiveGain(channel, this.volumes, this.muted);
  }

  /** Returns a copy of the current mixer slider values (0..1). */
  public getVolumes(): VolumeSettings {
    return { ...this.volumes };
  }

  /** Sets one mixer slider (clamped 0..1), applies it live and persists. Mute is untouched. */
  public setVolume(key: VolumeKey, value: number): void {
    const v = Number.isFinite(value) ? clampUnit(value) : DEFAULT_VOLUME_SETTINGS[key];
    this.volumes[key] = v;
    this.applyVolume(key);
    this.saveVolumes();
  }

  /** Restores all sliders to 100% and persists. */
  public resetVolumes(): void {
    this.volumes = { ...DEFAULT_VOLUME_SETTINGS };
    for (const key of VOLUME_KEYS) this.applyVolume(key);
    this.saveVolumes();
  }

  /** Plays a short representative cue for a mixer channel (settings "test" buttons). */
  public playTest(key: VolumeKey): void {
    switch (key) {
      case 'music':
        this.playTone('music', 55, 55, 0.14, 'sawtooth', 0.22, 0.0);
        this.playTone('music', 65.41, 65.41, 0.14, 'sawtooth', 0.22, 0.14);
        this.playTone('music', 82.41, 82.41, 0.18, 'triangle', 0.24, 0.28);
        break;
      case 'engine':
        this.playTone('engine', 70, 135, 0.45, 'sawtooth', 0.3);
        this.playTone('engine', 140, 270, 0.45, 'triangle', 0.18);
        break;
      case 'weapons':
        this.shoot('pistol');
        break;
      case 'impacts':
        this.explosion();
        break;
      case 'pickups':
        this.pickupLoot(2);
        break;
      case 'ui':
        this.roomClear();
        break;
      case 'master':
      default:
        this.pickupItem();
        break;
    }
  }

  private applyVolume(key: VolumeKey): void {
    if (!this.actx) return;
    const now = this.actx.currentTime;
    if (key === 'master') {
      this.masterGain?.gain.setTargetAtTime(this.masterTarget(), now, 0.02);
      return;
    }
    this.buses[key]?.gain.setTargetAtTime(this.volumes[key], now, 0.02);
  }

  private saveVolumes(): void {
    try {
      this.storage.setItem(SAVE_KEY_AUDIO, JSON.stringify(this.volumes));
    } catch {
      // Fail-safe: storage unavailable (private mode / quota); keep in-memory values
    }
  }

  public toggleMute(): boolean {
    this.setMuted(!this.muted);
    if (!this.muted) {
      this.uiClick();
    }
    return this.muted;
  }

  /**
   * Stateful 5-gear transmission simulation for continuous motorcycle engine audio.
   */
  public updateEngine(
    speedRatio: number,
    isBoosting: boolean,
    paused: boolean,
    customDt?: number
  ): void {
    const nowMs = typeof performance !== 'undefined' ? performance.now() : Date.now();
    const dt = customDt !== undefined
      ? customDt
      : (this.lastEngineUpdateTime === 0 ? 0.016 : Math.min(0.1, (nowMs - this.lastEngineUpdateTime) / 1000));
    this.lastEngineUpdateTime = nowMs;

    // Handle idle vs moving
    let f1: number;
    let targetGain: number;

    if (speedRatio <= 0.08) {
      // Idle reset to 1st gear
      this.gear = 1;
      this.throttleTime = 0;
      this.shiftCutTimer = 0;
      this.lfoPhase += dt * 8.0 * Math.PI * 2; // 8 Hz gentle idle burble
      f1 = 44 + Math.sin(this.lfoPhase) * 2.0;
      targetGain = 0.025;
    } else {
      // Accelerating / Moving
      this.throttleTime += dt;

      // 5-gear threshold progression
      let targetGear = 1;
      if (this.throttleTime >= 4.10) {
        targetGear = 5;
      } else if (this.throttleTime >= 2.65) {
        targetGear = 4;
      } else if (this.throttleTime >= 1.50) {
        targetGear = 3;
      } else if (this.throttleTime >= 0.65) {
        targetGear = 2;
      }

      // Upshift trigger: 55ms throttle-cut dip
      if (targetGear > this.gear) {
        this.gear = targetGear;
        this.shiftCutTimer = 0.055;
      }

      if (this.shiftCutTimer > 0) {
        this.shiftCutTimer = Math.max(0, this.shiftCutTimer - dt);
      }

      // Gear RPM bands: entry RPM to max ~135 Hz
      const gearBands: Record<number, { entry: number; max: number; startT: number; endT: number }> = {
        1: { entry: 48, max: 132, startT: 0.00, endT: 0.65 },
        2: { entry: 62, max: 134, startT: 0.65, endT: 1.50 },
        3: { entry: 72, max: 135, startT: 1.50, endT: 2.65 },
        4: { entry: 80, max: 135, startT: 2.65, endT: 4.10 },
        5: { entry: 86, max: 135, startT: 4.10, endT: 6.00 }
      };

      const band = gearBands[this.gear] || gearBands[5];
      let p: number;
      if (this.gear === 5) {
        p = Math.min(1.0, speedRatio);
      } else {
        const span = band.endT - band.startT;
        p = Math.max(0, Math.min(1.0, (this.throttleTime - band.startT) / span));
      }

      const baseRpm = band.entry + (band.max - band.entry) * Math.pow(p, 0.88);

      // 16-32 Hz combustion cadence modulation (24 Hz)
      this.lfoPhase += dt * 24.0 * Math.PI * 2;
      const cadence = Math.sin(this.lfoPhase) * 3.5;

      // Cruising / top-gear throttle rev pulses
      const revPulse = this.gear === 5 ? Math.sin(this.throttleTime * 3.8) * 4.0 : 0;

      f1 = baseRpm + cadence + revPulse + (isBoosting ? 32 : 0);

      // Shift cut: momentary gain dip + pitch drop to new gear entry RPM
      if (this.shiftCutTimer > 0) {
        f1 = band.entry;
        targetGain = 0.012;
      } else {
        targetGain = 0.035 + (f1 / 140) * 0.055 + (isBoosting ? 0.040 : 0);
      }
    }

    const f2 = f1 * (isBoosting ? 2.5 : 2.0);
    const cutoff = Math.min(1800, f1 * 3.4 + (isBoosting ? 260 : 60));

    if (!this.actx || !this.engGain || !this.engOsc1 || !this.engOsc2 || !this.engFilter) {
      return;
    }

    const now = this.actx.currentTime;

    if (this.muted || paused) {
      this.engGain.gain.setTargetAtTime(0.0001, now, 0.06);
      return;
    }

    const tc = this.shiftCutTimer > 0 ? 0.015 : 0.04;
    this.engOsc1.frequency.setTargetAtTime(f1, now, tc);
    this.engOsc2.frequency.setTargetAtTime(f2, now, tc);
    this.engFilter.frequency.setTargetAtTime(cutoff, now, 0.05);
    this.engGain.gain.setTargetAtTime(targetGain, now, tc);

    // Procedural Synthwave / Outlaw Dark-Synth Bassline Groove (125 BPM eighth-note pulse, adaptive intensity)
    this.bgmStepTimer += dt;
    const stepInterval = this.musicIntensity === 'boss_phase2' ? 0.16 : 0.24;
    if (this.bgmStepTimer >= stepInterval) {
      this.bgmStepTimer -= stepInterval;
      const bassSequence = this.musicIntensity === 'boss_phase2'
        ? [55.0, 73.42, 65.41, 82.41, 55.0, 98.0, 82.41, 110.0]
        : [55.0, 55.0, 65.41, 55.0, 73.42, 65.41, 82.41, 73.42];
      const noteFreq = bassSequence[this.bgmStepIndex % bassSequence.length];
      this.bgmStepIndex = (this.bgmStepIndex + 1) % 16;
      if (this.volumes.music > 0.01) {
        const baseVol = this.musicIntensity === 'boss_phase2' ? 0.065 : (this.musicIntensity === 'combat' ? 0.055 : 0.045);
        this.playTone('music', noteFreq, noteFreq * 0.98, 0.16, 'sawtooth', baseVol);
        if (this.musicIntensity !== 'calm' || this.bgmStepIndex % 4 === 0) {
          const harmVol = this.musicIntensity === 'boss_phase2' ? 0.038 : 0.028;
          this.playTone('music', noteFreq * 2, noteFreq * 2, 0.11, 'triangle', harmVol);
        }
      }
    }
  }

  /**
   * Backwards-compatible alias for updateEngine.
   */
  public updateEngineHum(
    speedRatio: number,
    isBoosting: boolean,
    paused: boolean,
    customDt?: number
  ): void {
    this.updateEngine(speedRatio, isBoosting, paused, customDt);
  }

  /**
   * Returns current transmission diagnostics for verification and tests.
   */
  public getTransmission(): {
    gear: number;
    throttleTime: number;
    shiftCutTimer: number;
    lfoPhase: number;
  } {
    return {
      gear: this.gear,
      throttleTime: this.throttleTime,
      shiftCutTimer: this.shiftCutTimer,
      lfoPhase: this.lfoPhase
    };
  }

  private playTone(
    channel: VolumeChannel,
    freqStart: number,
    freqEnd: number,
    dur: number,
    type: OscillatorType = 'sine',
    vol: number = 0.25,
    delay: number = 0
  ): void {
    if (this.muted || !this.init() || !this.actx || !this.masterGain) return;

    try {
      const t0 = this.actx.currentTime + delay;
      const osc = this.actx.createOscillator();
      const g = this.actx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(Math.max(20, freqStart), t0);
      if (freqEnd !== freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + dur);
      }

      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

      osc.connect(g);
      g.connect(this.buses[channel] ?? this.masterGain);

      osc.start(t0);
      osc.stop(t0 + dur + 0.01);
    } catch {
      // Audio node failure fallback
    }
  }

  private playNoise(
    channel: VolumeChannel,
    dur: number,
    filterFreq: number = 1200,
    filterType: BiquadFilterType = 'bandpass',
    vol: number = 0.25,
    q: number = 1.0
  ): void {
    if (this.muted || !this.init() || !this.actx || !this.masterGain || !this.noiseBuffer) return;

    try {
      const t0 = this.actx.currentTime;
      const src = this.actx.createBufferSource();
      src.buffer = this.noiseBuffer;

      const flt = this.actx.createBiquadFilter();
      flt.type = filterType;
      flt.frequency.setValueAtTime(filterFreq, t0);
      flt.Q.value = q;

      const g = this.actx.createGain();
      g.gain.setValueAtTime(vol, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

      src.connect(flt);
      flt.connect(g);
      g.connect(this.buses[channel] ?? this.masterGain);

      src.start(t0, Math.random() * 0.5, dur + 0.02);
    } catch {
      // Audio node failure fallback
    }
  }

  // ==========================================================================
  // 17 PROCEDURAL SOUND ROUTINES
  // ==========================================================================

  public shoot(weaponId: WeaponId | string): void {
    if (this.muted || !this.init()) return;

    if (weaponId === 'pistol') {
      this.playTone('weapons', 520, 130, 0.09, 'triangle', 0.28);
      this.playNoise('weapons', 0.06, 1800, 'bandpass', 0.22, 1.2);
    } else if (weaponId === 'machine_gun') {
      const jitter = 0.94 + Math.random() * 0.12;
      this.playTone('weapons', 620 * jitter, 155, 0.065, 'sawtooth', 0.20);
      this.playNoise('weapons', 0.045, 2200, 'highpass', 0.16, 1.0);
    } else if (weaponId === 'flamethrower') {
      const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
      if (now - this.lastFlameSfx < 65) return;
      this.lastFlameSfx = now;
      this.playNoise('weapons', 0.14, 480 + Math.random() * 180, 'bandpass', 0.22, 0.7);
    } else if (weaponId === 'grenade_launcher') {
      this.playTone('weapons', 195, 58, 0.18, 'sine', 0.38);
      this.playNoise('weapons', 0.11, 520, 'lowpass', 0.24, 1.5);
    } else if (weaponId === 'shotgun') {
      this.playTone('weapons', 240, 48, 0.16, 'sawtooth', 0.36);
      this.playNoise('weapons', 0.15, 1100, 'lowpass', 0.38, 0.8);
    } else if (weaponId === 'railgun') {
      this.playTone('weapons', 1480, 170, 0.24, 'sawtooth', 0.30);
      this.playTone('weapons', 2200, 420, 0.18, 'sine', 0.22);
      this.playNoise('weapons', 0.12, 3200, 'bandpass', 0.18, 2.0);
    } else if (weaponId === 'arc_coil') {
      this.playTone('weapons', 780, 320, 0.13, 'sawtooth', 0.24);
      this.playTone('weapons', 1120, 1680, 0.09, 'square', 0.14);
      this.playNoise('weapons', 0.08, 3800, 'highpass', 0.18, 2.5);
    }
  }

  public arcChain(): void {
    this.playTone('weapons', 1350, 480, 0.09, 'square', 0.15);
    this.playNoise('weapons', 0.06, 4200, 'bandpass', 0.14, 3.0);
  }

  public explosion(): void {
    this.playTone('impacts', 115, 28, 0.38, 'sawtooth', 0.44);
    this.playNoise('impacts', 0.42, 380, 'lowpass', 0.48, 0.9);
  }

  public hit(isCrit: boolean = false): void {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    if (!isCrit && now - this.lastHitSfx < 45) return;
    this.lastHitSfx = now;

    if (isCrit) {
      this.playTone('impacts', 980, 1520, 0.09, 'triangle', 0.26);
      this.playTone('impacts', 620, 310, 0.07, 'sine', 0.20);
    } else {
      this.playTone('impacts', 210, 95, 0.045, 'triangle', 0.14);
    }
  }

  public enemyKill(isBoss: boolean = false): void {
    if (isBoss) {
      this.explosion();
      this.playTone('impacts', 261.6, 523.2, 0.22, 'triangle', 0.28, 0.08);
      this.playTone('impacts', 329.6, 659.2, 0.25, 'triangle', 0.28, 0.18);
      this.playTone('impacts', 392.0, 784.0, 0.35, 'triangle', 0.32, 0.28);
    } else {
      this.playTone('impacts', 310, 110, 0.08, 'sine', 0.18);
      this.playNoise('impacts', 0.06, 900, 'bandpass', 0.14, 1.2);
    }
  }

  public playerHurt(): void {
    this.playTone('impacts', 185, 55, 0.26, 'sawtooth', 0.38);
    this.playNoise('impacts', 0.18, 650, 'lowpass', 0.32, 1.4);
  }

  public gameOverSound(): void {
    this.playTone('ui', 240, 160, 0.22, 'sawtooth', 0.30, 0.0);
    this.playTone('ui', 180, 115, 0.24, 'sawtooth', 0.30, 0.18);
    this.playTone('ui', 130, 52,  0.48, 'sawtooth', 0.35, 0.36);
  }

  public pickupFuel(): void {
    this.playTone('pickups', 380, 580, 0.09, 'sine', 0.22, 0.0);
    this.playTone('pickups', 580, 780, 0.12, 'sine', 0.24, 0.07);
  }

  public pickupItem(): void {
    this.playTone('pickups', 523.25, 659.25, 0.09, 'triangle', 0.22, 0.0);
    this.playTone('pickups', 659.25, 783.99, 0.10, 'triangle', 0.22, 0.07);
    this.playTone('pickups', 783.99, 1046.5, 0.18, 'triangle', 0.25, 0.14);
  }

  public pickupLoot(rarityIdx: number = 0): void {
    const base = 440 + rarityIdx * 90;
    this.playTone('pickups', base, base * 1.25, 0.10, 'triangle', 0.24, 0.0);
    this.playTone('pickups', base * 1.25, base * 1.5, 0.12, 'triangle', 0.26, 0.08);
    this.playTone('pickups', base * 1.5, base * 2.0, 0.22, 'triangle', 0.28, 0.16);
  }

  public shopBuy(): void {
    this.playTone('pickups', 587.3, 880, 0.09, 'triangle', 0.25, 0.0);
    this.playTone('pickups', 880, 1174.6, 0.16, 'triangle', 0.28, 0.08);
  }

  public shopError(): void {
    this.playTone('pickups', 160, 120, 0.10, 'sawtooth', 0.22, 0.0);
    this.playTone('pickups', 135, 95,  0.14, 'sawtooth', 0.22, 0.11);
  }

  public roomClear(): void {
    this.playTone('ui', 440, 440, 0.12, 'triangle', 0.20, 0.0);
    this.playTone('ui', 554.37, 554.37, 0.12, 'triangle', 0.20, 0.09);
    this.playTone('ui', 659.25, 659.25, 0.24, 'triangle', 0.24, 0.18);
  }

  public doorTransition(): void {
    this.playTone('ui', 220, 340, 0.09, 'sine', 0.15);
  }

  public nextFloor(): void {
    this.playTone('ui', 420, 140, 0.32, 'sine', 0.26, 0.0);
    this.playTone('ui', 560, 210, 0.32, 'triangle', 0.22, 0.06);
  }

  public uiClick(): void {
    this.playTone('ui', 720, 480, 0.035, 'triangle', 0.14);
  }

  /**
   * Crisp electric near-miss zap (high-frequency triangle/sine sweep 920Hz -> 1680Hz over 0.07s).
   */
  public graze(): void {
    if (this.muted || !this.init() || !this.actx) return;
    this.playTone('impacts', 920, 1680, 0.07, 'triangle', 0.22);
    this.playTone('impacts', 920, 1680, 0.07, 'sine', 0.16);
  }

  /**
   * Turbo blow-off valve + power chord burst (240Hz -> 640Hz sawtooth + noise burst over 0.18s).
   */
  public driftBoost(): void {
    if (this.muted || !this.init() || !this.actx) return;
    this.playTone('engine', 240, 640, 0.18, 'sawtooth', 0.28);
    this.playTone('engine', 360, 960, 0.18, 'sawtooth', 0.16);
    this.playNoise('engine', 0.18, 2800, 'bandpass', 0.20, 1.4);
  }

  /**
   * Deep menacing boss alarm siren (140Hz -> 95Hz -> 220Hz sawtooth over 0.35s).
   */
  public phaseEnrage(): void {
    if (this.muted || !this.init() || !this.actx || !this.masterGain) return;
    try {
      const t0 = this.actx.currentTime;
      const dur = 0.35;
      const osc = this.actx.createOscillator();
      const g = this.actx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(140, t0);
      osc.frequency.exponentialRampToValueAtTime(95, t0 + 0.14);
      osc.frequency.exponentialRampToValueAtTime(220, t0 + dur);

      g.gain.setValueAtTime(0.35, t0);
      g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);

      osc.connect(g);
      g.connect(this.buses.ui ?? this.masterGain);

      osc.start(t0);
      osc.stop(t0 + dur + 0.01);
    } catch {
      // Audio node failure fallback
    }
  }

  /**
   * Ascending arcade combo chime whose pitch scales with streakCount (440Hz * Math.min(2.0, 1 + streakCount * 0.08)).
   */
  public killStreak(streakCount: number = 3): void {
    if (this.muted || !this.init() || !this.actx) return;
    const count = Number.isFinite(streakCount) ? Math.max(0, streakCount) : 3;
    const f0 = 440 * Math.min(2.0, 1 + count * 0.08);
    this.playTone('ui', f0, f0 * 1.25, 0.09, 'triangle', 0.24, 0.0);
    this.playTone('ui', f0 * 1.25, f0 * 1.5, 0.10, 'triangle', 0.24, 0.07);
    this.playTone('ui', f0 * 1.5, f0 * 2.0, 0.16, 'triangle', 0.26, 0.14);
  }

  /**
   * Metallic pedestal lock-in clank (520Hz -> 780Hz square/triangle chime over 0.12s).
   */
  public choiceLock(): void {
    if (this.muted || !this.init() || !this.actx) return;
    this.playTone('ui', 520, 780, 0.12, 'square', 0.18, 0.0);
    this.playTone('ui', 520, 780, 0.12, 'triangle', 0.24, 0.0);
    this.playNoise('ui', 0.04, 3200, 'bandpass', 0.12, 2.0);
  }

  /**
   * Celebratory 4-note ascending synth arpeggio (523.25Hz -> 659.25Hz -> 783.99Hz -> 1046.50Hz, triangle + sine harmonic)
   * routed through 'ui' volume channel, respecting this.muted and this.getEffectiveVolume('ui').
   */
  public masteryUp(): void {
    if (this.muted || this.getEffectiveVolume('ui') <= 0 || !this.init() || !this.actx) return;

    const notes = [523.25, 659.25, 783.99, 1046.50];
    const stepDelay = 0.075;
    const noteDur = 0.15;

    notes.forEach((freq, idx) => {
      const delay = idx * stepDelay;
      const isFinal = idx === notes.length - 1;
      const dur = isFinal ? 0.30 : noteDur;
      // Primary triangle synth lead
      this.playTone('ui', freq, freq, dur, 'triangle', 0.24, delay);
      // Sine harmonic overtone
      this.playTone('ui', freq * 2, freq * 2, dur * 0.85, 'sine', 0.14, delay);
    });
  }

  /**
   * Plays a crisp 2-tone hydraulic latch + neon terminal chime (440Hz -> 660Hz triangle/sine)
   * when opening a Sanctuary [E] station interface.
   */
  public stationOpen(): void {
    if (this.muted || this.getEffectiveVolume('ui') <= 0 || !this.init() || !this.actx) return;

    // Tone 1: Hydraulic latch / first tone (440Hz triangle + sine) + soft mechanical latch noise
    this.playTone('ui', 440, 440, 0.09, 'triangle', 0.22, 0.0);
    this.playTone('ui', 440, 440, 0.09, 'sine', 0.16, 0.0);
    this.playNoise('ui', 0.035, 2400, 'bandpass', 0.08, 1.5);

    // Tone 2: Neon terminal chime (660Hz triangle + sine)
    this.playTone('ui', 660, 660, 0.16, 'triangle', 0.24, 0.08);
    this.playTone('ui', 660, 660, 0.16, 'sine', 0.16, 0.08);
  }

  /**
   * Plays a pitch-scaled warning synth blip (300 + clampedHeat * 110 Hz sawtooth/square)
   * when cycling Pact of Heat (0..3).
   */
  public heatToggle(heatLevel: number): void {
    if (this.muted || this.getEffectiveVolume('ui') <= 0 || !this.init() || !this.actx) return;

    const clampedHeat = Number.isFinite(heatLevel) ? Math.max(0, Math.min(3, Math.round(heatLevel))) : 0;
    const freq = 300 + clampedHeat * 110;

    this.playTone('ui', freq, freq * 0.95, 0.08, 'sawtooth', 0.22, 0.0);
    this.playTone('ui', freq, freq, 0.08, 'square', 0.14, 0.0);
  }
}

/**
 * Default global singleton AudioService instance.
 */
export const SFX: AudioService = new SoundSynthesizer();
export { SoundSynthesizer as SoundManager };
