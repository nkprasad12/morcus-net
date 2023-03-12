/* istanbul ignore file */

import * as dotenv from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";

import { LewisAndShort } from "@/web/dicts/ls";
import { createProcessorConnection } from "@/web/processor_connection";
import { setupServer, WebServerParams } from "@/web/web_server";

dotenv.config();

function log(message: string) {
  console.log(`[start_server] ${message}`);
}

const host = "localhost";
const port = parseInt(process.env.PORT!);

const app = express();
const server = http.createServer(app);

// Macronizer
const socketIo = new Server(server);
const processorConnection = createProcessorConnection(socketIo);

// Lewis and Short
const lewisAndShort = LewisAndShort.create(process.env.LS_PATH);

const params: WebServerParams = {
  app: app,
  macronizer: processorConnection.process,
  lsDict: (input) => lewisAndShort.getEntry(input),
};

setupServer(params);

server.listen(port, () => {
  log(`Local server: http://${host}:${port}`);
});
