-- The Settings page's choices kept with the account (theme, font, battle options, reminders, music): see ACCOUNT_SETTINGS.
ALTER TABLE "User" ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}';
