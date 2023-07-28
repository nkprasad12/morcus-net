import { assert } from "@/common/assert";
import { ApiCallData, TelemetryLogger } from "@/web/telemetry/telemetry";
import express, { Request, Response } from "express";
import { ApiRoute } from "@/web/utils/rpc/rpc";
import { decodeMessage, encodeMessage } from "@/web/utils/rpc/parsing";

export type Data = boolean | string | number | object;

class Timer {
  private readonly start: number;
  private readonly events: [string, number][];

  constructor() {
    this.start = performance.now();
    this.events = [];
  }

  event(event: string): number {
    const elapsed = Math.round(100 * (performance.now() - this.start)) / 100;
    this.events.push([event, elapsed]);
    return elapsed;
  }

  getEvents(): { [key: string]: number } {
    const result: { [key: string]: number } = {};
    this.events.forEach(([eventName, time]) => (result[eventName] = time));
    return result;
  }
}

function isObject(data: Data): data is object {
  if (typeof data === "string") {
    return false;
  }
  if (typeof data === "number") {
    return false;
  }
  if (typeof data === "boolean") {
    return false;
  }
  return true;
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
      decodeMessage(input, route.inputValidator, route.registry),
      input.length,
    ];
  } catch (e) {
    return new Error(`Error extracting input on route: ${route.path}`, {
      cause: e,
    });
  }
}

function adaptHandler<I, O extends Data>(
  app: { webApp: express.Express; telemetry: Promise<TelemetryLogger> },
  route: ApiRoute<I, O>,
  handler: ApiHandler<I, O>
) {
  return (req: Request, res: Response) => {
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
    let body: O | undefined = undefined;
    handler(input, { log: (tag) => timer.event(tag) })
      .then((output) => {
        if (output === undefined || output === null) {
          return;
        }
        if (isObject(output) && Object.hasOwn(output, "serverErrorStatus")) {
          // @ts-ignore
          status = output.serverErrorStatus;
          return;
        }
        // @ts-ignore
        body = output;
      })
      .catch((reason) => {
        status = 500;
        console.debug(reason);
        body = reason;
      })
      .finally(() => {
        timer.event("handlerComplete");
        const result =
          body === undefined ? undefined : encodeMessage(body, route.registry);
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

export type PossibleError<T> = T | { serverErrorStatus: number };
export interface ServerExtras {
  log: (tag: string) => any;
}
export type ApiHandler<I, O> = (
  input: I,
  extras?: ServerExtras
) => Promise<PossibleError<O>>;
export interface RouteAndHandler<I, O> {
  route: ApiRoute<I, O>;
  handler: ApiHandler<I, O>;
}

export function addApi<I, O extends Data>(
  app: { webApp: express.Express; telemetry: Promise<TelemetryLogger> },
  routeAndHandler: RouteAndHandler<I, O>
): void {
  const route = routeAndHandler.route;
  const handler = routeAndHandler.handler;
  if (route.method === "GET") {
    app.webApp.get(`${route.path}/:input`, adaptHandler(app, route, handler));
    return;
  } else if (route.method === "POST") {
    app.webApp.post(route.path, adaptHandler(app, route, handler));
    return;
  }
  assert(false, `Unhandled method: ${route.method}`);
}
