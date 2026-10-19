# UI V2 Preferences

Where user preferences are stored, which ones get pre-paint treatment, and which side resolves them.
The original defect analysis (findings F1–F9) is archived in
[`archive/DICT_PREFERENCES_ANALYSIS.md`](archive/DICT_PREFERENCES_ANALYSIS.md).

> **One owner per preference. One canonical encoding. One resolution site.**

## Storage tiers

| Tier                               | Holds                                                            | Examples                                                                                    |
| :--------------------------------- | :--------------------------------------------------------------- | :------------------------------------------------------------------------------------------ |
| **URL**                            | ephemeral view state                                             | `dict`, `o`, `scale`: wins for the current render, never persisted without an explicit save |
| **Cookie**                         | anything that changes **what the server renders**                | Dictionaries, inflection                                                                    |
| **localStorage** + critical script | anything that only changes **how rendered content is presented** | Theme, highlight strength, page width                                                       |
| **localStorage**                   | client-only state the server never needs                         | Panel width, saved spots, per-work macra                                                    |

The line is content vs presentation, not "does the server want it":

- Dictionaries and inflection decide _which entries are queried and serialized into the HTML_. If
  the server gets them wrong, no client-side correction fixes the response; it has to re-fetch. They
  belong in a cookie, the only durable store SSR can read.
- Theme and highlight strength only restyle markup that is already correct, so an inline `<head>`
  script reading localStorage suffices. No cookie, no flash, no bytes on every request.

## Pre-paint is a scarce budget

The critical script is inlined into every HTML response: uncached, paid per page load, and it blocks
parsing. It is a **fixed-size applier**: owners in the bundle call `setPrepaint(name, value)`
([`core/dom/prepaint.client.ts`](../core/dom/prepaint.client.ts)) with the final `--custom-property` or
`data-*` value, and [`critical_theme.client.ts`](../shell/critical_theme.client.ts) only copies the
stored snapshot onto `<html>`. It never validates or maps values, so a new pre-paint preference costs
it 0 bytes; its size is enforced by the budget in
[`client_bundle_budget.ts`](../../../bundler/client_bundle_budget.ts).

Bytes are no longer the constraint, but work before first paint and CSS on `:root` still are, so
"Does it flash?" is the wrong admission test:

| Flash severity                    | Pre-paint?             | Examples                        |
| :-------------------------------- | :--------------------- | :------------------------------ |
| Changes **layout** (reflow / CLS) | ✅                     | font scale, density, page width |
| **High-contrast inversion**       | ✅                     | light ↔ dark theme              |
| Subtle colour / opacity shift     | ❌ leave to the bundle | highlight strength              |

Highlight strength sits below the bar (`--highlight-scale` only multiplies alpha), but it predates
the rule and costs no critical bytes, so it stays. Apply the rule to new additions.

Owners call `setPrepaint` on every connect with their current value, not only on change, so a stale
snapshot heals after one load. Theme is an ordinary snapshot entry too: `theme_toggle.client.ts`
owns `data-theme` (cleared when there is no saved choice, so the OS scheme applies), and the
critical script makes no direct reads.

An owner that already paints the live value inline on a narrower element (the reader splitter puts
`--dict-width` on `.reader-dict-panel`) calls `recordPrepaint` instead: it updates the snapshot but
skips the `<html>` write, which would restyle the whole document. `<html>` may then hold an older
value, so the owner must make sure nothing reads it there, and clear it with `setPrepaint(name, null)`
when it drops its inline value.

## The server resolves, the client adopts

For content preferences (cookie tier), the server has read every durable store, so the client
adopts the state in the server-rendered DOM instead of re-deriving it from its own copy. A
preference change that affects content takes effect through a round trip, which it
needs anyway, since the client has no data to re-render from. Presentation preferences stay instant.

## Saving content preferences

> **URL = ephemeral view state. Cookie = durable preference. The save marker = promote this view
> into a preference.**

The server can't tell "the user just ticked boxes" from "someone pasted a URL" by looking at the
settings params, so it never infers intent from them. The dictionary route
([`dict_persistence.server.ts`](../dict/settings/dict_persistence.server.ts)) applies these rules:

| Request                                                | Cookies                                        | Response                                          |
| :----------------------------------------------------- | :--------------------------------------------- | :------------------------------------------------ |
| `save=1` (the No-JS **Done** button)                   | the URL's settings                             | 303 to the URL minus `save`                       |
| `save=1` from a scoped view (`embedded`, `lang=`)      | in-scope dictionaries merged in; no inflection | 303 to the URL minus `save` and dictionary params |
| Any other full page load                               | the cookies' **own** values, re-sent           | renders the URL's view                            |
| Partial (`format=partial`), or scoped without `save=1` | none                                           | renders                                           |

- **The marker is a named submit button, not a hidden input.** Hidden inputs submit every time, so
  an ordinary search would save. It lives in the settings dialog's own form, outside the search
  form, so Enter in the search box can never save. The search form always carries hidden `d` / `o`
  for the rendered view, so a new search keeps what's on screen.
- **One dialog, both modes.** The settings are a `<dialog id="dict-settings">`. Without JS the tray
  button is a `#dict-settings` link and `:target` shows the dialog as a full-screen overlay; Done
  submits, Back leaves without changes. With JS it opens with `showModal()`, and content settings
  apply **when the dialog closes** (Done, Escape, close button, backdrop): one cookie write, one URL
  update, one fetch, one `dict-settings-commit` event, and nothing if nothing changed. Highlight
  strength is presentation only, so it stays live.
- **The 303 makes the marker last exactly one request.** A reload doesn't re-save, Back skips it,
  and a copied URL can't carry it.
- **The re-send is a sliding refresh.** JS saves with `document.cookie`, which Safari's ITP caps
  at 7 days. Re-sending on every full load turns it into an HTTP cookie with a fresh `Max-Age`.
- **Guest mode.** When the URL's settings differ from a saved cookie (`isGuestView`), the page
  shows them **read-only**: the tray says _Using link settings · Restore saved_,
  the dictionary and inflection controls are `disabled`, and Done only closes the dialog. So there's
  never a question of whether a change on someone else's link saves. Guest mode is sticky: hidden
  `d` / `o` fields (and, with JS, the adopted state) carry the link's settings into new searches
  until the user follows **Restore saved**, a plain link to the page without settings params. Users with
  no saved settings never see it.
- **Scoped views** (reader and macronizer iframes, `embedded=1`; any `lang=` lookup) share the one
  `morcus_d` preference with `/dicts`, as V1 did. Their lookup decides two things, and the
  settings dialog follows it:
  - **Dictionaries: scoped by `lang`.** The dialog shows only the dictionaries the lookup can query
    (`filterDictsByLang`; for the reader's `lang=La`, the five From-Latin ones). Saving, from
    either side, changes just those bits (`mergeDictKeysForSave`) and keeps the rest. The client
    merges against the cookie as it is when the dialog closes, so with `/dicts` and the reader
    open in two tabs only the in-scope bits are last-writer-wins. The No-JS settings form carries a
    hidden `lang` so the server applies the same mask, and its 303 drops the dictionary params so the
    new cookie is the only source.
  - **Inflection: the lookup's, never saved.** The reader forces `o=1`, so the dialog has no
    inflection toggle (a hidden `o` keeps the view's value through a No-JS save) and nothing
    writes `morcus_inflected`.
  - **A typed search leaves the scope.** A word typed into the reader's dictionary may be English
    or German, so the search drops `lang` and `d` and the server uses the full saved selection: the
    No-JS search form submits neither, and the JS client loads the page instead of fetching a
    partial (`applyUnscopedDictSearch`). Autocomplete suggests from that same full selection.
    Following a word in the results stays in scope.
  - **Guest mode** compares only what the view shows: the in-scope part of the saved dictionaries,
    and never inflection. **Restore saved** keeps `o`.
  - A passive scoped load (every reader word click) never writes cookies, not even the sliding
    refresh.
