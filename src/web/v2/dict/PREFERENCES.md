# Dictionary Preferences

How dictionary-affecting preferences are stored and resolved today, the defects
that follow from it, and the model we are migrating towards.

Sections 1–2 describe current behaviour; 3–5 are the plan. Findings are
referenced as `F1`–`F9` from `TODOS.md` and from commit messages.

---

## 1. Current state

Four preferences affect how the dictionary renders, via four different mechanisms.

| Preference              | URL               | Cookie             | localStorage                       | Reaches SSR?                   |
| :---------------------- | :---------------- | :----------------- | :--------------------------------- | :----------------------------- |
| **Dictionaries**        | `dict`, `d`, `in` | `morcus_dicts`     | `SEARCH_SETTINGS_KEY`              | ✅                             |
| **Inflection**          | `o`               | `morcus_inflected` | `GlobalSettings.inflectedSearch`   | ✅                             |
| **Highlight strength**  | —                 | —                  | `GlobalSettings.highlightStrength` | pre-paint, via critical script |
| **Dict scale** (reader) | `scale`           | —                  | `morcus_reader_settings.dictScale` | ✅ via URL                     |

Resolution is implemented **twice, in different orders**:

|              | Server ([`dict_routes.server.ts`](./dict_routes.server.ts#L42-L60)) | Client ([`dict_settings.client.ts`](./dict_settings.client.ts#L81-L106)) |
| :----------- | :------------------------------------------------------------------ | :----------------------------------------------------------------------- |
| Dictionaries | URL → **cookie** → default                                          | URL → **localStorage** → default                                         |
| Inflection   | URL → **cookie** → `true`                                           | URL → **localStorage** → `true`                                          |

The two storage tiers are treated as interchangeable. They are not: `syncWithCookie()` writes the cookie **only when it is absent** ([`dict_preferences.client.ts:L37-46`](./dict_preferences.client.ts#L37-L46)), so once both exist and disagree, nothing reconciles them.

---

## 2. Findings

Root causes first; F3–F6 are consequences of F1 and F2.

**F1 — Resolution is implemented twice, with different precedence.** 🔴
Changing the rule means changing two files that already disagree in slot 2 (cookie vs localStorage). Nothing defines, in one place, what "the user's dictionaries" means.

**F2 — The client never reads the cookie's _value_, only its presence.** 🔴
`dictSettingsStore.get()` reads localStorage; `syncWithCookie()` calls `hasCookie()`. So the server sees URL + cookie, the client sees URL + localStorage, and neither sees both.

**F3 — Once the cookie and localStorage disagree, nothing reconciles them.** 🔴
`syncWithCookie()` sees the cookie _present_ and no-ops, then resolution falls through to localStorage, which wins on the client while the cookie wins on the server. The page shows one set of results with a different set ticked in the controls, and the next search uses the ticked set.

Divergence does not require switching between No-JS and JS. A JS user who follows someone else's `?d=` link gets a full page load, so the server writes `Set-Cookie` ([`dict_routes.server.ts:L68`](./dict_routes.server.ts#L68)) while their localStorage keeps their own selection — permanently split, with no code path that notices. A No-JS form submit produces the same split, but that is the rarer trigger, not the defining one.

**F4 — Cookie present but localStorage absent sends the client to the defaults.** 🔴
The client falls past the cookie it cannot read, all the way to `DEFAULT_DICT_KEYS`, while the server rendered the cookie's real selection. The next tick then saves defaults-plus-edit, destroying the preference.

Reachable by a pure-JS user. Safari purges all script-writable storage (localStorage **and** `document.cookie` cookies) after 7 days without interaction, while cookies set via HTTP `Set-Cookie` survive. The client normalizes the URL to `?d=` ([`dict_search.client.ts:L535`](./dict_search.client.ts#L535)), so any reload, restored tab or bookmark of that URL is a full page load that gets an HTTP `Set-Cookie` — the durable half of the pair — while the localStorage half is the one that gets purged.

**F5 — Hydration overwrites pre-hydration input.** 🟡
`enhanceMarkup()` sets `cb.checked` from re-derived state, discarding any box ticked before the bundle landed.

**F6 — The migration visit renders the wrong results.** 🟡
With no cookie, the server renders **default-dictionary results**. `syncWithCookie()` then writes the cookie and the checkboxes are set from localStorage, leaving the user's real selection in the controls above default-selection results. Nothing re-fetches; corrected only on the next navigation.

**F7 — The persistence guard is keyed on the wrong thing.** 🟡
[`dict_routes.server.ts:L66`](./dict_routes.server.ts#L66) skips cookie writes when `langParam` is present, using "has a lang filter" as a proxy for "this is a scoped view". The reader iframe is protected only incidentally, because it happens to send `lang=La`. `isEmbeddedRequest()` exists as a first-class concept and is not used here. If the reader stops sending `lang`, every passage read starts overwriting the user's inflection preference.

**F8 — Inflection has three stores and three defaulting rules.** 🟡
Server: `cookie !== "0"`. Client: `?? stored ?? true`. Cookie absent with localStorage `false` → server says on, client says off.

**F9 — One encoding too many, plus a dead one.** 🟢
Four representations of "a set of dictionaries" exist, but they are not four peer designs:

| Form                                     | Written by                                                                                                                                                       | Verdict                                                  |
| :--------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------- | :------------------------------------------------------- |
| `?dict=ls&dict=gaffiot`                  | the No-JS checkbox group (`name="dict"`, [`search_bar.server.ts:L55`](./search_bar.server.ts#L55))                                                               | forced — this is how browsers serialize a checkbox group |
| `?d=` base36 bitmask                     | the JS client ([`dict_search.client.ts:L535`](./dict_search.client.ts#L535)), which deletes `dict` when it sets `d`                                              | intended canonical URL form                              |
| `;`-joined                               | cookie and localStorage ([`dict_selection.common.ts:L19`](./dict_selection.common.ts#L19), [`dict_preferences.client.ts:L28`](./dict_preferences.client.ts#L28)) | gratuitous — could be the bitmask                        |
| `-`-joined, `&`→`n` (`formatDictsParam`) | **nothing**                                                                                                                                                      | dead code                                                |

The two URL forms are mode-forced and actively reconciled, so they are working as designed. `formatDictsParam` ([`dict_selection.server.ts:L31`](./dict_selection.server.ts#L31)) has no production caller at all — it is re-exported through `dict.server.ts` and exercised only by its own unit test. Deleting it, and moving storage onto the bitmask, leaves `?dict=` as a pure input adapter at the form boundary.

`parseDictKeys` stays deliberately tolerant (aliases, `;` `,` `-` delimiters) so old links keep working. That is an input adapter, not another encoding.

> [!NOTE]
> Shared links overwriting the recipient's preferences is the same family of problem but only touches the write path. It is tracked separately in [`dict/TODOS.md` §8](./TODOS.md).

---

## 3. Proposed model

> **One owner per preference. One canonical encoding. One resolution site.**

### Tiers, split by content vs presentation

| Tier                               | Holds                                                            | Examples                                                                                     |
| :--------------------------------- | :--------------------------------------------------------------- | :------------------------------------------------------------------------------------------- |
| **URL**                            | ephemeral view state                                             | `dict`, `o`, `scale` — wins for the current render, never persisted without an explicit save |
| **Cookie**                         | anything that changes **what the server renders**                | Dictionaries, inflection                                                                     |
| **localStorage** + critical script | anything that only changes **how rendered content is presented** | Theme, highlight strength                                                                    |
| **localStorage**                   | client-only state the server never needs                         | Panel width, saved spots, per-work macra                                                     |

The line is content vs presentation, not "does the server want it":

- Dictionaries and inflection determine _which entries are queried and serialized into the HTML_. If the server gets them wrong, no client-side correction fixes the response — it has to re-fetch. They belong in a cookie, the only durable store SSR can read.
- Theme and highlight strength only restyle markup that is already correct, so an inline `<head>` script reading localStorage suffices — which is what [`critical_theme.client.ts`](../shell/critical_theme.client.ts) already does. No cookie, no flash, no bytes on every request.

This tiering is already correct in the codebase. The defects come from dictionaries and inflection keeping a **redundant second copy** in localStorage.

### Pre-paint is a scarce budget

The critical script is inlined into every HTML response: uncached, paid per page load, and it blocks parsing. "Does it flash?" is the wrong admission test.

| Flash severity                    | Pre-paint?             | Examples                              |
| :-------------------------------- | :--------------------- | :------------------------------------ |
| Changes **layout** (reflow / CLS) | ✅                     | font scale, density, panel visibility |
| **High-contrast inversion**       | ✅                     | light ↔ dark theme                    |
| Subtle colour / opacity shift     | ❌ leave to the bundle | highlight strength                    |

Highlight strength sits below that bar — `--highlight-scale` only multiplies alpha ([`variables.css:L79-85`](../shell/variables.css#L79-L85)), so 50% → 80% moves a highlight from 0.105α to 0.168α — but it is already implemented, costs ~50 gzipped bytes, and removing it would require confirming no page outside the dictionary consumes the variable. Leave it; apply the rule to future additions instead.

### "The server resolves, the client adopts"

Neither side is omniscient (F2), so the question is which side knows more, and when. With the cookie present the server strictly dominates: it has read the durable store and the client is ignoring it. The only case where the client holds information the server could not have seen is **cookie absent but localStorage present** — precisely the condition `syncWithCookie()` already detects, and a _migration_ rather than a preference read.

```
cookie present            → adopt the SSR DOM        (server saw everything durable)
cookie absent, LS present → migrate: write the cookie, override the DOM, re-fetch results
neither                   → adopt the SSR DOM        (defaults)
```

The re-fetch in the middle branch is not optional (F6): on a migration visit the server also queried the wrong dictionaries, so correcting the checkboxes alone leaves correct controls above wrong results.

This keeps one resolution site in the steady state and confines localStorage to the migration path. The exception is precisely detectable — no heuristics, no "which is newer" arbitration.

### localStorage after the V1 cutover

V1 will never coexist with V2 on the same domain, so there is no compatibility obligation. `SEARCH_SETTINGS_KEY` and `GlobalSettings.inflectedSearch` become legacy data left behind by the cutover: read at most once, never written.

|                | Keep a one-shot migration                         | Drop localStorage now |
| :------------- | :------------------------------------------------ | :-------------------- |
| Existing users | keep their curated dictionary set                 | re-pick it once       |
| Code           | `syncWithCookie` stays, plus the missing re-fetch | both delete outright  |
| Endstate       | one store, after the shim retires                 | one store immediately |

The migration must be client-side, since the server cannot read localStorage, so it costs one corrected render on the cutover visit — cheapest paid by re-fetching the results partial.

---

## 4. Migration

Ordered so each step is independently shippable.

| #   | Step                                                                                                            | Closes             |
| :-- | :-------------------------------------------------------------------------------------------------------------- | :----------------- |
| 1   | Make the client adopt SSR state instead of re-deriving it                                                       | F1, F2, F3, F4, F5 |
| 2   | Re-key the persistence guard on an explicit `isScopedView` rather than `langParam`                              | F7                 |
| 3   | Reduce `syncWithCookie` to a dated one-shot migration, and give it the missing re-fetch                         | F6                 |
| 4   | Drop `GlobalSettings.inflectedSearch`; cookie becomes the only durable store, with one shared defaulting helper | F8                 |
| 5   | Delete `formatDictsParam` and its re-export — no production callers                                             | F9                 |
| 6   | Move cookie/localStorage onto the bitmask, leaving `?dict=` as a form-boundary adapter                          | F9                 |

Step 2 is small and independent — worth taking early regardless of the rest, since it removes a live trap.

---

## 5. Open decisions

**1. Is "the server resolves, the client adopts" the model?** _(blocking — steps 1 and 3 depend on it)_

It is the structural fix for F1–F5. The cost is that the client stops resolving preferences independently, which on inspection is smaller than it first appears:

- The cookie is sent automatically on every same-origin `fetch`, so a partial fetch resolves identically to a full page load without the client passing anything. Client-side navigation is unaffected.
- The real loss is that a dictionary or inflection change can never take effect _without_ a round trip. But those preferences change **which entries are queried and serialized**, so the client has no data to re-render from regardless. This is exactly the content/presentation line drawn in §3.
- Presentation preferences (theme, highlight strength) are untouched and stay instant.

The constraint only bites if we later want client-held dictionary state that may diverge from the cookie — which is the thing causing F1–F6 today.

**2. Preference continuity across the V1 → V2 cutover** — keep the one-shot migration, or let users re-pick once?

Scoped to dictionaries and inflection only. localStorage keeps everything in the bottom two tiers of §3 either way (theme, highlight strength, panel width, saved spots, per-work macra).

**3. Does `dictScale` stay a URL param?** It is the odd one out, but scoped view state for an iframe is what the URL tier is for. No change recommended.

### Not goals

Preference continuity **across** the No-JS / JS boundary. Users are expected to stay in one mode. F3 is kept because the same divergence is reachable without ever switching modes, not because mode-switching must work.
