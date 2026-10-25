// Supreme Victors (pl3) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Several are the engine's own rules, named by a flag: Pump Up and Gravitation (refreshHideout), Root Protector, Marvel Eyes,
// Focus Wall, Marvel Shell, Aqua Mirage, Compound Eyes, Erasing Sound and Burning Spirit (attacks.ts), Green Aroma
// (afflictionBlocked, the attacks' inflict, refreshHideout). The powers that work as their Pokémon evolves, is benched or
// levels up are asked then (mayUse): Evolutionary Flame, Evolutionary Pollen, Disrupting Spy, Darkness Send, Healing Breath.
// From the text: Dragon Intimidation's Energy card is picked by Garchomp's player when they differ; Speed Boost takes a basic
// Grass Energy card; Darkness Restore's Basic Pokémon is picked by the player; Dig Down takes any Fighting Energy
// cards among the top 5, one at a time; Plunge moves every Energy card; Call for Power moves one Energy card at a time;
// Energy Recycle's Energy cards go to the Pokémon clicked, then the turn ends.
import { lookupCard, namesMatch } from '../cards.js';
import { counts, energyPool } from '../engine.js';
import { discardsLocked, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { inPlayDef, pokemonName } from '../status.js';
import { swapActive, type PendingChoice } from '../trainers.js';
import { POKE_BODY, targetOf } from './common.js';
import { DP1_POWERS } from './dp1-powers.js';
import { DP2_POWERS } from './dp2-powers.js';
import { onBench, onLevelUp } from './dp5-powers.js';
import { DP6_POWERS } from './dp6-powers.js';
import { DPP_POWERS } from './dpp-powers.js';
import { EX10_POWERS } from './ex10-powers.js';
import { energyCardOf } from './ex2.js';
import { EX8_POWERS } from './ex8-powers.js';

/** "When you play this from your hand to evolve 1 of your Pokémon, you may …": asked as it evolves. */
const onEvolve = (power: Extract<PendingChoice, { kind: 'mayUse' }>['power'], source: string): PowerEffect => ({
  onPlayFromHand(state, owner, pokemon) {
    if (!pokemon.evolvedFrom.length || pokemon.levelUpFrom) return;
    state.pendingChoice = { player: owner.id, source, kind: 'mayUse', power, target: targetOf(owner, pokemon) };
  },
});
const hasInPlay = (s: Pick<PowerSituation, 'me' | 'cards'>, name: string) => ownTargets(s.me).some((t) => namesMatch(inPlayDef(s.cards, pokemonAt(s.me, t)!).name, name));

export const PL3_POWERS: Record<string, PowerEffect> = {
  // Drifblim FB – Pump Up: 40 more HP while the opponent has 3 or fewer Prize cards left (refreshHideout).
  'pl3-3': { ...POKE_BODY, pumpUp: true },
  // Garchomp – Dragon Intimidation: as the Active Pokémon damaged by the opponent's attack, an Energy card of the attacker into the opponent's hand.
  'pl3-5': {
    ...POKE_BODY,
    onAttackDamage(ctx, pokemon) {
      if (ctx.opp.active !== pokemon || !ctx.me.active?.energy.some((e) => !e.provides)) return;
      (ctx.state.queuedChoices ??= []).push({ player: ctx.opp.id, source: 'Dragon Intimidation', kind: 'removeEach', targets: ['active'], toHand: true, afterAttack: true });
    },
  },
  // Magmortar – Evolutionary Flame: as it evolves from the hand, the opponent's Active Pokémon Burned and Confused.
  'pl3-6': onEvolve('evoFlame', 'Evolutionary Flame'),
  // Metagross – Gravitation: every Pokémon in play has 20 less HP (20 however many; refreshHideout).
  'pl3-7': { ...POKE_BODY, gravitation: true },
  // Swampert – Root Protector: 20 less attack damage to it from the opponent's Pokémon that aren't Evolved Pokémon (attacks.ts).
  'pl3-12': { ...POKE_BODY, unevolvedGuard: 20 },
  // Venusaur – Green Aroma: its player's Grass Pokémon have no Special Conditions and can't get any.
  'pl3-13': { ...POKE_BODY, greenAroma: true },
  // Yanmega – Speed Boost: as the Active Pokémon, a Grass Energy card from the discard pile attached to it.
  'pl3-14': {
    oncePerTurn: true,
    blocked: (s) => (s.source !== 'active' ? 'Yanmega must be your Active Pokémon' : s.me.discard.some((c) => energyCardOf(s.cards, c, 'grass')) ? null : 'You have no Grass Energy cards in your discard pile'),
    use(ctx) {
      if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
      ctx.pend({ kind: 'attachFromDiscard', source: 'Speed Boost', count: 1, target: 'active', type: 'grass' });
    },
  },
  // Arcanine G – Extreme Speed: 1 less to retreat for each Fire Energy on it.
  'pl3-15': { ...POKE_BODY, retreatChange: (p, cards) => -energyPool(p, cards).filter((e) => counts(e, 'fire')).length },
  // Butterfree FB – Compound Eyes: 30 more to the opponent's Active Pokémon with a Poké-Body (attacks.ts).
  'pl3-17': { ...POKE_BODY, compoundEyes: true },
  // Dewgong – Thick Fat: as EX Unseen Forces Spheal's.
  'pl3-24': EX10_POWERS['ex10-42']!,
  // Dodrio – Echo Draw: as EX Deoxys Dodrio's.
  'pl3-25': EX8_POWERS['ex8-10']!,
  // Exploud – Erasing Sound: its player's Pokémon have no Weakness (attacks.ts).
  'pl3-28': { ...POKE_BODY, erasingSound: true },
  // Honchkrow – Darkness Restore: as the Active Pokémon, a Basic Pokémon from the opponent's discard pile onto their Bench.
  'pl3-29': {
    oncePerTurn: true,
    blocked(s) {
      if (s.source !== 'active') return 'Honchkrow must be your Active Pokémon';
      if (s.opp.bench.every(Boolean)) return "Your opponent's Bench is full";
      return s.opp.discard.some((c) => {
        const d = lookupCard(s.cards, c.defId);
        return d.kind === 'pokemon' && d.stage === 'basic' && !d.trainerText;
      }) ? null : "Your opponent has no Basic Pokémon in their discard pile";
    },
    use(ctx) {
      if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
      ctx.pend({ kind: 'darknessRestore', source: 'Darkness Restore' });
    },
  },
  // Lunatone – Marvel Eyes: with Solrock in play, nothing from the opponent's Pokémon LV.X to its player's Lunatone and Solrock (attacks.ts).
  'pl3-32': { ...POKE_BODY, marvelEyes: true },
  // Mr. Mime – Focus Wall: Knocked Out by an attack doing 70 or more, it's left with 10 HP instead (attacks.ts).
  'pl3-37': { ...POKE_BODY, focusWall: true },
  // Roserade C – Natural Cure: as Legends Awakened Roserade's.
  'pl3-40': DP6_POWERS['dp6-37']!,
  // Sandslash – Dig Down: any Fighting Energy cards among the top 5 into the hand, shown; the rest shuffled back.
  'pl3-42': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      const looked = ctx.me.deck.slice(0, 5);
      ctx.log(`Dig Down: looked at the top ${looked.length} cards of the deck.`);
      ctx.pend({ kind: 'pickFromTop', source: 'Dig Down', looked: looked.map((c) => c.uid), take: looked.length, basicEnergy: true, energyType: 'fighting' });
    },
  },
  // Shedinja – Marvel Shell: nothing from the opponent's Pokémon that have a Poké-Power or Poké-Body (attacks.ts).
  'pl3-44': { ...POKE_BODY, marvelShell: true },
  // Solrock – Sunshine Fate: with Lunatone in play, the top 3 cards of the deck rearranged.
  'pl3-45': {
    oncePerTurn: true,
    blocked: (s) => (!hasInPlay(s, 'Lunatone') ? 'You have no Lunatone in play' : s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'arrangeTop', source: 'Sunshine Fate', count: Math.min(3, ctx.me.deck.length) }),
  },
  // Chatot G – Disrupting Spy: as it's benched from the hand, the top 4 cards of the opponent's deck rearranged.
  'pl3-54': onBench('disruptingSpy', 'Disrupting Spy'),
  // Ivysaur – Evolutionary Pollen: as it evolves from the hand, the opponent's Active Pokémon Asleep.
  'pl3-62': onEvolve('darknessShade', 'Evolutionary Pollen'),
  // Marshtomp – Plunge: from the Bench, heads: every Energy card of the Active Pokémon moved to it, then it's switched in.
  'pl3-67': {
    oncePerTurn: true,
    blocked: (s) => (s.source === 'active' ? 'Marshtomp must be on your Bench' : s.me.active ? null : 'You have no Active Pokémon'),
    use(ctx) {
      const slot = ctx.sourceTarget;
      const active = ctx.me.active;
      if (typeof slot !== 'number' || !active || !ctx.flip()) return;
      const moved = active.energy.filter((e) => !e.provides);
      active.energy = active.energy.filter((e) => !moved.includes(e));
      ctx.source.energy.push(...moved);
      ctx.log(`Moved ${moved.length} Energy card${moved.length === 1 ? '' : 's'} to ${pokemonName(ctx.state, ctx.source)}.`);
      swapActive(ctx.state, ctx.me, slot);
    },
  },
  // Masquerain – Intimidating Pattern: as EX Deoxys Masquerain's.
  'pl3-68': EX8_POWERS['ex8-39']!,
  // Metang – Metallic Lift: as EX Deoxys Metang's.
  'pl3-69': EX8_POWERS['ex8-26']!,
  // Chingling – Baby Evolution: as Mysterious Treasures'. Mime Jr. – Baby Evolution: as Diamond & Pearl's.
  'pl3-98': DP2_POWERS['dp2-42']!,
  'pl3-115': DP1_POWERS['dp1-90']!,
  // Absol G LV.X – Darkness Send: as it levels up, 3 coins, the top card of the opponent's deck into the Lost Zone for each heads.
  'pl3-141': onLevelUp('darknessSend', 'Darkness Send'),
  // Blaziken FB LV.X – Burning Spirit: attack damage to a Burned Pokémon is 40 more (40 however many; attacks.ts).
  'pl3-142': { ...POKE_BODY, burningSpirit: true },
  // Charizard G LV.X – Call for Power: any number of times, an Energy card moved from one of the player's Pokémon to it.
  'pl3-143': {
    blocked: (s) => (ownTargets(s.me).some((t) => t !== s.source && pokemonAt(s.me, t)!.energy.some((e) => !e.provides)) ? null : 'None of your other Pokémon has an Energy card'),
    choices(s, c) {
      const from = c.from === undefined ? null : pokemonAt(s.me, c.from);
      return [
        { kind: 'ownPokemon', field: 'from', options: ownTargets(s.me).filter((t) => t !== s.source && pokemonAt(s.me, t)!.energy.some((e) => !e.provides)), prompt: 'Call for Power: choose one of your Pokémon to move an Energy card from' },
        ...(from ? [{ kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: from.energy.filter((e) => !e.provides), prompt: 'Choose the Energy card to move to Charizard G' }] : []),
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
  // Electivire FB LV.X – Energy Recycle: the turn ends; up to 3 Energy cards from the discard pile attached to the player's Pokémon.
  'pl3-144': {
    oncePerTurn: true,
    use(ctx) {
      ctx.state.endTurnNow = true;
      ctx.log('The turn ends.');
      if (discardsLocked([ctx.me, ctx.opp], ctx.state.cards)) return ctx.log('Allergic Pollen: cards in discard piles are not affected.');
      if (ctx.me.discard.some((c) => lookupCard(ctx.state.cards, c.defId).kind === 'energy')) ctx.pend({ kind: 'attachFromDiscard', source: 'Energy Recycle', count: 3, anyEnergy: true, optional: true });
    },
  },
  // Garchomp C LV.X – Healing Breath; Rayquaza C LV.X – Dragon Spirit: as the DP Black Star Promos'.
  'pl3-145': DPP_POWERS['dpp-DP46']!,
  'pl3-146': DPP_POWERS['dpp-DP47']!,
  // Staraptor FB LV.X – Fast Call: a Supporter card from the deck into the hand, shown.
  'pl3-147': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Fast Call', filter: 'supporter', reveal: true }),
  },
  // Milotic – Aqua Mirage: with no cards in the hand, no damage to it from the opponent's attacks (attacks.ts).
  'pl3-SH7': { ...POKE_BODY, aquaMirage: true },
};

