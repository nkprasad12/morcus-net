import { useCallback, useState } from "react";

export type NotificationStatus = "Unsupported" | "Denied" | "Granted";

function notificationSupported(): boolean {
  return "Notification" in window;
}

function currentStatus(): NotificationStatus {
  if (!notificationSupported()) {
    return "Unsupported";
  }
  if (Notification.permission === "granted") {
    return "Granted";
  }
  return "Denied";
}

export function useNotificationPermission(): [
  NotificationStatus,
  () => Promise<NotificationStatus>
] {
  const [status, setStatus] = useState<NotificationStatus>(currentStatus());

  const requestPermission = useCallback(async () => {
    if (!notificationSupported()) {
      return "Unsupported";
    }
    const result = await Notification.requestPermission();
    const status = result === "granted" ? "Granted" : "Denied";
    setStatus(status);
    return status;
  }, []);

  return [status, requestPermission];
}
