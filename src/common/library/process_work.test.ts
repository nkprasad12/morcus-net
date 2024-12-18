import type { LibraryPatch } from "@/common/library/library_patches";
import type { DocumentInfo } from "@/common/library/library_types";
import {
  patchText,
  processTei,
  type DebugSideChannel,
  type MarkupTextOptions,
} from "@/common/library/process_work";
import type { TeiCtsDocument } from "@/common/xml/tei_utils";
import { XmlNode } from "@/common/xml/xml_node";

console.debug = jest.fn();

const DBG_INFO: DocumentInfo = { title: "DBG", author: "Caesar" };
const GALLIA_EST = new XmlNode("p", [], ["Gallia est"]);
const SIMPLE_TEI_CTS: TeiCtsDocument = {
  info: DBG_INFO,
  textParts: ["book"],
  content: {
    id: ["1"],
    selfNode: new XmlNode("div", [], [GALLIA_EST]),
    children: [GALLIA_EST],
  },
};

describe("processTei", () => {
  it("gets same result with and without side channel", () => {
    const sideChannel: DebugSideChannel = { onWord: jest.fn() };

    const withSideChannel = processTei(SIMPLE_TEI_CTS, { sideChannel });
    const withoutSideChannel = processTei(SIMPLE_TEI_CTS);

    expect(withSideChannel).toStrictEqual(withoutSideChannel);
  });

  it("gets side channel callbacks", () => {
    const sideChannel: DebugSideChannel = { onWord: jest.fn() };

    processTei(SIMPLE_TEI_CTS, { sideChannel });

    expect(sideChannel.onWord).toHaveBeenCalledWith("Gallia");
    expect(sideChannel.onWord).toHaveBeenCalledWith("est");
    expect(sideChannel.onWord).toHaveBeenCalledTimes(2);
  });
});

describe("patchText", () => {
  function markupTextOptions(
    unhandled: LibraryPatch[],
    handled?: LibraryPatch[]
  ): MarkupTextOptions {
    return {
      unhandledPatches: new Set(unhandled),
      handledPatches: new Set(handled ?? []),
    };
  }

  function patchOf(target: string, replacement: string): LibraryPatch {
    return { target, replacement, location: [], reason: "" };
  }

  it("patches simplest path", () => {
    const fooToBar = patchOf("foo", "bar");
    const options = markupTextOptions([fooToBar]);
    const rawText = "hi foo";

    const patched = patchText(rawText, options);

    expect(patched).toBe("hi bar");
    expect(options.unhandledPatches?.size).toBe(0);
    expect(options.handledPatches?.size).toBe(1);
    expect(options.handledPatches).toContain(fooToBar);
  });

  it("patches multiple unhandled", () => {
    const fooToBar = patchOf("fooo", "bar");
    const bazToBar = patchOf("baz", "barr");
    const options = markupTextOptions([fooToBar, bazToBar]);
    const rawText = "hi fooobaz hi";

    const patched = patchText(rawText, options);

    expect(patched).toBe("hi barbarr hi");
    expect(options.unhandledPatches?.size).toBe(0);
    expect(options.handledPatches?.size).toBe(2);
    expect(options.handledPatches).toContain(fooToBar);
    expect(options.handledPatches).toContain(bazToBar);
  });

  it("throws on matching handled patches", () => {
    const fooToBar = patchOf("foo", "bar");
    const options = markupTextOptions([], [fooToBar]);
    const rawText = "hi foo";

    expect(() => patchText(rawText, options)).toThrow(/Duplicate match/);
  });

  it("throws on patch with multiple matches", () => {
    const fooToBar = patchOf("foo", "bar");
    const options = markupTextOptions([fooToBar]);
    const rawText = "hi foo hi foo";

    expect(() => patchText(rawText, options)).toThrow(/Doubly used/);
  });

  it("throws on overlapping patch", () => {
    const thatToThis = patchOf("that", "this");
    const options = markupTextOptions([thatToThis]);
    const rawText = "hi thathat hi";

    expect(() => patchText(rawText, options)).toThrow(/Overlapping/);
  });
});
