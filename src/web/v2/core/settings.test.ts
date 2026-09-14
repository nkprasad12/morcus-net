/**
 * @jest-environment jsdom
 */
import {
  GLOBAL_SETTINGS_KEY,
  parseSettings,
  pickValid,
  settingsStore,
} from "@/web/v2/core/settings.client";
import { isBoolean, isNumber } from "@/web/utils/rpc/parsing";

interface TestSettings {
  darkMode?: boolean;
  highlightStrength?: number;
}

describe("pickValid", () => {
  const checkers = {
    darkMode: isBoolean,
    highlightStrength: isNumber,
  };

  it("returns an empty object for null, undefined, and non-object inputs", () => {
    expect(pickValid(null, checkers)).toEqual({});
    expect(pickValid(undefined, checkers)).toEqual({});
    expect(pickValid("string", checkers)).toEqual({});
    expect(pickValid(123, checkers)).toEqual({});
    expect(pickValid(true, checkers)).toEqual({});
    expect(pickValid([1, 2, 3], checkers)).toEqual({});
  });

  it("extracts and validates matching fields", () => {
    const raw = {
      darkMode: true,
      highlightStrength: 80,
    };
    expect(pickValid(raw, checkers)).toEqual({
      darkMode: true,
      highlightStrength: 80,
    });
  });

  it("preserves valid falsy values such as false and 0", () => {
    const raw = {
      darkMode: false,
      highlightStrength: 0,
    };
    expect(pickValid(raw, checkers)).toEqual({
      darkMode: false,
      highlightStrength: 0,
    });
  });

  it("drops fields that fail their validator", () => {
    const raw = {
      darkMode: "true", // invalid type
      highlightStrength: 60,
    };
    expect(pickValid(raw, checkers)).toEqual({
      highlightStrength: 60,
    });
  });

  it("ignores extra unknown fields in input", () => {
    const raw = {
      darkMode: true,
      unknownProperty: "discard me",
      randomCount: 99,
    };
    expect(pickValid(raw, checkers)).toEqual({
      darkMode: true,
    });
  });

  it("omits undefined properties so object spreads do not overwrite defaults", () => {
    const defaults = { darkMode: true, highlightStrength: 50 };
    const raw = { highlightStrength: 90 };
    const validPartial = pickValid<TestSettings>(raw, checkers);

    expect(Object.prototype.hasOwnProperty.call(validPartial, "darkMode")).toBe(
      false
    );
    expect({ ...defaults, ...validPartial }).toEqual({
      darkMode: true,
      highlightStrength: 90,
    });
  });
});

describe("parseSettings", () => {
  it("returns empty object on null, empty string, or malformed JSON", () => {
    expect(parseSettings(null)).toEqual({});
    expect(parseSettings("")).toEqual({});
    expect(parseSettings("not valid json{")).toEqual({});
  });

  it("returns empty object on primitive JSON or arrays", () => {
    expect(parseSettings("42")).toEqual({});
    expect(parseSettings('"a string"')).toEqual({});
    expect(parseSettings("[1, 2]")).toEqual({});
  });

  it("correctly parses valid GlobalSettings JSON", () => {
    const json = JSON.stringify({
      darkMode: true,
      highlightStrength: 75,
      autoOpenLogeion: false,
      inflectedSearch: true,
    });
    expect(parseSettings(json)).toEqual({
      darkMode: true,
      highlightStrength: 75,
      autoOpenLogeion: false,
      inflectedSearch: true,
    });
  });

  it("tolerates partial and corrupted fields, preserving only valid ones", () => {
    const json = JSON.stringify({
      darkMode: "corrupt_string",
      highlightStrength: 30,
      autoOpenLogeion: null,
      inflectedSearch: false,
      extraneous: "drop_me",
    });
    expect(parseSettings(json)).toEqual({
      highlightStrength: 30,
      inflectedSearch: false,
    });
  });
});

describe("settingsStore", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns empty settings when localStorage is empty", () => {
    expect(settingsStore.get()).toEqual({});
  });

  it("reads and parses valid settings from localStorage", () => {
    localStorage.setItem(
      GLOBAL_SETTINGS_KEY,
      JSON.stringify({ darkMode: true, highlightStrength: 85 })
    );
    expect(settingsStore.get()).toEqual({
      darkMode: true,
      highlightStrength: 85,
    });
  });

  it("updates and merges settings in localStorage", () => {
    settingsStore.update({ darkMode: true });
    expect(settingsStore.get()).toEqual({ darkMode: true });

    settingsStore.update({ highlightStrength: 40 });
    expect(settingsStore.get()).toEqual({
      darkMode: true,
      highlightStrength: 40,
    });
  });
});
