// EX Power Keepers (ex16) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// Most reprint EX Ruby & Sapphire, EX Sandstorm, EX Dragon, EX Hidden Legends and EX Deoxys cards, and play as those.
// From the text: Rock Blast's 20s to the same Pokémon add up into one hit, with no Weakness or Resistance; Shadow Crush asks
// first whether to discard, then which Energy card of the Defending Pokémon's; Scanblast and Dirge hit the Benched Pokémon
// with exactly the Defending Pokémon's name; Skill Hack shows the opponent's hand once the attack starts, and the copied
// attack's own questions take their first allowed answer (performCopiedAttack).
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { lookupCard } from '../cards.js';
import { type Target } from '../engine.js';
import { inPlayDef } from '../status.js';
import { skillHackFits } from '../trainers.js';
import { benchedSlots } from './common.js';
import { EX1 } from './ex1.js';
import { discardOwn, energyCardOf, EX2 } from './ex2.js';
import { EX5 } from './ex5.js';
import { notNextTurn } from './ex6.js';
import { shiftDefenderEnergy } from './ex7.js';
import { dragOff } from './ex8.js';
import { EX10, guardNext } from './ex10.js';
import { EX11 } from './ex11.js';
import { cryForHelp, EX12, same } from './ex12.js';
import { charmFor, psychicPulse } from './ex15.js';
import { GYM1 } from './gym1.js';

/** The named Stadium is in play. */
const stadiumIs = (ctx: AttackContext, name: string) => !!ctx.state.stadium && lookupCard(ctx.state.cards, ctx.state.stadium.card.defId).name === name;

/** `damage` to each of the opponent's Benched Pokémon with the Defending Pokémon's name (Scanblast, Dirge). */
const sameNameBench = (damage: number): AttackEffect => ({
  run(ctx) {
    ctx.hit(damage);
    const name = ctx.defenderDef.name;
    ctx.opp.bench.forEach((p, i) => p && inPlayDef(ctx.state.cards, p).name === name && ctx.damageBenched(ctx.opp, i, damage));
  },
});

export const EX16: Record<string, Record<string, AttackEffect>> = {
  // Armaldo – Rock Blast: up to 5 Fighting Energy cards discarded, 20 for each to the opponent's Pokémon picked (the same any number of times).
  'ex16-3': {
    'Rock Blast': {
      choices(s, c): ChoiceSpec[] {
        const fighting = s.attacker.energy.filter((e) => energyCardOf(s.cards, e, 'fighting'));
        if (!fighting.length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'ownEnergyUpTo', options: fighting, max: 5, prompt: 'Rock Blast: choose up to 5 Fighting Energy cards to discard' }];
        const n = c.energyUids?.length ?? 0;
        if (n) specs.push({ kind: 'opponentBenchMany', count: n, options: [-1, ...benchedSlots(s.opponentBench)], repeat: true, prompt: `Choose ${n} of your opponent's Pokémon (the same one again if you like) to do 20 damage to each time` });
        return specs;
      },
      run(ctx) {
        const gone = ctx.attacker.energy.filter((e) => ctx.choices.energyUids?.includes(e.uid) && energyCardOf(ctx.state.cards, e, 'fighting'));
        if (!gone.length) return ctx.log('Rock Blast did nothing.');
        discardOwn(ctx, gone);
        const picks: Target[] = (ctx.choices.benchSlots ?? []).slice(0, gone.length).map((s) => (s === -1 ? 'active' : s));
        for (const t of new Set(picks)) {
          const damage = 20 * picks.filter((p) => p === t).length;
          if (t === 'active') ctx.hit(damage, { weakness: false, resistance: false });
          else ctx.damageBenched(ctx.opp, t, damage);
        }
      },
    },
  },
  // Banette – Bench Manipulation: the opponent flips a coin for each of their Benched Pokémon; 40 for each tails, no Weakness or Resistance.
  'ex16-4': {
    'Bench Manipulation': {
      run(ctx) {
        let tails = 0;
        for (let i = benchedSlots(ctx.opp.bench).length; i > 0; i--) if (!ctx.oppFlip()) tails++;
        if (!tails) return ctx.log('Bench Manipulation did no damage.');
        ctx.hit(40 * tails, { weakness: false, resistance: false });
      },
    },
  },
  // Blaziken – Fire Stream; Delcatty – Max Energy Source; Slaking – Critical Move: as EX Ruby & Sapphire's.
  'ex16-5': { 'Fire Stream': same(() => EX1['ex1-3']?.['Fire Stream']) },
  'ex16-8': { 'Max Energy Source': same(() => EX1['ex1-5']?.['Max Energy Source']) },
  'ex16-13': { 'Critical Move': same(() => EX1['ex1-12']?.['Critical Move']) },
  // Kabutops – Luring Antenna.
  'ex16-10': { 'Luring Antenna': dragOff(20) },
  // Machamp – Brick Smash: no Resistance or other effects on the Defending Pokémon.
  'ex16-11': { 'Brick Smash': { run: (ctx) => void ctx.hit(40, { swift: true, keepWeakness: true }) } },
  // Dusclops – Mysterious Light: Confused while Phoebe's Stadium is in play.
  'ex16-14': {
    'Mysterious Light': {
      run(ctx) {
        ctx.hit(50);
        if (stadiumIs(ctx, "Phoebe's Stadium")) ctx.inflict('confused');
      },
    },
  },
  // Lanturn – Lightning Strike: as EX Hidden Legends'.
  'ex16-15': { 'Lightning Strike': same(() => EX5['ex5-38']?.['Lightning Strike']) },
  // Mawile – Pull Away: with 5 or more cards in their hand, the opponent discards down to 4.
  'ex16-17': {
    'Pull Away': {
      run(ctx) {
        ctx.hit(20);
        if (ctx.opp.hand.length >= 5) ctx.opponentChooses({ kind: 'discardFromHand', source: 'Pull Away', count: ctx.opp.hand.length - 4 });
      },
    },
  },
  // Mightyena – Dark Burst: 20 more while Sidney's Stadium is in play.
  'ex16-18': { 'Dark Burst': { run: (ctx) => void ctx.hit(stadiumIs(ctx, "Sidney's Stadium") ? 70 : 50) } },
  // Omastar – Pull Down; Wobbuffet – Flip Over: as EX Sandstorm's.
  'ex16-20': { 'Pull Down': same(() => EX2['ex2-19']?.['Pull Down']) },
  'ex16-24': { 'Flip Over': same(() => EX2['ex2-26']?.['Flip Over']) },
  // Pichu – Cry for Help: a Lightning Pokémon (not a Pokémon-ex) from the deck, shown.
  'ex16-21': { 'Cry for Help': cryForHelp('lightning') },
  // Sableye – Down Draw; Kabuto – Fast Evolution; Omanyte – Influence: as EX Legend Maker's and EX Delta Species'.
  'ex16-22': { 'Down Draw': same(() => EX12['ex12-31']?.['Down Draw']) },
  'ex16-51': { 'Fast Evolution': same(() => EX11['ex11-46']?.['Fast Evolution']) },
  'ex16-56': { Influence: same(() => EX12['ex12-29']?.['Influence']) },
  // Anorith – Fury Cutter: 3 coins; 10, 30 or 50 more for 1, 2 or 3 heads.
  'ex16-26': { 'Fury Cutter': { run: (ctx) => void ctx.hit(10 + [0, 10, 30, 50][ctx.flips(3)]!) } },
  // Lairon – Granite Head: 10 less damage to it next turn.
  'ex16-32': { 'Granite Head': guardNext(20, 10) },
  // Metang – Extra Comet Punch; Aron – Dig Deep: as EX Unseen Forces'.
  'ex16-35': { 'Extra Comet Punch': same(() => EX10['ex10-36']?.['Extra Comet Punch']) },
  'ex16-42': { 'Dig Deep': same(() => EX10['ex10-65']?.['Dig Deep']) },
  // Sharpedo – Darkness Charge: a damage counter on it.
  'ex16-38': {
    'Darkness Charge': {
      run(ctx) {
        ctx.hit(50);
        ctx.attacker.damage += 10;
        ctx.log(`Put a damage counter on ${ctx.attackerDef.name}.`);
      },
    },
  },
  // Beldum – Magnetic Lines: heads, a basic Energy card moves from the Defending Pokémon to one of the opponent's Benched Pokémon.
  'ex16-45': { 'Magnetic Lines': shiftDefenderEnergy(10, true, true) },
  // Chinchou – Negative Ion: the Defending Pokémon's attacks do 10 less next turn.
  'ex16-49': { 'Negative Ion': charmFor(10, 10) },
  // Spheal – Defense Curl: as Gym Heroes'.
  'ex16-65': { 'Defense Curl': same(() => GYM1['gym1-71']?.['Defense Curl']) },
  // Absol ex – Psychic Pulse.
  'ex16-92': { 'Psychic Pulse': psychicPulse(30) },
  // Claydol ex – Shadow Crush: a Psychic Energy card may be discarded to discard an Energy card from the Defending Pokémon.
  'ex16-93': {
    'Shadow Crush': {
      choices(s, c): ChoiceSpec[] {
        if (!s.attacker.energy.some((e) => energyCardOf(s.cards, e, 'psychic'))) return [];
        const specs: ChoiceSpec[] = [{ kind: 'boost', options: [true, false], prompt: 'Discard a Psychic Energy card to discard an Energy card attached to the Defending Pokémon?' }];
        if (c.boost && s.defender.energy.length) specs.push({ kind: 'defenderEnergy', options: s.defender.energy, prompt: 'Choose an Energy card attached to the Defending Pokémon to discard' });
        return specs;
      },
      run(ctx) {
        ctx.hit(60);
        const psychic = ctx.attacker.energy.find((e) => energyCardOf(ctx.state.cards, e, 'psychic'));
        if (!ctx.choices.boost || !psychic) return;
        discardOwn(ctx, [psychic]);
        if (ctx.choices.defenderEnergyUid) ctx.discardDefenderEnergy(ctx.choices.defenderEnergyUid);
      },
    },
  },
  // Flygon ex – Slashing Strike: tails, not again next turn.
  'ex16-94': {
    'Slashing Strike': {
      run(ctx) {
        ctx.hit(70);
        if (!ctx.flip()) notNextTurn(ctx, 'Slashing Strike');
      },
    },
  },
  // Metagross ex – Scanblast; Shiftry ex – Dirge: as much to each of the opponent's Benched Pokémon with the Defending Pokémon's name.
  'ex16-95': { Scanblast: sameNameBench(70) },
  // Salamence ex – Volcanic Flame: the top 5 cards of the deck discarded; Hydro Wave: every Water Energy card attached
  // discarded, 30 to each of the opponent's Benched Pokémon.
  'ex16-96': {
    'Volcanic Flame': {
      run(ctx) {
        ctx.hit(150);
        const gone = ctx.me.deck.splice(0, 5);
        ctx.me.discard.push(...gone);
        ctx.log(`Discarded the top ${gone.length} card${gone.length === 1 ? '' : 's'} of the deck.`);
      },
    },
    'Hydro Wave': {
      run(ctx) {
        discardOwn(ctx, ctx.attacker.energy.filter((e) => energyCardOf(ctx.state.cards, e, 'water')));
        ctx.benchDamage(ctx.opp, 30);
      },
    },
  },
  // Shiftry ex – Skill Hack: an attack of a Basic Pokémon or Evolution card in the opponent's hand, whatever the Energy (trainers.ts).
  'ex16-97': {
    'Skill Hack': {
      run(ctx) {
        ctx.log(`Your opponent's hand: ${ctx.opp.hand.map((c) => lookupCard(ctx.state.cards, c.defId).name).join(', ') || 'empty'}.`);
        if (ctx.opp.hand.some((c) => skillHackFits(ctx.state.cards, c))) ctx.pend({ kind: 'skillHack', source: 'Skill Hack' });
        else ctx.log('Skill Hack had nothing to copy.');
      },
    },
    Dirge: sameNameBench(60),
  },
  // Walrein ex – Wreck: with a Stadium in play, 20 more and the Stadium discarded.
  'ex16-99': {
    Wreck: {
      run(ctx) {
        const stadium = ctx.state.stadium;
        ctx.hit(stadium ? 90 : 70);
        if (!stadium) return;
        ctx.state.players[stadium.owner]!.discard.push(stadium.card);
        ctx.state.stadium = null;
        ctx.log(`Discarded ${lookupCard(ctx.state.cards, stadium.card.defId).name}.`);
      },
    },
  },
};
