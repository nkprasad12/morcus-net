import { html, raw, type SafeHtml } from "@/web/v2/core/html.common";

export interface DialogOptions {
  id: string;
  title: string;
  bodyHtml: string;
  actionsHtml?: string;
  ariaDescribedBy?: string;
  customClass?: string;
  hideCloseButton?: boolean;
  /**
   * Marks the header close button `data-js-only`, for dialogs that also open without JS (via
   * `:target`), where a script-driven close button would do nothing.
   */
  jsOnlyCloseButton?: boolean;
}

/**
 * Renders a standard accessible HTML5 <dialog> wrapper.
 */
export function renderDialog(options: DialogOptions): SafeHtml {
  const {
    id,
    title,
    bodyHtml,
    actionsHtml,
    ariaDescribedBy,
    customClass = "",
    hideCloseButton = false,
    jsOnlyCloseButton = false,
  } = options;

  const titleId = `${id}-title`;
  const describedByAttr = ariaDescribedBy
    ? html` aria-describedby="${ariaDescribedBy}"`
    : "";

  const closeButtonHtml = hideCloseButton
    ? ""
    : html`<button
        type="button"
        class="dialog-close-btn"
        aria-label="Close dialog"
        data-dialog-close
        ${jsOnlyCloseButton ? raw("data-js-only") : ""}>
        <svg
          class="dialog-close-icon"
          viewBox="0 0 24 24"
          width="18"
          height="18"
          aria-hidden="true"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>`;

  const actionsContainerHtml = actionsHtml
    ? html`<div class="dialog-actions">${raw(actionsHtml)}</div>`
    : "";

  const classes = ["dialog", customClass].filter(Boolean).join(" ");

  return html`<dialog
    id="${id}"
    class="${classes}"
    aria-labelledby="${titleId}"
    ${raw(describedByAttr)}>
    <div class="dialog-card">
      <div class="dialog-header">
        <h2 id="${titleId}" class="dialog-title">${title}</h2>
        ${raw(closeButtonHtml)}
      </div>
      <div class="dialog-body">${raw(bodyHtml)}</div>
      ${raw(actionsContainerHtml)}
    </div>
  </dialog>`;
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
): SafeHtml {
  const dialogId = options.id ?? "report-issue-dialog";
  const descId = `${dialogId}-desc`;
  const textareaId = `${dialogId}-textarea`;
  const reporterId = `${dialogId}-reporter`;
  const defaultText = options.defaultText ?? DEFAULT_REPORT_TEXT;
  const defaultReporter = options.defaultReporter ?? "";

  const bodyHtml = html`<div id="${descId}" class="report-notice">
      <svg
        class="report-notice-icon"
        viewBox="0 0 24 24"
        width="16"
        height="16"
        aria-hidden="true"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round">
        <circle cx="12" cy="12" r="10"></circle>
        <line x1="12" y1="16" x2="12" y2="12"></line>
        <line x1="12" y1="8" x2="12.01" y2="8"></line>
      </svg>
      <div class="report-notice-text">
        <strong>This report will be visible to the general public</strong> on
        our GitHub issue tracker. Please do not submit private or sensitive
        information.
      </div>
    </div>
    <form class="report-form">
      <div class="form-group">
        <label for="${textareaId}" class="form-label">
          Feedback or issue <span class="required" aria-hidden="true">*</span>
        </label>
        <textarea
          id="${textareaId}"
          name="reportText"
          class="textarea report-textarea"
          rows="5"
          required
          placeholder="Describe what you noticed or would like to suggest...">
${defaultText}</textarea
        >
      </div>
      <div class="form-group">
        <label for="${reporterId}" class="form-label">
          Reporter <span class="form-optional">(optional)</span>
        </label>
        <input
          type="text"
          id="${reporterId}"
          name="reporter"
          class="input report-reporter"
          placeholder="Name, GitHub handle, or email"
          value="${defaultReporter}"
          autocomplete="name" />
        <span class="form-hint"
          >Only needed if you want updates or clarification on GitHub.</span
        >
      </div>
      <div class="report-status" aria-live="polite"></div>
      <div class="dialog-actions">
        <button type="button" class="btn btn-secondary" data-dialog-close>
          Cancel
        </button>
        <button type="submit" class="btn btn-primary report-submit-btn">
          <span class="report-submit-spinner" aria-hidden="true"></span>
          <span class="report-submit-text"><strong>Submit</strong></span>
        </button>
      </div>
    </form>`;

  return renderDialog({
    id: dialogId,
    title: "Issues / Feedback",
    bodyHtml,
    ariaDescribedBy: descId,
    customClass: "report-dialog",
  });
}
