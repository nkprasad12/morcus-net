import { DictInfo } from "@/common/dictionaries/dictionaries";

export type LatinDictKey = "L&S" | "S&H" | "NUM" | "R&A";
export interface LatinDictInfo extends DictInfo {
  key: LatinDictKey;
}

export namespace LatinDict {
  export const LewisAndShort: LatinDictInfo = {
    key: "L&S",
    displayName: "Lewis and Short",
    languages: { from: "La", to: "En" },
    tags: ["Classical"],
  };

  export const SmithAndHall: LatinDictInfo = {
    key: "S&H",
    displayName: "Smith and Hall",
    languages: { from: "En", to: "La" },
    tags: ["Classical"],
  };

  export const Numeral: LatinDictInfo = {
    key: "NUM",
    displayName: "Numeral",
    languages: { from: "*", to: "*" },
    tags: ["Numeral"],
  };

  export const RiddleArnold: LatinDictInfo = {
    key: "R&A",
    displayName: "Riddle and Arnold",
    languages: { from: "En", to: "La" },
    tags: ["Classical"],
  };

  export const AVAILABLE: LatinDictInfo[] = [
    LewisAndShort,
    SmithAndHall,
    RiddleArnold,
    Numeral,
  ];
  export const BY_KEY = new Map<string, LatinDictInfo>(
    AVAILABLE.map((d) => [d.key, d])
  );
}
