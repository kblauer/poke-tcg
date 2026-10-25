// Legends Awakened (dp6) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Several are the engine's own rules, named by a flag: Rivalry, Enthusiasm, Revenge Fang, Steel Coating, Fossil Armor, WALL,
// Psychic Aura, Psybarrier, UNSEEN and White Smoke (as Aurora Veil) in attacks.ts, Slow Start (attackError), Ditto DNA (as
// Mimic, its HP in refreshHideout), Resent (resolveKnockouts). The powers that work as their Pokémon is benched, evolves or
// levels up are asked then (mayUse): Curse Breath, Time Walk, Psychic Bind, !, Set Up, JUNK, Cast-off Shell, Shoot Poison,
// and Iron Shell as its Energy card is attached.
// From the text: Form Change finds any of the four Deoxys formes, Temperament any of the four Castform (one of each a turn for
// the player); Speed Gain takes the first basic Fire or Lightning Energy cards picked; Regi Move, Regi Cycle and Regi Heal
// discard their 2 cards first; Time Walk puts a card back only if a Pokémon was taken; Energy Reaction works by itself (it can
// only help); Metal Chain is once a turn for each Beldum; ? asks the opponent the Pokémon's first type (the CPU at random).
import { lookupCard, namesMatch, typesOf, type EnergyType } from '../cards.js';
import { afflictBetweenTurns, opponentOf, type Target } from '../engine.js';
import { discardsLocked, ownTargets, pokemonAt, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, clearSpecialConditions, hasSpecialCondition, inPlayDef, pokemonName } from '../status.js';
import { swapActive } from '../trainers.js';
import { inPlay, onlyBenched, POKE_BODY, targetOf } from './common.js';
import { onBench, onLevelUp } from './dp5-powers.js';
import { EX10_POWERS } from './ex10-powers.js';
import { energyCardOf } from './ex2.js';
import { EX5_POWERS } from './ex5-powers.js';

const DEOXYS = ['Deoxys Normal Forme', 'Deoxys Attack Forme', 'Deoxys Defense Forme', 'Deoxys Speed Forme'];
const CASTFORM = ['Castform', 'Castform Rain Form', 'Castform Snow-cloud Form', 'Castform Sunny Form'];
/** The type names "?" offers the opponent. */
const TYPES: EnergyType[] = ['grass', 'fire', 'water', 'lightning', 'psychic', 'fighting', 'darkness', 'metal', 'colorless'];

/** Form Change, Temperament: once a turn for the player, another of `names` from the deck takes this one's place, with everything on it. */
const swapForm = (names: string[], source: 'Form Change' | 'Temperament'): PowerEffect => ({
  blocked: (s) => ((s.me.powerTurns?.[source] ?? -1) >= s.turn ? `${source} has already been used this turn` : s.counts.deck ? null : 'Your deck is empty'),
  use(ctx) {
    ctx.me.powerTurns = { ...ctx.me.powerTurns, [source]: ctx.state.turn };
    ctx.pend({ kind: 'castform', source, target: ctx.sourceTarget, names });
  },
});
/** Flash Fire, Smelt: once a turn, an Energy card of a type moved from another of the player's Pokémon to this one. */
const draw = (type: 'fire' | 'metal', name: string): PowerEffect => ({
  oncePerTurn: true,
  blocked: (s) => (donors(s, type).length ? null : `None of your other Pokémon has ${type === 'fire' ? 'Fire' : 'Metal'} Energy attached`),
  choices(s, c) {
    const from = typeof c.from === 'number' || c.from === 'active' ? pokemonAt(s.me, c.from) : null;
    return [
      { kind: 'ownPokemon', field: 'from', options: donors(s, type), prompt: `Choose one of your Pokémon to move a ${type === 'fire' ? 'Fire' : 'Metal'} Energy card from` },
      ...(from ? [{ kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: from.energy.filter((e) => energyCardOf(s.cards, e, type)), prompt: `Choose the Energy card to move to ${name}` }] : []),
    ];
  },
  use(ctx) {
    const from = ctx.choices.from === undefined ? null : pokemonAt(ctx.me, ctx.choices.from);
    const card = from?.energy.find((e) => e.uid === ctx.choices.energyUid);
    if (!from || !card || from === ctx.source) return;
    from.energy = from.energy.filter((e) => e !== card);
    ctx.source.energy.push(card);
    ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${name}.`);
  },
});
/** The player's other Pokémon with an Energy card of a type attached. */
const donors = (s: PowerSituation, type: 'fire' | 'metal'): Target[] => ownTargets(s.me).filter((t) => t !== s.source && pokemonAt(s.me, t)!.energy.some((e) => energyCardOf(s.cards, e, type)));
/** The Regi powers' "discard 2 cards from your hand", then `then`. */
const regi = (blocked: (s: PowerSituation) => string | null, then: NonNullable<PowerEffect['use']>): PowerEffect => ({
  oncePerTurn: true,
  blocked: (s) => (s.me.hand.length < 2 ? 'You need 2 cards in your hand to discard' : blocked(s)),
  use(ctx) {
    ctx.pend({ kind: 'discardFromHand', source: pokemonPowerName(ctx), count: 2 });
    then(ctx);
  },
});
const pokemonPowerName = (ctx: Parameters<NonNullable<PowerEffect['use']>>[0]) => inPlayDef(ctx.state.cards, ctx.source).power?.name ?? 'Power';

export const DP6_POWERS: Record<string, PowerEffect> = {
  // Deoxys – Form Change; Castform – Temperament.
  'dp6-1': swapForm(DEOXYS, 'Form Change'),
  'dp6-24': swapForm(DEOXYS, 'Form Change'),
  'dp6-25': swapForm(DEOXYS, 'Form Change'),
  'dp6-26': swapForm(DEOXYS, 'Form Change'),
  'dp6-48': swapForm(CASTFORM, 'Temperament'),
  'dp6-49': swapForm(CASTFORM, 'Temperament'),
  'dp6-50': swapForm(CASTFORM, 'Temperament'),
  'dp6-51': swapForm(CASTFORM, 'Temperament'),
  // Heatran – Flash Fire; Heatran – Smelt.
  'dp6-6': draw('fire', 'Heatran'),
  'dp6-30': draw('metal', 'Heatran'),
  // Luxray – Rivalry; Politoed – Enthusiasm; Probopass – Steel Coating; Regigigas – Slow Start; Armaldo – Fossil Armor;
  // Houndoom – Revenge Fang; Unown U – UNSEEN; Unown W – WALL; Azelf LV.X – Psychic Aura; Mewtwo LV.X – Psybarrier.
  'dp6-8': { ...POKE_BODY, rivalry: true },
  'dp6-12': { ...POKE_BODY, enthusiasm: true },
  'dp6-13': { ...POKE_BODY, steelCoating: true },
  'dp6-15': { ...POKE_BODY, slowStart: true },
  'dp6-18': { ...POKE_BODY, fossilArmor: true },
  'dp6-57': { ...POKE_BODY, revengeFang: true },
  'dp6-78': { ...POKE_BODY, unseen: true },
  'dp6-80': { ...POKE_BODY, wall: 10 },
  'dp6-140': { ...POKE_BODY, psychicAura: true },
  'dp6-144': { ...POKE_BODY, psybarrier: true },
  // Torkoal – White Smoke: as the Active Pokémon, nothing from the opponent's attacks to the Benched Pokémon (as Aurora Veil).
  'dp6-41': { ...POKE_BODY, auroraVeil: true },
  // Ditto – Ditto DNA (as Mimic, its HP in refreshHideout).
  'dp6-27': { ...POKE_BODY, mimic: true, dittoDna: true },
  // Shedinja – Resent (resolveKnockouts).
  'dp6-40': { resent: true },
  // Metagross – Magnetic Reversal: heads, one of the opponent's Benched Pokémon (picked first) switched in.
  'dp6-10': {
    oncePerTurn: true,
    blocked: (s) => (s.opp.bench.some(Boolean) ? null : 'Your opponent has no Benched Pokémon'),
    choices: (s) => [{ kind: 'oppPokemon', field: 'oppTo', options: s.opp.bench.flatMap((p, i) => (p ? [i] : [])), prompt: "Choose one of your opponent's Benched Pokémon to switch in (if heads)" }],
    use(ctx) {
      if (!ctx.flip()) return ctx.log('Magnetic Reversal did nothing.');
      const slot = ctx.choices.oppTo;
      if (typeof slot === 'number' && ctx.opp.bench[slot]) swapActive(ctx.state, ctx.opp, slot);
    },
  },
  // Rayquaza – Speed Gain: coins until tails, a basic Fire or Lightning Energy card from the discard pile attached for each heads.
  'dp6-14': {
    oncePerTurn: true,
    blocked(s) {
      if (inPlay(s.me).filter((p) => namesMatch(inPlayDef(s.cards, p).name, 'Rayquaza')).length > 1) return 'You have another Rayquaza in play';
      if (discardsLocked([s.me, s.opp], s.cards)) return 'Allergic Pollen: cards in discard piles are not affected';
      return null;
    },
    use(ctx) {
      let heads = 0;
      while (heads < 60 && ctx.flip()) heads++;
      const any = ctx.me.discard.some((c) => ['fire', 'lightning'].some((t) => energyCardOf(ctx.state.cards, c, t as 'fire')));
      if (!heads || !any) return ctx.log('Speed Gain attached nothing.');
      ctx.pend({ kind: 'attachFromDiscard', source: 'Speed Gain', count: heads, target: ctx.sourceTarget, types: ['fire', 'lightning'] });
    },
  },
  // Spiritomb – Curse Breath; Azelf – Time Walk; Mesprit – Psychic Bind; Unown ! – !; Uxie – Set Up; Unown J – JUNK (as they're benched).
  'dp6-16': onBench('curseBreath', 'Curse Breath'),
  'dp6-19': onBench('timeWalk', 'Time Walk'),
  'dp6-34': onBench('psychicBind', 'Psychic Bind'),
  'dp6-42': onBench('unownBang', '!'),
  'dp6-43': onBench('setUp', 'Set Up'),
  'dp6-76': onBench('junk', 'JUNK'),
  // Gliscor LV.X – Shoot Poison (as it levels up).
  'dp6-141': onLevelUp('shootPoison', 'Shoot Poison'),
  // Delcatty – Attracting Body: as the Active Pokémon damaged by the opponent's attack, heads: the Attacking Pokémon Confused.
  'dp6-23': {
    ...POKE_BODY,
    onAttackDamage(ctx, pokemon) {
      if (ctx.opp.active !== pokemon || !ctx.oppFlip()) return;
      afflictBetweenTurns(ctx.state, ctx.me.id, ctx.attacker, 'confused');
    },
  },
  // Forretress – Iron Shell: a basic Energy card attached to it from the hand (mayUse).
  'dp6-28': {
    ...POKE_BODY,
    onEnergyFromHand(state, owner, _pokemon, target, energy) {
      const d = lookupCard(state.cards, energy.defId);
      if (d.kind !== 'energy' || d.basic === false) return;
      const choice = { player: owner.id, source: 'Iron Shell', kind: 'mayUse' as const, power: 'ironShell' as const, target };
      if (state.pendingChoice) (state.queuedChoices ??= []).push(choice);
      else state.pendingChoice = choice;
    },
  },
  // Lopunny – Healing Tail: as the Active Pokémon, a damage counter off each Benched Pokémon between turns.
  'dp6-33': {
    ...POKE_BODY,
    checkup(state, owner, pokemon) {
      if (owner.active !== pokemon) return;
      for (const p of owner.bench) if (p?.damage) p.damage -= 10;
      addLog(state, 'Healing Tail: a damage counter off each Benched Pokémon.', owner.id);
    },
  },
  // Regice – Regi Move: 2 cards discarded; the opponent switches their Active Pokémon that isn't an Evolved Pokémon.
  'dp6-36': regi(
    (s) => (!s.opp.active || s.opp.active.evolvedFrom.length ? "Your opponent's Active Pokémon is an Evolved Pokémon" : s.opp.bench.some(Boolean) ? null : 'Your opponent has no Benched Pokémon'),
    (ctx) => void (ctx.state.queuedChoices ??= []).push({ player: ctx.opp.id, source: 'Regi Move', kind: 'switchIn' }),
  ),
  // Regigigas – Recover Mechanism: an Energy card attached to it from the hand removes its Special Conditions.
  'dp6-37': {
    ...POKE_BODY,
    onEnergyFromHand(state, owner, pokemon) {
      if (!hasSpecialCondition(pokemon)) return;
      clearSpecialConditions(pokemon);
      addLog(state, `Recover Mechanism: ${pokemonName(state, pokemon)} has no Special Conditions.`, owner.id);
    },
  },
  // Regirock – Regi Cycle: 2 cards discarded, then a Fighting Energy card from the discard pile attached to it.
  'dp6-38': regi(
    (s) => (discardsLocked([s.me, s.opp], s.cards) ? 'Allergic Pollen: cards in discard piles are not affected' : s.me.discard.some((c) => energyCardOf(s.cards, c, 'fighting')) ? null : 'No Fighting Energy cards in your discard pile'),
    (ctx) => void (ctx.state.queuedChoices ??= []).push({ player: ctx.me.id, source: 'Regi Cycle', kind: 'attachFromDiscard', count: 1, target: ctx.sourceTarget, type: 'fighting' }),
  ),
  // Registeel – Regi Heal: 2 cards discarded, 3 damage counters off it.
  'dp6-39': regi(
    (s) => (pokemonAt(s.me, s.source)?.damage ? null : 'Registeel has no damage counters'),
    (ctx) => {
      const healed = Math.min(30, ctx.source.damage);
      ctx.source.damage -= healed;
      ctx.log(`Removed ${healed / 10} damage counters from Registeel.`);
    },
  ),
  // Vileplume – Energy Reaction: a Grass Energy card attached to it from the hand makes the Defending Pokémon Asleep, a Psychic one Poisoned.
  'dp6-45': {
    onEnergyFromHand(state, owner, _pokemon, _target, energy) {
      const key = 'Energy Reaction';
      const opp = state.players[opponentOf(state, owner.id)]!;
      if (state.currentPlayer !== owner.id || (owner.powerTurns?.[key] ?? -1) >= state.turn || !opp.active) return;
      const grass = energyCardOf(state.cards, energy, 'grass');
      const psychic = energyCardOf(state.cards, energy, 'psychic');
      if (!grass && !psychic) return;
      owner.powerTurns = { ...owner.powerTurns, [key]: state.turn };
      afflictBetweenTurns(state, opp.id, opp.active, grass ? 'asleep' : 'poisoned');
    },
  },
  // Ninjask – Cast-off Shell: evolving from the hand, with room on the Bench (mayUse).
  'dp6-67': {
    onPlayFromHand(state, owner, pokemon) {
      if (!pokemon.evolvedFrom.length || pokemon.levelUpFrom || !owner.bench.some((p) => !p)) return;
      const has = (pile: { defId: string }[]) => pile.some((c) => lookupCard(state.cards, c.defId).name === 'Shedinja');
      if (!has(owner.hand) && !has(owner.discard)) return;
      state.pendingChoice = { player: owner.id, source: 'Cast-off Shell', kind: 'mayUse', power: 'castOffShell', target: targetOf(owner, pokemon) };
    },
  },
  // Swellow – Big Wing: as EX Hidden Legends'. Tyrogue – Baby Evolution: as EX Unseen Forces'.
  'dp6-73': EX5_POWERS['ex5-77']!,
  'dp6-126': EX10_POWERS['ex10-33']!,
  // Unown R – RETIRE: from the Bench, it and its cards discarded, then a card drawn.
  'dp6-77': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Unown R'),
    use(ctx) {
      const unown = ctx.source;
      ctx.me.discard.push(...unown.evolvedFrom, unown.card, ...unown.energy.map(({ provides: _, ...card }) => card), ...(unown.attached ?? []).map((a) => a.card));
      ctx.me.bench = ctx.me.bench.map((p) => (p === unown ? null : p));
      ctx.log('Discarded Unown R and its cards.');
      const drawn = ctx.me.deck.shift();
      if (!drawn) return;
      ctx.me.hand.push(drawn);
      ctx.log('Drew a card.');
    },
  },
  // Unown V – VACATION: 2 damage counters off each of the player's Pokémon; then the turn ends.
  'dp6-79': {
    oncePerTurn: true,
    use(ctx) {
      for (const p of inPlay(ctx.me)) p.damage = Math.max(0, p.damage - 20);
      ctx.log('VACATION: 2 damage counters off each of your Pokémon.');
      ctx.state.endTurnNow = true;
    },
  },
  // Unown Y – YAWN: from the Bench, a damage counter off the Active Unown, which falls Asleep.
  'dp6-81': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Unown Y') ?? (s.me.active && inPlayDef(s.cards, s.me.active).name.startsWith('Unown') ? null : 'Your Active Pokémon is not an Unown'),
    use(ctx) {
      const active = ctx.me.active;
      if (!active) return;
      if (active.damage) active.damage -= 10;
      afflictBetweenTurns(ctx.state, ctx.me.id, active, 'asleep');
    },
  },
  // Unown ? – ?: from the Bench, a Pokémon in the hand put face down; the opponent guesses its type; wrong, a card drawn.
  'dp6-82': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Unown ?') ?? (pokemonInHand(s).length ? null : 'You have no Pokémon in your hand'),
    choices: (s) => [{ kind: 'handCard', field: 'cardUid', options: pokemonInHand(s), prompt: 'Choose a Pokémon in your hand to put face down' }],
    use(ctx) {
      const card = ctx.me.hand.find((c) => c.uid === ctx.choices.cardUid);
      const d = card && lookupCard(ctx.state.cards, card.defId);
      if (!card || d?.kind !== 'pokemon') return;
      const types = typesOf(d);
      ctx.state.pendingChoice = { player: ctx.opp.id, source: '?: your opponent has put a Pokémon face down. Guess one of its types (wrong: they draw a card)', kind: 'guess', card, labels: TYPES.map((t) => t[0]!.toUpperCase() + t.slice(1)), answer: TYPES.indexOf(types[0]!), draw: 1, onlyWrong: true };
    },
  },
  // Beldum – Metal Chain: a Metal Energy card attached to it from the hand, a Beldum from the deck onto the Bench (once a turn for each).
  'dp6-83': {
    onEnergyFromHand(state, owner, pokemon, _target, energy) {
      const key = `Metal Chain ${pokemon.card.uid}`;
      if (state.currentPlayer !== owner.id || (owner.powerTurns?.[key] ?? -1) >= state.turn || !energyCardOf(state.cards, energy, 'metal') || !owner.bench.some((p) => !p) || !owner.deck.length) return;
      owner.powerTurns = { ...owner.powerTurns, [key]: state.turn };
      state.pendingChoice = { player: owner.id, source: 'Metal Chain', kind: 'pickFromDeck', filter: 'basicNamed', name: 'Beldum', toBench: true, optional: true };
    },
  },
  // Magnezone LV.X – Electric Trans: any number of times, a Lightning or Metal Energy card moved between the player's Pokémon.
  'dp6-142': {
    blocked: (s) => (ownTargets(s.me).length > 1 && transferable(s).length ? null : 'None of your Pokémon has Lightning or Metal Energy to move'),
    choices(s, c) {
      const from = c.from === undefined ? null : pokemonAt(s.me, c.from);
      return [
        { kind: 'ownPokemon', field: 'from', options: transferable(s), prompt: 'Choose one of your Pokémon to move a Lightning or Metal Energy card from' },
        ...(from ? [{ kind: 'attachedEnergy' as const, field: 'energyUid' as const, options: from.energy.filter((e) => energyCardOf(s.cards, e, 'lightning') || energyCardOf(s.cards, e, 'metal')), prompt: 'Choose the Energy card to move' }] : []),
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
      ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, to)}.`);
    },
  },
  // Uxie LV.X – Trade Off: one of the top 2 cards into the hand, the other on the bottom; once a turn for the player.
  'dp6-146': {
    oncePerTurn: true,
    blocked: (s) => ((s.me.powerTurns?.['Trade Off'] ?? -1) >= s.turn ? 'You already used Trade Off this turn' : s.counts.deck ? null : 'Your deck is empty'),
    use(ctx) {
      ctx.me.powerTurns = { ...ctx.me.powerTurns, 'Trade Off': ctx.state.turn };
      ctx.pend({ kind: 'pickFromTop', source: 'Trade Off', looked: ctx.me.deck.slice(0, 2).map((c) => c.uid), take: 1, shuffleRest: true, toBottom: true });
    },
  },
};

/** The player's Pokémon with Lightning or Metal Energy cards attached (Electric Trans). */
function transferable(s: PowerSituation): Target[] {
  return ownTargets(s.me).filter((t) => pokemonAt(s.me, t)!.energy.some((e) => energyCardOf(s.cards, e, 'lightning') || energyCardOf(s.cards, e, 'metal')));
}

/** Pokémon cards in the player's hand (?). */
function pokemonInHand(s: PowerSituation) {
  return s.me.hand.filter((c) => {
    const d = lookupCard(s.cards, c.defId);
    return d.kind === 'pokemon' && !d.trainerText;
  });
}
