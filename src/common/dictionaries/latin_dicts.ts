import { DictInfo } from "@/common/dictionaries/dictionaries";

export namespace LatinDict {
  export const LewisAndShort: DictInfo = {
    key: "L&S",
    displayName: "Lewis and Short",
    languages: { from: "La", to: "En" },
    tags: ["Classical"],
  };

  export const AVAILABLE: DictInfo[] = [LewisAndShort];
}
