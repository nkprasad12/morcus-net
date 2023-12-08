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
});
