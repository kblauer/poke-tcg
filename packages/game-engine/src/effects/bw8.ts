// Plasma Storm (bw8) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: "any Plasma Energy attached" is a Plasma Energy card (isPlasmaEnergy); Astonish's 3 cards are picked at random
// and shown; Miracle Powder's Special Condition is picked before the flip (as Magic Pollen), any of the five; Luring Flame
// Burns the Pokémon switched in; Fiery Licks counts the Fire Energy cards, basic or Special (energyCardOf), among the 4;
// Groovy Dance's Energy is picked before the attack (none: no Confusion); Seafaring takes basic Water Energy cards, one for
// each heads, each to the Benched Pokémon clicked; Enefountain and Double Assist pick the Pokémon first, then the 2 cards (as
// many as there are); Electribonus and Cargo Jet ask for the card to discard when there's one, then draw 3; Discharge discards
// every Lightning Energy card, 30 for each card; Powerful Storm counts the Energy provided by all the player's Pokémon; Tool
// Drop counts the Pokémon Tool cards on every Pokémon in play; Ensnarl counts the Defending Pokémon's Retreat Cost as it is now
// (as Gyro Ball's template); Damakinesis moves 6 damage counters one at a time from the player's Pokémon they click (all 6, or
// as many as they have; may Knock Out); Silent Claw plays as Arceus Raticate's Recruit; Destructive Sound discards the Item
// cards (agreed: any Trainer but a Supporter or a Stadium, isItemCard); Teampact counts the player's Team Plasma Pokémon.
import { type AttackContext, type AttackEffect, type ChoiceSpec } from '../attacks.js';
import { isTrainerCard, lookupCard } from '../cards.js';
import { energyPool, retreatCost, type CardInstance } from '../engine.js';
import { nextRandom, shuffle } from '../rng.js';
import { isItemCard } from '../trainers.js';
import { benchedSlots, inPlay, same } from './common.js';
import { shuffleIntoDeck } from './dp1.js';
import { discardOwn, energyCardOf } from './ex2.js';
import { PL4 } from './pl4.js';
import { isPlasmaEnergy, isTeamPlasma } from './bw8-trainers.js';

const name = (ctx: AttackContext, c: CardInstance) => lookupCard(ctx.state.cards, c.defId).name;

/** The attacker has a Plasma Energy card attached. */
const plasma = (ctx: AttackContext) => ctx.attacker.energy.some((e) => isPlasmaEnergy(ctx.state.cards, e));

/** "If this Pokémon has any Plasma Energy attached to it, this attack does N more damage." */
const plasmaMore = (damage: number, more: number): AttackEffect => ({ run: (ctx) => void ctx.hit(plasma(ctx) ? damage + more : damage) });

/** `n` cards from the opponent's hand at random, shown, then shuffled into their deck (Astonish). */
function astonish(ctx: AttackContext, n: number) {
  const picked: CardInstance[] = [];
  for (let i = 0; i < n && ctx.opp.hand.length; i++) {
    const [r, next] = nextRandom(ctx.state.rngState);
    ctx.state.rngState = next;
    picked.push(...ctx.opp.hand.splice(Math.floor(r * ctx.opp.hand.length), 1));
  }
  if (!picked.length) return ctx.log("Astonish did nothing: your opponent's hand is empty.");
  ctx.log(`Astonish chose ${picked.map((c) => name(ctx, c)).join(', ')}.`);
  [ctx.opp.deck, ctx.state.rngState] = shuffle([...ctx.opp.deck, ...picked], ctx.state.rngState);
  ctx.log(`Shuffled ${picked.length} card${picked.length === 1 ? '' : 's'} from the hand into the deck.`, ctx.opp.id);
}

/** "Your opponent reveals his or her hand." */
const reveal = (ctx: AttackContext) => ctx.log(`Your opponent's hand: ${ctx.opp.hand.map((c) => name(ctx, c)).join(', ') || 'no cards'}.`);

/** The player's Pokémon to attach to, asked first (Enefountain, Double Assist). */
const ownPokemonChoice = (prompt: string) => (s: Parameters<NonNullable<AttackEffect['choices']>>[0]): ChoiceSpec[] => [
  { kind: 'ownPokemon', options: ['active', ...benchedSlots(s.ownBench)], prompt },
];

export const BW8: Record<string, Record<string, AttackEffect>> = {
  // Combee – Sting Missile: then Combee and every card attached shuffled into the deck.
  'bw8-4': {
    'Sting Missile': {
      run(ctx) {
        ctx.hit(30);
        if (ctx.me.active === ctx.attacker) shuffleIntoDeck(ctx, ctx.me, ctx.attacker);
      },
    },
  },
  // Vespiquen – Gather Order: any number of Combee from the deck onto the Bench. Damage Beat: 20 for each damage counter on the Defending Pokémon.
  'bw8-5': {
    'Gather Order': {
      run(ctx) {
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Gather Order', filter: 'basicNamed', name: 'Combee', toBench: true, count: 5, optional: true });
      },
    },
    'Damage Beat': { run: (ctx) => void ctx.hit(20 * Math.floor(ctx.defender.damage / 10)) },
  },
  // Amoonguss – Astonish: heads, 3 cards from the opponent's hand at random shuffled into their deck. Miracle Powder: heads, the
  // Special Condition picked.
  'bw8-13': {
    Astonish: { run: (ctx) => (ctx.flip() ? astonish(ctx, 3) : ctx.log('Astonish did nothing.')) },
    'Miracle Powder': {
      choices: (): ChoiceSpec[] => [{ kind: 'condition', options: ['asleep', 'burned', 'confused', 'paralyzed', 'poisoned'], prompt: 'Choose the Special Condition for the Defending Pokémon (on heads)' }],
      run(ctx) {
        ctx.hit(30);
        if (ctx.flip() && ctx.choices.condition) ctx.inflict(ctx.choices.condition);
      },
    },
  },
  // Moltres-EX – Power Flame: 40 more with Plasma Energy attached.
  'bw8-14': { 'Power Flame': plasmaMore(80, 40) },
  // Heatmor – Luring Flame: one of the opponent's Benched Pokémon switched in, and Burned. Fiery Licks: the top 4 cards of the deck
  // discarded, 50 for each Fire Energy card among them.
  'bw8-23': {
    'Luring Flame': {
      choices(s): ChoiceSpec[] {
        const options = benchedSlots(s.opponentBench);
        return options.length ? [{ kind: 'opponentBench', options, prompt: "Choose one of your opponent's Benched Pokémon to switch in" }] : [];
      },
      run(ctx) {
        const slot = ctx.choices.benchSlot;
        if (slot === undefined || !ctx.opp.bench[slot]) return ctx.log('Luring Flame did nothing.');
        const was = ctx.opp.active;
        ctx.switchDefender(slot);
        if (ctx.opp.active !== was) ctx.inflict('burned');
      },
    },
    'Fiery Licks': {
      run(ctx) {
        const top = ctx.me.deck.splice(0, 4);
        ctx.me.discard.push(...top);
        ctx.log(`Discarded the top ${top.length} cards of the deck: ${top.map((c) => name(ctx, c)).join(', ') || 'none'}.`);
        ctx.hit(50 * top.filter((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy' && energyCardOf(ctx.state.cards, c, 'fire')).length);
      },
    },
  },
  // Articuno-EX – Frost Prison: with Plasma Energy attached, the Defending Pokémon is Paralyzed.
  'bw8-25': {
    'Frost Prison': {
      run(ctx) {
        ctx.hit(80);
        if (plasma(ctx)) ctx.inflict('paralyzed');
      },
    },
  },
  // Ludicolo – Groovy Dance: an Energy attached to it may be discarded; if it is, the Defending Pokémon is Confused.
  'bw8-31': {
    'Groovy Dance': {
      choices: (s): ChoiceSpec[] => (s.attacker.energy.length ? [{ kind: 'ownEnergyUpTo', options: s.attacker.energy, max: 1, prompt: 'You may discard an Energy to Confuse the Defending Pokémon' }] : []),
      run(ctx) {
        ctx.hit(70);
        const card = ctx.attacker.energy.find((e) => ctx.choices.energyUids?.includes(e.uid));
        if (!card) return;
        discardOwn(ctx, [card]);
        ctx.inflict('confused');
      },
    },
  },
  // Manaphy – Seafaring: 3 coins; a Water Energy card from the discard pile to the Benched Pokémon clicked for each heads.
  'bw8-34': {
    Seafaring: {
      run(ctx) {
        const heads = ctx.flips(3);
        if (heads && benchedSlots(ctx.me.bench).length && ctx.me.discard.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy' && energyCardOf(ctx.state.cards, c, 'water'))) {
          ctx.pend({ kind: 'attachFromDiscard', source: 'Seafaring', count: heads, type: 'water', benchOnly: true });
        }
      },
    },
  },
  // Vanilluxe – Enefountain: 2 basic Energy cards from the hand to one of the player's Pokémon.
  'bw8-37': {
    Enefountain: {
      choices: ownPokemonChoice('Enefountain: choose one of your Pokémon to attach 2 basic Energy cards to'),
      run(ctx) {
        ctx.hit(30);
        const target = ctx.choices.ownTarget ?? 'active';
        ctx.pend({ kind: 'attachFromHand', source: 'Enefountain', count: 2, basic: true, target });
      },
    },
  },
  // Magnezone – Double Assist: 2 basic Energy cards from the discard pile to one of the player's Pokémon.
  'bw8-47': {
    'Double Assist': {
      choices: ownPokemonChoice('Double Assist: choose one of your Pokémon to attach 2 basic Energy cards to'),
      run(ctx) {
        ctx.hit(30);
        const target = ctx.choices.ownTarget ?? 'active';
        if (ctx.me.discard.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy' && (lookupCard(ctx.state.cards, c.defId) as { basic?: boolean }).basic !== false)) {
          ctx.pend({ kind: 'attachFromDiscard', source: 'Double Assist', count: 2, target });
        }
      },
    },
  },
  // Zapdos-EX – Powervolt: 40 more with Plasma Energy attached.
  'bw8-48': { Powervolt: plasmaMore(80, 40) },
  // Rotom – Electribonus: a Lightning Energy card from the hand discarded; if one is, 3 cards drawn. Poltergeist: 20 for each
  // Trainer card in the opponent's hand, shown.
  'bw8-49': {
    Electribonus: {
      run(ctx) {
        const lightning = ctx.me.hand.some((c) => {
          const d = lookupCard(ctx.state.cards, c.defId);
          return d.kind === 'energy' && !d.anyType && d.energyType === 'lightning';
        });
        if (!lightning) return ctx.log('Electribonus did nothing: no Lightning Energy card in the hand.');
        ctx.pend({ kind: 'discardFromHand', source: 'Electribonus', count: 1, energyOnly: true, energyType: 'lightning', drawEach: 3 });
      },
    },
    Poltergeist: {
      run(ctx) {
        reveal(ctx);
        ctx.hit(20 * ctx.opp.hand.filter((c) => isTrainerCard(lookupCard(ctx.state.cards, c.defId))).length);
      },
    },
  },
  // Galvantula – Discharge: every Lightning Energy card on it discarded, 30 for each.
  'bw8-51': {
    Discharge: {
      run(ctx) {
        const lightning = ctx.attacker.energy.filter((e) => !e.provides && energyCardOf(ctx.state.cards, e, 'lightning'));
        discardOwn(ctx, lightning);
        ctx.hit(30 * lightning.length);
      },
    },
  },
  // Gallade – Powerful Storm: 20 for each Energy attached to the player's Pokémon.
  'bw8-61': { 'Powerful Storm': { run: (ctx) => void ctx.hit(20 * inPlay(ctx.me).reduce((n, p) => n + energyPool(p, ctx.state.cards).length, 0)) } },
  // Trubbish – Pile Up: heads, a Pokémon Tool card from the deck, shown.
  'bw8-63': {
    'Pile Up': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Pile Up did nothing.');
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Pile Up', filter: 'tool', reveal: true });
      },
    },
  },
  // Trubbish – Tool Drop: 20 for each Pokémon Tool card on the Pokémon in play, both players'.
  'bw8-65': { 'Tool Drop': { run: (ctx) => void ctx.hit(20 * [...inPlay(ctx.me), ...inPlay(ctx.opp)].reduce((n, p) => n + (p.attached ?? []).filter((a) => a.tool).length, 0)) } },
  // Garbodor – Biosmog: the Defending Pokémon is Poisoned; heads, an Energy attached to it (picked before the flip) discarded.
  'bw8-66': {
    Biosmog: {
      choices: (s): ChoiceSpec[] => (s.defender.energy.length ? [{ kind: 'defenderEnergy', options: s.defender.energy, prompt: 'Choose an Energy to discard from the Defending Pokémon (if heads)' }] : []),
      run(ctx) {
        ctx.hit(20);
        ctx.inflict('poisoned');
        if (ctx.flip() && ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Garbodor – Ensnarl: 20 for each Colorless in the Defending Pokémon's Retreat Cost.
  'bw8-67': { Ensnarl: { run: (ctx) => void ctx.hit(20 * retreatCost(ctx.defender, ctx.state.cards, [ctx.opp, ctx.me], ctx.state.stadium?.card)) } },
  // Beheeyem – Damakinesis: 6 damage counters moved from the player's Pokémon to the Defending Pokémon, one at a time.
  'bw8-70': {
    Damakinesis: {
      run(ctx) {
        if (!inPlay(ctx.me).some((p) => p.damage > 0)) return ctx.log('Damakinesis did nothing: none of your Pokémon have damage counters.');
        if (!ctx.canAffect(ctx.opp, ctx.defender)) return;
        ctx.pend({ kind: 'moveCounters', source: 'Damakinesis', count: 6, toActive: true });
      },
    },
  },
  // Conkeldurr – Facade: 60 more while it's Burned or Poisoned.
  'bw8-81': { Facade: { run: (ctx) => void ctx.hit(ctx.attacker.burned || ctx.attacker.poison ? 120 : 60) } },
  // Liepard – Silent Claw: as Arceus Raticate's Recruit.
  'bw8-84': { 'Silent Claw': same(() => PL4['pl4-29']?.Recruit) },
  // Skarmory – Cargo Jet: a Team Plasma card from the hand discarded; if one is, 3 cards drawn.
  'bw8-87': {
    'Cargo Jet': {
      run(ctx) {
        if (!ctx.me.hand.some((c) => isTeamPlasma(ctx.state.cards, c))) return ctx.log('Cargo Jet did nothing: no Team Plasma card in the hand.');
        ctx.pend({ kind: 'discardFromHand', source: 'Cargo Jet', count: 1, only: 'teamPlasma', drawEach: 3 });
      },
    },
  },
  // Durant – Call for Backup: a Pokémon from the deck, shown, into the hand.
  'bw8-92': { 'Call for Backup': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Call for Backup', filter: 'pokemon', reveal: true })) } },
  // Snorlax – Teampact: 30 for each of the player's Team Plasma Pokémon in play.
  'bw8-101': { Teampact: { run: (ctx) => void ctx.hit(30 * inPlay(ctx.me).filter((p) => isTeamPlasma(ctx.state.cards, p.card)).length) } },
  // Togetic – Sweet Kiss: the opponent draws a card.
  'bw8-103': {
    'Sweet Kiss': {
      run(ctx) {
        ctx.hit(30);
        const drawn = ctx.opp.deck.splice(0, 1);
        ctx.opp.hand.push(...drawn);
        if (drawn.length) ctx.log('Drew a card.', ctx.opp.id);
      },
    },
  },
  // Exploud – Destructive Sound: the opponent's hand shown; every Item card in it discarded.
  'bw8-107': {
    'Destructive Sound': {
      run(ctx) {
        reveal(ctx);
        const items = ctx.opp.hand.filter((c) => isItemCard(ctx.state.cards, c));
        ctx.opp.hand = ctx.opp.hand.filter((c) => !items.includes(c));
        ctx.opp.discard.push(...items);
        if (items.length) ctx.log(`Discarded ${items.map((c) => name(ctx, c)).join(', ')}.`, ctx.opp.id);
      },
    },
  },
};
