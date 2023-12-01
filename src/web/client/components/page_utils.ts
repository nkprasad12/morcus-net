import { getCommitHash } from "@/web/client/define_vars";
import { ServerMessage } from "@/web/utils/rpc/rpc";

/**
 * Reloads the page if an old client is detected.
 *
 * @returns `true` if the page was reloaded and `false` otherwise.
 */
export function reloadIfOldClient<T>(message: ServerMessage<T>): void {
  const serverCommit = message.metadata?.commit;
  const clientCommit = getCommitHash();
  if (
    serverCommit !== undefined &&
    clientCommit !== "undefined" &&
    serverCommit !== clientCommit
  ) {
    location.reload();
  }
}
