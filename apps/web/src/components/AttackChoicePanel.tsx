import { energyProvided, inPlayDef, lookupCard, typeName, type CardInstance, type CardLibrary, type ChoiceSpec, type PlayerView } from '@poke-tcg/game-engine';
import { useState } from 'react';
import type { AttackControl } from '../hooks/useAttack';
import { EnergyIcon } from './EnergyIcon';

// Styled like the Trainer dialog: buttons one shade lighter than the panel.
const option = 'rounded bg-slate-600 px-2 py-1 text-left text-xs transition hover:bg-slate-500 active:scale-95';
/** Shown instead of buttons when the answer is a Pokémon in play, which is clicked on the board. */
export const pickHint = 'text-emerald-300';

/** Asks the current question of the attack being used, e.g. which energy to discard. */
export function AttackChoicePanel({ spec, view, attack }: { spec: ChoiceSpec; view: PlayerView; attack: AttackControl }) {
  const { cards, opponent } = view;
  return (
    <div className="space-y-1 rounded-lg bg-slate-800 p-2 text-xs ring-1 ring-slate-600">
      <p className="text-slate-300">{spec.prompt}:</p>
      <div className="flex flex-col gap-1">
        {spec.kind === 'ownEnergy' && <EnergyPicker key={spec.prompt} options={spec.options} min={spec.count} max={spec.count} cards={cards} onDone={attack.answer} />}
        {spec.kind === 'ownEnergyUpTo' && <EnergyPicker key={spec.prompt} options={spec.options} min={0} max={spec.max ?? spec.options.length} cards={cards} onDone={attack.answer} />}
        {spec.kind === 'ownDiscard' && <DiscardPicker key={spec.prompt} spec={spec} cards={cards} onDone={attack.answer} />}
        {spec.kind === 'opponentBenchMany' && (
          <>
            <p className={pickHint}>Click the CPU's highlighted Benched Pokémon to choose them.</p>
            <button
              className={`${option} disabled:opacity-40`}
              disabled={attack.benchPicked.length !== Math.min(spec.count, spec.options.length)}
              onClick={() => attack.answer(attack.benchPicked)}
            >
              Attack ({attack.benchPicked.length}/{Math.min(spec.count, spec.options.length)})
            </button>
          </>
        )}
        {spec.kind === 'deck' &&
          spec.options.map((d) => (
            <button key={d} className={option} onClick={() => attack.answer(d)}>
              {d === 'own' ? 'Your deck' : "The CPU's deck"}
            </button>
          ))}
        {spec.kind === 'side' &&
          spec.options.map((side) => (
            <button key={side} className={option} onClick={() => attack.answer(side)}>
              {side === 'own' ? 'Your Pokémon' : "The CPU's Pokémon"}
            </button>
          ))}
        {(spec.kind === 'defenderEnergy' || spec.kind === 'pokemonEnergy') &&
          spec.options.map((e) => (
            <button key={e.uid} className={option} onClick={() => attack.answer(e.uid)}>
              {lookupCard(cards, e.defId).name}
            </button>
          ))}
        {spec.kind === 'opponentBench' && <p className={pickHint}>Click one of the CPU's highlighted Benched Pokémon.</p>}
        {spec.kind === 'ownBench' && <p className={pickHint}>Click one of your highlighted Benched Pokémon.</p>}
        {/* "You may switch" (Teleport Blast): -1 stays put. */}
        {spec.kind === 'ownBench' && spec.optional && (
          <button className={option} onClick={() => attack.answer(-1)}>
            Don't switch
          </button>
        )}
        {(spec.kind === 'opponentPokemon' || spec.kind === 'opponentPokemonTo') && <p className={pickHint}>Click one of the CPU's highlighted Pokémon.</p>}
        {spec.kind === 'ownPokemon' && <p className={pickHint}>Click one of your highlighted Pokémon.</p>}
        {spec.kind === 'boost' && (
          // Final Blow, Hydroelectric Power: use the power for this attack, or not.
          <div className="flex flex-wrap gap-1">
            <button className={option} onClick={() => attack.answer(true)}>
              Yes
            </button>
            <button className={option} onClick={() => attack.answer(false)}>
              No
            </button>
          </div>
        )}
        {spec.kind === 'copySource' &&
          // Super Metronome: which of the CPU's Pokémon to copy an attack of, by name.
          spec.options.map((t) => {
            const p = t === 'active' ? opponent.active : opponent.bench[t];
            return (
              p && (
                <button key={String(t)} className={option} onClick={() => attack.answer(t)}>
                  {inPlayDef(cards, p).name}
                  {t === 'active' ? ' (Active)' : ''}
                </button>
              )
            );
          })}
        {(spec.kind === 'defenderAttack' || spec.kind === 'copyAttack') &&
          spec.options.map((i) => {
            const of = spec.kind === 'copyAttack' && spec.of !== undefined && spec.of !== 'active' ? opponent.bench[spec.of] : opponent.active;
            const a = inPlayDef(cards, of!).attacks[i]!;
            return (
              <button key={i} className={option} title={a.text ?? undefined} onClick={() => attack.answer(i)}>
                {a.name} ({a.damageText ?? a.damage})
              </button>
            );
          })}
        {(spec.kind === 'eitherDiscard' || spec.kind === 'oppDiscard') && (
          // Invigorate (either discard pile, answered as a list) and Pranks (the CPU's): one card, by name.
          <div className="flex flex-wrap gap-1">
            {spec.options.map((c) => (
              <button key={c.uid} className={option} onClick={() => attack.answer(spec.kind === 'eitherDiscard' ? [c.uid] : c.uid)}>
                {lookupCard(cards, c.defId).name}
              </button>
            ))}
          </div>
        )}
        {spec.kind === 'amount' && (
          <div className="flex flex-wrap gap-1">
            {spec.options.map((n) => (
              <button key={n} className={option} onClick={() => attack.answer(n)}>
                {spec.labels?.[n] ?? n}
              </button>
            ))}
          </div>
        )}
        {spec.kind === 'vermilion' && (
          <div className="flex flex-wrap gap-1">
            <button className={option} onClick={() => attack.answer(true)}>
              Flip
            </button>
            <button className={option} onClick={() => attack.answer(false)}>
              Don't flip
            </button>
          </div>
        )}
        {spec.kind === 'charity' && (
          <div className="flex flex-wrap gap-1">
            {spec.options.map((n) => (
              <button key={n} className={option} onClick={() => attack.answer(n)}>
                {n < 0 ? 'All of it' : n}
              </button>
            ))}
          </div>
        )}
        {spec.kind === 'condition' && (
          <div className="flex flex-wrap gap-1">
            {spec.options.map((c) => (
              <button key={c} className={`${option} capitalize`} onClick={() => attack.answer(c)}>
                {c}
              </button>
            ))}
          </div>
        )}
        {(spec.kind === 'type' || spec.kind === 'weaknessType') && (
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

/** Pick between `min` and `max` of the attacker's energy to discard, then confirm. */
function EnergyPicker({
  options,
  min,
  max,
  cards,
  onDone,
}: {
  options: CardInstance[];
  min: number;
  max: number;
  cards: CardLibrary;
  onDone: (uids: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (uid: string) => setPicked((p) => (p.includes(uid) ? p.filter((u) => u !== uid) : [...p, uid].slice(-max)));
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
              className={`rounded-full transition ${on ? 'opacity-40 ring-2 ring-red-400' : ''}`}
            >
              <EnergyIcon type={energyProvided(e, cards).type} size="panel" />
            </button>
          );
        })}
      </div>
      <button className={`${option} disabled:opacity-40`} disabled={picked.length < min || picked.length > max} onClick={() => onDone(picked)}>
        Discard {picked.length}
        {min === max ? `/${max}` : ''} and attack
      </button>
    </>
  );
}

/** Pick between `min` and `max` cards from the discard pile, then confirm. A single card is chosen by clicking it. */
function DiscardPicker({
  spec,
  cards,
  onDone,
}: {
  spec: Extract<ChoiceSpec, { kind: 'ownDiscard' }>;
  cards: CardLibrary;
  onDone: (uids: string[]) => void;
}) {
  const [picked, setPicked] = useState<string[]>([]);
  const single = spec.min === 1 && spec.max === 1;
  const toggle = (uid: string) => (single ? onDone([uid]) : setPicked((p) => (p.includes(uid) ? p.filter((u) => u !== uid) : [...p, uid].slice(-spec.max))));
  return (
    <>
      <div className="flex flex-wrap gap-1">
        {spec.options.map((c) => (
          <button
            key={c.uid}
            aria-pressed={picked.includes(c.uid)}
            className={`${option} ${picked.includes(c.uid) ? 'ring-2 ring-yellow-300' : ''}`}
            onClick={() => toggle(c.uid)}
          >
            {lookupCard(cards, c.defId).name}
          </button>
        ))}
      </div>
      {!single && (
        <button className={`${option} disabled:opacity-40`} disabled={picked.length < spec.min || picked.length > spec.max} onClick={() => onDone(picked)}>
          Take {picked.length}
          {spec.min === spec.max ? `/${spec.max}` : ` (up to ${spec.max})`} and attack
        </button>
      )}
    </>
  );
}
