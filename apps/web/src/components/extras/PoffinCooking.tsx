import { BERRIES, FLAVORS, poffinBerry, poffinName } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTRPC } from '../../lib/trpc';
import { BUTTON } from '../../utils/styles';
import { BerryIcon, berryName } from './BerryIcon';
import { PoffinScreen } from './PoffinScreen';

/** A Poffin's sprite (Platinum's, in its type's colours: public/extras/poffin/poffins.png, 64px a type), drawn crisp at `size`. */
function PoffinIcon({ type, size = 32 }: { type: number; size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block shrink-0 [image-rendering:pixelated]"
      style={{ width: size, height: size, backgroundImage: 'url(/extras/poffin/poffins.png)', backgroundSize: `${29 * size}px ${size}px`, backgroundPosition: `${-type * size}px 0` }}
    />
  );
}

/** A berry's flavours as Platinum has them for Poffins (they differ from Gen 3's for half the berries). */
function Flavors({ berry }: { berry: string }) {
  const { flavors, smoothness } = poffinBerry(berry);
  return (
    <span className="text-xs text-slate-400">
      {FLAVORS.flatMap((f, i) => (flavors[i] ? [`${f} ${flavors[i]}`] : [])).join(' · ') || 'no flavour'} · smooth {smoothness}
    </span>
  );
}

/**
 * Poffin cooking (the Extras page's): choose one of the account's berries (picked on the Berry Farm) to cook alone, as
 * at Platinum's Poffin House (PoffinScreen). The berry is used up and the Poffin it makes kept (`extras.cook`); the
 * account's Poffin Case (its Poffins, newest first, each with its level and smoothness) is listed here.
 */
export function PoffinCooking() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const poffins = useQuery(trpc.extras.poffins.queryOptions());
  const accountName = useQuery(trpc.community.accountName.queryOptions());
  const cook = useMutation(
    trpc.extras.cook.mutationOptions({
      onSuccess: () => {
        for (const key of [trpc.extras.poffins.queryKey(), trpc.extras.farm.queryKey(), trpc.extras.blender.queryKey()]) queryClient.invalidateQueries({ queryKey: key });
      },
    }),
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const [cooking, setCooking] = useState<string | null>(null);

  if (poffins.error && !poffins.data) return <p className="text-red-400">{poffins.error.message}</p>;
  if (!poffins.data) return <p className="text-slate-400">Heating the pot…</p>;
  const { berries, poffins: list, total } = poffins.data;
  const owned = BERRIES.filter((b) => berries[b.id]);
  // The player's name as Platinum shows names: up to 7 letters.
  const playerName = (accountName.data ?? 'You').slice(0, 7);

  if (cooking) {
    return (
      <PoffinScreen
        key={cooking}
        berry={cooking}
        playerName={playerName}
        onCook={(cooked) => cook.mutateAsync({ berry: cooking, ...cooked })}
        onDone={(again) => {
          setCooking(null);
          setChosen(null);
          if (!again) navigate({ to: '/extras' });
        }}
      />
    );
  }

  const pick = chosen && berries[chosen] ? chosen : null;
  return (
    <div className="space-y-6">
      <section className="space-y-2">
        <div className="flex flex-wrap items-center gap-3">
          <h3 className="font-semibold">Choose the berry you want to cook</h3>
          <button className={`${BUTTON} ml-auto`} disabled={!pick} onClick={() => pick && setCooking(pick)}>
            {pick ? `Cook the ${berryName(pick)}` : 'Cook'}
          </button>
        </div>
        {owned.length ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2">
            {owned.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setChosen(b.id)}
                  onDoubleClick={() => setCooking(b.id)}
                  aria-pressed={pick === b.id}
                  className={`flex w-full items-center gap-2 rounded bg-slate-800 px-2 py-1.5 text-left text-sm ring-1 transition hover:bg-slate-700 ${pick === b.id ? 'ring-yellow-300' : 'ring-slate-700'}`}
                >
                  <BerryIcon berry={b.id} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{berryName(b.id)}</span>
                    <Flavors berry={b.id} />
                  </span>
                  <span className="tabular-nums text-slate-300">×{berries[b.id]}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">
            There isn’t a Berry to cook.{' '}
            <Link to="/extras/berry-farm" className="text-yellow-300 hover:underline">
              Pick some on the Berry Farm
            </Link>
            .
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">
          Poffin Case <span className="text-sm font-normal text-slate-400">({total})</span>
        </h3>
        {list.length ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-2">
            {list.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded bg-slate-800 px-2 py-1 text-sm ring-1 ring-slate-700" title={FLAVORS.map((f, i) => `${f} ${p.flavors[i] ?? 0}`).join(', ')}>
                <PoffinIcon type={p.type} />
                <span className="truncate">{poffinName(p)}</span>
                <span className="ml-auto whitespace-nowrap text-xs text-slate-400">
                  Lv {p.level} · smooth {p.smoothness}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No Poffins yet: cook a berry to make one.</p>
        )}
      </section>
    </div>
  );
}
