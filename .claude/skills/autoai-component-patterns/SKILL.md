---
name: autoai-component-patterns
description: Component, styling, state, and flow conventions for AutoAI's Electron renderer. Load when building or editing anything under src/renderer.
---

# AutoAI renderer conventions

## Flow gate, not per-screen routing logic
`App.tsx` renders one screen based purely on `useSessionStore().stage`. Only the `ready` branch reaches react-router; everything before it is a linear gate, not a set of pages someone can navigate between:

- `loading` → splash/spinner
- `welcome` → WelcomeScreen (what AutoAI is, three steps, one "Start guided setup" button — the only thing before registration)
- `needs-registration` → RegisterScreen
- `needs-login` → LoginScreen
- `ready` → the routed app (Home, Projects, a project, Runs, Reports, Settings)

There is no onboarding stage. A new profile is created with a real default role (`AutomationEngineer`, set server-side in `AuthService`) rather than gating entry on a role picker — someone changes it afterward from the role pill in `AppShell`'s top bar or the role section in Settings, both of which write through the same `onboarding:set-role` channel `AuthService.setRole` always used. `OnboardingScreen` and the dev screen switcher (`DevScreenSwitcher`) are both gone from the codebase — don't reintroduce a reference to either.

`stageFor(hasProfile, session)` in `useSessionStore.ts` is the only place this decision is made. A new screen that gates on auth/session state plugs into this function and the `BootstrapStage` union — it does not add its own `if (!session) redirect()` logic in a component.

Each stage transition is wrapped once, in `App.tsx`, as `<div key={stage} className="animate-stage-in">` — keying on `stage` remounts and replays the fade on every transition. A new stage doesn't need its own animation wiring, just to flow through this same render.

## State
One Zustand store per concern (`useSessionStore`, `useProjectsStore`, `useTestPlanStore`, `useModelPreferenceStore`, `useMcpServersStore`, `useSystemToolStore`). Actions are async, call `autoaiClient`, and `set()` once with the result — no separate loading-flag juggling per action beyond what `stage` already encodes. Fallible actions return `Promise<boolean>` (or the raw `AuthResult`/similar) rather than throwing, and stash the error code in `lastError` for the UI to read via `clearError()`.

`useSystemToolStore` is keyed by binary (`byBinary: Record<string, ToolInstallState>`) rather than being a single flat state — more than one missing, installable checklist item can be mid-install at once, each independent. `useScanStore.markToolInstalled(binary)` flips one checklist row to present using the real presence check the install call already made, instead of triggering a second (paid, Claude-driven) scan just to refresh one line — reach for this pattern anywhere a cheap, already-known fact can update persisted UI state without a redundant round trip.

## Results
Anything that can fail at the IPC boundary is a discriminated union:
```ts
type AuthResult =
  | { ok: true; session: SessionState }
  | { ok: false; error: AuthErrorCode };
```
Match this shape for new IPC-backed operations instead of inventing a new error convention.

## Components
Reuse before creating:
- `AuthLayout` — the brand-rail shell every pre-`ready` screen sits in. A new screen in that flow renders *inside* it; it never redraws the rail.
- `AppShell` — top bar + scrolling content region for every post-`ready` screen. Screens supply their own padding.
- `FormField` — every text input goes through this (label + input, accessible by construction, password reveal built in). Don't hand-roll `<input>`.
- `PrimaryButton` — the one button style: `variant` primary/secondary, `size` md (36px in-page) / lg (42px end-of-form). Don't introduce a second visual button system.
- `PillGroup` — "pick one of a small fixed set" (target type). `SelectField` is the same job when there are too many options for a pill row.
- `RoleCard` — selection-card pattern, now used in Settings' role section (there is no Onboarding screen to use it in anymore); reuse for any future "pick one of N options" UI rather than a new pattern.
- `AssistantPanel` ("Ask AutoAI") — a persistent dock along the bottom of the content area, mounted once in `AppShell`, past the left rail so it never covers it. Always visible, nothing to open or close; the message list only takes up space once there's something in it, otherwise it's a slim input row. A new "assistant can navigate here" tool follows the same pattern `open_project_setup` already does — the panel reacts to a pending-navigation field in `useAssistantStore`, the assistant itself never navigates or executes anything.
- `TextAreaField` — `FormField`'s sibling for the one genuinely multi-line input, the steps of a test case.
- `SectionEmpty` — a section with nothing in it. It says why it is empty, including when the reason is that the feature isn't built. It never draws a sample row or a button that would have to apologise when clicked.
- `AreaRail` / `TestCaseList` / `TestCaseDetail` / `NewCaseForm` — the project screen's test-plan column set. They take data and callbacks, not the store, so the screen stays the only thing that knows about `useTestPlanStore`.
- `ImportSourceList` / `PasteImportPanel` / `CsvImportPanel` / `ImportPreview` — the import flow. Each panel owns its own input state and hands a `ParsedImport` up; the screen owns the area choice and the write. Parsing itself lives in `lib/importParsing.ts` as pure functions, which is where its tests point.
- `ConfirmDialog` — the "are you sure?" in front of anything that cannot be undone. Built on native `<dialog>` for the focus trap, the inert background, and Escape. Don't hand-roll a second modal.
- `Icons` — the Lucide-geometry icon set, drawn inline so every glyph inherits `currentColor`. Add new glyphs here rather than importing an icon package.

## Styling
Tailwind utility classes only. No CSS-in-JS, no inline `style={{}}` objects except for truly dynamic values Tailwind can't express, and no raw hex in a component — every colour is a token in `tailwind.config.js`.

The palette is the v2 warm-paper design (Claude Design project `AutoAI`, artboards `AutoAI v2 Home` / `v2 Project` / `v2 Test Run`). v1 was a dark console; v2 is paper. Tokens are named by role rather than by hue, so the swap touched `tailwind.config.js` and almost nothing else — which is the point of never writing a hex in a component.

| Token | Value | Use |
|---|---|---|
| `canvas` | `#e9e7e2` | the ground behind the app |
| `surface` | `#f6f5f2` | the app's own background |
| `rail` | `#f0eeea` | the left nav |
| `raised` | `#ffffff` | cards, panels, inputs, the selected row |
| `hairline` / `edge` | `#e4e1da` / `#ddd9d1` | panel borders / control borders |
| `ink` | `#1a1815` | primary text — and the primary button's fill |
| `quiet` / `muted` / `faint` | `#57534c` / `#77736b` / `#9b968c` | prose, labels, timestamps |
| `accent` | `#f2a93b` | a *fill and status* colour: the mark, a running dot, a selected border |
| `accent-deep` | `#8a5a07` | the same hue darkened until it passes on paper: links, step numbers, "here now" |
| `danger` / `ok` | `#c0392f` / `#2e7d4f` | pass-fail meaning only, never decoration |

Two rules carry over from v1: `accent` is the only chromatic colour, and `danger`/`ok` never decorate. One rule changed — on paper, amber has nowhere near the contrast a call to action needs, so **the primary button is `ink`**, not amber.

Type is three families: `font-display` (Space Grotesk) for headings and anything with presence, `font-sans` (IBM Plex Sans) for prose and UI, `font-mono` (IBM Plex Mono) for machine truth — paths, target types, step numbers, ports. Sizes come from the named ramp (`text-tag` 11 → `text-hero` 25); reach for an arbitrary value only for something genuinely outside the design.

Geometry: `rounded-md` (6px) on controls, `rounded-lg` (8px) on cards and rows, `rounded-full` on pills. Heights are tokens too — `h-pill` 28, `h-chip` 32, `h-row` 34, `h-control` 36, `h-field` 40, `h-cta` 46, `h-topbar` 60. Borders are always 1px. The one shadow in the system is the hairline lift under a selected nav or area row.

The font faces are not vendored yet — `styles/index.css` explains what to install and which imports to add. Until then the stacks fall back to system faces.

Motion is a small, deliberate set of primitives in `tailwind.config.js`, not a general animation library — reuse one of these rather than hand-rolling a transition:

| Class | Where | Feel |
|---|---|---|
| `animate-stage-in` | wraps `App.tsx`'s stage render, keyed by `stage` | 220ms fade + 4px rise, replays on every Welcome → Register/Login → ready transition |
| `animate-dock-in` | the assistant dock's own mount | 260ms fade + 12px rise |
| `animate-message-in` | each message bubble in the assistant dock | 180ms fade + 6px rise, per message as it's added |

## Role-adaptive UI
`UserRole` = `manual_tester | automation_engineer | qa_lead` (`ROLE_OPTIONS` in `src/shared/ipc-contract.ts` has the copy). This isn't just screen selection — it's a vocabulary/complexity dial. Manual QA Tester copy stays plain-language and outcome-focused ("turn what you already do into automated runs"); Automation Engineer / QA Lead copy can use automation/config terminology directly. When adding UI a Manual QA Tester will see, default to the plainer register and check both against the existing Home screen split.

Every profile starts as Automation Engineer (`AuthService`'s `DEFAULT_ROLE`) the moment it's registered — there's no "pick your role" gate to write copy for before `ready`. Role-adaptive copy only ever has to account for someone changing role later via the pill or Settings, never for an unset/null role.

## Settings sections
`SettingsScreen.tsx` is a stack of self-contained `<Section>` functions, one per concern, each owning its own store slice and IPC calls — add a new preference or connection as another section here rather than growing an existing one. Current sections: Claude connection (`ClaudeConnectionSection`), model/effort preference for scans and runs (`ModelPreferenceSection`), user-added MCP servers reachable only from Ask AutoAI (`McpServersSection`), and the role picker (`RoleCard` grid).

## Suggest-and-confirm, not silent execution
Anywhere AutoAI can act on the machine (a project's Setup card, and now the environment checklist's per-item "Install" button in `ProjectScanCard`), the pattern is the same: show the literal command about to run, require one explicit click to run it, then show the real output — never execute on render, never hide the command behind a generic "Fix it" label. `SystemToolInstaller`'s closed, hardcoded binary→formula map (not a general allowlist) is what makes the checklist's Install button safe to build this way; a new "AutoAI can fix this for you" affordance should be checked against that same "is the exact command hardcoded, or could it come from untrusted project/model content" question before it gets a button.

## An unavailable capability
A source, engine, or integration that isn't built is **listed and disabled with the reason**, not hidden — see `IMPORT_SOURCES` in `lib/importSources.ts`, where five of seven sources say what they need. Hiding them answers "can AutoAI read my TestRail suite?" with silence. What an unavailable thing never does is open onto a form that cannot finish.

## Testing
Vitest, tests live under `test/`, typechecked by `tsconfig.test.json` (which is in `npm run typecheck` — without it a fake repository can fall behind the interface it claims to implement and every test still passes). New store logic (a new action, a new stage transition) gets a test with an in-memory/fake `autoaiClient`, following the existing `AuthService` test pattern (in-memory fake repository) on the main-process side.
