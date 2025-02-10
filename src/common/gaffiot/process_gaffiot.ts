import { assert, assertType } from "@/common/assert";
import type { EntryResult } from "@/common/dictionaries/dict_result";
import type { RawDictEntry } from "@/common/dictionaries/stored_dict_interface";
import { envVar } from "@/common/env_vars";
import { XmlNode } from "@/common/xml/xml_node";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";
import {
  encodeMessage,
  isArray,
  isString,
  matchesObject,
  maybeUndefined,
} from "@/web/utils/rpc/parsing";
import { readFileSync } from "fs";

// TODO: Do we replace all `~` characters with ` `? gaffiot.fr does this.

// Guide:
// - Initial number indicates that there are two words with the
//   same spelling but different meanings.
// - ? indicates that the word may have some doubt.
// - ' and ! indicate an abbreviation or an exclamation.
const KEY_PATTERN = /^(\d )?(\? )?\w[\w -]*['!]?$/;
// Loaded from: `https://gaffiot.fr/gaffiot.js`

export const GAFFIOT_TAGS = [
  "entree", // Contains an entry, with diacritics.
  "gen", // Gender
  "aut", // Author
  "oeuv", // Seems to be the work
  "refch", // Reference book, line, etc... in a work.
  "lat", // Seems to be a link to another word in the dictionary
  "es", // Variant spellings
  "latv", // Latin word cited in reference; see
  "grec", // Greek word
  "rub", // Section, I, II, etc... rub > pp > qq/qqng
  "pp", // Section, 1, 2, 3, etc... rub > pp > qq/qqng
  "qq", // Section, a), b), c), etc... rub > pp > qq/qqng
  "cl", // Direct citation from latin work
  "latc", // Latin word cited in reference; as
  "pca", // seems to be when ancient authors quote or commentate others? "composition in small capitals"
  "ital", // Italics
  "pc", // author or character cited in another work
  "des", // The inflection paradigm.
  "comm", // Seems to be a comment.
  "etyml", // Etymology
  "up", // Superscript
  "autz", // Referring to some ref work
  "el", // secondary entry composed in italics in the Gaffiot.
  "autp", // non-antique author
  "refchp", // reference corresponding to a non-antique author
  "Rub", // see `rub`
  "etymgr", // Greek etymology
  "romain", // Seems to be inserted commentary in Latin text?
  "hbox",
  "gras", // bold
  "S", // Section symbol §, may be followed by a number. Usually empty.
  "overline", // Has a line over
  "desv", // Inflection variant (c.f. \\des), e.g. abl. pl. \desv{-tabus}.
  "latdim", // diminuitive of Latin word
  "latp", // Participle of Latin word
  "latgen", // genitive of Latin word
  "freq", // frequentative of latin word
  "latpl", // plural of latin word
  "latpf", // perfect of Latin word
  "italp", // composition in italics for opening parenthesis
  "smash", // Only happens once, can ignore?
  "qqng", // qq non-gras (not bold)
  "setparameterlist", // Ignore everything after this, it's not supposed to be there.
  //
  // The below do not have `{` following
  //
  "par", // <BR>
  "F", // Arrow
  "kern", // Should have a number immediately after, maybe followed by a space.
  "kern0", // Should have something like 0.5em etc... after
  "string", // Unclear what it means but good to render exactly what is after this.
  "dixpc", // Note: comes AFTER, not before, an opening brace. Whatever is after should be in capitals
  "times", // times symbol
  "raise", // Means raised up, we can ignore it. Only happens 3 times. Has a unit immediately after and can include a `.`! so \raise0.1em must be handled.
  "arabe", // Arabic
  "thinspace", // replace this and a mandatory following space with a period
  "douzerm", // Only happens once, we can maybe igno0re
  "break", // small break, maybe can be a space or two. Can have text immediately after.
  "hskip", // has a unit e.g. \\hskip0.3em immediately after. Only happens twice, can convert to a space.
  "neufrm", // Note: this is after, not before, brackets. can ignore
  "goodbreak", // Ignore
  "dixrmchif", // Note: after, not before {. Just render text
  "nobreak", // ignore
  "penalty5000", // ignore
  "etyml", // This is a mistake: \\etyml {(vociferor),}. Happens only once.
  "hfil", // Just ignore.
  "unskip", // Just ignore
  "finishpdffile", // Ignore this, not supposed to be there
];

interface GaffiotEntry {
  article: string;
  images?: string[];
}

const isGaffiotEntry = matchesObject<GaffiotEntry>({
  article: isString,
  images: maybeUndefined(isArray(isString)),
});

function gaffiotDict(): Record<string, Record<string, string>> {
  const filePath = envVar("GAFFIOT_RAW_PATH");
  const data = readFileSync(filePath).toString();
  const start = data.indexOf("{");
  return JSON.parse(data.substring(start));
}

function toEntryResult(input: string, key: string, id: string): EntryResult {
  return {
    entry: new XmlNode("div", [["id", id]], [input]),
    outline: {
      mainKey: key,
      mainSection: {
        text: "placeholder text",
        level: 0,
        ordinal: "0",
        sectionId: id,
      },
    },
  };
}

function stripComments(entryText: string): string {
  return entryText.replace(/<[^>]*>/g, "");
}

export function processGaffiot(): RawDictEntry[] {
  const gaffiot = gaffiotDict();
  const entries: RawDictEntry[] = [];
  const ids = new Set<string>();
  const tags = new Set<string>();
  for (const entryName in gaffiot) {
    const id = "gaf-" + entryName.replaceAll(/[\s'?!*()]/g, "");
    assert(/^[A-Za-z\d-]+$/.test(id), id);
    assert(!ids.has(id), `Duplicate id: ${id}`);
    ids.add(id);

    if (!KEY_PATTERN.test(entryName)) {
      console.log(`Weird key: ${entryName}`);
    }

    const entry = assertType(gaffiot[entryName], isGaffiotEntry);
    const entryText = stripComments(entry.article);
    for (const tag of entryText.matchAll(/\\(\w+)[^\w{\\}]/g)) {
      if (!GAFFIOT_TAGS.includes(tag[1])) {
        tags.add(tag[1]);
      }
    }
    entries.push({
      id,
      keys: [entryName],
      entry: encodeMessage(toEntryResult(entryText, entryName, id), [
        XmlNodeSerialization.DEFAULT,
      ]),
    });
  }
  console.log(tags);
  return entries;
}
