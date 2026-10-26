import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, createGame, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { act, attack, CARDS, duel, id, mon, settles, C, F, FI, L, P, W } from './test-kit.js';

// Dragon Vault (README: Generation 5): its attacks, Abilities and First Ticket.
const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
let n = 0;

function put(s: GameState, player: string, target: Target, def: PokemonCardDef, energy: string[] = []): InPlayPokemon {
  s.cards = { ...s.cards, [def.id]: def };
  const p: InPlayPokemon = { card: { uid: `${def.id}-${n++}`, defId: def.id }, evolvedFrom: [], damage: 0, energy: energy.map((e) => ({ uid: `${e}-${n++}`, defId: e })), playedTurn: 0 };
  if (target === 'active') s.players[player]!.active = p;
  else s.players[player]!.bench[target] = p;
  return p;
}
const ability = (name: string) => ({ power: { name, text: '' } });
const big = (name: string, extra: Partial<PokemonCardDef> = {}) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]], extra);
const DR = 'dragon' as const;
const M = 'metal' as const;

const dragonair = mon('dv1-3', 'Dragonair', DR, 90, [['Dragon Pulse', [W, L, C], 70]], { stage: 'stage1' });
const latias = mon('dv1-9', 'Latias', DR, 100, [['Energy Assist', [C], 0], ['Sky Heal', [F, P], 40]]);
const latios = mon('dv1-10', 'Latios', DR, 100, [['Sky Blade', [W, C], 20], ['Speed Wing', [P, C, C], 60]]);
const fraxure = mon('dv1-14', 'Fraxure', DR, 70, [['Dragon Claw', [FI, M, C], 60]], { stage: 'stage1', ...ability('Grit') });
const haxorus = mon('dv1-16', 'Haxorus', DR, 140, [['Axe Slugger', [C, C], 60], ['Dragon Pulse', [FI, M, C, C], 100]], { stage: 'stage2' });
const salamence = mon('dv1-8', 'Salamence', DR, 140, [['Shred', [F, W, C, C], 90]], { stage: 'stage2', ...ability('Scornful Storm') });

describe('Dragon Vault attacks', () => {
  it('Dragon Pulse: the top card of the player\'s deck discarded', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', dragonair, ['water', 'lightning', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    const top = ash(s).deck[0]!.uid;
    const after = attack(s, 0);
    expect(misty(after).active!.damage).toBe(70);
    expect(ash(after).discard.map((c) => c.uid)).toContain(top);
  });

  it('Sky Heal and Sky Blade: with the partner on the Bench, 20 off Latias, 20 more for Latios', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', latios, ['water', 'water']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(20);
    put(s, 'ash', 0, latias);
    expect(misty(attack(s, 0)).active!.damage).toBe(40);
    put(s, 'ash', 'active', latias, ['fire', 'psychic']).damage = 50;
    expect(ash(attack(s, 1)).active!.damage).toBe(50);
    put(s, 'ash', 0, latios);
    expect(ash(attack(s, 1)).active!.damage).toBe(30);
  });

  it('Axe Slugger: 60 more to a Colorless Pokémon', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', haxorus, ['fighting', 'fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(120);
    put(s, 'misty', 'active', mon('big-Golem', 'Golem', FI, 300, []));
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });
});

describe('Dragon Vault Abilities', () => {
  it('Grit: 40 more with a Special Condition, before Weakness and Resistance', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', fraxure, ['fighting', id('metal'), 'fighting']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
    ash(s).active!.poison = 1;
    expect(misty(attack(s, 0)).active!.damage).toBe(100);
  });

  it('Scornful Storm: the opponent discards down to 4 cards, their own picks', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', salamence);
    misty(s).hand.push({ uid: 'm-sw', defId: id('switch') });
    const size = misty(s).hand.length;
    const after = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
    expect(after.pendingChoice).toMatchObject({ player: 'misty', kind: 'discardFromHand', count: size - 4 });
    for (const done of settles(after)) expect(misty(done).hand).toHaveLength(4);
    misty(s).hand = misty(s).hand.slice(0, 4);
    expect(applyAction(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} }).ok).toBe(false);
  });
});

describe('First Ticket', () => {
  it('played as its player starts, if they choose: they go first; kept, nothing happens; never during a turn', () => {
    const cards: Record<string, CardDef> = { ...CARDS, 'dv1-19': { id: 'dv1-19', kind: 'trainer', name: 'First Ticket', imageUrl: null, text: '' } };
    const deck = Array<string>(20).fill(id('charmander'));
    for (const holder of ['ash', 'misty']) {
      let s = createGame({ id: 'ash', deck }, { id: 'misty', deck }, 1, cards);
      s.players[holder]!.hand.push({ uid: 'ticket', defId: 'dv1-19' });
      for (const p of ['ash', 'misty']) s = act(s, p, { type: 'SET_ACTIVE', cardUid: s.players[p]!.hand.find((c) => c.defId === id('charmander'))!.uid });
      const kept = act(act(s, 'ash', { type: 'START_BATTLE' }), 'misty', { type: 'START_BATTLE' });
      expect(kept.players[holder]!.hand.map((c) => c.uid)).toContain('ticket');
      s = act(act(s, 'ash', { type: 'START_BATTLE', firstTicket: holder === 'ash' }), 'misty', { type: 'START_BATTLE', firstTicket: holder === 'misty' });
      expect(s.currentPlayer).toBe(holder);
      expect(s.players[holder]!.discard.map((c) => c.uid)).toContain('ticket');
    }
    // With no First Ticket in the hand it can't be chosen.
    const none = createGame({ id: 'ash', deck }, { id: 'misty', deck }, 1, cards);
    const ready = act(none, 'ash', { type: 'SET_ACTIVE', cardUid: none.players.ash!.hand.find((c) => c.defId === id('charmander'))!.uid });
    expect(applyAction(ready, 'ash', { type: 'START_BATTLE', firstTicket: true }).ok).toBe(false);
    const s = duel('charmander', 'onix');
    s.cards = cards;
    ash(s).hand.push({ uid: 'later', defId: 'dv1-19' });
    expect(applyAction(s, 'ash', { type: 'PLAY_TRAINER', cardUid: 'later' }).ok).toBe(false);
  });
});
