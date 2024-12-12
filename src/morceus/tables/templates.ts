import path from "path";
import fs from "fs";

import { assert, assertEqual, checkPresent } from "@/common/assert";
import { filesInPaths } from "@/utils/file_utils";
import {
  isWordInflectionDataNonEmpty,
  toInflectionData,
  wordInflectionDataToArray,
  type InflectionContext,
  type InflectionEnding,
} from "@/morceus/inflection_data_utils";
import { singletonOf } from "@/common/misc_utils";
import { expandSingleEnding } from "@/morceus/tables/template_utils_no_fs";

export const MORPHEUS_TARGETS = "morceus-data/latin/ends/target";
export const MORPHEUS_DEPENDENCIES = "morceus-data/latin/ends/dependency";

export interface InflectionTable {
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
      wordInflectionDataToArray(ending.grammaticalData),
      ending.tags || [],
      ending.internalTags || []
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

    const endingData = toInflectionData(parts.slice(1));
    assert(isWordInflectionDataNonEmpty(endingData.grammaticalData));
    endings.push({ ...endingData, ending: first });
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

export function expandSingleTable(
  stem: string,
  context: InflectionContext,
  table: InflectionTable
): InflectionEnding[] {
  return table.endings
    .map((ending) => expandSingleEnding(stem, context, ending))
    .filter((ending) => ending !== null);
}

/**
 * Expands the given template.
 *
 * @param template The template to expand.
 * @param dependencies The registry of the processed (expanded) dependency templates.
 * @returns The expanded template.
 */
export function expandTemplate(
  template: InflectionTemplate,
  dependencies: ReadonlyMap<string, InflectionTable>
): InflectionTable {
  const requredTemplates = template.templates;
  if (requredTemplates === undefined) {
    const result: InflectionTable = {
      name: template.name,
      endings: checkPresent(
        template.endings,
        `Template ${template.name} has no endings!`
      ),
    };
    return result;
  }

  const endings: InflectionEnding[] = template.endings || [];
  for (const subTemplate of requredTemplates) {
    // In `ta_t@decl3_i	gen pl`, this would be the expanded @decl3_i table.
    const table = checkPresent(
      dependencies.get(subTemplate.name),
      `No expanded template ${subTemplate.name} in registry!`
    );
    const prefix =
      subTemplate.prefix === undefined
        ? ""
        : subTemplate.prefix === "*"
        ? ""
        : subTemplate.prefix;
    const subTemplateData = toInflectionData(subTemplate.args || []);
    endings.push(...expandSingleTable(prefix, subTemplateData, table));
  }
  assert(endings.length > 0, `Empty endings for ${template.name}`);
  const result: InflectionTable = {
    name: template.name,
    endings,
  };
  return result;
}

/**
 * Expands templates in the given target directories.
 *
 * @param templateDirs Directories to search for templates.
 *
 * @returns a map of template names to expanded templates.
 */
export function expandTemplates(
  templateDirs: string[]
): Map<string, InflectionTable> {
  const templates = loadTemplates(templateDirs);
  const templateDeps = new Map<string, string[]>();
  for (const [name, template] of templates) {
    assertEqual(templateDeps.get(name), undefined);
    templateDeps.set(name, template.templates?.map((dep) => dep.name) || []);
  }

  const expanded = new Map<string, InflectionTable>();
  while (templateDeps.size > 0) {
    const expandable = [...templateDeps.entries()].filter(
      ([_, deps]) =>
        // Find anything where all the dependencies have been expanded.
        deps.filter((dep) => expanded.get(dep) === undefined).length === 0
    );
    // If there's nothing to expand, we will have an infinite loop.
    assert(expandable.length > 0);
    for (const [name, _] of expandable) {
      assert(templateDeps.delete(name));
      assertEqual(expanded.get(name), undefined);
      const template = checkPresent(templates.get(name));
      expanded.set(name, expandTemplate(template, expanded));
    }
  }
  return expanded;
}

/**
 * Expands table templates into fully formed tables.
 *
 * @param templateDirs Directories to search for templates.
 */
export function expandTemplatesAndSave(
  templateDirs: string[] = [MORPHEUS_TARGETS, MORPHEUS_DEPENDENCIES],
  outputDir: string = "build/morceus/tables/lat"
): void {
  fs.mkdirSync(outputDir, { recursive: true });
  for (const expanded of expandTemplates(templateDirs).values()) {
    writeTable(expanded, outputDir);
  }
  console.debug(`Saved expanded tables to ${outputDir}`);
}

export const EXPANDED_TEMPLATES = singletonOf(() =>
  expandTemplates([MORPHEUS_TARGETS, MORPHEUS_DEPENDENCIES])
);
