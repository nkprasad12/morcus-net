import { LatinDict } from "@/common/dictionaries/latin_dicts";

export function DictChip(props: { label: string }) {
  function getClassName(label: string): string {
    return label === LatinDict.SmithAndHall.key ? "shChip" : "lsChip";
  }

  return (
    <span className={getClassName(props.label) + " text xs smallChip"}>
      {props.label}
    </span>
  );
}

function fullChipClass(label: string, size?: string): string {
  const chip =
    label === LatinDict.SmithAndHall.displayName ? "shChip" : "lsChip";
  return [chip, "text", size || "md"].join(" ");
}

function fullChipText(label: string): string {
  return label === LatinDict.SmithAndHall.displayName
    ? `${label} [Beta]`
    : label;
}

export function FullDictChip(props: { label: string; size?: "md" | "sm" }) {
  return (
    <span
      className={fullChipClass(props.label, props.size)}
      style={{
        whiteSpace: "pre-wrap",
        borderRadius: 4,
        fontWeight: "bold",
        padding: 2,
        paddingLeft: 6,
        paddingRight: 6,
      }}>
      {fullChipText(props.label)}
    </span>
  );
}
