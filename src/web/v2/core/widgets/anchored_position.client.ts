/**
 * Placement math for popups anchored to a trigger element: horizontal alignment
 * clamped to the viewport, an optional above/below flip, and the caret offset
 * that points back at the anchor.
 *
 * Pure (no DOM reads or writes) so every popup shares one tested
 * implementation. Coordinates are viewport-relative, as returned by
 * `getBoundingClientRect()`: `position: fixed` callers use them as-is, and
 * `position: absolute` callers add the page scroll offset.
 */

/** The subset of `DOMRect` the placement needs. */
interface AnchorRect {
  readonly top: number;
  readonly bottom: number;
  readonly left: number;
  readonly right: number;
  readonly width: number;
}

interface AnchoredPlacementOptions {
  /** `"center"` centres the panel on the anchor; `"end"` aligns right edges. */
  readonly align: "center" | "end";
  /**
   * `"below"` always places the panel under the anchor. `"auto"` prefers above,
   * and drops below only when there isn't room above and there's more below.
   */
  readonly side: "below" | "auto";
  /** Distance (px) between the anchor and the panel. */
  readonly gap: number;
  /** Minimum distance (px) between the panel and the viewport edges. */
  readonly margin: number;
  /** Minimum distance (px) between the caret and the panel's side edges. */
  readonly caretInset: number;
}

interface AnchoredPlacement {
  /** Viewport x of the panel's left edge. */
  readonly left: number;
  /** Viewport y of the panel's top edge. */
  readonly top: number;
  /** Caret x, relative to the panel's left edge. */
  readonly caretLeft: number;
  /** Whether the panel sits above the anchor. */
  readonly above: boolean;
}

export function computeAnchoredPlacement(
  anchor: AnchorRect,
  panel: { readonly width: number; readonly height: number },
  viewport: { readonly width: number; readonly height: number },
  options: AnchoredPlacementOptions
): AnchoredPlacement {
  const { align, side, gap, margin, caretInset } = options;
  const anchorCenter = anchor.left + anchor.width / 2;
  const idealLeft =
    align === "center"
      ? anchorCenter - panel.width / 2
      : anchor.right - panel.width;
  // When the panel is wider than the viewport, pin it to the left margin.
  const maxLeft = Math.max(margin, viewport.width - panel.width - margin);
  const left = Math.max(margin, Math.min(idealLeft, maxLeft));

  const spaceAbove = anchor.top;
  const above =
    side === "auto" &&
    (spaceAbove >= panel.height + margin ||
      spaceAbove > viewport.height - anchor.bottom);
  const top = above ? anchor.top - panel.height - gap : anchor.bottom + gap;

  const caretLeft = Math.max(
    caretInset,
    Math.min(anchorCenter - left, panel.width - caretInset)
  );
  return { left, top, caretLeft, above };
}
