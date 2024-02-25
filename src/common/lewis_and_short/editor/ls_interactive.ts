/* istanbul ignore file */

import { LS_PATH } from "@/common/lewis_and_short/ls_scripts";
import { LsRewriters } from "@/common/lewis_and_short/ls_write";
import { XmlNode } from "@/common/xml/xml_node";
import fastify, { FastifyReply as Response } from "fastify";
import path from "path";
import fastifyStatic from "@fastify/static";
import { checkPresent } from "@/common/assert";
import { parseXmlStrings } from "@/common/xml/xml_utils";
import { XmlNodeSerialization } from "@/common/xml/xml_node_serialization";

export async function editLs(
  displayFilter: (root: XmlNode) => boolean,
  edit: (root: XmlNode) => Promise<XmlNode>
) {
  await LsRewriters.transformEntries(LS_PATH, async (root) => {
    if (!displayFilter(root)) {
      return root;
    }
    console.log("Awaiting edited article.");
    return await edit(root);
  });
}

export async function startInteractiveEditor() {
  const port = parseInt(checkPresent(process.env.PORT));
  const app = fastify();

  let pendingResolve: undefined | ((root: XmlNode) => any) = undefined;
  let pendingResponse: undefined | Response;
  let editLsPromise: undefined | Promise<void>;

  await app.register(fastifyStatic, {
    root: path.resolve("./genfiles_static"),
  });
  app.post("/respond", (req, res) => {
    console.log("Get browser message");
    pendingResponse = res;
    if (pendingResolve !== undefined) {
      // @ts-ignore
      pendingResolve(parseXmlStrings([req.body])[0]);
    }
    if (editLsPromise === undefined) {
      console.log("Starting LS edit");
      editLsPromise = editLs(
        (root) => root.getAttr("key") === "mingo",
        async (root) => {
          if (pendingResponse !== undefined) {
            console.log("Sending next article to edit");
            pendingResponse.send(XmlNodeSerialization.DEFAULT.serialize(root));
          }
          return new Promise((resolve) => {
            pendingResolve = resolve;
          });
        }
      ).then(() => {
        console.log("Saved edited LS.");
        if (pendingResponse !== undefined) {
          pendingResponse.send("All done!");
          app.close();
        }
      });
    }
  });

  await app.listen({ port });
  console.log(
    `Interactive editor running! Go to http://localhost:${port}/ls_editor_index.html`
  );
}

startInteractiveEditor();
