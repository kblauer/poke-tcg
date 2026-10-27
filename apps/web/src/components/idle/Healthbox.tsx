import { expForLevel, species, type BattlerView, type StatusKind } from '@poke-tcg/idle';
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { SMALL_GLYPHS, SMALL_WIDTHS } from './fontSmall';

/** The healthboxes' pictures (tools/idle/battle_interface.py). */
const B = '/idle/gen1/battle';
/** The {LV_2} symbol (the small font's extra symbol 5). */
const LV = 0x105;
/** The HP bar's 6 tiles, the EXP. bar's 8 (B_HEALTHBAR_NUM_TILES, B_EXPBAR_NUM_TILES). */
const HP_TILES = 6;
const EXP_TILES = 8;

/** A Pokémon's name as FireRed prints it: in capitals, "é" small, the apostrophe its own (FARFETCH’D). */
const caps = (name: string) => name.toUpperCase().replace(/É/g, 'é').replace(/'/g, '’');

/** A string's glyphs (charmap.txt), unknown characters left out. */
const glyphs = (s: string) => [...s].map((c) => SMALL_GLYPHS[c]).filter((g): g is number => g !== undefined);

/** Text in FireRed's small font (latin_small.png's 8x16 cells, each glyph as wide as SMALL_WIDTHS says), from x, y. */
function SmallText({ codes, x, y, font = 'font_small' }: { codes: number[]; x: number; y: number; font?: string }) {
  let cx = x;
  return (
    <>
      {codes.map((g, i) => {
        const at = cx;
        cx += SMALL_WIDTHS[g] ?? 5;
        return <span key={i} className="absolute" style={{ left: at, top: y, width: 8, height: 16, backgroundImage: `url(${B}/${font}.png)`, backgroundPosition: `${-(g % 32) * 8}px ${-Math.floor(g / 32) * 16}px` }} />;
      })}
    </>
  );
}

/** A window the game prints into, cut to the rows it copies (TextIntoHealthboxObject: from row 5 of its top tiles down). */
function Clip({ x0, x1, y0, y1, children }: { x0: number; x1: number; y0: number; y1: number; children: ReactNode }) {
  return (
    <div className="absolute overflow-hidden" style={{ left: x0, top: y0, width: x1 - x0, height: y1 - y0 }}>
      <div className="absolute" style={{ left: -x0, top: -y0 }}>
        {children}
      </div>
    </div>
  );
}

/** A bar's tiles (CalcBarFilledPixels): 8 pixels a tile up to the value's share, at least 1 while it's above 0. */
function filled(value: number, max: number, tiles: number): { pixels: number; perTile: number[] } {
  let n = max > 0 ? Math.floor((value * tiles * 8) / max) : 0;
  const perTile = Array<number>(tiles).fill(0);
  if (n === 0 && value > 0) return { pixels: 1, perTile: [1, ...perTile.slice(1)] };
  const pixels = n;
  for (let i = 0; i < tiles && n > 0; i++, n -= 8) perTile[i] = Math.min(8, n);
  return { pixels, perTile };
}

/**
 * A bar's value moving to `target` as the game moves it (CalcNewBarValue): 1 a frame, or a pixel a frame when the
 * maximum is less than the bar's pixels. From a new Pokémon (`key`), it starts where it is.
 */
function useBarValue(target: number, max: number, pixels: number, key: string): number {
  const [shown, setShown] = useState(target);
  const at = useRef({ key, value: target });
  if (at.current.key !== key) at.current = { key, value: target };
  useEffect(() => {
    if (at.current.value === target) return setShown(target);
    let frame = 0;
    const step = max < pixels ? max / pixels : 1;
    const tick = () => {
      const v = at.current.value;
      const next = v < target ? Math.min(target, v + step) : Math.max(target, v - step);
      at.current.value = next;
      setShown(Math.round(next));
      if (next !== target) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, max, pixels, key]);
  return at.current.key === key ? shown : target;
}

const STATUS: Record<StatusKind, string> = { sleep: 'slp', poison: 'psn', toxic: 'psn', burn: 'brn', paralysis: 'par', freeze: 'frz' };

/**
 * A single battle's healthbox, as FireRed draws it (battle_interface.c), in game pixels: its picture (two sprites,
 * the windows cleared), the name (with ♂/♀ but for a Nidoran named as its species) and level in the small font, the
 * status icon, the HP bar (its sprite: "HP" or, for the opponent's with a status, its left end, then 6 tiles, green
 * over half, yellow over a fifth, red), and the player's HP numbers and EXP. bar. Bars move a step a frame, as the
 * game's do. `x`, `y` the picture's top left on the screen (InitBattlerHealthboxCoords' centre less the sprite's
 * centre-to-corner: the player's 126,72, the opponent's 12,14).
 */
export function Healthbox({ mon, player, exp, x, y, style }: { mon: BattlerView; player: boolean; exp?: number; x: number; y: number; style?: CSSProperties }) {
  const s = species(mon.species);
  const hp = useBarValue(mon.hp, mon.maxHp, HP_TILES * 8, mon.uid);
  const from = expForLevel(s.growth, mon.level);
  const to = expForLevel(s.growth, mon.level + 1);
  // The EXP. bar's value: the EXP. into the level (empty at level 100).
  const expInto = mon.level >= 100 ? 0 : Math.max(0, Math.min(to - from, (exp ?? from) - from));
  const expShown = useBarValue(expInto, Math.max(1, to - from), EXP_TILES * 8, `${mon.uid}:${mon.level}`);
  const bar = filled(hp, mon.maxHp, HP_TILES);
  const color = bar.pixels > (HP_TILES * 8 * 50) / 100 ? 0 : bar.pixels > (HP_TILES * 8 * 20) / 100 ? 1 : 2;
  const expBar = filled(expShown, Math.max(1, to - from), EXP_TILES).perTile;
  const name = caps(s.name);
  const gender = mon.gender && !/♂|♀/.test(name) ? mon.gender : null;
  const lv = String(mon.level);
  const status = mon.status ? STATUS[mon.status] : null;
  // Where things are in the picture (the sprites' tiles: battle_interface.c's offsets).
  const L = player
    ? { name: [16, 72], level: [72, 96], bar: 32, status: [16, 24] }
    : { name: [8, 64], level: [64, 88], bar: 24, status: [8, 16] };
  const barY = 16;
  return (
    <div className="absolute" style={{ left: x, top: y, width: 128, height: player ? 64 : 32, ...style }}>
      <img src={`${B}/healthbox_${player ? 'player' : 'opponent'}.png`} alt="" className="absolute left-0 top-0" draggable={false} />
      <Clip x0={L.name[0]!} x1={L.name[1]!} y0={5} y1={16}>
        <SmallText codes={glyphs(name)} x={L.name[0]!} y={3} />
        {gender && <SmallText codes={glyphs(gender === 'male' ? '♂' : '♀')} x={L.name[0]! + glyphs(name).reduce((w, g) => w + (SMALL_WIDTHS[g] ?? 5), 0)} y={3} font={gender === 'male' ? 'font_small_male' : 'font_small_female'} />}
      </Clip>
      <Clip x0={L.level[0]!} x1={L.level[1]!} y0={5} y1={16}>
        <SmallText codes={[LV, ...glyphs(lv)]} x={L.level[0]! + 5 * (3 - lv.length)} y={3} />
      </Clip>
      {/* The HP bar: "HP" (or, the opponent's with a status, nothing and its left end), then the bar's 6 tiles. */}
      {player || !status ? (
        <span className="absolute" style={{ left: L.bar, top: barY, width: 16, height: 8, backgroundImage: `url(${B}/hp_text.png)` }} />
      ) : (
        <span className="absolute" style={{ left: L.bar + 8, top: barY, width: 8, height: 8, backgroundImage: `url(${B}/hp_left_border.png)` }} />
      )}
      {bar.perTile.map((n, i) => (
        <span key={i} className="absolute" style={{ left: L.bar + 16 + i * 8, top: barY, width: 8, height: 8, backgroundImage: `url(${B}/hp_bar.png)`, backgroundPosition: `${-n * 8}px ${-color * 8}px` }} />
      ))}
      {status && <img src={`${B}/status/${status}_${player ? 0 : 1}.png`} alt={status.toUpperCase()} className="absolute" style={{ left: L.status[0], top: L.status[1] }} draggable={false} />}
      {player && (
        <>
          {/* The HP numbers: the current right-aligned with its "/" (from 4 in its window at 56), the maximum (at 80). */}
          <Clip x0={56} x1={80} y0={21} y1={32}>
            <SmallText codes={glyphs(`${String(hp).padStart(3)}/`)} x={60} y={21} />
          </Clip>
          <Clip x0={80} x1={96} y0={21} y1={32}>
            <SmallText codes={glyphs(String(mon.maxHp).padStart(3))} x={80} y={21} />
          </Clip>
          {expBar.map((n, i) => (
            <span key={i} className="absolute" style={{ left: 32 + i * 8, top: 32, width: 8, height: 8, backgroundImage: `url(${B}/exp_bar.png)`, backgroundPosition: `${-n * 8}px 0` }} />
          ))}
        </>
      )}
    </div>
  );
}
