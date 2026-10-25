import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** A choice with more to it than its words: a picture before them (the Idle Adventure's starters), or not to be picked now. */
export interface DialogueChoice {
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
}

/** What the dialogue box shows: a line (and who says it), and the choices to answer it with, if any. */
export interface Dialogue {
  text: string;
  speaker?: string;
  /** A question's choices; [] for a line left up with nothing to click (the Battle Tower's `hush`, the Idle Adventure's notices). */
  choices?: (string | DialogueChoice)[];
  /** Shown whole at once, not typed out (a line up for only a moment: the Idle Adventure's notices). */
  instant?: boolean;
  /** The choices side by side inside the box, under the line, each its picture over its words (the Idle Adventure's starters), not in a box of their own. */
  inline?: boolean;
  answer: (choice: number) => void;
}

const asChoice = (c: string | DialogueChoice): DialogueChoice => (typeof c === 'string' ? { label: c } : c);

/** A key for a dialogue (a new key, a new box: its line typed out again). */
export const dialogueKey = (d: Dialogue) => `${d.speaker ?? ''}|${d.text}|${d.choices?.map((c) => asChoice(c).label).join('|') ?? ''}`;

/** How long each letter of a line takes to type out (the games' text, at about their mid speed). */
const CHAR_MS = 25;
/** The gap between the dialogue box and its choices (gap-2). */
const CHOICES_GAP = 8;

/**
 * The games' text box over the bottom edge of the scene it's in (the Battle Tower's, the Game Corner's, the Idle
 * Adventure's; the user's: one box for all): the line (an opponent's with their name over it, their Easy Chat
 * words in Emerald's capitals, as the user wants), and for a question its choices in a box of their own on the right.
 * Game art, so its colours are fixed rather than the themes' (they'd turn its white box dark). The line types out a letter
 * at a time, as in the games (the user's); a click on the box (or Enter) shows it whole, and once it's whole goes on;
 * a question's choices come up when its line is done. A click anywhere on the scene does as a click on the box: the
 * scene calls `pressRef` (its onClick). Choices can be `inline` instead: side by side inside the box, under the line. Enter and Space are left to the page's own fields, and to its buttons when
 * they're reached with the keyboard (the Idle Adventure's store and tabs under the scene).
 */
export function DialogueBox({
  dialogue,
  reserved,
  paused = false,
  pressRef: sceneRef,
  phone,
  maxWidth,
}: {
  dialogue: Dialogue;
  /** A phone: the box the scene's width, its choices above it on the right (the user's), smaller text. */
  phone: boolean;
  /** Choices to keep room for beside the box (the conversation's question's), shown or not. */
  reserved?: string[] | null;
  /** Debug's pause (the Battle Tower's): the typing held. */
  paused?: boolean;
  pressRef: { current: (() => void) | null };
  /** The box's widest (with its choices' column), in CSS pixels, centred on the scene (the Idle Adventure's); none: the scene's width less a margin. */
  maxWidth?: number;
}) {
  const frame = { background: '#f8f8f8', color: '#303038', boxShadow: 'inset 0 0 0 3px #6878a8, inset 0 0 0 5px #c8d0e8' };
  const choices = dialogue.choices?.map(asChoice);
  // Typed out a letter at a time (CHAR_MS), as in the games; held while debug's pause is on.
  const [typed, setTyped] = useState(dialogue.instant ? dialogue.text.length : 0);
  const done = typed >= dialogue.text.length;
  useEffect(() => {
    if (done || paused) return;
    const timer = window.setTimeout(() => setTyped((n) => n + 1), CHAR_MS);
    return () => window.clearTimeout(timer);
  }, [typed, done, paused]);
  /** A click or Enter: the whole line at once while it's typing; then on from a line (a question waits for its choice). */
  const press = () => {
    if (!done) setTyped(dialogue.text.length);
    else if (!choices) dialogue.answer(0);
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
  const inline = !!dialogue.inline && !!choices?.length;
  const choicesUp = done && !!choices?.length && !inline;
  const shift = choicesUp || !columnWidth ? 0 : (columnWidth + CHOICES_GAP) / 2;
  const root = useRef<HTMLDivElement>(null);
  const pressRef = useRef(press);
  pressRef.current = press;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const target = e.target as HTMLElement | null;
      // A choice's own button takes Enter once the choices are up.
      if (done && dialogue.choices?.length && target?.closest('[role="menu"]')) return;
      // The page's own fields, and its buttons reached with the keyboard, keep their keys.
      const control = target?.closest<HTMLElement>('input, textarea, select, button, a[href], [contenteditable="true"]');
      if (control && !root.current?.contains(control) && (!control.matches('button, a[href]') || control.matches(':focus-visible'))) return;
      e.preventDefault();
      pressRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [done, dialogue.choices]);
  /** A choice's words, after its picture if it has one. */
  const label = (c: DialogueChoice) => (c.icon ? <span className="flex items-center gap-1.5">{c.icon}{c.label}</span> : c.label);
  const firstOpen = choices?.findIndex((c) => !c.disabled) ?? -1;
  // With inline choices the box holds buttons of its own, so it's a group rather than a button.
  const Box = inline ? 'div' : 'button';
  const boxProps = inline ? { role: 'group' } : { type: 'button' as const };
  const line = (
    <>
      {dialogue.speaker && <span className="block text-sm" style={{ color: '#5868a0' }}>{dialogue.speaker}</span>}
      {/* The rest of the line holds its place unseen, so the box doesn't grow as it types. */}
      <span className="whitespace-pre-line">
        {dialogue.text.slice(0, typed)}
        <span className="invisible">{dialogue.text.slice(typed)}</span>
      </span>
      {done && !choices && <span className="ml-2 inline-block animate-bounce" style={{ color: '#e04040' }}>▼</span>}
      {/* Inline choices: held unseen under the line while it types (so the box doesn't grow), then shown; remounted once
          it's done so the first one takes focus; each choice as tall as the tallest, its picture at the bottom, on its words. */}
      {inline && (
        <span key={String(done)} className={`mt-2 flex flex-wrap justify-center gap-2 ${done ? '' : 'invisible'}`} role={done ? 'menu' : undefined} aria-hidden={!done || undefined}>
          {choices!.map((c, i) => (
            <button
              key={c.label}
              type="button"
              role="menuitem"
              tabIndex={done ? 0 : -1}
              autoFocus={done && i === firstOpen}
              disabled={c.disabled}
              className="flex min-w-24 flex-col items-center justify-end rounded hover:bg-[#dde3f5] focus:bg-[#dde3f5] focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent"
              onClick={(e) => (e.stopPropagation(), dialogue.answer(i))}
            >
              {c.icon}
              {c.label}
            </button>
          ))}
        </span>
      )}
    </>
  );
  const onBox = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    press();
  };
  const menu = (size: string) =>
    choices!.map((c, i) => (
      <li key={c.label}>
        <button
          type="button"
          role="menuitem"
          autoFocus={i === firstOpen}
          disabled={c.disabled}
          className={`block w-full rounded px-3 text-left hover:bg-[#dde3f5] focus:bg-[#dde3f5] focus:outline-none disabled:opacity-40 disabled:hover:bg-transparent ${size}`}
          onClick={(e) => (e.stopPropagation(), dialogue.answer(i))}
        >
          {label(c)}
        </button>
      </li>
    ));
  if (phone) {
    // Stacked, as the games show a question's choices over the text box: nothing beside the box to make room for.
    return (
      <div ref={root} className="absolute inset-x-2 bottom-2 flex flex-col items-end gap-1.5">
        {choicesUp && (
          <ul className="whitespace-nowrap rounded-[14px] p-1.5" style={frame} role="menu">
            {menu('py-1 text-sm')}
          </ul>
        )}
        <Box {...boxProps} data-keep-action className="min-h-14 w-full cursor-pointer rounded-[14px] px-4 py-2 text-left text-sm leading-snug" style={frame} onClick={onBox} aria-label={done && !choices ? 'Next' : undefined}>
          {line}
        </Box>
      </div>
    );
  }
  return (
    <div ref={root} className="absolute inset-x-[4%] bottom-6 mx-auto flex items-end gap-2" style={{ maxWidth }}>
      <Box
        {...boxProps}
        data-keep-action
        className={`min-h-20 flex-1 cursor-pointer rounded-[18px] px-6 py-3 text-left text-base leading-relaxed ${choicesUp ? 'transition-transform duration-200' : ''}`}
        style={{ ...frame, transform: shift ? `translateX(${shift}px)` : undefined }}
        onClick={onBox}
        aria-label={done && !choices ? 'Next' : undefined}
      >
        {line}
      </Box>
      {/* The choices' column: as wide as its widest choice, the question's own or those kept room for, from the line's first
          letter (an unseen copy, no height, holds it), so the box never narrows as they come up; the choices once it's typed. */}
      {((!!choices?.length && !inline) || !!reserved?.length) && (
        <div ref={column} className="grid shrink-0 items-end [&>*]:col-start-1 [&>*]:row-start-1">
          <ul className="invisible h-0 overflow-hidden whitespace-nowrap px-2" aria-hidden>
            {[...(inline ? [] : (choices ?? [])), ...(reserved ?? []).map(asChoice)].map((c, i) => (
              <li key={i} className="px-3 text-base">
                {label(c)}
              </li>
            ))}
          </ul>
          {choicesUp && (
            <ul className="whitespace-nowrap rounded-[18px] p-2" style={frame} role="menu">
              {menu('py-1.5 text-base')}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
