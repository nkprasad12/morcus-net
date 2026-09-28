/**
 * Parity check between a full page and its slot partial (see
 * `core/slots.common.ts`). Needs a jsdom test environment.
 */

import { SLOT_ATTR } from "@/web/v2/core/slots.common";

/**
 * Asserts that `partialHtml` holds exactly `slots`, in order, and that each
 * template's element is byte-for-byte the element the full page renders for
 * that slot. Also fails if the full page marks a slot the partial omits,
 * since a page turn would then leave it stale.
 */
export function expectSlotParity(
  fullHtml: string,
  partialHtml: string,
  slots: readonly string[]
): void {
  const full = new DOMParser().parseFromString(fullHtml, "text/html");
  // Leading `<template>`s would otherwise be parsed into `<head>`.
  const partial = new DOMParser().parseFromString(
    `<body>${partialHtml}</body>`,
    "text/html"
  );

  const templates = Array.from(partial.body.children);
  expect(templates.map((t) => t.tagName.toLowerCase())).toEqual(
    slots.map(() => "template")
  );
  expect(templates.map((t) => t.getAttribute(SLOT_ATTR))).toEqual([...slots]);

  const fullSlots = Array.from(full.querySelectorAll(`[${SLOT_ATTR}]`)).map(
    (el) => el.getAttribute(SLOT_ATTR)
  );
  expect([...fullSlots].sort()).toEqual([...slots].sort());

  for (const template of templates) {
    if (!(template instanceof HTMLTemplateElement)) continue;
    const name = template.getAttribute(SLOT_ATTR);
    const live = full.querySelectorAll(`[${SLOT_ATTR}="${name}"]`);
    expect(live).toHaveLength(1);
    expect(template.content.children).toHaveLength(1);
    expect(template.content.children[0].outerHTML).toBe(live[0].outerHTML);
  }
}
