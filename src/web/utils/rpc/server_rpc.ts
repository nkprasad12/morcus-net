import { exhaustiveGuard } from "@/common/misc_utils";
import { ApiCallData, TelemetryLogger } from "@/web/telemetry/telemetry";
import { decodeMessage, encodeMessage } from "@/web/utils/rpc/parsing";
import { ApiRoute, ServerMessage } from "@/web/utils/rpc/rpc";
import express, { Request, Response } from "express";

export type Data = boolean | string | number | object;

const DATA_PLACEHOLDER = "__@PRE_STRINGIFIED_PLACEHOLDER";

class Timer {
  private readonly start: number;
  private readonly events: [string, number][];
  private readonly names: Map<string, number>;

  constructor() {
    this.start = performance.now();
    this.events = [];
    this.names = new Map();
  }

  event(event: string): number {
    const currentTime = performance.now();
    const elapsed = Math.round(100 * (currentTime - this.start)) / 100;
    const i = this.names.get(event);
    let suffix = "";
    if (i === undefined) {
      this.names.set(event, 2);
    } else {
      this.names.set(event, i + 1);
      suffix = `_${i}`;
    }
    this.events.push([event + suffix, elapsed]);
    return elapsed;
  }

  getEvents(): { [key: string]: number } {
    const result: { [key: string]: number } = {};
    this.events.forEach(([eventName, time]) => (result[eventName] = time));
    return result;
  }
}

function serverMessage<T>(t: T): ServerMessage<T> {
  return {
    data: t,
    metadata: { commit: process.env.COMMIT_ID },
  };
}

async function logApi(
  data: Omit<ApiCallData, "latencyMs">,
  timer: Timer,
  telemetry: Promise<TelemetryLogger>
) {
  const finalData = {
    ...data,
    latencyMs: timer.event("end"),
    extras: timer.getEvents(),
  };
  (await telemetry).logApiCall(finalData);
}

function findInput<I, O>(req: Request, route: ApiRoute<I, O>): string {
  if (route.method === "GET") {
    return req.params.input;
  } else if (route.method === "POST") {
    const body: unknown = req.body;
    if (typeof body !== "string") {
      throw new TypeError(
        `Received unexpected body type. Ensure message` +
          ` bodies are parsed as text in server configuration.`
      );
    }
    return body;
  }
  throw new TypeError(`Unhandled method: ${route.method}`);
}

function extractInput<I, O>(
  req: Request,
  route: ApiRoute<I, O>
): [I, number] | Error {
  try {
    const input = findInput(req, route);
    return [
      decodeMessage(
        input,
        route.inputValidator,
        route.registry,
        route.method === "GET"
      ),
      input.length,
    ];
  } catch (e) {
    return new Error(`Error extracting input on route: ${route.path}`, {
      cause: e,
    });
  }
}

type ExpressApiHandler = (req: Request, res: Response) => void;

function adaptHandler<I, O extends Data, T extends RouteDefinitionType>(
  app: { webApp: express.Express; telemetry: Promise<TelemetryLogger> },
  routeDefinition: RouteDefinition<I, O, T>
): ExpressApiHandler {
  const route = routeDefinition.route;
  const handler = routeDefinition.handler;
  return (req, res) => {
    const timer = new Timer();
    console.debug(`[${Date.now() / 1000}] ${route.path}`);
    const inputOrError = extractInput(req, route);
    timer.event("extractInputComplete");
    if (inputOrError instanceof Error) {
      res.status(400).send(inputOrError.message);
      logApi({ name: route.path, status: 400 }, timer, app.telemetry);
      return;
    }
    const [input, rawLength] = inputOrError;

    let status: number = 200;
    let body: O | string | HandlerError | undefined = undefined;
    handler(input, { log: (tag) => timer.event(tag) })
      .then((output) => {
        if (output === undefined || output === null) {
          return;
        }
        body = output;
      })
      .catch((reason: HandlerError) => {
        status = reason?.status || 500;
        console.debug(reason);
        body = reason;
      })
      .finally(() => {
        timer.event("handlerComplete");
        const isPreStringified =
          status === 200 && routeDefinition.preStringified;
        let result = encodeMessage(
          serverMessage(isPreStringified ? DATA_PLACEHOLDER : body),
          route.registry
        );
        if (isPreStringified) {
          // @ts-ignore
          result = result.replace(`"${DATA_PLACEHOLDER}"`, body);
        }
        timer.event("encodeMessageComplete");
        res.status(status).send(result);
        const telemetryData: Omit<ApiCallData, "latencyMs"> = {
          name: route.path,
          status: status,
          inputLength: rawLength,
          outputLength: result === undefined ? 0 : result.length,
        };
        if (route.method === "GET") {
          telemetryData.params = { input: JSON.stringify(input) };
        }
        telemetryData.params;
        logApi(telemetryData, timer, app.telemetry);
      });
  };
}

export type HandlerError = {
  status: number;
  message: string;
};
export interface ServerExtras {
  log: (tag: string) => any;
}
export type ApiHandler<I, O> = (input: I, extras?: ServerExtras) => Promise<O>;
export type PreStringifiedRpc = "PreStringified";
export type RouteDefinitionType = undefined | PreStringifiedRpc;
type HandlerType<I, O, T> = T extends PreStringifiedRpc
  ? ApiHandler<I, string>
  : ApiHandler<I, O>;
interface RouteDefinitionBase<I, O, T extends RouteDefinitionType = undefined> {
  route: ApiRoute<I, O>;
  handler: HandlerType<I, O, T>;
}
export type RouteDefinition<
  I,
  O,
  T extends RouteDefinitionType = undefined
> = RouteDefinitionBase<I, O, T> &
  (T extends PreStringifiedRpc
    ? { preStringified: true }
    : { preStringified?: undefined });
export namespace RouteDefinition {
  export function create<I, O>(
    route: ApiRoute<I, O>,
    handler: ApiHandler<I, O>
  ): RouteDefinition<I, O>;
  export function create<I, O>(
    route: ApiRoute<I, O>,
    handler: ApiHandler<I, string>,
    preStringified: true
  ): RouteDefinition<I, O, "PreStringified">;
  export function create<I, O, T extends RouteDefinitionType>(
    route: ApiRoute<I, O>,
    handler: HandlerType<I, O, T>,
    preStringified?: T extends PreStringifiedRpc ? true : undefined
  ): RouteDefinition<I, O, T> {
    // @ts-ignore
    return { route, handler, preStringified };
  }
}

/**
 * Adds the given API to the Express app.
 *
 * @param app the Express application.
 * @param routeDefinition the route definition to implement the API. If the
 *                        handler rejects, it should reject with a `HandlerError`.
 */
export function addApi<I, O extends Data, T extends RouteDefinitionType>(
  app: { webApp: express.Express; telemetry: Promise<TelemetryLogger> },
  routeDefinition: RouteDefinition<I, O, T>
): void {
  const route = routeDefinition.route;
  const adapted = adaptHandler(app, routeDefinition);
  switch (route.method) {
    case "GET":
      app.webApp.get(`${route.path}/:input`, adapted);
      return;
    case "POST":
      app.webApp.post(route.path, adapted);
      return;
    default:
      exhaustiveGuard(route.method);
  }
}
