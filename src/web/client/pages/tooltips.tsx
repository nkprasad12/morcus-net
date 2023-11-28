import {
  RouteInfo,
  extractRouteInfo,
  linkForInfo,
} from "@/web/client/components/router";
import LinkIcon from "@mui/icons-material/Link";
import {
  SxProps,
  ClickAwayListener,
  Tooltip,
  Typography,
  IconButton,
} from "@mui/material";
import React from "react";

export type TooltipPlacement = "top-start" | "right";

export type TooltipChild = React.ForwardRefExoticComponent<
  Omit<any, "ref"> & React.RefAttributes<any>
>;

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
      onClickAway={() => {
        props.onClickAway();
      }}
    >
      <div role="presentation" style={{ display: "inline" }}>
        <Tooltip
          title={<Typography component={"div"}>{props.titleText}</Typography>}
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
          }}
        >
          <props.ChildFactory
            onClick={() => {
              props.onChildClick(props.open);
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

type SectionLinkTooltipState = "Closed" | "ClickToCopy" | "Success" | "Error";

export function SectionLinkTooltip(props: {
  className?: string;
  forwarded: TooltipChild;
  id: string;
  forArticle?: boolean;
}) {
  const [visible, setVisible] = React.useState<boolean>(false);
  const [content, setContent] = React.useState<JSX.Element>(<div />);

  const isArticle = props.forArticle === true;

  function getLink(): string {
    const before = extractRouteInfo();
    const after: RouteInfo = {
      path: before.path,
    };
    if (isArticle) {
      after.query = props.id;
      after.idSearch = true;
    } else {
      after.query = before.query;
      after.hash = props.id;
    }
    return `${window.location.origin}${linkForInfo(after)}`;
  }

  async function onClick() {
    const link = getLink();
    try {
      await navigator.clipboard.writeText(link);
      setContent(() => TitleText("Success"));
      setTimeout(() => setVisible(false), 500);
    } catch (e) {
      setContent(() => TitleText("Error"));
    }
  }

  function TextWithIcon(props: { message: string }) {
    return (
      <Typography component="div">
        <div
          onClick={onClick}
          style={{ cursor: "pointer", display: "inline-block" }}
        >
          <IconButton
            size="small"
            aria-label="copy link"
            aria-haspopup="false"
            color="success"
          >
            <LinkIcon />
          </IconButton>
          <span>{props.message}</span>
        </div>
      </Typography>
    );
  }

  function TitleText(state: SectionLinkTooltipState) {
    if (state === "Error") {
      return (
        <Typography component="div">
          <span style={{ fontSize: 14, lineHeight: "normal" }}>
            Error: please copy manually:{" "}
          </span>
          <br />
          <span style={{ fontSize: 16, lineHeight: "normal" }}>
            {getLink()}
          </span>
        </Typography>
      );
    }
    if (state === "Success") {
      return <TextWithIcon message="Link copied!" />;
    }
    return (
      <TextWithIcon
        message={`Copy ${isArticle ? "article" : "section"} link`}
      />
    );
  }

  return (
    <BaseTooltip
      titleText={content}
      className={props.className}
      ChildFactory={props.forwarded}
      placement="top-start"
      open={visible}
      onChildClick={(isOpen) => {
        if (isOpen) {
          setVisible(false);
          return;
        }
        setContent(TitleText("ClickToCopy"));
        setVisible(true);
      }}
      onClickAway={() => setVisible(false)}
    />
  );
}
