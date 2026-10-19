-- The post-run shop's stock after a run, fixed the first time it's opened (so buying doesn't change it).
ALTER TABLE "Run" ADD COLUMN "shop" JSONB;
