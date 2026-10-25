import { html, raw, type SafeHtml } from "@/web/ui/core/dom/html.common";
import { renderIconSvg } from "@/web/ui/core/widgets/icons.common";

interface DialogFormOptions {
  className?: string;
  action: string;
  method?: "GET" | "POST";
}

interface DialogOptions {
  id: string;
  title: string;
  bodyHtml: string;
  actionsHtml?: string;
  /**
   * Custom action control rendered in `.dialog-header` opposite the title, in place of the
   * default `×` close button.
   */
  headerActionHtml?: string;
  /**
   * Wraps `.dialog-header`, `.dialog-body`, and `.dialog-actions` inside `.dialog-card` in a
   * `<form>`, so a submit button in `headerActionHtml` belongs to the form natively without JS.
   */
  form?: DialogFormOptions;
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
    headerActionHtml,
    form,
    ariaDescribedBy,
    customClass = "",
    hideCloseButton = false,
    jsOnlyCloseButton = false,
  } = options;

  const titleId = `${id}-title`;
  const describedByAttr = ariaDescribedBy
    ? html` aria-describedby="${ariaDescribedBy}"`
    : "";

  const headerRightHtml =
    headerActionHtml !== undefined
      ? headerActionHtml
      : hideCloseButton
      ? ""
      : html`<button
          type="button"
          class="dialog-close-btn"
          aria-label="Close dialog"
          data-dialog-close
          ${jsOnlyCloseButton ? raw("data-js-only") : ""}>
          ${raw(
            renderIconSvg("close", {
              className: "dialog-close-icon",
              width: 18,
              height: 18,
            })
          )}
        </button>`;

  const actionsContainerHtml = actionsHtml
    ? html`<div class="dialog-actions">${raw(actionsHtml)}</div>`
    : "";

  const innerHtml = html`<div class="dialog-header">
      <h2 id="${titleId}" class="dialog-title">${title}</h2>
      ${raw(headerRightHtml)}
    </div>
    <div class="dialog-body">${raw(bodyHtml)}</div>
    ${raw(actionsContainerHtml)}`;

  const formClassAttr = form?.className ? html` class="${form.className}"` : "";
  const cardInnerHtml = form
    ? html`<form${raw(formClassAttr)} action="${form.action}" method="${
        form.method ?? "GET"
      }">${raw(innerHtml)}</form>`
    : innerHtml;

  const classes = ["dialog", customClass].filter(Boolean).join(" ");

  return html`<dialog
    id="${id}"
    class="${classes}"
    aria-labelledby="${titleId}"
    ${raw(describedByAttr)}>
    <div class="dialog-card">${raw(cardInnerHtml)}</div>
  </dialog>`;
}

interface ReportIssueDialogOptions {
  id?: string;
  defaultText?: string;
  defaultReporter?: string;
}

const DEFAULT_REPORT_TEXT = "";

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
      ${raw(
        renderIconSvg("info", {
          className: "report-notice-icon",
          width: 16,
          height: 16,
        })
      )}
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
