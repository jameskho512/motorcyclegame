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
  assignBiomeBarrelVariants,
  getFloorBountyContract,
  type FloorBountyContract,
  getHubNpcGreeting,
  type HubNpcGreeting,
  getRoomHazardSummary,
  type RoomHazardSummary,
  getFloorExplorationStatus,
  type FloorExplorationStatus,
  getDungeonSectorSummary,
  type DungeonSectorSummary,
  createHomeBaseRoom
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

  describe('Floor Bounty Contracts: getFloorBountyContract', () => {
    it('returns specific bounty contracts for floors 1 to 5', () => {
      const f1 = getFloorBountyContract(1);
      expect(f1).toEqual({
        id: 'GRAZE_INITIATE',
        floor: 1,
        title: 'NEON DAREDEVIL',
        desc: 'Graze 3 enemy projectiles or clear Floor 1 Boss',
        targetCount: 3,
        scrapReward: 8,
        coinReward: 10
      });

      const f2 = getFloorBountyContract(2);
      expect(f2).toEqual({
        id: 'DRIFT_DEMON',
        floor: 2,
        title: 'ASPHALT DRIFTER',
        desc: 'Trigger 2 Handbrake Drift Boosts or clear Floor 2 Boss',
        targetCount: 2,
        scrapReward: 10,
        coinReward: 14
      });

      const f3 = getFloorBountyContract(3);
      expect(f3).toEqual({
        id: 'STYLE_HUNTER',
        floor: 3,
        title: 'HIGH-OCTANE STYLER',
        desc: 'Reach Style Rank A in combat or clear Floor 3 Boss',
        targetCount: 55,
        scrapReward: 14,
        coinReward: 18
      });

      const f4 = getFloorBountyContract(4);
      expect(f4).toEqual({
        id: 'CRYO_SHATTER',
        floor: 4,
        title: 'CRYO BREAKER',
        desc: 'Detonate 2 Cryo/Explosive Barrels or clear Floor 4 Boss',
        targetCount: 2,
        scrapReward: 18,
        coinReward: 22
      });

      const f5 = getFloorBountyContract(5);
      expect(f5).toEqual({
        id: 'OVERDRIVE_SLAYER',
        floor: 5,
        title: 'FORGE EXECUTIONER',
        desc: 'Achieve a 5x Rampage Killstreak or clear Floor 5 Boss',
        targetCount: 5,
        scrapReward: 22,
        coinReward: 28
      });
    });

    it('returns dynamically scaled VALHALLA_LEGEND contracts for floor 6 and above', () => {
      const f6 = getFloorBountyContract(6);
      expect(f6).toEqual({
        id: 'VALHALLA_LEGEND',
        floor: 6,
        title: 'VALHALLA ASCENDANT',
        desc: 'Reach Style Rank SS or defeat the Sector Boss',
        targetCount: 85,
        scrapReward: 30,
        coinReward: 40
      });

      const f7 = getFloorBountyContract(7);
      expect(f7).toEqual({
        id: 'VALHALLA_LEGEND',
        floor: 7,
        title: 'VALHALLA ASCENDANT',
        desc: 'Reach Style Rank SS or defeat the Sector Boss',
        targetCount: 85,
        scrapReward: 35,
        coinReward: 48
      });

      const f8 = getFloorBountyContract(8);
      expect(f8).toEqual({
        id: 'VALHALLA_LEGEND',
        floor: 8,
        title: 'VALHALLA ASCENDANT',
        desc: 'Reach Style Rank SS or defeat the Sector Boss',
        targetCount: 85,
        scrapReward: 40,
        coinReward: 56
      });
    });

    it('safely handles non-positive, zero, NaN, or undefined floor inputs by falling back to floor 1', () => {
      expect(getFloorBountyContract(0).floor).toBe(1);
      expect(getFloorBountyContract(0).id).toBe('GRAZE_INITIATE');

      expect(getFloorBountyContract(-5).floor).toBe(1);
      expect(getFloorBountyContract(-5).id).toBe('GRAZE_INITIATE');

      expect(getFloorBountyContract(NaN).floor).toBe(1);
      expect(getFloorBountyContract(NaN).id).toBe('GRAZE_INITIATE');

      expect(getFloorBountyContract(undefined).floor).toBe(1);
      expect(getFloorBountyContract(undefined).id).toBe('GRAZE_INITIATE');
    });

    it('strictly increases scrapReward and coinReward as floor increases from 1 to 8', () => {
      const contracts: FloorBountyContract[] = [];
      for (let floor = 1; floor <= 8; floor++) {
        contracts.push(getFloorBountyContract(floor));
      }

      for (let i = 1; i < contracts.length; i++) {
        expect(contracts[i].scrapReward).toBeGreaterThan(contracts[i - 1].scrapReward);
        expect(contracts[i].coinReward).toBeGreaterThan(contracts[i - 1].coinReward);
      }
    });
  });

  describe('Sanctuary Hub NPC Lore & Dialogue Greetings (getHubNpcGreeting)', () => {
    it('returns standard quote for garage when bestFloor < 4', () => {
      const g1: HubNpcGreeting = getHubNpcGreeting('garage', 1, 0);
      expect(g1).toEqual({
        npcId: 'garage',
        speaker: 'CHIEF MECHANIC VEX',
        quote: 'Tune your V8 and equip high-grade salvage before hitting the highway.',
        accentColor: '#ffd60a'
      });

      const g3 = getHubNpcGreeting('garage', 3);
      expect(g3.quote).toBe('Tune your V8 and equip high-grade salvage before hitting the highway.');
    });

    it('returns veteran quote for garage when bestFloor >= 4', () => {
      const g4 = getHubNpcGreeting('garage', 4);
      expect(g4).toEqual({
        npcId: 'garage',
        speaker: 'CHIEF MECHANIC VEX',
        quote: 'Chassis survived Sector 4! Bolt on your finest parts, Rider.',
        accentColor: '#ffd60a'
      });

      const g5 = getHubNpcGreeting('garage', 5);
      expect(g5.quote).toBe('Chassis survived Sector 5! Bolt on your finest parts, Rider.');
    });

    it('returns ironsmith greeting for blacksmith', () => {
      const b = getHubNpcGreeting('blacksmith');
      expect(b).toEqual({
        npcId: 'blacksmith',
        speaker: 'IRONSMITH KORR',
        quote: '12 Scrap for a fresh black-market part! Step onto the forge.',
        accentColor: '#2ee6ff'
      });
    });

    it('returns bounty broker greeting reflecting heat level (0 vs > 0)', () => {
      const b0 = getHubNpcGreeting('bounty', 1, 0);
      expect(b0).toEqual({
        npcId: 'bounty',
        speaker: 'VALKYRIE BROKER',
        quote: 'Raise the Bounty Heat for massive Scrap payouts, outlaw!',
        accentColor: '#06d6a0'
      });

      const b1 = getHubNpcGreeting('bounty', 1, 1);
      expect(b1).toEqual({
        npcId: 'bounty',
        speaker: 'VALKYRIE BROKER',
        quote: 'HEAT 1 ACTIVE! +25% Scrap from all hostiles.',
        accentColor: '#06d6a0'
      });

      const b3 = getHubNpcGreeting('bounty', 1, 3);
      expect(b3).toEqual({
        npcId: 'bounty',
        speaker: 'VALKYRIE BROKER',
        quote: 'HEAT 3 ACTIVE! +75% Scrap from all hostiles.',
        accentColor: '#06d6a0'
      });
    });

    it('returns doc cullen greeting for codex', () => {
      const c = getHubNpcGreeting('codex');
      expect(c).toEqual({
        npcId: 'codex',
        speaker: 'DOC CULLEN',
        quote: 'Tactical Scanner calibrated: +8% DMG & +15% Bullet Speed locked in.',
        accentColor: '#9d4edd'
      });
    });

    it('returns highway dispatch greeting for launch', () => {
      const l = getHubNpcGreeting('launch');
      expect(l).toEqual({
        npcId: 'launch',
        speaker: 'HIGHWAY DISPATCH',
        quote: 'Blast doors unlocked. Hit the throttle when ready!',
        accentColor: '#e5203a'
      });
    });

    it('returns outlaw drifter fallback greeting for unknown or empty npcId', () => {
      const unk = getHubNpcGreeting('rumor_monger');
      expect(unk).toEqual({
        npcId: 'rumor_monger',
        speaker: 'OUTLAW DRIFTER',
        quote: 'Keep your NOS cool and your barrels hot.',
        accentColor: '#ffd166'
      });

      const empty = getHubNpcGreeting('');
      expect(empty.npcId).toBe('unknown');
      expect(empty.speaker).toBe('OUTLAW DRIFTER');
    });

    it('safely sanitizes non-positive, NaN, or non-numeric bestFloor and heatLevel', () => {
      const gNaN = getHubNpcGreeting('garage', NaN, NaN);
      expect(gNaN.quote).toBe('Tune your V8 and equip high-grade salvage before hitting the highway.');

      const bNeg = getHubNpcGreeting('bounty', -5, -2);
      expect(bNeg.quote).toBe('Raise the Bounty Heat for massive Scrap payouts, outlaw!');
    });
  });

  describe('getRoomHazardSummary (M64: Biome Room Tactical Hazard Summary Helper)', () => {
    it('returns default values and standard traction hint for empty room or room without hazards', () => {
      const emptyRoom: Room = {
        x: 0,
        y: 0,
        type: 'start',
        cleared: true,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [],
        enemies: [],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      const summary: RoomHazardSummary = getRoomHazardSummary(emptyRoom);
      expect(summary.explosiveCount).toBe(0);
      expect(summary.toxicCount).toBe(0);
      expect(summary.cryoCount).toBe(0);
      expect(summary.zoneTypes).toEqual([]);
      expect(summary.tacticalHint).toBe('Clear asphalt sector — standard traction.');
    });

    it('returns default summary safely for null or undefined room', () => {
      const nullSummary = getRoomHazardSummary(null);
      expect(nullSummary.explosiveCount).toBe(0);
      expect(nullSummary.tacticalHint).toBe('Clear asphalt sector — standard traction.');

      const undefSummary = getRoomHazardSummary(undefined);
      expect(undefSummary.explosiveCount).toBe(0);
      expect(undefSummary.tacticalHint).toBe('Clear asphalt sector — standard traction.');
    });

    it('ignores rock obstacles and counts only barrel hazards', () => {
      const rockRoom: Room = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [
          { x: 100, y: 100, size: 42, type: 'rock', hp: 99999 },
          { x: 200, y: 200, size: 42, type: 'rock', hp: 99999 }
        ],
        enemies: [],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      const summary = getRoomHazardSummary(rockRoom);
      expect(summary.explosiveCount).toBe(0);
      expect(summary.toxicCount).toBe(0);
      expect(summary.cryoCount).toBe(0);
      expect(summary.tacticalHint).toBe('Clear asphalt sector — standard traction.');
    });

    it('correctly counts explosive barrels and generates explosive barrel advisory', () => {
      const room: Room = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [
          { x: 100, y: 100, size: 42, type: 'barrel', variant: 'explosive', hp: 30 },
          { x: 200, y: 200, size: 42, type: 'barrel', hp: 30 }
        ],
        enemies: [],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      const summary = getRoomHazardSummary(room);
      expect(summary.explosiveCount).toBe(2);
      expect(summary.toxicCount).toBe(0);
      expect(summary.cryoCount).toBe(0);
      expect(summary.tacticalHint).toContain('Explosive barrels detected (2)');
    });

    it('correctly counts toxic barrels and generates corrosive pools advisory', () => {
      const room: any = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [
          { x: 100, y: 100, size: 42, type: 'toxic_barrel', hp: 25 },
          { x: 200, y: 200, size: 42, type: 'barrel', variant: 'toxic_barrel', hp: 25 },
          { x: 300, y: 300, size: 42, type: 'barrel', variant: 'toxic', hp: 25 }
        ],
        enemies: [],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      const summary = getRoomHazardSummary(room);
      expect(summary.toxicCount).toBe(3);
      expect(summary.explosiveCount).toBe(0);
      expect(summary.cryoCount).toBe(0);
      expect(summary.tacticalHint).toContain('corrosive pools');
      expect(summary.tacticalHint).toContain('Toxic barrels detected (3)');
    });

    it('correctly counts cryo barrels and generates cryo freeze blast advisory', () => {
      const room: Room = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [
          { x: 100, y: 100, size: 42, type: 'barrel', variant: 'cryo_barrel', hp: 25 },
          { x: 200, y: 200, size: 42, type: 'cryo_barrel' as any, hp: 25 }
        ],
        enemies: [],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      const summary = getRoomHazardSummary(room);
      expect(summary.cryoCount).toBe(2);
      expect(summary.explosiveCount).toBe(0);
      expect(summary.toxicCount).toBe(0);
      expect(summary.tacticalHint).toContain('cryo freeze blasts');
      expect(summary.tacticalHint).toContain('Cryo barrels detected (2)');
    });

    it('collects unique zone types from room.zones or room.biomeZones and mentions surface modifiers', () => {
      const roomWithZones: any = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [],
        zones: [
          { type: 'oil_slick' },
          { type: 'boost_strip' },
          { type: 'oil_slick' }
        ],
        biomeZones: [
          { type: 'ice_patch' },
          { type: 'boost_strip' }
        ],
        enemies: [],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      const summary = getRoomHazardSummary(roomWithZones);
      expect(summary.zoneTypes).toEqual(['oil_slick', 'boost_strip', 'ice_patch']);
      expect(summary.tacticalHint).toContain('Surface modifiers detected');
      expect(summary.tacticalHint).toContain('oil slick');
      expect(summary.tacticalHint).toContain('boost strip');
      expect(summary.tacticalHint).toContain('ice patch');
    });

    it('combines multiple barrel hazards and surface modifiers into a comprehensive advisory', () => {
      const comboRoom: any = {
        x: 0,
        y: 0,
        type: 'combat',
        cleared: false,
        visited: true,
        doors: { N: false, S: false, E: false, W: false },
        obstacles: [
          { x: 100, y: 100, size: 42, type: 'barrel', variant: 'cryo_barrel', hp: 25 },
          { x: 200, y: 200, size: 42, type: 'toxic_barrel', hp: 25 },
          { x: 300, y: 300, size: 42, type: 'barrel', variant: 'explosive', hp: 25 },
          { x: 400, y: 400, size: 42, type: 'rock', hp: 99999 }
        ],
        zones: [{ type: 'oil_slick' }],
        enemies: [],
        pickups: [],
        hazards: [],
        skids: [],
        trapdoor: false
      };

      const summary = getRoomHazardSummary(comboRoom);
      expect(summary.cryoCount).toBe(1);
      expect(summary.toxicCount).toBe(1);
      expect(summary.explosiveCount).toBe(1);
      expect(summary.zoneTypes).toEqual(['oil_slick']);
      expect(summary.tacticalHint).toContain('cryo freeze blasts');
      expect(summary.tacticalHint).toContain('corrosive pools');
      expect(summary.tacticalHint).toContain('Explosive barrels detected');
      expect(summary.tacticalHint).toContain('Surface modifiers detected');
    });

    it('works on real procedurally generated rooms from generateDungeon', () => {
      const dungeon = generateDungeon(4);
      let checkedAny = false;
      for (const room of Object.values(dungeon.rooms)) {
        const summary = getRoomHazardSummary(room);
        expect(typeof summary.explosiveCount).toBe('number');
        expect(typeof summary.toxicCount).toBe('number');
        expect(typeof summary.cryoCount).toBe('number');
        expect(Array.isArray(summary.zoneTypes)).toBe(true);
        expect(typeof summary.tacticalHint).toBe('string');
        if (summary.cryoCount > 0) {
          expect(summary.tacticalHint).toContain('cryo freeze blasts');
          checkedAny = true;
        }
      }
      expect(checkedAny).toBe(true);
    });
  });

  describe('getFloorExplorationStatus (M87: Dungeon Floor Exploration & Loot Completion Summary)', () => {
    it('handles null, undefined, and empty dungeon records safely with NO SECTOR DATA', () => {
      const nullStatus: FloorExplorationStatus = getFloorExplorationStatus(null);
      expect(nullStatus).toEqual({
        totalRooms: 0,
        visitedRooms: 0,
        clearedRooms: 0,
        remainingPickups: 0,
        isFullyCleared: false,
        statusLine: 'NO SECTOR DATA'
      });

      const undefStatus = getFloorExplorationStatus(undefined);
      expect(undefStatus).toEqual({
        totalRooms: 0,
        visitedRooms: 0,
        clearedRooms: 0,
        remainingPickups: 0,
        isFullyCleared: false,
        statusLine: 'NO SECTOR DATA'
      });

      const emptyStatus = getFloorExplorationStatus({});
      expect(emptyStatus).toEqual({
        totalRooms: 0,
        visitedRooms: 0,
        clearedRooms: 0,
        remainingPickups: 0,
        isFullyCleared: false,
        statusLine: 'NO SECTOR DATA'
      });
    });

    it('accurately tracks partially explored dungeons with uncleared rooms and pending drops', () => {
      const partialDungeon: Record<string, Room> = {
        '0,0': {
          x: 0,
          y: 0,
          type: 'start',
          cleared: true,
          visited: true,
          doors: { N: true, S: false, E: false, W: false },
          obstacles: [],
          enemies: [],
          pickups: [{ x: 100, y: 100, type: 'scrap', cost: 0, radius: 10 } as any],
          hazards: [],
          skids: [],
          trapdoor: false
        },
        '0,-1': {
          x: 0,
          y: -1,
          type: 'combat',
          cleared: false,
          visited: true,
          doors: { N: false, S: true, E: true, W: false },
          obstacles: [],
          enemies: [],
          pickups: [
            { x: 120, y: 120, type: 'scrap', cost: 0, radius: 10 } as any,
            { x: 200, y: 200, type: 'heart', cost: 0, radius: 12 } as any
          ],
          hazards: [],
          skids: [],
          trapdoor: false
        },
        '1,-1': {
          x: 1,
          y: -1,
          type: 'boss',
          cleared: false,
          visited: false,
          doors: { N: false, S: false, E: false, W: true },
          obstacles: [],
          enemies: [],
          pickups: [],
          hazards: [],
          skids: [],
          trapdoor: false
        }
      };

      const status: FloorExplorationStatus = getFloorExplorationStatus(partialDungeon);
      expect(status.totalRooms).toBe(3);
      expect(status.visitedRooms).toBe(2);
      expect(status.clearedRooms).toBe(1);
      expect(status.remainingPickups).toBe(3);
      expect(status.isFullyCleared).toBe(false);
      expect(status.statusLine).toBe('1/3 SECTORS SECURED · 3 DROP(S) DETECTED');
    });

    it('formats status line for fully cleared sector with remaining supply pickups', () => {
      const clearedDungeonWithPickups: Record<string, Room> = {
        '0,0': {
          x: 0,
          y: 0,
          type: 'start',
          cleared: true,
          visited: true,
          doors: { N: true, S: false, E: false, W: false },
          obstacles: [],
          enemies: [],
          pickups: [{ x: 50, y: 50, type: 'heart', cost: 0, radius: 12 } as any],
          hazards: [],
          skids: [],
          trapdoor: false
        },
        '0,-1': {
          x: 0,
          y: -1,
          type: 'combat',
          cleared: true,
          visited: true,
          doors: { N: false, S: true, E: false, W: false },
          obstacles: [],
          enemies: [],
          pickups: [{ x: 60, y: 60, type: 'mod_pedestal', cost: 0, radius: 22 } as any],
          hazards: [],
          skids: [],
          trapdoor: false
        }
      };

      const status: FloorExplorationStatus = getFloorExplorationStatus(clearedDungeonWithPickups);
      expect(status.totalRooms).toBe(2);
      expect(status.visitedRooms).toBe(2);
      expect(status.clearedRooms).toBe(2);
      expect(status.remainingPickups).toBe(2);
      expect(status.isFullyCleared).toBe(true);
      expect(status.statusLine).toBe('✓ SECTOR CLEARED · 2 UNCLAIMED SUPPLY DROP(S)');
    });

    it('formats status line for 100% swept and looted sector when all rooms cleared and no pickups left', () => {
      const sweptDungeon: Record<string, Room> = {
        '0,0': {
          x: 0,
          y: 0,
          type: 'start',
          cleared: true,
          visited: true,
          doors: { N: true, S: false, E: false, W: false },
          obstacles: [],
          enemies: [],
          pickups: [],
          hazards: [],
          skids: [],
          trapdoor: false
        },
        '0,-1': {
          x: 0,
          y: -1,
          type: 'combat',
          cleared: true,
          visited: true,
          doors: { N: false, S: true, E: false, W: false },
          obstacles: [],
          enemies: [],
          pickups: [],
          hazards: [],
          skids: [],
          trapdoor: false
        }
      };

      const status: FloorExplorationStatus = getFloorExplorationStatus(sweptDungeon);
      expect(status.totalRooms).toBe(2);
      expect(status.visitedRooms).toBe(2);
      expect(status.clearedRooms).toBe(2);
      expect(status.remainingPickups).toBe(0);
      expect(status.isFullyCleared).toBe(true);
      expect(status.statusLine).toBe('★ SECTOR 100% SWEPT & LOOTED');
    });

    it('ignores hub_npc pickups in Home Base Hub rooms while properly counting true supply drops', () => {
      const hubRoom = createHomeBaseRoom();
      expect(hubRoom.pickups.length).toBeGreaterThanOrEqual(5);
      expect(hubRoom.pickups.every(p => (p as any).type === 'hub_npc')).toBe(true);

      const hubDungeon: Record<string, Room> = { '0,0': hubRoom };
      const status: FloorExplorationStatus = getFloorExplorationStatus(hubDungeon);
      expect(status.totalRooms).toBe(1);
      expect(status.visitedRooms).toBe(1);
      expect(status.clearedRooms).toBe(1);
      expect(status.remainingPickups).toBe(0);
      expect(status.isFullyCleared).toBe(true);
      expect(status.statusLine).toBe('★ SECTOR 100% SWEPT & LOOTED');

      // Add a supply drop into the hub room
      hubRoom.pickups.push({
        x: 360,
        y: 400,
        type: 'shop_heart' as any,
        name: 'Emergency Stim',
        cost: 10,
        radius: 20
      });
      const updatedStatus = getFloorExplorationStatus(hubDungeon);
      expect(updatedStatus.remainingPickups).toBe(1);
      expect(updatedStatus.statusLine).toBe('✓ SECTOR CLEARED · 1 UNCLAIMED SUPPLY DROP(S)');
    });

    it('correctly inspects full procedural dungeons via DungeonGraph or Dungeon records', () => {
      const graph = generateDungeon(1);
      const statusFromGraph = getFloorExplorationStatus(graph);
      const statusFromRooms = getFloorExplorationStatus(graph.rooms);

      expect(statusFromGraph).toEqual(statusFromRooms);
      expect(statusFromGraph.totalRooms).toBe(graph.targetRooms);
      expect(statusFromGraph.visitedRooms).toBe(1); // start room only
      expect(statusFromGraph.clearedRooms).toBeGreaterThanOrEqual(3); // start, treasure, shop
      expect(statusFromGraph.remainingPickups).toBeGreaterThanOrEqual(4); // treasure pedestal + 3 shop items
      expect(statusFromGraph.isFullyCleared).toBe(false);
      expect(statusFromGraph.statusLine).toBe(
        `${statusFromGraph.clearedRooms}/${statusFromGraph.totalRooms} SECTORS SECURED · ${statusFromGraph.remainingPickups} DROP(S) DETECTED`
      );
    });
  });

  describe('Dungeon Sector Threat & Special Room Summary (getDungeonSectorSummary, M131)', () => {
    it('accurately evaluates procedurally generated dungeons across floors 1 to 6', () => {
      for (let floor = 1; floor <= 6; floor++) {
        const graph = generateDungeon(floor);
        const summary: DungeonSectorSummary = getDungeonSectorSummary(graph);

        expect(summary.floorNum).toBe(floor);
        expect(summary.totalRooms).toBe(graph.targetRooms);
        // Boss, treasure, and shop are assigned
        expect(summary.bossRooms).toBe(1);
        expect(summary.treasureRooms).toBe(1);
        expect(summary.shopRooms).toBe(1);
        // Combat rooms count = totalRooms - (start + boss + treasure + shop)
        expect(summary.combatRooms).toBe(graph.targetRooms - 4);
        // By default, start, treasure, and shop are marked cleared (3 rooms)
        expect(summary.clearedRooms).toBe(3);
        // Pickups: at least 1 treasure pedestal + 3 shop items = 4
        expect(summary.remainingPickups).toBeGreaterThanOrEqual(4);
        // Default heat is 0
        expect(summary.heatLevel).toBe(0);
        expect(summary.scrapBonusPct).toBe(0);

        const expectedLine =
          `SECTOR ${floor} (3/${graph.targetRooms} CLEARED) // ROOMS: ${summary.combatRooms} COMBAT, 1 TREASURE, 1 SHOP, 1 BOSS // LOOT: ${summary.remainingPickups} DROPS // HEAT +0%`;
        expect(summary.summaryLine).toBe(expectedLine);
      }
    });

    it('correctly calculates Heat levels 0 to 3 and scrap bonus percentages', () => {
      const graph = generateDungeon(2);
      const heatBonusMap: Array<[number, number, number]> = [
        [0, 0, 0],
        [1, 1, 25],
        [2, 2, 50],
        [3, 3, 75]
      ];

      for (const [inputHeat, expectedHeat, expectedScrapBonus] of heatBonusMap) {
        const summary = getDungeonSectorSummary(graph, 2, inputHeat);
        expect(summary.heatLevel).toBe(expectedHeat);
        expect(summary.scrapBonusPct).toBe(expectedScrapBonus);
        expect(summary.summaryLine).toContain(`// HEAT +${expectedScrapBonus}%`);
      }
    });

    it('tracks clearance transitions between cleared and uncleared sectors', () => {
      const graph = generateDungeon(1);
      // Initially 3 rooms cleared (start, treasure, shop)
      let summary = getDungeonSectorSummary(graph);
      expect(summary.clearedRooms).toBe(3);
      expect(summary.summaryLine).toContain('(3/9 CLEARED)');

      // Clear all combat rooms and boss room
      for (const room of Object.values(graph.rooms)) {
        room.cleared = true;
      }
      summary = getDungeonSectorSummary(graph);
      expect(summary.clearedRooms).toBe(9);
      expect(summary.summaryLine).toContain('(9/9 CLEARED)');

      // Unclear all rooms
      for (const room of Object.values(graph.rooms)) {
        room.cleared = false;
      }
      summary = getDungeonSectorSummary(graph);
      expect(summary.clearedRooms).toBe(0);
      expect(summary.summaryLine).toContain('(0/9 CLEARED)');
    });

    it('ignores hub_npc pickups in hub / home base sectors', () => {
      const hubRoom = createHomeBaseRoom();
      const summary = getDungeonSectorSummary({ '0,0': hubRoom }, 1, 2);
      expect(summary.totalRooms).toBe(1);
      expect(summary.clearedRooms).toBe(1);
      expect(summary.combatRooms).toBe(0);
      expect(summary.treasureRooms).toBe(0);
      expect(summary.shopRooms).toBe(0);
      expect(summary.bossRooms).toBe(0);
      expect(summary.remainingPickups).toBe(0);
      expect(summary.heatLevel).toBe(2);
      expect(summary.scrapBonusPct).toBe(50);
      expect(summary.summaryLine).toBe(
        'SECTOR 1 (1/1 CLEARED) // ROOMS: 0 COMBAT, 0 TREASURE, 0 SHOP, 0 BOSS // LOOT: 0 DROPS // HEAT +50%'
      );
    });

    it('handles empty, null, undefined, and malformed inputs with safe defaults', () => {
      const emptySummary = getDungeonSectorSummary();
      expect(emptySummary).toEqual({
        floorNum: 1,
        totalRooms: 0,
        clearedRooms: 0,
        combatRooms: 0,
        treasureRooms: 0,
        shopRooms: 0,
        bossRooms: 0,
        remainingPickups: 0,
        heatLevel: 0,
        scrapBonusPct: 0,
        summaryLine: 'SECTOR 1 (0/0 CLEARED) // ROOMS: 0 COMBAT, 0 TREASURE, 0 SHOP, 0 BOSS // LOOT: 0 DROPS // HEAT +0%'
      });

      const nullSummary = getDungeonSectorSummary(null);
      expect(nullSummary.floorNum).toBe(1);
      expect(nullSummary.totalRooms).toBe(0);

      const malformedRooms = getDungeonSectorSummary({ rooms: { '0,0': null as any, '1,0': undefined as any } });
      expect(malformedRooms.totalRooms).toBe(0);
      expect(malformedRooms.summaryLine).toBe(
        'SECTOR 1 (0/0 CLEARED) // ROOMS: 0 COMBAT, 0 TREASURE, 0 SHOP, 0 BOSS // LOOT: 0 DROPS // HEAT +0%'
      );

      // Floor & Heat clamping / fallback behavior
      const clampedSummary = getDungeonSectorSummary(null, -10, 10);
      expect(clampedSummary.floorNum).toBe(1);
      expect(clampedSummary.heatLevel).toBe(3);
      expect(clampedSummary.scrapBonusPct).toBe(75);

      const floatSummary = getDungeonSectorSummary(null, 4.9, 1.8);
      expect(floatSummary.floorNum).toBe(4);
      expect(floatSummary.heatLevel).toBe(1);
      expect(floatSummary.scrapBonusPct).toBe(25);

      const nanSummary = getDungeonSectorSummary(null, NaN, NaN);
      expect(nanSummary.floorNum).toBe(1);
      expect(nanSummary.heatLevel).toBe(0);
      expect(nanSummary.scrapBonusPct).toBe(0);

      // DungeonGraph with floor property fallback when floorNum is not explicitly provided
      const graphF4 = generateDungeon(4);
      const graphSummary = getDungeonSectorSummary(graphF4);
      expect(graphSummary.floorNum).toBe(4);
    });
  });
});
