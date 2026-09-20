import { describe, expect, it } from 'vitest';
import { chromium } from 'playwright';
import type { EnvironmentProbe } from '../src/main/services/EnvironmentCheckService';
import {
  EnvironmentCheckService,
  requiredRuntimesFor,
  requiredRuntimesForFrameworks,
} from '../src/main/services/EnvironmentCheckService';
import type { DetectionEvidence } from '../src/shared/ipc-contract';
import { TargetType } from '../src/shared/ipc-contract';

function evidence(path: string, reason: string, pointsTo: DetectionEvidence['pointsTo']): DetectionEvidence {
  return { path, reason, pointsTo };
}

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
// The exact path the installed Playwright version's own resolution logic
// expects - same thing EnvironmentCheckService itself checks now, computed
// via the real `chromium` import so this test can't drift from the
// service's own logic.
const CHROMIUM_PATH = chromium.executablePath();

describe('EnvironmentCheckService.check - web', () => {
  it('reports everything present when node and the browsers both resolve', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(['node']), new Set([CHROMIUM_PATH])));

    const items = await service.check(TargetType.Web, PROJECT_ROOT, null, []);

    expect(items.every((item) => item.present)).toBe(true);
    expect(items.every((item) => item.installHint === null)).toBe(true);
    // "Playwright package" is gone: it used to check the *target* project's
    // own node_modules, which was only ever meaningful back when the
    // checklist was informational. Now that AutoAI itself runs the tests
    // (see TestRunnerService), AutoAI's own Playwright install is a build
    // dependency, not something to check per-project.
    expect(items.map((item) => item.name)).toEqual(['Node.js', 'Playwright browsers']);
    expect(items.find((item) => item.name === 'Playwright browsers')?.installablePlaywrightBrowsers).toBe(false);
  });

  it('flags a missing tool with a concrete install hint, not a fake pass', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(), new Set()));

    const items = await service.check(TargetType.Web, PROJECT_ROOT, null, []);

    for (const item of items) {
      expect(item.present).toBe(false);
      expect(item.installHint).toBeTruthy();
    }
    const browsersItem = items.find((item) => item.name === 'Playwright browsers');
    expect(browsersItem?.installHint).toContain('npx playwright install');
    expect(browsersItem?.installablePlaywrightBrowsers).toBe(true);
  });

  it('checks node and the browsers independently of each other', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(['node']), new Set()));

    const items = await service.check(TargetType.Web, PROJECT_ROOT, null, []);

    expect(items.find((item) => item.name === 'Node.js')?.present).toBe(true);
    expect(items.find((item) => item.name === 'Playwright browsers')?.present).toBe(false);
  });
});

describe('EnvironmentCheckService.check - the runtime a proposed start command needs', () => {
  it('flags PHP as missing for a php -S start command, not just Node.js and browsers', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(['node']), new Set([CHROMIUM_PATH])));

    const items = await service.check(TargetType.Web, PROJECT_ROOT, 'php -S localhost:8000 -t .', []);

    expect(items.map((item) => item.name)).toEqual(['Node.js', 'Playwright browsers', 'PHP']);
    expect(items.find((item) => item.name === 'PHP')?.present).toBe(false);
    expect(items.find((item) => item.name === 'PHP')?.installHint).toContain('PHP');
    expect(items.find((item) => item.name === 'PHP')?.installableBinary).toBe(
      process.platform === 'darwin' ? 'php' : null,
    );
  });

  it('reports PHP present when the probe finds it', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(['node', 'php']), new Set([CHROMIUM_PATH])));

    const items = await service.check(TargetType.Web, PROJECT_ROOT, 'php -S localhost:8000 -t .', []);

    expect(items.find((item) => item.name === 'PHP')?.present).toBe(true);
  });

  it('checks both PHP and Composer for a composer install command', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(['node']), new Set([CHROMIUM_PATH])));

    const items = await service.check(TargetType.Web, PROJECT_ROOT, 'composer install', []);

    expect(items.map((item) => item.name)).toEqual(['Node.js', 'Playwright browsers', 'PHP', 'Composer']);
  });

  it('adds nothing extra for a Node-based command - Node.js is already covered', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(['node']), new Set([CHROMIUM_PATH])));

    const items = await service.check(TargetType.Web, PROJECT_ROOT, 'npm run dev', []);

    expect(items.map((item) => item.name)).toEqual(['Node.js', 'Playwright browsers']);
  });

  it('adds nothing for a null or unrecognized start command', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(['node']), new Set([CHROMIUM_PATH])));

    expect((await service.check(TargetType.Web, PROJECT_ROOT, null, [])).map((i) => i.name)).toEqual([
      'Node.js',
      'Playwright browsers',
    ]);
    expect((await service.check(TargetType.Web, PROJECT_ROOT, 'some-unknown-tool run', [])).map((i) => i.name)).toEqual([
      'Node.js',
      'Playwright browsers',
    ]);
  });
});

describe('requiredRuntimesFor', () => {
  it('maps each allowlisted command family to the runtime(s) it needs', () => {
    expect(requiredRuntimesFor('php -S localhost:8000 -t .')).toEqual([{ binary: 'php', label: 'PHP' }]);
    expect(requiredRuntimesFor('python3 -m http.server')).toEqual([{ binary: 'python3', label: 'Python' }]);
    expect(requiredRuntimesFor('python -m http.server 9000')).toEqual([{ binary: 'python', label: 'Python' }]);
    expect(requiredRuntimesFor('bundle exec rspec')).toEqual([
      { binary: 'ruby', label: 'Ruby' },
      { binary: 'bundle', label: 'Bundler' },
    ]);
  });

  it('returns nothing for Node-family commands or a null/unrecognized one', () => {
    expect(requiredRuntimesFor('npm run dev')).toEqual([]);
    expect(requiredRuntimesFor('yarn start')).toEqual([]);
    expect(requiredRuntimesFor(null)).toEqual([]);
    expect(requiredRuntimesFor('some-unknown-tool run')).toEqual([]);
  });
});

describe('EnvironmentCheckService.check - mobile/desktop with no recognized framework evidence', () => {
  it('returns a single honest "not built yet" entry for mobile when nothing matches', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(['node']), new Set([CHROMIUM_PATH])));

    const items = await service.check(TargetType.Mobile, PROJECT_ROOT, null, []);

    expect(items).toHaveLength(1);
    expect(items[0]?.present).toBe(false);
    expect(items[0]?.installHint).toBeNull();
    expect(items[0]?.name.toLowerCase()).toContain('mobile');
  });

  it('returns a single honest "not built yet" entry for desktop when nothing matches', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(), new Set()));

    const items = await service.check(TargetType.Desktop, PROJECT_ROOT, null, []);

    expect(items).toHaveLength(1);
    expect(items[0]?.present).toBe(false);
    expect(items[0]?.installHint).toBeNull();
    expect(items[0]?.name.toLowerCase()).toContain('desktop');
  });

  it('checks nothing for an unknown target type', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(), new Set()));

    expect(await service.check(TargetType.Unknown, PROJECT_ROOT, null, [])).toEqual([]);
  });
});

describe('EnvironmentCheckService.check - mobile/desktop grounded in real detected-framework evidence', () => {
  it('checks adb for Android Gradle evidence, replacing the generic stub', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(), new Set()));
    const androidEvidence = [evidence('android/', 'Android Gradle project found', TargetType.Mobile)];

    const items = await service.check(TargetType.Mobile, PROJECT_ROOT, null, androidEvidence);

    expect(items).toEqual([{ name: 'Android SDK (adb)', present: false, installHint: expect.any(String), installableBinary: null, installablePlaywrightBrowsers: false }]);
  });

  it('checks xcodebuild for an Xcode project', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(['xcodebuild']), new Set()));
    const iosEvidence = [evidence('ios/App.xcodeproj', 'Xcode project found', TargetType.Mobile)];

    const items = await service.check(TargetType.Mobile, PROJECT_ROOT, null, iosEvidence);

    expect(items).toEqual([{ name: 'Xcode command line tools', present: true, installHint: null, installableBinary: null, installablePlaywrightBrowsers: false }]);
  });

  it('checks Node.js, adb, and xcodebuild for React Native - deduped even with android/ios evidence also present', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(['node']), new Set()));
    const rnEvidence = [
      evidence('package.json', "lists 'react-native' as a dependency", TargetType.Mobile),
      evidence('android/', 'Android Gradle project found', TargetType.Mobile),
      evidence('ios/App.xcodeproj', 'Xcode project found', TargetType.Mobile),
    ];

    const items = await service.check(TargetType.Mobile, PROJECT_ROOT, null, rnEvidence);

    expect(items.map((i) => i.name).sort()).toEqual(['Android SDK (adb)', 'Node.js', 'Xcode command line tools'].sort());
    expect(items).toHaveLength(3); // deduped, not one set of checks per evidence entry
  });

  it('checks flutter for a pubspec.yaml', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(), new Set()));
    const flutterEvidence = [evidence('pubspec.yaml', 'Flutter project found', TargetType.Mobile)];

    const items = await service.check(TargetType.Mobile, PROJECT_ROOT, null, flutterEvidence);

    expect(items).toEqual([{ name: 'Flutter SDK', present: false, installHint: expect.any(String), installableBinary: null, installablePlaywrightBrowsers: false }]);
  });

  it('checks Node.js for an Electron desktop project', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(['node']), new Set()));
    const electronEvidence = [evidence('package.json', "lists 'electron' as a dependency", TargetType.Desktop)];

    const items = await service.check(TargetType.Desktop, PROJECT_ROOT, null, electronEvidence);

    expect(items).toEqual([{ name: 'Node.js', present: true, installHint: null, installableBinary: null, installablePlaywrightBrowsers: false }]);
  });

  it('checks cargo and Node.js for a Tauri project', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(), new Set()));
    const tauriEvidence = [evidence('src-tauri/', 'Tauri project structure found', TargetType.Desktop)];

    const items = await service.check(TargetType.Desktop, PROJECT_ROOT, null, tauriEvidence);

    expect(items.map((i) => i.name).sort()).toEqual(['Node.js', 'Rust (cargo)'].sort());
  });

  it('checks dotnet for a .NET project file', async () => {
    const service = new EnvironmentCheckService(new FakeProbe(new Set(['dotnet']), new Set()));
    const dotnetEvidence = [evidence('App.csproj', '.NET project file - likely WPF/MAUI desktop app', TargetType.Desktop)];

    const items = await service.check(TargetType.Desktop, PROJECT_ROOT, null, dotnetEvidence);

    expect(items).toEqual([{ name: '.NET SDK', present: true, installHint: null, installableBinary: null, installablePlaywrightBrowsers: false }]);
  });
});

describe('requiredRuntimesForFrameworks', () => {
  it('returns nothing for evidence that matches no recognized framework', () => {
    expect(requiredRuntimesForFrameworks([evidence('index.html', 'HTML entry point found at project root', TargetType.Web)])).toEqual(
      [],
    );
    expect(requiredRuntimesForFrameworks([])).toEqual([]);
  });
});
