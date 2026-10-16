import { getRawLsXml } from "@/common/lewis_and_short/ls_parser";
import { assert, checkPresent } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import { displayEntryFree } from "@/common/lewis_and_short/ls_display";
import {
  derivedOrths,
  getOrths,
  isRegularOrth,
  removeStackedVowelMarkers,
} from "@/common/lewis_and_short/ls_orths";
import { extractOutline } from "@/common/lewis_and_short/ls_outline";
import { StoredEntryData } from "@/common/lewis_and_short/ls_dict";
import { parseXmlStringsInline } from "@/common/xml/xml_utils";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";
import { SqliteDict } from "@/common/dictionaries/sqlite_backing";
import { preRenderEntryHtml } from "@/web/v2/dict/entry/xml_to_html.server";

function* extractEntryData(
  rawFile: string,
  start?: number,
  end?: number
): Generator<RawDictEntry> {
  let numHandled = 0;
  const rawLsXml = getRawLsXml(rawFile);
  for (const root of parseXmlStringsInline(rawLsXml, false, start, end)) {
    if (numHandled % 1000 === 0) {
      console.debug(`Processed ${numHandled + (start || 0)}`);
    }
    const orths = getOrths(root).map(removeStackedVowelMarkers);
    assert(orths.length > 0, () => `Expected > 0 orths\n${root.toString()}`);
    const regulars = orths.filter(isRegularOrth);
    const keys = regulars.length > 0 ? regulars : orths;
    const data: StoredEntryData = {
      entry: preRenderEntryHtml(displayEntryFree(root)),
      outline: extractOutline(root),
      n: root.getAttr("n"),
    };
    yield {
      id: checkPresent(root.getAttr("id")),
      keys,
      entry: JSON.stringify(data),
      derivedKeys: derivedOrths(root),
    };
    numHandled += 1;
  }
}

export namespace GenerateLs {
  export function processPerseusXml(
    rawFile: string,
    start?: number,
    end?: number
  ): RawDictEntry[] {
    return [...extractEntryData(rawFile, start, end)];
  }

  export function saveArtifacts() {
    const allEntries = processPerseusXml(envVar("LS_PATH"));
    SqliteDict.save(allEntries, envVar("LS_PROCESSED_PATH"));
  }
}
