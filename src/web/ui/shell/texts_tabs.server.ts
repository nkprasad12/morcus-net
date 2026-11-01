/**
 * Server renderer for the **Texts** section tab bar
 * (**Library · Open Texts · Custom**; Decisions #13–#16).
 *
 * The top-bar **Texts** link (`page_shell.server.ts`) leads to this section;
 * each of its three pages renders this bar at the top of its content:
 * `/library` (`library.server.ts`), `/opentexts` (`open_texts.server.ts`) and
 * the `/externalReader` landing view (`external.server.ts`). Styled in
 * `library/library.css`, which `app.css` imports for every page.
 *
 * Plain links, so it works without JavaScript. Each tab carries both its full
 * label and its short mobile label; CSS shows one of them by viewport width.
 */

import {
  html,
  joinHtml,
  raw,
  type SafeHtml,
} from "@/web/ui/core/dom/html.common";
import {
  TEXTS_TABS,
  type RenderTextsTabBarFn,
  type TextsTabBarOptions,
  type TextsTabId,
  type TextsTabSpec,
} from "@/web/ui/shell/texts_tabs.common";

/** Tooltip hint for each tab's default badge (e.g. `"curated"`). */
function tabHint(spec: TextsTabSpec): string | undefined {
  const badge = spec.defaultBadge;
  return badge ? badge.charAt(0).toUpperCase() + badge.slice(1) : undefined;
}

function renderTab(
  spec: TextsTabSpec,
  isActive: boolean,
  badge: string | undefined
): SafeHtml {
  const hint = tabHint(spec);
  // Spelled out so `css_audit_conformance.test.ts` can match the classes.
  const linkAttrs = isActive
    ? 'class="texts-tab active" aria-current="page"'
    : 'class="texts-tab"';
  const titleAttr = hint ? html` title="${hint}"` : "";
  const badgeHtml = badge
    ? html`<span class="texts-tab-badge">${badge}</span>`
    : "";
  return html`<a href="${spec.href}" ${raw(linkAttrs)}${raw(titleAttr)}
    ><span class="texts-tab-label">${spec.label}</span
    ><span class="texts-tab-short">${spec.shortLabel}</span>${raw(badgeHtml)}</a
  >`;
}

/**
 * Renders the **Texts** section tab bar with `activeTab` highlighted and
 * marked `aria-current="page"`. `options.badges` adds a small count chip
 * (e.g. `"366"`) after a tab's label.
 */
export const renderTextsTabBar: RenderTextsTabBarFn = (
  activeTab: TextsTabId,
  options: TextsTabBarOptions = {}
): SafeHtml => {
  const tabs = TEXTS_TABS.map((spec) =>
    renderTab(spec, spec.id === activeTab, options.badges?.[spec.id])
  );
  return html`<nav class="texts-tabs" aria-label="Texts">
    ${joinHtml(tabs)}
  </nav>`;
};
