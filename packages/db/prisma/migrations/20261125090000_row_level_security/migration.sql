-- Closes the tables to Supabase's Data API roles (2026-11-24). The anon key is in the browser's bundle (it signs
-- players in), and Supabase grants its `anon` and `authenticated` roles everything on every table made in `public`, so
-- with the Data API on, the key alone could read and write any account. The app never uses those roles: the API
-- connects as the tables' owner, which row level security doesn't apply to, so nothing here changes what it can do.
--
-- Every table in `public` gets row level security with no policy (nobody but the owner reads or writes a row), and the
-- two roles lose their grants on the tables and sequences, now and for tables made later. A later migration that makes
-- a table must still enable row level security on it itself (apps/api/src/row-level-security.test.ts checks).

DO $$
DECLARE
  t record;
BEGIN
  FOR t IN SELECT c.oid::regclass AS name FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
  LOOP
    EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY', t.name);
  END LOOP;
END $$;

-- The roles are Supabase's: a plain Postgres (a shadow database elsewhere) has neither, and nothing to revoke.
DO $$
DECLARE
  r text;
BEGIN
  FOREACH r IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
      EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA public FROM %I', r);
      EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM %I', r);
      EXECUTE format('ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM %I', r);
    END IF;
  END LOOP;
END $$;
