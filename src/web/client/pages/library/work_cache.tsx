import { ProcessedWork2, WorkId } from "@/common/library/library_types";
import { GetWork } from "@/web/api_routes";
import { callApi } from "@/web/utils/rpc/client_rpc";

let lastFetched: [WorkId, Promise<ProcessedWork2>] | undefined = undefined;

export function fetchWork(id: WorkId): Promise<ProcessedWork2> {
  const oldId = lastFetched?.[0];
  const needToFetch =
    oldId === undefined ||
    !(
      (oldId.id && oldId.id === id.id) ||
      (oldId.nameAndAuthor &&
        oldId.nameAndAuthor.urlAuthor === id.nameAndAuthor?.urlAuthor &&
        oldId.nameAndAuthor.urlName === id.nameAndAuthor.urlName)
    );
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
