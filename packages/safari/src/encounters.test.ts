import { describe, expect, it } from 'vitest';
import { rngFrom } from '@poke-tcg/campaign';
import { BOARD_SIZE } from './battle.js';
import { TRAINER_NAMES } from './effects.js';
import { DRAFT, applySafariAction, cardUnit, createSafari, draftPool, isLegendary, type Card, type PokemonCard, type SafariAction, type SafariState, type SafariSystemAction } from './draft.js';
import { ENCOUNTER_STEPS, LEGENDARY_FROM, LEGENDARY_MIN_TIER, MAX_KEYWORDS, SPECIAL_SHOP, UPGRADES, UPGRADE_KEYWORDS, rollEncounterOffers, rollEncounterSteps, type EncounterOffer } from './encounters.js';
import { allUnits } from './species.js';

const units = allUnits();
const pool = draftPool(units);
const unit = (id: string) => pool.units.get(id)!;
/** Units that never merge with each other and can't evolve: no evolution line, all different Pokémon. */
const FILL = units.filter((u) => pool.lone(u) && !isLegendary(u) && !['Tauros'].includes(u.name)).map((u) => u.id);

function must(state: SafariState, action: SafariAction | SafariSystemAction): SafariState {
  const result = applySafariAction(state, action, units);
  if (!result.ok) throw new Error(`${action.type}: ${result.error}`);
  return result.state;
}
const refused = (state: SafariState, action: SafariAction) => {
  const result = applySafariAction(state, action, units);
  return result.ok ? null : result.error;
};
const card = (id: string, key: number, extra: Partial<PokemonCard> = {}): Card => ({ key, kind: 'pokemon', unit: id, bonuses: [], ...extra });

/** A run in its first shop holding `board`, with ₱1,000, the step's encounters `offers` and an encounter step under way. */
function step(board: string[], offers: EncounterOffer[], seed = 1): SafariState {
  const start = createSafari(seed, units);
  const s = must(start, { type: 'PICK_STARTER', unit: start.starters[0]! });
  s.board = Array.from({ length: BOARD_SIZE }, (_, i) => (board[i] ? card(board[i]!, 100 + i, { since: 0 }) : null));
  s.nextKey = 200;
  s.pokedollars = 1000;
  s.encounterSteps = [{ after: 0, battle: false }];
  s.encounters = offers;
  s.opponents = [];
  return s;
}

describe('the encounter steps', () => {
  it('come after 5 different battles of the 1st to the 14th, about half with a battle', () => {
    let battles = 0;
    for (let seed = 0; seed < 400; seed++) {
      const steps = rollEncounterSteps(rngFrom(seed));
      expect(steps).toHaveLength(ENCOUNTER_STEPS);
      const afters = steps.map((s) => s.after);
      expect(afters).toEqual([...new Set(afters)].sort((a, b) => a - b));
      for (const a of afters) expect(a >= 1 && a <= 14).toBe(true);
      battles += steps.filter((s) => s.battle).length;
    }
    expect(battles / (400 * ENCOUNTER_STEPS)).toBeCloseTo(0.5, 1);
  });

  it('offers different kinds, a legendary\'s board only when there are legendaries to bring', () => {
    const rng = rngFrom(3);
    const legends = units.filter((u) => isLegendary(u) && u.tier >= LEGENDARY_MIN_TIER);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 4000; i++) {
      const offers = rollEncounterOffers(rng, 2, i % 2 ? legends : []);
      expect(offers[0]!.kind).not.toBe(offers[1]!.kind);
      for (const o of offers) {
        counts[o.kind] = (counts[o.kind] ?? 0) + 1;
        if (o.kind === 'legendary') {
          expect(i % 2).toBe(1);
          expect(unit(o.legendary!).tier).toBeGreaterThanOrEqual(LEGENDARY_MIN_TIER);
        }
      }
    }
    expect(counts.upgrade).toBeGreaterThan(counts.trainerGift!);
    expect(counts.legendary).toBeGreaterThan(0);
  });

  it('a step of two encounters has no battle; one with a battle has the opponents and an encounter', () => {
    const start = createSafari(2, units);
    start.encounterSteps = [{ after: 0, battle: false }, { after: 1, battle: true }];
    let s = must(start, { type: 'PICK_STARTER', unit: start.starters[0]! });
    expect(s.opponents).toEqual([]);
    expect(s.encounters).toHaveLength(2);
    expect(refused(s, { type: 'CHOOSE', index: 0 })).toBe('No such opponent');
    s = must(must(s, { type: 'ENCOUNTER', index: 0 }), { type: 'LEAVE' });
    // The next step is the first battle's.
    expect(s.encounters).toEqual([]);
    expect(s.opponents.length).toBeGreaterThan(0);
    s = must(must(s, { type: 'CHOOSE', index: 0 }), { type: 'BATTLE' });
    if (s.phase !== 'shop') return;
    expect(s.battles).toBe(1);
    // After battle 1: opponents and an encounter; a battle picked there is an extra one.
    expect(s.encounters).toHaveLength(1);
    expect(s.opponents.length).toBeGreaterThan(0);
    s = must(must(s, { type: 'CHOOSE', index: 0 }), { type: 'BATTLE' });
    if (s.phase !== 'shop') return;
    expect(s.battles).toBe(1);
    expect(s.log.some((l) => l.includes('an extra battle'))).toBe(true);
    expect(s.encounterSteps).toEqual([]);
    expect(s.encounters).toEqual([]);
  });

  it('keeps to its phase: no shop while an encounter is open, no taking with none', () => {
    const s = step([FILL[0]!], [{ kind: 'trainerGift' }]);
    expect(refused(s, { type: 'TAKE', index: 0 })).toBe('No encounter under way');
    const open = must(s, { type: 'ENCOUNTER', index: 0 });
    expect(open.phase).toBe('encounter');
    for (const action of [{ type: 'BUY', index: 0 }, { type: 'REROLL' }, { type: 'CHOOSE', index: 0 }, { type: 'ENCOUNTER', index: 0 }] as SafariAction[]) expect(refused(open, action)).toBe('Finish the encounter first');
    expect(refused(open, { type: 'MOVE', from: { zone: 'board', at: 0 }, to: { zone: 'board', at: 1 } })).toBeNull();
  });
});

describe('upgrades', () => {
  it('offer 2, Rare Candy only while a held Pokémon can evolve', () => {
    for (let seed = 0; seed < 60; seed++) {
      const lone = must(step(FILL.slice(0, 3), [{ kind: 'upgrade' }], seed), { type: 'ENCOUNTER', index: 0 });
      const upgrades = lone.encounter!.kind === 'upgrade' ? lone.encounter!.upgrades : [];
      expect(upgrades).toHaveLength(2);
      expect(upgrades.some((u) => u.kind === 'rareCandy')).toBe(false);
    }
    const kinds = new Set<string>();
    for (let seed = 0; seed < 60; seed++) {
      const open = must(step(['4'], [{ kind: 'upgrade' }], seed), { type: 'ENCOUNTER', index: 0 });
      if (open.encounter!.kind === 'upgrade') for (const u of open.encounter!.upgrades) kinds.add(u.kind);
    }
    expect(kinds.has('rareCandy')).toBe(true);
    expect(kinds.has('keyword')).toBe(true);
  });

  it('Protein and HP Up stay on the card, through merges too', () => {
    let s = must(step(['4'], [{ kind: 'upgrade' }]), { type: 'ENCOUNTER', index: 0 });
    s.encounter = { kind: 'upgrade', upgrades: [{ kind: 'protein', key: 100, unit: '4' }, { kind: 'hpUp', key: 100, unit: '4' }] };
    s = must(s, { type: 'TAKE', index: 0 });
    expect(s.phase).toBe('shop');
    expect(s.encounterSteps).toEqual([]);
    expect(cardUnit(s.board[0] as PokemonCard, pool).attack).toBe(unit('4').attack + UPGRADES.protein.attack);
    // A second Charmander: the merge into Charmeleon keeps the Protein.
    s = must(s, { type: 'GIFT', unit: '4' });
    expect(s.board[0]).toMatchObject({ unit: '5' });
    expect((s.board[0] as PokemonCard).bonuses.map((b) => b.from)).toEqual([expect.stringMatching(/^Protein /)]);
    expect(cardUnit(s.board[0] as PokemonCard, pool).attack).toBe(unit('5').attack + UPGRADES.protein.attack);
  });

  it('a keyword is one more for the Pokémon, with its own', () => {
    let s = must(step(['128'], [{ kind: 'upgrade' }]), { type: 'ENCOUNTER', index: 0 }); // Tauros: Trample and Enrage 10
    s.encounter = { kind: 'upgrade', upgrades: [{ kind: 'keyword', key: 100, unit: '128', ability: { k: 'Armor', n: 10 } }] };
    s = must(s, { type: 'TAKE', index: 0 });
    expect(cardUnit(s.board[0] as PokemonCard, pool).abilities).toEqual([...unit('128').abilities, { k: 'Armor', n: 10 }]);
    expect(UPGRADE_KEYWORDS).toContainEqual({ k: 'Armor', n: 10 });
    expect(s.log.at(-1)).toBe('Tauros learned Armor 10.');
    // A golden copy made with it keeps the keyword.
    s = must(must(s, { type: 'GIFT', unit: '128' }), { type: 'GIFT', unit: '128' });
    expect(s.board[0]).toMatchObject({ unit: '128', golden: true });
    expect(cardUnit(s.board[0] as PokemonCard, pool).abilities.map((a) => a.k)).toEqual(['Trample', 'Enrage', 'Armor']);
  });

  it('offers a keyword the Pokémon hasn\'t, never to one with 3', () => {
    const full = units.find((u) => u.abilities.length === MAX_KEYWORDS && pool.lone(u) && !isLegendary(u))!;
    let offered = 0;
    for (let seed = 0; seed < 60; seed++) {
      // A Pokémon with 3 keywords and no evolution: only Protein and HP Up.
      const none = must(step([full.id], [{ kind: 'upgrade' }], seed), { type: 'ENCOUNTER', index: 0 });
      if (none.encounter!.kind === 'upgrade') expect(none.encounter!.upgrades.map((u) => u.kind).sort()).toEqual(['hpUp', 'protein']);
      const open = must(step(['128'], [{ kind: 'upgrade' }], seed), { type: 'ENCOUNTER', index: 0 });
      for (const u of open.encounter!.kind === 'upgrade' ? open.encounter!.upgrades : []) {
        if (u.kind !== 'keyword') continue;
        offered++;
        expect(UPGRADE_KEYWORDS).toContainEqual(u.ability);
        expect(unit('128').abilities.some((a) => a.k === u.ability.k), u.ability.k).toBe(false);
      }
    }
    expect(offered).toBeGreaterThan(0);
    // A third keyword is the last.
    const two = step(['128'], [{ kind: 'upgrade' }]);
    (two.board[0] as PokemonCard).bonuses = [{ from: 'TM 1', attack: 0, hp: 0, ability: { k: 'Shield' } }];
    for (let seed = 0; seed < 30; seed++) {
      const open = must({ ...two, rngState: seed }, { type: 'ENCOUNTER', index: 0 });
      if (open.encounter!.kind === 'upgrade') expect(open.encounter!.upgrades.some((u) => u.kind === 'keyword')).toBe(false);
    }
  });

  it('Rare Candy evolves it now, a pick of 2 where its line branches, keeping its bonuses', () => {
    // Wurmple evolves into Silcoon or Cascoon.
    let s = must(step(['265'], [{ kind: 'upgrade' }]), { type: 'ENCOUNTER', index: 0 });
    (s.board[0] as PokemonCard).bonuses = [{ from: 'HP Up 1', attack: 0, hp: 40 }];
    s.encounter = { kind: 'upgrade', upgrades: [{ kind: 'rareCandy', key: 100, unit: '265' }] };
    s = must(s, { type: 'TAKE', index: 0 });
    expect(s.pick).toMatchObject({ kind: 'evolve', from: ['Wurmple'] });
    expect([...s.pick!.options].sort()).toEqual(['266', '268']);
    s = must(s, { type: 'PICK', unit: '268' });
    expect(s.board[0]).toMatchObject({ unit: '268', bonuses: [{ from: 'HP Up 1' }] });
    expect(s.log.at(-1)).toBe('Wurmple evolved into Cascoon.');
    // Charmander only into Charmeleon: no pick.
    s = must(step(['4'], [{ kind: 'upgrade' }]), { type: 'ENCOUNTER', index: 0 });
    s.encounter = { kind: 'upgrade', upgrades: [{ kind: 'rareCandy', key: 100, unit: '4' }] };
    s = must(s, { type: 'TAKE', index: 0 });
    expect(s.pick).toBeNull();
    expect(s.board[0]).toMatchObject({ unit: '5' });
    expect(s.log.at(-1)).toBe('Charmander evolved into Charmeleon.');
  });
});

describe('gifts and the special shop', () => {
  it('a card gift is a pick of 3 of the shop\'s tiers, one a partner of a card held', () => {
    for (let seed = 0; seed < 40; seed++) {
      const open = must(step(['4'], [{ kind: 'cardGift' }], seed), { type: 'ENCOUNTER', index: 0 });
      const cards = open.encounter!.kind === 'cardGift' ? open.encounter!.cards : [];
      expect(cards).toHaveLength(3);
      expect(cards).toContain('4'); // another Charmander, its only partner
      for (const id of cards) expect(unit(id).tier).toBeLessThanOrEqual(open.shopTier);
    }
    const s = must(must(step([FILL[0]!], [{ kind: 'cardGift' }]), { type: 'ENCOUNTER', index: 0 }), { type: 'TAKE', index: 1 });
    expect(s.board.filter(Boolean)).toHaveLength(2);
  });

  it('a Trainer gift is a pick of 3 Trainer cards, to the inventory', () => {
    const open = must(step([FILL[0]!], [{ kind: 'trainerGift' }]), { type: 'ENCOUNTER', index: 0 });
    const trainers = open.encounter!.kind === 'trainerGift' ? open.encounter!.trainers : [];
    expect(new Set(trainers).size).toBe(3);
    for (const t of trainers) expect(TRAINER_NAMES).toContain(t);
    const s = must(open, { type: 'TAKE', index: 2 });
    expect(s.inventory[0]).toMatchObject({ kind: 'trainer', trainer: trainers[2] });
  });

  it('the special shop sells 5 cards up to a tier above the shop\'s and 2 Trainer cards at ₱100, until left', () => {
    let s = must(step([FILL[0]!], [{ kind: 'specialShop' }]), { type: 'ENCOUNTER', index: 0 });
    const open = s.encounter!;
    if (open.kind !== 'specialShop') throw new Error('not a special shop');
    expect(open.cards).toHaveLength(SPECIAL_SHOP.cards);
    for (const id of open.cards) expect(unit(id!).tier).toBeLessThanOrEqual(s.shopTier + 1);
    expect(open.trainers).toHaveLength(SPECIAL_SHOP.trainers);
    s = must(s, { type: 'TAKE', index: SPECIAL_SHOP.cards });
    expect(s.pokedollars).toBe(1000 - SPECIAL_SHOP.trainerPrice);
    expect(s.inventory[0]).toMatchObject({ kind: 'trainer' });
    expect(refused(s, { type: 'TAKE', index: SPECIAL_SHOP.cards })).toBe('No card there');
    s = must(s, { type: 'SELL', place: { zone: 'inventory', at: 0 } });
    expect(s.phase).toBe('encounter');
    s = must(s, { type: 'LEAVE' });
    expect(s.phase).toBe('shop');
  });

  it('the shop after a battle never sells Trainer cards', () => {
    for (let seed = 0; seed < 20; seed++) {
      const start = createSafari(seed, units);
      const s = must(start, { type: 'PICK_STARTER', unit: start.starters[0]! });
      for (const id of s.shop!.offers) expect(pool.units.has(id!)).toBe(true);
    }
    expect(DRAFT.trainerPrice).toBeGreaterThan(0);
  });
});

describe('the legendary\'s board', () => {
  it('comes from the 6th battle, once a run; won, the legendary joins, the battle an extra one', () => {
    const early = createSafari(5, units);
    early.encounterSteps = Array.from({ length: 4 }, () => ({ after: 0, battle: false }));
    let e = must(early, { type: 'PICK_STARTER', unit: early.starters[0]! });
    for (let i = 0; i < 3; i++) {
      expect(e.encounters.some((o) => o.kind === 'legendary')).toBe(false);
      e = must(must(e, { type: 'ENCOUNTER', index: 0 }), { type: 'LEAVE' });
    }

    const legend = units.find((u) => isLegendary(u) && u.tier >= LEGENDARY_MIN_TIER)!;
    let s = step([], [{ kind: 'legendary', legendary: legend.id }]);
    s.battles = LEGENDARY_FROM;
    s.encounterSteps = [{ after: LEGENDARY_FROM, battle: false }];
    // A strong board of the shop's (tier-4 Stage 1s): when the legendary's fight is won, it joins.
    s.board = pool.shop[3]!.filter((u) => u.stage === 'stage1').slice(0, BOARD_SIZE).map((u, i) => card(u.id, 300 + i));
    s = must(s, { type: 'ENCOUNTER', index: 0 });
    expect(s.phase).toBe('ready');
    expect(s.opponent).toMatchObject({ difficulty: 'legendary', pay: 0 });
    expect(s.opponent!.board[0]).toBe(legend.id);
    for (const id of s.opponent!.board.slice(1)) expect(isLegendary(unit(id))).toBe(false);
    expect(s.legendaryMet).toBe(true);
    s = must(s, { type: 'BATTLE' });
    expect(s.battles).toBe(LEGENDARY_FROM);
    if (s.last!.winner === 0) expect([...s.board, ...s.inventory].some((c) => c?.kind === 'pokemon' && c.unit === legend.id)).toBe(true);
  });
});
