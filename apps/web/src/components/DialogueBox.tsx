import { useEffect, useLayoutEffect, useRef, useState } from 'react';

/** What the dialogue box shows: a line (and who says it), and the choices to answer it with, if any. */
export interface Dialogue {
  text: string;
  speaker?: string;
  choices?: string[];
  answer: (choice: number) => void;
}

/** How long each letter of a line takes to type out (the games' text, at about their mid speed). */
const CHAR_MS = 25;
/** The gap between the dialogue box and its choices (gap-2). */
const CHOICES_GAP = 8;

/**
 * The games' text box over the bottom edge of the scene it's in (the Battle Tower's, the Game Corner's; the user's: one
 * box for both): the line (an opponent's with their name over it, their Easy Chat
 * words in Emerald's capitals, as the user wants), and for a question its choices in a box of their own on the right.
 * Game art, so its colours are fixed rather than the themes' (they'd turn its white box dark). The line types out a letter
 * at a time, as in the games (the user's); a click on the box (or Enter) shows it whole, and once it's whole goes on;
 * a question's choices come up when its line is done. A click anywhere on the scene does as a click on the box: the
 * scene calls `pressRef` (its onClick).
 */
export function DialogueBox({
  dialogue,
  reserved,
  paused = false,
  pressRef: sceneRef,
  phone,
}: {
  dialogue: Dialogue;
  /** A phone: the box the scene's width, its choices above it on the right (the user's), smaller text. */
  phone: boolean;
  /** Choices to keep room for beside the box (the conversation's question's), shown or not. */
  reserved?: string[] | null;
  /** Debug's pause (the Battle Tower's): the typing held. */
  paused?: boolean;
  pressRef: { current: (() => void) | null };
}) {
  const frame = { background: '#f8f8f8', color: '#303038', boxShadow: 'inset 0 0 0 3px #6878a8, inset 0 0 0 5px #c8d0e8' };
  // Typed out a letter at a time (CHAR_MS), as in the games; held while debug's pause is on.
  const [typed, setTyped] = useState(0);
  const done = typed >= dialogue.text.length;
  useEffect(() => {
    if (done || paused) return;
    const timer = window.setTimeout(() => setTyped((n) => n + 1), CHAR_MS);
    return () => window.clearTimeout(timer);
  }, [typed, done, paused]);
  /** A click or Enter: the whole line at once while it's typing; then on from a line (a question waits for its choice). */
  const press = () => {
    if (!done) setTyped(dialogue.text.length);
    else if (!dialogue.choices) dialogue.answer(0);
  };
  // A click anywhere on the scene does the same.
  sceneRef.current = press;
  useEffect(() => () => void (sceneRef.current = null), [sceneRef]);
  // Before its choices come up, the box sits centred over the scene (the user's): shifted right by half the room kept for
  // them (the column, measured, and the gap), at the same width; it slides back as they come up (only then: each line's
  // box is new, and would otherwise slide in from the left).
  const column = useRef<HTMLDivElement>(null);
  const [columnWidth, setColumnWidth] = useState(0);
  useLayoutEffect(() => {
    const el = column.current;
    if (!el) return setColumnWidth(0);
    const observer = new ResizeObserver(() => setColumnWidth(el.offsetWidth));
    observer.observe(el);
    setColumnWidth(el.offsetWidth);
    return () => observer.disconnect();
  }, [reserved, dialogue.choices]);
  const choicesUp = done && !!dialogue.choices?.length;
  const shift = choicesUp || !columnWidth ? 0 : (columnWidth + CHOICES_GAP) / 2;
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      // A choice's own button takes Enter once the choices are up.
      if (done && dialogue.choices?.length && (e.target as HTMLElement | null)?.closest('[role="menu"]')) return;
      e.preventDefault();
      pressRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, dialogue.choices]);
  const line = (
    <>
      {dialogue.speaker && <span className="block text-sm" style={{ color: '#5868a0' }}>{dialogue.speaker}</span>}
      {/* The rest of the line holds its place unseen, so the box doesn't grow as it types. */}
      <span className="whitespace-pre-line">
        {dialogue.text.slice(0, typed)}
        <span className="invisible">{dialogue.text.slice(typed)}</span>
      </span>
      {done && !dialogue.choices && <span className="ml-2 inline-block animate-bounce" style={{ color: '#e04040' }}>▼</span>}
    </>
  );
  const onBox = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    press();
  };
  if (phone) {
    // Stacked, as the games show a question's choices over the text box: nothing beside the box to make room for.
    return (
      <div className="absolute inset-x-2 bottom-2 flex flex-col items-end gap-1.5">
        {choicesUp && (
          <ul className="whitespace-nowrap rounded-[14px] p-1.5" style={frame} role="menu">
            {dialogue.choices!.map((c, i) => (
              <li key={c}>
                <button type="button" role="menuitem" autoFocus={i === 0} className="block w-full rounded px-3 py-1 text-left text-sm hover:bg-[#dde3f5] focus:bg-[#dde3f5] focus:outline-none" onClick={() => dialogue.answer(i)}>
                  {c}
                </button>
              </li>
            ))}
          </ul>
        )}
        <button type="button" data-keep-action className="min-h-14 w-full cursor-pointer rounded-[14px] px-4 py-2 text-left text-sm leading-snug" style={frame} onClick={onBox} aria-label={done && !dialogue.choices ? 'Next' : undefined}>
          {line}
        </button>
      </div>
    );
  }
  return (
    <div className="absolute inset-x-[4%] bottom-6 flex items-end gap-2">
      <button
        type="button"
        data-keep-action
        className={`min-h-20 flex-1 cursor-pointer rounded-[18px] px-6 py-3 text-left text-base leading-relaxed ${choicesUp ? 'transition-transform duration-200' : ''}`}
        style={{ ...frame, transform: shift ? `translateX(${shift}px)` : undefined }}
        onClick={onBox}
        aria-label={done && !dialogue.choices ? 'Next' : undefined}
      >
        {line}
      </button>
      {/* The choices' column: as wide as its widest choice, the question's own or those kept room for, from the line's first
          letter (an unseen copy, no height, holds it), so the box never narrows as they come up; the choices once it's typed. */}
      {(!!dialogue.choices?.length || !!reserved?.length) && (
        <div ref={column} className="grid shrink-0 items-end [&>*]:col-start-1 [&>*]:row-start-1">
          <ul className="invisible h-0 overflow-hidden whitespace-nowrap px-2" aria-hidden>
            {[...(dialogue.choices ?? []), ...(reserved ?? [])].map((c, i) => (
              <li key={i} className="px-3 text-base">
                {c}
              </li>
            ))}
          </ul>
          {done && !!dialogue.choices?.length && (
            <ul className="whitespace-nowrap rounded-[18px] p-2" style={frame} role="menu">
              {dialogue.choices.map((c, i) => (
                <li key={c}>
                  <button type="button" role="menuitem" autoFocus={i === 0} className="block w-full rounded px-3 py-1.5 text-left text-base hover:bg-[#dde3f5] focus:bg-[#dde3f5] focus:outline-none" onClick={() => dialogue.answer(i)}>
                    {c}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
