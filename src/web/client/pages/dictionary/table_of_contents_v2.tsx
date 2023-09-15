import { EntryOutline } from "@/common/dictionaries/dict_result";
import { getBullet } from "@/common/lewis_and_short/ls_outline";
import { Solarized } from "@/web/client/colors";
import { DictChip } from "@/web/client/pages/dictionary/dict_chips";
import { ContentBox } from "@/web/client/pages/dictionary/sections";

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Divider } from "@mui/material";

import React from "react";

export function jumpToSection(sectionId: string) {
  const selected = document.getElementById(sectionId);
  if (selected === null) {
    return;
  }
  window.scrollTo({
    behavior: "auto",
    top: selected.offsetTop,
  });
}

export function TableOfContentsV2(props: {
  outlines: EntryOutline[];
  dictKey: string;
  isSmall: boolean;
  tocRef: React.RefObject<HTMLElement>;
}) {
  const isSmall = props.isSmall;
  const outlines = props.outlines;

  return (
    <ContentBox
      key="tableOfContents"
      contentRef={props.tocRef}
      isSmall={isSmall}
      ml="0px"
      mr="0px"
      noDivider
    >
      <div style={{ fontSize: 16, lineHeight: "normal" }}>
        {outlines.map((outline, index) => (
          <OutlineSection
            key={outline?.mainSection.sectionId || `undefined${index}`}
            dictKey={props.dictKey}
            outline={outline}
            onClick={jumpToSection}
          />
        ))}
      </div>
    </ContentBox>
  );
}

function OutlineSection(props: {
  outline: EntryOutline;
  onClick: (section: string) => any;
  dictKey: string;
}) {
  const outline = props.outline;
  const senses = outline.senses;

  return (
    <div style={{ marginTop: "12px" }}>
      <div
        onClick={() => props.onClick(outline.mainSection.sectionId)}
        style={{ cursor: "pointer" }}
        className="clickableOutlineSection"
      >
        <DictChip label={props.dictKey} />
        <span
          className="lsSenseBullet"
          style={{ backgroundColor: Solarized.base01 + "30", marginLeft: 2 }}
        >
          <OpenInNewIcon
            sx={{
              marginBottom: "-0.1em",
              marginRight: "-0.1em",
              fontSize: "0.8rem",
              paddingLeft: "0.1em",
            }}
          />
          {` ${outline.mainKey}`}
        </span>
        <span
          dangerouslySetInnerHTML={{ __html: " " + outline.mainSection.text }}
        />
      </div>
      {senses && (
        <ol style={{ paddingLeft: "0em" }}>
          {senses.map((sense) => {
            const header = getBullet(sense.ordinal);
            return (
              <li
                key={sense.sectionId}
                style={{
                  cursor: "pointer",
                  marginBottom: "4px",
                  marginLeft: `${(sense.level - 1) / 2}em`,
                }}
                onClick={() => props.onClick(sense.sectionId)}
                className="clickableOutlineSection"
              >
                <span
                  className="lsSenseBullet"
                  style={{ backgroundColor: Solarized.base01 + "30" }}
                >
                  <OpenInNewIcon
                    sx={{
                      marginBottom: "-0.1em",
                      marginRight: "-0.1em",
                      fontSize: "0.8rem",
                      paddingLeft: "0.1em",
                    }}
                  />
                  {` ${header} `}
                </span>
                <span dangerouslySetInnerHTML={{ __html: " " + sense.text }} />
              </li>
            );
          })}
        </ol>
      )}
      <Divider light={true} sx={{ margin: 0, padding: 0 }} />
    </div>
  );
}
