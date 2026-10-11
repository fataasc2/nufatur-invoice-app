BEGIN;

DO $migration$
DECLARE
  existing_tables text;
  invalid_parent_tables text;
BEGIN
  SELECT string_agg(target.table_name, ', ' ORDER BY target.table_name)
  INTO existing_tables
  FROM unnest(ARRAY[
    'operational_expenses',
    'operational_expense_allocations',
    'operational_vendor_payments'
  ]) AS target(table_name)
  WHERE pg_catalog.to_regclass(
    pg_catalog.format('%I.%I', 'public', target.table_name)
  ) IS NOT NULL;

  IF existing_tables IS NOT NULL THEN
    RAISE EXCEPTION
      'Operational Finance migration stopped: target relation(s) already exist in public: %. Inspect the schema; this migration only runs once on an empty Finance schema.',
      existing_tables;
  END IF;

  SELECT string_agg(parent.table_name, ', ' ORDER BY parent.table_name)
  INTO invalid_parent_tables
  FROM (VALUES ('departure_groups'), ('payments'), ('users')) AS parent(table_name)
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_catalog.pg_class AS relation
    JOIN pg_catalog.pg_namespace AS namespace
      ON namespace.oid = relation.relnamespace
    JOIN pg_catalog.pg_attribute AS id_column
      ON id_column.attrelid = relation.oid
     AND id_column.attname = 'id'
     AND id_column.atttypid = 'integer'::regtype
     AND id_column.attnotnull
     AND id_column.attnum > 0
     AND NOT id_column.attisdropped
    JOIN pg_catalog.pg_constraint AS primary_key
      ON primary_key.conrelid = relation.oid
     AND primary_key.contype = 'p'
     AND id_column.attnum = ANY(primary_key.conkey)
    WHERE namespace.nspname = 'public'
      AND relation.relname = parent.table_name
      AND relation.relkind IN ('r', 'p')
  );

  IF invalid_parent_tables IS NOT NULL THEN
    RAISE EXCEPTION
      'Operational Finance migration stopped: required public parent table(s) must have an integer NOT NULL primary-key id: %.',
      invalid_parent_tables;
  END IF;
END;
$migration$;

CREATE TABLE public.operational_expenses (
  id serial PRIMARY KEY,
  number varchar(80) NOT NULL UNIQUE,
  group_id integer REFERENCES public.departure_groups(id) ON DELETE SET NULL,
  category varchar(80) NOT NULL,
  name varchar(200) NOT NULL,
  vendor varchar(200) NOT NULL,
  bill_number varchar(80),
  total_amount numeric(16, 2) NOT NULL,
  bill_date date NOT NULL,
  due_date date,
  notes text,
  created_by integer REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT operational_expenses_total_amount_check CHECK (total_amount > 0)
);

CREATE INDEX operational_expenses_group_id_idx
  ON public.operational_expenses (group_id);
CREATE INDEX operational_expenses_due_date_idx
  ON public.operational_expenses (due_date);

CREATE TABLE public.operational_expense_allocations (
  id serial PRIMARY KEY,
  payment_id integer NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  expense_id integer NOT NULL REFERENCES public.operational_expenses(id) ON DELETE CASCADE,
  amount numeric(16, 2) NOT NULL,
  allocation_date date NOT NULL,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by integer REFERENCES public.users(id) ON DELETE SET NULL,
  reversal_of integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT operational_expense_allocations_amount_check CHECK (amount > 0)
);

CREATE INDEX operational_expense_allocations_payment_id_idx
  ON public.operational_expense_allocations (payment_id);
CREATE INDEX operational_expense_allocations_expense_id_idx
  ON public.operational_expense_allocations (expense_id);
CREATE INDEX operational_expense_allocations_reversal_of_idx
  ON public.operational_expense_allocations (reversal_of);

CREATE TABLE public.operational_vendor_payments (
  id serial PRIMARY KEY,
  expense_id integer NOT NULL REFERENCES public.operational_expenses(id) ON DELETE CASCADE,
  allocation_id integer REFERENCES public.operational_expense_allocations(id) ON DELETE RESTRICT,
  payment_date date NOT NULL,
  amount numeric(16, 2) NOT NULL,
  method varchar(40) NOT NULL DEFAULT 'Transfer',
  reference varchar(200),
  notes text,
  status varchar(32) NOT NULL DEFAULT 'posted',
  created_by integer REFERENCES public.users(id) ON DELETE SET NULL,
  reversal_of integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT operational_vendor_payments_amount_check CHECK (amount > 0)
);

CREATE INDEX operational_vendor_payments_expense_id_idx
  ON public.operational_vendor_payments (expense_id);
CREATE INDEX operational_vendor_payments_allocation_id_idx
  ON public.operational_vendor_payments (allocation_id);
CREATE INDEX operational_vendor_payments_reversal_of_idx
  ON public.operational_vendor_payments (reversal_of);

COMMIT;
