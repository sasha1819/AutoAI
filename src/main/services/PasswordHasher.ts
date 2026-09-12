import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scryptAsync = promisify(scrypt);

const KEY_LENGTH = 64;
const SALT_BYTES = 16;

/**
 * One-way password hashing for the local-only profile store. We never store
 * (or need to recover) the plaintext password - only enough to verify a
 * later attempt matches. scrypt is Node's built-in memory-hard KDF, so this
 * needs no extra dependency and no native module.
 */
export class PasswordHasher {
  public async hash(plainPassword: string): Promise<{ hash: string; salt: string }> {
    const salt = randomBytes(SALT_BYTES).toString('hex');
    const derived = (await scryptAsync(plainPassword, salt, KEY_LENGTH)) as Buffer;
    return { hash: derived.toString('hex'), salt };
  }

  public async verify(plainPassword: string, hash: string, salt: string): Promise<boolean> {
    const derived = (await scryptAsync(plainPassword, salt, KEY_LENGTH)) as Buffer;
    const stored = Buffer.from(hash, 'hex');

    // Guard length mismatch before timingSafeEqual, which throws on unequal buffer sizes.
    if (derived.length !== stored.length) {
      return false;
    }

    return timingSafeEqual(derived, stored);
  }
}
