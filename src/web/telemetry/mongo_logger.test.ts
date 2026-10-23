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

  it.each([
    "Googlebot Hello Hi",
    "Mozilla/5.0 (compatible; Bytespider; spider-feedback@bytedance.com)",
    "Mozilla/5.0 (compatible; PerplexityBot/1.0)",
    "Mozilla/5.0 (compatible; SemrushBot/7~bl)",
    "curl/8.5.0",
    "Mozilla/5.0 (compatible; MysterySuperBot/1.0)",
  ])("skips log on logApiCall from Bot (%s)", async (userAgent) => {
    const logger = await MongoLogger.create("foo", "bar");

    await logger.logApiCall({
      name: "lsDict",
      status: 200,
      latencyMs: 4,
      userAgent,
    });

    expect(mockInsertOne).not.toHaveBeenCalled();
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

  it("swallows and rate-limits insertOne errors without rejecting", async () => {
    const errorSpy = jest.spyOn(console, "error").mockImplementation(() => {});
    const nowSpy = jest.spyOn(Date, "now");
    try {
      nowSpy.mockReturnValue(1_000_000);
      mockInsertOne.mockRejectedValue(new Error("over 512MB quota"));

      const logger = await MongoLogger.create("foo", "bar");

      // First failure logs immediately.
      await expect(
        logger.logApiCall({ name: "/dicts", status: 200, latencyMs: 5 })
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledTimes(1);
      expect(errorSpy.mock.calls[0][0]).toContain(
        "[MongoLogger] Failed to write to ApiCalls:"
      );

      // Subsequent failures within 60s are suppressed.
      nowSpy.mockReturnValue(1_010_000);
      await expect(
        logger.logApiCall({ name: "/dicts", status: 200, latencyMs: 5 })
      ).resolves.toBeUndefined();
      await expect(
        logger.logServerHealth(process.memoryUsage())
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledTimes(1);

      // Once 60s have elapsed, the next failure logs along with the suppressed count.
      nowSpy.mockReturnValue(1_061_000);
      await expect(
        logger.logApiCall({ name: "/dicts", status: 200, latencyMs: 5 })
      ).resolves.toBeUndefined();
      expect(errorSpy).toHaveBeenCalledTimes(2);
      expect(errorSpy.mock.calls[1][0]).toContain(
        "(2 similar errors suppressed)"
      );
    } finally {
      mockInsertOne.mockImplementation(() => Promise.resolve());
      nowSpy.mockRestore();
      errorSpy.mockRestore();
    }
  });
});
