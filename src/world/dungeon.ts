/**
 * MOTO-ROGUE: Procedural Dungeon World Module
 *
 * Implements:
 * 1. Procedural Square-Room Dungeon Generation using BFS grid sprawl.
 * 2. Room Count Formula: targetRooms = 7 + min(10, floor * 2).
 * 3. Special Room Assignment (Manhattan distance sorting):
 *    - Furthest room: Boss room (type 'boss').
 *    - 2nd furthest: Treasure mod room (type 'treasure', cleared = true, central mod pedestal).
 *    - 3rd furthest: Shop room (type 'shop', cleared = true, 3 items).
 * 4. 5 Obstacle Layouts (Corners, Diamond Cross, Diagonal A, Diagonal B, Open).
 * 5. Obstacle Properties: 30% explosive TNT barrels, 70% indestructible rocks.
 * 6. Difficulty scaling, enemy roster unlocks, and elite spawn rolls by floor.
 *
 * Parity reference: moto-rogue/index.html L1483-L1770
 */

import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  WALL_THICKNESS,
  type Direction,
  type Point2D,
  type Room,
  type Dungeon,
  type DungeonGraph,
  type Obstacle,
  type RegularEnemy,
  type RegularEnemyType,
  type Boss,
  type BossVariantId,
  type BossVariantName,
  type WeaponId,
  type BiomeZoneType
} from '../types/game';
import { RUN_MOD_POOL, type RunModDef } from '../data/upgrades';
import { WEAPONS, UNLOCKABLE_IDS } from '../data/weapons';

export const BIOME_NAMES: Record<number, string> = {
  1: 'RUSTYARD BUNKER',
  2: 'SMELTER FOUNDRY',
  3: 'NEON CYBER-FREEWAY',
  4: 'SUB-ZERO CRYO LAB',
  5: 'MAGMA CORE',
  6: 'CHROME CITADEL'
};

// Entity ID sequence
let nextEntityId = 1;

export function getNextEntityId(): number {
  return nextEntityId++;
}

export function resetEntityId(value = 1): void {
  nextEntityId = value;
}

/**
 * 5 Canonical Obstacle Layout Patterns
 */
export const OBSTACLE_PATTERNS: readonly (readonly Point2D[])[] = [
  // 0: Corners (always used in Boss rooms)
  [
    { x: 200, y: 200 },
    { x: ARENA_WIDTH - 200, y: 200 },
    { x: 200, y: ARENA_HEIGHT - 200 },
    { x: ARENA_WIDTH - 200, y: ARENA_HEIGHT - 200 }
  ],
  // 1: Diamond Cross
  [
    { x: ARENA_WIDTH / 2, y: 215 },
    { x: ARENA_WIDTH / 2, y: ARENA_HEIGHT - 215 },
    { x: 215, y: ARENA_HEIGHT / 2 },
    { x: ARENA_WIDTH - 215, y: ARENA_HEIGHT / 2 }
  ],
  // 2: Diagonal A
  [
    { x: 245, y: 245 },
    { x: ARENA_WIDTH - 245, y: ARENA_HEIGHT - 245 }
  ],
  // 3: Diagonal B
  [
    { x: 245, y: ARENA_HEIGHT - 245 },
    { x: ARENA_WIDTH - 245, y: 245 }
  ],
  // 4: Open
  []
] as const;

/**
 * Exponential scaling per floor:
 * 1.55^(floor - 1)
 */
export function getFloorScale(floor: number): number {
  const f = Math.max(1, floor);
  return Math.pow(1.55, f - 1);
}

/**
 * Pick a random in-run modification from the pool.
 */
export function pickRandomMod(random: () => number = Math.random): RunModDef {
  return RUN_MOD_POOL[Math.floor(random() * RUN_MOD_POOL.length)];
}

/**
 * Creates a Boss entity matching floor scaling and variant rotation.
 * index.html L1706-L1730
 */
export function createBoss(floor: number, x: number, y: number): Boss {
  const f = Math.max(1, floor);
  const scale = getFloorScale(f);
  const bossVariant = ((f - 1) % 6) as BossVariantId;
  const names: BossVariantName[] = [
    'SCRAP GOLIATH',
    'SIEGE BEHEMOTH',
    'OVERLORD HELION',
    'CRYO VALKYRIE',
    'INFERNO COLOSSUS',
    'OMEGA VALHALLA'
  ];
  const subtitles: string[] = [
    'THE RUSTYARD JUGGERNAUT',
    'HELLFIRE ARTILLERY RIG',
    'CYBER-PLASMA HOVERTANK',
    'SUB-ZERO JET INTERCEPTOR',
    'MOLTEN SMELTER CRAWLER',
    'THE CHROME APOCALYPSE'
  ];
  const colors = ['#e63946', '#f77f00', '#9d4edd', '#00bbf9', '#ff5400', '#ffd166'];
  const radii = [36, 38, 36, 34, 40, 40];
  const baseHp = Math.round(1120 * scale);

  return {
    id: getNextEntityId(),
    type: 'boss',
    bossVariant,
    name: names[bossVariant],
    subtitle: subtitles[bossVariant],
    x,
    y,
    vx: 0,
    vy: 0,
    radius: radii[bossVariant] ?? 36,
    hp: baseHp,
    maxHp: baseHp,
    speed: Math.round(105 * Math.pow(1.06, f - 1)),
    burnTimer: 0,
    burnTick: 0,
    aiTimer: 1.3,
    subTimer: 3.2,
    specialTimer: 4.5,
    dashVx: 0,
    dashVy: 0,
    angle: 0,
    state: 'idle',
    isElite: false,
    color: colors[bossVariant]
  };
}

/**
 * Creates a regular or elite enemy scaled to floor level.
 * index.html L1732-L1770
 */
export function createEnemy(
  type: RegularEnemyType,
  x: number,
  y: number,
  floor: number,
  isElite = false,
  random: () => number = Math.random
): RegularEnemy {
  const f = Math.max(1, floor);
  const scale = getFloorScale(f) * (isElite ? 1.65 : 1);
  const spdScale = Math.pow(1.06, f - 1) * (isElite ? 1.15 : 1);
  const base = {
    id: getNextEntityId(),
    type,
    x,
    y,
    vx: 0,
    vy: 0,
    burnTimer: 0,
    burnTick: 0,
    aiTimer: 0.6 + random() * 0.8,
    state: 'idle',
    angle: 0,
    isElite
  };

  switch (type) {
    case 'turret':
      return {
        ...base,
        radius: 16,
        hp: Math.round(42 * scale),
        maxHp: Math.round(42 * scale),
        speed: 35 * spdScale,
        color: '#9b5de5'
      };
    case 'charger':
      return {
        ...base,
        radius: 17,
        hp: Math.round(52 * scale),
        maxHp: Math.round(52 * scale),
        speed: 120 * spdScale,
        dashVx: 0,
        dashVy: 0,
        color: '#f15bb5'
      };
    case 'trishot':
      return {
        ...base,
        radius: 17,
        hp: Math.round(58 * scale),
        maxHp: Math.round(58 * scale),
        speed: 95 * spdScale,
        strafeDir: random() < 0.5 ? 1 : -1,
        color: '#00f5d4'
      };
    case 'bomber':
      return {
        ...base,
        radius: 18,
        hp: Math.round(64 * scale),
        maxHp: Math.round(64 * scale),
        speed: 75 * spdScale,
        color: '#ff9f1c'
      };
    case 'brute':
      return {
        ...base,
        radius: 22,
        hp: Math.round(105 * scale),
        maxHp: Math.round(105 * scale),
        speed: 68 * spdScale,
        color: '#5c677d'
      };
    case 'splitter':
      return {
        ...base,
        radius: 20,
        hp: Math.round(72 * scale),
        maxHp: Math.round(72 * scale),
        speed: 115 * spdScale,
        color: '#80ed99'
      };
    case 'mini_swarmer':
      return {
        ...base,
        radius: 11,
        hp: Math.round(22 * scale),
        maxHp: Math.round(22 * scale),
        speed: 175 * spdScale,
        color: '#57cc99'
      };
    case 'sniper':
      return {
        ...base,
        radius: 15,
        hp: Math.round(48 * scale),
        maxHp: Math.round(48 * scale),
        speed: 65 * spdScale,
        color: '#ff4d6d'
      };
    case 'pyro':
      return {
        ...base,
        radius: 19,
        hp: Math.round(82 * scale),
        maxHp: Math.round(82 * scale),
        speed: 110 * spdScale,
        color: '#ff5400'
      };
    case 'swarmer':
    default:
      return {
        ...base,
        radius: 14,
        hp: Math.round(34 * scale),
        maxHp: Math.round(34 * scale),
        speed: 130 * spdScale,
        zigPhase: random() * 6,
        color: '#00bbf9'
      };
  }
}

/**
 * Populates a Shop room with 3 items:
 * - Left: Hull Repair (+2 HP)
 * - Center: Random Stat Mod
 * - Right: Single-run weapon rental or 2nd stat mod
 * index.html L1589-L1635
 */
export function populateShop(
  room: Room,
  floor: number,
  isWeaponAvailable?: (id: WeaponId) => boolean,
  random: () => number = Math.random
): void {
  // Left item: Hull Repair (+2 HP)
  room.pickups.push({
    x: ARENA_WIDTH / 2 - 140,
    y: ARENA_HEIGHT / 2,
    type: 'shop_heart',
    name: 'Hull Repair (+2 HP)',
    cost: 8 + floor * 2,
    radius: 20
  });

  // Center item: Random Stat Mod
  const mod = pickRandomMod(random);
  room.pickups.push({
    x: ARENA_WIDTH / 2,
    y: ARENA_HEIGHT / 2,
    type: 'mod_pedestal',
    mod,
    cost: mod.cost + (floor - 1) * 4,
    radius: 22
  });

  // Right item: Run Weapon Rental or 2nd Stat Mod
  const isAvailable = isWeaponAvailable ?? (() => false);
  const unowned = UNLOCKABLE_IDS.filter(id => !isAvailable(id));

  if (unowned.length > 0) {
    const wId = unowned[Math.floor(random() * unowned.length)];
    room.pickups.push({
      x: ARENA_WIDTH / 2 + 140,
      y: ARENA_HEIGHT / 2,
      type: 'run_weapon',
      weaponId: wId,
      name: `${WEAPONS[wId].name} (Run)`,
      cost: 24 + (floor - 1) * 5,
      radius: 22
    });
  } else {
    const mod2 = pickRandomMod(random);
    room.pickups.push({
      x: ARENA_WIDTH / 2 + 140,
      y: ARENA_HEIGHT / 2,
      type: 'mod_pedestal',
      mod: mod2,
      cost: mod2.cost + (floor - 1) * 4,
      radius: 22
    });
  }
}

/**
 * Populates obstacles and enemies inside a room.
 * index.html L1637-L1699
 */
export function populateRoom(
  room: Room,
  floor: number,
  random: () => number = Math.random
): void {
  room.biomeZones = [];
  if (room.type === 'start' || room.type === 'treasure' || room.type === 'shop' || room.type === 'hub') {
    return;
  }

  const biomeIdx = ((Math.max(1, floor) - 1) % 6) + 1;

  // Add 2 environmental BiomeZone objects
  let zoneType: BiomeZoneType = 'oil_slick';
  let zoneRadius = 44;
  if (biomeIdx === 1) {
    zoneType = 'oil_slick';
    zoneRadius = 44;
  } else if (biomeIdx === 2 || biomeIdx === 5) {
    zoneType = 'lava_vent';
    zoneRadius = 38;
  } else if (biomeIdx === 3 || biomeIdx === 6) {
    zoneType = 'boost_strip';
    zoneRadius = 44;
  } else if (biomeIdx === 4) {
    zoneType = 'ice_patch';
    zoneRadius = 50;
  }

  const ox1 = (random() - 0.5) * 40;
  const oy1 = (random() - 0.5) * 40;
  const ox2 = (random() - 0.5) * 40;
  const oy2 = (random() - 0.5) * 40;
  room.biomeZones.push(
    { x: Math.round(220 + ox1), y: Math.round(220 + oy1), radius: zoneRadius, type: zoneType },
    { x: Math.round(500 + ox2), y: Math.round(500 + oy2), radius: zoneRadius, type: zoneType }
  );

  // 1. Choose obstacle pattern
  const patIndex = room.type === 'boss' ? 0 : Math.floor(random() * OBSTACLE_PATTERNS.length);
  const pat = OBSTACLE_PATTERNS[patIndex];

  for (const pos of pat) {
    const isBarrel = random() < 0.3;
    const obstacle: Obstacle = {
      x: pos.x,
      y: pos.y,
      size: 42,
      type: isBarrel ? 'barrel' : 'rock',
      variant: isBarrel ? (biomeIdx === 4 ? 'cryo_barrel' : 'explosive') : undefined,
      hp: isBarrel ? 18 + floor * 6 : 99999
    };
    room.obstacles.push(obstacle);
  }

  // 2. Boss room population
  if (room.type === 'boss') {
    room.enemies.push(createBoss(floor, ARENA_WIDTH / 2, ARENA_HEIGHT / 2 - 90));
    const minionCount = Math.min(4, floor);
    for (let i = 0; i < minionCount; i++) {
      const mx = i % 2 === 0 ? 155 : ARENA_WIDTH - 155;
      const my = i < 2 ? 155 : ARENA_HEIGHT - 155;
      room.enemies.push(createEnemy(floor >= 2 ? 'trishot' : 'swarmer', mx, my, floor, false, random));
    }
    return;
  }

  // 3. Regular combat room population
  const pool: RegularEnemyType[] = ['swarmer', 'turret', 'charger'];
  if (floor >= 2) {
    pool.push('trishot', 'bomber', 'brute');
  }
  if (floor >= 3) {
    pool.push('splitter', 'sniper', 'pyro');
  }

  const f = Math.max(1, floor);
  const baseCount = Math.min(18, Math.round(4 * Math.pow(1.22, f - 1)) + Math.floor(random() * 2));
  const eliteChance = f <= 1 ? 0 : Math.min(0.45, 0.10 * Math.pow(1.45, f - 2));

  for (let i = 0; i < baseCount; i++) {
    let ex = 0;
    let ey = 0;
    let tries = 0;
    do {
      ex = WALL_THICKNESS + 75 + random() * (ARENA_WIDTH - (WALL_THICKNESS + 75) * 2);
      ey = WALL_THICKNESS + 75 + random() * (ARENA_HEIGHT - (WALL_THICKNESS + 75) * 2);
      tries++;
    } while (tries < 25 && Math.hypot(ex - ARENA_WIDTH / 2, ey - ARENA_HEIGHT / 2) < 115);

    const type = pool[Math.floor(random() * pool.length)];
    const isElite = random() < eliteChance;
    room.enemies.push(createEnemy(type, ex, ey, floor, isElite, random));
  }
}

export interface DungeonGenerationOptions {
  randomFn?: () => number;
  isWeaponAvailable?: (id: WeaponId) => boolean;
}

/**
 * Procedural Graph Dungeon Generator
 * Matches BFS sprawling algorithm & Manhattan distance sorting from original prototype.
 *
 * index.html L1483-L1583
 */
export function generateDungeon(
  floor: number,
  options: DungeonGenerationOptions = {}
): DungeonGraph {
  const random = options.randomFn ?? Math.random;
  const dungeon: Dungeon = {};

  // Target rooms formula: 7 + min(10, floor * 2)
  const targetRooms = 7 + Math.min(10, floor * 2);

  const queue: Point2D[] = [{ x: 0, y: 0 }];
  const visited = new Set<string>(['0,0']);
  const coords: Point2D[] = [{ x: 0, y: 0 }];

  const dirs: { dx: number; dy: number; dir: Direction }[] = [
    { dx: 0, dy: -1, dir: 'N' },
    { dx: 0, dy: 1, dir: 'S' },
    { dx: -1, dy: 0, dir: 'W' },
    { dx: 1, dy: 0, dir: 'E' }
  ];

  // BFS grid expansion
  while (coords.length < targetRooms && queue.length > 0) {
    const curr = queue.shift()!;
    const shuffled = [...dirs].sort(() => random() - 0.5);

    for (const d of shuffled) {
      if (coords.length >= targetRooms) break;
      const nx = curr.x + d.dx;
      const ny = curr.y + d.dy;
      const key = `${nx},${ny}`;
      if (visited.has(key)) continue;

      let neighbors = 0;
      for (const cd of dirs) {
        if (visited.has(`${nx + cd.dx},${ny + cd.dy}`)) {
          neighbors++;
        }
      }

      if (neighbors === 1 || random() < 0.22) {
        visited.add(key);
        const node = { x: nx, y: ny };
        coords.push(node);
        queue.push(node);
      }
    }

    if (queue.length === 0 && coords.length < targetRooms) {
      queue.push(coords[Math.floor(random() * coords.length)]);
    }
  }

  // Initialize room data with floor-wide power-up quota (max 1 power-up per 2 rooms)
  const floorPowerUpQuota = {
    dropped: 0,
    max: Math.floor(coords.length / 2)
  };
  for (const c of coords) {
    const key = `${c.x},${c.y}`;
    const isStart = c.x === 0 && c.y === 0;
    dungeon[key] = {
      x: c.x,
      y: c.y,
      type: isStart ? 'start' : 'combat',
      cleared: isStart,
      visited: isStart,
      doors: { N: false, S: false, E: false, W: false },
      obstacles: [],
      enemies: [],
      pickups: [],
      hazards: [],
      skids: [],
      biomeZones: [],
      trapdoor: false,
      powerUpDropQuota: floorPowerUpQuota,
      powerUpDroppedInRoom: false
    };
  }

  // Doorway connectivity carving
  for (const c of coords) {
    const room = dungeon[`${c.x},${c.y}`];
    for (const d of dirs) {
      const nKey = `${c.x + d.dx},${c.y + d.dy}`;
      if (dungeon[nKey]) {
        room.doors[d.dir] = true;
      }
    }
  }

  // Special Room Distribution: Boss (furthest), Mod/Treasure Room (★), Shop Room ($)
  const nonStart = coords.filter(c => !(c.x === 0 && c.y === 0));
  nonStart.sort((a, b) => (Math.abs(b.x) + Math.abs(b.y)) - (Math.abs(a.x) + Math.abs(a.y)));

  let bossCoord: Point2D = { x: 0, y: 0 };
  let treasureCoord: Point2D | undefined;
  let shopCoord: Point2D | undefined;

  if (nonStart.length > 0) {
    bossCoord = nonStart[0];
    dungeon[`${bossCoord.x},${bossCoord.y}`].type = 'boss';
  }

  if (nonStart.length > 1) {
    treasureCoord = nonStart[1];
    const modRoom = dungeon[`${treasureCoord.x},${treasureCoord.y}`];
    modRoom.type = 'treasure';
    modRoom.cleared = true;
    const mod = pickRandomMod(random);
    modRoom.pickups.push({
      x: ARENA_WIDTH / 2,
      y: ARENA_HEIGHT / 2,
      type: 'mod_pedestal',
      mod,
      cost: 0,
      radius: 22
    });
  }

  if (nonStart.length > 2) {
    shopCoord = nonStart[2];
    const shopRoom = dungeon[`${shopCoord.x},${shopCoord.y}`];
    shopRoom.type = 'shop';
    shopRoom.cleared = true;
    populateShop(shopRoom, floor, options.isWeaponAvailable, random);
  }

  // Populate obstacles & enemies in all rooms
  for (const c of coords) {
    populateRoom(dungeon[`${c.x},${c.y}`], floor, random);
  }

  return {
    rooms: dungeon,
    floor,
    targetRooms,
    startCoord: { x: 0, y: 0 },
    bossCoord,
    treasureCoord,
    shopCoord
  };
}

/**
 * Creates the persistent Outlaw Home Base Hub room.
 * Hub stations / NPCs:
 * 1. Garage Bay (Wrench) - Tune bike, select paint livery, equip stash parts & unlock weapons
 * 2. Scrap Forge (Sparky) - Spend 12 Scrap to reforge equipped part rarity or forge new gear
 * 3. Cyber-Codex (Doc) - Inspect lifetime outlaw telemetry & claim +12% Tactical Scanner Buff
 * 4. War Room (Valkyrie) - Claim Outlaw Supply Cache & cycle Bounty Heat Level (0-3)
 * 5. Highway Gate - Deploy from Home Base into Floor 1
 */
export function createHomeBaseRoom(): Room {
  return {
    x: 0,
    y: 0,
    type: 'hub',
    cleared: true,
    visited: true,
    doors: { N: false, S: false, E: false, W: false },
    obstacles: [],
    enemies: [
      {
        ...createEnemy('charger', 360, 545, 1),
        hp: 9999,
        maxHp: 9999,
        speed: 0,
        isDummy: true,
        color: '#ffd60a'
      }
    ],
    pickups: [
      {
        x: 185,
        y: 215,
        type: 'hub_npc',
        npcId: 'garage',
        name: 'WRENCH // GARAGE BAY',
        subtitle: 'Tune bike, select paint livery, equip stash parts & unlock weapons',
        cost: 0,
        radius: 34
      },
      {
        x: 535,
        y: 215,
        type: 'hub_npc',
        npcId: 'blacksmith',
        name: 'SPARKY // SCRAP FORGE',
        subtitle: 'Spend 12 Scrap to reforge equipped part rarity or forge new gear',
        cost: 12,
        radius: 34
      },
      {
        x: 360,
        y: 155,
        type: 'hub_npc',
        npcId: 'codex',
        name: 'DOC // CYBER-CODEX',
        subtitle: 'Inspect lifetime outlaw telemetry & claim +12% Tactical Scanner Buff',
        cost: 0,
        radius: 34
      },
      {
        x: 185,
        y: 505,
        type: 'hub_npc',
        npcId: 'bounty',
        name: 'VALKYRIE // WAR ROOM',
        subtitle: 'Claim Outlaw Supply Cache & cycle Bounty Heat Level (0-3)',
        cost: 0,
        radius: 34
      },
      {
        x: 535,
        y: 505,
        type: 'hub_npc',
        npcId: 'launch',
        name: 'HIGHWAY GATE // RIDE OUT',
        subtitle: 'Deploy from Home Base into Floor 1',
        cost: 0,
        radius: 38
      }
    ],
    hazards: [],
    skids: [],
    biomeZones: [],
    trapdoor: false
  };
}
