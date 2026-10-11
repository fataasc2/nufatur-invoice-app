import test from "node:test";
import assert from "node:assert/strict";
import {
  compareSchema,
  diagnosticSql,
  expectedTables,
} from "./diagnose-operational-finance.mjs";

function matchingRows() {
  const rows = [];
  for (const [tableName, table] of Object.entries(expectedTables)) {
    rows.push({
      section: "table_presence",
      schema_name: "public",
      table_name: tableName,
      details: { exists_in_expected_schema: true },
    });
    for (const [columnName, [type, nullable, defaultValue]] of Object.entries(table.columns)) {
      rows.push({
        section: "column",
        schema_name: "public",
        table_name: tableName,
        object_name: columnName,
        details: {
          type,
          nullable,
          default: defaultValue === "sequence" ? "nextval('id_seq'::regclass)" : defaultValue,
        },
      });
    }
    for (const indexName of table.indexes) {
      rows.push({
        section: "index",
        schema_name: "public",
        table_name: tableName,
        object_name: indexName,
        details: {},
      });
    }
    for (const [kind, definition] of table.constraints) {
      rows.push({
        section: "constraint",
        schema_name: "public",
        table_name: tableName,
        object_name: `fixture_${kind}`,
        details: { kind, definition },
      });
    }
  }
  return rows;
}

test("accepts the repository's expected Operational Finance schema", () => {
  assert.deepEqual(compareSchema(matchingRows()), {
    expected_schema: "public",
    required_objects_match: true,
    differences: [],
    additional_columns: [],
  });
});

test("reports missing tables, columns, and non-public lookalikes", () => {
  const rows = matchingRows().filter((row) =>
    row.table_name !== "operational_expense_allocations" || row.section === "table_presence",
  );
  rows.find((row) => row.section === "table_presence" && row.table_name === "operational_expense_allocations")
    .details.exists_in_expected_schema = false;
  rows.find((row) => row.section === "table_presence" && row.table_name === "operational_expense_allocations")
    .details.found_in_non_system_schemas = ["finance"];

  const result = compareSchema(rows);
  assert.ok(result.differences.some((difference) =>
    difference.table === "operational_expense_allocations" && difference.issue === "missing_table",
  ));
});

test("reports type, nullability, default, index, and constraint mismatches", () => {
  const rows = matchingRows();
  const amount = rows.find((row) =>
    row.section === "column" && row.table_name === "operational_expense_allocations" && row.object_name === "amount",
  );
  amount.details.type = "integer";
  const active = rows.find((row) =>
    row.section === "column" && row.table_name === "operational_expense_allocations" && row.object_name === "is_active",
  );
  active.details.nullable = true;
  active.details.default = null;
  rows.splice(rows.findIndex((row) =>
    row.section === "index" && row.object_name === "operational_expense_allocations_payment_id_idx",
  ), 1);
  rows.splice(rows.findIndex((row) =>
    row.section === "constraint" &&
    row.table_name === "operational_expense_allocations" &&
    row.details.kind === "foreign_key",
  ), 1);
  rows.splice(rows.findIndex((row) =>
    row.section === "constraint" &&
    row.table_name === "operational_expense_allocations" &&
    row.details.kind === "check",
  ), 1);

  const issues = compareSchema(rows).differences.map((difference) => difference.issue);
  assert.ok(issues.includes("type_mismatch"));
  assert.ok(issues.includes("nullable_mismatch"));
  assert.ok(issues.includes("default_mismatch"));
  assert.ok(issues.includes("missing_index"));
  assert.ok(issues.includes("missing_check_constraint"));
  assert.ok(issues.includes("missing_foreign_key_constraint"));
});

test("reports additional database columns without treating them as missing requirements", () => {
  const rows = matchingRows();
  rows.push({
    section: "column",
    schema_name: "public",
    table_name: "operational_expenses",
    object_name: "legacy_note",
    details: { type: "text", nullable: true, default: null },
  });

  const result = compareSchema(rows);
  assert.equal(result.required_objects_match, true);
  assert.deepEqual(result.additional_columns, [
    { table: "operational_expenses", column: "legacy_note" },
  ]);
});

test("diagnostic SQL is a catalog-only read query", () => {
  assert.match(diagnosticSql.trimStart(), /^WITH\b/i);
  assert.match(diagnosticSql, /pg_catalog\.pg_class/);
  assert.match(diagnosticSql, /information_schema|pg_catalog/i);
  assert.doesNotMatch(diagnosticSql, /\b(ALTER|CREATE|DELETE|DROP|INSERT|TRUNCATE|UPDATE)\b/i);
});
