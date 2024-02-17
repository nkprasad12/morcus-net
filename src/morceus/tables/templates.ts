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

function printMorpheusInflection(table: InflectionTable): string {
  const lines = table.endings.map((ending) => {
    const words = [ending.ending, table.name].concat(
      ending.grammaticalData,
      ending.tags || []
    );
    return words.join(" ");
  });
  return lines.join("\n") + "\n";
}

function writeTable(table: InflectionTable, outputDir: string): void {
  const savePath = path.join(outputDir, `${table.name}.table`);
  fs.writeFileSync(savePath, printMorpheusInflection(table));
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
    const first = parts[0];

    // This means it's invoking another template
    if (first.includes("@")) {
      const templateParts = first.split("@");
      assert(templateParts.length === 2);
      const result: TemplateDependency = { name: templateParts[1] };
      if (templateParts[0].length > 0) {
        result.prefix = templateParts[0];
      }
      if (parts.length > 1) {
        result.args = parts.slice(1);
      }
      templates.push(result);
      continue;
    }

    const grammaticalData: string[] = [];
    const tags: string[] = [];
    for (const part of parts.slice(1)) {
      if (ALL_TAGS.includes(part)) {
        tags.push(part);
      } else {
        grammaticalData.push(part);
      }
    }
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
  expandedRegistry: Map<string, InflectionTable>,
  isFromRegistry?: boolean
): InflectionTable {
  const requredTemplates = template.templates;
  if (isFromRegistry) {
    assert(
      !expandedRegistry.has(template.name),
      `Template ${template.name} has already been expanded!`
    );
  }

  if (requredTemplates === undefined) {
    const result: InflectionTable = {
      name: template.name,
      endings: checkPresent(
        template.endings,
        `Template ${template.name} has no endings!`
      ),
    };
    if (isFromRegistry) {
      expandedRegistry.set(template.name, result);
    }
    return result;
  }

  const endings: InflectionEnding[] = template.endings || [];
  for (const subTemplate of requredTemplates) {
    if (!expandedRegistry.has(subTemplate.name)) {
      const rawTemplate = checkPresent(
        rawRegistry.get(subTemplate.name),
        `No raw template ${template.name} in registry!`
      );
      expandTemplate(rawTemplate, rawRegistry, expandedRegistry, true);
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
  if (isFromRegistry) {
    expandedRegistry.set(template.name, result);
  }
  return result;
}

export function* expandTemplates(
  targetDirs: string[],
  dependencyDirs: string[]
): Generator<InflectionTable> {
  const rawRegistry = loadTemplates(dependencyDirs);
  const expandedRegistry = new Map<string, InflectionTable>();
  const targets = loadTemplates(targetDirs);
  for (const [_, template] of targets.entries()) {
    yield expandTemplate(template, rawRegistry, expandedRegistry);
  }
}

/**
 * Expands table templates into fully formed tables.
 *
 * @param targetDirs the list of directories where templates are located. These will be searched recursively.
 * @param dependencyDirs the path where the outputs will be written to.
 */
export function expandTemplatesAndSave(
  targetDirs: string[] = ["src/morceus/tables/lat/core/target"],
  dependencyDirs: string[] = ["src/morceus/tables/lat/core/dependency"],
  outputDir: string = "tables/lat/out"
): void {
  // TODO - make a more test friendly version that takes in files and returns tables.
  fs.mkdirSync(outputDir, { recursive: true });
  for (const expanded of expandTemplates(targetDirs, dependencyDirs)) {
    writeTable(expanded, outputDir);
  }
}
