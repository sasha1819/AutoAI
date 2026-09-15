import { describe, expect, it } from 'vitest';
import { validateEmailFormat, validatePasswordLength, validateRequired } from '../src/renderer/src/lib/authValidation';

describe('validateEmailFormat', () => {
  it('accepts a plausible email', () => {
    expect(validateEmailFormat('sasha@example.com')).toBeNull();
  });

  it('trims surrounding whitespace before checking', () => {
    expect(validateEmailFormat('  sasha@example.com  ')).toBeNull();
  });

  it('rejects an empty or whitespace-only value with the "please enter" message', () => {
    expect(validateEmailFormat('')).toBe('Please enter your email.');
    expect(validateEmailFormat('   ')).toBe('Please enter your email.');
  });

  it('rejects a malformed address with the "not valid" message', () => {
    expect(validateEmailFormat('not-an-email')).toBe('That doesn’t look like a valid email address.');
    expect(validateEmailFormat('missing-domain@')).toBe('That doesn’t look like a valid email address.');
    expect(validateEmailFormat('@missing-local.com')).toBe('That doesn’t look like a valid email address.');
    expect(validateEmailFormat('no spaces@allowed.com')).toBe('That doesn’t look like a valid email address.');
  });
});

describe('validateRequired', () => {
  it('is null once something is typed', () => {
    expect(validateRequired('Sasha', 'name')).toBeNull();
  });

  it('names the field in the message for an empty or whitespace-only value', () => {
    expect(validateRequired('', 'name')).toBe('Please enter your name.');
    expect(validateRequired('   ', 'name')).toBe('Please enter your name.');
  });
});

describe('validatePasswordLength', () => {
  it('accepts a password at or above the minimum', () => {
    expect(validatePasswordLength('exactly8')).toBeNull();
    expect(validatePasswordLength('well over the minimum length')).toBeNull();
  });

  it('gives a distinct message for empty vs. merely too short', () => {
    expect(validatePasswordLength('')).toBe('Please enter a password.');
    expect(validatePasswordLength('short')).toBe('Password needs to be at least 8 characters.');
  });
});
