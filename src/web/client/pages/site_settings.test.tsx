/**
 * @jest-environment jsdom
 */

import "fake-indexeddb/auto";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import { SettingsHandler } from "@/web/client/components/global_flags";
import { SiteSettings } from "@/web/client/pages/site_settings";
import { FakeBroadcastChannel } from "@/web/client/offline/fake_broadcast_channel";

// @ts-expect-error
global.BroadcastChannel = FakeBroadcastChannel;
console.debug = jest.fn();

afterAll(() => FakeBroadcastChannel.cleanupAll());

describe("Site Settings Page", () => {
  test("handles experiment toggle correctly", async () => {
    localStorage.setItem(
      "GlobalSettings",
      JSON.stringify({
        experimentalMode: true,
      })
    );

    render(
      <SettingsHandler>
        <SiteSettings />
      </SettingsHandler>
    );
    const checkbox = screen.getAllByRole("checkbox")[0];
    expect(checkbox).toHaveProperty("checked", true);

    await user.click(checkbox);
    expect(checkbox).toHaveProperty("checked", false);
    const storage = JSON.parse(localStorage.getItem("GlobalSettings")!);
    expect(storage.experimentalMode).toBe(false);
  });
});
