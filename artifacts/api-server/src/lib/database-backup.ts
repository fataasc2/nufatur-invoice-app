import { createWriteStream } from "node:fs";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import type { IncomingMessage } from "node:http";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { pool } from "@workspace/db";

export const MAX_BACKUP_BYTES = 512 * 1024 * 1024;
export const RESTORE_CONFIRMATION_TTL_MS = 10 * 60 * 1000;
const DATABASE_LOCK_KEY = 78243129;
const TOOL_ERROR = "PostgreSQL backup tools are not available or the operation failed.";
const pendingRestores = new Map<string, PendingRestore>();

export type PendingRestore = {
  tokenHash: string;
  directory: string;
  uploadedFile: string;
  userId: number;
  sessionBinding: string;
  expiresAt: number;
  used: boolean;
};

function databaseUrl(): string {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is not configured.");
  return value;
}

function toolPath(name: "dump" | "restore"): string {
  return process.env[name === "dump" ? "PG_DUMP_BIN" : "PG_RESTORE_BIN"] ?? (name === "dump" ? "pg_dump" : "pg_restore");
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function sessionBinding(sessionCookie: string | undefined): string {
  return hash(sessionCookie ?? "");
}

function sameSecret(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

function runTool(name: "dump" | "restore", args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(toolPath(name), args, { shell: false, windowsHide: true, stdio: ["ignore", "ignore", "ignore"] });
    let failed = false;
    child.once("error", () => {
      failed = true;
      reject(new Error(TOOL_ERROR));
    });
    child.once("close", (code) => {
      if (failed) return;
      if (code === 0) resolve();
      else reject(new Error(TOOL_ERROR));
    });
  });
}

export async function createTempBackupDirectory(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "nufatur-database-backup-"));
}

export async function removeTempBackupDirectory(directory: string): Promise<void> {
  await rm(directory, { recursive: true, force: true });
}

export async function prepareRestoreUpload(request: IncomingMessage, userId: number, binding: string): Promise<{ token: string; expiresAt: number; size: number }> {
  const directory = await createTempBackupDirectory();
  const uploadedFile = `${directory}/uploaded.dump`;
  try {
    await saveUploadedBackup(request, uploadedFile);
    const size = await validateBackupFile(uploadedFile);
    const token = randomBytes(32).toString("base64url");
    const expiresAt = Date.now() + RESTORE_CONFIRMATION_TTL_MS;
    const tokenHash = hash(token);
    const pending: PendingRestore = { tokenHash, directory, uploadedFile, userId, sessionBinding: binding, expiresAt, used: false };
    pendingRestores.set(tokenHash, pending);
    const cleanupTimer = setTimeout(() => {
      const current = pendingRestores.get(tokenHash);
      if (current === pending) {
        pendingRestores.delete(tokenHash);
        void removeTempBackupDirectory(directory);
      }
    }, RESTORE_CONFIRMATION_TTL_MS);
    cleanupTimer.unref();
    return { token, expiresAt, size };
  } catch (error) {
    await removeTempBackupDirectory(directory);
    throw error;
  }
}

export function claimRestore(token: string, userId: number, binding: string): PendingRestore {
  const pending = pendingRestores.get(hash(token));
  if (!pending || pending.used || pending.expiresAt <= Date.now() || pending.userId !== userId || !sameSecret(pending.sessionBinding, binding)) {
    throw new Error("Restore confirmation is invalid or expired.");
  }
  pending.used = true;
  return pending;
}

export async function cancelRestore(token: string, userId: number, binding: string): Promise<void> {
  const pending = claimRestore(token, userId, binding);
  await discardRestore(pending);
}

export async function discardRestore(pending: PendingRestore): Promise<void> {
  pendingRestores.delete(pending.tokenHash);
  await removeTempBackupDirectory(pending.directory);
}

export async function dumpDatabase(outputFile: string): Promise<void> {
  await runTool("dump", [
    "--format=custom",
    "--no-owner",
    "--no-acl",
    "--file",
    outputFile,
    "--dbname",
    databaseUrl(),
  ]);
}

export async function validateBackupFile(backupFile: string): Promise<number> {
  const details = await stat(backupFile);
  if (!details.isFile() || details.size <= 0 || details.size > MAX_BACKUP_BYTES) {
    throw new Error("Backup file size is invalid.");
  }
  await runTool("restore", ["--list", backupFile]);
  return details.size;
}

export async function restoreDatabase(backupFile: string): Promise<void> {
  await runTool("restore", [
    "--clean",
    "--if-exists",
    "--exit-on-error",
    "--single-transaction",
    "--no-owner",
    "--no-acl",
    "--dbname",
    databaseUrl(),
    backupFile,
  ]);
}

export async function verifyDatabase(): Promise<void> {
  const result = await pool.query<{ usersTable: string | null; invoicesTable: string | null }>(
    "SELECT to_regclass('public.users') AS \"usersTable\", to_regclass('public.invoices') AS \"invoicesTable\"",
  );
  const row = result.rows[0];
  if (!row?.usersTable || !row.invoicesTable) throw new Error("Database verification failed.");
}

export async function saveUploadedBackup(request: IncomingMessage, outputFile: string): Promise<number> {
  let totalBytes = 0;
  const limiter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      totalBytes += chunk.length;
      if (totalBytes > MAX_BACKUP_BYTES) {
        callback(new Error("Backup file is too large."));
        return;
      }
      callback(null, chunk);
    },
  });
  await pipeline(request, limiter, createWriteStream(outputFile, { flags: "wx", mode: 0o600 }));
  if (totalBytes === 0) throw new Error("Backup file is empty.");
  return totalBytes;
}

export async function withDatabaseLock<T>(operation: () => Promise<T>): Promise<T> {
  const client = await pool.connect();
  let lockAcquired = false;
  let result: T | undefined;
  let failure: unknown;
  try {
    await client.query("SELECT pg_advisory_lock($1)", [DATABASE_LOCK_KEY]);
    lockAcquired = true;
    result = await operation();
  } catch (error) {
    failure = error;
  } finally {
    let unlockFailure: unknown;
    if (lockAcquired) {
      try {
        await client.query("SELECT pg_advisory_unlock($1)", [DATABASE_LOCK_KEY]);
      } catch (error) {
        unlockFailure = error;
      }
    }
    if (unlockFailure) {
      client.release(unlockFailure instanceof Error ? unlockFailure : new Error("Database lock release failed."));
      if (!failure) failure = unlockFailure;
    } else {
      client.release();
    }
  }
  if (failure) {
    throw failure;
  }
  return result as T;
}
