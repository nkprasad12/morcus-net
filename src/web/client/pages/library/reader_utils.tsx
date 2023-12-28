import React, { PropsWithChildren } from "react";
import { AllowedFontSizes, FontSizes } from "@/web/client/styles";
import { debounce } from "@mui/material/utils";
import Slider from "@mui/material/Slider";
import LinkIcon from "@mui/icons-material/Link";
import Typography from "@mui/material/Typography";
import { CSSProperties } from "react";
import IconButton from "@mui/material/IconButton";
import Container from "@mui/material/Container";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { assert } from "@/common/assert";

// We need to come up a with a better way to deal with this, since
// Experimentally for large screen mode this is 64 but honestly who knows
// about the true range.
const APP_BAR_MAX_HEIGHT = 64;
const COLUMN_TOP_MARGIN = 8;
const COLUMN_BOTTON_MARGIN = 8;
const CONTAINER_STYLE: CSSProperties = {
  height:
    window.innerHeight -
    APP_BAR_MAX_HEIGHT -
    COLUMN_TOP_MARGIN -
    COLUMN_BOTTON_MARGIN,
};
const COLUMN_STYLE: CSSProperties = {
  height: "100%",
  float: "left",
  width: "48%",
  overflow: "auto",
  boxSizing: "border-box",
  marginTop: COLUMN_TOP_MARGIN,
  marginBottom: COLUMN_BOTTON_MARGIN,
  marginLeft: "1%",
  marginRight: "1%",
};
const WIDTH_LOOKUP: ("lg" | "xl" | "xxl" | false)[] = [
  "lg",
  "xl",
  "xxl",
  false,
];

export function BaseReaderLayout(
  props: PropsWithChildren<{
    mainWidth: number;
    totalWidth: number;
    sidebarRef?: React.RefObject<HTMLDivElement>;
  }>
): JSX.Element {
  const children = React.Children.toArray(props.children);
  assert(children.length === 3);
  const [mainContent, sidebarBar, sidebarContent] = children;
  const { mainWidth, totalWidth, sidebarRef } = props;

  return (
    <Container maxWidth={WIDTH_LOOKUP[totalWidth]} style={CONTAINER_STYLE}>
      <div
        style={{
          ...COLUMN_STYLE,
          width: `${mainWidth}%`,
        }}>
        {mainContent}
      </div>
      <div
        style={{
          ...COLUMN_STYLE,
          width: `${96 - mainWidth}%`,
        }}
        ref={sidebarRef}>
        <ContentBox isSmall>
          <>
            {sidebarBar}
            <div style={{ paddingRight: "8px" }}>{sidebarContent}</div>
          </>
        </ContentBox>
      </div>
    </Container>
  );
}

export function SettingSlider(props: {
  value: number;
  setValue: (w: number) => any;
  label: string;
  min: number;
  max: number;
  step: number;
  tag?: string;
  scale: number;
  disableLabels?: boolean;
}) {
  const scale = props.scale / 100;
  return (
    <div
      style={{
        alignItems: "center",
        display: "flex",
      }}>
      <SettingsText
        message={props.label}
        size={FontSizes.SECONDARY}
        scale={props.scale}
      />
      <Slider
        aria-label={(props.tag || "") + " " + props.label}
        size="small"
        getAriaValueText={(v) => `${v}`}
        value={props.value}
        onChange={debounce((_, newValue) => {
          if (typeof newValue !== "number") {
            return;
          }
          props.setValue(newValue);
        })}
        valueLabelDisplay={props.disableLabels ? "off" : "auto"}
        step={props.step}
        marks
        min={props.min}
        max={props.max}
        style={{
          width: 250 * scale,
          marginLeft: 12 * scale,
          marginRight: 12 * scale,
        }}
      />
    </div>
  );
}

export function AppText(
  props: React.PropsWithChildren<{
    light?: boolean;
    size?: AllowedFontSizes;
    scale: number;
    compact?: boolean;
  }>
) {
  return (
    <Typography
      component="span"
      className={props.light ? "contentTextLight" : "contentText"}
      style={{ lineHeight: props.compact ? 1 : undefined }}
      fontSize={
        (props.size || FontSizes.BIG_SCREEN) * ((props.scale || 100) / 100)
      }>
      {props.children}
    </Typography>
  );
}

export function SettingsText(props: {
  message: string;
  size?: number;
  scale: number;
}) {
  return (
    <Typography
      component="span"
      className="contentTextLight"
      fontSize={
        (props.size || FontSizes.BIG_SCREEN) * ((props.scale || 100) / 100)
      }>
      {props.message}
    </Typography>
  );
}

export function capitalizeWords(input: string): string {
  const words = input.split(" ");
  return words
    .map((word) =>
      word.length === 0 ? word : word[0].toUpperCase() + word.slice(1)
    )
    .join(" ");
}

export function InfoText(props: {
  text: string;
  textScale?: number;
  additionalClasses?: string[];
  style?: CSSProperties;
}) {
  const classes = (props.additionalClasses || []).concat("contentTextLight");
  return (
    <Typography
      component="span"
      className={classes.join(" ")}
      fontSize={FontSizes.SECONDARY * ((props.textScale || 100) / 100)}
      style={{
        marginLeft: 8,
        marginRight: 8,
        whiteSpace: "nowrap",
        display: "inline-block",
        ...props.style,
      }}>
      {props.text}
    </Typography>
  );
}

export function NavIcon(props: {
  label: string;
  onClick?: () => any;
  Icon: JSX.Element;
  ref?: React.ForwardedRef<any>;
  disabled?: boolean;
  extraClasses?: string[];
}) {
  const classes = (props.extraClasses || []).concat("readerNavIconContainer");
  return (
    <span className={classes.join(" ")}>
      <IconButton
        ref={props.ref}
        size="small"
        aria-label={props.label}
        onClick={props.onClick}
        disabled={props.disabled}
        className="menuIcon">
        {props.Icon}
      </IconButton>
    </span>
  );
}

export const TooltipNavIcon = React.forwardRef<any>(function TooltipNavIcon(
  fProps,
  fRef
) {
  return (
    <span {...fProps} ref={fRef}>
      <NavIcon Icon={<LinkIcon />} label="link to section" />
    </span>
  );
});
