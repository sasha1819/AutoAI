---
name: autoai-security-checklist
description: Security checklist codified from AutoAI's system-prompt security baseline, mapped to this specific codebase. Load before merging any change touching secrets, child processes, IPC, file/network I/O, or dependencies.
---

# AutoAI security checklist

Run through the relevant sections for the change at hand. This is the same baseline from the project's system prompt, translated into concrete checks against the actual files in this repo.

## Secrets management
- Does anything log, persist, or return a plaintext password/token/API key? (`PasswordHasher` should be the only place a raw password is touched, and only long enough to hash it — check it never ends up in a log statement or thrown-error message.)
- New credentials (future: Jira/MCP/device tokens if that work ever starts) go through OS-native secure storage or an encrypted store — never a plain field in the `electron-store` JSON file that `ProfileStore` writes.
- Crash reports / error boundaries: confirm no secret-bearing object gets serialized into them.

## Input validation
- Anything from a config file, project path, URL, or (once built) Appium/Playwright capabilities object is untrusted until validated. Before it can reach a spawned process's argv/env or a `child_process` call, is it checked against an allowlist/shape, not just type-checked?
- Command/argument injection is the realistic threat here — string-concatenating user input into a shell command or driver capability is the failure mode to catch in review.

## Least privilege for child processes
- Once Appium server / browser / driver processes exist: do they bind to `localhost` only? No unnecessary elevated privileges (no `sudo`/admin unless a specific OS step truly requires it)?

## Process lifecycle hygiene
- Are spawned processes torn down on app quit *and* on crash (not just the happy path)? No leaked debugging ports left listening after a session ends?
- Ports/IPC endpoints: predictable fixed ports without auth are hijack-able by another local process — flag if a new server binds one.

## Dependency hygiene
- New dependency: pinned exact/major version (see the existing `electron-store` v8.x pin and its stated reason)? Any known CVEs worth checking before adding it?
- Driver binaries (future: Appium drivers, WinAppDriver, etc.) downloaded at runtime should be checksum/signature-verified, not trusted blindly.

## Update & distribution security
- `electron-builder.yml` / packaging changes: still code-signed, still using an integrity-verified update path if auto-update is ever added?

## Sandboxing / blast-radius
- Does a new feature let a config or script silently do more than the user asked (e.g. drive an unintended device/target)? Destructive-looking actions should confirm with the user rather than proceeding silently — consistent with "explicit config over magic" elsewhere in this project.

## Local IPC security
- `BrowserWindow` stays `contextIsolation: true`, `nodeIntegration: false`, sandboxed — any change to `src/main/index.ts` window config is a red flag to double check.
- Every new channel added to `IpcChannel`/`AutoaiApi` in `src/shared/ipc-contract.ts`: does the main-process handler in `registerIpcHandlers.ts` validate its input rather than trusting the renderer? (Renderer is not fully trusted just because it's "our" code — contextIsolation exists precisely because it can still be compromised via a loaded page/dependency.)

If a finding is severity-uncertain, report it rather than silently fixing or silently ignoring it — this mirrors the project's "push back on unsafe shortcuts" instruction.
