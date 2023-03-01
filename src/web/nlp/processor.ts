import net from "net";
import cp from "child_process";

const PORT = 65432;
const ON_LISTEN = "NLP_SERVER:LISTEN";
const SERVER_ARGS = ["main.py", "--server", `${PORT}`, ON_LISTEN];

async function startNlpServer(): Promise<net.Socket> {
  const process = cp.spawn("python", SERVER_ARGS);
  const serverReady = new Promise<void>((resolve) => {
    console.log("Waiting for NLP Server to start.");
    const readyCallback = (data: string) => {
      console.log(data.toString().trimEnd());
      if (data.includes(ON_LISTEN)) {
        console.log("NLP Server listening.");
        resolve();
      }
    };
    process.stderr.on("data", readyCallback);
  });
  await serverReady;
  const client = new net.Socket();
  return new Promise((resolve) => {
    console.log("Trying to connect to NLP server.");
    client.connect(PORT, "127.0.0.1", () => {
      console.log(`Connected to NLP server.`);
      resolve(client);
    });
  });
}

class NlpProcesser {
  private currentResolver: undefined | ((data: string) => any) = undefined;
  private queue: [string, (data: string) => any][] = [];

  constructor(private readonly client: net.Socket) {
    const callback = (data: string) => {
      console.log(`Received data`);
      if (this.currentResolver !== undefined) {
        this.currentResolver(data.toString());
      } else {
        console.log(`ERROR: No resolver for response.`);
      }
      const next = this.queue.shift();
      if (next === undefined) {
        return;
      }
      this.currentResolver = next[1];
      this.client.write(next[0]);
    };
    this.client.on("data", callback);
  }

  close(): Promise<void> {
    return new Promise((resolve) => {
      console.log("Closing connected to NLP server");
      this.client.on("close", () => {
        console.log("Connection to NLP server closed");
        resolve();
      });
      this.client.destroy();
    });
  }

  async process(input: string): Promise<string> {
    return new Promise((resolve) => {
      if (this.currentResolver === undefined) {
        this.currentResolver = resolve;
        this.client.write(input);
      } else {
        this.queue.push([input, resolve]);
      }
    });
  }
}

async function test() {
  const client = await startNlpServer();
  const processor = new NlpProcesser(client);
  const message = "Dixit, 'me optimum esse'.";
  const responses = [];
  for (let i = 0; i < 10; i++) {
    responses.push(processor.process(`${i} ${message}`));
  }

  try {
    for (const response of responses) {
      console.log(await response);
    }
  } finally {
    await processor.close();
  }
}

test();
