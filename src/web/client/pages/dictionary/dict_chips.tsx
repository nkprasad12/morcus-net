import {
  LatinDict,
  type LatinDictInfo,
} from "@/common/dictionaries/latin_dicts";

const BETA_DICTS = [
  LatinDict.RiddleArnold,
  LatinDict.Gaffiot,
  LatinDict.Georges,
  LatinDict.Pozo,
];

const BETA_DISPLAY_NAMES = new Set(BETA_DICTS.map((d) => d.displayName));

function classForDictChip(input: string, property: keyof LatinDictInfo) {
  switch (input) {
    case LatinDict.SmithAndHall[property]:
    case LatinDict.RiddleArnold[property]:
      return "shChip";
    case LatinDict.LewisAndShort[property]:
    case LatinDict.Gaffiot[property]:
      return "lsChip";
    case LatinDict.Georges[property]:
      return "deChip";
    case LatinDict.Pozo[property]:
      return "esChip";
    case LatinDict.Numeral[property]:
      return "numChip";
  }
  return "genericChip";
}

export function DictChip(props: { label: string; className?: string }) {
  function getClassName(label: string): string {
    return props.className ?? classForDictChip(label, "key");
  }

  return (
    <span className={getClassName(props.label) + " text xs smallChip"}>
      {props.label}
    </span>
  );
}

function fullChipClass(label: string, size?: string): string {
  const chip = classForDictChip(label, "displayName");
  return [chip, "text", size ?? "sm"].join(" ");
}

function fullChipText(label: string): string {
  return BETA_DISPLAY_NAMES.has(label) ? `${label} [Beta]` : label;
}

export function FullDictChip(props: { label: string; size?: "sm" | "xs" }) {
  return (
    <span
      className={fullChipClass(props.label, props.size)}
      style={{
        whiteSpace: "pre-wrap",
        fontFamily: "monospace",
        borderRadius: 4,
        padding: "2px 4px 0",
      }}>
      {fullChipText(props.label)}
    </span>
  );
}
