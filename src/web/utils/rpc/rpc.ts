import { Serialization, Validator } from "./parsing";

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
  /**
   * Registry of serialization to use when encoding and decoding inputs.
   * This is only required for class objects that need to be revived after
   * transfer across the wire.
   */
  registry?: Serialization<any>[];
}
