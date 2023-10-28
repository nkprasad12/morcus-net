import { createWriteStream, readFileSync, renameSync } from "fs";
import { XmlNode } from "@/common/xml/xml_node";
import { parseXmlStrings } from "../xml/xml_utils";

/**
 * Rewrites the contents of an XML file at the specified path by applying
 * the given rewriter function to each line of the file's body element.
 *
 * @param input - The path to the XML file to rewrite.
 * @param rewriter - A function that takes a line and returns a rewritten
 *                   version of that string. This should include line
 *                   terminations if needed.
 *
 * @returns A Promise that resolves when the rewritten file is saved.
 */
export async function rewriteLs(
  input: string,
  rewriter: (input: string) => string
): Promise<void> {
  const xmlContents = readFileSync(input, "utf8");
  const tmpFile = `tmp.${performance.now()}`;
  const fileStream = createWriteStream(tmpFile, { flags: "a" });

  const lines = xmlContents.split("\n");
  let inBody = false;
  lines.forEach((line, i) => {
    if (line.trim().startsWith("</body>")) {
      inBody = false;
    }
    if (inBody) {
      fileStream.write(rewriter(line));
    } else {
      if (i !== 0) {
        fileStream.write("\n");
      }
      fileStream.write(line);
      if (line.trim() === "<body>") {
        inBody = true;
      }
    }
  });

  await new Promise<void>((resolve) => {
    fileStream.end(() => {
      resolve();
    });
  });
  renameSync(tmpFile, input);
  return;
}

export namespace LsRewriters {
  export function removeWhitespace(input: string): Promise<void> {
    return rewriteLs(input, (line) =>
      line.length === 0 ? "" : "\n" + line.trim()
    );
  }

  export function transformEntries(
    inputPath: string,
    transformer: (input: XmlNode) => XmlNode
  ): Promise<void> {
    return rewriteLs(inputPath, (line) => {
      if (!line.startsWith("<entryFree ")) {
        return "\n" + line;
      }
      const original = parseXmlStrings([line])[0];
      return "\n" + transformer(original).toString();
    });
  }
}
