import crypto from "node:crypto";
import fs from "node:fs";
import { pipeline } from "node:stream/promises";

// ---------------------------------------------------------------------------
// Cryptographic constants
// ---------------------------------------------------------------------------

const ALGORITHM = "aes-256-gcm";
const KEY_LENGTH = 32; // 256 bits
const IV_LENGTH = 12; // 96 bits (recommended for GCM)
const SALT_LENGTH = 32;
const TAG_LENGTH = 16; // GCM auth tag
const PBKDF2_ITERATIONS = 600_000;
const DIGEST = "sha512";

/** Binary, streamable backup envelope. The GCM tag is deliberately last so
 * encrypted data can be written without retaining it in memory. */
export const STREAM_BACKUP_MAGIC = Buffer.from("REMI3BK1");
const STREAM_HEADER_LENGTH = STREAM_BACKUP_MAGIC.length + SALT_LENGTH + IV_LENGTH;

export function isStreamBackup(buffer: Buffer): boolean {
  return buffer.subarray(0, STREAM_BACKUP_MAGIC.length).equals(STREAM_BACKUP_MAGIC);
}

function deriveKey(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    crypto.pbkdf2(password, salt, PBKDF2_ITERATIONS, KEY_LENGTH, DIGEST, (err: Error | null, key: Buffer) =>
      err ? reject(err) : resolve(key),
    );
  });
}

/** Encrypt a readable source directly into a v3 backup file. */
export async function encryptBackupStream(
  source: NodeJS.ReadableStream,
  destination: string,
  password: string,
): Promise<number> {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = await deriveKey(password, salt);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const output = fs.createWriteStream(destination, { flags: "wx", mode: 0o600 });

  output.write(Buffer.concat([STREAM_BACKUP_MAGIC, salt, iv]));
  await pipeline(source, cipher, output, { end: false });
  await new Promise<void>((resolve, reject) => output.write(cipher.getAuthTag(), (err) => err ? reject(err) : resolve()));
  await new Promise<void>((resolve, reject) => output.end((err?: Error | null) => err ? reject(err) : resolve()));
  return (await fs.promises.stat(destination)).size;
}

/** Decrypt a v3 file. Kept separate from legacy base64 encryption. */
export async function decryptBackupStreamFile(
  input: string,
  output: string,
  password: string,
): Promise<void> {
  const stat = await fs.promises.stat(input);
  if (stat.size <= STREAM_HEADER_LENGTH + TAG_LENGTH) throw new Error("Backup file is too short or corrupted.");
  const header = Buffer.alloc(STREAM_HEADER_LENGTH);
  const handle = await fs.promises.open(input, "r");
  try { await handle.read(header, 0, header.length, 0); } finally { await handle.close(); }
  if (!isStreamBackup(header)) throw new Error("Backup file is not a v3 stream backup.");
  const salt = header.subarray(STREAM_BACKUP_MAGIC.length, STREAM_BACKUP_MAGIC.length + SALT_LENGTH);
  const iv = header.subarray(STREAM_BACKUP_MAGIC.length + SALT_LENGTH);
  const tag = Buffer.alloc(TAG_LENGTH);
  const tagHandle = await fs.promises.open(input, "r");
  try { await tagHandle.read(tag, 0, TAG_LENGTH, stat.size - TAG_LENGTH); } finally { await tagHandle.close(); }
  const decipher = crypto.createDecipheriv(ALGORITHM, await deriveKey(password, salt), iv);
  decipher.setAuthTag(tag);
  await pipeline(
    fs.createReadStream(input, { start: STREAM_HEADER_LENGTH, end: stat.size - TAG_LENGTH - 1 }),
    decipher,
    fs.createWriteStream(output, { flags: "wx", mode: 0o600 }),
  );
}

// ---------------------------------------------------------------------------
// Encrypt a JSON string into a binary buffer
// ---------------------------------------------------------------------------

export interface EncryptedPayload {
  /** Base64-encoded concatenation: salt || iv || authTag || ciphertext */
  data: string;
}

/**
 * Encrypt a JSON string with a password using AES-256-GCM.
 *
 * Key derivation: PBKDF2 (SHA-512, 600k iterations) with a random 32‑byte salt.
 * Encryption: AES-256-GCM with a random 12‑byte IV.
 *
 * Returns a base64-encoded blob: salt (32) || iv (12) || authTag (16) || ciphertext.
 */
export function encryptBackup(plaintext: string, password: string): string {
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    DIGEST,
  );

  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([salt, iv, authTag, encrypted]).toString("base64");
}

// ---------------------------------------------------------------------------
// Decrypt a buffer back into a JSON string
// ---------------------------------------------------------------------------

/**
 * Decrypt a base64-encoded backup blob with a password.
 *
 * Expects the format produced by `encryptBackup`:
 *   salt (32) || iv (12) || authTag (16) || ciphertext
 *
 * Returns the original JSON string, or throws on wrong password / corruption.
 */
export function decryptBackup(encoded: string, password: string): string {
  const buffer = Buffer.from(encoded, "base64");

  if (buffer.length < SALT_LENGTH + IV_LENGTH + TAG_LENGTH + 1) {
    throw new Error("Backup file is too short or corrupted.");
  }

  let offset = 0;
  const salt = buffer.subarray(offset, (offset += SALT_LENGTH));
  const iv = buffer.subarray(offset, (offset += IV_LENGTH));
  const authTag = buffer.subarray(offset, (offset += TAG_LENGTH));
  const ciphertext = buffer.subarray(offset);

  const key = crypto.pbkdf2Sync(
    password,
    salt,
    PBKDF2_ITERATIONS,
    KEY_LENGTH,
    DIGEST,
  );

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  return decipher.update(ciphertext) + decipher.final("utf8");
}
