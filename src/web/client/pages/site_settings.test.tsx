/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import React from "react";
import { SettingsHandler } from "@/web/client/components/global_flags";
import { SiteSettings } from "@/web/client/pages/site_settings";

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
    expect(screen.getByRole("checkbox")).toHaveProperty("checked", true);

    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
    const storage = JSON.parse(localStorage.getItem("GlobalSettings")!);
    expect(storage.experimentalMode).toBe(false);
  });
});
