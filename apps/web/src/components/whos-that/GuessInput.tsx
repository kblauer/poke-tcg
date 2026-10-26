import { answerKey } from '@poke-tcg/campaign';
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { answerKeys } from '../../utils/whosThat';
import { CatalogContext } from '../InspectContext';

/**
 * Where the player types the Pokémon's name. A name that's one of the game's answers (answerKeys) is checked as soon as
 * it's typed, so naming it moves on at once; Enter checks whatever is typed. `onGuess` resolves true when it was right;
 * a wrong name sent with Enter flashes the box red (one checked on its own as it's typed doesn't: "Mew" on the way to
 * "Mewtwo"). `round` changes for each Pokémon, clearing the box.
 */
export function GuessInput({ round, onGuess, disabled }: { round: string | number; onGuess: (guess: string) => Promise<boolean>; disabled?: boolean }) {
  const catalog = useContext(CatalogContext);
  const keys = useMemo(() => answerKeys(catalog), [catalog]);
  const [text, setText] = useState('');
  const [wrong, setWrong] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  // The names already checked for this Pokémon, so one isn't sent twice.
  const tried = useRef(new Set<string>());

  useEffect(() => {
    setText('');
    setWrong(false);
    tried.current = new Set();
    input.current?.focus();
  }, [round]);

  useEffect(() => {
    if (!wrong) return;
    const timer = window.setTimeout(() => setWrong(false), 500);
    return () => window.clearTimeout(timer);
  }, [wrong]);

  const check = async (guess: string, typed: boolean) => {
    const key = answerKey(guess);
    if (!key || (typed && tried.current.has(key))) return;
    tried.current.add(key);
    const right = await onGuess(guess).catch(() => false);
    if (!right && !typed) {
      setWrong(true);
      input.current?.select();
    }
  };

  return (
    <input
      ref={input}
      value={text}
      disabled={disabled}
      autoFocus
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="off"
      spellCheck={false}
      maxLength={30}
      placeholder="Who's that Pokémon?"
      aria-label="The Pokémon's name"
      onChange={(e) => {
        setText(e.target.value);
        if (keys.has(answerKey(e.target.value))) void check(e.target.value, true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') void check(text, false);
      }}
      className={`w-full rounded bg-slate-900 px-4 py-3 text-lg ring-1 transition outline-none focus:ring-2 disabled:opacity-50 ${wrong ? 'animate-[shake_0.3s] ring-red-500' : 'ring-slate-600 focus:ring-yellow-300'}`}
    />
  );
}
