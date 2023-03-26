/* istanbul ignore file */

import * as dotenv from "dotenv";
import cp from "child_process";
import net from "net";
import nodeCleanup from "node-cleanup";

import { Message, WorkProcessor } from "@/web/workers/requests";
import { Workers } from "@/web/workers/worker_types";
import { startRemoteWorker } from "@/web/sockets/socket_workers";

const ON_LISTEN = "NLP_SERVER:LISTEN";
const SERVER_ARGS = ["main.py", "--server", ON_LISTEN];

function log(message: string) {
  console.log(`[macronizer_processor] ${message}`);
}

async function startNlpServer(): Promise<net.Socket> {
  const serverArgs = SERVER_ARGS.map((x) => x);
  if (process.env.ALLOW_WORKERS_GPU === "true") {
    serverArgs.push("--gpu");
  }
  const tcpProcess = cp.spawn("python", serverArgs);
  nodeCleanup((_exitCode, _signal) => {
    log("Cleaning up Python TCP server");
    tcpProcess.kill();
  });

  const serverListening = new Promise<number>((resolve) => {
    log("Waiting for Python NLP Server to start.");
    const readyCallback = (data: string) => {
      log(data.toString().trimEnd());
      const matches = data.toString().match(`${ON_LISTEN} (\\d+)`);
      if (matches !== null) {
        log("Python NLP Server listening.");
        resolve(+matches[1]);
      }
    };
    tcpProcess.stderr.on("data", readyCallback);
  });
  const port = await serverListening;
  const client = new net.Socket();
  return new Promise((resolve) => {
    log("Trying to connect to Python NLP server.");
    client.connect(port, "127.0.0.1", () => {
      log(`Connected to Python NLP server.`);
      resolve(client);
    });
  });
}

class NlpProcesser {
  private currentResolver: undefined | ((data: string) => any) = undefined;
  private queue: [string, (data: string) => any][] = [];

  constructor(private readonly client: net.Socket) {
    const callback = (data: Buffer) => {
      log(`Received data from Python`);
      if (this.currentResolver !== undefined) {
        this.currentResolver(data.toString("utf8"));
      } else {
        log(`ERROR: No resolver for response.`);
      }
      const next = this.queue.shift();
      if (next === undefined) {
        this.currentResolver = undefined;
        return;
      }
      this.currentResolver = next[1];
      this.client.write(next[0]);
    };
    this.client.on("data", callback);
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      log("Closing connection to Python NLP server");
      this.client.on("close", () => {
        log("Connection to Python NLP server closed");
        resolve();
      });
      this.client.destroy();
    });
  }

  async process(input: string): Promise<string> {
    if (input.length === 0) {
      return "";
    }
    return new Promise((resolve) => {
      log("Recieved processing request");
      if (this.currentResolver === undefined) {
        this.currentResolver = resolve;
        const inputBuffer = Buffer.from(input, "utf8");
        const size = inputBuffer.length;
        log(`Sending ${size}`);
        const sizeBuffer = Buffer.alloc(4);
        sizeBuffer.writeUint32BE(size);
        this.client.write(sizeBuffer);
        this.client.write(inputBuffer);
      } else {
        log("Adding to queue");
        this.queue.push([input, resolve]);
      }
    });
  }
}

async function nlpProcessor(): Promise<NlpProcesser> {
  const client = await startNlpServer();
  return new NlpProcesser(client);
}

class MacronizerProcessor implements WorkProcessor<string, string> {
  readonly category = Workers.MACRONIZER;
  private processor: NlpProcesser | undefined = undefined;

  async setup(): Promise<void> {
    this.processor = await nlpProcessor();
  }

  process(input: Message<string>): Promise<string> {
    return this.processor!.process(input.content);
  }

  teardown(): void {
    this.processor!.close();
  }
}

dotenv.config();
startRemoteWorker(new MacronizerProcessor());
