import { MongoClient, MongoClientOptions, ServerApiVersion } from "mongodb";
import {
  ApiCallData,
  TelemetryEvent,
  TelemetryLogger,
  type ClientEventData,
} from "@/web/telemetry/telemetry";
import { assert, checkPresent } from "@/common/assert";

const API_CALL_COLLECTION = "ApiCalls";
const SERVER_HEALTH_COLLECTION = "ServerHealth";
const CLIENT_EVENT_COLLECTION = "ClientEvents";

const CLIENT_OPTIONS: MongoClientOptions = {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  },
};

// Crawler list is available from:
// https://raw.githubusercontent.com/monperrus/crawler-user-agents/master/crawler-user-agents.json
// For now, we will only check a few.
const USER_AGENTS = new Set<string>([
  "Googlebot",
  "AdsBot-Google",
  "Slurp",
  "msnbot",
  "yandex.com/bots",
  "Baiduspider",
  "DuckDuckBot",
  "bingbot",
  "GPTBot",
  "ClaudeBot",
  "claudebot",
]);
const LOWER_USER_AGENTS = new Set<string>(
  Array.from(USER_AGENTS).map((agent) => agent.toLowerCase())
);

function isCrawler(userAgent?: string): boolean {
  if (userAgent === undefined) {
    return false;
  }
  const lowerUserAgent = userAgent.toLowerCase();
  for (const agent of LOWER_USER_AGENTS) {
    if (lowerUserAgent.includes(agent)) {
      return true;
    }
  }
  return false;
}

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
    await this.client.close();
    this.initialized = false;
    console.log("Closed MongoLogger");
  }

  async logApiCall(data: Readonly<ApiCallData>): Promise<void> {
    assert(this.initialized, "MongoLogger was not initialized.");
    if (isCrawler(data.userAgent)) {
      return;
    }
    return this.log(data, API_CALL_COLLECTION);
  }

  async logClientEvent(data: Readonly<ClientEventData>): Promise<void> {
    assert(this.initialized, "MongoLogger was not initialized.");
    return this.log(data, CLIENT_EVENT_COLLECTION);
  }

  async logServerHealth(data: NodeJS.MemoryUsage): Promise<void> {
    assert(this.initialized, "MongoLogger was not initialized.");
    return this.log(data, SERVER_HEALTH_COLLECTION);
  }

  private async log(data: object, collectionName: string): Promise<void> {
    const event: TelemetryEvent = {
      ...data,
      timestamp: Date.now(),
      source: this.source,
    };

    const collection = this.client.db().collection(collectionName);
    await collection.insertOne(event);
  }
}
