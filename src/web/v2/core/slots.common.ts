/**
 * Server side of multi-region swaps ({@link swapSlots} in
 * `core/partial.client.ts`).
 *
 * A slot is an element marked `data-slot="<name>"` whose markup changes with
 * the page (the passage, a pager link, a page label). The full page renders
 * each slot in place. A partial response renders the same elements, each
 * wrapped in `<template data-slot="<name>">`, and the client replaces every
 * live slot with its template's element.
 *
 * Both must come from the same renderer functions: drift between them is what
 * the client used to paper over by scraping one region to patch another.
 * Pin that with a parity test (`testing/slot_parity.ts`).
 */

import { html, raw, type SafeHtml } from "@/web/v2/core/html.common";

/** The attribute naming a slot, on the live element and on its template. */
export const SLOT_ATTR = "data-slot";

/** `data-slot="<name>"`, for server templates that mark an element as a slot. */
export function slotAttr(name: string): SafeHtml {
  return html`data-slot="${name}"`;
}

/**
 * The partial response for a slot swap: one `<template data-slot>` per slot,
 * in the given order.
 *
 * Each value must be markup produced by the same renderer as the full page,
 * with a single root element that itself carries `data-slot="<name>"` (so the
 * next swap can find it).
 */
export function renderSlotTemplates(
  slots: ReadonlyArray<readonly [name: string, markup: string]>
): SafeHtml {
  return html`${raw(
    slots
      .map(
        ([name, markup]) =>
          // Trusted: `markup` is our own SSR output (see the doc comment).
          html`<template data-slot="${name}">${raw(markup)}</template>`
      )
      .join("\n")
  )}`;
}
