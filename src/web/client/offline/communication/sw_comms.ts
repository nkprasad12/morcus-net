import { checkPresent } from "@/common/assert";
import { exhaustiveGuard } from "@/common/misc_utils";
import {
  isSwChannel,
  type Channel,
  type ChannelRequest,
  type ChannelResponse,
} from "@/web/client/offline/communication/comms_types";

type Responder<T extends Channel> = (
  data: ChannelResponse<T>["data"]
) => unknown;
export type ChannelHandler<T extends Channel> = (
  req: ChannelRequest<T>,
  respond: Responder<T>
) => unknown;

function getResponder<T extends Channel>(
  req: ChannelRequest<T>,
  source: MessageEventSource
): Responder<T> {
  return (data) => {
    const response: ChannelResponse<T> = { channel: req.channel, data, req };
    source.postMessage(response);
  };
}

export function registerMessageListener(
  setActiveHandler: ChannelHandler<"SetActive">,
  prepareOfflineHandler: ChannelHandler<"PrepareOffline">
): () => void {
  const listener = (e: MessageEvent<any>) => {
    const channel: unknown = e.data?.channel;
    if (!isSwChannel(channel)) {
      return;
    }
    const source = checkPresent(e.source);
    switch (channel) {
      case "SetActive":
        setActiveHandler(e.data, getResponder(e.data, source));
        break;
      case "PrepareOffline":
        prepareOfflineHandler(e.data, getResponder(e.data, source));
        break;
      default:
        // This isn't reachable in a consistent state, but in case of a version
        // mismatch between the app bundle and the service worker,
        // it might be.
        getResponder(e.data, source)({ success: false });
        exhaustiveGuard(channel);
    }
  };
  addEventListener("message", listener);
  return () => removeEventListener("message", listener);
}
