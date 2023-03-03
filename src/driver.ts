/* istanbul ignore file */

import express from "express";
import http from "http";

import * as dotenv from "dotenv";

import { createProcessorConnection } from "@/web/processor_connection";
import { startServer, WebServerParams } from "@/web/web_server";

dotenv.config();

const app = express();
const server = http.createServer(app);
const processorConnection = createProcessorConnection(server);

const params: WebServerParams = {
  app: app,
  server: server,
  macronizer: processorConnection.process,
};

startServer(params);
