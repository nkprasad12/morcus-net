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
    : `<button type="button" class="v2-dialog-close-btn" aria-label="Close dialog" data-dialog-close><svg class="v2-dialog-close-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></button>`;

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
  defaultReporter?: string;
}

export const DEFAULT_REPORT_TEXT = "";

/**
 * Builds the Report Issue dialog markup on top of the general dialog utility.
 */
export function renderReportIssueDialog(
  options: ReportIssueDialogOptions = {}
): string {
  const dialogId = options.id ?? "report-issue-dialog";
  const descId = `${dialogId}-desc`;
  const textareaId = `${dialogId}-textarea`;
  const reporterId = `${dialogId}-reporter`;
  const defaultText = options.defaultText ?? DEFAULT_REPORT_TEXT;
  const defaultReporter = options.defaultReporter ?? "";

  const escapedText = he.escape(defaultText);
  const escapedReporter = he.escape(defaultReporter);

  const bodyHtml = `
    <div id="${descId}" class="v2-report-notice">
      <svg class="v2-report-notice-icon" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
      <div class="v2-report-notice-text">
        <strong>This report will be visible to the general public</strong> on our GitHub issue tracker. Please do not submit private or sensitive information.
      </div>
    </div>
    <form class="v2-report-form">
      <div class="v2-form-group">
        <label for="${textareaId}" class="v2-form-label">
          Feedback or issue <span class="v2-required" aria-hidden="true">*</span>
        </label>
        <textarea
          id="${textareaId}"
          name="reportText"
          class="v2-textarea v2-report-textarea"
          rows="5"
          required
          placeholder="Describe what you noticed or would like to suggest..."
        >${escapedText}</textarea>
      </div>
      <div class="v2-form-group">
        <label for="${reporterId}" class="v2-form-label">
          Reporter <span class="v2-form-optional">(optional)</span>
        </label>
        <input
          type="text"
          id="${reporterId}"
          name="reporter"
          class="v2-input v2-report-reporter"
          placeholder="Name, GitHub handle, or email"
          value="${escapedReporter}"
          autocomplete="name"
        />
        <span class="v2-form-hint">Only needed if you want updates or clarification on GitHub.</span>
      </div>
      <div class="v2-report-status" aria-live="polite"></div>
      <div class="v2-dialog-actions">
        <button type="button" class="v2-btn v2-btn-secondary" data-dialog-close>Cancel</button>
        <button type="submit" class="v2-btn v2-btn-primary v2-report-submit-btn">
          <span class="v2-report-submit-spinner" aria-hidden="true"></span>
          <span class="v2-report-submit-text"><strong>Submit</strong></span>
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
