import React, { MutableRefObject } from "react";

import { checkPresent } from "@/common/assert";
import { XmlNode } from "@/common/xml/xml_node";
import {
  ClickableTooltip,
  SectionLinkTooltip,
} from "@/web/client/pages/tooltips";
import { DictInfo } from "@/common/dictionaries/dictionaries";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { Navigation, RouteContext } from "@/web/client/components/router";
import { InflectionData } from "@/common/dictionaries/dict_result";
import { FontSizes } from "@/web/client/styles";

export const QUICK_NAV_ANCHOR = "QNA";

export const SCROLL_JUMP: ScrollIntoViewOptions = {
  behavior: "auto",
  block: "start",
};
export const SCROLL_SMOOTH: ScrollIntoViewOptions = {
  behavior: "smooth",
  block: "start",
};
const HOVER_HELP = new XmlNode(
  "div",
  [["className", "lsHelpText"]],
  [
    "Click on ",
    new XmlNode(
      "span",
      [
        ["class", "lsHover"],
        ["title", "Click to dismiss"],
      ],
      ["underlined"]
    ),
    " text for more details. ",
  ]
);
const HIGHLIGHT_HELP = new XmlNode(
  "div",
  [["className", "lsHelpText"]],
  [
    "Key for highlights: ",
    new XmlNode("span", [["class", "lsOrth"]], ["headword"]),
    ", ",
    new XmlNode("span", [["class", "lsGrammar"]], ["grammar or usage term"]),
    ", ",
    new XmlNode("span", [["class", "lsQuote"]], ["latin quote"]),
    ", ",
    new XmlNode(
      "span",
      [["class", "lsBibl"]],
      [
        new XmlNode("span", [["class", "lsAuthor"]], ["Author Name."]),
        " Work Name. location",
      ]
    ),
  ]
);
const BUG_HELP = new XmlNode(
  "div",
  // This is displayed last, so do not apply the help text style to
  // avoid an extra margin. Yes, this is gross and hacky.
  [],
  [
    "Please report typos or other bugs " +
      "by clicking on the flag icon in the top bar.",
  ]
);
const BULLET_HELP = new XmlNode(
  "div",
  [["className", "lsHelpText"]],
  [
    "Click on sections (like ",
    new XmlNode(
      "span",
      [
        ["class", "lsSenseBullet"],
        ["senseid", "tutorialExample"],
      ],
      [" A. "]
    ),
    ") to link directly to that section.",
  ]
);
export const HELP_ENTRY = new XmlNode(
  "div",
  [],
  [HOVER_HELP, HIGHLIGHT_HELP, BULLET_HELP, BUG_HELP]
);

function ShLink(props: { text: string; query: string }) {
  const nav = React.useContext(RouteContext);
  return (
    <span
      className="dLink"
      onClick={() =>
        Navigation.query(nav, props.query, {
          internalSource: true,
        })
      }
    >
      {props.text}
    </span>
  );
}

function LatLink(props: { word: string; orig?: string }) {
  const nav = React.useContext(RouteContext);
  return (
    <span
      className="latWord"
      onClick={() =>
        Navigation.query(nav, `${props.word},LnS`, {
          experimentalSearch: true,
          internalSource: true,
        })
      }
    >
      {props.orig || props.word}
    </span>
  );
}

export function xmlNodeToJsx(
  root: XmlNode,
  highlightId?: string,
  sectionRef?: MutableRefObject<HTMLElement | null>,
  key?: string
): JSX.Element {
  const children = root.children.map((child, i) => {
    if (typeof child === "string") {
      return child;
    }
    return xmlNodeToJsx(
      child,
      highlightId,
      sectionRef,
      child.getAttr("id") || `${i}`
    );
  });
  const props: { [propKey: string]: any } = {};
  if (key !== undefined) {
    props.key = key;
  }
  let titleText: string | undefined = undefined;
  let className: string | undefined = undefined;
  for (const [attrKey, value] of root.attrs) {
    if (attrKey === "class") {
      className = value;
      props.className = value;
      continue;
    }
    if (attrKey === "title") {
      titleText = value;
      continue;
    }
    props[attrKey] = value;
  }

  if (titleText !== undefined) {
    function hoverForwardedNode(forwardProps: any, forwardRef: any) {
      const allProps = { ...props, ...forwardProps };
      allProps["ref"] = forwardRef;
      return React.createElement(root.name, allProps, children);
    }
    const ForwardedNode = React.forwardRef<HTMLElement>(hoverForwardedNode);
    return (
      <ClickableTooltip
        titleText={titleText}
        className={className}
        ChildFactory={ForwardedNode}
        key={key}
      />
    );
  } else if (className === "lsSenseBullet") {
    function senseForwardedNode(forwardProps: any, forwardRef: any) {
      const allProps = { ...props, ...forwardProps };
      allProps["ref"] = forwardRef;
      return React.createElement(root.name, allProps, children);
    }
    const ForwardedNode = React.forwardRef<HTMLElement>(senseForwardedNode);
    return (
      <SectionLinkTooltip
        forwarded={ForwardedNode}
        className={className}
        id={checkPresent(
          root.getAttr("senseid"),
          "lsSenseBullet must have senseid!"
        )}
        key={key}
      />
    );
  } else if (className === "dLink") {
    const target = root.getAttr("to");
    const text = root.getAttr("text");
    const query = [target || "undefined", "SnH"];
    return (
      <ShLink query={query.join(",")} text={text || "undefined"} key={key} />
    );
  } else if (className === "latWord") {
    const word = root.getAttr("to")!;
    const orig = root.getAttr("orig");
    return <LatLink word={word} orig={orig} key={key} />;
  } else {
    if (root.getAttr("id") === highlightId && highlightId !== undefined) {
      props["className"] = "highlighted";
      props["ref"] = sectionRef!;
    }
    return React.createElement(root.name, props, children);
  }
}

export namespace SearchSettings {
  const SEARCH_SETTINGS_KEY = "SEARCH_SETTINGS_KEY";

  export function store(dicts: DictInfo[]) {
    const keys = dicts.map((dict) => dict.key);
    sessionStorage.setItem(SEARCH_SETTINGS_KEY, keys.join(";"));
  }

  export function retrieve(): DictInfo[] {
    const stored = sessionStorage.getItem(SEARCH_SETTINGS_KEY)?.split(";");
    const rawDicts =
      stored === undefined
        ? LatinDict.AVAILABLE
        : LatinDict.AVAILABLE.filter((d) => stored.includes(d.key));
    return rawDicts;
  }
}

export interface ElementAndKey {
  element: JSX.Element;
  key: string;
  inflections?: InflectionData[];
}

export function InflectionDataSection(props: {
  inflections: InflectionData[];
  textScale?: number;
}) {
  const byForm = new Map<string, [string, string | undefined][]>();
  for (const data of props.inflections) {
    if (!byForm.has(data.form)) {
      byForm.set(data.form, []);
    }
    byForm.get(data.form)!.push([data.data, data.usageNote]);
  }
  const formatted: [string, string[]][] = Array.from(byForm.entries()).map(
    ([form, data]) => [
      form,
      data
        .sort(([_1, a], [_2, b]) =>
          a === undefined ? -1 : b === undefined ? 1 : a.localeCompare(b)
        )
        .map(
          ([inflection, usage]) =>
            inflection + (usage === undefined ? "" : ` (${usage})`)
        ),
    ]
  );

  return (
    <>
      {formatted.map(([form, inflections]) => (
        <div
          style={{
            fontSize: FontSizes.SECONDARY * ((props.textScale || 100) / 100),
            paddingBottom: 3,
          }}
          key={form}
        >
          <span className="lsOrth">{form}</span>:
          {inflections.length === 1 ? (
            ` ${inflections[0]}`
          ) : (
            <ul style={{ margin: 0 }} aria-label="Inflections">
              {[...new Set(inflections)].map((inflection) => (
                <li style={{ lineHeight: "normal" }} key={inflection}>
                  {inflection}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </>
  );
}
