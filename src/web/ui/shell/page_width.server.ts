import {
  WIDTH_SURFACES,
  type WidthSurface,
} from "@/web/ui/core/widgets/page_width.common";
import { ssr } from "@/web/ui/core/server/ssr_template.server";

/**
 * Draggable page width handles for `surface`, one on each edge of the page
 * column, owned by `<morcus-page-width>` (`shell/page_width_handles.client.ts`).
 * JS-only: the No-JS page keeps the default width. The ARIA values are the
 * defaults; the element corrects them on connect.
 */
export function renderPageWidthHandles(surface: WidthSurface): string {
  const { def, min } = WIDTH_SURFACES[surface];
  const handle = (side: "left" | "right") =>
    `<div class="page-handle resize-handle" data-side="${side}" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Resize page width" aria-valuemin="${min}" aria-valuemax="${def}" aria-valuenow="${def}"><div class="resize-grip"></div></div>`;
  return ssr`<morcus-page-width data-surface="${surface}" data-js-only>
    <div class="page-gutter-tint" data-side="left"></div>
    <div class="page-gutter-tint" data-side="right"></div>
    ${handle("left")}
    ${handle("right")}
    <div class="page-width-readout" aria-hidden="true"></div>
  </morcus-page-width>`;
}
