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

export const QUICK_NAV_ANCHOR = "QNA";

export const SCROLL_JUMP: ScrollIntoViewOptions = {
  behavior: "auto",
  block: "start",
};
export const SCROLL_SMOOTH: ScrollIntoViewOptions = {
  behavior: "smooth",
  block: "start",
};
const HIGHLIGHT_HELP = new XmlNode(
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
  [HIGHLIGHT_HELP, BULLET_HELP, BUG_HELP]
);

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
        senseId={checkPresent(
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
    function LinkContent() {
      const nav = React.useContext(RouteContext);
      return (
        <span
          className="dLink"
          onClick={() => Navigation.query(nav, query.join(","))}
        >
          {text || "undefined"}
        </span>
      );
    }
    return <LinkContent />;
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
}
