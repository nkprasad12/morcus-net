/**
 * @jest-environment jsdom
 */

import { ExternalContentReader } from "@/web/client/pages/library/external_content_reader";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";

describe("external reader", () => {
  it("shows items", async () => {
    render(<ExternalContentReader />);
    await screen.findByText(/Enter raw text below/);
  });

  it("allows import on click", async () => {
    render(<ExternalContentReader />);

    await user.click(screen.getByRole("textbox"));
    await user.type(screen.getByRole("textbox"), "Gallia est omnis");
    await user.click(screen.getByLabelText("Import text"));

    await screen.findByText(/Reading imported/);
    await screen.findByText("Gallia");
    await screen.findByText("est");
    await screen.findByText("omnis");
  });
});
