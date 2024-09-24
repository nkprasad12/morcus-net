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
  settingToggledListener: ChannelHandler<"OfflineSettingToggled">
): () => void {
  const listener = (e: MessageEvent<any>) => {
    const channel: unknown = e.data?.channel;
    if (!isSwChannel(channel)) {
      // This isn't reachable in a consistent state, but in case of a version
      // mismatch between the app bundle and the service worker,
      // it might be.
      getResponder(
        e.data,
        checkPresent(e.source)
      )({ complete: true, success: false });
      return;
    }
    const source = checkPresent(e.source);
    switch (channel) {
      case "OfflineSettingToggled":
        settingToggledListener(e.data, getResponder(e.data, source));
        break;
      default:
        exhaustiveGuard(channel);
    }
  };
  addEventListener("message", listener);
  return () => removeEventListener("message", listener);
}
