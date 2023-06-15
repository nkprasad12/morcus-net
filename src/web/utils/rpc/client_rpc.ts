import { ApiRoute } from "./api_route";
import { decodeMessage, encodeMessage } from "./parsing";

const POST_HEADERS = {
  "Content-Type": "text/plain; charset=utf-8",
};

export async function callApi<I, O>(
  route: ApiRoute<I, O>,
  input: I
): Promise<O> {
  const message = encodeMessage(input);
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
    return decodeMessage(result, route.outputValidator);
  } catch (e) {
    return Promise.reject(
      new Error(`Unable to decode result from ${base}`, { cause: e })
    );
  }
}
