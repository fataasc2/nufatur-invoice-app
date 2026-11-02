BEGIN;

DO $migration$
BEGIN
  IF pg_catalog.to_regclass('public.receipts') IS NULL THEN
    RAISE EXCEPTION
      'Standalone receipt payment method migration stopped: public.receipts does not exist.';
  END IF;
END;
$migration$;

ALTER TABLE public.receipts
  ADD COLUMN IF NOT EXISTS method varchar(40);

COMMIT;
