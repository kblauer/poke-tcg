import { lookupCard, type CardInstance, type PlayerView, type TrainerChoiceSpec } from '@poke-tcg/game-engine';
import { useState } from 'react';
import type { TrainerControl } from '../hooks/useTrainer';
import { pickHint } from './AttackChoicePanel';
import { Card } from './Card';

const option = 'rounded bg-slate-700 px-2 py-1 text-left text-xs transition hover:bg-slate-600 active:scale-95 disabled:opacity-40';

/** The Trainer card being played: its text and the current question (the last answer plays it), or a Play button if it has none. */
export function TrainerPanel({ view, trainer }: { view: PlayerView; trainer: TrainerControl }) {
  const { card, def, spec } = trainer;
  if (!card || !def || def.kind !== 'trainer') return null;
  const error = trainer.error(card);
  return (
    <section data-keep-action className="flex gap-3 rounded-lg bg-slate-900 p-3 text-xs">
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
  return (
    <div className="space-y-1">
      <p className="text-slate-300">{spec.prompt}:</p>
      {spec.kind === 'pokemon' && <p className={pickHint}>Click {spec.side === 'own' ? 'one of your' : "one of the CPU's"} highlighted Pokémon.</p>}
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

/** Pick between `min` and `max` of the offered cards, then confirm. A single card is chosen by clicking it. */
function CardPicker({ spec, view, onDone }: { spec: Extract<TrainerChoiceSpec, { kind: 'cards' }>; view: PlayerView; onDone: (uids: string[]) => void }) {
  const [picked, setPicked] = useState<string[]>([]);
  const single = spec.min === 1 && spec.max === 1;
  const toggle = (c: CardInstance) =>
    single ? onDone([c.uid]) : setPicked((p) => (p.includes(c.uid) ? p.filter((u) => u !== c.uid) : [...p, c.uid].slice(-spec.max)));
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
      {!single && (
        <button className={option} disabled={picked.length < spec.min || picked.length > spec.max} onClick={() => onDone(picked)}>
          Choose {picked.length}
          {spec.min === spec.max ? `/${spec.max}` : ` (${spec.min}–${spec.max})`}
        </button>
      )}
    </>
  );
}
