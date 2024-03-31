import { assert } from "@/common/assert";
import { reloadIfOldClient } from "@/web/client/components/page_utils";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import { ApiRoute } from "@/web/utils/rpc/rpc";
import { useRef } from "react";

function useUnchangeable<T>(
  candidate: NonNullable<T>,
  tag: string
): NonNullable<T> {
  const ref = useRef<T>();
  if (ref.current === undefined) {
    ref.current = candidate;
  } else {
    assert(
      candidate === ref.current,
      `${tag} must be the same across renders.`
    );
  }
  return candidate;
}

export interface UseApiCallArguments<O> {
  /**
   * Whether to automatically reload the page if the client version is not
   * up to date with the server. If you set this, ensure that all necessary state
   * is encoded in the URL.
   */
  reloadOldClient?: boolean;
  onResult: (result: O) => any;
  onLoading: () => any;
  onError: () => any;
}
export function useApiCall<I, O>(
  apiRoute: ApiRoute<NonNullable<I>, NonNullable<O>>,
  input: NonNullable<I> | null,
  args: UseApiCallArguments<O>
) {
  const route = useUnchangeable(apiRoute, "apiRoute");
  // Initialize to `null` so that if the user passes in a non-null initial input, we
  // will still kick off the fetch.
  const currentInput = useRef<NonNullable<I> | null>(null);
  // We don't need to track onLoading because it is invoked synchronously, but for
  // the others we need to make sure that when the fetch completes, we are invoking
  // the most up-to-date listener and *not* the previous ones,
  const onResult = useRef(args.onResult);
  const onError = useRef(args.onError);

  // Even if the API input doesn't change and we don't need to re-fetch, the callbacks may have changed.
  onResult.current = args.onResult;
  onError.current = args.onError;
  if (input === currentInput.current) {
    return;
  }
  currentInput.current = input;
  if (input === null) {
    return;
  }
  args.onLoading();

  const reloadOldClient = args?.reloadOldClient === true;
  callApiFull(route, input)
    .then((result) => {
      if (reloadOldClient) {
        reloadIfOldClient(result);
      }
      if (input === currentInput.current) {
        onResult.current(result.data);
      }
    })
    .catch((reason) => {
      console.debug(reason);
      if (input === currentInput.current) {
        onError.current();
      }
    });
}
