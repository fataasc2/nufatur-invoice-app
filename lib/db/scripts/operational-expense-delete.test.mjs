import assert from "node:assert/strict";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import {
  deleteOperationalExpense,
  operationalFinanceDeleteAccess,
} from "../../../artifacts/api-server/src/lib/operational-expense-delete.ts";

async function createFixture() {
  const database = new PGlite();
  await database.exec(`
    CREATE TABLE users (id integer PRIMARY KEY);
    CREATE TABLE departure_groups (id integer PRIMARY KEY);
    CREATE TABLE payments (id integer PRIMARY KEY);
    CREATE TABLE operational_expenses (
      id serial PRIMARY KEY,
      number varchar(80) NOT NULL UNIQUE
    );
    CREATE TABLE operational_expense_allocations (
      id serial PRIMARY KEY,
      expense_id integer NOT NULL REFERENCES operational_expenses(id) ON DELETE CASCADE
    );
    CREATE TABLE operational_vendor_payments (
      id serial PRIMARY KEY,
      expense_id integer NOT NULL REFERENCES operational_expenses(id) ON DELETE CASCADE
    );
    CREATE TABLE audit_logs (
      id serial PRIMARY KEY,
      user_id integer NOT NULL REFERENCES users(id),
      action text NOT NULL,
      entity text NOT NULL,
      entity_id integer NOT NULL,
      metadata jsonb NOT NULL
    );
    INSERT INTO users VALUES (7);
    INSERT INTO departure_groups VALUES (11);
    INSERT INTO payments VALUES (13);
    INSERT INTO operational_expenses (number) VALUES ('OPR-00000001'), ('OPR-00000002'), ('OPR-00000003');
  `);
  return database;
}

function operationsFor(database, beforeDelete = async () => {}) {
  return {
    lockFinance: async () => {},
    lockExpense: async (id) => {
      await database.query("SELECT id FROM operational_expenses WHERE id = $1 FOR UPDATE", [id]);
    },
    findExpense: async (id) => (await database.query(
      "SELECT number FROM operational_expenses WHERE id = $1",
      [id],
    )).rows[0],
    hasAllocations: async (id) => (await database.query(
      "SELECT id FROM operational_expense_allocations WHERE expense_id = $1 LIMIT 1",
      [id],
    )).rows.length > 0,
    hasVendorPayments: async (id) => (await database.query(
      "SELECT id FROM operational_vendor_payments WHERE expense_id = $1 LIMIT 1",
      [id],
    )).rows.length > 0,
    deleteExpense: async (id) => {
      await beforeDelete(id);
      return (await database.query(
        "DELETE FROM operational_expenses WHERE id = $1 RETURNING id",
        [id],
      )).rows.length > 0;
    },
    writeAudit: async (userId, id, number) => {
      await database.query(
        `INSERT INTO audit_logs (user_id, action, entity, entity_id, metadata)
         VALUES ($1, 'delete', 'operational_expense', $2, $3)`,
        [userId, id, { number }],
      );
    },
  };
}

async function inTransaction(database, work) {
  await database.exec("BEGIN");
  try {
    const result = await work();
    await database.exec("COMMIT");
    return result;
  } catch (error) {
    await database.exec("ROLLBACK");
    throw error;
  }
}

test("only the owner role is permitted to delete operational expenses", () => {
  assert.equal(operationalFinanceDeleteAccess(null), 401);
  assert.equal(operationalFinanceDeleteAccess("owner"), null);
  assert.equal(operationalFinanceDeleteAccess("admin"), 403);
  assert.equal(operationalFinanceDeleteAccess("staff"), 403);
  assert.equal(operationalFinanceDeleteAccess(""), 403);
});

test("deletes an unreferenced expense and records audit without changing other data", async () => {
  const database = await createFixture();
  try {
    const result = await inTransaction(database, () =>
      deleteOperationalExpense(1, 7, operationsFor(database)));
    assert.deepEqual(result, { deleted: true, number: "OPR-00000001" });

    const state = await database.query(`
      SELECT
        (SELECT count(*)::integer FROM operational_expenses WHERE id = 1) AS deleted_expense,
        (SELECT count(*)::integer FROM operational_expenses) AS remaining_expenses,
        (SELECT count(*)::integer FROM operational_expense_allocations) AS allocations,
        (SELECT count(*)::integer FROM operational_vendor_payments) AS vendor_payments,
        (SELECT count(*)::integer FROM users WHERE id = 7) AS users,
        (SELECT count(*)::integer FROM departure_groups WHERE id = 11) AS groups,
        (SELECT count(*)::integer FROM payments WHERE id = 13) AS payments,
        (SELECT count(*)::integer FROM audit_logs WHERE user_id = 7 AND entity_id = 1 AND metadata->>'number' = 'OPR-00000001') AS audits
    `);
    assert.deepEqual(state.rows[0], {
      deleted_expense: 0,
      remaining_expenses: 2,
      allocations: 0,
      vendor_payments: 0,
      users: 1,
      groups: 1,
      payments: 1,
      audits: 1,
    });
  } finally {
    await database.close();
  }
});

test("rejects invalid IDs, missing records, and repeated deletion requests", async () => {
  const database = await createFixture();
  try {
    let calls = 0;
    const invalid = await deleteOperationalExpense(0, 7, {
      ...operationsFor(database),
      lockFinance: async () => { calls += 1; },
    });
    assert.deepEqual(invalid, {
      deleted: false,
      status: 400,
      message: "ID tagihan operasional tidak valid.",
    });
    assert.equal(calls, 0);

    const missing = await inTransaction(database, () =>
      deleteOperationalExpense(99, 7, operationsFor(database)));
    assert.equal(missing.deleted, false);
    assert.equal(missing.status, 404);

    await inTransaction(database, () => deleteOperationalExpense(1, 7, operationsFor(database)));
    const repeated = await inTransaction(database, () =>
      deleteOperationalExpense(1, 7, operationsFor(database)));
    assert.equal(repeated.deleted, false);
    assert.equal(repeated.status, 404);
    assert.equal((await database.query("SELECT count(*)::integer AS count FROM audit_logs")).rows[0].count, 1);
  } finally {
    await database.close();
  }
});

test("retains an expense and all allocation history when any allocation exists", async () => {
  const database = await createFixture();
  try {
    await database.query("INSERT INTO operational_expense_allocations (expense_id) VALUES (1)");
    const result = await inTransaction(database, () =>
      deleteOperationalExpense(1, 7, operationsFor(database)));
    assert.equal(result.deleted, false);
    assert.equal(result.status, 409);
    assert.match(result.message, /histori alokasi dana/);
    assert.equal((await database.query("SELECT count(*)::integer AS count FROM operational_expenses WHERE id = 1")).rows[0].count, 1);
    assert.equal((await database.query("SELECT count(*)::integer AS count FROM operational_expense_allocations WHERE expense_id = 1")).rows[0].count, 1);
    assert.equal((await database.query("SELECT count(*)::integer AS count FROM audit_logs")).rows[0].count, 0);
  } finally {
    await database.close();
  }
});

test("retains an expense and all vendor payment history when any vendor payment exists", async () => {
  const database = await createFixture();
  try {
    await database.query("INSERT INTO operational_vendor_payments (expense_id) VALUES (1)");
    const result = await inTransaction(database, () =>
      deleteOperationalExpense(1, 7, operationsFor(database)));
    assert.equal(result.deleted, false);
    assert.equal(result.status, 409);
    assert.match(result.message, /histori pembayaran vendor/);
    assert.equal((await database.query("SELECT count(*)::integer AS count FROM operational_expenses WHERE id = 1")).rows[0].count, 1);
    assert.equal((await database.query("SELECT count(*)::integer AS count FROM operational_vendor_payments WHERE expense_id = 1")).rows[0].count, 1);
    assert.equal((await database.query("SELECT count(*)::integer AS count FROM audit_logs")).rows[0].count, 0);
  } finally {
    await database.close();
  }
});

test("rolls back the expense deletion when audit persistence fails", async () => {
  const database = await createFixture();
  try {
    await assert.rejects(inTransaction(database, () =>
      deleteOperationalExpense(1, 999, operationsFor(database))));
    assert.equal((await database.query("SELECT count(*)::integer AS count FROM operational_expenses WHERE id = 1")).rows[0].count, 1);
    assert.equal((await database.query("SELECT count(*)::integer AS count FROM audit_logs")).rows[0].count, 0);
  } finally {
    await database.close();
  }
});
