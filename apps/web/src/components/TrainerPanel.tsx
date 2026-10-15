import { lookupCard, type CardInstance, type PlayerView, type PokemonCardDef, type Target, type TrainerChoiceSpec } from '@poke-tcg/game-engine';
import { useState } from 'react';
import type { TrainerControl } from '../hooks/useTrainer';
import { Card } from './Card';

const option = 'rounded bg-slate-700 px-2 py-1 text-left text-xs transition hover:bg-slate-600 active:scale-95 disabled:opacity-40';

/** The Trainer card being played: its text, the current question, then a Play button. */
export function TrainerPanel({ view, trainer }: { view: PlayerView; trainer: TrainerControl }) {
  const { card, def, spec } = trainer;
  if (!card || !def || def.kind !== 'trainer') return null;
  const error = trainer.error(card);
  return (
    <section className="flex gap-3 rounded-lg bg-slate-900 p-3 text-xs">
      <div className="w-20 shrink-0">
        <Card def={def} small />
      </div>
      <div className="min-w-0 flex-1 space-y-2">
        <p>
          <span className="font-semibold">{def.name}</span> <span className="text-slate-400">{def.text}</span>
        </p>
        {error ? (
          <p className="text-amber-300">{error}.</p>
        ) : spec ? (
          <Question key={spec.prompt} spec={spec} view={view} onAnswer={trainer.answer} />
        ) : (
          <button className="rounded bg-emerald-600 px-3 py-1 text-sm font-semibold transition hover:bg-emerald-500 active:scale-95" onClick={trainer.play}>
            Play {def.name}
          </button>
        )}
        <button onClick={trainer.cancel} className="block text-slate-400 hover:text-slate-200">
          Cancel (Esc)
        </button>
      </div>
    </section>
  );
}

function Question({ spec, view, onAnswer }: { spec: TrainerChoiceSpec; view: PlayerView; onAnswer: TrainerControl['answer'] }) {
  const pokemonName = (side: 'own' | 'opp', t: Target) => {
    const owner = side === 'own' ? view.self : view.opponent;
    const p = (t === 'active' ? owner.active : owner.bench[t])!;
    const def = lookupCard(view.cards, p.card.defId) as PokemonCardDef;
    return `${def.name} (${t === 'active' ? 'active' : `bench ${t + 1}`}, ${def.hp - p.damage}/${def.hp} HP)`;
  };
  return (
    <div className="space-y-1">
      <p className="text-slate-300">{spec.prompt}:</p>
      {spec.kind === 'pokemon' && (
        <div className="flex flex-wrap gap-1">
          {spec.options.map((t) => (
            <button key={String(t)} className={option} onClick={() => onAnswer(t)}>
              {pokemonName(spec.side, t)}
            </button>
          ))}
        </div>
      )}
      {spec.kind === 'stage' && (
        <div className="flex gap-1">
          {spec.options.map((st) => (
            <button key={st} className={option} onClick={() => onAnswer(st)}>
              {st === 'stage1' ? 'Stage 1 and up' : 'Stage 2'}
            </button>
          ))}
        </div>
      )}
      {spec.kind === 'cards' && <CardPicker spec={spec} view={view} onDone={onAnswer} />}
    </div>
  );
}

/** Pick between `min` and `max` of the offered cards, then confirm. */
function CardPicker({ spec, view, onDone }: { spec: Extract<TrainerChoiceSpec, { kind: 'cards' }>; view: PlayerView; onDone: (uids: string[]) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const toggle = (c: CardInstance) =>
    setPicked((p) => (p.includes(c.uid) ? p.filter((u) => u !== c.uid) : [...p, c.uid].slice(-spec.max)));
  return (
    <>
      <div className="flex flex-wrap gap-1">
        {spec.options.map((c) => (
          <button
            key={c.uid}
            aria-pressed={picked.includes(c.uid)}
            className={`${option} ${picked.includes(c.uid) ? 'ring-2 ring-yellow-300' : ''}`}
            onClick={() => toggle(c)}
          >
            {lookupCard(view.cards, c.defId).name}
          </button>
        ))}
      </div>
      <button className={option} disabled={picked.length < spec.min || picked.length > spec.max} onClick={() => onDone(picked)}>
        Choose {picked.length}
        {spec.min === spec.max ? `/${spec.max}` : ` (${spec.min}–${spec.max})`}
      </button>
    </>
  );
}
