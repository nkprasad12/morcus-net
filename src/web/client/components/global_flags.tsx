import React from "react";
import { PropsWithChildren, createContext } from "react";
import { defaultExperimentalMode } from "@/web/client/define_vars";

const SETTINGS_STORAGE_KEY = "GlobalSettings";

export const DEFAULT_HIGHLIGHT_STRENGTH = 50;

export interface GlobalSettings {
  experimentalMode?: boolean;
  highlightStrength?: number;
}

function toGlobalSettings(input: unknown): GlobalSettings {
  if (typeof input !== "object" || input === null) {
    return {};
  }
  return input;
}

export interface DataAndSetter<T> {
  data: T;
  setData: (newData: T) => any;
}

const FALLBACK: DataAndSetter<GlobalSettings> = {
  data: {},
  setData: () => {},
};

export const GlobalSettingsContext: React.Context<
  DataAndSetter<GlobalSettings>
> = createContext(FALLBACK);

export function getGlobalSettings(): GlobalSettings {
  const storageSetting = localStorage.getItem(SETTINGS_STORAGE_KEY);
  return storageSetting !== null
    ? toGlobalSettings(JSON.parse(storageSetting))
    : {
        experimentalMode: defaultExperimentalMode(),
        highlightStrength: DEFAULT_HIGHLIGHT_STRENGTH,
      };
}

export function SettingsHandler(props: PropsWithChildren<Record<string, any>>) {
  const [settings, setSettings] = React.useState<GlobalSettings>(
    getGlobalSettings()
  );

  return (
    <GlobalSettingsContext.Provider
      value={{
        data: { ...settings },
        setData: (newSettings) => {
          localStorage.setItem(
            SETTINGS_STORAGE_KEY,
            JSON.stringify(newSettings)
          );
          setSettings(newSettings);
        },
      }}
    >
      {props.children}
    </GlobalSettingsContext.Provider>
  );
}
