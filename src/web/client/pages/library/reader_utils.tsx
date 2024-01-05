import React from "react";
import { debounce } from "@mui/material/utils";
import Slider from "@mui/material/Slider";
import LinkIcon from "@mui/icons-material/Link";
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
      }}>
      <span className="text sm light">{props.label}</span>
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

export function SettingsText(props: { message: string }) {
  return <span className="text md light">{props.message}</span>;
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
  additionalClasses?: string[];
  style?: CSSProperties;
}) {
  const classes = (props.additionalClasses || []).concat("text sm light");
  return (
    <span
      className={classes.join(" ")}
      style={{
        marginLeft: 8,
        marginRight: 8,
        whiteSpace: "normal",
        display: "inline-block",
        ...props.style,
      }}>
      {props.text}
    </span>
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
