export interface TelemetryEvent {
  /** The time since epoch, in milliseconds, that this event ocurred. */
  readonly timestamp: number;
  /** The source of this event, e.g. local testing, staging, prod, etc... */
  readonly source: string;
}

export interface ApiParam {
  [key: string]: string;
}

export interface ApiCallData {
  /** The API that was called. */
  name: string;
  /** The parameters that this API was called with. */
  params?: ApiParam;
  /** The status code of the API request. */
  status: number;
  /** The response latency in milliseconds. */
  latencyMs: number;
  /** The string length of the serialized input. */
  inputLength?: number;
  /** The string length of the serialized output. */
  outputLength?: number;
  /** Any extra data to log. */
  extras?: { [key: string]: unknown };
  /** The UserAgent that triggered the request initially. */
  userAgent?: string;
}

export interface ClientEventData {
  name: string;
  extras?: { [key: string]: unknown };
}

export interface ApiCallEvent extends TelemetryEvent, ApiCallData {}

export interface TelemetryLogger {
  readonly teardown: () => Promise<void>;
  readonly logApiCall: (data: ApiCallData) => Promise<void>;
  readonly logServerHealth: (data: NodeJS.MemoryUsage) => Promise<void>;
  readonly logClientEvent: (data: ClientEventData) => Promise<unknown>;
}

export namespace TelemetryLogger {
  export const NoOp: TelemetryLogger = {
    teardown: async () => {},
    logApiCall: async (d) => console.debug(d),
    logServerHealth: async (d) => console.debug(d),
    logClientEvent: async (d) => console.debug(d),
  };
}
