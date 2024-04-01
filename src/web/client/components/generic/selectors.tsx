import { IconButton, SvgIcon } from "@/web/client/components/generic/icons";

export function NumberSelector(props: {
  label: string;
  tag?: string;
  light?: boolean;
  labelSize?: "xs" | "sm" | "md";
  value: number;
  setValue: (t: number) => unknown;
  min: number;
  max: number;
  step: number;
}) {
  const taggedLabel = (props.tag ? props.tag + " " : "") + props.label;
  const labelSize = props.labelSize || "sm";
  return (
    <div
      aria-label={taggedLabel}
      style={{ marginTop: "4px", marginBottom: "4px" }}>
      <span
        className={`text ${labelSize}${props.light !== true ? "" : " light"}`}
        style={{ paddingRight: "8px" }}>
        {props.label}
      </span>
      <span
        className="bgColorAlt"
        style={{
          borderRadius: "3px",
          paddingTop: "4px",
          paddingBottom: "6px",
          whiteSpace: "nowrap",
        }}>
        <IconButton
          style={{ color: "rgba(0,0,0,0.54)" }}
          size="small"
          aria-label={`Decrease ${taggedLabel}`}
          onClick={() =>
            props.setValue(Math.max(props.min, props.value - props.step))
          }>
          <SvgIcon pathD={SvgIcon.Remove} fontSize="small" />
        </IconButton>
        <span
          className={`bgColor text ${labelSize}`}
          style={{ padding: "4px" }}>
          {props.value}
        </span>
        <IconButton
          style={{ color: "rgba(0,0,0,0.54)" }}
          aria-label={`Increase ${taggedLabel}`}
          onClick={() =>
            props.setValue(Math.min(props.max, props.value + props.step))
          }>
          <SvgIcon pathD={SvgIcon.Add} fontSize="small" />
        </IconButton>
      </span>
    </div>
  );
}
