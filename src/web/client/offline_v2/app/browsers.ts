export type BrowserType =
  | "Chrome"
  | "Firefox"
  | "Edge"
  | "Safari"
  | "Opera"
  | "Samsung"
  | "Unknown";

export function isIOS(): boolean {
  // Edge sometimes may have iPhone-related content in the User Agent.
  // @ts-expect-error
  return /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
}

export function getBrowserType(): BrowserType {
  // Try User Agent Data (Modern Chromium)
  // @ts-expect-error
  if (navigator.userAgentData) {
    // @ts-expect-error
    const brands: string[] = navigator.userAgentData.brands.map((b) => b.brand);
    if (brands.includes("Microsoft Edge")) {
      return "Edge";
    }
    if (brands.includes("Opera")) {
      return "Opera";
    }
    if (brands.includes("Samsung Internet")) {
      return "Samsung";
    }
    if (brands.includes("Google Chrome")) {
      return "Chrome";
    }
  }

  // Fall back to classic User Agent (for other browsers)
  const ua = navigator.userAgent;
  if (ua.includes("Firefox")) {
    return "Firefox";
  }
  if (ua.includes("SamsungBrowser")) {
    return "Samsung";
  }
  // Safari detection (excluding Chrome/Edge on iOS which look like Safari)
  if (ua.includes("Safari") && !ua.includes("Chrome") && !ua.includes("Edge"))
    return "Safari";

  return "Unknown";
}
