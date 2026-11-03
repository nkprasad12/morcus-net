import { TEI_NAMED_ENTITIES } from "@/common/xml/tei_entities";

const XML_NAMED_ENTITIES: Readonly<Record<string, string>> = {
  ...TEI_NAMED_ENTITIES,
  nbsp: " ",
  cent: "¢",
  pound: "£",
  yen: "¥",
  euro: "€",
  copy: "©",
  reg: "®",
  inr: "₹",
};

/**
 * Parses raw XML into a DOM `Element` root using the browser's native
 * `DOMParser` (`"application/xml"`), expanding TEI/HTML named entities
 * beforehand so undeclared entities don't trigger XML `<parsererror>`.
 */
export function parseXmlRootWithDomParser(rawXml: string): Element {
  const Ctor: typeof DOMParser | undefined = globalThis.DOMParser;
  if (typeof Ctor !== "function") {
    throw new Error(
      "DOMParser is not available; run in a DOM environment."
    );
  }
  const expanded = rawXml.replace(
    /&([A-Za-z][A-Za-z0-9]*);/g,
    (full, name: string) =>
      Object.prototype.hasOwnProperty.call(XML_NAMED_ENTITIES, name)
        ? XML_NAMED_ENTITIES[name]
        : full
  );
  const doc = new Ctor().parseFromString(expanded, "application/xml");
  const parserError = doc.getElementsByTagName("parsererror")[0];
  if (parserError !== undefined) {
    throw new Error(
      parserError.textContent?.replace(/\s+/g, " ").trim() || "XML parse error"
    );
  }
  const root = doc.documentElement;
  if (root === null || root === undefined) {
    throw new Error("Empty XML document");
  }
  return root;
}
