import { assert } from "@/common/assert";
import { decodeMessage } from "@/web/utils/rpc/parsing";
import type { ApiRoute } from "@/web/utils/rpc/rpc";

export interface RouteAndHandler<I, O> {
  route: ApiRoute<I, O>;
  handler: (i: I) => Promise<O>;
}

export namespace RouteAndHandler {
  export function create<I, O>(
    route: ApiRoute<I, O>,
    handler: (i: I) => Promise<O>
  ): RouteAndHandler<I, O> {
    return { route, handler };
  }
}

function findInput<I, O>(req: Request, route: ApiRoute<I, O>): string {
  assert(route.method === "GET");
  const url = new URL(req.url);
  assert(url.pathname.startsWith(route.path));
  // Get rid of the trailing backslash.
  return url.pathname.substring(route.path.length + 1);
}

export function extractInput<I, O>(
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
