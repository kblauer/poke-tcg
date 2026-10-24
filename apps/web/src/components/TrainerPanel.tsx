import { lookupCard, type CardInstance, type PlayerView, type TrainerChoiceSpec } from '@poke-tcg/game-engine';
import { useState } from 'react';
import type { TrainerControl } from '../hooks/useTrainer';
import { OPTION_BUTTON } from '../utils/styles';
import { pickHint } from './AttackChoicePanel';

const option = `${OPTION_BUTTON} disabled:opacity-40`;

/** The Trainer card being played: its text and the current question (the last answer plays it), or a Play button if it has none. */
export function TrainerPanel({ view, trainer }: { view: PlayerView; trainer: TrainerControl }) {
  const { card, def, spec } = trainer;
  if (!card || !def || def.kind !== 'trainer') return null;
  const error = trainer.error(card);
  return (
    // No card image: the card being played is already raised and ringed in the hand.
    <section data-keep-action className="rounded-lg bg-slate-800 p-3 text-xs ring-1 ring-slate-600">
      <div className="space-y-2">
        <h3 className="text-base font-semibold">{def.name}</h3>
        <p className="text-slate-400">{def.text}</p>
        {error ? (
          <p className="text-amber-300">{error}.</p>
        ) : spec ? (
          <Question key={spec.prompt} spec={spec} view={view} trainer={trainer} />
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

function Question({ spec, view, trainer }: { spec: TrainerChoiceSpec; view: PlayerView; trainer: TrainerControl }) {
  const onAnswer = trainer.answer;
  const { handPick } = trainer;
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
      {spec.kind === 'pick' && (
        <div className="flex flex-wrap gap-1">
          {spec.options.map((n, i) => (
            <button key={n} className={option} onClick={() => onAnswer(n)}>
              {spec.labels[i]}
            </button>
          ))}
        </div>
      )}
      {handPick ? (
        // Cards from the hand are picked in the hand itself.
        <>
          <p className={pickHint}>Click {handPick.max === 1 ? 'a highlighted card' : 'the highlighted cards'} in your hand.</p>
          {!(handPick.min === 1 && handPick.max === 1) && (
            <button className={option} disabled={handPick.picked.size < handPick.min || handPick.picked.size > handPick.max} onClick={handPick.confirm}>
              Choose {handPick.picked.size}
              {handPick.min === handPick.max ? `/${handPick.max}` : ` (${handPick.min}–${handPick.max})`}
            </button>
          )}
        </>
      ) : (
        spec.kind === 'cards' && <CardPicker spec={spec} view={view} onDone={onAnswer} />
      )}
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
