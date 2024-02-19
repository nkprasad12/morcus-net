/* istanbul ignore file */

import { useState, useRef, useEffect } from "react";

import {
  QUICK_NAV_ANCHOR,
  SCROLL_JUMP,
} from "@/web/client/pages/dictionary/dictionary_utils";
import { assertEqual } from "@/common/assert";
import { SvgIcon } from "@/web/client/components/generic/icons";

class NavHelper {
  private readonly observer: IntersectionObserver;
  private readonly visible = new Set<string>();
  private readonly anchorIds: string[] = [];
  private readonly idToIndex: Map<string, number> = new Map();

  constructor() {
    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            this.visible.add(entry.target.id);
          } else {
            this.visible.delete(entry.target.id);
          }
        }
      },
      { threshold: [0.0] }
    );
    document.querySelectorAll(`.${QUICK_NAV_ANCHOR}`).forEach((anchor, i) => {
      this.observer.observe(anchor);
      this.anchorIds.push(anchor.id);
      assertEqual(this.idToIndex.get(anchor.id), undefined);
      this.idToIndex.set(anchor.id, i);
    });
  }

  scrollToNext() {
    const maxIndex = [...this.visible]
      .map((id) => this.idToIndex.get(id) || -1)
      .reduce((max, current) => (current > max ? current : max), -1);
    if (maxIndex >= this.anchorIds.length - 1) {
      const lastId = this.anchorIds[this.anchorIds.length - 1];
      document
        .getElementById(lastId)
        ?.scrollIntoView({ block: "end", behavior: "smooth" });
      return;
    }
    document
      .getElementById(this.anchorIds[maxIndex + 1])
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  scrollToPrevious() {
    const minIndex = [...this.visible]
      .map((id) => this.idToIndex.get(id) || this.anchorIds.length + 1)
      .reduce(
        (min, current) => (current < min ? current : min),
        this.anchorIds.length + 1
      );
    document
      .getElementById(this.anchorIds[minIndex <= 0 ? 0 : minIndex - 1])
      ?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  destroy() {
    this.observer.disconnect();
  }
}

function OpenMenu(props: {
  navHelper: NavHelper | null;
  setOpen: (isOpen: boolean) => any;
}) {
  const { navHelper, setOpen } = props;
  return (
    <div className="mobileNavOpen">
      <SvgIcon
        onClick={() => navHelper?.scrollToPrevious()}
        className="mobileNavButton"
        aria-label="jump to previous section"
        pathD={SvgIcon.KeyboardArrowUp}
      />
      <SvgIcon
        onClick={() => navHelper?.scrollToNext()}
        className="mobileNavButton"
        aria-label="jump to next section"
        pathD={SvgIcon.KeyboardArrowDown}
      />
      <SvgIcon
        onClick={() =>
          document
            .getElementById("DictResultsSummary")
            ?.scrollIntoView(SCROLL_JUMP)
        }
        className="mobileNavButton"
        aria-label="jump to entry"
        pathD={SvgIcon.Toc}
      />
      <SvgIcon
        onClick={() => setOpen(false)}
        className="mobileNavButton"
        aria-label="close quick navigation"
        pathD={SvgIcon.Close}
      />
    </div>
  );
}

export function QuickNavMenu() {
  const [open, setOpen] = useState<boolean>(false);
  const navHelper = useRef<NavHelper | null>(null);

  useEffect(() => {
    navHelper.current = new NavHelper();
    return () => navHelper.current?.destroy();
  }, []);

  return (
    <div className="mobileNavMenu">
      {open ? (
        <OpenMenu navHelper={navHelper.current} setOpen={setOpen} />
      ) : (
        <SvgIcon
          pathD={SvgIcon.MenuOpen}
          onClick={() => setOpen(true)}
          className="mobileNavButtonCollapsed"
          aria-label="expand quick navigation"
        />
      )}
    </div>
  );
}
