/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import { About } from "@/web/client/pages/about";
import React from "react";

describe("About Page", () => {
  test("shows expected components", () => {
    render(<About />);

    expect(screen.getAllByText(/AGPL-3.0/)).toBeDefined();
    expect(screen.getAllByText(/Perseus/)).toBeDefined();
  });
});
