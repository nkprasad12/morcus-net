import type { LatinDictInfo } from "@/common/dictionaries/latin_dicts";
import React from "react";

const DEFAULT_DICT_OPTIONS: DictContextOptions = {
  isEmbedded: false,
  isSmall: false,
  scale: 1,
  textScale: 100,
  dictsToUse: [],
  setDictsToUse: () => {},
  scrollTopRef: React.createRef(),
};

export interface DictContextOptions {
  isEmbedded: boolean;
  embeddedOptions?: EmbeddedDictOptions;
  isSmall: boolean;
  scale: number;
  textScale?: number;
  dictsToUse: LatinDictInfo[];
  setDictsToUse: (dicts: LatinDictInfo[]) => unknown;
  scrollTopRef: React.RefObject<HTMLDivElement>;
  setInitial?: (target: string) => unknown;
  fromInternalLink?: React.MutableRefObject<boolean>;
}

export const DictContext: React.Context<DictContextOptions> =
  React.createContext(DEFAULT_DICT_OPTIONS);

export interface EmbeddedDictOptions {
  hideableOutline?: boolean;
}
export interface DictionaryV2Props {
  /** Whether the dictionary is embedded in another view. */
  embedded?: boolean;
  embeddedOptions?: EmbeddedDictOptions;
  /** An initial query, if any. */
  initial?: string;
  /** A setter for the new initial value, if any. */
  setInitial?: (target: string) => unknown;
  /** The scale of the text size to use. 100 uses default text values */
  textScale?: number;
}
