import crypto from "crypto";
import { Server, Socket } from "socket.io";

import { Workers } from "@/web/workers/worker_types";
import {
  Message,
  QueuedWorkHandler,
  WorkHandler,
  WorkProcessor,
  WorkRequest,
} from "@/web/workers/requests";
import { io } from "socket.io-client";

function log(channel: string, message: string) {
  console.log(`[socket_workers] [${channel}] ${message}`);
}

export function authenticate(
  socket: Socket,
  next: (err?: Error | undefined) => void
) {
  const token = socket.handshake.auth.token;
  if (token !== process.env.PROCESSING_SERVER_TOKEN) {
    next(new Error("Unrecognized socket client"));
    return;
  }

  const workerType = socket.handshake.auth.workerType;
  log("authenticate", `New connection from worker ${workerType}`);
  if (!Workers.isValid(workerType)) {
    next(new Error(`Unknown worker type ${workerType}`));
    return;
  }

  const inputChannel = socket.handshake.auth.inputChannel;
  if (inputChannel === undefined) {
    next(new Error("Workers must specify an input channel"));
    return;
  }

  const outputChannel = socket.handshake.auth.outputChannel;
  if (outputChannel === undefined) {
    next(new Error("Workers must specify an output channel"));
    return;
  }

  next();
}

interface Resolvable<T> {
  resolver: (output: T) => any;
  startTime: number;
}

export class SocketWorkHandler<I, O> implements QueuedWorkHandler<I, O> {
  private readonly pending: Map<string, Resolvable<Message<O>>> = new Map();
  private readonly tag = "SocketWorkHandler";

  constructor(private readonly socket: Socket) {
    this.socket.on(
      this.socket.handshake.auth.outputChannel,
      (message: Message<O>) => {
        log(this.tag, `Got results for request: ${message.id}`);
        const resolvable = this.pending.get(message.id);
        if (resolvable === undefined) {
          log(this.tag, "ERROR: No resolver for result!");
          return;
        }

        this.pending.delete(message.id);
        const elapsedTime = performance.now() - resolvable.startTime;
        log(this.tag, `Request ${message.id} processing time: ${elapsedTime}`);
        resolvable.resolver(message);
      }
    );
  }

  async process(input: WorkRequest<I>): Promise<Message<O>> {
    return new Promise((resolve) => {
      const resolvable = {
        resolver: resolve,
        startTime: performance.now(),
      };
      this.pending.set(input.id, resolvable);
      log(this.tag, `Sending request ${input.id}`);
      this.socket.emit(this.socket.handshake.auth.inputChannel, {
        id: input.id,
        content: input.content,
      });
    });
  }

  numPending(): number {
    return this.pending.size;
  }
}

export async function startRemoteWorker(
  processor: WorkProcessor<string, string>,
  uuid: number = crypto.randomInt(1000000000)
): Promise<void> {
  await processor.setup();
  const address = process.env.SOCKET_ADDRESS!;

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
    const output: Message<string> = {
      id: message.id,
      content: await processor.process(message),
    };
    socket.emit(outputChannel, output);
  });

  socket.on("disconnect", () => {
    log(tag, `${tag} disconnected from web server.`);
    processor.teardown();
    socket.close();
  });
}

type SocketStringWorkHandler = SocketWorkHandler<string, string>;

export class SocketWorkHandlerManager {
  private readonly workers: Map<
    Workers.Category,
    Set<SocketStringWorkHandler>
  > = new Map();
  private readonly tag = "SocketWorkerHandlerManager";

  private reportWorkers(): void {
    this.workers.forEach((sockets, key) => {
      log(this.tag, `${key}: ${sockets.size} workers`);
    });
  }

  addWorker(socket: Socket): void {
    const workerType: Workers.Category = socket.handshake.auth.workerType;
    if (!this.workers.has(workerType)) {
      this.workers.set(workerType, new Set());
    }

    log(this.tag, `New ${workerType} worker connected`);
    const worker: SocketStringWorkHandler = new SocketWorkHandler(socket);
    this.workers.get(workerType)!.add(worker);
    this.reportWorkers();

    socket.on("disconnect", () => {
      log(this.tag, `${workerType} worker disconnected`);
      this.workers.get(workerType)!.delete(worker);
    });
  }

  findWorker(category: Workers.Category): SocketStringWorkHandler | undefined {
    const options = this.workers.get(category);
    if (options === undefined) {
      return undefined;
    }

    let leastBusy: SocketStringWorkHandler | undefined = undefined;
    for (const option of options.values()) {
      if (
        leastBusy !== undefined &&
        leastBusy.numPending() < option.numPending()
      ) {
        continue;
      }
      leastBusy = option;
    }
    return leastBusy;
  }
}

export class SocketWorkServer implements WorkHandler<string, string> {
  private readonly workerManager = new SocketWorkHandlerManager();

  constructor(socketServer: Server) {
    socketServer.use(authenticate);
    socketServer.on("connection", (socket) =>
      this.workerManager.addWorker(socket)
    );
  }

  async process(request: WorkRequest<string>): Promise<Message<string>> {
    const worker = this.workerManager.findWorker(request.category);
    if (worker === undefined) {
      return {
        id: request.id,
        content: "No worker connected, please try again later.",
      };
    }
    return worker.process(request);
  }
}
