import { Socket } from "socket.io";
import { Workers } from "@/web/workers/worker_types";
import {
  authenticate,
  SocketWorkHandlerManager,
  SocketWorkHandler,
  SocketWorkServer,
} from "@/web/sockets/socket_worker_server";
import { WorkRequest } from "@/web/workers/requests";

console.debug = jest.fn();

jest.mock("socket.io", () => {
  return {
    Socket: jest.fn().mockImplementation((auth, on?, emit?) => {
      return {
        handshake: {
          auth: auth,
        },
        on: on,
        emit: emit,
      };
    }),
  };
});

function socketAuth(
  workerType: Workers.Category = Workers.MACRONIZER,
  inputChannel: string = "input",
  outputChannel: string = "output"
) {
  return {
    token: "token",
    workerType: workerType,
    inputChannel: inputChannel,
    outputChannel: outputChannel,
  };
}

class SocketWrapper {
  socket: Socket;
  mockOn = jest.fn();
  mockEmit = jest.fn();

  constructor(socket_auth: any) {
    // @ts-ignore
    this.socket = new Socket(socket_auth, this.mockOn, this.mockEmit);
  }

  onForEvent(event: string) {
    return this.mockOn.mock.calls.filter((args) => args[0] === event)[0][1];
  }
}

describe("authenticate", () => {
  beforeAll(() => {
    process.env.PROCESSING_SERVER_TOKEN = "token";
  });

  it("rejects invalid tokens", () => {
    // @ts-ignore
    const socket = new Socket({ token: "Caesar" });
    const next = jest.fn();

    authenticate(socket, next);

    expect(next.mock.calls).toHaveLength(1);
    expect(next.mock.calls[0][0].message).toContain("Unrecognized socket");
  });

  it("rejects unknown workers", () => {
    // @ts-ignore
    const socket = new Socket({ token: "token", workerType: "Translator" });
    const next = jest.fn();

    authenticate(socket, next);

    expect(next.mock.calls).toHaveLength(1);
    expect(next.mock.calls[0][0].message).toContain("Unknown worker type");
  });

  it("requires input channel", () => {
    // @ts-ignore
    const socket = new Socket({
      token: "token",
      workerType: Workers.MACRONIZER,
    });
    const next = jest.fn();

    authenticate(socket, next);

    expect(next.mock.calls).toHaveLength(1);
    expect(next.mock.calls[0][0].message).toContain("input channel");
  });

  it("requires output channel", () => {
    // @ts-ignore
    const socket = new Socket({
      token: "token",
      workerType: Workers.MACRONIZER,
      inputChannel: "input",
    });
    const next = jest.fn();

    authenticate(socket, next);

    expect(next.mock.calls).toHaveLength(1);
    expect(next.mock.calls[0][0].message).toContain("output channel");
  });

  it("calls next on valid socket", () => {
    // @ts-ignore
    const socket = new Socket({
      token: "token",
      workerType: Workers.MACRONIZER,
      inputChannel: "input",
      outputChannel: "output",
    });
    const next = jest.fn();

    authenticate(socket, next);

    expect(next.mock.calls).toHaveLength(1);
    expect(next.mock.calls[0]).toHaveLength(0);
  });
});

describe("SocketWorkHandler", () => {
  const SOCKET_AUTH = {
    token: "token",
    workerType: Workers.MACRONIZER,
    inputChannel: "input",
    outputChannel: "output",
  };

  beforeAll(() => {
    process.env.PROCESSING_SERVER_TOKEN = "token";
  });

  it("starts with no pending requests", () => {
    // @ts-ignore
    const socket = new Socket(SOCKET_AUTH, jest.fn());
    const handler = new SocketWorkHandler<string, string>(socket);
    expect(handler.numPending()).toBe(0);
  });

  it("subscribes to output channel", () => {
    const mockOn = jest.fn();
    // @ts-ignore
    const socket = new Socket(SOCKET_AUTH, mockOn);

    new SocketWorkHandler<string, string>(socket);

    expect(mockOn.mock.calls).toHaveLength(1);
    expect(mockOn.mock.calls[0][0]).toBe(SOCKET_AUTH.outputChannel);
  });

  it("sends data to output channel", () => {
    const mockOn = jest.fn();
    const mockEmit = jest.fn();
    // @ts-ignore
    const socket = new Socket(SOCKET_AUTH, mockOn, mockEmit);

    const handler = new SocketWorkHandler<string, string>(socket);
    const request: WorkRequest<string> = {
      category: Workers.MACRONIZER,
      content: "Caesar",
      id: "1234",
    };
    handler.process(request);

    expect(mockEmit.mock.calls).toHaveLength(1);
    expect(mockEmit.mock.calls[0][0]).toBe(SOCKET_AUTH.inputChannel);
    expect(mockEmit.mock.calls[0][1]).toStrictEqual({
      id: request.id,
      content: request.content,
    });
  });

  it("updates pending count on process", () => {
    const mockOn = jest.fn();
    const mockEmit = jest.fn();
    // @ts-ignore
    const socket = new Socket(SOCKET_AUTH, mockOn, mockEmit);
    const handler = new SocketWorkHandler<string, string>(socket);
    const request: WorkRequest<string> = {
      category: Workers.MACRONIZER,
      content: "Caesar",
      id: "1234",
    };

    handler.process(request);

    expect(handler.numPending()).toBe(1);
  });

  it("resolves process request on receipt", async () => {
    const mockOn = jest.fn();
    const mockEmit = jest.fn();
    // @ts-ignore
    const socket = new Socket(SOCKET_AUTH, mockOn, mockEmit);

    const handler = new SocketWorkHandler<string, string>(socket);
    const request: WorkRequest<string> = {
      category: Workers.MACRONIZER,
      content: "Caesar",
      id: "1234",
    };

    const responsePromise = handler.process(request);
    const received = { id: "1234", content: "Julius" };
    mockOn.mock.calls[0][1](received);
    const response = await responsePromise;

    expect(response).toStrictEqual(received);
    expect(handler.numPending()).toBe(0);
  });

  it("handles multiple incoming requests before completion", async () => {
    const mockOn = jest.fn();
    const mockEmit = jest.fn();
    // @ts-ignore
    const socket = new Socket(SOCKET_AUTH, mockOn, mockEmit);

    const handler = new SocketWorkHandler<string, string>(socket);
    const firstPromise = handler.process({
      category: Workers.MACRONIZER,
      content: "Caesar",
      id: "1234",
    });
    const secondPromise = handler.process({
      category: Workers.MACRONIZER,
      content: "Octavianus",
      id: "1235",
    });

    expect(handler.numPending()).toBe(2);
    const secondReceived = { id: "1235", content: "Augustus" };
    mockOn.mock.calls[0][1](secondReceived);
    const second = await secondPromise;

    expect(second).toStrictEqual(secondReceived);
    expect(handler.numPending()).toBe(1);

    const firstReceived = { id: "1234", content: "Julius" };
    mockOn.mock.calls[0][1](firstReceived);
    const first = await firstPromise;

    expect(first).toStrictEqual(firstReceived);
    expect(handler.numPending()).toBe(0);
  });

  it("handles unexpected data", async () => {
    const mockOn = jest.fn();
    const mockEmit = jest.fn();
    // @ts-ignore
    const socket = new Socket(SOCKET_AUTH, mockOn, mockEmit);

    const handler = new SocketWorkHandler<string, string>(socket);
    const firstPromise = handler.process({
      category: Workers.MACRONIZER,
      content: "Caesar",
      id: "1234",
    });

    mockOn.mock.calls[0][1]({ id: "1235", content: "Augustus" });
    const firstReceived = { id: "1234", content: "Julius" };
    mockOn.mock.calls[0][1](firstReceived);
    const first = await firstPromise;

    expect(first).toStrictEqual(firstReceived);
    expect(handler.numPending()).toBe(0);
  });
});

describe("SocketWorkHandlerManager", () => {
  beforeAll(() => {
    process.env.PROCESSING_SERVER_TOKEN = "token";
  });

  it("initially provides no workers", () => {
    const manager = new SocketWorkHandlerManager();
    expect(manager.findWorker(Workers.MACRONIZER)).not.toBeDefined();
  });

  it("addsWorkers when called", () => {
    const socketWrapper = new SocketWrapper(socketAuth());
    const manager = new SocketWorkHandlerManager();

    manager.addWorker(socketWrapper.socket);

    expect(manager.findWorker(Workers.MACRONIZER)).toBeDefined();
  });

  it("removes workers when disconnected", () => {
    const socketWrapper = new SocketWrapper(socketAuth());
    const manager = new SocketWorkHandlerManager();

    manager.addWorker(socketWrapper.socket);
    socketWrapper.onForEvent("disconnect")();

    expect(manager.findWorker(Workers.MACRONIZER)).not.toBeDefined();
  });

  it("sorts workers by type", () => {
    const macronizerWrapper = new SocketWrapper(socketAuth(Workers.MACRONIZER));
    const lsWrapper = new SocketWrapper(socketAuth(Workers.LS_DICT));

    const manager = new SocketWorkHandlerManager();

    manager.addWorker(macronizerWrapper.socket);
    manager.addWorker(lsWrapper.socket);

    const macronizerWorker = manager.findWorker(Workers.MACRONIZER);
    const lsWorker = manager.findWorker(Workers.LS_DICT);
    expect(macronizerWorker).toBeDefined();
    expect(lsWorker).toBeDefined();
    expect(macronizerWorker).not.toBe(lsWorker);
  });

  it("finds same worker on multiple calls", () => {
    const socketWrapper = new SocketWrapper(socketAuth());
    const manager = new SocketWorkHandlerManager();

    manager.addWorker(socketWrapper.socket);

    const first = manager.findWorker(Workers.MACRONIZER);
    const second = manager.findWorker(Workers.MACRONIZER);
    expect(first).toBeDefined();
    expect(first).toBe(second);
  });

  it("finds least busy worker", () => {
    const firstWrapper = new SocketWrapper(socketAuth());
    const secondWrapper = new SocketWrapper(socketAuth());
    const manager = new SocketWorkHandlerManager();
    manager.addWorker(firstWrapper.socket);
    manager.addWorker(secondWrapper.socket);

    const first = manager.findWorker(Workers.MACRONIZER);
    first!.process({
      category: Workers.MACRONIZER,
      content: "Caesar",
      id: "1234",
    });

    const second = manager.findWorker(Workers.MACRONIZER);
    expect(second).toBeDefined();
    expect(second).not.toBe(first);
  });
});

describe("SocketWorkServer", () => {
  it("uses authentication", () => {
    const server = {
      use: jest.fn(),
      on: jest.fn(),
    };
    // @ts-ignore
    const workServer = new SocketWorkServer(server);

    expect(server.use.mock.calls[0][0]).toBe(authenticate);
  });

  it("returns error if no processors are available", async () => {
    const server = {
      use: jest.fn(),
      on: jest.fn(),
    };
    // @ts-ignore
    const workServer = new SocketWorkServer(server);

    const result = await workServer.process({
      category: Workers.MACRONIZER,
      content: "Caesar",
      id: "1234",
    });

    expect(result.id).toBe("1234");
    expect(result.content).toContain("No worker");
  });

  it("listens for connections", () => {
    const server = {
      use: jest.fn(),
      on: jest.fn(),
    };
    // @ts-ignore
    new SocketWorkServer(server);

    expect(server.on.mock.lastCall).toBeDefined();
    expect(server.on.mock.lastCall[0]).toBe("connection");
  });

  it("adds workers from incoming socket connections", async () => {
    const server = {
      use: jest.fn(),
      on: jest.fn(),
    };
    // @ts-ignore
    const workServer = new SocketWorkServer(server);
    const socketWrapper = new SocketWrapper(socketAuth(Workers.MACRONIZER));

    server.on.mock.lastCall![1](socketWrapper.socket);
    const resultPromise = workServer.process({
      category: Workers.MACRONIZER,
      content: "Caesar",
      id: "1234",
    });
    socketWrapper.onForEvent("output")({ id: "1234", content: "Augustus" });

    const result = await resultPromise;
    expect(result.id).toBe("1234");
    expect(result.content).toBe("Augustus");
  });
});
