import { describe, expect, it } from 'vitest';
import { applyAction, getPlayerView, type GameState } from '../index.js';
import { act, duel, flips, give, pokemon } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const play = (s: GameState, cardUid: string) => act(s, 'ash', { type: 'PLAY_TRAINER', cardUid });

describe('Jungle Trainers', () => {
  describe('Poké Ball', () => {
    it('on heads, takes a Basic Pokémon or Evolution card from the deck and names it in the log', () => {
      const s = flips(duel('charmander', 'onix'), true);
      ash(s).deck.push(pokemon('squirtle').card, { uid: 'e1', defId: 'water' });
      const [ball] = give(s, 'ash', 'pokeball');
      let after = play(s, ball!);
      const choice = getPlayerView(after, 'ash').self.pendingChoice;
      expect(choice).toMatchObject({ kind: 'pickFromDeck' });
      // Energy isn't an option; the Charmanders and the Squirtle are.
      expect(choice?.kind === 'pickFromDeck' && choice.options.every((c) => c.defId !== 'water')).toBe(true);
      const squirtle = ash(after).deck.find((c) => after.cards[c.defId]!.name === 'Squirtle')!;
      after = act(after, 'ash', { type: 'RESOLVE_CHOICE', cardUid: squirtle.uid });
      expect(ash(after).hand.some((c) => c.uid === squirtle.uid)).toBe(true);
      expect(after.log!.at(-1)!.text).toBe('Took Squirtle from the deck.');
    });

    it('must take a card when the deck has one it can', () => {
      const s = flips(duel('charmander', 'onix'), true);
      ash(s).deck.push(pokemon('squirtle').card);
      const [ball] = give(s, 'ash', 'pokeball');
      expect(applyAction(play(s, ball!), 'ash', { type: 'RESOLVE_CHOICE' })).toEqual({ ok: false, error: 'Choose a card from your deck' });
    });

    it('does nothing on tails, and needs a card in the deck', () => {
      const s = flips(duel('charmander', 'onix'), false);
      const [ball] = give(s, 'ash', 'pokeball');
      expect(play(s, ball!).pendingChoice).toBeUndefined();
      ash(s).deck = [];
      expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: ball! })).toEqual({ ok: false, error: 'Your deck is empty' });
    });
  });
});
