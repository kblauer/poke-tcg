import { z } from 'zod';

/**
 * The Settings page's choices kept with the account (`User.settings`), so they follow it to any browser: the colour
 * theme, the font, skipping coin flip animations, the CPU's played cards shown (options), End turn's reminders and the
 * music's auto play and soundtrack. Each is the web app's own serialised value (a string), which the server only stores.
 */
export const ACCOUNT_SETTINGS = ['theme', 'font', 'skipFlips', 'options', 'reminders', 'music'] as const;
export type AccountSetting = (typeof ACCOUNT_SETTINGS)[number];
export type AccountSettings = Partial<Record<AccountSetting, string>>;

/** The longest value a setting may have (they're short: an id, a flag or a little JSON). */
export const SETTING_LENGTH = 1000;

/** settings.save: the settings changed (null: back to the default, removed). */
export const saveSettingsInput = z.object({ values: z.partialRecord(z.enum(ACCOUNT_SETTINGS), z.string().max(SETTING_LENGTH).nullable()) });
