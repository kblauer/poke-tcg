import { cooldownTicks, expForLevel, moveData, species, TICK_MS, TRAINERS, type BattleEvent, type BattlerView, type StatusKind } from '@poke-tcg/idle';
import { useRef, type CSSProperties } from 'react';
import { useIsPhone } from '../../hooks/useIsPhone';
import { isReward, type BattleSegment } from '../../hooks/useIdle';
import { DialogueBox, dialogueKey, type Dialogue } from '../DialogueBox';
import { GAME_WIDTH, useGameScale } from './GameScreen';
import { MonIcon } from './PartyScreen';

/** One game pixel of FireRed's 240x160 screen, in the battle box's width (container query units). */
const px = (n: number) => `${(n * 100) / 240}cqw`;
const GEN1 = '/idle/gen1';

/** The battle background for a battle (battle_bg.c): a League room's or a gym's own, else the terrain under the player. */
function background(b: BattleSegment): string {
  if (['lorelei', 'bruno', 'agatha', 'lance', 'champion'].includes(b.scene)) return `${GEN1}/terrain/indoor_${b.scene}.png`;
  if (b.scene === 'leader' || (b.trainer?.startsWith('leader-') ?? false)) return `${GEN1}/terrain/indoor_leader.png`;
  if (b.scene === 'gym') return `${GEN1}/terrain/indoor_gym.png`;
  if (b.terrain === 'plain') return `${GEN1}/terrain/indoor_plain.png`;
  return `${GEN1}/terrain/${b.terrain}.png`;
}

/** The battle pictures fetched ahead (kept, so the browser keeps them decoded), by src, each with its decode. */
const preloaded = new Map<string, { img: HTMLImageElement; decoded: Promise<void> }>();

/**
 * Fetches a battle's pictures (the user's: no battle screen black while they load): its background, the trainer's pic,
 * both players' trainer backs, every Pokémon sent out (the foes' fronts, the party's backs, shiny or not). Resolves when
 * they're all decoded (or failed).
 */
export function preloadBattle(b: BattleSegment): Promise<void> {
  const srcs = new Set<string>([background(b), `${GEN1}/trainers/red_back.png`, `${GEN1}/trainers/leaf_back.png`]);
  const pic = b.trainer ? TRAINERS[b.trainer]?.pic : null;
  if (pic) srcs.add(`${GEN1}/trainers/${pic}.png`);
  for (const e of b.events) if (e.t === 'send') srcs.add(`${GEN1}/pokemon/${e.mon.shiny ? 'shiny/' : ''}${e.side ? 'front' : 'back'}/${e.mon.species}.png`);
  return Promise.all(
    [...srcs].map((src) => {
      let p = preloaded.get(src);
      if (!p) {
        const img = Object.assign(new Image(), { src });
        p = { img, decoded: img.decode().catch(() => {}) };
        preloaded.set(src, p);
      }
      return p.decoded;
    }),
  ).then(() => {});
}

/** FireRed's status labels. */
const STATUS: Record<StatusKind, { label: string; color: string }> = {
  sleep: { label: 'SLP', color: '#8c8c8c' },
  poison: { label: 'PSN', color: '#a040a0' },
  toxic: { label: 'PSN', color: '#a040a0' },
  burn: { label: 'BRN', color: '#e05030' },
  paralysis: { label: 'PAR', color: '#c8a800' },
  freeze: { label: 'FRZ', color: '#58b0e0' },
};

interface SideShown {
  mon: BattlerView | null;
  fainted: boolean;
}

/** One Pokémon's rewards in a run of them: the EXP. gained, the level it grew to, the moves it learned. */
interface Reward {
  uid: string;
  gained: number;
  level: number | null;
  learned: string[];
}

/** What the screen shows after the events played so far: each side's Pokémon, the line (or a run of rewards, all at once), a ball thrown, who was just hit. */
function shownState(events: BattleEvent[], party: BattleSegment['party']) {
  const sides: [SideShown, SideShown] = [{ mon: null, fainted: false }, { mon: null, fainted: false }];
  let text: string | null = null;
  let ball: Extract<BattleEvent, { t: 'ball' }> | null = null;
  let ballAt = -1;
  let hit: { side: 0 | 1; at: number } | null = null;
  let attacker: { side: 0 | 1; at: number } | null = null;
  let rewards: Reward[] = [];
  /** The latest line's event (a hit or an attacker since it is the one to animate). */
  let line = -1;
  // When each of the player's moves began its cooldown (the event it went up at, and the ticks it had), for the smooth
  // bars (MoveBars): a move used, Spite, or a Pokémon sent out still cooling down.
  const cooling: Record<string, { at: number; ticks: number }> = {};
  // Each party Pokémon's EXP. (for the EXP. bar): as the battle began, then each gain's new total.
  const exp: Record<string, number> = Object.fromEntries(party.map((m) => [m.uid, m.exp]));
  events.forEach((e, i) => {
    if (e.t === 'exp') exp[e.uid] = e.exp;
    // A run of rewards: each Pokémon's gathered (it starts over after any other line).
    if (isReward(e)) {
      if (i === 0 || !isReward(events[i - 1]!)) rewards = [];
      const uid = (e as { uid: string }).uid;
      let r = rewards.find((x) => x.uid === uid);
      if (!r) rewards.push((r = { uid, gained: 0, level: null, learned: [] }));
      if (e.t === 'exp') r.gained += e.gained;
      if (e.t === 'level') r.level = e.level;
      if (e.t === 'learn') r.learned.push(moveData(e.move).name);
    } else if ('msg' in e && e.msg) rewards = [];
    switch (e.t) {
      case 'send':
        sides[e.side] = { mon: { ...e.mon }, fainted: false };
        if (e.side === 0) {
          for (const k of Object.keys(cooling)) delete cooling[k];
          for (const [k, n] of Object.entries(e.mon.cooldowns)) cooling[k] = { at: i, ticks: n };
        }
        if (e.side === 1) ball = null;
        break;
      case 'hp': {
        const m = sides[e.side].mon;
        if (m) Object.assign(m, { hp: e.hp, maxHp: e.maxHp });
        if (e.delta < 0) hit = { side: e.side, at: i };
        break;
      }
      case 'status': {
        const m = sides[e.side].mon;
        if (m) m.status = e.status;
        break;
      }
      case 'cooldown': {
        const m = sides[e.side].mon;
        if (m && e.side === 0) {
          for (const [k, n] of Object.entries(e.cooldowns)) if (n > (m.cooldowns[k] ?? 0)) cooling[k] = { at: i, ticks: n };
          for (const k of Object.keys(cooling)) if (!e.cooldowns[k]) delete cooling[k];
        }
        if (m) m.cooldowns = e.cooldowns;
        break;
      }
      case 'faint':
        sides[e.side].fainted = true;
        break;
      case 'level': {
        const m = sides[0].mon;
        if (m && m.uid === e.uid) Object.assign(m, { level: e.level, hp: e.hp, maxHp: e.maxHp });
        break;
      }
      case 'move':
        attacker = { side: e.side, at: i };
        break;
      case 'ball':
        ball = e;
        ballAt = i;
        break;
    }
    if ('msg' in e && e.msg) {
      text = e.msg;
      line = i;
    }
  });
  // A ball the Pokémon broke out of shows only until the battle goes on.
  if (ball && !(ball as Extract<BattleEvent, { t: 'ball' }>).caught && ballAt < events.length - 1) ball = null;
  return { sides, text, line, rewards, exp, cooling, ball: ball as Extract<BattleEvent, { t: 'ball' }> | null, hit: hit as { side: 0 | 1; at: number } | null, attacker: attacker as { side: 0 | 1; at: number } | null };
}

/** An HP bar's colour (FireRed's: green over half, yellow over a fifth, red below). */
const hpColor = (hp: number, max: number) => (hp * 2 > max ? '#58d080' : hp * 5 > max ? '#f8c048' : '#f85838');

/** A healthbox (drawn here, in FireRed's colours): name, gender, level, status, the HP bar, the player's HP numbers. */
function Healthbox({ mon, player, exp, style }: { mon: BattlerView; player: boolean; exp?: number; style: CSSProperties }) {
  const s = species(mon.species);
  // The EXP. bar's fill: the EXP. gained toward the next level (full at level 100).
  const from = expForLevel(s.growth, mon.level);
  const to = expForLevel(s.growth, mon.level + 1);
  const toNext = mon.level >= 100 ? 1 : Math.min(1, Math.max(0, ((exp ?? from) - from) / (to - from)));
  const status = mon.status && STATUS[mon.status];
  return (
    <div className="absolute rounded-[0.6cqw] border-[0.4cqw] border-[#506858] bg-[#f8f8d8] text-[#404040] shadow-[0_0.5cqw_0_#285040]" style={{ ...style, width: px(player ? 104 : 100), padding: `${px(2)} ${px(4)}` }}>
      <div className="flex items-baseline justify-between font-semibold leading-none" style={{ fontSize: px(9) }}>
        <span className="truncate">
          {mon.shiny && <span className="text-[#e0a000]" title="Shiny">★</span>}
          {s.name}
          {mon.gender && <span style={{ color: mon.gender === 'male' ? '#4080f8' : '#f86860' }}>{mon.gender === 'male' ? '♂' : '♀'}</span>}
        </span>
        <span>Lv{mon.level}</span>
      </div>
      <div className="mt-[0.6cqw] flex items-center gap-[1cqw]">
        {status && (
          <span className="rounded-[0.4cqw] px-[0.6cqw] font-bold leading-none text-white" style={{ background: status.color, fontSize: px(6) }}>
            {status.label}
          </span>
        )}
        <span className="font-bold leading-none text-[#f8a000]" style={{ fontSize: px(6) }}>
          HP
        </span>
        <div className="h-[1.4cqw] flex-1 overflow-hidden rounded-full bg-[#506858]">
          <div className="h-full transition-[width] duration-500" style={{ width: `${(100 * mon.hp) / mon.maxHp}%`, background: hpColor(mon.hp, mon.maxHp) }} />
        </div>
      </div>
      {player && (
        <div className="flex justify-end" style={{ marginTop: px(1) }}>
          <span className="font-semibold leading-none" style={{ fontSize: px(8) }}>
            {mon.hp}/{mon.maxHp}
          </span>
        </div>
      )}
      {/* The player's EXP. bar, as FireRed's box has it: a dark green strip along its bottom, EXP in yellow, a striped
          track filling light blue (healthbox_singles_player.png, healthbox.pal). */}
      {player && (
        <div className="flex items-center" style={{ background: '#526a62', margin: `${px(2)} calc(-1 * ${px(4)}) calc(-1 * ${px(2)})`, padding: `${px(1)} ${px(4)}`, gap: px(3) }}>
          <span className="font-bold leading-none" style={{ color: '#ffe600', fontSize: px(6) }}>
            EXP
          </span>
          <div className="flex-1 overflow-hidden" style={{ height: px(2), background: `repeating-linear-gradient(90deg, #ded5b4 0 ${px(1)}, #c5bd73 ${px(1)} ${px(2)})` }}>
            <div className="h-full transition-[width] duration-500" style={{ width: `${toNext * 100}%`, background: '#41cdff' }} />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The player's Pokémon's attacks under the battle (the user's, 2026-10-25: the cooldown rule, a bar on each): its 3 slot
 * moves, each with a bar filling as a smooth timer over its cooldown (the user's: from the moment it went up, `cooling`,
 * over its ticks × TICK_MS, as the playback paces the ticks; full and lit when ready; cooldownTicks). Not the basic
 * move (the user's): it never cools down.
 */
function MoveBars({ mon, cooling }: { mon: BattlerView; cooling: Record<string, { at: number; ticks: number }> }) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {mon.slots.map((key, i) => {
        const total = cooldownTicks(key);
        const left = mon.cooldowns[key] ?? 0;
        const ready = left === 0;
        return (
          <div key={`${i}:${key}`} className={`rounded px-2 py-1 text-xs ring-1 ${ready ? 'bg-slate-700 ring-yellow-300/60' : 'bg-slate-800 ring-slate-600'}`} title={ready ? 'Ready' : `Ready in ${left} turn${left === 1 ? '' : 's'}`}>
            <div className="flex justify-between gap-2">
              <span className={`truncate ${ready ? 'text-slate-100' : 'text-slate-400'}`}>{moveData(key).name}</span>
              <span className="shrink-0 text-slate-400">{ready ? 'ready' : `${left}/${total}`}</span>
            </div>
            <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-900">
              {ready || !cooling[key] ? (
                <div className="h-full rounded-full" style={{ width: ready ? '100%' : `${((total - left) / total) * 100}%`, background: ready ? 'var(--color-yellow-300)' : 'var(--color-slate-400)' }} />
              ) : (
                // A timer from where it was when it went up (a Spite past the cooldown starts it empty), full as it's ready.
                <div
                  key={cooling[key].at}
                  className="h-full origin-left rounded-full"
                  style={{ background: 'var(--color-slate-400)', ['--from' as string]: Math.max(0, (total - cooling[key].ticks) / total), animation: `idle-cooldown ${cooling[key].ticks * TICK_MS}ms linear both` }}
                />
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** The ball button (the user's): a Poké Ball in the battle's top right corner, its own click (not the text box's). */
function BallButton({ disabled, title, onClick }: { disabled: boolean; title: string; onClick: () => void }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className="absolute rounded-full border-[0.5cqw] border-[#202020] shadow-[0_0.4cqw_0_rgba(0,0,0,0.4)] transition hover:scale-110 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:scale-100"
      style={{ right: px(6), top: px(6), width: px(20), height: px(20), background: 'linear-gradient(#e83030 0 44%, #202020 44% 56%, #f8f8f8 56%)' }}
    >
      <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border-[0.4cqw] border-[#202020] bg-[#f8f8f8]" style={{ width: px(7), height: px(7) }} />
    </button>
  );
}

/** A Poké Ball thrown at the wild Pokémon: it shakes as many times as the throw got, then breaks open or stays caught. */
function ThrownBall({ ball }: { ball: Extract<BattleEvent, { t: 'ball' }> }) {
  const color = ball.item === 'ultra-ball' ? '#383838' : ball.item === 'great-ball' ? '#3870e0' : ball.item === 'master-ball' ? '#9040c0' : '#e83030';
  return (
    <div
      className="absolute rounded-full border-[0.4cqw] border-[#202020]"
      style={{
        left: px(172),
        top: px(64),
        width: px(14),
        height: px(14),
        background: `linear-gradient(${color} 0 45%, #202020 45% 55%, #f8f8f8 55%)`,
        animation: ball.shakes ? `idle-ball-shake 0.5s ease-in-out ${Math.min(3, ball.shakes)}` : undefined,
      }}
    />
  );
}

/**
 * A battle as it plays (README: Idle Adventure): FireRed's layout at its 240x160 scale, sized to its box (the terrain
 * background, the foe's front sprite and the player's Pokémon's back, the healthboxes, the text box), and under it the
 * player's attacks with their cooldown bars (MoveBars); showing the first `shown` of the battle's events; `dialogue` over
 * it in the scenes' text box (the catch-up's pages, if a battle starts before they're read).
 */
export function BattleScreen({
  battle,
  shown,
  gender,
  dialogue,
  onThrow,
  throwing = false,
}: {
  battle: BattleSegment;
  shown: number;
  gender: 'male' | 'female';
  dialogue?: Dialogue | null;
  /** The ball button (the user's): the best ball next turn. */
  onThrow?: () => void;
  throwing?: boolean;
}) {
  const phone = useIsPhone();
  const pressDialogue = useRef<(() => void) | null>(null);
  // The game screen's size (the user's: the map's, FireRed's 240x160 at a whole number of device pixels a pixel: useGameScale).
  const { ref, scale } = useGameScale();
  const { sides, text, line, rewards, exp, cooling, ball, hit, attacker } = shownState(battle.events.slice(0, shown), battle.party);
  const speciesOf = (uid: string) => battle.party.find((m) => m.uid === uid)?.species ?? 0;
  // Where FireRed draws them (GetBattlerSpriteFinal_Y): the foe's centre at 176,40, the player's at 72,80, each 64x64
  // picture lowered by its species' y_offset (the foe raised by its elevation).
  const foeTop = (id: number) => 8 + species(id).pic.frontY - species(id).pic.elevation;
  const meTop = (id: number) => 48 + species(id).pic.backY;
  const [me, foe] = sides;
  const trainer = battle.trainer ? TRAINERS[battle.trainer] : null;
  // Animated while their line is the latest: an attacker lunges with its "used" line, the one hit blinks as the hit lands.
  const blink = (side: 0 | 1) => (hit && hit.side === side && hit.at >= line ? 'idle-hit 0.5s steps(2) 2' : undefined);
  const lunge = (side: 0 | 1) => (attacker && attacker.side === side && attacker.at >= line ? `idle-lunge-${side} 0.3s ease-out` : undefined);
  return (
    <div ref={ref} className="w-full">
    <div className="mx-auto space-y-2" style={{ width: scale ? GAME_WIDTH * scale : '100%' }}>
    <div className="relative aspect-[3/2] w-full overflow-hidden rounded-lg bg-black [container-type:inline-size] [image-rendering:pixelated]" onClick={() => pressDialogue.current?.()}>
      <img src={background(battle)} alt="" className="absolute left-0 top-0 w-full" style={{ height: px(112) }} draggable={false} />
      {/* The foe: its trainer before they send one out, then its Pokémon (or the ball it's caught in). */}
      {!foe.mon && trainer?.pic && <img src={`${GEN1}/trainers/${trainer.pic}.png`} alt="" className="absolute" style={{ left: px(144), top: px(8), width: px(64) }} draggable={false} />}
      {foe.mon && !foe.fainted && !ball && (
        <img
          key={`f${foe.mon.uid}`}
          src={`${GEN1}/pokemon/${foe.mon.shiny ? 'shiny/' : ''}front/${foe.mon.species}.png`}
          alt={species(foe.mon.species).name}
          className="absolute"
          style={{ left: px(144), top: px(foeTop(foe.mon.species)), width: px(64), animation: blink(1) ?? lunge(1) }}
          draggable={false}
        />
      )}
      {ball && <ThrownBall key={`b${shown}`} ball={ball} />}
      {/* The player's Pokémon, from behind (Red or Leaf before it's out). */}
      {me.mon && !me.fainted ? (
        <img
          key={`p${me.mon.uid}`}
          src={`${GEN1}/pokemon/${me.mon.shiny ? 'shiny/' : ''}back/${me.mon.species}.png`}
          alt={species(me.mon.species).name}
          className="absolute"
          style={{ left: px(40), top: px(meTop(me.mon.species)), width: px(64), animation: blink(0) ?? lunge(0) }}
          draggable={false}
        />
      ) : (
        !me.mon && <img src={`${GEN1}/trainers/${gender === 'female' ? 'leaf' : 'red'}_back.png`} alt="" className="absolute" style={{ left: px(40), top: px(48), width: px(64) }} draggable={false} />
      )}
      {foe.mon && !foe.fainted && <Healthbox mon={foe.mon} player={false} style={{ left: px(13), top: px(16) }} />}
      {/* Just above the text box (the user's: a tiny gap), however tall the box is. */}
      {me.mon && !me.fainted && <Healthbox mon={me.mon} player exp={exp[me.mon.uid]} style={{ left: px(126), bottom: px(51) }} />}
      {/* The text box: the latest line, or a run of rewards all at once (the user's), growing upward to hold them. */}
      <div className="absolute inset-x-0 bottom-0 border-t-[0.6cqw] border-[#c87028] bg-[#283848] text-white" style={{ minHeight: px(48), padding: `${px(6)} ${px(10)}`, fontSize: px(10), lineHeight: 1.35 }}>
        {rewards.length ? (
          <ul className="grid grid-cols-2 gap-x-[3cqw]">
            {rewards.map((r) => (
              <li key={r.uid} className="flex items-center gap-[1cqw]">
                <MonIcon id={speciesOf(r.uid)} className="-my-[1cqw]" />
                <span>
                  {species(speciesOf(r.uid)).name} +{r.gained} EXP.
                  {r.level !== null && <span className="text-[#f8d030]"> Lv. {r.level}!</span>}
                  {r.learned.length > 0 && <span className="text-[#88d8f8]"> Learned {r.learned.join(', ')}!</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          text
        )}
      </div>
      {/* The ball button (the user's): the best ball in the bag next turn, a wild battle's; over until the battle's over. */}
      {onThrow && (
        <BallButton
          disabled={battle.kind !== 'wild' || throwing || shown >= battle.events.length}
          title={battle.kind !== 'wild' ? "You can't catch a trainer's Pokémon" : throwing ? 'Throwing a ball next turn…' : 'Throw the best Poké Ball next turn'}
          onClick={onThrow}
        />
      )}
      {dialogue && <DialogueBox key={dialogueKey(dialogue)} dialogue={dialogue} pressRef={pressDialogue} phone={phone} />}
    </div>
    {/* The row kept while no Pokémon is out (the trainer's send-out), so the page doesn't jump. */}
    <div className={me.mon && !me.fainted ? '' : 'invisible'}>{me.mon && <MoveBars mon={me.mon} cooling={cooling} />}</div>
    </div>
    </div>
  );
}
