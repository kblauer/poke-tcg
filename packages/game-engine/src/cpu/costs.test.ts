// Optional costs (agreed 2026-11-14, every difficulty): Psychic Protector paid when it stops a Knock Out of Flygon ex, Power
// Cancel against a strong power (STRONG_POWERS) or with 2 cards the CPU doesn't want, Charity Tail only with 2 such cards,
// Power Spray against a strong power or with a second Power Spray in the hand.
import { describe, expect, it } from 'vitest';
import type { CardDef, PokemonCardDef } from '../cards.js';
import { powerEffect } from '../effects/index.js';
import { act, attack, duel, mon, C, F, FI, P } from '../effects/test-kit.js';
import { gymLeaderCpu, passiveCpu, trainerCpu, type GameState, type InPlayPokemon, type Target } from '../index.js';
import { isPokePower } from '../powers.js';
import { STRONG_POWERS } from './costs.js';

const CPUS = { passive: passiveCpu, trainer: trainerCpu, gymLeader: gymLeaderCpu } as const;
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
const power = (name: string) => ({ power: { name, text: '' } });
/** A card the CPU wants (a Trainer: neither wantedCards' nor unwantedCards'). */
const potion = (s: GameState, player = 'misty') => hand(s, player, { id: 'dp1-118', kind: 'trainer', name: 'Potion', imageUrl: null, text: '' });
/** A card it doesn't want: a Stage 2 with nothing in play or in the hand to evolve from. */
const junk = (s: GameState, player = 'misty') => hand(s, player, mon('junk-charizard', 'Charizard', F, 120, [], { stage: 'stage2', evolvesFrom: 'Charmeleon' }));
const flygon = () => mon('ex16-94', 'Flygon ex', C, 150, [], { ex: true, stage: 'stage1', ...power('Psychic Protector') });
const hitter = (damage: number) => mon(`hitter-${damage}`, 'Machop', FI, 60, [['Punch', [C], damage]]);

/** Misty's CPU answers her questions until none is hers; her answers. */
function answer(s: GameState, cpu: (typeof CPUS)[keyof typeof CPUS]) {
  const answers = [];
  while (s.pendingChoice?.player === 'misty') {
    const a = cpu(s, 'misty')!;
    answers.push(a);
    s = act(s, 'misty', a);
  }
  return { s, answers };
}

describe('STRONG_POWERS', () => {
  it('lists only Poké-Powers its player chooses to use (a Use button or an on-play "use it?" question: the ones Power Cancel is asked against)', () => {
    for (const id of Object.keys(STRONG_POWERS)) {
      const effect = powerEffect(id);
      expect(effect && isPokePower(effect) && (!!effect.use || !!effect.onPlayFromHand), id).toBe(true);
    }
  });
});

describe.each(Object.entries(CPUS))('%s CPU', (_, cpu) => {
  describe('Psychic Protector', () => {
    const asked = (damage: number) => {
      const s = duel('charmander', 'onix');
      put(s, 'ash', 'active', hitter(damage), ['fighting']);
      put(s, 'misty', 'active', flygon());
      misty(s).hand = [];
      potion(s);
      potion(s);
      junk(s);
      const after = attack(s, 0);
      expect(after.pendingChoice).toMatchObject({ kind: 'protector', player: 'misty' });
      return after;
    };

    it('pays the fewest cards that stop the Knock Out, the one it wants least first', () => {
      // 160 to 150 HP: 1 card leaves it Knocked Out, 2 don't.
      const { s } = answer(asked(160), cpu);
      expect(misty(s).active!.damage).toBe(140);
      expect(misty(s).discard.map((c) => s.cards[c.defId]!.name).sort()).toEqual(['Charizard', 'Potion']);
    });

    it("doesn't pay when the attack doesn't Knock Out", () => {
      const { s } = answer(asked(100), cpu);
      expect([misty(s).active!.damage, misty(s).discard.length]).toEqual([100, 0]);
    });

    it("doesn't pay when the cards it has (3) wouldn't stop it", () => {
      const { s } = answer(asked(200), cpu);
      expect(misty(s).discard.map((c) => s.cards[c.defId]!.name)).toEqual(['Flygon ex']);
    });
  });

  describe('Power Cancel', () => {
    const asked = (strong: boolean, cards: ('potion' | 'junk')[]) => {
      const s = duel('charmander', 'onix');
      if (strong) put(s, 'ash', 'active', mon('ex6-10', 'Pidgeot', C, 100, [], { stage: 'stage2', ...power('Quick Search') }));
      else put(s, 'ash', 'active', mon('dp2-6', 'Bronzong', 'metal', 90, [], { stage: 'stage1', ...power('Miracle Oracle') }));
      put(s, 'misty', 0, mon('dp2-2', 'Alakazam', P, 100, [], { stage: 'stage2', ...power('Power Cancel') }));
      misty(s).hand = [];
      for (const c of cards) (c === 'junk' ? junk : potion)(s);
      const after = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
      expect(after.pendingChoice).toMatchObject({ kind: 'powerCancel', player: 'misty' });
      return after;
    };

    it('pays against a strong power, with the 2 cards it wants least', () => {
      const { s } = answer(asked(true, ['potion', 'junk', 'potion']), cpu);
      expect(misty(s).discard.map((c) => s.cards[c.defId]!.name).sort()).toEqual(['Charizard', 'Potion']);
      // Quick Search did nothing: no search of Ash's deck is asked.
      expect(s.pendingChoice).toBeUndefined();
    });

    it('pays against any other power with 2 cards it doesn\'t want', () => {
      const { s } = answer(asked(false, ['potion', 'junk', 'junk']), cpu);
      expect(misty(s).discard.map((c) => s.cards[c.defId]!.name)).toEqual(['Charizard', 'Charizard']);
    });

    it("lets any other power work when it would have to discard a card it wants", () => {
      const { s, answers } = answer(asked(false, ['potion', 'junk', 'potion']), cpu);
      expect(answers).toEqual([{ type: 'RESOLVE_CHOICE' }]);
      expect([misty(s).discard.length, ash(s).active!.powerUsedTurn]).toEqual([0, s.turn]);
    });
  });

  describe('Power Spray', () => {
    const asked = (strong: boolean, sprays: number) => {
      const s = duel('charmander', 'onix');
      if (strong) put(s, 'ash', 'active', mon('ex6-10', 'Pidgeot', C, 100, [], { stage: 'stage2', ...power('Quick Search') }));
      else put(s, 'ash', 'active', mon('dp2-6', 'Bronzong', 'metal', 90, [], { stage: 'stage1', ...power('Miracle Oracle') }));
      // 3 Pokémon SP, so Power Spray can be played.
      put(s, 'misty', 'active', mon('sp-crobat', 'Crobat G', P, 80, []));
      put(s, 'misty', 0, mon('sp-luxray', 'Luxray GL', 'lightning', 90, []));
      put(s, 'misty', 1, mon('sp-garchomp', 'Garchomp C', C, 100, []));
      misty(s).hand = [];
      potion(s);
      for (let i = 0; i < sprays; i++) hand(s, 'misty', { id: 'pl1-117', kind: 'trainer', name: "Team Galactic's Invention G-103 Power Spray", imageUrl: null, text: '' });
      const after = act(s, 'ash', { type: 'USE_POWER', source: 'active', choices: {} });
      expect(after.pendingChoice).toMatchObject({ kind: 'powerCancel', spray: true, player: 'misty' });
      return after;
    };
    const sprayed = (s: GameState) => misty(s).discard.filter((c) => c.defId === 'pl1-117').length;

    it('is played against a strong power, even the last one', () => {
      const { s } = answer(asked(true, 1), cpu);
      expect([sprayed(s), s.pendingChoice]).toEqual([1, undefined]);
    });

    it('is kept against any other power when it is the last one', () => {
      const { s, answers } = answer(asked(false, 1), cpu);
      expect(answers).toEqual([{ type: 'RESOLVE_CHOICE' }]);
      expect(sprayed(s)).toBe(0);
    });

    it('is played against any other power with a second one in the hand', () => {
      const { s } = answer(asked(false, 2), cpu);
      expect([sprayed(s), misty(s).hand.filter((c) => c.defId === 'pl1-117').length]).toEqual([1, 1]);
    });
  });

  describe('a strong power used through its "use it?" question (Set Up)', () => {
    const benched = (by: 'cancel' | 'spray') => {
      const s = duel('charmander', 'onix');
      ash(s).hand = [];
      const uxie = hand(s, 'ash', mon('dp6-43', 'Uxie', P, 70, [], power('Set Up')));
      misty(s).hand = [];
      potion(s);
      if (by === 'cancel') {
        put(s, 'misty', 0, mon('dp2-2', 'Alakazam', P, 100, [], { stage: 'stage2', ...power('Power Cancel') }));
        potion(s);
      } else {
        put(s, 'misty', 'active', mon('sp-crobat', 'Crobat G', P, 80, []));
        put(s, 'misty', 0, mon('sp-luxray', 'Luxray GL', 'lightning', 90, []));
        put(s, 'misty', 1, mon('sp-garchomp', 'Garchomp C', C, 100, []));
        hand(s, 'misty', { id: 'pl1-117', kind: 'trainer', name: "Team Galactic's Invention G-103 Power Spray", imageUrl: null, text: '' });
      }
      const asked = act(act(s, 'ash', { type: 'PLAY_BENCH', cardUid: uxie, slot: 0 }), 'ash', { type: 'RESOLVE_CHOICE', count: 0 });
      expect(asked.pendingChoice).toMatchObject({ kind: 'powerCancel', player: 'misty' });
      return asked;
    };

    it('Power Cancel is paid, even with cards it wants', () => {
      const { s } = answer(benched('cancel'), cpu);
      expect([misty(s).discard.length, ash(s).hand.length]).toEqual([2, 0]);
    });

    it('its last Power Spray is played', () => {
      const { s } = answer(benched('spray'), cpu);
      expect([misty(s).discard.filter((c) => c.defId === 'pl1-117').length, ash(s).hand.length]).toEqual([1, 0]);
    });
  });

  describe('Charity Tail', () => {
    const asked = (cards: ('potion' | 'junk')[]) => {
      const s = duel('charmander', 'onix');
      put(s, 'ash', 'active', mon('dp2-3', 'Ambipom', C, 80, [['Tail Influence', [C], 30], ['Charity Tail', [C], 80]], { stage: 'stage1' }), ['grass']);
      put(s, 'misty', 'active', mon('big-Snorlax', 'Snorlax', C, 300, [['Tackle', [C], 10]]));
      misty(s).hand = [];
      for (const c of cards) (c === 'junk' ? junk : potion)(s);
      const after = attack(s, 1);
      expect(after.pendingChoice).toMatchObject({ kind: 'beforeAttack', question: 'discardTwo', player: 'misty' });
      return after;
    };

    it("discards 2 cards it doesn't want", () => {
      const { s } = answer(asked(['junk', 'potion', 'junk']), cpu);
      expect(misty(s).active!.damage).toBe(10);
      expect(misty(s).discard.map((c) => s.cards[c.defId]!.name)).toEqual(['Charizard', 'Charizard']);
    });

    it('declines rather than discard a card it wants', () => {
      const { s, answers } = answer(asked(['junk', 'potion', 'potion']), cpu);
      expect(answers).toEqual([{ type: 'RESOLVE_CHOICE' }]);
      expect([misty(s).active!.damage, misty(s).discard.length]).toEqual([80, 0]);
    });
  });
});
