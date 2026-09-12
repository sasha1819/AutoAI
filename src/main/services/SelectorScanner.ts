import { promises as fs } from 'node:fs';
import type { Dirent } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { SelectorAttributeKind } from '@shared/ipc-contract';

/**
 * A best-effort local read of "what selectors does this project actually
 * have" - built against Project-Taaza's real files (paired id/name/for
 * triples on real forms, PHP-array-style `name='section[x][]'` values, zero
 * `data-testid` anywhere, and PHP variable assignments like `$name = "x"`
 * that a naive attribute regex would happily mistake for an HTML attribute).
 *
 * This is purely an internal input to ProjectScanService's prompt - it
 * never gets its own screen or IPC exposure, so nothing here needs to
 * validate renderer-supplied input; the only untrusted input is the
 * project's own files on disk, which is why every read is wrapped and a
 * bad file is skipped rather than allowed to crash a scan.
 */

/** Re-exported for existing importers - the type now lives in the shared
 *  contract (see TestStepAction/SuggestedFlow's grounding rules), promoted
 *  out of this file rather than duplicated. */
export { SelectorAttributeKind } from '@shared/ipc-contract';

export interface SelectorFinding {
  readonly kind: SelectorAttributeKind;
  readonly value: string;
  readonly tag: string | null;
  /** Project-root-relative. */
  readonly path: string;
  /** 1-based, first occurrence. */
  readonly line: number;
  readonly occurrences: number;
}

export interface SelectorScanResult {
  readonly findings: readonly SelectorFinding[];
  readonly filesScanned: number;
  readonly filesSkipped: number;
  readonly truncated: boolean;
  readonly generatedAt: string;
}

const SCAN_EXTENSIONS = new Set(['.html', '.htm', '.php', '.phtml', '.jsx', '.tsx', '.vue', '.svelte']);

/** Pruned by directory name before recursing - never `readdir`'d - so a
 * huge vendored tree never gets walked at all, not merely filtered after
 * the fact. Mix of universal build/VCS output and a curated list of
 * vendored PHP libraries that show up inside plain-PHP projects like
 * Project-Taaza (no node_modules to hide them behind a single rule). */
const EXCLUDED_DIR_NAMES = new Set([
  'node_modules',
  'vendor',
  'bower_components',
  '.git',
  '.svn',
  '.hg',
  'dist',
  'build',
  'out',
  '.next',
  '.nuxt',
  '.output',
  'coverage',
  '.cache',
  '.turbo',
  '.venv',
  '__pycache__',
  'target',
  'PHPMailer',
  'phpmailer',
  'fpdf',
  'tcpdf',
  'TCPDF',
  'PhpSpreadsheet',
  'PHPExcel',
  'ckeditor',
  'tinymce',
]);

export const MAX_FILES_SCANNED = 400;
export const MAX_FILE_SIZE_BYTES = 256 * 1024;
export const MAX_TOTAL_FINDINGS = 150;
export const MAX_DEPTH = 15;

// Tag-scoped extraction, not a bare attribute regex: first match `<tag ...>`
// spans, then pull attributes only from inside a matched tag. This is what
// avoids the `$name = "x"` false positive - a global regex over raw text
// can't tell a PHP variable from an HTML attribute, tag-scoping can, because
// a PHP assignment never starts with `<letter`.
const TAG_RE = /<([a-zA-Z][a-zA-Z0-9-]*)\b([^>]{0,500})>/g;
const ID_RE = /\bid\s*=\s*["']([^"'\n{}]+)["']/;
const NAME_RE = /\bname\s*=\s*["']([^"'\n{}]+)["']/;
const DATA_TESTID_RE = /\bdata-(?:testid|test-id|test|cy|qa)\s*=\s*["']([^"'\n{}]+)["']/;
const FOR_RE = /\b(?:for|htmlFor)\s*=\s*["']([^"'\n{}]+)["']/;
const ARIA_LABEL_RE = /\baria-label\s*=\s*["']([^"'\n{}]+)["']/;

interface WalkState {
  filesScanned: number;
  filesSkipped: number;
  truncated: boolean;
  /** Dedup key (`kind\0value`) -> finding, so `occurrences` can accumulate
   *  and the 150-finding cap counts distinct findings, not raw hits. */
  findings: Map<string, SelectorFinding>;
}

/** Yields the event loop between files so scanning a large repo doesn't
 * freeze the main process. */
function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

function capReached(state: WalkState): boolean {
  return state.filesScanned >= MAX_FILES_SCANNED || state.findings.size >= MAX_TOTAL_FINDINGS;
}

export async function scanSelectors(rootDir: string): Promise<SelectorScanResult> {
  const state: WalkState = { filesScanned: 0, filesSkipped: 0, truncated: false, findings: new Map() };
  await walk(rootDir, rootDir, 0, state);
  return {
    findings: [...state.findings.values()],
    filesScanned: state.filesScanned,
    filesSkipped: state.filesSkipped,
    truncated: state.truncated,
    generatedAt: new Date().toISOString(),
  };
}

async function walk(rootDir: string, dir: string, depth: number, state: WalkState): Promise<void> {
  if (state.truncated) return;
  if (depth > MAX_DEPTH) return; // unconditional second safety valve, on top of the exclude list

  let entries: Dirent[];
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return; // unreadable directory is not evidence of anything - just skip it
  }

  for (const entry of entries) {
    if (capReached(state)) {
      state.truncated = true;
      return;
    }

    if (entry.isSymbolicLink()) continue; // never follow symlinks

    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      if (EXCLUDED_DIR_NAMES.has(entry.name)) continue;
      await walk(rootDir, fullPath, depth + 1, state);
      await tick();
      continue;
    }

    if (!entry.isFile()) continue;

    const ext = extname(entry.name).toLowerCase();
    if (!SCAN_EXTENSIONS.has(ext)) continue;

    await scanFile(rootDir, fullPath, state);
    await tick();
  }
}

async function scanFile(rootDir: string, fullPath: string, state: WalkState): Promise<void> {
  let stat;
  try {
    stat = await fs.stat(fullPath);
  } catch {
    state.filesSkipped++;
    return;
  }

  if (stat.size > MAX_FILE_SIZE_BYTES) {
    state.filesSkipped++;
    return;
  }

  let buf: Buffer;
  try {
    buf = await fs.readFile(fullPath);
  } catch {
    state.filesSkipped++;
    return;
  }

  if (looksBinary(buf)) {
    state.filesSkipped++;
    return;
  }

  state.filesScanned++;
  const content = buf.toString('utf-8');
  const relPath = relative(rootDir, fullPath);
  extractFindings(content, relPath, state);
}

/** Null byte in the first 512 bytes - the same cheap sniff most tools use;
 * good enough to keep an accidental image/binary asset with one of the
 * scanned extensions from being read as text. */
function looksBinary(buf: Buffer): boolean {
  const sniffLen = Math.min(512, buf.length);
  for (let i = 0; i < sniffLen; i++) {
    if (buf[i] === 0) return true;
  }
  return false;
}

function lineOf(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (content.charCodeAt(i) === 10) line++;
  }
  return line;
}

function extractFindings(content: string, relPath: string, state: WalkState): void {
  TAG_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TAG_RE.exec(content)) !== null) {
    if (capReached(state)) {
      state.truncated = true;
      return;
    }

    const tag = match[1] ?? null;
    const attrsText = match[2] ?? '';
    const line = lineOf(content, match.index);

    // Dynamic JSX values (id={x}) never match these quote-anchored regexes,
    // so they are skipped rather than guessed at - exactly the behaviour
    // we want.
    addIfPresent(SelectorAttributeKind.Id, ID_RE.exec(attrsText)?.[1], tag, relPath, line, state);
    addIfPresent(SelectorAttributeKind.Name, NAME_RE.exec(attrsText)?.[1], tag, relPath, line, state);
    addIfPresent(SelectorAttributeKind.DataTestId, DATA_TESTID_RE.exec(attrsText)?.[1], tag, relPath, line, state);
    addIfPresent(SelectorAttributeKind.For, FOR_RE.exec(attrsText)?.[1], tag, relPath, line, state);
    addIfPresent(SelectorAttributeKind.AriaLabel, ARIA_LABEL_RE.exec(attrsText)?.[1], tag, relPath, line, state);
  }
}

function addIfPresent(
  kind: SelectorAttributeKind,
  value: string | undefined,
  tag: string | null,
  path: string,
  line: number,
  state: WalkState,
): void {
  if (value === undefined) return;

  const key = `${kind} ${value}`;
  const existing = state.findings.get(key);
  if (existing) {
    state.findings.set(key, { ...existing, occurrences: existing.occurrences + 1 });
    return;
  }

  if (state.findings.size >= MAX_TOTAL_FINDINGS) {
    state.truncated = true;
    return;
  }

  state.findings.set(key, { kind, value, tag, path, line, occurrences: 1 });
}
