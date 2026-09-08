import {
  renderDialog,
  renderReportIssueDialog,
} from "@/web/v2/dialog/dialog.server";

describe("dialog server utilities", () => {
  describe("renderDialog", () => {
    it("renders an accessible HTML5 dialog with default structure", () => {
      const html = renderDialog({
        id: "test-dialog",
        title: "Test Title",
        bodyHtml: "<p>Dialog body content</p>",
      });

      expect(html).toContain('<dialog id="test-dialog" class="v2-dialog"');
      expect(html).toContain('aria-labelledby="test-dialog-title"');
      expect(html).toContain(
        '<h2 id="test-dialog-title" class="v2-dialog-title">Test Title</h2>'
      );
      expect(html).toContain(
        '<button type="button" class="v2-dialog-close-btn" aria-label="Close dialog" data-dialog-close>'
      );
      expect(html).toContain('class="v2-dialog-close-icon"');
      expect(html).toContain("<p>Dialog body content</p>");
    });

    it("escapes title and custom classes safely", () => {
      const html = renderDialog({
        id: "safe-dialog",
        title: '<script>alert("xss")</script>',
        bodyHtml: "<span>Safe</span>",
        customClass: "custom-class",
      });

      expect(html).toContain(
        "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"
      );
      expect(html).toContain('class="v2-dialog custom-class"');
      expect(html).not.toContain("<script>");
    });

    it("supports optional aria-describedby and actions container", () => {
      const html = renderDialog({
        id: "desc-dialog",
        title: "Action Dialog",
        bodyHtml: '<p id="desc-id">Description</p>',
        ariaDescribedBy: "desc-id",
        actionsHtml: '<button type="button">OK</button>',
      });

      expect(html).toContain('aria-describedby="desc-id"');
      expect(html).toContain(
        '<div class="v2-dialog-actions"><button type="button">OK</button></div>'
      );
    });

    it("allows hiding close button", () => {
      const html = renderDialog({
        id: "no-close-dialog",
        title: "No Close",
        bodyHtml: "<p>Content</p>",
        hideCloseButton: true,
      });

      expect(html).not.toContain("v2-dialog-close-btn");
    });
  });

  describe("renderReportIssueDialog", () => {
    it("renders the Report an Issue dialog with required fields and public notice", () => {
      const html = renderReportIssueDialog();

      expect(html).toContain('id="report-issue-dialog"');
      expect(html).toContain('class="v2-dialog v2-report-dialog"');
      expect(html).toContain("Issues / Feedback");
      expect(html).toContain(
        "This report will be visible to the general public"
      );
      expect(html).toContain('form class="v2-report-form"');
      expect(html).toContain('name="reportText"');
      expect(html).toContain('name="reporter"');
      expect(html).toContain('class="v2-input v2-report-reporter"');
      expect(html).toContain("data-dialog-close");
      expect(html).toContain(
        'class="v2-btn v2-btn-primary v2-report-submit-btn"'
      );
    });

    it("supports custom dialog ID and custom default text", () => {
      const html = renderReportIssueDialog({
        id: "custom-report",
        defaultText: "Custom Reporter Note",
        defaultReporter: "Custom User",
      });

      expect(html).toContain('id="custom-report"');
      expect(html).toContain('aria-labelledby="custom-report-title"');
      expect(html).toContain('aria-describedby="custom-report-desc"');
      expect(html).toContain('id="custom-report-textarea"');
      expect(html).toContain("Custom Reporter Note");
      expect(html).toContain('id="custom-report-reporter"');
      expect(html).toContain("Custom User");
    });
  });
});
