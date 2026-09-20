import { ChildProcess } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NodeProcessSpawner, RUN_TO_COMPLETION_TIMEOUT_MS } from '../src/main/services/ProjectSetupService';

describe('NodeProcessSpawner.runToCompletion', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('resolves normally for a command that finishes well within the timeout', async () => {
    const spawner = new NodeProcessSpawner();

    const result = await spawner.runToCompletion('echo hello', process.cwd());

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('hello');
  });

  it('kills the process and rejects once the timeout elapses, instead of hanging forever', async () => {
    const killSpy = vi.spyOn(ChildProcess.prototype, 'kill');
    vi.useFakeTimers();

    const spawner = new NodeProcessSpawner();
    const promise = spawner.runToCompletion('sleep 9999', process.cwd());
    const assertion = expect(promise).rejects.toThrow(/timed out/i);

    // Let the real child process actually spawn (a real OS process, not a
    // fake) before fast-forwarding the fake timer past the timeout.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(RUN_TO_COMPLETION_TIMEOUT_MS);

    await assertion;
    expect(killSpy).toHaveBeenCalledWith('SIGTERM');
  });
});
