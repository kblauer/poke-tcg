import { cuts, type IdleAction, type Mon } from '@poke-tcg/idle';

/** The part of a run the screen shows that an action's answer can change (ClientIdleRun's). */
interface ShownRun {
  id: string;
  view: { party: Mon[]; bag: Record<string, number>; pendingChanges: number };
}

/**
 * What the screen shows after the player's action (#204): the server's answer is the run after the segment playing (it's
 * saved ahead of the screen), so while one plays only what the action itself changed is shown at once, on the run on
 * screen; the rest (a town reached, the Champion's win, a catch's choice, levels, ₱, the bag, the log) waits for the
 * segment's end, where the playback shows the newest run (useIdlePlayback's `latest`). With no segment playing, an action
 * that cuts it (Stop, Continue run, the Town Map's moves: the answer is the run as it stands now) or giving up, the whole answer.
 *
 * | Action | Shown at once while a segment plays |
 * |---|---|
 * | SET_ORDER | the party's order |
 * | SET_SLOTS | that Pokémon's slots and automatic pick |
 * | USE_STONE | that Pokémon's species, moves and slots (its level and EXP. wait); the stone gone from the bag |
 * | any of them queued (a wild battle's ball still open) | how many changes wait (`pendingChanges`) |
 * | cuts (CONTINUE_RUN, TRAVEL, GRIND_AT, LEGEND, SET_MODE stop), GIVE_UP | everything |
 * | anything else (a town's or a catch's choices, BUY, SET_MODE on: never sent mid-segment) | nothing until the segment's end |
 */
export function shownAfterAction<R extends ShownRun>(shown: R, answer: R, action: IdleAction, segmentPlaying: boolean): R {
  if (!segmentPlaying || cuts(action) || action.type === 'GIVE_UP' || shown.id !== answer.id) return answer;
  const view = shown.view;
  const got = (uid: string) => answer.view.party.find((m) => m.uid === uid);
  const pendingChanges = answer.view.pendingChanges;
  switch (action.type) {
    case 'SET_ORDER': {
      // The answer's order for the Pokémon on screen (one caught later in the segment isn't shown yet).
      const order = answer.view.party.map((m) => m.uid);
      const rank = (uid: string) => (order.includes(uid) ? order.indexOf(uid) : order.length);
      return { ...shown, view: { ...view, pendingChanges, party: [...view.party].sort((a, b) => rank(a.uid) - rank(b.uid)) } };
    }
    case 'SET_SLOTS':
    case 'USE_STONE': {
      const party = view.party.map((m) => {
        const set = m.uid === action.uid ? got(m.uid) : undefined;
        if (!set) return m;
        const slots = { slots: set.slots, autoSlots: set.autoSlots };
        return action.type === 'SET_SLOTS' ? { ...m, ...slots } : { ...m, ...slots, species: set.species, moves: set.moves };
      });
      let bag = view.bag;
      if (action.type === 'USE_STONE') {
        const { [action.item]: _, ...rest } = view.bag;
        bag = action.item in answer.view.bag ? { ...rest, [action.item]: answer.view.bag[action.item]! } : rest;
      }
      return { ...shown, view: { ...view, pendingChanges, party, bag } };
    }
    default:
      return shown;
  }
}
