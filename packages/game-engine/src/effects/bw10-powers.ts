// Plasma Blast (bw10) Abilities, by card id. Every Ability is a kind of its own (agreed: ABILITY).
// From the text: Plasma Energy is Plasma Storm's (isPlasmaEnergy, bw8-trainers.ts); a Team Plasma Pokémon is one
// with Team Plasma on its card or Team Plasma Badge attached (isPlasmaPokemon); Tool Reversal and Plasma Transfer can be used
// as often as the player likes; Verdant Wind keeps Special Conditions off the player's Pokémon with Grass Energy attached (any
// card providing Grass) and removes those they have; Cursed Glare (Plasma Blast's) keeps every Special Energy card from the
// hand off all the opponent's Pokémon while Froslass is its player's Active Pokémon; Drifting Balloon counts the opponent's Team
// Plasma Pokémon in play; Mental Shroud needs the player's own Uxie and Azelf in play; Badge of Discipline is for the player's
// Fighting Pokémon; Red Signal, Stellar Guidance and Breakwing ask the player ("you may").
// Not done: Lileep's, Tirtouga's and Archen's Prehistoric Call (an Ability used from the discard pile, which the game has no way
// to use yet), and Sigilyph's Toolbox (up to 4 Pokémon Tools on one Pokémon: every Tool rule reads one Tool a Pokémon).
import { lookupCard, type CardLibrary } from '../cards.js';
import { counts, energyPool, type CardInstance, type Target } from '../engine.js';
import { ownTargets, pokemonAt, type PowerChoiceSpec, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, clearSpecialConditions, hasSpecialCondition, isPlasmaPokemon, lakeTrio, pokemonName } from '../status.js';
import { isPlasmaEnergy } from './bw8-trainers.js';
import { ABILITY, inPlay, targetOf } from './common.js';

const at = (s: PowerSituation, t: Target) => pokemonAt(s.me, t)!;
const lookupCardName = (cards: CardLibrary, c: CardInstance) => lookupCard(cards, c.defId).name;

/** The Plasma Energy cards attached to the Pokémon at `t`. */
const plasmaOn = (s: PowerSituation, t: Target) => at(s, t).energy.filter((e: CardInstance) => !e.windless && isPlasmaEnergy(s.cards, e));

/** The player's Pokémon with a Pokémon Tool attached. */
const withTool = (s: PowerSituation) => ownTargets(s.me).filter((t) => at(s, t).attached?.some((a) => a.tool));

export const BW10_POWERS: Record<string, PowerEffect> = {
  // Masquerain – Tool Reversal: a Pokémon Tool from one of the player's Pokémon into the hand, as often as they like.
  'bw10-2': {
    ...ABILITY,
    blocked: (s) => (withTool(s).length ? null : 'None of your Pokémon have a Pokémon Tool attached'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'from', options: withTool(s), prompt: 'Tool Reversal: take a Pokémon Tool from which of your Pokémon?' }],
    use(ctx) {
      const p = pokemonAt(ctx.me, ctx.choices.from!)!;
      const tool = p.attached?.find((a) => a.tool);
      if (!tool) return;
      p.attached = p.attached!.filter((a) => a !== tool);
      ctx.me.hand.push(tool.card);
      ctx.log(`Tool Reversal: ${lookupCardName(ctx.state.cards, tool.card)} from ${pokemonName(ctx.state, p)} into the hand.`);
    },
  },

  // Virizion-EX – Verdant Wind: the player's Pokémon with Grass Energy attached have no Special Conditions and can't get any.
  'bw10-9': {
    ...ABILITY,
    refresh(state, owner) {
      for (const p of inPlay(owner)) {
        if (!energyPool(p, state.cards).some((e) => counts(e, 'grass'))) continue;
        // The flag conditionFree reads (Green Essence's), set again after every action while this holds.
        p.greenEssence = true;
        if (!hasSpecialCondition(p)) continue;
        clearSpecialConditions(p);
        addLog(state, `Verdant Wind: ${pokemonName(state, p)} is no longer affected by Special Conditions.`, owner.id);
      }
    },
  },

  // Genesect-EX – Red Signal: a Plasma Energy attached to it from the hand, the player may switch one of the opponent's Benched
  // Pokémon with their Active Pokémon.
  'bw10-11': {
    ...ABILITY,
    onEnergyFromHand(state, owner, _pokemon, _target, energy) {
      const opp = state.players[state.playerOrder.find((id) => id !== owner.id)!]!;
      if (!isPlasmaEnergy(state.cards, energy) || !opp.active || !opp.bench.some(Boolean)) return;
      state.pendingChoice = { player: owner.id, source: 'Red Signal', kind: 'oppBenchPick', purpose: 'gust', optional: true };
    },
  },

  // Suicune – Safeguard: nothing from the opponent's Pokémon-EX (attacks.ts).
  'bw10-20': { ...ABILITY, guardFrom: 'pokemonEX' },

  // Froslass – Cursed Glare: as its player's Active Pokémon, no Special Energy cards from the opponent's hand onto their Pokémon.
  'bw10-23': { ...ABILITY, cursedGlareAll: true },

  // Drifblim – Drifting Balloon: its attacks cost 1 Colorless less for each of the opponent's Team Plasma Pokémon.
  'bw10-35': { ...ABILITY, costLess: (s) => [s.defender, ...s.opponentBench].filter((p) => p && isPlasmaPokemon(s.cards, p)).length },

  // Mesprit – Mental Shroud: with the player's Uxie and Azelf in play, their Pokémon have no Weakness (attacks.ts).
  'bw10-37': { ...ABILITY, noWeaknessWhen: (owner, cards) => lakeTrio(cards, owner, ['Uxie', 'Azelf']) },

  // Machamp – Badge of Discipline: the player's Fighting Pokémon's attacks ignore Resistance (attacks.ts).
  'bw10-49': { ...ABILITY, noResistanceFor: 'fighting' },

  // Jirachi-EX – Stellar Guidance: benched from the hand, a Supporter card from the deck, shown, if the player likes.
  'bw10-60': {
    ...ABILITY,
    onPlayFromHand(state, owner) {
      if (owner.deck.length) state.pendingChoice = { player: owner.id, source: 'Stellar Guidance', kind: 'pickFromDeck', filter: 'supporter', reveal: true, optional: true };
    },
  },

  // Salamence – Breakwing: evolved into from the hand, the player may discard every Pokémon Tool on the opponent's Pokémon.
  'bw10-64': {
    ...ABILITY,
    onPlayFromHand(state, owner, pokemon) {
      if (pokemon.evolvedFrom.length === 0) return;
      const opp = state.players[state.playerOrder.find((id) => id !== owner.id)!]!;
      if (!inPlay(opp).some((p) => p.attached?.some((a) => a.tool))) return;
      state.pendingChoice = { player: owner.id, source: 'Breakwing', kind: 'mayUse', power: 'breakwing', target: targetOf(owner, pokemon) };
    },
  },

  // Porygon-Z – Plasma Transfer: a Plasma Energy from one of the player's Pokémon to another, as often as they like.
  'bw10-74': {
    ...ABILITY,
    blocked(s) {
      if (ownTargets(s.me).length < 2) return 'You need another Pokémon to move Energy to';
      return ownTargets(s.me).some((t) => plasmaOn(s, t).length) ? null : 'None of your Pokémon have Plasma Energy attached';
    },
    choices(s, c) {
      const specs: PowerChoiceSpec[] = [{ kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => plasmaOn(s, t).length), prompt: 'Take a Plasma Energy from' }];
      if (c.from === undefined) return specs;
      return [
        ...specs,
        { kind: 'attachedEnergy', field: 'energyUid', options: plasmaOn(s, c.from), prompt: 'Choose the Plasma Energy' },
        { kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => t !== c.from), prompt: 'Move it to' },
      ];
    },
    use(ctx) {
      const from = pokemonAt(ctx.me, ctx.choices.from!)!;
      const to = pokemonAt(ctx.me, ctx.choices.to!)!;
      const energy = from.energy.find((e) => e.uid === ctx.choices.energyUid)!;
      from.energy = from.energy.filter((e) => e !== energy);
      to.energy.push(energy);
      ctx.log(`Moved a Plasma Energy from ${pokemonName(ctx.state, from)} to ${pokemonName(ctx.state, to)}.`);
    },
  },
};
