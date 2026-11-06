/**
 * Unit Test Suite for World & Procedural Dungeon Generator
 * Tests:
 * - src/world/dungeon.ts
 */

import { describe, it, expect } from 'vitest';
import {
  generateDungeon,
  populateRoom,
  createEnemy,
  createBoss,
  getFloorScale,
  OBSTACLE_PATTERNS,
  resetEntityId,
  enableChoicePedestalsInTreasureRooms,
  assignBiomeBarrelVariants
} from '../../src/world/dungeon';
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  WALL_THICKNESS,
  type Direction,
  type Room
} from '../../src/types/game';

describe('World Module: Procedural Dungeon Generation (src/world/dungeon.ts)', () => {
  describe('Room count scaling across floors', () => {
    it.each([
      [1, 9],
      [2, 11],
      [3, 13],
      [4, 15],
      [5, 17],
      [6, 17],
      [7, 17],
      [8, 17],
      [9, 17],
      [10, 17]
    ])('generates exactly targetRooms = 7 + min(10, floor * 2) for floor %i (target: %i)', (floor, expectedRooms) => {
      const dungeonGraph = generateDungeon(floor);
      expect(dungeonGraph.targetRooms).toBe(expectedRooms);
      const roomKeys = Object.keys(dungeonGraph.rooms);
      expect(roomKeys.length).toBe(expectedRooms);
    });
  });

  describe('Dungeon topology, door symmetry, and reachability', () => {
    const complementaryDoor: Record<Direction, Direction> = {
      N: 'S',
      S: 'N',
      E: 'W',
      W: 'E'
    };

    const dirOffsets: Record<Direction, { dx: number; dy: number }> = {
      N: { dx: 0, dy: -1 },
      S: { dx: 0, dy: 1 },
      W: { dx: -1, dy: 0 },
      E: { dx: 1, dy: 0 }
    };

    it('always places start room at (0,0) marked cleared and visited', () => {
      const dungeonGraph = generateDungeon(1);
      const startRoom = dungeonGraph.rooms['0,0'];
      expect(startRoom).toBeDefined();
      expect(startRoom.type).toBe('start');
      expect(startRoom.cleared).toBe(true);
      expect(startRoom.visited).toBe(true);
    });

    it('ensures bidirectional door symmetry across all rooms', () => {
      for (let floor = 1; floor <= 5; floor++) {
        const dungeonGraph = generateDungeon(floor);
        const { rooms } = dungeonGraph;

        for (const [key, room] of Object.entries(rooms)) {
          const [rx, ry] = key.split(',').map(Number);
          expect(room.x).toBe(rx);
          expect(room.y).toBe(ry);

          for (const [dirKey, hasDoor] of Object.entries(room.doors) as [Direction, boolean][]) {
            if (hasDoor) {
              const offset = dirOffsets[dirKey];
              const neighborKey = `${rx + offset.dx},${ry + offset.dy}`;
              const neighbor = rooms[neighborKey];
              expect(neighbor).toBeDefined();
              const comp = complementaryDoor[dirKey];
              expect(neighbor.doors[comp]).toBe(true);
            }
          }
        }
      }
    });

    it('guarantees 100% reachability of all rooms from start room (0,0)', () => {
      for (let floor = 1; floor <= 6; floor++) {
        const dungeonGraph = generateDungeon(floor);
        const { rooms } = dungeonGraph;

        // BFS traversal
        const visited = new Set<string>();
        const queue: string[] = ['0,0'];
        visited.add('0,0');

        while (queue.length > 0) {
          const currKey = queue.shift()!;
          const currRoom = rooms[currKey];
          const [cx, cy] = currKey.split(',').map(Number);

          for (const [dirKey, hasDoor] of Object.entries(currRoom.doors) as [Direction, boolean][]) {
            if (hasDoor) {
              const offset = dirOffsets[dirKey];
              const nextKey = `${cx + offset.dx},${cy + offset.dy}`;
              if (!visited.has(nextKey) && rooms[nextKey]) {
                visited.add(nextKey);
                queue.push(nextKey);
              }
            }
          }
        }

        expect(visited.size).toBe(Object.keys(rooms).length);
      }
    });
  });

  describe('Special room assignment & Manhattan distance sorting', () => {
    it('assigns Boss (furthest), Treasure (2nd), and Shop (3rd) by Manhattan distance', () => {
      for (let floor = 1; floor <= 5; floor++) {
        const dungeonGraph = generateDungeon(floor);
        const { rooms } = dungeonGraph;

        const bossRooms = Object.values(rooms).filter(r => r.type === 'boss');
        const treasureRooms = Object.values(rooms).filter(r => r.type === 'treasure');
        const shopRooms = Object.values(rooms).filter(r => r.type === 'shop');

        expect(bossRooms.length).toBe(1);
        expect(treasureRooms.length).toBe(1);
        expect(shopRooms.length).toBe(1);

        const boss = bossRooms[0];
        const treasure = treasureRooms[0];
        const shop = shopRooms[0];

        const bossDist = Math.abs(boss.x) + Math.abs(boss.y);
        const treasureDist = Math.abs(treasure.x) + Math.abs(treasure.y);
        const shopDist = Math.abs(shop.x) + Math.abs(shop.y);

        // Sorting is descending Manhattan distance
        expect(bossDist).toBeGreaterThanOrEqual(treasureDist);
        expect(treasureDist).toBeGreaterThanOrEqual(shopDist);
        expect(shopDist).toBeGreaterThan(0); // non-start room
      }
    });

    it('properly configures Treasure room with cleared=true and central free mod pedestal', () => {
      const dungeonGraph = generateDungeon(2);
      const treasureRoom = Object.values(dungeonGraph.rooms).find(r => r.type === 'treasure')!;
      expect(treasureRoom.cleared).toBe(true);
      expect(treasureRoom.pickups.length).toBe(1);

      const pedestal = treasureRoom.pickups[0];
      expect(pedestal.type).toBe('mod_pedestal');
      expect(pedestal.x).toBe(ARENA_WIDTH / 2);
      expect(pedestal.y).toBe(ARENA_HEIGHT / 2);
      if (pedestal.type === 'mod_pedestal') {
        expect(pedestal.cost).toBe(0);
        expect(pedestal.mod).toBeDefined();
        expect(pedestal.mod.id).toBeDefined();
      }
    });

    it('populates Shop room with 3 distinct items and scaled costs', () => {
      const dungeonGraph = generateDungeon(3);
      const shopRoom = Object.values(dungeonGraph.rooms).find(r => r.type === 'shop')!;
      expect(shopRoom.cleared).toBe(true);
      expect(shopRoom.pickups.length).toBe(3);

      // Left item: Hull Repair
      const left = shopRoom.pickups.find(p => p.x === ARENA_WIDTH / 2 - 140);
      expect(left).toBeDefined();
      expect(left?.type).toBe('shop_heart');
      if (left?.type === 'shop_heart') {
        expect(left.cost).toBe(8 + 3 * 2); // 14 coins on floor 3
      }

      // Center item: Stat Mod
      const center = shopRoom.pickups.find(p => p.x === ARENA_WIDTH / 2);
      expect(center).toBeDefined();
      expect(center?.type).toBe('mod_pedestal');
      if (center?.type === 'mod_pedestal') {
        expect(center.cost).toBe(center.mod.cost + (3 - 1) * 4);
      }

      // Right item: Weapon Rental or 2nd Mod
      const right = shopRoom.pickups.find(p => p.x === ARENA_WIDTH / 2 + 140);
      expect(right).toBeDefined();
      expect(['run_weapon', 'mod_pedestal']).toContain(right?.type);
    });
  });

  describe('Obstacle layout generation and properties', () => {
    it('defines 5 standard obstacle patterns within arena bounds', () => {
      expect(OBSTACLE_PATTERNS.length).toBe(5);
      for (const pat of OBSTACLE_PATTERNS) {
        for (const pt of pat) {
          expect(pt.x).toBeGreaterThan(WALL_THICKNESS);
          expect(pt.x).toBeLessThan(ARENA_WIDTH - WALL_THICKNESS);
          expect(pt.y).toBeGreaterThan(WALL_THICKNESS);
          expect(pt.y).toBeLessThan(ARENA_HEIGHT - WALL_THICKNESS);
        }
      }
    });

    it('always uses 4-corner pattern for Boss rooms', () => {
      for (let floor = 1; floor <= 4; floor++) {
        const dungeonGraph = generateDungeon(floor);
        const bossRoom = Object.values(dungeonGraph.rooms).find(r => r.type === 'boss')!;
        expect(bossRoom.obstacles.length).toBe(4);
        expect(bossRoom.obstacles.map(o => ({ x: o.x, y: o.y }))).toEqual([
          { x: 200, y: 200 },
          { x: ARENA_WIDTH - 200, y: 200 },
          { x: 200, y: ARENA_HEIGHT - 200 },
          { x: ARENA_WIDTH - 200, y: ARENA_HEIGHT - 200 }
        ]);
      }
    });

    it('assigns correct HP and type to obstacles (30% barrel, 70% rock)', () => {
      const room: Room = {
        x: 0,
        y: 1,
        type: 'combat',
        cleared: false,
        visited: false,
        doors: { N: true, S: false, E: false, W: false },
        obstacles: [],
        enemies: [],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      // Force barrel roll (random < 0.3)
      populateRoom(room, 2, () => 0.1);
      const barrel = room.obstacles[0];
      expect(barrel.type).toBe('barrel');
      expect(barrel.hp).toBe(18 + 2 * 6); // 30 HP
      expect(barrel.size).toBe(42);

      // Force rock roll (random >= 0.3)
      const room2: Room = { ...room, obstacles: [] };
      populateRoom(room2, 2, () => 0.5);
      const rock = room2.obstacles[0];
      expect(rock.type).toBe('rock');
      expect(rock.hp).toBe(99999);
      expect(rock.size).toBe(42);
    });
  });

  describe('Enemy population logic and floor scaling', () => {
    it('scales floor formula exponentially', () => {
      // 1.55^(floor - 1)
      expect(getFloorScale(1)).toBe(1.0);
      const scaleF2 = Math.pow(1.55, 1);
      expect(getFloorScale(2)).toBeCloseTo(scaleF2, 4);
      const scaleF3 = Math.pow(1.55, 2);
      expect(getFloorScale(3)).toBeCloseTo(scaleF3, 4);
    });

    it('enforces maximum 1 power-up item per 2 rooms in a floor', () => {
      const dungeonGraph = generateDungeon(2);
      const rooms = Object.values(dungeonGraph.rooms);
      const expectedMax = Math.floor(rooms.length / 2);
      for (const r of rooms) {
        expect(r.powerUpDropQuota).toBeDefined();
        expect(r.powerUpDropQuota!.max).toBe(expectedMax);
      }
      // All rooms on the floor share the same quota reference
      expect(rooms[0].powerUpDropQuota).toBe(rooms[1].powerUpDropQuota);
    });

    it('populates Floor 1 combat rooms with only Tier 1 enemies (swarmer, turret, charger)', () => {
      const dungeonGraph = generateDungeon(1);
      const combatRooms = Object.values(dungeonGraph.rooms).filter(r => r.type === 'combat');
      const tier1Set = new Set(['swarmer', 'turret', 'charger']);

      for (const room of combatRooms) {
        expect(room.enemies.length).toBeGreaterThan(0);
        for (const en of room.enemies) {
          expect(tier1Set.has(en.type)).toBe(true);
          expect(en.isElite).toBe(false); // eliteChance is 0 on floor 1
        }
      }
    });

    it('unlocks Tier 2 enemies (trishot, bomber, brute) on Floor 2', () => {
      let foundTier2 = false;
      const tier2Set = new Set(['trishot', 'bomber', 'brute']);

      for (let run = 0; run < 10; run++) {
        const dungeonGraph = generateDungeon(2);
        const combatRooms = Object.values(dungeonGraph.rooms).filter(r => r.type === 'combat');
        for (const room of combatRooms) {
          for (const en of room.enemies) {
            if (tier2Set.has(en.type)) {
              foundTier2 = true;
              break;
            }
          }
        }
        if (foundTier2) break;
      }
      expect(foundTier2).toBe(true);
    });

    it('spawns boss with correct rotating variant and minions', () => {
      resetEntityId(1);
      const bossF1 = createBoss(1, 360, 270);
      expect(bossF1.name).toBe('SCRAP GOLIATH');
      expect(bossF1.bossVariant).toBe(0);
      expect(bossF1.color).toBe('#e63946');

      const bossF2 = createBoss(2, 360, 270);
      expect(bossF2.name).toBe('SIEGE BEHEMOTH');
      expect(bossF2.bossVariant).toBe(1);
      expect(bossF2.color).toBe('#f77f00');

      const bossF3 = createBoss(3, 360, 270);
      expect(bossF3.name).toBe('OVERLORD HELION');
      expect(bossF3.bossVariant).toBe(2);
      expect(bossF3.color).toBe('#9d4edd');

      const bossF4 = createBoss(4, 360, 270);
      expect(bossF4.name).toBe('CRYO VALKYRIE');
      expect(bossF4.bossVariant).toBe(3);
    });

    it('scales enemy stats and applies elite multipliers', () => {
      const normalSwarmer = createEnemy('swarmer', 200, 200, 1, false);
      const eliteSwarmer = createEnemy('swarmer', 200, 200, 1, true);

      expect(eliteSwarmer.hp).toBe(Math.round(normalSwarmer.hp * 1.65));
      expect(eliteSwarmer.speed).toBeCloseTo(normalSwarmer.speed * 1.15, 2);
    });

    it('enforces simultaneous sniper/turret cap (<= 3) per regular combat room and rerolls excess', () => {
      // Floor 1: pool has ['swarmer', 'turret', 'charger'], index 1 is 'turret' (rng ~ 0.45)
      const roomF1: Room = {
        x: 1,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: false,
        doors: { N: false, S: false, E: false, W: true },
        obstacles: [],
        enemies: [],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };
      populateRoom(roomF1, 1, () => 0.45);
      const f1SnipersAndTurrets = roomF1.enemies.filter(e => e.type === 'sniper' || e.type === 'turret');
      expect(roomF1.enemies.length).toBeGreaterThan(3);
      expect(f1SnipersAndTurrets.length).toBeLessThanOrEqual(3);

      // Floor 4: pool has 9 types (index 1 is 'turret', index 7 is 'sniper' -> rng = 0.82 selects 'sniper')
      const roomF4: Room = {
        ...roomF1,
        obstacles: [],
        enemies: []
      };
      populateRoom(roomF4, 4, () => 0.82);
      const f4SnipersAndTurrets = roomF4.enemies.filter(e => e.type === 'sniper' || e.type === 'turret');
      expect(roomF4.enemies.length).toBeGreaterThan(5);
      expect(f4SnipersAndTurrets.length).toBeLessThanOrEqual(3);
      const rerolled = roomF4.enemies.filter(e => e.type !== 'sniper' && e.type !== 'turret');
      expect(rerolled.length).toBeGreaterThan(0);
      for (const en of rerolled) {
        expect(['swarmer', 'charger', 'trishot']).toContain(en.type);
      }
    });

    it('enables Choice-of-2 free mod pedestals in treasure rooms and despawns sibling when claimed', () => {
      const dungeonGraph = generateDungeon(2);
      enableChoicePedestalsInTreasureRooms(dungeonGraph.rooms);

      const treasureRoom = Object.values(dungeonGraph.rooms).find(r => r.type === 'treasure')!;
      expect(treasureRoom.pickups.length).toBe(2);

      const [pedestal1, pedestal2] = treasureRoom.pickups;
      expect(pedestal1.type).toBe('mod_pedestal');
      expect(pedestal2.type).toBe('mod_pedestal');
      expect(pedestal1.x).toBe(ARENA_WIDTH / 2 - 72);
      expect(pedestal1.y).toBe(ARENA_HEIGHT / 2);
      expect(pedestal2.x).toBe(ARENA_WIDTH / 2 + 72);
      expect(pedestal2.y).toBe(ARENA_HEIGHT / 2);
      expect((pedestal1 as any).choiceGroup).toBe('treasure_choice');
      expect((pedestal2 as any).choiceGroup).toBe('treasure_choice');

      if (pedestal1.type === 'mod_pedestal' && pedestal2.type === 'mod_pedestal') {
        expect(pedestal1.cost).toBe(0);
        expect(pedestal2.cost).toBe(0);
        expect(pedestal2.mod.id).not.toBe(pedestal1.mod.id);

        // Claiming pedestal1 automatically despawns sibling pedestal2
        const dummyPlayer: any = {
          dmgMult: 1,
          fireRateMult: 1,
          speedMult: 1,
          projSpeedMult: 1,
          blastMult: 1,
          pierce: 0,
          bounce: 0,
          multiShot: 1,
          vampChance: 0,
          hp: 6,
          maxHp: 6,
          nos: 100,
          nosMax: 100,
          items: [],
          itemStacks: {}
        };
        pedestal1.mod.apply(dummyPlayer);
        expect(treasureRoom.pickups).not.toContain(pedestal2);
      }
    });
  });

  describe('Biome Barrel Variants: assignBiomeBarrelVariants (floor 4 Cryo vs other floors)', () => {
    it('tags every even-indexed barrel as cryo_barrel and odd-indexed barrel as explosive on floor 4', () => {
      const dungeonGraph = generateDungeon(4);
      const testRoom = Object.values(dungeonGraph.rooms).find(r => r.type === 'combat')!;
      testRoom.obstacles = [
        { x: 100, y: 100, size: 42, type: 'barrel', hp: 30 },
        { x: 200, y: 200, size: 42, type: 'rock', hp: 99999 },
        { x: 300, y: 300, size: 42, type: 'barrel', hp: 30 },
        { x: 400, y: 400, size: 42, type: 'barrel', hp: 30 }
      ];

      assignBiomeBarrelVariants(dungeonGraph, 4);

      expect(testRoom.obstacles[0].variant).toBe('cryo_barrel'); // barrel index 0 (even)
      expect(testRoom.obstacles[1].variant).toBeUndefined();     // rock remains undefined
      expect(testRoom.obstacles[2].variant).toBe('explosive');   // barrel index 1 (odd)
      expect(testRoom.obstacles[3].variant).toBe('cryo_barrel'); // barrel index 2 (even)
    });

    it('tags all barrels as explosive on floors other than 4', () => {
      const dungeonGraph = generateDungeon(2);
      const testRoom = Object.values(dungeonGraph.rooms).find(r => r.type === 'combat')!;
      testRoom.obstacles = [
        { x: 100, y: 100, size: 42, type: 'barrel', hp: 30 },
        { x: 300, y: 300, size: 42, type: 'barrel', hp: 30 }
      ];

      assignBiomeBarrelVariants(dungeonGraph, 2);

      expect(testRoom.obstacles[0].variant).toBe('explosive');
      expect(testRoom.obstacles[1].variant).toBe('explosive');
    });

    it('handles raw Dungeon record map as well as DungeonGraph', () => {
      const dungeonGraph = generateDungeon(4);
      const testRoom = dungeonGraph.rooms['0,0'];
      testRoom.obstacles = [
        { x: 100, y: 100, size: 42, type: 'barrel', hp: 30 }
      ];

      assignBiomeBarrelVariants(dungeonGraph.rooms, 4);
      expect(testRoom.obstacles[0].variant).toBe('cryo_barrel');
    });
  });
});
