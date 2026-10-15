import type { ServerMessage } from "@/web/utils/rpc/rpc";

/**
 * Wraps `t` in the `ServerMessage` envelope, stamped with this build's commit.
 * Build steps still write library works in this envelope (`process_library.ts`),
 * and UI V2 reads them back with `ServerMessage.validator`.
 */
export function serverMessage<T>(t: T): ServerMessage<T> {
  return {
    data: t,
    metadata: { commit: process.env.COMMIT_ID },
  };
}

/** Hooks a dictionary lookup can use to report timing (see `Dictionary`). */
export interface ServerExtras {
  log: (tag: string) => unknown;
}
