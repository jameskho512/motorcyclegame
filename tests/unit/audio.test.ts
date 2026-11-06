/**
 * Unit Tests: Procedural Web Audio Sound Synthesizer & Engine Audio Math
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SoundSynthesizer,
  calculateEngineParams,
  SFX,
  sanitizeVolumeSettings,
  effectiveGain,
  DEFAULT_VOLUME_SETTINGS,
  SAVE_KEY_AUDIO,
  SOUND_CHANNEL_MAP,
  VOLUME_CHANNELS
} from '../../src/audio/sfx';
import { SafeLocalStorage } from '../../src/core/state';
import { SAVE_KEY_MUTED, WeaponId } from '../../src/types/game';

describe('Web Audio Procedural Synthesizer', () => {
  let mockStorage: SafeLocalStorage;

  beforeEach(() => {
    mockStorage = new SafeLocalStorage();
    mockStorage.clear();
  });

  describe('Engine Hum Physics & Audio Math', () => {
    it('calculates correct idle engine parameters (speedRatio = 0, no boost)', () => {
      const params = calculateEngineParams(0, false, false, false);
      expect(params.f1).toBe(44);
      expect(params.f2).toBe(88); // f1 * 2.0
      expect(params.cutoff).toBe(160);
      expect(params.gain).toBeCloseTo(0.025);
    });

    it('calculates full throttle cruising parameters (speedRatio = 1.0, no boost)', () => {
      const params = calculateEngineParams(1.0, false, false, false);
      expect(params.f1).toBe(100); // 44 + 56
      expect(params.f2).toBe(200); // 100 * 2.0
      expect(params.cutoff).toBe(400); // 160 + 240
      expect(params.gain).toBeCloseTo(0.080); // 0.025 + 0.055
    });

    it('calculates full NOS boosting parameters (speedRatio = 1.0, isBoosting = true)', () => {
      const params = calculateEngineParams(1.0, true, false, false);
      expect(params.f1).toBe(136); // 44 + 56 + 36
      expect(params.f2).toBe(340); // 136 * 2.5
      expect(params.cutoff).toBe(660); // 160 + 240 + 260
      expect(params.gain).toBeCloseTo(0.125); // 0.025 + 0.055 + 0.045
    });

    it('clamps engine gain to 0.0001 when game is paused or audio is muted', () => {
      const pausedParams = calculateEngineParams(1.0, true, true, false);
      expect(pausedParams.gain).toBe(0.0001);

      const mutedParams = calculateEngineParams(1.0, true, false, true);
      expect(mutedParams.gain).toBe(0.0001);
    });
  });

  describe('Audio Service Lifecycle & Mute Persistence', () => {
    it('initializes with mute state loaded from storage key moto_rogue_muted', () => {
      mockStorage.setItem(SAVE_KEY_MUTED, '1');
      const sfx = new SoundSynthesizer(mockStorage);
      expect(sfx.isMuted()).toBe(true);

      mockStorage.setItem(SAVE_KEY_MUTED, '0');
      const unmutedSfx = new SoundSynthesizer(mockStorage);
      expect(unmutedSfx.isMuted()).toBe(false);
    });

    it('toggles mute and persists state to storage', () => {
      const sfx = new SoundSynthesizer(mockStorage);
      expect(sfx.isMuted()).toBe(false);

      const mutedState = sfx.toggleMute();
      expect(mutedState).toBe(true);
      expect(sfx.isMuted()).toBe(true);
      expect(mockStorage.getItem(SAVE_KEY_MUTED)).toBe('1');

      sfx.toggleMute();
      expect(sfx.isMuted()).toBe(false);
      expect(mockStorage.getItem(SAVE_KEY_MUTED)).toBe('0');
    });

    it('handles headless environment gracefully without throwing on init()', () => {
      const sfx = new SoundSynthesizer(mockStorage);
      const initialized = sfx.init();
      expect(typeof initialized).toBe('boolean');
    });
  });

  describe('Procedural SFX Execution (All 17 Audio Routines)', () => {
    it('executes all 7 weapon shoot sound routines safely without error', () => {
      const sfx = new SoundSynthesizer(mockStorage);
      const weapons: WeaponId[] = [
        'pistol',
        'machine_gun',
        'flamethrower',
        'grenade_launcher',
        'shotgun',
        'railgun',
        'arc_coil'
      ];

      for (const w of weapons) {
        expect(() => sfx.shoot(w)).not.toThrow();
      }
    });

    it('executes remaining 10 procedural sound routines safely without error', () => {
      const sfx = new SoundSynthesizer(mockStorage);

      expect(() => sfx.arcChain()).not.toThrow();
      expect(() => sfx.explosion()).not.toThrow();
      expect(() => sfx.hit(false)).not.toThrow();
      expect(() => sfx.hit(true)).not.toThrow();
      expect(() => sfx.enemyKill(false)).not.toThrow();
      expect(() => sfx.enemyKill(true)).not.toThrow();
      expect(() => sfx.playerHurt()).not.toThrow();
      expect(() => sfx.gameOverSound()).not.toThrow();
      expect(() => sfx.pickupFuel()).not.toThrow();
      expect(() => sfx.pickupItem()).not.toThrow();
      expect(() => sfx.pickupLoot(0)).not.toThrow();
      expect(() => sfx.pickupLoot(3)).not.toThrow();
      expect(() => sfx.shopBuy()).not.toThrow();
      expect(() => sfx.shopError()).not.toThrow();
      expect(() => sfx.roomClear()).not.toThrow();
      expect(() => sfx.doorTransition()).not.toThrow();
      expect(() => sfx.nextFloor()).not.toThrow();
      expect(() => sfx.uiClick()).not.toThrow();
      expect(() => sfx.updateEngine(0.5, false, false)).not.toThrow();
    });

    it('global singleton SFX is instantiated and implements AudioService', () => {
      expect(SFX).toBeDefined();
      expect(typeof SFX.shoot).toBe('function');
      expect(typeof SFX.updateEngine).toBe('function');
      expect(typeof SFX.toggleMute).toBe('function');
      expect(typeof (SFX as unknown as { graze: unknown }).graze).toBe('function');
      expect(typeof (SFX as unknown as { driftBoost: unknown }).driftBoost).toBe('function');
      expect(typeof (SFX as unknown as { phaseEnrage: unknown }).phaseEnrage).toBe('function');
      expect(typeof (SFX as unknown as { killStreak: unknown }).killStreak).toBe('function');
      expect(typeof (SFX as unknown as { choiceLock: unknown }).choiceLock).toBe('function');
    });

    it('executes 5 new procedural sound routines safely without error when uninitialized', () => {
      const sfx = new SoundSynthesizer(mockStorage);
      const extSfx = sfx as unknown as {
        graze: () => void;
        driftBoost: () => void;
        phaseEnrage: () => void;
        killStreak: (count?: number) => void;
        choiceLock: () => void;
      };

      expect(() => extSfx.graze()).not.toThrow();
      expect(() => extSfx.driftBoost()).not.toThrow();
      expect(() => extSfx.phaseEnrage()).not.toThrow();
      expect(() => extSfx.killStreak()).not.toThrow();
      expect(() => extSfx.killStreak(5)).not.toThrow();
      expect(() => extSfx.choiceLock()).not.toThrow();
    });
  });

  describe('New Audio Synthesizer Routines (TDD Verification)', () => {
    it('executes all 5 new methods when AudioContext is mocked and active', () => {
      interface FakeParam {
        value: number;
        setTargetAtTime: ReturnType<typeof vi.fn>;
        setValueAtTime: ReturnType<typeof vi.fn>;
        exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
      }
      interface FakeNode {
        type?: string;
        frequency?: FakeParam;
        gain?: FakeParam;
        connect: ReturnType<typeof vi.fn>;
        start?: ReturnType<typeof vi.fn>;
        stop?: ReturnType<typeof vi.fn>;
      }

      const param = (): FakeParam => ({
        value: 0,
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn()
      });

      const oscillators: FakeNode[] = [];
      const gains: FakeNode[] = [];

      class MockAC {
        state = 'running';
        currentTime = 10.0;
        sampleRate = 44100;
        destination = { name: 'dest' };
        createGain = vi.fn(() => {
          const n: FakeNode = { gain: param(), connect: vi.fn() };
          gains.push(n);
          return n;
        });
        createOscillator = vi.fn(() => {
          const n: FakeNode = {
            type: 'sine',
            frequency: param(),
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn()
          };
          oscillators.push(n);
          return n;
        });
        createBiquadFilter = vi.fn(() => ({
          type: 'lowpass',
          frequency: param(),
          Q: { value: 1 },
          connect: vi.fn()
        }));
        createBuffer = vi.fn(() => ({ getChannelData: () => new Float32Array(150) }));
        createBufferSource = vi.fn(() => ({ buffer: null, connect: vi.fn(), start: vi.fn() }));
        resume = vi.fn().mockResolvedValue(undefined);
      }

      const g = globalThis as unknown as { AudioContext?: unknown };
      const originalAC = g.AudioContext;
      g.AudioContext = MockAC;

      try {
        const sfx = new SoundSynthesizer(mockStorage);
        expect(sfx.init()).toBe(true);

        const extSfx = sfx as unknown as {
          graze: () => void;
          driftBoost: () => void;
          phaseEnrage: () => void;
          killStreak: (count?: number) => void;
          choiceLock: () => void;
        };

        const oscCountBefore = oscillators.length;

        // 1. graze
        extSfx.graze();
        expect(oscillators.length).toBeGreaterThan(oscCountBefore);
        const grazeOscs = oscillators.slice(oscCountBefore);
        expect(grazeOscs.some(o => o.type === 'triangle' || o.type === 'sine')).toBe(true);

        // 2. driftBoost
        const oscBeforeDrift = oscillators.length;
        extSfx.driftBoost();
        expect(oscillators.length).toBeGreaterThan(oscBeforeDrift);
        const driftOscs = oscillators.slice(oscBeforeDrift);
        expect(driftOscs.some(o => o.type === 'sawtooth')).toBe(true);

        // 3. phaseEnrage
        const oscBeforeEnrage = oscillators.length;
        extSfx.phaseEnrage();
        expect(oscillators.length).toBeGreaterThan(oscBeforeEnrage);
        const enrageOscs = oscillators.slice(oscBeforeEnrage);
        expect(enrageOscs.some(o => o.type === 'sawtooth')).toBe(true);

        // 4. killStreak (custom count)
        const oscBeforeStreak = oscillators.length;
        extSfx.killStreak(4);
        expect(oscillators.length).toBeGreaterThan(oscBeforeStreak);

        // 5. choiceLock
        const oscBeforeChoice = oscillators.length;
        extSfx.choiceLock();
        expect(oscillators.length).toBeGreaterThan(oscBeforeChoice);

        // Mute verification: when muted, no new oscillators or sounds should be scheduled
        sfx.setMuted(true);
        const oscCountMuted = oscillators.length;
        extSfx.graze();
        extSfx.driftBoost();
        extSfx.phaseEnrage();
        extSfx.killStreak(10);
        extSfx.choiceLock();
        expect(oscillators.length).toBe(oscCountMuted);
      } finally {
        g.AudioContext = originalAC;
      }
    });

    it('killStreak scales starting frequency according to 440Hz * min(2.0, 1 + streak * 0.08)', () => {
      interface FakeParam {
        value: number;
        setTargetAtTime: ReturnType<typeof vi.fn>;
        setValueAtTime: ReturnType<typeof vi.fn>;
        exponentialRampToValueAtTime: ReturnType<typeof vi.fn>;
      }
      interface FakeNode {
        type?: string;
        frequency?: FakeParam;
        gain?: FakeParam;
        connect: ReturnType<typeof vi.fn>;
        start?: ReturnType<typeof vi.fn>;
        stop?: ReturnType<typeof vi.fn>;
      }

      const param = (): FakeParam => ({
        value: 0,
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn()
      });

      const oscillators: FakeNode[] = [];

      class MockAC {
        state = 'running';
        currentTime = 0;
        sampleRate = 44100;
        destination = {};
        createGain = vi.fn(() => ({ gain: param(), connect: vi.fn() }));
        createOscillator = vi.fn(() => {
          const n: FakeNode = {
            type: 'sine',
            frequency: param(),
            connect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn()
          };
          oscillators.push(n);
          return n;
        });
        createBiquadFilter = vi.fn(() => ({
          type: 'lowpass',
          frequency: param(),
          Q: { value: 1 },
          connect: vi.fn()
        }));
        createBuffer = vi.fn(() => ({ getChannelData: () => new Float32Array(150) }));
        createBufferSource = vi.fn(() => ({ buffer: null, connect: vi.fn(), start: vi.fn() }));
        resume = vi.fn().mockResolvedValue(undefined);
      }

      const g = globalThis as unknown as { AudioContext?: unknown };
      const originalAC = g.AudioContext;
      g.AudioContext = MockAC;

      try {
        const sfx = new SoundSynthesizer(mockStorage);
        sfx.init();

        const extSfx = sfx as unknown as { killStreak: (count?: number) => void };

        // Test default streak count = 3: 440 * (1 + 3 * 0.08) = 440 * 1.24 = 545.6
        const oscBefore3 = oscillators.length;
        extSfx.killStreak();
        const streak3Osc = oscillators[oscBefore3];
        expect(streak3Osc.frequency?.setValueAtTime).toHaveBeenCalledWith(
          expect.closeTo(545.6, 1),
          expect.any(Number)
        );

        // Test streak count = 0: 440 * (1 + 0) = 440
        const oscBefore0 = oscillators.length;
        extSfx.killStreak(0);
        const streak0Osc = oscillators[oscBefore0];
        expect(streak0Osc.frequency?.setValueAtTime).toHaveBeenCalledWith(
          expect.closeTo(440, 1),
          expect.any(Number)
        );

        // Test streak count = 25 (clamped to 2.0x): 440 * 2.0 = 880
        const oscBefore25 = oscillators.length;
        extSfx.killStreak(25);
        const streak25Osc = oscillators[oscBefore25];
        expect(streak25Osc.frequency?.setValueAtTime).toHaveBeenCalledWith(
          expect.closeTo(880, 1),
          expect.any(Number)
        );
      } finally {
        g.AudioContext = originalAC;
      }
    });
  });

  describe('Mocked Web Audio Context Integration', () => {
    it('connects audio graph and initializes master gain when AudioContext is present', () => {
      const mockGainNode = {
        gain: {
          value: 0,
          setTargetAtTime: vi.fn(),
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn()
        },
        connect: vi.fn()
      };

      const mockOscillator = {
        type: 'sine',
        frequency: {
          value: 0,
          setTargetAtTime: vi.fn(),
          setValueAtTime: vi.fn(),
          exponentialRampToValueAtTime: vi.fn()
        },
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn()
      };

      const mockFilter = {
        type: 'lowpass',
        frequency: {
          value: 0,
          setTargetAtTime: vi.fn(),
          setValueAtTime: vi.fn()
        },
        Q: { value: 1 },
        connect: vi.fn()
      };

      const mockBuffer = {
        getChannelData: vi.fn(() => new Float32Array(100))
      };

      class MockAudioContext {
        state = 'running';
        currentTime = 0;
        sampleRate = 44100;
        destination = {};
        createGain = vi.fn(() => ({ ...mockGainNode }));
        createOscillator = vi.fn(() => ({ ...mockOscillator }));
        createBiquadFilter = vi.fn(() => ({ ...mockFilter }));
        createBuffer = vi.fn(() => mockBuffer);
        resume = vi.fn().mockResolvedValue(undefined);
      }

      // Temporarily inject MockAudioContext
      const originalAC = (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
      (globalThis as unknown as { AudioContext?: unknown }).AudioContext = MockAudioContext;

      try {
        const sfx = new SoundSynthesizer(mockStorage);
        const res = sfx.init();
        expect(res).toBe(true);

        sfx.updateEngine(0.8, true, false);
        sfx.setMuted(true);
        expect(sfx.isMuted()).toBe(true);
      } finally {
        (globalThis as unknown as { AudioContext?: unknown }).AudioContext = originalAC;
      }
    });
  });

  describe('Per-Category Volume Mixer', () => {
    it('sanitizeVolumeSettings returns defaults for garbage and never throws', () => {
      expect(sanitizeVolumeSettings(undefined)).toEqual(DEFAULT_VOLUME_SETTINGS);
      expect(sanitizeVolumeSettings(null)).toEqual(DEFAULT_VOLUME_SETTINGS);
      expect(sanitizeVolumeSettings('{not json')).toEqual(DEFAULT_VOLUME_SETTINGS);
      expect(sanitizeVolumeSettings(42)).toEqual(DEFAULT_VOLUME_SETTINGS);
      expect(sanitizeVolumeSettings([1, 2])).toEqual(DEFAULT_VOLUME_SETTINGS);
    });

    it('sanitizeVolumeSettings clamps to 0..1, ignores non-finite, and parses JSON strings', () => {
      const s = sanitizeVolumeSettings({ master: 2, engine: -1, weapons: 0.5, impacts: 'x', pickups: NaN, ui: 0.25 });
      expect(s).toEqual({ master: 1, music: 0.75, engine: 0, weapons: 0.5, impacts: 1, pickups: 1, ui: 0.25 });
      const fromStr = sanitizeVolumeSettings(JSON.stringify({ weapons: 0.3 }));
      expect(fromStr.weapons).toBeCloseTo(0.3);
      expect(fromStr.master).toBe(1);
    });

    it('effectiveGain multiplies master by channel and returns 0 when muted', () => {
      const s = { ...DEFAULT_VOLUME_SETTINGS, master: 0.5, weapons: 0.4 };
      expect(effectiveGain('weapons', s)).toBeCloseTo(0.2);
      expect(effectiveGain('master', s)).toBeCloseTo(0.5);
      expect(effectiveGain('weapons', s, true)).toBe(0);
    });

    it('maps every public sound method to exactly one channel', () => {
      const methods = [
        'updateEngine', 'updateEngineHum', 'shoot', 'arcChain', 'explosion', 'hit', 'enemyKill',
        'playerHurt', 'gameOverSound', 'pickupFuel', 'pickupItem', 'pickupLoot', 'shopBuy',
        'shopError', 'roomClear', 'doorTransition', 'nextFloor', 'uiClick',
        'graze', 'driftBoost', 'phaseEnrage', 'killStreak', 'choiceLock'
      ];
      for (const m of methods) {
        expect(VOLUME_CHANNELS).toContain(SOUND_CHANNEL_MAP[m]);
      }
      expect(Object.keys(SOUND_CHANNEL_MAP).sort()).toEqual([...methods].sort());
      expect(SOUND_CHANNEL_MAP.shoot).toBe('weapons');
      expect(SOUND_CHANNEL_MAP.hit).toBe('impacts');
      expect(SOUND_CHANNEL_MAP.graze).toBe('impacts');
      expect(SOUND_CHANNEL_MAP.driftBoost).toBe('engine');
      expect(SOUND_CHANNEL_MAP.phaseEnrage).toBe('ui');
      expect(SOUND_CHANNEL_MAP.killStreak).toBe('ui');
      expect(SOUND_CHANNEL_MAP.choiceLock).toBe('ui');
      expect(SOUND_CHANNEL_MAP.shopBuy).toBe('pickups');
      expect(SOUND_CHANNEL_MAP.doorTransition).toBe('ui');
      expect(SOUND_CHANNEL_MAP.updateEngine).toBe('engine');
    });

    it('loads, sets, persists and resets volumes via injected storage', () => {
      mockStorage.setItem(SAVE_KEY_AUDIO, JSON.stringify({ master: 0.8, engine: 0.1 }));
      const sfx = new SoundSynthesizer(mockStorage);
      expect(sfx.getVolumes().master).toBeCloseTo(0.8);
      expect(sfx.getVolumes().engine).toBeCloseTo(0.1);

      sfx.setVolume('weapons', 0.35);
      sfx.setVolume('ui', 5);
      const saved = JSON.parse(mockStorage.getItem(SAVE_KEY_AUDIO) as string);
      expect(saved.weapons).toBeCloseTo(0.35);
      expect(saved.ui).toBe(1);
      expect(Object.keys(saved).sort()).toEqual(['engine', 'impacts', 'master', 'music', 'pickups', 'ui', 'weapons']);

      sfx.resetVolumes();
      expect(sfx.getVolumes()).toEqual(DEFAULT_VOLUME_SETTINGS);
      expect(JSON.parse(mockStorage.getItem(SAVE_KEY_AUDIO) as string)).toEqual(DEFAULT_VOLUME_SETTINGS);
    });

    it('tolerates corrupt stored JSON and throwing storage', () => {
      mockStorage.setItem(SAVE_KEY_AUDIO, '{{{');
      expect(new SoundSynthesizer(mockStorage).getVolumes()).toEqual(DEFAULT_VOLUME_SETTINGS);

      const throwing = {
        getItem: () => { throw new Error('denied'); },
        setItem: () => { throw new Error('denied'); },
        removeItem: () => { throw new Error('denied'); }
      } as unknown as SafeLocalStorage;
      const sfx = new SoundSynthesizer(throwing);
      expect(sfx.getVolumes()).toEqual(DEFAULT_VOLUME_SETTINGS);
      expect(() => sfx.setVolume('master', 0.5)).not.toThrow();
      expect(sfx.getVolumes().master).toBe(0.5);
    });

    it('mute is independent of slider values', () => {
      const sfx = new SoundSynthesizer(mockStorage);
      sfx.setVolume('weapons', 0.3);
      sfx.toggleMute();
      expect(sfx.isMuted()).toBe(true);
      expect(sfx.getVolumes().weapons).toBeCloseTo(0.3);
      sfx.toggleMute();
      expect(sfx.isMuted()).toBe(false);
      expect(sfx.getVolumes().weapons).toBeCloseTo(0.3);
    });

    it('routes engine chain and SFX through per-channel bus gains into master', () => {
      interface FakeParam { value: number; setTargetAtTime: ReturnType<typeof vi.fn>; setValueAtTime: ReturnType<typeof vi.fn>; exponentialRampToValueAtTime: ReturnType<typeof vi.fn> }
      interface FakeNode { gain: FakeParam; connect: ReturnType<typeof vi.fn> }
      const param = (): FakeParam => ({
        value: 0,
        setTargetAtTime: vi.fn(),
        setValueAtTime: vi.fn(),
        exponentialRampToValueAtTime: vi.fn()
      });
      const gains: FakeNode[] = [];
      class MockAC {
        state = 'running';
        currentTime = 0;
        sampleRate = 100;
        destination = { name: 'dest' };
        createGain = vi.fn(() => {
          const n: FakeNode = { gain: param(), connect: vi.fn() };
          gains.push(n);
          return n;
        });
        createOscillator = vi.fn(() => ({ type: 'sine', frequency: param(), connect: vi.fn(), start: vi.fn(), stop: vi.fn() }));
        createBiquadFilter = vi.fn(() => ({ type: 'lowpass', frequency: param(), Q: { value: 1 }, connect: vi.fn() }));
        createBuffer = vi.fn(() => ({ getChannelData: () => new Float32Array(150) }));
        createBufferSource = vi.fn(() => ({ buffer: null, connect: vi.fn(), start: vi.fn() }));
        resume = vi.fn().mockResolvedValue(undefined);
      }
      const g = globalThis as unknown as { AudioContext?: unknown };
      const originalAC = g.AudioContext;
      g.AudioContext = MockAC;
      try {
        mockStorage.setItem(SAVE_KEY_AUDIO, JSON.stringify({ master: 0.5, weapons: 0.25 }));
        const sfx = new SoundSynthesizer(mockStorage);
        expect(sfx.init()).toBe(true);

        const master = gains[0];
        expect(master.gain.value).toBeCloseTo(0.38 * 0.5);
        const buses = gains.filter((n) => n.connect.mock.calls.some((c) => c[0] === master));
        expect(buses.length).toBe(6);
        expect(buses.map((b) => b.gain.value).sort()).toEqual([0.25, 0.75, 1, 1, 1, 1]);
        const weaponsBus = buses.find((b) => b.gain.value === 0.25) as FakeNode;

        // engine gain must feed the engine bus, not master directly
        const nonBus = gains.filter((n) => n !== master && !buses.includes(n));
        const engGain = nonBus[0];
        expect(engGain.connect.mock.calls[0][0]).not.toBe(master);
        expect(buses).toContain(engGain.connect.mock.calls[0][0]);

        const before = gains.length;
        sfx.shoot('pistol');
        const newNodes = gains.slice(before);
        expect(newNodes.length).toBeGreaterThan(0);
        for (const n of newNodes) expect(n.connect.mock.calls[0][0]).toBe(weaponsBus);

        sfx.setVolume('weapons', 0.6);
        expect(weaponsBus.gain.setTargetAtTime).toHaveBeenCalledWith(0.6, 0, expect.any(Number));
        sfx.setVolume('master', 1);
        expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0.38, 0, expect.any(Number));
        sfx.setMuted(true);
        expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, expect.any(Number));
        sfx.setVolume('master', 0.7);
        // muted: master stays silenced, but value is stored
        expect(master.gain.setTargetAtTime).toHaveBeenLastCalledWith(0, 0, expect.any(Number));
        expect(sfx.getVolumes().master).toBeCloseTo(0.7);

        expect(() => sfx.playTest('engine')).not.toThrow();
        expect(() => sfx.playTest('master')).not.toThrow();
      } finally {
        g.AudioContext = originalAC;
      }
    });
  });
});
