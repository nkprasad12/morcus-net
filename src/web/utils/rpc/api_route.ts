export type Validator<T> = (t: unknown) => t is T;

export type HttpMethod = "GET" | "POST";

export interface ApiRoute<I, O> {
  /** The path to this API route. */
  path: string;
  /** The HTTP request method, (e.g. GET). */
  method: HttpMethod;
  /** Validator for the input. */
  inputValidator: Validator<I>;
  /** Validator for the output. */
  outputValidator: Validator<O>;
}
