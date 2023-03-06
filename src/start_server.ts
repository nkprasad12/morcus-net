/* istanbul ignore file */

import * as dotenv from "dotenv";
import express from "express";
import http from "http";
import { Server } from "socket.io";

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
const socketIo = new Server(server);
const processorConnection = createProcessorConnection(socketIo);

const params: WebServerParams = {
  app: app,
  macronizer: processorConnection.process,
};

setupServer(params);

server.listen(port, host, () => {
  log(`Server is running on http://${host}:${port}`);
});
