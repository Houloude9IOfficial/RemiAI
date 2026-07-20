import crypto from "node:crypto";

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
