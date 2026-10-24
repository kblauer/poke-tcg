import { useEffect, useRef, useState } from 'react';
import { useExpTheme } from '../../hooks/useThemedFigures';
import { barTile, hpBarFill } from './HpBar';

/** The run EXP that fills the bar once (the user's, 40 until 2026-10-24): a battle's 10 EXP is a fifth of it, an Extra EXP battle's 20 two fifths. */
export const EXP_PER_BAR = 50;

/** How long a bar takes to slide to a new length (ms). */
const FILL_MS = 600;

/** Where `exp` puts the EXP bar: the times it has filled (`cycles`) and how full it is now (%), the excess going on round. */
export function expBarFill(exp: number): { cycles: number; percent: number } {
  return { cycles: Math.floor(exp / EXP_PER_BAR), percent: ((exp % EXP_PER_BAR) / EXP_PER_BAR) * 100 };
}

/**
 * The EXP bar's fill as shown: it slides to where `exp` puts it, and when it crosses the end it fills, starts again
 * empty and goes on with the rest, once for each time it fills; `slide` is off for the jump back to empty.
 */
function useExpShown(exp: number) {
  const { cycles, percent } = expBarFill(exp);
  const [shown, setShown] = useState({ percent, slide: true });
  const seenCycles = useRef(cycles);
  useEffect(() => {
    const filled = cycles - seenCycles.current;
    seenCycles.current = cycles;
    if (filled <= 0) return setShown({ percent, slide: true });
    const steps = [...Array.from({ length: filled }, () => [{ percent: 100, slide: true }, { percent: 0, slide: false }]).flat(), { percent, slide: true }];
    let timer: ReturnType<typeof setTimeout>;
    const next = (i: number) => {
      const step = steps[i];
      if (!step) return;
      setShown(step);
      // A frame or two empty before sliding again, so the browser draws the reset.
      timer = setTimeout(() => next(i + 1), step.slide ? FILL_MS : 50);
    };
    next(0);
    return () => clearTimeout(timer);
  }, [cycles, percent]);
  return shown;
}

/** The sprite's pixels in screen pixels (the box is drawn at 2×, never smoothed). */
const px = (n: number) => n * 2;

/**
 * The EXP bar's two colours, light and dark: the game's blues, or (the user's, on by default: useExpTheme) the colour
 * theme's accent, `--color-yellow-300` (utils/themes.ts redefines it for each theme), its dark one at the game's dark
 * blue's brightness (about 62% of the light one's).
 */
const EXP_GAME = { light: 'rgb(0 186 243)', dark: 'rgb(0 121 154)' };
const EXP_THEME = { light: 'var(--color-yellow-300)', dark: 'color-mix(in srgb, var(--color-yellow-300) 62%, black)' };

/** The EXP bar's fill: the game's stripes a sprite pixel wide, dark then light. */
const expFill = (c: typeof EXP_GAME) => `repeating-linear-gradient(to right, ${c.dark} 0 ${px(1)}px, ${c.light} ${px(1)}px ${px(2)}px)`;

/** The box's "EXP" in the theme's colours: each of its two blues' pixels (`b2-exp-<dark|light>.png`, masks at 2×) painted over. */
function ThemedExpTag() {
  return (
    <>
      {(['dark', 'light'] as const).map((tone) => (
        <span
          key={tone}
          className="absolute inset-0"
          style={{ backgroundColor: EXP_THEME[tone], mask: `url(/bars/b2-exp-${tone}.png) 0 0 / ${px(112)}px ${px(18)}px no-repeat` }}
          aria-hidden
        />
      ))}
    </>
  );
}

/**
 * The run's HP and EXP as Black 2's player box (the user's): the box from its HP bars sheet (`b2-box.png`, its bars
 * emptied and no HP numbers, the user's; tools/bars/bw_bars.py) with the HP bar's fill (hpBarFill: full and green, 45%
 * yellow, 15% red; the sheet's tile repeated along it) and the EXP bar's fill (EXP_PER_BAR, wrapping round:
 * useExpShown); both the EXP bar and its "EXP" in the theme's accent or the game's blue (useExpTheme). 224×36 screen
 * pixels.
 */
export function StatusBox({ hp, maxHp, exp }: { hp: number; maxHp: number; exp: number }) {
  const { percent, color } = hpBarFill(hp, maxHp);
  const shown = useExpShown(exp);
  const [themed] = useExpTheme();
  return (
    <div
      className="relative shrink-0 [image-rendering:pixelated]"
      style={{ width: px(112), height: px(18), background: `url(/bars/b2-box.png) 0 0 / ${px(112)}px ${px(18)}px no-repeat` }}
      title={`${hp} of ${maxHp} HP: losing a battle costs 1 · ${exp} EXP this run, added to your account when you beat it`}
    >
      <span className="absolute" style={{ left: px(50), top: px(2), width: px(48), height: px(3) }} role="meter" aria-label="HP" aria-valuemin={0} aria-valuemax={maxHp} aria-valuenow={hp}>
        <span className="absolute inset-y-0 left-0 transition-[width] duration-700 ease-out" style={{ width: `${percent}%`, ...barTile(`hp-${color}`, 2, 6) }} />
      </span>
      <span className="absolute" style={{ left: px(26), top: px(15), width: px(80), height: px(2) }} role="meter" aria-label="Run EXP" aria-valuemin={0} aria-valuemax={EXP_PER_BAR} aria-valuenow={exp % EXP_PER_BAR}>
        <span
          className={`absolute inset-y-0 left-0 ${shown.slide ? 'transition-[width] ease-out' : ''}`}
          style={{ width: `${shown.percent}%`, transitionDuration: `${FILL_MS}ms`, background: expFill(themed ? EXP_THEME : EXP_GAME) }}
        />
      </span>
      {themed && <ThemedExpTag />}
    </div>
  );
}
