/**
 * @jest-environment jsdom
 */

import { html, raw } from "@/web/v2/core/html.common";
import {
  liveSlot,
  renderSlotTemplates,
  slotAttr,
} from "@/web/v2/core/slots.common";
import { expectSlotParity } from "@/web/v2/testing/slot_parity";

describe("slot_parity & liveSlot", () => {
  test("expectSlotParity passes on matching full-page and partial slots", () => {
    const full = String(
      html`<div>
        ${raw(
          liveSlot(
            html`<div class="summary" ${raw(slotAttr("summary"))}>Results</div>`
          )
        )}
        <div class="content" ${raw(slotAttr("content"))}>Body</div>
      </div>`
    );
    const partial = String(
      renderSlotTemplates([
        ["summary", `<div class="summary" data-slot="summary">Results</div>`],
        ["content", `<div class="content" data-slot="content">Body</div>`],
      ])
    );
    expect(() =>
      expectSlotParity(full, partial, ["summary", "content"])
    ).not.toThrow();
  });

  test("expectSlotParity fails when a slot root carries aria-live directly", () => {
    const full = String(
      html`<div>
        <div class="summary" ${raw(slotAttr("summary"))} aria-live="polite">
          Results
        </div>
      </div>`
    );
    const partial = String(
      renderSlotTemplates([
        [
          "summary",
          `<div class="summary" data-slot="summary" aria-live="polite">Results</div>`,
        ],
      ])
    );
    expect(() => expectSlotParity(full, partial, ["summary"])).toThrow(
      /Slot "summary" carries a live-region attribute \(polite\) on the \[data-slot\] root/
    );
  });

  test("expectSlotParity fails when a slot root carries role='status' or 'alert' or 'log'", () => {
    const full = String(
      html`<div>
        <div class="summary" ${raw(slotAttr("summary"))} role="status">
          Results
        </div>
      </div>`
    );
    const partial = String(
      renderSlotTemplates([
        [
          "summary",
          `<div class="summary" data-slot="summary" role="status">Results</div>`,
        ],
      ])
    );
    expect(() => expectSlotParity(full, partial, ["summary"])).toThrow(
      /Slot "summary" carries a live-region attribute \(role="status"\) on the \[data-slot\] root/
    );
  });

  test("liveSlot produces stable wrapper with default polite and custom options", () => {
    const defaultLive = String(liveSlot(html`<span data-slot="s">Text</span>`));
    expect(defaultLive).toBe(
      '<div aria-live="polite"><span data-slot="s">Text</span></div>'
    );

    const assertiveLive = String(
      liveSlot(html`<span data-slot="s">Text</span>`, {
        politeness: "assertive",
      })
    );
    expect(assertiveLive).toBe(
      '<div aria-live="assertive"><span data-slot="s">Text</span></div>'
    );

    const withClass = String(
      liveSlot(html`<span data-slot="s">Text</span>`, {
        className: "custom-live-wrap",
        politeness: "polite",
      })
    );
    expect(withClass).toBe(
      '<div class="custom-live-wrap" aria-live="polite"><span data-slot="s">Text</span></div>'
    );
  });
});
