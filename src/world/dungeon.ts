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

  let barrelIndex = 0;
  for (const pos of pat) {
    const isBarrel = random() < 0.3;
    let variant: 'cryo_barrel' | 'explosive' | undefined = undefined;
    if (isBarrel) {
      if (biomeIdx === 4) {
        variant = barrelIndex % 2 === 0 ? 'cryo_barrel' : 'explosive';
      } else {
        variant = 'explosive';
      }
      barrelIndex++;
    }
    const obstacle: Obstacle = {
      x: pos.x,
      y: pos.y,
      size: 42,
      type: isBarrel ? 'barrel' : 'rock',
      variant,
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

  const fallbackPool: RegularEnemyType[] = floor >= 2
    ? ['swarmer', 'charger', 'trishot']
    : ['swarmer', 'charger'];

  const f = Math.max(1, floor);
  const baseCount = Math.min(18, Math.round(4 * Math.pow(1.22, f - 1)) + Math.floor(random() * 2));
  const eliteChance = f <= 1 ? 0 : Math.min(0.45, 0.10 * Math.pow(1.45, f - 2));
  let sniperTurretCount = room.enemies.filter(e => e.type === 'sniper' || e.type === 'turret').length;

  for (let i = 0; i < baseCount; i++) {
    let ex = 0;
    let ey = 0;
    let tries = 0;
    do {
      ex = WALL_THICKNESS + 75 + random() * (ARENA_WIDTH - (WALL_THICKNESS + 75) * 2);
      ey = WALL_THICKNESS + 75 + random() * (ARENA_HEIGHT - (WALL_THICKNESS + 75) * 2);
      tries++;
    } while (tries < 25 && Math.hypot(ex - ARENA_WIDTH / 2, ey - ARENA_HEIGHT / 2) < 115);

    let type = pool[Math.floor(random() * pool.length)];
    if (type === 'sniper' || type === 'turret') {
      if (sniperTurretCount >= 3) {
        type = fallbackPool[Math.floor(random() * fallbackPool.length)];
      } else {
        sniperTurretCount++;
      }
    }
    const isElite = random() < eliteChance;
    room.enemies.push(createEnemy(type, ex, ey, floor, isElite, random));
  }
}

/**
 * Configures Treasure rooms with Choice-of-2 free Mod Pedestals:
 * - Moves the existing free pedestal to x = ARENA_WIDTH / 2 - 72, y = ARENA_HEIGHT / 2 with choiceGroup = 'treasure_choice'.
 * - Spawns a 2nd distinct free pedestal at x = ARENA_WIDTH / 2 + 72, y = ARENA_HEIGHT / 2 with choiceGroup = 'treasure_choice'.
 * - When the player claims any pedestal with choiceGroup, the sibling pedestal in the same choiceGroup despawns automatically.
 */
export function enableChoicePedestalsInTreasureRooms(
  dungeon: Dungeon,
  extraModPool?: readonly RunModDef[],
  random: () => number = Math.random
): void {
  const roomsMap: Dungeon = (dungeon as unknown as DungeonGraph).rooms
    ? (dungeon as unknown as DungeonGraph).rooms
    : dungeon;
  const pool = extraModPool && extraModPool.length > 0 ? extraModPool : RUN_MOD_POOL;

  for (const room of Object.values(roomsMap)) {
    if (room.type !== 'treasure') continue;

    // Locate or create the primary free mod pedestal
    let pedestal1 = room.pickups.find(p => p.type === 'mod_pedestal');
    if (!pedestal1 || pedestal1.type !== 'mod_pedestal') {
      const mod1 = pool[Math.floor(random() * pool.length)];
      pedestal1 = {
        x: ARENA_WIDTH / 2 - 72,
        y: ARENA_HEIGHT / 2,
        type: 'mod_pedestal',
        mod: mod1,
        cost: 0,
        radius: 22
      };
      room.pickups.push(pedestal1);
    } else {
      pedestal1.x = ARENA_WIDTH / 2 - 72;
      pedestal1.y = ARENA_HEIGHT / 2;
      pedestal1.cost = 0;
    }
    (pedestal1 as any).choiceGroup = 'treasure_choice';

    // Remove any pre-existing second choice pedestal if called multiple times
    for (let i = room.pickups.length - 1; i >= 0; i--) {
      const p = room.pickups[i];
      if (p !== pedestal1 && (p as any).choiceGroup === 'treasure_choice') {
        Array.prototype.splice.call(room.pickups, i, 1);
      }
    }

    const baseMod1 = (pedestal1.mod as any)._baseMod || pedestal1.mod;
    const distinctCandidates = pool.filter(m => m.id !== baseMod1.id);
    const baseMod2 = distinctCandidates.length > 0
      ? distinctCandidates[Math.floor(random() * distinctCandidates.length)]
      : pool[Math.floor(random() * pool.length)];

    const pedestal2 = {
      x: ARENA_WIDTH / 2 + 72,
      y: ARENA_HEIGHT / 2,
      type: 'mod_pedestal' as const,
      mod: baseMod2,
      cost: 0,
      radius: 22,
      choiceGroup: 'treasure_choice'
    };

    const despawnChoiceSiblings = (claimed: unknown, group: string) => {
      for (let i = room.pickups.length - 1; i >= 0; i--) {
        const pk = room.pickups[i];
        if (pk !== claimed && (pk as any).choiceGroup === group) {
          Array.prototype.splice.call(room.pickups, i, 1);
        }
      }
    };

    const wrapChoiceMod = (targetPedestal: typeof pedestal1, underlyingMod: RunModDef) => {
      const wrapped = {
        ...underlyingMod,
        _baseMod: underlyingMod,
        apply: (player: any) => {
          underlyingMod.apply(player);
          const group = (targetPedestal as any).choiceGroup;
          if (group) {
            despawnChoiceSiblings(targetPedestal, group);
          }
        }
      };
      targetPedestal.mod = wrapped;
    };

    wrapChoiceMod(pedestal1, baseMod1 as RunModDef);
    wrapChoiceMod(pedestal2, baseMod2);
    room.pickups.push(pedestal2);

    // Also hook room.pickups.splice so removing any choiceGroup pedestal via splice despawns its sibling
    if (!(room.pickups as any)._choiceSpliceHooked) {
      Object.defineProperty(room.pickups, '_choiceSpliceHooked', {
        value: true,
        enumerable: false,
        configurable: true
      });
      const origSplice = room.pickups.splice;
      Object.defineProperty(room.pickups, 'splice', {
        value: function (start: number, deleteCount?: number, ...items: any[]) {
          const removed = deleteCount === undefined
            ? (origSplice as any).call(this, start)
            : (origSplice as any).call(this, start, deleteCount, ...items);
          for (const rem of removed) {
            const grp = rem && (rem as any).choiceGroup;
            if (grp) {
              for (let j = this.length - 1; j >= 0; j--) {
                if ((this[j] as any)?.choiceGroup === grp) {
                  origSplice.call(this, j, 1);
                }
              }
            }
          }
          return removed;
        },
        enumerable: false,
        configurable: true,
        writable: true
      });
    }
  }
}

/**
 * Assigns biome-specific barrel variants:
 * - On floor 4 (SUB-ZERO CRYO LAB), tags every even-indexed barrel in each room as 'cryo_barrel'
 *   and every odd-indexed barrel as 'explosive'.
 * - On all other floors, tags all barrels as 'explosive'.
 * Rock obstacles remain unmodified.
 */
export function assignBiomeBarrelVariants(dungeon: Dungeon | DungeonGraph, floor: number): void {
  const roomsMap: Dungeon = (dungeon as unknown as DungeonGraph).rooms
    ? (dungeon as unknown as DungeonGraph).rooms
    : (dungeon as Dungeon);

  for (const room of Object.values(roomsMap)) {
    if (!room || !room.obstacles) continue;
    let barrelIndex = 0;
    for (const ob of room.obstacles) {
      if (ob.type === 'barrel') {
        if (floor === 4) {
          ob.variant = barrelIndex % 2 === 0 ? 'cryo_barrel' : 'explosive';
        } else {
          ob.variant = 'explosive';
        }
        barrelIndex++;
      }
    }
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

  assignBiomeBarrelVariants(dungeon, floor);

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

export interface FloorBountyContract {
  id: string;
  floor: number;
  title: string;
  desc: string;
  targetCount: number;
  scrapReward: number;
  coinReward: number;
}

export function getFloorBountyContract(floorNum: number = 1): FloorBountyContract {
  const safeFloor = Math.max(1, Math.floor(Number(floorNum) || 1));
  switch (safeFloor) {
    case 1:
      return { id: 'GRAZE_INITIATE', floor: 1, title: 'NEON DAREDEVIL', desc: 'Graze 3 enemy projectiles or clear Floor 1 Boss', targetCount: 3, scrapReward: 8, coinReward: 10 };
    case 2:
      return { id: 'DRIFT_DEMON', floor: 2, title: 'ASPHALT DRIFTER', desc: 'Trigger 2 Handbrake Drift Boosts or clear Floor 2 Boss', targetCount: 2, scrapReward: 10, coinReward: 14 };
    case 3:
      return { id: 'STYLE_HUNTER', floor: 3, title: 'HIGH-OCTANE STYLER', desc: 'Reach Style Rank A in combat or clear Floor 3 Boss', targetCount: 55, scrapReward: 14, coinReward: 18 };
    case 4:
      return { id: 'CRYO_SHATTER', floor: 4, title: 'CRYO BREAKER', desc: 'Detonate 2 Cryo/Explosive Barrels or clear Floor 4 Boss', targetCount: 2, scrapReward: 18, coinReward: 22 };
    case 5:
      return { id: 'OVERDRIVE_SLAYER', floor: 5, title: 'FORGE EXECUTIONER', desc: 'Achieve a 5x Rampage Killstreak or clear Floor 5 Boss', targetCount: 5, scrapReward: 22, coinReward: 28 };
    default:
      return {
        id: 'VALHALLA_LEGEND',
        floor: safeFloor,
        title: 'VALHALLA ASCENDANT',
        desc: 'Reach Style Rank SS or defeat the Sector Boss',
        targetCount: 85,
        scrapReward: 30 + (safeFloor - 6) * 5,
        coinReward: 40 + (safeFloor - 6) * 8
      };
  }
}

export interface HubNpcGreeting {
  npcId: string;
  speaker: string;
  quote: string;
  accentColor: string;
}

export function getHubNpcGreeting(
  npcId: string,
  bestFloor: number = 1,
  heatLevel: number = 0
): HubNpcGreeting {
  const safeBest = Math.max(1, Math.floor(Number(bestFloor) || 1));
  const safeHeat = Math.max(0, Math.floor(Number(heatLevel) || 0));
  switch (npcId) {
    case 'garage':
      return {
        npcId: 'garage',
        speaker: 'CHIEF MECHANIC VEX',
        quote: safeBest >= 4
          ? `Chassis survived Sector ${safeBest}! Bolt on your finest parts, Rider.`
          : 'Tune your V8 and equip high-grade salvage before hitting the highway.',
        accentColor: '#ffd60a'
      };
    case 'blacksmith':
      return {
        npcId: 'blacksmith',
        speaker: 'IRONSMITH KORR',
        quote: '12 Scrap for a fresh black-market part! Step onto the forge.',
        accentColor: '#2ee6ff'
      };
    case 'bounty':
      return {
        npcId: 'bounty',
        speaker: 'VALKYRIE BROKER',
        quote: safeHeat > 0
          ? `HEAT ${safeHeat} ACTIVE! +${safeHeat * 25}% Scrap from all hostiles.`
          : 'Raise the Bounty Heat for massive Scrap payouts, outlaw!',
        accentColor: '#06d6a0'
      };
    case 'codex':
      return {
        npcId: 'codex',
        speaker: 'DOC CULLEN',
        quote: 'Tactical Scanner calibrated: +8% DMG & +15% Bullet Speed locked in.',
        accentColor: '#9d4edd'
      };
    case 'launch':
      return {
        npcId: 'launch',
        speaker: 'HIGHWAY DISPATCH',
        quote: 'Blast doors unlocked. Hit the throttle when ready!',
        accentColor: '#e5203a'
      };
    default:
      return {
        npcId: npcId || 'unknown',
        speaker: 'OUTLAW DRIFTER',
        quote: 'Keep your NOS cool and your barrels hot.',
        accentColor: '#ffd166'
      };
  }
}

// ============================================================================
// BIOME ROOM TACTICAL HAZARD SUMMARY HELPER (M64)
// ============================================================================

export interface RoomHazardSummary {
  explosiveCount: number;
  toxicCount: number;
  cryoCount: number;
  zoneTypes: string[];
  tacticalHint: string;
}

/**
 * Evaluates tactical hazard telemetry for a room, counting active barrel hazard types,
 * collecting unique environmental surface zone modifiers, and generating combat advisory text.
 */
export function getRoomHazardSummary(room?: Room | null): RoomHazardSummary {
  if (!room) {
    return {
      explosiveCount: 0,
      toxicCount: 0,
      cryoCount: 0,
      zoneTypes: [],
      tacticalHint: 'Clear asphalt sector — standard traction.'
    };
  }

  let explosiveCount = 0;
  let toxicCount = 0;
  let cryoCount = 0;

  const obstacles = Array.isArray(room.obstacles) ? room.obstacles : [];
  for (const ob of obstacles) {
    if (!ob) continue;
    const obType = ob.type as string | undefined;
    const obVariant = (ob as any).variant as string | undefined;

    if (obType === 'cryo_barrel' || obVariant === 'cryo_barrel' || obVariant === 'cryo') {
      cryoCount++;
    } else if (obType === 'toxic_barrel' || obVariant === 'toxic_barrel' || obVariant === 'toxic') {
      toxicCount++;
    } else if (obType === 'barrel' || obType === 'explosive_barrel' || obVariant === 'explosive') {
      explosiveCount++;
    }
  }

  const rawZones: any[] = [
    ...(((room as any).zones as any[]) || []),
    ...(((room as any).biomeZones as any[]) || [])
  ];

  const zoneTypes: string[] = [];
  for (const z of rawZones) {
    const typeStr = typeof z === 'string' ? z : (z && typeof z.type === 'string' ? z.type : undefined);
    if (typeStr && typeStr.trim().length > 0 && !zoneTypes.includes(typeStr)) {
      zoneTypes.push(typeStr);
    }
  }

  const hintParts: string[] = [];
  if (cryoCount > 0) {
    hintParts.push(`Cryo barrels detected (${cryoCount}) — beware of sub-zero cryo freeze blasts.`);
  }
  if (toxicCount > 0) {
    hintParts.push(`Toxic barrels detected (${toxicCount}) — steer clear of lingering corrosive pools.`);
  }
  if (explosiveCount > 0) {
    hintParts.push(`Explosive barrels detected (${explosiveCount}) — trigger detonations from long range.`);
  }
  if (zoneTypes.length > 0) {
    const zoneList = zoneTypes.map((z) => z.replace(/_/g, ' ')).join(', ');
    hintParts.push(`Surface modifiers detected (${zoneList}) — maintain stability across zone hazards.`);
  }

  const tacticalHint = hintParts.length > 0
    ? hintParts.join(' ')
    : 'Clear asphalt sector — standard traction.';

  return {
    explosiveCount,
    toxicCount,
    cryoCount,
    zoneTypes,
    tacticalHint
  };
}

// ============================================================================
// DUNGEON FLOOR EXPLORATION & LOOT COMPLETION SUMMARY (M87)
// ============================================================================

export interface FloorExplorationStatus {
  totalRooms: number;
  visitedRooms: number;
  clearedRooms: number;
  remainingPickups: number;
  isFullyCleared: boolean;
  statusLine: string;
}

/**
 * Summarizes the exploration progress and unclaimed loot status of a dungeon floor.
 * Counts visited sectors, cleared sectors, and remaining pickups (excluding Hub NPCs).
 */
export function getFloorExplorationStatus(
  dungeon?: Dungeon | { rooms: Dungeon } | null
): FloorExplorationStatus {
  const roomsMap = (dungeon && (dungeon as any).rooms && typeof (dungeon as any).rooms === 'object')
    ? (dungeon as any).rooms
    : (dungeon || {});
  const rooms = Object.values(roomsMap) as Room[];

  let totalRooms = 0;
  let visitedRooms = 0;
  let clearedRooms = 0;
  let remainingPickups = 0;

  for (const r of rooms) {
    if (!r) continue;
    totalRooms++;
    if (r.visited) visitedRooms++;
    if (r.cleared) clearedRooms++;
    if (Array.isArray(r.pickups)) {
      for (const p of r.pickups) {
        if (p && (p as any).type !== 'hub_npc') {
          remainingPickups++;
        }
      }
    }
  }

  const isFullyCleared = totalRooms > 0 && clearedRooms === totalRooms;

  let statusLine: string;
  if (totalRooms === 0) {
    statusLine = 'NO SECTOR DATA';
  } else if (isFullyCleared && remainingPickups === 0) {
    statusLine = '★ SECTOR 100% SWEPT & LOOTED';
  } else if (isFullyCleared) {
    statusLine = '✓ SECTOR CLEARED · ' + remainingPickups + ' UNCLAIMED SUPPLY DROP(S)';
  } else {
    statusLine = `${clearedRooms}/${totalRooms} SECTORS SECURED · ${remainingPickups} DROP(S) DETECTED`;
  }

  return {
    totalRooms,
    visitedRooms,
    clearedRooms,
    remainingPickups,
    isFullyCleared,
    statusLine
  };
}



