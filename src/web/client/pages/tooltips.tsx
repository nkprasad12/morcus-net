import LinkIcon from "@mui/icons-material/Link";
import {
  SxProps,
  ClickAwayListener,
  Tooltip,
  Typography,
  IconButton,
} from "@mui/material";
import React from "react";
import { Solarized } from "../colors";

export type TooltipPlacement = "top-start" | "right";

export interface TooltipProps {
  titleText: string | JSX.Element;
  className: string | undefined;
  ChildFactory: React.ForwardRefExoticComponent<
    Omit<any, "ref"> & React.RefAttributes<any>
  >;
  placement?: TooltipPlacement;
  tooltipSx?: SxProps;
  arrowSx?: SxProps;
  open: boolean;
  onClickAway: () => any;
  onTooltipClose: () => any;
  onChildClick: (isOpen: boolean) => any;
}

function BaseTooltip(props: TooltipProps) {
  return (
    <ClickAwayListener
      onClickAway={() => {
        // props.onClickAway();
      }}
    >
      <Tooltip
        title={
          <Typography
            component={typeof props.titleText === "string" ? "p" : "div"}
          >
            {props.titleText}
          </Typography>
        }
        className={props.className}
        placement={props.placement || "top-start"}
        disableFocusListener
        disableHoverListener
        disableTouchListener
        describeChild={false}
        onClose={() => {
          props.onTooltipClose();
        }}
        open={props.open}
        arrow
        componentsProps={{
          tooltip: {
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
    </ClickAwayListener>
  );
}

export function ClickableTooltip(props: {
  titleText: string | JSX.Element;
  className: string | undefined;
  ChildFactory: React.ForwardRefExoticComponent<
    Omit<any, "ref"> & React.RefAttributes<any>
  >;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <BaseTooltip
      {...props}
      open={open}
      onChildClick={(isOpen) => setOpen(!isOpen)}
      onTooltipClose={() => setOpen(false)}
      onClickAway={() => setOpen(false)}
    />
  );
}

type SectionLinkTooltipState = "Closed" | "ClickToCopy" | "Success" | "Error";

export function SectionLinkTooltip(props: {
  className: string;
  forwarded: React.ForwardRefExoticComponent<
    Omit<any, "ref"> & React.RefAttributes<any>
  >;
  senseId: string;
}) {
  const [state, setState] = React.useState<SectionLinkTooltipState>("Closed");

  function getLink(): string {
    const chunks = window.location.href.split("#");
    return `${chunks[0]}#${props.senseId}`;
  }

  async function onClick() {
    const link = getLink();
    try {
      await navigator.clipboard.writeText(link);
      setState("Success");
      setTimeout(() => setState("Closed"), 500);
    } catch (e) {
      setState("Error");
    }
  }

  function TextWithIcon(props: { message: string }) {
    return (
      <Typography onClick={onClick} sx={{ cursor: "pointer" }}>
        <IconButton
          size="small"
          aria-label="copy link"
          aria-haspopup="false"
          color="info"
        >
          <LinkIcon />
        </IconButton>
        <span>{props.message}</span>
      </Typography>
    );
  }

  function TitleText() {
    if (state === "Error") {
      return (
        <Typography>
          <p>Error: please copy manually</p>
          <p>{getLink()}</p>
        </Typography>
      );
    }
    if (state === "Success") {
      return <TextWithIcon message="Link copied!" />;
    }
    return <TextWithIcon message="Copy section link" />;
  }

  return (
    <BaseTooltip
      titleText={<TitleText />}
      className={props.className}
      ChildFactory={props.forwarded}
      placement="top-start"
      tooltipSx={{
        backgroundColor: Solarized.mint,
        color: Solarized.base01,
        border: `2px solid ${Solarized.base02}`,
      }}
      arrowSx={{
        color: Solarized.base02,
      }}
      open={state !== "Closed"}
      onChildClick={(isOpen) => setState(isOpen ? "Closed" : "ClickToCopy")}
      onTooltipClose={() => setState("Closed")}
      onClickAway={() => setState("Closed")}
    />
  );
}
