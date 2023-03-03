import * as dotenv from "dotenv";
import { io } from "socket.io-client";
import {
  PROCESSED_OUTPUT_CHANNEL,
  ProcessingMessage,
  RAW_INPUT_CHANNEL,
} from "@/web/nlp/types";
import { nlpProcessor } from "./processor";

function log(message: string) {
  console.log(`[Processing Server] ${message}`);
}

async function start() {
  const processor = await nlpProcessor();
  const socket = io("http://localhost:8000", {
    auth: {
      token: process.env.PROCESSING_SERVER_TOKEN,
    },
  });

  socket.on("connection", () => {
    log("Connected to web server.");
  });

  socket.on("disconnect", () => {
    log("Disconnected from web server.");
    processor.close();
    socket.close();
  });

  socket.on(RAW_INPUT_CHANNEL, async (message: ProcessingMessage) => {
    log(`Received request ${message.id}`);
    const output: ProcessingMessage = {
      id: message.id,
      content: await processor.process(message.content),
    };
    socket.emit(PROCESSED_OUTPUT_CHANNEL, output);
  });
}

dotenv.config();
start();
