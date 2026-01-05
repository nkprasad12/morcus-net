import type { HEAVY_PAGES } from "@/web/client/routing/special_pages";
import { Suspense, lazy } from "react";

export type LazyComponent = keyof typeof HEAVY_PAGES;

export function lazyLoaded(component: LazyComponent) {
  const LazyComponent = lazy(() =>
    import("@/web/client/routing/special_pages").then((module) => ({
      default: module.HEAVY_PAGES[component],
    }))
  );
  return function WithFallback() {
    return (
      <Suspense fallback={<div>loading...</div>}>
        <LazyComponent />
      </Suspense>
    );
  };
}
