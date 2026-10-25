import {
  BaseElement,
  bindDismissable,
  copyOrNavigate,
  isPlainLeftClick,
  registerElement,
  scrollToElement,
  swapSlots,
  type QueryParamSync,
} from "@/web/ui/core/index.client";
import {
  CONTEXT_LEN,
  CORPUS_PATH,
  PAGE_SIZE,
  corpusUrl,
  readCorpusParams,
  type CorpusParams,
} from "@/web/ui/corpus/corpus_params.common";
import { CORPUS_SLOTS } from "@/web/ui/corpus/corpus_slots.common";

interface NavOptions {
  /** Add a history entry once the swap succeeds (false on popstate). */
  readonly push: boolean;
  /**
   * Scroll the results into view afterwards (link clicks). Focus is left to
   * `swapSlots`, which returns it to the same link via `data-focus-key`.
   */
  readonly scrollToResults: boolean;
}

/**
 * Progressive enhancement for `/corpus`.
 *
 * Without JS, the page is a GET form plus plain pager links. With JS, form
 * submits, the pager and the help's example links (all marked
 * `data-corpus-nav`) swap the result slots in place instead of loading a new
 * page; back/forward re-swaps. Every persistent control (the form and its
 * settings) is server-rendered and outside every slot, so this element never
 * builds or moves markup.
 */
class MorcusCorpusView extends BaseElement<"nav"> {
  #form: HTMLFormElement | null = null;
  #settings: HTMLDetailsElement | null = null;
  #router: QueryParamSync | null = null;
  #appliedParams: CorpusParams = {
    q: "",
    pageSize: PAGE_SIZE.default,
    contextLen: CONTEXT_LEN.default,
    strictMode: false,
  };

  protected override onConnect() {
    this.#settings = this.scope.$<HTMLDetailsElement>(
      "details.corpus-settings"
    );
    this.#form = this.hijackForm("form.corpus-form", (data) => {
      this.#appliedParams = readCorpusParams((name) => data[name]);
      if (this.#settings) this.#settings.open = false;
      const url = `${CORPUS_PATH}?${new URLSearchParams(data).toString()}`;
      void this.#navigate(url, { push: true, scrollToResults: false });
    });
    this.#appliedParams = this.#readInitialParams();

    if (this.#settings) {
      const settings = this.#settings;
      const summary = settings.querySelector<HTMLElement>("summary");
      this.scope.use(
        bindDismissable({
          container: settings,
          triggerEl: summary,
          isOpen: () => settings.open,
          onDismiss: () => {
            settings.open = false;
            this.#syncSettingsControls(this.#appliedParams);
          },
          listenPointerDown: true,
          doc: this.ownerDocument,
        })
      );
      this.scope.listen(settings, "toggle", () => {
        if (!settings.open) {
          this.#syncSettingsControls(this.#appliedParams);
        }
      });
    }

    this.scope.delegate<HTMLAnchorElement>(
      this,
      "click",
      "a.copy-pill",
      (e, pill) => {
        if (!(e instanceof MouseEvent) || !isPlainLeftClick(e)) return;
        // Copies the search permalink in place instead of navigating
        e.preventDefault();
        void copyOrNavigate(pill.href, "Copied link to this search", pill);
      }
    );

    this.scope.delegate<HTMLAnchorElement>(
      this,
      "click",
      "a[data-corpus-nav]",
      (e, link) => {
        if (!(e instanceof MouseEvent) || !isPlainLeftClick(e)) return;
        // Our nav links; navigate() swaps the result slots
        e.preventDefault();
        link.closest("details")?.removeAttribute("open");
        link.closest("details.corpus-help")?.removeAttribute("open");
        void this.#navigate(link.href, { push: true, scrollToResults: true });
      }
    );

    const onPopState = () => {
      void this.#navigate(window.location.href, {
        push: false,
        scrollToResults: false,
      });
    };
    this.#router = this.syncQueryParam("q", {
      onChange: onPopState,
      onNavigate: onPopState,
    });
  }

  /**
   * Swaps in the page for `href`. Resolves false if the swap was superseded
   * or fell back to a full navigation.
   */
  async #navigate(href: string, options: NavOptions): Promise<boolean> {
    const url = new URL(href, window.location.href);
    const path = url.pathname + url.search;
    const ok = await swapSlots(this, path, {
      signal: this.scope.latest("nav"),
      slots: CORPUS_SLOTS,
      versioned: true,
      // On popstate the URL is already the current entry.
      fallback: options.push ? undefined : (u) => window.location.replace(u),
    });
    if (!ok) return false;

    const params = readCorpusParams(
      (name) => url.searchParams.get(name) ?? undefined
    );
    if (options.push) {
      const current = window.location.pathname + window.location.search;
      const currentParams = readCorpusParams(
        (name) =>
          new URLSearchParams(window.location.search).get(name) ?? undefined
      );
      if (path === current || corpusUrl(params) === corpusUrl(currentParams)) {
        this.#router?.replaceUrl(url);
      } else {
        this.#router?.pushUrl(url);
      }
    }
    this.#syncControls(params);
    if (options.scrollToResults) {
      const summary =
        this.scope.$<HTMLElement>(".corpus-summary") ??
        this.scope.$<HTMLElement>('[data-slot="results"]');
      if (summary) {
        scrollToElement(summary, "instant");
        if (!summary.hasAttribute("tabindex")) {
          summary.setAttribute("tabindex", "-1");
        }
        summary.focus({ preventScroll: true });
      }
    }
    return true;
  }

  #field(name: string): HTMLInputElement | null {
    const el = this.#form?.elements.namedItem(name);
    return el instanceof HTMLInputElement ? el : null;
  }

  #readInitialParams(): CorpusParams {
    const search = new URLSearchParams(window.location.search);
    return readCorpusParams((name) => {
      const fromUrl = search.get(name);
      if (fromUrl !== null) return fromUrl;
      const el = this.#field(name);
      if (!el) return undefined;
      if (el.type === "checkbox") {
        return el.defaultChecked ? el.value : undefined;
      }
      return el.defaultValue || undefined;
    });
  }

  /** Makes the form show what the page now shows (links and popstate). */
  #syncControls(params: CorpusParams) {
    this.#appliedParams = params;
    const q = this.#field("q");
    if (q) {
      q.value = params.q;
      q.defaultValue = params.q;
    }
    this.#syncSettingsControls(params);
  }

  /** Restores the settings controls to the last applied parameters. */
  #syncSettingsControls(params: CorpusParams) {
    const contextLen = this.#field("contextLen");
    if (contextLen) {
      contextLen.value = String(params.contextLen);
      contextLen.defaultValue = String(params.contextLen);
    }
    const pageSize = this.#field("pageSize");
    if (pageSize) {
      pageSize.value = String(params.pageSize);
      pageSize.defaultValue = String(params.pageSize);
    }
    const strictMode = this.#field("strictMode");
    if (strictMode) {
      strictMode.checked = params.strictMode;
      strictMode.defaultChecked = params.strictMode;
    }
  }
}

registerElement("morcus-corpus-view", MorcusCorpusView);

declare module "@/web/ui/core/dom/js_gate.client" {
  interface MorcusElementTagNameMap {
    "morcus-corpus-view": MorcusCorpusView;
  }
}
