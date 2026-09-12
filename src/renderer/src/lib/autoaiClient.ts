/**
 * Single import point for the main-process bridge. Nothing else in the
 * renderer should reach for `window.autoai` directly - going through here
 * means swapping the transport (e.g. for a component test) only touches
 * this file.
 */
export const autoaiClient = window.autoai;
