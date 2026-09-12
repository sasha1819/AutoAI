---
name: verify-changes
description: The verification gate for the AutoAI repo - run it after ANY change to src/ or test/, before calling work done. Covers what can run on which machine, the failures this codebase actually produces and their real causes, and the rules for fixing them.
---

# Verify before calling it done

Any change to `src/**` or `test/**` gets this gate. Not "when it feels risky" - every time. The bugs this catches (a missing tsconfig path mapping, an unused parameter, an index access that can be `undefined`) are cheap to find here and expensive to find in a running app.

## The gate, in this order

```
npm run verify       # typecheck -> lint -> test, chained
```

Or the steps individually, when you need to isolate a failure:

```
npm run typecheck    # tsc, both projects
npm run lint         # eslint, --max-warnings 0
npm test             # vitest
```

Cheapest and most informative first. A type error usually explains a lint error, and both usually explain a test failure - so fix in that order rather than chasing the test.

Re-run the **whole** gate after a fix, never just the step that failed. Fixes routinely break an earlier step.

## Where each step can run — read this first

The bridge Claude sessions use runs a **Linux VM** sharing the Mac's folder; `node_modules` belongs to **macOS**. (Full explanation in `CLAUDE.md` at the repo root.)

| Step | Through the bridge | On the Mac |
|---|---|---|
| `npm run typecheck` | yes | yes |
| `npm run lint` | yes | yes |
| `npm test` | **no** — native binding | yes |
| `npm run verify` | **no** — includes test | yes |
| `npm install` / `npm ci` | **no** | yes |
| `npm run dev` / `build` | **no** | yes |

If only the first two could run, say so explicitly: "typecheck and lint pass, tests un-run — run `npm test` on the Mac." Never imply a suite passed that never executed.

## Failures this repo actually produces

**`Cannot find module '@shared/ipc-contract'` from tsc** — the tsconfigs need `baseUrl` + `paths` for `@shared/*`. electron-vite resolves the alias through its own config, so the app builds fine while typecheck fails. Both `tsconfig.node.json` and `tsconfig.web.json` need the mapping; a new tsconfig needs it too.

**`Cannot find module @rollup/rollup-linux-*`** — this is **not** the npm optional-dependency bug its own error message suggests. It means the command is running on Linux against a macOS install. Run it on the Mac. **Never `rm -rf node_modules` to "fix" this** — it destroys the Mac's install and cannot be restored through the bridge (3-minute command ceiling, background processes killed, empty npm cache, registry 403).

**`Object is possibly 'undefined'` on `arr[0]` or `record[key]`** — `noUncheckedIndexedAccess` is on, deliberately. Fix with `?? fallback` or a real check. Never with `!` or a cast: the whole point is that the element genuinely might not be there.

**`'x' is defined but never used`** — prefix with `_` only if the parameter must stay for positional reasons (e.g. `_event` in an IPC handler). Otherwise delete it.

**`consistent-type-imports`** — type-only imports must use `import type`. A value and a type from the same module in two statements is fine.

**`no-restricted-syntax` about logging secrets** — a custom rule bans `console.log` of anything matching password/secret/token. If it fires, the fix is to remove the log, never to reword the string past the regex.

## Rules for fixing

- **Fix the cause, not the symptom.** A type error is the compiler describing a real code path.
- **No `any`, no `@ts-ignore`, no `eslint-disable`** to make an error go away. If one is genuinely warranted, it carries a comment saying why, and it gets mentioned in the report rather than slipped in.
- **Don't widen a type to silence an error.** If `string | null` is inconvenient, the null case still happens at runtime.
- **Don't delete or skip a failing test** to get green. A failing test is either a real bug or a wrong test - say which.
- Casting to satisfy the compiler is how a lie enters the codebase. `dialog.showOpenDialog(win as BrowserWindow, …)` compiled fine and would have thrown at runtime when there was no owner window; the honest fix was to branch on the two overloads.

## What the gate does NOT catch

Green does not mean working. Every runtime bug found in this repo so far type-checked cleanly:

- a cast that lied (`as BrowserWindow` where the value could be `undefined`)
- an IPC payload trusted because TypeScript annotated it — **a type annotation on a handler parameter is a compile-time fiction across a process boundary**, always parse
- a `statSync` that throws on a permissions error and takes the handler down
- a rejected IPC promise nobody caught, surfacing as an unhandled rejection

So after the gate is green, also confirm:

- **New IPC channel?** Contract + main handler + preload all updated. Verify by **restarting the app**, not refreshing — main and preload don't hot-reload, so a renderer-only wiring looks alive in dev while the handler is missing.
- **New interactive control?** It does the thing it says. See "No dead controls" in the `ui-builder` agent.
- **New channel taking user data?** Payload parsed in main before use, and every `await` on an IPC call in the renderer is inside a try/catch. Then run the `autoai-security-checklist` skill's input-validation section.
