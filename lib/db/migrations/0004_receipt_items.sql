BEGIN;

DO $migration$
BEGIN
  IF pg_catalog.to_regclass('public.receipts') IS NULL THEN
    RAISE EXCEPTION
      'Receipt items migration stopped: public.receipts does not exist.';
  END IF;

  IF pg_catalog.to_regclass('public.payments') IS NULL THEN
    RAISE EXCEPTION
      'Receipt items migration stopped: public.payments does not exist.';
  END IF;
END;
$migration$;

CREATE TABLE IF NOT EXISTS public.receipt_items (
  id serial PRIMARY KEY,
  receipt_id integer NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  position integer NOT NULL DEFAULT 0,
  description text NOT NULL,
  amount numeric(16, 2) NOT NULL,
  CONSTRAINT receipt_items_amount_check CHECK (amount > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS receipt_items_receipt_id_position_uidx
  ON public.receipt_items (receipt_id, position);

INSERT INTO public.receipt_items (receipt_id, position, description, amount)
SELECT
  receipt.id,
  0,
  COALESCE(NULLIF(pg_catalog.btrim(payment.description), ''), receipt.purpose),
  receipt.amount
FROM public.receipts AS receipt
LEFT JOIN public.payments AS payment
  ON payment.id = receipt.payment_id
WHERE NOT EXISTS (
  SELECT 1
  FROM public.receipt_items AS existing_item
  WHERE existing_item.receipt_id = receipt.id
)
ON CONFLICT (receipt_id, position) DO NOTHING;

COMMIT;
