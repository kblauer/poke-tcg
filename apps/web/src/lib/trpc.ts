import type { AppRouter } from '@poke-tcg/api/router';
import { QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchLink, httpLink, splitLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import { supabase } from './supabase';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

export const trpcClient = createTRPCClient<AppRouter>({
  links: [
    // The card catalog (cards.list) is the same for everyone: asked for on its own, as a GET of its own path with no
    // Authorization header, it gets the API's Cache-Control (app.ts) and the browser keeps it for an hour. Batched with
    // the per-user queries fired in the same tick, it never would be (issue #112).
    splitLink({
      condition: (op) => op.path === 'cards.list',
      true: httpLink({ url: '/api/trpc' }),
      false: httpBatchLink({
        url: '/api/trpc',
        async headers() {
          const { data } = await supabase.auth.getSession();
          const token = data.session?.access_token;
          return token ? { Authorization: `Bearer ${token}` } : {};
        },
      }),
    }),
  ],
});

export const { TRPCProvider, useTRPC } = createTRPCContext<AppRouter>();
