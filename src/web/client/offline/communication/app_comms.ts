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
  navigator.serviceWorker.addEventListener("message", (e) => {
    if (e.data?.channel !== req.channel) {
      return;
    }
    callback(e.data);
  });
  active.postMessage(req);
}
