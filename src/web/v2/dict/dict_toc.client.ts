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
import {
  DrawerController,
  DRAWER_DEFAULT_DVH,
  DRAWER_EXPANDED_DVH,
  DRAWER_FLOOR_DVH,
} from "@/web/v2/core/drawer.client";

export class MorcusDictToc extends BaseElement {
  private drawerController: DrawerController | null = null;
  private mediaQuery: MediaQueryList | null = null;
  private readonly onMediaChange = () => this.syncDrawerState();

  protected override onConnect() {
    this.mediaQuery = window.matchMedia("(max-width: 1079.98px)");
    this.listen(this.mediaQuery, "change", this.onMediaChange);
    this.syncDrawerState();
  }

  protected override onDisconnect() {
    this.destroyDrawer();
    this.mediaQuery = null;
  }

  private destroyDrawer() {
    if (this.drawerController) {
      this.drawerController.dispose();
      this.drawerController = null;
      document.documentElement.style.removeProperty("--drawer-height");
    }
  }

  private syncDrawerState() {
    const isMobile = this.mediaQuery?.matches ?? window.innerWidth < 1080;
    if (isMobile) {
      if (!this.drawerController) {
        const handle = this.querySelector<HTMLElement>(".toc-bar");
        const details = this.querySelector<HTMLDetailsElement>(".toc-details");
        if (handle && details) {
          this.drawerController = new DrawerController({
            drawer: this,
            handle,
            layoutElement: document.documentElement,
            detailsElement: details,
            minHeight: 28,
            defaultDvh: DRAWER_DEFAULT_DVH,
            floorDvh: DRAWER_FLOOR_DVH,
            expandedDvh: DRAWER_EXPANDED_DVH,
          });
        }
      }
    } else {
      this.destroyDrawer();
      // Ensure details disclosure remains open on desktop
      const details = this.querySelector<HTMLDetailsElement>(".toc-details");
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
