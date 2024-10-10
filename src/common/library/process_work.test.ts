import type { DocumentInfo } from "@/common/library/library_types";
import {
  processTei,
  type DebugSideChannel,
} from "@/common/library/process_work";
import type { TeiCtsDocument } from "@/common/xml/tei_utils";
import { XmlNode } from "@/common/xml/xml_node";

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

    const withSideChannel = processTei(SIMPLE_TEI_CTS, sideChannel);
    const withoutSideChannel = processTei(SIMPLE_TEI_CTS);

    expect(withSideChannel).toStrictEqual(withoutSideChannel);
  });

  it("gets side channel callbacks", () => {
    const sideChannel: DebugSideChannel = { onWord: jest.fn() };

    processTei(SIMPLE_TEI_CTS, sideChannel);

    expect(sideChannel.onWord).toHaveBeenCalledWith("Gallia");
    expect(sideChannel.onWord).toHaveBeenCalledWith("est");
    expect(sideChannel.onWord).toHaveBeenCalledTimes(2);
  });
});
