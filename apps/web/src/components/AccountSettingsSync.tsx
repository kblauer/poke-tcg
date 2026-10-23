import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { useTRPC } from '../lib/trpc';
import { connectAccountSettings } from '../utils/accountSettings';

/**
 * Signed in: loads the account's settings (`settings.get`) and connects them (utils/accountSettings), so the Settings
 * page's choices follow the account, and saves the ones changed here (`settings.save`). Renders nothing.
 */
export function AccountSettingsSync() {
  const trpc = useTRPC();
  const settings = useQuery({ ...trpc.settings.get.queryOptions(), staleTime: Infinity });
  const save = useMutation(trpc.settings.save.mutationOptions());
  const { mutate } = save;
  useEffect(() => {
    if (!settings.data) return;
    return connectAccountSettings(settings.data, (values) => mutate({ values }));
  }, [settings.data, mutate]);
  return null;
}
