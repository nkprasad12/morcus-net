/**
 * Reusable Combobox Controller (WAI-ARIA 1.2 Combobox Pattern).
 *
 * Encapsulates the WAI-ARIA combobox relationship between a text input and a
 * popup listbox, keyboard navigation with active-descendant focus management,
 * wrap-around arrow keys, selection on Enter / Tab, pointer focus retention,
 * and clean ARIA attribute teardown.
 */

import { BaseController } from "@/web/v2/core/base_element.client";

export const COMBOBOX_ATTRIBUTES: readonly string[] = [
  "role",
  "aria-autocomplete",
  "aria-controls",
  "aria-expanded",
  "aria-activedescendant",
] as const;

export interface ComboboxItem {
  /**
   * Whether this item can be chosen/picked by Enter/Tab/click.
   * Defaults to true if omitted or not "false". Status/help rows set this to false.
   */
  readonly selectable?: boolean;
}

export const CARET_KEYS: ReadonlySet<string> = new Set([
  "ArrowLeft",
  "ArrowRight",
  "Home",
  "End",
]);

export interface ComboboxControllerOptions<T = unknown> {
  /** Root node owning this controller (defaults to document). */
  root?: ParentNode;
  /** Returns the text input element. */
  getInput: () => HTMLInputElement | null;
  /** Returns the listbox element (e.g. <ul> or <ol>). */
  getListbox: () => HTMLElement | null;
  /** Called when a selectable option is chosen by Enter, Tab, or click. */
  onSelect: (item: T, index: number) => void;
  /** Optional custom item ID generator. Defaults to `${listbox.id}-${index}`. */
  getItemId?: (index: number, listbox: HTMLElement) => string;
  /**
   * Whether pressing Tab with a selectable item active accepts it instead
   * of advancing keyboard focus. Defaults to true.
   */
  acceptOnTab?: boolean;
  /**
   * Whether caret keys (ArrowLeft, ArrowRight, Home, End) trigger onRefresh
   * while open. Defaults to true.
   */
  followCaret?: boolean;
  /**
   * Optional callback when listbox opens or closes.
   */
  onVisibilityChange?: (open: boolean) => void;
  /**
   * Optional callback to request refresh of items (e.g. on input or caret move).
   */
  onRefresh?: () => void;
  /**
   * Optional predicate determining if an item can be selected.
   * Defaults to checking `item.selectable !== false`.
   */
  isSelectable?: (item: T) => boolean;
  /**
   * Optional callback to render or update items into listbox element before attributes are synced.
   */
  renderItems?: (items: readonly T[], listbox: HTMLElement) => void;
}

export class ComboboxController<T = unknown> extends BaseController {
  private readonly options: ComboboxControllerOptions<T>;
  private _items: readonly T[] = [];
  private _activeIndex = -1;
  private input: HTMLInputElement | null = null;
  private listbox: HTMLElement | null = null;
  private addedListboxId = false;
  private addedListboxRole = false;

  constructor(options: ComboboxControllerOptions<T>) {
    super(options.root ?? document);
    this.options = options;
  }

  public get items(): readonly T[] {
    return this._items;
  }

  public get activeIndex(): number {
    return this._activeIndex;
  }

  public get isOpen(): boolean {
    return (
      this.listbox !== null && !this.listbox.hidden && this._items.length > 0
    );
  }

  protected override onConnect(): void {
    this.ensureBound();
  }

  private ensureBound(): boolean {
    if (this.input && this.listbox) {
      return true;
    }

    const input = this.options.getInput();
    const listbox = this.options.getListbox();

    if (!input || !listbox) {
      return false;
    }

    this.input = input;
    this.listbox = listbox;

    if (!listbox.id) {
      listbox.id = `combobox-listbox-${Math.random().toString(36).slice(2, 9)}`;
      this.addedListboxId = true;
    }

    if (!listbox.getAttribute("role")) {
      listbox.setAttribute("role", "listbox");
      this.addedListboxRole = true;
    }
    listbox.hidden = true;

    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", listbox.id);
    input.setAttribute("aria-expanded", "false");

    const scope = this.scope;
    scope.listen(input, "focus", () => this.handleFocus());
    scope.listen(input, "input", () => this.handleInput());
    scope.listen(input, "click", () => this.handleClick());
    scope.listen(input, "keydown", (e) => this.handleKeyDown(e));
    if (this.options.followCaret !== false) {
      scope.listen(input, "keyup", (e) => {
        if (CARET_KEYS.has(e.key) && this.isOpen) {
          this.options.onRefresh?.();
        }
      });
    }
    scope.listen(input, "blur", () => this.close());
    if (input.form) {
      scope.listen(input.form, "submit", () => this.close());
    }
    scope.listen(listbox, "mousedown", (e) => this.handleMouseDown(e));

    // Adopt-before-write: if input is already focused at upgrade, trigger refresh
    if (input === this.ownerDocument.activeElement) {
      this.handleFocus();
    }

    return true;
  }

  protected override onDisconnect(): void {
    const input = this.input;
    const listbox = this.listbox;

    if (input) {
      for (const name of COMBOBOX_ATTRIBUTES) {
        input.removeAttribute(name);
      }
    }

    if (listbox) {
      if (this.addedListboxId) {
        listbox.removeAttribute("id");
        this.addedListboxId = false;
      }
      if (this.addedListboxRole) {
        listbox.removeAttribute("role");
        this.addedListboxRole = false;
      }
      listbox.hidden = true;
    }

    this._items = [];
    this._activeIndex = -1;
    this.input = null;
    this.listbox = null;
  }

  /**
   * Sets the current suggestions/options.
   * Manages listbox visibility, aria-expanded, item roles/IDs/aria-selected,
   * and resets activeIndex to -1.
   */
  public setItems(items: readonly T[]): void {
    this._items = items;
    this._activeIndex = -1;

    this.ensureBound();
    const input = this.input;
    const listbox = this.listbox;
    if (!input || !listbox) return;

    input.removeAttribute("aria-activedescendant");

    const count = items.length;
    const open = count > 0;

    if (this.options.renderItems) {
      this.options.renderItems(items, listbox);
    }

    listbox.hidden = !open;
    input.setAttribute("aria-expanded", String(open));

    this.options.onVisibilityChange?.(open);

    if (!open) return;

    this.syncItemAttributes();
  }

  /**
   * Synchronizes role="option", deterministic IDs, and aria-selected on child elements.
   */
  public syncItemAttributes(): void {
    const listbox = this.listbox;
    if (!listbox) return;

    const children = listbox.children;
    for (let i = 0; i < children.length; i++) {
      const child = children.item(i);
      if (!(child instanceof HTMLElement)) continue;

      if (!child.id) {
        child.id = this.options.getItemId
          ? this.options.getItemId(i, listbox)
          : `${listbox.id}-${i}`;
      }
      if (!child.getAttribute("role")) {
        child.setAttribute("role", "option");
      }
      const item = this._items[i];
      if (item && !this.isSelectable(i)) {
        child.setAttribute("aria-disabled", "true");
      }
      const isActive = i === this._activeIndex;
      child.setAttribute("aria-selected", String(isActive));
      child.classList.toggle("active", isActive);
    }
  }

  /** Closes the listbox, resets items, and removes aria-activedescendant. */
  public close(): void {
    if (this._items.length > 0 || this.isOpen) {
      this.setItems([]);
    }
  }

  /** Sets the active highlighted item index (-1 to clear highlight). */
  public setActiveIndex(index: number): void {
    const input = this.input;
    const listbox = this.listbox;
    if (!input || !listbox) return;

    if (this._activeIndex >= 0 && this._activeIndex < listbox.children.length) {
      const prevEl = listbox.children.item(this._activeIndex);
      prevEl?.setAttribute("aria-selected", "false");
      prevEl?.classList.remove("active");
    }

    this._activeIndex = index;

    const activeEl = index >= 0 ? listbox.children.item(index) : null;
    if (activeEl instanceof HTMLElement) {
      activeEl.setAttribute("aria-selected", "true");
      activeEl.classList.add("active");
      input.setAttribute("aria-activedescendant", activeEl.id);
      if (typeof activeEl.scrollIntoView === "function") {
        activeEl.scrollIntoView({ block: "nearest" });
      }
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  private isSelectable(index: number): boolean {
    const item = this._items[index];
    if (!item) return false;
    if (this.options.isSelectable) {
      return this.options.isSelectable(item);
    }
    if (typeof item === "object" && item !== null && "selectable" in item) {
      return Reflect.get(item, "selectable") !== false;
    }
    return true;
  }

  private choose(index: number): void {
    if (index < 0 || index >= this._items.length) return;
    const item = this._items[index];
    if (!this.isSelectable(index)) {
      this.setActiveIndex(-1);
      return;
    }
    this.options.onSelect(item, index);
  }

  private handleFocus(): void {
    this.options.onRefresh?.();
  }

  private handleInput(): void {
    this.options.onRefresh?.();
  }

  private handleClick(): void {
    this.options.onRefresh?.();
  }

  private handleKeyDown(e: KeyboardEvent): void {
    if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) {
      return;
    }

    switch (e.key) {
      case "ArrowDown":
      case "ArrowUp": {
        e.preventDefault();
        if (!this.isOpen) {
          this.options.onRefresh?.();
        }
        const currentCount = this._items.length;
        if (currentCount === 0) return;
        const step = e.key === "ArrowDown" ? 1 : -1;
        this.setActiveIndex(
          this._activeIndex < 0
            ? step > 0
              ? 0
              : currentCount - 1
            : (this._activeIndex + step + currentCount) % currentCount
        );
        return;
      }
      case "Enter": {
        if (this._activeIndex < 0) {
          // Nothing highlighted: let native form submit proceed.
          this.close();
          return;
        }
        e.preventDefault();
        this.choose(this._activeIndex);
        return;
      }
      case "Tab": {
        const accept = this.options.acceptOnTab ?? true;
        if (!accept || e.shiftKey || !this.isSelectable(this._activeIndex)) {
          this.close();
          return;
        }
        e.preventDefault();
        this.choose(this._activeIndex);
        return;
      }
      case "Escape": {
        if (this.isOpen) {
          e.preventDefault();
          this.close();
        }
        return;
      }
    }
  }

  private handleMouseDown(e: MouseEvent): void {
    // Keep focus in input
    e.preventDefault();
    if (e.button !== 0) return;

    const listbox = this.listbox;
    if (!listbox) return;

    const target = e
      .composedPath()
      .find(
        (node) => node instanceof HTMLElement && node.parentElement === listbox
      );

    if (target instanceof HTMLElement) {
      const idx = Array.from(listbox.children).indexOf(target);
      if (idx >= 0) {
        this.choose(idx);
      }
    }
  }
}
