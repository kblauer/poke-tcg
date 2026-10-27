import { CATCH, FOE_SEND, FRAME_MS, HEALTHBOX_FRAMES, INTRO_FRAMES, INTRO_SPEED, OPEN_FRAMES, PLAYER_SEND, SHAKES_AT, species, type BattleEvent, type BattlerView } from '@poke-tcg/idle';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import type { BattleSegment } from '../../hooks/useIdle';
import { GAME_HEIGHT, GAME_WIDTH } from './GameScreen';
import { Healthbox } from './Healthbox';

const GEN1 = '/idle/gen1';
const B = '/idle/gen1/battle';

/** The colour a ball's Pokémon is blended to as it comes out or goes in (sBallOpenFadeColors, 5 bits a channel). */
const BALL_COLOR: Record<string, [number, number, number]> = {
  'poke-ball': [31, 22, 30],
  'great-ball': [16, 23, 30],
  'ultra-ball': [31, 31, 15],
  'master-ball': [23, 20, 28],
  'safari-ball': [23, 30, 20],
};
const rgb = ([r, g, b]: [number, number, number]) => `rgb(${(r * 255) / 31}, ${(g * 255) / 31}, ${(b * 255) / 31})`;
/** A ball's opening particles' frames (battle_anim_special.c: the Poké, Great and Safari Balls' streaks in turn, the Master Ball's star, the Ultra Ball's sparkle). */
const PARTICLES: Record<string, number[]> = { 'master-ball': [3], 'ultra-ball': [7] };
const STREAKS = [0, 1, 2, 0, 2, 1];
const ballOf = (item: string) => (BALL_COLOR[item] ? item : 'poke-ball');

/** The game's sine (gSineTable: 256 steps a turn), as a fraction. */
const sin = (i: number) => Math.sin((i * Math.PI * 2) / 256);
const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

/** A straight move with a sine on top (TranslateAnimHorizontalArc): at frame t of n, from a to b, `height` above the line at mid-flight. */
function arc(t: number, n: number, a: [number, number], b: [number, number], height: number): [number, number] {
  const k = clamp(t / n, 0, 1);
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k - height * Math.sin(Math.PI * k)];
}

/** One shake's frames (DoShake, from the decompilation's numbers): the rotation (1/256 turns, + anticlockwise) and x offset each frame. */
const SHAKE_ROT = [-3, -6, -9, -12, -15, -18, -21, -24, -27, -24, -21, -18, -15, -12, -9, -6, -3, 0, 3, 6, 9, 12, 15, 12, 9, 6, 3, 0];
const SHAKE_X = [0, 0, 0, 1, 1, 2, 2, 2, 3, 3, 3, 3, 2, 2, 1, 1, 0, 0, 0, -1, -1, -2, -2, -2, -1, -1, 0, 0];

/** The ball's sheet frame (closed, half open, open), drawn centred at x, y, turned `rot` (1/256 turns) and darkened. */
function Ball({ item, frame, x, y, rot = 0, dark = 0 }: { item: string; frame: number; x: number; y: number; rot?: number; dark?: number }) {
  return (
    <span
      className="absolute"
      style={{
        left: Math.round(x) - 8,
        top: Math.round(y) - 8,
        width: 16,
        height: 16,
        backgroundImage: `url(${B}/balls/${ballOf(item)}.png)`,
        backgroundPosition: `0 ${-frame * 16}px`,
        transform: rot ? `rotate(${(-rot * 360) / 256}deg)` : undefined,
        filter: dark ? `brightness(${1 - dark / 16})` : undefined,
      }}
    />
  );
}

/** A ball opening's burst (PokeBallOpenParticleAnimation): 16 particles, one a frame, out along 8 ways, 2 pixels a frame for 25 frames. */
function Burst({ item, f, x, y }: { item: string; f: number; x: number; y: number }) {
  if (f < 0 || f > 16 + 25) return null;
  const frames = PARTICLES[ballOf(item)] ?? STREAKS;
  return (
    <>
      {Array.from({ length: 16 }, (_, i) => {
        const age = f - i;
        if (age < 0 || age >= 25) return null;
        const angle = (i % 8) * 32;
        const r = age * 2;
        const fr = frames[age % frames.length]!;
        return (
          <span
            key={i}
            className="absolute"
            style={{ left: Math.round(x + sin(angle) * r) - 4, top: Math.round(y + sin(angle + 64) * r) - 4, width: 8, height: 8, backgroundImage: `url(${B}/particles.png)`, backgroundPosition: `0 ${-fr * 8}px`, transform: frames === STREAKS && age % 6 === 3 ? 'scaleX(-1)' : undefined }}
          />
        );
      })}
    </>
  );
}

/** A Pokémon (or trainer) picture, 64x64, centred at x, y, scaled, blended `tint` sixteenths to a colour (its own shape: a mask). */
function Pic({ src, x, y, scale = 1, tint, clipBottom, anim }: { src: string; x: number; y: number; scale?: number; tint?: { color: string; level: number }; clipBottom?: number; anim?: string }) {
  const style: CSSProperties = { left: Math.round(x) - 32, top: Math.round(y) - 32, width: 64, height: 64, transform: scale !== 1 ? `scale(${scale})` : undefined };
  const body = (
    <span className="absolute" style={style}>
      <span className="absolute inset-0" style={{ animation: anim }}>
      <img src={src} alt="" className="absolute inset-0 h-full w-full" draggable={false} />
      {tint && tint.level > 0 && (
        <span className="absolute inset-0" style={{ background: tint.color, opacity: tint.level / 16, maskImage: `url(${src})`, WebkitMaskImage: `url(${src})`, maskSize: '100% 100%', WebkitMaskSize: '100% 100%' }} />
      )}
      </span>
    </span>
  );
  // Sinking out of sight (an opponent fainting): cut off below where its picture began.
  if (clipBottom === undefined) return body;
  return (
    <span className="absolute left-0 top-0 overflow-hidden" style={{ width: GAME_WIDTH, height: clipBottom }}>
      {body}
    </span>
  );
}

/** Where a Pokémon is drawn (GetBattlerSpriteDefault_Y): the foe's centre at 176, 40 less its elevation, the player's at 72, 80, each lowered by its picture's offset. */
const foeY = (id: number) => 40 + species(id).pic.frontY - species(id).pic.elevation;
const meY = (id: number) => 80 + species(id).pic.backY;
const monSrc = (m: BattlerView, side: 0 | 1) => `${GEN1}/pokemon/${m.shiny ? 'shiny/' : ''}${side ? 'front' : 'back'}/${m.species}.png`;

/** The frame a ball's Pokémon is at once it opens (`o` frames in): its scale, how far below its place, its colour's sixteenths, the background's flash. */
function emerging(g: number) {
  const t = g;
  const scale = t < 0 ? 0 : t >= OPEN_FRAMES.emerge ? 1 : (0x28 + 0x12 * t) / 256;
  const y2 = t < 0 || t >= OPEN_FRAMES.emerge ? 0 : 16 - 1.125 * t;
  const up = OPEN_FRAMES.flash;
  const flash = t < 0 ? 0 : t < up ? t : t < 2 * up ? 2 * up - t : 0;
  const tint = t < 0 ? 16 : t < up ? 16 : t < 2 * up ? 2 * up - t : 0;
  return { scale, y2, flash: clamp(flash, 0, 16), tint: clamp(tint, 0, 16) };
}

interface Shown {
  index: number;
  at: number;
}

/**
 * FireRed's battle scene in game pixels (README: Idle Adventure, battles), drawn frame by frame from when each event came
 * up (`times`, by event index; `introAt` when the battle opened): the intro (the band opening, the background's halves
 * and the two sides sliding in, a wild Pokémon darkened till it's in, its healthbox), the opponent trainer leaving and
 * their ball opening (16 frames, its particles, the white flash, the Pokémon growing out of it in its colour), the
 * player's back pic throwing (its sheet's frames) and the ball's arc, healthboxes sliding in, a thrown ball's whole catch
 * (the throw, the Pokémon drawn in, the bounces, each shake, the click and stars, or the break out), and fainting.
 */
export function BattleScene({
  battle,
  background,
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
  background: string;
  /** The opponent trainer's picture (trainers/<pic>.png). */
  trainerPic: string | null;
  /** The events shown so far. */
  events: BattleEvent[];
  /** Each side's Pokémon as the events shown so far leave it (its HP, status, level: the healthboxes'). */
  current: [BattlerView | null, BattlerView | null];
  times: number[];
  introAt: number;
  gender: 'male' | 'female';
  exp: Record<string, number>;
  hit: { side: 0 | 1; at: number } | null;
  attacker: { side: 0 | 1; at: number } | null;
  line: number;
}) {
  // A frame at a time while the battle's up.
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

  // The intro: the band opening (32 frames), then the halves and both sides sliding in (2 pixels a frame for 120).
  const fi = frames(introAt);
  const band = INTRO_FRAMES.band;
  const slideF = clamp(fi - band, 0, INTRO_FRAMES.slide);
  // (At INTRO_SPEED times the game's: its band a pixel each way a frame to 48 pixels high then 4 to the screen, its slides 2 a frame.)
  const off = 240 - 2 * INTRO_SPEED * slideF;
  const bandHalf = fi < band ? INTRO_SPEED * fi + 1 : fi < band + 12 / INTRO_SPEED ? 33 + 4 * INTRO_SPEED * (fi - band) : 80;

  // Each side: its latest send-out, what came after it.
  const latest = (side: 0 | 1, t: BattleEvent['t']) => {
    for (let i = events.length - 1; i >= 0; i--) {
      const e = events[i]!;
      if (e.t === t && (!('side' in e) || e.side === side)) return i;
    }
    return -1;
  };
  const sendOf = (side: 0 | 1): Shown & { mon: BattlerView } | null => {
    const i = latest(side, 'send');
    if (i < 0) return null;
    return { index: i, at: times[i] ?? now, mon: (events[i] as Extract<BattleEvent, { t: 'send' }>).mon };
  };
  const after = (side: 0 | 1, t: BattleEvent['t'], from: number) => {
    const i = latest(side, t);
    return i > from ? { index: i, at: times[i] ?? now } : null;
  };

  // The hit blink and the attacker's lunge, on the Pokémon pictures (their line the latest).
  const anim = (side: 0 | 1) =>
    hit && hit.side === side && hit.at >= line ? 'idle-hit 0.5s steps(2) 2' : attacker && attacker.side === side && attacker.at >= line ? `idle-lunge-${side} 0.3s ease-out` : undefined;
  // A healthbox shows the Pokémon as it is now, not as it was sent out.
  const live = (side: 0 | 1, mon: BattlerView) => (current[side]?.uid === mon.uid ? current[side]! : mon);
  const parts: ReactNode[] = [];
  let flash = 0;
  const healthboxes: ReactNode[] = [];

  // ---- The foe's side ----
  const foeSend = sendOf(1);
  // A trainer's first send-out waits out its line's 60-frame pause ("sent out X!{PAUSE 60}").
  const foeFrames = (at: number, index: number) => frames(at) - (!wild && opening(index) ? 60 : 0);
  const firstFoe = battle.events.find((e): e is Extract<BattleEvent, { t: 'send' }> => e.t === 'send' && e.side === 1)?.mon ?? null;
  if (!wild) {
    // The trainer: sliding in with the intro, off to the right (35 frames) once they send out their first Pokémon.
    const pic = trainerPic;
    // (Gone for good once they've sent one out: a later send-out is the ball alone.)
    const sent = !foeSend ? -1 : opening(foeSend.index) ? Math.max(0, foeFrames(foeSend.at, foeSend.index)) : Infinity;
    const x = sent < 0 ? 176 - off : 176 + ((280 - 176) * Math.min(sent, FOE_SEND.trainerOut)) / FOE_SEND.trainerOut;
    if (pic && sent < FOE_SEND.trainerOut) parts.push(<Pic key="trainer" src={`${GEN1}/trainers/${pic}.png`} x={x} y={40} />);
  }
  if (foeSend || (wild && firstFoe)) {
    const mon = foeSend?.mon ?? firstFoe!;
    const faint = foeSend ? after(1, 'faint', foeSend.index) : null;
    const ball = foeSend ? after(1, 'ball', foeSend.index) : null;
    const y = foeY(mon.species);
    let x = 176;
    let scale = 1;
    let y2 = 0;
    let tint: { color: string; level: number } | undefined;
    let visible = true;
    let hbX: number | null = 0;
    if (wild && (!foeSend || opening(foeSend.index))) {
      // The wild Pokémon slides in darkened (10/16 to grey), its tint fading as it lands, its healthbox sliding in.
      x = 176 - off;
      const landed = fi - band - INTRO_FRAMES.slide;
      tint = { color: 'rgb(66, 66, 66)', level: landed < 0 ? 10 : clamp(10 - landed, 0, 10) };
      hbX = landed < 0 ? null : -115 + clamp(landed * 5, 0, 115);
    } else if (foeSend) {
      // A trainer's ball: closed at 176,64 for 16 frames (after a frame), then opening.
      const g = foeFrames(foeSend.at, foeSend.index) - FOE_SEND.open;
      if (g < 0) {
        visible = false;
        hbX = null;
        if (g >= -16) parts.push(<Ball key="foe-ball" item="poke-ball" frame={0} x={176} y={64} />);
      } else {
        if (g < OPEN_FRAMES.anim) parts.push(<Ball key="foe-ball" item="poke-ball" frame={g < 5 ? 1 : 2} x={176} y={64} />);
        parts.push(<Burst key="foe-burst" item="poke-ball" f={g} x={176} y={59} />);
        const em = emerging(g);
        scale = em.scale;
        y2 = em.y2;
        flash = Math.max(flash, em.flash);
        tint = { color: rgb(BALL_COLOR['poke-ball']!), level: em.tint };
        const h = g - OPEN_FRAMES.emerge;
        hbX = h < 0 ? null : -115 + clamp(h * 5, 0, 115);
      }
    }
    // A thrown ball (catching): the whole sequence, its frames from the throw.
    if (ball) {
      const e = events[ball.index] as Extract<BattleEvent, { t: 'ball' }>;
      const g = frames(ball.at);
      const item = e.item;
      const color = rgb(BALL_COLOR[ballOf(item)]!);
      const shakes = e.caught ? 3 : Math.min(3, e.shakes);
      const tOpen = CATCH.throw;
      const tShrink = tOpen + CATCH.open + CATCH.wait;
      const tClose = tShrink + CATCH.shrink;
      const tBounce = tClose + CATCH.close;
      const tOut = SHAKES_AT + shakes * (CATCH.shake + CATCH.pause);
      const tClick = SHAKES_AT + 2 * (CATCH.shake + CATCH.pause) + CATCH.shake + CATCH.click;
      let bx = 176;
      let by = 64;
      let frame = 0;
      let rot = 0;
      let dark = 0;
      if (g < tOpen) [bx, by] = arc(g, CATCH.throw, [32, 80], [176, 24], 40);
      else if (g < tBounce) {
        by = 24;
        frame = g < tOpen + 5 ? 1 : g < tClose ? 2 : g < tClose + 5 ? 1 : 0;
      } else if (g < tBounce + CATCH.bounce) {
        const t = g - tBounce;
        const hops: [number, number, number][] = [[17, 43, 30], [43, 65, 20], [65, 84, 10]];
        if (t < 17) by = 64 - 40 * Math.cos((Math.PI / 2) * (t / 17));
        else {
          const [s, end, peak] = hops.find(([a, b]) => t >= a && t < b)!;
          by = 64 - peak * Math.sin((Math.PI * (t - s)) / (end - s));
        }
      } else if (g >= SHAKES_AT) {
        const k = Math.floor((g - SHAKES_AT) / (CATCH.shake + CATCH.pause));
        const s = (g - SHAKES_AT) % (CATCH.shake + CATCH.pause);
        if (k < shakes && s < CATCH.shake) {
          const dir = k % 2 ? -1 : 1;
          rot = SHAKE_ROT[s]! * dir;
          bx = 176 + SHAKE_X[s]! * dir;
        }
      }
      const broke = !e.caught && g >= tOut;
      if (e.caught && g >= tClick) {
        // The click: the ball darkened (6/16), 3 stars, the ball's colour back after 20 frames (over 16).
        const c = g - tClick;
        dark = c < 20 ? 6 : clamp(6 - Math.floor((c - 20) / 3), 0, 6);
        const stars: [number, number, number][] = [[10, 2, 3], [15, 0, 4], [-10, 2, 4]];
        if (c < 24 && c % 2 === 0)
          stars.forEach(([dx, dy, h], i) => {
            const [sx, sy] = arc(c, 24, [176, 64], [176 + dx, 64 + dy], h);
            parts.push(<span key={`star${i}`} className="absolute" style={{ left: Math.round(sx) - 4, top: Math.round(sy) - 4, width: 8, height: 8, backgroundImage: `url(${B}/particles.png)`, backgroundPosition: '0 -24px' }} />);
          });
      }
      if (broke) {
        // Broken out: the ball opens and goes, the Pokémon grows back out where it was.
        const o = g - tOut;
        if (o < OPEN_FRAMES.anim) parts.push(<Ball key="catch-ball" item={item} frame={o < 5 ? 1 : 2} x={176} y={64} />);
        parts.push(<Burst key="catch-burst" item={item} f={o} x={176} y={59} />);
        const em = emerging(o);
        scale = em.scale;
        y2 = em.y2;
        flash = Math.max(flash, em.flash);
        tint = { color, level: em.tint };
      } else {
        parts.push(<Ball key="catch-ball" item={item} frame={frame} x={bx} y={by} rot={rot} dark={dark} />);
        if (g >= tOpen) parts.push(<Burst key="catch-burst" item={item} f={g - tOpen} x={176} y={19} />);
        // Drawn in: blended to the ball's colour (17 frames), the white flash, then shrinking up into the ball (28 frames).
        const o = g - tOpen;
        if (o >= 0) {
          flash = Math.max(flash, o < 17 ? o : o < 34 ? 34 - o : 0);
          tint = { color, level: clamp(o, 0, 16) };
        }
        const s = g - tShrink - 1;
        if (s >= 0) {
          const k = clamp(s / 28, 0, 1);
          scale = 256 / (256 + 0x20 * Math.min(28, s));
          y2 = (24 - y) * k;
        }
        if (g >= tClose) visible = false;
      }
      hbX = 0;
    }
    if (faint) {
      // Sinking into the floor: 8 pixels every 2 frames, cut off at its picture's bottom; then gone with its healthbox.
      const g = frames(faint.at);
      const steps = Math.floor(g / 2);
      if (steps > 8) visible = false;
      else parts.push(<Pic key="foe" src={monSrc(mon, 1)} x={x} y={y + steps * 8} clipBottom={y + 32} />);
      visible = false;
      hbX = null;
    }
    if (visible && scale > 0) parts.push(<Pic key={`foe${mon.uid}`} src={monSrc(mon, 1)} x={x} y={y + y2} scale={scale} tint={tint} anim={anim(1)} />);
    if (hbX !== null) healthboxes.push(<Healthbox key="hb1" mon={live(1, mon)} player={false} x={12} y={14} style={{ transform: `translateX(${hbX}px)` }} />);
  }

  // ---- The player's side ----
  const meSend = sendOf(0);
  const backSheet = `${GEN1}/trainers/${gender === 'female' ? 'leaf' : 'red'}_back_sheet.png`;
  const throwF = meSend && opening(meSend.index) ? frames(meSend.at) : meSend ? Infinity : -1;
  if (throwF < PLAYER_SEND.slide) {
    // The back pic: in with the intro, then its throw (sheet frames 1, 2, 3, 4) as it slides off to the left.
    let x = 80 + off;
    let sheet = 0;
    if (throwF >= 0) {
      x = 80 - (120 * Math.min(throwF, PLAYER_SEND.slide)) / PLAYER_SEND.slide;
      sheet = throwF < 20 ? 1 : throwF < 26 ? 2 : throwF < 32 ? 3 : throwF < 56 ? 4 : 0;
      if (sheet === 2 || sheet === 3) x += 16;
    }
    parts.push(<span key="back" className="absolute" style={{ left: Math.round(x) - 32, top: 48, width: 64, height: 64, backgroundImage: `url(${backSheet})`, backgroundPosition: `0 ${-sheet * 64}px` }} />);
  }
  if (meSend) {
    const mon = meSend.mon;
    const y = meY(mon.species);
    const g = frames(meSend.at) - (opening(meSend.index) ? PLAYER_SEND.throwAt : 0);
    const faint = after(0, 'faint', meSend.index);
    const target: [number, number] = [72, Math.min(104, 88 + species(mon.species).pic.backY) + 24];
    if (g >= 0 && g < PLAYER_SEND.arc) parts.push(<Ball key="me-ball" item="poke-ball" frame={0} {...xy(arc(g, PLAYER_SEND.arc, [48, 70], target, 30))} />);
    const o = g - PLAYER_SEND.arc;
    if (o >= 0) {
      if (o < OPEN_FRAMES.anim) parts.push(<Ball key="me-ball" item="poke-ball" frame={o < 5 ? 1 : 2} x={target[0]} y={target[1]} />);
      parts.push(<Burst key="me-burst" item="poke-ball" f={o} x={target[0]} y={target[1] - 5} />);
      const em = emerging(o);
      flash = Math.max(flash, em.flash);
      const fy = faint ? Math.max(0, frames(faint.at)) * 5 : 0;
      if (y + fy - 32 < GAME_HEIGHT) parts.push(<Pic key={`me${mon.uid}`} src={monSrc(mon, 0)} x={72} y={y + em.y2 + fy} scale={em.scale} tint={{ color: rgb(BALL_COLOR['poke-ball']!), level: em.tint }} anim={anim(0)} />);
      const h = o - OPEN_FRAMES.emerge;
      if (!faint && h >= 0) healthboxes.push(<Healthbox key="hb0" mon={live(0, mon)} player exp={exp[mon.uid]} x={126} y={72} style={{ transform: `translateX(${115 - clamp(h * 5, 0, 115)}px)` }} />);
    }
  }

  return (
    <div className="pointer-events-none absolute left-0 top-0 overflow-hidden" style={{ width: GAME_WIDTH, height: GAME_HEIGHT }}>
      {/* The background: its top half in from the left, its bottom half from the right, inside the band opening. */}
      <div className="absolute inset-x-0" style={{ top: 80 - bandHalf, height: bandHalf * 2, overflow: 'hidden' }}>
        <div className="absolute inset-x-0" style={{ top: -(80 - bandHalf) }}>
          <div className="absolute left-0 top-0 overflow-hidden" style={{ width: GAME_WIDTH, height: 80 }}>
            <img src={background} alt="" className="absolute left-0 top-0 max-w-none" style={{ width: GAME_WIDTH, height: 112, transform: `translateX(${-off}px)` }} draggable={false} />
          </div>
          <div className="absolute left-0 overflow-hidden" style={{ top: 80, width: GAME_WIDTH, height: 32 }}>
            <img src={background} alt="" className="absolute left-0 max-w-none" style={{ top: -80, width: GAME_WIDTH, height: 112, transform: `translateX(${off}px)` }} draggable={false} />
          </div>
        </div>
      </div>
      {/* The flash: the background's palettes to white and back. */}
      {flash > 0 && <div className="absolute inset-x-0 top-0 bg-white" style={{ height: 112, opacity: flash / 16 }} />}
      {parts}
      {healthboxes}
    </div>
  );
}

const xy = ([x, y]: [number, number]) => ({ x, y });
