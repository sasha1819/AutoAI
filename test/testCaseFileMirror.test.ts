import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FsTestCaseFileMirror } from '../src/main/services/TestCaseFileMirror';
import type { TestCaseRecord } from '../src/shared/ipc-contract';

function makeCase(overrides: Partial<TestCaseRecord> = {}): TestCaseRecord {
  return {
    id: 'case-1',
    projectId: 'proj-1',
    areaId: null,
    name: 'Guest can buy one item',
    steps: ['Open the storefront', 'Add a mug to the cart'],
    createdAt: '2026-03-10T09:00:00.000Z',
    script: null,
    ...overrides,
  };
}

describe('FsTestCaseFileMirror', () => {
  let folder: string;
  let mirror: FsTestCaseFileMirror;

  beforeEach(() => {
    folder = mkdtempSync(join(tmpdir(), 'autoai-case-mirror-'));
    mirror = new FsTestCaseFileMirror();
  });

  afterEach(() => {
    rmSync(folder, { recursive: true, force: true });
  });

  it('writes a case as <caseId>.json with the expected content', async () => {
    const testCase = makeCase({
      script: [{ action: 'goto', value: '/checkout' }],
    });

    await mirror.writeCase(folder, testCase);

    const filePath = join(folder, `${testCase.id}.json`);
    expect(existsSync(filePath)).toBe(true);
    const content = JSON.parse(readFileSync(filePath, 'utf-8'));
    expect(content).toEqual({
      id: testCase.id,
      name: testCase.name,
      areaId: testCase.areaId,
      steps: testCase.steps,
      script: testCase.script,
      createdAt: testCase.createdAt,
    });
  });

  it('creates the folder if it does not exist yet', async () => {
    const nested = join(folder, 'nested', 'cases');
    const testCase = makeCase();

    await mirror.writeCase(nested, testCase);

    expect(existsSync(join(nested, `${testCase.id}.json`))).toBe(true);
  });

  it('overwrites the file on a second write to the same case id', async () => {
    const testCase = makeCase({ name: 'Original name' });
    await mirror.writeCase(folder, testCase);

    await mirror.writeCase(folder, { ...testCase, name: 'Renamed' });

    const content = JSON.parse(readFileSync(join(folder, `${testCase.id}.json`), 'utf-8'));
    expect(content.name).toBe('Renamed');
  });

  it('removes the file for a case id', async () => {
    const testCase = makeCase();
    await mirror.writeCase(folder, testCase);
    expect(existsSync(join(folder, `${testCase.id}.json`))).toBe(true);

    await mirror.removeCase(folder, testCase.id);

    expect(existsSync(join(folder, `${testCase.id}.json`))).toBe(false);
  });

  it('does nothing, and does not throw, removing a case that was never written', async () => {
    await expect(mirror.removeCase(folder, 'never-written')).resolves.toBeUndefined();
  });

  it('never throws when the target path is unwritable - best-effort only', async () => {
    // A path that requires creating a directory *through* a file -
    // guaranteed to fail with a real fs error (ENOTDIR), not a mock. The
    // mirror should swallow it, the same reasoning as
    // ProjectService.safeRemoveDir's own try/catch.
    await mirror.writeCase(folder, makeCase({ id: 'blocker' }));
    const blockedPath = join(folder, 'blocker.json', 'deeper');

    await expect(mirror.writeCase(blockedPath, makeCase())).resolves.toBeUndefined();
  });
});
