import * as he from "he";

export interface DialogOptions {
  id: string;
  title: string;
  bodyHtml: string;
  actionsHtml?: string;
  ariaDescribedBy?: string;
  customClass?: string;
  hideCloseButton?: boolean;
}

/**
 * Renders a standard accessible HTML5 <dialog> wrapper.
 */
export function renderDialog(options: DialogOptions): string {
  const {
    id,
    title,
    bodyHtml,
    actionsHtml,
    ariaDescribedBy,
    customClass = "",
    hideCloseButton = false,
  } = options;

  const titleId = `${id}-title`;
  const describedByAttr = ariaDescribedBy
    ? ` aria-describedby="${he.escape(ariaDescribedBy)}"`
    : "";

  const closeButtonHtml = hideCloseButton
    ? ""
    : `<button type="button" class="v2-dialog-close-btn" aria-label="Close dialog" data-dialog-close>&times;</button>`;

  const actionsContainerHtml = actionsHtml
    ? `<div class="v2-dialog-actions">${actionsHtml}</div>`
    : "";

  const classes = ["v2-dialog", customClass].filter(Boolean).join(" ");

  return `
    <dialog id="${he.escape(id)}" class="${he.escape(
    classes
  )}" aria-labelledby="${titleId}"${describedByAttr}>
      <div class="v2-dialog-card">
        <div class="v2-dialog-header">
          <h2 id="${titleId}" class="v2-dialog-title">${he.escape(title)}</h2>
          ${closeButtonHtml}
        </div>
        <div class="v2-dialog-body">
          ${bodyHtml}
        </div>
        ${actionsContainerHtml}
      </div>
    </dialog>
  `.trim();
}

export interface ReportIssueDialogOptions {
  id?: string;
  defaultText?: string;
}

export const DEFAULT_REPORT_TEXT = "\n\nReporter: Anonymous";

/**
 * Builds the Report Issue dialog markup on top of the general dialog utility.
 */
export function renderReportIssueDialog(
  options: ReportIssueDialogOptions = {}
): string {
  const dialogId = options.id ?? "report-issue-dialog";
  const descId = `${dialogId}-desc`;
  const textareaId = `${dialogId}-textarea`;
  const defaultText = options.defaultText ?? DEFAULT_REPORT_TEXT;

  // In HTML5, the parser automatically strips the first leading newline immediately after <textarea>.
  // Three newlines in template ensures two leading newlines in rendered value.
  const escapedText = he.escape(defaultText.trimStart());
  const bodyHtml = `
    <p id="${descId}" class="v2-report-desc">
      Report an issue or share any feedback about the site.
      <strong>This report will be visible to the general public</strong>.
      Update the <code>Reporter</code> if you want to be contacted for further clarification or updates in this issue.
    </p>
    <form class="v2-report-form">
      <div class="v2-form-group">
        <label for="${textareaId}" class="v2-sr-only">Report text</label>
        <textarea
          id="${textareaId}"
          name="reportText"
          class="v2-textarea v2-report-textarea"
          rows="8"
          required
        >&#10;&#10;&#10;${escapedText}</textarea>
      </div>
      <div class="v2-report-status" aria-live="polite"></div>
      <div class="v2-dialog-actions">
        <button type="button" class="v2-btn v2-btn-secondary" data-dialog-close>Cancel</button>
        <button type="submit" class="v2-btn v2-btn-primary v2-report-submit-btn">
          <strong>Submit</strong>
        </button>
      </div>
    </form>
  `.trim();

  return renderDialog({
    id: dialogId,
    title: "Issues / Feedback",
    bodyHtml,
    ariaDescribedBy: descId,
    customClass: "v2-report-dialog",
  });
}
