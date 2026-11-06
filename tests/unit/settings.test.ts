/**
 * Unit Tests: Settings overlay (audio mixer) controller + input routing for settings hotkeys.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SettingsController, SettingsAudioPort, ScreenShakeLevel } from '../../src/ui/settings';
import { InputManager } from '../../src/core/input';
import { DEFAULT_VOLUME_SETTINGS, VolumeKey, VolumeSettings } from '../../src/audio/sfx';

function makePort(): SettingsAudioPort & {
  vols: VolumeSettings;
  muted: boolean;
  setVolume: ReturnType<typeof vi.fn>;
  playTest: ReturnType<typeof vi.fn>;
  resetVolumes: ReturnType<typeof vi.fn>;
  setMuted: ReturnType<typeof vi.fn>;
} {
  const port = {
    vols: { ...DEFAULT_VOLUME_SETTINGS },
    muted: false,
    getVolumes(): VolumeSettings {
      return { ...port.vols };
    },
    setVolume: vi.fn((k: VolumeKey, v: number) => {
      port.vols[k] = v;
    }),
    resetVolumes: vi.fn(() => {
      port.vols = { ...DEFAULT_VOLUME_SETTINGS };
    }),
    isMuted(): boolean {
      return port.muted;
    },
    setMuted: vi.fn((m: boolean) => {
      port.muted = m;
    }),
    playTest: vi.fn()
  };
  return port;
}

function setupDom(): void {
  document.body.innerHTML = `
    <div id="game-wrapper">
      <button id="outside-btn" type="button">outside</button>
      <div id="settings-launcher"><button id="btn-open-settings" type="button">gear</button></div>
      <div id="settings-overlay"></div>
    </div>`;
}

describe('SettingsController (audio mixer overlay)', () => {
  let port: ReturnType<typeof makePort>;
  let ctrl: SettingsController;
  let openChanges: boolean[];

  beforeEach(() => {
    setupDom();
    port = makePort();
    openChanges = [];
    ctrl = new SettingsController({ audio: port, onOpenChange: (o) => openChanges.push(o) });
    ctrl.mount();
  });

  it('renders 7 labelled range sliders (master + 6 channels) with % readouts', () => {
    const sliders = document.querySelectorAll<HTMLInputElement>('#settings-overlay input[type="range"]');
    expect(sliders.length).toBe(7);
    sliders.forEach((s) => {
      expect(s.id).toBeTruthy();
      expect(document.querySelector(`label[for="${s.id}"]`)).not.toBeNull();
      expect(s.min).toBe('0');
      expect(s.max).toBe('100');
      expect(Number(s.value)).toBeGreaterThanOrEqual(75);
    });
    const readout = document.querySelector('[data-readout="weapons"]');
    expect(readout?.textContent).toBe('100%');
  });

  it('starts closed and opens with visible state, aria, focus on first slider and onOpenChange', () => {
    const overlay = document.getElementById('settings-overlay') as HTMLElement;
    expect(ctrl.isOpen()).toBe(false);
    expect(overlay.classList.contains('visible')).toBe(false);

    ctrl.open();
    expect(ctrl.isOpen()).toBe(true);
    expect(overlay.classList.contains('visible')).toBe(true);
    expect(overlay.getAttribute('aria-hidden')).toBe('false');
    const first = document.querySelector<HTMLInputElement>('#settings-overlay input[type="range"]');
    expect(document.activeElement).toBe(first);
    expect(openChanges).toEqual([true]);
  });

  it('restores focus to the previously focused element on close', () => {
    const outside = document.getElementById('outside-btn') as HTMLButtonElement;
    outside.focus();
    ctrl.open();
    ctrl.close();
    expect(ctrl.isOpen()).toBe(false);
    expect(document.activeElement).toBe(outside);
    expect(openChanges).toEqual([true, false]);
  });

  it('slider input updates audio volume (0..1) and live readout', () => {
    ctrl.open();
    const s = document.querySelector<HTMLInputElement>('input[data-channel="weapons"]') as HTMLInputElement;
    s.value = '40';
    s.dispatchEvent(new Event('input', { bubbles: true }));
    expect(port.setVolume).toHaveBeenCalledWith('weapons', 0.4);
    expect(document.querySelector('[data-readout="weapons"]')?.textContent).toBe('40%');
  });

  it('test buttons play a representative sound for their channel', () => {
    const btn = document.querySelector<HTMLButtonElement>('button[data-test-channel="impacts"]') as HTMLButtonElement;
    btn.click();
    expect(port.playTest).toHaveBeenCalledWith('impacts');
  });

  it('MUTE ALL toggles mute without touching slider values and reflects aria-pressed', () => {
    const onMute = vi.fn();
    setupDom();
    ctrl = new SettingsController({ audio: port, onMuteChange: onMute });
    ctrl.mount();
    const muteBtn = document.getElementById('btn-settings-mute') as HTMLButtonElement;
    muteBtn.click();
    expect(port.setMuted).toHaveBeenCalledWith(true);
    expect(muteBtn.getAttribute('aria-pressed')).toBe('true');
    expect(onMute).toHaveBeenCalledWith(true);
    expect(port.setVolume).not.toHaveBeenCalled();
    muteBtn.click();
    expect(port.setMuted).toHaveBeenLastCalledWith(false);
    expect(muteBtn.getAttribute('aria-pressed')).toBe('false');
  });

  it('RESET DEFAULTS restores 100% on all sliders', () => {
    port.vols.engine = 0.2;
    ctrl.sync();
    expect(document.querySelector<HTMLInputElement>('input[data-channel="engine"]')?.value).toBe('20');
    (document.getElementById('btn-settings-reset') as HTMLButtonElement).click();
    expect(port.resetVolumes).toHaveBeenCalled();
    expect(document.querySelector<HTMLInputElement>('input[data-channel="engine"]')?.value).toBe('100');
    expect(document.querySelector('[data-readout="engine"]')?.textContent).toBe('100%');
  });

  it('defaults screen shake to 1 (100%) and renders shake button', () => {
    expect(ctrl.getScreenShake()).toBe(1);
    const shakeBtn = document.getElementById('btn-settings-shake') as HTMLButtonElement;
    expect(shakeBtn).not.toBeNull();
    expect(shakeBtn.textContent).toBe('SHAKE: 100%');
    expect(shakeBtn.getAttribute('data-shake')).toBe('100');
    expect(shakeBtn.getAttribute('aria-label')).toBe('Screen shake intensity');
  });

  it('cycles screen shake 1 -> 0.5 -> 0 -> 1 on button click and invokes onShakeChange', () => {
    const recordedLevels: ScreenShakeLevel[] = [];
    const onShake = vi.fn((lvl: ScreenShakeLevel) => recordedLevels.push(lvl));
    setupDom();
    ctrl = new SettingsController({ audio: port, onShakeChange: onShake });
    ctrl.mount();
    const shakeBtn = document.getElementById('btn-settings-shake') as HTMLButtonElement;

    // 1 -> 0.5
    shakeBtn.click();
    expect(ctrl.getScreenShake()).toBe(0.5);
    expect(shakeBtn.textContent).toBe('SHAKE: 50%');
    expect(shakeBtn.getAttribute('data-shake')).toBe('50');
    expect(onShake).toHaveBeenLastCalledWith(0.5);

    // 0.5 -> 0
    shakeBtn.click();
    expect(ctrl.getScreenShake()).toBe(0);
    expect(shakeBtn.textContent).toBe('SHAKE: OFF');
    expect(shakeBtn.getAttribute('data-shake')).toBe('0');
    expect(onShake).toHaveBeenLastCalledWith(0);

    // 0 -> 1
    shakeBtn.click();
    expect(ctrl.getScreenShake()).toBe(1);
    expect(shakeBtn.textContent).toBe('SHAKE: 100%');
    expect(shakeBtn.getAttribute('data-shake')).toBe('100');
    expect(onShake).toHaveBeenLastCalledWith(1);
    expect(onShake).toHaveBeenCalledTimes(3);
    expect(recordedLevels).toEqual([0.5, 0, 1]);
  });

  it('RESET DEFAULTS restores screen shake back to 1', () => {
    ctrl.setScreenShake(0);
    expect(ctrl.getScreenShake()).toBe(0);
    const shakeBtn = document.getElementById('btn-settings-shake') as HTMLButtonElement;
    expect(shakeBtn.textContent).toBe('SHAKE: OFF');

    (document.getElementById('btn-settings-reset') as HTMLButtonElement).click();
    expect(ctrl.getScreenShake()).toBe(1);
    expect(shakeBtn.textContent).toBe('SHAKE: 100%');
    expect(shakeBtn.getAttribute('data-shake')).toBe('100');
  });

  it('CLOSE button closes; gear launcher opens', () => {
    (document.getElementById('btn-open-settings') as HTMLButtonElement).click();
    expect(ctrl.isOpen()).toBe(true);
    (document.getElementById('btn-settings-close') as HTMLButtonElement).click();
    expect(ctrl.isOpen()).toBe(false);
  });

  it('traps Tab focus within the panel', () => {
    ctrl.open();
    const focusables = ctrl.getFocusableElements();
    expect(focusables.length).toBeGreaterThan(6);
    const last = focusables[focusables.length - 1];
    last.focus();
    const evt = new KeyboardEvent('keydown', { key: 'Tab', bubbles: true, cancelable: true });
    last.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(focusables[0]);

    focusables[0].focus();
    const back = new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true, cancelable: true });
    focusables[0].dispatchEvent(back);
    expect(document.activeElement).toBe(last);
  });

  it('toggle() flips open state', () => {
    ctrl.toggle();
    expect(ctrl.isOpen()).toBe(true);
    ctrl.toggle();
    expect(ctrl.isOpen()).toBe(false);
  });
});

describe('InputManager settings hotkeys', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it("'o' and 'p' toggle settings", () => {
    const onToggleSettings = vi.fn();
    const onToggleGarage = vi.fn();
    const im = new InputManager({ onToggleSettings, onToggleGarage });
    im.attach(null, window);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'o' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'P' }));
    expect(onToggleSettings).toHaveBeenCalledTimes(2);
    expect(onToggleGarage).not.toHaveBeenCalled();
    im.destroy();
  });

  it('Escape closes settings first and does NOT toggle garage while settings is open', () => {
    const onCloseSettings = vi.fn();
    const onToggleGarage = vi.fn();
    const onWeaponSelect = vi.fn();
    const im = new InputManager({ onCloseSettings, onToggleGarage, onWeaponSelect });
    im.attach(null, window);
    im.setSettingsOpen(true);
    expect(im.isSettingsOpen()).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onCloseSettings).toHaveBeenCalledTimes(1);
    expect(onToggleGarage).not.toHaveBeenCalled();

    // Gameplay hotkeys are suppressed while settings is open
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'g' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '2' }));
    expect(onToggleGarage).not.toHaveBeenCalled();
    expect(onWeaponSelect).not.toHaveBeenCalled();

    im.setSettingsOpen(false);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onToggleGarage).toHaveBeenCalledTimes(1);
    im.destroy();
  });
});
