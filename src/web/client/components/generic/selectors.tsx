import RemoveIcon from "@mui/icons-material/Remove";
import AddIcon from "@mui/icons-material/Add";
import IconButton from "@mui/material/IconButton";

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
        }}>
        <IconButton
          aria-label={`Decrease ${taggedLabel}`}
          onClick={() =>
            props.setValue(Math.max(props.min, props.value - props.step))
          }>
          <RemoveIcon fontSize="small" />
        </IconButton>
        <span className="bgColor" style={{ padding: "4px" }}>
          {props.value}
        </span>
        <IconButton
          aria-label={`Increase ${taggedLabel}`}
          onClick={() =>
            props.setValue(Math.min(props.max, props.value + props.step))
          }>
          <AddIcon fontSize="small" />
        </IconButton>
      </span>
    </div>
  );
}
