import { describe, expect, it } from 'vitest';
import { computeRunDisabledReason, describeRunError, RUN_DISABLED_REASON_COPY } from '../src/renderer/src/lib/runErrors';

describe('computeRunDisabledReason', () => {
  it('reports NO_SCRIPT when there is no script, regardless of the other two', () => {
    expect(computeRunDisabledReason(false, false, false)).toBe('NO_SCRIPT');
    expect(computeRunDisabledReason(false, true, true)).toBe('NO_SCRIPT');
  });

  it('reports NO_BASE_URL when there is a script but no base URL', () => {
    expect(computeRunDisabledReason(true, false, false)).toBe('NO_BASE_URL');
    expect(computeRunDisabledReason(true, false, true)).toBe('NO_BASE_URL');
  });

  it('reports BROWSERS_MISSING only once script and base URL are both satisfied', () => {
    expect(computeRunDisabledReason(true, true, true)).toBe('BROWSERS_MISSING');
  });

  it('reports nothing blocking once all three are satisfied', () => {
    expect(computeRunDisabledReason(true, true, false)).toBeNull();
  });
});

describe('RUN_DISABLED_REASON_COPY', () => {
  it('has copy for every reason code', () => {
    expect(RUN_DISABLED_REASON_COPY.NO_SCRIPT).toContain('no runnable script');
    expect(RUN_DISABLED_REASON_COPY.NO_BASE_URL).toContain('project URL');
    expect(RUN_DISABLED_REASON_COPY.BROWSERS_MISSING).toBe(describeRunError('BROWSER_NOT_READY'));
  });
});
