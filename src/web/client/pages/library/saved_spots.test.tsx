/**
 * @jest-environment jsdom
 */

import { LibrarySavedSpot } from "@/web/client/pages/library/saved_spots";

describe("LibrarySaveSpot", () => {
  test("get on initial to return undefined", () => {
    expect(LibrarySavedSpot.get("foo.bar")).toBe(undefined);
  });

  test("get on after write returns expected", () => {
    LibrarySavedSpot.set("foo.bar", "7");
    expect(LibrarySavedSpot.get("foo.bar")).toBe("7");
  });

  test("get on after write with multiple keys and writes", () => {
    LibrarySavedSpot.set("foo.bar", "7");
    LibrarySavedSpot.set("bar.baz", "7");
    LibrarySavedSpot.set("foo.bar", "8");

    expect(LibrarySavedSpot.get("foo.bar")).toBe("8");
    expect(LibrarySavedSpot.get("bar.baz")).toBe("7");
    expect(LibrarySavedSpot.getAll()).toStrictEqual({
      "foo.bar": { sectionId: "8" },
      "bar.baz": { sectionId: "7" },
    });
  });
});
