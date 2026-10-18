import { computeAnchoredPlacement } from "@/web/v2/core/widgets/anchored_position.client";

const VIEWPORT = { width: 1000, height: 800 };
const PANEL = { width: 200, height: 100 };
const CENTER_BELOW: Parameters<typeof computeAnchoredPlacement>[3] = {
  align: "center",
  side: "below",
  gap: 8,
  margin: 12,
  caretInset: 12,
};

/** An anchor `width` wide whose left edge is at `left`, spanning y 300..320. */
function anchorAt(left: number, width = 40, top = 300, bottom = 320) {
  return { left, right: left + width, width, top, bottom };
}

describe("computeAnchoredPlacement", () => {
  test("centres the panel below the anchor with the caret on the anchor", () => {
    const p = computeAnchoredPlacement(
      anchorAt(480),
      PANEL,
      VIEWPORT,
      CENTER_BELOW
    );
    // Anchor centre is 500, so a 200px panel starts at 400.
    expect(p).toEqual({ left: 400, top: 328, caretLeft: 100, above: false });
  });

  test("clamps to the left margin and moves the caret to stay on the anchor", () => {
    const p = computeAnchoredPlacement(
      anchorAt(0, 20),
      PANEL,
      VIEWPORT,
      CENTER_BELOW
    );
    expect(p.left).toBe(12);
    // Anchor centre (10) is left of the panel, so the caret stops at the inset.
    expect(p.caretLeft).toBe(12);
  });

  test("clamps to the right margin", () => {
    const p = computeAnchoredPlacement(
      anchorAt(980, 20),
      PANEL,
      VIEWPORT,
      CENTER_BELOW
    );
    expect(p.left).toBe(1000 - 200 - 12);
    expect(p.caretLeft).toBe(200 - 12);
  });

  test("pins a panel wider than the viewport to the left margin", () => {
    const p = computeAnchoredPlacement(
      anchorAt(100),
      { width: 1200, height: 100 },
      VIEWPORT,
      CENTER_BELOW
    );
    expect(p.left).toBe(12);
  });

  test("end alignment lines up the right edges", () => {
    const p = computeAnchoredPlacement(anchorAt(800), PANEL, VIEWPORT, {
      ...CENTER_BELOW,
      align: "end",
      caretInset: 16,
    });
    expect(p.left).toBe(840 - 200);
    expect(p.caretLeft).toBe(820 - 640);
  });

  describe('side: "auto"', () => {
    const auto = { ...CENTER_BELOW, side: "auto", gap: 6, margin: 8 } as const;

    test("prefers above when it fits", () => {
      const p = computeAnchoredPlacement(anchorAt(480), PANEL, VIEWPORT, auto);
      expect(p.above).toBe(true);
      expect(p.top).toBe(300 - 100 - 6);
    });

    test("drops below when there is no room above and more room below", () => {
      const p = computeAnchoredPlacement(
        anchorAt(480, 40, 50, 70),
        PANEL,
        VIEWPORT,
        auto
      );
      expect(p.above).toBe(false);
      expect(p.top).toBe(70 + 6);
    });

    test("stays above when cramped but there is still more room above", () => {
      const p = computeAnchoredPlacement(
        anchorAt(480, 40, 60, 780),
        PANEL,
        VIEWPORT,
        auto
      );
      expect(p.above).toBe(true);
    });
  });
});
