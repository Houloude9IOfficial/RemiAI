import crypto from "node:crypto";
import { and, eq, isNull, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { authAccounts, authBootstrap, authSessions } from "@/db/schema";

export const SESSION_COOKIE = "remiai_session";
const ACCOUNT_ID = 1;
const SESSION_DAYS = 30;
const DEMO_EMAIL = process.env.DEMO_AUTH_EMAIL?.trim().toLowerCase();
const DEMO_PASSWORD = process.env.DEMO_AUTH_PASSWORD;
const DEMO_DISPLAY_NAME = process.env.DEMO_AUTH_DISPLAY_NAME?.trim() || "Demo Visitor";
const PASSWORD_COST = 16384;
const PASSWORD_BLOCK_SIZE = 8;
const PASSWORD_PARALLELISM = 1;
let bootstrapPrinted = false;

export type AuthAccount = { id: number; email: string; displayName: string };

function now() { return new Date().toISOString(); }

function hashPassword(password: string, salt = crypto.randomBytes(16)) {
  return {
    salt: salt.toString("base64"),
    hash: crypto.scryptSync(password, salt, 64, {
      N: PASSWORD_COST,
      r: PASSWORD_BLOCK_SIZE,
      p: PASSWORD_PARALLELISM,
    }).toString("base64"),
  };
}

function verifyPassword(password: string, saltText: string, hashText: string) {
  try {
    const actual = crypto.scryptSync(password, Buffer.from(saltText, "base64"), 64, {
      N: PASSWORD_COST,
      r: PASSWORD_BLOCK_SIZE,
      p: PASSWORD_PARALLELISM,
    });
    const expected = Buffer.from(hashText, "base64");
    return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
  } catch { return false; }
}

function digestToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function publicAccount(row: typeof authAccounts.$inferSelect): AuthAccount {
  return { id: row.id, email: row.email, displayName: row.displayName };
}

export function hasAccount() {
  return Boolean(db.select({ id: authAccounts.id }).from(authAccounts).where(eq(authAccounts.id, ACCOUNT_ID)).get());
}

export function ensureDemoAccount() {
  if (process.env.DEMO?.trim().toLowerCase() !== "true") return;
  if (!DEMO_EMAIL || !DEMO_PASSWORD || DEMO_PASSWORD.length < 8) {
    throw new Error("Demo authentication requires DEMO_AUTH_EMAIL and DEMO_AUTH_PASSWORD (minimum 8 characters).");
  }
  if (hasAccount()) return;
  const passwordData = hashPassword(DEMO_PASSWORD);
  db.insert(authAccounts).values({
    id: ACCOUNT_ID,
    email: DEMO_EMAIL,
    displayName: DEMO_DISPLAY_NAME,
    passwordHash: passwordData.hash,
    passwordSalt: passwordData.salt,
  }).run();
}

export function ensureBootstrapCode() {
  if (hasAccount()) return;
  if (bootstrapPrinted) return;
  const code = crypto.randomBytes(6).toString("hex").toUpperCase();
  const { hash, salt } = hashPassword(code);
  db.insert(authBootstrap).values({ id: ACCOUNT_ID, codeHash: `${salt}:${hash}` })
    .onConflictDoUpdate({
      target: authBootstrap.id,
      set: { codeHash: `${salt}:${hash}`, consumedAt: null, createdAt: now() },
    })
    .run();
  bootstrapPrinted = true;
  console.log(`\n🔐 RemiAI signup code: ${code}\n   Use this code to create the first account. It will be consumed once.\n`);
}

export function signup(email: string, password: string, displayName: string, code: string) {
  if (hasAccount()) throw new Error("An account already exists.");
  const bootstrap = db.select().from(authBootstrap).where(eq(authBootstrap.id, ACCOUNT_ID)).get();
  if (!bootstrap || bootstrap.consumedAt) throw new Error("Signup is not available.");
  const [salt, hash] = bootstrap.codeHash.split(":");
  if (!salt || !hash || !verifyPassword(code, salt, hash)) throw new Error("Invalid signup code.");
  const passwordData = hashPassword(password);
  const account = db.transaction((tx) => {
    const created = tx.insert(authAccounts).values({
      id: ACCOUNT_ID, email, displayName, passwordHash: passwordData.hash, passwordSalt: passwordData.salt,
    }).returning().get();
    tx.update(authBootstrap).set({ consumedAt: now() }).where(eq(authBootstrap.id, ACCOUNT_ID)).run();
    return created;
  });
  return publicAccount(account);
}

export function authenticate(email: string, password: string) {
  const account = db.select().from(authAccounts).where(eq(authAccounts.id, ACCOUNT_ID)).get();
  if (!account || account.email !== email || !verifyPassword(password, account.passwordSalt, account.passwordHash)) return null;
  return publicAccount(account);
}

export function createSession(persistent: boolean) {
  const token = crypto.randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + (persistent ? SESSION_DAYS : 1) * 86400000).toISOString();
  db.insert(authSessions).values({ tokenHash: digestToken(token), expiresAt: expires, persistent }).run();
  return { token, expires };
}

export function revokeSession(token: string | undefined) {
  if (!token) return;
  db.update(authSessions).set({ revokedAt: now() }).where(eq(authSessions.tokenHash, digestToken(token))).run();
}

export function revokeAllSessions() {
  db.update(authSessions).set({ revokedAt: now() }).where(isNull(authSessions.revokedAt)).run();
}

export function getAccountFromToken(token: string | undefined): AuthAccount | null {
  if (!token) return null;
  const session = db.select().from(authSessions).where(and(eq(authSessions.tokenHash, digestToken(token)), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now()))).get();
  if (!session) return null;
  const account = db.select().from(authAccounts).where(eq(authAccounts.id, ACCOUNT_ID)).get();
  return account ? publicAccount(account) : null;
}

export async function getCurrentAccount() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return getAccountFromToken(token);
}

export async function requireAuth() {
  const account = await getCurrentAccount();
  if (!account) throw new Error("UNAUTHORIZED");
  return account;
}

export function changePassword(current: string, next: string) {
  const account = db.select().from(authAccounts).where(eq(authAccounts.id, ACCOUNT_ID)).get();
  if (!account || !verifyPassword(current, account.passwordSalt, account.passwordHash)) throw new Error("Current password is incorrect.");
  const passwordData = hashPassword(next);
  db.update(authAccounts).set({ passwordHash: passwordData.hash, passwordSalt: passwordData.salt, updatedAt: now() }).where(eq(authAccounts.id, ACCOUNT_ID)).run();
  revokeAllSessions();
}

export function resetPassword(password: string) {
  const account = db.select().from(authAccounts).where(eq(authAccounts.id, ACCOUNT_ID)).get();
  if (!account) throw new Error("No account exists.");
  const passwordData = hashPassword(password);
  db.update(authAccounts).set({ passwordHash: passwordData.hash, passwordSalt: passwordData.salt, updatedAt: now() }).where(eq(authAccounts.id, ACCOUNT_ID)).run();
  revokeAllSessions();
}
