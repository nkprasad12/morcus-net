import { BaseElement, registerElement } from "@/web/v2/core/index.client";

/**
 * Progressively enhanced issue and feedback report dialog component (Light DOM mode).
 *
 * - In SSR / No-JS: The entire element is hidden using `morcus-report-dialog:not(:defined) { display: none; }`,
 *   mirroring `morcus-theme-toggle` so no non-functional controls are presented to users without JS.
 * - When defined: Coordinates the native <dialog> via `showModal()`, focus management,
 *   backdrop clicking, and AJAX form submission.
 */
export class MorcusReportDialog extends BaseElement {
  private triggerBtn: HTMLButtonElement | null = null;
  private dialogEl: HTMLDialogElement | null = null;
  private formEl: HTMLFormElement | null = null;
  private textareaEl: HTMLTextAreaElement | null = null;
  private reporterInputEl: HTMLInputElement | null = null;
  private statusEl: HTMLElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;

  protected override onConnect() {
    this.enhanceMarkup();
  }

  private enhanceMarkup() {
    this.triggerBtn = this.$<HTMLButtonElement>(".v2-report-btn");
    this.dialogEl = this.$<HTMLDialogElement>("dialog.v2-report-dialog");
    this.formEl = this.$<HTMLFormElement>("form.v2-report-form");
    this.textareaEl = this.$<HTMLTextAreaElement>(
      "textarea.v2-report-textarea"
    );
    this.reporterInputEl = this.$<HTMLInputElement>("input.v2-report-reporter");
    this.statusEl = this.$(".v2-report-status");
    this.submitBtn = this.$<HTMLButtonElement>(".v2-report-submit-btn");

    if (this.triggerBtn) {
      this.triggerBtn.removeAttribute("disabled");
      this.listen(this.triggerBtn, "click", this.handleTriggerClick);
    }

    if (this.dialogEl) {
      this.listen(this.dialogEl, "click", this.handleBackdropClick);
      this.listen(this.dialogEl, "cancel", this.handleCancel);
    }

    this.$$("[data-dialog-close]").forEach((btn) => {
      this.listen(btn, "click", this.handleCloseClick);
    });

    this.hijackForm("form.v2-report-form", (data) => {
      this.submitReport(data.reportText || "", data.reporter || "");
    });

    if (this.formEl) {
      this.listen(this.formEl, "keydown", this.handleFormKeyDown);
    }
  }

  private readonly handleTriggerClick = (e: MouseEvent) => {
    e.preventDefault();
    this.openDialog();
  };

  private readonly handleCloseClick = (e: MouseEvent) => {
    e.preventDefault();
    this.closeDialog();
  };

  private readonly handleBackdropClick = (e: MouseEvent) => {
    if (e.target === this.dialogEl) {
      this.closeDialog();
    }
  };

  private readonly handleCancel = () => {
    this.clearStatus();
  };

  private readonly handleFormKeyDown = (e: KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      this.formEl?.requestSubmit();
    }
  };

  private readonly clearStatus = () => {
    if (this.statusEl) {
      this.statusEl.className = "v2-report-status";
      this.statusEl.textContent = "";
    }
  };

  private resetForm() {
    if (this.textareaEl) {
      this.textareaEl.value = "";
    }
    if (this.reporterInputEl) {
      this.reporterInputEl.value = "";
    }
    if (this.submitBtn) {
      this.submitBtn.disabled = false;
      this.submitBtn.classList.remove("loading");
    }
  }

  public openDialog() {
    if (typeof this.dialogEl?.showModal === "function") {
      this.dialogEl.showModal();
    } else if (this.dialogEl) {
      this.dialogEl.setAttribute("open", "");
    }
    this.clearStatus();
    setTimeout(() => {
      this.textareaEl?.focus();
    }, 50);
  }

  public closeDialog() {
    if (typeof this.dialogEl?.close === "function") {
      this.dialogEl.close();
    } else if (this.dialogEl) {
      this.dialogEl.removeAttribute("open");
    }
    this.clearStatus();
    this.triggerBtn?.focus();
  }

  private readonly submitReport = async (text: string, reporter?: string) => {
    const trimmedText = text.trim();
    if (!trimmedText) return;

    let reportText = trimmedText;
    const trimmedReporter = reporter?.trim();
    if (trimmedReporter) {
      reportText = `${trimmedText}\n\nReporter: ${trimmedReporter}`;
    } else if (!/Reporter:\s*.+/i.test(trimmedText)) {
      reportText = `${trimmedText}\n\nReporter: Anonymous`;
    }

    if (this.submitBtn) {
      this.submitBtn.disabled = true;
      this.submitBtn.classList.add("loading");
    }
    if (this.statusEl) {
      this.statusEl.className = "v2-report-status";
      this.statusEl.textContent = "Submitting report...";
    }

    try {
      const response = await fetch("/v2/api/report", {
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

      if (this.statusEl) {
        this.statusEl.className = "v2-report-status success";
        this.statusEl.textContent =
          "✓ Thank you! Your report has been submitted.";
      }

      setTimeout(() => {
        this.closeDialog();
        this.resetForm();
      }, 1200);
    } catch (err) {
      console.error("Failed to submit issue report:", err);
      if (this.statusEl) {
        this.statusEl.className = "v2-report-status error";
        this.statusEl.textContent =
          "Error submitting report. Please check your connection and try again.";
      }
      if (this.submitBtn) {
        this.submitBtn.disabled = false;
        this.submitBtn.classList.remove("loading");
      }
    }
  };
}

registerElement("morcus-report-dialog", MorcusReportDialog);

declare global {
  interface HTMLElementTagNameMap {
    "morcus-report-dialog": MorcusReportDialog;
  }
}
