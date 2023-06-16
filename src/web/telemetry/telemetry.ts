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
  readonly name: string;
  /** The parameters that this API was called with. */
  readonly params?: ApiParam;
  /** The status code of the API request. */
  readonly status: number;
  /** The response latency in milliseconds. */
  readonly latencyMs: number;
}

export interface ApiCallEvent extends TelemetryEvent, ApiCallData {}

export interface TelemetryLogger {
  readonly teardown: () => Promise<void>;
  readonly logApiCall: (data: ApiCallData) => Promise<void>;
}

export namespace TelemetryLogger {
  export const NoOp: TelemetryLogger = {
    teardown: async () => {},
    logApiCall: async (d) => console.debug(d),
  };
}
