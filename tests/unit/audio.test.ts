/**
 * Unit Tests: Procedural Web Audio Sound Synthesizer & Engine Audio Math
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  SoundSynthesizer,
  calculateEngineParams,
  SFX
} from '../../src/audio/sfx';
import { SafeLocalStorage } from '../../src/core/state';
import { SAVE_KEY_MUTED, WeaponId } from '../../src/types/game';

describe('Web Audio Procedural Synthesizer', () => {
  let mockStorage: SafeLocalStorage;

  beforeEach(() => {
    mockStorage = new SafeLocalStorage();
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
});
