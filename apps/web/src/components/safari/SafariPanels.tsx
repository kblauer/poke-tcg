import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import StorefrontIcon from '@mui/icons-material/Storefront';
import UpgradeIcon from '@mui/icons-material/Upgrade';
import { UPGRADES, type SafariAction } from '@poke-tcg/safari';
import { KEYWORDS, TRAINERS, type TrainerName } from '@poke-tcg/safari/effects';
import type { ReactNode } from 'react';
import type { SafariUnit, SafariViewData } from '../../hooks/useSafari';
import { BUTTON, DIALOG, DIALOG_BACKDROP } from '../../utils/styles';
import { EnergyIcon } from '../EnergyIcon';
import { TrainerCard, UnitCard } from './UnitCard';
import { DIFFICULTY_COLOR, DIFFICULTY_LABEL, opponentSprite } from './safariArt';
import { SynergyChips } from './SafariBoard';

type Act = (action: SafariAction) => void;
type Units = Map<string, SafariUnit>;

/** A panel on the Safari Zone's map: dark enough to read over it in every theme. */
export function Panel({ title, info, children, actions }: { title: ReactNode; info?: ReactNode; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-2 rounded-lg bg-slate-900/90 p-3 ring-1 ring-slate-600 backdrop-blur-sm">
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-heading text-sm text-slate-50">{title}</h3>
        {info && <span className="text-xs text-slate-400">{info}</span>}
        {actions && <div className="ml-auto flex flex-wrap items-center gap-1.5">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

/** The run's starter: 1 of 3 tier-1 Basics (issue #239, 6.1). */
export function StarterPanel({ view, units, cardWidth, busy, act }: { view: SafariViewData; units: Units; cardWidth: string; busy: boolean; act: Act }) {
  return (
    <Panel title="Pick your first Pokémon" info="It goes on your board. Shops open after every battle.">
      <div className="flex flex-wrap gap-3">
        {view.starters.map((id) => (
          <UnitCard key={id} id={id} unit={units.get(id)} width={cardWidth} onClick={busy ? undefined : () => act({ type: 'PICK_STARTER', unit: id })} />
        ))}
      </div>
    </Panel>
  );
}

/** The shop between battles: its cards, reroll, freeze and the shop tier (issue #239, section 7). */
export function ShopPanel({ view, units, cardWidth, busy, act, open }: { view: SafariViewData; units: Units; cardWidth: string; busy: boolean; act: Act; open: boolean }) {
  const shop = view.shop;
  if (!shop) return null;
  const { prices } = view;
  return (
    <Panel
      title={`Shop · tier ${view.shopTier}`}
      info={shop.frozen ? 'Frozen: these cards stay for the next shop.' : open ? 'Buy cards with the run’s ₱.' : 'Closed until the battle is over.'}
      actions={
        <>
          <button type="button" className={BUTTON} disabled={!open || busy || view.pokedollars < prices.reroll} onClick={() => act({ type: 'REROLL' })}>
            Reroll {prices.reroll ? `₱${prices.reroll}` : '(free)'}
          </button>
          <button type="button" className={`${BUTTON} ${shop.frozen ? '!bg-sky-400 !text-gray-900' : ''}`} disabled={!open || busy} onClick={() => act({ type: 'FREEZE' })}>
            {shop.frozen ? 'Unfreeze' : 'Freeze'}
          </button>
          <button type="button" className={BUTTON} disabled={!open || busy || prices.tier === null || view.pokedollars < prices.tier} onClick={() => act({ type: 'TIER_UP' })} title="Higher tiers show stronger cards">
            {prices.tier === null ? 'Top tier' : `Tier ${view.shopTier + 1}: ₱${prices.tier}`}
          </button>
        </>
      }
    >
      <div className="flex flex-wrap gap-3">
        {shop.offers.map((id, i) =>
          id ? (
            <div key={i} className="flex flex-col items-center gap-1">
              <UnitCard id={id} unit={units.get(id)} width={cardWidth} />
              <button type="button" className={BUTTON} disabled={!open || busy || view.pokedollars < (prices.shop[i] ?? 0)} onClick={() => act({ type: 'BUY', index: i })}>
                Buy ₱{prices.shop[i]}
              </button>
            </div>
          ) : (
            <div key={i} className="flex items-center justify-center rounded-lg text-xs text-slate-500 ring-1 ring-dashed ring-slate-600" style={{ width: cardWidth, aspectRatio: '63 / 88' }}>
              Sold
            </div>
          ),
        )}
      </div>
    </Panel>
  );
}

const ENCOUNTER_LABEL: Record<string, { name: string; text: string }> = {
  upgrade: { name: 'Upgrade', text: 'Improve one of your Pokémon.' },
  cardGift: { name: 'Card gift', text: 'Pick 1 of 3 Pokémon cards, free.' },
  trainerGift: { name: 'Trainer gift', text: 'Pick 1 of 3 Trainer cards, free.' },
  specialShop: { name: 'Special shop', text: 'Stronger cards and Trainer cards for sale.' },
  legendary: { name: 'Legendary', text: 'Battle a hard board: win and the legendary joins you.' },
};

/**
 * The step's choices: its opponents (their trainer, type, difficulty and pay, never their boards: issue #239, 6.2) and
 * its encounters. Picking an opponent shows their board; it can't be undone.
 */
export function NextStepPanel({ view, units, busy, act }: { view: SafariViewData; units: Units; busy: boolean; act: Act }) {
  const champion = view.opponents.some((o) => o.difficulty === 'champion');
  return (
    <Panel title={champion ? 'The Champion' : 'Next'} info={champion ? 'Beat Blue to win the run and bank its ₱.' : view.opponents.length ? 'Choose who to battle. Their board shows once chosen.' : 'An encounter step: no battle.'}>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {view.opponents.map((o, i) => {
          const sprite = opponentSprite(o);
          return (
            <button key={i} type="button" disabled={busy} onClick={() => act({ type: 'CHOOSE', index: i })} className="flex items-center gap-3 rounded-lg bg-slate-800 p-2 text-left ring-1 ring-slate-600 transition hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40">
              {sprite && <img src={sprite} alt="" className="h-16 w-16 shrink-0 [image-rendering:pixelated]" />}
              <div className="min-w-0 space-y-1">
                <div className="truncate font-semibold text-slate-50">{o.name}</div>
                <div className="flex flex-wrap items-center gap-1.5 text-xs">
                  <EnergyIcon type={o.type} size="xs" />
                  <span className={`rounded px-1.5 font-bold text-gray-900 ${DIFFICULTY_COLOR[o.difficulty]}`}>{DIFFICULTY_LABEL[o.difficulty]}</span>
                  {o.pay > 0 && <span className="text-yellow-200">₱{o.pay}</span>}
                </div>
              </div>
            </button>
          );
        })}
        {view.encounters.map((e, i) => (
          <button key={`e${i}`} type="button" disabled={busy} onClick={() => act({ type: 'ENCOUNTER', index: i })} className="flex items-center gap-3 rounded-lg bg-emerald-950/80 p-2 text-left ring-1 ring-emerald-700 transition hover:bg-emerald-900 active:scale-[0.98] disabled:opacity-40">
            {e.legendary ? <UnitCard id={e.legendary} unit={units.get(e.legendary)} width="3rem" /> : <span className="flex h-16 w-12 shrink-0 items-center justify-center text-emerald-300">{e.kind === 'upgrade' ? <UpgradeIcon fontSize="large" /> : e.kind === 'specialShop' ? <StorefrontIcon fontSize="large" /> : <CardGiftcardIcon fontSize="large" />}</span>}
            <div className="min-w-0">
              <div className="font-semibold text-slate-50">{e.legendary ? `Legendary: ${units.get(e.legendary)?.name ?? ''}` : ENCOUNTER_LABEL[e.kind]?.name}</div>
              <div className="text-xs text-slate-300">{ENCOUNTER_LABEL[e.kind]?.text}</div>
            </div>
          </button>
        ))}
      </div>
    </Panel>
  );
}

/** An opponent chosen: their board and Trainer, and Start battle. The player can still reorder their board and pick their Trainer. */
export function ReadyPanel({ view, units, cardWidth, busy, act }: { view: SafariViewData; units: Units; cardWidth: string; busy: boolean; act: Act }) {
  const o = view.opponent;
  if (!o) return null;
  const sprite = opponentSprite(o);
  const empty = !view.board.some((c) => c?.kind === 'pokemon');
  return (
    <Panel
      title={`Battle: ${o.name}`}
      info={`${DIFFICULTY_LABEL[o.difficulty]}${o.pay ? ` · ₱${o.pay} for a win` : ''}${o.difficulty === 'legendary' ? ` · win and ${units.get(o.board[0]!)?.name ?? 'it'} joins your team` : ''}`}
      actions={
        <button type="button" className={`${BUTTON} !bg-yellow-300 !px-5 !py-1.5 font-bold !text-gray-900 hover:!bg-yellow-200`} disabled={busy || empty} onClick={() => act({ type: 'BATTLE' })}>
          Start battle
        </button>
      }
    >
      <div className="flex flex-wrap items-start gap-3">
        {sprite && <img src={sprite} alt="" className="h-20 w-20 [image-rendering:pixelated]" />}
        <div className="flex flex-wrap gap-2">
          {o.board.map((id, i) => (
            <UnitCard key={i} id={id} unit={units.get(id)} width={cardWidth} />
          ))}
        </div>
        {o.trainer && <TrainerCard trainer={o.trainer} width={cardWidth} />}
      </div>
      <SynergyChips types={o.board.map((id) => units.get(id)?.type ?? '')} />
      <p className="text-xs text-slate-300">Reorder your board or pick your Trainer card below before starting. {empty && 'Put a Pokémon on your board first.'}</p>
    </Panel>
  );
}

/** What an upgrade does, in words. */
function upgradeText(u: NonNullable<Extract<NonNullable<SafariViewData['encounter']>, { kind: 'upgrade' }>>['upgrades'][number]): string {
  if (u.kind === 'rareCandy') return 'Rare Candy: it evolves now';
  if (u.kind === 'keyword') return `Learns ${u.keyword}: ${KEYWORDS[u.keyword]?.text ?? ''}`;
  const boost = UPGRADES[u.kind];
  return `${boost.name}: ${boost.attack ? `+${boost.attack} attack` : `+${boost.hp} HP`}`;
}

/** An encounter under way (issue #239, 6.3): an upgrade, a gift or the special shop, and Leave. */
export function EncounterPanel({ view, units, cardWidth, busy, act }: { view: SafariViewData; units: Units; cardWidth: string; busy: boolean; act: Act }) {
  const e = view.encounter;
  if (!e) return null;
  const take = (index: number) => (busy ? undefined : () => act({ type: 'TAKE', index }));
  const leave = (
    <button type="button" className={BUTTON} disabled={busy} onClick={() => act({ type: 'LEAVE' })}>
      {e.kind === 'specialShop' ? 'Leave the shop' : 'Take nothing'}
    </button>
  );
  if (e.kind === 'upgrade')
    return (
      <Panel title="Upgrade" info="Pick one." actions={leave}>
        <div className="flex flex-wrap gap-3">
          {e.upgrades.map((u, i) => (
            <button key={i} type="button" disabled={busy} onClick={take(i)} className="flex w-64 items-center gap-2 rounded-lg bg-slate-800 p-2 text-left ring-1 ring-slate-600 hover:bg-slate-700 disabled:opacity-40">
              <UnitCard id={u.unit} unit={units.get(u.unit)} width="3.5rem" />
              <span className="text-sm text-slate-100">
                <span className="font-semibold">{units.get(u.unit)?.name}</span>
                <br />
                {upgradeText(u)}
              </span>
            </button>
          ))}
        </div>
      </Panel>
    );
  if (e.kind === 'cardGift')
    return (
      <Panel title="Card gift" info="Pick one, free." actions={leave}>
        <div className="flex flex-wrap gap-3">
          {e.cards.map((id, i) => (
            <UnitCard key={i} id={id} unit={units.get(id)} width={cardWidth} onClick={take(i)} />
          ))}
        </div>
      </Panel>
    );
  if (e.kind === 'trainerGift')
    return (
      <Panel title="Trainer gift" info="Pick one, free. Each is used up by one battle." actions={leave}>
        <div className="flex flex-wrap gap-3">
          {e.trainers.map((t, i) => (
            <TrainerChoice key={i} trainer={t} width={cardWidth} onClick={take(i)} />
          ))}
        </div>
      </Panel>
    );
  return (
    <Panel title="Special shop" info="Buy as many as you like." actions={leave}>
      <div className="flex flex-wrap gap-3">
        {e.cards.map((id, i) =>
          id ? (
            <div key={i} className="flex flex-col items-center gap-1">
              <UnitCard id={id} unit={units.get(id)} width={cardWidth} />
              <button type="button" className={BUTTON} disabled={busy || view.pokedollars < (view.prices.special[i] ?? 0)} onClick={take(i)}>
                Buy ₱{view.prices.special[i]}
              </button>
            </div>
          ) : null,
        )}
        {e.trainers.map((t, j) =>
          t ? (
            <div key={`t${j}`} className="flex flex-col items-center gap-1">
              <TrainerChoice trainer={t} width={cardWidth} />
              <button type="button" className={BUTTON} disabled={busy || view.pokedollars < (view.prices.special[e.cards.length + j] ?? 0)} onClick={take(e.cards.length + j)}>
                Buy ₱{view.prices.special[e.cards.length + j]}
              </button>
            </div>
          ) : null,
        )}
      </div>
    </Panel>
  );
}

function TrainerChoice({ trainer, width, onClick }: { trainer: TrainerName; width: string; onClick?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-1" style={{ width: `calc(${width} + 2rem)` }}>
      <TrainerCard trainer={trainer} width={width} onClick={onClick} />
      <p className="text-center text-[11px] leading-tight text-slate-300">{TRAINERS[trainer]}</p>
    </div>
  );
}

/** A merge's, golden copy's or Rare Candy's result: the player's pick (issue #239, 4). */
export function PickDialog({ view, units, cardWidth, busy, act }: { view: SafariViewData; units: Units; cardWidth: string; busy: boolean; act: Act }) {
  const pick = view.pick;
  if (!pick) return null;
  const from = pick.from.map((id) => units.get(id)?.name ?? id).join(' + ');
  const title = pick.kind === 'golden' ? 'A golden copy!' : pick.kind === 'evolve' ? 'Rare Candy' : 'They merge!';
  return (
    <div className={`${DIALOG_BACKDROP} z-[1050]`}>
      <div className={`${DIALOG} max-w-full space-y-3 p-4`}>
        <h3 className="font-heading text-lg text-slate-50">{title}</h3>
        <p className="text-sm text-slate-300">
          {from}: pick {pick.kind === 'golden' ? 'the print it becomes (+20 attack, +20 HP)' : 'the card it becomes'}.
        </p>
        <div className="flex flex-wrap justify-center gap-3">
          {pick.options.map((id) => (
            <UnitCard key={id} id={id} unit={units.get(id)} golden={pick.kind === 'golden'} width={cardWidth} onClick={busy ? undefined : () => act({ type: 'PICK', unit: id })} />
          ))}
        </div>
      </div>
    </div>
  );
}
