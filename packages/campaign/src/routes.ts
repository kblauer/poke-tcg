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

/**
 * A tile of a route's `track`: `under` when it's walked under a bridge; `wait`, how long (ms) the player stands before
 * stepping onto it (Sootopolis Gym's stairs, till they appear).
 */
export interface TrackTile extends RouteSpot {
  under?: boolean;
  wait?: number;
}

/**
 * A bridge (Route 215's, the user's): its deck's columns `x` and rows `y` (first, last), running up and down (`runs` 'y',
 * the default: got onto and off only at its top and bottom ends) or across ('x': at its left and right ends), and the
 * way `under` it where there's one (rows of a 'y' bridge, columns of an 'x' one), walked only across it, from side to
 * side. routePath walks its tiles as two levels, never off its sides nor from under it onto it.
 */
export interface Bridge {
  x: [number, number];
  y: [number, number];
  runs?: 'x' | 'y';
  under?: [number, number];
}

/**
 * A `track` from its corners: from `start`, each leg's straight lines to its corners in turn (every tile on the way), the
 * legs walked under a bridge marked `under`, and a leg's `wait` on its first tile.
 */
export function trackLine(start: [number, number], ...legs: { to: [number, number][]; under?: boolean; wait?: number }[]): TrackTile[] {
  const tiles: TrackTile[] = [{ x: start[0], y: start[1] }];
  for (const { to, under, wait } of legs) {
    const first = tiles.length;
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
    if (wait) tiles[first] = { ...tiles[first]!, wait };
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
  /** Bridges walked over and under (see Bridge); `bridgeOverhead` (an image the map's size) is drawn over the player only while he's under one. */
  bridges?: Bridge[];
  bridgeOverhead?: string;
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
   * The snow, one string per tile row as `walkable` (Diamond's tile behaviours, tools/routes/dp/dp_map.py: Route 217's,
   * Acuity Lakefront's): '1' deep, '2' deeper, '3' deepest, 's' shallow, 'w' snow with shadows. People sink into deep
   * snow (snowSink), the player wades out of deeper and deepest snow slower (snowPace), and each step off snow leaves its
   * track there (snowTrack). None on a map without.
   */
  snow?: string[];
  /**
   * The ice ('i'), one string per tile row as `walkable` (Route 44's, tools/routes/hgss/generate_johto.py): stepped onto,
   * it's slid across the way the player was going until the next tile is a wall, a rock or someone standing there, or
   * he's onto ground (agreed with the user). None on a map without.
   */
  ice?: string[];
  /**
   * Thin ice ('t'), one string per tile row as `walkable` (Sootopolis Gym's, MB_THIN_ICE): walked on as any floor, but
   * cracked once the player has stepped onto it, drawn as `crackedIce` until he leaves the map (the user's).
   */
  thinIce?: string[];
  /** The picture (in apps/web/public) of a tile of thin ice once cracked, 16x16 (METATILE_SootopolisGym_Ice_Cracked). */
  crackedIce?: string;
  /**
   * Stairs that appear once `cracks` tiles of the thin ice are cracked (Sootopolis Gym's, as its script's VAR_ICE_STEP_COUNT
   * 8, 28 and 67: each section's ice all cracked), on `tiles`, drawn as `iceStairsImage` (METATILE_SootopolisGym_Stairs).
   */
  iceStairs?: { tiles: RouteSpot[]; cracks: number }[];
  iceStairsImage?: string;
  /**
   * How high each tile's floor is, one string per tile row as `walkable`, a base-36 digit a level ('0' lowest; Snowpoint Gym's
   * pit, from the render's heights: tools/routes/dp/sinnoh_gyms.py): never walked or slid up onto a higher tile but by
   * `stairs`, and those on it drawn `levelPx` lower for each level below the entrance's (the picture's tilt). With
   * `levelStep` (Sunyshore Gym's two floors), walked up or down at most that many levels a step, both ways (Diamond's
   * terrain_collision_manager.c: no step onto a floor 20 units higher or lower), and drawn by their level below
   * `levelGround`'s (the level the picture has at its tiles) instead of the entrance's.
   */
  levels?: string[];
  levelPx?: number;
  levelStep?: number;
  levelGround?: number;
  /** Stairs, one string per tile row as `walkable`: '|' climbed north or south, '-' east or west (Diamond's tile behaviours 0x4A, 0x49), the only way up a level. */
  stairs?: string[];
  /**
   * Snowballs (Snowpoint Gym's, its map's OBJ_EVENT_GFX_SNOWBALL objects): in the way, and stopping a slide, until slid
   * into from across the ice, which crushes them (its Gym Guide's "slide on the ice with enough momentum to crush them";
   * any slide: my reading, to check with the user). They stay crushed until the player leaves the map (snowballsLeft). `snowballImage`:
   * their picture, 4 frames of 32x32 (whole, cracked, crumbling, a heap: Diamond's r09_o01).
   */
  snowballs?: RouteSpot[];
  snowballImage?: string;
  /**
   * Gears turning bridges (Sunyshore Gym's, pokeplatinum's gym_features.c): in each of their 4 states (from 0, as the
   * player comes in) the tiles of their arms that aren't there (`blocked`: sSunyshoreRoom3State<n>Collisions' regions);
   * stepping onto one of the `buttons` (its scripts' coord events) turns them `turns` states on (90° each, GEAR_TURN_MS),
   * the player waiting on it while they turn. `frames`: the part of the map's picture they change (`x`, `y`, `width`,
   * `height`, in pixels), drawn turning, `count` frames a whole turn from state 0 (a quarter of them a state), on one sheet
   * `columns` frames wide (`image`).
   */
  gears?: {
    blocked: RouteSpot[][];
    buttons: { tile: RouteSpot; turns: number }[];
    frames: { image: string; x: number; y: number; width: number; height: number; columns: number; count: number };
  };
  /** Tiles joined by a building the player walks through (a gatehouse's doors on either side): a walk between them fades out and in. */
  links?: [RouteSpot, RouteSpot][];
  /** Platform lifts ridden between a floor and the pit below it (Iron Island's, the user's): see Lift. */
  lifts?: Lift[];
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
  sprites?: 'hgss' | 'rse' | 'dp';
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

/** The kinds of Diamond's snow (the route's `snow`). */
const SNOWS = { '1': 'deep', '2': 'deeper', '3': 'deepest', s: 'shallow', w: 'shadows' } as const;
export type Snow = (typeof SNOWS)[keyof typeof SNOWS];
type Way = Route['flow'];

/** The snow on a tile (the route's `snow`), or null. */
export const snowAt = (route: Route, spot: RouteSpot): Snow | null => SNOWS[route.snow?.[spot.y]?.[spot.x] as keyof typeof SNOWS] ?? null;

/**
 * How far people standing in deep snow sink into it, in the game's units (pokeplatinum's map_object_move.c,
 * sinkInDeepSnowDistance and the rest), and in the picture's pixels (DP_TILT: as tilted as the map, dp_map.py's 0.6).
 */
const SNOW_SINK: Partial<Record<Snow, number>> = { deep: 12, deeper: 14, deepest: 16 };
export const DP_TILT = 0.6;
export const snowSink = (route: Route, spot: RouteSpot) => Math.round((SNOW_SINK[snowAt(route, spot)!] ?? 0) * DP_TILT);

/**
 * How fast the player steps off a tile of snow, of his walk elsewhere (player_move.c's MapObject_GetDeepSnowMovementAction,
 * by the tile he stands on: deep snow a walk, 8 frames a tile, deeper snow 16 and deepest 32).
 */
export const snowPace = (route: Route, from: RouteSpot) => ({ deeper: 0.5, deepest: 0.25 })[snowAt(route, from) as 'deeper'] ?? 1;

const WAYS: Way[] = ['up', 'down', 'left', 'right'];
// A furrow's frame by the way he came onto the tile, then the way he goes (ov5_021F1CC8.c's Unk_ov5_022003C4).
const FURROWS = [
  [4, 4, 7, 6],
  [4, 4, 9, 8],
  [8, 6, 5, 5],
  [9, 7, 5, 5],
];
/**
 * The track a step off a tile of snow leaves on it (ov5_021F1CC8.c's, set off by map_object_move.c's sub_02063994 as the
 * step ends): its frame of public/overworld/dp/snow_tracks.png (dp_sprites.py's TRACKS), footprints the way he went
 * (0 to 3: up, down, left, right) in shallow snow and snow with shadows, a furrow through deep snow (4 up-down, 5
 * left-right, 6 to 9 the corners) joining the way he came onto it (`came`) to the way he goes; null off snow.
 */
export const snowTrack = (route: Route, from: RouteSpot, way: Way, came: Way = way): number | null => {
  const snow = snowAt(route, from);
  if (!snow) return null;
  return snow === 'shallow' || snow === 'shadows' ? WAYS.indexOf(way) : FURROWS[WAYS.indexOf(came)]![WAYS.indexOf(way)]!;
};

/** Whether a tile is Emerald's long grass (the route's `grass`, 'L': Route 119's very tall grass), hiding more of those in it. */
export const inLongGrass = (route: Route, spot: RouteSpot) => route.grass?.[spot.y]?.[spot.x] === 'L';

/**
 * Whether a tile is the foot of Emerald's long grass: tall grass beside long grass (Route 119's patches' bottom row, long
 * grass above a band of ground), whose tufts are long grass's cut off above the band (the user's).
 */
export const onLongGrassEdge = (route: Route, spot: RouteSpot) =>
  route.grass?.[spot.y]?.[spot.x] === 'g' && [-1, 0, 1].some((dy) => [-1, 0, 1].some((dx) => route.grass?.[spot.y + dy]?.[spot.x + dx] === 'L'));

/** Whether a tile is ice (the route's `ice`), slid across. */
export const onIce = (route: Route, spot: RouteSpot) => route.ice?.[spot.y]?.[spot.x] === 'i';

/** A tile's level (the route's `levels`, base 36), NaN off them. */
const levelAt = (route: Route, t: RouteSpot) => parseInt(route.levels?.[t.y]?.[t.x] ?? '', 36);

/**
 * How far below where it is in the picture a tile's people are drawn, in pixels (the route's `levels`): its level below
 * the entrance's (or `levelGround`), `levelPx` each.
 */
export const dropAt = (route: Route, spot: RouteSpot) => {
  const level = (t: RouteSpot) => levelAt(route, t);
  const drop = ((route.levelGround ?? level(route.entrance ?? spot)) - level(spot)) * (route.levelPx ?? 0);
  return Number.isFinite(drop) ? drop : 0;
};

/**
 * Whether a move one tile (dx, dy) from `a` to `b` can be made by the route's `levels` and `stairs`: never onto a higher
 * tile but on stairs, which are climbed only their own way ('|' north or south, '-' east or west), on or off them.
 */
const climbable = (route: Route, a: RouteSpot, b: RouteSpot, dx: number, dy: number) => {
  if (!route.levels) return true;
  if (route.levelStep !== undefined) return Math.abs(levelAt(route, b) - levelAt(route, a)) <= route.levelStep;
  const stair = (t: RouteSpot) => route.stairs?.[t.y]?.[t.x];
  for (const t of [a, b]) if ((stair(t) === '|' && dx !== 0) || (stair(t) === '-' && dy !== 0)) return false;
  return stair(a) === '|' || stair(a) === '-' || stair(b) === '|' || stair(b) === '-' || levelAt(route, b) <= levelAt(route, a);
};

/**
 * The snowballs (the route's `snowballs`) still whole when the player stands at one of its stops (its entrance, then each
 * of its spots in turn): those not crushed on its walk there from the entrance (each stop's walk to the next, around the
 * people standing at its spots and its `npcs`); null at a tile that's none of its stops.
 */
const snowballsAt = new WeakMap<Route, Map<string, RouteSpot[]>>();
export const snowballsLeft = (route: Route, at: RouteSpot): RouteSpot[] | null => {
  if (!route.snowballs) return null;
  let stops = snowballsAt.get(route);
  if (!stops) {
    stops = new Map<string, RouteSpot[]>();
    const people = new Set([...(route.stands ?? []), ...(route.npcs ?? []).map((n) => n.tile)].map(tileKey));
    const walk = [route.entrance, ...route.spots].filter((s): s is RouteSpot => !!s);
    let left = route.snowballs;
    stops.set(tileKey(walk[0]!), left);
    for (let i = 1; i < walk.length; i++) {
      const crushed = new Set((routePath(route, walk[i - 1]!, walk[i]!, people, undefined, left, 0) ?? []).flatMap((s) => (s.breaks ? [tileKey(s.breaks)] : [])));
      left = left.filter((t) => !crushed.has(tileKey(t)));
      if (!stops.has(tileKey(walk[i]!))) stops.set(tileKey(walk[i]!), left);
    }
    snowballsAt.set(route, stops);
  }
  return stops.get(tileKey(at)) ?? null;
};

/** How long gears (the route's `gears`) take to turn 90°: pokeplatinum's FieldTask_SunyshoreGym_RotateGears, 5.625° a frame, 16 frames at 30 a second. */
export const GEAR_TURN_MS = (16 / 30) * 1000;

/** Whether a tile is a gear's arm that isn't there in its gears' `state` (the route's `gears`). */
const gearBlocks = (route: Route, state: number, t: RouteSpot) => !!route.gears?.blocked[state]!.some((b) => b.x === t.x && b.y === t.y);

/** How many states on a step onto `t` turns the route's gears (one of its `buttons`), 0 off them. */
const gearTurns = (route: Route, t: RouteSpot) => route.gears?.buttons.find((b) => b.tile.x === t.x && b.tile.y === t.y)?.turns ?? 0;

/**
 * The state the route's gears are in when the player stands at one of its stops (its entrance, in state 0, then each of
 * its spots in turn), as its walks there have turned them (as snowballsLeft); null at a tile that's none of its stops.
 */
const gearsAt = new WeakMap<Route, Map<string, number>>();
export const gearStateAt = (route: Route, at: RouteSpot): number | null => {
  if (!route.gears) return null;
  let stops = gearsAt.get(route);
  if (!stops) {
    stops = new Map<string, number>();
    const people = new Set([...(route.stands ?? []), ...(route.npcs ?? []).map((n) => n.tile)].map(tileKey));
    const walk = [route.entrance, ...route.spots].filter((s): s is RouteSpot => !!s);
    let state = 0;
    stops.set(tileKey(walk[0]!), state);
    for (let i = 1; i < walk.length; i++) {
      state = (routePath(route, walk[i - 1]!, walk[i]!, people, undefined, null, state) ?? []).reduce((s, step) => (s + (step.turns ?? 0)) % 4, state);
      if (!stops.has(tileKey(walk[i]!))) stops.set(tileKey(walk[i]!), state);
    }
    gearsAt.set(route, stops);
  }
  return stops.get(tileKey(at)) ?? null;
};

/** Whether a tile is thin ice (the route's `thinIce`), cracked once stepped onto. */
export const onThinIce = (route: Route, spot: RouteSpot) => route.thinIce?.[spot.y]?.[spot.x] === 't';

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
 * spot), the player coming in at `entrance`, 5 tiles from the leader (south where the gym allows: 4 steps from the spot),
 * with no snowball there (Snowpoint Gym's 11,8); `open`, tiles walkable there that aren't in the gym (Sunyshore Gym's, the user's).
 */
export const leaderRoom = (gym: Route, entrance: RouteSpot, open: RouteSpot[] = []): Route => ({
  ...gym,
  entrance,
  ...(open.length && { walkable: gym.walkable.map((r, y) => [...r].map((c, x) => (open.some((t) => t.x === x && t.y === y) ? '.' : c)).join('')) }),
  spots: [gym.spots.at(-1)!],
  stands: [gym.stands!.at(-1)!],
  spotFlows: undefined,
  otherSpots: gym.spots.slice(0, -1),
  ...(gym.snowballs && { snowballs: gym.snowballs.filter((t) => t.x !== entrance.x || t.y !== entrance.y) }),
});

/**
 * A platform lift (Iron Island's, Diamond's prop 494; the user's): ridden from the tile the player stands on at its `top`
 * (the floor above) to the one at its `bottom` (the pit), or back, as one step of a walk (`lift`), both drawn where they
 * are in the map's tilted picture. Its platform is drawn apart from the map (`image`, by tools/routes/dp/dp_map.py), at
 * `offset` pixels from the player's tile at whichever end it's at (liftEnd), moving with him as he rides it (LIFT_MS).
 */
export interface Lift {
  image: string;
  top: RouteSpot;
  bottom: RouteSpot;
  offset: { x: number; y: number };
}

/** How long a lift's ride takes: pokeplatinum's platform_lift.c, a unit of height a frame over its 8 tiles' (128 frames at 60 a second). */
export const LIFT_MS = (128 / 60) * 1000;

/**
 * Which end of a lift its platform is at, with the player at `tile`: where he is, the floor above (no lower than the
 * lift's top) or the pit (below it), as he came to it or rode it there; where he came in, as in the game. By the rows,
 * not the walkable tiles: the pits' tiles, drawn rows lower than Diamond's data has them, may still join the floor above.
 */
export const liftEnd = (lift: Lift, tile: RouteSpot): 'top' | 'bottom' => (tile.y <= lift.top.y ? 'top' : 'bottom');

/** How long the player stands on a lift's platform before it moves and once it's stopped (the user's: he stops on it, then it goes; he waits a moment before stepping off). */
export const LIFT_PAUSE_MS = 400;

/**
 * A step of a walk: the tile stepped onto, `fade` when it's reached through a link (a gatehouse), `lift` when it's ridden
 * to on a lift (the route's `lifts`), `under` when it's
 * under a bridge (a `track`'s), `slide` when it's slid onto across ice, `jump` when it's jumped onto, over a ledge (two
 * tiles at once), `wait`, how long (ms) the player stands still first (a `track`'s), and `breaks`, the snowball he's slid
 * into and crushed, stopping there (the route's `snowballs`), and `turns`, how many states on the button stepped onto turns
 * the route's gears (`gears`), as he gets there.
 */
export interface RouteStep {
  tile: RouteSpot;
  wait?: number;
  fade?: boolean;
  lift?: boolean;
  under?: boolean;
  slide?: boolean;
  jump?: boolean;
  breaks?: RouteSpot;
  turns?: number;
}

const tileKey = (t: RouteSpot) => `${t.x},${t.y}`;

const inSpan = (v: number, [a, b]: [number, number]) => v >= a && v <= b;
const bridgeAt = (route: Route, t: RouteSpot) => route.bridges?.find((b) => inSpan(t.x, b.x) && inSpan(t.y, b.y));

/**
 * A move from `here` (on a bridge's deck when `deck`) one tile (dx, dy) to `to`, by a route's `bridges`: on the deck
 * (true) or not (false), or null when it can't be made (off a deck's side, onto it but at its ends, from under it onto it).
 */
function bridgeMove(route: Route, here: RouteSpot, deck: boolean, to: RouteSpot, dx: number, dy: number): boolean | null {
  const from = bridgeAt(route, here);
  const onto = bridgeAt(route, to);
  if (!from && !onto) return false;
  // Along a bridge (the way its deck runs), and where along it a tile is; across it, the way under it is walked.
  const along = (b: Bridge) => (b.runs === 'x' ? dx : dy);
  const at = (b: Bridge, t: RouteSpot) => (b.runs === 'x' ? t.x : t.y);
  const ends = (b: Bridge) => (b.runs === 'x' ? b.x : b.y);
  const under = (b: Bridge, t: RouteSpot) => !!b.under && inSpan(b.runs === 'x' ? t.x : t.y, b.under);
  if (from && from === onto) return deck ? true : under(from, to) ? false : null;
  // Off a bridge (onto another one too: never side by side): off its deck only at its ends, from under it only across it.
  if (from && (deck ? !((along(from) === -1 && at(from, here) === ends(from)[0]) || (along(from) === 1 && at(from, here) === ends(from)[1])) : along(from) !== 0)) return null;
  if (!onto) return false;
  if ((along(onto) === 1 && at(onto, to) === ends(onto)[0]) || (along(onto) === -1 && at(onto, to) === ends(onto)[1])) return true;
  return along(onto) === 0 && under(onto, to) ? false : null;
}

/** The walk along a route's `track` from one of its tiles to another (onwards, or back the way it came); null if either isn't on it. */
function trackPath(track: TrackTile[], from: RouteSpot, to: RouteSpot): RouteStep[] | null {
  const at = (t: RouteSpot) => (s: RouteSpot) => s.x === t.x && s.y === t.y;
  const i = track.findIndex(at(from));
  if (i < 0) return null;
  const ahead = track.findIndex((s, j) => j > i && at(to)(s));
  const behind = track.slice(0, i).map(at(to)).lastIndexOf(true);
  const tiles = ahead >= 0 ? track.slice(i + 1, ahead + 1) : behind >= 0 ? track.slice(behind, i).reverse() : null;
  return tiles && tiles.map(({ x, y, under, wait }) => ({ tile: { x, y }, ...(under && { under: true }), ...(ahead >= 0 && wait && { wait }) }));
}

/** How many places (tiles, with the snowballs crushed on the way) a walk on a map with snowballs looks through before it gives up. */
const SNOW_STATES = 50000;

/**
 * The shortest walk from one tile to another over the route's walkable tiles (4 ways, as in the game), its links and its lifts,
 * around the tiles in `blocked` (people standing on the route), as the steps taken (not `from`); null if there's none.
 * A ledge ('v') is jumped over going down, landing on the tile below it: one move (`jump`), never onto the ledge itself.
 * Onto ice (the route's `ice`), a move slides on the way it was going until the next tile is a wall or someone standing
 * there, or it's onto ground, stopping only there: the fewest moves (a slide one), its tiles all steps (`slide`).
 * Never onto a higher tile but by stairs (the route's `levels`, `stairs`). Its snowballs (`snowballs`; those still whole:
 * `snowballsLeft` at `from`, or `left`) are in the way and stop a slide, crushed by it (`breaks`) and gone from then on.
 * Its gears' arms (`gears`) are walked onto only while they're there, in the gears' state then (gearStateAt at `from`, or
 * `gear`), which each button stepped onto turns on (`turns`).
 * A bridge's tiles (the route's `bridges`) are two levels: its deck, got onto and off at its ends, and the way under it,
 * crossed from side to side (its steps `under`). `lineOfSight` (an encounter whose people stand in a line through `to`): of the shortest walks, the one that gets onto
 * `to`'s column (people on its row, 'row') or row (people in its column, 'column') soonest and comes straight along it,
 * so the player steps into their line of sight only as he arrives, as in the games (agreed with the user): the fewest
 * steps off that column (or row) before `to`. On a map with a `track`, the walk along it between two of its tiles.
 */
export function routePath(
  route: Route,
  from: RouteSpot,
  to: RouteSpot,
  blocked: ReadonlySet<string> = new Set(),
  lineOfSight?: 'row' | 'column',
  left: RouteSpot[] | null = snowballsLeft(route, from) ?? route.snowballs ?? null,
  gear: number = gearStateAt(route, from) ?? 0,
): RouteStep[] | null {
  const along = route.track && trackPath(route.track, from, to);
  if (along) return along;
  // Each tile is one place but on a bridge, where its deck (key `^`) is another than the way under it; on a map with
  // snowballs, one for each set of them crushed (after `|`); on a map with gears, one for each of their states (after `@`).
  const crushedOf = new Map<string, string[]>([[tileKey(from), []]]);
  const gearOf = new Map<string, number>([[tileKey(from), gear]]);
  const key = (t: RouteSpot, deck: boolean, crushed: string[], state: number) =>
    (deck ? `${tileKey(t)}^` : tileKey(t)) + (crushed.length ? `|${crushed.join(';')}` : '') + (route.gears && state !== gear ? `@${state}` : '');
  const whole = new Set((left ?? []).map(tileKey));
  const prev = new Map<string, { from: RouteSpot; fromKey: string; fade: boolean; lift: boolean; via: RouteSpot[]; slide: boolean; jump: boolean; breaks?: RouteSpot; turns?: number } | null>([[tileKey(from), null]]);
  const decks = new Map<string, boolean>([[tileKey(from), false]]);
  const offLine = (t: RouteSpot) => (lineOfSight === 'row' ? t.x !== to.x : lineOfSight === 'column' ? t.y !== to.y : false);
  // Each tile's steps from `from`, and (lineOfSight) its walk's steps off the line: BFS reaches a tile first by a shortest
  // walk, and a later one as short replaces it if it has fewer steps off the line.
  const dist = new Map<string, number>([[tileKey(from), 0]]);
  const onRow = new Map<string, number>([[tileKey(from), 0]]);
  const queue: [RouteSpot, string][] = [[from, tileKey(from)]];
  while (queue.length) {
    const [here, hereKey] = queue.shift()!;
    const onDeck = decks.get(hereKey)!;
    const crushed = crushedOf.get(hereKey)!;
    const state = gearOf.get(hereKey)!;
    const inTheWay = (t: RouteSpot) => (whole.has(tileKey(t)) && !crushed.includes(tileKey(t))) || gearBlocks(route, state, t);
    // (A map with snowballs: a search over which are crushed too, given up past SNOW_STATES.)
    if (whole.size && prev.size > SNOW_STATES) return null;
    if (here.x === to.x && here.y === to.y) {
      const steps: RouteStep[] = [];
      for (let t = here, k = hereKey, p = prev.get(k); p; t = p.from, k = p.fromKey, p = prev.get(k)) {
        // Under a bridge: onto its way under, and the step out from it too (he's under it till he's off it: the user's).
        const below = (tile: RouteSpot, tk: string) => !decks.get(tk) && !!bridgeAt(route, tile);
        const under = below(t, k) || below(p.from, p.fromKey);
        steps.unshift({ tile: t, ...(p.fade && { fade: true }), ...(p.lift && { lift: true }), ...(under && { under: true }), ...(p.slide && { slide: true }), ...(p.jump && { jump: true }), ...(p.breaks && { breaks: p.breaks }), ...(p.turns && { turns: p.turns }) });
        steps.unshift(...p.via.map((tile) => ({ tile, slide: true })));
      }
      return steps;
    }
    const other = ([a, b]: [RouteSpot, RouteSpot]) => (tileKey(a) === tileKey(here) ? [b] : tileKey(b) === tileKey(here) ? [a] : []);
    const linked = (route.links ?? []).flatMap(other);
    const ridden = (route.lifts ?? []).flatMap((l) => other([l.top, l.bottom]));
    const next = [
      ...([[0, -1], [1, 0], [0, 1], [-1, 0]] as const).map(([dx, dy]) => ({ tile: { x: here.x + dx, y: here.y + dy }, fade: false, lift: false, dx, dy })),
      ...linked.map((tile) => ({ tile, fade: true, lift: false, dx: 0, dy: 0 })),
      // A lift ridden: no ledge, bridge or ice about it, as a link.
      ...ridden.map((tile) => ({ tile, fade: true, lift: true, dx: 0, dy: 0 })),
    ];
    for (const step of next) {
      const { dx, dy, lift } = step;
      const fade = step.fade && !lift;
      const linkLike = step.fade;
      let first = step.tile;
      // A ledge: jumped over going down, landing on the tile below it; no other way across or onto it.
      const jump = !linkLike && downLedge(route, first);
      if (jump) {
        if (dy !== 1) continue;
        first = { x: first.x, y: first.y + 1 };
      }
      if (!onPath(route, first) || blocked.has(tileKey(first)) || inTheWay(first) || (!linkLike && !climbable(route, here, first, dx, dy))) continue;
      const deck = linkLike ? false : bridgeMove(route, here, onDeck, first, dx, dy);
      if (deck === null) continue;
      // Onto ice: on until the next tile can't be walked onto (or someone stands there), or this one is ground; into a
      // snowball, crushing it.
      const via: RouteSpot[] = [];
      let tile = first;
      let breaks: RouteSpot | undefined;
      while (!linkLike && onIce(route, tile)) {
        const on = { x: tile.x + dx, y: tile.y + dy };
        if (inTheWay(on)) {
          breaks = on;
          break;
        }
        if (!onPath(route, on) || blocked.has(tileKey(on)) || !climbable(route, tile, on, dx, dy)) break;
        via.push(tile);
        tile = on;
      }
      const slide = via.length > 0 || (!linkLike && onIce(route, tile));
      const now = breaks ? [...crushed, tileKey(breaks)].sort() : crushed;
      const turns = gearTurns(route, tile);
      const k = key(tile, deck, now, (state + turns) % 4);
      const d = dist.get(hereKey)! + 1;
      const row = onRow.get(hereKey)! + [...via, tile].filter(offLine).length;
      if (prev.has(k)) {
        // Already reached: only a walk as short with fewer steps off the line takes its place (it's still queued).
        if (lineOfSight && dist.get(k) === d && row < onRow.get(k)!) {
          prev.set(k, { from: here, fromKey: hereKey, fade, lift, via, slide, jump, breaks, turns });
          onRow.set(k, row);
        }
        continue;
      }
      prev.set(k, { from: here, fromKey: hereKey, fade, lift, via, slide, jump, breaks, turns });
      decks.set(k, deck);
      crushedOf.set(k, now);
      gearOf.set(k, (state + turns) % 4);
      dist.set(k, d);
      onRow.set(k, row);
      queue.push([tile, k]);
    }
  }
  return null;
}
