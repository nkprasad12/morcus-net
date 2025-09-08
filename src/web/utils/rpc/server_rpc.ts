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

export function serverMessage<T>(t: T): ServerMessage<T> {
  return {
    data: t,
    metadata: { commit: process.env.COMMIT_ID },
  };
}

async function logApi(
  data: Omit<ApiCallData, "latencyMs">,
  timer: Timer,
  telemetry: Promise<TelemetryLogger>,
  userAgent: string | undefined
) {
  const finalData = {
    ...data,
    latencyMs: timer.event("end"),
    extras: timer.getEvents(),
    userAgent,
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

function validateRpcResponseType<
  I,
  O extends Data,
  T extends RouteDefinitionType
>(routeDefinition: RouteDefinition<I, O, T>, output: unknown) {
  const route = routeDefinition.route;
  if (
    routeDefinition.encodingMode === "PreStringified" &&
    typeof output !== "string"
  ) {
    throw {
      message:
        `Handler for route ${route.path} is marked as` +
        ` PreStringified, but returned a non-string result.`,
    };
  }
  if (
    routeDefinition.encodingMode === "PreEncoded" &&
    !Buffer.isBuffer(output)
  ) {
    throw {
      message:
        `Handler for route ${route.path} is marked as` +
        ` PreEncoded, but returned a non-buffer result.`,
    };
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
    const userAgent = req.header("User-Agent");
    const timer = new Timer();
    console.debug(`[${Date.now() / 1000}] ${route.path}`);
    const inputOrError = extractInput(req, route);
    timer.event("extractInputComplete");
    if (inputOrError instanceof Error) {
      res.status(400).send(inputOrError.message);
      logApi(
        { name: route.path, status: 400 },
        timer,
        app.telemetry,
        userAgent
      );
      return;
    }
    const [input, rawLength] = inputOrError;

    let status: number = 200;
    let body: O | string | Buffer | HandlerError | undefined = undefined;
    const acceptEncoding = req.header("Accept-Encoding");
    handler(input, { log: (tag) => timer.event(tag) }, { acceptEncoding })
      .then((output) => {
        if (output === undefined || output === null) {
          return;
        }
        validateRpcResponseType(routeDefinition, output);
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
          status === 200 && routeDefinition.encodingMode === "PreStringified";
        const isPreEncoded =
          status === 200 && routeDefinition.encodingMode === "PreEncoded";
        const result = isPreEncoded
          ? //  Due to `validateRpcResponseType`, we know that `body` is a Buffer in this branch.
            // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            (body as Buffer)
          : isPreStringified
          ? encodeMessage(
              serverMessage(DATA_PLACEHOLDER),
              route.registry
              // Due to `validateRpcResponseType`, we know that `body` is a string in this branch.
              // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
            ).replace(`"${DATA_PLACEHOLDER}"`, body as string)
          : encodeMessage(serverMessage(body), route.registry);
        timer.event("encodeMessageComplete");
        routeDefinition.reponseSetter?.(res, input);
        if (isPreEncoded && acceptEncoding?.includes("gzip")) {
          res.setHeader("Content-Encoding", "gzip");
          res.setHeader("Cache-Control", "immutable, no-transform");
        }
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
        logApi(telemetryData, timer, app.telemetry, userAgent);
      });
  };
}

export type HandlerError = {
  status: number;
  message: string;
};
export interface ServerExtras {
  log: (tag: string) => unknown;
}
export interface RequestData {
  acceptEncoding?: string;
}
export type ApiHandler<I, O> = (
  input: I,
  extras?: ServerExtras,
  requestData?: RequestData
) => Promise<O>;
export type PreStringifiedRpc = "PreStringified";
export type PreEncodedRpc = "PreEncoded";
export type RouteDefinitionType = undefined | PreStringifiedRpc | PreEncodedRpc;
export type ResponseSetter<I> = (res: Response, input: I) => unknown;

type HandlerType<I, O, T> = T extends PreStringifiedRpc
  ? ApiHandler<I, string>
  : T extends PreEncodedRpc
  ? ApiHandler<I, Buffer>
  : ApiHandler<I, O>;
interface RouteDefinitionBase<I, O, T extends RouteDefinitionType = undefined> {
  route: ApiRoute<I, O>;
  handler: HandlerType<I, O, T>;
  reponseSetter?: ResponseSetter<I>;
}
export type RouteDefinition<
  I,
  O,
  T extends RouteDefinitionType = undefined
> = RouteDefinitionBase<I, O, T> &
  (T extends PreStringifiedRpc
    ? { encodingMode: "PreStringified" }
    : T extends PreEncodedRpc
    ? { encodingMode: "PreEncoded" }
    : { encodingMode?: undefined });
export namespace RouteDefinition {
  export function create<I, O>(
    route: ApiRoute<I, O>,
    handler: ApiHandler<I, O>,
    encodingMode?: undefined,
    reponseSetter?: ResponseSetter<I>
  ): RouteDefinition<I, O>;
  export function create<I, O>(
    route: ApiRoute<I, O>,
    handler: ApiHandler<I, string>,
    encodingMode: "PreStringified",
    reponseSetter?: ResponseSetter<I>
  ): RouteDefinition<I, O, "PreStringified">;
  export function create<I, O>(
    route: ApiRoute<I, O>,
    handler: ApiHandler<I, Buffer>,
    encodingMode: "PreEncoded",
    reponseSetter?: ResponseSetter<I>
  ): RouteDefinition<I, O, "PreEncoded">;
  export function create<I, O, T extends RouteDefinitionType>(
    route: ApiRoute<I, O>,
    handler: HandlerType<I, O, T>,
    encodingMode?: T extends PreEncodedRpc
      ? "PreEncoded"
      : T extends PreStringifiedRpc
      ? "PreStringified"
      : undefined,
    reponseSetter?: ResponseSetter<I>
  ): RouteDefinition<I, O, T> {
    // @ts-ignore
    return { route, handler, encodingMode, reponseSetter };
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
