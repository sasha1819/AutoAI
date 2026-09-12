---
name: autoai-testid-audit
description: Audits AutoAI's own renderer (src/renderer/src/screens and components) for interactive/anchor elements missing a stable data-testid, and proposes names in the screen.component.element convention. Load when asked to audit, add, or fix test ids across the AutoAI app itself - not for scanning a target project the user is testing (that's SelectorScanner.ts).
---

# Auditing AutoAI's own elements for test ids

This is about AutoAI's own UI being testable - writing Playwright (or any
E2E tool) against the AutoAI app itself. It is the mirror image of
`SelectorScanner.ts`, which goes the other direction: finding ids inside a
*target* project the user pointed AutoAI at. Don't conflate the two -
nothing here touches `SelectorScanner.ts` or its output.

This skill **produces a list for review. It does not edit component files.**
Landing the actual attributes is a separate, follow-up change once the list
has been looked at - the same "propose, then approve" shape as every other
consequential change in this app (a scan's suggested flows, a setup
proposal's install commands).

## The convention: `screen.component.element`

`data-testid`, always - never `id`. A lot of components here already use a
real `id` for accessibility pairing (`FormField`'s `useId()`-generated ids
tied to `htmlFor`), and those are randomly generated per mount: fine for
accessibility, useless as a stable test selector. `data-testid` is a
separate, fixed, purpose-built attribute that never collides with that.

Three dot-separated segments, each kebab-case:

- **screen** - the route/screen the element lives on (`overview`,
  `projects`, `project`, `settings`, `runs`). For a component reused across
  more than one screen (`PrimaryButton`, `ConfirmDialog`), use the
  component's own name as the first segment instead of guessing a screen
  (`confirm-dialog.confirm-button`), since the id has to make sense
  wherever the component is mounted.
- **component** - the file the element is defined in, kebab-cased
  (`ProjectScanCard` → `scan-card`, `TestCaseDetail` → `case-detail`).
- **element** - what the thing actually is, in plain words
  (`run-button`, `submit-button`, `email-field`, `open-link`,
  `error-banner`).

Examples: `project.scan-card.run-button`, `settings.claude-connection.check-button`,
`login.form.submit-button`, `overview.project-row.open-link`,
`project.case-detail.delete-button`.

**Never embed a dynamic value (a database id, an index) into the testid
itself.** `project.case-list.row` is the id for every row; a test
distinguishes *which* row with the testing framework's own text/filter
matching (`.filter({ hasText: 'Checkout flow' })`), not by baking the case's
UUID into the selector. A testid that changes per record isn't a stable
selector, it's a fingerprint.

## What counts as "needs one"

- Every button, link that navigates, input, textarea, select, checkbox, and
  radio a test would plausibly click, fill, or read.
- Container elements a test would assert *on* even without interacting with
  them: an error/status banner, a card that appears conditionally
  (`ProjectScanCard`'s result block), a list row.
- **Not** every wrapping `div`/`span` - a test id on pure layout chrome is
  noise a future refactor has to keep maintaining for no test that will
  ever target it.

## Process

1. Walk `src/renderer/src/screens/*.tsx` then `src/renderer/src/components/*.tsx`.
2. For each qualifying element (see above):
   - No `data-testid` at all → propose one to **add**.
   - Has one already but it doesn't follow the convention (wrong casing,
     missing a segment, a stray one-off left over from earlier work) →
     propose a **replace**, naming the current value.
3. Note which screen(s)/component(s) actually render a shared component
   before naming its first segment - check the import graph, don't guess
   from the component's own name alone.
4. Output one markdown table, grouped by file, in this shape:

   | File | Line | Element | Current | Proposed `data-testid` |
   |---|---|---|---|---|

   Stop there. Do not edit the files in this pass.

## Edge cases seen in this codebase already

- `NavItem` (`AppShell.tsx`) is one component rendered for five different
  nav rows - the element segment carries the distinction
  (`app-shell.nav.overview`, `app-shell.nav.projects`), not a shared
  `app-shell.nav-item`.
- `PrimaryButton`/`FormField`/`ConfirmDialog` are generic primitives with no
  screen of their own - name the *call site*, not the primitive. A
  `PrimaryButton` used as a project's delete button gets
  `project.body.delete-project-button`; the component itself defines no
  testid.
- A row inside a list (`TestCaseList`, `ProjectTable`, `RunsScreen`'s
  `RunRow`) gets one static testid for the row template, per the
  no-dynamic-values rule above.
