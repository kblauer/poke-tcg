// Gym Challenge (gym2) Pokémon Powers, by card id. Powers that are used stop working while their Pokémon is Asleep,
// Confused or Paralyzed (checked in powerError); the rest are flags the engine checks with powerActive, which also
// handles Toxic Gas.
// Rulings: Shapeshift attaches an Evolution card from the hand to Brock's Ninetales once a turn, and it's treated as
// that card (inPlayDef, usableAttacks) but keeps Shapeshift; attaching another replaces it; clicking it discards the card
// (DISCARD_SHAPESHIFT), and it's discarded as soon as Brock's Ninetales is Asleep, Confused or Paralyzed. Emerge, like
// Rapid Evolution, has no evolution limits besides what stops evolving. Energy Drain's owner picks the Energy card.
// Gaseous Form's HP are in inPlayDef (it sees no Toxic Gas there).
import { isPokemonCard, lookupCard } from '../cards.js';
import { discardShapeshift, isEnergyCardOf, type CardInstance, type Target } from '../engine.js';
import { energyKept, evolutionBlocked, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, flipCoin, pokemonName } from '../status.js';

const at = (s: PowerSituation, t: Target) => pokemonAt(s.me, t)!;

/** Evolution cards in the hand (Shapeshift). */
const evolutionCards = (s: PowerSituation) =>
  s.me.hand.filter((c) => {
    const d = lookupCard(s.cards, c.defId);
    return isPokemonCard(d) && d.stage !== 'basic';
  });

/** Soak Up: the player's other Pokémon with a Grass Energy card attached. */
const grassSources = (s: PowerSituation): Target[] => ownTargets(s.me).filter((t) => t !== s.source && at(s, t).energy.some((e) => isEnergyCardOf(e, s.cards, 'grass')));

export const GYM2_POWERS: Record<string, PowerEffect> = {
  // Brock's Ninetales – Shapeshift (see the rulings above).
  'gym2-3': {
    oncePerTurn: true,
    blocked: (s) => (evolutionCards(s).length ? null : 'You have no Evolution cards in your hand'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: evolutionCards(s), prompt: "Choose an Evolution card from your hand to attach to Brock's Ninetales" }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid)!;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      discardShapeshift(ctx.state, ctx.me, ctx.source);
      (ctx.source.attached ??= []).push({ card, until: Number.MAX_SAFE_INTEGER, shapeshift: true });
      ctx.log(`Brock's Ninetales is now treated as ${lookupCard(ctx.state.cards, card.defId).name}.`);
    },
  },

  // Giovanni's Machamp – Fortitude: an opponent's attack that would Knock it Out leaves it with 10 HP on heads (attacks.ts).
  'gym2-6': { fortitude: true },

  // Giovanni's Persian – Call the Boss: when played from the hand, you may take the Trainer card Giovanni from your deck.
  'gym2-8': {
    onPlayFromHand(state, owner) {
      if (!owner.deck.length) return;
      state.pendingChoice = { player: owner.id, source: 'Call the Boss', kind: 'pickFromDeck', filter: 'trainerNamed', name: 'Giovanni', reveal: true, optional: true };
    },
  },

  // Misty's Gyarados – Rebellion: whenever it attacks, 2 tails and it's shuffled into the deck instead (attacks.ts). It works while Confused.
  'gym2-13': { rebellion: true, ignoresConditions: true },

  // Sabrina's Alakazam – Psylink: a copy of every attack of your other Psychic Pokémon in play (usableAttacks).
  'gym2-16': { psylink: true },

  // Blaine's Ninetales – Healing Fire: attaching a Fire Energy card from the hand to it removes 1 damage counter.
  'gym2-21': {
    onEnergyFromHand(state, owner, ninetales, _target, energy) {
      if (!isEnergyCardOf(energy, state.cards, 'fire') || ninetales.damage < 10) return;
      ninetales.damage -= 10;
      addLog(state, `Healing Fire removed a damage counter from ${pokemonName(state, ninetales)}.`, owner.id);
    },
  },

  // Koga's Muk – Energy Drain: when an opponent's attack damages it (even a Knock Out), flip; heads discards 1 Energy card from the attacker.
  'gym2-26': {
    onAttackDamage(ctx, muk) {
      if (!flipCoin(ctx.state, 'Energy Drain', ctx.opp.id)) return;
      const energy = ctx.attacker.energy.filter((e) => !e.provides);
      if (!energy.length) return;
      if (energyKept(ctx.me, [ctx.me, ctx.opp], ctx.state.cards, ctx.attacker)) return addLog(ctx.state, `[Keep]: ${ctx.attackerDef.name}'s Energy cards can't be discarded.`, ctx.me.id);
      // Identical cards need no choice; otherwise Muk's owner picks once the attack is over.
      if (new Set(energy.map((e) => e.defId)).size > 1) {
        (ctx.state.queuedChoices ??= []).push({ player: ctx.opp.id, source: 'Energy Drain', kind: 'drainEnergy' });
        return;
      }
      ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== energy[0]);
      ctx.me.discard.push(energy[0]!);
      addLog(ctx.state, `Energy Drain (${pokemonName(ctx.state, muk)}): discarded ${lookupCard(ctx.state.cards, energy[0]!.defId).name} from ${ctx.attackerDef.name}.`, ctx.me.id);
    },
  },

  // Brock's Primeape – Scram: with exactly 10 HP left, it's shuffled into the deck (engine.ts, resolveKnockouts).
  'gym2-35': { scram: true },

  // Erika's Bellsprout – Soak Up: once during your turn, take up to 2 Grass Energy cards from your other Pokémon.
  'gym2-38': {
    oncePerTurn: true,
    blocked: (s) => (grassSources(s).length ? null : 'None of your other Pokémon have Grass Energy cards'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'from', options: grassSources(s), prompt: 'Take a Grass Energy card from' }],
    use(ctx) {
      const from = pokemonAt(ctx.me, ctx.choices.from!)!;
      const energy = from.energy.find((e) => isEnergyCardOf(e, ctx.state.cards, 'grass'))!;
      from.energy = from.energy.filter((e) => e !== energy);
      ctx.source.energy.push(energy);
      ctx.log(`Moved a Grass Energy card from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, ctx.source)}.`);
      const more = ownTargets(ctx.me).some((t) => t !== ctx.sourceTarget && pokemonAt(ctx.me, t)!.energy.some((e: CardInstance) => isEnergyCardOf(e, ctx.state.cards, 'grass')));
      if (more) ctx.pend({ kind: 'soakUp', source: 'Soak Up', to: ctx.sourceTarget });
    },
  },

  // Erika's Ivysaur – Relaxing Scent: while it's an Active Pokémon, attack damage to any Pokémon is halved, rounded up (attacks.ts).
  'gym2-41': { relaxingScent: true },

  // Koga's Kakuna – Emerge: once during your turn, flip; heads evolves it with Koga's Beedrill from your deck.
  'gym2-47': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? evolutionBlocked([s.me, s.opp], s.cards) : 'Your deck is empty'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Emerge did nothing.');
      ctx.pend({ kind: 'evolveFromDeck', source: 'Emerge', target: ctx.sourceTarget, names: ["Koga's Beedrill"] });
    },
  },

  // Lt. Surge's Electrode – Shock Blast: when an attack damages it as the Active Pokémon (even a Knock Out), flip; tails does 20 to each Active Pokémon.
  'gym2-52': {
    ignoresConditions: true,
    onAttackDamage(ctx, electrode) {
      if (ctx.opp.active !== electrode || flipCoin(ctx.state, 'Shock Blast', ctx.opp.id)) return;
      ctx.attacker.damage += 20;
      electrode.damage += 20;
      addLog(ctx.state, `Shock Blast did 20 damage to ${ctx.attackerDef.name} and ${pokemonName(ctx.state, electrode)}.`, ctx.opp.id);
    },
  },

  // Sabrina's Gastly – Gaseous Form: 10 more HP per Psychic Energy card attached (inPlayDef). It works whatever its condition.
  'gym2-97': { ignoresConditions: true },
};
