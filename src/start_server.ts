/* istanbul ignore file */

// To run the server with node on javascript directly, uncomment this line:
//```
// require("module-alias/register");
//```
// and install `module-alias`. Then, add
// "_moduleAliases": {
//   "@": "build"
// },
//  to the `package.json`. This current fucks with the jest config.
// Then, `npx tsc -p tsconfig.json` to build js, and
// `node build/start_server.js` to start the server.
// Based on local testing, this saves ~30-40 MB memory.

import 'dd-trace/init';
import * as dotenv from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";

import { setupServer, WebServerParams } from "@/web/web_server";
import { SocketWorkServer } from "@/web/sockets/socket_worker_server";
import { WorkRequest } from "./web/workers/requests";
import { Workers } from "./web/workers/worker_types";
import { randomInt } from "crypto";
import { checkPresent } from "./common/assert";
import { LewisAndShort } from "./common/lewis_and_short/ls";

dotenv.config();

function log(message: string) {
  console.log(`[start_server] ${message}`);
}

const host = "localhost";
const port = parseInt(checkPresent(process.env.PORT));

const app = express();
const server = http.createServer(app);

const lewisAndShort = LewisAndShort.create();
const workServer = new SocketWorkServer(new Server(server));

async function callWorker(
  category: Workers.Category,
  input: string
): Promise<string> {
  const request: WorkRequest<string> = {
    category: category,
    id: `${randomInt(1000000)}`,
    content: input,
  };
  const result = await workServer.process(request);
  return result.content;
}

const params: WebServerParams = {
  app: app,
  macronizer: (input) => callWorker(Workers.MACRONIZER, input),
  lsDict: async (input) => (await lewisAndShort).getEntry(input),
};

setupServer(params);

server.listen(port, () => {
  log(`Local server: http://${host}:${port}/`);
});
