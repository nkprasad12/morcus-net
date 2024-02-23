import { IconButton, SvgIcon } from "@/web/client/components/generic/icons";

export function NumberSelector(props: {
  label: string;
  tag?: string;
  light?: boolean;
  labelSize?: "xs" | "sm" | "md";
  value: number;
  setValue: (t: number) => any;
  min: number;
  max: number;
  step: number;
}) {
  const taggedLabel = (props.tag ? props.tag + " " : "") + props.label;
  return (
    <div
      aria-label={taggedLabel}
      style={{ marginTop: "4px", marginBottom: "4px" }}>
      <span
        className={`text ${props.labelSize || "md"}${
          props.light !== true ? "" : " light"
        }`}
        style={{ paddingRight: "8px" }}>
        {props.label}
      </span>
      <span
        className="bgColorAlt"
        style={{
          borderRadius: "4px",
          paddingTop: "8px",
          paddingBottom: "8px",
          whiteSpace: "nowrap",
        }}>
        <IconButton
          style={{ color: "rgba(0,0,0,0.54)" }}
          aria-label={`Decrease ${taggedLabel}`}
          onClick={() =>
            props.setValue(Math.max(props.min, props.value - props.step))
          }>
          <SvgIcon pathD={SvgIcon.Remove} fontSize="small" />
        </IconButton>
        <span className="bgColor" style={{ padding: "4px" }}>
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
