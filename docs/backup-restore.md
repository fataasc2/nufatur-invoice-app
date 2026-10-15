# Database Backup and Restore

The API uses PostgreSQL custom-format dumps from the native `pg_dump` and `pg_restore` tools. The web server never executes a command supplied by an upload; it passes only a server-created temporary filename to fixed binaries.

## Runtime requirements

The runtime image must provide `pg_dump` and `pg_restore` on `PATH`, or set `PG_DUMP_BIN` and `PG_RESTORE_BIN` to trusted absolute executable paths. `DATABASE_URL` is read only by the server process and is never returned by the API.

## First-time bootstrap

Production startup checks database connectivity with a read-only query; it does not change the schema or seed data. For a new database, run these steps explicitly before starting the web service:

```text
pnpm --filter @workspace/db run push
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run bootstrap
```

Do not run `bootstrap` after restoring a complete backup. A restored database already contains users, settings, and business data.

## Schema updates

This repository generally uses Drizzle Kit `push`, with reviewed, versioned SQL migrations for Operational Finance and receipt schema changes. Tables and constraints are declared in `lib/db/src/schema/index.ts` and are not created by API startup. Startup performs only `SELECT 1` and never runs DDL, seed, or reset commands.

The additive migration `lib/db/migrations/0001_operational_finance.sql` creates the three Operational Finance tables, their foreign keys, checks, and indexes. Migration `0002_operational_vendor_payment_idempotency.sql` adds a nullable vendor-payment request key and a partial unique index; it leaves all existing transaction rows and their request keys untouched. Migration `0003_standalone_receipts.sql` makes `receipts.payment_id` nullable so administrators can create receipts without an invoice payment, while preserving existing receipt rows and payment links. Migration `0004_receipt_items.sql` creates persistent ordered receipt details and backfills one detail from every existing receipt without changing receipt totals, links, or other columns. Migration 0001's transaction-scoped preflight stops before DDL if any target relation already exists or if a required parent table lacks an integer, non-null primary-key `id`. Test the migrations against disposable PostgreSQL with:

```text
pnpm --filter @workspace/db run test:operational-finance-migration
```

Before applying a migration to an existing database, inspect its schema and review the proposed change. The read-only Operational Finance catalog diagnostic compares the three Finance tables in `public` against the repository schema and reports columns, constraints, and indexes:

```text
pnpm --filter @workspace/db run diagnose:operational-finance
```

Provide `DATABASE_URL` to this command through a trusted secret environment mechanism; the diagnostic does not print connection details and runs its catalog query inside a PostgreSQL `READ ONLY` transaction. It does not alter data or schema. Run it only for an environment you are authorized to inspect. Do not use `push` or `push-force` as a production repair without first establishing the actual schema and reviewing a migration plan. Do not run `bootstrap` for an existing database.

When using the Railway CLI, run it locally with variables from the PostgreSQL service (replace the service name with the one shown in Railway):

```text
railway run --no-local --service <PostgreSQL service name> --environment production pnpm --filter @workspace/db run diagnose:operational-finance
```

The command prints only catalog metadata and the comparison result; it intentionally omits connection details. Review the output before sharing it, since it includes schema/table/column names and the database name.

After the existing Operational Finance schema is confirmed with the read-only diagnostic, apply only the new additive migration to the explicitly selected database:

```text
psql -v ON_ERROR_STOP=1 -f lib/db/migrations/0002_operational_vendor_payment_idempotency.sql
```

The migration manages its own transaction. Never run it from API startup, against an unverified target, or as a substitute for the 0001 migration on a database that does not have the existing Finance tables.

For standalone receipt support, first verify that `public.receipts.payment_id` exists and is an integer using a read-only catalog query. Then apply only migration 0003 to the explicitly selected database:

```text
psql -v ON_ERROR_STOP=1 -f lib/db/migrations/0003_standalone_receipts.sql
```

This migration only drops the `NOT NULL` requirement on `payment_id`; it does not rewrite or delete existing receipts. Do not run it against an unverified target.

For multi-payment receipts, verify that `public.receipts` and `public.payments` exist, then apply migration 0004 to the explicitly selected database:

```text
psql -v ON_ERROR_STOP=1 -f lib/db/migrations/0004_receipt_items.sql
```

This additive migration inserts a single legacy detail for each receipt that has no details yet. It keeps the existing receipt amount and payment relationship intact, and does not run automatically at API startup.

## Local smoke test

Use a non-production PostgreSQL database and configured PostgreSQL client tools:

```text
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/api-server run start
```

Then log in through the application, download a `.dump` file from Settings, and restore it into a disposable database first. The restore endpoint validates the archive with `pg_restore --list`, creates a temporary dump of the current database, restores with `--clean --if-exists --exit-on-error --single-transaction`, and attempts to restore the safety dump if the requested restore fails.

Authenticated application routes use the same PostgreSQL advisory lock while accessing the database, so invoice, payment, receipt, and settings requests wait while a restore is in progress.

Restore is a two-step flow:

1. `POST /api/admin/database/restore/prepare` uploads and validates the archive, then returns a short-lived confirmation token.
2. `POST /api/admin/database/restore/confirm` accepts that token and starts the protected restore.
3. `POST /api/admin/database/restore/cancel` invalidates an unused token when the operator cancels.

The token is bound to the authenticated user and session cookie, is stored only as a hash, expires after ten minutes, and cannot be reused. `pg_restore --list` validates the archive structure but does not prove that its SQL/object definitions are trusted. Restore only backups generated by a trusted NUFATUR environment.

The pending token and temporary dump are process-local. The prepare and confirm requests must reach the same running instance; a process restart or a multi-replica deployment invalidates the pending operation. The PostgreSQL advisory lock coordinates application connections that use this server, but does not stop direct SQL connections, external jobs, or other services that do not acquire the same lock.

## Railway checklist

- Ensure the Railway runtime contains trusted PostgreSQL client binaries.
- Configure `DATABASE_URL`, `SESSION_SECRET`, and the existing application secrets in Railway's secret environment settings.
- Run schema push and bootstrap as a controlled one-time operation for a new database only.
- Keep the web service start command pointed at `api-server run start`; it performs a read-only connectivity check and must not run schema push or bootstrap.
- Test backup and restore against a disposable Railway PostgreSQL database before using a production dump.
- Never place a dump file in the public directory or commit it to Git.
