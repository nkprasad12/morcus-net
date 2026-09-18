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
  private mediaQuery: MediaQueryList | null = null;
  private readonly onMediaChange = () => this.syncDrawerState();
  private readonly drawerController = this.addController(
    new DrawerController({
      root: this,
      drawerSelector: ":scope",
      handleSelector: ".toc-bar",
      detailsSelector: ".toc-details",
      layoutElement: () => document.documentElement,
      minHeight: 28,
      defaultDvh: DRAWER_DEFAULT_DVH,
      floorDvh: DRAWER_FLOOR_DVH,
      expandedDvh: DRAWER_EXPANDED_DVH,
      enabled: () => this.isMobileViewport(),
    })
  );

  private isMobileViewport(): boolean {
    return this.mediaQuery?.matches ?? window.innerWidth < 1080;
  }

  protected override onConnect() {
    if (typeof window.matchMedia === "function") {
      this.mediaQuery = window.matchMedia("(max-width: 1079.98px)");
    }
    this.scope.listen(this.mediaQuery, "change", this.onMediaChange);
    if (!this.isMobileViewport()) {
      this.ensureDesktopDetailsOpen();
    }
  }

  protected override onDisconnect() {
    this.mediaQuery = null;
  }

  private ensureDesktopDetailsOpen() {
    const details = this.querySelector<HTMLDetailsElement>(".toc-details");
    if (details && !details.open) {
      details.open = true;
    }
  }

  private syncDrawerState() {
    if (this.isMobileViewport()) {
      if (!this.drawerController.isConnected) {
        this.drawerController.connect();
      }
    } else {
      this.drawerController.dispose();
      this.ensureDesktopDetailsOpen();
    }
  }

  /**
   * Exposed for testing: returns current active DrawerController.
   */
  getDrawerController(): DrawerController | null {
    return this.drawerController.isConnected ? this.drawerController : null;
  }
}

registerElement("morcus-dict-toc", MorcusDictToc);
