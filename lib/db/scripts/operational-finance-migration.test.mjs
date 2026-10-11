import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  compareSchema,
  diagnosticSql,
} from "./diagnose-operational-finance.mjs";

const migrationUrl = new URL("../migrations/0001_operational_finance.sql", import.meta.url);
const migrationSql = await readFile(fileURLToPath(migrationUrl), "utf8");

async function createFixture() {
  const database = new PGlite();
  await database.exec(`
    CREATE TABLE public.users (id serial PRIMARY KEY);
    CREATE TABLE public.departure_groups (id serial PRIMARY KEY);
    CREATE TABLE public.customers (id serial PRIMARY KEY, full_name text NOT NULL);
    CREATE TABLE public.invoices (
      id serial PRIMARY KEY,
      customer_id integer NOT NULL REFERENCES public.customers(id),
      status varchar(24) NOT NULL
    );
    CREATE TABLE public.invoice_items (
      id serial PRIMARY KEY,
      invoice_id integer NOT NULL REFERENCES public.invoices(id),
      cashback numeric(16, 2) NOT NULL DEFAULT 0,
      discount numeric(16, 2) NOT NULL DEFAULT 0
    );
    CREATE TABLE public.payments (
      id serial PRIMARY KEY,
      invoice_id integer NOT NULL REFERENCES public.invoices(id),
      amount numeric(16, 2) NOT NULL
    );
    CREATE TABLE public.receipts (
      id serial PRIMARY KEY,
      payment_id integer NOT NULL REFERENCES public.payments(id)
    );

    INSERT INTO public.users DEFAULT VALUES;
    INSERT INTO public.departure_groups DEFAULT VALUES;
    INSERT INTO public.departure_groups DEFAULT VALUES;
    INSERT INTO public.customers (full_name) VALUES ('Disposable fixture');
    INSERT INTO public.invoices (customer_id, status) VALUES (1, 'issued');
    INSERT INTO public.invoice_items (invoice_id, cashback, discount) VALUES (1, 25, 10);
    INSERT INTO public.payments (invoice_id, amount) VALUES (1, 100);
    INSERT INTO public.receipts (payment_id) VALUES (1);
  `);
  return database;
}

test("creates Finance tables, constraints, and indexes on a disposable PostgreSQL database", async () => {
  const database = await createFixture();
  try {
    await database.exec(migrationSql);
    const catalog = await database.query(diagnosticSql);
    assert.deepEqual(compareSchema(catalog.rows), {
      expected_schema: "public",
      required_objects_match: true,
      differences: [],
      additional_columns: [],
    });

    const tables = await database.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'operational_expenses',
          'operational_expense_allocations',
          'operational_vendor_payments'
        )
      ORDER BY table_name
    `);
    assert.deepEqual(tables.rows.map((row) => row.table_name), [
      "operational_expense_allocations",
      "operational_expenses",
      "operational_vendor_payments",
    ]);

    const columns = await database.query(`
      SELECT table_name, column_name, data_type, is_nullable, column_default,
             numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN (
          'operational_expenses',
          'operational_expense_allocations',
          'operational_vendor_payments'
        )
    `);
    const allocationColumns = new Map(
      columns.rows
        .filter((row) => row.table_name === "operational_expense_allocations")
        .map((row) => [row.column_name, row]),
    );
    assert.equal(allocationColumns.get("payment_id").is_nullable, "NO");
    assert.equal(allocationColumns.get("amount").data_type, "numeric");
    assert.equal(allocationColumns.get("is_active").column_default, "true");
    const totalAmount = columns.rows.find((row) =>
      row.table_name === "operational_expenses" && row.column_name === "total_amount",
    );
    assert.equal(totalAmount.numeric_precision, 16);
    assert.equal(totalAmount.numeric_scale, 2);

    const indexes = await database.query(`
      SELECT indexname
      FROM pg_catalog.pg_indexes
      WHERE schemaname = 'public'
        AND tablename IN (
          'operational_expenses',
          'operational_expense_allocations',
          'operational_vendor_payments'
        )
    `);
    const indexNames = new Set(indexes.rows.map((row) => row.indexname));
    for (const name of [
      "operational_expenses_due_date_idx",
      "operational_expense_allocations_payment_id_idx",
      "operational_vendor_payments_expense_id_idx",
    ]) {
      assert.ok(indexNames.has(name), `expected ${name}`);
    }

    const constraints = await database.query(`
      SELECT conname, pg_catalog.pg_get_constraintdef(oid) AS definition
      FROM pg_catalog.pg_constraint
      WHERE conrelid IN (
        'public.operational_expenses'::regclass,
        'public.operational_expense_allocations'::regclass,
        'public.operational_vendor_payments'::regclass
      )
    `);
    assert.ok(constraints.rows.some((row) => row.definition.includes("payment_id") && row.definition.includes("RESTRICT")));
    assert.ok(constraints.rows.some((row) => row.definition.includes("expense_id") && row.definition.includes("CASCADE")));

    const businessData = await database.query(`
      SELECT
        (SELECT count(*)::integer FROM public.customers) AS customers,
        (SELECT count(*)::integer FROM public.invoices) AS invoices,
        (SELECT count(*)::integer FROM public.invoice_items WHERE cashback = 25 AND discount = 10) AS invoice_items,
        (SELECT count(*)::integer FROM public.payments WHERE amount = 100) AS payments,
        (SELECT count(*)::integer FROM public.receipts) AS receipts
    `);
    assert.deepEqual(businessData.rows[0], {
      customers: 1,
      invoices: 1,
      invoice_items: 1,
      payments: 1,
      receipts: 1,
    });

    await database.exec(`
      INSERT INTO public.operational_expenses (
        number, group_id, category, name, vendor, total_amount, bill_date, created_by
      ) VALUES
        ('OP-001', 1, 'Transport', 'Bus', 'Vendor A', 100, '2026-10-11', 1),
        ('OP-002', 2, 'Hotel', 'Room', 'Vendor B', 200, '2026-10-11', 1);
      INSERT INTO public.operational_expense_allocations (
        payment_id, expense_id, amount, allocation_date, created_by
      ) VALUES (1, 1, 50, '2026-10-11', 1);
      INSERT INTO public.operational_vendor_payments (
        expense_id, allocation_id, payment_date, amount, created_by
      ) VALUES (1, 1, '2026-10-11', 25, 1);
    `);
    const groupExpenses = await database.query(`
      SELECT group_id, count(*)::integer AS expense_count
      FROM public.operational_expenses
      GROUP BY group_id
      ORDER BY group_id
    `);
    assert.deepEqual(groupExpenses.rows, [
      { group_id: 1, expense_count: 1 },
      { group_id: 2, expense_count: 1 },
    ]);
    const financeRows = await database.query(`
      SELECT
        (SELECT count(*)::integer FROM public.operational_expense_allocations) AS allocations,
        (SELECT count(*)::integer FROM public.operational_vendor_payments) AS vendor_payments
    `);
    assert.deepEqual(financeRows.rows[0], { allocations: 1, vendor_payments: 1 });
  } finally {
    await database.close();
  }
});

test("migration rolls back completely when required parent tables are missing", async () => {
  const database = new PGlite();
  try {
    await assert.rejects(database.exec(migrationSql), /required public parent table/);
    await database.exec("ROLLBACK");
    const tables = await database.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'operational_expenses',
          'operational_expense_allocations',
          'operational_vendor_payments'
        )
    `);
    assert.equal(tables.rows.length, 0);
  } finally {
    await database.close();
  }
});

test("migration refuses pre-existing target relations without changing them", async () => {
  const database = await createFixture();
  try {
    await database.exec(`
      CREATE TABLE public.operational_expenses (existing_data text NOT NULL);
      INSERT INTO public.operational_expenses VALUES ('must remain unchanged');
    `);

    await assert.rejects(database.exec(migrationSql), /target relation\(s\) already exist/);
    await database.exec("ROLLBACK");

    const existing = await database.query("SELECT existing_data FROM public.operational_expenses");
    assert.deepEqual(existing.rows, [{ existing_data: "must remain unchanged" }]);
    const otherTargets = await database.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'operational_expense_allocations',
          'operational_vendor_payments'
        )
    `);
    assert.equal(otherTargets.rows.length, 0);
  } finally {
    await database.close();
  }
});
