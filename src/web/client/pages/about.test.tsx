/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { About } from "@/web/client/pages/about";
import user from "@testing-library/user-event";
import React from "react";
import { SettingsHandler } from "@/web/client/components/global_flags";

describe("About Page", () => {
  test("shows expected components", () => {
    render(<About />);

    expect(screen.getAllByText(/AGPL-3.0/)).toBeDefined();
    expect(screen.getAllByText(/Perseus/)).toBeDefined();
  });

  test("handles experiment toggle correctly", async () => {
    localStorage.setItem(
      "GlobalSettings",
      JSON.stringify({
        experimentalMode: true,
      })
    );

    render(
      <SettingsHandler>
        <About />
      </SettingsHandler>
    );
    expect(screen.getByRole("checkbox")).toHaveProperty("checked", true);

    await user.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("checkbox")).toHaveProperty("checked", false);
    const storage = JSON.parse(localStorage.getItem("GlobalSettings")!);
    expect(storage.experimentalMode).toBe(false);
  });
});
