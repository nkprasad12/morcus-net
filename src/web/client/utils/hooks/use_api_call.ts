import { assert } from "@/common/assert";
import { reloadIfOldClient } from "@/web/client/components/page_utils";
import { callApiFull } from "@/web/utils/rpc/client_rpc";
import { ApiRoute } from "@/web/utils/rpc/rpc";
import { useMemo, useRef } from "react";

function useUnchangeable<T>(
  candidate: NonNullable<T>,
  tag: string
): NonNullable<T> {
  const ref = useRef<T | undefined>(undefined);
  if (ref.current === undefined) {
    ref.current = candidate;
  } else {
    assert(
      candidate === ref.current,
      `${tag} must be the same across renders. Use 'useMemo' or 'useCallback'.`
    );
  }
  return candidate;
}

export type ApiCallState = "Empty" | "Loading" | "Error" | "Success";

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
  route: ApiRoute<NonNullable<I>, NonNullable<O>>,
  input: NonNullable<I> | null,
  args: UseApiCallArguments<O>
) {
  const onLoading = useUnchangeable(args.onLoading, "args.onLoading");
  const onResult = args.onResult;
  const onError = args.onError;
  const currentInput = useRef<NonNullable<I> | null>(null);

  const reloadOldClient = args?.reloadOldClient === true;
  const resultPromise = useMemo(() => {
    if (input === null) {
      return null;
    }
    currentInput.current = input;
    onLoading();
    return callApiFull(route, input);
  }, [route, input, onLoading]);
  return useMemo(async () => {
    if (resultPromise === null) {
      return;
    }
    const expectedInput = currentInput.current;
    try {
      const result = await resultPromise;
      if (reloadOldClient) {
        reloadIfOldClient(result);
      }
      if (currentInput.current === expectedInput) {
        onResult(result.data);
      }
    } catch (error) {
      console.debug(error);
      if (currentInput.current === expectedInput) {
        onError();
      }
    }
  }, [resultPromise, reloadOldClient, onResult, onError]);
}
