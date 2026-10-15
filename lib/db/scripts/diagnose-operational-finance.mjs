import { Client } from "pg";
import { fileURLToPath } from "node:url";
import path from "node:path";

export const expectedSchema = "public";

export const expectedTables = {
  operational_expenses: {
    columns: {
      id: ["integer", false, "sequence"],
      number: ["varchar(80)", false, null],
      group_id: ["integer", true, null],
      category: ["varchar(80)", false, null],
      name: ["varchar(200)", false, null],
      vendor: ["varchar(200)", false, null],
      bill_number: ["varchar(80)", true, null],
      total_amount: ["numeric(16,2)", false, null],
      bill_date: ["date", false, null],
      due_date: ["date", true, null],
      notes: ["text", true, null],
      created_by: ["integer", true, null],
      created_at: ["timestamp with time zone", false, "now()"],
      updated_at: ["timestamp with time zone", false, "now()"],
    },
    indexes: [
      "operational_expenses_group_id_idx",
      "operational_expenses_due_date_idx",
    ],
    constraints: [
      ["primary_key", "primary key (id)"],
      ["unique", "unique (number)"],
      ["foreign_key", "foreign key (group_id) references departure_groups(id) on delete set null"],
      ["foreign_key", "foreign key (created_by) references users(id) on delete set null"],
      ["check", "check (total_amount > 0)"],
    ],
  },
  operational_expense_allocations: {
    columns: {
      id: ["integer", false, "sequence"],
      payment_id: ["integer", false, null],
      expense_id: ["integer", false, null],
      amount: ["numeric(16,2)", false, null],
      allocation_date: ["date", false, null],
      notes: ["text", true, null],
      is_active: ["boolean", false, "true"],
      created_by: ["integer", true, null],
      reversal_of: ["integer", true, null],
      created_at: ["timestamp with time zone", false, "now()"],
    },
    indexes: [
      "operational_expense_allocations_payment_id_idx",
      "operational_expense_allocations_expense_id_idx",
      "operational_expense_allocations_reversal_of_idx",
    ],
    constraints: [
      ["primary_key", "primary key (id)"],
      ["foreign_key", "foreign key (payment_id) references payments(id) on delete restrict"],
      ["foreign_key", "foreign key (expense_id) references operational_expenses(id) on delete cascade"],
      ["foreign_key", "foreign key (created_by) references users(id) on delete set null"],
      ["check", "check (amount > 0)"],
    ],
  },
  operational_vendor_payments: {
    columns: {
      id: ["integer", false, "sequence"],
      expense_id: ["integer", false, null],
      allocation_id: ["integer", true, null],
      payment_date: ["date", false, null],
      amount: ["numeric(16,2)", false, null],
      method: ["varchar(40)", false, "'Transfer'"],
      reference: ["varchar(200)", true, null],
      notes: ["text", true, null],
      status: ["varchar(32)", false, "'posted'"],
      created_by: ["integer", true, null],
      reversal_of: ["integer", true, null],
      request_key: ["varchar(100)", true, null],
      created_at: ["timestamp with time zone", false, "now()"],
    },
    indexes: [
      "operational_vendor_payments_expense_id_idx",
      "operational_vendor_payments_allocation_id_idx",
      "operational_vendor_payments_reversal_of_idx",
      "operational_vendor_payments_request_key_uidx",
    ],
    constraints: [
      ["primary_key", "primary key (id)"],
      ["foreign_key", "foreign key (expense_id) references operational_expenses(id) on delete cascade"],
      ["foreign_key", "foreign key (allocation_id) references operational_expense_allocations(id) on delete restrict"],
      ["foreign_key", "foreign key (created_by) references users(id) on delete set null"],
      ["check", "check (amount > 0)"],
    ],
  },
};

export const diagnosticSql = `
WITH wanted(table_name) AS (
  VALUES
    ('operational_expenses'),
    ('operational_expense_allocations'),
    ('operational_vendor_payments')
),
matched AS (
  SELECT
    w.table_name,
    n.nspname AS schema_name,
    c.oid AS relation_oid
  FROM wanted AS w
  JOIN pg_catalog.pg_class AS c
    ON c.relname = w.table_name
   AND c.relkind IN ('r', 'p')
  JOIN pg_catalog.pg_namespace AS n
    ON n.oid = c.relnamespace
  WHERE n.nspname NOT IN ('pg_catalog', 'information_schema')
)
SELECT section, schema_name, table_name, object_name, details
FROM (
  SELECT
    'environment'::text AS section,
    current_schema()::text AS schema_name,
    NULL::text AS table_name,
    NULL::text AS object_name,
    jsonb_build_object(
      'database', current_database(),
      'current_schema', current_schema(),
      'search_path', current_setting('search_path'),
      'explicit_search_path_schemas', current_schemas(false),
      'expected_schema_from_repository', 'public'
    ) AS details

  UNION ALL

  SELECT
    'table_presence',
    'public',
    w.table_name,
    w.table_name,
    jsonb_build_object(
      'exists_in_expected_schema',
        pg_catalog.to_regclass(
          pg_catalog.format('%I.%I', 'public', w.table_name)
        ) IS NOT NULL,
      'found_in_non_system_schemas',
        COALESCE(
          (
            SELECT jsonb_agg(m.schema_name ORDER BY m.schema_name)
            FROM matched AS m
            WHERE m.table_name = w.table_name
          ),
          '[]'::jsonb
        )
    )
  FROM wanted AS w

  UNION ALL

  SELECT
    'column',
    m.schema_name,
    m.table_name,
    a.attname,
    jsonb_build_object(
      'ordinal_position', a.attnum,
      'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
      'nullable', NOT a.attnotnull,
      'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid),
      'identity', NULLIF(a.attidentity, ''),
      'generated', NULLIF(a.attgenerated, '')
    )
  FROM matched AS m
  JOIN pg_catalog.pg_attribute AS a
    ON a.attrelid = m.relation_oid
   AND a.attnum > 0
   AND NOT a.attisdropped
  LEFT JOIN pg_catalog.pg_attrdef AS d
    ON d.adrelid = a.attrelid
   AND d.adnum = a.attnum

  UNION ALL

  SELECT
    'constraint',
    m.schema_name,
    m.table_name,
    con.conname,
    jsonb_build_object(
      'kind',
        CASE con.contype
          WHEN 'p' THEN 'primary_key'
          WHEN 'f' THEN 'foreign_key'
          WHEN 'u' THEN 'unique'
          WHEN 'c' THEN 'check'
          WHEN 'x' THEN 'exclusion'
          ELSE con.contype::text
        END,
      'definition', pg_catalog.pg_get_constraintdef(con.oid, true),
      'validated', con.convalidated,
      'deferrable', con.condeferrable,
      'initially_deferred', con.condeferred
    )
  FROM matched AS m
  JOIN pg_catalog.pg_constraint AS con
    ON con.conrelid = m.relation_oid

  UNION ALL

  SELECT
    'index',
    m.schema_name,
    m.table_name,
    i.indexname,
    jsonb_build_object('definition', i.indexdef)
  FROM matched AS m
  JOIN pg_catalog.pg_indexes AS i
    ON i.schemaname = m.schema_name
   AND i.tablename = m.table_name
) AS diagnostic
ORDER BY section, schema_name, table_name, object_name
`;

function normalizeType(type) {
  return type
    .toLowerCase()
    .replace(/^character varying/, "varchar")
    .replace(/^int4$/, "integer")
    .replace(/^bool$/, "boolean")
    .replace(/^timestamptz$/, "timestamp with time zone");
}

function normalizeDefault(value) {
  if (value == null) return null;
  return value
    .toLowerCase()
    .replace(/::[a-zA-Z0-9_ ]+(\[\])?/g, "")
    .replace(/\s+/g, "")
    .replace(/^\((.*)\)$/, "$1");
}

function normalizeConstraint(value) {
  return value
    .toLowerCase()
    .replaceAll('"', "")
    .replace(/::[a-z0-9_ ]+(\[\])?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function compareSchema(rows) {
  const tableNames = Object.keys(expectedTables);
  const presentTables = new Set(
    rows
      .filter((row) => row.section === "table_presence" && row.schema_name === expectedSchema)
      .filter((row) => row.details.exists_in_expected_schema)
      .map((row) => row.table_name),
  );
  const columns = new Map();
  const indexes = new Map();
  const constraints = new Map();

  for (const row of rows) {
    if (row.schema_name !== expectedSchema || !row.table_name) continue;
    if (row.section === "column") {
      if (!columns.has(row.table_name)) columns.set(row.table_name, new Map());
      columns.get(row.table_name).set(row.object_name, row.details);
    }
    if (row.section === "index") {
      if (!indexes.has(row.table_name)) indexes.set(row.table_name, new Set());
      indexes.get(row.table_name).add(row.object_name);
    }
    if (row.section === "constraint") {
      if (!constraints.has(row.table_name)) constraints.set(row.table_name, []);
      constraints.get(row.table_name).push(row.details);
    }
  }

  const differences = [];
  const additionalColumns = [];
  for (const tableName of tableNames) {
    if (!presentTables.has(tableName)) {
      differences.push({ table: tableName, issue: "missing_table", expected_schema: expectedSchema });
      continue;
    }

    const actualColumns = columns.get(tableName) ?? new Map();
    for (const [columnName, [expectedType, nullable, defaultValue]] of Object.entries(expectedTables[tableName].columns)) {
      const actual = actualColumns.get(columnName);
      if (!actual) {
        differences.push({ table: tableName, column: columnName, issue: "missing_column" });
        continue;
      }
      if (normalizeType(actual.type) !== normalizeType(expectedType)) {
        differences.push({
          table: tableName,
          column: columnName,
          issue: "type_mismatch",
          expected: expectedType,
          actual: actual.type,
        });
      }
      if (actual.nullable !== nullable) {
        differences.push({
          table: tableName,
          column: columnName,
          issue: "nullable_mismatch",
          expected: nullable,
          actual: actual.nullable,
        });
      }
      const defaultMatches = defaultValue === "sequence"
        ? typeof actual.default === "string" && actual.default.toLowerCase().startsWith("nextval(")
        : normalizeDefault(actual.default) === normalizeDefault(defaultValue);
      if (!defaultMatches) {
        differences.push({
          table: tableName,
          column: columnName,
          issue: "default_mismatch",
          expected: defaultValue,
          actual: actual.default,
        });
      }
    }
    for (const columnName of actualColumns.keys()) {
      if (!(columnName in expectedTables[tableName].columns)) {
        additionalColumns.push({ table: tableName, column: columnName });
      }
    }

    const actualIndexes = indexes.get(tableName) ?? new Set();
    for (const indexName of expectedTables[tableName].indexes) {
      if (!actualIndexes.has(indexName)) {
        differences.push({ table: tableName, object: indexName, issue: "missing_index" });
      }
    }
    const actualConstraints = constraints.get(tableName) ?? [];
    for (const [kind, definition] of expectedTables[tableName].constraints) {
      const found = actualConstraints.some((actual) =>
        actual.kind === kind && normalizeConstraint(actual.definition).includes(definition),
      );
      if (!found) {
        differences.push({
          table: tableName,
          constraint: definition,
          issue: `missing_${kind}_constraint`,
        });
      }
    }
  }

  return {
    expected_schema: expectedSchema,
    required_objects_match: differences.length === 0,
    differences,
    additional_columns: additionalColumns,
  };
}

async function runDiagnostic() {
  if (!process.env.DATABASE_URL) {
    console.error(JSON.stringify({
      error: "Set DATABASE_URL through a secret environment mechanism before running this diagnostic.",
      detail: "No database connection was attempted.",
    }));
    process.exitCode = 1;
    return;
  }

  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 8_000,
    statement_timeout: 12_000,
    application_name: "nufatur-operational-finance-schema-diagnostic",
  });

  let transactionStarted = false;
  try {
    await client.connect();
    await client.query("BEGIN READ ONLY");
    transactionStarted = true;
    const { rows } = await client.query(diagnosticSql);
    await client.query("COMMIT");
    transactionStarted = false;

    console.log(JSON.stringify({
      diagnostic: "operational-finance-schema",
      read_only_transaction: true,
      repository_schema: expectedSchema,
      schema_comparison: compareSchema(rows),
      catalog: rows,
    }, null, 2));
  } catch (error) {
    let rollbackFailed = false;
    if (transactionStarted) {
      try {
        await client.query("ROLLBACK");
      } catch {
        rollbackFailed = true;
      }
    }
    const code = error && typeof error === "object" && "code" in error && typeof error.code === "string"
      ? error.code
      : null;
    console.error(JSON.stringify({
      error: "Operational Finance schema diagnostic failed.",
      code,
      rollback_failed: rollbackFailed,
      detail: "No schema or data changes were attempted. Connection details are intentionally omitted.",
    }));
    process.exitCode = 1;
  } finally {
    await client.end();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await runDiagnostic();
}
