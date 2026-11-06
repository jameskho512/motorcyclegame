/**
 * MOTO-ROGUE: Input Controller Module
 *
 * Implements:
 * 1. Keyboard mapping:
 *    - Movement: WASD and Arrow keys (up, down, left, right)
 *    - NOS Boost: Shift
 *    - Weapons: '1' through '7'
 *    - Garage bay toggle: 'g' / 'escape'
 *    - Audio mute toggle: 'm'
 *    - Modals (Shop / Dialogs): 'enter', 'e', ' ' (confirm); 'escape' (cancel)
 * 2. Mouse tracking:
 *    - Viewport client-to-canvas coordinate scaling (720x720 logical coordinates)
 *    - Aim angle calculation relative to player coordinates
 *    - Primary fire (mouse down)
 *    - Wheel scrolling for sequential weapon switching
 * 3. Lifecycle methods: attach, detach, reset, destroy.
 *
 * Parity reference: moto-rogue/index.html L1345-L1405
 */

import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  InputState,
  WeaponId
} from '../types/game';

export const KEY_WEAPON_MAP: Record<string, WeaponId> = {
  '1': 'pistol',
  '2': 'machine_gun',
  '3': 'flamethrower',
  '4': 'grenade_launcher',
  '5': 'shotgun',
  '6': 'railgun',
  '7': 'arc_coil'
};

export interface InputCallbacks {
  onWeaponSelect?: (weaponId: WeaponId) => void;
  onToggleGarage?: () => void;
  onToggleMute?: () => void;
  onShopConfirm?: () => void;
  onShopCancel?: () => void;
  onWheelWeaponChange?: (direction: 1 | -1) => void;
  onUserGesture?: () => void;
}

export class InputManager {
  private state: InputState;
  private rawKeys: Record<string, boolean> = {};
  private canvas: HTMLElement | HTMLCanvasElement | null = null;
  private targetWindow: (Window & typeof globalThis) | null = null;
  private attached: boolean = false;
  private isShopModalActive: boolean = false;
  private isGarageModalActive: boolean = false;
  private callbacks: InputCallbacks = {};

  // Bound event listeners for clean removal
  private handleKeyDownBound: (e: KeyboardEvent) => void;
  private handleKeyUpBound: (e: KeyboardEvent) => void;
  private handleMouseMoveBound: (e: MouseEvent) => void;
  private handleMouseDownBound: (e: MouseEvent) => void;
  private handleMouseUpBound: (e: MouseEvent) => void;
  private handleWheelBound: (e: WheelEvent) => void;

  constructor(callbacks: InputCallbacks = {}) {
    this.callbacks = callbacks;
    this.state = {
      up: false,
      down: false,
      left: false,
      right: false,
      boost: false,
      aimAngle: 0,
      fire: false,
      mouseX: ARENA_WIDTH / 2,
      mouseY: ARENA_HEIGHT / 2,
      mouseDown: false
    };

    this.handleKeyDownBound = this.handleKeyDown.bind(this);
    this.handleKeyUpBound = this.handleKeyUp.bind(this);
    this.handleMouseMoveBound = this.handleMouseMove.bind(this);
    this.handleMouseDownBound = this.handleMouseDown.bind(this);
    this.handleMouseUpBound = this.handleMouseUp.bind(this);
    this.handleWheelBound = this.handleWheel.bind(this);
  }

  /**
   * Returns a snapshot of the current input state.
   */
  public getState(): Readonly<InputState> {
    return this.state;
  }

  /**
   * Directly queries if a raw key is down.
   */
  public isKeyDown(key: string): boolean {
    return !!this.rawKeys[key.toLowerCase()];
  }

  /**
   * Sets callback listener hooks.
   */
  public setCallbacks(callbacks: InputCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Updates modal overlay awareness.
   */
  public setModals(shopActive: boolean, garageActive: boolean): void {
    this.isShopModalActive = shopActive;
    this.isGarageModalActive = garageActive;
  }

  public isGarageOpen(): boolean {
    return this.isGarageModalActive;
  }

  public isShopOpen(): boolean {
    return this.isShopModalActive;
  }

  /**
   * Recalculates aim angle and direction state from player position.
   */
  public update(playerX: number = ARENA_WIDTH / 2, playerY: number = ARENA_HEIGHT / 2): void {
    const dx = this.state.mouseX - playerX;
    const dy = this.state.mouseY - playerY;
    this.state.aimAngle = Math.atan2(dy, dx);

    // Refresh movement state
    this.state.up = !!(this.rawKeys['w'] || this.rawKeys['arrowup']);
    this.state.down = !!(this.rawKeys['s'] || this.rawKeys['arrowdown']);
    this.state.left = !!(this.rawKeys['a'] || this.rawKeys['arrowleft']);
    this.state.right = !!(this.rawKeys['d'] || this.rawKeys['arrowright']);
    this.state.boost = !!(this.rawKeys['shift']);
    this.state.fire = this.state.mouseDown;
  }

  /**
   * Attaches event listeners to the canvas and window.
   */
  public attach(
    canvasElement?: HTMLElement | HTMLCanvasElement | null,
    win?: (Window & typeof globalThis) | null
  ): void {
    if (this.attached) return;

    this.targetWindow = win !== undefined ? win : (typeof window !== 'undefined' ? window : null);
    this.canvas = canvasElement || (typeof document !== 'undefined' ? document.getElementById('game-canvas') : null);

    if (this.targetWindow) {
      this.targetWindow.addEventListener('keydown', this.handleKeyDownBound as EventListener);
      this.targetWindow.addEventListener('keyup', this.handleKeyUpBound as EventListener);
      this.targetWindow.addEventListener('mouseup', this.handleMouseUpBound as EventListener);
      this.targetWindow.addEventListener('wheel', this.handleWheelBound as EventListener, { passive: false });
    }

    if (this.canvas) {
      this.canvas.addEventListener('mousemove', this.handleMouseMoveBound as EventListener);
      this.canvas.addEventListener('mousedown', this.handleMouseDownBound as EventListener);
      this.canvas.addEventListener('mouseup', this.handleMouseUpBound as EventListener);
    } else if (this.targetWindow) {
      this.targetWindow.addEventListener('mousemove', this.handleMouseMoveBound as EventListener);
      this.targetWindow.addEventListener('mousedown', this.handleMouseDownBound as EventListener);
    }

    this.attached = true;
  }

  /**
   * Detaches all active event listeners.
   */
  public detach(): void {
    if (!this.attached) return;

    if (this.targetWindow) {
      this.targetWindow.removeEventListener('keydown', this.handleKeyDownBound as EventListener);
      this.targetWindow.removeEventListener('keyup', this.handleKeyUpBound as EventListener);
      this.targetWindow.removeEventListener('mouseup', this.handleMouseUpBound as EventListener);
      this.targetWindow.removeEventListener('wheel', this.handleWheelBound as EventListener);
      if (!this.canvas) {
        this.targetWindow.removeEventListener('mousemove', this.handleMouseMoveBound as EventListener);
        this.targetWindow.removeEventListener('mousedown', this.handleMouseDownBound as EventListener);
      }
    }

    if (this.canvas) {
      this.canvas.removeEventListener('mousemove', this.handleMouseMoveBound as EventListener);
      this.canvas.removeEventListener('mousedown', this.handleMouseDownBound as EventListener);
      this.canvas.removeEventListener('mouseup', this.handleMouseUpBound as EventListener);
    }

    this.attached = false;
  }

  /**
   * Resets all pressed keys and mouse buttons.
   */
  public reset(): void {
    this.rawKeys = {};
    this.state.up = false;
    this.state.down = false;
    this.state.left = false;
    this.state.right = false;
    this.state.boost = false;
    this.state.fire = false;
    this.state.mouseDown = false;
  }

  /**
   * Cleans up listeners and clears callbacks.
   */
  public destroy(): void {
    this.detach();
    this.reset();
    this.callbacks = {};
  }

  // ==========================================================================
  // EVENT HANDLERS
  // ==========================================================================

  private handleKeyDown(e: KeyboardEvent): void {
    this.callbacks.onUserGesture?.();

    const k = e.key.toLowerCase();
    this.rawKeys[k] = true;

    // Check if shop modal overlay is currently visible in DOM or state
    const isShopOpen =
      this.isShopModalActive ||
      (typeof document !== 'undefined' &&
        document.getElementById('shop-confirm-overlay')?.classList.contains('visible'));

    if (isShopOpen) {
      if (k === 'e' || k === 'enter' || k === ' ') {
        e.preventDefault();
        this.callbacks.onShopConfirm?.();
        return;
      }
      if (k === 'escape') {
        e.preventDefault();
        this.callbacks.onShopCancel?.();
        return;
      }
    }

    // Audio mute toggle
    if (k === 'm') {
      this.callbacks.onToggleMute?.();
      return;
    }

    // Garage bay toggle
    if (k === 'g' || k === 'escape') {
      this.callbacks.onToggleGarage?.();
      return;
    }

    // Weapon selection '1' - '7'
    if (KEY_WEAPON_MAP[k]) {
      this.callbacks.onWeaponSelect?.(KEY_WEAPON_MAP[k]);
      return;
    }

    this.update();
  }

  private handleKeyUp(e: KeyboardEvent): void {
    const k = e.key.toLowerCase();
    this.rawKeys[k] = false;
    this.update();
  }

  private handleMouseMove(e: MouseEvent): void {
    if (this.canvas) {
      const rect = this.canvas.getBoundingClientRect();
      const scaleX = rect.width > 0 ? ARENA_WIDTH / rect.width : 1;
      const scaleY = rect.height > 0 ? ARENA_HEIGHT / rect.height : 1;
      this.state.mouseX = (e.clientX - rect.left) * scaleX;
      this.state.mouseY = (e.clientY - rect.top) * scaleY;
    } else {
      this.state.mouseX = e.clientX;
      this.state.mouseY = e.clientY;
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    this.callbacks.onUserGesture?.();
    if (e.button === 0) {
      this.state.mouseDown = true;
      this.state.fire = true;
    }
  }

  private handleMouseUp(e: MouseEvent): void {
    if (e.button === 0) {
      this.state.mouseDown = false;
      this.state.fire = false;
    }
  }

  private handleWheel(e: WheelEvent): void {
    if (e.deltaY !== 0) {
      const dir: 1 | -1 = e.deltaY > 0 ? 1 : -1;
      this.callbacks.onWheelWeaponChange?.(dir);
    }
  }
}
