import { DictInfo } from "@/common/dictionaries/dictionaries";

export type LatinDictKey = "L&S" | "S&H";
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

  export const AVAILABLE: LatinDictInfo[] = [LewisAndShort, SmithAndHall];
  export const BY_KEY = new Map<string, LatinDictInfo>(
    AVAILABLE.map((d) => [d.key, d])
  );
}
