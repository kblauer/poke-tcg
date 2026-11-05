import { expForLevel, FRAME_MS, HGSS_CATCH, HGSS_FOE_SEND, HGSS_INTRO, HGSS_PLAYER_SEND, HGSS_SHAKES_AT, hgssShake, JOHTO_PICS, species, type BattleEvent, type BattlerView } from '@poke-tcg/idle';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { BattleSegment } from '../../hooks/useIdle';
import { DsText } from './dsFont';
import { DS_HEIGHT, DS_WIDTH } from './GameScreen';
import { filled, STATUS, useBarValue } from './Healthbox';

/** HGSS's battle pictures (tools/idle/hgss_battle.py, hgss_pics.py). */
const B = '/idle/gen2/battle';
const G = '/idle/gen2';

/** A ball's colour its Pokémon is blended to as it comes out or goes in (sFadeColors, RGB555); the Apricorn balls, Sport and Park the Poké Ball's. */
const BALL_COLOR: Record<string, [number, number, number]> = {
  'master-ball': [23, 20, 28], 'ultra-ball': [31, 31, 15], 'great-ball': [16, 23, 30], 'poke-ball': [31, 22, 30], 'safari-ball': [23, 30, 20], 'net-ball': [21, 31, 25], 'dive-ball': [12, 25, 30],
  'nest-ball': [30, 27, 10], 'repeat-ball': [31, 24, 16], 'timer-ball': [29, 30, 30], 'luxury-ball': [31, 17, 10], 'premier-ball': [31, 9, 10], 'dusk-ball': [14, 14, 17], 'heal-ball': [31, 24, 28],
  'quick-ball': [17, 26, 31], 'cherish-ball': [30, 8, 5],
};
const rgb = ([r, g, b]: [number, number, number]) => `rgb(${(r * 255) / 31}, ${(g * 255) / 31}, ${(b * 255) / 31})`;
const colorOf = (item: string) => rgb(BALL_COLOR[item] ?? BALL_COLOR['poke-ball']!);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** The intro's slide: 8 pixels a frame for the platforms (16 at twice the speed), the background's scroll 4 (8). */
const SLIDE_PX = 16;
const SCROLL_PX = 8;
/** The back pic's throw (sequence 1 of its NANR: cells 0–7 then 0, for 8, 16, 6, 2, 4, 2, 2, 52, 2 frames) and the ball in its hand by cell (ov12_0226D1EA). */
const THROW = [8, 16, 6, 2, 4, 2, 2, 52, 2];
const HAND: Record<number, [number, number]> = { 1: [-34, 4], 2: [-28, -11], 3: [50, -12] };
/** The bounce after a caught ball's drop (dy a frame; squashed, cell 8, on these frames). */
const BOUNCE = [-7, -5, -3, -2, 2, 3, 5, 7, -5, -3, -2, 2, 3, 5, -2, -1, 1, 2, -2, 2];
const SQUASHED = new Set([0, 7, 8, 13, 18, 19]);
/** A shake's wobble: x offsets a frame (cumulative), the first wider; the angle 2° a pixel. */
const WOBBLE = [
  [-2, 0, 2, 2, 0, -2],
  [-1, 0, 1, 1, 0, -1],
  [-1, 0, 1, 1, 0, -1, 0, 0, 0, 0, 0],
];

/** A parabola from a to b over n frames, `height` above the line at mid-flight (XYTransformContext_InitParabolic). */
function arc(t: number, n: number, a: [number, number], b: [number, number], height: number): [number, number] {
  const k = clamp(t / n, 0, 1);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k + height * Math.cos(Math.PI / 2 + Math.PI * k)];
}

/** A ball's frame (balls/<item>.png's 10: 0–7 turning, 8 squashed, 9 open), centred at x, y, darkened or tinted. */
function Ball({ item, frame, x, y, rot = 0, filter }: { item: string; frame: number; x: number; y: number; rot?: number; filter?: string }) {
  return <span className="absolute" style={{ left: Math.round(x) - 16, top: Math.round(y) - 16, width: 32, height: 32, backgroundImage: `url(${B}/balls/${BALL_COLOR[item] || item.endsWith('-ball') ? item : 'poke-ball'}.png)`, backgroundPosition: `${-frame * 32}px 0`, transform: rot ? `rotate(${rot}deg)` : undefined, filter }} />;
}

/**
 * A Pokémon's (or a trainer's) 80x80 picture centred at x, y, scaled from its feet (`feet` pixels below its centre:
 * PokemonSprite_CalcScaledYOffset), blended `tint` sixteenths to a colour (its own shape), cut off below `clip` (sinking).
 */
function Pic({ src, x, y, scale = 1, feet = 40, tint, clip, anim }: { src: string; x: number; y: number; scale?: number; feet?: number; tint?: { color: string; level: number }; clip?: number; anim?: string }) {
  const style: CSSProperties = { left: Math.round(x) - 40, top: Math.round(y) - 40, width: 80, height: 80, transform: scale !== 1 ? `scale(${scale})` : undefined, transformOrigin: `50% ${40 + feet}px` };
  const body = (
    <span className="absolute" style={style}>
      <span className="absolute inset-0" style={{ animation: anim }}>
        <img src={src} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
        {tint && tint.level > 0 && <span className="absolute inset-0" style={{ background: tint.color, opacity: tint.level / 16, maskImage: `url(${src})`, WebkitMaskImage: `url(${src})`, maskSize: '100% 100%', WebkitMaskSize: '100% 100%' }} />}
      </span>
    </span>
  );
  if (clip === undefined) return body;
  return (
    <span className="absolute left-0 top-0 overflow-hidden" style={{ width: DS_WIDTH, height: clip }}>
      {body}
    </span>
  );
}

/** A Pokémon's picture (its female one where it differs: hgss_pics.py's <id>f), front for the foe, back for the player's. */
const FEMALE = new Set([3, 12, 19, 20, 25, 26, 41, 42, 44, 45, 64, 65, 84, 85, 97, 111, 112, 118, 119, 123, 129, 130, 154, 165, 166, 178, 185, 186, 190, 194, 195, 198, 202, 203, 207, 208, 212, 214, 215, 217, 221, 224, 229, 232, 255, 256, 257, 267, 269, 272, 274, 275, 307, 308, 315, 316, 317, 322, 323, 332, 350, 369, 396, 397, 398, 399, 400, 401, 402, 403, 404, 405, 407, 415, 417, 418, 419, 424, 443, 444, 445, 449, 450, 453, 454, 456, 457, 459, 460, 461, 464, 465, 473]);
export const hgssMonSrc = (m: Pick<BattlerView, 'species' | 'shiny' | 'gender'>, side: 0 | 1) => `${G}/pokemon/${m.shiny ? 'shiny/' : ''}${side ? 'front' : 'back'}/${m.species}${m.gender === 'female' && FEMALE.has(m.species) ? 'f' : ''}.png`;
/** Its height offset (height.narc: how far down its picture sits from its slot), front or back. */
const offsetOf = (id: number, side: 0 | 1) => (side ? JOHTO_PICS[id]?.frontY : JOHTO_PICS[id]?.backY) ?? 0;

/** A healthbox's level and HP numbers in its digits (digits.png's 0–9), from x, or right-aligned to it. */
function Digits({ n, x, y, right = false }: { n: number; x: number; y: number; right?: boolean }) {
  const s = String(n);
  const from = right ? x - s.length * 8 : x;
  return (
    <>
      {[...s].map((c, i) => (
        <span key={i} className="absolute" style={{ left: from + i * 8, top: y, width: 8, height: 8, backgroundImage: `url(${B}/digits.png)`, backgroundPosition: `${-Number(c) * 8}px 0` }} />
      ))}
    </>
  );
}

const STATUS_ROW: Record<string, number> = { par: 1, frz: 2, slp: 3, psn: 4, brn: 5 };

/**
 * HGSS's single battle healthbox (battle_hp_bar.c), in game pixels, its top left at x, y: the name in its font, the "Lv"
 * with the gender symbol and the level, the HP bar (48 pixels: green over half, yellow over a fifth, red; moving a step a
 * frame), the status, the caught ball (a wild foe caught before), and the player's HP numbers and EXP. bar.
 */
function HgssHealthbox({ mon, player, exp, caught, x, y }: { mon: BattlerView; player: boolean; exp?: number; caught?: boolean; x: number; y: number }) {
  const s = species(mon.species);
  const hp = useBarValue(mon.hp, mon.maxHp, 48, mon.uid);
  const from = expForLevel(s.growth, mon.level);
  const to = expForLevel(s.growth, mon.level + 1);
  const expInto = mon.level >= 100 ? 0 : Math.max(0, Math.min(to - from, (exp ?? from) - from));
  const expShown = useBarValue(expInto, Math.max(1, to - from), 96, `${mon.uid}:${mon.level}`);
  const bar = filled(hp, mon.maxHp, 6);
  const color = bar.pixels > 24 ? 0 : bar.pixels >= 10 ? 1 : 2;
  const status = mon.status ? STATUS[mon.status] : null;
  const L = player ? { name: 24, lv: 88, bar: 72, status: 32 } : { name: 8, lv: 72, bar: 56, status: 16 };
  return (
    <div className="absolute" style={{ left: x, top: y, width: 128, height: 64 }}>
      <img src={`${B}/healthbox_${player ? 'player' : 'enemy'}.png`} alt="" className="absolute left-0 top-0" draggable={false} />
      <DsText text={s.name} x={L.name} y={16} font={`${B}/font_healthbox.png`} />
      <img src={`${B}/lv_${mon.gender ?? 'none'}.png`} alt="" className="absolute" style={{ left: L.lv, top: 16 }} draggable={false} />
      <Digits n={mon.level} x={L.lv + 16} y={20} />
      {bar.perTile.map((n, i) => (
        <span key={i} className="absolute" style={{ left: L.bar + i * 8, top: 32, width: 8, height: 8, backgroundImage: `url(${B}/hp_bar.png)`, backgroundPosition: `${-n * 8}px ${-color * 8}px` }} />
      ))}
      {status && <span className="absolute" style={{ left: L.status, top: 32, width: 24, height: 8, backgroundImage: `url(${B}/status.png)`, backgroundPosition: `0 ${-STATUS_ROW[status]! * 8}px` }} />}
      {!player && caught && <img src={`${B}/ball_caught.png`} alt="Caught" title="Caught before" className="absolute" style={{ left: 8, top: 32 }} draggable={false} />}
      {player && (
        <>
          <Digits n={hp} x={88} y={40} right />
          <Digits n={mon.maxHp} x={96} y={40} />
          {filled(expShown, Math.max(1, to - from), 12).perTile.map((n, i) => (
            <span key={i} className="absolute" style={{ left: 24 + i * 8, top: 48, width: 8, height: 8, backgroundImage: `url(${B}/exp_bar.png)`, backgroundPosition: `${-n * 8}px 0` }} />
          ))}
        </>
      )}
    </div>
  );
}

/**
 * The battle background and the platforms for a battle (HGSS's battle_setup and battle_system): its map's battle
 * background (forced to the ocean's surfing; a League room's own), its time palette by the hour for the outdoor ones
 * (4–16 day, 17–19 evening, 20–3 night), and the platforms by the terrain under the player (the League rooms' their own).
 */
export function hgssBattleArt(b: BattleSegment): { bg: string; enemy: string; player: string } {
  const hour = b.hour ?? 12;
  const time = hour >= 4 && hour < 17 ? 'day' : hour < 20 && hour >= 17 ? 'evening' : 'night';
  const league = ['will', 'koga', 'bruno', 'karen', 'lance'].includes(b.scene) ? b.scene : null;
  const surf = b.terrain === 'water';
  const scene = surf ? 'ocean' : (b.scene || 'general').replace(/-/g, '_');
  const timed = ['general', 'ocean', 'city', 'forest', 'mountain', 'snow'].includes(scene);
  const bg = league ?? (timed || /^(building|cave)_\d$/.test(scene) ? scene : 'general');
  const terrain = league ?? ({ grass: 'grass', longgrass: 'grass', sand: 'sand', water: 'water', pond: 'puddle', mountain: 'mountain', cave: 'cave', building: 'building', snow: 'snow', ice: 'ice' } as Record<string, string>)[b.terrain] ?? 'plain';
  const plat = (side: string) => `${B}/platform/${terrain}_${side}${league ? '' : `_${time}`}.png`;
  return { bg: `${B}/bg/${bg}${timed ? `_${time}` : ''}.png`, enemy: plat('enemy'), player: plat('player') };
}

/**
 * HeartGold's battle scene in game pixels (issue #170, step 5: Johto's battles; the spec from pokeheartgold's battle
 * scripts and tasks), drawn frame by frame from when each event came up (`times`; `introAt` when the battle opened), as
 * BattleScene draws FireRed's: the intro (the platforms sliding in from the sides, the background scrolling with them,
 * twice the game's speed; a wild Pokémon riding its platform darkened, fading in on arrival, its healthbox sliding in),
 * a trainer leaving and their ball opening (the Pokémon growing out of it in the ball's colour), the player's back pic
 * throwing as it leaves and the ball's arc, healthboxes sliding in (24 pixels a frame), a thrown ball's catch (the throw,
 * the Pokémon drawn in, the flash, the drop and bounces, each shake and the click, or the Pokémon out again: the burst
 * and the stars are 3D particles, not drawn), and fainting (sinking behind its feet, 8 pixels a frame).
 */
export function HgssBattleScene({
  battle,
  trainerPic,
  events,
  current,
  times,
  introAt,
  gender,
  exp,
  hit,
  attacker,
  line,
}: {
  battle: BattleSegment;
  trainerPic: string | null;
  events: BattleEvent[];
  current: [BattlerView | null, BattlerView | null];
  times: number[];
  introAt: number;
  gender: 'male' | 'female';
  exp: Record<string, number>;
  hit: { side: 0 | 1; at: number } | null;
  attacker: { side: 0 | 1; at: number } | null;
  line: number;
}) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    let id = 0;
    const tick = () => {
      setNow(performance.now());
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  const frames = (at: number) => Math.floor((now - at) / FRAME_MS);
  const wild = battle.kind === 'wild';
  const firstTick = battle.events.findIndex((e, i) => i > 0 && e.t === 'tick');
  const opening = (i: number) => firstTick < 0 || i < firstTick;
  const art = hgssBattleArt(battle);

  // The intro: the delay, then the platforms 16 pixels a frame (enemy −80 → 192, player 336 → 64) and the background's
  // scroll from 132 to 0.
  const fi = frames(introAt);
  const moving = Math.max(0, fi - HGSS_INTRO.delay);
  const enemyX = Math.min(192, -80 + SLIDE_PX * moving);
  const playerX = Math.max(64, 336 - SLIDE_PX * moving);
  const scroll = Math.max(0, 132 - SCROLL_PX * moving);
  const arrived = fi - HGSS_INTRO.delay - HGSS_INTRO.slide;

  const latest = (side: 0 | 1, t: BattleEvent['t']) => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]!;
      if (e.t === t && (!('side' in e) || e.side === side)) return i;
    }
    return -1;
  };
  const sendOf = (side: 0 | 1) => {
    const i = latest(side, 'send');
    return i < 0 ? null : { index: i, at: times[i] ?? now, mon: (events[i] as Extract<BattleEvent, { t: 'send' }>).mon };
  };
  const after = (side: 0 | 1, t: BattleEvent['t'], from: number) => {
    const i = latest(side, t);
    return i > from ? { index: i, at: times[i] ?? now } : null;
  };
  const anim = (side: 0 | 1) => (hit && hit.side === side && hit.at >= line ? 'idle-hit 0.5s steps(2) 2' : attacker && attacker.side === side && attacker.at >= line ? `idle-lunge-${side} 0.3s ease-out` : undefined);
  const live = (side: 0 | 1, mon: BattlerView) => (current[side]?.uid === mon.uid ? current[side]! : mon);
  // A healthbox sliding in from 160 pixels off its side, 24 a frame (`h` frames in).
  const slideIn = (h: number) => 160 - clamp(h * 24, 0, 160);
  // A Pokémon out of its ball `o` frames after it's released: growing in 8 frames from its feet, its colour fading in 17.
  const emerging = (o: number, item: string) => ({ scale: clamp(o / HGSS_FOE_SEND.grow, 0, 1), tint: { color: colorOf(item), level: o < HGSS_FOE_SEND.grow ? 16 : clamp(16 - (o - HGSS_FOE_SEND.grow), 0, 16) } });
  const parts: ReactNode[] = [];
  const healthboxes: ReactNode[] = [];

  // ---- The foe's side ----
  const foeSend = sendOf(1);
  const firstFoe = battle.events.find((e): e is Extract<BattleEvent, { t: 'send' }> => e.t === 'send' && e.side === 1)?.mon ?? null;
  if (!wild) {
    // The trainer on the enemy platform, off to the right 5 pixels a frame (21 frames) once their first Pokémon is sent.
    const sent = !foeSend ? -1 : opening(foeSend.index) ? frames(foeSend.at) : Infinity;
    const x = sent < 0 ? enemyX : 192 + 5 * Math.min(sent, HGSS_FOE_SEND.trainerOut);
    if (trainerPic && sent < HGSS_FOE_SEND.trainerOut) parts.push(<Pic key="trainer" src={`${G}/trainers/${trainerPic}.png`} x={x} y={50} />);
  }
  if (foeSend || (wild && firstFoe)) {
    const mon = foeSend?.mon ?? firstFoe!;
    const yOff = offsetOf(mon.species, 1);
    const y = 50 + yOff;
    const feet = 40 - yOff;
    const faint = foeSend ? after(1, 'faint', foeSend.index) : null;
    const ball = foeSend ? after(1, 'ball', foeSend.index) : null;
    let x = 192;
    let scale = 1;
    let tint: { color: string; level: number } | undefined;
    let visible = true;
    let hb: number | null = 0;
    let dy = 0;
    if (wild && (!foeSend || opening(foeSend.index))) {
      // Riding its platform in, 8/16 dark till it's there, fading in over 9 frames; its healthbox after.
      x = enemyX;
      tint = { color: '#000000', level: arrived < 0 ? 8 : clamp(8 - arrived, 0, 8) };
      hb = arrived < HGSS_INTRO.fade ? null : slideIn(arrived - HGSS_INTRO.fade);
    } else if (foeSend) {
      // A trainer's ball at 192,86 as they leave (the trainer's, then ShowPokemon's: drawn as one), 12 frames still,
      // squashed 5 frames on, then gone as the Pokémon comes out.
      const g = frames(foeSend.at) - (opening(foeSend.index) ? HGSS_FOE_SEND.trainerOut : 0);
      const o = g - HGSS_FOE_SEND.still - HGSS_FOE_SEND.release;
      if (g >= -HGSS_FOE_SEND.trainerOut && o < 0) parts.push(<Ball key="foe-ball" item="poke-ball" frame={g < HGSS_FOE_SEND.still ? 0 : 8} x={192} y={86} />);
      if (o < 0) {
        visible = false;
        hb = null;
      } else {
        ({ scale, tint } = emerging(o, 'poke-ball'));
        const h = frames(foeSend.at) - (opening(foeSend.index) ? HGSS_FOE_SEND.healthboxAt : HGSS_FOE_SEND.still + HGSS_FOE_SEND.release + HGSS_FOE_SEND.grow);
        hb = h < 0 ? null : -slideIn(h);
      }
    }
    if (ball) {
      // The catch (Task_GetPokemon): every frame from the throw.
      const e = events[ball.index] as Extract<BattleEvent, { t: 'ball' }>;
      const g = frames(ball.at);
      const item = e.item;
      const shakes = e.caught ? 3 : Math.min(3, e.shakes);
      const tOpen = HGSS_CATCH.throw;
      const tFall = tOpen + HGSS_CATCH.open;
      const tDrop = tFall + HGSS_CATCH.flash + 1;
      const tBounce = tDrop + 10;
      let bx = 192;
      let by = 56;
      let frame = 0;
      let rot = 0;
      let filter: string | undefined;
      if (g < tOpen) {
        [bx, by] = arc(g, HGSS_CATCH.throw, [-30, 160], [192, 56], 64);
        frame = g % 8;
      } else if (g < tFall) {
        const o = g - tOpen;
        frame = o < 10 ? 0 : o < 20 ? 8 : 9;
      } else if (g < tDrop) {
        // The ball's flash to yellow and back (4 frames each way).
        const f = g - tFall;
        filter = `sepia(1) saturate(4) brightness(${1 + 0.15 * (f < 4 ? f : Math.max(0, 8 - f))})`;
      } else if (g < tBounce) by = 56 + 3.2 * (g - tDrop);
      else if (g < HGSS_SHAKES_AT) {
        const k = g - tBounce;
        by = 88 + BOUNCE.slice(0, k + 1).reduce((a, d) => a + d, 0);
        frame = SQUASHED.has(k) ? 8 : 0;
      } else by = 88;
      // The shakes: 14 frames still, the wobble, 12 more; then the click (darkened) or the Pokémon out again.
      let t = HGSS_SHAKES_AT;
      for (let k = 0; k < shakes; k++) {
        const w = g - t - HGSS_CATCH.still;
        if (w >= 0 && w < HGSS_CATCH.wobble[k]!) {
          const dx = WOBBLE[k]![w]!;
          bx = 192 + dx;
          rot = 2 * dx;
        }
        t += hgssShake(k);
      }
      if (g >= HGSS_SHAKES_AT) by = 88;
      const broke = !e.caught && g >= t;
      if (e.caught && g >= t + HGSS_CATCH.click) filter = 'brightness(0.55)';
      if (broke) {
        // Out again where it was (a quick send-out: the ball squashed, the Pokémon growing out of it), the ball gone 2 frames after.
        const o = g - t - HGSS_FOE_SEND.release;
        if (o < 2) parts.push(<Ball key="catch-ball" item={item} frame={8} x={192} y={88} />);
        ({ scale, tint } = emerging(Math.max(0, o), item));
        visible = o >= 0;
      } else {
        parts.push(<Ball key="catch-ball" item={item} frame={frame} x={bx} y={by} rot={rot} filter={filter} />);
        // Drawn in: 23 frames after the ball opens, blended to the ball's colour (17 frames), shrinking in 8 and rising.
        const o = g - tOpen - HGSS_CATCH.drawIn;
        if (o >= 0) {
          tint = { color: colorOf(item), level: clamp(o, 0, 16) };
          scale = clamp(1 - o / 8, 0, 1);
          dy = -Math.min(o, yOff);
          if (scale <= 0) visible = false;
        }
      }
      hb = 0;
    }
    if (faint) {
      // Sinking 8 pixels a frame behind the line at its feet, then gone with its healthbox.
      const steps = frames(faint.at);
      if (steps * 8 < 80 - yOff) parts.push(<Pic key="foe" src={hgssMonSrc(mon, 1)} x={x} y={y + steps * 8} clip={y + feet} />);
      visible = false;
      hb = null;
    }
    // Its shadow (enemy only, fixed at 86 under its x: a medium one, the per-species sizes not ported), then the Pokémon.
    if (visible && scale > 0) {
      parts.push(<span key="shadow" className="absolute" style={{ left: Math.round(x) - 32, top: 78, width: 64, height: 16, backgroundImage: `url(${B}/shadow.png)`, backgroundPosition: '0 -16px', transform: scale !== 1 ? `scale(${scale})` : undefined }} />);
      parts.push(<Pic key={`foe${mon.uid}`} src={hgssMonSrc(mon, 1)} x={x} y={y + dy} scale={scale} feet={feet} tint={tint} anim={anim(1)} />);
    }
    if (hb !== null) healthboxes.push(<div key="hb1" className="absolute" style={{ left: 0, top: 0, transform: `translateX(${hb}px)` }}><HgssHealthbox mon={live(1, mon)} player={false} caught={wild && !!battle.caughtBefore} x={-6} y={8} /></div>);
  }

  // ---- The player's side ----
  const meSend = sendOf(0);
  const back = `${G}/trainers/${gender === 'female' ? 'heroine' : 'hero'}_back_sheet.png`;
  const throwF = meSend && opening(meSend.index) ? frames(meSend.at) : meSend ? Infinity : -1;
  if (throwF < HGSS_PLAYER_SEND.slide) {
    // The back pic on its platform; sending out, its throw's cells as it leaves 5 pixels a frame, the ball in its hand.
    let x = playerX;
    let cell = 0;
    if (throwF >= 0) {
      x = 64 - 5 * throwF;
      let t = throwF;
      cell = THROW.findIndex((n) => (t -= n) < 0) % 8;
      if (cell < 0) cell = 0;
      const hand = HAND[cell];
      if (hand) parts.push(<Ball key="hand" item="poke-ball" frame={0} x={x + hand[0]} y={112 + hand[1]} />);
    }
    parts.push(<span key="back" className="absolute" style={{ left: Math.round(x) - 40, top: 112 - 40, width: 96, height: 84, backgroundImage: `url(${back})`, backgroundPosition: `0 ${-cell * 84}px` }} />);
  }
  if (meSend) {
    const mon = meSend.mon;
    const yOff = offsetOf(mon.species, 0);
    const y = 112 + yOff;
    // The ball from the hand (10,100) in a 20-frame arc 48 high to 64,144, hanging 4 frames at its top, turning; white, then the Pokémon.
    const g = frames(meSend.at) - (opening(meSend.index) ? HGSS_PLAYER_SEND.slide : 0);
    const faint = after(0, 'faint', meSend.index);
    const flight = HGSS_PLAYER_SEND.arc + HGSS_PLAYER_SEND.hang;
    if (g >= 0 && g < flight + HGSS_PLAYER_SEND.white) {
      const k = g < 10 ? g : g < 10 + HGSS_PLAYER_SEND.hang ? 10 : g - HGSS_PLAYER_SEND.hang;
      const [bx, by] = arc(Math.min(k, HGSS_PLAYER_SEND.arc), HGSS_PLAYER_SEND.arc, [10, 100], [64, 144], 48);
      const white = g - flight;
      parts.push(<Ball key="me-ball" item="poke-ball" frame={g % 8} x={bx} y={by} filter={white >= 0 ? `brightness(${1 + white / 4})` : undefined} />);
    }
    const o = g - flight - HGSS_PLAYER_SEND.white;
    if (o >= 0) {
      const em = emerging(o, 'poke-ball');
      const sink = faint ? frames(faint.at) * 8 : 0;
      if (sink < 80 - yOff) parts.push(<Pic key={`me${mon.uid}`} src={hgssMonSrc(mon, 0)} x={64} y={y + sink} scale={em.scale} feet={40 - yOff} tint={em.tint} clip={faint ? 112 + 40 : undefined} anim={anim(0)} />);
      const h = frames(meSend.at) - (opening(meSend.index) ? HGSS_PLAYER_SEND.healthboxAt : flight + HGSS_PLAYER_SEND.white + HGSS_PLAYER_SEND.grow);
      if (!faint && h >= 0) healthboxes.push(<div key="hb0" className="absolute" style={{ left: 0, top: 0, transform: `translateX(${slideIn(h)}px)` }}><HgssHealthbox mon={live(0, mon)} player exp={exp[mon.uid]} x={128} y={84} /></div>);
    }
  }

  return (
    <div className="pointer-events-none absolute left-0 top-0 overflow-hidden" style={{ width: DS_WIDTH, height: DS_HEIGHT }}>
      {/* The background (512 wide, wrapping as it scrolls in), then the platforms riding in with their sides. */}
      <img src={art.bg} alt="" className="absolute max-w-none" style={{ left: scroll, top: 0, width: 512, height: 256 }} draggable={false} />
      {scroll > 0 && <img src={art.bg} alt="" className="absolute max-w-none" style={{ left: scroll - 512, top: 0, width: 512, height: 256 }} draggable={false} />}
      <img src={art.enemy} alt="" className="absolute max-w-none" style={{ left: enemyX - 64, top: 88 - 32 }} draggable={false} />
      <img src={art.player} alt="" className="absolute max-w-none" style={{ left: playerX - 128, top: 136 - 16 }} draggable={false} />
      {parts}
      {healthboxes}
    </div>
  );
}
