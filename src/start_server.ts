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
  console.log(`[Driver] ${message}`);
}

const host = "localhost";
const port = 8000;

const app = express();
const server = http.createServer(app);

// Macronizer
const socketIo = new Server(server);
const processorConnection = createProcessorConnection(socketIo);

// Lewis and Short
const lewisAndShort = LewisAndShort.create();

const params: WebServerParams = {
  app: app,
  macronizer: processorConnection.process,
  lsDict: (input) => lewisAndShort.getEntry(input),
};

setupServer(params);

server.listen(port, host, () => {
  log(`Server is running on http://${host}:${port}`);
});
