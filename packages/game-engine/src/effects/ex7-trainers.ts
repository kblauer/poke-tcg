// EX Team Rocket Returns (ex7) Trainer cards and special Energy, by card id. Copycat, Rocket's Admin., Rocket's Mission and
// Here Comes Team Rocket! are Supporters; Rocket's Hideout and Rocket's Tricky Gym are Stadiums; Pokémon Retriever, Pow! Hand
// Extension, Surprise! Time Machine, Swoop! Teleporter and Venture Bomb are Rocket's Secret Machines (`secretMachine`).
// Agreed with the user: Surprise! Time Machine swaps evolutions freely (no limits on the new Evolution card); Swoop!
// Teleporter's new Pokémon can evolve this turn if the old one could have, and can use its Poké-Power this turn; R Energy's
// 10 more damage adds up, one for each R Energy (attacks.ts).
// From the text: Rocket's Hideout gives 20 more HP to Pokémon with Dark or Rocket's in their names (refreshHideout); Rocket's
// Tricky Gym's Feint Attack is in ex7.ts; Rocket's Admin.'s players each draw up to as many cards as they have Prize cards
// left, the player who played it first; Pow! Hand Extension's switched-in Pokémon is the player's pick; Venture Bomb's
// Pokémon are picked before the flip; R Energy and Aqua Energy are discarded at the end of their owner's turn (betweenTurns).
import { lookupCard } from '../cards.js';
import { activeLocked, evolvesOnto, type Target } from '../engine.js';
import { trainerProof } from '../powers.js';
import { clearOnLeavingActive, devolvable, energyProtected, inPlayDef, pokemonName, removeTopEvolution } from '../status.js';
import { def, otherHandCards, own, swapActive, targetsOf, type EnergyEffect, type TrainerEffect, type TrainerSituation } from '../trainers.js';
import { ECARD1_TRAINERS } from './ecard1-trainers.js';
import { ROCKET_TRAINERS } from './rocket-trainers.js';

/** Has Dark or Rocket's in its name (Rocket's Mission, Rocket's Tricky Gym, R Energy). */
const darkOrRockets = (name: string) => /\bDark\b/.test(name) || name.startsWith("Rocket's ");

/** The Basic Pokémon and Evolution cards in the discard pile (Pokémon Retriever). */
const retrievable = (s: TrainerSituation) => s.me.discard.filter((c) => def(s, c).kind === 'pokemon' && !(def(s, c) as { trainerText?: string }).trainerText);

/** The player's Basic Pokémon in play that aren't Pokémon-ex (Swoop! Teleporter). */
const swoopTargets = (s: TrainerSituation): Target[] =>
  targetsOf(s.me).filter((t) => {
    const d = inPlayDef(s.cards, own(s, t)!);
    return d.stage === 'basic' && !d.ex && !d.trainerText;
  });

/** Feint Attack, the attack Rocket's Tricky Gym gives Pokémon with Dark or Rocket's in their names (its effect in ex7.ts). */
const FEINT_ATTACK = {
  name: 'Feint Attack',
  cost: ['colorless' as const],
  damage: 0,
  damageText: null,
  text: "Does 20 damage to 1 of your opponent's Pokémon. This attack's damage isn't affected by Weakness, Resistance, Poké-Powers, Poké-Bodies, or any other effects on that Pokémon.",
};

export const EX7_TRAINERS: Record<string, TrainerEffect> = {
  // Copycat (Supporter): as Expedition's.
  'ex7-83': ECARD1_TRAINERS['ecard1-138']!,

  // Pokémon Retriever: from the discard pile, a Basic Pokémon or Evolution card into the hand (shown), or 3 of them shuffled into the deck.
  'ex7-84': {
    secretMachine: true,
    discardToHand: true,
    blocked: (s) => (retrievable(s).length ? null : 'No Basic Pokémon or Evolution cards in your discard pile'),
    choices: (s, c) => [
      { kind: 'pick', field: 'pick', options: retrievable(s).length >= 3 ? [0, 1] : [0], labels: ['Put 1 into your hand', 'Shuffle 3 into your deck'], prompt: 'Put a card into your hand, or shuffle 3 into your deck?' },
      ...(c.pick !== undefined ? [{ kind: 'cards' as const, field: 'discardUids' as const, min: c.pick ? 3 : 1, max: c.pick ? 3 : 1, options: retrievable(s), prompt: `Choose ${c.pick ? 3 : 1} Basic Pokémon or Evolution card${c.pick ? 's' : ''}` }] : []),
    ],
    play(ctx) {
      const picked = ctx.me.discard.filter((c) => ctx.choices.discardUids?.includes(c.uid));
      ctx.me.discard = ctx.me.discard.filter((c) => !picked.includes(c));
      const names = picked.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ');
      if (ctx.choices.pick) {
        ctx.shuffleIntoDeck(ctx.me, picked);
        ctx.log(`Shuffled ${names} into the deck.`);
      } else {
        ctx.me.hand.push(...picked);
        ctx.log(`Put ${names} into the hand.`);
      }
    },
  },

  // Pow! Hand Extension: with more Prize cards left than the opponent, an Energy card moves from the Defending Pokémon to
  // another of their Pokémon, or one of their Benched Pokémon (the player's pick) is switched in. Both reach the Defending
  // Pokémon, so Legendary Body keeps it off; Brock's Protection leaves only the switch.
  'ex7-85': {
    secretMachine: true,
    blocked(s) {
      if (s.prizes && s.prizes.me <= s.prizes.opp) return 'You can play Pow! Hand Extension only with more Prize cards left than your opponent';
      return trainerProof(s.opp, [s.me, s.opp], s.cards) ?? (s.opp.active && s.opp.bench.some(Boolean) ? null : "Your opponent has no Benched Pokémon");
    },
    choices(s, c) {
      const bench = targetsOf(s.opp).filter((t) => t !== 'active');
      const energy = s.opp.active && !energyProtected(s.cards, s.opp.active) ? s.opp.active.energy.filter((e) => !e.provides) : [];
      return [
        { kind: 'pick', field: 'pick', options: energy.length ? [0, 1] : [1], labels: ["Move an Energy card from your opponent's Active Pokémon", "Switch in one of your opponent's Benched Pokémon"], prompt: 'Pow! Hand Extension: which?' },
        ...(c.pick === 0 ? [{ kind: 'cards' as const, field: 'oppEnergyUids' as const, min: 1, max: 1, options: energy, prompt: 'Choose an Energy card attached to the Defending Pokémon' }] : []),
        ...(c.pick !== undefined ? [{ kind: 'pokemon' as const, field: 'oppTarget' as const, side: 'opp' as const, options: bench, prompt: c.pick === 0 ? 'Choose the Pokémon to move it to' : 'Choose the Pokémon to switch in' }] : []),
      ];
    },
    play(ctx) {
      const t = ctx.choices.oppTarget;
      const to = typeof t === 'number' ? ctx.opp.bench[t] : null;
      const active = ctx.opp.active;
      if (!to || !active) return;
      if (ctx.choices.pick === 0) {
        const card = active.energy.find((e) => ctx.choices.oppEnergyUids?.includes(e.uid));
        if (!card || energyProtected(ctx.state.cards, active)) return;
        active.energy = active.energy.filter((e) => e !== card);
        to.energy.push(card);
        return ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} from ${pokemonName(ctx.state, active)} to ${pokemonName(ctx.state, to)}.`, ctx.opp.id);
      }
      const locked = activeLocked(ctx.state, ctx.opp.id);
      if (locked) return ctx.log(locked);
      swapActive(ctx.state, ctx.opp, t as number);
    },
  },

  // Rocket's Admin. (Supporter): each player shuffles their hand into their deck, then draws up to as many cards as they have
  // Prize cards left (the player who played it first).
  'ex7-86': {
    supporter: true,
    play(ctx) {
      ctx.shuffleIntoDeck(ctx.me, ctx.me.hand.filter((c) => c.uid !== ctx.card.uid));
      ctx.me.hand = ctx.me.hand.filter((c) => c.uid === ctx.card.uid);
      ctx.shuffleIntoDeck(ctx.opp, ctx.opp.hand.splice(0));
      ctx.log('Each player shuffled their hand into their deck.');
      const theirs = { player: ctx.opp.id, source: "Rocket's Admin.", kind: 'drawCount' as const, max: ctx.opp.prizes.length };
      if (ctx.me.prizes.length) {
        ctx.pend({ kind: 'drawCount', source: "Rocket's Admin.", max: ctx.me.prizes.length });
        if (theirs.max) (ctx.state.queuedChoices ??= []).push(theirs);
      } else if (theirs.max) ctx.state.pendingChoice = theirs;
    },
  },

  // Rocket's Hideout: 20 more HP for Pokémon with Dark or Rocket's in their names (refreshHideout).
  'ex7-87': { stadium: true },

  // Rocket's Mission (Supporter): a card from the hand discarded, then 3 cards drawn (4 if it was a Pokémon with Dark or Rocket's in its name).
  'ex7-88': {
    supporter: true,
    blocked: (s) => (otherHandCards(s).length ? null : 'No other cards in your hand to discard'),
    choices: (s) => [{ kind: 'cards', field: 'handUids', min: 1, max: 1, options: otherHandCards(s), prompt: 'Choose a card from your hand to discard' }],
    play(ctx) {
      const [card] = ctx.fromHand(ctx.me, ctx.choices.handUids!);
      if (!card) return;
      ctx.me.discard.push(card);
      const d = lookupCard(ctx.state.cards, card.defId);
      ctx.log(`Discarded ${d.name}.`);
      ctx.draw(ctx.me, d.kind === 'pokemon' && darkOrRockets(d.name) ? 4 : 3);
    },
  },

  // Rocket's Poké Ball: a Pokémon with Dark in its name from the deck, shown.
  'ex7-89': {
    blocked: (s) => (s.deckCount ? null : 'Your deck is empty'),
    play: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: "Rocket's Poké Ball", filter: 'ownerPokemon', name: 'Dark', reveal: true, optional: true }),
  },

  // Rocket's Tricky Gym: Pokémon with Dark or Rocket's in their names can use its Feint Attack (usableAttacks).
  'ex7-90': { stadium: true, stadiumAttack: { attack: FEINT_ATTACK, for: darkOrRockets } },

  // Surprise! Time Machine: one of the player's Evolved Pokémon loses its top card (shuffled into the deck); if it's still in
  // play, a card from the deck that evolves from it goes on it (agreed: no limits).
  'ex7-91': {
    secretMachine: true,
    blocked: (s) => (targetsOf(s.me).some((t) => devolvable(s.cards, own(s, t)!)) ? null : 'You have no Evolved Pokémon'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me).filter((t) => devolvable(s.cards, own(s, t)!)), prompt: 'Choose one of your Evolved Pokémon' }],
    play(ctx) {
      const t = ctx.choices.target!;
      const p = (t === 'active' ? ctx.me.active : ctx.me.bench[t])!;
      const top = removeTopEvolution(ctx.state, ctx.me, p);
      clearOnLeavingActive(p);
      ctx.shuffleIntoDeck(ctx.me, [top]);
      ctx.log(`Shuffled ${lookupCard(ctx.state.cards, top.defId).name} into the deck (${pokemonName(ctx.state, p)} devolved).`);
      if (p.damage >= inPlayDef(ctx.state.cards, p).hp) return;
      const current = lookupCard(ctx.state.cards, p.card.defId);
      const names = [...new Set(ctx.me.deck.map((c) => lookupCard(ctx.state.cards, c.defId)).filter((d) => d.kind === 'pokemon' && evolvesOnto(d, current)).map((d) => d.name))];
      if (names.length) ctx.pend({ kind: 'evolveFromDeck', target: t, names, source: 'Surprise! Time Machine' });
    },
  },

  // Swoop! Teleporter: a Basic Pokémon (not a Pokémon-ex) from the deck takes the place of one of the player's in play, with
  // everything on it; the old one is discarded.
  'ex7-92': {
    secretMachine: true,
    blocked: (s) => (!s.deckCount ? 'Your deck is empty' : swoopTargets(s).length ? null : 'You have no Basic Pokémon in play (but Pokémon-ex)'),
    choices: (s) => [{ kind: 'pokemon', field: 'target', side: 'own', options: swoopTargets(s), prompt: 'Choose one of your Basic Pokémon to switch' }],
    play(ctx) {
      const names = [...new Set(ctx.me.deck.map((c) => lookupCard(ctx.state.cards, c.defId)).filter((d) => d.kind === 'pokemon' && d.stage === 'basic' && !d.ex && !d.trainerText).map((d) => d.name))];
      ctx.pend({ kind: 'castform', source: 'Swoop! Teleporter', target: ctx.choices.target!, names, discardOld: true });
    },
  },

  // Venture Bomb: heads, a damage counter on one of the opponent's Pokémon; tails, on one of the player's (both picked first).
  'ex7-93': {
    secretMachine: true,
    choices: (s) => [
      { kind: 'pokemon', field: 'oppTarget', side: 'opp', options: targetsOf(s.opp), prompt: "Choose one of your opponent's Pokémon (a damage counter on heads)" },
      { kind: 'pokemon', field: 'target', side: 'own', options: targetsOf(s.me), prompt: 'Choose one of your Pokémon (a damage counter on tails)' },
    ],
    play(ctx) {
      const heads = ctx.flip();
      const [side, t] = heads ? [ctx.opp, ctx.choices.oppTarget] : [ctx.me, ctx.choices.target];
      const p = t === undefined ? null : t === 'active' ? side.active : side.bench[t];
      if (!p) return;
      p.damage += 10;
      ctx.log(`Put a damage counter on ${pokemonName(ctx.state, p)}.`, side.id);
    },
  },

  // Here Comes Team Rocket! (Supporter): as Team Rocket's.
  'ex7-111': { ...ROCKET_TRAINERS['base5-15']!, supporter: true },
};

export const EX7_ENERGY: Record<string, EnergyEffect> = {
  // Dark Metal Energy: Darkness or Metal, 1 at a time (energyPool); nothing else.
  'ex7-94': { onAttach: () => {} },
  // R Energy: only on a Pokémon with Dark or Rocket's in its name; 2 Darkness Energy, 10 more damage to the Active Pokémon
  // (attacks.ts); discarded at the end of its owner's turn.
  'ex7-95': { onAttach: () => {}, attachError: (pokemon) => (darkOrRockets(pokemon.name) ? null : "R Energy can only be attached to a Pokémon with Dark or Rocket's in its name") },
};

