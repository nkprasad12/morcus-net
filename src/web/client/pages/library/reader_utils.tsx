import React from "react";
import { FontSizes } from "@/web/client/styles";
import { debounce } from "@mui/material/utils";
import Slider from "@mui/material/Slider";
import LinkIcon from "@mui/icons-material/Link";
import Typography from "@mui/material/Typography";
import { CSSProperties } from "react";
import IconButton from "@mui/material/IconButton";

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
      }}
    >
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
      }
    >
      {props.message}
    </Typography>
  );
}

export function capitalizeWords(input: string): string {
  const words = input.split(" ");
  return words.map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

export function InfoText(props: {
  text: string;
  textScale?: number;
  style?: CSSProperties;
}) {
  return (
    <Typography
      component="span"
      className="contentTextLight"
      fontSize={FontSizes.SECONDARY * ((props.textScale || 100) / 100)}
      style={{ marginLeft: 8, marginRight: 8, ...props.style }}
    >
      {props.text}
    </Typography>
  );
}

export function NavIcon(props: {
  label: string;
  onClick?: () => any;
  Icon: JSX.Element;
  ref?: React.ForwardedRef<any>;
}) {
  return (
    <IconButton
      ref={props.ref}
      size="small"
      aria-label={props.label}
      onClick={props.onClick}
      className="menuIcon"
    >
      {props.Icon}
    </IconButton>
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
