import { LitElement } from "lit";
import { customElement } from "lit/decorators.js";

/**
 * Progressively enhanced issue and feedback report dialog component (Light DOM mode).
 *
 * - In SSR / No-JS: The entire element is hidden using `morcus-report-dialog:not(:defined) { display: none; }`,
 *   mirroring `morcus-theme-toggle` so no non-functional controls are presented to users without JS.
 * - When hydrated by Lit: Coordinates the native <dialog> via `showModal()`, focus management,
 *   backdrop clicking, and AJAX form submission.
 */
@customElement("morcus-report-dialog")
export class MorcusReportDialog extends LitElement {
  override createRenderRoot() {
    return this;
  }

  private triggerBtn: HTMLButtonElement | null = null;
  private dialogEl: HTMLDialogElement | null = null;
  private formEl: HTMLFormElement | null = null;
  private textareaEl: HTMLTextAreaElement | null = null;
  private reporterInputEl: HTMLInputElement | null = null;
  private statusEl: HTMLElement | null = null;
  private submitBtn: HTMLButtonElement | null = null;
  private closeButtons: NodeListOf<HTMLElement> | null = null;

  override connectedCallback() {
    super.connectedCallback();
    this.enhanceMarkup();
  }

  override disconnectedCallback() {
    super.disconnectedCallback();
    this.removeEventListeners();
  }

  private enhanceMarkup() {
    this.triggerBtn = this.querySelector<HTMLButtonElement>(".v2-report-btn");
    this.dialogEl = this.querySelector<HTMLDialogElement>(
      "dialog.v2-report-dialog"
    );
    this.formEl = this.querySelector<HTMLFormElement>("form.v2-report-form");
    this.textareaEl = this.querySelector<HTMLTextAreaElement>(
      "textarea.v2-report-textarea"
    );
    this.reporterInputEl = this.querySelector<HTMLInputElement>(
      "input.v2-report-reporter"
    );
    this.statusEl = this.querySelector<HTMLElement>(".v2-report-status");
    this.submitBtn = this.querySelector<HTMLButtonElement>(
      ".v2-report-submit-btn"
    );
    this.closeButtons = this.querySelectorAll<HTMLElement>(
      "[data-dialog-close]"
    );

    if (this.triggerBtn) {
      // Enable the button now that client JS is ready
      this.triggerBtn.removeAttribute("disabled");
      this.triggerBtn.addEventListener("click", this.handleTriggerClick);
    }

    if (this.dialogEl) {
      this.dialogEl.addEventListener("click", this.handleBackdropClick);
      this.dialogEl.addEventListener("cancel", this.handleCancel);
    }

    this.closeButtons?.forEach((btn) => {
      btn.addEventListener("click", this.handleCloseClick);
    });

    if (this.formEl) {
      this.formEl.addEventListener("submit", this.handleSubmit);
      this.formEl.addEventListener("keydown", this.handleFormKeyDown);
    }
  }

  private removeEventListeners() {
    if (this.triggerBtn) {
      this.triggerBtn.removeEventListener("click", this.handleTriggerClick);
    }
    if (this.dialogEl) {
      this.dialogEl.removeEventListener("click", this.handleBackdropClick);
      this.dialogEl.removeEventListener("cancel", this.handleCancel);
    }
    this.closeButtons?.forEach((btn) => {
      btn.removeEventListener("click", this.handleCloseClick);
    });
    if (this.formEl) {
      this.formEl.removeEventListener("submit", this.handleSubmit);
      this.formEl.removeEventListener("keydown", this.handleFormKeyDown);
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
    // When clicking the backdrop outside the dialog bounding box, target is the dialog element itself
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
    // Auto-focus feedback textarea on open
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

  private readonly handleSubmit = async (e: Event) => {
    e.preventDefault();
    const text = this.textareaEl?.value.trim() ?? "";
    if (!text) return;

    const reporter = this.reporterInputEl?.value.trim();
    let reportText = text;
    if (reporter) {
      reportText = `${text}\n\nReporter: ${reporter}`;
    } else if (!/Reporter:\s*.+/i.test(text)) {
      reportText = `${text}\n\nReporter: Anonymous`;
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

declare global {
  interface HTMLElementTagNameMap {
    "morcus-report-dialog": MorcusReportDialog;
  }
}
