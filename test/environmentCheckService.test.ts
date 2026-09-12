import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import type { EnvironmentProbe } from '../src/main/services/EnvironmentCheckService';
import { EnvironmentCheckService, playwrightBrowsersDir } from '../src/main/services/EnvironmentCheckService';
import { TargetType } from '../src/shared/ipc-contract';

/** Fakes what's actually installed on the machine running the suite, so
 * these tests don't depend on whether Node/Playwright happen to be present
 * where `npm test` runs. */
class FakeProbe implements EnvironmentProbe {
  constructor(
    private readonly availableCommands: ReadonlySet<string>,
    private readonly existingPaths: ReadonlySet<string>,
  ) {}

  async commandAvailable(command: string): Promise<boolean> {
    return this.availableCommands.has(command);
  }

  async pathExists(path: string): Promise<boolean> {
    return this.existingPaths.has(path);
  }
}

const PROJECT_ROOT = '/fake/project';
// Matches exactly what EnvironmentCheckService computes internally
// (platform + the real home dir + the real env), since the service does
// not take those as injectable parameters - only the probe is a seam.
const BROWSERS_DIR = playwrightBrowsersDir(process.platform, homedir(), process.env);

describe('EnvironmentCheckService.check - web', () => {
  it('reports everything present when node and the browsers both resolve', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(['node']), new Set([BROWSERS_DIR])));

    const items = await service.check(TargetType.Web, PROJECT_ROOT);

    expect(items.every((item) => item.present)).toBe(true);
    expect(items.every((item) => item.installHint === null)).toBe(true);
    // "Playwright package" is gone: it used to check the *target* project's
    // own node_modules, which was only ever meaningful back when the
    // checklist was informational. Now that AutoAI itself runs the tests
    // (see TestRunnerService), AutoAI's own Playwright install is a build
    // dependency, not something to check per-project.
    expect(items.map((item) => item.name)).toEqual(['Node.js', 'Playwright browsers']);
  });

  it('flags a missing tool with a concrete install hint, not a fake pass', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(), new Set()));

    const items = await service.check(TargetType.Web, PROJECT_ROOT);

    for (const item of items) {
      expect(item.present).toBe(false);
      expect(item.installHint).toBeTruthy();
    }
    const browsersItem = items.find((item) => item.name === 'Playwright browsers');
    expect(browsersItem?.installHint).toContain('npx playwright install');
  });

  it('checks node and the browsers independently of each other', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(['node']), new Set()));

    const items = await service.check(TargetType.Web, PROJECT_ROOT);

    expect(items.find((item) => item.name === 'Node.js')?.present).toBe(true);
    expect(items.find((item) => item.name === 'Playwright browsers')?.present).toBe(false);
  });
});

describe('EnvironmentCheckService.check - mobile/desktop', () => {
  it('returns a single honest "not built yet" entry for mobile, not a fake check', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(['node']), new Set([BROWSERS_DIR])));

    const items = await service.check(TargetType.Mobile, PROJECT_ROOT);

    expect(items).toHaveLength(1);
    expect(items[0]?.present).toBe(false);
    expect(items[0]?.installHint).toBeNull();
    expect(items[0]?.name.toLowerCase()).toContain('mobile');
  });

  it('returns a single honest "not built yet" entry for desktop', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(), new Set()));

    const items = await service.check(TargetType.Desktop, PROJECT_ROOT);

    expect(items).toHaveLength(1);
    expect(items[0]?.present).toBe(false);
    expect(items[0]?.installHint).toBeNull();
    expect(items[0]?.name.toLowerCase()).toContain('desktop');
  });

  it('checks nothing for an unknown target type', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(), new Set()));

    expect(await service.check(TargetType.Unknown, PROJECT_ROOT)).toEqual([]);
  });
});

describe('playwrightBrowsersDir', () => {
  it('honours PLAYWRIGHT_BROWSERS_PATH when set, overriding the platform default', () => {
    expect(playwrightBrowsersDir('darwin', '/home/me', { PLAYWRIGHT_BROWSERS_PATH: '/custom/path' })).toBe(
      '/custom/path',
    );
  });

  it('falls back to a platform-specific default cache directory', () => {
    expect(playwrightBrowsersDir('linux', '/home/me', {})).toBe('/home/me/.cache/ms-playwright');
  });
});
