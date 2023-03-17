import { io } from "socket.io-client";

import { WorkProcessor } from "@/web/workers/requests";
import { Workers } from "@/web/workers/worker_types";

import { startRemoteWorker } from "./socket_workers";

jest.mock("socket.io-client", () => {
  return {
    io: jest.fn(() => {
      return {
        on: jest.fn(),
        close: jest.fn(),
        emit: jest.fn(),
      };
    }),
  };
});

describe("startRemoteWorker", () => {
  const mockSetup = jest.fn(() => Promise.resolve());
  const mockProcess = jest.fn();
  const mockTeardown = jest.fn();

  beforeEach(() => {
    process.env.SOCKET_ADDRESS = "//foo";
    process.env.KEEP_WORKERS_ON_DISCONNECT = "false";
    mockSetup.mockClear();
    mockProcess.mockClear();
    mockTeardown.mockClear();
  });

  afterEach(() => {
    // @ts-ignore
    io.mockClear();
  });

  const processor: WorkProcessor<string, string> = {
    category: Workers.MACRONIZER,
    setup: mockSetup,
    process: mockProcess,
    teardown: mockTeardown,
  };

  it("invokes processor setup", async () => {
    await startRemoteWorker(processor, 1234);
    expect(mockSetup).toBeCalledTimes(1);

    // @ts-ignore
    const socket = io.mock.results.value;
  });

  it("handles connection", async () => {
    await startRemoteWorker(processor, 1234);
    // @ts-ignore
    const socketOn: jest.Mock = io.mock.results[0].value.on;

    expect(socketOn.mock.calls[0][0]).toBe("connect");
    socketOn.mock.calls[0][1]();
  });

  it("handles input and disconnect", async () => {
    await startRemoteWorker(processor, 1234);
    // @ts-ignore
    const socketOn: jest.Mock = io.mock.results[0].value.on;
    // @ts-ignore
    const socketClose: jest.Mock = io.mock.results[0].value.close;
    // @ts-ignore
    const socketEmit: jest.Mock = io.mock.results[0].value.emit;

    expect(socketOn.mock.calls[1][0]).toContain("1234.INPUT");
    await socketOn.mock.calls[1][1]({ id: 123, content: "cont" });
    expect(socketEmit).toBeCalledTimes(1);

    expect(socketOn.mock.calls[2][0]).toBe("disconnect");
    socketOn.mock.calls[2][1]();
    expect(socketClose).toBeCalledTimes(1);
    expect(mockTeardown).toBeCalledTimes(1);
  });

  it("handles input and does not disconnect in persistent mode", async () => {
    process.env.KEEP_WORKERS_ON_DISCONNECT = "true";
    await startRemoteWorker(processor, 1234);
    // @ts-ignore
    const socketOn: jest.Mock = io.mock.results[0].value.on;
    // @ts-ignore
    const socketClose: jest.Mock = io.mock.results[0].value.close;
    // @ts-ignore
    const socketEmit: jest.Mock = io.mock.results[0].value.emit;

    expect(socketOn.mock.calls[1][0]).toContain("1234.INPUT");
    await socketOn.mock.calls[1][1]({ id: 123, content: "cont" });
    expect(socketEmit).toBeCalledTimes(1);

    expect(socketOn.mock.calls[2][0]).toBe("disconnect");
    socketOn.mock.calls[2][1]();
    expect(socketClose).toBeCalledTimes(0);
    expect(mockTeardown).toBeCalledTimes(0);
  });
});
