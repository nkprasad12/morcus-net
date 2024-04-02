import { ApiRoute, ServerMessage } from "@/web/utils/rpc/rpc";
import { decodeMessage, encodeMessage } from "@/web/utils/rpc/parsing";
import { timed } from "@/common/timing/timed_invocation";

const POST_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
};

/** Calls an API and returns the result and any response metadata. */
export async function callApiFull<I, O>(
  route: ApiRoute<I, O>,
  input: I
): Promise<ServerMessage<O>> {
  const message = timed(
    () => encodeMessage(input, route.registry, route.method === "GET"),
    `${route.path} encode`
  );
  const base = `${location.origin}${route.path}`;
  const address = route.method === "GET" ? `${base}/${message}` : base;
  const options =
    route.method === "GET"
      ? undefined
      : { method: route.method, headers: POST_HEADERS, body: message };

  const response = await fetch(address, options);
  if (!response.ok) {
    return Promise.reject(
      new Error(`Status ${response.status} on ${route.path}`)
    );
  }
  try {
    const result = await response.text();
    return timed(
      () =>
        decodeMessage(
          result,
          ServerMessage.validator(route.outputValidator),
          route.registry
        ),
      `${route.path} decode`
    );
  } catch (e) {
    return Promise.reject(
      new Error(`Unable to decode result from ${base}`, { cause: e })
    );
  }
}

/** Calls an API and returns the result. */
export async function callApi<I, O>(
  route: ApiRoute<I, O>,
  input: I
): Promise<O> {
  return callApiFull(route, input).then((result) => result.data);
}
