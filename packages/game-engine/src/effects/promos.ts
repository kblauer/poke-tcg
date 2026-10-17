// Promo cards' attack effects, by card id and attack name: Wizards Black Star Promos (basep) and the
// Japanese-only Pokémon Web Electrode (pkweb-26, a hand-made catalog card: packages/db/prisma/data/custom-cards.json).
// Rulings (agreed): Energy Absorption works like Energy Conversion: it needs an Energy card in the
// discard pile and takes 1 or 2.
import type { AttackEffect, AttackSituation, ChoiceSpec } from '../attacks.js';
import { lookupCard } from '../cards.js';
import { recoil } from './common.js';

/** Energy cards in the attacking player's discard pile. */
const discardEnergy = (s: AttackSituation) => s.ownDiscard.filter((c) => lookupCard(s.cards, c.defId).kind === 'energy');

/** Mewtwo's Energy Absorption: attach up to 2 Energy cards from your discard pile to Mewtwo. */
const energyAbsorption: AttackEffect = {
  blocked: (s) => (discardEnergy(s).length ? null : 'There are no Energy cards in your discard pile'),
  choices: (s): ChoiceSpec[] => [
    { kind: 'ownDiscard', min: 1, max: 2, options: discardEnergy(s), prompt: 'Choose up to 2 Energy cards from your discard pile to attach to Mewtwo' },
  ],
  run(ctx) {
    const uids = new Set(ctx.choices.discardUids ?? []);
    const taken = ctx.me.discard.filter((c) => uids.has(c.uid));
    ctx.me.discard = ctx.me.discard.filter((c) => !uids.has(c.uid));
    ctx.attacker.energy.push(...taken);
    ctx.log(`Attached ${taken.length} Energy card${taken.length === 1 ? '' : 's'} from the discard pile to ${ctx.attackerDef.name}.`);
  },
};

export const PROMOS: Record<string, Record<string, AttackEffect>> = {
  // Mewtwo (Wizards Promo 3, and its reprint 14)
  'basep-3': { 'Energy Absorption': energyAbsorption },
  'basep-14': { 'Energy Absorption': energyAbsorption },
  // Jigglypuff (Wizards Promo 7)
  'basep-7': { 'First Aid': { run: (ctx) => ctx.heal(10) }, 'Double-Edge': recoil(40, 20) },
  // Electrode (Pokémon Web 26)
  'pkweb-26': {
    Sonicboom: { run: (ctx) => void ctx.hit(30, { weakness: false }) },
    // Search the deck for a basic Energy card, then pick the Pokémon to attach it to.
    'Energy Spike': { run: (ctx) => ctx.pend({ kind: 'pickFromDeck', source: 'Energy Spike', filter: 'basicEnergy', attach: true }) },
  },
};
