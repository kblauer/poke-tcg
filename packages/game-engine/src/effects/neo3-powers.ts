// Neo Revelation (neo3) Pokémon Powers, by card id. `text` and `name` have the printed wording where TCGdex's is missing
// or differs (Parasect's Allergic Pollen has neither there; Energy Converter's "end is your turn"; Unown B's power loses
// its letter).
// Rulings (agreed): Legendary Body keeps every Trainer card, either player's, but Stadiums from affecting the Active Entei,
// Raikou or Suicune and its Energy: it can't be chosen (Potion, Energy Removal, PlusPower, Pokémon Tools…), switched
// (Switch, Gust of Wind, Double Gust, Warp Point) or otherwise changed (Full Heal, Sleep!, Digger, Pokémon Center, Erika's
// Kindness…), and any Trainer card attached to it is discarded; it works while Asleep, Confused or Paralyzed, as printed.
// Rulings (from the text): Softboiled asks whether to flip, as Herbal Scent does. Howl works when Entei is played from the
// hand onto the Bench; using it ends the turn, even if no Fire Energy cards turn up. Time Travel flips when an opponent's
// attack would Knock Celebi Out (Bench damage too); heads, it's shuffled into the deck with every card attached once the
// attack is over, and no Prize card is taken. Energy Converter's Energy is that type until the end of the turn (attack
// costs, Energy-type checks), and goes back once Porygon2 has any Special Condition or leaves play. Lightning Burst
// works on a Lightning Energy card (Rainbow Energy too) attached from the hand; the opponent picks the Pokémon that comes in.
// Crystal Body stops everything an opponent's attack does to Suicune as the Active Pokémon but its damage (Special
// Conditions, switching, Energy discards, damage counters put on it). Prehistoric Memory lets every Evolved Pokémon in play,
// both players', use the attacks of the cards it evolved from, as Recall does. Mimic gives Sudowoodo the Defending
// Pokémon's attacks besides Slam, with their costs and effects. Submerge makes Lanturn a Water Pokémon until the end of the
// turn. Magma Pool moves a Fire Energy card (not one used to retreat) whenever Magcargo goes from the Active spot to the
// Bench, by any effect. Allergic Pollen stops every attack and Pokémon Power from taking or using cards in either discard
// pile, while Parasect is in play and its power works. Hard Shell makes 20 to 40 damage 10 (10 or less stays). Unown B and Y
// work while Asleep, Confused or Paralyzed (as printed); Unown K's Keep doesn't.
import { isBasicEnergy, lookupCard } from '../cards.js';
import { isEnergyCardOf, type Target } from '../engine.js';
import { ownTargets, pokemonAt, type PowerChoiceSpec, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, countersMoved, inPlayDef, pokemonName } from '../status.js';
import { swapActive, type PendingChoice } from '../trainers.js';
import { targetOf } from './common.js';
import { TYPES } from './si1.js';

/** Electromagnetic Power: the player's Magnemites, Magnetons and Dark Magnetons. */
const MAGNETS = ['Magnemite', 'Magneton', 'Dark Magneton'];
const magnets = (s: PowerSituation) => ownTargets(s.me).filter((t) => MAGNETS.includes(inPlayDef(s.cards, pokemonAt(s.me, t)!).name));
/** Energy cards attached to the Pokémon at `t` (not a Pokémon attached as Energy). */
const energyCards = (s: PowerSituation, t: Target) => pokemonAt(s.me, t)!.energy.filter((e) => !e.provides);

/** Energy Converter: the player's Pokémon with a basic Energy card attached. */
const basicEnergyOn = (s: PowerSituation, t: Target) => pokemonAt(s.me, t)!.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(s.cards, e.defId)));

/** Legendary Body (Entei, Raikou, Suicune), with the printed text (TCGdex says "other than" twice): trainerProof. */
const legendaryBody = (name: string): PowerEffect => ({
  text: `As long as ${name} is your Active Pokémon, ${name} and Energy cards attached to it aren't affected by effects from Trainer cards other than Stadium cards. As long as this power is active, discard any Trainer cards attached to ${name}. (This power works even if ${name} is Asleep, Confused, or Paralyzed.)`,
  legendaryBody: true,
  ignoresConditions: true,
});

/** Unown B's [Bear]: the player's other Pokémon with Unown in their names and damage counters. */
const bearFrom = (s: PowerSituation) =>
  ownTargets(s.me).filter((t) => t !== s.source && inPlayDef(s.cards, pokemonAt(s.me, t)!).name.includes('Unown') && pokemonAt(s.me, t)!.damage >= 10);

export const NEO3_POWERS: Record<string, PowerEffect> = {
  // Blissey – Softboiled: when played from the hand, you may flip; heads removes 8 damage counters from it, tails 4.
  'neo3-2': {
    onPlayFromHand(state, owner, blissey) {
      const target = targetOf(owner, blissey);
      if (target === -1 || !blissey.damage) return;
      state.pendingChoice = { player: owner.id, source: 'Softboiled', kind: 'mayFlip', power: 'softboiled', target };
    },
  },

  // Celebi – Time Travel: an opponent's attack that would Knock it Out, heads shuffles it into the deck instead (attacks.ts, resolveKnockouts).
  'neo3-3': { timeTravel: true },

  // Entei – Howl: when played from the hand, you may discard the top 5 cards of your deck and attach the Fire Energy cards among them to your Fire Pokémon; your turn ends.
  'neo3-6': {
    onPlayFromHand(state, owner, entei) {
      const target = targetOf(owner, entei);
      if (target === -1 || !owner.deck.length) return;
      state.pendingChoice = { player: owner.id, source: 'Howl', kind: 'mayFlip', power: 'howl', target };
    },
  },

  // Magneton – Electromagnetic Power: as often as you like, move an Energy card between your Magnemites, Magnetons and Dark Magnetons.
  'neo3-10': {
    blocked(s) {
      const all = magnets(s);
      if (all.length < 2) return 'You need another Magnemite, Magneton or Dark Magneton to move Energy to';
      return all.some((t) => energyCards(s, t).length) ? null : 'None of your Magnemites, Magnetons or Dark Magnetons have Energy cards';
    },
    choices(s, c) {
      const specs: PowerChoiceSpec[] = [{ kind: 'ownPokemon', field: 'from', options: magnets(s).filter((t) => energyCards(s, t).length > 0), prompt: 'Take an Energy card from' }];
      if (c.from === undefined) return specs;
      return [
        ...specs,
        { kind: 'attachedEnergy', field: 'energyUid', options: energyCards(s, c.from), prompt: 'Choose the Energy card' },
        { kind: 'ownPokemon', field: 'to', options: magnets(s).filter((t) => t !== c.from), prompt: 'Attach it to' },
      ];
    },
    use(ctx) {
      const from = pokemonAt(ctx.me, ctx.choices.from!)!;
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      const energy = from.energy.find((e) => e.uid === ctx.choices.energyUid)!;
      from.energy = from.energy.filter((e) => e !== energy);
      to.energy.push(energy);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, energy.defId).name} from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },

  // Porygon2 – Energy Converter: once during your turn, a basic Energy card attached to 1 of your Pokémon is a type of your choice until the end of your turn.
  'neo3-12': {
    text: "Once during your turn (before your attack), you may choose 1 basic Energy card attached to 1 of your Pokémon and choose an Energy type. Treat that Energy card as that type until the end of your turn. This power can't be used if Porygon2 is Asleep, Confused, or Paralyzed. If Porygon2 becomes Asleep, Confused, or Paralyzed, the Energy card goes back to its original type.",
    oncePerTurn: true,
    blocked: (s) => (ownTargets(s.me).some((t) => basicEnergyOn(s, t).length) ? null : 'None of your Pokémon have a basic Energy card attached'),
    choices(s, c) {
      const specs: PowerChoiceSpec[] = [{ kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => basicEnergyOn(s, t).length), prompt: 'Choose a Pokémon with a basic Energy card' }];
      if (c.from === undefined) return specs;
      return [
        ...specs,
        { kind: 'attachedEnergy', field: 'energyUid', options: basicEnergyOn(s, c.from), prompt: 'Choose the basic Energy card' },
        { kind: 'type', field: 'type', options: TYPES, prompt: 'Treat it as which type until the end of your turn?' },
      ];
    },
    use(ctx) {
      const p = pokemonAt(ctx.me, ctx.choices.from!)!;
      const energy = p.energy.find((e) => e.uid === ctx.choices.energyUid)!;
      const type = ctx.choices.type!;
      energy.converted = { type, by: ctx.source.card.uid };
      ctx.log(`${lookupCard(ctx.state.cards, energy.defId).name} on ${pokemonName(ctx.state, p)} is ${type[0]!.toUpperCase()}${type.slice(1)} Energy until the end of the turn.`);
    },
  },

  // Raikou – Lightning Burst: attaching a Lightning Energy card from the hand to it, the opponent switches their Active Pokémon with a benched one (their pick).
  'neo3-13': {
    onEnergyFromHand(state, owner, raikou, _target, energy) {
      if (!isEnergyCardOf(energy, state.cards, 'lightning')) return;
      const opp = Object.values(state.players).find((p) => p !== owner)!;
      const slots = opp.bench.flatMap((p, i) => (p ? [i] : []));
      if (!slots.length || !opp.active) return;
      addLog(state, `Lightning Burst (${pokemonName(state, raikou)}): your opponent switches their Active Pokémon.`, owner.id);
      if (slots.length === 1) return swapActive(state, opp, slots[0]!);
      const choice: PendingChoice = { player: opp.id, source: 'Lightning Burst', kind: 'switchIn' };
      if (state.pendingChoice) (state.queuedChoices ??= []).push(choice);
      else state.pendingChoice = choice;
    },
  },

  // Suicune – Crystal Body: the opponent's attacks do nothing to it but damage (attacks.ts).
  'neo3-14': { crystalBody: true },

  // Aerodactyl – Prehistoric Memory: every Evolved Pokémon can use the attacks of the cards it evolved from (recallsAttacks).
  'neo3-15': { prehistoricMemory: true },

  // Entei, Raikou and Suicune – Legendary Body: as the Active Pokémon, no Trainer card but a Stadium affects it or its Energy (agreed: either player's), and Trainer cards attached to it are discarded.
  'neo3-17': legendaryBody('Entei'),
  'neo3-22': legendaryBody('Raikou'),
  'neo3-27': legendaryBody('Suicune'),

  // Sudowoodo – Mimic: as the Active Pokémon, it can use the Defending Pokémon's attacks too (usableAttacks).
  'neo3-26': { mimic: true },

  // Lanturn – Submerge: once during your turn, it's a Water Pokémon until the end of the turn.
  'neo3-32': {
    oncePerTurn: true,
    use(ctx) {
      ctx.source.submerged = ctx.state.turn;
      ctx.log(`${pokemonName(ctx.state, ctx.source)} is a Water Pokémon until the end of the turn.`);
    },
  },

  // Magcargo – Magma Pool: when it moves from the Active spot to the Bench, a Fire Energy card goes from it to the new Active Pokémon (newActives).
  'neo3-33': { magmaPool: true },

  // Parasect – Allergic Pollen: while it works, attacks and Pokémon Powers can't do anything with cards in discard piles (discardsLocked).
  'neo3-35': {
    name: 'Allergic Pollen',
    text: "As long as Parasect is in play, cards in any player's discard piles are not affected by attacks or Pokémon Powers. This power stops working if Parasect becomes Asleep, Confused, or Paralyzed.",
    allergicPollen: true,
  },

  // Unown B – [Bear]: once during your turn, move a damage counter from another of your Pokémon with Unown in its name to it.
  'neo3-39': {
    text: "Once during your turn (before your attack), you may move 1 damage counter from 1 of your Pokémon with Unown in its name to Unown [B]. This power can't be used if Unown [B] has 10 HP left. This power can be used even if Unown [B] is Asleep, Confused, or Paralyzed.",
    oncePerTurn: true,
    ignoresConditions: true,
    blocked(s) {
      const unown = pokemonAt(s.me, s.source)!;
      if (inPlayDef(s.cards, unown).hp - unown.damage <= 10) return `${inPlayDef(s.cards, unown).name} has 10 HP left`;
      return bearFrom(s).length ? null : 'None of your other Pokémon with Unown in their names have damage counters';
    },
    choices: (s) => [{ kind: 'ownPokemon', field: 'from', options: bearFrom(s), prompt: 'Move a damage counter from' }],
    use(ctx) {
      const from = pokemonAt(ctx.me, ctx.choices.from!)!;
      from.damage -= 10;
      countersMoved(ctx.state, from, 10);
      ctx.source.damage += 10;
      ctx.log(`Moved a damage counter from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, ctx.source)}.`);
    },
  },

  // Unown Y – [Yield]: once during your turn, flip; heads attaches a Psychic Energy card from the deck to 1 of your Pokémon with Unown in its name.
  'neo3-40': {
    oncePerTurn: true,
    ignoresConditions: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      if (!ctx.flip()) return ctx.log('[Yield] did nothing.');
      ctx.pend({ kind: 'pickFromDeck', source: '[Yield]', filter: 'energyType', type: 'psychic', attach: true, attachOnly: { name: 'Unown' } });
    },
  },

  // Shuckle – Hard Shell: attack damage of 40 or less to it (after Weakness and Resistance) is 10 (attacks.ts).
  'neo3-51': { hardShell: true },

  // Unown K – [Keep]: the opponent's attacks, Pokémon Powers and Trainer cards can't discard Energy cards from your Pokémon with Unown in their names (energyKept).
  'neo3-58': { keep: true },
};
