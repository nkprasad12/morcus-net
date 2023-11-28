import { LatinDict } from "@/common/dictionaries/latin_dicts";
import Typography from "@mui/material/Typography";
import React from "react";

export function DictChip(props: { label: string }) {
  function getClassName(label: string): string {
    return label === LatinDict.SmithAndHall.key ? "shChip" : "lsChip";
  }

  return (
    <span
      className={getClassName(props.label)}
      style={{
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
  function getClassName(label: string): string {
    return label === LatinDict.SmithAndHall.displayName ? "shChip" : "lsChip";
  }

  function displayText(label: string): string {
    return label === LatinDict.SmithAndHall.displayName
      ? `${label} [Beta]`
      : label;
  }

  return (
    <Typography
      component={"span"}
      className={getClassName(props.label)}
      style={{
        whiteSpace: "pre-wrap",
        borderRadius: 4,
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
