import {
  BaseElement,
  isPlainLeftClick,
  registerElement,
  swapSlots,
  type QueryParamSync,
} from "@/web/v2/core/index.client";
import {
  CORPUS_PATH,
  readCorpusParams,
  type CorpusParams,
} from "@/web/v2/corpus/corpus_params.common";
import {
  CORPUS_SLOTS,
  corpusPageTitle,
} from "@/web/v2/corpus/corpus_slots.common";

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
 * Progressive enhancement for `/v2/corpus` (DESIGN §5).
 *
 * Without JS, the page is a GET form plus plain pager links. With JS, form
 * submits, the pager and the help's example links (all marked
 * `data-corpus-nav`) swap the result slots in place instead of loading a new
 * page; back/forward re-swaps. Every persistent control (the form and its
 * settings) is server-rendered and outside every slot, so this element never
 * builds or moves markup.
 */
export class MorcusCorpusView extends BaseElement<"nav"> {
  private form: HTMLFormElement | null = null;
  private settings: HTMLDetailsElement | null = null;
  private router: QueryParamSync | null = null;

  protected override onConnect() {
    this.settings = this.scope.$<HTMLDetailsElement>("details.corpus-settings");
    this.form = this.hijackForm("form.corpus-form", (data) => {
      if (this.settings) this.settings.open = false;
      const url = `${CORPUS_PATH}?${new URLSearchParams(data).toString()}`;
      void this.navigate(url, { push: true, scrollToResults: false });
    });

    this.scope.delegate<HTMLAnchorElement>(
      this,
      "click",
      "a[data-corpus-nav]",
      (e, link) => {
        if (!(e instanceof MouseEvent) || !isPlainLeftClick(e)) return;
        e.preventDefault();
        void this.navigate(link.href, { push: true, scrollToResults: true });
      }
    );

    const onPopState = () => {
      void this.navigate(window.location.href, {
        push: false,
        scrollToResults: false,
      });
    };
    this.router = this.syncQueryParam("q", {
      onChange: onPopState,
      onNavigate: onPopState,
      title: corpusPageTitle,
    });
  }

  /**
   * Swaps in the page for `href`. Resolves false if the swap was superseded
   * or fell back to a full navigation.
   */
  private async navigate(href: string, options: NavOptions): Promise<boolean> {
    const url = new URL(href, window.location.href);
    const path = url.pathname + url.search;
    const ok = await swapSlots(this, path, {
      signal: this.scope.latest("nav"),
      slots: CORPUS_SLOTS,
      // On popstate the URL is already the current entry.
      fallback: options.push ? undefined : (u) => window.location.replace(u),
    });
    if (!ok) return false;

    const params = readCorpusParams(
      (name) => url.searchParams.get(name) ?? undefined
    );
    if (options.push) {
      const current = window.location.pathname + window.location.search;
      if (path === current) {
        window.history.replaceState(null, "", path);
      } else {
        window.history.pushState(null, "", path);
      }
      this.router?.updatePath(path);
      document.title = corpusPageTitle(params.q);
    }
    this.syncControls(params);
    if (options.scrollToResults) {
      const results = this.scope.$<HTMLElement>('[data-slot="results"]');
      if (typeof results?.scrollIntoView === "function") {
        results.scrollIntoView({ block: "start" });
      }
    }
    return true;
  }

  /** Makes the form show what the page now shows (links and popstate). */
  private syncControls(params: CorpusParams) {
    const field = (name: string) => {
      const el = this.form?.elements.namedItem(name);
      return el instanceof HTMLInputElement ? el : null;
    };
    const q = field("q");
    if (q) q.value = params.q;
    const contextLen = field("contextLen");
    if (contextLen) contextLen.value = String(params.contextLen);
    const pageSize = field("pageSize");
    if (pageSize) pageSize.value = String(params.pageSize);
    const strictMode = field("strictMode");
    if (strictMode) strictMode.checked = params.strictMode;
  }
}

registerElement("morcus-corpus-view", MorcusCorpusView);

declare global {
  interface HTMLElementTagNameMap {
    "morcus-corpus-view": MorcusCorpusView;
  }
}
