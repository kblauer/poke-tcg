// The Diamond & Pearl era's rules the engine has for every set: Pokémon LV.X, Weakness "+20", basic Darkness and Metal Energy.
import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { applyAction, inPlayDef, usableAttacks, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { attack, duel, mon, C, FI, W } from './test-kit.js';

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
function hand(s: GameState, player: string, def: CardDef): string {
  s.cards = { ...s.cards, [def.id]: def };
  const uid = `${def.id}-${n++}`;
  s.players[player]!.hand.push({ uid, defId: def.id });
  return uid;
}

const empoleon = mon('dp1-4', 'Empoleon', W, 130, [['Ice Blade', [W, C], 0]], { stage: 'stage2', evolvesFrom: 'Prinplup' });
const empoleonX = mon('dp1-120', 'Empoleon', W, 140, [['Hydro Impact', [W, W, W], 0]], { stage: 'levelUp' });

describe('Pokémon LV.X', () => {
  it('levels up the Active Pokémon of its name: its previous level\'s stage and attacks, Special Conditions removed', () => {
    const s = duel('charmander', 'onix');
    const p = put(s, 'ash', 'active', empoleon);
    p.condition = 'confused';
    const uid = hand(s, 'ash', empoleonX);
    const r = applyAction(s, 'ash', { type: 'EVOLVE', cardUid: uid, target: 'active' });
    if (!r.ok) throw new Error(r.error);
    const leveled = ash(r.state).active!;
    expect(leveled.card.uid).toBe(uid);
    expect(leveled.evolvedFrom.at(-1)!.defId).toBe('dp1-4');
    expect(leveled.condition ?? null).toBeNull();
    expect(inPlayDef(r.state.cards, leveled)).toMatchObject({ stage: 'stage2', hp: 140 });
    expect(usableAttacks(leveled, r.state.cards).map((u) => [u.attack.name, u.source])).toEqual([
      ['Hydro Impact', 'dp1-120'],
      ['Ice Blade', 'dp1-4'],
    ]);
    expect(r.state.log!.at(-1)!.text).toContain('Empoleon LV.X');
  });

  it('never a Benched Pokémon, another Pokémon, on the first turn or the turn its Pokémon came into play', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 0, empoleon);
    const uid = hand(s, 'ash', empoleonX);
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: uid, target: 0 })).toEqual({ ok: false, error: 'A Pokémon LV.X levels up only your Active Pokémon' });
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: uid, target: 'active' })).toEqual({ ok: false, error: 'Empoleon LV.X levels up only from Empoleon' });
    put(s, 'ash', 'active', empoleon).playedTurn = s.turn;
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: uid, target: 'active' })).toEqual({ ok: false, error: 'Empoleon was played or evolved this turn' });
    ash(s).active!.playedTurn = 0;
    s.turn = 2;
    expect(applyAction(s, 'ash', { type: 'EVOLVE', cardUid: uid, target: 'active' })).toEqual({ ok: false, error: "You can't evolve on your first turn" });
  });

  it('is never put onto the Bench as a Basic Pokémon', () => {
    const s = duel('charmander', 'onix');
    const uid = hand(s, 'ash', mon('dp4-x', 'Dialga', 'metal', 110, [], { stage: 'levelUp' }));
    expect(applyAction(s, 'ash', { type: 'PLAY_BENCH', cardUid: uid, slot: 0 }).ok).toBe(false);
  });
});

describe('Diamond & Pearl Weakness and Energy', () => {
  it('Weakness "+20" adds 20 rather than doubling', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('hitter', 'Machop', FI, 60, [['Punch', [C], 30]]), ['fighting']);
    put(s, 'misty', 'active', mon('target', 'Snorlax', C, 200, [], { weakness: { type: FI, multiplier: 1, plus: 20 } }));
    expect(misty(attack(s, 0)).active!.damage).toBe(50);
  });

  it('basic Darkness Energy (Diamond & Pearl) adds no damage, unlike the Special Darkness Energy', () => {
    const s = duel('charmander', 'onix');
    s.cards = { ...s.cards, 'dp1-129': { id: 'dp1-129', kind: 'energy', name: 'Darkness Energy', imageUrl: null, energyType: 'darkness' } };
    put(s, 'ash', 'active', mon('biter', 'Sneasel', 'darkness', 60, [['Bite', [C], 30]]), ['dp1-129']);
    put(s, 'misty', 'active', mon('target', 'Snorlax', C, 200, []));
    expect(misty(attack(s, 0)).active!.damage).toBe(30);
  });
});
