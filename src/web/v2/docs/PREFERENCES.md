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
([`core/prepaint.client.ts`](../core/prepaint.client.ts)) with the final `--custom-property` or
`data-*` value, and [`critical_theme.client.ts`](../shell/critical_theme.client.ts) only copies the
stored snapshot onto `<html>`. It never validates or maps values, so a new pre-paint preference costs
it 0 bytes; its size is enforced by the budget in
[`v2_bundle_budget.ts`](../../../bundler/v2_bundle_budget.ts).

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
snapshot heals after one load. Theme is the one direct read left in the critical script, because V1
still writes `GlobalSettings`; drop it at graduation.

## The server resolves, the client adopts

For content preferences (cookie tier), the server has read every durable store, so the client
adopts the state in the server-rendered DOM instead of re-deriving it from its own copy. There is
no localStorage fallback and no migration path (V2 keeps no backwards compatibility; see
`AGENTS.md`). A preference change that affects content takes effect through a round trip, which it
needs anyway, since the client has no data to re-render from. Presentation preferences stay instant.

## Saving content preferences

> **URL = ephemeral view state. Cookie = durable preference. The save marker = promote this view
> into a preference.**

The server can't tell "the user just ticked boxes" from "someone pasted a URL" by looking at the
settings params, so it never infers intent from them. The dictionary route
([`dict_persistence.server.ts`](../dict/dict_persistence.server.ts)) applies these rules:

| Request                                                    | Cookies                              | Response                    |
| :--------------------------------------------------------- | :----------------------------------- | :-------------------------- |
| `save=1` (the No-JS **Apply** button)                      | the URL's settings                   | 303 to the URL minus `save` |
| Any other full page load                                   | the cookies' **own** values, re-sent | renders the URL's view      |
| Partial (`format=partial`) or scoped (`embedded`, `lang=`) | none                                 | renders                     |

- **The marker is a named submit button, not a hidden input.** Hidden inputs submit every time, so
  an ordinary search would save. Enter submits with the form's first submit button, so the search
  button must come first.
- **The 303 makes the marker last exactly one request.** A reload doesn't re-save, Back skips it,
  and a copied URL can't carry it.
- **The re-send is a sliding refresh.** JS saves with `document.cookie`, which Safari's ITP caps
  at 7 days. Re-sending on every full load turns it into an HTTP cookie with a fresh `Max-Age`.
- **Guest mode.** When the URL's settings differ from a saved cookie (`isGuestView`), the page
  shows them **read-only**: the tray says _Viewing this link's settings · Return to my settings_,
  the dictionary and inflection controls are `disabled`, and No-JS Apply is hidden. So there's
  never a question of whether a change on someone else's link saves. Guest mode is sticky: hidden
  `d` / `o` fields (and, with JS, the adopted state) carry the link's settings into new searches
  until the user follows **Return**, a plain link to the page without settings params. Users with
  no saved settings never see it. This also catches a No-JS user who changes settings and presses
  Enter instead of Apply; the result is the same, since nothing was saved.
- **Scoped views** (reader iframe, `lang=`) get `data-scoped` on the form and never save, from
  either side.
