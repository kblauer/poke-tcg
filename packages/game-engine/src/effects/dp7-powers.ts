// Stormfront (dp7) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Several are the engine's own rules, named by a flag: Regi Form and Battle Rush (attackError), Snow Veil (as WALL), Sunny Day,
// Green Dignity, No Guard, Honeycomb Defender, Protect Wing and Poison Enzyme (attacks.ts), Fainting Spell and Ectoplasm
// (resolveKnockouts), Darkness Drive (usePower), Heat Metal (engine.ts), Overeager (START_BATTLE), Link Lightning
// (attackAction: the turn stays open for any other of Raichu's attacks, its questions asked, or End Turn; agreed). The powers that work as their Pokémon evolves are asked then (mayUse): Emperor Aura, Blaze Dance, Sunshine
// Song, Evolutionary Gas.
// From the text: Shadow Command discards down to 6 by the player's picks; Super Connectivity takes a basic Lightning or Metal
// Energy card; Cycler's card goes on top before the search; Sacrifice's Pokémon is Knocked Out (its Prize card taken) before
// the Energy cards are picked, so they can be its; Darkness Drive and Fainting Spell's "you may" are always used; Evolutionary
// Gas's Pokémon can still attack, and the attack does nothing (agreed, `fizzle`).
import { isBasicEnergy, lookupCard } from '../cards.js';
import { afflictBetweenTurns, energyPool, isEnergyCardOf, resolveKnockouts, type Target } from '../engine.js';
import { discardsLocked, ownTargets, pokemonAt, type PowerEffect } from '../powers.js';
import { addLog, inPlayDef, openBenchSlot, pokemonName } from '../status.js';
import { onlyActive, POKE_BODY, targetOf } from './common.js';
import { DP3_POWERS } from './dp3-powers.js';
import { EX1_POWERS } from './ex1-powers.js';
import { EX2_POWERS } from './ex2-powers.js';

type MayPower = 'emperorAura' | 'blazeDance' | 'sunshineSong' | 'evolutionaryGas';
/** "When you play this from your hand to evolve 1 of your (Active) Pokémon, you may …": asked as it evolves. */
const onEvolve = (power: MayPower, source: string, activeOnly = false): PowerEffect => ({
  onPlayFromHand(state, owner, pokemon) {
    if (!pokemon.evolvedFrom.length || pokemon.levelUpFrom || (activeOnly && owner.active !== pokemon)) return;
    state.pendingChoice = { player: owner.id, source, kind: 'mayUse', power, target: targetOf(owner, pokemon) };
  },
});

export const DP7_POWERS: Record<string, PowerEffect> = {
  // Dusknoir – Shadow Command: 2 cards drawn, the hand discarded down to 6 if it has 7 or more, then 2 damage counters on Dusknoir.
  'dp7-1': {
    oncePerTurn: true,
    use(ctx) {
      const drawn = ctx.me.deck.splice(0, 2);
      ctx.me.hand.push(...drawn);
      ctx.log(`Drew ${drawn.length} card${drawn.length === 1 ? '' : 's'}.`);
      ctx.source.damage += 20;
      ctx.log('Put 2 damage counters on Dusknoir.');
      if (ctx.me.hand.length >= 7) ctx.pend({ kind: 'discardFromHand', source: 'Shadow Command', count: ctx.me.hand.length - 6 });
    },
  },
  // Empoleon – Emperor Aura; Skuntank – Evolutionary Gas: evolving the Active Pokémon. Infernape – Blaze Dance; Torterra – Sunshine Song.
  'dp7-2': onEvolve('emperorAura', 'Emperor Aura', true),
  'dp7-26': onEvolve('evolutionaryGas', 'Evolutionary Gas', true),
  'dp7-3': onEvolve('blazeDance', 'Blaze Dance'),
  'dp7-11': onEvolve('sunshineSong', 'Sunshine Song'),
  // Lumineon – Fin Luster: as the Active Pokémon, as Diamond & Pearl Lumineon's Sharp Eye.
  'dp7-4': {
    oncePerTurn: true,
    blocked: (s) => onlyActive(s, 'Lumineon'),
    use(ctx) {
      const room = openBenchSlot(ctx.opp, ctx.state.cards, ctx.state.stadium?.card) >= 0;
      const basic = room && ctx.opp.hand.some((c) => {
        const d = lookupCard(ctx.state.cards, c.defId);
        return d.kind === 'pokemon' && d.stage === 'basic' && !d.trainerText;
      });
      ctx.pend({ kind: basic ? 'oppHandToActive' : 'lookOppHand', source: 'Fin Luster' });
    },
  },
  // Magnezone – Magnetic Search: a Lightning or Metal Pokémon from the deck, shown.
  'dp7-5': {
    oncePerTurn: true,
    blocked: (s) => (s.counts.deck ? null : 'Your deck is empty'),
    use: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Magnetic Search', filter: 'typesNotEx', types: ['lightning', 'metal'], reveal: true, optional: true }),
  },
  // Magnezone – Super Connectivity: a basic Lightning or Metal Energy card from the discard pile attached to the Active Pokémon, then a damage counter on it.
  'dp7-6': {
    oncePerTurn: true,
    blocked: (s) =>
      !s.me.active
        ? 'You have no Active Pokémon'
        : discardsLocked([s.me, s.opp], s.cards)
          ? 'Allergic Pollen: cards in discard piles are not affected'
          : s.me.discard.some((c) => isEnergyCardOf(c, s.cards, 'lightning') || isEnergyCardOf(c, s.cards, 'metal'))
            ? null
            : 'No basic Lightning or Metal Energy cards in your discard pile',
    use(ctx) {
      if (!ctx.me.active) return;
      ctx.pend({ kind: 'attachFromDiscard', source: 'Super Connectivity', count: 1, target: 'active', types: ['lightning', 'metal'] });
      ctx.me.active.damage += 10;
      ctx.log(`Put a damage counter on ${pokemonName(ctx.state, ctx.me.active)}.`);
    },
  },
  // Regigigas – Regi Form; Abomasnow – Snow Veil (as WALL, 20); Cherrim – Sunny Day; Salamence – Battle Rush; Scizor – Honeycomb
  // Defender; Staraptor – Protect Wing; Vespiquen – Green Dignity; Budew – Poison Enzyme; Machamp LV.X – No Guard.
  'dp7-9': { ...POKE_BODY, regiForm: true },
  'dp7-12': { ...POKE_BODY, wall: 20 },
  'dp7-14': { ...POKE_BODY, sunnyDay: true },
  'dp7-24': { ...POKE_BODY, battleRush: true },
  'dp7-25': { ...POKE_BODY, honeycomb: true },
  'dp7-27': { ...POKE_BODY, protectWing: true },
  'dp7-31': { ...POKE_BODY, greenDignity: true },
  'dp7-33': { ...POKE_BODY, poisonEnzyme: true },
  'dp7-98': { ...POKE_BODY, noGuard: true },
  // Tyranitar – Darkness Drive; Heatran LV.X – Heat Metal; Sableye – Overeager.
  'dp7-30': { ...POKE_BODY, darknessDrive: true },
  'dp7-97': { ...POKE_BODY, heatMetal: true },
  'dp7-48': { ...POKE_BODY, overeager: true },
  // Gengar – Fainting Spell; Dusknoir LV.X – Ectoplasm (resolveKnockouts); Raichu LV.X – Link Lightning (attackAction).
  'dp7-18': { faintingSpell: true },
  'dp7-96': { ectoplasm: true },
  'dp7-99': { linkLightning: true },
  // Sceptile – Energy Trans: as EX Ruby & Sapphire's. Rapidash – Burning Mane: as EX Sandstorm's. Bibarel – Unaware: as
  // Secret Wonders Wormadam's Sandy Cloak. Pichu – Baby Evolution: as EX Sandstorm's.
  'dp7-10': EX1_POWERS['ex1-20']!,
  'dp7-22': EX2_POWERS['ex2-15']!,
  'dp7-32': DP3_POWERS['dp3-42']!,
  'dp7-45': EX2_POWERS['ex2-20']!,
  // Bronzong – Cycler: a card from the hand on top of the deck, then up to 2 basic Energy cards from the deck, shown.
  'dp7-13': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.length ? null : 'Your hand is empty'),
    use(ctx) {
      ctx.pend({ kind: 'handToDeck', source: 'Cycler' });
      (ctx.state.queuedChoices ??= []).push({ player: ctx.me.id, source: 'Cycler', kind: 'pickFromDeck', filter: 'basicEnergy', count: 2, reveal: true, optional: true });
    },
  },
  // Dusknoir – Spirit Pulse: as the Active Pokémon, a damage counter between turns on each of the opponent's Pokémon with Energy attached.
  'dp7-17': {
    ...POKE_BODY,
    checkup(state, owner, pokemon, opp) {
      if (owner.active !== pokemon) return;
      for (const p of [opp.active, ...opp.bench]) {
        if (!p || !energyPool(p, state.cards).length) continue;
        p.damage += 10;
        addLog(state, `Spirit Pulse put a damage counter on ${pokemonName(state, p)}.`, owner.id);
      }
    },
  },
  // Roserade – Hidden Poison: as the Active Pokémon damaged by the opponent's attack, the Attacking Pokémon Poisoned.
  'dp7-23': {
    ...POKE_BODY,
    onAttackDamage(ctx, pokemon) {
      if (ctx.opp.active === pokemon) afflictBetweenTurns(ctx.state, ctx.me.id, ctx.attacker, 'poisoned');
    },
  },
  // Tangrowth – Green Renewal: a damage counter off between turns.
  'dp7-29': { ...POKE_BODY, rainDish: 10 },
  // Electrode – Radiance: as the Active Pokémon damaged by the opponent's attack, a damage counter on each of their Pokémon.
  'dp7-36': {
    ...POKE_BODY,
    onAttackDamage(ctx, pokemon) {
      if (ctx.opp.active !== pokemon) return;
      for (const p of [ctx.me.active, ...ctx.me.bench]) if (p) p.damage += 10;
      ctx.log('Radiance put a damage counter on each of your Pokémon.', ctx.opp.id);
    },
  },
  // Pupitar – Energy Protection: 10 less for each Energy attached, 30 at most.
  'dp7-47': { ...POKE_BODY, energyProtection: { max: 30 } },
  // Regigigas LV.X – Sacrifice: one of the player's Pokémon Knocked Out; then up to 2 basic Energy cards from the discard pile on Regigigas, and 8 damage counters off it.
  'dp7-100': {
    oncePerTurn: true,
    blocked: (s) => (ownTargets(s.me).filter((t) => t !== s.source).length ? null : 'You have no other Pokémon to Knock Out'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'to', options: ownTargets(s.me).filter((t) => t !== s.source), prompt: 'Choose one of your Pokémon to Knock Out' }],
    use(ctx) {
      const victim = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      if (!victim || victim === ctx.source) return;
      victim.damage = Math.max(victim.damage, inPlayDef(ctx.state.cards, victim).hp);
      ctx.log(`Sacrifice: ${pokemonName(ctx.state, victim)} is Knocked Out.`);
      resolveKnockouts(ctx.state, ctx.opp.id);
      const healed = Math.min(80, ctx.source.damage);
      ctx.source.damage -= healed;
      if (healed) ctx.log(`Removed ${healed / 10} damage counters from Regigigas.`);
      const where = targetOf(ctx.me, ctx.source) as Target;
      if (!discardsLocked([ctx.me, ctx.opp], ctx.state.cards) && ctx.me.discard.some((c) => isBasicEnergy(lookupCard(ctx.state.cards, c.defId)))) ctx.pend({ kind: 'attachFromDiscard', source: 'Sacrifice', count: 2, target: where });
    },
  },
  // Charizard – Energy Burn: every Energy attached is Fire.
  'dp7-103': { ...POKE_BODY, energyAs: 'fire' },
  // Drifloon – Unburden: with a Pokémon Tool attached, its Retreat Cost is 2 more.
  'dp7-SH1': { ...POKE_BODY, retreatChange: (p) => ((p.attached ?? []).some((a) => a.tool) ? 2 : 0) },
};
