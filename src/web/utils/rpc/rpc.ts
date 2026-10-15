import {
  Validator,
  isString,
  matchesObject,
  maybeUndefined,
} from "@/web/utils/rpc/parsing";

export interface ServerMetadata {
  commit?: string;
}

export interface ServerMessage<T> {
  data: T;
  metadata?: ServerMetadata;
}

export namespace ServerMessage {
  export function validator<T>(
    innerValidator: Validator<T>
  ): Validator<ServerMessage<T>> {
    return matchesObject<ServerMessage<T>>({
      data: innerValidator,
      metadata: maybeUndefined(
        matchesObject<ServerMetadata>({ commit: maybeUndefined(isString) })
      ),
    });
  }
}
