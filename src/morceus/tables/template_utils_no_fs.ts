import {
  type InflectionContext,
  type InflectionEnding,
  mergeInflectionData,
} from "@/morceus/inflection_data_utils";

// Logically this module should be part of `templates`, but the parts the
// cruncher needs directly here are separated from the rest (which uses `fs`)
// so that it can be used in the browser too.

function mergeLists<T>(first?: T[], second?: T[]): T[] | undefined {
  const merged = new Set<T>(first || []);
  for (const item of second || []) {
    merged.add(item);
  }
  return merged.size === 0 ? undefined : [...merged];
}

export function expandSingleEnding(
  stem: string,
  context: InflectionContext,
  ending: InflectionEnding
): InflectionEnding | null {
  const mergedData = mergeInflectionData(
    ending.grammaticalData,
    context.grammaticalData
  );
  if (mergedData === null) {
    return null;
  }
  const result: InflectionEnding = {
    ending: stem + ending.ending,
    grammaticalData: mergedData,
  };
  const tags = mergeLists(ending.tags, context.tags);
  if (tags !== undefined) {
    result.tags = tags;
  }
  const internalTags = mergeLists(ending.internalTags, context.internalTags);
  if (internalTags !== undefined) {
    result.internalTags = internalTags;
  }
  return result;
}
