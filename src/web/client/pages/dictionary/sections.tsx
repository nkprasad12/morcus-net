import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { SelfLink } from "@/web/client/components/misc";
import { getBuildDate } from "@/web/client/define_vars";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import Divider from "@mui/material/Divider";
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
  className?: string;
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
      }}
      key={props.contentKey}
      ref={props.contentRef}
      id={props.id}
      className={props.className}
    >
      <Typography
        component={"div"}
        className="contentText"
        style={{
          whiteSpace: "pre-wrap",
        }}
      >
        {props.children}
      </Typography>
      {props.noDivider === undefined && (
        <Divider className="contentDivider" sx={{ mt: "16px" }} />
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
