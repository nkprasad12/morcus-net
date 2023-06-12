import { MongoLogger } from "./mongo_logger";
// @ts-ignore
import { MongoClient } from "mongodb";
import { ApiCallEvent } from "./telemetry";

console.log = jest.fn();

const mockConnect = jest.fn(() => Promise.resolve());
const mockClose = jest.fn(() => Promise.resolve());
const mockInsertOne = jest.fn(() => Promise.resolve());
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
      await logger.logApiCall({ name: "" });
    } catch {
      hadError = true;
    }
    expect(hadError).toBe(true);
  });

  it("logs to database on logApiCall", async () => {
    const logger = await MongoLogger.create("foo", "bar");

    await logger.logApiCall({ name: "lsDict" });

    expect(mockInsertOne).toHaveBeenCalledTimes(1);
    const loggedEvent: ApiCallEvent = mockInsertOne.mock.lastCall!.at(0)!;
    expect(loggedEvent.name).toBe("lsDict");
    expect(loggedEvent.source).toBe("bar");
    expect(loggedEvent.timestamp).toBeDefined();
  });
});
