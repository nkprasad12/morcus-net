import {
  LatinDict,
  type LatinDictInfo,
} from "@/common/dictionaries/latin_dicts";

function classForDictChip(input: string, property: keyof LatinDictInfo) {
  switch (input) {
    case LatinDict.SmithAndHall[property]:
      return "shChip";
    case LatinDict.LewisAndShort[property]:
      return "lsChip";
    case LatinDict.Numeral[property]:
      return "numChip";
  }
  return "genericChip";
}

export function DictChip(props: { label: string }) {
  function getClassName(label: string): string {
    return classForDictChip(label, "key");
  }

  return (
    <span className={getClassName(props.label) + " text xs smallChip"}>
      {props.label}
    </span>
  );
}

function fullChipClass(label: string, size?: string): string {
  const chip = classForDictChip(label, "displayName");
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
