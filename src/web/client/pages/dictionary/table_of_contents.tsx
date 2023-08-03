import { getBullet } from "@/common/lewis_and_short/ls_outline";
import { Solarized } from "@/web/client/colors";
import { ElementAndKey } from "@/web/client/pages/dictionary/dictionary_utils";
import { ContentBox } from "@/web/client/pages/dictionary/sections";
import { LsOutline } from "@/web/utils/rpc/ls_api_result";

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Divider } from "@mui/material";

import React from "react";

export function TableOfContents(props: {
  entries: ElementAndKey[];
  outlines: (LsOutline | undefined)[];
  isSmall: boolean;
  tocRef: React.RefObject<HTMLElement>;
}) {
  const entries = props.entries;
  const isSmall = props.isSmall;
  const outlines = props.outlines;

  return (
    <>
      {entries.length > 0 && (
        <ContentBox
          key="tableOfContents"
          contentRef={props.tocRef}
          isSmall={isSmall}
          ml="0px"
          mr="0px"
        >
          <div style={{ fontSize: 16, lineHeight: "normal" }}>
            <span>
              Found {entries.length} result{entries.length > 1 ? "s" : ""}.
            </span>
            {outlines.map((outline, index) => (
              <OutlineSection
                key={outline?.mainSection.sectionId || `undefined${index}`}
                outline={outline}
                onClick={(section) => {
                  const selected = document.getElementById(section);
                  if (selected === null) {
                    return;
                  }
                  window.scrollTo({
                    behavior: "auto",
                    top: selected.offsetTop,
                  });
                }}
              />
            ))}
          </div>
        </ContentBox>
      )}
    </>
  );
}

function OutlineSection(props: {
  outline: LsOutline | undefined;
  onClick: (section: string) => any;
}) {
  const outline = props.outline;
  if (outline === undefined) {
    return <span>Missing outline data</span>;
  }

  const senses = outline.senses;

  return (
    <div>
      <Divider variant="middle" light={true} sx={{ padding: "5px" }} />
      <br />
      <span onClick={() => props.onClick(outline.mainSection.sectionId)}>
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
          {` ${outline.mainOrth}`}
        </span>
        {" " + outline.mainSection.text}
      </span>
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
                  paddingLeft: `${(sense.level - 1) / 2}em`,
                }}
                onClick={() => props.onClick(sense.sectionId)}
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
                  {` ${header}. `}
                </span>
                <span>{" " + sense.text}</span>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
