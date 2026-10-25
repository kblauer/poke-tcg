// Majestic Dawn (dp5) Poké-Powers and Poké-Bodies, by card id. Poké-Powers stop with any Special Condition, Poké-Bodies never do.
// Several are the engine's own rules, named by a flag: Primal Shell (trainerError: every Trainer card, Supporters and Stadiums
// too, agreed), Sunlight Veil (refreshHideout), Moonlight
// Veil (attacks.ts, retreatBodies), Disturbance Scales (attacks.ts); Unown Q's QUICK is an `equip` Tool (retreatBodies).
// The powers that work as their Pokémon is put onto the Bench or levels up are asked then (mayUse): Freezing Screech,
// Darkness Shade, Flame Charge, Sheet Lightning, Primal Swirl, Dragon Pulse, Mode Crash.
// From the text: Primal Swirl is once a turn for the player, whichever Omastar; Flame Charge takes the first 3 Fire Energy
// cards picked (up to 3); Cursed Alloy counts the printed Poké-Power, working or not, as Cursed Stone does.
import { lookupCard } from '../cards.js';
import type { InPlayPokemon } from '../engine.js';
import { discardsLocked, ownTargets, pokemonAt, pokemonPower, type PowerEffect, type PowerSituation } from '../powers.js';
import { addLog, inPlayDef, pokemonName } from '../status.js';
import { FOSSIL_NAMES, type PendingChoice } from '../trainers.js';
import { onlyBenched, POKE_BODY, targetOf } from './common.js';
import { DP1_POWERS } from './dp1-powers.js';
import { DP2_POWERS } from './dp2-powers.js';
import { EX1_POWERS } from './ex1-powers.js';
import { EX14_POWERS } from './ex14-powers.js';
import { energyCardOf } from './ex2.js';

type MayPower = Extract<PendingChoice, { kind: 'mayUse' }>['power'];
/** "When you put this from your hand onto your Bench, you may …": asked as it's benched. */
export const onBench = (power: MayPower, source: string): PowerEffect => ({
  onPlayFromHand(state, owner, pokemon) {
    if (pokemon.evolvedFrom.length || owner.active === pokemon) return;
    state.pendingChoice = { player: owner.id, source, kind: 'mayUse', power, target: targetOf(owner, pokemon) };
  },
});
/** "When you put this Pokémon LV.X onto your Active …, you may …": asked as it levels up. */
export const onLevelUp = (power: MayPower, source: string): PowerEffect => ({
  onPlayFromHand(state, owner, pokemon) {
    if (!pokemon.levelUpFrom || owner.active !== pokemon) return;
    state.pendingChoice = { player: owner.id, source, kind: 'mayUse', power, target: 'active' };
  },
});
/** Unown Q's QUICK: from the Bench, attached to another Pokémon as a Pokémon Tool (as Unown E's EQUIP). */
export const equip = (name: string): PowerEffect => ({
  oncePerTurn: true,
  blocked: (s) => onlyBenched(s, name) ?? (equipTargets(s).length ? null : 'None of your other Pokémon can take a Pokémon Tool'),
  choices: (s) => [{ kind: 'ownPokemon', field: 'to', options: equipTargets(s), prompt: `Choose one of your Pokémon to attach ${name} to` }],
  use(ctx) {
    const to = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
    if (!to || to === ctx.source || (to.attached ?? []).some((a) => a.tool)) return;
    const unown = ctx.source;
    ctx.me.discard.push(...unown.energy.map(({ provides: _, ...card }) => card), ...(unown.attached ?? []).map((a) => a.card));
    ctx.me.bench = ctx.me.bench.map((p) => (p === unown ? null : p));
    (to.attached ??= []).push({ card: unown.card, until: Number.MAX_SAFE_INTEGER, tool: true, equip: true });
    ctx.log(`Attached ${name} to ${pokemonName(ctx.state, to)} as a Pokémon Tool.`);
  },
});
/** A coin; heads, Helix Fossil, Dome Fossil or Old Amber onto the Bench (Ancient Guidance: from the deck; Call Up: from the discard pile). */
const fossilCall = (fromDiscard: boolean, source: string): PowerEffect => ({
  oncePerTurn: true,
  blocked(s) {
    if (s.me.bench.every(Boolean)) return 'Your Bench is full';
    if (!fromDiscard) return s.counts.deck ? null : 'Your deck is empty';
    if (discardsLocked([s.me, s.opp], s.cards)) return 'Allergic Pollen: cards in discard piles are not affected';
    return s.me.discard.some((c) => FOSSIL_NAMES.includes(lookupCard(s.cards, c.defId).name)) ? null : 'No Helix Fossil, Dome Fossil or Old Amber in your discard pile';
  },
  use(ctx) {
    if (!ctx.flip()) return ctx.log(`${source} did nothing.`);
    if (fromDiscard) return ctx.pend({ kind: 'discardToBench', source, filter: 'fossilCard' });
    ctx.pend({ kind: 'pickFromDeck', source, filter: 'fossilCard', toBench: true, optional: true });
  },
});

export const DP5_POWERS: Record<string, PowerEffect> = {
  // Articuno – Freezing Screech; Darkrai – Darkness Shade; Moltres – Flame Charge; Zapdos – Sheet Lightning.
  'dp5-1': onBench('freezingScreech', 'Freezing Screech'),
  'dp5-3': onBench('darknessShade', 'Darkness Shade'),
  'dp5-10': onBench('flameCharge', 'Flame Charge'),
  'dp5-14': onBench('sheetLightning', 'Sheet Lightning'),
  // Kabutops – Primal Shell; Espeon – Sunlight Veil; Umbreon – Moonlight Veil; Mothim – Disturbance Scales.
  'dp5-6': { ...POKE_BODY, primalShell: true },
  'dp5-18': { ...POKE_BODY, sunlightVeil: true },
  'dp5-32': { ...POKE_BODY, moonlightVeil: true },
  'dp5-42': { ...POKE_BODY, disturbanceScales: true },
  // Manaphy – Aqua Skin: a Water Energy card attached to it from the hand removes 2 damage counters.
  'dp5-8': {
    ...POKE_BODY,
    onEnergyFromHand(state, owner, pokemon, _target, energy) {
      if (!energyCardOf(state.cards, energy, 'water') || !pokemon.damage) return;
      pokemon.damage = Math.max(0, pokemon.damage - 20);
      addLog(state, `Aqua Skin: removed damage counters from ${pokemonName(state, pokemon)}.`, owner.id);
    },
  },
  // Aerodactyl – Primal Claw: as EX Crystal Guardians'. Glaceon LV.X – Chilly Breath: as EX Ruby & Sapphire Slaking's Lazy.
  'dp5-15': EX14_POWERS['ex14-97']!,
  'dp5-98': EX1_POWERS['ex1-12']!,
  // Bronzong – Cursed Alloy: as the Active Pokémon, a damage counter between turns on each of the opponent's Pokémon with a Poké-Power.
  'dp5-16': {
    ...POKE_BODY,
    checkup(state, owner, pokemon, opp) {
      if (owner.active !== pokemon) return;
      for (const q of [opp.active, ...opp.bench]) {
        if (!q || !hasPokePower(state.cards, q)) continue;
        q.damage += 10;
        addLog(state, `Cursed Alloy put a damage counter on ${pokemonName(state, q)}.`, owner.id);
      }
    },
  },
  // Omastar – Primal Swirl: evolving from the hand (mayUse).
  'dp5-26': {
    onPlayFromHand(state, owner, pokemon) {
      if (!pokemon.evolvedFrom.length || pokemon.levelUpFrom) return;
      state.pendingChoice = { player: owner.id, source: 'Primal Swirl', kind: 'mayUse', power: 'primalSwirl', target: targetOf(owner, pokemon) };
    },
  },
  // Unown P – PUT: from the Bench, a damage counter on one of the player's Pokémon (not an Unown).
  'dp5-33': {
    oncePerTurn: true,
    blocked: (s) => onlyBenched(s, 'Unown P') ?? (putTargets(s).length ? null : 'You have no Pokémon but Unown'),
    choices: (s) => [{ kind: 'ownPokemon', field: 'to', options: putTargets(s), prompt: 'Choose one of your Pokémon to put a damage counter on' }],
    use(ctx) {
      const p = ctx.choices.to === undefined ? null : pokemonAt(ctx.me, ctx.choices.to);
      if (!p) return;
      p.damage += 10;
      ctx.log(`Put a damage counter on ${pokemonName(ctx.state, p)}.`);
    },
  },
  // Unown Q – QUICK.
  'dp5-49': equip('Unown Q'),
  // Chingling, Munchlax – Baby Evolution: as Mysterious Treasures' and Diamond & Pearl's.
  'dp5-58': DP2_POWERS['dp2-42']!,
  'dp5-68': DP1_POWERS['dp1-33']!,
  // Kabuto – Ancient Guidance; Omanyte – Call Up.
  'dp5-67': fossilCall(false, 'Ancient Guidance'),
  'dp5-69': fossilCall(true, 'Call Up'),
  // Garchomp LV.X – Dragon Pulse; Porygon-Z LV.X – Mode Crash: as they level up (mayUse).
  'dp5-97': onLevelUp('dragonPulse', 'Dragon Pulse'),
  'dp5-100': onLevelUp('modeCrash', 'Mode Crash'),
  // Leafeon LV.X – Energy Forcing: an Energy card from the hand attached to one of the player's Pokémon.
  'dp5-99': {
    oncePerTurn: true,
    blocked: (s) => (s.me.hand.some((c) => lookupCard(s.cards, c.defId).kind === 'energy') ? null : 'You have no Energy cards in your hand'),
    use: (ctx) => ctx.pend({ kind: 'attachFromHand', source: 'Energy Forcing', count: 1, anyTarget: true }),
  },
};

/** A printed Poké-Power, working or not (Cursed Alloy). */
function hasPokePower(cards: Parameters<typeof inPlayDef>[0], p: InPlayPokemon) {
  return !!inPlayDef(cards, p).power && !pokemonPower(p)?.body;
}

/** The player's Pokémon that aren't Unown (PUT). */
function putTargets(s: PowerSituation) {
  return ownTargets(s.me).filter((t) => !inPlayDef(s.cards, pokemonAt(s.me, t)!).name.startsWith('Unown'));
}

/** The player's Pokémon an Unown can be attached to: any other without a Pokémon Tool. */
function equipTargets(s: PowerSituation) {
  return ownTargets(s.me).filter((t) => t !== s.source && !(pokemonAt(s.me, t)!.attached ?? []).some((a) => a.tool));
}

