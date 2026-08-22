import { describe, it, expect, beforeAll } from 'vitest';
import { encryptKey, decryptKey } from '@/lib/ai/crypto';

beforeAll(() => {
  // Set the encryption key for tests
  process.env.AI_KEY_ENCRYPTION_KEY = 'Z0fP2Xr8YwL7kL6qU5z9VhY2TgR4eW8Qz1A7sD9nK8M=';
});

describe('crypto', () => {
  it('encrypts and decrypts a key correctly', () => {
    const testKey = 'AQ.Ab8.some-google-api-key-with-more-chars';
    const encrypted = encryptKey(testKey);

    expect(encrypted.ciphertext).toBeDefined();
    expect(encrypted.iv).toBeDefined();
    expect(encrypted.lastFour).toBe('hars'); // last 4 chars of testKey

    const decrypted = decryptKey(encrypted.ciphertext, encrypted.iv);
    expect(decrypted).toBe(testKey);
  });

  it('produces different ciphertext for same input (IV randomness)', () => {
    const testKey = 'test-key-1234';
    const encrypted1 = encryptKey(testKey);
    const encrypted2 = encryptKey(testKey);

    // IVs should be different
    expect(encrypted1.iv).not.toBe(encrypted2.iv);
    // Ciphertexts should be different (due to different IVs)
    expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);

    // But both should decrypt to the same original
    expect(decryptKey(encrypted1.ciphertext, encrypted1.iv)).toBe(testKey);
    expect(decryptKey(encrypted2.ciphertext, encrypted2.iv)).toBe(testKey);
  });

  it('fails to decrypt with wrong IV', () => {
    const testKey = 'test-key-1234';
    const encrypted = encryptKey(testKey);

    expect(() => decryptKey(encrypted.ciphertext, '000000000000000000000000')).toThrow();
  });

  it('fails to decrypt with tampered ciphertext', () => {
    const testKey = 'test-key-1234';
    const encrypted = encryptKey(testKey);

    // Flip a bit in the ciphertext
    const tampered = encrypted.ciphertext.slice(0, -1) + (encrypted.ciphertext.slice(-1) === '0' ? '1' : '0');
    expect(() => decryptKey(tampered, encrypted.iv)).toThrow();
  });
});