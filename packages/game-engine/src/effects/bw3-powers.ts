// Noble Victories (bw3) Abilities, by card id. Every Ability is a kind of its own (agreed: ABILITY).
// From the text: Leaf Tailor reaches every Pokémon of its player's with any Energy attached, Leavanny too; Victory Star re-flips
// all of an attack's coins once a turn, however many Victini (the attack happens again from where it started, as with Sabrina's
// ESP); Solid Rock and Durable Body are their owner's flips, against the opponent's attacks; Cursed Body and Rough Skin work
// only while their Pokémon is the Active one, even as it's Knocked Out; Dynamotor takes a Lightning Energy card, basic or Special
// (energyCardOf), onto a Benched Pokémon, once a turn for each Eelektrik; Cursed Shadow's 3 damage counters go one at a time on
// any of the opponent's Pokémon; Craftsmanship counts the Fighting Energy provided; Ancient Power stops Pokémon played from either
// hand to evolve (Rare Candy, Pokémon Breeder too), not evolving by other effects; Dark Aura makes all its Energy Darkness.
import { afflictBetweenTurns, counts, energyPool } from '../engine.js';
import { lookupCard } from '../cards.js';
import { pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { inPlayDef } from '../status.js';
import { ABILITY, onlyActive } from './common.js';
import { energyCardOf } from './ex2.js';

/** The Lightning Energy cards in the player's discard pile (Dynamotor). */
const discardLightning = (s: PowerSituation) => s.me.discard.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy' && energyCardOf(s.cards, c, 'lightning'));
const benchTargets = (s: PowerSituation) => s.me.bench.flatMap((p, i) => (p ? [i] : []));

/** "If this Pokémon is your Active Pokémon and is damaged by an opponent's attack (even if it's Knocked Out), put 2 damage counters on the Attacking Pokémon" (Rough Skin). */
export const roughSkin: PowerEffect = {
  ...ABILITY,
  onAttackDamage(ctx, pokemon) {
    if (ctx.opp.active !== pokemon) return;
    ctx.attacker.damage += 20;
    ctx.log(`${inPlayDef(ctx.state.cards, pokemon).power?.name ?? 'Rough Skin'} put 2 damage counters on ${ctx.attackerDef.name}.`, ctx.opp.id);
  },
};

/** "If this Pokémon is your Active Pokémon and is damaged by an opponent's attack …, the Attacking Pokémon is now [condition]" (Cursed Body). */
export const strikesWith = (affliction: 'confused' | 'burned'): PowerEffect => ({
  ...ABILITY,
  onAttackDamage(ctx, pokemon) {
    if (ctx.opp.active === pokemon) afflictBetweenTurns(ctx.state, ctx.me.id, ctx.attacker, affliction);
  },
});

export const BW3_POWERS: Record<string, PowerEffect> = {
  // Leavanny – Leaf Tailor: its player's Pokémon with any Energy attached have no Weakness (attacks.ts).
  'bw3-3': { ...ABILITY, leafTailor: true },
  // Victini – Victory Star: once a turn, an attack's coins flipped again (attackAction).
  'bw3-14': { ...ABILITY, victoryStar: true },
  // Carracosta – Solid Rock: heads, 50 less damage from the opponent's attack, after Weakness and Resistance (as Hard Cocoon).
  'bw3-26': { ...ABILITY, hardCocoon: 50 },
  // Jellicent – Cursed Body: as the Active Pokémon damaged by the opponent's attack, the Attacking Pokémon is now Confused.
  'bw3-31': strikesWith('confused'),
  // Eelektrik – Dynamotor: once a turn, a Lightning Energy card from the discard pile onto a Benched Pokémon.
  'bw3-40': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => (!discardLightning(s).length ? 'No Lightning Energy in your discard pile' : benchTargets(s).length ? null : 'You have no Benched Pokémon'),
    choices: (s) => [
      { kind: 'discardCard', field: 'cardUid', options: discardLightning(s), prompt: 'Choose a Lightning Energy card from your discard pile' },
      { kind: 'ownPokemon', field: 'to', options: benchTargets(s), prompt: 'Attach it to one of your Benched Pokémon' },
    ],
    use(ctx) {
      const card = ctx.me.discard.find((c) => c.uid === ctx.choices.cardUid);
      const to = pokemonAt(ctx.me, ctx.choices.to!);
      if (!card || !to || ctx.choices.to === 'active') return;
      ctx.me.discard = ctx.me.discard.filter((c) => c !== card);
      to.energy.push(card);
      ctx.log(`Dynamotor: attached ${lookupCard(ctx.state.cards, card.defId).name} to ${lookupCard(ctx.state.cards, to.card.defId).name}.`);
    },
  },
  // Cofagrigus – Durable Body: heads, not Knocked Out by the opponent's attack's damage; 10 HP left (as Fortitude).
  'bw3-47': { ...ABILITY, fortitude: true },
  // Chandelure – Cursed Shadow: once a turn, as the Active Pokémon, 3 damage counters on the opponent's Pokémon as the player likes.
  'bw3-60': {
    ...ABILITY,
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Chandelure'),
    use: (ctx) => ctx.pend({ kind: 'placeCounters', source: 'Cursed Shadow', count: 3, active: true }),
  },
  // Conkeldurr – Craftsmanship: 20 more HP for each Fighting Energy attached (refreshHideout).
  'bw3-64': { ...ABILITY, hpFor: (p, cards) => 20 * energyPool(p, cards).filter((e) => counts(e, 'fighting')).length },
  // Archeops – Ancient Power: neither player can evolve their Pokémon from the hand (evolutionBlocked).
  'bw3-67': { ...ABILITY, noHandEvolution: true },
  // Hydreigon – Dark Aura: all its Energy is Darkness Energy (energyPool).
  'bw3-79': { ...ABILITY, energyAs: 'darkness' },
  // Druddigon – Rough Skin.
  'bw3-89': roughSkin,
};
