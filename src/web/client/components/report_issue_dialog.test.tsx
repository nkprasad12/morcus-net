/**
 * @jest-environment jsdom
 */

import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import { ReportIssueDialog } from "@/web/client/components/report_issue_dialog";
import { callApi } from "@/web/utils/rpc/client_rpc";

jest.mock("@/web/utils/rpc/client_rpc");

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApi;

beforeEach(() => {
  mockCallApi.mockReset();
  mockCallApi.mockResolvedValue("");
});

const mockShowModal = jest.fn();
const mockClose = jest.fn();
beforeAll(() => {
  // js-dom doesn't yet support `dialog`.
  HTMLDialogElement.prototype.show = jest.fn();
  HTMLDialogElement.prototype.showModal = mockShowModal;
  HTMLDialogElement.prototype.close = mockClose;
});

describe("Report Issue Dialog", () => {
  it("is not shown when closed", async () => {
    const mockOnClose = jest.fn(() => {});
    render(<ReportIssueDialog show={false} onClose={mockOnClose} />);
    expect(mockShowModal).not.toHaveBeenCalled();
  });

  it("is shown when open", async () => {
    const mockOnClose = jest.fn(() => {});
    render(<ReportIssueDialog show onClose={mockOnClose} />);
    expect(mockShowModal).toHaveBeenCalled();
  });

  it("calls close on cancel", async () => {
    const mockOnClose = jest.fn(() => {});
    render(<ReportIssueDialog show onClose={mockOnClose} />);

    await user.click(screen.getByText("Cancel"));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
  });

  it("calls close and server on submit", async () => {
    const mockOnClose = jest.fn(() => {});
    render(<ReportIssueDialog show onClose={mockOnClose} />);

    await user.click(screen.getByText("Submit"));

    expect(mockOnClose).toHaveBeenCalledTimes(1);
    expect(mockCallApi).toHaveBeenCalledTimes(1);
  });
});
