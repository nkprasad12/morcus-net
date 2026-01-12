/**
 * @jest-environment jsdom
 */

import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import { SettingsHandler } from "@/web/client/components/global_flags";
import { SiteSettings } from "@/web/client/pages/site_settings";
import { FakeBroadcastChannel } from "@/web/client/offline/fake_broadcast_channel";

// @ts-expect-error
global.BroadcastChannel = FakeBroadcastChannel;
console.debug = jest.fn();

afterAll(() => FakeBroadcastChannel.cleanupAll());

describe("Site Settings Page", () => {
  test("shows expected sections", async () => {
    render(
      <SettingsHandler>
        <SiteSettings />
      </SettingsHandler>
    );
    // Check for expected sections
    const appearanceSection = screen.getByText("Appearance").closest("details");
    expect(appearanceSection).not.toBeNull();

    // offline mode is lazy-loaded, wait for it to appear
    const offlineModeEl = await screen.findByText(
      "Offline Mode [Very Experimental]"
    );
    const offlineModeSection = offlineModeEl.closest("details");
    expect(offlineModeSection).not.toBeNull();
  });
});
