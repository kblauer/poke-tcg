// The Battle Tower's scenes (README: Battle Tower), as scripts for TowerScene's director (useScene): the lobby's desk,
// the clerk taking the player to the elevator and up, the corridor, the battle room with its opponents and attendant.
// Each generation's floors are their own rooms (TOWER_ROOMS): FireRed's Trainer Tower, HGSS's and Emerald's Battle Tower.
import { routePath, TOP_FLOOR, TOWER_ROOMS, towerGeneration, type TowerAction, type TowerRoom, type TowerSprites } from '@poke-tcg/campaign';
import type { PlayerGender } from '@poke-tcg/shared';
import type { ClientTower } from '../../hooks/useTower';
import { playerSprite, type Facing } from '../../utils/overworld';
import { facing } from '../../utils/routeFigures';
import type { SceneSteps } from './TowerScene';

/**
 * Each set's staff: the receptionist at the lobby's desk, the clerk who rides the elevator and leads the way down the
 * corridor, the battle room's attendant, and the BP Shop's vendor (a Poké Mart clerk, the user's). FireRed's are its Union
 * Room receptionist (as the Trainer Tower's lobby has) and the 1F man at his counter; HGSS's the Battle Tower's receptionist (the woman, BFSW1, at the single battles'
 * desk) and its man in uniform (BFSM) for the others (ours: the frontier scenes don't say); Emerald's all Teala, as its maps have.
 */
const STAFF: Record<TowerSprites, { receptionist: string; clerk: string; attendant: string; vendor: string }> = {
  frlg: { receptionist: 'receptionist', clerk: 'receptionist', attendant: 'trainer_tower_man', vendor: 'clerk' },
  hgss: { receptionist: 'hgss/tower_staff_f', clerk: 'hgss/tower_staff_m', attendant: 'hgss/tower_staff_m', vendor: 'hgss/clerk' },
  rse: { receptionist: 'rse/teala', clerk: 'rse/teala', attendant: 'rse/teala', vendor: 'rse/clerk' },
};

/** The lobbies whose receptionist leads the player to the elevator, through the gap in her counter (their games' scripts); FireRed's sends him up the stairs. */
const LEADING = new Set<TowerSprites>(['hgss', 'rse']);

/** What the receptionist says to a player with a saved challenge, after a short welcome (SAVED_WELCOME; the user's words). */
const SAVED_WELCOME = 'Welcome to the Battle Tower!';
export const SAVED_LINE = 'You already have a Battle Tower challenge in progress. Would you like to continue?';

const setOf = (room: TowerRoom): TowerSprites => room.sprites ?? 'frlg';
const wins = (n: number) => `${n} ${n === 1 ? 'battle' : 'battles'}`;

/** What the scripts need from the page: the player's look, the start floors, the deck picker and the server's moves. */
export interface TowerContext {
  gender: PlayerGender;
  /** The floors a new challenge can start on, as they stand now (read when asked: a challenge reaching a checkpoint adds one). */
  readonly startFloors: number[];
  /** Opens (true) or closes the BP Shop under the scene. */
  shop: (open: boolean) => void;
  /** Leave Battle Tower: out of the Battle Tower, to the Play tab's menu. */
  leave: () => void;
  /** Shows the deck picker under the scene until a deck is picked (its id) or it's backed out of (null). */
  pickDeck: (floor: number) => Promise<string | null>;
  start: (deckId: string, floor: number) => Promise<ClientTower>;
  act: (challenge: ClientTower, action: TowerAction) => Promise<ClientTower>;
  /** Debug's Skip battle, when the debug tools are on (null otherwise). */
  skip: ((challenge: ClientTower) => Promise<ClientTower>) | null;
  /** Opens the battle's game; `preloadGame` fetches its page beforehand. */
  openGame: (gameId: string) => void;
  preloadGame: (gameId: string) => void;
  /** The challenge is saved or over: the page offers Return to Home. */
  finish: () => void;
  /** Auto play: the generation's lobby or rooms music; or a battle's (its game's), from its transition. */
  music: (gen: number, place: 'lobby' | 'rooms') => void;
  battleMusic: (gen: number, gameId: string) => void;
  /** A move the server refused: its message. */
  failed: (error: unknown) => string;
}

/** The player (Red, Ethan or Brendan, or the girl), in the room's sprites. */
const player = (room: TowerRoom, ctx: TowerContext, tile = room.points.entrance!, face: Facing = 'up') => ({
  sprite: playerSprite(setOf(room), undefined, false, ctx.gender),
  tile,
  face,
});

/** The receptionist's welcome and the challenge's explanation (the user's words). */
const WELCOME = "Welcome to the Battle Tower! I'll be your guide to the various facilities.\nWould you like to take the Battle Tower challenge?";
const EXPLANATION = [
  'Here at the Battle Tower, you can choose a deck and take on a series of challengers one after another!',
  'After every battle, you can choose to save your current streak and put your challenge on hold, or concede the current challenge and go back to the lobby.',
  'You can resume a saved Battle Tower challenge at any time, but you have to use the same deck you started the challenge with!',
  'Every 5 battles you win also unlocks a checkpoint, so future Battle Tower challenges can be started from there.',
];
/** The receptionist's choices (the user's). */
const RECEPTION = ['Start challenge', 'Exchange BP', 'Explain the challenge', 'Leave Battle Tower'];
/** After the explanation, the receptionist's question again, a box of its own (the user's words). */
const TRY_IT = 'Would you like to try the Battle Tower challenge?';
/** The BP Shop's vendor's welcome, and his question left up while the shop is open (the user's words). */
const SHOP_LINE = 'Welcome to the BP Shop! You can exchange your BP here for packs of sweet, sweet cardboard.';
const SHOP_HELP = 'How can I help you today?';
/** The receptionist after a lost challenge, her question, and her goodbye on Leave Battle Tower (the user's words). */
const THANKS = 'Thanks for taking the Battle Tower Challenge!';
const AGAIN = 'Would you like to start another Battle Tower challenge?';
const GOODBYE = ['Thanks for visiting the Battle Tower!', 'We hope to see you again soon!'];

/**
 * The lobby (the user's script): the player walks in to the desk; with a saved challenge the receptionist first offers to
 * take it up again (SAVED_LINE). Then her welcome and its choices: Start challenge (the floor where checkpoints give a
 * choice, then the deck, picked under the scene; then up to the floor), Exchange BP (the player walks over to the BP
 * Shop's vendor, who welcomes him, and the shop opens under the scene until Return to reception, then back to the desk),
 * Explain the challenge, and Leave Battle Tower (out of the door, back to the Play tab's menu). Taken up or started, she leads him
 * to the elevator (FireRed's sends him up the stairs), and on up to the floor. The lobby is the saved challenge's floor's
 * generation's, or Gen 1's. `returning`: back from a lost challenge (the user's script): he comes down Gen 1's stairs to the
 * desk instead of in by the door, and she thanks him and asks whether he'd like to start another (also after Save and
 * quit, `kept` the challenge saved, Concede, and beating the top floor).
 */
export async function lobbyScript(s: SceneSteps, ctx: TowerContext, saved: ClientTower | null, returning = false, kept: ClientTower | null = null) {
  const gen = saved ? saved.view.generation : 1;
  const lobby = TOWER_ROOMS[gen as 1 | 2 | 3].lobby;
  const set = setOf(lobby);
  const p = lobby.points;
  ctx.music(gen, 'lobby');
  s.reserve(null);
  s.setRoom(lobby, {
    player: returning ? { ...player(lobby, ctx, p.elevator!, 'down'), hidden: true } : player(lobby, ctx),
    receptionist: { sprite: STAFF[set].receptionist, tile: p.receptionist!, face: facing(p.receptionist!, p.desk!) },
    ...(p.vendor && { vendor: { sprite: STAFF[set].vendor, tile: p.vendor, face: 'down' as const } }),
    // The Pokémon Center's nurse at her counter, where the lobby has one (Gen 1's: the user's).
    ...(p.nurse && { nurse: { sprite: setOf(lobby) === 'frlg' ? 'nurse' : `${setOf(lobby)}/nurse`, tile: p.nurse, face: 'down' as const } }),
  });
  await s.fadeIn();
  if (returning) {
    // Down from the stairs: he fades in on them first.
    s.show('player', true);
    await s.wait(FADE_IN_MS);
  }
  /** To the desk, facing the receptionist across it. */
  const toDesk = async () => {
    await s.walk('player', p.desk!);
    s.faceTo('player', 'receptionist');
  };
  await toDesk();
  // The conversation at the desk keeps room for her choices throughout (the box never reflows as they come up).
  s.reserve(RECEPTION);
  let challenge: ClientTower | null = null;
  if (saved) await s.say(SAVED_WELCOME);
  if (saved && (await s.ask(SAVED_LINE, ['Continue', 'Start new challenge'])) === 0) {
    // The user's words; then the send-off up to the Battle Room, as for a new challenge.
    await s.say(`Continuing your challenge from battle #${saved.view.wins + 1}${saved.view.deckName ? ` with your ${saved.view.deckName} deck` : ''}.`);
    challenge = await ctx.act(saved, { type: 'RESUME' });
  }
  /** What the receptionist asks next: her welcome, or after the explanation TRY_IT. */
  // Already welcomed (a saved challenge, SAVED_WELCOME): her welcome without its first sentence (the user's).
  let question = saved ? WELCOME.replace(`${SAVED_WELCOME} `, '') : returning ? AGAIN : WELCOME;
  if (returning) await s.say(THANKS);
  while (!challenge) {
    const choice = await s.ask(question, RECEPTION);
    question = WELCOME;
    if (choice === 1) {
      // Over to the vendor and back (no vendor in this lobby: the shop opens at the desk).
      if (p.shop && p.vendor) {
        await s.walk('player', p.shop);
        s.faceTo('player', 'vendor');
        await s.say(SHOP_LINE, 'BP Shop');
      }
      // The shop open under the scene while he asks; Return to reception, his one choice beside the box, closes it.
      ctx.shop(true);
      try {
        await s.ask(SHOP_HELP, ['Return to reception'], 'BP Shop');
      } finally {
        ctx.shop(false);
      }
      if (p.shop) await toDesk();
      continue;
    }
    if (choice === 2) {
      for (const line of EXPLANATION) await s.say(line);
      question = TRY_IT;
      continue;
    }
    if (choice === 3) {
      for (const line of GOODBYE) await s.say(line);
      await s.walk('player', p.entrance!);
      await s.fadeOut();
      return ctx.leave();
    }
    // Just saved (`kept`): a new challenge would end that one (startTower gives it up), so she checks first.
    if (kept && (await s.ask('Starting a new challenge will end the one you just saved. Start a new one anyway?', ['No', 'Yes'])) === 0) continue;
    const floors = ctx.startFloors;
    const floor = floors.length > 1 ? floors[await s.ask('Which floor would you like to start on?', floors.map((f) => `Floor ${f}`))]! : 1;
    s.prompt('Please select the deck you would like to enter.');
    const deckId = await ctx.pickDeck(floor);
    s.hush();
    if (!deckId) continue;
    try {
      challenge = await ctx.start(deckId, floor);
    } catch (error) {
      await s.say(ctx.failed(error));
    }
  }
  const there = challenge.view.generation;
  // FireRed's sends the player up its stairs alone (the user's line); HGSS's and Emerald's lead him to the elevator.
  await s.say(LEADING.has(set) ? 'I will now show you to the Battle Room.' : 'Please head up the stairs to your Battle Room.');
  if (LEADING.has(set)) await s.lead('receptionist', 'player', p.elevator!);
  else await s.walk('player', p.elevator!);
  await s.fadeOut();
  // FireRed's stairs go straight up to its 1F; anywhere else (another generation's floors too) is the elevator.
  await toFloor(s, ctx, challenge, LEADING.has(set) || there !== gen);
  await battle(s, ctx, challenge);
}

/**
 * Up to the challenge's floor's rooms: the elevator (`ride`: the clerk riding up with the player), the corridor where
 * there is one (the clerk leading him down it to the battle room's door), then into the battle room, the player
 * walking to his place, the attendant at hers.
 */
async function toFloor(s: SceneSteps, ctx: TowerContext, challenge: ClientTower, ride: boolean) {
  const gen = challenge.view.generation as 1 | 2 | 3;
  const rooms = TOWER_ROOMS[gen];
  const set = setOf(rooms.room);
  ctx.music(gen, 'rooms');
  if (ride) {
    const el = rooms.elevator;
    s.setRoom(el, { player: player(el, ctx, el.points.entrance!, 'up'), clerk: { sprite: STAFF[set].clerk, tile: el.points.attendant!, face: facing(el.points.attendant!, el.points.entrance!) } });
    await s.fadeIn();
    await s.ride();
    await s.fadeOut();
    const corridor = rooms.corridor;
    if (corridor) {
      const c = corridor.points;
      // The clerk a step ahead of the player, leading him to the door.
      const ahead = routePath(corridor, c.entrance!, c.door!)?.[0]?.tile ?? c.attendant!;
      s.setRoom(corridor, { player: player(corridor, ctx, c.entrance!, facing(c.entrance!, ahead)), clerk: { sprite: STAFF[set].clerk, tile: ahead, face: facing(c.entrance!, ahead) } });
      await s.fadeIn();
      await s.lead('clerk', 'player', c.door!);
      s.show('clerk', false);
      await s.fadeOut();
    }
  }
  await enterRoom(s, ctx, challenge);
}

/** How long the player takes to fade in at the battle room's door (OverworldSprite's fade). */
const FADE_IN_MS = 300;

/** The battle room: the player fades in at its door and walks to his place, facing where the opponent stands; the attendant at hers. */
async function enterRoom(s: SceneSteps, ctx: TowerContext, challenge: ClientTower) {
  const room = TOWER_ROOMS[challenge.view.generation as 1 | 2 | 3].room;
  const r = room.points;
  s.setRoom(room, { player: { ...player(room, ctx, r.entrance!, 'down'), hidden: true }, attendant: { sprite: STAFF[setOf(room)].attendant, tile: r.attendant!, face: facing(r.attendant!, r.player!) } });
  await s.fadeIn();
  // He fades in at the door (the Battle Room's top door, the user's), then walks to his place.
  s.show('player', true);
  await s.wait(FADE_IN_MS);
  await s.walk('player', r.player!);
  s.face('player', facing(r.player!, r.opponent!));
}

/**
 * The next battle: the opponent rolled (CONTINUE, which starts the game) comes in and walks up to the player, says their
 * line, and the battle opens.
 */
async function battle(s: SceneSteps, ctx: TowerContext, challenge: ClientTower) {
  // The receptionist's or attendant's conversation is over: the opponent's line takes the box's whole width.
  s.reserve(null);
  const next = await ctx.act(challenge, { type: 'CONTINUE' });
  // The battle's page loads while the opponent comes in and the transition plays.
  if (next.gameId) ctx.preloadGame(next.gameId);
  const o = next.view.opponent!;
  const room = TOWER_ROOMS[next.view.generation as 1 | 2 | 3].room;
  const r = room.points;
  const name = `${o.trainerClass} ${o.name}`;
  s.place('opponent', { sprite: o.sprite, tile: r.opponentEntrance!, face: facing(r.opponentEntrance!, r.opponent!), name, hidden: true });
  await s.wait(200);
  s.show('opponent', true);
  await s.walk('opponent', r.opponent!);
  s.faceTo('opponent', 'player');
  s.faceTo('player', 'opponent');
  await s.say(o.before, name);
  // The mainline games' battle transition (one of several at random), the battle opening as it ends; its music from the
  // transition's first flash (the user's), the battle page's own cue, so it carries on into the battle.
  if (next.gameId) ctx.battleMusic(next.view.generation, next.gameId);
  await s.battleTransition();
  if (next.gameId) ctx.openGame(next.gameId);
}

/**
 * Back from a battle (or a challenge ended while away): in the room it was fought in, the opponent says their line (on
 * losing, or on winning) and leaves; then the attendant asks what's next (`between`), or says the challenge is over.
 */
export async function afterBattleScript(s: SceneSteps, ctx: TowerContext, challenge: ClientTower) {
  const last = challenge.view.last!;
  const gen = towerGeneration(last.floor) as 1 | 2 | 3;
  const room = TOWER_ROOMS[gen].room;
  const r = room.points;
  ctx.music(gen, 'rooms');
  s.setRoom(room, {
    player: player(room, ctx, r.player!, facing(r.player!, r.opponent!)),
    opponent: { sprite: last.sprite, tile: r.opponent!, face: facing(r.opponent!, r.player!), name: last.opponent },
    attendant: { sprite: STAFF[setOf(room)].attendant, tile: r.attendant!, face: facing(r.attendant!, r.player!) },
  });
  await s.fadeIn();
  await s.say(last.line, last.opponent);
  await s.walk('opponent', r.opponentEntrance!);
  s.show('opponent', false);
  await s.wait(300);
  await between(s, ctx, challenge, room, true);
}

/** In the battle room between battles (a page opened mid-challenge): the player in his place, the attendant asking what's next. */
export async function roomScript(s: SceneSteps, ctx: TowerContext, challenge: ClientTower) {
  ctx.music(challenge.view.generation, 'rooms');
  const room = TOWER_ROOMS[challenge.view.generation as 1 | 2 | 3].room;
  const r = room.points;
  s.setRoom(room, {
    player: player(room, ctx, r.player!, facing(r.player!, r.opponent!)),
    attendant: { sprite: STAFF[setOf(room)].attendant, tile: r.attendant!, face: facing(r.attendant!, r.player!) },
  });
  await s.fadeIn();
  await between(s, ctx, challenge, room, false);
}

/**
 * The attendant, walking up to the player where the room has her do so (Gen 1's and Gen 2's, behind the player, speak from there): the last
 * battle's result (`result`: its reward and a checkpoint reached), or the challenge's end; then whether to go on, save
 * and stop, or concede (the user's: the attendant's three choices). Going on to a new generation's floors, she leads the
 * player out and back into the elevator, up to its rooms. `room`: the battle room the player is in.
 */
async function between(s: SceneSteps, ctx: TowerContext, challenge: ClientTower, room: TowerRoom, result: boolean) {
  const v = challenge.view;
  const r = room.points;
  const spot = r.attendantSpot;
  const said = (text: string) => s.say(text, 'Attendant');
  const choices = ['Continue', 'Save and quit', 'Concede', ...(ctx.skip ? ['Skip battle (debug)'] : [])];
  // The attendant's conversation keeps room for his choices throughout (the box never reflows as they come up).
  s.reserve(choices);
  if (spot) {
    await s.walk('attendant', spot);
    s.faceTo('attendant', 'player');
    s.faceTo('player', 'attendant');
  }
  const from = v.startFloor > 1 ? ` from floor ${v.startFloor}` : '';
  /** Out of the Battle Room by its door, and back down to the lobby's desk (the user's script), `kept`: a challenge just saved. */
  const backToLobby = async (kept: ClientTower | null = null) => {
    ctx.finish();
    await s.walk('player', r.entrance!);
    s.show('player', false);
    await s.wait(FADE_IN_MS);
    await s.fadeOut();
    return lobbyScript(s, ctx, null, true, kept);
  };
  if (v.phase === 'lost') {
    await said("Aww, you lost! That's the end of your Battle Tower challenge.");
    await said(`You won ${wins(v.wins)} in a row. Please make your way back to the lobby.`);
    return backToLobby();
  }
  if (v.phase === 'won') {
    await said(`Congratulations! You've beaten all ${TOP_FLOOR} floors of the Battle Tower: ${wins(v.wins)} in a row${from}!`);
    await said('Please make your way back to the lobby.');
    return backToLobby();
  }
  if (result && v.last) {
    const { floor, bp, checkpoint } = v.last;
    // The user's words; a battle skipped by debug pays nothing, so it has no prize.
    const streak = v.wins === 1 ? '1 win' : `${v.wins} wins in a row`;
    await said(bp ? `Congratulations, that's ${streak} for this challenge! Here's your prize: ${bp} BP` : `Congratulations, that's ${streak} for this challenge!`);
    if (checkpoint) await said(`Floor ${floor} is a checkpoint: from now on, a new challenge can start on floor ${floor + 1}.`);
  }
  for (;;) {
    // The challenge's next battle, counted from its first (the user's words).
    const choice = await s.ask(`Next is battle #${v.wins + 1}. Would you like to continue the challenge?`, choices, 'Attendant');
    if (choice === 0) {
      if (spot) await s.walk('attendant', r.attendant!);
      const next = TOWER_ROOMS[v.generation as 1 | 2 | 3];
      if (next.room !== room) {
        // A new generation's floors: out of this room, back into the elevator, up to its rooms.
        // She leads the way out; Gen 1's man, behind his counter, sends the player on alone.
        if (spot) {
          await said(`Floor ${v.floor} is on the next level up. Please come with me to the elevator.`);
          await s.walk('attendant', r.entrance!);
          s.show('attendant', false);
        } else await said(`Floor ${v.floor} is on the next level up. Please take the elevator.`);
        await s.walk('player', r.entrance!);
        await s.fadeOut();
        await toFloor(s, ctx, challenge, true);
      }
      return battle(s, ctx, challenge);
    }
    if (choice === 1) {
      const kept = await ctx.act(challenge, { type: 'SAVE' });
      await said('Your challenge has been saved. Come back any time to carry on from here!');
      await said('Please make your way back to the lobby.');
      return backToLobby(kept);
    }
    if (choice === 2) {
      if ((await s.ask('Concede your challenge? It will end here.', ['No', 'Yes'], 'Attendant')) === 0) continue;
      const over = await ctx.act(challenge, { type: 'QUIT' });
      await said(`Your challenge is over. You won ${wins(over.view.wins)} in a row${from}. Please make your way back to the lobby.`);
      return backToLobby();
    }
    // Debug only: the battle won at once (no ₱ or EXP), its opponent shown leaving as after a battle.
    const skipped = await ctx.skip!(challenge);
    return afterBattleScript(s, ctx, skipped);
  }
}
