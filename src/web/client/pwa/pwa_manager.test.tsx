/** @jest-environment jsdom */
import { render, act, fireEvent, screen } from "@testing-library/react";
import {
  PwaManagerProvider,
  usePwaManager,
  isPwa,
} from "@/web/client/pwa/pwa_manager";

// Mock matchMedia
Object.defineProperty(window, "matchMedia", {
  writable: true,
  value: jest.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// Mock getInstalledRelatedApps
const mockGetInstalledRelatedApps = jest.fn();
Object.defineProperty(navigator, "getInstalledRelatedApps", {
  configurable: true,
  value: mockGetInstalledRelatedApps,
});

const TestConsumer = () => {
  const pwa = usePwaManager();
  return (
    <div>
      <div data-testid="is-pwa">{String(pwa.isPwa)}</div>
      <div data-testid="can-show-prompt">{String(pwa.canShowPrompt)}</div>
      <div data-testid="already-installed">{String(pwa.alreadyInstalled)}</div>
      <button onClick={() => pwa.tryToShowPrompt()} data-testid="prompt-btn">
        Prompt
      </button>
    </div>
  );
};

describe("pwa_manager", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetInstalledRelatedApps.mockResolvedValue([]);
  });

  test("isPwa returns correct value based on media match", () => {
    (window.matchMedia as jest.Mock).mockReturnValueOnce({ matches: true });
    expect(isPwa()).toBe(true);
    (window.matchMedia as jest.Mock).mockReturnValueOnce({ matches: false });
    expect(isPwa()).toBe(false);
  });

  test("provides initial state and detects install status", async () => {
    mockGetInstalledRelatedApps.mockResolvedValue([{ platform: "webapp" }]);

    render(
      <PwaManagerProvider>
        <TestConsumer />
      </PwaManagerProvider>
    );

    expect(screen.getByTestId("is-pwa").textContent).toBe("false");
    expect(screen.getByTestId("can-show-prompt").textContent).toBe("false");

    await act(async () => {
      // Wait for the useEffect trigger for isPwaInstalled
      await Promise.resolve();
    });

    expect(screen.getByTestId("already-installed").textContent).toBe("true");
  });

  test("handles beforeinstallprompt event", async () => {
    render(
      <PwaManagerProvider>
        <TestConsumer />
      </PwaManagerProvider>
    );

    const event = new Event("beforeinstallprompt") as any;
    event.prompt = jest.fn().mockResolvedValue({ outcome: "accepted" });
    event.preventDefault = jest.fn();

    await act(async () => {
      window.dispatchEvent(event);
    });

    expect(event.preventDefault).toHaveBeenCalled();
    expect(screen.getByTestId("can-show-prompt").textContent).toBe("true");
  });

  test("tryToShowPrompt triggers event prompt and clears state", async () => {
    render(
      <PwaManagerProvider>
        <TestConsumer />
      </PwaManagerProvider>
    );

    const event = new Event("beforeinstallprompt") as any;
    event.prompt = jest.fn().mockResolvedValue({ outcome: "accepted" });

    await act(async () => {
      window.dispatchEvent(event);
    });

    await act(async () => {
      fireEvent.click(screen.getByTestId("prompt-btn"));
    });

    expect(event.prompt).toHaveBeenCalled();
    expect(screen.getByTestId("can-show-prompt").textContent).toBe("false");
  });
});
