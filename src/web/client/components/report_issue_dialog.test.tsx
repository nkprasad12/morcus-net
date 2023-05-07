/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import React from "react";
import { ReportIssueDialog } from "./report_issue_dialog";

const realFetch = global.fetch;

afterAll(() => {
  global.fetch = realFetch;
});

function replaceFetch(ok: boolean = true, text: string = "") {
  const mockFetch = jest.fn((request) =>
    Promise.resolve({
      text: () => Promise.resolve(text),
      ok: ok,
      request: request,
    })
  );
  // @ts-ignore
  global.fetch = mockFetch;
  return mockFetch;
}

describe("Report Issue Dialog", () => {
  it("is not shown when closed", async () => {
    const mockOnClose = jest.fn(() => {});
    render(<ReportIssueDialog show={false} onClose={mockOnClose} />);
    expect(screen.queryByText("Report an issue")).toBeNull();
  });

  it("is shown when open", async () => {
    const mockOnClose = jest.fn(() => {});
    render(<ReportIssueDialog show={true} onClose={mockOnClose} />);
    expect(screen.queryByText("Report an issue")).not.toBeNull();
  });

  it("calls close on cancel", async () => {
    const mockOnClose = jest.fn(() => {});
    render(<ReportIssueDialog show={true} onClose={mockOnClose} />);

    await user.click(screen.getByText("Cancel"));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("calls close and server on submit", async () => {
    const mockFetch = replaceFetch(true);
    const mockOnClose = jest.fn(() => {});
    render(<ReportIssueDialog show={true} onClose={mockOnClose} />);

    await user.click(screen.getByText("Submit"));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
