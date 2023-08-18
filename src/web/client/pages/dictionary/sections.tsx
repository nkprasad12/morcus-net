import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { Solarized } from "@/web/client/colors";
import { getBuildDate } from "@/web/client/define_vars";
import { SelfLink } from "@/web/client/pages/dictionary/dictionary_utils";
import { Box, Typography, Divider } from "@mui/material";
import React from "react";

export function ContentBox(props: {
  children: JSX.Element;
  isSmall: boolean;
  contentKey?: string;
  contentRef?: React.RefObject<HTMLElement>;
  ml?: string;
  mr?: string;
  noDivider?: true;
  id?: string;
}) {
  const isSmall = props.isSmall;

  return (
    <Box
      sx={{
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: isSmall ? 0 : 1,
        paddingRight: isSmall ? 0 : 1,
        ml: props.ml || (isSmall ? 0 : 3),
        mr: props.mr || (isSmall ? 0 : 3),
        mt: 1,
        mb: 2,
        borderColor: Solarized.base2,
      }}
      key={props.contentKey}
      ref={props.contentRef}
      id={props.id}
    >
      <Typography
        component={"div"}
        style={{
          whiteSpace: "pre-wrap",
          color: Solarized.base02,
        }}
      >
        {props.children}
      </Typography>
      {props.noDivider === undefined && (
        <Divider light={true} sx={{ mt: "16px" }} />
      )}
    </Box>
  );
}

function LsAttribution() {
  return (
    <>
      <div>
        Text provided under a CC BY-SA license by Perseus Digital Library,{" "}
        <SelfLink to="http://www.perseus.tufts.edu" />, with funding from The
        National Endowment for the Humanities.
      </div>
      <div>
        Data originally from{" "}
        <SelfLink to="https://github.com/PerseusDL/lexica/" />.
      </div>
      <div>
        Data accessed from{" "}
        <SelfLink to="https://github.com/nkprasad12/lexica/" /> {getBuildDate()}
        .
      </div>
    </>
  );
}

function ShAttribution() {
  return (
    <div>
      This text was digitized by the Distributed Proofreaders and generously
      placed into the public domain. See project page at{" "}
      <SelfLink to="https://www.pgdp.net/c/project.php?id=projectID5775aeccac0c7" />
      .
    </div>
  );
}

export function DictAttribution(props: { isSmall: boolean; dictKey: string }) {
  function AttributionContent() {
    const key = props.dictKey + "AttrBox";
    if (props.dictKey === LatinDict.LewisAndShort.key) {
      return <LsAttribution key={key} />;
    }
    if (props.dictKey === LatinDict.SmithAndHall.key) {
      return <ShAttribution key={key} />;
    }
    return <>TODO: Write attribution for {props.dictKey}</>;
  }

  return (
    <ContentBox isSmall={props.isSmall}>
      <div style={{ fontSize: 15, lineHeight: "normal" }}>
        <AttributionContent />
      </div>
    </ContentBox>
  );
}
