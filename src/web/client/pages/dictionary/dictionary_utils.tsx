import * as React from "react";
import { JSX } from "react";

import { checkPresent } from "@/common/assert";
import { XmlNode } from "@/common/xml/xml_node";
import {
  ClickableTooltip,
  SectionLinkTooltip,
} from "@/web/client/pages/tooltips";
import { DictInfo } from "@/common/dictionaries/dictionaries";
import {
  LatinDict,
  type LatinDictInfo,
} from "@/common/dictionaries/latin_dicts";
import {
  InflectionData,
  type DictSubsectionResult,
} from "@/common/dictionaries/dict_result";
import { DictContext } from "@/web/client/pages/dictionary/dict_context";
import { ClientPaths } from "@/web/client/routing/client_paths";
import { useDictRouter } from "@/web/client/pages/dictionary/dictionary_routing";
import { arrayMap } from "@/common/data_structures/collect_map";
import { processWords } from "@/common/text_cleaning";
import { safeParseInt } from "@/common/misc_utils";

export const SCROLL_JUMP: ScrollIntoViewOptions = {
  behavior: "auto",
  block: "start",
};
export const SCROLL_SMOOTH: ScrollIntoViewOptions = {
  behavior: "smooth",
  block: "start",
};

interface HelpRowConfig {
  left: XmlNode;
  right: string;
}
const SAMPLE_HOVER_NODE = new XmlNode(
  "span",
  [
    ["class", "lsHover"],
    ["title", "Click away to dismiss"],
  ],
  ["Underlined"]
);
const SAMPLE_HEADWORD = new XmlNode(
  "span",
  [["class", "lsOrth"]],
  ["Headword"]
);
const SAMPLE_GRAMMAR = new XmlNode("span", [["class", "lsGrammar"]], ["Usage"]);
const SAMPLE_QUOTE = new XmlNode("span", [["class", "lsQuote"]], ["Quote"]);
const SAMPLE_AUTHOR = new XmlNode(
  "span",
  [["class", "lsBibl"]],
  [new XmlNode("span", [["class", "lsAuthor"]], ["Author"]), " Work"]
);
const SAMPLE_SECTION_HEADER = new XmlNode(
  "span",
  [
    ["class", "lsSenseBullet"],
    ["senseid", "tutorialExample"],
  ],
  [" A. "]
);
const HELP_ROWS: HelpRowConfig[] = [
  {
    left: SAMPLE_HOVER_NODE,
    right:
      "You can click on underlined words to open a tooltip with more information. Try clicking on this one!",
  },
  {
    left: SAMPLE_HEADWORD,
    right: "The headwords or main entries in the dictionary.",
  },
  { left: SAMPLE_GRAMMAR, right: "Technical notes on grammar or usage" },
  {
    left: SAMPLE_QUOTE,
    right: "A quote, usually showing an example of the word in a real text.",
  },
  {
    left: SAMPLE_AUTHOR,
    right:
      "A citation showing the author, work, or passage from which an example is taken.",
  },
  {
    left: SAMPLE_SECTION_HEADER,
    right:
      "Click on grey section headers to copy links directly to a particular section of a long article.",
  },
];

function HelpSectionRow(props: { row: number } & HelpRowConfig) {
  const gridRow = props.row + 1;
  return (
    <>
      <span style={{ gridRow, gridColumn: 1 }}>
        {xmlNodeToJsx(props.left, {})}
      </span>
      <span style={{ gridRow, gridColumn: 2 }}>{props.right}</span>
    </>
  );
}
function HelpSectionRows(props: { configs: HelpRowConfig[] }) {
  return (
    <>
      {props.configs.map(({ left, right }, i) => (
        <HelpSectionRow key={i} row={i} left={left} right={right} />
      ))}
    </>
  );
}

export function DictHelpSection() {
  return (
    <>
      <div
        style={{
          display: "grid",
          columnGap: "8px",
          rowGap: "8px",
          marginTop: "12px",
        }}>
        <HelpSectionRows configs={HELP_ROWS} />
      </div>
      <div style={{ marginTop: "12px" }}>
        Please report typos or other bugs by clicking on the flag icon in the
        top bar.
      </div>
    </>
  );
}

function ShLink(props: { text: string; query: string }) {
  const { nav } = useDictRouter();
  const { fromInternalLink } = React.useContext(DictContext);

  return (
    <span
      className="dLink"
      onAuxClick={() =>
        nav.inNewTab({
          path: ClientPaths.DICT_PAGE.path,
          query: props.query,
          dicts: LatinDict.SmithAndHall,
        })
      }
      onClick={() => {
        if (fromInternalLink) {
          fromInternalLink.current = true;
        }
        nav.to({
          path: ClientPaths.DICT_PAGE.path,
          query: props.query,
          dicts: LatinDict.SmithAndHall,
        });
      }}>
      {props.text}
    </span>
  );
}

export function LatLinkify(props: { input: string }) {
  return (
    <>
      {processWords(props.input, (word, i) => (
        <span key={i} className="latWord">
          {word}
        </span>
      ))}
    </>
  );
}

export interface XmlNodeToJsxArgs {
  highlightId?: string;
  isEmbedded?: boolean;
}

export function xmlNodeToJsx(
  root: XmlNode,
  args: XmlNodeToJsxArgs,
  key?: string
): JSX.Element {
  const props: { [propKey: string]: any } = {};
  if (key !== undefined) {
    props.key = key;
  }
  let titleText: string | undefined = undefined;
  let className: string | undefined = undefined;
  for (const [attrKey, value] of root.attrs) {
    if (attrKey === "class") {
      className = value;
      props.className = className;
      continue;
    }
    if (attrKey === "title") {
      titleText = value;
      continue;
    }
    props[attrKey] = value;
  }

  const shouldLinkifyWords =
    !className?.includes("lsHover") && !className?.includes("lsSenseBullet");
  const children = root.children.flatMap((child, idx) => {
    if (typeof child !== "string") {
      return xmlNodeToJsx(child, args, child.getAttr("id") ?? `${idx}`);
    }
    if (!shouldLinkifyWords) {
      return child;
    }
    return <LatLinkify key={idx} input={child} />;
  });

  if (titleText !== undefined) {
    function hoverForwardedNode(forwardProps: any, forwardRef: any) {
      const allProps = { ...props, ...forwardProps };
      allProps["ref"] = forwardRef;
      return React.createElement(root.name, allProps, children);
    }
    const ForwardedNode = React.forwardRef<HTMLElement>(hoverForwardedNode);
    return (
      <ClickableTooltip
        titleText={<span style={{ padding: "0px 4px" }}>{titleText}</span>}
        ChildFactory={ForwardedNode}
        key={key}
      />
    );
  }
  if (className === "lsSenseBullet") {
    function senseForwardedNode(forwardProps: any, forwardRef: any) {
      const allProps = { ...props, ...forwardProps };
      allProps["ref"] = forwardRef;
      return React.createElement(root.name, allProps, children);
    }
    const ForwardedNode = React.forwardRef<HTMLElement>(senseForwardedNode);
    const senseId = checkPresent(root.getAttr("senseid"));
    return (
      <SectionLinkTooltip
        forwarded={ForwardedNode}
        id={senseId}
        key={key}
        idToEdit={senseId}
      />
    );
  }
  if (className === "dLink") {
    const target = root.getAttr("to");
    const text = root.getAttr("text");
    return (
      <ShLink
        query={target || "undefined"}
        text={text || "undefined"}
        key={key}
      />
    );
  }
  const rootId = root.getAttr("id");
  if (rootId !== undefined && rootId === args.highlightId) {
    props["className"] = "dictHighlighted";
  }
  const indentLevel = safeParseInt(props["indentLevel"]);
  if (indentLevel !== undefined && indentLevel > 0) {
    props["style"] = {
      ...props["style"],
      marginLeft: `${indentLevel * 0.5}em`,
    };
  }
  return React.createElement(root.name, props, children);
}

export namespace SearchSettings {
  const SEARCH_SETTINGS_KEY = "SEARCH_SETTINGS_KEY";

  export function store(dicts: DictInfo[]) {
    const keys = dicts.map((dict) => dict.key);
    sessionStorage.setItem(SEARCH_SETTINGS_KEY, keys.join(";"));
  }

  export function retrieve(): LatinDictInfo[] {
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
  subsections?: DictSubsectionResult[];
}

export function InflectionDataSection(props: {
  inflections: InflectionData[];
}) {
  const byForm = arrayMap<string, [string, string | undefined]>();
  for (const data of props.inflections) {
    byForm.add(data.form, [data.data, data.usageNote]);
  }
  const formatted: [string, string[]][] = Array.from(byForm.map.entries()).map(
    ([form, data]) => [
      form,
      Array.from(
        new Set(
          data
            .sort(([_1, a], [_2, b]) =>
              a === undefined ? -1 : b === undefined ? 1 : a.localeCompare(b)
            )
            .map(
              ([inflection, usage]) =>
                inflection + (usage === undefined ? "" : ` (${usage})`)
            )
        )
      ),
    ]
  );

  return (
    <>
      {formatted.map(([form, inflections]) => (
        <div className="text sm" style={{ paddingBottom: 3 }} key={form}>
          <span className="lsOrth">
            {form
              .replaceAll("^", "\u0306")
              .replaceAll("_", "\u0304")
              .replaceAll("+", "\u0308")}
          </span>
          :
          {inflections.length === 1 ? (
            ` ${inflections[0]}`
          ) : (
            <ul style={{ margin: 0 }} aria-label="Inflections">
              {inflections.map((inflection) => (
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
