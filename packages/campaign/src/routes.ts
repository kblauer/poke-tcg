// Routes for the run map: a route's pixel map (from the FireRed/LeafGreen decompilation, rendered with its tilesets by
// tools/routes/render_route.py) and the spots its encounters happen at, in 16px tiles from the top left. The run screen
// zooms the map in on the current step's spot. Each route keeps which of its tiles can be walked on (`walkable`: '.'
// walkable, '~' water (walkable only on a route tagged for surfing, `travel: 'surf'`), 'v' a ledge jumped over
// going down in one hop (Route 45: never stood on; routePath's `jump` steps), '#' not: trees, buildings, ledges, other water,
// doorways and objects), so its spots can be checked to stay on the path.

/** The trainers met in the water of every surfed route (Kanto's Route 20, Johto's 40, Hoenn's 106, 124 and Sootopolis City): Swimmers, men and women (overworld.ts gives the women their own sprite). */
export const SWIMMERS = [
  'Swimmer Luis', 'Swimmer Richard', 'Swimmer Reece', 'Swimmer Matthew', 'Swimmer Douglas', 'Swimmer David', 'Swimmer Tony', 'Swimmer Barry',
  'Swimmer Shirley', 'Swimmer Tiffany', 'Swimmer Nora', 'Swimmer Melissa', 'Swimmer Anya', 'Swimmer Alice', 'Swimmer Connie',
];

export interface RouteSpot {
  x: number;
  y: number;
}

/** A tile of a route's `track`: `under` when it's walked under a bridge. */
export interface TrackTile extends RouteSpot {
  under?: boolean;
}

/**
 * A `track` from its corners: from `start`, each leg's straight lines to its corners in turn (every tile on the way), the
 * legs walked under a bridge marked `under`.
 */
export function trackLine(start: [number, number], ...legs: { to: [number, number][]; under?: boolean }[]): TrackTile[] {
  const tiles: TrackTile[] = [{ x: start[0], y: start[1] }];
  for (const { to, under } of legs) {
    for (const [x, y] of to) {
      const last = tiles.at(-1)!;
      if (last.x !== x && last.y !== y) throw new Error(`track corner ${x},${y} isn't in line with ${last.x},${last.y}`);
      const dx = Math.sign(x - last.x);
      const dy = Math.sign(y - last.y);
      for (let t = { x: last.x + dx, y: last.y + dy }; ; t = { x: t.x + dx, y: t.y + dy }) {
        tiles.push(under ? { ...t, under: true } : t);
        if (t.x === x && t.y === y) break;
      }
    }
  }
  return tiles;
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
  /**
   * What's drawn over the people walking under it (Route 32's Magnet Train bridge): an image the map's size, see-through
   * elsewhere (tools/routes/hgss/johto_routes.py's OVERHEAD). On a map with a `track`, only while the player is on one of
   * its `under` tiles (he also walks over the bridge).
   */
  overhead?: string;
  /**
   * The one way through (Goldenrod Gym's walkways and bridges, from the user): its tiles in the order walked, from the
   * door past every spot. A walk between two of its tiles follows it, never cutting across where it crosses itself (over
   * a bridge and back under it); `under` marks the tiles walked under a bridge.
   */
  track?: TrackTile[];
  width: number;
  height: number;
  /** One spot per encounter step, in order (the run's start first); the steps after them stay at the last spot. */
  spots: RouteSpot[];
  walkable: string[];
  /**
   * The tall grass ('g'), one string per tile row as `walkable`, from the game's tile behaviours (tools/routes/kanto_grass.py,
   * tools/routes/hgss/johto_routes.py): people standing in it are drawn half hidden, as in the games; Emerald's long grass
   * ('L', Route 119's very tall grass: tools/routes/emerald/hoenn_maps.py) hides more of them. None on a map without.
   */
  grass?: string[];
  /**
   * The ice ('i'), one string per tile row as `walkable` (Route 44's, tools/routes/hgss/generate_johto.py): stepped onto,
   * it's slid across the way the player was going until the next tile is a wall, a rock or someone standing there, or
   * he's onto ground (agreed with the user). None on a map without.
   */
  ice?: string[];
  /** Tiles joined by a building the player walks through (a gatehouse's doors on either side): a walk between them fades out and in. */
  links?: [RouteSpot, RouteSpot][];
  /**
   * Its links are buildings' front doors, walked into going up: the player fades out still facing up and fades back in
   * facing down, out of the other door (Route 110's Cycling Road gatehouses, the user's).
   */
  doors?: true;
  /**
   * Where the player comes in, walking from there to the first spot: on a route, a tile in from the edge the run starts at
   * (one in where it can be walked to: Route 2's 9,78, from the user), or a gate's door; in a gym, its door.
   */
  entrance?: RouteSpot;
  /** Where the player leaves for the next map (in front of a door), walking there from the last spot before the fade. */
  exit?: RouteSpot;
  /** Where each spot's figure stands (a gym's trainers, as the game has them), instead of near the spot. */
  stands?: RouteSpot[];
  /** The overworld sprites it's drawn with: HeartGold/SoulSilver's on the Johto maps ('hgss', 32x32), Emerald's on the Hoenn ones ('rse'); FireRed's otherwise. */
  sprites?: 'hgss' | 'rse';
  /** How the player gets along (Route 17: on a bike, walking twice as fast; Route 20: surfing its water, '~'); on foot otherwise. */
  travel?: 'bike' | 'surf';
  /**
   * The player comes in on foot, and each link he goes through switches him between on foot and the route's `travel`
   * (travelAt): Route 110's, the user's, walked up the sandy road from Slateport into the Cycling Road's south gatehouse,
   * ridden from its other door along the Cycling Road into its north gatehouse, walked again from there to Mauville.
   */
  onFoot?: true;
  /**
   * The trainers met in battles here: `share` of them (each at random) one of `names` (Route 17's Bikers), the others any
   * trainer (TRAINERS in run.ts, but for these names' classes).
   */
  trainers?: { names: string[]; share: number };
  /** A spot whose step is always a battle against any other trainer (not one of `trainers`): Route 20's on land by the caves. */
  landBattle?: number;
  /**
   * On a surfed route, its spots on land are ordinary ones (Sootopolis City's, in its streets): any encounter, battles
   * against any trainer but a Swimmer; only its spots in the water follow the surf rules (out at sea only battles, by the
   * shore only non-battle encounters). Without it, a surfed route's spots with land near are ashore, whatever they stand on.
   */
  landSpots?: boolean;
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
 * one before, the gatehouse (spots 4 to 5) the only fade. The treetops 6-15,62 and 10-13,15 are unwalkable (from the user).
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
    '##############........##',
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
    '##....##########......##',
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
  grass: [
    '........................',
    '........................',
    '..ggggggg...............',
    '..ggggggg...............',
    '..ggggggg...............',
    '..ggggggg...............',
    '..ggggggg...............',
    '..ggggggg...............',
    '..ggggggg...............',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '......ggggggg...........',
    '......ggggggg...........',
    '......ggggggg...........',
    '......ggggggg...........',
    '......ggggggg...........',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
    '........................',
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

/** The ledge markers in `walkable` (from the games' tile behaviours: tools/routes/hgss/hgss_map.py), by the way each is jumped. */
const LEDGES = { v: 'down', '^': 'up', '<': 'left', '>': 'right' } as const;

/**
 * The way a tile of a route is jumped over, if it's a ledge (never stood on: the user's): 'down' ('v'), 'up' ('^'),
 * 'left' ('<') or 'right' ('>'); null otherwise. Only down ledges are jumped yet (routePath): the maps have no others.
 */
export const ledgeAt = (route: Route, spot: RouteSpot): (typeof LEDGES)[keyof typeof LEDGES] | null => LEDGES[route.walkable[spot.y]?.[spot.x] as keyof typeof LEDGES] ?? null;

/** Whether a tile of a route is a ledge jumped going down ('v'), from the tile above it to the one below (the user's). */
const downLedge = (route: Route, spot: RouteSpot) => ledgeAt(route, spot) === 'down';

/** Whether a tile is tall grass (the route's `grass`, long grass too), where people are drawn half hidden. */
export const inGrass = (route: Route, spot: RouteSpot) => {
  const g = route.grass?.[spot.y]?.[spot.x];
  return g === 'g' || g === 'L';
};

/** Whether a tile is Emerald's long grass (the route's `grass`, 'L': Route 119's very tall grass), hiding more of those in it. */
export const inLongGrass = (route: Route, spot: RouteSpot) => route.grass?.[spot.y]?.[spot.x] === 'L';

/** Whether a tile is ice (the route's `ice`), slid across. */
export const onIce = (route: Route, spot: RouteSpot) => route.ice?.[spot.y]?.[spot.x] === 'i';

/** Whether a tile of a route is water surfed across (on a route tagged for surfing). */
export const onWater = (route: Route, spot: RouteSpot) => route.travel === 'surf' && route.walkable[spot.y]?.[spot.x] === '~';

type Travel = Route['travel'];

/**
 * How the player gets along on each tile of a route that comes in on foot (`onFoot`), by tile key, worked out once: along
 * its walk (from the entrance to each spot in turn, then the exit; routePath), on foot from the entrance and switched at
 * each link he goes through.
 */
const walkTravels = new WeakMap<Route, Map<string, Travel>>();
const walkTravel = (route: Route) => {
  let travels = walkTravels.get(route);
  if (!travels) {
    travels = new Map<string, Travel>();
    let travel: Travel = undefined;
    const stops = [route.entrance, ...route.spots, route.exit].filter((s): s is RouteSpot => !!s);
    travels.set(tileKey(stops[0]!), travel);
    for (let i = 1; i < stops.length; i++) {
      for (const step of routePath(route, stops[i - 1]!, stops[i]!) ?? []) {
        if (step.fade) travel = travel ? undefined : route.travel;
        travels.set(tileKey(step.tile), travel);
      }
    }
    walkTravels.set(route, travels);
  }
  return travels;
};

/**
 * How the player gets along on a tile: the route's `travel`; on a route that comes in on foot (`onFoot`), as its walk has
 * it there, or off the walk (around someone in the way) as at the walk's nearest tile.
 */
export const travelAt = (route: Route, spot: RouteSpot): Travel => {
  if (!route.onFoot) return route.travel;
  const travels = walkTravel(route);
  const seen = new Set([tileKey(spot)]);
  const queue = [spot];
  for (const { x, y } of queue) {
    const here = tileKey({ x, y });
    if (travels.has(here)) return travels.get(here);
    for (const n of [{ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 }]) {
      if (!seen.has(tileKey(n)) && onPath(route, n)) {
        seen.add(tileKey(n));
        queue.push(n);
      }
    }
  }
  return route.travel;
};

/**
 * A gym leader's part of their gym, for a run that goes straight to them (the Gym Challenge, the Champion run; agreed with
 * the user): the gym's map with the leader in their place (its last stand) and the player's spot below them (its last
 * spot), the player coming in at `entrance`, 5 tiles from the leader (south where the gym allows: 4 steps from the spot).
 */
export const leaderRoom = (gym: Route, entrance: RouteSpot): Route => ({ ...gym, entrance, spots: [gym.spots.at(-1)!], stands: [gym.stands!.at(-1)!], spotFlows: undefined, otherSpots: gym.spots.slice(0, -1) });

/**
 * A step of a walk: the tile stepped onto, `fade` when it's reached through a link (a gatehouse), `under` when it's
 * under a bridge (a `track`'s), `slide` when it's slid onto across ice, and `jump` when it's jumped onto, over a ledge (two
 * tiles at once).
 */
export interface RouteStep {
  tile: RouteSpot;
  fade?: boolean;
  under?: boolean;
  slide?: boolean;
  jump?: boolean;
}

const tileKey = (t: RouteSpot) => `${t.x},${t.y}`;

/** The walk along a route's `track` from one of its tiles to another (onwards, or back the way it came); null if either isn't on it. */
function trackPath(track: TrackTile[], from: RouteSpot, to: RouteSpot): RouteStep[] | null {
  const at = (t: RouteSpot) => (s: RouteSpot) => s.x === t.x && s.y === t.y;
  const i = track.findIndex(at(from));
  if (i < 0) return null;
  const ahead = track.findIndex((s, j) => j > i && at(to)(s));
  const behind = track.slice(0, i).map(at(to)).lastIndexOf(true);
  const tiles = ahead >= 0 ? track.slice(i + 1, ahead + 1) : behind >= 0 ? track.slice(behind, i).reverse() : null;
  return tiles && tiles.map(({ x, y, under }) => ({ tile: { x, y }, ...(under && { under: true }) }));
}

/**
 * The shortest walk from one tile to another over the route's walkable tiles (4 ways, as in the game) and its links,
 * around the tiles in `blocked` (people standing on the route), as the steps taken (not `from`); null if there's none.
 * A ledge ('v') is jumped over going down, landing on the tile below it: one move (`jump`), never onto the ledge itself.
 * Onto ice (the route's `ice`), a move slides on the way it was going until the next tile is a wall or someone standing
 * there, or it's onto ground, stopping only there: the fewest moves (a slide one), its tiles all steps (`slide`).
 * `lineOfSight` (an encounter whose people stand in a line through `to`): of the shortest walks, the one that gets onto
 * `to`'s column (people on its row, 'row') or row (people in its column, 'column') soonest and comes straight along it,
 * so the player steps into their line of sight only as he arrives, as in the games (agreed with the user): the fewest
 * steps off that column (or row) before `to`. On a map with a `track`, the walk along it between two of its tiles.
 */
export function routePath(route: Route, from: RouteSpot, to: RouteSpot, blocked: ReadonlySet<string> = new Set(), lineOfSight?: 'row' | 'column'): RouteStep[] | null {
  const along = route.track && trackPath(route.track, from, to);
  if (along) return along;
  const prev = new Map<string, { from: RouteSpot; fade: boolean; via: RouteSpot[]; slide: boolean; jump: boolean } | null>([[tileKey(from), null]]);
  const offLine = (t: RouteSpot) => (lineOfSight === 'row' ? t.x !== to.x : lineOfSight === 'column' ? t.y !== to.y : false);
  // Each tile's steps from `from`, and (lineOfSight) its walk's steps off the line: BFS reaches a tile first by a shortest
  // walk, and a later one as short replaces it if it has fewer steps off the line.
  const dist = new Map<string, number>([[tileKey(from), 0]]);
  const onRow = new Map<string, number>([[tileKey(from), 0]]);
  const queue: RouteSpot[] = [from];
  while (queue.length) {
    const here = queue.shift()!;
    if (here.x === to.x && here.y === to.y) {
      const steps: RouteStep[] = [];
      for (let t = here, p = prev.get(tileKey(t)); p; t = p.from, p = prev.get(tileKey(t))) {
        steps.unshift({ tile: t, ...(p.fade && { fade: true }), ...(p.slide && { slide: true }), ...(p.jump && { jump: true }) });
        steps.unshift(...p.via.map((tile) => ({ tile, slide: true })));
      }
      return steps;
    }
    const linked = (route.links ?? []).flatMap(([a, b]) => (tileKey(a) === tileKey(here) ? [b] : tileKey(b) === tileKey(here) ? [a] : []));
    const next = [
      ...([[0, -1], [1, 0], [0, 1], [-1, 0]] as const).map(([dx, dy]) => ({ tile: { x: here.x + dx, y: here.y + dy }, fade: false, dx, dy })),
      ...linked.map((tile) => ({ tile, fade: true, dx: 0, dy: 0 })),
    ];
    for (const step of next) {
      const { fade, dx, dy } = step;
      let first = step.tile;
      // A ledge: jumped over going down, landing on the tile below it; no other way across or onto it.
      const jump = !fade && downLedge(route, first);
      if (jump) {
        if (dy !== 1) continue;
        first = { x: first.x, y: first.y + 1 };
      }
      if (!onPath(route, first) || blocked.has(tileKey(first))) continue;
      // Onto ice: on until the next tile can't be walked onto (or someone stands there), or this one is ground.
      const via: RouteSpot[] = [];
      let tile = first;
      while (!fade && onIce(route, tile)) {
        const on = { x: tile.x + dx, y: tile.y + dy };
        if (!onPath(route, on) || blocked.has(tileKey(on))) break;
        via.push(tile);
        tile = on;
      }
      const slide = via.length > 0 || (!fade && onIce(route, tile));
      const k = tileKey(tile);
      const d = dist.get(tileKey(here))! + 1;
      const row = onRow.get(tileKey(here))! + [...via, tile].filter(offLine).length;
      if (prev.has(k)) {
        // Already reached: only a walk as short with fewer steps off the line takes its place (it's still queued).
        if (lineOfSight && dist.get(k) === d && row < onRow.get(k)!) {
          prev.set(k, { from: here, fade, via, slide, jump });
          onRow.set(k, row);
        }
        continue;
      }
      prev.set(k, { from: here, fade, via, slide, jump });
      dist.set(k, d);
      onRow.set(k, row);
      queue.push(tile);
    }
  }
  return null;
}
