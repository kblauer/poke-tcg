// The effect tables hold what they say they hold (#204). A table entry read from another set's table while the modules
// load (`BASE1['…']!`, a power or Trainer copied from an older set) is `undefined` whenever the import order changes, and
// then the card silently does nothing while still counting as implemented; an attack built with `same(() => …)` does
// nothing as silently when its getter finds no attack (a wrong id, a renamed attack). So: every key of every table has
// its effect, every `same` getter finds one, and no Ability is an empty shell (`asAbility(undefined)`).
import { describe, expect, it } from 'vitest';
import { attackEffect, effectIds, energyEffect, powerEffect, trainerEffect } from '../index.js';
import { EX_TEMPLATE_DATA } from './ex-template-data.js';

const ids = effectIds();
const attacks = Object.entries(ids.attacks).flatMap(([id, names]) => names.map((name) => [id, name] as const));
const templated = Object.entries(EX_TEMPLATE_DATA).flatMap(([id, byName]) => Object.keys(byName).map((name) => [id, name] as const));

/** Keys that say what a power is, not what it does. (An older power may be just these, its rule written where it applies: `{ ...POKE_BODY }`.) */
const KIND_KEYS = ['ability', 'ignoresConditions', 'body', 'name'];

describe('the effect tables', () => {
  it('have an effect for every attack they name', () => {
    expect(attacks.length).toBeGreaterThan(3500);
    expect(attacks.filter(([id, name]) => typeof attackEffect(id, name) !== 'object').map(([id, name]) => `${id} ${name}`)).toEqual([]);
  });

  it('have an effect for every attack played by a shared wording (ex-template-data.ts)', () => {
    expect(templated.length).toBeGreaterThan(2000);
    expect(templated.filter(([id, name]) => typeof attackEffect(id, name) !== 'object').map(([id, name]) => `${id} ${name}`)).toEqual([]);
  });

  it("find the other set's attack for every same(() => …)", () => {
    const sames = attacks.filter(([id, name]) => attackEffect(id, name)?.sameAs);
    expect(sames.length).toBeGreaterThan(100);
    expect(sames.filter(([id, name]) => typeof attackEffect(id, name)!.sameAs!() !== 'object').map(([id, name]) => `${id} ${name}`)).toEqual([]);
  });

  it('have an effect for every power, Trainer and special Energy card they name', () => {
    expect(ids.powers.filter((id) => typeof powerEffect(id) !== 'object')).toEqual([]);
    expect(ids.trainers.filter((id) => typeof trainerEffect(id) !== 'object')).toEqual([]);
    expect(ids.energy.filter((id) => typeof energyEffect(id) !== 'object')).toEqual([]);
  });

  it('have no Ability that is an empty shell (asAbility of a table entry that was not there yet)', () => {
    const does = (id: string) => Object.entries(powerEffect(id)!).some(([key, value]) => value !== undefined && !KIND_KEYS.includes(key));
    expect(ids.powers.filter((id) => powerEffect(id)!.ability && !does(id))).toEqual([]);
  });

  it('have no Trainer with an empty effect', () => {
    const empty = (effect: object) => !Object.values(effect).some((value) => value !== undefined);
    expect(ids.trainers.filter((id) => empty(trainerEffect(id)!))).toEqual([]);
  });
});
