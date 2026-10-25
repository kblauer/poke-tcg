// Undaunted (hgss3) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Defense Sign, Allergy Flower (`noTrainers`, as Dark Vileplume's Hay Fever: every Trainer card, either player's), Red Armor,
// Evolution Memories and Space Virus are the engine's own rules. Claw Snag (as Weavile evolves) and DARK (as Unown is benched)
// are asked then (mayUse).
// From the text: Hustle Step needs a damaged Pokémon; Mischievous Trick's Prize card is one at random (they're face down);
// Voltage Increase moves one Lightning Energy card at a time; Opponent's Choice's opponent picks the card for the hand;
// Cloud-Covered Moon works only for the Active Umbreon; Dodrio's Retreat Aid helps any Active Pokémon, Pokémon-ex and
// Baby Pokémon too (unlike EX FireRed & LeafGreen's).
import { lookupCard } from '../cards.js';
import { activeLock, afflictBetweenTurns, type Target } from '../engine.js';
import { ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { nextRandom } from '../rng.js';
import { pokemonName } from '../status.js';
import { onlyActive, POKE_BODY, targetOf } from './common.js';
import { onBench } from './dp5-powers.js';
import { energyCardOf } from './ex2.js';

/** "When you play this from your hand to evolve 1 of your Pokémon, you may …": a yes-or-no question as it evolves. */
const onEvolve = (power: 'clawSnag', source: string): PowerEffect => ({
  onPlayFromHand(state, owner, pokemon) {
    if (pokemon.evolvedFrom.length) state.pendingChoice = { player: owner.id, source, kind: 'mayUse', power, target: targetOf(owner, pokemon) };
  },
});
/** The player's Pokémon other than Raichu with a Lightning Energy card attached (Voltage Increase). */
const lightningDonors = (s: PowerSituation): Target[] => ownTargets(s.me).filter((t) => t !== s.source && pokemonAt(s.me, t)!.energy.some((e) => !e.provides && energyCardOf(s.cards, e, 'lightning')));

export const HGSS3_POWERS: Record<string, PowerEffect> = {
  // Bellossom – Hustle Step: a damage counter off each of the player's Pokémon.
  'hgss3-1': {
    oncePerTurn: true,
    blocked: (s) => (ownTargets(s.me).some((t) => pokemonAt(s.me, t)!.damage > 0) ? null : 'None of your Pokémon has damage counters'),
    use(ctx) {
      for (const t of ownTargets(ctx.me)) {
        const p = pokemonAt(ctx.me, t)!;
        if (p.damage) p.damage -= 10;
      }
      ctx.log('Removed a damage counter from each of your Pokémon.');
    },
  },
  // Smeargle – Portrait: as the Active Pokémon, the effect of a Supporter card in the opponent's hand.
  'hgss3-8': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Smeargle') ?? (s.counts.oppHand ? null : "Your opponent's hand is empty"),
    use: (ctx) => ctx.pend({ kind: 'supernatural', source: 'Portrait' }),
  },
  // Dodrio – Retreat Aid: on the Bench, the Active Pokémon retreats for 2 less (retreatAid).
  'hgss3-11': { ...POKE_BODY, retreatAidCost: 2, retreatAidAll: true },
  // Rotom – Mischievous Trick: one of the Prize cards (at random: face down) switched with the top card of the deck.
  'hgss3-20': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.prizes - (s.counts.faceUpPrizes ?? 0) <= 0 ? 'You have no face-down Prize cards' : s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const down = ctx.me.prizes.flatMap((c, i) => (ctx.me.faceUpPrizes?.includes(c.uid) ? [] : [i]));
      const top = down.length ? ctx.me.deck.shift() : undefined;
      if (!top) return;
      const [r, next] = nextRandom(ctx.state.rngState);
      ctx.state.rngState = next;
      const i = down[Math.floor(r * down.length)]!;
      const prize = ctx.me.prizes[i]!;
      ctx.me.prizes[i] = top;
      ctx.me.deck.unshift(prize);
      ctx.log('Switched a Prize card with the top card of the deck.');
    },
  },
  // Vespiquen – Defense Sign: no attack damage to its player's Benched Grass Pokémon (attacks.ts).
  'hgss3-23': { ...POKE_BODY, defenseSign: true },
  // Vileplume – Allergy Flower: neither player can play Trainer cards from their hand.
  'hgss3-24': { ...POKE_BODY, noTrainers: true },
  // Weavile – Claw Snag: as it evolves, a card from the opponent's hand discarded.
  'hgss3-25': onEvolve('clawSnag', 'Claw Snag'),
  // Unown – DARK: as it's benched from the hand, a Darkness Energy card from the deck, shown.
  'hgss3-40': onBench('unownDark', 'DARK'),
  // Slugma – Active Volcano: the top card discarded; a Fire Energy card is attached to Slugma instead.
  'hgss3-67': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const top = ctx.me.deck.shift();
      if (!top) return;
      const name = lookupCard(ctx.state.cards, top.defId).name;
      if (energyCardOf(ctx.state.cards, top, 'fire')) {
        ctx.source.energy.push(top);
        ctx.log(`Attached ${name} from the top of the deck to ${pokemonName(ctx.state, ctx.source)}.`);
      } else {
        ctx.me.discard.push(top);
        ctx.log(`Discarded ${name} from the top of the deck.`);
      }
    },
  },
  // Espeon – Evolution Memories: the attacks of the player's Pokémon in play that evolve from Eevee (usableAttacks).
  'hgss3-81': { ...POKE_BODY, evolutionMemories: true },
  // Houndoom – Fire Breath: heads, the Defending Pokémon is now Burned.
  'hgss3-82': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.active ? null : 'Your opponent has no Active Pokémon'),
    use(ctx) {
      if (ctx.flip() && ctx.opp.active) afflictBetweenTurns(ctx.state, ctx.opp.id, ctx.opp.active, 'burned');
    },
  },
  // Raichu – Voltage Increase: any number of times, a Lightning Energy card moved from another of the player's Pokémon to Raichu.
  'hgss3-83': {
    blocked: (s) => (lightningDonors(s).length ? null : 'None of your other Pokémon has a Lightning Energy card'),
    choices(s, c) {
      const from = c.from === undefined ? null : pokemonAt(s.me, c.from);
      return [
        { kind: 'ownPokemon', field: 'from', options: lightningDonors(s), prompt: 'Choose one of your Pokémon to move a Lightning Energy card from' },
        ...(from ? [{ kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: from.energy.filter((e) => !e.provides && energyCardOf(s.cards, e, 'lightning')), prompt: 'Choose the Lightning Energy card to move' }] : []),
      ];
    },
    use(ctx) {
      const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
      const card = from?.energy.find((e) => e.uid === ctx.choices.energyUid);
      if (!from || !card || from === ctx.source) return;
      from.energy = from.energy.filter((e) => e !== card);
      ctx.source.energy.push(card);
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, ctx.source)}.`);
    },
  },
  // Scizor – Red Armor: no damage from the opponent's Pokémon with a Special Energy card attached (attacks.ts).
  'hgss3-84': { ...POKE_BODY, redArmor: true },
  // Slowking – Opponent's Choice: the top 2 cards shown; the opponent picks the one for the hand, the other to the bottom.
  'hgss3-85': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const top = ctx.me.deck.slice(0, 2);
      ctx.log(`Opponent's Choice shows ${top.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ')}.`);
      if (top.length === 1) {
        ctx.me.hand.push(...ctx.me.deck.splice(0, 1));
        return;
      }
      ctx.state.pendingChoice = { player: ctx.opp.id, source: "Opponent's Choice", kind: 'marley', uids: top.map((c) => c.uid), fromDeck: true };
    },
  },
  // Umbreon – Cloud-Covered Moon: as the Active Pokémon, heads returns it and its cards to the hand.
  'hgss3-86': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Umbreon') ?? activeLock(s.me, [s.me, s.opp], s.cards),
    use(ctx) {
      const active = ctx.me.active;
      if (!active || !ctx.flip()) return;
      ctx.me.hand.push(...active.evolvedFrom, active.card, ...active.energy.map(({ provides: _, ...card }) => card), ...(active.attached ?? []).map((a) => a.card));
      ctx.me.active = null;
      ctx.log(`${pokemonName(ctx.state, active)} and all cards attached to it returned to the hand.`);
    },
  },
  // Rayquaza & Deoxys LEGEND – Space Virus: 1 more Prize card for a Pokémon its attack's damage Knocks Out (engine.ts).
  'hgss3-89': { ...POKE_BODY, spaceVirus: true },
  'hgss3-90': { ...POKE_BODY, spaceVirus: true },
};
