/** Requests for notification permissions if needed.  */
export async function requestNotificationPermissions(): Promise<-1 | 0 | 1> {
  if (!("Notification" in window)) {
    return -1;
  }
  if (Notification.permission === "granted") {
    return 1;
  }
  // We need to ask the user for permission
  const permission = await Notification.requestPermission();
  return permission === "granted" ? 1 : 0;
}
