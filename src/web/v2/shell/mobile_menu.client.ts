import { bindDismissable } from "@/web/v2/core/dismissable.client";
import {
  createSingletonSetup,
  type CleanupFn,
} from "@/web/v2/core/disposable.client";

/**
 * Mobile navigation menu outside-click and Escape key dismissal.
 */
export const setupMobileMenu: (doc?: Document) => CleanupFn =
  createSingletonSetup((doc: Document = document): CleanupFn => {
    const getMenu = () => doc.querySelector<HTMLDetailsElement>(".mobile-menu");
    const getTrigger = () =>
      getMenu()?.querySelector<HTMLElement>("summary") ?? null;

    return bindDismissable({
      container: getMenu,
      triggerEl: getTrigger,
      isOpen: () => Boolean(getMenu()?.open),
      onDismiss: () => {
        const menu = getMenu();
        if (menu) {
          menu.open = false;
        }
      },
      listenPointerDown: true,
      ignore: (target) => Boolean(getTrigger()?.contains(target)),
    });
  });

if (typeof document !== "undefined") {
  setupMobileMenu();
}
