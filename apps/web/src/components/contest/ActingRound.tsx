import { ACTING_TURNS, canUseMove, contestMove, JUDGES, MAIN_JUDGE, PLAYER, type ActingTurn, type ContestState } from '@poke-tcg/campaign';
import { useState } from 'react';
import { CATEGORY_TEXT, ContestSprite, heartsText, MoveInfo } from './contestUi';

/** A judge's Voltage: 5 cells, lit to its level (each +10). */
function VoltageMeter({ voltage }: { voltage: number }) {
  return (
    <span className="flex gap-0.5">
      {[0, 1, 2, 3, 4].map((i) => (
        <span key={i} className={`h-2 w-3 rounded-sm ${voltage / 10 > i ? 'bg-yellow-400' : 'bg-slate-700'}`} />
      ))}
    </span>
  );
}

/** What last turn's performances did, in order: the move and judge, its appeal, the Voltage, and the bonuses at the end. */
function TurnRecap({ contest, turn, number }: { contest: ContestState; turn: ActingTurn; number: number }) {
  const name = (c: number) => contest.entrants[c]!.name;
  return (
    <section className="space-y-1 rounded-lg bg-slate-800 p-3 text-xs ring-1 ring-slate-700">
      <h3 className="text-sm font-semibold">Turn {number}</h3>
      <ul className="space-y-0.5">
        {turn.performances.map((p) => {
          const m = contestMove(p.move);
          return (
            <li key={p.contestant}>
              <b>{name(p.contestant)}</b> used <span className={CATEGORY_TEXT[m?.category ?? 0]}>{m?.name ?? p.move}</span> for {JUDGES[p.judge]}: <span className="text-pink-300">{heartsText(p.appeal)}</span>
              {p.voltageChange > 0 && <span className="text-yellow-300"> · Voltage up!</span>}
              {p.voltageChange < 0 && <span className="text-slate-400"> · Voltage down.</span>}
              {p.maxVoltage > 0 && <span className="font-semibold text-yellow-300"> · Max Voltage! +{p.maxVoltage / 10} ♥</span>}
            </li>
          );
        })}
      </ul>
      <p className="text-slate-400">
        {contest.entrants.map((e, c) => `${e.name} +${turn.judgeBonus[c]! / 10} for the judge${turn.endBonus[c] ? `, +${turn.endBonus[c]! / 10} at the end` : ''}: ${turn.scores[c]! / 10} ♥`).join(' · ')}
      </p>
    </section>
  );
}

/**
 * The Acting Competition (ov17_0223B140): 4 turns, in each one a move and one of the 3 judges (Dexter the main one).
 * A move of the contest's category raises its judge's Voltage, the two opposite lower it; a judge's fifth Voltage gives
 * a bonus (8 hearts Dexter's, 5 the others') and empties. A judge fewer chose gives more. The server plays the turn with
 * the CPUs' choices (`contest.act`).
 */
export function ActingRound({ contest, busy, onAct }: { contest: ContestState; busy: boolean; onAct: (move: string, judge: number) => void }) {
  const acting = contest.acting!;
  const me = contest.entrants[PLAYER]!;
  const [move, setMove] = useState<string | null>(null);
  const [judge, setJudge] = useState<number>(MAIN_JUDGE);
  const usable = (m: string) => canUseMove(acting, PLAYER, m);
  const chosen = move && usable(move) ? move : null;
  const last = acting.turns.at(-1);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-4">
        <h2 className="font-heading text-lg">Acting Competition</h2>
        <span className="text-sm text-slate-300">{acting.turn === ACTING_TURNS - 1 ? 'The last performance!' : `Turn ${acting.turn + 1} of ${ACTING_TURNS}`}</span>
      </div>
      {!last && contest.dance && (
        <p className="text-xs text-slate-400">Dance results: {contest.entrants.map((e, c) => `${e.name} ${contest.dance!.score[c]}`).join(' · ')}. The best of the Visual and Dance Competitions performs first.</p>
      )}
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="space-y-2 rounded-lg bg-slate-800 p-3 ring-1 ring-slate-700">
          <h3 className="text-sm font-semibold">Judges</h3>
          <div className="grid grid-cols-3 gap-2">
            {JUDGES.map((j, i) => (
              <button key={j} className={`flex flex-col items-center gap-1 rounded p-2 text-xs ring-1 transition ${judge === i ? 'bg-slate-700 ring-yellow-300' : 'bg-slate-900/40 ring-slate-700 hover:bg-slate-700'}`} onClick={() => setJudge(i)}>
                <span className="font-semibold">{j}</span>
                <span className="text-[10px] text-slate-400">{i === MAIN_JUDGE ? 'Main judge' : 'Judge'}</span>
                <VoltageMeter voltage={acting.voltage[i]!} />
              </button>
            ))}
          </div>
          <h3 className="text-sm font-semibold">Performing order</h3>
          <ol className="space-y-1">
            {acting.order.map((c, i) => (
              <li key={c} className={`flex items-center gap-2 rounded px-2 py-0.5 text-xs ${c === PLAYER ? 'bg-slate-700' : ''}`}>
                <span className="w-4 text-slate-400">{i + 1}.</span>
                <ContestSprite species={contest.entrants[c]!.species} size={32} />
                <span className="flex-1">
                  {contest.entrants[c]!.name} <span className="text-slate-500">({contest.entrants[c]!.trainer})</span>
                </span>
                <span className="tabular-nums text-pink-300">{acting.totals[c]! / 10} ♥</span>
              </li>
            ))}
          </ol>
        </section>
        <section className="space-y-2 rounded-lg bg-slate-800 p-3 ring-1 ring-slate-700">
          <h3 className="text-sm font-semibold">{me.name}’s moves</h3>
          <ul className="space-y-1">
            {me.moves.map((m) => (
              <li key={m}>
                <button
                  className={`flex w-full rounded px-2 py-1 text-xs ring-1 transition disabled:opacity-40 ${chosen === m ? 'bg-slate-700 ring-yellow-300' : 'bg-slate-900/40 ring-slate-700 hover:bg-slate-700'}`}
                  disabled={!usable(m)}
                  title={usable(m) ? undefined : "It can't use the same move twice in a row"}
                  onClick={() => setMove(m)}
                >
                  <MoveInfo move={m} />
                </button>
              </li>
            ))}
          </ul>
          <button className="w-full rounded bg-blue-600 px-4 py-2 text-sm font-semibold transition hover:bg-blue-500 active:scale-95 disabled:opacity-40" disabled={!chosen || busy} onClick={() => chosen && onAct(chosen, judge)}>
            {chosen ? `Perform ${contestMove(chosen)?.name} for ${JUDGES[judge]}` : 'Choose a move'}
          </button>
        </section>
      </div>
      {last && <TurnRecap contest={contest} turn={last} number={acting.turns.length} />}
    </div>
  );
}
