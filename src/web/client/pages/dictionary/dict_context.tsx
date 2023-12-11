import React from "react";

const DEFAULT_DICT_OPTIONS: DictOptions = {
  isEmbedded: false,
  isSmall: false,
  scale: 1,
  textScale: 100,
};

export interface DictOptions {
  isEmbedded: boolean;
  isSmall: boolean;
  scale: number;
  textScale?: number;
}
export const DictContext: React.Context<DictOptions> =
  React.createContext(DEFAULT_DICT_OPTIONS);
