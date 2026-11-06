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
  resetEntityId
} from '@/world/dungeon';
import {
  ARENA_WIDTH,
  ARENA_HEIGHT,
  WALL_THICKNESS,
  type Direction,
  type Room
} from '@/types/game';

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
    it('scales floor formula accurately matching prototype', () => {
      // 1 + (floor - 1) * 0.45 + (floor - 1)^1.35 * 0.22
      expect(getFloorScale(1)).toBe(1.0);
      const scaleF2 = 1 + 0.45 + Math.pow(1, 1.35) * 0.22;
      expect(getFloorScale(2)).toBeCloseTo(scaleF2, 4);
      const scaleF3 = 1 + 2 * 0.45 + Math.pow(2, 1.35) * 0.22;
      expect(getFloorScale(3)).toBeCloseTo(scaleF3, 4);
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
      expect(bossF4.name).toBe('SCRAP GOLIATH');
      expect(bossF4.bossVariant).toBe(0);
    });

    it('scales enemy stats and applies elite multipliers', () => {
      const normalSwarmer = createEnemy('swarmer', 200, 200, 1, false);
      const eliteSwarmer = createEnemy('swarmer', 200, 200, 1, true);

      expect(eliteSwarmer.hp).toBe(Math.round(normalSwarmer.hp * 1.65));
      expect(eliteSwarmer.speed).toBeCloseTo(normalSwarmer.speed * 1.15, 2);
    });
  });
});
