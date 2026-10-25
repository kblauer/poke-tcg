import { describe, expect, it } from 'vitest';
import type { PokemonCardDef } from '../cards.js';
import { attackEffect, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { EX_TEMPLATE_DATA } from './ex-template-data.js';
import { ATTACK_TEMPLATES, matchTemplate, normText } from './ex-templates.js';
import { attack, duel, flips, id, mon, C, FI, W } from './test-kit.js';

const ash = (s: GameState) => s.players.ash!;
const misty = (s: GameState) => s.players.misty!;
let n = 0;

function put(s: GameState, player: string, target: Target, def: PokemonCardDef, energy: string[] = []): InPlayPokemon {
  s.cards[def.id] = def;
  const p: InPlayPokemon = { card: { uid: `${def.id}-${n++}`, defId: def.id }, evolvedFrom: [], damage: 0, energy: energy.map((e) => ({ uid: `${e}-${n++}`, defId: e })), playedTurn: 0 };
  if (target === 'active') s.players[player]!.active = p;
  else s.players[player]!.bench[target] = p;
  return p;
}
const big = (name: string) => mon(`big-${name}`, name, C, 300, [['Tackle', [C], 10]]);

describe('EX shared wordings', () => {
  it("normText: lower case, no accents, the Pokémon's own name (with or without its prefix and suffix) as @", () => {
    expect(normText("Team Magma's Mightyena does 10 damage to itself.", "Team Magma's Mightyena")).toBe('@ does 10 damage to itself');
    expect(normText('Latias ex does 10 damage to itself.  The Defending Pokémon is now Asleep.', 'Latias ex')).toBe('@ does 10 damage to itself. the defending pokemon is now asleep');
    expect(normText('Remove 2 damage counters from Latias.', 'Latias ex')).toBe('remove 2 damage counters from @');
  });

  it('matchTemplate: the template, the printed damage and the numbers and words of the wording', () => {
    expect(matchTemplate('Flip a coin. If heads, the Defending Pokémon is now Paralyzed.', 'Pikachu', 10, ['Lightning'])).toEqual(['flipCondition', 10, 'paralyzed']);
    expect(matchTemplate('Flip a coin. If heads, this attack does 20 damage plus 10 more damage.', 'Nuzleaf', 20, ['Colorless'])).toEqual(['flipForMore', 20, 20, 10]);
    expect(matchTemplate('Draw a card.', 'Pichu', 0, [])).toEqual(['draw', 0]);
    // The cost goes along where Energy beyond it counts.
    expect(matchTemplate("Does 50 damage plus 10 more damage for each Water Energy attached to Ludicolo but not used to pay for this attack's Energy cost. You can't add more than 20 damage in this way.", 'Ludicolo', 50, ['Water', 'Colorless', 'Colorless'])).toEqual([
      'extraTyped', 50, 50, 10, 'water', 20, 'water,colorless,colorless',
    ]);
    // A wording whose base damage isn't the printed one doesn't fit: left for the set's own file.
    expect(matchTemplate('Flip a coin. If heads, this attack does 20 damage plus 10 more damage.', 'Nuzleaf', 30, [])).toEqual({ misfit: 'flipForMore' });
    expect(matchTemplate('Something no other card says.', 'Nuzleaf', 30, [])).toBeNull();
  });

  it('every generated attack has its template, and the engine plays it', () => {
    for (const [id, attacks] of Object.entries(EX_TEMPLATE_DATA)) {
      for (const [name, [key]] of Object.entries(attacks)) {
        expect(ATTACK_TEMPLATES[key], `${id} ${name}`).toBeDefined();
        expect(attackEffect(id, name), `${id} ${name}`).toBeDefined();
      }
    }
    // A reverse-holo print plays as its card.
    expect(attackEffect('ex2-7-reverse', 'Hydro Punch')).toBeDefined();
  });

  it('Hydro Punch (Ludicolo): 10 more for each Water Energy beyond the cost, at most 20 more', () => {
    const s = duel('charmander', 'onix');
    const ludicolo = mon('ex2-7', 'Ludicolo', W, 110, [['Hydro Punch', [W, C, C], 50]], { stage: 'stage2' });
    put(s, 'ash', 'active', ludicolo, ['water', 'water', 'water']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.damage).toBe(50);
    put(s, 'ash', 'active', ludicolo, ['water', 'water', 'water', 'water', 'water', 'water']);
    expect(misty(attack(s, 0)).active!.damage).toBe(70);
  });

  it('Energy Cannon (Seadra): 10 more for each Energy beyond the cost of 1, at most 20 more; Water Arrow: 30 to the chosen Pokémon', () => {
    const s = duel('charmander', 'onix', { oppBench: ['squirtle'] });
    put(s, 'ash', 'active', mon('ex3-39', 'Seadra', W, 70, [['Water Arrow', [W], 0], ['Energy Cannon', [W], 20]], { stage: 'stage1' }), ['water', 'water', 'fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 1)).active!.damage).toBe(40);
    const arrow = misty(attack(s, 0, { oppTarget: 0 }));
    expect(arrow.active!.damage).toBe(0);
    expect(arrow.bench[0]!.damage).toBe(30);
  });

  it('Steady Punch (Nuzleaf): 10 more on heads', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex2-48', 'Nuzleaf', 'grass', 70, [['Steady Punch', [C], 20]], { stage: 'stage1' }), ['grass']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(flips(s, true), 0)).active!.damage).toBe(30);
    expect(misty(attack(flips(s, false), 0)).active!.damage).toBe(20);
  });

  it('Toxic (Arbok): Poisoned, 2 damage counters between turns', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex2-29', 'Arbok', 'grass', 80, [['Toxic', ['grass'], 20]], { stage: 'stage1' }), ['grass']);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 0)).active!.poison).toBe(20);
  });

  it("Bite Off (Team Magma's Mightyena): 40 more against a Pokémon-ex", () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex4-21', "Team Magma's Mightyena", 'darkness', 70, [['Overrun', [C], 10], ['Bite Off', [C, C], 40]], { stage: 'stage1' }), ['fire', 'fire']);
    put(s, 'misty', 'active', { ...big('Snorlax'), ex: true });
    expect(misty(attack(s, 1)).active!.damage).toBe(80);
    put(s, 'misty', 'active', big('Snorlax'));
    expect(misty(attack(s, 1)).active!.damage).toBe(40);
  });

  it('Spinning Tail (Steelix): 20 to each of the opponent\'s Pokémon, none to the Benched ones for Weakness', () => {
    const s = duel('charmander', 'onix', { oppBench: ['squirtle'] });
    put(s, 'ash', 'active', mon('ex2-23', 'Steelix', 'metal', 100, [['Rage', [C], 10], ['Spinning Tail', [C, C, C], 0]], { stage: 'stage1' }), ['fire', 'fire', 'fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    const after = misty(attack(s, 1));
    expect(after.active!.damage).toBe(20);
    expect(after.bench[0]!.damage).toBe(20);
  });

  it('Bounce (Spoink): may switch with a Benched Pokémon after the damage', () => {
    const s = duel('charmander', 'onix', { bench: ['squirtle'] });
    const spoink = mon('ex3-73', 'Spoink', 'psychic', 50, [['Bounce', [C], 10]]);
    put(s, 'ash', 'active', spoink, ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    const stay = attack(s, 0, { ownBenchSlot: -1 });
    expect(ash(stay).active!.card.defId).toBe('ex3-73');
    const go = attack(s, 0, { ownBenchSlot: 0 });
    expect(ash(go).active!.card.defId).not.toBe('ex3-73');
    expect(misty(go).active!.damage).toBe(10);
  });

  it('Surprise (Lombre): a card from the opponent\'s hand shuffled into their deck', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex2-46', 'Lombre', W, 70, [['Surprise', [C], 10]], { stage: 'stage1' }), ['fire']);
    put(s, 'misty', 'active', big('Snorlax'));
    const cards = misty(s).hand.length + misty(s).deck.length;
    const after = attack(s, 0);
    // Misty's turn has begun (she drew a card): her hand and deck hold the same cards between them.
    expect(misty(after).hand.length + misty(after).deck.length).toBe(cards);
    expect(JSON.stringify(after.log)).toContain("from the opponent's hand into their deck");
  });

  it('Call for Family (Beldum): a Basic Pokémon from the deck onto the Bench', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex5-54', 'Beldum', 'metal', 50, [['Call for Family', [C], 0]]), ['fire']);
    ash(s).deck.push({ uid: 'sq', defId: id('squirtle') });
    const after = attack(s, 0);
    expect(after.pendingChoice).toMatchObject({ kind: 'pickFromDeck', filter: 'basic', toBench: true });
  });

  it('Fighting Pokémon: the templates read the type from the wording (Super Slash, Zangoose: 30 more against an Evolved Pokémon)', () => {
    const s = duel('charmander', 'onix');
    put(s, 'ash', 'active', mon('ex2-14', 'Zangoose', C, 80, [['Super Slash', [C, C], 30]]), ['fire', 'fire']);
    const evolved = put(s, 'misty', 'active', { ...big('Golem'), type: FI, stage: 'stage2' });
    evolved.evolvedFrom = [{ uid: 'geodude', defId: 'geodude' }];
    expect(misty(attack(s, 0)).active!.damage).toBe(60);
  });
});
