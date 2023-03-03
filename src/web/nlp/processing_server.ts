import { io } from "socket.io-client";
import {
  PROCESSED_OUTPUT_CHANNEL,
  ProcessingMessage,
  RAW_INPUT_CHANNEL,
} from "@/web/nlp/types";
import { nlpProcessor } from "./processor";

async function start() {
  const processor = await nlpProcessor()
  const socket = io("http://localhost:8000", {
    auth: {
      token: "abc"
    }
  });

  socket.on("connection", () => {
    console.log("Connected to web server.");
  });
  
  socket.on("disconnect", () => {
    console.log("Disconnected from web server.");
    processor.close()
    socket.close()
  });
  
  socket.on(RAW_INPUT_CHANNEL, async (message: ProcessingMessage) => {
    console.log('Received request %d', message.id);
    const output: ProcessingMessage = {
      id: message.id,
      content: await processor.process(message.content),
    };
    socket.emit(PROCESSED_OUTPUT_CHANNEL, output);
  });
}

start()
