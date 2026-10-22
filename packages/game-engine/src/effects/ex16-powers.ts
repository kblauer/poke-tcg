// EX Power Keepers (ex16) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Most reprint EX Ruby & Sapphire, EX Sandstorm, EX Dragon and EX Hidden Legends cards, and play as those.
// Agreed with the user: Psychic Protector is asked before the opponent's attack, works on the Bench too, and its cards go
// only if Flygon ex is damaged (engine.ts, attacks.ts); Cursed Eyes moves up to 3 damage counters.
// From the text: Terraforming is a Poké-Power (as printed; TCGdex says Poké-Body); the Synergy Effects work while their
// Stadium is in play; Metal Gravity is one a retreat (RETREAT); the ☆ Rays and Cursed Eyes work as the Pokémon is put onto
// the Bench from the hand, and are their player's choice; Chilling Breath stops every Trainer card, Supporters too.
import { afflictBetweenTurns } from '../engine.js';
import { type PowerEffect } from '../powers.js';
import { lookupCard } from '../cards.js';
import { shuffle } from '../rng.js';
import { addLog } from '../status.js';
import { ECARD3_POWERS } from './ecard3-powers.js';
import { EX1_POWERS } from './ex1-powers.js';
import { EX2_POWERS, POKE_BODY } from './ex2-powers.js';
import { EX3_POWERS } from './ex3-powers.js';
import { EX5_POWERS } from './ex5-powers.js';
import { healBetween } from './ex6-powers.js';
import { EX8_POWERS } from './ex8-powers.js';
import { EX12_POWERS } from './ex12-powers.js';
import { onBenchMay } from './ex14-powers.js';
import { evolutionaryCall } from './ex15-powers.js';

/** The Stadium in play is the one named (the Synergy Effects). */
const stadiumIs = (state: { stadium?: { card: { defId: string } } | null; cards: Parameters<typeof lookupCard>[0] }, name: string) => !!state.stadium && lookupCard(state.cards, state.stadium.card.defId).name === name;

/** Type Shift: once a turn, it's this type until the end of the turn. */
const typeShift = (type: 'fighting'): PowerEffect => ({
  oncePerTurn: true,
  use(ctx) {
    ctx.source.typesCopied = [type];
    ctx.log(`It's ${type[0]!.toUpperCase()}${type.slice(1)} type until the end of the turn.`);
  },
});

export const EX16_POWERS: Record<string, PowerEffect> = {
  // Aggron – Terraforming: once a turn, the top 5 cards put back in any order.
  'ex16-1': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck > 1 ? null : 'Your deck has fewer than 2 cards'),
    use: (ctx) => ctx.pend({ kind: 'arrangeTop', source: 'Terraforming', count: Math.min(5, ctx.me.deck.length) }),
  },
  // Altaria – Synergy Effect: with Drake's Stadium in play, a damage counter off it between turns.
  'ex16-2': {
    ...POKE_BODY,
    checkup(state, owner, pokemon) {
      if (stadiumIs(state, "Drake's Stadium")) healBetween(state, owner, pokemon, 10, 'Synergy Effect');
    },
  },
  // Blaziken – Firestarter; Delcatty – Energy Draw; Gardevoir – Psy Shadow; Slaking – Lazy; Combusken – Natural Cure;
  // Carvanha – Rough Skin: as EX Ruby & Sapphire's.
  'ex16-5': EX1_POWERS['ex1-3']!,
  'ex16-8': EX1_POWERS['ex1-5']!,
  'ex16-9': EX1_POWERS['ex1-7']!,
  'ex16-13': EX1_POWERS['ex1-12']!,
  'ex16-29': EX1_POWERS['ex1-28']!,
  'ex16-47': EX1_POWERS['ex1-51']!,
  // Cradily – Evolutionary Call: as EX Dragon Frontiers Meganium δ's.
  'ex16-7': evolutionaryCall,
  // Kabutops – Primal Stare: as Skyridge Omastar's.
  'ex16-10': ECARD3_POWERS['ecard3-23']!,
  // Machamp – Overzealous; Lanturn – Energy Grounding; Vigoroth – Strikes Back: as EX Hidden Legends'.
  'ex16-11': EX5_POWERS['ex5-9']!,
  'ex16-15': EX5_POWERS['ex5-38']!,
  'ex16-41': EX5_POWERS['ex5-41']!,
  // Magneton – Magnetic Field: as EX Dragon's.
  'ex16-16': EX3_POWERS['ex3-17']!,
  // Ninetales, Wobbuffet – Safeguard; Pichu – Baby Evolution: as EX Sandstorm's.
  'ex16-19': EX2_POWERS['ex2-26']!,
  'ex16-24': EX2_POWERS['ex2-26']!,
  'ex16-21': EX2_POWERS['ex2-20']!,
  // Sableye – Synergy Effect: with Phoebe's Stadium in play, no damage from the opponent's Pokémon-ex (attacks.ts).
  'ex16-22': { ...POKE_BODY, synergy: { stadium: "Phoebe's Stadium", exProof: true } },
  // Zangoose, Metang – Thick Skin, Clear Body: no Special Conditions.
  'ex16-25': EX3_POWERS['ex3-9']!,
  'ex16-35': EX3_POWERS['ex3-9']!,
  // Anorith – Solid Shell: 10 less damage.
  'ex16-26': { ...POKE_BODY, damageReduction: 10 },
  // Cacturne – Poison Structure: once a turn, with Sidney's Stadium in play, the opponent's Active Pokémon is now Poisoned.
  'ex16-27': {
    oncePerTurn: true,
    blocked: (s) => (!s.stadium || lookupCard(s.cards, s.stadium.defId).name !== "Sidney's Stadium" ? "Sidney's Stadium isn't in play" : s.opp.active ? null : 'Your opponent has no Active Pokémon'),
    use: (ctx) => void (ctx.opp.active && afflictBetweenTurns(ctx.state, ctx.opp.id, ctx.opp.active, 'poisoned')),
  },
  // Glalie – Synergy Effect: with Glacia's Stadium in play, 30 less from the opponent's attacks (attacks.ts).
  'ex16-30': { ...POKE_BODY, synergy: { stadium: "Glacia's Stadium", less: 30 } },
  // Medicham – Vigorous Aura: as EX Deoxys Vigoroth's.
  'ex16-34': EX8_POWERS['ex8-50']!,
  // Wynaut – Baby Evolution: as EX Legend Maker's.
  'ex16-70': EX12_POWERS['ex12-71']!,
  // Absol ex – Cursed Eyes: put onto the Bench from the hand, up to 3 damage counters move between the opponent's Pokémon.
  'ex16-92': {
    onPlayFromHand(state, owner, pokemon) {
      const opp = state.players[state.playerOrder.find((id) => id !== owner.id)!]!;
      const theirs = [opp.active, ...opp.bench].filter(Boolean);
      if (pokemon.evolvedFrom.length || !owner.bench.includes(pokemon) || theirs.length < 2 || !theirs.some((p) => p!.damage > 0)) return;
      state.pendingChoice = { player: owner.id, source: 'Cursed Eyes', kind: 'cursedEyes' };
    },
  },
  // Claydol ex – Type Shift: Fighting until the end of the turn.
  'ex16-93': typeShift('fighting'),
  // Flygon ex – Psychic Protector (engine.ts, attacks.ts).
  'ex16-94': { ...POKE_BODY, psychicProtector: true },
  // Metagross ex – Magnetic Redraw: once a turn, as the Active Pokémon, each player's hand shuffled into their deck; each draws 4.
  'ex16-95': {
    oncePerTurn: true,
    blocked: (s) => (s.source !== 'active' ? 'Metagross ex must be your Active Pokémon' : null),
    use(ctx) {
      for (const player of [ctx.me, ctx.opp]) {
        [player.deck, ctx.state.rngState] = shuffle([...player.deck, ...player.hand], ctx.state.rngState);
        player.hand = player.deck.splice(0, 4);
        addLog(ctx.state, `Shuffled the hand into the deck and drew ${player.hand.length} cards.`, player.id);
      }
    },
  },
  // Skarmory ex – Metal Gravity (RETREAT).
  'ex16-98': { ...POKE_BODY, metalGravity: true },
  // Walrein ex – Chilling Breath: evolving from the hand, the opponent can't play Trainer cards during their next turn.
  'ex16-99': {
    onPlayFromHand(state, owner, pokemon) {
      if (!pokemon.evolvedFrom.length) return;
      const opp = state.players[state.playerOrder.find((id) => id !== owner.id)!]!;
      opp.noTrainersUntil = state.turn + 1;
      addLog(state, "Chilling Breath: your opponent can't play Trainer cards during their next turn.", owner.id);
    },
  },
  // Flareon ☆ – Crimson Ray; Jolteon ☆ – Yellow Ray; Vaporeon ☆ – Blue Ray.
  'ex16-100': onBenchMay('crimsonRay', 'Crimson Ray'),
  'ex16-101': onBenchMay('yellowRay', 'Yellow Ray'),
  'ex16-102': onBenchMay('blueRay', 'Blue Ray'),
};

