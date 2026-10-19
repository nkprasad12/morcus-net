import { computeAnchoredPlacement } from "@/web/ui/core/widgets/anchored_position.client";
import { LifetimeScope } from "@/web/ui/core/dom/lifetime_scope.client";
import {
  createSingletonSetup,
  type CleanupFn,
} from "@/web/ui/core/dom/disposable.client";
import { bindDismissable } from "@/web/ui/core/widgets/dismissable.client";

/**
 * Interactive abbreviation popover for expandable dictionary words (.lsHover).
 *
 * Uses a single shared top-layer container (`#abbr-popover`, rendered in page_shell.server.ts)
 * to service 1-to-N dynamic `.lsHover` abbreviation targets across dictionary entries.
 * Because targets are dynamic (frequently swapped via partial HTML updates), content is a tooltip
 * without interactive controls (no focus trap), and `#abbr-popover` uses the top-layer Popover API
 * (`popover="manual"`), this utility uses lightweight document delegation rather than
 * the 1-to-1 `AnchoredPopoverController`.
 *
 * Uses a standalone `LifetimeScope` (so its click / Enter handlers pass the
 * activation gate) and `bindDismissable` for standardized outside-tap/Escape dismissal.
 */

export const setupAbbrPopover: (doc?: Document, win?: Window) => CleanupFn =
  createSingletonSetup(
    (doc: Document = document, win: Window = window): CleanupFn => {
      const abbrPopover = doc.getElementById("abbr-popover");
      if (!abbrPopover) {
        return () => {};
      }

      const scope = new LifetimeScope(doc);
      let activeTarget: HTMLElement | null = null;
      const supportsNativePopover =
        typeof abbrPopover.showPopover === "function";

      const closeAbbrPopover = () => {
        if (supportsNativePopover) {
          if (abbrPopover.matches(":popover-open")) {
            abbrPopover.hidePopover();
          }
        } else {
          abbrPopover.style.display = "none";
        }
        activeTarget = null;
      };

      const isPopoverOpen = (): boolean =>
        supportsNativePopover
          ? abbrPopover.matches(":popover-open")
          : abbrPopover.style.display === "block";

      const positionAbbrPopover = (target: HTMLElement) => {
        // Measure at an unconstrained origin so a previous right-edge `left`
        // (or stale inline width) does not shrink-wrap the auto-width box
        // before `offsetWidth` is read.
        abbrPopover.style.position = "absolute";
        abbrPopover.style.removeProperty("width");
        abbrPopover.style.left = "0px";
        abbrPopover.style.top = "0px";

        // Page coordinates (`absolute` + scrollX/scrollY), so window scrolling
        // carries the popover along with its word without a scroll listener.
        const { left, top } = computeAnchoredPlacement(
          target.getBoundingClientRect(),
          {
            width: abbrPopover.offsetWidth || 200,
            height: abbrPopover.offsetHeight || 38,
          },
          { width: win.innerWidth, height: win.innerHeight },
          { align: "center", side: "auto", gap: 6, margin: 8, caretInset: 0 }
        );
        abbrPopover.style.left = `${Math.round(left + win.scrollX)}px`;
        abbrPopover.style.top = `${Math.round(top + win.scrollY)}px`;
      };

      const openAbbrPopover = (target: HTMLElement) => {
        const titleText =
          target.getAttribute("title") || target.dataset.abbrExpansion;
        if (!titleText) return;

        // Cache expansion in dataset to suppress native delayed OS tooltip on hover
        if (!target.dataset.abbrExpansion) {
          target.dataset.abbrExpansion = titleText;
          target.removeAttribute("title");
        }

        // Toggle off if tapping the same active element
        if (activeTarget === target && isPopoverOpen()) {
          closeAbbrPopover();
          return;
        }

        activeTarget = target;
        abbrPopover.textContent = titleText;

        if (supportsNativePopover) {
          abbrPopover.showPopover();
        } else {
          abbrPopover.style.display = "block";
        }
        positionAbbrPopover(target);
      };

      const onClick = (e: MouseEvent) => {
        if (e.defaultPrevented || !(e.target instanceof Element)) return;
        const abbr = e.target.closest<HTMLElement>(".lsHover");
        // `.lsHover` is a plain span with no native click action, so there
        // is nothing to cancel.
        if (abbr) openAbbrPopover(abbr);
        // Outside clicks are closed by `bindDismissable` below, which (unlike
        // this gated listener) still runs when the click lands in a failed
        // component.
      };

      // Keyboard accessibility: Enter or Space on focused .lsHover opens popover
      const onKeyDown = (e: KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          const activeEl = doc.activeElement;
          if (
            activeEl instanceof HTMLElement &&
            activeEl.classList.contains("lsHover")
          ) {
            // Opens the abbreviation popover itself
            e.preventDefault();
            openAbbrPopover(activeEl);
          }
        }
      };

      const onResize = () => {
        if (activeTarget) {
          positionAbbrPopover(activeTarget);
        }
      };

      // Standardized dismiss coordination (pointerdown outside + Escape keydown)
      scope.use(
        bindDismissable({
          container: abbrPopover,
          isOpen: isPopoverOpen,
          onDismiss: closeAbbrPopover,
          listenPointerDown: true,
          ignore: (target) =>
            Boolean(
              activeTarget?.contains(target) ||
                (target instanceof Element && target.closest(".lsHover"))
            ),
        })
      );

      scope.listen(doc, "click", onClick);
      scope.listen(doc, "keydown", onKeyDown);
      scope.listen(win, "resize", onResize, { passive: true });

      return () => {
        scope.dispose();
      };
    }
  );
