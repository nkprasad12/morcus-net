import net from "net";
import cp from "child_process";

const PORT = 65432;
const ON_LISTEN = "NLP_SERVER:LISTEN";
const SERVER_ARGS = ["main.py", "--server", `${PORT}`, ON_LISTEN];

function log(message: string) {
  console.log(`[NLP Processor] ${message}`);
}

async function startNlpServer(): Promise<net.Socket> {
  const process = cp.spawn("python", SERVER_ARGS);
  const serverReady = new Promise<void>((resolve) => {
    log("Waiting for Python NLP Server to start.");
    const readyCallback = (data: string) => {
      log(data.toString().trimEnd());
      if (data.includes(ON_LISTEN)) {
        log("Python NLP Server listening.");
        resolve();
      }
    };
    process.stderr.on("data", readyCallback);
  });
  await serverReady;
  const client = new net.Socket();
  return new Promise((resolve) => {
    log("Trying to connect to Python NLP server.");
    client.connect(PORT, "127.0.0.1", () => {
      log(`Connected to Python NLP server.`);
      resolve(client);
    });
  });
}

class NlpProcesser {
  private currentResolver: undefined | ((data: string) => any) = undefined;
  private queue: [string, (data: string) => any][] = [];

  constructor(private readonly client: net.Socket) {
    const callback = (data: string) => {
      log(`Received data from Python`);
      if (this.currentResolver !== undefined) {
        this.currentResolver(data.toString());
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
    return new Promise((resolve) => {
      log("Recieved processing request");
      if (this.currentResolver === undefined) {
        this.currentResolver = resolve;
        this.client.write(input);
      } else {
        log("Adding to queue");
        this.queue.push([input, resolve]);
      }
    });
  }
}

export async function nlpProcessor(): Promise<NlpProcesser> {
  const client = await startNlpServer();
  return new NlpProcesser(client);
}
