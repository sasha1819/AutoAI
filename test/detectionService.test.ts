import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { detectTargetType } from '../src/main/services/DetectionService';
import { TargetType } from '../src/shared/ipc-contract';

describe('detectTargetType', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'autoai-detect-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns unknown with low confidence for an empty directory', () => {
    const result = detectTargetType(dir);
    expect(result.targetType).toBe(TargetType.Unknown);
    expect(result.confidence).toBe('low');
    expect(result.evidence).toHaveLength(0);
  });

  it('detects a React Native project from package.json alone', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { 'react-native': '0.74.0' } }));
    const result = detectTargetType(dir);
    expect(result.targetType).toBe(TargetType.Mobile);
  });

  it('detects a native Android + iOS project as mobile with high confidence', () => {
    mkdirSync(join(dir, 'android'), { recursive: true });
    writeFileSync(join(dir, 'android', 'build.gradle'), '// gradle');
    mkdirSync(join(dir, 'ios', 'App.xcodeproj'), { recursive: true });
    const result = detectTargetType(dir);
    expect(result.targetType).toBe(TargetType.Mobile);
    expect(result.confidence).toBe('high');
  });

  it('classifies an Electron project as desktop even though it also has a Vite renderer', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ dependencies: { electron: '33.0.0', 'react-dom': '18.0.0' } }));
    writeFileSync(join(dir, 'vite.config.ts'), '// vite');
    const result = detectTargetType(dir);
    expect(result.targetType).toBe(TargetType.Desktop);
  });

  it('detects a plain web project from an index.html and framework config', () => {
    writeFileSync(join(dir, 'index.html'), '<!doctype html>');
    writeFileSync(join(dir, 'next.config.js'), 'module.exports = {}');
    const result = detectTargetType(dir);
    expect(result.targetType).toBe(TargetType.Web);
    expect(result.confidence).toBe('high');
  });

  it('does not crash on a malformed package.json', () => {
    writeFileSync(join(dir, 'package.json'), '{ not valid json');
    expect(() => detectTargetType(dir)).not.toThrow();
  });
});
