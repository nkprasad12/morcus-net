import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { SelfLink } from "@/web/client/components/misc";
import * as React from "react";
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
        <SelfLink to="www.perseus.tufts.edu" />, with funding from The National
        Endowment for the Humanities.
      </div>
      <div>
        Data originally from <SelfLink to="github.com/PerseusDL/lexica/" /> and
        accessed from <SelfLink to="github.com/nkprasad12/lexica/" />.
      </div>
    </>
  );
}

function ShAttribution() {
  return (
    <div>
      This text was digitized by the Distributed Proofreaders and generously
      placed into the public domain. See project page at{" "}
      <SelfLink to="www.pgdp.net/c/project.php?id=projectID5775aeccac0c7" />.
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
  if (props.dictKey === LatinDict.RiddleArnold.key) {
    return (
      <div>
        Data for Riddle and Arnold was retrieved from{" "}
        <SelfLink to="github.com/FergusJPWalsh/riddle-arnold" /> and is
        available under a CC-BY-SA-4.0 license.
      </div>
    );
  }
  if (props.dictKey === LatinDict.Gaffiot.key) {
    return (
      <div>
        Gaffiot data kindly provided by{" "}
        <a href="https://gaffiot.fr">gaffiot.fr</a>
      </div>
    );
  }
  if (props.dictKey === LatinDict.Georges.key) {
    return (
      <div>
        Data for Georges was accessed from{" "}
        <a href="https://latin-dict.github.io/dictionaries/Georges1910.html">
          latin-dict.github.io
        </a>{" "}
        and is in the public domain.
      </div>
    );
  }
  if (props.dictKey === LatinDict.Pozo.key) {
    return (
      <div>
        Data for Diccionario Español-Griego-Latín was accessed from{" "}
        <a href="https://latin-dict.github.io/dictionaries/LopezPozo1997.html">
          latin-dict.github.io
        </a>{" "}
        and is in the public domain.
      </div>
    );
  }
  if (props.dictKey === LatinDict.Gesner.key) {
    return (
      <div>
        Data for Gesner was accessed from the venerable{" "}
        <a href="https://latin-dict.github.io/dictionaries/Gesner1749.html">
          latin-dict.github.io
        </a>{" "}
        and transcribed by by the team of Dr. Wilhelm Kühlmann from Heidelberg
        University. Further processing was kindly done by Justin Dealy.
      </div>
    );
  }
  return <>TODO: Write attribution for {props.dictKey}</>;
}

export function DictAttribution(props: { isSmall: boolean; dictKey: string }) {
  return (
    <ContentBox isSmall={props.isSmall}>
      <div className="text xs" style={{ lineHeight: "normal" }}>
        <AttributionContent dictKey={props.dictKey} />
      </div>
    </ContentBox>
  );
}
