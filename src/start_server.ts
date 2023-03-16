/* istanbul ignore file */

import * as dotenv from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";

import { LewisAndShort } from "@/web/dicts/ls";
import { setupServer, WebServerParams } from "@/web/web_server";
import { SocketWorkServer } from "@/web/sockets/socket_workers";
import { WorkRequest } from "./web/workers/requests";
import { Workers } from "./web/workers/worker_types";
import { randomInt } from "crypto";

dotenv.config();

function log(message: string) {
  console.log(`[start_server] ${message}`);
}

const host = "localhost";
const port = parseInt(process.env.PORT!);

const app = express();
const server = http.createServer(app);

// Macronizer
const workServer = new SocketWorkServer(new Server(server));

// Lewis and Short
const lewisAndShort = LewisAndShort.create(process.env.LS_PATH);

const params: WebServerParams = {
  app: app,
  macronizer: async (input: string) => {
    const request: WorkRequest<string> = {
      category: Workers.MACRONIZER,
      id: `${randomInt(1000000)}`,
      content: input,
    };
    const result = await workServer.process(request);
    return result.content;
  },
  lsDict: (input) => lewisAndShort.getEntry(input),
};

setupServer(params);

server.listen(port, () => {
  log(`Local server: http://${host}:${port}`);
});
