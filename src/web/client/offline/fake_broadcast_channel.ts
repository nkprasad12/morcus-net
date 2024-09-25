import { assertEqual } from "@/common/assert";
import { arrayMap } from "@/common/data_structures/collect_map";

const globalListeners = arrayMap<
  FakeBroadcastChannel,
  [string, (e: any) => unknown]
>();

export class FakeBroadcastChannel {
  static cleanupAll() {
    globalListeners.map.clear();
  }

  private closed = false;

  constructor(private readonly channel: string) {}

  addEventListener(eType: string, listener: (e: any) => unknown) {
    assertEqual(this.closed, false);
    assertEqual(eType, "message");
    globalListeners.add(this, [this.channel, listener]);
  }

  removeEventListener(eType: string, listener: (e: any) => unknown) {
    assertEqual(this.closed, false);
    assertEqual(eType, "message");
    const listeners = globalListeners.get(this);
    if (listeners === undefined) {
      return;
    }
    for (let i = listeners.length - 1; i >= 0; i--) {
      if (listeners[i][1] === listener) {
        listeners.splice(i, 1);
      }
    }
  }

  close() {
    globalListeners.map.delete(this);
    this.closed = true;
  }

  postMessage(message: any) {
    for (const [channel, items] of globalListeners.map.entries()) {
      if (channel === this) {
        continue;
      }
      for (const [channelName, listener] of items) {
        if (channelName !== this.channel) {
          continue;
        }
        listener({ data: message });
      }
    }
  }
}
