import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { Link } from '@tanstack/react-router';
import type { ReactNode } from 'react';
import { BerryBlender } from '../components/extras/BerryBlender';
import { BerryFarm } from '../components/extras/BerryFarm';
import { GameCorner } from '../components/extras/GameCorner';
import { PoffinCooking } from '../components/extras/PoffinCooking';
import { VoltorbFlip } from '../components/extras/VoltorbFlip';
import { PageHeader } from '../components/PageHeader';
import { PAGE_WIDTH } from '../utils/layout';

/** The Extras page's minigames and modes, in its list's order: each its page, picture and a line on it. */
const EXTRAS: { to: '/extras/berry-farm' | '/extras/berry-blender' | '/extras/poffin-cooking' | '/extras/game-corner' | '/extras/voltorb-flip'; title: string; text: string; picture: ReactNode }[] = [
  {
    to: '/extras/berry-farm',
    title: 'Berry Farm',
    text: 'A tree of every Hoenn berry grows on the Berry Master’s farm. Come back every few hours to pick the ripe ones.',
    // A ripe Oran tree (the last frame of its strip), at 3×.
    picture: <div className="h-24 w-12 bg-[url(/extras/trees/oran.png)] bg-[length:432px_96px] bg-[position:-384px_0] [image-rendering:pixelated]" />,
  },
  {
    to: '/extras/berry-blender',
    title: 'Berry Blender',
    text: 'Blend a berry with three others, pressing as the arrow passes yours, to make a Pokéblock. The faster it spins, the better.',
    // The Berry Juice item's icon (PokeAPI's sprites), at 3×.
    picture: <img src="/extras/berry-juice.png" alt="" className="size-[90px] [image-rendering:pixelated]" />,
  },
  {
    to: '/extras/poffin-cooking',
    title: 'Poffin Cooking',
    text: 'Cook a berry into a Poffin as at Platinum’s Poffin House, stirring the pot the way the arrow points. Don’t let it burn or spill!',
    // The Poffin Case item's icon (PokeAPI's sprites), at 3×.
    picture: <img src="/extras/poffin-case.png" alt="" className="size-[90px] [image-rendering:pixelated]" />,
  },
  {
    to: '/extras/game-corner',
    title: 'Game Corner',
    text: 'Mauville’s Game Corner: buy coins with your banked ₱ and try your luck at the roulette tables and the slot machines.',
    // The Coin Case item's icon (PokeAPI's sprites), at 3×.
    picture: <img src="/extras/coin-case.png" alt="" className="size-[90px] [image-rendering:pixelated]" />,
  },
  {
    to: '/extras/voltorb-flip',
    title: 'Voltorb Flip',
    text: 'Goldenrod’s card game from HeartGold and SoulSilver: flip the cards to multiply your coins, but find a Voltorb and you lose them all.',
    // The game's face-up Voltorb card (its tiles' 11th, 24×24), at 3×.
    picture: <div className="size-[72px] bg-[url(/extras/voltorb-flip/tiles.png)] bg-[length:768px_192px] bg-[position:-264px_0] [image-rendering:pixelated]" />,
  },
];

/** The Extras tab (`/extras`): its minigames and modes, each a tile opening its page. */
export function ExtrasPage() {
  return (
    <div className={`${PAGE_WIDTH} space-y-6`}>
      <PageHeader title="Extras" info="Minigames and other modes" />
      <ul className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-3">
        {EXTRAS.map((e) => (
          <li key={e.to}>
            <Link to={e.to} className="flex h-full items-center gap-4 rounded-lg bg-slate-800 p-4 ring-1 ring-slate-700 transition hover:bg-slate-700 hover:ring-yellow-300/60">
              <div className="flex w-24 shrink-0 items-center justify-center">{e.picture}</div>
              <div className="space-y-1">
                <div className="font-heading text-lg">{e.title}</div>
                <p className="text-sm text-slate-400">{e.text}</p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One of the Extras' pages: its title, a link back to the list, and the minigame. */
function ExtraPage({ title, info, children }: { title: string; info: string; children: ReactNode }) {
  return (
    <div className={`${PAGE_WIDTH} space-y-6`}>
      <PageHeader
        title={title}
        info={info}
        actions={
          <Link to="/extras" className="flex items-center gap-1 rounded px-2 py-1 text-sm text-slate-300 hover:bg-slate-700 hover:text-slate-50">
            <ArrowBackIcon sx={{ fontSize: 16 }} /> Extras
          </Link>
        }
      />
      {children}
    </div>
  );
}

/** The Berry Farm (`/extras/berry-farm`). */
export function BerryFarmPage() {
  return (
    <ExtraPage title="Berry Farm" info="Click a ripe tree to pick its berries">
      <BerryFarm />
    </ExtraPage>
  );
}

/** Poffin cooking (`/extras/poffin-cooking`). */
export function PoffinCookingPage() {
  return (
    <ExtraPage title="Poffin Cooking" info="Cook your berries into Poffins">
      <PoffinCooking />
    </ExtraPage>
  );
}

/** The Mauville Game Corner (`/extras/game-corner`). */
export function GameCornerPage() {
  return (
    <ExtraPage title="Game Corner" info="The roulette and the slots, played with coins">
      <GameCorner />
    </ExtraPage>
  );
}

/** Voltorb Flip (`/extras/voltorb-flip`). */
export function VoltorbFlipPage() {
  return (
    <ExtraPage title="Voltorb Flip" info="Flip the cards and collect coins">
      <VoltorbFlip />
    </ExtraPage>
  );
}

/** The Berry Blender (`/extras/berry-blender`). */
export function BerryBlenderPage() {
  return (
    <ExtraPage title="Berry Blender" info="Make Pokéblocks from your berries">
      <BerryBlender />
    </ExtraPage>
  );
}
