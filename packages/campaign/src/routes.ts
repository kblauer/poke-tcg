// Routes for the run map: a route's pixel map (from the FireRed/LeafGreen decompilation, rendered with its tilesets by
// tools/routes/render_route.py) and the spots its encounters happen at, in 16px tiles from the top left. The run screen
// zooms the map in on the current step's spot. Each route keeps which of its tiles can be walked on (`walkable`: '.'
// walkable, '~' water (walkable only on a route tagged for surfing, `travel: 'surf'`), 'v' a ledge jumped going down
// only (Route 45: walked onto and off only southwards; no one stands on it), '#' not: trees, buildings, ledges, other water,
// doorways and objects), so its spots can be checked to stay on the path.

export interface RouteSpot {
  x: number;
  y: number;
}

export interface Route {
  name: string;
  /**
   * Which way the encounters go on the map (up, down, left or right; across for a route running left to right): a spot's
   * figures stand beside the player, across the flow (left and right on an up or down map, above and below on a left or
   * right one), where they can, and otherwise ahead of him this way before behind. The player faces this way by default.
   */
  flow: 'up' | 'down' | 'left' | 'right';
  /** The spots this map's other version uses (a gym's Gym Trainer spot, for its leader-only version), only shown on the debug overlay. */
  otherSpots?: RouteSpot[];
  /** Spots whose figures and facing go another way than the map's `flow` (Pokémon Tower 1F's first, walked up to from the door), by spot index. */
  spotFlows?: Partial<Record<number, 'up' | 'down' | 'left' | 'right'>>;
  /** The map image (in apps/web/public) and its size in pixels; its tiles are 16px. */
  image: string;
  width: number;
  height: number;
  /** One spot per encounter step, in order (the run's start first); the steps after them stay at the last spot. */
  spots: RouteSpot[];
  walkable: string[];
  /** Tiles joined by a building the player walks through (a gatehouse's doors on either side): a walk between them fades out and in. */
  links?: [RouteSpot, RouteSpot][];
  /**
   * Where the player comes in, walking from there to the first spot: on a route, a tile in from the edge the run starts at
   * (one in where it can be walked to: Route 2's 9,78, from the user), or a gate's door; in a gym, its door.
   */
  entrance?: RouteSpot;
  /** Where the player leaves for the next map (in front of a door), walking there from the last spot before the fade. */
  exit?: RouteSpot;
  /** Where each spot's figure stands (a gym's trainers, as the game has them), instead of near the spot. */
  stands?: RouteSpot[];
  /** The overworld sprites it's drawn with: HeartGold/SoulSilver's on the Johto maps ('hgss', 32x32); FireRed's otherwise. */
  sprites?: 'hgss';
  /** How the player gets along (Route 17: on a bike, walking twice as fast; Route 20: surfing its water, '~'); on foot otherwise. */
  travel?: 'bike' | 'surf';
  /**
   * The trainers met in battles here: `share` of them (each at random) one of `names` (Route 17's Bikers), the others any
   * trainer (TRAINERS in run.ts, but for these names' classes).
   */
  trainers?: { names: string[]; share: number };
  /** A spot whose step is always a battle against any other trainer (not one of `trainers`): Route 20's on land by the caves. */
  landBattle?: number;
  /** Other people always there, for the look of the place (a gym's guide): their sprite (`public/overworld/`) and facing. */
  npcs?: { sprite: string; tile: RouteSpot; face: 'down' | 'up' | 'left' | 'right' }[];
}

/**
 * Route 2, between Viridian City (the bottom) and Pewter City (the top), for the Pewter City run: its main road past
 * Viridian Forest's gates on the left, and the east strip (the house and Diglett's Cave) on the right. 10 spots, picked
 * by tools/routes/pick_spots.py: evenly spaced from bottom to top, alternating sides where both can be walked, each in
 * the open (spots 1, 2, 9 and 10 on the main road, the others on the east strip; spots 2 to 5 and 9 from the user). Walkable as the map data has it, and
 * (from the user) the cut-tree and item ball tiles (15,69, 16,62, 11,13, 18,26; 17,54, 17,64) and the east gatehouse's
 * doors, south (18,46 and 19,46) and north (18,41 and 19,41), which link through it: every spot can be walked to from the
 * one before, the gatehouse (spots 4 to 5) the only fade.
 */
export const ROUTE_2: Route = {
  name: 'Route 2',
  flow: 'up',
  entrance: { x: 9, y: 78 },
  image: '/routes/route2.png',
  width: 384,
  height: 1280,
  spots: [
    { x: 9, y: 77 },
    { x: 4, y: 61 },
    { x: 18, y: 61 },
    { x: 19, y: 52 },
    { x: 19, y: 39 },
    { x: 19, y: 34 },
    { x: 18, y: 28 },
    { x: 19, y: 19 },
    { x: 8, y: 10 },
    { x: 9, y: 3 },
  ],
  links: [
    [
      { x: 18, y: 46 },
      { x: 18, y: 41 },
    ],
    [
      { x: 19, y: 46 },
      { x: 19, y: 41 },
    ],
  ],
  walkable: [
    '########....############',
    '########....############',
    '##..........############',
    '##..........#.........##',
    '##..........#.........##',
    '##..........#.........##',
    '##..........#########.##',
    '##..........#########.##',
    '##..........#########.##',
    '##..........#########.##',
    '##..........#########.##',
    '##..........#########.##',
    '##..........#.#.......##',
    '####.##.###.#.........##',
    '###########...........##',
    '##########............##',
    '##############........##',
    '##############........##',
    '##############........##',
    '##############........##',
    '##############........##',
    '###################...##',
    '###################...##',
    '##############........##',
    '################......##',
    '################......##',
    '##################.#####',
    '################......##',
    '################......##',
    '################......##',
    '################......##',
    '################......##',
    '###################.####',
    '################......##',
    '################......##',
    '################......##',
    '################......##',
    '###################.####',
    '################......##',
    '################......##',
    '################......##',
    '#################....###',
    '########################',
    '########################',
    '########################',
    '##........##############',
    '##################..####',
    '#################....###',
    '################......##',
    '################......##',
    '###.####.#######......##',
    '###################.####',
    '####....########......##',
    '##............##......##',
    '##............##......##',
    '###########...##......##',
    '##............##......##',
    '##............####.#####',
    '##............##......##',
    '##............##......##',
    '##............##......##',
    '##............##......##',
    '##....................##',
    '##....##########......##',
    '##....##########......##',
    '##....##########......##',
    '##....##########......##',
    '##............##......##',
    '##............##......##',
    '##....................##',
    '#########..###..##.#####',
    '##............##......##',
    '####..........##......##',
    '####...#......##......##',
    '####..........##......##',
    '####..........##......##',
    '####..........##......##',
    '####..........##......##',
    '#######.......##########',
    '#######.....############',
  ],
};

/**
 * Pewter Gym's interior, for the Pewter City run's Gym Trainer and Brock (`gym` on its run type): FireRed's map, with
 * Camper Liam's and Brock's places as the game has them (Liam halfway in on the left, 3,8, facing right; Brock on his
 * platform at the back, 6,5, facing down) and the Gym Guy by the door. The player comes in at the door (6,13) and stands
 * beside Liam (4,8), then below Brock (6,6).
 */
export const PEWTER_GYM: Route = {
  name: 'Pewter Gym',
  flow: 'up',
  image: '/routes/pewter_gym.png',
  width: 208,
  height: 256,
  entrance: { x: 6, y: 13 },
  spots: [
    { x: 4, y: 8 },
    { x: 6, y: 6 },
  ],
  stands: [
    { x: 3, y: 8 },
    { x: 6, y: 5 },
  ],
  npcs: [{ sprite: 'gym_guy', tile: { x: 7, y: 12 }, face: 'down' }],
  walkable: [
    '#############',
    '####.....####',
    '#############',
    '#....#.#....#',
    '#...........#',
    '#...#.#.#...#',
    '#...........#',
    '#..#.#.#.#..#',
    '##.#.......##',
    '#...#...#...#',
    '##.........##',
    '#...........#',
    '#...#..##...#',
    '#...........#',
    '#....###....#',
    '#############',
  ],
};

/** Whether a spot is on a walkable tile of its route: water ('~') only on a route tagged for surfing (`travel: 'surf'`). */
export const onPath = (route: Route, spot: RouteSpot) => {
  const c = route.walkable[spot.y]?.[spot.x];
  return c === '.' || (c === '~' && route.travel === 'surf');
};

/** The way the encounters go at a spot of a route (its `spotFlows`, or the map's `flow`). */
export const flowAt = (route: Route, spot: number) => route.spotFlows?.[spot] ?? route.flow;

/** Whether a tile of a route is a ledge jumped going down only ('v'). */
const downLedge = (route: Route, spot: RouteSpot) => route.walkable[spot.y]?.[spot.x] === 'v';

/** Whether a tile of a route is water surfed across (on a route tagged for surfing). */
export const onWater = (route: Route, spot: RouteSpot) => route.travel === 'surf' && route.walkable[spot.y]?.[spot.x] === '~';

/** A step of a walk: the tile stepped onto, and `fade` when it's reached through a link (a gatehouse). */
export interface RouteStep {
  tile: RouteSpot;
  fade?: boolean;
}

const tileKey = (t: RouteSpot) => `${t.x},${t.y}`;

/**
 * The shortest walk from one tile to another over the route's walkable tiles (4 ways, as in the game) and its links,
 * around the tiles in `blocked` (people standing on the route), as the steps taken (not `from`); null if there's none.
 */
export function routePath(route: Route, from: RouteSpot, to: RouteSpot, blocked: ReadonlySet<string> = new Set()): RouteStep[] | null {
  const prev = new Map<string, { from: RouteSpot; fade: boolean } | null>([[tileKey(from), null]]);
  const queue: RouteSpot[] = [from];
  while (queue.length) {
    const here = queue.shift()!;
    if (here.x === to.x && here.y === to.y) {
      const steps: RouteStep[] = [];
      for (let t = here, p = prev.get(tileKey(t)); p; t = p.from, p = prev.get(tileKey(t))) steps.unshift({ tile: t, ...(p.fade && { fade: true }) });
      return steps;
    }
    const linked = (route.links ?? []).flatMap(([a, b]) => (tileKey(a) === tileKey(here) ? [b] : tileKey(b) === tileKey(here) ? [a] : []));
    const next = [
      ...([[0, -1], [1, 0], [0, 1], [-1, 0]] as const).map(([dx, dy]) => ({ tile: { x: here.x + dx, y: here.y + dy }, fade: false })),
      ...linked.map((tile) => ({ tile, fade: true })),
    ];
    for (const { tile, fade } of next) {
      if (!(onPath(route, tile) || downLedge(route, tile)) || prev.has(tileKey(tile)) || blocked.has(tileKey(tile))) continue;
      // A ledge is jumped going down only: onto it and off it southwards.
      if (!fade && (downLedge(route, tile) || downLedge(route, here)) && tile.y !== here.y + 1) continue;
      prev.set(tileKey(tile), { from: here, fade });
      queue.push(tile);
    }
  }
  return null;
}
