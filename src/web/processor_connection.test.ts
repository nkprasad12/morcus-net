import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { io } from "socket.io-client";
import {
  PROCESSED_OUTPUT_CHANNEL,
  ProcessingMessage,
  RAW_INPUT_CHANNEL,
} from "./nlp/types";
import {
  createProcessorConnection,
  ProcessorConnection,
} from "./processor_connection";

const PORT = 5435;

describe("Processor Connection", () => {
  let httpServer: HttpServer;
  let server: Server;
  let processor: ProcessorConnection;
  let client: Socket;

  beforeEach(async () => {
    httpServer = new HttpServer();
    process.env.PROCESSING_SERVER_TOKEN = "token";
    server = new Server(httpServer);
    processor = createProcessorConnection(server);
    const listening = new Promise<void>((resolve) => {
      httpServer.listen(PORT, "localhost", () => {
        resolve();
      });
    });
    await listening;
  });

  afterEach((done) => {
    if (server) {
      server.close();
    }
    if (client) {
      client.disconnect(true);
    }
    httpServer.close(() => {
      done();
    });
  });

  test("returns error before connected.", async () => {
    const message = await processor.process("Gallia");
    expect(message).toContain("not available");
  });

  test("rejects unauthenticated connections", (done) => {
    // @ts-ignore
    client = io(`http://localhost:${PORT}`);

    client.on("connect_error", () => {
      done();
    });
  });

  test("rejects invalid connections", (done) => {
    // @ts-ignore
    client = io(`http://localhost:${PORT}`, { auth: { token: "token1" } });
    client.on("connect_error", () => {
      done();
    });
  });

  test("accepts valid connections", (done) => {
    // @ts-ignore
    client = io(`http://localhost:${PORT}`, { auth: { token: "token" } });
    server.on("connection", () => {
      done();
    });
  });

  test("forwards processed result", async () => {
    // @ts-ignore
    client = io(`http://localhost:${PORT}`, { auth: { token: "token" } });
    client.on(RAW_INPUT_CHANNEL, (message: ProcessingMessage) => {
      client.emit(PROCESSED_OUTPUT_CHANNEL, {
        id: message.id,
        content: message.content + "P",
      });
    });
    await new Promise<void>((resolve) => {
      server.on("connection", () => {
        resolve();
      });
    });

    const first = processor.process("Gallia");
    const second = processor.process("est");
    const third = processor.process("omnis");

    expect(await first).toBe("GalliaP");
    expect(await second).toBe("estP");
    expect(await third).toBe("omnisP");
  });
});
