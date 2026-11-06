/**
 * MOTO-ROGUE: Settings Overlay (Audio Mixer) Controller
 *
 * Anime fighting-game styled comic panel with per-category volume sliders
 * (master / engine / weapons / impacts / pickups / ui), per-channel test buttons,
 * MUTE ALL, RESET DEFAULTS and CLOSE [ESC].
 *
 * Accessibility: role="dialog" + aria-modal, focuses the first slider on open,
 * traps Tab focus inside the panel and restores focus on close. Escape handling is
 * owned by InputManager (so a single keypress never also toggles the garage).
 */

import { VOLUME_KEYS, VolumeKey, VolumeSettings } from '../audio/sfx';

export type ScreenShakeLevel = 1 | 0.5 | 0;

export interface SettingsTelemetrySummary {
  muted: boolean;
  shakeScale: number;
  shakeLabel: '100%' | '50%' | 'OFF';
  summaryLine: string;
}

/** Pure telemetry helper extracting audio mute and shake states into a compact summary string. */
export function getSettingsSummary(settings?: SettingsController | null): SettingsTelemetrySummary {
  const muted = !!settings?.isMuted?.();
  const shakeScale = settings?.getScreenShake?.() ?? 1;
  const shakeLabel: '100%' | '50%' | 'OFF' =
    shakeScale >= 1 ? '100%' : shakeScale >= 0.5 ? '50%' : 'OFF';
  const summaryLine = `AUDIO: ${muted ? 'MUTED' : 'ACTIVE'} · SHAKE: ${shakeLabel}`;
  return {
    muted,
    shakeScale,
    shakeLabel,
    summaryLine
  };
}

/** Minimal audio surface the settings UI needs (SoundSynthesizer satisfies it). */
export interface SettingsAudioPort {
  getVolumes(): VolumeSettings;
  setVolume(key: VolumeKey, value: number): void;
  resetVolumes(): void;
  isMuted(): boolean;
  setMuted(muted: boolean): void;
  playTest(key: VolumeKey): void;
}

export interface SettingsControllerOptions {
  audio: SettingsAudioPort;
  onOpenChange?: (open: boolean) => void;
  onMuteChange?: (muted: boolean) => void;
  onShakeChange?: (level: ScreenShakeLevel) => void;
  overlayId?: string;
  launcherId?: string;
}

const CHANNEL_META: Record<VolumeKey, { label: string; hint: string }> = {
  master: { label: 'MASTER', hint: 'Everything' },
  music: { label: 'MUSIC', hint: 'Synthwave outlaw bassline' },
  engine: { label: 'ENGINE', hint: 'Bike engine hum' },
  weapons: { label: 'WEAPONS', hint: 'Gunfire & arc chains' },
  impacts: { label: 'IMPACTS', hint: 'Hits, kills, explosions, damage' },
  pickups: { label: 'PICKUPS', hint: 'Loot, fuel, shop' },
  ui: { label: 'UI', hint: 'Doors, room clear, menus' }
};

const FOCUSABLE_SELECTOR =
  'button:not([disabled]), input:not([disabled]), [href], select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Builds the inner panel markup (static strings only; no user data is interpolated). */
export function renderSettingsMarkup(): string {
  const rows = VOLUME_KEYS.map((key) => {
    const meta = CHANNEL_META[key];
    const id = `vol-${key}`;
    return `
      <div class="settings-row${key === 'master' ? ' settings-row--master' : ''}">
        <label class="settings-label" for="${id}">
          <span class="settings-label-text">${meta.label}</span>
          <span class="settings-hint" id="${id}-hint">${meta.hint}</span>
        </label>
        <input class="settings-slider" type="range" id="${id}" data-channel="${key}"
          min="0" max="100" step="1" value="100" aria-describedby="${id}-hint" />
        <output class="settings-readout" for="${id}" data-readout="${key}">100%</output>
        <button type="button" class="settings-test" data-test-channel="${key}"
          aria-label="Test ${meta.label.toLowerCase()} volume">TEST</button>
      </div>`;
  }).join('');

  return `
    <div class="settings-panel" role="document">
      <div class="settings-banner" aria-hidden="true"><span>SETTINGS</span></div>
      <h2 class="settings-title" id="settings-title">AUDIO MIXER</h2>
      <div class="settings-rows">${rows}</div>
      <div class="settings-actions">
        <button type="button" class="settings-btn settings-btn--shake" id="btn-settings-shake" data-shake="100" aria-label="Screen shake intensity">SHAKE: 100%</button>
        <button type="button" class="settings-btn settings-btn--mute" id="btn-settings-mute" aria-pressed="false">MUTE ALL</button>
        <button type="button" class="settings-btn settings-btn--secondary" id="btn-settings-reset">RESET DEFAULTS</button>
        <button type="button" class="settings-btn settings-btn--primary" id="btn-settings-close"><kbd>ESC</kbd> CLOSE</button>
      </div>
    </div>`;
}

function toPercent(v: number): number {
  return Math.round(Math.max(0, Math.min(1, v)) * 100);
}

export class SettingsController {
  private audio: SettingsAudioPort;
  private onOpenChange?: (open: boolean) => void;
  private onMuteChange?: (muted: boolean) => void;
  private onShakeChange?: (level: ScreenShakeLevel) => void;
  private overlayId: string;
  private launcherId: string;
  private overlay: HTMLElement | null = null;
  private opened: boolean = false;
  private returnFocus: HTMLElement | null = null;
  private screenShake: ScreenShakeLevel = 1;

  constructor(options: SettingsControllerOptions) {
    this.audio = options.audio;
    this.onOpenChange = options.onOpenChange;
    this.onMuteChange = options.onMuteChange;
    this.onShakeChange = options.onShakeChange;
    this.overlayId = options.overlayId ?? 'settings-overlay';
    this.launcherId = options.launcherId ?? 'btn-open-settings';
  }

  public isMuted(): boolean {
    return this.audio.isMuted();
  }

  public getScreenShake(): ScreenShakeLevel {
    return this.screenShake;
  }

  public setScreenShake(level: ScreenShakeLevel): void {
    this.screenShake = level;
    this.syncShake();
    this.overlay?.setAttribute('data-settings-summary', getSettingsSummary(this).summaryLine);
    this.onShakeChange?.(level);
  }

  /** Renders markup into the overlay container and wires listeners. Safe to call when DOM is absent. */
  public mount(): void {
    if (typeof document === 'undefined') return;
    this.overlay = document.getElementById(this.overlayId);
    if (!this.overlay) return;

    const overlay = this.overlay;
    overlay.innerHTML = renderSettingsMarkup();
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'settings-title');
    overlay.setAttribute('aria-hidden', 'true');
    overlay.classList.remove('visible');

    overlay.addEventListener('input', (e: Event) => {
      const target = e.target;
      if (!(target instanceof HTMLInputElement) || !target.dataset.channel) return;
      const key = target.dataset.channel as VolumeKey;
      const pct = Math.max(0, Math.min(100, Number(target.value) || 0));
      this.audio.setVolume(key, pct / 100);
      this.setReadout(key, pct);
    });

    overlay.addEventListener('click', (e: Event) => {
      const target = e.target instanceof Element ? e.target.closest('button') : null;
      if (!target) return;
      const testKey = target.getAttribute('data-test-channel');
      if (testKey) {
        this.audio.playTest(testKey as VolumeKey);
        return;
      }
      switch (target.id) {
        case 'btn-settings-shake': {
          const next: ScreenShakeLevel = this.screenShake === 1 ? 0.5 : this.screenShake === 0.5 ? 0 : 1;
          this.setScreenShake(next);
          break;
        }
        case 'btn-settings-mute':
          this.audio.setMuted(!this.audio.isMuted());
          this.syncMute();
          this.overlay?.setAttribute('data-settings-summary', getSettingsSummary(this).summaryLine);
          this.onMuteChange?.(this.audio.isMuted());
          break;
        case 'btn-settings-reset':
          this.audio.resetVolumes();
          this.setScreenShake(1);
          this.sync();
          break;
        case 'btn-settings-close':
          this.close();
          break;
      }
    });

    // Click on the dimmed backdrop (outside the panel) closes
    overlay.addEventListener('mousedown', (e: MouseEvent) => {
      if (e.target === overlay) this.close();
    });

    overlay.addEventListener('keydown', (e: KeyboardEvent) => this.trapFocus(e));

    document.getElementById(this.launcherId)?.addEventListener('click', () => this.toggle());

    this.sync();
  }

  public isOpen(): boolean {
    return this.opened;
  }

  public open(): void {
    if (this.opened || !this.overlay) return;
    this.opened = true;
    const active = document.activeElement;
    this.returnFocus = active instanceof HTMLElement && active !== document.body ? active : null;
    this.sync();
    this.overlay.classList.add('visible');
    this.overlay.setAttribute('aria-hidden', 'false');
    this.overlay.setAttribute('data-settings-summary', getSettingsSummary(this).summaryLine);
    document.getElementById(this.launcherId)?.setAttribute('aria-expanded', 'true');
    this.overlay.querySelector<HTMLInputElement>('input[type="range"]')?.focus();
    this.onOpenChange?.(true);
  }

  public close(): void {
    if (!this.opened || !this.overlay) return;
    this.opened = false;
    this.overlay.classList.remove('visible');
    this.overlay.setAttribute('aria-hidden', 'true');
    document.getElementById(this.launcherId)?.setAttribute('aria-expanded', 'false');
    const back = this.returnFocus;
    this.returnFocus = null;
    if (back && back.isConnected) {
      back.focus();
    } else if (document.activeElement instanceof HTMLElement && this.overlay.contains(document.activeElement)) {
      document.activeElement.blur();
    }
    this.onOpenChange?.(false);
  }

  public toggle(): void {
    if (this.opened) this.close();
    else this.open();
  }

  /** Re-reads volumes + mute state from audio into the controls. */
  public sync(): void {
    if (!this.overlay) return;
    const vols = this.audio.getVolumes();
    for (const key of VOLUME_KEYS) {
      const pct = toPercent(vols[key]);
      const slider = this.overlay.querySelector<HTMLInputElement>(`input[data-channel="${key}"]`);
      if (slider) slider.value = String(pct);
      this.setReadout(key, pct);
    }
    this.syncMute();
    this.syncShake();
    this.overlay.setAttribute('data-settings-summary', getSettingsSummary(this).summaryLine);
  }

  public getFocusableElements(): HTMLElement[] {
    if (!this.overlay) return [];
    return Array.from(this.overlay.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR));
  }

  private syncShake(): void {
    const btn = this.overlay?.querySelector<HTMLButtonElement>('#btn-settings-shake');
    if (!btn) return;
    const pct = this.screenShake === 1 ? '100' : this.screenShake === 0.5 ? '50' : '0';
    const text = this.screenShake === 1 ? 'SHAKE: 100%' : this.screenShake === 0.5 ? 'SHAKE: 50%' : 'SHAKE: OFF';
    btn.setAttribute('data-shake', pct);
    btn.textContent = text;
  }

  private syncMute(): void {
    const btn = this.overlay?.querySelector<HTMLButtonElement>('#btn-settings-mute');
    if (!btn) return;
    const muted = this.audio.isMuted();
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    btn.textContent = muted ? 'MUTED · UNMUTE' : 'MUTE ALL';
    this.overlay?.classList.toggle('is-muted', muted);
  }

  private setReadout(key: VolumeKey, pct: number): void {
    const out = this.overlay?.querySelector<HTMLElement>(`[data-readout="${key}"]`);
    if (out) out.textContent = `${pct}%`;
    const slider = this.overlay?.querySelector<HTMLInputElement>(`input[data-channel="${key}"]`);
    if (slider) {
      slider.style.setProperty('--fill', `${pct}%`);
      slider.setAttribute('aria-valuetext', `${pct} percent`);
    }
  }

  private trapFocus(e: KeyboardEvent): void {
    if (e.key !== 'Tab' || !this.opened) return;
    const items = this.getFocusableElements();
    if (items.length === 0) return;
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && active === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }
}
