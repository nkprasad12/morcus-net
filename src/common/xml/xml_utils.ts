import { XMLParser, XMLValidator } from "fast-xml-parser";
import { assert } from "@/common/assert";
import { COMMENT_NODE, XmlChild, XmlNode } from "@/common/xml/xml_node";

const ATTRIBUTES_KEY = ":@";
const TEXT_NODE = "#text";

const BASE_XML_PARSER_OPTIONS = {
  ignoreAttributes: false,
  alwaysCreateTextNode: true,
  preserveOrder: true,
  commentPropName: COMMENT_NODE,
};

const PARSE_TRIM_WHITESPACE = {
  ...BASE_XML_PARSER_OPTIONS,
  trimValues: true,
};

const PARSE_KEEP_WHITESPACE = {
  ...BASE_XML_PARSER_OPTIONS,
  trimValues: false,
};

function crawlXml(root: any): XmlNode {
  // Each node in the parsed XML tree is either a text node, which is
  // a leaf, or a tag node. Tag nodes have a property keyed to the
  // name of the tag, which has a value equal to an array of all the
  // nodes inside the tag node. Tag nodes may also have a property
  // which is an object containing all of its attributes. Tag nodes have
  // no other properties.
  const keys = Object.keys(root);
  if (keys.includes("#text")) {
    if (keys.length !== 1) {
      throw new Error("Found #text node with unexpected properties.");
    }
  }
  if (keys.length < 1 || keys.length > 2) {
    throw new Error("Found tag node with unexpected properties.");
  }
  if (keys.length === 2 && !keys.includes(ATTRIBUTES_KEY)) {
    throw new Error("Found tag node with unexpected properties.");
  }

  const tagName = keys.filter((key) => key !== ATTRIBUTES_KEY)[0];
  const attributes: [string, string][] = [];
  const children: XmlChild[] = [];

  if (keys.includes(ATTRIBUTES_KEY)) {
    for (const attribute in root[ATTRIBUTES_KEY]) {
      const value = root[ATTRIBUTES_KEY][attribute];
      const originalName = attribute.substring(2);
      attributes.push([originalName, `${value}`]);
    }
  }
  for (const child of root[tagName]) {
    if (isTextNode(child)) {
      children.push(`${child[TEXT_NODE]}`);
      continue;
    }
    const childResult = crawlXml(child);
    children.push(childResult);
  }
  return new XmlNode(tagName, attributes, children);
}

function isTextNode(node: any): boolean {
  const keys = Object.keys(node);
  if (keys.includes("#text")) {
    assert(keys.length === 1, "Found #text node with unexpected properties.");
    return true;
  }
  return false;
}

// function findXmlElement(input: any, name: string): any {
//   const candidates: any[] = [input];
//   if (Array.isArray(input)) {
//     candidates.push(...input);
//   }
//   for (const candidate of candidates) {
//     if (candidate[name] !== undefined) {
//       return candidate;
//     }
//   }
//   throw new Error(`No ${name} found.\n${input}`);
// }

function validateXml(input: any): void {
  const result = XMLValidator.validate(input, {});
  if (result !== true) {
    throw new Error(
      `XML Validation Error: ${JSON.stringify(result)}\n${input}`
    );
  }
}

/**
 * Parses the raw contents of a single XML document.
 *
 * @param rawXml A raw buffer or string containing the XML contents.
 * @param options Parsing options.
 * - `keepWhitespace`: ensures that whitespace around tags will be ignored.
 * - `rootName`: is the content root name to search for, if the root contains
 *    multiple elements.
 * - `validate`: Whether to validate the XML before returning.
 *
 * @returns An XML node representation of the input data.
 */
export function parseRawXml(
  rawXml: string | Buffer,
  options?: { keepWhitespace?: true; validate?: true }
): XmlNode {
  const parser = new XMLParser(
    options?.keepWhitespace === true
      ? PARSE_KEEP_WHITESPACE
      : PARSE_TRIM_WHITESPACE
  );
  if (options?.validate === true) {
    validateXml(rawXml);
  }
  const nodes: XmlNode[] = parser
    .parse(rawXml)
    .map(crawlXml)
    .filter((n: XmlNode) => n.name[0] !== "?");
  assert(nodes.length === 1, "Expected exactly 1 root node.");
  return nodes[0];
}

/**
 * Parses XML formatted strings. Whitespace between XML is ignored.
 *
 * @param serializedXml - A list of strings. Each string should be one XML document.
 * @param validate - Whether to validate each document.
 *
 * @yields A sequence of parsed XML nodes, one for each input.
 */
export function* parseXmlStringsInline(
  serializedXml: string[],
  validate: boolean = false
): Generator<XmlNode> {
  const parser = new XMLParser(PARSE_KEEP_WHITESPACE);
  for (const entry of serializedXml) {
    const entryFree = parser.parse(entry)[0];
    if (validate) {
      validateXml(entryFree);
    }
    yield crawlXml(entryFree);
  }
}

/**
 * Parses XML formatted strings. Whitespace between XML is ignored.
 *
 * @param serializedXml - A list of strings. Each string should be one XML document.
 * @param validate - Whether to validate each document.
 *
 * @yields A sequence of parsed XML nodes, one for each input.
 */
export function parseXmlStrings(
  serializedXml: string[],
  validate: boolean = false
): XmlNode[] {
  return [...parseXmlStringsInline(serializedXml, validate)];
}
