import {
  BaseElement,
  registerElement,
  setupModalDialog,
  type ModalDialogHandle,
} from "@/web/ui/core/index.client";

/**
 * Progressively enhanced issue and feedback report dialog component (Light DOM mode).
 *
 * - In SSR / No-JS: The host carries `data-js-only`, mirroring `morcus-appearance-menu`, so no
 *   non-functional controls are presented to users without JS (or before upgrade).
 * - When defined: Coordinates the native <dialog> via `showModal()`, focus management,
 *   backdrop clicking, and AJAX form submission.
 */
class MorcusReportDialog extends BaseElement {
  #triggerBtn: HTMLButtonElement | null = null;
  #dialogEl: HTMLDialogElement | null = null;
  #dialogController: ModalDialogHandle | null = null;
  #formEl: HTMLFormElement | null = null;
  #textareaEl: HTMLTextAreaElement | null = null;
  #reporterInputEl: HTMLInputElement | null = null;
  #statusEl: HTMLElement | null = null;
  #submitBtn: HTMLButtonElement | null = null;

  protected override onConnect() {
    this.#enhanceMarkup();
  }

  #enhanceMarkup() {
    this.#triggerBtn = this.scope.$<HTMLButtonElement>(".report-btn");
    this.#dialogEl = this.scope.$<HTMLDialogElement>("dialog.report-dialog");
    this.#formEl = this.scope.$<HTMLFormElement>("form.report-form");
    this.#textareaEl = this.scope.$<HTMLTextAreaElement>(
      "textarea.report-textarea"
    );
    this.#reporterInputEl = this.scope.$<HTMLInputElement>(
      "input.report-reporter"
    );
    this.#statusEl = this.scope.$(".report-status");
    this.#submitBtn = this.scope.$<HTMLButtonElement>(".report-submit-btn");

    if (this.#dialogEl) {
      this.#dialogController = setupModalDialog(this.#dialogEl, {
        trigger: this.#triggerBtn,
        onOpen: () => {
          this.#clearStatus();
          this.scope.timeout(() => this.#textareaEl?.focus(), 50);
        },
        onClose: () => {
          this.#clearStatus();
          this.#triggerBtn?.focus();
        },
      });
      this.scope.use(this.#dialogController);
    }

    this.hijackForm("form.report-form", (data) => {
      void this.#submitReport(data.reportText || "", data.reporter || "");
    });

    if (this.#formEl) {
      this.scope.listen(this.#formEl, "keydown", this.#handleFormKeyDown);
    }
  }

  readonly #handleFormKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      // Ctrl/Cmd+Enter in our form calls requestSubmit()
      e.preventDefault();
      this.#formEl?.requestSubmit();
    }
  };

  readonly #clearStatus = () => {
    if (this.#statusEl) {
      this.#statusEl.className = "report-status";
      this.#statusEl.textContent = "";
    }
  };

  #resetForm() {
    if (this.#textareaEl) {
      this.#textareaEl.value = "";
    }
    if (this.#reporterInputEl) {
      this.#reporterInputEl.value = "";
    }
    if (this.#submitBtn) {
      this.#submitBtn.disabled = false;
      this.#submitBtn.classList.remove("loading");
    }
  }

  public openDialog() {
    this.#dialogController?.open();
  }

  public closeDialog() {
    this.#dialogController?.close();
  }

  readonly #submitReport = async (text: string, reporter?: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) {
      if (this.#statusEl) {
        this.#statusEl.className = "report-status error";
        this.#statusEl.textContent =
          "Please enter a message before submitting.";
      }
      this.#textareaEl?.focus();
      return;
    }

    let reportText = trimmedText;
    const trimmedReporter = reporter?.trim();
    if (trimmedReporter) {
      reportText = `${trimmedText}\n\nReporter: ${trimmedReporter}`;
    } else if (!/Reporter:\s*.+/i.test(trimmedText)) {
      reportText = `${trimmedText}\n\nReporter: Anonymous`;
    }

    if (this.#submitBtn) {
      this.#submitBtn.disabled = true;
      this.#submitBtn.classList.add("loading");
    }
    if (this.#statusEl) {
      this.#statusEl.className = "report-status";
      this.#statusEl.textContent = "Submitting report...";
    }

    try {
      // Deliberately not cancellable. This is a mutation, not a read: once the
      // user has hit submit we want the report to land even if the dialog is
      // dismissed or the element goes away.
      const response = await fetch("/api/report", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reportText,
          url: window.location.href,
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      if (this.#statusEl) {
        this.#statusEl.className = "report-status success";
        this.#statusEl.textContent =
          "✓ Thank you! Your report has been submitted.";
      }

      this.scope.timeout(() => {
        this.closeDialog();
        this.#resetForm();
      }, 1200);
    } catch (err) {
      console.error("Failed to submit issue report:", err);
      if (this.#statusEl) {
        this.#statusEl.className = "report-status error";
        this.#statusEl.textContent =
          "Error submitting report. Please check your connection and try again.";
      }
      if (this.#submitBtn) {
        this.#submitBtn.disabled = false;
        this.#submitBtn.classList.remove("loading");
      }
    }
  };
}

registerElement("morcus-report-dialog", MorcusReportDialog);

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-report-dialog": MorcusReportDialog;
  }
}
