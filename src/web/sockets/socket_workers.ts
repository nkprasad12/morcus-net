import crypto from "crypto";

import { Message, WorkProcessor } from "@/web/workers/requests";
import { io } from "socket.io-client";
import { checkPresent } from "@/common/assert";

function log(channel: string, message: string) {
  console.debug(`[socket_workers] [${channel}] ${message}`);
}

export async function startRemoteWorker(
  processor: WorkProcessor<string, string>,
  uuid: number = crypto.randomInt(1000000)
): Promise<void> {
  await processor.setup();
  const address = checkPresent(process.env.SOCKET_ADDRESS);

  const workerType = processor.category;
  const tag = `${workerType}.${uuid}`;
  const inputChannel = `${tag}.INPUT`;
  const outputChannel = `${tag}.OUTPUT`;

  log(tag, `${workerType} attempting to connect to ${address}`);
  const socket = io(address, {
    auth: {
      token: process.env.PROCESSING_SERVER_TOKEN,
      workerType: workerType,
      inputChannel: inputChannel,
      outputChannel: outputChannel,
    },
  });

  socket.on("connect", () => {
    log(tag, `${tag} connected to web server.`);
  });

  socket.on(inputChannel, async (message: Message<string>) => {
    log(tag, `Received request ${message.id}`);
    const startTime = performance.now();
    const output: Message<string> = {
      id: message.id,
      content: await processor.process(message),
    };
    const elapsedTime = performance.now() - startTime;
    log(
      tag,
      `Request ${message.id} processing took ${elapsedTime.toFixed(2)} ms`
    );
    socket.emit(outputChannel, output);
  });

  socket.on("disconnect", () => {
    log(tag, `${tag} disconnected from web server.`);
    if (process.env.KEEP_WORKERS_ON_DISCONNECT === "true") {
      return;
    }
    processor.teardown();
    socket.close();
  });
}
