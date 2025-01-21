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

type CopyLinkTooltipState = "Closed" | "ClickToCopy" | "Success" | "Error";

function TextWithIcon(props: {
  message: string;
  link: string;
  setState: (state: CopyLinkTooltipState) => unknown;
  dismissTooltip: () => unknown;
}) {
  async function onClick() {
    try {
      await navigator.clipboard.writeText(props.link);
      props.setState("Success");
      setTimeout(() => props.dismissTooltip(), 500);
    } catch (e) {
      props.setState("Error");
    }
  }

  return (
    <div className="text md">
      <div
        onClick={onClick}
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
        }}>
        <SvgIcon
          pathD={SvgIcon.Link}
          style={{ marginRight: "4px" }}
          aria-hidden
        />
        <span>{props.message}</span>
      </div>
    </div>
  );
}

function TitleText(props: {
  state: CopyLinkTooltipState;
  mainMessage: string;
  link: string;
  setState: (state: CopyLinkTooltipState) => unknown;
  dismissTooltip: () => unknown;
}) {
  if (props.state === "Closed") {
    return <></>;
  }
  if (props.state === "Error") {
    return (
      <div className="text md">
        <span style={{ fontSize: 14, lineHeight: "normal" }}>
          Error: please copy manually:{" "}
        </span>
        <br />
        <span style={{ fontSize: 16, lineHeight: "normal" }}>{props.link}</span>
      </div>
    );
  }
  if (props.state === "Success") {
    return (
      <TextWithIcon
        message="Link copied!"
        setState={props.setState}
        dismissTooltip={props.dismissTooltip}
        link={props.link}
      />
    );
  }
  if (props.state === "ClickToCopy") {
    return (
      <TextWithIcon
        message={props.mainMessage}
        setState={props.setState}
        dismissTooltip={props.dismissTooltip}
        link={props.link}
      />
    );
  }
  exhaustiveGuard(props.state);
}

export function CopyLinkTooltip(props: {
  forwarded: TooltipChild;
  message: string;
  link: string;
  visibleListener?: (visible: boolean) => unknown;
  placement?: TooltipPlacement;
}) {
  const [visible, setVisible] = React.useState<boolean>(false);
  const [state, setState] = React.useState<CopyLinkTooltipState>("Closed");

  function setTooltipVisible(isVisible: boolean) {
    props.visibleListener?.(isVisible);
    setVisible(isVisible);
  }

  return (
    <BaseTooltip
      titleText={
        <TitleText
          state={state}
          setState={setState}
          mainMessage={props.message}
          link={props.link}
          dismissTooltip={() => setTooltipVisible(false)}
        />
      }
      ChildFactory={props.forwarded}
      placement={props.placement || "top"}
      open={visible}
      onChildClick={() => {
        if (visible) {
          setVisible(false);
          return;
        }
        setState("ClickToCopy");
        setTooltipVisible(true);
      }}
      onClickAway={() => setTooltipVisible(false)}
    />
  );
}

export function SectionLinkTooltip(props: {
  forwarded: TooltipChild;
  id: string;
  forArticle?: boolean;
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
    />
  );
}
