import { createHmac, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, users } from "@workspace/db";

const COOKIE_NAME = "nufatur_session";
const SESSION_TTL_SECONDS = 60 * 60 * 8;

function secret(): string {
  const configured = process.env.SESSION_SECRET;
  if (configured) return configured;
  if (process.env.NODE_ENV === "production") throw new Error("SESSION_SECRET must be set in production.");
  return "development-only-session-secret";
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derived = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${derived}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, expected] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function sign(value: string): string {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

function encodeSession(userId: number): string {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `${userId}.${expiresAt}`;
  return `${payload}.${sign(payload)}`;
}

function decodeSession(value: string | undefined): number | null {
  if (!value) return null;
  const [userPart, expiresPart, signature] = value.split(".");
  if (!userPart || !expiresPart || !signature) return null;
  const payload = `${userPart}.${expiresPart}`;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  const expiresAt = Number(expiresPart);
  const userId = Number(userPart);
  if (!Number.isInteger(userId) || !Number.isInteger(expiresAt) || expiresAt < Math.floor(Date.now() / 1000)) return null;
  return userId;
}

export function setSession(res: Response, userId: number): void {
  res.cookie(COOKIE_NAME, encodeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_SECONDS * 1000,
    path: "/",
  });
}

export function clearSession(res: Response): void {
  res.clearCookie(COOKIE_NAME, { httpOnly: true, sameSite: "lax", path: "/" });
}

export async function currentUser(req: Request) {
  const userId = decodeSession(req.cookies?.[COOKIE_NAME]);
  if (!userId) return null;
  const rows = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

export async function requireUser(req: Request, res: Response): Promise<number | null> {
  const user = await currentUser(req);
  if (!user) {
    res.status(401).json({ message: "Sesi berakhir. Silakan masuk kembali." });
    return null;
  }
  return user.id;
}

export async function ensureOwnerAccount(): Promise<void> {
  const existing = await db.select({ id: users.id }).from(users).where(and(eq(users.username, "nufatur"))).limit(1);
  if (existing.length === 0) {
    const initialPassword = process.env.INITIAL_OWNER_PASSWORD;
    if (!initialPassword) throw new Error("INITIAL_OWNER_PASSWORD must be set before creating the owner account.");
    await db.insert(users).values({
      username: "nufatur",
      passwordHash: hashPassword(initialPassword),
      displayName: "NUFATUR",
      role: "owner",
    });
  }
}