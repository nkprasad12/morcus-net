/**
 * @jest-environment jsdom
 */

import { useContext, useEffect } from "react";
import {
  DataAndSetter,
  GlobalSettings,
  GlobalSettingsContext,
  SettingsHandler,
} from "@/web/client/components/global_flags";
import { act, render } from "@testing-library/react";

interface Box<T> {
  get: T | undefined;
}

function setupHandler(): Box<DataAndSetter<GlobalSettings>> {
  const result: Box<DataAndSetter<GlobalSettings>> = { get: undefined };

  function TestApp() {
    const settings = useContext(GlobalSettingsContext);
    useEffect(() => {
      result.get = settings;
    }, [settings]);
    return <></>;
  }

  render(
    <SettingsHandler>
      <TestApp />
    </SettingsHandler>
  );

  return result;
}

describe("GlobalSettingsContext", () => {
  it("defaults to define variable without storage", () => {
    const settings = setupHandler();

    expect(settings.get).toBeDefined();
    expect(settings.get?.data.experimentalMode).toBe(false);
  });

  it("handles case with malformed storage", () => {
    localStorage.setItem("GlobalSettings", "true");

    const settings = setupHandler();

    expect(settings.get).toBeDefined();
    expect(settings.get?.data.experimentalMode).toBe(undefined);
  });

  it("handles case with valid storage", () => {
    const defaultValue: GlobalSettings = {
      experimentalMode: true,
    };
    localStorage.setItem("GlobalSettings", JSON.stringify(defaultValue));

    const settings = setupHandler();

    expect(settings.get).toBeDefined();
    expect(settings.get?.data.experimentalMode).toBe(true);
  });

  it("updates on settings modification", () => {
    const defaultValue: GlobalSettings = {
      experimentalMode: true,
    };
    localStorage.setItem("GlobalSettings", JSON.stringify(defaultValue));

    const settings = setupHandler();
    act(() => {
      settings.get?.setData({ experimentalMode: false });
    });

    expect(settings.get).toBeDefined();
    expect(settings.get?.data.experimentalMode).toBe(false);
    expect(localStorage.getItem("GlobalSettings")).toBe(
      JSON.stringify({ experimentalMode: false })
    );
  });

  it("updates keys on merged settings modification with overlapping keys", () => {
    const defaultValue: GlobalSettings = {
      experimentalMode: true,
      embeddedInflectedSearch: true,
    };
    localStorage.setItem("GlobalSettings", JSON.stringify(defaultValue));

    const settings = setupHandler();
    act(() => {
      settings.get?.mergeData({ experimentalMode: false });
    });

    expect(settings.get).toBeDefined();
    expect(settings.get?.data.experimentalMode).toBe(false);
    expect(settings.get?.data.embeddedInflectedSearch).toBe(true);
    expect(localStorage.getItem("GlobalSettings")).toBe(
      JSON.stringify({ experimentalMode: false, embeddedInflectedSearch: true })
    );
  });

  it("updates keys on merged settings modification with non-overlapping keys", () => {
    const defaultValue: GlobalSettings = {
      highlightStrength: 50,
      embeddedInflectedSearch: true,
    };
    localStorage.setItem("GlobalSettings", JSON.stringify(defaultValue));

    const settings = setupHandler();
    act(() => {
      settings.get?.mergeData({ experimentalMode: false });
    });

    expect(settings.get).toBeDefined();
    expect(settings.get?.data.experimentalMode).toBe(false);
    expect(settings.get?.data.highlightStrength).toBe(50);
    expect(settings.get?.data.embeddedInflectedSearch).toBe(true);
    expect(localStorage.getItem("GlobalSettings")).toBe(
      JSON.stringify({
        highlightStrength: 50,
        embeddedInflectedSearch: true,
        experimentalMode: false,
      })
    );
  });

  it("auto-sets embedded inflection to true if unspecified", () => {
    const defaultValue: GlobalSettings = {
      inflectedSearch: true,
    };
    localStorage.setItem("GlobalSettings", JSON.stringify(defaultValue));

    const settings = setupHandler();

    expect(settings.get).toBeDefined();
    expect(settings.get?.data).toStrictEqual<GlobalSettings>({
      inflectedSearch: true,
      embeddedInflectedSearch: true,
    });
  });

  it("respectes embedded inflection value if specified", () => {
    const defaultValue: GlobalSettings = {
      inflectedSearch: true,
      embeddedInflectedSearch: false,
    };
    localStorage.setItem("GlobalSettings", JSON.stringify(defaultValue));

    const settings = setupHandler();

    expect(settings.get).toBeDefined();
    expect(settings.get?.data).toStrictEqual<GlobalSettings>({
      inflectedSearch: true,
      embeddedInflectedSearch: false,
    });
  });
});
