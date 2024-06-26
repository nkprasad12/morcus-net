import path from "path";
import fs from "fs";

import { assert, checkPresent } from "@/common/assert";
import { filesInPaths } from "@/utils/file_utils";
import {
  isWordInflectionDataNonEmpty,
  mergeInflectionData,
  toInflectionData,
  wordInflectionDataToArray,
  type InflectionEnding,
} from "@/morceus/inflection_data_utils";
import { mergeMaps, singletonOf } from "@/common/misc_utils";

export const MORPHEUS_TARGETS = "src/morceus/tables/lat/core/target";
export const MORPHEUS_DEPENDENCIES = "src/morceus/tables/lat/core/dependency";

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

function mergeLists<T>(first?: T[], second?: T[]): T[] | undefined {
  const merged = new Set<T>(first || []);
  for (const item of second || []) {
    merged.add(item);
  }
  return merged.size === 0 ? undefined : [...merged];
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
  dependencies: Map<string, InflectionTable>
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
    const expanded = checkPresent(
      dependencies.get(subTemplate.name),
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
    const subTemplateData = toInflectionData(subTemplate.args || []);
    const prefixedEndings: InflectionEnding[] = [];
    for (const inflectionEnding of expanded.endings) {
      const mergedData = mergeInflectionData(
        inflectionEnding.grammaticalData,
        subTemplateData.grammaticalData
      );
      if (mergedData === null) {
        continue;
      }

      prefixedEndings.push({
        tags: mergeLists(inflectionEnding.tags, subTemplateData.tags),
        internalTags: mergeLists(
          inflectionEnding.internalTags,
          subTemplateData.internalTags
        ),
        ending: prefix + inflectionEnding.ending,
        grammaticalData: mergedData,
      });
    }
    endings.push(...prefixedEndings);
  }
  assert(endings.length > 0, `Empty endings for ${template.name}`);
  const result: InflectionTable = {
    name: template.name,
    endings,
  };
  return result;
}

function expandDependencyTemplates(templates: readonly InflectionTemplate[]) {
  const toBeExpanded = new Set(templates);
  const result = new Map<string, InflectionTable>();
  while (toBeExpanded.size > 0) {
    const startSize = toBeExpanded.size;
    for (const template of toBeExpanded.values()) {
      const dependencies = template.templates || [];
      const unprocessedDeps = dependencies.filter((t) => !result.has(t.name));
      if (unprocessedDeps.length > 0) {
        continue;
      }
      toBeExpanded.delete(template);
      result.set(template.name, expandTemplate(template, result));
    }
    assert(
      toBeExpanded.size < startSize,
      `Unprocessable: ${JSON.stringify([...toBeExpanded.values()])}`
    );
  }
  return result;
}

/**
 * Expands the templates specified in given directories.
 *
 * @param targetDirs Locations for target templates.
 * @param dependencyDirs Locations for dependency templates.
 *
 * @returns Maps of target and dependency tables used in processing.
 */
export function expandTemplates(
  targetDirs: string[],
  dependencyDirs: string[]
): [Map<string, InflectionTable>, Map<string, InflectionTable>] {
  const dependencyTemplates = loadTemplates(dependencyDirs);
  const dependencyTemplateList = [...dependencyTemplates.values()];
  const dependencyTables = expandDependencyTemplates(dependencyTemplateList);

  const targetTemplates = loadTemplates(targetDirs);
  const targetTables = new Map<string, InflectionTable>();
  for (const template of targetTemplates.values()) {
    targetTables.set(template.name, expandTemplate(template, dependencyTables));
  }
  return [targetTables, dependencyTables];
}

/**
 * Expands table templates into fully formed tables.
 *
 * @param targetDirs the list of directories where templates are located. These will be searched recursively.
 * @param dependencyDirs the path where the outputs will be written to.
 */
export function expandTemplatesAndSave(
  targetDirs: string[] = [MORPHEUS_TARGETS],
  dependencyDirs: string[] = [MORPHEUS_DEPENDENCIES],
  outputDir: string = "build/morceus/tables/lat"
): void {
  fs.mkdirSync(outputDir, { recursive: true });
  const [targets, _] = expandTemplates(targetDirs, dependencyDirs);
  for (const expanded of targets.values()) {
    writeTable(expanded, outputDir);
  }
}

export const EXPANDED_TEMPLATES = singletonOf(() => {
  const t = expandTemplates([MORPHEUS_TARGETS], [MORPHEUS_DEPENDENCIES]);
  return mergeMaps(t[0], t[1], true);
});
