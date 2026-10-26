-- The Settings page's debug switches (unlock everything, 1,000,000 ₱ in the bank), used only while debugging.
ALTER TABLE "User" ADD COLUMN "debugFlags" JSONB NOT NULL DEFAULT '{}';
