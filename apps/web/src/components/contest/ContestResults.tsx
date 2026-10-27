import { CONTEST_CATEGORIES, PLAYER, type ContestState } from '@poke-tcg/campaign';
import { animCell, Cell, DsScreen, Layer, MessageBox, MonSprite, useGfx, useTicks } from './ds';
import { rankName, RibbonIcon } from './contestUi';

const ROUNDS = ['Visual', 'Dance', 'Acting'];
/** The score bar's pieces (ov17_022513F4): anim base + length − 1 of each 16-px piece, base 1 the Visual's, 17 the Dance's, 33 the Acting's. */
const BAR_BASE = [1, 17, 33];
/** Each round's bar is 64 px at its best (ov17_02251914). */
const BAR = 64;
/** The six ornaments along the bottom of the stage (Unk_ov17_022531CC): place, cell and turn a frame (of 0x10000). */
const ORNAMENTS = [
  [13, 172, 1, -0x180],
  [37, 164, 1, 0x300],
  [64, 176, 0, -0x80],
  [192, 176, 0, 0x80],
  [219, 164, 1, -0x300],
  [243, 172, 1, 0x180],
] as const;

/**
 * The results (ov17_02250744) on Platinum's screens: the score board, each contestant's bar growing round by round
 * (each round against its best) to its placing badge; then the winner on the stage, and the rank's ribbon if it's the
 * player's (kept on its Pokédex entry). Back to the lobby leaves.
 */
export function ContestResults({ contest, ribbon, busy, onLeave }: { contest: ContestState; ribbon: string | null; busy: boolean; onLeave: () => void }) {
  const gfx = useGfx();
  const ticks = useTicks();
  const result = contest.result!;
  const order = [0, 1, 2, 3].sort((a, b) => result.placing[a]! - result.placing[b]!);
  const winner = order[0]!;
  const won = winner === PLAYER;
  const widths = (c: number) =>
    result.points.map((p) => {
      const best = Math.max(...p);
      return best ? Math.trunc((BAR * Math.trunc((100 * p[c]!) / best)) / 100) : 0;
    });
  const bar = gfx?.sheet('bar') ?? null;
  // The bars grow a pixel every 2 frames, a round at a time.
  const grown = Math.floor(ticks / 2);
  const shown = grown > BAR * 3 + 20;
  return (
    <div className="space-y-2">
      <h2 className="font-heading text-lg">
        {CONTEST_CATEGORIES[contest.category]} Contest, {rankName(contest.rank)}: results
      </h2>
      <div className="flex flex-col items-center gap-1">
        <DsScreen>
          <Layer src="results/board.png" />
          {order.map((c, n) => {
            const w = widths(c);
            let x = 48;
            return (
              <div key={c}>
                <MonSprite species={contest.entrants[c]!.species} x={28} y={20 + 32 * n} scale={0.4} />
                <div className={`pointer-events-none absolute text-[8px] font-bold ${c === PLAYER ? 'text-[#c02860]' : 'text-[#404058]'}`} style={{ left: 48, top: 9 + 32 * n }}>
                  {contest.entrants[c]!.name} <span className="font-normal text-[#606078]">({contest.entrants[c]!.trainer})</span>
                </div>
                {w.map((width, r) => {
                  const visible = Math.max(0, Math.min(width, grown - BAR * r));
                  const pieces = [];
                  for (let k = 0; k * 16 < visible; k++) {
                    const len = Math.min(16, visible - k * 16);
                    pieces.push(<Cell key={`${r}-${k}`} sheet={bar} cell={animCell(bar, BAR_BASE[r]! + len - 1, 0)} x={x + 16 * k} y={32 + 32 * n} />);
                  }
                  x += width;
                  return pieces;
                })}
                {shown && <Cell sheet={gfx?.sheet('placing') ?? null} cell={result.placing[c]!} x={232} y={13 + 32 * n} />}
              </div>
            );
          })}
          <div className="pointer-events-none absolute bottom-1 left-2 text-[7px] font-bold text-white [text-shadow:1px_1px_0_#303040]">
            {ROUNDS.map((r, i) => `${r} ${result.points[i]![PLAYER]}`).join(' · ')} (your points)
          </div>
        </DsScreen>
        <DsScreen>
          <Layer src="results/stage.png" />
          {shown && <MonSprite species={contest.entrants[winner]!.species} x={128} y={84 - Math.abs(Math.round(Math.sin(ticks / 10) * 4))} />}
          {ORNAMENTS.map(([x, y, cell, turn], i) => (
            <Cell key={i} sheet={gfx?.sheet('decorations') ?? null} cell={cell} x={x} y={y} style={{ transform: `rotate(${((turn * ticks) / 0x10000) * 360}deg)` }} />
          ))}
          <MessageBox x={8} y={8} w={240} h={34}>
            {shown ? (won ? `${contest.entrants[PLAYER]!.name} wins the ${CONTEST_CATEGORIES[contest.category]} Contest, ${rankName(contest.rank)}!` : `The winner is ${contest.entrants[winner]!.name}, ${contest.entrants[winner]!.trainer}’s Pokémon!`) : 'And the results are…'}
            {shown && (
              <>
                <br />
                {won ? (ribbon ? 'It receives the ribbon!' : 'It already has this ribbon.') : `${contest.entrants[PLAYER]!.name} placed ${['1st', '2nd', '3rd', '4th'][result.placing[PLAYER]!]}.`}
              </>
            )}
          </MessageBox>
          {shown && won && ribbon && (
            <div className="absolute left-[196px] top-[60px] scale-150">
              <RibbonIcon id={ribbon} size={32} />
            </div>
          )}
          <button className="absolute left-[78px] top-[132px] h-7 w-[100px] rounded-md bg-[#e8487a] text-[10px] font-bold text-white shadow ring-2 ring-white disabled:opacity-50" disabled={busy} onClick={onLeave}>
            Back to the lobby
          </button>
        </DsScreen>
      </div>
    </div>
  );
}
