import { reloadIfOldClient } from "@/web/client/components/page_utils";
import { useUnchangeable } from "@/web/client/utils/indexdb/hooks";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import { ApiRoute } from "@/web/utils/rpc/rpc";
import { useRef } from "react";

export interface UseApiCallArguments<O> {
  /**
   * Whether to automatically reload the page if the client version is not
   * up to date with the server. If you set this, ensure that all necessary state
   * is encoded in the URL.
   */
  reloadOldClient?: boolean;
  onResult: (result: O) => unknown;
  onLoading: () => unknown;
  onError: () => unknown;
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
