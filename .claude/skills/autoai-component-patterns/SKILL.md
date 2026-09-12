---
name: autoai-component-patterns
description: Component, styling, state, and flow conventions for AutoAI's Electron renderer. Load when building or editing anything under src/renderer.
---

# AutoAI renderer conventions

## Flow gate, not per-screen routing logic
`App.tsx` renders one screen based purely on `useSessionStore().stage`. Only the `ready` branch reaches react-router; everything before it is a linear gate, not a set of pages someone can navigate between:

- `loading` → splash/spinner
- `needs-registration` → RegisterScreen
- `needs-login` → LoginScreen
- `needs-onboarding` → OnboardingScreen
- `ready` → the routed app (Home, Projects, a project, Runs, Reports, Settings)

`stageFor(hasProfile, session)` in `useSessionStore.ts` is the only place this decision is made. A new screen that gates on auth/session state plugs into this function and the `BootstrapStage` union — it does not add its own `if (!session) redirect()` logic in a component.

## State
One Zustand store per concern (`useSessionStore`, `useProjectsStore`, `useTestPlanStore`). Actions are async, call `autoaiClient`, and `set()` once with the result — no separate loading-flag juggling per action beyond what `stage` already encodes. Fallible actions return `Promise<boolean>` (or the raw `AuthResult`/similar) rather than throwing, and stash the error code in `lastError` for the UI to read via `clearError()`.

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
- `RoleCard` — selection-card pattern used in Onboarding; reuse for any future "pick one of N options" UI rather than a new pattern.
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

## Role-adaptive UI
`UserRole` = `manual_tester | automation_engineer | qa_lead` (`ROLE_OPTIONS` in `src/shared/ipc-contract.ts` has the copy). This isn't just screen selection — it's a vocabulary/complexity dial. Manual QA Tester copy stays plain-language and outcome-focused ("turn what you already do into automated runs"); Automation Engineer / QA Lead copy can use automation/config terminology directly. When adding UI a Manual QA Tester will see, default to the plainer register and check both against the existing Home screen split.

## An unavailable capability
A source, engine, or integration that isn't built is **listed and disabled with the reason**, not hidden — see `IMPORT_SOURCES` in `lib/importSources.ts`, where five of seven sources say what they need. Hiding them answers "can AutoAI read my TestRail suite?" with silence. What an unavailable thing never does is open onto a form that cannot finish.

## Testing
Vitest, tests live under `test/`, typechecked by `tsconfig.test.json` (which is in `npm run typecheck` — without it a fake repository can fall behind the interface it claims to implement and every test still passes). New store logic (a new action, a new stage transition) gets a test with an in-memory/fake `autoaiClient`, following the existing `AuthService` test pattern (in-memory fake repository) on the main-process side.
