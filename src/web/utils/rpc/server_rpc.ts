import { assert } from "@/common/assert";
import { ApiCallData, TelemetryLogger } from "@/web/telemetry/telemetry";
import express, { Request, Response } from "express";
import { ApiRoute } from "./api_route";
import { decodeMessage, encodeMessage } from "./parsing";

type Data = boolean | string | number | object;

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
  start: number,
  telemetry: Promise<TelemetryLogger>
) {
  const finalData = {
    ...data,
    latencyMs: Math.round(performance.now() - start),
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

function extractInput<I, O>(req: Request, route: ApiRoute<I, O>): I | Error {
  try {
    return decodeMessage(findInput(req, route), route.inputValidator);
  } catch (e) {
    return new Error(`Error extracting input on route: ${route.path}`, {
      cause: e,
    });
  }
}

function adaptHandler<I, O extends Data>(
  app: { server: express.Express; telemetry: Promise<TelemetryLogger> },
  route: ApiRoute<I, O>,
  handler: ApiHandler<I, O>
) {
  return (req: Request, res: Response) => {
    const start = performance.now();
    console.debug(`[${Date.now() / 1000}] ${route.path}`);
    const input = extractInput(req, route);
    if (input instanceof Error) {
      res.status(400).send();
      logApi({ name: route.path, status: 400 }, start, app.telemetry);
      return;
    }

    let status: number = 200;
    let body: O | undefined = undefined;
    handler(input)
      .then((output) => {
        if (isObject(output) && Object.hasOwn(output, "serverErrorStatus")) {
          // @ts-ignore
          status = output.serverErrorStatus;
          return;
        }
        // @ts-ignore
        body = output;
      })
      .catch(() => {
        status = 500;
      })
      .finally(() => {
        const result = body === undefined ? undefined : encodeMessage(body);
        res.status(status).send(result);
        logApi(
          {
            name: route.path,
            status: status,
            params:
              route.method === "GET"
                ? { input: JSON.stringify(req.params.input) }
                : undefined,
          },
          start,
          app.telemetry
        );
      });
  };
}

export type PossibleError<T> = T | { serverErrorStatus: number };
export type ApiHandler<I, O> = (input: I) => Promise<PossibleError<O>>;
export interface RouteAndHandler<I, O> {
  route: ApiRoute<I, O>;
  handler: ApiHandler<I, O>;
}

export function addApi<I, O extends Data>(
  app: { server: express.Express; telemetry: Promise<TelemetryLogger> },
  routeAndHandler: RouteAndHandler<I, O>
): void {
  const route = routeAndHandler.route;
  const handler = routeAndHandler.handler;
  if (route.method === "GET") {
    app.server.get(`${route.path}/:input`, adaptHandler(app, route, handler));
    return;
  } else if (route.method === "POST") {
    app.server.post(route.path, adaptHandler(app, route, handler));
    return;
  }
  assert(false, `Unhandled method: ${route.method}`);
}
