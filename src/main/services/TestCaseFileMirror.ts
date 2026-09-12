import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import type { TestCaseRecord } from '@shared/ipc-contract';

/**
 * One-way mirror: app -> files. AutoAI writes a JSON file per case into a
 * folder the user chooses (`Project.testCaseFolderPath`); it never watches
 * that folder or reads edits back. The app's own store (TestPlanStore)
 * stays the source of truth - this is only where a case becomes a real,
 * portable file on disk.
 *
 * File name is `<caseId>.json`, not a slug, so a rename never orphans a
 * file or collides with another case's.
 */
export interface TestCaseFileMirror {
  writeCase(folderPath: string, testCase: TestCaseRecord): Promise<void>;
  removeCase(folderPath: string, testCaseId: string): Promise<void>;
}

interface MirroredCaseFile {
  readonly id: string;
  readonly name: string;
  readonly areaId: string | null;
  readonly steps: readonly string[];
  readonly script: TestCaseRecord['script'];
  readonly createdAt: string;
}

/**
 * Real filesystem implementation. Best-effort, never blocking - the same
 * try/catch-and-swallow reasoning as ProjectService.safeRemoveDir: a folder
 * that got deleted out from under AutoAI, a permission error, a full disk,
 * none of that should ever be the reason a test case fails to save in the
 * app itself. The mirror is a convenience on top of the real data, not a
 * second source of truth to keep alive at all costs.
 */
export class FsTestCaseFileMirror implements TestCaseFileMirror {
  public async writeCase(folderPath: string, testCase: TestCaseRecord): Promise<void> {
    try {
      await fs.mkdir(folderPath, { recursive: true });
      const content: MirroredCaseFile = {
        id: testCase.id,
        name: testCase.name,
        areaId: testCase.areaId,
        steps: testCase.steps,
        script: testCase.script,
        createdAt: testCase.createdAt,
      };
      await fs.writeFile(join(folderPath, `${testCase.id}.json`), JSON.stringify(content, null, 2), 'utf-8');
    } catch {
      // best-effort mirror only - see class doc
    }
  }

  public async removeCase(folderPath: string, testCaseId: string): Promise<void> {
    try {
      await fs.rm(join(folderPath, `${testCaseId}.json`), { force: true });
    } catch {
      // best-effort mirror only - see class doc
    }
  }
}

/** Default for TestPlanService's constructor and for tests that don't care
 *  about the mirror at all - does nothing, so a project with no
 *  `testCaseFolderPath` (the common case) never touches the filesystem. */
export class NoopTestCaseFileMirror implements TestCaseFileMirror {
  public async writeCase(): Promise<void> {
    // intentionally does nothing
  }

  public async removeCase(): Promise<void> {
    // intentionally does nothing
  }
}
