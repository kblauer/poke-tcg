import { rngFrom } from '@poke-tcg/campaign';
import { describe, expect, it } from 'vitest';
import { Battle, opponentMon, simulateBattle, type BattleSetup } from './battle.js';
import { fishBiteE, pickWildE, wildCheckE, type EncounterStateE } from './encounters-emerald.js';
import { inGeneration } from './generation.js';
import { createMon } from './mon.js';
import type { EncounterSlots, Mon, Stats } from './types.js';

// Emerald's rules for Hoenn (issue #226, step 3; pokeemerald's wild_encounter.c, battle_util.c), Kanto's FireRed's kept.
const hoenn = <T>(run: () => T) => inGeneration(3, run);
const ZERO: Stats = [0, 0, 0, 0, 0, 0];
// (Its first ability: the leads below have the ability they're named for in slot 0.)
const mon = (id: number, level: number, o: Partial<Mon> = {}): Mon => ({ ...createMon(rngFrom(1), { species: id, level, ivs: ZERO, evs: ZERO, nature: 0 }), abilitySlot: 0, ...o });
const setup = (party: Mon[], foes: Mon[], o: Partial<BattleSetup> = {}): BattleSetup => ({ kind: 'wild', party, foes, bag: {}, settings: { autoHeal: false, tryCatch: false }, badges: 0, terrain: 'grass', ...o });
/** A land table: Zigzagoon (#263) in every slot but the last, a level range, and `last` in it. */
const table = (last = 263, levels: [number, number] = [2, 3]): EncounterSlots => ({ rate: 20, mons: Array.from({ length: 12 }, (_, i) => [...levels, i === 11 ? last : 263] as [number, number, number]) });
/** How many of `n` tries `f` is true for, a seed each. */
const count = (n: number, f: (seed: number) => boolean) => Array.from({ length: n }, (_, s) => f(s + 1)).filter(Boolean).length;

describe("Emerald's wild encounters", () => {
  it('meets none for the first 4 steps after a battle or a map change, counting every step', () => {
    hoenn(() => {
      const enc: EncounterStateE = { steps: 0, buff: 0, prev: '' };
      const lead = mon(252, 10);
      // Off the grass the steps still count.
      for (let i = 0; i < 4; i++) expect(wildCheckE(rngFrom(i), enc, i < 2 ? null : 180, 'l.', lead)).toBe(false);
      expect(enc.steps).toBe(4);
      // From then on the check runs: at the cap (180 × 16 = 2880) every step on the same tile meets one.
      expect(wildCheckE(rngFrom(9), enc, 180, 'l.', lead)).toBe(true);
    });
  });

  it("scales the rate by the lead's ability: Illuminate and Arena Trap double it, Stench and White Smoke halve it, Sand Veil only in a sandstorm", () => {
    hoenn(() => {
      // Leads with each ability (their first): Treecko none of these, Staryu Illuminate, Grimer Stench, Sandshrew Sand Veil.
      const rate = (lead: number, weather?: string) => count(4000, (seed) => wildCheckE(rngFrom(seed), { steps: 4, buff: 0, prev: 'l.' }, 20, 'l.', mon(lead, 10), weather));
      const plain = rate(252);
      // 20 × 16 out of 2880: about 11%.
      expect(plain / 4000).toBeGreaterThan(0.09);
      expect(plain / 4000).toBeLessThan(0.13);
      expect(rate(120)).toBeGreaterThan(plain * 1.6);
      expect(rate(88)).toBeLessThan(plain * 0.7);
      expect(rate(27)).toBeGreaterThan(plain * 0.8);
      expect(rate(27, 'sandstorm')).toBeLessThan(plain * 0.7);
    });
  });

  it("picks the Pokémon by the lead's abilities: Static's Electric slots, Hustle's highest level, Keen Eye's scare, Synchronize's nature, Cute Charm's gender", () => {
    hoenn(() => {
      const odds = [20, 20, 10, 10, 10, 10, 5, 5, 4, 4, 1, 1];
      // Leads with each ability (their first), at 50: Pikachu Static, Togepi Hustle, Pidgey Keen Eye, Abra Synchronize, Clefairy Cute Charm; Treecko none of these.
      const LEADS: Record<string, number> = { static: 25, hustle: 175, 'keen-eye': 16, synchronize: 63, 'cute-charm': 35, overgrow: 252 };
      const lead = (ability: string, o: Partial<Mon> = {}) => mon(LEADS[ability]!, 50, o);
      // Static: half the time one of the Electric slots (Electrike, #309, in the 1% slot), whatever its odds.
      const electric = count(1000, (s) => pickWildE(rngFrom(s), table(309), odds, 'land', lead('static'))!.species === 309);
      expect(electric).toBeGreaterThan(400);
      expect(count(1000, (s) => pickWildE(rngFrom(s), table(309), odds, 'land', lead('overgrow'))!.species === 309)).toBeLessThan(40);
      // Fishing never takes Static's slots.
      expect(count(1000, (s) => pickWildE(rngFrom(s), table(309), odds, 'fishing', lead('static'))!.species === 309)).toBeLessThan(40);
      // Hustle: half the time the highest level.
      const top = (ability: string) => count(1000, (s) => pickWildE(rngFrom(s), table(263, [2, 10]), odds, 'land', lead(ability))!.level === 10);
      expect(top('hustle')).toBeGreaterThan(450);
      expect(top('overgrow')).toBeLessThan(200);
      // Keen Eye, a lead at 50: half of the Pokémon 5 or more levels below it run off; never when fishing.
      expect(count(1000, (s) => pickWildE(rngFrom(s), table(), odds, 'land', lead('keen-eye')) === null)).toBeGreaterThan(400);
      expect(count(1000, (s) => pickWildE(rngFrom(s), table(), odds, 'fishing', lead('keen-eye')) === null)).toBe(0);
      // Synchronize: half the time the lead's nature (given to the new Pokémon; the rest rolled by createMon).
      expect(count(1000, (s) => pickWildE(rngFrom(s), table(), odds, 'land', lead('synchronize', { nature: 7 }))!.nature === 7)).toBeGreaterThan(400);
      // Cute Charm: two times in three the other gender, for a species with both.
      expect(count(1000, (s) => pickWildE(rngFrom(s), table(), odds, 'land', lead('cute-charm', { gender: 'male' }))!.gender === 'female')).toBeGreaterThan(600);
    });
  });

  it('bites 85% of casts and half the rest with Suction Cups or Sticky Hold leading, half otherwise', () => {
    hoenn(() => {
      // Octillery's Suction Cups; Treecko's Overgrow.
      const bites = (lead: number) => count(4000, (s) => fishBiteE(rngFrom(s), mon(lead, 10)));
      expect(bites(224) / 4000).toBeGreaterThan(0.89);
      expect(bites(252) / 4000).toBeLessThan(0.55);
    });
  });
});

describe("Emerald's battles", () => {
  it("start in the map's weather once both are out, for good, before either's ability (a foe's Drought replaces the rain)", () => {
    hoenn(() => {
      const rain = simulateBattle(setup([mon(258, 30)], [opponentMon(mon(263, 5))], { weather: 'rain' }), rngFrom(3)).events;
      const sends = rain.flatMap((e, i) => (e.t === 'send' ? [i] : []));
      const weather = rain.findIndex((e) => e.t === 'weather');
      expect(rain[weather]).toMatchObject({ weather: 'rain', msg: 'It is raining.' });
      expect(weather).toBeGreaterThan(sends[1]!);
      // Never wears off.
      expect(rain.some((e) => e.t === 'weather' && e.weather === null)).toBe(false);
      // Groudon's Drought.
      const drought = simulateBattle(setup([mon(258, 30)], [opponentMon(mon(383, 30))], { weather: 'rain' }), rngFrom(3)).events.filter((e) => e.t === 'weather');
      expect(drought.slice(0, 2).map((e) => e.t === 'weather' && e.weather)).toEqual(['rain', 'sun']);
    });
  });

  it("play Gen 3's held Berries and herbs: the White Herb undoes Intimidate", () => {
    hoenn(() => {
      const events = simulateBattle(setup([mon(130, 30)], [opponentMon(mon(263, 30, { item: 'white-herb' }))], { kind: 'trainer' }), rngFrom(5)).events;
      expect(events.some((e) => 'msg' in e && /White Herb returned its stats to normal/.test(String(e.msg)))).toBe(true);
    });
  });

  it("give the player's Pokémon the 3rd badge's Speed (Emerald's Dynamo Badge; Kanto's Thunder Badge too, as FireRed's)", () => {
    const speeds = (badges: number) => {
      const b = new Battle(setup([mon(4, 30)], [opponentMon(mon(19, 30))], { badges }), rngFrom(1));
      return b.speed(b.active[0]);
    };
    hoenn(() => expect(speeds(3)).toBe(Math.floor((speeds(2) * 110) / 100)));
    expect(speeds(3)).toBe(Math.floor((speeds(2) * 110) / 100));
  });
});
