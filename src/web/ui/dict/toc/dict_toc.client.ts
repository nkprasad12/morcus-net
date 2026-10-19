/**
 * UI V2 Dictionary Table of Contents (TOC) Custom Element
 *
 * Progressively enhances the SSR Table of Contents drawer on narrow screens
 * (< 1080px) with touch drag-resizing, height snap points, and keyboard controls
 * via DrawerController. On wide screens (>= 1080px), the TOC acts as a static
 * sticky rail sidebar.
 */

import {
  BaseElement,
  registerElement,
} from "@/web/ui/core/dom/base_element.client";
import {
  DrawerController,
  DRAWER_EXPANDED_SVH,
  DRAWER_FLOOR_SVH,
} from "@/web/ui/core/widgets/drawer.client";

export const TOC_DRAWER_DEFAULT_SVH = 30;

export class MorcusDictToc extends BaseElement {
  #mediaQuery: MediaQueryList | null = null;
  readonly #onMediaChange = () => this.#syncDrawerState();
  readonly #drawerController = this.addController(
    new DrawerController({
      root: this,
      drawerSelector: ":scope",
      handleSelector: ".toc-bar",
      detailsSelector: ".toc-details",
      heightTargets: () =>
        document.querySelectorAll<HTMLElement>(
          ".back-to-top, .results-layout.has-toc"
        ),
      minHeight: 28,
      defaultSvh: TOC_DRAWER_DEFAULT_SVH,
      floorSvh: DRAWER_FLOOR_SVH,
      expandedSvh: DRAWER_EXPANDED_SVH,
      enabled: () => this.#isMobileViewport(),
    })
  );

  #isMobileViewport(): boolean {
    return this.#mediaQuery?.matches ?? window.innerWidth < 1080;
  }

  protected override onConnect() {
    if (typeof window.matchMedia === "function") {
      this.#mediaQuery = window.matchMedia("(max-width: 1079.98px)");
    }
    this.scope.listen(this.#mediaQuery, "change", this.#onMediaChange);
    if (!this.#isMobileViewport()) {
      this.#ensureDesktopDetailsOpen();
    }
  }

  protected override onDisconnect() {
    this.#mediaQuery = null;
  }

  #ensureDesktopDetailsOpen() {
    const details = this.querySelector<HTMLDetailsElement>(".toc-details");
    if (details && !details.open) {
      details.open = true;
    }
  }

  #syncDrawerState() {
    if (this.#isMobileViewport()) {
      if (!this.#drawerController.isConnected) {
        this.#drawerController.connect();
      }
    } else {
      this.#drawerController.dispose();
      this.#ensureDesktopDetailsOpen();
    }
  }

  /**
   * Exposed for testing: returns current active DrawerController.
   */
  getDrawerController(): DrawerController | null {
    return this.#drawerController.isConnected ? this.#drawerController : null;
  }
}

registerElement("morcus-dict-toc", MorcusDictToc);

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-dict-toc": MorcusDictToc;
  }
}
