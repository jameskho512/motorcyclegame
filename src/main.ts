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
  Room,
  Pickup,
  Boss
} from './types/game';

import { StateManager } from './core/state';
import { InputManager } from './core/input';
import { SoundSynthesizer } from './audio/sfx';
import { generateDungeon, createHomeBaseRoom } from './world/dungeon';
import { genLoot } from './data/equipment';
import {
  updateBikeKinematics,
  updateNos,
  handleWallAndDoors,
  resolveObstacleCollisions
} from './systems/physics';
import {
  createCombatState,
  fireWeapon,
  updateCombatPipeline,
  triggerExplosion,
  updateCombatVfx
} from './systems/combat';
import { updateEnemyAI, calcEnemyProjSpeedScale } from './systems/enemyAI';
import { StageManager } from './render/stage';
import { HUDController } from './ui/hud';
import { GarageController } from './ui/garage';
import { ShopModalController } from './ui/shopModal';
import { PortalModalController, shouldPromptPortal, isClearOfPortal } from './ui/portalModal';
import { SettingsController } from './ui/settings';
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
  public portalModal: PortalModalController;
  public portalDismissed: boolean = false;
  public settings: SettingsController;
  public tooltip: TooltipManager;
  public dismissedPickup: Pickup | null = null;
  public deathTimer: number = 0;
  public deathExplosionTriggered: boolean = false;
  public inHomeBase: boolean = false;
  public bountyClaimedInHub: boolean = false;
  public codexBuffClaimedInHub: boolean = false;

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
    this.portalModal = new PortalModalController();

    this.settings = new SettingsController({
      audio: this.audio,
      onOpenChange: (open: boolean) => {
        this.inputManager.setSettingsOpen(open);
        if (open) {
          this.inputManager.reset();
        }
      },
      onMuteChange: (muted: boolean) => {
        const soundBtn = document.getElementById('btn-toggle-sound');
        if (soundBtn) {
          soundBtn.textContent = muted ? '🔇 [M]' : '🔊 [M]';
        }
      }
    });

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
      onSelectLivery: (liveryId) => {
        this.stateManager.metaSave.livery = liveryId;
        this.stateManager.player.livery = liveryId;
        this.stateManager.saveMeta();
        this.updateHUD();
      },
      onResumeRun: () => {
        if (this.stateManager.gameOver || this.inHomeBase) {
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
        if (this.portalModal.isOpen() || this.settings.isOpen()) return;
        const player = this.stateManager.player;
        const meta = this.stateManager.metaSave;
        this.garage.toggle(this.stateManager.gameOver, this.stateManager.floorNum, meta, player);
      },
      onToggleMute: () => this.toggleAudioMute(),
      onToggleSettings: () => {
        if (this.portalModal.isOpen()) return;
        this.settings.toggle();
      },
      onCloseSettings: () => {
        this.settings.close();
      },
      onShopConfirm: () => {
        if (this.shopModal.isOpen()) {
          this.shopModal.confirm();
        }
      },
      onShopCancel: () => {
        if (this.shopModal.isOpen()) {
          const active = this.shopModal.getActivePickup();
          if (active) this.dismissedPickup = active;
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

    // Mount Settings (Audio Mixer) overlay and bind controls
    this.settings.mount();

    // Audio toggle button
    const soundBtn = document.getElementById('btn-toggle-sound');
    soundBtn?.addEventListener('click', () => this.toggleAudioMute());

    // Garage toggle button
    const garageBtn = document.getElementById('btn-open-garage');
    garageBtn?.addEventListener('click', () => {
      if (this.portalModal.isOpen() || this.settings.isOpen()) return;
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
      () => this.garage.isOpen() || this.shopModal.isOpen() || this.portalModal.isOpen() || this.settings.isOpen()
    );

    // Responsive scaling
    window.addEventListener('resize', () => this.fitAll());
    this.fitAll();

    // Minimap Fast-Travel handler (click any visited room on minimap when current room is cleared)
    this.hud.onFastTravelRoom = (rx: number, ry: number) => {
      const curRoom = this.getCurrentRoom();
      if (!curRoom || !curRoom.cleared || this.inHomeBase) return;
      if (rx === this.curRoomX && ry === this.curRoomY) return;
      const targetRoom = this.dungeon[`${rx},${ry}`];
      if (!targetRoom || !targetRoom.visited) return;
      this.curRoomX = rx;
      this.curRoomY = ry;
      this.stateManager.player.x = ARENA_WIDTH / 2;
      this.stateManager.player.y = ARENA_HEIGHT / 2;
      this.stateManager.player.vx = 0;
      this.stateManager.player.vy = 0;
      this.combatState.bullets = [];
      this.combatState.enemyBullets = [];
      this.combatState.grenades = [];
      this.combatState.enemyBombs = [];
      this.audio.doorTransition();
      this.combatState.damageNumbers.push({
        x: ARENA_WIDTH / 2,
        y: ARENA_HEIGHT / 2 - 28,
        text: '⚡ FAST TRAVEL!',
        color: '#00f5d4',
        life: 1.0,
        maxLife: 1.0
      });
      this.hud.showToast('TACTICAL WARP', '⚡ TELEPORTED TO CLEARED SECTOR', '#2ee6ff', 1600);
      this.updateHUD();
    };

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
    this.inHomeBase = false;
    this.deathTimer = 0;
    this.deathExplosionTriggered = false;
    this.stateManager.player.deathTimer = 0;
    this.dismissedPickup = null;
    this.portalDismissed = false;
    this.portalModal.close();
    if (!restored) {
      this.stateManager.resetRun();
    }

    const floor = this.stateManager.floorNum;
    const meta = this.stateManager.metaSave;
    meta.bestFloor = Math.max(meta.bestFloor || 1, floor);
    this.stateManager.saveMeta();

    const dungeonGraph = generateDungeon(floor, {
      isWeaponAvailable: (wId: WeaponId) => !!meta.unlocked[wId as UnlockableWeaponId] || wId === 'pistol'
    });

    const heatLevel = meta.heatLevel || 0;
    if (heatLevel > 0) {
      for (const rm of Object.values(dungeonGraph.rooms)) {
        for (const en of rm.enemies) {
          if (!en.isDummy) {
            en.maxHp = Math.round(en.maxHp * (1 + heatLevel * 0.2));
            en.hp = en.maxHp;
            en.speed *= 1 + heatLevel * 0.08;
          }
        }
      }
    }

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
    player.stunTimer = 0;

    this.combatState = createCombatState();
    this.hud.updateBossBar(null, this.stateManager.floorNum);
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
    this.settings.sync();
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

    const topReserve = 12;
    const bottomReserve = window.innerHeight < 820 ? 124 : 148;
    const availH = Math.max(320, window.innerHeight - topReserve - bottomReserve);
    const availW = Math.max(360, window.innerWidth - 280);
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

    if (miniCanvas) fitCanvas(miniCanvas, 340, 215);
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
    const isPaused =
      this.garage.isOpen() ||
      this.shopModal.isOpen() ||
      this.portalModal.isOpen() ||
      this.settings.isOpen() ||
      this.hud.isBossIntroActive() ||
      this.stateManager.gameOver;
    const player = this.stateManager.player;
    const room = this.getCurrentRoom();

    const activeBoss = room ? (room.enemies.find((e): e is Boss => e.type === 'boss' && e.hp > 0) || null) : null;
    this.hud.updateBossBar(activeBoss, this.stateManager.floorNum);

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

    if (this.deathTimer > 0) {
      this.deathTimer = Math.max(0, this.deathTimer - dt);
      player.deathTimer = this.deathTimer;
      // Bike spins out of control and sheds sparks/flames
      player.bikeAngle += dt * 16;
      player.vx *= Math.pow(0.08, dt);
      player.vy *= Math.pow(0.08, dt);
      player.x = Math.max(75, Math.min(ARENA_WIDTH - 75, player.x + player.vx * dt));
      player.y = Math.max(75, Math.min(ARENA_HEIGHT - 75, player.y + player.vy * dt));

      // Continuous crash fire particles
      this.combatState.particles.push({
        x: player.x + (Math.random() - 0.5) * 24,
        y: player.y + (Math.random() - 0.5) * 24,
        vx: (Math.random() - 0.5) * 140,
        vy: (Math.random() - 0.5) * 140 - 30,
        radius: 4 + Math.random() * 4,
        color: Math.random() < 0.5 ? '#ff5400' : '#ffd166',
        life: 0.35,
        maxLife: 0.35
      });

      if (this.deathTimer <= 1.2 && !this.deathExplosionTriggered) {
        this.deathExplosionTriggered = true;
        triggerExplosion(player.x, player.y, 110, 0, room, this.combatState, this.audio);
        this.combatState.damageNumbers.push({
          x: player.x,
          y: player.y - 28,
          text: 'EVACUATING TO HOME BASE...',
          color: '#2ee6ff',
          life: 1.1,
          maxLife: 1.1
        });
      }

      updateCombatVfx(dt, this.combatState);
      this.stage.update(dt);

      if (this.deathTimer <= 0) {
        this.handlePlayerDeath();
      }
      return;
    }

    // 2. Player Invulnerability timer
    if (player.invuln > 0) {
      player.invuln = Math.max(0, player.invuln - dt);
    }

    if (player.stunTimer && player.stunTimer > 0) {
      player.stunTimer = Math.max(0, player.stunTimer - dt);
    }
    const isStunned = (player.stunTimer || 0) > 0;

    // 3. Bike Kinematics & NOS
    let ix = (inputState.right ? 1 : 0) - (inputState.left ? 1 : 0);
    let iy = (inputState.down ? 1 : 0) - (inputState.up ? 1 : 0);

    if (isStunned) {
      ix = 0;
      iy = 0;
    }

    const { boosting } = updateNos(player, isShiftHeld && !isStunned, isMoving && !isStunned, dt);

    // Per-frame NOS bar visual update
    this.hud.updateNos(player.nos, player.nosMax, player.nosLock, boosting);

    updateBikeKinematics(player, ix, iy, boosting, dt, room);

    if ((player.driftCharge || 0) >= 0.85) {
      player.driftCharge = 0;
      player.driftBoostTimer = 2.2;

      for (let i = 0; i < 6; i++) {
        const a = (i * Math.PI) / 3;
        this.combatState.bullets.push({
          x: player.x,
          y: player.y,
          vx: Math.cos(a) * 420,
          vy: Math.sin(a) * 420,
          radius: 4.5,
          dmg: 14 * player.dmgMult,
          pierceLeft: 1,
          bounceLeft: 1,
          hitIds: new Set(),
          color: '#ffd60a',
          life: 0.45
        });
      }

      this.combatState.damageNumbers.push({
        x: player.x,
        y: player.y - 26,
        text: 'DRIFT OVERCHARGE! +FIRE RATE!',
        color: '#ffd60a',
        life: 1.0,
        maxLife: 1.0
      });
    }

    if ((player.driftBoostTimer || 0) > 0) {
      player.fireTimer = Math.max(0, player.fireTimer - dt * 0.35);
    }

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
      if (nextRoom && nextRoom.type === 'boss' && !nextRoom.cleared && !nextRoom.bossIntroShown) {
        const boss = nextRoom.enemies.find((e): e is Boss => e.type === 'boss');
        if (boss) {
          nextRoom.bossIntroShown = true;
          this.inputManager.reset();
          this.hud.showBossIntro(boss, this.stateManager.floorNum, () => {
            this.inputManager.reset();
          });
        }
      }
      this.audio.doorTransition();
      this.dismissedPickup = null;
      this.portalDismissed = false;
      this.portalModal.close();
      this.stateManager.saveRun();
      this.updateHUD();
      return;
    }

    // 4. Trapdoor interaction (Next floor)
    if (room.trapdoor) {
      if (this.portalDismissed && isClearOfPortal(player.x, player.y)) {
        this.portalDismissed = false;
      }
      if (shouldPromptPortal({
        trapdoor: !!room.trapdoor,
        playerX: player.x,
        playerY: player.y,
        dismissed: this.portalDismissed,
        modalOpen: this.portalModal.isOpen()
      })) {
        this.inputManager.reset();
        this.portalModal.open(
          { floorNum: this.stateManager.floorNum },
          () => this.nextFloor(),
          () => { this.portalDismissed = true; }
        );
        return;
      }
    }

    // 5. Weapon Firing
    player.fireTimer = Math.max(0, player.fireTimer - dt);
    if (!isStunned && inputState.fire && player.fireTimer <= 0) {
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
      if (en.isDummy) {
        en.hp = Math.min(en.maxHp, en.hp + dt * 400);
        en.vx *= Math.pow(0.05, dt);
        en.vy *= Math.pow(0.05, dt);
        en.x = 360 + (en.x - 360) * Math.pow(0.2, dt);
        en.y = 545 + (en.y - 545) * Math.pow(0.2, dt);
        continue;
      }
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
            this.startDeathSequence();
          }
        }
      }
    );

    // 8. Room Clearance Check
    if (!room.cleared && room.enemies.length === 0) {
      room.cleared = true;
      if (room.type === 'boss') {
        room.trapdoor = true;
        this.hud.showToast('APEX TARGET ELIMINATED', '☠ DIMENSIONAL RIFT UNLOCKED!', '#ffd60a', 2400);
      } else {
        this.hud.showToast('SECTOR SECURED', '★ DOORS & MINIMAP WARP UNLOCKED', '#00f5d4', 1900);
      }
      this.audio.roomClear();
      this.updateHUD();
    }

    // Clear dismissed shop pickup if player moved away from it
    if (this.dismissedPickup) {
      const dist = Math.hypot(this.dismissedPickup.x - player.x, this.dismissedPickup.y - player.y);
      if (dist > player.radius + this.dismissedPickup.radius + 12) {
        this.dismissedPickup = null;
      }
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
          // Do not re-prompt if the player explicitly cancelled this purchase until they step away
          if (this.dismissedPickup === p) {
            continue;
          }
          // Proximity shop prompt confirmation
          if (!this.shopModal.isOpen()) {
            this.shopModal.open(
              p,
              () => {
                this.dismissedPickup = null;
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
              },
              () => {
                this.dismissedPickup = p;
              }
            );
          }
        } else if ((p as any).type === 'hub_npc') {
          if (this.dismissedPickup === p) continue;
          this.dismissedPickup = p;
          const npc = p as any;
          if (npc.npcId === 'garage') {
            this.inputManager.reset();
            this.garage.open(false, this.stateManager.floorNum, this.stateManager.metaSave, player);
          } else if (npc.npcId === 'blacksmith') {
            const meta = this.stateManager.metaSave;
            if (meta.scrap >= 12) {
              meta.scrap -= 12;
              const upgradable = Object.values(meta.equipped).find(it => it && it.rarity < 3);
              if (upgradable) {
                upgradable.rarity = Math.min(3, upgradable.rarity + 1) as any;
                for (const k of Object.keys(upgradable.stats) as (keyof typeof upgradable.stats)[]) {
                  if (typeof upgradable.stats[k] === 'number') {
                    upgradable.stats[k] = Number((upgradable.stats[k]! * 1.25).toFixed(2));
                  }
                }
                this.stateManager.saveMeta();
                this.audio.pickupLoot(upgradable.rarity);
                this.combatState.damageNumbers.push({
                  x: p.x,
                  y: p.y - 34,
                  text: `REFORGED: ${upgradable.name.toUpperCase()} UPGRADED!`,
                  color: '#ffd60a',
                  life: 1.5,
                  maxLife: 1.5
                });
              } else {
                const forged = genLoot(Math.max(2, this.stateManager.floorNum + 1));
                this.stateManager.receiveLoot(forged);
                this.stateManager.saveMeta();
                this.audio.pickupLoot(forged.rarity);
                this.combatState.damageNumbers.push({
                  x: p.x,
                  y: p.y - 34,
                  text: `FORGED: ${forged.name.toUpperCase()}!`,
                  color: '#2ee6ff',
                  life: 1.4,
                  maxLife: 1.4
                });
              }
              this.updateHUD();
            } else {
              this.audio.shopError();
              this.combatState.damageNumbers.push({
                x: p.x,
                y: p.y - 34,
                text: 'NEED 12 SCRAP ⚙️!',
                color: '#ef233c',
                life: 1.1,
                maxLife: 1.1
              });
            }
          } else if (npc.npcId === 'codex') {
            const meta = this.stateManager.metaSave;
            this.combatState.damageNumbers.push({
              x: p.x,
              y: p.y - 42,
              text: `CODEX // BEST FLR ${meta.bestFloor || 1} · KILLS ${meta.totalKills || 0} · BOSSES ${meta.bossesSlain || 0}`,
              color: '#2ee6ff',
              life: 1.8,
              maxLife: 1.8
            });
            if (!this.codexBuffClaimedInHub) {
              this.codexBuffClaimedInHub = true;
              player.projSpeedMult += 0.15;
              player.dmgMult += 0.08;
              this.audio.pickupItem();
              this.combatState.damageNumbers.push({
                x: p.x,
                y: p.y - 22,
                text: 'TACTICAL SCANNER: +8% DMG & +15% PROJ SPD!',
                color: '#ffd60a',
                life: 1.8,
                maxLife: 1.8
              });
              this.updateHUD();
            }
          } else if (npc.npcId === 'bounty') {
            if (!this.bountyClaimedInHub) {
              this.bountyClaimedInHub = true;
              player.coins += 15;
              player.maxHp += 1;
              player.hp = player.maxHp;
              this.audio.pickupItem();
              this.combatState.damageNumbers.push({
                x: p.x,
                y: p.y - 34,
                text: 'WAR ROOM CACHE: +15 COINS & +1 HULL!',
                color: '#06d6a0',
                life: 1.5,
                maxLife: 1.5
              });
              this.updateHUD();
            } else {
              const meta = this.stateManager.metaSave;
              const nextHeat = ((meta.heatLevel || 0) + 1) % 4;
              meta.heatLevel = nextHeat;
              player.heatLevel = nextHeat;
              this.stateManager.saveMeta();
              this.audio.uiClick();
              this.combatState.damageNumbers.push({
                x: p.x,
                y: p.y - 34,
                text: nextHeat === 0
                  ? 'BOUNTY HEAT RESET: STANDARD THREAT (0%)'
                  : `BOUNTY HEAT LVL ${nextHeat}: +${nextHeat * 25}% SCRAP & THREAT!`,
                color: nextHeat === 0 ? '#2ee6ff' : '#ff5400',
                life: 1.5,
                maxLife: 1.5
              });
              this.updateHUD();
            }
          } else if (npc.npcId === 'launch') {
            const savedCoins = player.coins;
            const savedExtraHp = Math.max(0, player.maxHp - (6 + (this.stateManager.metaSave.ranks.maxHp || 0)));
            const savedScanner = this.codexBuffClaimedInHub;
            this.stateManager.metaSave.totalRuns = (this.stateManager.metaSave.totalRuns || 0) + 1;
            this.stateManager.saveMeta();
            this.audio.nextFloor();
            this.startNewRun(false);
            if (savedCoins > 0) {
              this.stateManager.player.coins += savedCoins;
            }
            if (savedExtraHp > 0) {
              this.stateManager.player.maxHp += savedExtraHp;
              this.stateManager.player.hp = this.stateManager.player.maxHp;
            }
            if (savedScanner) {
              this.stateManager.player.projSpeedMult += 0.15;
              this.stateManager.player.dmgMult += 0.08;
            }
            this.updateHUD();
            return;
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

  public startDeathSequence(): void {
    if (this.deathTimer > 0) return;
    const player = this.stateManager.player;
    this.deathTimer = 2.2;
    player.deathTimer = 2.2;
    this.deathExplosionTriggered = false;
    this.inputManager.reset();
    this.audio.gameOverSound();
    triggerExplosion(player.x, player.y, 95, 0, this.getCurrentRoom()!, this.combatState, this.audio);
    this.combatState.screenShake = 18;
    this.combatState.damageNumbers.push({
      x: player.x,
      y: player.y - 32,
      text: 'CRITICAL HULL BREACH!!',
      color: '#ff1744',
      life: 1.8,
      maxLife: 1.8
    });
    this.combatState.damageNumbers.push({
      x: player.x,
      y: player.y - 12,
      text: 'ALL POWERUPS LOST!',
      color: '#ffd60a',
      life: 1.8,
      maxLife: 1.8
    });
  }

  public handlePlayerDeath(): void {
    this.stateManager.clearRun();
    this.stateManager.resetRun();
    this.enterHomeBase();
  }

  public enterHomeBase(): void {
    this.deathTimer = 0;
    this.deathExplosionTriggered = false;
    this.inHomeBase = true;
    this.bountyClaimedInHub = false;
    this.codexBuffClaimedInHub = false;
    this.stateManager.gameOver = false;
    this.stateManager.floorNum = 1;
    this.dismissedPickup = null;
    this.portalDismissed = false;
    this.portalModal.close();
    this.hud.updateBossBar(null, 1);

    const player = this.stateManager.player;
    player.deathTimer = 0;
    player.stunTimer = 0;
    player.x = ARENA_WIDTH / 2;
    player.y = ARENA_HEIGHT / 2;
    player.vx = 0;
    player.vy = 0;

    this.dungeon = { '0,0': createHomeBaseRoom() };
    this.curRoomX = 0;
    this.curRoomY = 0;
    this.combatState = createCombatState();
    this.combatState.damageNumbers.push({
      x: player.x,
      y: player.y - 36,
      text: 'HOME BASE // POWERUPS RESET',
      color: '#ffd60a',
      life: 2.2,
      maxLife: 2.2
    });
    this.hud.showToast('OUTLAW SANCTUARY', '🛠️ 5 UPGRADE STATIONS & TARGET RANGE ACTIVE', '#ffd60a', 2500);
    this.updateHUD();
  }

  public nextFloor(): void {
    this.portalDismissed = false;
    this.portalModal.close();
    const clearedValhalla = this.stateManager.floorNum === 6;
    this.stateManager.floorNum += 1;
    if (clearedValhalla) {
      this.stateManager.metaSave.scrap += 50;
      this.stateManager.saveMeta();
    }
    this.audio.nextFloor();
    this.startNewRun(true);
    if (clearedValhalla) {
      this.combatState.damageNumbers.push({
        x: this.stateManager.player.x,
        y: this.stateManager.player.y - 38,
        text: 'VALHALLA VICTORY! +50 SCRAP // ENDLESS OVERDRIVE!',
        color: '#ffd60a',
        life: 2.5,
        maxLife: 2.5
      });
      this.updateHUD();
    }
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
