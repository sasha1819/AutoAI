# Working in this repo

## The two-machine trap — read this before running any command

This project is developed from Claude sessions that reach the Mac through a bridge. That bridge's shell (`device_bash`) runs in a **Linux VM**, not on macOS — but `~/mnt/autoai-desktop` there is the **same folder** as `~/Documents/Project X/Auto/autoai-desktop` on the Mac.

That means `node_modules` in this repo belongs to **macOS** (darwin-arm64 native binaries), while commands run through the bridge execute under **Linux** (aarch64). Anything that loads a native binary will fail with a confusing error.

**Safe to run through the bridge** (pure JavaScript, no native bindings):
- `npm run typecheck` — tsc
- `npm run lint` — eslint

**Must be run in a real macOS Terminal, never through the bridge:**
- `npm install` / `npm ci` — installs platform-specific binaries; running it from Linux replaces the Mac's working install with a Linux one (or a broken partial one — the bridge kills any command at ~3 minutes and background processes don't survive)
- `npm test` — vitest → vite → rollup, which loads a native binding
- `npm run dev`, `npm run build`, `npm run build:mac` — electron, esbuild, electron-builder

If `npm test` fails with `Cannot find module @rollup/rollup-linux-*`, that is **not** the npm optional-dependency bug the error message suggests. It means the command is running on Linux against a macOS install. Do not "fix" it by deleting `node_modules` — that destroys the Mac's working install and it cannot be restored through the bridge. Run the test on the Mac instead.

## Electron process model — what hot-reloads and what doesn't

`npm run dev` hot-reloads the **renderer** only. The **main process** (`src/main/**`) and **preload** (`src/preload/**`) do not.

So a new IPC channel looks alive in dev while being completely dead: the renderer picks up the new button, the handler was never registered. Symptom is a control that does nothing when clicked. **Restart the app** — a refresh isn't enough — after any change to the contract, main, or preload.

## Adding a capability — the order that keeps three processes in sync

1. `src/shared/ipc-contract.ts` — channel constant, typed input, discriminated result, `AutoaiApi` surface
2. `src/main/services/*` — the service, taking a repository interface so it's testable without Electron
3. `src/main/ipc/registerIpcHandlers.ts` — the one auditable place every renderer-reachable channel is registered
4. `src/preload/index.ts` — one function per channel, 1:1
5. Renderer — Zustand store, then screen
6. `test/*.test.ts` — service tests with an in-memory fake repository

Skipping straight to the renderer produces exactly the dead-control bug described above.

## Native OS capabilities

Folder/file dialogs, notifications, and device access are **main process only**. The renderer is sandboxed with `contextIsolation: true` / `nodeIntegration: false` and cannot reach them — it asks main over a channel. See `project:pick-folder`.
