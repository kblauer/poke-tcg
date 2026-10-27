import { CONDITION_NAMES, conditionOf, FLAVORS, MAX_CONDITION, natureFlavors, NATURES, POKEBLOCK_NAMES, poffinName, sheenMaxed, type PokeblockColor } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useToasts } from '../../hooks/useToasts';
import { useTRPC } from '../../lib/trpc';
import { BUTTON } from '../../utils/styles';
import { PoffinIcon, PokeblockIcon } from '../extras/TreatIcons';
import { Toasts } from '../Toasts';

/** The condition bars' colours (Cool, Beauty, Cute, Smart, Tough, then the sheen). */
const BAR_COLORS = ['bg-red-500', 'bg-blue-500', 'bg-pink-400', 'bg-green-500', 'bg-yellow-400', 'bg-slate-300'];

/** The condition: a bar for each of the five and the sheen, out of 255. */
export function ConditionBars({ condition }: { condition: readonly number[] }) {
  return (
    <div className="grid grid-cols-[4rem_1fr_2.5rem] items-center gap-x-2 gap-y-1 text-xs">
      {CONDITION_NAMES.map((name, i) => (
        <div key={name} className="contents">
          <span className="text-slate-400">{name}</span>
          <span className="h-2 overflow-hidden rounded bg-slate-700">
            <span className={`block h-full ${BAR_COLORS[i]}`} style={{ width: `${(100 * (condition[i] ?? 0)) / MAX_CONDITION}%` }} />
          </span>
          <span className="text-right tabular-nums text-slate-300">{condition[i] ?? 0}</span>
        </div>
      ))}
    </div>
  );
}

const flavorText = (flavors: readonly number[]) => FLAVORS.flatMap((f, i) => (flavors[i] ? [`${f} ${flavors[i]}`] : [])).join(' · ') || 'no flavour';

/**
 * A Pokédex entry's condition, and the account's Pokéblocks and Poffins to feed it (README: Super Contests): a treat
 * fed raises the entry's condition for good (the entry is the Pokémon), by its nature's liked and disliked flavours, and
 * is used up (`contest.feed`). Shown in the
 * Idle Adventure's Pokédex and the Super Contests' entry.
 */
export function ConditionFeeder({ species }: { species: number }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const toasts = useToasts();
  const overview = useQuery(trpc.contest.overview.queryOptions());
  const [tab, setTab] = useState<'pokeblock' | 'poffin'>('poffin');
  const [gained, setGained] = useState<string | null>(null);
  const feed = useMutation(
    trpc.contest.feed.mutationOptions({
      onSuccess: (r) => {
        const gained = r.condition.flatMap((v, i) => (v > r.before[i]! ? [`${CONDITION_NAMES[i]} +${v - r.before[i]!}`] : []));
        setGained(gained.length ? gained.join(', ') : 'Nothing changed');
        for (const key of [trpc.contest.overview.queryKey(), trpc.extras.blender.queryKey(), trpc.extras.poffins.queryKey()]) queryClient.invalidateQueries({ queryKey: key });
      },
      onError: (e) => toasts.push('error', e.message),
    }),
  );
  if (!overview.data) return <p className="text-xs text-slate-500">Loading its condition…</p>;
  const entry = overview.data.entries.find((e) => e.species === species);
  if (!entry) return null;
  const condition = conditionOf(entry.condition);
  const full = sheenMaxed(condition);
  const list = tab === 'pokeblock' ? overview.data.pokeblocks : overview.data.poffins;
  return (
    <section className="space-y-2">
      <ConditionBars condition={condition} />
      {gained && <p className="text-xs text-emerald-300">Fed: {gained}</p>}
      <div className="flex items-center gap-1 text-xs">
        <span className="mr-auto text-slate-400">
          {full ? 'Its sheen is full: it won’t eat any more.' : `Feed it (${NATURES[entry.nature]}: ${natureFlavors(entry.nature) ? `likes ${FLAVORS[natureFlavors(entry.nature)!.liked]}, dislikes ${FLAVORS[natureFlavors(entry.nature)!.disliked]}` : 'no favourite flavour'}):`}
        </span>
        {(['poffin', 'pokeblock'] as const).map((k) => (
          <button key={k} className={`rounded px-2 py-0.5 ${tab === k ? 'bg-slate-600 text-slate-50' : 'text-slate-400 hover:bg-slate-700'}`} onClick={() => setTab(k)}>
            {k === 'poffin' ? `Poffins (${overview.data.poffins.length})` : `Pokéblocks (${overview.data.pokeblocks.length})`}
          </button>
        ))}
      </div>
      {list.length ? (
        <ul className="max-h-48 space-y-1 overflow-y-auto pr-1">
          {list.map((t) => (
            <li key={t.id} className="flex items-center gap-2 rounded bg-slate-900/40 px-2 py-1 text-xs">
              {'color' in t ? <PokeblockIcon color={t.color} size={16} /> : <PoffinIcon type={t.type} size={20} />}
              <span className="min-w-0 flex-1">
                <span className="block truncate">
                  {'color' in t ? `${POKEBLOCK_NAMES[t.color as PokeblockColor]}` : poffinName(t)} <span className="text-slate-500">Lv. {t.level}</span>
                </span>
                <span className="block truncate text-slate-400">
                  {flavorText(t.flavors)} · {'feel' in t ? `feel ${t.feel}` : `smooth ${t.smoothness}`}
                </span>
              </span>
              <button className={BUTTON} disabled={full || feed.isPending} onClick={() => feed.mutate({ species, kind: tab, id: t.id })}>
                Feed
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-slate-500">{tab === 'poffin' ? 'No Poffins: cook some on the Extras page.' : 'No Pokéblocks: make some in the Berry Blender on the Extras page.'}</p>
      )}
      <Toasts toasts={toasts.toasts} />
    </section>
  );
}
