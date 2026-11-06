/**
 * MOTO-ROGUE: Master Application Bootstrap & Game Loop
 *
 * Implements:
 * 1. PixiJS v8 Application initialization on canvas#canvas.
 * 2. Widescreen responsive scaling (fitAll) maintaining 1:1 square arena aspect ratio.
 * 3. High-precision RAF game loop with dt capped at 0.05s.
 * 4. Systems wiring: Physics, Combat ballistics, Enemy AI, Web Audio engine hum, and Renderers.
 * 5. LocalStorage save/checkpoint persistence (moto_rogue_save_v2 & moto_rogue_run_v1).
 * 6. UI Controllers: HUD, Semicircular Fuel Gauge, Minimap, Garage Workshop, Shop Confirmation, Tooltips.
 *
 * Parity reference: moto-rogue/index.html L1345-L1480, L4012-L4140
 */

import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  WeaponId,
  EquipSlot,
  EquipmentItem,
  UnlockableWeaponId,
  MetaUpgradeId,
  Room
} from './types/game';

import { StateManager } from './core/state';
import { InputManager } from './core/input';
import { SoundSynthesizer } from './audio/sfx';
import { generateDungeon } from './world/dungeon';
import {
  updateBikeKinematics,
  updateNos,
  handleWallAndDoors,
  resolveObstacleCollisions
} from './systems/physics';
import {
  createCombatState,
  fireWeapon,
  updateCombatPipeline
} from './systems/combat';
import { updateEnemyAI, calcEnemyProjSpeedScale } from './systems/enemyAI';
import { StageManager } from './render/stage';
import { HUDController } from './ui/hud';
import { GarageController } from './ui/garage';
import { ShopModalController } from './ui/shopModal';
import { TooltipManager } from './ui/tooltip';
import { WEAPONS } from './data/weapons';

export class MotoRogueApp {
  public stateManager: StateManager;
  public inputManager: InputManager;
  public audio: SoundSynthesizer;
  public stage: StageManager;
  public hud: HUDController;
  public garage: GarageController;
  public shopModal: ShopModalController;
  public tooltip: TooltipManager;

  public curRoomX: number = 0;
  public curRoomY: number = 0;
  public dungeon: ReturnType<typeof generateDungeon>['rooms'] = {};
  public combatState = createCombatState();

  private lastTime: number = 0;
  private autosaveTimer: number = 0;
  private running: boolean = false;

  constructor() {
    this.stateManager = new StateManager();
    this.audio = new SoundSynthesizer();
    this.stage = new StageManager();
    this.tooltip = new TooltipManager();

    // 1. Initialize UI Controllers with callbacks
    this.hud = new HUDController({
      onSelectWeapon: (id: WeaponId) => this.selectWeapon(id)
    });

    this.shopModal = new ShopModalController();

    this.garage = new GarageController({
      onEquipItem: (item: EquipmentItem) => {
        this.stateManager.equip(item);
        this.garage.render(this.stateManager.metaSave, this.stateManager.player);
        this.updateHUD();
      },
      onUnequipSlot: (slotId: EquipSlot) => {
        this.stateManager.unequip(slotId);
        this.garage.render(this.stateManager.metaSave, this.stateManager.player);
        this.updateHUD();
      },
      onSellItem: (item: EquipmentItem) => {
        this.stateManager.sell(item);
        this.audio.shopBuy();
        this.garage.render(this.stateManager.metaSave, this.stateManager.player);
        this.updateHUD();
      },
      onUnlockWeapon: (id: UnlockableWeaponId) => {
        const w = WEAPONS[id];
        const meta = this.stateManager.metaSave;
        if (meta.scrap >= w.cost) {
          meta.scrap -= w.cost;
          meta.unlocked[id] = true;
          this.stateManager.saveMeta();
          this.audio.shopBuy();
          this.selectWeapon(id);
          this.garage.render(meta, this.stateManager.player);
          this.updateHUD();
        }
      },
      onEquipWeapon: (id: WeaponId) => {
        this.selectWeapon(id);
        this.garage.render(this.stateManager.metaSave, this.stateManager.player);
      },
      onBuyUpgrade: (upId: MetaUpgradeId) => {
        const meta = this.stateManager.metaSave;
        const player = this.stateManager.player;
        const ranks = meta.ranks;
        const currentRank = ranks[upId] || 0;
        const costs: Record<MetaUpgradeId, number> = {
          dmg: Math.round(25 * Math.pow(1.6, currentRank)),
          fireRate: Math.round(25 * Math.pow(1.6, currentRank)),
          speed: Math.round(20 * Math.pow(1.55, currentRank)),
          maxHp: Math.round(35 * Math.pow(1.75, currentRank))
        };
        const cost = costs[upId];
        if (meta.scrap >= cost) {
          meta.scrap -= cost;
          ranks[upId] = currentRank + 1;
          this.stateManager.saveMeta();
          this.audio.shopBuy();

          // Apply immediate in-run bonus
          if (upId === 'dmg') player.dmgMult += 0.10;
          if (upId === 'fireRate') player.fireRateMult += 0.08;
          if (upId === 'speed') player.speedMult += 0.06;
          if (upId === 'maxHp') {
            player.maxHp += 1;
            player.hp += 1;
          }

          this.garage.render(meta, player);
          this.updateHUD();
        }
      },
      onResumeRun: () => {
        if (this.stateManager.gameOver) {
          this.startNewRun(false);
        }
      },
      onNewRun: () => {
        this.startNewRun(false);
      },
      onResetSave: () => {
        this.stateManager.metaSave = {
          scrap: 0,
          unlocked: {
            machine_gun: false,
            shotgun: false,
            flamethrower: false,
            railgun: false,
            grenade_launcher: false,
            arc_coil: false
          },
          ranks: { dmg: 0, fireRate: 0, speed: 0, maxHp: 0 },
          equipped: {},
          stash: []
        };
        this.stateManager.saveMeta();
        this.startNewRun(false);
        this.garage.render(this.stateManager.metaSave, this.stateManager.player);
      },
      onPlayUiClick: () => this.audio.uiClick(),
      onPlayShopBuy: () => this.audio.shopBuy()
    });

    // 2. Initialize Input Manager
    this.inputManager = new InputManager({
      onWeaponSelect: (id: WeaponId) => this.selectWeapon(id),
      onToggleGarage: () => {
        const player = this.stateManager.player;
        const meta = this.stateManager.metaSave;
        this.garage.toggle(this.stateManager.gameOver, this.stateManager.floorNum, meta, player);
      },
      onToggleMute: () => this.toggleAudioMute(),
      onShopConfirm: () => {
        if (this.shopModal.isOpen()) {
          this.shopModal.confirm();
        }
      },
      onShopCancel: () => {
        if (this.shopModal.isOpen()) {
          this.shopModal.cancel();
        }
      },
      onWheelWeaponChange: (dir: 1 | -1) => this.cycleWeapon(dir),
      onUserGesture: () => this.audio.init()
    });
  }

  /**
   * Initializes the application, PixiJS v8 Application on canvas, and starts game loop.
   */
  public async init(): Promise<void> {
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    await this.stage.init(canvas);

    this.inputManager.attach(canvas, window);

    // Audio toggle button
    const soundBtn = document.getElementById('btn-toggle-sound');
    soundBtn?.addEventListener('click', () => this.toggleAudioMute());

    // Garage toggle button
    const garageBtn = document.getElementById('btn-open-garage');
    garageBtn?.addEventListener('click', () => {
      const player = this.stateManager.player;
      const meta = this.stateManager.metaSave;
      this.garage.open(this.stateManager.gameOver, this.stateManager.floorNum, meta, player);
    });

    // Tooltip proximity handler
    this.tooltip.attachGlobalListener(
      (clientX: number, clientY: number) => {
        const room = this.getCurrentRoom();
        if (!room) return null;
        const rect = canvas.getBoundingClientRect();
        const logicalX = (clientX - rect.left) * (ARENA_WIDTH / rect.width);
        const logicalY = (clientY - rect.top) * (ARENA_HEIGHT / rect.height);
        return room.pickups.find(p => Math.hypot(p.x - logicalX, p.y - logicalY) < 34) || null;
      },
      () => this.garage.isOpen() || this.shopModal.isOpen()
    );

    // Responsive scaling
    window.addEventListener('resize', () => this.fitAll());
    this.fitAll();

    // Load existing run or initialize fresh run
    const restored = this.stateManager.loadRun();
    this.startNewRun(restored);

    // Start RAF loop
    this.running = true;
    this.lastTime = performance.now();
    requestAnimationFrame((t) => this.tick(t));
  }

  /**
   * Starts a run, either restoring checkpoint state or creating fresh floor 1 dungeon.
   */
  public startNewRun(restored: boolean): void {
    if (!restored) {
      this.stateManager.resetRun();
    }

    const floor = this.stateManager.floorNum;
    const meta = this.stateManager.metaSave;

    const dungeonGraph = generateDungeon(floor, {
      isWeaponAvailable: (wId: WeaponId) => !!meta.unlocked[wId as UnlockableWeaponId] || wId === 'pistol'
    });

    this.dungeon = dungeonGraph.rooms;
    this.curRoomX = 0;
    this.curRoomY = 0;

    const startRoom = this.dungeon['0,0'];
    if (startRoom) {
      startRoom.cleared = true;
      startRoom.visited = true;
    }

    const player = this.stateManager.player;
    player.x = ARENA_WIDTH / 2;
    player.y = ARENA_HEIGHT / 2;
    player.vx = 0;
    player.vy = 0;

    this.combatState = createCombatState();
    this.updateHUD();
  }

  public getCurrentRoom(): Room | undefined {
    return this.dungeon[`${this.curRoomX},${this.curRoomY}`];
  }

  public selectWeapon(id: WeaponId): void {
    const meta = this.stateManager.metaSave;
    const player = this.stateManager.player;
    const isAvail = meta.unlocked[id as UnlockableWeaponId] || id === 'pistol' || !!player.runWeapons[id];
    if (isAvail) {
      player.weapon = id;
      this.updateHUD();
    }
  }

  public cycleWeapon(dir: 1 | -1): void {
    const player = this.stateManager.player;
    const meta = this.stateManager.metaSave;
    const weaponKeys = Object.keys(WEAPONS) as WeaponId[];
    const avail = weaponKeys.filter(
      id => meta.unlocked[id as UnlockableWeaponId] || id === 'pistol' || !!player.runWeapons[id]
    );

    if (avail.length === 0) return;
    const curIdx = avail.indexOf(player.weapon);
    const nextIdx = (curIdx + dir + avail.length) % avail.length;
    this.selectWeapon(avail[nextIdx]);
  }

  public toggleAudioMute(): void {
    const isMuted = this.audio.toggleMute();
    const soundBtn = document.getElementById('btn-toggle-sound');
    if (soundBtn) {
      soundBtn.textContent = isMuted ? '🔇 [M]' : '🔊 [M]';
    }
  }

  /**
   * Adjusts viewport scaling (fitAll) maintaining 1:1 playfield aspect ratio.
   */
  public fitAll(): void {
    const wrapper = document.getElementById('game-wrapper');
    const canvas = document.getElementById('canvas') as HTMLCanvasElement;
    const miniCanvas = document.getElementById('minimap-canvas') as HTMLCanvasElement;
    const fuelCanvas = document.getElementById('fuel-gauge') as HTMLCanvasElement;
    const bikeCanvas = document.getElementById('bike-canvas') as HTMLCanvasElement;

    if (!wrapper || !canvas) return;

    const availH = Math.max(320, window.innerHeight - 24);
    const availW = Math.max(320, window.innerWidth - 540);
    const size = Math.floor(Math.min(availH, availW));

    wrapper.style.width = `${size}px`;
    wrapper.style.height = `${size}px`;

    const dpr = Math.min(3, window.devicePixelRatio || 1);

    const fitCanvas = (c: HTMLCanvasElement, cssW: number, cssH: number) => {
      if (!(c as any)._lw) {
        (c as any)._lw = c.width;
        (c as any)._lh = c.height;
      }
      c.style.width = `${cssW}px`;
      c.style.height = `${cssH}px`;
      c.width = Math.round(cssW * dpr);
      c.height = Math.round(cssH * dpr);
    };

    // Set PixiJS main canvas CSS dimensions only.
    // Direct mutation of canvas.width/height desyncs PixiJS v8's viewport & projection matrix!
    canvas.style.width = `${size}px`;
    canvas.style.height = `${size}px`;

    if (miniCanvas) fitCanvas(miniCanvas, 220, 135);
    if (fuelCanvas) fitCanvas(fuelCanvas, 220, 110);
    if (bikeCanvas) fitCanvas(bikeCanvas, 260, 165);

    this.updateHUD();
    this.garage.drawBikeLift(this.stateManager.metaSave);
  }

  public updateHUD(): void {
    const player = this.stateManager.player;
    const meta = this.stateManager.metaSave;
    const floor = this.stateManager.floorNum;

    this.hud.updateSidebar(
      player,
      meta.scrap,
      floor,
      meta.unlocked,
      this.dungeon,
      this.curRoomX,
      this.curRoomY
    );
  }

  /**
   * Main game tick loop running on requestAnimationFrame.
   */
  public tick(now: number): void {
    if (!this.running) return;

    const dt = Math.min(0.05, (now - this.lastTime) / 1000);
    this.lastTime = now;

    this.update(dt);
    this.render(now);

    requestAnimationFrame((t) => this.tick(t));
  }

  /**
   * Executes game state and systems update for dt seconds.
   */
  public update(dt: number): void {
    const isPaused = this.garage.isOpen() || this.shopModal.isOpen() || this.stateManager.gameOver;
    const player = this.stateManager.player;
    const room = this.getCurrentRoom();

    // Call inputManager.update(player.x, player.y) at the start of every frame
    this.inputManager.update(player.x, player.y);

    // 1. Audio Engine Modulation
    const speed = Math.hypot(player.vx, player.vy);
    const speedRatio = Math.min(1.5, speed / (player.baseSpeed || 265));
    const inputState = this.inputManager.getState();
    const isShiftHeld = inputState.boost;
    const isMoving = inputState.up || inputState.down || inputState.left || inputState.right;
    this.audio.updateEngine(speedRatio, isShiftHeld && isMoving, isPaused);

    if (isPaused || !room) return;

    // 2. Player Invulnerability timer
    if (player.invuln > 0) {
      player.invuln = Math.max(0, player.invuln - dt);
    }

    // 3. Bike Kinematics & NOS
    const ix = (inputState.right ? 1 : 0) - (inputState.left ? 1 : 0);
    const iy = (inputState.down ? 1 : 0) - (inputState.up ? 1 : 0);

    const { boosting } = updateNos(player, isShiftHeld, isMoving, dt);

    // Per-frame NOS bar visual update
    const nosFill = document.getElementById('nos-fill');
    if (nosFill) {
      nosFill.style.width = `${(player.nos / player.nosMax) * 100}%`;
      nosFill.style.background = player.nosLock
        ? '#e63946'
        : (boosting ? 'linear-gradient(90deg,#4cc9f0,#fff)' : 'linear-gradient(90deg,#4895ef,#4cc9f0)');
    }

    updateBikeKinematics(player, ix, iy, boosting, dt, room);

    // Apply movement displacement
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    // Aim angle tracks mouse position
    player.aimAngle = Math.atan2(inputState.mouseY - player.y, inputState.mouseX - player.x);

    // Obstacle collisions
    resolveObstacleCollisions(player, room.obstacles);

    // Wall & Door transitions
    const transition = handleWallAndDoors(player, room);
    if (transition) {
      this.curRoomX += transition.dx;
      this.curRoomY += transition.dy;
      player.x = transition.newX;
      player.y = transition.newY;

      // Clear projectiles upon transitioning
      this.combatState.bullets = [];
      this.combatState.enemyBullets = [];
      this.combatState.grenades = [];
      this.combatState.enemyBombs = [];

      const nextRoom = this.getCurrentRoom();
      if (nextRoom) {
        nextRoom.visited = true;
      }
      this.audio.doorTransition();
      this.stateManager.saveRun();
      this.updateHUD();
      return;
    }

    // 4. Trapdoor interaction (Next floor)
    if (room.trapdoor) {
      const tx = ARENA_WIDTH / 2;
      const ty = ARENA_HEIGHT / 2 - 45;
      if (Math.hypot(player.x - tx, player.y - ty) < 28) {
        this.nextFloor();
        return;
      }
    }

    // 5. Weapon Firing
    player.fireTimer = Math.max(0, player.fireTimer - dt);
    if (inputState.fire && player.fireTimer <= 0) {
      fireWeapon({
        player,
        target: { x: inputState.mouseX, y: inputState.mouseY },
        state: this.combatState,
        audio: this.audio
      });
    }

    // 6. Enemy AI Updates
    const projScale = calcEnemyProjSpeedScale(this.stateManager.floorNum);
    for (const en of room.enemies) {
      updateEnemyAI({
        room,
        enemy: en,
        dt,
        player,
        projScale,
        enemyBullets: this.combatState.enemyBullets,
        enemyBombs: this.combatState.enemyBombs,
        floorNum: this.stateManager.floorNum
      });
    }

    // 7. Combat Pipeline
    updateCombatPipeline(
      dt,
      room,
      player,
      this.combatState,
      this.stateManager.metaSave,
      this.audio,
      (dmg: number) => {
        if (player.invuln <= 0) {
          player.hp = Math.max(0, player.hp - dmg);
          player.invuln = 1.05; // 1.05s i-frames
          this.combatState.screenShake = 6;
          this.audio.playerHurt();
          this.updateHUD();

          if (player.hp <= 0) {
            this.handlePlayerDeath();
          }
        }
      }
    );

    // 8. Room Clearance Check
    if (!room.cleared && room.enemies.length === 0) {
      room.cleared = true;
      this.audio.roomClear();
      this.updateHUD();
    }

    // 9. Pickup Interactions
    for (let i = room.pickups.length - 1; i >= 0; i--) {
      const p = room.pickups[i];
      if (Math.hypot(p.x - player.x, p.y - player.y) < player.radius + p.radius) {
        if (p.type === 'heart') {
          player.hp = Math.min(player.maxHp, player.hp + 1);
          this.audio.pickupFuel();
          room.pickups.splice(i, 1);
          this.updateHUD();
        } else if (p.type === 'loot') {
          this.stateManager.receiveLoot(p.item);
          this.audio.pickupLoot(p.item.rarity);
          room.pickups.splice(i, 1);
          this.updateHUD();
        } else if (p.type === 'item_drop') {
          player.itemStacks[p.itemId] = (player.itemStacks[p.itemId] || 0) + 1;
          this.audio.pickupItem();
          room.pickups.splice(i, 1);
          this.updateHUD();
        } else if (p.type === 'mod_pedestal' && p.cost === 0) {
          // Free mod
          p.mod.apply(player);
          player.items.push(p.mod.name);
          this.audio.pickupItem();
          room.pickups.splice(i, 1);
          this.updateHUD();
        } else if (p.type === 'shop_heart' || p.type === 'mod_pedestal' || p.type === 'run_weapon') {
          // Proximity shop prompt confirmation
          if (!this.shopModal.isOpen()) {
            this.shopModal.open(p, () => {
              if (player.coins >= p.cost) {
                player.coins -= p.cost;
                this.audio.shopBuy();
                if (p.type === 'shop_heart') {
                  player.hp = Math.min(player.maxHp, player.hp + 2);
                } else if (p.type === 'mod_pedestal') {
                  p.mod.apply(player);
                  player.items.push(p.mod.name);
                } else if (p.type === 'run_weapon') {
                  player.runWeapons[p.weaponId] = true;
                  player.weapon = p.weaponId;
                }
                const pIdx = room.pickups.indexOf(p);
                if (pIdx >= 0) room.pickups.splice(pIdx, 1);
                this.updateHUD();
              } else {
                this.audio.shopError();
                this.combatState.damageNumbers.push({
                  x: player.x,
                  y: player.y - 30,
                  text: `NEED ${p.cost} COINS!`,
                  color: '#ef233c',
                  life: 0.8,
                  maxLife: 0.8
                });
              }
            });
          }
        }
      }
    }

    // 10. Stage VFX & Post-processing updates
    this.stage.update(dt);

    // 11. Periodic Checkpoint Autosave (every 5 seconds)
    this.autosaveTimer += dt;
    if (this.autosaveTimer >= 5.0) {
      this.autosaveTimer = 0;
      this.stateManager.saveRun();
    }
  }

  public render(timestampMs: number): void {
    const room = this.getCurrentRoom();
    if (!room) return;

    this.stage.render(
      this.stateManager.player,
      room,
      this.dungeon,
      this.stateManager.floorNum,
      this.combatState.bullets,
      this.combatState.enemyBullets,
      this.combatState.grenades,
      this.combatState.enemyBombs,
      this.combatState.particles,
      this.combatState.beamEffects,
      this.combatState.damageNumbers,
      this.combatState.screenShake,
      timestampMs
    );
  }

  public handlePlayerDeath(): void {
    this.stateManager.gameOver = true;
    this.stateManager.clearRun();
    this.audio.gameOverSound();
    const player = this.stateManager.player;
    const meta = this.stateManager.metaSave;
    this.garage.open(true, this.stateManager.floorNum, meta, player);
  }

  public nextFloor(): void {
    this.stateManager.floorNum += 1;
    this.audio.nextFloor();
    this.startNewRun(true);
  }
}

// Bootstrap on DOM ready
if (typeof document !== 'undefined') {
  window.addEventListener('DOMContentLoaded', () => {
    const app = new MotoRogueApp();
    app.init().catch(console.error);
    (window as any).__MOTO_ROGUE_APP__ = app;
  });
}
