import { lookupCard, typeName, type CardInstance, type CardLibrary, type ChoiceSpec, type PlayerView, type PokemonCardDef } from '@poke-tcg/game-engine';
import { useState } from 'react';
import type { AttackControl } from '../hooks/useAttack';
import { typeColor } from '../utils/cardColors';

const option = 'rounded bg-slate-700 px-2 py-1 text-left text-xs transition hover:bg-slate-600 active:scale-95';

/** Asks the current question of the attack being used, e.g. which energy to discard. */
export function AttackChoicePanel({ spec, view, attack }: { spec: ChoiceSpec; view: PlayerView; attack: AttackControl }) {
  const { cards, opponent } = view;
  return (
    <div className="space-y-1 rounded bg-slate-800 p-2 text-xs">
      <p className="text-slate-300">{spec.prompt}:</p>
      <div className="flex flex-col gap-1">
        {spec.kind === 'ownEnergy' && <EnergyPicker key={spec.prompt} options={spec.options} count={spec.count} cards={cards} onDone={attack.answer} />}
        {spec.kind === 'defenderEnergy' &&
          spec.options.map((e) => (
            <button key={e.uid} className={option} onClick={() => attack.answer(e.uid)}>
              {lookupCard(cards, e.defId).name}
            </button>
          ))}
        {spec.kind === 'opponentBench' &&
          spec.options.map((slot) => {
            const p = opponent.bench[slot]!;
            const def = lookupCard(cards, p.card.defId) as PokemonCardDef;
            return (
              <button key={slot} className={option} onClick={() => attack.answer(slot)}>
                {def.name} ({def.hp - p.damage}/{def.hp} HP)
              </button>
            );
          })}
        {(spec.kind === 'defenderAttack' || spec.kind === 'copyAttack') &&
          spec.options.map((i) => {
            const a = (lookupCard(cards, opponent.active!.card.defId) as PokemonCardDef).attacks[i]!;
            return (
              <button key={i} className={option} title={a.text ?? undefined} onClick={() => attack.answer(i)}>
                {a.name} ({a.damageText ?? a.damage})
              </button>
            );
          })}
        {spec.kind === 'type' && (
          <div className="flex flex-wrap gap-1">
            {spec.options.map((t) => (
              <button key={t} className={`${option} capitalize`} onClick={() => attack.answer(t)}>
                {typeName(t)}
              </button>
            ))}
          </div>
        )}
      </div>
      <button onClick={attack.cancel} className="text-slate-400 hover:text-slate-200">
        Cancel (Esc)
      </button>
    </div>
  );
}

/** Pick exactly `count` of the attacker's energy, then confirm. */
function EnergyPicker({
  options,
  count,
  cards,
  onDone,
}: {
  options: CardInstance[];
  count: number;
  cards: CardLibrary;
  onDone: (uids: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (uid: string) => setPicked((p) => (p.includes(uid) ? p.filter((u) => u !== uid) : [...p, uid].slice(-count)));
  return (
    <>
      <div className="flex flex-wrap gap-1">
        {options.map((e) => {
          const def = lookupCard(cards, e.defId);
          const on = picked.includes(e.uid);
          return (
            <button
              key={e.uid}
              onClick={() => toggle(e.uid)}
              title={def.name}
              aria-pressed={on}
              aria-label={`${on ? 'Keep' : 'Discard'} ${def.name}`}
              className={`${typeColor(def)} h-5 w-5 rounded-full border-2 transition ${on ? 'border-red-400 opacity-40' : 'border-white'}`}
            />
          );
        })}
      </div>
      <button className={`${option} disabled:opacity-40`} disabled={picked.length !== count} onClick={() => onDone(picked)}>
        Discard {picked.length}/{count} and attack
      </button>
    </>
  );
}
