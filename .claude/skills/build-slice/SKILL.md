---
name: build-slice
description: Builds exactly one screen, one component, or one discrete piece of logic - never a whole flow - then stops and reports. Load when asked to add or change a feature in AutoAI's own app (not a target project it scans). Use this instead of dispatching a big multi-screen background build.
---

# One slice, then stop

The last several AutoAI features were each one large background agent covering
a whole multi-screen flow - dozens of files, tens of minutes unattended,
reviewed once at the end. That's the right shape for something already scoped
and approved as a big unit. It is the wrong shape for everyday work, where
the point is to see one piece land before deciding what's next.

This skill is not a new engine - `flow-builder`'s sequence is already right,
and `verify-changes` is already the gate. What was missing is the discipline
to stop at one piece instead of chaining into the next one unasked. That
discipline is the whole content of this skill.

## Step 0 — scope check, out loud

If the request as given spans more than one screen or component ("add login,
registration, and password reset"), say so before touching anything: name the
pieces, pick the first one, state what's being deferred. Never silently
expand a request into everything it could imply. If the request is already
one screen/component, skip straight to Step 1.

## Step 1 — contract

Add only what this one slice needs to `src/shared/ipc-contract.ts` — the
channel constant, the typed input/result, the `AutoaiApi` surface entry.
Nothing speculative for a later slice.

## Step 2 — main service

Repository-interface-injected, same shape as every existing service
(`AuthService`, `TestPlanService`, `ProjectScanService`, ...) so it's
testable without a real Electron runtime. Validate any renderer-supplied
input here — a TypeScript annotation on an IPC handler parameter is a
compile-time fiction across a process boundary.

## Step 3 — wire it

`src/main/ipc/registerIpcHandlers.ts` → `src/preload/index.ts`, one function
per channel. This is the one auditable place every renderer-reachable
channel is registered — don't skip it even for something that feels internal.

## Step 4 — renderer

One store, one screen or component. Reuse before creating — check
`autoai-component-patterns` for the existing primitive before writing a new
one (`FormField`, `PrimaryButton`, `SectionEmpty`, `ConfirmDialog`, ...), and
match the warm-paper tokens already in `tailwind.config.js`. No dead
controls: a button that doesn't yet do the real thing says so inline rather
than pretending.

## Step 5 — tests

A service test with a fake repository, following `test/authService.test.ts`'s
pattern. A renderer store test if a store method was added, following the
existing fake-`window.autoai`-bridge pattern. Skip only what this slice
genuinely didn't touch.

## Step 6 — verify, for real

```
npm run verify
```

If the slice touched `main/`, `preload/`, or the contract, also restart the
app and confirm it actually loads — main and preload don't hot-reload, so a
new channel can look wired in dev while the handler was never registered.
Two different slices this project already had to re-learn that the hard way;
don't make it a third. Kill any stale Electron process first
(`pkill -f "autoai-desktop/node_modules/electron"` and the matching
`electron-vite` pattern), then `env -u ELECTRON_RUN_AS_NODE npm run dev`.

## Step 7 — stop and report

State plainly: what was built, what `npm run verify` said (and the app
launch, if it applied), and what the next slice would logically be —
**without starting it**. The report is the handoff point. Landing the next
piece is the next request, not an automatic continuation of this one.

## How this runs

Inline, in the current session, by default — not a background agent. A
single screen or component is small enough to stay visible turn by turn,
which is the actual point of working this way. Reach for a background agent
only when a slice turns out to be larger than expected once scoped (Step 0
surfaces that) — and say so explicitly before dispatching one, rather than
defaulting to it the way earlier features in this project did.
