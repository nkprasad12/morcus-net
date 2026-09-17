/**
 * @jest-environment jsdom
 */
import { storage } from "@/web/v2/core/storage.client";

describe("storage client utility", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.restoreAllMocks();
  });

  describe("string operations", () => {
    it("gets null when key does not exist", () => {
      expect(storage.get("unknown_key")).toBeNull();
    });

    it("sets and gets string values", () => {
      storage.set("my_key", "hello");
      expect(storage.get("my_key")).toBe("hello");
      expect(localStorage.getItem("my_key")).toBe("hello");
    });

    it("removes keys", () => {
      storage.set("my_key", "hello");
      storage.remove("my_key");
      expect(storage.get("my_key")).toBeNull();
      expect(localStorage.getItem("my_key")).toBeNull();
    });

    it("catches and ignores localStorage exceptions on get/set/remove", () => {
      jest.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new DOMException("Access denied", "SecurityError");
      });
      jest.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("Quota exceeded", "QuotaExceededError");
      });
      jest.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
        throw new DOMException("Access denied", "SecurityError");
      });

      expect(storage.get("my_key")).toBeNull();
      expect(() => storage.set("my_key", "val")).not.toThrow();
      expect(() => storage.remove("my_key")).not.toThrow();
    });
  });

  describe("boolean operations", () => {
    it("returns default value when key is unset", () => {
      expect(storage.getBoolean("unset_flag")).toBe(false);
      expect(storage.getBoolean("unset_flag", true)).toBe(true);
      expect(storage.getBoolean("unset_flag", false)).toBe(false);
    });

    it("reads 'true' and 'false' strings correctly", () => {
      localStorage.setItem("flag_true", "true");
      localStorage.setItem("flag_false", "false");

      expect(storage.getBoolean("flag_true")).toBe(true);
      expect(storage.getBoolean("flag_false")).toBe(false);
      expect(storage.getBoolean("flag_false", true)).toBe(false);
    });

    it("reads V1 RPC JSON boolean envelopes correctly", () => {
      localStorage.setItem("v1_true", '{"w":true}');
      localStorage.setItem("v1_false", '{"w":false}');

      expect(storage.getBoolean("v1_true")).toBe(true);
      expect(storage.getBoolean("v1_false")).toBe(false);
    });

    it("falls back to defaultValue for non-boolean strings", () => {
      localStorage.setItem("bad_flag", "not-a-bool");
      expect(storage.getBoolean("bad_flag", true)).toBe(true);
      expect(storage.getBoolean("bad_flag", false)).toBe(false);
    });

    it("persists booleans as strings", () => {
      storage.setBoolean("flag", true);
      expect(localStorage.getItem("flag")).toBe("true");
      expect(storage.getBoolean("flag")).toBe(true);

      storage.setBoolean("flag", false);
      expect(localStorage.getItem("flag")).toBe("false");
      expect(storage.getBoolean("flag")).toBe(false);
    });
  });

  describe("JSON operations", () => {
    it("returns undefined when key is unset or empty", () => {
      expect(storage.getJson("unset_json")).toBeUndefined();
    });

    it("parses valid JSON", () => {
      localStorage.setItem(
        "valid_json",
        JSON.stringify({ name: "morcus", val: 42 })
      );
      expect(storage.getJson("valid_json")).toEqual({
        name: "morcus",
        val: 42,
      });
    });

    it("returns undefined on malformed JSON", () => {
      localStorage.setItem("bad_json", "{not-valid-json");
      expect(storage.getJson("bad_json")).toBeUndefined();
    });

    it("serializes and stores JSON objects", () => {
      storage.setJson("test_obj", { foo: "bar", count: 10 });
      expect(localStorage.getItem("test_obj")).toBe('{"foo":"bar","count":10}');
      expect(storage.getJson("test_obj")).toEqual({ foo: "bar", count: 10 });
    });

    it("removes key when value is undefined", () => {
      storage.set("test_key", "initial");
      storage.setJson("test_key", undefined);
      expect(storage.get("test_key")).toBeNull();
      expect(localStorage.getItem("test_key")).toBeNull();
    });
  });
});
