import { MongoClient, MongoClientOptions, ServerApiVersion } from "mongodb";
import {
  ApiCallData,
  TelemetryEvent,
  TelemetryLogger,
} from "@/web/telemetry/telemetry";
import { isCrawler } from "@/web/telemetry/crawlers";
import { assert, checkPresent } from "@/common/assert";

const API_CALL_COLLECTION = "ApiCalls";
const SERVER_HEALTH_COLLECTION = "ServerHealth";
const ERROR_LOG_INTERVAL_MS = 60_000;

interface TrafficWindowCounters {
  humanRequests: number;
  humanLatencyMs: number;
  botRequests: number;
  botLatencyMs: number;
  botHeavyRequests: number;
  botHeavyLatencyMs: number;
}

function emptyTrafficCounters(): TrafficWindowCounters {
  return {
    humanRequests: 0,
    humanLatencyMs: 0,
    botRequests: 0,
    botLatencyMs: 0,
    botHeavyRequests: 0,
    botHeavyLatencyMs: 0,
  };
}

function roundMs(ms: number): number {
  return Math.round(ms * 100) / 100;
}

/**
 * Whether `data` represents an expensive or external-service-calling route
 * (`POST /macronizer`, `POST /macronizer/apply`, `POST /api/report`, or an
 * `/externalReader` URL scrape).
 */
export function isHeavyRequest(data: Readonly<ApiCallData>): boolean {
  return (
    data.name === "POST /macronizer" ||
    data.name === "POST /macronizer/apply" ||
    data.name === "POST /api/report" ||
    (data.name === "/externalReader" && data.params?.url !== undefined)
  );
}

const CLIENT_OPTIONS: MongoClientOptions = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
};

export class MongoLogger implements TelemetryLogger {
  static async create(
    uri: string = checkPresent(process.env.MONGODB_URI, "No MongoDB URI set."),
    source: string = checkPresent(process.env.DB_SOURCE, "No source id set.")
  ): Promise<MongoLogger> {
    const client = new MongoClient(uri, CLIENT_OPTIONS);
    const logger = new MongoLogger(client, source);
    await logger.initialize();
    return logger;
  }

  private initialized: boolean = false;
  private lastErrorLogTime: number = 0;
  private suppressedErrorCount: number = 0;
  private traffic: TrafficWindowCounters = emptyTrafficCounters();

  private constructor(
    private readonly client: Readonly<MongoClient>,
    private readonly source: string
  ) {}

  private async initialize(): Promise<void> {
    await this.client.connect();
    this.initialized = true;
    console.log("Initialized MongoLogger");
  }

  async teardown(): Promise<void> {
    try {
      await this.client.close();
      console.log("Closed MongoLogger");
    } finally {
      this.initialized = false;
    }
  }

  async logApiCall(data: Readonly<ApiCallData>): Promise<void> {
    assert(this.initialized, "MongoLogger was not initialized.");
    if (isCrawler(data.userAgent)) {
      this.traffic.botRequests += 1;
      this.traffic.botLatencyMs += data.latencyMs;
      if (isHeavyRequest(data)) {
        this.traffic.botHeavyRequests += 1;
        this.traffic.botHeavyLatencyMs += data.latencyMs;
      }
      return;
    }
    this.traffic.humanRequests += 1;
    this.traffic.humanLatencyMs += data.latencyMs;
    return this.log(data, API_CALL_COLLECTION);
  }

  async logServerHealth(data: NodeJS.MemoryUsage): Promise<void> {
    assert(this.initialized, "MongoLogger was not initialized.");
    const snapshot: TrafficWindowCounters = {
      humanRequests: this.traffic.humanRequests,
      humanLatencyMs: roundMs(this.traffic.humanLatencyMs),
      botRequests: this.traffic.botRequests,
      botLatencyMs: roundMs(this.traffic.botLatencyMs),
      botHeavyRequests: this.traffic.botHeavyRequests,
      botHeavyLatencyMs: roundMs(this.traffic.botHeavyLatencyMs),
    };
    this.traffic = emptyTrafficCounters();
    return this.log({ ...data, ...snapshot }, SERVER_HEALTH_COLLECTION);
  }

  private async log(data: object, collectionName: string): Promise<void> {
    const event: TelemetryEvent = {
      ...data,
      timestamp: Date.now(),
      source: this.source,
    };

    try {
      const collection = this.client.db().collection(collectionName);
      await collection.insertOne(event);
    } catch (err) {
      const now = Date.now();
      if (
        this.lastErrorLogTime === 0 ||
        now - this.lastErrorLogTime >= ERROR_LOG_INTERVAL_MS
      ) {
        const suppressed =
          this.suppressedErrorCount > 0
            ? ` (${this.suppressedErrorCount} similar errors suppressed)`
            : "";
        console.error(
          `[MongoLogger] Failed to write to ${collectionName}${suppressed}:`,
          err
        );
        this.lastErrorLogTime = now;
        this.suppressedErrorCount = 0;
      } else {
        this.suppressedErrorCount++;
      }
    }
  }
}
