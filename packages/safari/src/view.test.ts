import { describe, expect, it } from 'vitest';
import { int, rngFrom } from '@poke-tcg/campaign';
import { applySafariAction, createSafari, type SafariAction, type SafariState } from './draft.js';
import { allUnits } from './species.js';
import { simulateBattle } from './battle.js';
import { DRAFT, type PokemonCard } from './draft.js';
import { safariView } from './view.js';

const units = allUnits();

/** A run played some way by random actions, its states along the way. */
function played(seed: number, steps: number): SafariState[] {
  const rng = rngFrom(seed);
  let s = createSafari(seed, units);
  const states = [s];
  for (let i = 0; i < steps && s.phase !== 'won' && s.phase !== 'lost'; i++) {
    const actions: SafariAction[] = [
      { type: 'PICK_STARTER', unit: s.starters[0]! },
      { type: 'BUY', index: int(rng, 5) },
      { type: 'PICK', unit: s.pick?.options[0] ?? '' },
      { type: 'CHOOSE', index: 0 },
      { type: 'BATTLE' },
      { type: 'ENCOUNTER', index: 0 },
      { type: 'TAKE', index: 0 },
      { type: 'LEAVE' },
    ];
    const result = applySafariAction(s, actions[int(rng, actions.length)]!, units);
    if (result.ok) states.push((s = result.state));
  }
  return states;
}

describe('what the browser gets of a run', () => {
  it('never holds the RNG state, an offered opponent\'s board, Blue\'s board, the steps to come or the gifts waiting', () => {
    for (let seed = 0; seed < 6; seed++) {
      for (const state of played(seed, 200)) {
        const view = safariView(state, units) as unknown as Record<string, unknown>;
        for (const key of ['rngState', 'champion', 'encounterSteps', 'gifts']) expect(view, key).not.toHaveProperty(key);
        for (const o of view.opponents as Record<string, unknown>[]) {
          expect(o).not.toHaveProperty('board');
          expect(o).not.toHaveProperty('trainer');
        }
        // Blue's board shows only once he's chosen.
        const blue = JSON.stringify(state.champion.board);
        if (state.opponent?.difficulty !== 'champion' && state.last?.against.difficulty !== 'champion') expect(JSON.stringify(view).includes(blue)).toBe(false);
      }
    }
  });

  it('shows the chosen opponent\'s board, and the last battle with its events to play back', () => {
    const states = played(3, 300);
    const ready = states.find((s) => s.phase === 'ready')!;
    expect(safariView(ready, units).opponent!.board).toEqual(ready.opponent!.board);
    const fought = states.find((s) => s.last)!;
    const view = safariView(fought, units);
    expect(view.last!.events).toEqual(simulateBattle(fought.last!.mine, fought.last!.opponent, fought.last!.seed).events);
    expect(view.last!.events.at(-1)).toEqual({ e: 'end', winner: fought.last!.winner });
  });

  it("prices what the screen shows by the draft's rules", () => {
    const shopping = played(5, 300).find((s) => s.phase === 'shop' && s.shop && !s.shop.oak && s.board.some((c) => c?.kind === 'pokemon'))!;
    const { prices } = safariView(shopping, units);
    const tierOf = (id: string) => units.find((u) => u.id === id)!.tier;
    expect(prices.shop).toEqual(shopping.shop!.offers.map((id) => id && DRAFT.cardPrice[tierOf(id) - 1]));
    for (const c of shopping.board) if (c?.kind === 'pokemon') expect([Math.floor(DRAFT.cardPrice[tierOf(c.unit) - 1]! * DRAFT.sellShare), DRAFT.cardPrice[tierOf(c.unit) - 1]]).toContain(prices.sell[c.key]);
    expect([0, DRAFT.reroll]).toContain(prices.reroll);
  });

  it("shows each Pokémon card held as it fights: its attack, HP and keywords, with its bonuses and golden's", () => {
    const state = structuredClone(played(5, 300).find((s) => s.phase === 'shop' && s.board.some((c) => c?.kind === 'pokemon'))!);
    const held = [...state.board, ...state.inventory].filter((c): c is PokemonCard => c?.kind === 'pokemon');
    const unitOf = (c: PokemonCard) => units.find((u) => u.id === c.unit)!;
    const plain = safariView(state, units).stats;
    expect(Object.keys(plain).map(Number).sort((a, b) => a - b)).toEqual(held.map((c) => c.key).sort((a, b) => a - b));
    for (const c of held) if (!c.bonuses.length && !c.golden) expect(plain[c.key]).toEqual({ attack: unitOf(c).attack, hp: unitOf(c).hp, abilities: unitOf(c).abilities });
    // A golden copy that learned a keyword it hasn't.
    const first = held[0]!;
    const learned = (['Taunt', 'Shield'] as const).find((k) => !unitOf(first).abilities.some((a) => a.k === k))!;
    first.golden = true;
    first.bonuses = [{ from: 'TM 1', attack: 0, hp: 0, ability: { k: learned } }];
    expect(safariView(state, units).stats[first.key]).toEqual({ attack: unitOf(first).attack + DRAFT.golden.attack, hp: unitOf(first).hp + DRAFT.golden.hp, abilities: [...unitOf(first).abilities, { k: learned }] });
  });
});
