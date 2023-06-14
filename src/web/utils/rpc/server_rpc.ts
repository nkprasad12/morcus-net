import { assert } from "@/common/assert";
import { ApiCallData, TelemetryLogger } from "@/web/telemetry/telemetry";
import express, { Request, Response } from "express";
import { ApiRoute } from "./api_route";

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

function extractInput<I, O>(req: Request, route: ApiRoute<I, O>): unknown {
  if (route.method === "GET") {
    return req.params.input;
  } else if (route.method === "POST") {
    return req.body;
  }
  assert(false, `Unhandled method: ${route.method}`);
}

function adaptHandler<I, O extends Data>(
  app: { server: express.Express; telemetry: Promise<TelemetryLogger> },
  route: ApiRoute<I, O>,
  handler: (input: I) => Promise<O | { serverErrorStatus: number }>
) {
  return (req: Request, res: Response) => {
    const start = performance.now();
    console.debug(`[${Date.now() / 1000}] ${route.path}`);
    const input = extractInput(req, route);
    if (!route.inputValidator(input)) {
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
        res.status(status).send(body);
        logApi(
          {
            name: route.path,
            status: status,
            params: { input: JSON.stringify(req.params.input) },
          },
          start,
          app.telemetry
        );
      });
  };
}

export function addApi<I, O extends Data>(
  app: { server: express.Express; telemetry: Promise<TelemetryLogger> },
  route: ApiRoute<I, O>,
  handler: (input: I) => Promise<O | { serverErrorStatus: number }>
): void {
  if (route.method === "GET") {
    app.server.get(`${route.path}/:input`, adaptHandler(app, route, handler));
  } else if (route.method === "POST") {
    app.server.post(route.path);
  }
  assert(false, `Unhandled method: ${route.method}`);
}
