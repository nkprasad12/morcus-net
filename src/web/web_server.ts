import express, { Request } from "express";
import expressStaticGzip from "express-static-gzip";
import http from "http";
import { Server, Socket } from "socket.io";

import {
  PROCESSED_OUTPUT_CHANNEL,
  ProcessingMessage,
  RAW_INPUT_CHANNEL,
} from "@/web/nlp/types";

const host = "localhost";
const port = 8000;

function log(message: string) {
  console.log(`[Web Server] ${message}`);
}

class ProcessingConnection {
  private readonly pendingRequests: Map<string, (output: string) => any> =
    new Map();

  private availableId: number = 0;
  private socket: Socket | undefined = undefined;

  constructor(server: Server) {
    server.on("connection", (socket: Socket) => {
      log("Connected to processing server.");
      this.socket = socket;
      socket.on("disconnect", () => {
        log("Disconnected from processing server.");
        this.socket = undefined;
      });
      socket.on(PROCESSED_OUTPUT_CHANNEL, (message: ProcessingMessage) => {
        log(`Got results for request: ${message.id}`);
        const resolver = this.pendingRequests.get(message.id);
        if (resolver === undefined) {
          log("No resolver for result.");
          return;
        }
        resolver(message.content);
      });
    });
  }

  async process(input: string): Promise<string> {
    return new Promise((resolve) => {
      if (this.socket === undefined) {
        resolve("Processing backend is not available. Please try again later.");
        return;
      }
      this.pendingRequests.set(`${this.availableId}`, resolve);
      const message: ProcessingMessage = {
        id: `${this.availableId}`,
        content: input,
      };
      this.availableId += 1;
      log(`Sending request ${message.id}`);
      this.socket.emit(RAW_INPUT_CHANNEL, message);
    });
  }
}

export function startServer(): void {
  const app = express();
  const server = http.createServer(app);
  const contentRouter = express.Router();
  contentRouter.use(expressStaticGzip("genfiles_static", { index: false }));
  app.use(express.static("genfiles_static"));

  const io = new Server(server);
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (token !== process.env.PROCESSING_SERVER_TOKEN) {
      next(new Error("Unrecognized processing backend."));
    } else {
      log("Authenticated processing backend.");
      next();
    }
  });
  const processingConnection = new ProcessingConnection(io);

  app.get(
    "/api/macronize/:input",
    async (req: Request<{ input: string }>, res) => {
      const output = await processingConnection.process(req.params.input);
      res.send(output);
    }
  );

  server.listen(port, host, () => {
    log(`Server is running on http://${host}:${port}`);
  });
}
