/**
 * @jest-environment jsdom
 */

import { render, fireEvent, waitFor } from "@testing-library/react";
import { OfflineSettingsSection } from "@/web/client/offline/offline_settings_ui";
import { useOfflineSettings } from "@/web/client/offline/use_offline_settings";
import { sendToSw } from "@/web/client/offline/communication/app_comms";
import { registerServiceWorker } from "@/web/client/offline/sw_helpers";

jest.mock("@/web/client/offline/use_offline_settings");
jest.mock("@/web/client/offline/communication/app_comms");
jest.mock("@/web/client/offline/sw_helpers");

describe("OfflineSettingsSection", () => {
  const mockUseOfflineSettings = useOfflineSettings as jest.Mock;
  const mockRegisterServiceWorker = registerServiceWorker as jest.Mock;
  const mockSendToSw = sendToSw as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders initial checkbox", () => {
    mockUseOfflineSettings.mockReturnValue({});
    const { getByLabelText } = render(<OfflineSettingsSection />);

    expect(
      (getByLabelText("Offline Mode Enabled") as HTMLInputElement).checked
    ).toBe(false);
  });

  it("renders correct options when enabled", () => {
    mockUseOfflineSettings.mockReturnValue({
      offlineModeEnabled: true,
      shDownloaded: true,
      lsDownloaded: false,
      morceusDownloaded: false,
    });

    const { getByLabelText } = render(<OfflineSettingsSection />);

    expect(
      (getByLabelText("Offline Mode Enabled") as HTMLInputElement).checked
    ).toBe(true);
    expect((getByLabelText("Smith and Hall") as HTMLInputElement).checked).toBe(
      true
    );
    expect(
      (getByLabelText("Lewis and Short") as HTMLInputElement).checked
    ).toBe(false);
    expect(
      (getByLabelText("Latin Inflections") as HTMLInputElement).checked
    ).toBe(false);
  });

  it("handles service worker registration failure", async () => {
    mockUseOfflineSettings.mockReturnValue({
      offlineModeEnabled: true,
      shDownloaded: false,
    });
    mockRegisterServiceWorker.mockResolvedValue(0);

    const { getByLabelText, getByText } = render(<OfflineSettingsSection />);

    const checkbox = getByLabelText("Smith and Hall") as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(getByText("In progress: please wait")).not.toBeNull()
    );
    await waitFor(() => expect(mockRegisterServiceWorker).toHaveBeenCalled());
    await waitFor(() =>
      expect(
        getByText("Error: Service Worker registration failed.")
      ).not.toBeNull()
    );
  });

  it("handles download request change correctly", async () => {
    mockUseOfflineSettings.mockReturnValue({
      offlineModeEnabled: true,
      shDownloaded: false,
    });

    mockRegisterServiceWorker.mockResolvedValue(1);
    mockSendToSw.mockImplementation((message, callback) => {
      callback({ data: { complete: true, success: true } });
    });

    const { getByLabelText, getByText } = render(<OfflineSettingsSection />);

    const checkbox = getByLabelText("Smith and Hall") as HTMLInputElement;
    fireEvent.click(checkbox);

    await waitFor(() =>
      expect(getByText("In progress: please wait")).not.toBeNull()
    );
    await waitFor(() =>
      expect(mockSendToSw).toHaveBeenCalledWith(
        {
          channel: "OfflineSettingToggled",
          data: { settingKey: "shDownloaded", desiredValue: true },
        },
        expect.anything()
      )
    );
  });
});
