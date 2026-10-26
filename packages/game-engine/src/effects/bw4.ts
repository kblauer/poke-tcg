// Next Destinies (bw4) attack effects, by card id and attack name: the ones the shared wordings (ex-templates.ts) don't play.
// From the text: Power Pinch, Fire Spin's tails and the like ask which Energy cards once the attack is over, when they differ
// (the same-card rule, agreed; dp1's removeDefenderEnergy and discardOwnEnergy); Draining Cut heals as much as it did to the
// Defending Pokémon; the Stadium attacks (Stadium Drain, Burn, Wave) count either player's Stadium; Bared Fangs looks at the
// Defending Pokémon before the attack; Sniffle makes Belt's base damage 40 during the player's next turn (40 less Belt's own,
// more, before Weakness and Resistance); Brain Control's card goes on the bottom of the opponent's deck, nothing drawn;
// Sand Bazooka's move is the player's choice ("you may"); Haul In finds up to 2 Pokémon Tools.
import type { AttackContext, AttackEffect, ChoiceSpec } from '../attacks.js';
import { isBasicEnergy, lookupCard } from '../cards.js';
import { pokemonName } from '../status.js';
import { benchedSlots, energyCanMove } from './common.js';
import { template } from './bw2.js';
import { discardOwnEnergy, removeDefenderEnergy } from './dp1.js';
import { healUpTo } from './si1.js';

/** "If there is any Stadium card in play, this attack does 30 more damage and …" (Stadium Drain, Burn, Wave). */
const stadiumMore = (damage: number, more: number, then: (ctx: AttackContext) => void): AttackEffect => ({
  run(ctx) {
    if (!ctx.state.stadium) return void ctx.hit(damage);
    ctx.hit(damage + more);
    then(ctx);
  },
});

export const BW4: Record<string, Record<string, AttackEffect>> = {
  // Pinsir – Power Pinch: 2 coins; an Energy card off the Defending Pokémon for each heads.
  'bw4-1': { 'Power Pinch': { run: (ctx) => removeDefenderEnergy(ctx, ctx.flips(2), 'Power Pinch') } },
  // Kricketune – Draining Cut: 2 coins, 40 for each heads; as much healed from itself as it did.
  'bw4-4': { 'Draining Cut': { run: (ctx) => healUpTo(ctx, ctx.me, ctx.attacker, ctx.hit(40 * ctx.flips(2))) } },
  // Simisage – Stadium Drain: with a Stadium in play, 30 more and 30 off itself.
  'bw4-7': { 'Stadium Drain': stadiumMore(30, 30, (ctx) => healUpTo(ctx, ctx.me, ctx.attacker, 30)) },
  // Foongus – Find a Friend: heads, a Pokémon from the deck into the hand, shown.
  'bw4-8': {
    'Find a Friend': {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Find a Friend did nothing.');
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Find a Friend', filter: 'pokemon', reveal: true });
      },
    },
  },
  // Growlithe – Stoke: heads, a Fire Energy card from the deck attached to it.
  'bw4-10': {
    Stoke: {
      run(ctx) {
        if (!ctx.flip()) return ctx.log('Stoke did nothing.');
        if (ctx.me.deck.length) ctx.pend({ kind: 'pickFromDeck', source: 'Stoke', filter: 'typedEnergy', type: 'fire', attachToActive: true });
      },
    },
  },
  // Arcanine – Fire Spin: tails, 2 Energy cards attached to it discarded.
  'bw4-12': {
    'Fire Spin': {
      run(ctx) {
        ctx.hit(100);
        if (!ctx.flip()) discardOwnEnergy(ctx, 2, 'Fire Spin');
      },
    },
  },
  // Simisear – Stadium Burn: with a Stadium in play, 30 more and Burned.
  'bw4-16': { 'Stadium Burn': stadiumMore(30, 30, (ctx) => ctx.inflict('burned')) },
  // Chandelure – Inferno: every Energy attached to it discarded; Burned.
  'bw4-20': {
    Inferno: {
      discard: { count: 'all' },
      run(ctx) {
        ctx.hit(80);
        ctx.inflict('burned');
      },
    },
  },
  // Simipour – Stadium Wave: with a Stadium in play, 30 more and Asleep.
  'bw4-29': { 'Stadium Wave': stadiumMore(30, 30, (ctx) => ctx.inflict('asleep')) },
  // Basculin – Bared Fangs: nothing unless the Defending Pokémon already has damage counters.
  'bw4-30': { 'Bared Fangs': { run: (ctx) => (ctx.defender.damage > 0 ? void ctx.hit(40) : ctx.log('Bared Fangs did nothing.')) } },
  // Jellicent – Vengeful Wish: as the shared wording, the damage done to it during the opponent's last turn.
  'bw4-35': { 'Vengeful Wish': template('damagedLastTurnSame', 0, 'Vengeful Wish') },
  // Cubchoo – Sniffle: Belt's base damage is 40 during the player's next turn.
  'bw4-36': {
    Sniffle: {
      run(ctx) {
        const belt = ctx.attackerDef.attacks.find((a) => a.name === 'Belt');
        (ctx.attacker.effects ??= {}).attackMore = { attack: 'Belt', amount: Math.max(0, 40 - (belt?.damage ?? 0)), turn: ctx.turn + 2 };
        ctx.log(`${ctx.attackerDef.name}'s Belt's base damage is 40 next turn.`);
      },
    },
  },
  // Beheeyem – Brain Control: a card from the opponent's hand (shown) on the bottom of their deck.
  'bw4-62': { 'Brain Control': { run: (ctx) => void (ctx.opp.hand.length ? ctx.pend({ kind: 'oppHandTrainer', source: 'Brain Control', any: true, place: 'bottom' }) : ctx.log("Your opponent's hand is empty.")) } },
  // Hippowdon – Sand Bazooka: may move a basic Energy card from it to 1 of the player's Benched Pokémon.
  'bw4-66': {
    'Sand Bazooka': {
      choices: (s, c): ChoiceSpec[] => {
        const bench = benchedSlots(s.ownBench);
        const energy = s.attacker.energy.filter((e) => !e.provides && isBasicEnergy(lookupCard(s.cards, e.defId)));
        if (!bench.length || !energy.length) return [];
        const specs: ChoiceSpec[] = [{ kind: 'ownBench', options: [-1, ...bench], optional: true, prompt: 'You may choose one of your Benched Pokémon to move a basic Energy card to' }];
        if (c.ownBenchSlot === undefined || c.ownBenchSlot < 0) return specs;
        return [...specs, { kind: 'ownEnergy', count: 1, options: energy, prompt: 'Choose the basic Energy card to move' }];
      },
      run(ctx) {
        ctx.hit(70);
        const to = ctx.choices.ownBenchSlot === undefined || ctx.choices.ownBenchSlot < 0 ? null : ctx.me.bench[ctx.choices.ownBenchSlot];
        const card = ctx.attacker.energy.find((e) => e.uid === ctx.choices.energyUids?.[0]);
        if (!to || !card || !energyCanMove(ctx, ctx.attacker)) return;
        ctx.attacker.energy = ctx.attacker.energy.filter((e) => e !== card);
        to.energy.push(card);
        ctx.log(`Moved ${lookupCard(ctx.state.cards, card.defId).name} to ${pokemonName(ctx.state, to)}.`);
      },
    },
  },
  // Mienshao – Haul In: up to 2 Pokémon Tool cards from the deck into the hand, shown.
  'bw4-68': { 'Haul In': { run: (ctx) => void (ctx.me.deck.length && ctx.pend({ kind: 'pickFromDeck', source: 'Haul In', filter: 'tool', reveal: true, optional: true, count: 2 })) } },
  // Weavile – Dark Penalty: nothing unless the Defending Pokémon has a Pokémon Tool attached.
  'bw4-70': { 'Dark Penalty': { run: (ctx) => ((ctx.defender.attached ?? []).some((a) => a.tool) ? void ctx.hit(90) : ctx.log('Dark Penalty did nothing.')) } },
  // Bronzong – Oracle Inflict: 10 more for each card in the opponent's hand.
  'bw4-76': { 'Oracle Inflict': { run: (ctx) => void ctx.hit(30 + 10 * ctx.opp.hand.length) } },
};
