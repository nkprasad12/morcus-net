import { DictInfo } from "@/common/dictionaries/dictionaries";

export namespace LatinDict {
  export const LewisAndShort: DictInfo = {
    key: "L&S",
    displayName: "Lewis and Short",
    languages: { from: "La", to: "En" },
    tags: ["Classical"],
  };

  export const SmithAndHall: DictInfo = {
    key: "S&H",
    displayName: "Smith and Hall",
    languages: { from: "En", to: "La" },
    tags: ["Classical"],
  };

  export const AVAILABLE: DictInfo[] = [LewisAndShort, SmithAndHall];
  export const BY_KEY = new Map<string, DictInfo>(
    AVAILABLE.map((d) => [d.key, d])
  );
}
