import { CONTEST_CATEGORIES, PLAYER, type ContestState } from '@poke-tcg/campaign';
import { ContestSprite, rankName, RibbonIcon } from './contestUi';

const PLACES = ['1st', '2nd', '3rd', '4th'];
const ROUNDS = ['Visual', 'Dance', 'Acting'];

/**
 * The results (ov17_02250744): each round's points (each against the round's best, 33 for it), the bars they make and
 * the placing; the winner gets the rank's ribbon, kept on its Pokédex entry. Leave goes back to the lobby.
 */
export function ContestResults({ contest, ribbon, busy, onLeave }: { contest: ContestState; ribbon: string | null; busy: boolean; onLeave: () => void }) {
  const result = contest.result!;
  const order = [0, 1, 2, 3].sort((a, b) => result.placing[a]! - result.placing[b]!);
  const won = result.placing[PLAYER] === 0;
  return (
    <div className="space-y-3">
      <h2 className="font-heading text-lg">
        {CONTEST_CATEGORIES[contest.category]} Contest, {rankName(contest.rank)}: results
      </h2>
      <table className="w-full max-w-3xl text-sm">
        <thead>
          <tr className="text-xs text-slate-400">
            <th className="text-left font-normal">Place</th>
            <th className="text-left font-normal">Pokémon</th>
            {ROUNDS.map((r) => (
              <th key={r} className="font-normal">
                {r}
              </th>
            ))}
            <th className="text-left font-normal">Total</th>
          </tr>
        </thead>
        <tbody>
          {order.map((c) => (
            <tr key={c} className={c === PLAYER ? 'bg-slate-700/60' : ''}>
              <td className={`px-1 font-semibold ${result.placing[c] === 0 ? 'text-yellow-300' : ''}`}>{PLACES[result.placing[c]!]}</td>
              <td className="py-1">
                <span className="flex items-center gap-2">
                  <ContestSprite species={contest.entrants[c]!.species} size={40} />
                  <span>
                    {contest.entrants[c]!.name} <span className="text-xs text-slate-400">({contest.entrants[c]!.trainer})</span>
                  </span>
                </span>
              </td>
              {result.points.map((p, r) => (
                <td key={r} className="text-center tabular-nums">
                  {p[c]}
                </td>
              ))}
              <td className="w-48 px-1">
                <span className="block h-3 rounded bg-slate-700">
                  <span className="block h-full rounded bg-yellow-400" style={{ width: `${(100 * result.total[c]!) / 192}%` }} />
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {won ? (
        <p className="flex items-center gap-2 text-sm">
          {ribbon && <RibbonIcon id={ribbon} size={48} />}
          {ribbon ? `${contest.entrants[PLAYER]!.name} won the ${CONTEST_CATEGORIES[contest.category]} ${rankName(contest.rank)} ribbon!` : `${contest.entrants[PLAYER]!.name} won again!`}
        </p>
      ) : (
        <p className="text-sm text-slate-300">Better luck next time! Feeding Poffins and Pokéblocks raises its condition for the Visual Competition.</p>
      )}
      <button className="rounded bg-slate-600 px-4 py-2 text-sm hover:bg-slate-500 disabled:opacity-40" disabled={busy} onClick={onLeave}>
        Back to the lobby
      </button>
    </div>
  );
}
