import { prisma } from '@poke-tcg/db';
import { ACCOUNT_SETTINGS, saveSettingsInput, type AccountSettings } from '@poke-tcg/shared';
import { ensureUser } from '../auth.js';
import { lockUser } from '../runs.js';
import { protectedProcedure, router } from '../trpc.js';

/** An account's stored settings, keeping only the known ones with string values (`User.settings` is plain JSON). */
function settingsOf(json: unknown): AccountSettings {
  const stored = json && typeof json === 'object' ? (json as Record<string, unknown>) : {};
  return Object.fromEntries(ACCOUNT_SETTINGS.flatMap((key) => (typeof stored[key] === 'string' ? [[key, stored[key]]] : [])));
}

/**
 * The Settings page's choices kept with the account (`User.settings`, see ACCOUNT_SETTINGS), so they follow it from
 * browser to browser: `get` them all, `save` the ones changed (merged in; null removes one, back to its default).
 */
export const settingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => settingsOf((await prisma.user.findUnique({ where: { id: ctx.user.id }, select: { settings: true } }))?.settings)),
  save: protectedProcedure.input(saveSettingsInput).mutation(async ({ ctx, input }) => {
    await ensureUser(ctx.user);
    // Read, merge and write with the user row locked, so two saves close together (two toggles) both land.
    return prisma.$transaction(async (tx) => {
      await lockUser(tx, ctx.user.id);
      const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.user.id }, select: { settings: true } });
      const settings: AccountSettings = settingsOf(user.settings);
      for (const [key, value] of Object.entries(input.values) as [keyof AccountSettings, string | null][]) {
        if (value === null) delete settings[key];
        else settings[key] = value;
      }
      await tx.user.update({ where: { id: ctx.user.id }, data: { settings } });
      return settings;
    });
  }),
});
