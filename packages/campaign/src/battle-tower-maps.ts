// The Battle Tower's rooms (the user's): for each generation's floors a lobby with the desk, an elevator and the battle
// room, with Emerald's and HGSS's corridor between: FireRed's Trainer Tower for Gen 1 (FireRed has no Battle Tower), HGSS's
// Battle Tower for Gen 2 and Emerald's for Gen 3, each room's places from the game's events and scripts where they give
// them (tools/battle-tower/tower_maps.py has which are). Written by tools/battle-tower/tower_maps.py.
import type { Route, RouteSpot } from './routes.js';

/**
 * A Battle Tower room: a map (as a route's: its image, walkable tiles and sprite set; no encounter spots) with its named
 * places: a lobby's `entrance`, `receptionist`, `desk` and `elevator` (Gen 1's: the stairs up to 1F); an elevator's `entrance` and `attendant`; a
 * corridor's `entrance`, `attendant` and `door`; a battle room's `entrance`, `player`, `opponentEntrance`, `opponent`,
 * `attendant` and `attendantSpot` (none in Gen 1's, whose attendant speaks from his counter).
 */
export interface TowerRoom extends Route {
  points: Record<string, RouteSpot>;
}

export const FRLG_LOBBY: TowerRoom = {
  flow: 'up',
  name: 'Trainer Tower',
  image: '/routes/battle-tower/frlg-lobby.png',
  overhead: '/routes/battle-tower/frlg-lobby-overhead.png',
  width: 304,
  height: 272,
  entrance: { x: 9, y: 15 },
  spots: [],
  points: { entrance: { x: 9, y: 15 }, receptionist: { x: 11, y: 6 }, desk: { x: 9, y: 6 }, elevator: { x: 10, y: 2 }, vendor: { x: 14, y: 9 }, shop: { x: 14, y: 11 }, nurse: { x: 4, y: 9 } },
  walkable: [
    '###################',
    '###################',
    '#######....########',
    '#######...#########',
    '#######.....#######',
    '#########.#########',
    '#######.#.#.#######',
    '#######.#.#########',
    '#########.#########',
    '#####.###.##..##...',
    '#########..########',
    '...................',
    '..#................',
    '............#......',
    '...................',
    '#.#.#.........#.#.#',
    '###################',
  ],
};

export const FRLG_ELEVATOR: TowerRoom = {
  flow: 'down',
  name: 'Trainer Tower Elevator',
  image: '/routes/battle-tower/frlg-elevator.png',
  overhead: '/routes/battle-tower/frlg-elevator-overhead.png',
  width: 80,
  height: 112,
  entrance: { x: 2, y: 5 },
  spots: [],
  points: { entrance: { x: 2, y: 5 }, attendant: { x: 1, y: 4 } },
  walkable: [
    '#####',
    '#####',
    '#####',
    '.....',
    '.....',
    '.....',
    '#####',
  ],
};

export const FRLG_ROOM: TowerRoom = {
  flow: 'up',
  name: 'Battle Room',
  image: '/routes/battle-tower/frlg-room.png',
  width: 256,
  height: 192,
  entrance: { x: 7, y: 2 },
  spots: [],
  points: { entrance: { x: 7, y: 2 }, player: { x: 4, y: 6 }, opponentEntrance: { x: 7, y: 2 }, opponent: { x: 10, y: 6 }, attendant: { x: 2, y: 6 } },
  walkable: [
    '################',
    '################',
    '#######.########',
    '###.........####',
    '###.........####',
    '##...........###',
    '##...........###',
    '##...........###',
    '###.........####',
    '###.........####',
    '################',
    '################',
  ],
};

export const HGSS_LOBBY: TowerRoom = {
  flow: 'up',
  sprites: 'hgss',
  name: 'Battle Tower',
  image: '/routes/battle-tower/hgss-lobby.png',
  width: 496,
  height: 336,
  entrance: { x: 15, y: 18 },
  spots: [],
  points: { entrance: { x: 15, y: 18 }, receptionist: { x: 11, y: 5 }, desk: { x: 11, y: 6 }, elevator: { x: 11, y: 3 } },
  walkable: [
    '###############################',
    '###############################',
    '###############################',
    '##########...#...#...##########',
    '##########...#...#...##########',
    '###########.###.###.#####.#####',
    '#########.............#..######',
    '#####.....................#####',
    '#####.....................#####',
    '#####.......#.....#...#.#.#####',
    '#####.................#.#.#####',
    '#####.................#.#.#####',
    '#####.................#.#.#####',
    '#.............................#',
    '#.............................#',
    '#.............................#',
    '#########.............#########',
    '#########.............#########',
    '#########.............#########',
    '#########...#.###.#...#########',
    '###############################',
  ],
};

export const HGSS_ELEVATOR: TowerRoom = {
  flow: 'down',
  sprites: 'hgss',
  name: 'Battle Tower Elevator',
  image: '/routes/battle-tower/hgss-elevator.png',
  width: 112,
  height: 128,
  entrance: { x: 3, y: 6 },
  spots: [],
  points: { entrance: { x: 3, y: 6 }, attendant: { x: 4, y: 4 } },
  walkable: [
    '#######',
    '#######',
    '#######',
    '#.....#',
    '#.....#',
    '#.....#',
    '#.....#',
    '#######',
  ],
};

export const HGSS_CORRIDOR: TowerRoom = {
  flow: 'up',
  sprites: 'hgss',
  name: 'Battle Tower Corridor',
  image: '/routes/battle-tower/hgss-corridor.png',
  width: 368,
  height: 192,
  entrance: { x: 20, y: 4 },
  spots: [],
  points: { entrance: { x: 20, y: 4 }, attendant: { x: 3, y: 3 }, door: { x: 3, y: 2 } },
  walkable: [
    '#######################',
    '#######################',
    '###.###################',
    '#.....................#',
    '#.....................#',
    '#....#...#...#...#....#',
    '#######################',
    '#######################',
    '#######################',
    '#######################',
    '#######################',
    '#######################',
  ],
};

export const HGSS_ROOM: TowerRoom = {
  flow: 'up',
  sprites: 'hgss',
  name: 'Battle Room',
  image: '/routes/battle-tower/hgss-room.png',
  width: 256,
  height: 192,
  entrance: { x: 7, y: 2 },
  spots: [],
  points: { entrance: { x: 7, y: 2 }, player: { x: 4, y: 6 }, opponentEntrance: { x: 7, y: 2 }, opponent: { x: 10, y: 6 }, attendant: { x: 2, y: 6 } },
  walkable: [
    '################',
    '################',
    '#######.########',
    '###.........####',
    '###.........####',
    '##...........###',
    '##...........###',
    '##...........###',
    '###.........####',
    '###.........####',
    '################',
    '################',
  ],
};

export const RSE_LOBBY: TowerRoom = {
  flow: 'up',
  sprites: 'rse',
  name: 'Battle Tower',
  image: '/routes/battle-tower/rse-lobby.png',
  overhead: '/routes/battle-tower/rse-lobby-overhead.png',
  width: 400,
  height: 160,
  entrance: { x: 12, y: 8 },
  spots: [],
  points: { entrance: { x: 12, y: 8 }, receptionist: { x: 6, y: 5 }, desk: { x: 6, y: 6 }, elevator: { x: 6, y: 2 } },
  walkable: [
    '#########################',
    '#########################',
    '....#...#...#...#...#....',
    '....#...#...#...#...#....',
    '....#...#...#...#...#....',
    '.#..##.##############..#.',
    '.........................',
    '.........................',
    '.................#.......',
    '##.........###.#.......##',
  ],
};

export const RSE_ELEVATOR: TowerRoom = {
  flow: 'down',
  sprites: 'rse',
  name: 'Battle Tower Elevator',
  image: '/routes/battle-tower/rse-elevator.png',
  width: 80,
  height: 112,
  entrance: { x: 2, y: 5 },
  spots: [],
  points: { entrance: { x: 2, y: 5 }, attendant: { x: 1, y: 5 } },
  walkable: [
    '.####',
    '.####',
    '.####',
    '.....',
    '.....',
    '.#...',
    '.##..',
  ],
};

export const RSE_CORRIDOR: TowerRoom = {
  flow: 'right',
  sprites: 'rse',
  name: 'Battle Tower Corridor',
  image: '/routes/battle-tower/rse-corridor.png',
  overhead: '/routes/battle-tower/rse-corridor-overhead.png',
  width: 272,
  height: 80,
  entrance: { x: 8, y: 1 },
  spots: [],
  points: { entrance: { x: 8, y: 1 }, attendant: { x: 9, y: 2 }, door: { x: 12, y: 1 } },
  walkable: [
    '#################',
    '########.###.####',
    '.........#.......',
    '.................',
    '#...............#',
  ],
};

export const RSE_ROOM: TowerRoom = {
  flow: 'right',
  sprites: 'rse',
  name: 'Battle Room',
  image: '/routes/battle-tower/rse-room.png',
  overhead: '/routes/battle-tower/rse-room-overhead.png',
  width: 160,
  height: 144,
  entrance: { x: 4, y: 8 },
  spots: [],
  points: { entrance: { x: 4, y: 8 }, player: { x: 4, y: 5 }, opponentEntrance: { x: 5, y: 1 }, opponent: { x: 5, y: 5 }, attendant: { x: 1, y: 7 }, attendantSpot: { x: 4, y: 6 } },
  walkable: [
    '##########',
    '####.#####',
    '#........#',
    '..........',
    '..........',
    '..........',
    '..........',
    '.#........',
    '#....##..#',
  ],
};

/** Each generation's rooms, in the order the player goes through them: the lobby, the elevator, the corridor (if any), the battle room. */
export const TOWER_ROOMS = {
  1: { lobby: FRLG_LOBBY, elevator: FRLG_ELEVATOR, corridor: undefined, room: FRLG_ROOM },
  2: { lobby: HGSS_LOBBY, elevator: HGSS_ELEVATOR, corridor: HGSS_CORRIDOR, room: HGSS_ROOM },
  3: { lobby: RSE_LOBBY, elevator: RSE_ELEVATOR, corridor: RSE_CORRIDOR, room: RSE_ROOM },
} as const;
