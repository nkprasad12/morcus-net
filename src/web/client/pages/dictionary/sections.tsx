import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { SelfLink } from "@/web/client/components/misc";
import { getBuildDate } from "@/web/client/define_vars";
import Box from "@mui/material/Box";
import Typography from "@mui/material/Typography";
import * as React from "react";
import { FontSizes } from "@/web/client/styles";
import { Divider } from "@/web/client/components/generic/basics";

export function ContentBox(props: {
  children: JSX.Element;
  isSmall: boolean;
  contentKey?: string;
  contentRef?: React.RefObject<HTMLElement>;
  ml?: string;
  mr?: string;
  mt?: number;
  noDivider?: boolean;
  id?: string;
  className?: string;
  textScale?: number;
  isEmbedded?: boolean;
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
        mt: props.mt !== undefined ? props.mt : 1,
        mb: props.isEmbedded ? 1 : 2,
      }}
      key={props.contentKey}
      ref={props.contentRef}
      id={props.id}
      className={props.className}>
      <Typography
        component={"div"}
        className="contentText"
        style={{
          whiteSpace: "pre-wrap",
          fontSize: props.textScale
            ? FontSizes.BIG_SCREEN * (props.textScale / 100)
            : undefined,
        }}>
        {props.children}
      </Typography>
      {props.noDivider !== true && <Divider style={{ marginTop: "16px" }} />}
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

function AttributionContent(props: { dictKey: string }) {
  const key = props.dictKey + "AttrBox";
  if (props.dictKey === LatinDict.LewisAndShort.key) {
    return <LsAttribution key={key} />;
  }
  if (props.dictKey === LatinDict.SmithAndHall.key) {
    return <ShAttribution key={key} />;
  }
  return <>TODO: Write attribution for {props.dictKey}</>;
}

export function DictAttribution(props: {
  isSmall: boolean;
  dictKey: string;
  textScale?: number;
}) {
  return (
    <ContentBox isSmall={props.isSmall}>
      <div
        style={{
          fontSize: FontSizes.TERTIARY * ((props.textScale || 100) / 100),
          lineHeight: "normal",
        }}>
        <AttributionContent dictKey={props.dictKey} />
      </div>
    </ContentBox>
  );
}
