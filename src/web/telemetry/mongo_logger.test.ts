import { MongoLogger } from "@/web/telemetry/mongo_logger";
// @ts-ignore
import { MongoClient } from "mongodb";
import { ApiCallEvent } from "@/web/telemetry/telemetry";

console.log = jest.fn();

const mockConnect = jest.fn(() => Promise.resolve());
const mockClose = jest.fn(() => Promise.resolve());
const mockInsertOne = jest.fn<Promise<void>, [], ApiCallEvent>(() =>
  Promise.resolve()
);
const mockCollection = jest.fn().mockImplementation(() => ({
  insertOne: mockInsertOne,
}));
const mockDb = jest.fn().mockImplementation(() => ({
  collection: mockCollection,
}));

jest.mock("mongodb", () => {
  return {
    MongoClient: jest.fn().mockImplementation(() => {
      return {
        connect: mockConnect,
        close: mockClose,
        db: mockDb,
      };
    }),
    ServerApiVersion: { v1: "1" },
  };
});

beforeEach(() => {
  mockConnect.mockClear();
  mockClose.mockClear();
  mockInsertOne.mockClear();
});

describe("MongoLogger", () => {
  it("connects on create", async () => {
    await MongoLogger.create("foo", "bar");
    expect(mockConnect).toHaveBeenCalledTimes(1);
  });

  it("disconnects on teardown", async () => {
    const logger = await MongoLogger.create("foo", "bar");
    await logger.teardown();
    expect(mockClose).toHaveBeenCalledTimes(1);
  });

  it("disallows logging after teardown", async () => {
    const logger = await MongoLogger.create("foo", "bar");
    await logger.teardown();

    let hadError = false;
    try {
      await logger.logApiCall({ name: "", status: 200, latencyMs: 5 });
    } catch {
      hadError = true;
    }
    expect(hadError).toBe(true);
  });

  it("logs to database on logApiCall", async () => {
    const logger = await MongoLogger.create("foo", "bar");

    await logger.logApiCall({ name: "lsDict", status: 200, latencyMs: 4 });

    expect(mockInsertOne).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const loggedEvent: ApiCallEvent = mockInsertOne.mock.lastCall!.at(0)!;
    expect(loggedEvent.name).toBe("lsDict");
    expect(loggedEvent.source).toBe("bar");
    expect(loggedEvent.status).toBe(200);
    expect(loggedEvent.latencyMs).toBe(4);
    expect(loggedEvent.timestamp).toBeDefined();
  });

  it("skips log on logApiCall from Bot", async () => {
    const logger = await MongoLogger.create("foo", "bar");

    await logger.logApiCall({
      name: "lsDict",
      status: 200,
      latencyMs: 4,
      userAgent: "Googlebot Hello Hi",
    });

    expect(mockInsertOne).not.toHaveBeenCalled();
  });

  it("logs to database on client event", async () => {
    const logger = await MongoLogger.create("foo", "bar");
    await logger.logClientEvent({ name: "clickEvent" });
    expect(mockCollection).toHaveBeenCalledWith("ClientEvents");
  });

  it("logs to database on system health call", async () => {
    const logger = await MongoLogger.create("foo", "bar");

    const input = process.memoryUsage();
    await logger.logServerHealth(input);

    expect(mockInsertOne).toHaveBeenCalledTimes(1);
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const loggedEvent: any = mockInsertOne.mock.lastCall!.at(0)!;
    expect(loggedEvent.rss).toBe(input.rss);
    expect(loggedEvent.timestamp).toBeDefined();
  });
});
