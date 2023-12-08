import { ProcessedWork } from "@/common/library/library_types";
import { GetWork } from "@/web/api_routes";
import { callApi } from "@/web/utils/rpc/client_rpc";

let lastFetched: [string, Promise<ProcessedWork>] | undefined = undefined;

export function fetchWork(id: string): Promise<ProcessedWork> {
  const needToFetch = lastFetched === undefined || lastFetched[0] !== id;
  if (needToFetch) {
    const work = callApi(GetWork, id);
    lastFetched = [id, work];
    work.catch(() => {
      if (lastFetched && lastFetched[0] === id) {
        lastFetched = undefined;
      }
    });
  }
  return lastFetched![1];
}

export function invalidateWorkCache() {
  lastFetched = undefined;
}
