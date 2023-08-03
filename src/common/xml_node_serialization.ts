import { XmlNode } from "@/common/xml_node";
import { Serialization, instanceOf } from "@/web/utils/rpc/parsing";
import { parseEntries } from "./lewis_and_short/ls_xml_utils";

export namespace XmlNodeSerialization {
  export const DEFAULT: Serialization<XmlNode> = {
    name: "XmlNode",
    validator: instanceOf(XmlNode),
    serialize: (t) => t.toString(),
    deserialize: (t) => parseEntries([t])[0],
  };
}
