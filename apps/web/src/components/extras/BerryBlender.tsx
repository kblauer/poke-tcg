import { berryInfo, BERRIES, FLAVORS, POKEBLOCK_NAMES, type PokeblockColor } from '@poke-tcg/campaign';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { useState } from 'react';
import { useTRPC } from '../../lib/trpc';
import { BUTTON } from '../../utils/styles';
import { BerryIcon, berryName } from './BerryIcon';
import { BlenderScreen } from './BlenderScreen';

/** The blender's record as the game shows it: "66.27 RPM". */
const rpmText = (rpm: number) => `${Math.floor(rpm / 100)}.${String(rpm % 100).padStart(2, '0')} RPM`;

/** A Pokéblock's picture (Emerald's, in its colour: public/extras/pokeblocks/, 8px), drawn crisp at `size`. */
function PokeblockIcon({ color, size = 16 }: { color: string; size?: number }) {
  return <img src={`/extras/pokeblocks/${color.toLowerCase()}.png`} alt="" width={size} height={size} draggable={false} className="shrink-0 [image-rendering:pixelated]" />;
}

/** A berry's flavours as the Berry Tag shows them (spicy, dry, sweet, bitter, sour), the ones it has. */
function Flavors({ berry }: { berry: string }) {
  const info = berryInfo(berry);
  if (!info) return null;
  return <span className="text-xs text-slate-400">{FLAVORS.flatMap((f, i) => (info.flavors[i] ? [`${f} ${info.flavors[i]}`] : [])).join(' · ') || 'no flavour'}</span>;
}

/**
 * The Berry Blender (the Extras page's): choose one of the account's berries (picked on the Berry Farm) to put in, then
 * blend it with MISS, LADDIE and LASSIE (BlenderScreen, Emerald's minigame). The berry is used up and the Pokéblock it
 * makes kept (`extras.blend`); the account's record (its top speed) and its Pokéblocks, newest first, are listed here.
 */
export function BerryBlender() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const blender = useQuery(trpc.extras.blender.queryOptions());
  const accountName = useQuery(trpc.community.accountName.queryOptions());
  const blend = useMutation(
    trpc.extras.blend.mutationOptions({
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: trpc.extras.blender.queryKey() });
        queryClient.invalidateQueries({ queryKey: trpc.extras.farm.queryKey() });
      },
    }),
  );
  const [chosen, setChosen] = useState<string | null>(null);
  const [blending, setBlending] = useState<string | null>(null);

  if (blender.error && !blender.data) return <p className="text-red-400">{blender.error.message}</p>;
  if (!blender.data) return <p className="text-slate-400">Starting up the Berry Blender…</p>;
  const { berries, record, pokeblocks, total } = blender.data;
  // The account's berries in the game's order.
  const owned = BERRIES.filter((b) => berries[b.id]);
  // The player's name as the game shows names: capitals, up to 7 letters.
  const playerName = (accountName.data ?? 'YOU').toUpperCase().slice(0, 7);

  if (blending) {
    return (
      <BlenderScreen
        key={blending}
        berry={blending}
        playerName={playerName}
        onBlend={(maxRpm) => blend.mutateAsync({ berry: blending, maxRpm })}
        onDone={(again) => {
          setBlending(null);
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
          <h3 className="font-semibold">Choose a berry to put in</h3>
          <span className="text-sm text-slate-400">Max speed record: {rpmText(record)}</span>
          <button className={`${BUTTON} ml-auto`} disabled={!pick} onClick={() => pick && setBlending(pick)}>
            {pick ? `Blend the ${berryName(pick)}` : 'Blend'}
          </button>
        </div>
        {owned.length ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2">
            {owned.map((b) => (
              <li key={b.id}>
                <button
                  type="button"
                  onClick={() => setChosen(b.id)}
                  onDoubleClick={() => setBlending(b.id)}
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
            You have no berries.{' '}
            <Link to="/extras/berry-farm" className="text-yellow-300 hover:underline">
              Pick some on the Berry Farm
            </Link>
            .
          </p>
        )}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">
          Pokéblock Case <span className="text-sm font-normal text-slate-400">({total})</span>
        </h3>
        {pokeblocks.length ? (
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(12rem,1fr))] gap-2">
            {pokeblocks.map((p) => (
              <li key={p.id} className="flex items-center gap-2 rounded bg-slate-800 px-2 py-1.5 text-sm ring-1 ring-slate-700" title={FLAVORS.map((f, i) => `${f} ${p.flavors[i] ?? 0}`).join(', ')}>
                <PokeblockIcon color={p.color} />
                <span className="truncate">{POKEBLOCK_NAMES[p.color as PokeblockColor] ?? p.color} Pokéblock</span>
                <span className="ml-auto whitespace-nowrap text-xs text-slate-400">
                  Lv {p.level} · feel {p.feel}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">No Pokéblocks yet: blend a berry to make one.</p>
        )}
      </section>
    </div>
  );
}
