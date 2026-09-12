import { describe, expect, it } from 'vitest';
import type { AgentRunner, AgentRunOptions, AgentRunOutcome } from '../src/main/services/AgentRunner';
import { ClaudeConnectionService } from '../src/main/services/ClaudeConnectionService';

class FakeAgentRunner implements AgentRunner {
  public lastPrompt = '';
  public lastOptions: AgentRunOptions | null = null;

  constructor(private readonly outcome: AgentRunOutcome) {}

  async run(prompt: string, options: AgentRunOptions): Promise<AgentRunOutcome> {
    this.lastPrompt = prompt;
    this.lastOptions = options;
    return this.outcome;
  }
}

describe('ClaudeConnectionService.check', () => {
  it('reports connected when the probe query succeeds', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: 'pong', structuredOutput: undefined });
    const service = new ClaudeConnectionService(runner);

    expect(await service.check()).toEqual({ connected: true });
  });

  it('reports NOT_LOGGED_IN when the SDK surfaces an auth-shaped failure', async () => {
    const runner = new FakeAgentRunner({ ok: false, reason: 'NOT_LOGGED_IN', detail: 'authentication_failed' });
    const service = new ClaudeConnectionService(runner);

    expect(await service.check()).toEqual({
      connected: false,
      reason: 'NOT_LOGGED_IN',
      detail: 'authentication_failed',
    });
  });

  it('reports SDK_ERROR for any other kind of failure, without guessing it is an auth problem', async () => {
    const runner = new FakeAgentRunner({ ok: false, reason: 'ERROR', detail: 'spawn ENOENT' });
    const service = new ClaudeConnectionService(runner);

    expect(await service.check()).toEqual({ connected: false, reason: 'SDK_ERROR', detail: 'spawn ENOENT' });
  });

  it('runs a minimal, cheap, tool-free probe rather than a real exploration', async () => {
    const runner = new FakeAgentRunner({ ok: true, text: 'pong', structuredOutput: undefined });

    await new ClaudeConnectionService(runner).check();

    expect(runner.lastPrompt.length).toBeGreaterThan(0);
    expect(runner.lastOptions).toMatchObject({ allowedTools: [], maxTurns: 1 });
  });

  it('stores no credential and reads nothing beyond the run outcome', async () => {
    // Nothing to assert on disk here - the point is that ClaudeConnectionService
    // has no repository/store dependency at all, only an AgentRunner. This
    // test documents that constraint: it compiles with a single-argument
    // constructor and nothing else to inject.
    const runner = new FakeAgentRunner({ ok: true, text: 'pong', structuredOutput: undefined });
    expect(() => new ClaudeConnectionService(runner)).not.toThrow();
  });
});
