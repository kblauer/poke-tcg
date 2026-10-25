// Arceus (pl4) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Several are the engine's own rules, named by a flag: Fire Formation, Competitiveness, Cloudy Sky, Wild Guard and Star Barrier
// (attacks.ts), Keystone Seal (trainersBlocked), Cloak Evolution (evolveError). The powers that work as their Pokémon is
// benched or levels up are asked then (mayUse): Dowsing Code, Double Fall.
// From the text: Top Accelerator's basic Energy card goes to the Pokémon clicked; Relaxing Shower takes a damage counter off
// each of the player's Pokémon; Rock Reaction and Aqua Reaction find a card that evolves from the Fossil as its Energy card
// is attached from the hand (energyFromHand); Level-Down shuffles the Level-Up card into the opponent's deck, the Pokémon below
// staying in play; Healing Growth's Pokémon is picked before the flip.
import { lookupCard, namesMatch } from '../cards.js';
import type { Target } from '../engine.js';
import { ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { shuffle } from '../rng.js';
import { addLog, inPlayDef, pokemonName } from '../status.js';
import { POKE_BODY } from './common.js';
import { onBench, onLevelUp } from './dp5-powers.js';
import { DPP_POWERS } from './dpp-powers.js';
import { EX11_POWERS } from './ex11-powers.js';
import { EX2_POWERS } from './ex2-powers.js';
import { energyCardOf } from './ex2.js';
import { EX9_POWERS } from './ex9-powers.js';
import { FOSSIL_POWERS } from './fossil-powers.js';

/** The opponent's Pokémon LV.X, by target (Level-Down). */
const oppLevelUps = (s: PowerSituation): Target[] => ownTargets(s.opp).filter((t) => inPlayDef(s.cards, pokemonAt(s.opp, t)!).stage === 'levelUp');
/** Rock Reaction, Aqua Reaction: an Energy card of the type attached from the hand, a card from the deck that evolves from the Fossil. */
const reaction = (type: 'fighting' | 'water', fossil: string, source: string): PowerEffect => ({
  ...POKE_BODY,
  onEnergyFromHand(state, owner, _pokemon, target, energy) {
    if (!energyCardOf(state.cards, energy, type)) return;
    const names = [...new Set(owner.deck.flatMap((c) => {
      const d = lookupCard(state.cards, c.defId);
      return d.kind === 'pokemon' && d.evolvesFrom && namesMatch(d.evolvesFrom, fossil) ? [d.name] : [];
    }))];
    if (names.length) state.pendingChoice = { player: owner.id, source, kind: 'evolveFromDeck', target, names };
  },
});

export const PL4_POWERS: Record<string, PowerEffect> = {
  // Charizard – Fire Formation: 10 more for each Fire Pokémon on the Bench (attacks.ts).
  'pl4-1': { ...POKE_BODY, fireFormation: true },
  // Froslass – Snow Gift: as EX Delta Species Froslass's.
  'pl4-2': EX11_POWERS['ex11-50']!,
  // Probopass – Competitiveness: with no Supporter in play, 30 more (attacks.ts).
  'pl4-7': { ...POKE_BODY, competitiveness: true },
  // Salamence – Top Accelerator: the top card shown; a basic Energy card is attached to one of the player's Pokémon, anything else discarded.
  'pl4-8': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const top = ctx.me.deck.shift();
      if (!top) return;
      const d = lookupCard(ctx.state.cards, top.defId);
      ctx.log(`Top Accelerator: the top card is ${d.name}.`);
      if (d.kind === 'energy' && d.basic !== false) return ctx.pend({ kind: 'attachCard', source: 'Top Accelerator', card: top });
      ctx.me.discard.push(top);
      ctx.log(`Discarded ${d.name}.`);
    },
  },
  // Aerodactyl – Unearth: a Helix Fossil, Dome Fossil or Old Amber from the deck, shown.
  'pl4-13': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Unearth', filter: 'fossilCard', reveal: true }),
  },
  // Cherrim – Cloudy Sky: 10 less attack damage to its player's Grass and Fire Pokémon (attacks.ts).
  'pl4-15': { ...POKE_BODY, cloudySky: true },
  // Gengar – Curse: as Fossil Gengar's.
  'pl4-16': FOSSIL_POWERS['base3-5']!,
  // Lopunny – Relaxing Shower: an Energy card discarded from the hand, a damage counter off each of the player's Pokémon.
  'pl4-21': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.some((c) => lookupCard(s.cards, c.defId).kind === 'energy') ? null : 'You have no Energy cards in your hand'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: s.me.hand.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy'), prompt: 'Relaxing Shower: choose an Energy card to discard' }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      if (!card) return;
      ctx.me.hand = ctx.me.hand.filter((c) => c !== card);
      ctx.me.discard.push(card);
      for (const p of [ctx.me.active, ...ctx.me.bench]) if (p?.damage) p.damage -= 10;
      ctx.log(`Discarded ${lookupCard(ctx.state.cards, card.defId).name}; a damage counter off each of your Pokémon.`);
    },
  },
  // Pichu – Baby Evolution: as EX Sandstorm Pichu's.
  'pl4-25': EX2_POWERS['ex2-20']!,
  // Porygon-Z G – Dowsing Code: as it's benched from the hand, up to 2 Pokémon Tool cards from the discard pile shuffled into the deck.
  'pl4-26': onBench('dowsingCode', 'Dowsing Code'),
  // Rapidash – Wild Guard: nothing from the opponent's Pokémon SP (attacks.ts).
  'pl4-28': { ...POKE_BODY, wildGuard: true },
  // Sceptile – Green Breath: a Grass Energy card attached from the hand to it, 2 damage counters off it.
  'pl4-30': {
    ...POKE_BODY,
    onEnergyFromHand(state, owner, pokemon, _target, energy) {
      if (!pokemon.damage || !energyCardOf(state.cards, energy, 'grass')) return;
      const healed = Math.min(20, pokemon.damage);
      pokemon.damage -= healed;
      addLog(state, `Green Breath removed ${healed / 10} damage counter${healed === 10 ? '' : 's'} from ${pokemonName(state, pokemon)}.`, owner.id);
    },
  },
  // Spiritomb – Keystone Seal: as the Active Pokémon, no player can play Trainer cards (trainersBlocked).
  'pl4-32': { ...POKE_BODY, keystoneSeal: true },
  // Haunter – Hidden Poison: as EX Sandstorm Arbok's.
  'pl4-41': EX2_POWERS['ex2-2']!,
  // Burmy – Cloak Evolution: it can evolve the turn it's played (evolveError).
  'pl4-56': { ...POKE_BODY, cloakEvolution: true },
  'pl4-57': { ...POKE_BODY, cloakEvolution: true },
  'pl4-58': { ...POKE_BODY, cloakEvolution: true },
  // Old Amber – Hard Amber: as EX Emerald Lanturn's Submerge. Dome Fossil – Rock Reaction; Helix Fossil – Aqua Reaction.
  'pl4-89': EX9_POWERS['ex9-49']!,
  'pl4-92': reaction('fighting', 'Dome Fossil', 'Rock Reaction'),
  'pl4-93': reaction('water', 'Helix Fossil', 'Aqua Reaction'),
  // Arceus LV.X – Multitype: as the DP Black Star Promo's.
  'pl4-94': DPP_POWERS['dpp-DP53']!,
  'pl4-95': DPP_POWERS['dpp-DP53']!,
  'pl4-96': DPP_POWERS['dpp-DP53']!,
  // Gengar LV.X – Level-Down: one of the opponent's Pokémon LV.X loses its Level-Up card, shuffled into their deck.
  'pl4-97': {
    oncePerTurn: true,
    blocked: (s) => (oppLevelUps(s).length ? null : 'Your opponent has no Pokémon LV.X'),
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppFrom', options: oppLevelUps(s), prompt: "Level-Down: choose one of your opponent's Pokémon LV.X" }],
    use(ctx) {
      const p = ctx.choices.oppFrom === undefined ? null : pokemonAt(ctx.opp, ctx.choices.oppFrom);
      const below = p?.evolvedFrom.at(-1);
      if (!p || !below || inPlayDef(ctx.state.cards, p).stage !== 'levelUp') return;
      const lvx = p.card;
      p.evolvedFrom = p.evolvedFrom.slice(0, -1);
      p.card = below;
      delete p.levelUpFrom;
      [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, lvx], ctx.state.rngState);
      addLog(ctx.state, `Level-Down: ${lookupCard(ctx.state.cards, lvx.defId).name} LV.X was shuffled into the deck.`, ctx.opp.id);
    },
  },
  // Salamence LV.X – Double Fall: as it levels up, a Prize card more for each Pokémon its attacks Knock Out this turn.
  'pl4-98': onLevelUp('doubleFall', 'Double Fall'),
  // Tangrowth LV.X – Healing Growth: heads, 4 damage counters off one of the player's Pokémon.
  'pl4-99': {
    oncePerTurn: true,
    blocked: (s) => (ownTargets(s.me).some((t) => pokemonAt(s.me, t)!.damage) ? null : 'None of your Pokémon has damage counters'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => pokemonAt(s.me, t)!.damage > 0), prompt: 'Healing Growth: choose one of your Pokémon (if heads)' }],
    use(ctx) {
      const p = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      if (!p || !ctx.flip()) return;
      const healed = Math.min(40, p.damage);
      p.damage -= healed;
      ctx.log(`Removed ${healed / 10} damage counter${healed === 10 ? '' : 's'} from ${pokemonName(ctx.state, p)}.`);
    },
  },
  // Bagon, Ponyta, Shinx – Star Barrier: with any Energy attached, no Weakness (attacks.ts).
  'pl4-SH10': { ...POKE_BODY, starBarrier: true },
  'pl4-SH11': { ...POKE_BODY, starBarrier: true },
  'pl4-SH12': { ...POKE_BODY, starBarrier: true },
};
