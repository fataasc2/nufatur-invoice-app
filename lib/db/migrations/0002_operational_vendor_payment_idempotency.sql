BEGIN;

DO $migration$
DECLARE
  existing_type text;
BEGIN
  IF pg_catalog.to_regclass('public.operational_vendor_payments') IS NULL THEN
    RAISE EXCEPTION
      'Operational Finance idempotency migration stopped: public.operational_vendor_payments does not exist.';
  END IF;

  SELECT pg_catalog.format_type(column_info.atttypid, column_info.atttypmod)
  INTO existing_type
  FROM pg_catalog.pg_attribute AS column_info
  WHERE column_info.attrelid = 'public.operational_vendor_payments'::regclass
    AND column_info.attname = 'request_key'
    AND column_info.attnum > 0
    AND NOT column_info.attisdropped;

  IF existing_type IS NOT NULL AND existing_type <> 'character varying(100)' THEN
    RAISE EXCEPTION
      'Operational Finance idempotency migration stopped: request_key has unexpected type %.',
      existing_type;
  END IF;
END;
$migration$;

ALTER TABLE public.operational_vendor_payments
  ADD COLUMN IF NOT EXISTS request_key varchar(100);

CREATE UNIQUE INDEX IF NOT EXISTS operational_vendor_payments_request_key_uidx
  ON public.operational_vendor_payments (request_key)
  WHERE request_key IS NOT NULL;

COMMIT;
