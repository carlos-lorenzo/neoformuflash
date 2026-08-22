/**
 * BYOK key encryption using AES-256-GCM.
 *
 * Runs in Node runtime (server actions / route handlers). Never in Edge or client.
 * Key from env AI_KEY_ENCRYPTION_KEY (32 bytes, base64 or hex).
 *
 * The ciphertext + IV are stored in user_api_keys (bytea). The authenticated role
 * has NO select grant on those columns (phase 01 grant discipline). Only service_role
 * can read them — this file is the ONLY code path that does.
 *
 * last_four is the last 4 chars of the raw key, computed server-side and stored
 * for display. It is never trusted from the client.
 */

import { createSecretKey, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

function getMasterKey(): Uint8Array {
  const env = process.env.AI_KEY_ENCRYPTION_KEY;
  if (!env) throw new Error('AI_KEY_ENCRYPTION_KEY not set');

  // Accept base64 or hex
  let buf: Buffer;
  try {
    buf = Buffer.from(env, 'base64');
    if (buf.length !== 32) throw new Error();
  } catch {
    try {
      buf = Buffer.from(env, 'hex');
      if (buf.length !== 32) throw new Error();
    } catch {
      throw new Error('AI_KEY_ENCRYPTION_KEY must be 32 bytes (base64 or hex)');
    }
  }
  return new Uint8Array(buf);
}

/** Encrypt a plaintext API key. Returns hex-encoded ciphertext, IV, and last_four. */
export function encryptKey(plaintext: string): { ciphertext: string; iv: string; lastFour: string } {
  const masterKey = getMasterKey();
  const iv = randomBytes(12); // 96-bit IV for GCM
  const key = createSecretKey(masterKey);

  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Store ciphertext || authTag as single bytea (Postgres doesn't separate them)
  const combined = Buffer.concat([ct, authTag]);

  return {
    ciphertext: combined.toString('hex'),
    iv: iv.toString('hex'),
    lastFour: plaintext.slice(-4),
  };
}

/** Decrypt a ciphertext+authTag (hex) + IV (hex) back to plaintext. */
export function decryptKey(ciphertextHex: string, ivHex: string): string {
  const masterKey = getMasterKey();
  const iv = Buffer.from(ivHex, 'hex');
  const combined = Buffer.from(ciphertextHex, 'hex');

  // Last 16 bytes are the auth tag
  const authTag = combined.slice(-16);
  const ct = combined.slice(0, -16);

  const key = createSecretKey(masterKey);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);

  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}