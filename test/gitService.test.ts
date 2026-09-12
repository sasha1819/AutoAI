import { describe, expect, it } from 'vitest';
import { isValidGitUrl } from '../src/main/services/GitService';

describe('isValidGitUrl', () => {
  it('accepts a plain https GitHub URL', () => {
    expect(isValidGitUrl('https://github.com/org/repo.git')).toBe(true);
    expect(isValidGitUrl('https://github.com/org/repo')).toBe(true);
  });

  it('accepts an SSH shorthand remote', () => {
    expect(isValidGitUrl('git@github.com:org/repo.git')).toBe(true);
  });

  it('rejects a URL with embedded credentials', () => {
    expect(isValidGitUrl('https://user:token@github.com/org/repo.git')).toBe(false);
  });

  it('rejects a value that looks like a git flag rather than a URL', () => {
    expect(isValidGitUrl('--upload-pack=touch /tmp/pwned')).toBe(false);
  });

  it('rejects strings with shell metacharacters', () => {
    expect(isValidGitUrl('https://github.com/org/repo.git; rm -rf /')).toBe(false);
  });

  it('rejects a non-git scheme', () => {
    expect(isValidGitUrl('file:///etc/passwd')).toBe(false);
    expect(isValidGitUrl('ftp://example.com/repo')).toBe(false);
  });

  it('rejects strings with leading/trailing whitespace', () => {
    expect(isValidGitUrl('  https://github.com/org/repo.git')).toBe(false);
  });
});
