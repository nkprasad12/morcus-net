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
    expect(loggedEvent.humanRequests).toBe(0);
    expect(loggedEvent.humanLatencyMs).toBe(0);
    expect(loggedEvent.botRequests).toBe(0);
    expect(loggedEvent.botLatencyMs).toBe(0);
    expect(loggedEvent.botHeavyRequests).toBe(0);
    expect(loggedEvent.botHeavyLatencyMs).toBe(0);
  });

  it("accumulates human, bot, and heavy bot traffic counters and resets them on logServerHealth", async () => {
    const logger = await MongoLogger.create("foo", "bar");

    // 2 human requests (1 cheap, 1 heavy)
    await logger.logApiCall({
      name: "/dicts",
      status: 200,
      latencyMs: 3.1,
      userAgent: "Mozilla/5.0 Chrome/128.0.0.0 Safari/537.36",
    });
    await logger.logApiCall({
      name: "POST /macronizer",
      status: 200,
      latencyMs: 42.25,
      userAgent: "Mozilla/5.0 Chrome/128.0.0.0 Safari/537.36",
    });

    // 2 cheap bot requests (/dicts and /externalReader landing page without url)
    await logger.logApiCall({
      name: "/dicts",
      status: 200,
      latencyMs: 2.5,
      userAgent: "Googlebot/2.1",
    });
    await logger.logApiCall({
      name: "/externalReader",
      status: 200,
      latencyMs: 1.5,
      userAgent: "Bytespider",
    });

    // 4 heavy bot requests (macronizer, macronizer/apply, report, externalReader with url)
    await logger.logApiCall({
      name: "POST /macronizer",
      status: 200,
      latencyMs: 110.2,
      userAgent: "GPTBot/1.2",
    });
    await logger.logApiCall({
      name: "POST /macronizer/apply",
      status: 200,
      latencyMs: 19.8,
      userAgent: "GPTBot/1.2",
    });
    await logger.logApiCall({
      name: "POST /api/report",
      status: 400,
      latencyMs: 5.0,
      userAgent: "curl/8.5.0",
    });
    await logger.logApiCall({
      name: "/externalReader",
      params: { url: "https://example.com/latin.html" },
      status: 200,
      latencyMs: 250.5,
      userAgent: "PerplexityBot/1.0",
    });

    // Only the 2 human requests were inserted into ApiCalls
    expect(mockInsertOne).toHaveBeenCalledTimes(2);

    const input = process.memoryUsage();
    await logger.logServerHealth(input);

    expect(mockInsertOne).toHaveBeenCalledTimes(3);
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const healthRow: any = mockInsertOne.mock.lastCall!.at(0)!;
    expect(healthRow).toMatchObject({
      humanRequests: 2,
      humanLatencyMs: 45.35,
      botRequests: 6,
      botLatencyMs: 389.5,
      botHeavyRequests: 4,
      botHeavyLatencyMs: 385.5,
    });

    // Next health check starts from zeroed counters
    await logger.logServerHealth(input);
    // eslint-disable-next-line @typescript-eslint/no-confusing-void-expression
    const nextHealthRow: any = mockInsertOne.mock.lastCall!.at(0)!;
    expect(nextHealthRow).toMatchObject({
      humanRequests: 0,
      humanLatencyMs: 0,
      botRequests: 0,
      botLatencyMs: 0,
      botHeavyRequests: 0,
      botHeavyLatencyMs: 0,
    });
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
