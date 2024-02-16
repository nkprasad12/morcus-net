import path from "path";
import fs from "fs";

import { assert, checkPresent } from "@/common/assert";
import { filesInPaths } from "@/utils/file_utils";

const ALL_TAGS: string[] = ["poetic", "early", "contr"];

/** An entry in an inflection table that shows an ending and when to use it. */
interface InflectionEnding {
  /** The grammatical categories - case, number, and so on. */
  grammaticalData: string[];
  /** The ending corresponding to the given `grammaticalData`. */
  ending: string;
  /** Tags indicating usage notes about the inflection. */
  tags?: string[];
}

interface InflectionTable {
  name: string;
  endings: InflectionEnding[];
}

interface TemplateDependency {
  name: string;
  prefix?: string;
  args?: string[];
}

/**
 * An inflection template contains inflectional endings and
 * grammatical data, and may invoke other templates to compute endings for
 * some inflections.
 */
interface InflectionTemplate {
  name: string;
  endings?: InflectionEnding[];
  templates?: TemplateDependency[];
}

function writeTable(table: InflectionTable, outputDir: string): void {
  fs.writeFileSync(
    path.join(outputDir, `${table.name}.table`),
    JSON.stringify(table, undefined, 2)
  );
}

/** Exported for testing. Do not use. */
export function loadTemplate(filePath: string): InflectionTemplate {
  const name = path.parse(filePath).name;
  const contents = fs.readFileSync(filePath, "utf8");
  const lines = contents
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));

  const endings: InflectionEnding[] = [];
  const templates: TemplateDependency[] = [];
  for (const line of lines) {
    const parts = line
      .split(/\s+/)
      .filter((part) => part.length > 0)
      .map((part) => part.trim());
    assert(parts.length > 0, line);

    const grammaticalData: string[] = [];
    const tags: string[] = [];
    for (const part of parts.slice(1)) {
      if (ALL_TAGS.includes(part)) {
        tags.push(part);
      } else {
        grammaticalData.push(part);
      }
    }

    const first = parts[0];
    if (first.includes("@")) {
      const templateParts = first.split("@");
      assert(templateParts.length === 2);
      assert(tags.length === 0);
      const result: TemplateDependency = { name: templateParts[1] };
      if (templateParts[0].length > 0) {
        result.prefix = templateParts[0];
      }
      if (grammaticalData.length > 0) {
        result.args = grammaticalData;
      }
      templates.push(result);
    } else {
      assert(grammaticalData.length > 0);
      const currentEnding: InflectionEnding = {
        ending: first,
        grammaticalData,
      };
      if (tags.length > 0) {
        currentEnding.tags = tags;
      }
      endings.push(currentEnding);
    }
  }

  assert(endings.length > 0 || templates.length > 0);
  const result: InflectionTemplate = { name };
  if (endings.length > 0) {
    result.endings = endings;
  }
  if (templates.length > 0) {
    result.templates = templates;
  }
  return result;
}

function loadTemplates(inputDirs: string[]): Map<string, InflectionTemplate> {
  const result = new Map<string, InflectionTemplate>();
  for (const filePath of filesInPaths(inputDirs)) {
    const template = loadTemplate(filePath);
    assert(
      !result.has(template.name),
      `Template ${template.name} has already been loaded!`
    );
    result.set(template.name, template);
  }
  return result;
}

function expandTemplate(
  template: InflectionTemplate,
  rawRegistry: Map<string, InflectionTemplate>,
  expandedRegistry: Map<string, InflectionTable>
): InflectionTable {
  const requredTemplates = template.templates;
  assert(
    !expandedRegistry.has(template.name),
    `Template ${template.name} has already been expanded!`
  );

  if (requredTemplates === undefined) {
    const result: InflectionTable = {
      name: template.name,
      endings: checkPresent(
        template.endings,
        `Template ${template.name} has no endings!`
      ),
    };
    expandedRegistry.set(template.name, result);
    return result;
  }

  const endings: InflectionEnding[] = template.endings || [];
  for (const subTemplate of requredTemplates) {
    if (!expandedRegistry.has(subTemplate.name)) {
      const rawTemplate = checkPresent(
        rawRegistry.get(subTemplate.name),
        `No raw template ${template.name} in registry!`
      );
      expandTemplate(rawTemplate, rawRegistry, expandedRegistry);
    }
    const expanded = checkPresent(
      expandedRegistry.get(subTemplate.name),
      `No expanded template ${template.name} in registry!`
    );
    // We need to figure out the logic of exactly how grammatical data
    // on a template invocation is supposed to interact with the endings
    // specified in the template. It seems to be something like:
    // (1) Combine the grammatical tags
    // (2) If there is a contradiction, (e.g. Active and Passive) discard it.
    // assert(subTemplate.args === undefined);
    const prefix =
      subTemplate.prefix === undefined
        ? ""
        : subTemplate.prefix === "*"
        ? ""
        : subTemplate.prefix;
    const prefixedEndings = expanded.endings.map((v) => ({
      ...v,
      ending: prefix + v.ending,
    }));
    endings.push(...prefixedEndings);
  }
  assert(endings.length > 0, `Empty endings for ${template.name}`);
  const result: InflectionTable = {
    name: template.name,
    endings,
  };
  expandedRegistry.set(template.name, result);
  return result;
}

/**
 * Expands table templates into fully formed tables.
 *
 * @param inputDirs the list of directories where templates are located. These will be searched recursively.
 * @param outputDir the path where the outputs will be written to.
 */
export function expandTemplates(
  inputDirs: string[],
  dependentTemplateDirs: string[],
  outputDir: string
): void {
  // TODO - make a more test friendly version that takes in files and returns tables.
  const rawRegistry = loadTemplates(dependentTemplateDirs);
  const expandedRegistry = new Map<string, InflectionTable>();
  const targets = loadTemplates(inputDirs);
  for (const [name, template] of targets.entries()) {
    assert(!rawRegistry.has(name));
    rawRegistry.set(name, template);
    const expanded = expandTemplate(template, rawRegistry, expandedRegistry);
    writeTable(expanded, outputDir);
  }
}
