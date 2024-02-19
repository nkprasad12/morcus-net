import ClickAwayListener from "@mui/material/ClickAwayListener";
import Tooltip from "@mui/material/Tooltip";
import IconButton from "@mui/material/IconButton";
import * as React from "react";
import type { SxProps } from "@mui/material";
import { exhaustiveGuard } from "@/common/misc_utils";
import { RouteInfo } from "@/web/client/router/router_v2";
import { ClientPaths } from "@/web/client/routing/client_paths";
import { checkPresent } from "@/common/assert";
import { SvgIcon } from "@/web/client/components/generic/icons";

export type TooltipPlacement = "top-start" | "right" | "bottom";

export type TooltipChild = React.ForwardRefExoticComponent<
  Omit<any, "ref"> & React.RefAttributes<any>
> & { onClick?: React.MouseEventHandler };

export interface TooltipProps {
  titleText: string | JSX.Element;
  className?: string | undefined;
  ChildFactory: TooltipChild;
  placement?: TooltipPlacement;
  tooltipSx?: SxProps;
  arrowSx?: SxProps;
  open: boolean;
  onClickAway: () => any;
  onChildClick: (isOpen: boolean) => any;
}

function BaseTooltip(props: TooltipProps) {
  return (
    <ClickAwayListener
      onClickAway={() => props.onClickAway()}
      touchEvent={false}>
      <div role="presentation" style={{ display: "inline" }}>
        <Tooltip
          title={<div className="text md">{props.titleText}</div>}
          className={props.className}
          placement={props.placement || "top-start"}
          disableFocusListener
          disableHoverListener
          disableTouchListener
          describeChild={false}
          open={props.open}
          arrow
          slotProps={{
            tooltip: {
              onClick: () => {},
              sx: props.tooltipSx,
            },
            arrow: {
              sx: props.arrowSx,
            },
          }}>
          <props.ChildFactory
            onClick={(e: React.MouseEvent) => {
              props.onChildClick(props.open);
              e.stopPropagation();
            }}
          />
        </Tooltip>
      </div>
    </ClickAwayListener>
  );
}

export function ClickableTooltip(props: {
  titleText: string | JSX.Element;
  className?: string | undefined;
  ChildFactory: TooltipChild;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <BaseTooltip
      {...props}
      open={open}
      onChildClick={(isOpen) => setOpen(!isOpen)}
      onClickAway={() => setOpen(false)}
    />
  );
}

type CopyLinkTooltipState = "Closed" | "ClickToCopy" | "Success" | "Error";

function TextWithIcon(props: {
  message: string;
  link: string;
  setState: (state: CopyLinkTooltipState) => any;
  dismissTooltip: () => any;
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
        style={{ cursor: "pointer", display: "inline-block" }}>
        <IconButton
          size="small"
          aria-label="copy link"
          aria-haspopup="false"
          color="success">
          <SvgIcon pathD={SvgIcon.Link} />
        </IconButton>
        <span>{props.message}</span>
      </div>
    </div>
  );
}

function TitleText(props: {
  state: CopyLinkTooltipState;
  mainMessage: string;
  link: string;
  setState: (state: CopyLinkTooltipState) => any;
  dismissTooltip: () => any;
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
  className?: string;
  forwarded: TooltipChild;
  message: string;
  link: string;
  visibleListener?: (visible: boolean) => any;
  placement?: TooltipPlacement;
}) {
  const [visible, setVisible] = React.useState<boolean>(false);
  const [state, setState] = React.useState<CopyLinkTooltipState>("Closed");

  function setTooltipVisible(isVisible: boolean) {
    props.visibleListener && props.visibleListener(isVisible);
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
      className={props.className}
      ChildFactory={props.forwarded}
      placement={props.placement || "top-start"}
      open={visible}
      onChildClick={(isOpen) => {
        if (isOpen) {
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
  className?: string;
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
    const url = RouteInfo.toLink({ path: checkPresent(path), hash });
    return `${window.location.origin}${url}`;
  }

  return (
    <CopyLinkTooltip
      className={props.className}
      forwarded={props.forwarded}
      message={message}
      link={getLink()}
    />
  );
}
