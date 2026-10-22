// EX Deoxys (ex8) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Agreed with the user: Hard Protection stops Shelgon's own recoil and Confusion damage too; Intimidating Pattern and Lazy
// Aura reduce the damage to every one of their player's Pokémon, the Bench too (as Intimidating Fang).
// From the text: Form Change finds another Deoxys (a Deoxys ex another Deoxys ex), one Form Change a turn whichever Deoxys
// (`formChangeTurn`), the new one keeping everything on the old one, which is shuffled into the deck; Happy Dance is one a
// turn too; Wishing Star and Psychic Trace, Night Vision, Magnetic Reversal and Distortion work only as the Active Pokémon;
// Magnetic Reversal's Benched Pokémon is the player's pick (before the flip), Fan Action's the opponent's; Lightning Burst
// works when a Darkness Energy card is attached from the hand (the printed symbol; TCGdex leaves it out); Super Connectivity
// takes a Psychic or Metal Energy card (any providing either) and its damage counter may Knock Out; Empty Shell gives the
// opponent no Prize cards for Shedinja (engine.ts, knockOut).
import { isBasicEnergy, lookupCard, type CardLibrary } from '../cards.js';
import { activeLocked, counts, energyPool, isEnergyCardOf, type CardInstance, type Target } from '../engine.js';
import { discardsLocked, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { shuffle } from '../rng.js';
import { pokemonName } from '../status.js';
import { swapActive } from '../trainers.js';
import { ECARD2_POWERS } from './ecard2-powers.js';
import { ECARD3_POWERS } from './ecard3-powers.js';
import { EX1_POWERS } from './ex1-powers.js';
import { energyCardOf } from './ex2.js';
import { EX2_POWERS, freeRetreat, POKE_BODY } from './ex2-powers.js';
import { EX5_POWERS } from './ex5-powers.js';

/** Form Change: once a turn (whichever Deoxys), another `name` from the deck takes this one's place, with everything on it. */
export const formChange = (name: 'Deoxys' | 'Deoxys ex'): PowerEffect => ({
  blocked: (s) => (s.me.formChangeTurn === s.turn ? 'Form Change has already been used this turn' : s.counts.deck ? null : 'Your deck is empty'),
  use(ctx) {
    ctx.me.formChangeTurn = ctx.state.turn;
    ctx.pend({ kind: 'castform', source: 'Form Change', target: ctx.sourceTarget, names: [name], formChange: true });
  },
});

/** Once a turn, as its player's Active Pokémon, `then`. */
const asActive = (name: string, then: NonNullable<PowerEffect['use']>, blocked?: (s: PowerSituation) => string | null): PowerEffect => ({
  oncePerTurn: true,
  blocked: (s) => (s.source !== 'active' ? `${name} must be your Active Pokémon` : (blocked?.(s) ?? null)),
  use: then,
});

/** A basic Energy card of `type` (Dragon Aura). */
const isBasicEnergyOf = (cards: CardLibrary, e: CardInstance, type: 'fire' | 'lightning') => !e.provides && isBasicEnergy(lookupCard(cards, e.defId)) && isEnergyCardOf(e, cards, type);

/** The Psychic or Metal Energy cards in the discard pile (Super Connectivity). */
const connectable = (s: Pick<PowerSituation, 'me' | 'cards'>) => s.me.discard.filter((c) => energyCardOf(s.cards, c, 'psychic') || energyCardOf(s.cards, c, 'metal'));

export const EX8_POWERS: Record<string, PowerEffect> = {
  // Altaria – Safeguard.
  'ex8-1': EX2_POWERS['ex2-26']!,
  // Beautifly – Hunch: with 40 HP or less left, 40 more to the Defending Pokémon (attacks.ts).
  'ex8-2': { ...POKE_BODY, lowHpBoost: { hpLeft: 40, more: 40 } },
  // Claydol – Psychic Trace: once a turn, as the Active Pokémon, the hand shuffled into the deck, then as many cards drawn as the opponent has.
  'ex8-5': asActive('Claydol', (ctx) => {
    ctx.me.deck.push(...ctx.me.hand.splice(0));
    [ctx.me.deck, ctx.state.rngState] = shuffle(ctx.me.deck, ctx.state.rngState);
    const n = Math.min(ctx.opp.hand.length, ctx.me.deck.length);
    ctx.me.hand.push(...ctx.me.deck.splice(0, n));
    ctx.log(`Shuffled the hand into the deck and drew ${n} card${n === 1 ? '' : 's'}.`);
  }),
  // Crawdaunt – Dark Protection: 10 less from the opponent's attacks for each Darkness Energy attached, at most 20.
  'ex8-6': { ...POKE_BODY, energyProtection: { max: 20, type: 'darkness', oppOnly: true } },
  // Jirachi – Wishing Star: once a turn, as the Active Pokémon, one of the top 5 cards into the hand (the rest shuffled back); then Jirachi is Asleep.
  'ex8-9': asActive(
    'Jirachi',
    (ctx) => {
      ctx.pend({ kind: 'pickFromTop', source: 'Wishing Star', looked: ctx.me.deck.slice(0, 5).map((c) => c.uid), take: 1, shuffleRest: true });
      ctx.source.condition = 'asleep';
      delete ctx.source.paralyzedTurn;
      ctx.log(`${pokemonName(ctx.state, ctx.source)} is now Asleep.`);
    },
    (s) => (s.counts.deck ? null : 'Your deck is empty'),
  ),
  // Ludicolo – Swing Dance: once a turn, a card drawn.
  'ex8-10': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const [card] = ctx.me.deck.splice(0, 1);
      if (card) ctx.me.hand.push(card);
      ctx.log('Drew a card.');
    },
  },
  // Metagross – Super Connectivity: once a turn, a Psychic or Metal Energy card from the discard pile to the Active Pokémon, then a damage counter on it.
  'ex8-11': {
    oncePerTurn: true,
    blocked: (s) => (!s.me.active ? 'You have no Active Pokémon' : discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : connectable(s).length ? null : 'No Psychic or Metal Energy cards in your discard pile'),
    choices: (s) => [{ kind: 'discardCard', field: 'cardUid', options: connectable(s), prompt: 'Choose a Psychic or Metal Energy card from your discard pile' }],
    use(ctx) {
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.cardUid);
      const active = ctx.me.active;
      if (!card || !active) return;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      active.energy.push(card);
      active.damage += 10;
      ctx.log(`Attached ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, active)} and put a damage counter on it.`);
    },
  },
  // Ninjask – Fast Protection: attacks by the opponent's Basic Pokémon don't affect it.
  'ex8-13': { ...POKE_BODY, basicProof: true },
  // Shedinja – Empty Shell (engine.ts).
  'ex8-14': { ...POKE_BODY, noPrizes: true },
  // Slaking – Lazy Aura: as the Active Pokémon, 30 less from the opponent's Pokémon-ex, before Weakness and Resistance (attacks.ts).
  'ex8-15': { ...POKE_BODY, exAura: 30 },
  // Deoxys (Normal, Attack, Defense), Deoxys ex – Form Change.
  'ex8-16': formChange('Deoxys'),
  'ex8-17': formChange('Deoxys'),
  'ex8-18': formChange('Deoxys'),
  'ex8-97': formChange('Deoxys ex'),
  'ex8-98': formChange('Deoxys ex'),
  'ex8-99': formChange('Deoxys ex'),
  // Ludicolo – Happy Dance: once a turn (whichever Ludicolo), a damage counter off each of the player's Pokémon.
  'ex8-19': {
    blocked: (s) => (s.me.happyDanceTurn === s.turn ? 'Happy Dance has already been used this turn' : ownTargets(s.me).some((t) => pokemonAt(s.me, t)!.damage > 0) ? null : 'None of your Pokémon has damage counters'),
    use(ctx) {
      ctx.me.happyDanceTurn = ctx.state.turn;
      for (const t of ownTargets(ctx.me)) {
        const p = pokemonAt(ctx.me, t)!;
        if (p.damage) p.damage -= 10;
      }
      ctx.log('Removed a damage counter from each of your Pokémon.');
    },
  },
  // Magcargo – Smooth Over: once a turn, a card from the deck goes on top of it, once it's shuffled.
  'ex8-20': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Smooth Over', filter: 'any', toTop: true }),
  },
  // Rayquaza – Dragon Aura: with basic Fire and basic Lightning Energy cards attached, the opponent's attacks do nothing to it but damage.
  'ex8-22': {
    ...POKE_BODY,
    crystalBodyWhen: (pokemon, cards) => (['fire', 'lightning'] as const).every((t) => pokemon.energy.some((e) => isBasicEnergyOf(cards, e, t))),
  },
  // Sableye – Night Vision: once a turn, as the Active Pokémon, the opponent's hand looked at.
  'ex8-23': asActive('Sableye', (ctx) => ctx.pend({ kind: 'lookOppHand', source: 'Night Vision' })),
  // Shiftry – Fan Action: once a turn, the opponent switches their Active Pokémon with a Benched one (their pick).
  'ex8-25': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.bench.some(Boolean) ? null : 'Your opponent has no Benched Pokémon'),
    use(ctx) {
      const slots = ctx.opp.bench.flatMap((p, i) => (p ? [i] : []));
      const locked = activeLocked(ctx.state, ctx.opp.id);
      if (locked) return ctx.log(locked);
      if (slots.length === 1) return swapActive(ctx.state, ctx.opp, slots[0]!);
      ctx.state.pendingChoice = { player: ctx.opp.id, source: 'Fan Action', kind: 'switchIn' };
    },
  },
  // Skarmory – Metallic Lift, Lombre – Aqua Lift: with Energy of its type attached, its Retreat Cost is 0.
  'ex8-26': freeRetreat((pokemon, cards) => energyPool(pokemon, cards).some((e) => counts(e, 'metal'))),
  'ex8-33': freeRetreat((pokemon, cards) => energyPool(pokemon, cards).some((e) => counts(e, 'water'))),
  // Tropius – Tropical Motion: as the Active Pokémon, the opponent's Pokémon have no Resistance (attacks.ts).
  'ex8-27': { ...POKE_BODY, tropicalMotion: true },
  // Xatu, Natu – Mirror Coat.
  'ex8-29': ECARD3_POWERS['ecard3-45']!,
  'ex8-66': ECARD3_POWERS['ecard3-45']!,
  // Golbat, Zubat – Self-control: it can't be Paralyzed. Grumpig – Carefree: it can't be Confused.
  'ex8-31': { ...POKE_BODY, immuneTo: ['paralyzed'] },
  'ex8-83': { ...POKE_BODY, immuneTo: ['paralyzed'] },
  'ex8-32': { ...POKE_BODY, immuneTo: ['confused'] },
  // Lombre – Natural Cure (Water).
  'ex8-34': EX1_POWERS['ex1-41']!,
  // Lunatone – Moonglow: the player's Solrock retreat for free.
  'ex8-36': { ...POKE_BODY, familyBonds: ['Solrock'] },
  // Masquerain – Intimidating Pattern: as the Active Pokémon, 20 less from the opponent's attacks to any of its player's Pokémon (agreed).
  'ex8-39': { ...POKE_BODY, intimidatingFang: 20 },
  // Nosepass – Magnetic Reversal: once a turn, as the Active Pokémon, heads switches one of the opponent's Benched Pokémon (the player's pick) in.
  'ex8-42': {
    oncePerTurn: true,
    blocked: (s) => (s.source !== 'active' ? 'Nosepass must be your Active Pokémon' : s.opp.bench.some(Boolean) ? null : 'Your opponent has no Benched Pokémon'),
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppFrom', options: ownTargets(s.opp).filter((t) => t !== 'active'), prompt: "Choose one of your opponent's Benched Pokémon to switch in (on heads)" }],
    use(ctx) {
      const slot = ctx.choices.oppFrom;
      if (typeof slot !== 'number' || !ctx.opp.bench[slot]) return;
      if (!ctx.flip()) return ctx.log('Magnetic Reversal did nothing.');
      const locked = activeLocked(ctx.state, ctx.opp.id);
      if (locked) return ctx.log(locked);
      swapActive(ctx.state, ctx.opp, slot);
    },
  },
  // Shelgon – Hard Protection (attacks.ts).
  'ex8-45': { ...POKE_BODY, hardProtection: true },
  // Solrock – Sunbeam: the player's Lunatone have 80 HP (refreshHideout).
  'ex8-47': { ...POKE_BODY, hpOf: { name: 'Lunatone', hp: 80 } },
  // Starmie – Core Guard: as Hidden Legends Staryu's.
  'ex8-48': EX5_POWERS['ex5-75']!,
  // Vigoroth – Vigorous Aura: as the Active Pokémon, each Active Pokémon's attacks do 10 more to the Active Pokémon (attacks.ts).
  'ex8-50': { ...POKE_BODY, vigorousAura: 10 },
  // Corphish – Exoskeleton: 10 less attack damage.
  'ex8-57': { ...POKE_BODY, damageReduction: 10 },
  // Numel – Dense: 20 less from Evolved Pokémon's attacks, either player's.
  'ex8-68': { ...POKE_BODY, evolvedGuard: 20 },
  // Swablu – Fluff.
  'ex8-79': ECARD2_POWERS['ecard2-17']!,
  // Crobat ex – Distortion: once a turn, as the Active Pokémon, a damage counter on one of the opponent's Pokémon.
  'ex8-96': asActive('Crobat ex', (ctx) => ctx.pend({ kind: 'placeCounters', source: 'Distortion', count: 1, active: true })),
  // Hariyama ex – Commanding Aura: as the Active Pokémon, the opponent can't play Stadium cards (trainerError).
  'ex8-100': { ...POKE_BODY, commandingAura: true },
  // Rayquaza ex – Dragon Boost: put onto the Bench from the hand, its owner may move basic Energy cards from their other Pokémon to it.
  'ex8-102': {
    onPlayFromHand(state, owner, pokemon) {
      const slot = owner.bench.indexOf(pokemon);
      if (slot >= 0) state.pendingChoice = { player: owner.id, source: 'Dragon Boost', kind: 'mayUse', power: 'dragonBoost', target: slot as Target };
    },
  },
  // Salamence ex – Dragon Lift: the player's Pokémon (not Pokémon-ex or Baby Pokémon) retreat for free (retreatBodies).
  'ex8-103': { ...POKE_BODY, freeRetreatAll: true },
  // Rocket's Raikou ex – Lightning Burst: a Darkness Energy card attached to it from the hand lets its owner have the opponent switch their Active Pokémon.
  'ex8-108': {
    onEnergyFromHand(state, owner, _pokemon, target, energy) {
      if (!energyCardOf(state.cards, energy, 'darkness')) return;
      state.pendingChoice = { player: owner.id, source: 'Lightning Burst', kind: 'mayUse', power: 'lightningBurst', target };
    },
  },
};
