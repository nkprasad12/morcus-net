import { checkPresent } from "@/common/assert";
import type {
  Channel,
  ChannelRequest,
  ChannelResponse,
} from "@/web/client/offline/communication/comms_types";

export async function sendToSw<T extends Channel>(
  req: Readonly<ChannelRequest<T>>,
  callback: (res: Readonly<ChannelResponse<T>>) => unknown
): Promise<void> {
  const reg = await navigator.serviceWorker.getRegistration();
  const active = checkPresent(reg?.active, "No active service worker!");
  const listener = (e: MessageEvent<ChannelResponse<T>>) => {
    if (e.data?.channel !== req.channel) {
      return;
    }
    if (e.data.data.complete === true) {
      navigator.serviceWorker.removeEventListener("message", listener);
    }
    callback(e.data);
  };
  navigator.serviceWorker.addEventListener("message", listener);
  active.postMessage(req);
}
