// Platinum (pl1) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Several are the engine's own rules, named by a flag: Damage Bind and Time Crystal (auraStops), Time Aura (evolution's
// checks), Electric Barrier, Camouflage Pattern and Armor Stone (attacks.ts), Iron Skull (Rampardos's attacks), Lazy
// Paunch and Cold Feet (attackError), Sinkhole (RETREAT), Thankfulness (refreshHideout). The powers that work as their
// Pokémon is put onto the Bench are asked then (mayUse): Reverse Time, Let Loose, Flash Bite.
// From the text: Dig Well's Water Energy cards are any Energy cards of the type, each attached to the Pokémon clicked; Power
// Circulation's and Reverse Time's cards go on top in the order the player puts them, its damage counters put as it's used;
// Temper Tantrum discards the cards picked, one at a time (the player may stop), a damage counter on Banette for each; Nurse
// Call is once a turn for the player, whichever Blissey; Galactic Switch moves an Energy card from a Pokémon SP to any other of
// the player's Pokémon; Tri-Poison's Poison is 3 damage counters between turns; Lost Cyclone asks each player with 4 or more
// Benched Pokémon which 3 to keep, the player first.
import { isBasicEnergy, lookupCard } from '../cards.js';
import { afflictBetweenTurns, counts, energyPool, type Target } from '../engine.js';
import { discardsLocked, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, inPlayDef, pokemonName } from '../status.js';
import { isPokemonSP } from '../trainers.js';
import { POKE_BODY } from './common.js';
import { DP3_POWERS } from './dp3-powers.js';
import { onBench } from './dp5-powers.js';
import { DPP_POWERS } from './dpp-powers.js';
import { babyEvolution } from './ex2-powers.js';
import { EX3_POWERS } from './ex3-powers.js';
import { energyCardOf } from './ex2.js';

const usedThisTurn = (s: PowerSituation, name: string) => ((s.me.powerTurns?.[name] ?? -1) >= s.turn ? `You already used ${name} this turn` : null);
/** The player's Pokémon with damage counters on them. */
const damaged = (s: PowerSituation): Target[] => ownTargets(s.me).filter((t) => pokemonAt(s.me, t)!.damage > 0);

export const PL1_POWERS: Record<string, PowerEffect> = {
  // Ampharos – Damage Bind: Pokémon with damage counters on them (both players') can't use Poké-Powers (auraStops).
  'pl1-1': { ...POKE_BODY, damageBind: true },
  // Blastoise – Dig Well: the top 3 cards, any Water Energy cards among them attached to the player's Pokémon, the rest discarded.
  'pl1-2': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const looked = ctx.me.deck.slice(0, 3);
      ctx.log(`Dig Well: looked at the top ${looked.length} cards of the deck.`);
      ctx.pend({ kind: 'pickFromTop', source: 'Dig Well', looked: looked.map((c) => c.uid), take: looked.length, basicEnergy: true, energyType: 'water', anyTarget: true, discardRest: true });
    },
  },
  // Blaziken – Fire Breath: one of the Defending Pokémon is now Burned.
  'pl1-3': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.active ? null : 'Your opponent has no Active Pokémon'),
    use(ctx) {
      if (ctx.opp.active) afflictBetweenTurns(ctx.state, ctx.opp.id, ctx.opp.active, 'burned');
    },
  },
  // Delcatty – Power Circulation: up to 2 basic Energy cards from the discard pile on top of the deck, then 2 damage counters on it.
  'pl1-4': {
    oncePerTurn: true,
    blocked: (s) => (s.me.discard.some((c) => isBasicEnergy(lookupCard(s.cards, c.defId))) ? null : 'You have no basic Energy cards in your discard pile'),
    use(ctx) {
      if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
      ctx.pend({ kind: 'discardToDeck', source: 'Power Circulation', count: 2, of: 2, filter: 'basicEnergy', toTop: true });
      ctx.source.damage += 20;
      ctx.log(`Put 2 damage counters on ${pokemonName(ctx.state, ctx.source)}.`);
    },
  },
  // Dialga – Reverse Time: as it's benched from the hand, up to 3 Pokémon (not LV.X) and basic Energy cards from the discard pile on top of the deck.
  'pl1-5': onBench('reverseTime', 'Reverse Time'),
  // Dialga – Time Aura: as the Active Pokémon, the opponent can't evolve their Active Pokémon from the hand.
  'pl1-6': { ...POKE_BODY, timeAura: true },
  // Gardevoir – Psychic Connect: any number of times, a Psychic Energy card moved from a Benched Pokémon to the Active Pokémon.
  'pl1-8': {
    blocked: (s) => (s.me.active && s.me.bench.some((p) => p?.energy.some((e) => energyCardOf(s.cards, e, 'psychic'))) ? null : 'None of your Benched Pokémon has a Psychic Energy card'),
    choices(s, c) {
      const from = typeof c.from === 'number' ? pokemonAt(s.me, c.from) : null;
      return [
        { kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => t !== 'active' && pokemonAt(s.me, t)!.energy.some((e) => energyCardOf(s.cards, e, 'psychic'))), prompt: 'Choose one of your Benched Pokémon to move a Psychic Energy card from' },
        ...(from ? [{ kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: from.energy.filter((e) => energyCardOf(s.cards, e, 'psychic')), prompt: 'Choose the Psychic Energy card to move to your Active Pokémon' }] : []),
      ];
    },
    use(ctx) {
      const from = typeof ctx.choices.from === 'number' ? ctx.me.bench[ctx.choices.from] : null;
      const card = from?.energy.find((e) => e.uid === ctx.choices.energyUid);
      const to = ctx.me.active;
      if (!from || !card || !to) return;
      from.energy = from.energy.filter((e) => e !== card);
      to.energy.push(card);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, to)}.`);
    },
  },
  // Giratina – Let Loose: as it's benched from the hand, each player shuffles their hand into their deck and draws up to 4, the player first.
  'pl1-9': onBench('letLoose', 'Let Loose'),
  // Manectric – Electric Barrier: no attack damage to its player's Benched Pokémon but Manectric (attacks.ts).
  'pl1-11': { ...POKE_BODY, electricBarrier: true },
  // Rampardos – Iron Skull: its attacks' damage is changed by nothing on the Defending Pokémon but Weakness (pl1.ts).
  'pl1-13': { ...POKE_BODY, ironSkull: true },
  // Slaking – Lazy Paunch: it can't attack if it attacked during its player's last turn (attackError).
  'pl1-16': { ...POKE_BODY, lazyPaunch: true },
  // Banette – Temper Tantrum: any cards discarded from the hand, a damage counter on Banette for each.
  'pl1-19': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.length ? null : 'Your hand is empty'),
    use: (ctx) => ctx.pend({ kind: 'discardFromHand', source: 'Temper Tantrum', count: ctx.me.hand.length, upTo: true, countersOn: ctx.sourceTarget }),
  },
  // Bastiodon – Metal Trait: with a Pokémon Tool attached, a damage counter off it between turns.
  'pl1-20': {
    ...POKE_BODY,
    checkup(state, owner, pokemon) {
      if (!pokemon.damage || !(pokemon.attached ?? []).some((a) => a.tool)) return;
      pokemon.damage -= 10;
      addLog(state, `Metal Trait removed a damage counter from ${pokemonName(state, pokemon)}.`, owner.id);
    },
  },
  // Blissey – Nurse Call: a card discarded from the hand, 2 damage counters off one of the player's Pokémon (one Nurse Call a turn).
  'pl1-22': {
    oncePerTurn: true,
    blocked: (s) => usedThisTurn(s, 'Nurse Call') ?? (!s.me.hand.length ? 'Your hand is empty' : damaged(s).length ? null : 'None of your Pokémon has damage counters'),
    choices: (s) => [
      { kind: 'handCard', field: 'cardUid', options: s.me.hand, prompt: 'Nurse Call: choose a card to discard from your hand' },
      { kind: 'ownPokemon', field: 'to', options: damaged(s), prompt: 'Nurse Call: choose one of your Pokémon to remove 2 damage counters from' },
    ],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      const to = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      if (!card || !to) return;
      ctx.me.powerTurns = { ...ctx.me.powerTurns, 'Nurse Call': ctx.state.turn };
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      ctx.me.discard.push(card);
      const healed = Math.min(20, to.damage);
      to.damage -= healed;
      ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name}; removed ${healed / 10} damage counter${healed === 10 ? '' : 's'} from ${pokemonName(ctx.state, to)}.`);
    },
  },
  // Dugtrio – Sinkhole: when the opponent's Active Pokémon retreats, 2 damage counters on it (RETREAT).
  'pl1-24': { ...POKE_BODY, sinkholeCounters: true },
  // Dustox – Camouflage Pattern: nothing from an attacker with 2 or more Special Conditions (attacks.ts).
  'pl1-25': { ...POKE_BODY, camouflagePattern: true },
  // Toxicroak G – Anticipation: as Secret Wonders Wormadam Sandy Cloak's Sandy Cloak (Crystal Body).
  'pl1-40': DP3_POWERS['dp3-42']!,
  // Bronzong G – Galactic Switch: an Energy card moved from a Pokémon SP to another of the player's Pokémon, then 2 damage counters on Bronzong G.
  'pl1-41': {
    oncePerTurn: true,
    blocked: (s) => (spDonors(s).length && ownTargets(s.me).length > 1 ? null : 'None of your Pokémon SP has an Energy card attached'),
    choices(s, c) {
      const from = c.from === undefined ? null : pokemonAt(s.me, c.from);
      return [
        { kind: 'ownPokemon', field: 'from', options: spDonors(s), prompt: 'Galactic Switch: choose one of your Pokémon SP to move an Energy card from' },
        ...(from ? [{ kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: from.energy.filter((e) => !e.provides), prompt: 'Choose the Energy card to move' }] : []),
        ...(from ? [{ kind: 'ownPokemon' as const, field: 'to' as const, options: ownTargets(s.me).filter((t) => t !== c.from), prompt: 'Choose the Pokémon to move it to' }] : []),
      ];
    },
    use(ctx) {
      const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const to = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      const card = from?.energy.find((e) => e.uid === ctx.choices.energyUid);
      if (!from || !to || !card || from === to) return;
      from.energy = from.energy.filter((e) => e !== card);
      to.energy.push(card);
      ctx.source.damage += 20;
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, to)}; 2 damage counters on ${pokemonName(ctx.state, ctx.source)}.`);
    },
  },
  // Crobat G – Flash Bite: as it's benched from the hand, a damage counter on one of the opponent's Pokémon.
  'pl1-47': onBench('flashBite', 'Flash Bite'),
  // Mightyena – Cold Feet: with a Special Condition, its attacks need no Energy (attackError).
  'pl1-54': { ...POKE_BODY, coldFeet: true },
  // Muk – Sludge Cell: still with a Special Condition between turns, 2 damage counters off it.
  'pl1-57': {
    ...POKE_BODY,
    checkup(state, owner, pokemon) {
      if (!pokemon.damage || !(pokemon.condition || pokemon.poison || pokemon.burned)) return;
      const healed = Math.min(20, pokemon.damage);
      pokemon.damage -= healed;
      addLog(state, `Sludge Cell removed ${healed / 10} damage counter${healed === 10 ? '' : 's'} from ${pokemonName(state, pokemon)}.`, owner.id);
    },
  },
  // Zangoose – Thick Skin: as EX Dragon Seviper's.
  'pl1-66': EX3_POWERS['ex3-9']!,
  // Happiny – Baby Evolution.
  'pl1-76': babyEvolution('Chansey'),
  // Skuntank G – Poison Structure: with a Stadium in play, each Active Pokémon (not a Pokémon SP) is now Poisoned.
  'pl1-94': {
    oncePerTurn: true,
    blocked: (s) => (s.stadium ? null : 'There is no Stadium card in play'),
    use(ctx) {
      for (const side of [ctx.me, ctx.opp]) {
        const p = side.active;
        if (p && !isPokemonSP(inPlayDef(ctx.state.cards, p).name)) afflictBetweenTurns(ctx.state, side.id, p, 'poisoned');
      }
    },
  },
  // Armor Fossil – Armor Stone: coins until tails, 10 less damage from the opponent's attack for each heads (attacks.ts).
  'pl1-119': { ...POKE_BODY, armorStone: true },
  // Skull Fossil – Skull Stone: Knocked Out by the opponent's attack damage, coins until tails, a damage counter on the attacker for each heads.
  'pl1-120': {
    ...POKE_BODY,
    onAttackDamage(ctx, pokemon) {
      if (pokemon.damage < inPlayDef(ctx.state.cards, pokemon).hp || !ctx.me.active) return;
      let heads = 0;
      while (heads < 60 && ctx.oppFlip()) heads++;
      if (!heads) return;
      ctx.me.active.damage += 10 * heads;
      ctx.log(`Skull Stone: ${heads} damage counter${heads === 1 ? '' : 's'} on ${pokemonName(ctx.state, ctx.me.active)}.`);
    },
  },
  // Dialga G LV.X – Time Crystal: no Pokémon but Pokémon SP (both players') can use Poké-Bodies (auraStops).
  'pl1-122': { ...POKE_BODY, timeCrystal: true },
  // Drapion LV.X – Tri-Poison: heads, the Defending Pokémon is Poisoned, 3 damage counters between turns.
  'pl1-123': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.active ? null : 'Your opponent has no Active Pokémon'),
    use(ctx) {
      const p = ctx.opp.active;
      if (!p || !ctx.flip()) return;
      afflictBetweenTurns(ctx.state, ctx.opp.id, p, 'poisoned');
      if (p.poison) p.poison = Math.max(p.poison, 30);
    },
  },
  // Giratina LV.X – Invisible Tentacles: as the DP Black Star Promo's.
  'pl1-124': DPP_POWERS['dpp-DP38']!,
  // Palkia G LV.X – Lost Cyclone: each player with 4 or more Benched Pokémon keeps 3; the others go to the Lost Zone.
  'pl1-125': {
    oncePerTurn: true,
    blocked: (s) => ([s.me, s.opp].some((side) => side.bench.filter(Boolean).length >= 4) ? null : 'No player has 4 or more Benched Pokémon'),
    use(ctx) {
      const [first, ...rest] = [ctx.me, ctx.opp].filter((side) => side.bench.filter(Boolean).length >= 4);
      if (!first) return;
      ctx.state.pendingChoice = { player: first.id, source: 'Lost Cyclone', kind: 'lostCyclone', kept: [], ...(rest[0] && { then: rest[0].id }) };
    },
  },
  // Ludicolo – Cheerful Voice: the turn ends; its attacks do 60 more to the Defending Pokémon next turn (attacks.ts).
  'pl1-34': {
    oncePerTurn: true,
    use(ctx) {
      (ctx.source.effects ??= {}).cheerfulVoice = ctx.state.turn + 2;
      ctx.log(`${pokemonName(ctx.state, ctx.source)}'s attacks do 60 more damage next turn. The turn ends.`);
      ctx.state.endTurnNow = true;
    },
  },
  // Shaymin LV.X – Thankfulness: its player's Grass Pokémon but Shaymin get 40 more HP (one Thankfulness; refreshHideout).
  'pl1-126': { ...POKE_BODY, thankfulness: true },
  // Shaymin LV.X – Revenge Seed: as the DP Black Star Promo's.
  'pl1-127': DPP_POWERS['dpp-DP39']!,
  // Lotad – Swift Swim: no Retreat Cost with a Water Energy attached.
  'pl1-SH4': { ...POKE_BODY, retreatChange: (p, cards) => (energyPool(p, cards).some((e) => counts(e, 'water')) ? -99 : 0) },
};

/** The player's Pokémon SP with an Energy card attached (Galactic Switch). */
const spDonors = (s: PowerSituation): Target[] => ownTargets(s.me).filter((t) => {
  const p = pokemonAt(s.me, t)!;
  return isPokemonSP(inPlayDef(s.cards, p).name) && p.energy.some((e) => !e.provides);
});
