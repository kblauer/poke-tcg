import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from '@tanstack/react-router';
import { useTRPC } from '../../lib/trpc';
import { VoltorbFlipScreen } from './VoltorbFlipScreen';

/**
 * Voltorb Flip (the Extras page's): HeartGold and SoulSilver's game (VoltorbFlipScreen), its boards made and its rounds
 * settled by the API (`extras.voltorbRound`, `extras.voltorbSettle`), the coins won going into the account's Coin
 * Case, the Game Corner's. Quitting at its menu goes back to the Extras page.
 */
export function VoltorbFlip() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const accountName = useQuery(trpc.community.accountName.queryOptions());
  const round = useMutation(trpc.extras.voltorbRound.mutationOptions());
  const settle = useMutation(
    trpc.extras.voltorbSettle.mutationOptions({
      onSuccess: () => queryClient.invalidateQueries({ queryKey: trpc.extras.gameCorner.queryKey() }),
    }),
  );
  // The player's name as HeartGold shows names: up to 7 letters.
  const playerName = (accountName.data ?? 'You').slice(0, 7);
  return (
    <VoltorbFlipScreen
      playerName={playerName}
      onRound={(restart) => round.mutateAsync({ restart })}
      onSettle={(flips, outcome) => settle.mutateAsync({ flips, outcome })}
      onExit={() => navigate({ to: '/extras' })}
    />
  );
}
