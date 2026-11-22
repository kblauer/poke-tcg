import { TRAINERS, abilityName, abilityText } from '@poke-tcg/safari/effects';
import { useCallback, useState, type ReactNode } from 'react';
import { useEscape } from '../../hooks/useEscape';
import { DIALOG, DIALOG_BACKDROP } from '../../utils/styles';
import { KEYWORD_MARKS, UnitInspectContext, type Inspected } from './keywordMarks';
import { TrainerCard, UnitCard } from './UnitCard';

const TYPE_NAME = (type: string) => type[0]!.toUpperCase() + type.slice(1);
const STAGE: Record<string, string> = { basic: 'Basic', stage1: 'Stage 1', stage2: 'Stage 2' };

/**
 * Safari Draft's own large view of a card (the user's, 2026-11-22): a right-click on any card of the mode opens the card
 * as the game has it, large, with each keyword's full words and what its mark on the card means, instead of the TCG
 * print's inspector. Closed by a click anywhere, or Escape.
 */
export function UnitInspectProvider({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState<Inspected | null>(null);
  const close = useCallback(() => setShown(null), []);
  useEscape(close, !!shown);
  return (
    <UnitInspectContext.Provider value={setShown}>
      {children}
      {shown && (
        <div className={`${DIALOG_BACKDROP} z-50`} onClick={close} onContextMenu={(e) => (e.preventDefault(), close())}>
          <div className="flex max-h-full flex-wrap items-center justify-center gap-5 overflow-y-auto p-2">
            {/* The card itself has no right-click of its own here. */}
            <UnitInspectContext.Provider value={null}>
              {shown.kind === 'unit' ? (
                <UnitCard id={shown.unit.id} unit={shown.unit} stats={{ attack: shown.attack, hp: shown.hp, abilities: shown.abilities }} golden={shown.golden} width="min(22rem, 80vw)" />
              ) : (
                <TrainerCard trainer={shown.trainer} width="min(20rem, 80vw)" />
              )}
            </UnitInspectContext.Provider>
            <div className={`${DIALOG} flex w-[min(22rem,90vw)] flex-col gap-3 p-4 text-sm text-slate-200`}>
              {shown.kind === 'unit' ? (
                <>
                  <div>
                    <h2 className="font-heading text-base text-slate-50">
                      {shown.unit.name}
                      {shown.golden && <span className="ml-2 text-xs text-amber-300">Golden</span>}
                    </h2>
                    <p className="text-xs text-slate-400">
                      {TYPE_NAME(shown.unit.type)} · {STAGE[shown.unit.stage] ?? ''} · Tier {shown.unit.tier}
                      {shown.unit.evolvesFrom && ` · evolves from ${shown.unit.evolvesFrom}`}
                    </p>
                    <p className="mt-1">
                      Attack <b className="text-slate-50">{shown.attack}</b> · HP <b className="text-slate-50">{shown.hp}</b>
                    </p>
                  </div>
                  {shown.abilities.length === 0 && <p className="text-slate-400">No keyword: it attacks, and strikes back when attacked.</p>}
                  {shown.abilities.map((a) => {
                    const mark = KEYWORD_MARKS[a.k];
                    return (
                      <div key={a.k} className="flex gap-2">
                        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900 ring-1 ring-white/30 ${mark ? mark.tone : 'text-gray-500'}`}>{mark ? <mark.Icon sx={{ fontSize: 18 }} /> : '•'}</span>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-50">{abilityName(a)}</p>
                          <p>{abilityText(a)}.</p>
                          {mark?.level === 'frame' && <p className="text-xs text-slate-400">{mark.means}.</p>}
                        </div>
                      </div>
                    );
                  })}
                </>
              ) : (
                <>
                  <h2 className="font-heading text-base text-slate-50">{shown.trainer}</h2>
                  <p>{TRAINERS[shown.trainer]}.</p>
                  <p className="text-xs text-slate-400">A Trainer card: one is played each battle.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </UnitInspectContext.Provider>
  );
}
