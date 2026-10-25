import { MAX_ENERGY, species, TRAINERS, type BattleEvent, type BattlerView, type StatusKind } from '@poke-tcg/idle';
import { useRef, type CSSProperties } from 'react';
import { useIsPhone } from '../../hooks/useIsPhone';
import type { BattleSegment } from '../../hooks/useIdle';
import { DialogueBox, dialogueKey, type Dialogue } from '../DialogueBox';

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

/** What the screen shows after the events played so far: each side's Pokémon, the line, a ball thrown, who was just hit. */
function shownState(events: BattleEvent[]) {
  const sides: [SideShown, SideShown] = [{ mon: null, fainted: false }, { mon: null, fainted: false }];
  let text: string | null = null;
  let ball: Extract<BattleEvent, { t: 'ball' }> | null = null;
  let ballAt = -1;
  let hit: { side: 0 | 1; at: number } | null = null;
  let attacker: { side: 0 | 1; at: number } | null = null;
  events.forEach((e, i) => {
    switch (e.t) {
      case 'send':
        sides[e.side] = { mon: { ...e.mon }, fainted: false };
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
      case 'energy': {
        const m = sides[e.side].mon;
        if (m) m.energy = e.energy;
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
    if ('msg' in e && e.msg) text = e.msg;
  });
  // A ball the Pokémon broke out of shows only until the battle goes on.
  if (ball && !(ball as Extract<BattleEvent, { t: 'ball' }>).caught && ballAt < events.length - 1) ball = null;
  return { sides, text, ball: ball as Extract<BattleEvent, { t: 'ball' }> | null, hit: hit as { side: 0 | 1; at: number } | null, attacker: attacker as { side: 0 | 1; at: number } | null };
}

/** An HP bar's colour (FireRed's: green over half, yellow over a fifth, red below). */
const hpColor = (hp: number, max: number) => (hp * 2 > max ? '#58d080' : hp * 5 > max ? '#f8c048' : '#f85838');

/** A healthbox (drawn here, in FireRed's colours): name, gender, level, status, the HP bar, the player's HP numbers, and the energy pips. */
function Healthbox({ mon, player, style }: { mon: BattlerView; player: boolean; style: CSSProperties }) {
  const s = species(mon.species);
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
        <div className="text-right font-semibold leading-none" style={{ fontSize: px(8), marginTop: px(1) }}>
          {mon.hp}/{mon.maxHp}
        </div>
      )}
      {/* The energy (the mode's one addition to the screen): a pip for each, up to the most it can hold. */}
      <div className="mt-[0.5cqw] flex items-center gap-[0.4cqw]" title={`Energy: ${mon.energy}`}>
        {Array.from({ length: MAX_ENERGY }, (_, i) => (
          <span key={i} className="rounded-full" style={{ width: px(4), height: px(4), background: i < mon.energy ? '#38a8f8' : '#c8d0b0' }} />
        ))}
      </div>
    </div>
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
 * background, the foe's front sprite and the player's Pokémon's back, the healthboxes, the text box), the energy pips the
 * one addition; showing the first `shown` of the battle's events; `dialogue` over it in the scenes' text box (the
 * catch-up's pages, if a battle starts before they're read).
 */
export function BattleScreen({ battle, shown, gender, dialogue }: { battle: BattleSegment; shown: number; gender: 'male' | 'female'; dialogue?: Dialogue | null }) {
  const phone = useIsPhone();
  const pressDialogue = useRef<(() => void) | null>(null);
  const { sides, text, ball, hit, attacker } = shownState(battle.events.slice(0, shown));
  const [me, foe] = sides;
  const trainer = battle.trainer ? TRAINERS[battle.trainer] : null;
  const blink = (side: 0 | 1) => (hit && hit.side === side && hit.at >= shown - 2 ? 'idle-hit 0.5s steps(2) 2' : undefined);
  const lunge = (side: 0 | 1) => (attacker && attacker.side === side && attacker.at >= shown - 2 ? `idle-lunge-${side} 0.3s ease-out` : undefined);
  return (
    <div className="relative mx-auto aspect-[3/2] w-full max-w-[720px] overflow-hidden rounded-lg bg-black [container-type:inline-size] [image-rendering:pixelated]" onClick={() => pressDialogue.current?.()}>
      <img src={background(battle)} alt="" className="absolute left-0 top-0 w-full" style={{ height: px(112) }} draggable={false} />
      {/* The foe: its trainer before they send one out, then its Pokémon (or the ball it's caught in). */}
      {!foe.mon && trainer?.pic && <img src={`${GEN1}/trainers/${trainer.pic}.png`} alt="" className="absolute" style={{ left: px(144), top: px(8), width: px(64) }} draggable={false} />}
      {foe.mon && !foe.fainted && !ball && (
        <img
          key={`f${foe.mon.uid}`}
          src={`${GEN1}/pokemon/${foe.mon.shiny ? 'shiny/' : ''}front/${foe.mon.species}.png`}
          alt={species(foe.mon.species).name}
          className="absolute"
          style={{ left: px(144), top: px(10), width: px(64), animation: blink(1) ?? lunge(1) }}
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
          style={{ left: px(40), top: px(48), width: px(64), animation: blink(0) ?? lunge(0) }}
          draggable={false}
        />
      ) : (
        !me.mon && <img src={`${GEN1}/trainers/${gender === 'female' ? 'leaf' : 'red'}_back.png`} alt="" className="absolute" style={{ left: px(40), top: px(48), width: px(64) }} draggable={false} />
      )}
      {foe.mon && !foe.fainted && <Healthbox mon={foe.mon} player={false} style={{ left: px(13), top: px(16) }} />}
      {me.mon && !me.fainted && <Healthbox mon={me.mon} player style={{ left: px(126), top: px(66) }} />}
      {/* The text box: the latest line. */}
      <div className="absolute inset-x-0 bottom-0 border-t-[0.6cqw] border-[#c87028] bg-[#283848] text-white" style={{ height: px(48), padding: `${px(6)} ${px(10)}`, fontSize: px(10), lineHeight: 1.35 }}>
        {text}
      </div>
      {dialogue && <DialogueBox key={dialogueKey(dialogue)} dialogue={dialogue} pressRef={pressDialogue} phone={phone} />}
    </div>
  );
}
