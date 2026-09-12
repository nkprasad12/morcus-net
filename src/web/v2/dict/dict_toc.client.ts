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
} from "@/web/v2/core/base_element.client";
import { DrawerController } from "@/web/v2/core/drawer.client";

export class MorcusDictToc extends BaseElement {
  private drawerController: DrawerController | null = null;
  private mediaQuery: MediaQueryList | null = null;
  private readonly onMediaChange = () => this.syncDrawerState();

  override connectedCallback() {
    super.connectedCallback();
    this.mediaQuery = window.matchMedia("(max-width: 1079.98px)");
    if (this.mediaQuery.addEventListener) {
      this.mediaQuery.addEventListener("change", this.onMediaChange);
    } else {
      this.mediaQuery.addListener(this.onMediaChange);
    }
    this.syncDrawerState();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    if (this.mediaQuery) {
      if (this.mediaQuery.removeEventListener) {
        this.mediaQuery.removeEventListener("change", this.onMediaChange);
      } else {
        this.mediaQuery.removeListener(this.onMediaChange);
      }
      this.mediaQuery = null;
    }
    this.drawerController?.destroy();
    this.drawerController = null;
    document.documentElement.style.removeProperty("--v2-drawer-height");
  }

  private syncDrawerState() {
    const isMobile = this.mediaQuery?.matches ?? window.innerWidth < 1080;
    if (isMobile) {
      if (!this.drawerController) {
        const handle = this.querySelector<HTMLElement>(".v2-toc-bar");
        const details =
          this.querySelector<HTMLDetailsElement>(".v2-toc-details");
        if (handle && details) {
          this.drawerController = new DrawerController({
            drawer: this,
            handle,
            layoutElement: document.documentElement,
            detailsElement: details,
            minHeight: 54,
            defaultDvh: 48,
            floorDvh: 18,
            expandedDvh: 88,
          });
        }
      }
    } else {
      if (this.drawerController) {
        this.drawerController.destroy();
        this.drawerController = null;
        document.documentElement.style.removeProperty("--v2-drawer-height");
      }
      // Ensure details disclosure remains open on desktop
      const details = this.querySelector<HTMLDetailsElement>(".v2-toc-details");
      if (details && !details.open) {
        details.open = true;
      }
    }
  }

  /**
   * Exposed for testing: returns current active DrawerController.
   */
  getDrawerController(): DrawerController | null {
    return this.drawerController;
  }
}

registerElement("morcus-dict-toc", MorcusDictToc);
