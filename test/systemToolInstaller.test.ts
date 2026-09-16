import { describe, expect, it } from 'vitest';
import type { EnvironmentProbe } from '../src/main/services/EnvironmentCheckService';
import { isInstallableBinary, SystemToolInstaller } from '../src/main/services/SystemToolInstaller';
import type { DetachedProcessHandle, ProcessSpawner, RunToCompletionResult } from '../src/main/services/ProjectSetupService';

/** Records every command it was asked to run and returns a scripted result -
 * lets tests assert the exact command string SystemToolInstaller builds
 * without ever shelling out for real. */
class FakeSpawner implements ProcessSpawner {
  public readonly commandsRun: string[] = [];
  constructor(private readonly result: RunToCompletionResult = { exitCode: 0, stdout: '', stderr: '' }) {}

  async runToCompletion(command: string): Promise<RunToCompletionResult> {
    this.commandsRun.push(command);
    return this.result;
  }

  spawnDetached(): DetachedProcessHandle {
    throw new Error('not used by SystemToolInstaller');
  }
}

class FakeProbe implements EnvironmentProbe {
  constructor(private readonly availableCommands: ReadonlySet<string>) {}

  async commandAvailable(command: string): Promise<boolean> {
    return this.availableCommands.has(command);
  }

  async pathExists(): Promise<boolean> {
    return false;
  }
}

const ORIGINAL_PLATFORM = process.platform;

function setPlatform(platform: NodeJS.Platform): void {
  Object.defineProperty(process, 'platform', { value: platform });
}

describe('isInstallableBinary', () => {
  it('is true for every binary on the closed map, on macOS', () => {
    setPlatform('darwin');
    try {
      for (const binary of ['php', 'composer', 'python', 'python3', 'ruby', 'dotnet']) {
        expect(isInstallableBinary(binary)).toBe(true);
      }
    } finally {
      setPlatform(ORIGINAL_PLATFORM);
    }
  });

  it('is false for a binary not on the map', () => {
    setPlatform('darwin');
    try {
      expect(isInstallableBinary('adb')).toBe(false);
      expect(isInstallableBinary('xcodebuild')).toBe(false);
      expect(isInstallableBinary('flutter')).toBe(false);
      expect(isInstallableBinary('node')).toBe(false);
    } finally {
      setPlatform(ORIGINAL_PLATFORM);
    }
  });

  it('is false on a non-macOS platform even for a mapped binary', () => {
    setPlatform('linux');
    try {
      expect(isInstallableBinary('php')).toBe(false);
    } finally {
      setPlatform(ORIGINAL_PLATFORM);
    }
  });
});

describe('SystemToolInstaller.install', () => {
  it('refuses a binary not on the closed map without touching brew', async () => {
    setPlatform('darwin');
    try {
      const spawner = new FakeSpawner();
      const installer = new SystemToolInstaller(spawner, new FakeProbe(new Set(['brew'])));

      const result = await installer.install('adb');

      expect(result).toEqual({ ok: false, error: 'NOT_INSTALLABLE' });
      expect(spawner.commandsRun).toEqual([]);
    } finally {
      setPlatform(ORIGINAL_PLATFORM);
    }
  });

  it('short-circuits with BREW_NOT_FOUND when brew itself is absent, without attempting an install', async () => {
    setPlatform('darwin');
    try {
      const spawner = new FakeSpawner();
      const installer = new SystemToolInstaller(spawner, new FakeProbe(new Set()));

      const result = await installer.install('php');

      expect(result.ok).toBe(false);
      expect(result).toMatchObject({ error: 'BREW_NOT_FOUND' });
      expect(spawner.commandsRun).toEqual([]);
    } finally {
      setPlatform(ORIGINAL_PLATFORM);
    }
  });

  it('runs exactly `brew install <formula>` for the requested binary', async () => {
    setPlatform('darwin');
    try {
      const spawner = new FakeSpawner({ exitCode: 0, stdout: 'installed', stderr: '' });
      const installer = new SystemToolInstaller(spawner, new FakeProbe(new Set(['brew', 'php'])));

      const result = await installer.install('php');

      expect(spawner.commandsRun).toEqual(['brew install php']);
      expect(result).toEqual({ ok: true, nowPresent: true, output: 'installed' });
    } finally {
      setPlatform(ORIGINAL_PLATFORM);
    }
  });

  it('maps a binary to a differently-named formula correctly (composer)', async () => {
    setPlatform('darwin');
    try {
      const spawner = new FakeSpawner({ exitCode: 0, stdout: '', stderr: '' });
      const installer = new SystemToolInstaller(spawner, new FakeProbe(new Set(['brew', 'composer'])));

      await installer.install('composer');

      expect(spawner.commandsRun).toEqual(['brew install composer']);
    } finally {
      setPlatform(ORIGINAL_PLATFORM);
    }
  });

  it('reports INSTALL_FAILED when brew exits non-zero and the binary still is not present', async () => {
    setPlatform('darwin');
    try {
      const spawner = new FakeSpawner({ exitCode: 1, stdout: '', stderr: 'formula not found' });
      const installer = new SystemToolInstaller(spawner, new FakeProbe(new Set(['brew'])));

      const result = await installer.install('ruby');

      expect(result).toEqual({ ok: false, error: 'INSTALL_FAILED', detail: 'formula not found' });
    } finally {
      setPlatform(ORIGINAL_PLATFORM);
    }
  });

  it('treats a non-zero exit as success if the binary is present afterward anyway', async () => {
    setPlatform('darwin');
    try {
      const spawner = new FakeSpawner({ exitCode: 1, stdout: '', stderr: 'already installed, warning' });
      const installer = new SystemToolInstaller(spawner, new FakeProbe(new Set(['brew', 'python3'])));

      const result = await installer.install('python3');

      expect(result).toEqual({ ok: true, nowPresent: true, output: 'already installed, warning' });
    } finally {
      setPlatform(ORIGINAL_PLATFORM);
    }
  });

  it('reports INSTALL_FAILED when the spawner itself rejects', async () => {
    setPlatform('darwin');
    try {
      const spawner: ProcessSpawner = {
        runToCompletion: () => Promise.reject(new Error('spawn ENOENT')),
        spawnDetached: () => {
          throw new Error('not used');
        },
      };
      const installer = new SystemToolInstaller(spawner, new FakeProbe(new Set(['brew'])));

      const result = await installer.install('dotnet');

      expect(result).toEqual({ ok: false, error: 'INSTALL_FAILED', detail: 'spawn ENOENT' });
    } finally {
      setPlatform(ORIGINAL_PLATFORM);
    }
  });

  it('refuses on a non-macOS platform even for a mapped binary', async () => {
    setPlatform('linux');
    try {
      const spawner = new FakeSpawner();
      const installer = new SystemToolInstaller(spawner, new FakeProbe(new Set(['brew'])));

      const result = await installer.install('php');

      expect(result).toEqual({ ok: false, error: 'NOT_INSTALLABLE' });
      expect(spawner.commandsRun).toEqual([]);
    } finally {
      setPlatform(ORIGINAL_PLATFORM);
    }
  });
});
