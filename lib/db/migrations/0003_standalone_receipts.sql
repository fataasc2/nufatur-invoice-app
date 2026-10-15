BEGIN;

DO $migration$
DECLARE
  payment_id_type text;
BEGIN
  IF pg_catalog.to_regclass('public.receipts') IS NULL THEN
    RAISE EXCEPTION
      'Standalone receipts migration stopped: public.receipts does not exist.';
  END IF;

  SELECT pg_catalog.format_type(column_info.atttypid, column_info.atttypmod)
  INTO payment_id_type
  FROM pg_catalog.pg_attribute AS column_info
  WHERE column_info.attrelid = 'public.receipts'::regclass
    AND column_info.attname = 'payment_id'
    AND column_info.attnum > 0
    AND NOT column_info.attisdropped;

  IF payment_id_type IS DISTINCT FROM 'integer' THEN
    RAISE EXCEPTION
      'Standalone receipts migration stopped: receipts.payment_id has unexpected type %.',
      COALESCE(payment_id_type, 'missing');
  END IF;
END;
$migration$;

ALTER TABLE public.receipts
  ALTER COLUMN payment_id DROP NOT NULL;

COMMIT;
