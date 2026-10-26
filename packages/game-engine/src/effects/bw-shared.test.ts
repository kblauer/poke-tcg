import { describe, expect, it } from 'vitest';
import { isBasicPokemon, isBenchable } from '../cards.js';
import { applyAction, getPlayerView, type GameState } from '../index.js';
import { act, attack, CARDS, duel, give, id, settles } from './test-kit.js';

// The Black & White series' shared rules (README: Generation 5): Pokémon-EX, Restored Pokémon and their Fossils, the Dragon type.
const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;

describe('Pokémon-EX', () => {
  it('gives up 2 Prize cards when Knocked Out', () => {
    const s = duel('charmander', 'mewtwoEX', { energy: ['fire', 'fire'], oppBench: ['charmander'] });
    misty(s).active!.damage = 150;
    const prizes = ash(s).prizes.length;
    const after = attack(s, 1);
    expect(misty(after).discard.some((c) => c.defId === id('mewtwoEX'))).toBe(true);
    expect(ash(after).prizes.length).toBe(prizes - 2);
  });

  it("isn't a Pokémon-ex, and an ordinary Pokémon still gives 1", () => {
    expect(CARDS[id('mewtwoEX')]).toMatchObject({ pokemonEX: true });
    expect(CARDS[id('mewtwoEX')]).not.toHaveProperty('ex');
    const s = duel('charmander', 'charmander', { energy: ['fire', 'fire'], oppBench: ['charmander'] });
    misty(s).active!.damage = 40;
    expect(ash(attack(s, 1)).prizes.length).toBe(ash(s).prizes.length - 1);
  });
});

describe('Restored Pokémon', () => {
  it('is no Basic Pokémon, and only its Fossil benches it: not from the hand', () => {
    expect(isBasicPokemon(CARDS[id('archen')]!)).toBe(false);
    expect(isBenchable(CARDS[id('archen')]!)).toBe(false);
    const s = duel('charmander', 'charmander');
    const [archen] = give(s, 'ash', 'archen');
    expect(applyAction(s, 'ash', { type: 'PLAY_BENCH', cardUid: archen!, slot: 0 })).toEqual({ ok: false, error: 'Archen is a Restored Pokémon: only its Fossil puts it onto your Bench' });
  });

  /** Ash with these Archen among the bottom 7 cards of the deck (the deck's end) and Plume Fossil in hand, played. */
  const fossil = (archens: string[], bench: string[] = []) => {
    const s = duel('charmander', 'charmander', { bench });
    archens.forEach((a, i) => ash(s).deck.push({ uid: `archen-deck-${i}`, defId: id(a) }));
    const [plume] = give(s, 'ash', 'plumeFossil');
    return act(s, 'ash', { type: 'PLAY_TRAINER', cardUid: plume! });
  };

  it('Plume Fossil: the one Archen found goes onto the Bench at once (a search takes it: the same-card rule), the deck shuffled', () => {
    const benched = fossil(['archen']);
    expect(benched.pendingChoice).toBeUndefined();
    expect(ash(benched).bench[0]?.card.uid).toBe('archen-deck-0');
    expect(ash(benched).deck.some((c) => c.uid === 'archen-deck-0')).toBe(false);
  });

  it('Plume Fossil: any Archen is the same card (two prints too), so one is benched at once', () => {
    const benched = fossil(['archen', 'archenPlasma']);
    expect(benched.pendingChoice).toBeUndefined();
    expect(ash(benched).bench[0]?.card.uid).toMatch(/^archen-deck-/);
  });

  it('Plume Fossil: no Archen in the bottom 7 cards, or a full Bench, shows nothing to take (as Dusk Ball) and benches nothing', () => {
    for (const asked of [fossil([]), fossil(['archen'], ['charmander', 'charmander', 'charmander', 'charmander', 'charmander'])]) {
      expect(getPlayerView(asked, 'ash').self.pendingChoice).toMatchObject({ kind: 'pickFromDeck', options: [], optional: true });
      expect(settles(asked).length).toBeGreaterThan(0);
      const done = act(asked, 'ash', { type: 'RESOLVE_CHOICE' });
      expect(ash(done).bench.filter((p) => p?.card.uid.startsWith('archen'))).toHaveLength(0);
    }
  });
});

describe('the Dragon type', () => {
  it('a Dragon attacker hits a Pokémon weak to Dragon for double', () => {
    const s = duel('axew', 'axew', { energy: ['fire'] });
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
  });
});
