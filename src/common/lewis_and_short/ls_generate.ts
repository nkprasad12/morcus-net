import { getRawLsXml } from "@/common/lewis_and_short/ls_parser";
import { assert, checkPresent } from "@/common/assert";
import { envVar } from "@/common/env_vars";
import { displayEntryFree } from "@/common/lewis_and_short/ls_display";
import {
  getOrths,
  isRegularOrth,
  mergeVowelMarkers,
} from "@/common/lewis_and_short/ls_orths";
import { extractOutline } from "@/common/lewis_and_short/ls_outline";
import { RawDictEntry, SqlDict } from "@/common/dictionaries/dict_storage";
import { StoredEntryData } from "@/common/lewis_and_short/ls_dict";
import { parseXmlStringsInline } from "@/common/xml/xml_utils";

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
    const orths = getOrths(root).map(mergeVowelMarkers);
    assert(orths.length > 0, `Expected > 0 orths\n${root.toString()}`);
    const regulars = orths.filter(isRegularOrth);
    const keys = regulars.length > 0 ? regulars : orths;
    const data: StoredEntryData = {
      entry: displayEntryFree(root),
      outline: extractOutline(root),
      n: root.getAttr("n"),
    };
    yield StoredEntryData.toRawDictEntry(
      checkPresent(root.getAttr("id")),
      keys,
      data
    );
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

  export function saveToDb(
    dbPath: string = envVar("LS_PROCESSED_PATH"),
    rawFile: string = envVar("LS_PATH")
  ) {
    SqlDict.save(processPerseusXml(rawFile), dbPath);
  }
}
