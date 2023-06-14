import { ApiRoute } from "./api_route";

export async function callApi<I, O>(
  route: ApiRoute<I, O>,
  input: I
): Promise<O> {
  const base = `${location.origin}${route.path}`;
  const address =
    route.method === "GET" ? `${base}/${JSON.stringify(input)}` : base;
  const options =
    route.method === "GET"
      ? undefined
      : {
          method: route.method,
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
          },
          body: JSON.stringify(input),
        };

  try {
    const response = await fetch(address, options);
    if (!response.ok) {
      throw Error(`Status ${response.status}`);
    }
    const result = await response.json();
    if (!route.outputValidator(result)) {
      console.error(result);
      throw Error(`Invalid output received.`);
    }
    return result;
  } catch (e) {
    throw e;
  }
}
