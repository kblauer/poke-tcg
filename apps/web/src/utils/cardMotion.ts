// The board's card animations (Slot.tsx's, the battle page's), shared with Safari Draft's battles: a card dropping in,
// shaking with a red glow when it's hit, glowing green when healed (yellow for Energy), and lunging at the other side when
// it attacks. Each plays on an element with the Web Animations API, and tilts a holo along with it (`holo`, the HoloCard's
// springs) when there is one. The callers skip them for people who prefer reduced motion (`reducedMotion`).
import type { HoloMotion } from '../components/HoloCard';

/** Length of the card animations (a Pokémon arriving, taking damage, healing, getting Energy, attacking). */
export const MOTION_MS = 450;
/** How late a hit's shake starts, so the attacker's lunge lands first. */
export const HIT_DELAY_MS = 180;

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

const glowFrames = (rgb: string) => [{ filter: 'none' }, { filter: `drop-shadow(0 0 14px rgb(${rgb})) brightness(1.15)`, offset: 0.35 }, { filter: 'none' }];

/** A card arriving (played, evolved, switched in): it drops in, lit from above. */
export function dropIn(el: HTMLElement, holo?: HoloMotion | null) {
  el.animate([{ opacity: 0, transform: 'translateY(-14%) scale(0.85)' }, { opacity: 1, transform: 'none' }], { duration: MOTION_MS, easing: 'ease-out' });
  holo?.play([{ x: 50, y: 5, at: 0 }], MOTION_MS * 0.5);
}

/** A card taking damage: it shakes with a red glow, a moment late (HIT_DELAY_MS), rocking a holo side to side. */
export function hitShake(el: HTMLElement, holo?: HoloMotion | null) {
  const shake = ['none', 'translateX(-6%) rotate(-3deg)', 'translateX(5%) rotate(2deg)', 'translateX(-3%)', 'translateX(2%)', 'none'].map((transform) => ({ transform }));
  el.animate(shake, { duration: MOTION_MS, delay: HIT_DELAY_MS, easing: 'ease-out' });
  el.animate(glowFrames('239 68 68'), { duration: MOTION_MS, delay: HIT_DELAY_MS });
  const step = MOTION_MS / 5;
  holo?.play([10, 90, 25, 70].map((x, i) => ({ x, y: 50, at: HIT_DELAY_MS + i * step })), HIT_DELAY_MS + 4 * step);
}

/** A card glowing (healed: green, `52 211 153`; Energy: yellow, `250 204 21`), the glow sweeping across a holo. */
export function glow(el: HTMLElement, rgb: string, holo?: HoloMotion | null) {
  el.animate(glowFrames(rgb), { duration: MOTION_MS });
  holo?.play([{ x: 15, y: 15, at: 0 }, { x: 85, y: 85, at: MOTION_MS * 0.4 }], MOTION_MS * 0.8);
}
export const HEAL_RGB = '52 211 153';
export const ENERGY_RGB = '250 204 21';

/** A card attacking: it lunges towards the other side (`up` from the bottom of the table) and back, leaning into it. */
export function lunge(el: HTMLElement, dir: 'up' | 'down', holo?: HoloMotion | null) {
  const reach = dir === 'up' ? '-18%' : '18%';
  el.animate([{ transform: 'none' }, { transform: `translateY(${reach}) scale(1.06)`, offset: 0.4 }, { transform: 'none' }], { duration: MOTION_MS, easing: 'ease-in-out' });
  holo?.play([{ x: 50, y: dir === 'up' ? 0 : 100, at: 0 }], MOTION_MS * 0.4);
}
