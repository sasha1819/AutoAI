import { describe, expect, it } from 'vitest';
import { PasswordHasher } from '../src/main/services/PasswordHasher';

describe('PasswordHasher', () => {
  it('verifies the correct password against its own hash', async () => {
    const hasher = new PasswordHasher();
    const { hash, salt } = await hasher.hash('correct horse battery staple');

    await expect(hasher.verify('correct horse battery staple', hash, salt)).resolves.toBe(true);
  });

  it('rejects an incorrect password', async () => {
    const hasher = new PasswordHasher();
    const { hash, salt } = await hasher.hash('correct horse battery staple');

    await expect(hasher.verify('wrong password', hash, salt)).resolves.toBe(false);
  });

  it('never stores the plaintext password in the hash or salt', async () => {
    const hasher = new PasswordHasher();
    const plain = 'super-secret-password';
    const { hash, salt } = await hasher.hash(plain);

    expect(hash).not.toContain(plain);
    expect(salt).not.toContain(plain);
  });

  it('produces a different hash for the same password on every call (random salt)', async () => {
    const hasher = new PasswordHasher();
    const first = await hasher.hash('same-password');
    const second = await hasher.hash('same-password');

    expect(first.salt).not.toBe(second.salt);
    expect(first.hash).not.toBe(second.hash);
  });

  it('does not throw when comparing against a hash of a different length', async () => {
    const hasher = new PasswordHasher();
    await expect(hasher.verify('anything', 'deadbeef', 'aabbcc')).resolves.toBe(false);
  });
});
