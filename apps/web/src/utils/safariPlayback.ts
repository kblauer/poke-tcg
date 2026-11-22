// Safari Draft's battle playback (README: Safari Draft; issue #239, section 8): a battle's event log (the safari package's
// BattleEvent, played on the server and sent with the run's view) turned into the frames the screen shows, one a beat.
// Pure, so it's tested without the screen: the boards' lines as they stand after each event, what the event did (who
// attacked whom, a number to pop, a banner), and the battle's result at the end.
import type { Ability, BattleEvent, Board, SideId } from '@poke-tcg/safari';

/** A Pokémon in a line as the playback shows it. `unit` is its unit's id (a Family copy takes its namesake's picture). */
export interface ShownFighter {
  uid: string;
  side: SideId;
  unit: string | undefined;
  name: string;
  /** Its keywords as the battle has them (Transform's and Sketch's taken ones too); a Family copy has none. */
  abilities: Ability[];
  /** A Shield up: the next hit on it does nothing. */
  shield: boolean;
  /** Keywords used up (Sturdy, once it has saved its Pokémon). */
  spent: string[];
  attack: number;
  hp: number;
  maxHp: number;
  status: string[];
  fainted: boolean;
}

/** What the screen marks in a frame: an attack's two Pokémon, a number popping on one, a line of text. */
export type Mark =
  | { kind: 'attack'; uid: string; target: string }
  | { kind: 'damage'; uid: string; amount: number; why: string }
  | { kind: 'heal'; uid: string; amount: number; why: string }
  | { kind: 'miss'; uid: string; why: string }
  | { kind: 'faint'; uid: string }
  /** A change to a Pokémon's attack or HP for the battle (Rally, Intimidate, a synergy, a Trainer card). */
  | { kind: 'stat'; uid: string; attack?: number; hp?: number; why: string }
  /** A line of text. `keep`: the board changed with it (a Pokémon joined, moved, left or became another), so it's shown; the others only go to the log. */
  | { kind: 'note'; text: string; keep?: true };

export interface Frame {
  lines: [ShownFighter[], ShownFighter[]];
  mark: Mark | null;
  round: number;
  /** Set on the last frame. */
  winner?: SideId | 'draw';
}

const STATUS_WORD: Record<string, string> = { paralyzed: 'Paralyzed', confused: 'Confused', burned: 'Burned' };
const SYNERGY_NAMES: Record<string, string> = { grass: 'Leech', fire: 'Blaze', water: 'Current', lightning: 'Quick', psychic: 'Pressure', fighting: 'Duel', colorless: 'Versatile', darkness: 'Prey', metal: 'Plating' };
const sideName = (side: SideId) => (side === 0 ? 'Your' : "The opponent's");

/** The lines a battle starts with: each board's units left to right, uids as the battle gives them (a0…, b0…). */
export function startLines(mine: Board, opponent: Board): [ShownFighter[], ShownFighter[]] {
  const line = (board: Board, side: SideId) =>
    board.units.map((u, i): ShownFighter => ({ uid: `${'ab'[side]}${i}`, side, unit: u.id, name: u.name, abilities: u.abilities, shield: u.abilities.some((a) => a.k === 'Shield'), spent: [], attack: u.attack, hp: u.hp, maxHp: u.hp, status: [], fainted: false }));
  return [line(mine, 0), line(opponent, 1)];
}

/**
 * Every frame of a battle: the start, then one after each event that shows something. A fainted Pokémon stays in its
 * frame, faded, then leaves its line on the next one, so the screen can show it go.
 */
export function playbackFrames(mine: Board, opponent: Board, events: readonly BattleEvent[]): Frame[] {
  let lines = startLines(mine, opponent);
  let round = 1;
  const frames: Frame[] = [{ lines, mark: null, round }];
  const find = (uid: string) => lines[0].find((f) => f.uid === uid) ?? lines[1].find((f) => f.uid === uid);
  // Remembered across leaving and coming back (Revive, Scoop Up): a Pokémon keeps its card and its attack.
  const known = new Map<string, ShownFighter>(lines.flat().map((f) => [f.uid, f]));
  const change = (uid: string, fn: (f: ShownFighter) => ShownFighter) => {
    lines = [lines[0].map((f) => (f.uid === uid ? fn(f) : f)), lines[1].map((f) => (f.uid === uid ? fn(f) : f))];
    const f = find(uid);
    if (f) known.set(uid, f);
  };
  // Fainted Pokémon leave their lines before the next event is shown.
  const sweep = () => {
    if (lines.some((l) => l.some((f) => f.fainted))) lines = [lines[0].filter((f) => !f.fainted), lines[1].filter((f) => !f.fainted)];
  };
  const push = (mark: Mark | null, winner?: SideId | 'draw') => frames.push({ lines, mark, round, ...(winner !== undefined && { winner }) });
  for (const ev of events) {
    sweep();
    switch (ev.e) {
      case 'first':
        push({ kind: 'note', text: ev.side === 0 ? 'You attack first.' : 'The opponent attacks first.' });
        break;
      case 'synergy':
        push({ kind: 'note', text: `${sideName(ev.side)} ${ev.type[0]!.toUpperCase()}${ev.type.slice(1)} synergy: ${SYNERGY_NAMES[ev.type] ?? ev.type} ${'I'.repeat(ev.level)}` });
        break;
      case 'trainer':
        push({ kind: 'note', text: `${sideName(ev.side)} ${ev.trainer}` });
        break;
      case 'round':
        round = ev.round;
        push({ kind: 'note', text: ev.rising ? `Round ${ev.round}: every hit does ${ev.rising} more` : `Round ${ev.round}` });
        break;
      case 'join': {
        const before = known.get(ev.uid);
        const f: ShownFighter = { uid: ev.uid, side: ev.side, unit: before?.unit ?? lines.flat().concat([...known.values()]).find((g) => g.name === ev.name)?.unit, name: ev.name, abilities: before?.abilities ?? [], shield: false, spent: before?.spent ?? [], attack: ev.attack, hp: ev.hp, maxHp: Math.max(before?.maxHp ?? 0, ev.hp), status: [], fainted: false };
        const line = [...lines[ev.side].filter((g) => g.uid !== ev.uid)];
        line.splice(Math.min(ev.at, line.length), 0, f);
        lines = ev.side === 0 ? [line, lines[1]] : [lines[0], line];
        known.set(ev.uid, f);
        push({ kind: 'note', text: `${ev.name} ${before ? 'came back' : 'joined'} (${ev.why})`, keep: true });
        break;
      }
      case 'buff':
        change(ev.uid, (f) => ({ ...f, attack: Math.max(0, f.attack + ev.attack) }));
        push({ kind: 'stat', uid: ev.uid, attack: ev.attack, why: ev.why });
        break;
      case 'grow':
        change(ev.uid, (f) => ({ ...f, hp: f.hp + ev.hp, maxHp: f.maxHp + ev.hp }));
        push({ kind: 'stat', uid: ev.uid, hp: ev.hp, why: ev.why });
        break;
      case 'become':
        change(ev.uid, (f) => ({ ...f, attack: ev.attack, hp: ev.hp, maxHp: ev.hp, abilities: ev.abilities, shield: f.shield || ev.abilities.some((a) => a.k === 'Shield') }));
        push({ kind: 'note', text: ev.why === 'Transform' ? `${find(ev.uid)?.name} transformed` : `${find(ev.uid)?.name} took keywords (${ev.why})`, keep: true });
        break;
      case 'shield':
        change(ev.uid, (f) => ({ ...f, shield: ev.on }));
        if (ev.on) push({ kind: 'note', text: `${find(ev.uid)?.name} has a Shield` });
        break;
      case 'attack':
        push({ kind: 'attack', uid: ev.uid, target: ev.target });
        break;
      case 'miss':
        push({ kind: 'miss', uid: ev.uid, why: ev.why });
        break;
      case 'blocked':
        push({ kind: 'miss', uid: ev.uid, why: ev.why });
        break;
      case 'damage':
        change(ev.uid, (f) => ({ ...f, hp: ev.hp }));
        push({ kind: 'damage', uid: ev.uid, amount: ev.amount, why: ev.why });
        break;
      case 'heal':
        change(ev.uid, (f) => ({ ...f, hp: ev.hp, spent: ev.why === 'Sturdy' ? [...f.spent, 'Sturdy'] : f.spent }));
        push({ kind: 'heal', uid: ev.uid, amount: ev.amount, why: ev.why });
        break;
      case 'status':
        change(ev.uid, (f) => {
          const word = STATUS_WORD[ev.status]!;
          if (ev.off) return { ...f, status: f.status.filter((s) => s !== word) };
          // Confused and Paralyzed replace each other; Burned sits beside them.
          const kept = word === 'Burned' ? f.status : f.status.filter((s) => s === 'Burned');
          return { ...f, status: kept.includes(word) ? kept : [...kept, word] };
        });
        // The end of one is shown by its tag going: no line of its own.
        if (!ev.off) push({ kind: 'note', text: `${find(ev.uid)?.name} is ${STATUS_WORD[ev.status]}` });
        break;
      case 'move': {
        const f = find(ev.uid);
        if (f) {
          const line = [...lines[f.side].filter((g) => g.uid !== ev.uid), f];
          lines = f.side === 0 ? [line, lines[1]] : [lines[0], line];
        }
        push({ kind: 'note', text: `${f?.name} moved to the end of the line (${ev.why})`, keep: true });
        break;
      }
      case 'faint':
        change(ev.uid, (f) => ({ ...f, hp: 0, fainted: true }));
        push({ kind: 'faint', uid: ev.uid });
        break;
      case 'leave': {
        const f = find(ev.uid);
        change(ev.uid, (g) => ({ ...g, fainted: true }));
        push({ kind: 'note', text: `${f?.name} left the battle (${ev.why})`, keep: true });
        break;
      }
      case 'pay':
        push({ kind: 'note', text: `${find(ev.uid)?.name}'s Pay Day!` });
        break;
      case 'end':
        sweep();
        push({ kind: 'note', text: ev.winner === 'draw' ? 'A draw!' : ev.winner === 0 ? 'You won!' : 'You lost…' }, ev.winner);
        break;
    }
  }
  return frames;
}
