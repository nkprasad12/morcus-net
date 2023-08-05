import React from "react";
import TocIcon from "@mui/icons-material/Toc";
import KeyboardArrowDown from "@mui/icons-material/KeyboardArrowDown";
import KeyboardArrowUp from "@mui/icons-material/KeyboardArrowUp";
import MenuOpenIcon from "@mui/icons-material/MenuOpen";
import CloseIcon from "@mui/icons-material/Close";
import { SCROLL_JUMP } from "@/web/client/pages/dictionary/dictionary_utils";
import { assertEqual } from "@/common/assert";

export const QUICK_NAV_ANCHOR = "QNA-";

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
        console.log(this.visible);
      },
      { threshold: [0.0] }
    );
    document
      .querySelectorAll(`[id^="${QUICK_NAV_ANCHOR}"]`)
      .forEach((anchor, i) => {
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

export function QuickNavMenu() {
  const [open, setOpen] = React.useState<boolean>(false);
  const navHelper = React.useRef<NavHelper | null>(null);

  React.useEffect(() => {
    navHelper.current = new NavHelper();
    return () => navHelper.current?.destroy();
  }, []);

  function OpenMenu() {
    return (
      <>
        <div>
          <KeyboardArrowDown
            onClick={() => navHelper.current?.scrollToNext()}
            className="mobileNavButton"
            aria-label="jump to next section"
          />
          <KeyboardArrowUp
            onClick={() => navHelper.current?.scrollToPrevious()}
            className="mobileNavButton"
            aria-label="jump to previous section"
          />
        </div>
        <div>
          <TocIcon
            onClick={() =>
              document
                .getElementById("DictResultsSummary")
                ?.scrollIntoView(SCROLL_JUMP)
            }
            className="mobileNavButton"
            aria-label="jump to entry"
          />
          <CloseIcon
            onClick={() => setOpen(false)}
            className="mobileNavButton"
            aria-label="close quick navigation"
          />
        </div>
      </>
    );
  }

  return (
    <div className="mobileNavMenu">
      {open ? (
        <OpenMenu />
      ) : (
        <MenuOpenIcon
          onClick={() => setOpen(true)}
          className="mobileNavButton"
          aria-label="expand quick navigation"
        />
      )}
    </div>
  );
}
