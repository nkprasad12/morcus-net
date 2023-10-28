import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { Solarized } from "@/web/client/colors";
import Typography from "@mui/material/Typography";
import React from "react";

const TEXT_COLOR = Solarized.base03 + "A1";
const LS_COLOR = "#7aab35" + "30";
const SH_COLOR = "#9d42cf" + "30";

export function DictChip(props: { label: string }) {
  function backgroundColor(label: string): string {
    return label === LatinDict.SmithAndHall.key ? SH_COLOR : LS_COLOR;
  }

  return (
    <span
      style={{
        backgroundColor: backgroundColor(props.label),
        color: TEXT_COLOR,
        borderRadius: 4,
        paddingLeft: 3,
        paddingRight: 3,
        fontSize: 14,
        fontFamily: "monospace",
      }}
    >
      {props.label}
    </span>
  );
}

export function FullDictChip(props: { label: string }) {
  function backgroundColor(label: string): string {
    return label === LatinDict.SmithAndHall.displayName ? SH_COLOR : LS_COLOR;
  }

  function displayText(label: string): string {
    return label === LatinDict.SmithAndHall.displayName
      ? `${label} [Beta]`
      : label;
  }

  return (
    <Typography
      component={"span"}
      style={{
        whiteSpace: "pre-wrap",
        borderRadius: 4,
        backgroundColor: backgroundColor(props.label),
        color: TEXT_COLOR,
        fontWeight: "bold",
        padding: 2,
        paddingLeft: 6,
        paddingRight: 6,
      }}
    >
      {displayText(props.label)}
    </Typography>
  );
}
