import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DetectionEvidence, DetectionResult, TargetType } from '@shared/ipc-contract';
import { TargetType as Target } from '@shared/ipc-contract';

/**
 * v1 of the `detect` step from the AutoAI framework doc: "nine stack
 * fingerprints -> install plan," simplified to the three target categories
 * this app currently has adapters planned for. This is a convenience, not a
 * substitute for the explicit override every project keeps - see
 * `effectiveTargetType` in the shared contract. Ambiguous or conflicting
 * signals deliberately produce 'unknown' / low confidence rather than a
 * silent guess.
 *
 * Deliberately shallow and dependency-free: reads specific marker paths and
 * parses package.json if present. Never recurses into node_modules or .git.
 */

interface PackageJsonShape {
  readonly dependencies?: Record<string, string>;
  readonly devDependencies?: Record<string, string>;
}

function readPackageJson(root: string): PackageJsonShape | null {
  const path = join(root, 'package.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8')) as PackageJsonShape;
  } catch {
    // Malformed package.json is evidence of nothing - treat as absent rather
    // than crashing detection for the whole project.
    return null;
  }
}

function hasDependency(pkg: PackageJsonShape | null, name: string): boolean {
  if (!pkg) return false;
  return Boolean(pkg.dependencies?.[name] ?? pkg.devDependencies?.[name]);
}

function pathExists(root: string, relativePath: string): boolean {
  return existsSync(join(root, relativePath));
}

export function detectTargetType(projectRoot: string): DetectionResult {
  const evidence: DetectionEvidence[] = [];
  const pkg = readPackageJson(projectRoot);

  // --- Desktop: checked first because Electron/Tauri projects often also
  // contain a web-framework renderer, which must not outrank the wrapper.
  if (hasDependency(pkg, 'electron')) {
    evidence.push({ path: 'package.json', reason: "lists 'electron' as a dependency", pointsTo: Target.Desktop });
  }
  if (pathExists(projectRoot, 'electron-builder.yml') || pathExists(projectRoot, 'electron-builder.yaml')) {
    evidence.push({ path: 'electron-builder.yml', reason: 'Electron packaging config found', pointsTo: Target.Desktop });
  }
  if (pathExists(projectRoot, 'src-tauri') || pathExists(projectRoot, 'tauri.conf.json')) {
    evidence.push({ path: 'src-tauri/', reason: 'Tauri project structure found', pointsTo: Target.Desktop });
  }
  const dotnetProjectFiles = safeListDir(projectRoot).filter((f) => f.endsWith('.sln') || f.endsWith('.csproj'));
  for (const file of dotnetProjectFiles) {
    evidence.push({ path: file, reason: '.NET project file - likely WPF/MAUI desktop app', pointsTo: Target.Desktop });
  }

  // --- Mobile
  if (pathExists(projectRoot, 'android/build.gradle') || pathExists(projectRoot, 'android/app/build.gradle')) {
    evidence.push({ path: 'android/', reason: 'Android Gradle project found', pointsTo: Target.Mobile });
  }
  const iosXcodeProject = safeListDir(join(projectRoot, 'ios')).find((f) => f.endsWith('.xcodeproj') || f.endsWith('.xcworkspace'));
  if (iosXcodeProject) {
    evidence.push({ path: `ios/${iosXcodeProject}`, reason: 'Xcode project found', pointsTo: Target.Mobile });
  }
  if (hasDependency(pkg, 'react-native')) {
    evidence.push({ path: 'package.json', reason: "lists 'react-native' as a dependency", pointsTo: Target.Mobile });
  }
  if (hasDependency(pkg, 'expo')) {
    evidence.push({ path: 'package.json', reason: "lists 'expo' as a dependency", pointsTo: Target.Mobile });
  }
  if (pathExists(projectRoot, 'pubspec.yaml')) {
    try {
      const pubspec = readFileSync(join(projectRoot, 'pubspec.yaml'), 'utf-8');
      if (/flutter:/.test(pubspec)) {
        evidence.push({ path: 'pubspec.yaml', reason: 'Flutter project found', pointsTo: Target.Mobile });
      }
    } catch {
      // unreadable pubspec.yaml is not evidence either way
    }
  }

  // --- Web (generic signals - only meaningful once desktop/mobile are ruled out)
  if (pathExists(projectRoot, 'index.html') || pathExists(projectRoot, 'public/index.html')) {
    evidence.push({ path: 'index.html', reason: 'HTML entry point found at project root', pointsTo: Target.Web });
  }
  for (const marker of ['next.config.js', 'next.config.mjs', 'angular.json', 'svelte.config.js', 'nuxt.config.ts']) {
    if (pathExists(projectRoot, marker)) {
      evidence.push({ path: marker, reason: 'known web framework config file', pointsTo: Target.Web });
    }
  }
  if (pathExists(projectRoot, 'vite.config.ts') || pathExists(projectRoot, 'vite.config.js')) {
    // Vite alone is ambiguous - Electron renderers use it too - but it's
    // still worth recording as a (weaker) web signal when nothing else fired.
    evidence.push({ path: 'vite.config.ts', reason: 'Vite config found (web or desktop renderer)', pointsTo: Target.Web });
  }
  for (const dep of ['react-dom', 'vue', 'svelte']) {
    if (hasDependency(pkg, dep)) {
      evidence.push({ path: 'package.json', reason: `lists '${dep}' as a dependency`, pointsTo: Target.Web });
    }
  }

  return classify(evidence);
}

function classify(evidence: readonly DetectionEvidence[]): DetectionResult {
  const generatedAt = new Date().toISOString();
  const categories: TargetType[] = [Target.Desktop, Target.Mobile, Target.Web];
  const countsByCategory = new Map<TargetType, number>(categories.map((c) => [c, 0]));
  for (const item of evidence) {
    countsByCategory.set(item.pointsTo, (countsByCategory.get(item.pointsTo) ?? 0) + 1);
  }

  const withSignal = categories.filter((c) => (countsByCategory.get(c) ?? 0) > 0);

  if (withSignal.length === 0) {
    return { targetType: Target.Unknown, confidence: 'low', evidence, generatedAt };
  }

  if (withSignal.length > 1) {
    // Conflicting signals across categories - the framework doc's rule
    // applies here too: ambiguous heuristics should ask, not guess. Desktop
    // still wins as the most specific category (a wrapped web app is a
    // desktop app), but confidence drops to make the override prompt loud.
    const winner = withSignal.includes(Target.Desktop) ? Target.Desktop : withSignal[0]!;
    return { targetType: winner, confidence: 'low', evidence, generatedAt };
  }

  const only = withSignal[0]!;
  const strongSignalCount = countsByCategory.get(only) ?? 0;
  const confidence = strongSignalCount >= 2 ? 'high' : 'medium';
  return { targetType: only, confidence, evidence, generatedAt };
}

function safeListDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}
