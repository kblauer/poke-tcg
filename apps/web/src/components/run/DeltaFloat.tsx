import { useEffect, useRef, useState } from 'react';

/** How long a change stays on screen (the `delta-float` animation in index.css). */
const FLOAT_MS = 1800;

let nextId = 0;

/**
 * Shows each change of `value` (a run's HP or ₱) as text floating up from beside its number and fading (`+₱150`,
 * `−1 HP`): green for a gain, red for a loss. `format` writes the amount; `place` positions it (the parent is `relative`).
 * Nothing on the first render, or for people who prefer reduced motion. Several changes in a row each float.
 */
export function DeltaFloat({ value, format, place }: { value: number; format: (amount: number) => string; place: string }) {
  const last = useRef(value);
  const [floats, setFloats] = useState<{ id: number; amount: number }[]>([]);
  useEffect(() => {
    const amount = value - last.current;
    last.current = value;
    if (!amount || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = nextId++;
    setFloats((f) => [...f, { id, amount }]);
    window.setTimeout(() => setFloats((f) => f.filter((x) => x.id !== id)), FLOAT_MS);
  }, [value]);
  return (
    <>
      {floats.map((f) => (
        <span
          key={f.id}
          aria-hidden
          className={`delta-float pointer-events-none absolute whitespace-nowrap text-sm font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.9)] ${f.amount > 0 ? 'text-emerald-300' : 'text-rose-400'} ${place}`}
        >
          {f.amount > 0 ? '+' : '−'}
          {format(Math.abs(f.amount))}
        </span>
      ))}
    </>
  );
}
