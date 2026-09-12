---
name: target-detection-heuristics
description: Draft signal list and guardrails for detecting whether a user's target project is mobile, web, or desktop, and for shaping the resulting basic configuration. Load when working on project-scan / guided-setup-wizard / target-type-detection work. DRAFT - not yet an agreed architecture decision, treat as a starting proposal to refine, not a spec to implement blindly.
---

# Target-type detection — draft heuristics

This is unbuilt (see "Open items" in the project's `claude/architecture-decisions.md`). Signals below are a starting proposal for `repo-scanner` (Mode A) to refine with the user, not a finished spec.

## Guardrail, before any signal list
Detection is advisory. The config format must always carry an explicit, user-settable `targetType` (or similar) field that overrides whatever was inferred. Never wire adapter selection directly to a heuristic result with no override path — this is the project's "explicit configuration over magic" principle, not optional polish.

## Candidate signals (draft)

**Mobile (native, Appium territory)**
- `android/` dir with `build.gradle` / `AndroidManifest.xml`
- `ios/` dir with `.xcodeproj`/`.xcworkspace` and `Info.plist`
- `package.json` dependency on `react-native`, `expo`
- Native mobile with no JS layer at all (pure Swift/Kotlin project) — no package.json signal available, needs a path/extension-based check instead

**Web (Playwright territory)**
- `package.json` with `react`/`vue`/`@angular/core`/`next`/`svelte` and a dev-server script, no native mobile/desktop dirs alongside it
- Presence of `playwright.config.ts`/`.js` already (project may already have tests — a strong signal, and useful to import from rather than just detect against)
- `index.html` at a web root with no Electron/Tauri markers

**Desktop (desktop-driver territory — least standardized, treat low-confidence results as "ask")**
- `package.json` dependency on `electron` or `@tauri-apps/*`
- Windows: `.csproj`/`.sln` (WPF/WinForms/MAUI) → WinAppDriver candidate
- macOS: `.xcodeproj` producing a `.app` (AppKit/SwiftUI desktop, not iOS) — distinguishing this from the mobile iOS case above needs the build target/platform, not just presence of `.xcodeproj`
- Linux desktop: no standardized signal yet — this whole branch is flagged in the framework doc as needing a research spike, not an assumption

## Ambiguous / conflicting cases
- A repo with both `ios/`/`android/` *and* `electron`-style desktop markers (e.g. a monorepo) → don't guess, surface the ambiguity and ask the user to pick or point at a subfolder.
- No signal matches anything → ask, don't default to one engine.

## Output shape (sketch only)
Not finalized. Rough direction: a config object carrying `targetType`, the detected/overridden value, plus per-type fields the corresponding adapter needs (e.g. app path/bundle id for mobile, base URL for web, executable path for desktop) — this should be designed together with the engine adapter interface (also an open item) so the config shape and the `Driver`/`Runner` adapter contract agree with each other, not designed in isolation.

## Related, not yet designed
Connected-device visibility (listing attached Android/iOS devices/emulators via adb/`xcrun simctl`, and eventually running desktop apps) was raised as a companion feature — see "Open items" in `claude/architecture-decisions.md`. It overlaps this work (a detected mobile target is much more useful paired with "here are the devices available to run it on") but is a separate spike, not assumed solved by this skill.
