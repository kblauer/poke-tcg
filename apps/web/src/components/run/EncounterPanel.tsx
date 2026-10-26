import { Link } from '@tanstack/react-router';
import type { RunControl, RunViewData } from '../../hooks/useRun';
import { isBossKind } from '@poke-tcg/campaign';
import { ENCOUNTER_STYLE, EncounterBadge } from './encounterIcons';
import { useIsPhone } from '../../hooks/useIsPhone';
import { useUnlocked } from '../../hooks/useUnlocked';
import { RunCard } from './RunCard';
import { WhosThatEvent } from './WhosThatEvent';
import { commas } from '../../utils/math';

const panel = 'space-y-4 rounded-lg bg-slate-800 p-5 ring-1 ring-slate-600';
const button = 'rounded bg-slate-600 px-4 py-2 font-semibold transition hover:bg-slate-500 active:scale-95 disabled:opacity-40';
const primary = 'rounded bg-blue-600 px-4 py-2 font-semibold transition hover:bg-blue-500 active:scale-95 disabled:opacity-40';

/**
 * The encounter being played: a battle to start or go back to, a shop, a gift, a trade, an event, a Pokémon
 * Center, or a battle's reward. Cards on offer that aren't unlocked yet are tagged NEW.
 */
export function EncounterPanel({ view, run }: { view: RunViewData; run: RunControl }) {
  const { isLocked } = useUnlocked();
  // On a phone the reward's and the free card's cards shrink to share one row, the card shop's two rows.
  const phone = useIsPhone();
  const e = view.encounter;
  if (!e) return null;
  const card = (id: string) => view.cards[id];
  /** NEW on a card the account hasn't unlocked (getting it unlocks it). */
  const newTag = (id: string) => {
    const def = card(id);
    return def && isLocked({ id, basicEnergy: def.kind === 'energy' && def.basic !== false }) ? 'NEW' : undefined;
  };
  const leave = (label: string) => (
    <button className={button} disabled={run.busy} onClick={() => run.send({ type: 'LEAVE' })}>
      {label}
    </button>
  );

  switch (e.kind) {
    case 'battle':
    case 'elite':
    case 'gymTrainer':
    case 'gymLeader':
    case 'eliteFour':
    case 'champion':
      return (
        <div className={panel}>
          <div className="flex items-center gap-3">
            <EncounterBadge kind={e.kind} size={40} />
            <h3 className="text-lg font-semibold">{e.trainer}</h3>
            <span className="text-sm text-slate-400">{ENCOUNTER_STYLE[e.kind].name}</span>
          </div>
          {e.kind === 'gymTrainer' && <p className="text-sm text-slate-300">One of the gym's trainers stands in your way. You can't skip them, and a loss costs 1 HP.</p>}
          {isBossKind(e.kind) && <p className="text-sm text-slate-300">A boss: if you lose, it costs 1 HP and you face them again.</p>}
          {e.kind === 'elite' && !e.accepted ? (
            <>
              <p className="text-sm text-slate-300">An Ace Trainer challenges you. They play like a gym leader, and pay far better if you win, but a loss still costs 1 HP.</p>
              <div className="flex gap-2">
                <button className={primary} disabled={run.busy} onClick={() => run.send({ type: 'ACCEPT' })}>
                  Battle
                </button>
                {leave('Walk away')}
              </div>
            </>
          ) : e.gameId ? (
            <Link to="/game/$gameId" params={{ gameId: e.gameId }} className={`${primary} inline-block`}>
              Continue the battle
            </Link>
          ) : (
            <p className="text-sm text-slate-400">Setting up the battle…</p>
          )}
        </div>
      );

    case 'reward':
      return (
        <div className={panel}>
          <h3 className="text-lg font-semibold">You beat {e.trainer}!</h3>
          <p className="text-sm text-slate-300">
            +₱{commas(e.pokedollars)} and +{e.exp} EXP. Choose a card to take with you:
          </p>
          <div className={phone ? 'flex gap-1' : 'flex flex-wrap gap-3'}>
            {e.offers.map((id, i) => (
              <RunCard key={i} def={card(id)} badge={newTag(id)} disabled={run.busy} onClick={() => run.send({ type: 'PICK', index: i })} fluid={phone} />
            ))}
          </div>
          {leave('Take nothing')}
        </div>
      );

    case 'gift':
      return (
        <div className={panel}>
          <div className="flex items-center gap-3">
            <EncounterBadge kind="gift" size={40} />
            <h3 className="text-lg font-semibold">Free card</h3>
          </div>
          <p className="text-sm text-slate-300">A collector has spares to give away. Take one:</p>
          <div className={phone ? 'flex gap-1' : 'flex flex-wrap gap-3'}>
            {e.offers.map((id, i) => (
              <RunCard key={i} def={card(id)} badge={newTag(id)} disabled={run.busy} onClick={() => run.send({ type: 'PICK', index: i })} fluid={phone} />
            ))}
          </div>
          {leave('Take nothing')}
        </div>
      );

    case 'shop':
      return (
        <div className={panel}>
          <div className="flex items-center gap-3">
            <EncounterBadge kind="shop" size={40} />
            <h3 className="text-lg font-semibold">Card shop</h3>
            <span className="ml-auto text-sm text-yellow-300">You have ₱{commas(view.pokedollars)}</span>
          </div>
          <div
            // Each card stretches to its column (not sized by its name), so all are the same size.
            className={phone ? 'grid gap-1' : 'flex flex-wrap gap-3'}
            style={phone ? { gridTemplateColumns: `repeat(${Math.ceil(e.stock.length / 2)}, minmax(0, 1fr))` } : undefined}
          >
            {e.stock.map((s, i) => (
              <RunCard
                key={i}
                fluid={phone}
                def={card(s.cardId)}
                badge={s.sold ? undefined : newTag(s.cardId)}
                disabled={run.busy || s.sold || view.pokedollars < s.price}
                onClick={() => run.send({ type: 'BUY', index: i })}
                footer={<span className={`text-sm font-semibold ${s.sold ? 'text-slate-500' : 'text-yellow-300'}`}>{s.sold ? 'Sold' : `₱${s.price}`}</span>}
              />
            ))}
          </div>
          {leave('Leave the shop')}
        </div>
      );

    case 'trade':
      return (
        <div className={panel}>
          <div className="flex items-center gap-3">
            <EncounterBadge kind="trade" size={40} />
            <h3 className="text-lg font-semibold">Card trade</h3>
          </div>
          <p className="text-sm text-slate-300">
            A trader wants one of your deck's {card(e.give)?.name ?? 'cards'} and offers {card(e.get)?.name ?? 'a card'} for it. It takes its place in your deck.
          </p>
          <div className="flex items-center gap-4">
            <RunCard def={card(e.give)} footer={<span className="text-xs text-rose-300">You give</span>} />
            <span className="text-2xl text-slate-500">⇄</span>
            <RunCard def={card(e.get)} badge={newTag(e.get)} footer={<span className="text-xs text-emerald-300">You get</span>} />
          </div>
          <div className="flex gap-2">
            <button className={primary} disabled={run.busy} onClick={() => run.send({ type: 'ACCEPT' })}>
              Trade
            </button>
            {leave('No thanks')}
          </div>
        </div>
      );

    case 'center':
      return (
        <div className={panel}>
          <div className="flex items-center gap-3">
            <EncounterBadge kind="center" size={40} />
            <h3 className="text-lg font-semibold">Pokémon Center</h3>
          </div>
          <p className="text-sm text-slate-300">Nurse Joy can restore 1 HP for ₱{e.price}.</p>
          <div className="flex gap-2">
            <button className={primary} disabled={run.busy || view.hp >= view.maxHp || view.pokedollars < e.price} onClick={() => run.send({ type: 'ACCEPT' })}>
              {view.hp >= view.maxHp ? 'Already at full HP' : `Heal for ₱${e.price}`}
            </button>
            {leave('Move on')}
          </div>
        </div>
      );

    case 'event':
      if (e.event.id === 'whosThat') return <WhosThatEvent view={view} run={run} />;
      return (
        <div className={panel}>
          <div className="flex items-center gap-3">
            <EncounterBadge kind="event" size={40} />
            <h3 className="text-lg font-semibold">{view.event?.title}</h3>
          </div>
          <p className="text-sm text-slate-300">{view.event?.text}</p>
          {e.event.id === 'bargain' && <RunCard def={card(e.event.cardId)} badge={newTag(e.event.cardId)} />}
          <div className="flex gap-2">
            <button className={primary} disabled={run.busy} onClick={() => run.send({ type: 'ACCEPT' })}>
              {view.event?.accept}
            </button>
            {e.event.id !== 'luckyFind' && leave('Walk away')}
          </div>
        </div>
      );
  }
}
