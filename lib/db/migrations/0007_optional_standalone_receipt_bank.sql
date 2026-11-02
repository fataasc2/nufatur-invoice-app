BEGIN;

SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
BEGIN
  IF pg_catalog.to_regclass('public.receipts') IS NULL THEN
    RAISE EXCEPTION
      'Standalone receipt bank migration stopped: public.receipts does not exist.';
  END IF;
END;
$migration$;

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS bank varchar(120);

COMMIT;
