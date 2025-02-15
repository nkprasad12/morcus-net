import Popper from "@mui/base/PopperUnstyled";
import React, { RefObject } from "react";
import { exhaustiveGuard, singletonOf } from "@/common/misc_utils";
import { RouteInfo } from "@/web/client/router/router_v2";
import { ClientPaths } from "@/web/client/routing/client_paths";
import { checkPresent } from "@/common/assert";
import { SvgIcon } from "@/web/client/components/generic/icons";
import {
  buttonLikeProps,
  type ButtonLikeProps,
} from "@/web/client/components/generic/basics";
import { reportIssue } from "@/web/client/components/report_util";

export type TooltipPlacement = "top" | "right" | "bottom";

export type TooltipChild = React.FC<
  Partial<ButtonLikeProps> & { role?: "button" } & {
    ref?: React.ForwardedRef<any>;
  }
>;

export interface TooltipProps {
  titleText: string | JSX.Element;
  ChildFactory: TooltipChild;
  placement?: TooltipPlacement;
  open: boolean;
  onClickAway: () => unknown;
  onChildClick: () => unknown;
}

type HtmlRef = RefObject<HTMLElement>;

class TooltipManager {
  static get = singletonOf(() => new TooltipManager()).get;

  private readonly trackedRefs: Map<HtmlRef, () => unknown>;
  private readonly tooltips: Map<HtmlRef, HtmlRef>;
  private readonly callback: (ev: MouseEvent) => unknown = (e) => {
    const clickedRef = this.findClickedRef(e);
    for (const [ref, listener] of this.trackedRefs.entries()) {
      if (ref !== clickedRef) {
        listener();
      }
    }
  };

  constructor() {
    this.trackedRefs = new Map();
    this.tooltips = new Map();
    window.addEventListener("click", this.callback);
  }

  private findClickedRef(e: MouseEvent): HtmlRef | undefined {
    if (!(e.target instanceof Element)) {
      return;
    }
    // Crawl up the tree until we find a match.
    let current: Element | ParentNode | null = e.target;
    while (current !== null && current instanceof Element) {
      for (const base of this.trackedRefs) {
        // Consider the tooltip as a part of the element.
        const tooltip = this.tooltips.get(base[0])?.current;
        if (base[0].current === current || tooltip === current) {
          return base[0];
        }
      }
      current = current.parentNode;
    }
  }

  register(
    ref: React.RefObject<HTMLElement>,
    tooltip: React.RefObject<HTMLElement>,
    listener: () => unknown
  ) {
    this.trackedRefs.set(ref, listener);
    this.tooltips.set(ref, tooltip);
  }

  unregister(ref: React.RefObject<HTMLElement>) {
    this.trackedRefs.delete(ref);
    this.tooltips.delete(ref);
  }
}

function useTooltipManager(
  ref: React.RefObject<HTMLElement>,
  tooltip: React.RefObject<HTMLElement>,
  listener: () => unknown
) {
  React.useEffect(() => {
    TooltipManager.get().register(ref, tooltip, listener);
    return () => TooltipManager.get().unregister(ref);
  }, [ref, tooltip, listener]);
}

function BaseTooltip(props: TooltipProps) {
  const ref = React.useRef<HTMLDivElement>(null);
  const tooltipRef = React.useRef<HTMLDivElement>(null);

  useTooltipManager(ref, tooltipRef, props.onClickAway);
  return (
    <>
      <props.ChildFactory
        ref={ref}
        role="button"
        {...buttonLikeProps(() => props.onChildClick(), true)}
      />
      <Popper
        anchorEl={ref.current}
        placement={props.placement || "top"}
        open={props.open}>
        <div className="text md tooltip" ref={tooltipRef}>
          {props.titleText}
        </div>
      </Popper>
    </>
  );
}

export function ClickableTooltip(props: {
  titleText: string | JSX.Element;
  ChildFactory: TooltipChild;
  visibleListener?: (visisble: boolean) => unknown;
}) {
  const [open, setOpen] = React.useState(false);

  function notifyOpen(open: boolean) {
    setOpen(open);
    props.visibleListener?.(open);
  }

  return (
    <BaseTooltip
      {...props}
      open={open}
      onChildClick={() => notifyOpen(!open)}
      onClickAway={() => notifyOpen(false)}
    />
  );
}

type CopyLinkTooltipState = "Closed" | "Open" | "CopySuccess" | "Error";

interface TooltipMenuItem {
  message: string;
  icon: string;
  handler?: () => unknown;
}

function TooltipMenu(props: { items: TooltipMenuItem[] }) {
  return (
    <div className="text sm">
      {props.items.map((item) => (
        <div
          className="tooltipMenuItem"
          key={item.message}
          onClick={item.handler}>
          <SvgIcon
            pathD={item.icon}
            style={{ marginRight: "4px" }}
            aria-hidden
          />
          <span>{item.message}</span>
        </div>
      ))}
    </div>
  );
}

function CopyLinkError(props: { link: string }) {
  return (
    <div className="text sm">
      <span style={{ lineHeight: "normal" }}>
        Error: please copy manually:{" "}
      </span>
      <br />
      <span style={{ lineHeight: "normal" }}>{props.link}</span>
    </div>
  );
}

function SectionMenuTitleText(props: {
  state: CopyLinkTooltipState;
  mainMessage: string;
  link: string;
  setState: (state: CopyLinkTooltipState) => unknown;
  idToEdit?: string;
}) {
  if (props.state === "Closed") {
    return <></>;
  }
  if (props.state === "Error") {
    return <CopyLinkError link={props.link} />;
  }
  if (props.state === "CopySuccess") {
    return (
      <TooltipMenu items={[{ message: "Link copied!", icon: SvgIcon.Link }]} />
    );
  }
  if (props.state === "Open") {
    const items: TooltipMenuItem[] = [
      {
        message: props.mainMessage,
        icon: SvgIcon.Link,
        handler: async () => {
          try {
            await navigator.clipboard.writeText(props.link);
            props.setState("CopySuccess");
            setTimeout(() => props.setState("Closed"), 500);
          } catch (e) {
            props.setState("Error");
          }
        },
      },
    ];
    if (props.idToEdit !== undefined) {
      items.push({
        message: "Edit and Report",
        icon: SvgIcon.Edit,
        handler: () => {
          onEditRequest(props.idToEdit);
          props.setState("Closed");
        },
      });
    }
    return <TooltipMenu items={items} />;
  }
  exhaustiveGuard(props.state);
}

function onEditRequest(idToEdit: string | undefined) {
  if (!idToEdit) {
    return;
  }
  const target = document.getElementById(idToEdit);
  const original = target?.innerText;
  target?.setAttribute("contenteditable", "true");
  target?.focus();
  const listener = () => {
    const updated = target?.innerText;
    target?.removeAttribute("contenteditable");
    target?.removeEventListener("blur", listener);
    if (updated !== original) {
      const content = [
        `id: ${idToEdit}`,
        "Original:",
        original,
        "Edited:",
        updated,
      ];
      reportIssue(content.join("\n"), ["userEdit"]);
    }
  };
  target?.addEventListener("blur", listener);
}

export function CopyLinkTooltip(props: {
  forwarded: TooltipChild;
  message: string;
  link: string;
  visibleListener?: (visible: boolean) => unknown;
  placement?: TooltipPlacement;
  idToEdit?: string;
}) {
  const { visibleListener } = props;
  const [state, setState] = React.useState<CopyLinkTooltipState>("Closed");
  const visible = state !== "Closed";

  const enhancedSetState = React.useCallback(
    (state: CopyLinkTooltipState) => {
      setState(state);
      visibleListener?.(state !== "Closed");
    },
    [visibleListener]
  );

  return (
    <BaseTooltip
      titleText={
        <SectionMenuTitleText
          state={state}
          setState={enhancedSetState}
          mainMessage={props.message}
          link={props.link}
          idToEdit={props.idToEdit}
        />
      }
      ChildFactory={props.forwarded}
      placement={props.placement || "top"}
      open={visible}
      onChildClick={() => enhancedSetState(visible ? "Closed" : "Open")}
      onClickAway={() => enhancedSetState("Closed")}
    />
  );
}

export function SectionLinkTooltip(props: {
  forwarded: TooltipChild;
  id: string;
  forArticle?: boolean;
  idToEdit?: string;
}) {
  const isArticle = props.forArticle === true;
  const message = `Copy ${isArticle ? "article" : "section"} link`;

  function getLink(): string {
    const coreId = isArticle ? props.id : props.id.split(".")[0];
    const path = ClientPaths.DICT_BY_ID.toUrlPath({ id: coreId });
    const hash = isArticle ? undefined : props.id;
    return RouteInfo.toLink({ path: checkPresent(path), hash }, true);
  }

  return (
    <CopyLinkTooltip
      placement="right"
      forwarded={props.forwarded}
      message={message}
      link={getLink()}
      idToEdit={props.idToEdit}
    />
  );
}
