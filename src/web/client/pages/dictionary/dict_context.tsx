import type { LatinDictInfo } from "@/common/dictionaries/latin_dicts";
import type { DictionaryMobileLayoutType } from "@/web/client/components/global_flags";
import type { DictRoute } from "@/web/client/pages/dictionary/dictionary_routing";
import React from "react";

const DEFAULT_DICT_OPTIONS: DictContextOptions = {
  isEmbedded: false,
  isSmall: false,
  scale: 1,
  dictsToUse: [],
  setDictsToUse: () => {},
  scrollTopRef: React.createRef(),
  onSearchQuery: () => {},
};

export type OnSearchQuery = (
  query: string,
  options?: Pick<DictRoute, "dicts" | "inflectedSearch" | "lang">
) => unknown;

export interface DictContextOptions {
  isEmbedded: boolean;
  embeddedOptions?: EmbeddedDictOptions;
  isSmall: boolean;
  scale: number;
  dictsToUse: LatinDictInfo[];
  setDictsToUse: (dicts: LatinDictInfo[]) => unknown;
  scrollTopRef: React.RefObject<HTMLDivElement>;
  fromInternalLink?: React.MutableRefObject<boolean>;
  searchQuery?: string;
  onSearchQuery: OnSearchQuery;
  mobileLayout?: DictionaryMobileLayoutType;
}

export const DictContext: React.Context<DictContextOptions> =
  React.createContext(DEFAULT_DICT_OPTIONS);

export interface EmbeddedDictOptions {
  hideableOutline?: boolean;
  hideSearch?: boolean;
  skipJumpToResult?: boolean;
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
