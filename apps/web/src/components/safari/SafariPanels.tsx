import CardGiftcardIcon from '@mui/icons-material/CardGiftcard';
import CloseIcon from '@mui/icons-material/Close';
import StorefrontIcon from '@mui/icons-material/Storefront';
import UpgradeIcon from '@mui/icons-material/Upgrade';
import { UPGRADES, type SafariAction } from '@poke-tcg/safari';
import { abilityName, abilityText, type TrainerName } from '@poke-tcg/safari/effects';
import type { ReactNode } from 'react';
import type { ClientSafari, SafariUnit, SafariViewData } from '../../hooks/useSafari';
import { commas } from '../../utils/math';
import { BUTTON, DIALOG, DIALOG_BACKDROP, ICON_BUTTON } from '../../utils/styles';
import { EnergyIcon } from '../EnergyIcon';
import { CARD } from './SafariBoard';
import { TrainerCard, UnitCard } from './UnitCard';
import { DIFFICULTY_COLOR, DIFFICULTY_LABEL, opponentSprite } from './safariArt';

type Act = (action: SafariAction) => void;
type Units = Map<string, SafariUnit>;
const START_BUTTON = `${BUTTON} !bg-yellow-300 !px-5 !py-1.5 font-bold !text-gray-900 hover:!bg-yellow-200`;

/**
 * A panel over the top of the table (the opponent's row, where nothing is under way between battles): the shop, the next
 * step's choices, an encounter. The player's board stays in sight and usable under it. `onClose` hides it (a button in the
 * table's bar brings it back).
 */
export function Overlay({ title, info, actions, children, onClose }: { title: ReactNode; info?: ReactNode; actions?: ReactNode; children: ReactNode; onClose?: () => void }) {
  return (
    <section className={`${DIALOG} absolute inset-x-2 top-2 z-30 mx-auto max-h-[calc(100%-1rem)] max-w-5xl space-y-2 overflow-y-auto p-3 shadow-2xl shadow-black/60`} data-keep-action>
      <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <h3 className="font-heading text-sm text-slate-50">{title}</h3>
        {info && <span className="text-xs text-slate-400">{info}</span>}
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          {actions}
          {onClose && (
            <button type="button" className={ICON_BUTTON} onClick={onClose} title="Hide">
              <CloseIcon fontSize="small" />
            </button>
          )}
        </div>
      </header>
      {children}
    </section>
  );
}

/** A dialog in the middle of the window, nothing else usable while it's open: the starter, a pick, the run's start and end. */
function CenterDialog({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`${DIALOG_BACKDROP} z-[1050]`}>
      <div className={`${DIALOG} max-h-full max-w-full space-y-3 overflow-y-auto p-4 ${className}`}>{children}</div>
    </div>
  );
}

/** The run's starter: 1 of 3 tier-1 Basics (issue #239, 6.1). */
/** A pick's card size: the shop's (`cardWidth`, the table's measured), else a size of its own. */
const pickWidth = (cardWidth: string | undefined) => cardWidth ?? 'clamp(6rem, 22vw, 9rem)';

export function StarterDialog({ view, units, busy, act, cardWidth }: { view: SafariViewData; units: Units; busy: boolean; act: Act; cardWidth?: string }) {
  return (
    <CenterDialog>
      <h3 className="font-heading text-lg text-slate-50">Pick your first Pokémon</h3>
      <p className="text-sm text-slate-300">It goes on your board. Shops open after every battle.</p>
      <div className="flex flex-wrap justify-center gap-3">
        {view.starters.map((id) => (
          <UnitCard key={id} id={id} unit={units.get(id)} width={pickWidth(cardWidth)} onClick={busy ? undefined : () => act({ type: 'PICK_STARTER', unit: id })} />
        ))}
      </div>
    </CenterDialog>
  );
}

/** The shop between battles: its cards, reroll, freeze and the shop tier (issue #239, section 7). */
/**
 * A shop's cards in one row whatever their number (the user's, 2026-11-18): each takes an equal share of the row, never
 * wider than the table's cards (CARD), so a big shop's cards shrink rather than wrap.
 */
function ShopRow({ children }: { children: ReactNode }) {
  return <div className="flex flex-nowrap justify-center gap-[clamp(0.25rem,1.2vw,0.75rem)]">{children}</div>;
}
/** One card of a ShopRow, with its Buy button under it (or a sold place). */
function ShopItem({ children, buy }: { children: ReactNode; buy?: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center gap-1" style={{ maxWidth: CARD }}>
      {children}
      {buy}
    </div>
  );
}
/** Its price only on a narrow screen ("Buy" from `sm` up), so it fits under a shrunk card. */
const BUY_BUTTON = `${BUTTON} !px-1.5 max-w-full truncate max-sm:!text-xs`;

export function ShopOverlay({ view, units, busy, act, onClose, onNext }: { view: SafariViewData; units: Units; busy: boolean; act: Act; onClose: () => void; onNext: () => void }) {
  const shop = view.shop;
  if (!shop) return null;
  const { prices } = view;
  return (
    <Overlay
      title={`Shop · tier ${view.shopTier}`}
      info={shop.frozen ? 'Frozen: these cards stay for the next shop.' : 'Buy cards with the run’s ₱.'}
      onClose={onClose}
      actions={
        <>
          <button type="button" className={BUTTON} disabled={busy || view.pokedollars < prices.reroll} onClick={() => act({ type: 'REROLL' })}>
            Reroll {prices.reroll ? `₱${prices.reroll}` : '(free)'}
          </button>
          <button type="button" className={`${BUTTON} ${shop.frozen ? '!bg-sky-400 !text-gray-900' : ''}`} disabled={busy} onClick={() => act({ type: 'FREEZE' })}>
            {shop.frozen ? 'Unfreeze' : 'Freeze'}
          </button>
          <button type="button" className={BUTTON} disabled={busy || prices.tier === null || view.pokedollars < prices.tier} onClick={() => act({ type: 'TIER_UP' })} title="Higher tiers show stronger cards">
            {prices.tier === null ? 'Top tier' : `Tier ${view.shopTier + 1}: ₱${prices.tier}`}
          </button>
          <button type="button" className={START_BUTTON} onClick={onNext}>
            Next battle →
          </button>
        </>
      }
    >
      <ShopRow>
        {shop.offers.map((id, i) =>
          id ? (
            <ShopItem
              key={i}
              buy={
                <button type="button" className={BUY_BUTTON} disabled={busy || view.pokedollars < (prices.shop[i] ?? 0)} onClick={() => act({ type: 'BUY', index: i })}>
                  <span className="hidden sm:inline">Buy </span>₱{prices.shop[i]}
                </button>
              }
            >
              <UnitCard id={id} unit={units.get(id)} width="100%" />
            </ShopItem>
          ) : (
            <ShopItem key={i}>
              <div className="flex w-full items-center justify-center rounded-lg border-2 border-dashed border-slate-600 text-xs text-slate-500" style={{ aspectRatio: '63 / 88' }}>
                Sold
              </div>
            </ShopItem>
          ),
        )}
      </ShopRow>
    </Overlay>
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
export function NextStepOverlay({ view, units, busy, act, onBack }: { view: SafariViewData; units: Units; busy: boolean; act: Act; onBack: () => void }) {
  const champion = view.opponents.some((o) => o.difficulty === 'champion');
  return (
    <Overlay
      title={champion ? 'The Champion' : 'Next'}
      info={champion ? 'Beat Blue to win the run and bank its ₱.' : view.opponents.length ? 'Choose who to battle. Their board shows once chosen.' : 'An encounter step: no battle.'}
      actions={
        view.shop && (
          <button type="button" className={BUTTON} onClick={onBack}>
            ← Back to the shop
          </button>
        )
      }
    >
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {view.opponents.map((o, i) => {
          const sprite = opponentSprite(o);
          return (
            <button key={i} type="button" disabled={busy} onClick={() => act({ type: 'CHOOSE', index: i })} className="flex items-center gap-3 rounded-lg bg-slate-900 p-2 text-left ring-1 ring-slate-600 transition hover:bg-slate-700 active:scale-[0.98] disabled:opacity-40">
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
            {e.legendary ? <UnitCard id={e.legendary} unit={units.get(e.legendary)} width="3.5rem" /> : <span className="flex h-16 w-12 shrink-0 items-center justify-center text-emerald-300">{e.kind === 'upgrade' ? <UpgradeIcon fontSize="large" /> : e.kind === 'specialShop' ? <StorefrontIcon fontSize="large" /> : <CardGiftcardIcon fontSize="large" />}</span>}
            <div className="min-w-0">
              <div className="font-semibold text-slate-50">{e.legendary ? `Legendary: ${units.get(e.legendary)?.name ?? ''}` : ENCOUNTER_LABEL[e.kind]?.name}</div>
              <div className="text-xs text-slate-300">{ENCOUNTER_LABEL[e.kind]?.text}</div>
            </div>
          </button>
        ))}
      </div>
    </Overlay>
  );
}

/** What an upgrade does, in words. */
function upgradeText(u: NonNullable<Extract<NonNullable<SafariViewData['encounter']>, { kind: 'upgrade' }>>['upgrades'][number]): string {
  if (u.kind === 'rareCandy') return 'Rare Candy: it evolves now';
  if (u.kind === 'keyword') return `Learns ${abilityName(u.ability)}: ${abilityText(u.ability)}`;
  const boost = UPGRADES[u.kind];
  return `${boost.name}: ${boost.attack ? `+${boost.attack} attack` : `+${boost.hp} HP`}`;
}

/** An encounter under way (issue #239, 6.3): an upgrade, a gift or the special shop, and Leave. */
export function EncounterOverlay({ view, units, busy, act }: { view: SafariViewData; units: Units; busy: boolean; act: Act }) {
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
      <Overlay title="Upgrade" info="Pick one." actions={leave}>
        <div className="flex flex-wrap justify-center gap-3">
          {e.upgrades.map((u, i) => (
            <button key={i} type="button" disabled={busy} onClick={take(i)} className="flex w-64 items-center gap-2 rounded-lg bg-slate-900 p-2 text-left ring-1 ring-slate-600 hover:bg-slate-700 disabled:opacity-40">
              <UnitCard id={u.unit} unit={units.get(u.unit)} width="4rem" />
              <span className="text-sm text-slate-100">
                <span className="font-semibold">{units.get(u.unit)?.name}</span>
                <br />
                {upgradeText(u)}
              </span>
            </button>
          ))}
        </div>
      </Overlay>
    );
  if (e.kind === 'cardGift')
    return (
      <Overlay title="Card gift" info="Pick one, free." actions={leave}>
        <div className="flex flex-wrap justify-center gap-3">
          {e.cards.map((id, i) => (
            <UnitCard key={i} id={id} unit={units.get(id)} width={CARD} onClick={take(i)} />
          ))}
        </div>
      </Overlay>
    );
  if (e.kind === 'trainerGift')
    return (
      <Overlay title="Trainer gift" info="Pick one, free. Each is used up by one battle." actions={leave}>
        <div className="flex flex-wrap justify-center gap-3">
          {e.trainers.map((t, i) => (
            <TrainerCard key={i} trainer={t} width={CARD} onClick={take(i)} />
          ))}
        </div>
      </Overlay>
    );
  return (
    <Overlay title="Special shop" info="Buy as many as you like." actions={leave}>
      <ShopRow>
        {e.cards.map((id, i) =>
          id ? (
            <ShopItem
              key={i}
              buy={
                <button type="button" className={BUY_BUTTON} disabled={busy || view.pokedollars < (view.prices.special[i] ?? 0)} onClick={take(i)}>
                  <span className="hidden sm:inline">Buy </span>₱{view.prices.special[i]}
                </button>
              }
            >
              <UnitCard id={id} unit={units.get(id)} width="100%" />
            </ShopItem>
          ) : null,
        )}
        {e.trainers.map((t, j) =>
          t ? (
            <ShopItem
              key={`t${j}`}
              buy={
                <button type="button" className={BUY_BUTTON} disabled={busy || view.pokedollars < (view.prices.special[e.cards.length + j] ?? 0)} onClick={take(e.cards.length + j)}>
                  <span className="hidden sm:inline">Buy </span>₱{view.prices.special[e.cards.length + j]}
                </button>
              }
            >
              <TrainerCard trainer={t as TrainerName} width="100%" />
            </ShopItem>
          ) : null,
        )}
      </ShopRow>
    </Overlay>
  );
}

/** A merge's, golden copy's or Rare Candy's result: the player's pick (issue #239, 4). */
export function PickDialog({ view, units, busy, act, cardWidth }: { view: SafariViewData; units: Units; busy: boolean; act: Act; cardWidth?: string }) {
  const pick = view.pick;
  if (!pick) return null;
  const from = pick.from.map((id) => units.get(id)?.name ?? id).join(' + ');
  const title = pick.kind === 'golden' ? 'A golden copy!' : pick.kind === 'evolve' ? 'Rare Candy' : 'They merge!';
  return (
    <CenterDialog>
      <h3 className="font-heading text-lg text-slate-50">{title}</h3>
      <p className="text-sm text-slate-300">
        {from}: pick {pick.kind === 'golden' ? 'the print it becomes (+20 attack, +20 HP)' : 'the card it becomes'}.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        {pick.options.map((id) => (
          <UnitCard key={id} id={id} unit={units.get(id)} golden={pick.kind === 'golden'} width={pickWidth(cardWidth)} onClick={busy ? undefined : () => act({ type: 'PICK', unit: id })} />
        ))}
      </div>
    </CenterDialog>
  );
}

/** No run under way: the last run's result, if any, and a new run. */
export function RunOverDialog({ run, busy, onStart, onWatch }: { run: ClientSafari | null; busy: boolean; onStart: () => void; onWatch: () => void }) {
  const view = run?.view;
  return (
    <CenterDialog className="w-[32rem]">
      <h3 className="font-heading text-lg text-slate-50">{view ? (view.phase === 'won' ? 'You beat the Champion!' : 'Run over') : 'Welcome to the Safari Draft!'}</h3>
      <div className="space-y-3 text-sm text-slate-200">
        {view?.phase === 'won' && <p className="text-yellow-200">₱{commas(view.pokedollars)} went to your bank.</p>}
        {view?.phase === 'lost' && <p>{view.conceded ? 'You conceded the run.' : 'You ran out of HP.'} Nothing was banked.</p>}
        {!view && (
          <ul className="list-disc space-y-1 pl-5 text-slate-300">
            <li>Pick a starter, then buy Pokémon cards in the shop after every battle. Up to 6 fight on your board, 6 more wait in your inventory.</li>
            <li>Battles play themselves: each side attacks left to right, every attack at a random opposing Pokémon (a Taunt one first), which strikes back.</li>
            <li>Each Pokémon has its attack, its HP and its keywords, written on its card: most have 1, a few 2, only some legendaries 3. Many read where it stands: its neighbours are the Pokémon beside it, and the Pokémon across from it is the opponent&apos;s in the same place.</li>
            <li>2 of a Pokémon that evolve into the same card merge into it; 3 of a Pokémon with no evolutions make a golden copy. 2, 4 or 6 of a type give a synergy.</li>
            <li>15 battles, then Champion Blue, on 3 HP. Beat him to bank the run's ₱.</li>
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <button type="button" className={START_BUTTON} disabled={busy} onClick={onStart}>
            {view ? 'Start a new run' : 'Start a run'}
          </button>
          {view?.last && (
            <button type="button" className={BUTTON} onClick={onWatch}>
              Watch the last battle
            </button>
          )}
        </div>
      </div>
    </CenterDialog>
  );
}

