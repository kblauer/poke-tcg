import { lookupCard, typeName, type PeekTarget, type PlayerView } from '@poke-tcg/game-engine';
import { Card } from './Card';
import type { PowerControl } from '../hooks/usePower';
import { pickHint } from './AttackChoicePanel';

// Styled like the Trainer dialog: buttons one shade lighter than the panel.
const option = 'rounded bg-slate-600 px-2 py-1 text-left text-xs transition hover:bg-slate-500 active:scale-95';

/**
 * The active Pokémon's Power button under its attacks, or the current question while any power
 * (the active's or a benched Pokémon's) is being used. Benched Pokémon use theirs by being clicked (Board).
 */
export function PowerPanel({ view, power, busy }: { view: PlayerView; power: PowerControl; busy: boolean }) {
  const { spec } = power;
  if (spec) {
    return (
      <div className="space-y-1 rounded-lg bg-slate-800 p-2 text-xs ring-1 ring-slate-600">
        <p className="text-slate-300">{spec.prompt}:</p>
        <div className="flex flex-col gap-1">
          {spec.kind === 'ownPokemon' && <p className={pickHint}>Click one of your highlighted Pokémon.</p>}
          {spec.kind === 'oppPokemon' && <p className={pickHint}>Click one of the CPU's highlighted Pokémon.</p>}
          {spec.kind === 'peek' &&
            spec.options.map((p) => (
              <button key={p} className={option} onClick={() => power.answer(p)}>
                {PEEK_LABELS[p]}
              </button>
            ))}
          {spec.kind === 'prize' && (
            <div className="flex flex-wrap gap-1">
              {spec.options.map((i) => (
                <button key={i} className={option} onClick={() => power.answer(i)}>
                  Prize {i + 1}
                </button>
              ))}
            </div>
          )}
          {(spec.kind === 'handCard' || spec.kind === 'attachedEnergy' || spec.kind === 'discardCard') &&
            spec.options.map((c) => (
              <button key={c.uid} className={option} onClick={() => power.answer(c.uid)}>
                {lookupCard(view.cards, c.defId).name}
              </button>
            ))}
          {spec.kind === 'counters' &&
            spec.options.map((n) => (
              <button key={n} className={option} onClick={() => power.answer(n)}>
                {n === 1 ? 'No, just 1' : spec.all ? `Yes, all ${n}` : `Yes, ${n}`}
              </button>
            ))}
          {spec.kind === 'side' && (
            <div className="flex flex-wrap gap-1">
              {spec.options.map((s) => (
                <button key={s} className={option} onClick={() => power.answer(s)}>
                  {s === 'own' ? 'Your Pokémon' : "The CPU's Pokémon"}
                </button>
              ))}
            </div>
          )}
          {spec.kind === 'type' && (
            <div className="flex flex-wrap gap-1">
              {spec.options.map((t) => (
                <button key={t} className={option} onClick={() => power.answer(t)}>
                  {typeName(t)}
                </button>
              ))}
            </div>
          )}
        </div>
        <button onClick={power.cancel} className="text-slate-400 hover:text-slate-200">
          Cancel (Esc)
        </button>
      </div>
    );
  }

  const active = power.powers.find((p) => p.source === 'active');
  if (!active) return null;
  return (
    <button disabled={active.error !== null || busy} title={[active.error, active.text].filter(Boolean).join('\n')} onClick={() => power.start('active')} className={powerButton}>
      {active.name}
    </button>
  );
}

const PEEK_LABELS: Record<PeekTarget, string> = {
  deck: 'Top card of your deck',
  oppDeck: "Top card of the CPU's deck",
  oppHand: "Random card from the CPU's hand",
  prize: 'One of your Prize cards',
  oppPrize: "One of the CPU's Prize cards",
};

/** The card the player looked at with Peek, shown until their next move. Only they see it. */
export function PeekCard({ view }: { view: PlayerView }) {
  const peek = view.self.peek;
  if (!peek) return null;
  return (
    <div className="space-y-1 rounded-lg bg-slate-800 p-2 text-xs ring-1 ring-slate-600">
      <p className="text-slate-300">Peek: {peek.label}</p>
      <Card def={lookupCard(view.cards, peek.card.defId)} small />
    </div>
  );
}

const powerButton =
  'rounded bg-violet-700 px-2 py-1 text-left text-xs transition hover:bg-violet-600 active:scale-95 disabled:opacity-40 disabled:hover:bg-violet-700';
