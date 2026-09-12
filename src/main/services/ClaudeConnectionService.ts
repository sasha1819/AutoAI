import type { ClaudeConnectionStatus } from '@shared/ipc-contract';
import type { AgentRunner } from './AgentRunner';

/**
 * "Connect Claude" in Settings, made real: there is no cached flag and no
 * credential of any kind stored by AutoAI. `check()` runs a minimal, cheap
 * query (`allowedTools: []`, one turn) through the injected AgentRunner and
 * reports exactly what happened - connected, not logged in, or some other
 * SDK-level failure (the CLI missing, a network error, ...).
 */
export class ClaudeConnectionService {
  constructor(private readonly agentRunner: AgentRunner) {}

  public async check(): Promise<ClaudeConnectionStatus> {
    const outcome = await this.agentRunner.run('ping', { allowedTools: [], maxTurns: 1 });

    if (outcome.ok) {
      return { connected: true };
    }

    if (outcome.reason === 'NOT_LOGGED_IN') {
      return { connected: false, reason: 'NOT_LOGGED_IN', detail: outcome.detail };
    }

    return { connected: false, reason: 'SDK_ERROR', detail: outcome.detail };
  }
}
