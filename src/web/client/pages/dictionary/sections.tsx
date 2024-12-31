import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { SelfLink } from "@/web/client/components/misc";
import { getBuildDate } from "@/web/client/define_vars";
import * as React from "react";
import { FontSizes } from "@/web/client/styling/styles";
import { Divider } from "@/web/client/components/generic/basics";

export function ContentBox(
  props: React.PropsWithChildren<{
    isSmall: boolean;
    contentKey?: string;
    contentRef?: React.RefObject<HTMLDivElement>;
    ml?: string;
    mr?: string;
    mt?: number;
    noDivider?: boolean;
    id?: string;
    className?: string;
    isEmbedded?: boolean;
    styles?: React.CSSProperties;
  }>
) {
  const isSmall = props.isSmall;

  return (
    <div
      style={{
        paddingTop: 0,
        paddingBottom: 0,
        paddingLeft: isSmall ? 0 : "8px",
        paddingRight: isSmall ? 0 : "8px",
        marginLeft: props.ml || (isSmall ? 0 : "24px"),
        marginRight: props.mr || (isSmall ? 0 : "24px"),
        marginTop: props.mt !== undefined ? props.mt : "8px",
        marginBottom: props.isEmbedded ? "8px" : "16px",
        ...props.styles,
      }}
      key={props.contentKey}
      ref={props.contentRef}
      id={props.id}
      className={props.className}>
      <div className="text md" style={{ whiteSpace: "pre-wrap" }}>
        {props.children}
      </div>
      {props.noDivider !== true && <Divider style={{ marginTop: "16px" }} />}
    </div>
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
  if (props.dictKey === LatinDict.Numeral.key) {
    return (
      <div>
        Numeral data was collected and organized by Quillful and sourced from
        Allen and Greenough and Lewis and Short.
      </div>
    );
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
