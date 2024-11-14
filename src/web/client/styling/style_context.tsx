/* istanbul ignore file */

import {
  DEFAULT_HIGHLIGHT_STRENGTH,
  GlobalSettingsContext,
} from "@/web/client/components/global_flags";
import { usePersistedState } from "@/web/client/utils/hooks/persisted_state";
import React from "react";

export interface ReaderStyleConfigSetter {
  setReaderMainScale: (x: number) => unknown;
  setReaderSideScale: (x: number) => unknown;
}

export interface ReaderStyleConfig {
  readerMainScale: number;
  readerSideScale: number;
}

export interface DictStyleConfig {
  dictHighlightScale: number;
}

export interface GlobalStyleConfig {
  darkMode: boolean;
  fontFamily?: string;
}

export type StyleConfig = ReaderStyleConfigSetter &
  ReaderStyleConfig &
  DictStyleConfig &
  GlobalStyleConfig;

export const DEFAULT_STYLE_CONFIG: StyleConfig = {
  darkMode: false,
  dictHighlightScale: 1,
  readerMainScale: 100,
  readerSideScale: 100,
  setReaderMainScale: () => {},
  setReaderSideScale: () => {},
};

export const StyleContext = React.createContext(DEFAULT_STYLE_CONFIG);

export function TestStyleContextProvider(
  props: React.PropsWithChildren<Partial<StyleConfig>>
) {
  return (
    <StyleContext.Provider value={{ ...DEFAULT_STYLE_CONFIG, ...props }}>
      {props.children}
    </StyleContext.Provider>
  );
}

export function StyleContextProvider(props: React.PropsWithChildren) {
  const globalSettings = React.useContext(GlobalSettingsContext);
  const [readerMainScale, setReaderMainScale] = usePersistedState<number>(
    100,
    "RD_WORK_SCALE"
  );
  const [readerSideScale, setReaderSideScale] = usePersistedState<number>(
    90,
    "RD_DICT_SCALE"
  );

  return (
    <StyleContext.Provider
      value={{
        darkMode: globalSettings.data.darkMode === true,
        dictHighlightScale:
          (globalSettings.data.highlightStrength ||
            DEFAULT_HIGHLIGHT_STRENGTH) / DEFAULT_HIGHLIGHT_STRENGTH,
        readerMainScale,
        readerSideScale,
        setReaderMainScale,
        setReaderSideScale,
        fontFamily: globalSettings.data.fontFamily,
      }}>
      {props.children}
    </StyleContext.Provider>
  );
}
