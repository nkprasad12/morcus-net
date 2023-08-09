import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { Solarized } from "@/web/client/colors";
import Typography from "@mui/material/Typography";
import React from "react";

const TEXT_COLOR = Solarized.base03 + "81";

function backgroundColor(label: string): string {
  return label === LatinDict.SmithAndHall.key
    ? Solarized.blue + "30"
    : Solarized.base2 + "60";
}

export function DictChip(props: { label: string }) {
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
      {props.label}
    </Typography>
  );
}
