import * as React from "react";
import { PropsWithChildren, createContext } from "react";

const SETTINGS_STORAGE_KEY = "GlobalSettings";

export const DEFAULT_HIGHLIGHT_STRENGTH = 40;

export interface GlobalBooleans {
  experimentalMode?: boolean;
  darkMode?: boolean;
}

export interface GlobalSettings extends GlobalBooleans {
  highlightStrength?: number;
  inflectedSearch?: boolean;
  embeddedInflectedSearch?: boolean;
  fontFamily?: string;
}

function toGlobalSettings(input: unknown): GlobalSettings {
  if (typeof input !== "object" || input === null) {
    return {};
  }
  const result: GlobalSettings = input;
  if (result.embeddedInflectedSearch === undefined) {
    result.embeddedInflectedSearch = true;
  }
  return input;
}

export interface DataAndSetter<T> {
  data: T;
  setData: (newData: T) => unknown;
  mergeData: (partial: Partial<T>) => unknown;
}

const FALLBACK: DataAndSetter<GlobalSettings> = {
  data: {},
  setData: () => {},
  mergeData: () => {},
};

export const GlobalSettingsContext: React.Context<
  DataAndSetter<GlobalSettings>
> = createContext(FALLBACK);

export function getGlobalSettings(): GlobalSettings {
  const storageSetting = localStorage.getItem(SETTINGS_STORAGE_KEY);
  return storageSetting !== null
    ? toGlobalSettings(JSON.parse(storageSetting))
    : {
        experimentalMode: false,
        highlightStrength: DEFAULT_HIGHLIGHT_STRENGTH,
        darkMode: false,
        embeddedInflectedSearch: true,
        inflectedSearch: true,
        fontFamily: "sans-serif",
      };
}

function storeGlobalSettings(settings: GlobalSettings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

export function SettingsHandler(props: PropsWithChildren<Record<string, any>>) {
  const [settings, setSettings] = React.useState<GlobalSettings>(
    getGlobalSettings()
  );

  const setData = React.useCallback((newSettings: GlobalSettings) => {
    storeGlobalSettings(newSettings);
    setSettings(newSettings);
  }, []);

  const mergeData = React.useCallback((partial: Partial<GlobalSettings>) => {
    setSettings((old) => {
      const merged = { ...old, ...partial };
      storeGlobalSettings(merged);
      return merged;
    });
  }, []);

  return (
    <GlobalSettingsContext.Provider
      value={{
        data: { ...settings },
        setData,
        mergeData,
      }}>
      {props.children}
    </GlobalSettingsContext.Provider>
  );
}
