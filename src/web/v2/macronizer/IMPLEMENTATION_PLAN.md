# Macronizer UI V2: implementation plan

**Status:** approved for implementation. **Audience:** whoever builds `/v2/macronizer`.
**Why it looks like this:** [macronizer_ui_research.md](RESEARCH.md) has the evidence (§1–§7) and the decision log (§8). This plan supersedes it wherever they disagree.
**Reference UI:** an interactive prototype (canned data, mock dictionary) was reviewed with the user; it isn't checked in. Where this plan describes a behaviour, the plan is the spec.
**Baseline:** written against `lit-prototype` @ `e3218552`; line references are as of that commit. Read [AGENTS.md](../../../../AGENTS.md), [src/web/v2/README.md](../../../../src/web/v2/README.md) , [docs/TESTING.md](../docs/TESTING.md) and [docs/NEW_FEATURE_GUIDE.md](../docs/NEW_FEATURE_GUIDE.md) first.

> [!IMPORTANT]
>
> These repo rules apply throughout:
>
> - V2 has no backwards compatibility.
> - Don't run `npm run integration-tests`.
> - Don't run the slow E2E or visual suites without asking.
> - **Never** update or commit screenshot baselines without the user's explicit approval (AGENTS.md §3).

---

## 0. The product in one paragraph

The user pastes Latin (≤ 10,000 chars) at `/v2/macronizer` and gets the macronized text in a two-pane page. On the left is the text. On the right is an inspector for the selected word, above an embedded dictionary.

- **Highlighting:** ambiguous words are highlighted by review tier.
- **Reviewing:** the user walks through them with **Enter** (keep the form shown, go to the next one) or picks another form from the card. Any word's macrons can be hand-edited.
- **Copying:** the result is copied with one button.
- **Without JS:** the whole workflow still works. Cards open via URL fragments, choices go back through an "Apply choices" POST, and the result is copied from an editable plain-text box.

## 1. Final decisions (summary)

| #       | Decision                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1      | Standalone page, own slice `src/web/v2/macronizer/`, chunk `dependOn: "common"`. No macronizer code in `reader/*`.                                                                                                                                                                                                                                                                                               |
| D2      | Ephemeral POST result (no PRG). The form is re-rendered prefilled.                                                                                                                                                                                                                                                                                                                                               |
| D3/D4   | `MacronizerEngine` seam injected via `createV2Router`. Chosen by `MACRONIZER_ENGINE`: `latincy` (requires `LATINCY_SERVER_ADDRESS`), `fake-latincy` (deterministic in-process tagger, labelled as simulated in the UI) or `off` (default; 503 for Macronize, Apply still works, §3.3; warns if `LATINCY_SERVER_ADDRESS` is set). Any other value fails startup. `./morcus.sh web` and CI E2E use `fake-latincy`. |
| D5      | No-JS choosing = "Apply choices" POST that re-runs **only the Morceus step** and overlays the first run's suggestions from a hidden `sug` field.                                                                                                                                                                                                                                                                 |
| D6/D17  | The focused word is the selected word. Enter keeps the form and goes to the next word; ↓ goes into the radios; Esc goes back. There's a "Keep _X_ and go to next ⏎" button. No cycling shortcut, no modifier clicks, no "Accept all".                                                                                                                                                                            |
| D7      | **Drop V1's `contentEditable`.** Hand-editing is covered by D22.                                                                                                                                                                                                                                                                                                                                                 |
| D8      | One limit: 10,000 chars. Enforced on the server, plus `maxlength`.                                                                                                                                                                                                                                                                                                                                               |
| D9      | No app-bar link.                                                                                                                                                                                                                                                                                                                                                                                                 |
| D10     | On the result page, the form sits in a collapsed, prefilled `<details>`.                                                                                                                                                                                                                                                                                                                                         |
| D11     | Unknown words get a card and look up the original spelling.                                                                                                                                                                                                                                                                                                                                                      |
| D13     | Copy: with JS, a Copy button (NFC). Without JS, an **editable** plain-text box.                                                                                                                                                                                                                                                                                                                                  |
| D14     | The server renders the word markup. There is no client tokenizer.                                                                                                                                                                                                                                                                                                                                                |
| D15/D16 | Wide screens: fixed 380 px right column. Narrow screens with JS: bottom drawer with a peek. Narrow without JS: stacked panes. No resizable divider in v1.                                                                                                                                                                                                                                                        |
| D18     | **No radio is pre-checked.** The cards use "suggested" and "in text" badges instead. A word counts as chosen once any radio is checked or it has been kept or edited.                                                                                                                                                                                                                                            |
| D19     | Selecting a word or choosing a form loads that form in the dictionary.                                                                                                                                                                                                                                                                                                                                           |
| D20     | Review tiers: 1 no suggestion, 2 weak, 3 tied, 4 confident, 5 unknown. **Staged:** ship 1 vs (2–4) first; split 2–4 after the benchmark.                                                                                                                                                                                                                                                                         |
| D21     | Reclassify unknown tokens that are Roman numerals, abbreviations or letterless as plain. Flag all-caps known words that are also valid numerals (_VI_).                                                                                                                                                                                                                                                          |
| D22     | "Edit macrons" on every card (vowel toggles). Collapsed by default, open for unknown words. With JS, plain words get a shared card filled in by the script.                                                                                                                                                                                                                                                      |
| E14     | Strip format characters (`\p{Cf}`, e.g. soft hyphen) inside the macronizer preprocessor. Letterless tokens become separators.                                                                                                                                                                                                                                                                                    |

---

## 2. Backend changes (`src/macronizer/`, `src/nlp/`)

All of this lands in **PR 1** (§9), before any UI work. The V1 `/api/macronize` route keeps working; V1 is otherwise out of scope (§2.6).

### 2.1 Split the pipeline

Today `macronizeInput(text, useStanza?)` ([morcronizer.ts L251–266](../../../../src/macronizer/morcronizer.ts#L251-L266)) runs `preprocessText` → `latincyAnalysis` → `attachGuesses`. Split it into two pure steps and an injected tagger:

```ts
// morcronizer.ts (names indicative)
export type Tagger = (
  words: string[],
  spaces: boolean[]
) => Promise<LatinToken[]>;

/** Morceus only: tokens, forms, lemma/morph, D21 reclassification, numeral option. Deterministic. */
export function analyzeWithMorceus(text: string): MorceusAnalysis;

/** Adds `suggested` + `confidence` from tagger output. Pure. */
export function attachGuesses(
  analysis: MorceusAnalysis,
  tags: LatinToken[]
): MacronizedResult;

/** Morceus result with no suggestions (the Apply path overlays its own). */
export function toUnsuggestedResult(
  analysis: MorceusAnalysis
): MacronizedResult;

export async function macronizeInput(
  text: string,
  tagger: Tagger = latincyTagger
): Promise<MacronizedResult>;
```

- `macronizeInput` keeps its V1 behaviour for its existing callers: `start_server.ts` L258 and `benchmarking.ts` L207/L226. Keep `useStanza` working for the benchmark: pass a stanza tagger instead of the boolean, or keep the overload.
- `morcronizer.test.ts` already mocks `latincyAnalysis`. Move it onto the injected tagger.
- **Determinism test:** the same `text` gives the same token array, and so the same word indices, from `analyzeWithMorceus` and from `macronizeInput`. The Apply form depends on this.

### 2.2 Result type additions (`src/web/api_routes.ts`)

```ts
MacronizedWord = {
  word: string;
  options: { form: string; kind?: "numeral"; options: { lemma: string; morph: string[] }[] }[];
  suggested?: number;
  confidence?: "weak" | "tied" | "confident"; // present iff `suggested` is
};
```

- **Tier mapping**, a pure helper in the V2 slice:
  - ambiguous with no `suggested` → **1**
  - `weak` → **2**
  - `tied` → **3**
  - `confident` → **4**
  - `options.length === 0` → **5**
  - A word with exactly one form is plain and has no tier.
- **Index:** a word's index `N` is its position in the `MacronizedResult` array, counting string separators too. That's what the prototype uses.

### 2.3 Confidence in `findBestMatch` (D20)

`findBestMatch` ([L108–146](../../../../src/macronizer/morcronizer.ts#L108-L146)) returns the first match. Change it to count:

- **Pass 1 (lemma + compatible morph), exactly one matching form** → `confident`.
- **Pass 1, more than one matching form** → `tied`, still suggesting the first match. Keep looping instead of returning early.
- **Only pass 2 (exact morph only) matched** → `weak`.
- **No match** → no `suggested`, no `confidence`.

Unit-test each branch with hand-built tags. The tier split is **staged**: the backend emits all three values from day one. The v1 UI renders 2–4 the same way (same look, same queue tier) until the benchmark has measured each tier's error rate (PR 7).

### 2.4 E14: format characters and letterless tokens

In `preprocessText` ([text_tokenization.ts](../../../../src/nlp/text_tokenization.ts)), which only morcronizer calls. Leave the shared `processTokens` alone.

- **Format characters:** strip `\p{Cf}` from each word before crunching. The output keeps the **original** spelling for `word`. Forms are built from the stripped word.
- **Letterless tokens:** a token with no `\p{L}` is emitted as a separator string, not a word.
- **Tests:** `tem\u00ADpus` is known; a run of U+00AD is a separator.

### 2.5 D21: non-words and the numeral flag

This lives in `analyzeWithMorceus` and is deterministic, so Apply gets it too.

1. **Only touch tokens Morceus doesn't know** (`options.length === 0`). These are reclassified as **plain separators** (string tokens):
   - Strict Roman-numeral grammar, case-insensitive:
     `^M{0,4}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$`. Reject the empty match.
   - A single letter, or a praenomen abbreviation from a fixed list (`A. C. Cn. D. L. M. M'. P. Q. Ser. Sex. Sp. T. Ti.`, plus any single letter), **immediately followed by `.`** in the next separator.
2. **Numeral flag:** a word Morceus _does_ know that is all caps and valid numeral grammar (_VI_, _DI_, _MI_, _CI_, _I_, _V_) gets an extra option appended:
   `{ form: <original>, kind: "numeral", options: [] }`.
   - This makes it ambiguous with no suggestion (tier 1).
   - In the guess step the numeral option is always left unsuggested, whatever the tagger says. LatinCy's `NUM` tag is unreliable: it tags the imperative _I_ (of _eo_) as `NUM`, and all-caps input gets `NUM` almost everywhere, so the user decides.
   - Case: _DIVI_ and _CIVI_ don't match the grammar, so inscriptions in all caps only trigger the flag on real numerals.
3. **Tests:** _CCXL_ and _xiv_ become plain; _vi_ (lower case, known) is untouched; _VI_ gets the numeral option; _C._ is plain; _C_ without a dot stays unknown.

### 2.6 V1

Out of scope. The backend changes apply everywhere with no V1-specific gating or tests; V1 may show the new behaviour (plain numerals, the extra numeral form). Only keep V1's existing tests compiling and green.

---

## 3. Server: engine, routes, contracts (`src/web/v2/macronizer/`)

### 3.1 Engine seam

```ts
export interface MacronizerEngine {
  /** Full pipeline. Throws MacronizerUnavailableError if no tagger is configured; rejects on tagger failure. */
  macronize(text: string): Promise<MacronizedResult>;
  /** Morceus only, no suggestions. Never needs the tagger. */
  analyzeOnly(text: string): MacronizedResult;
}
```

| Factory                          | Use                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `realMacronizerEngine()`         | `macronizeInput(t, latincyTagger)`. Built in `start_server.ts` only when `LATINCY_SERVER_ADDRESS` is set.                                               |
| `fakeLatincyTagger`              | Deterministic stand-in for LatinCy (D4, `MACRONIZER_ENGINE=fake-latincy`), in `src/latincy/fake_latincy_tagger.ts`. Used for dev, E2E and visual tests. |
| `unavailableEngine()`            | `macronize` throws `MacronizerUnavailableError`; `analyzeOnly` works.                                                                                   |
| `fakeMacronizerEngine(respond?)` | `testing/fake_macronizer_engine.ts`: canned results, records calls, mirrors `fakeCorpusEngine`.                                                         |
| `throwingMacronizerEngine(err)`  | Error-path tests.                                                                                                                                       |

The stub tagger gives no suggestions, so every ambiguous word is tier 1 in dev/E2E. **Tiers, the numeral flag and the queue order need a fixture** whose `tableTagger` (word → `[lemma, morph]`) produces suggestions of each confidence. Add it to `testing/` and use it in the unit, conformance and visual scenarios. If a LatinCy container becomes available, capture a real response for the demo sentences and check it in.

Wire it in: `createV2Router(fusedDict, { corpus, macronizer })`, as corpus does at [start_server.ts L274](../../../../src/start_server.ts#L274). Set `MACRONIZER_ENGINE=fake-latincy` in [morcus_integration_setup.ts](../../../../src/integration/utils/morcus_integration_setup.ts) for CI.

### 3.2 Routes

| Route                       | Body (urlencoded)           | Response                                                                                                       |
| --------------------------- | --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `GET /v2/macronizer`        | —                           | Landing page: one card with the form.                                                                          |
| `POST /v2/macronizer`       | `text`                      | Result page (full page; slot partial when `X-Requested-With: fetch`, following the corpus partial convention). |
| `POST /v2/macronizer/apply` | `text`, `sug`, `wN`…, `mN`… | Result page with the choices applied. Uses `engine.analyzeOnly`, so it **works even when the tagger is down**. |

**Body parsing:** add route-level `express.urlencoded({ extended: false, limit: "1mb" })`. 10k characters of macronized Latin percent-encode to several hundred kB, and the radios add more. Map a 413 to the friendly "too long" view. There's no urlencoded parsing in V2 today (E3); a small `core/` helper is fine if a second caller is foreseeable, otherwise keep it local.

**Errors:**

| Case                                             | Status | View                                                                 |
| ------------------------------------------------ | ------ | -------------------------------------------------------------------- |
| Empty `text`                                     | 200    | Landing with a message in the result slot.                           |
| `text` > 10,000 chars, or a 413                  | 200    | Landing, prefilled (truncated if needed), with a "too long" message. |
| `MacronizerUnavailableError` on POST /macronizer | 503    | "The macronizer is unavailable" page, with the form still prefilled. |
| Tagger request rejects                           | 503    | Same page, saying "temporarily".                                     |
| Apply with a bad `sug`/`wN`/`mN`                 | 200    | Ignore the bad entries (validate against the recomputed options).    |

Don't `trim()` `text`. `hijackForm` trims (E7), so the client must send the raw textarea value.

### 3.3 Apply form contract (No-JS)

One `<form id="mac-apply" method="post" action="/v2/macronizer/apply">` holds the hidden fields and the Apply button. The card controls join it from the other pane with `form="mac-apply"`.

| Field                                       | Meaning                                                                                                                                                                                                                                                                                                                   |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `text` (hidden)                             | The original input, unchanged.                                                                                                                                                                                                                                                                                            |
| `sug` (hidden)                              | The first run's suggestions: `N:k:c` joined by `,`, where `c` ∈ `w`/`t`/`c` (weak/tied/confident). Example: `12:1:c,40:0:w`. Words without a suggestion are omitted. About 1–2 kB for 10k chars.                                                                                                                          |
| `wN` (radio, value `k`)                     | The user's chosen form index for word `N`. Nothing checked → nothing submitted → keep the suggestion (or form 0).                                                                                                                                                                                                         |
| `mN` (checkbox, value `p`) + hidden `mN=""` | Vowel `p` of word `N` is long. `p` is the index in the macron-stripped NFD base string, as in the prototype's `splitMacrons`. Each word with a card always submits the hidden empty `mN`, so "all short" can be told apart from "not edited". The checkboxes are **pre-checked to match the form currently in the text**. |

**Server algorithm per word `N`:**

1. Start from `analyzeOnly(text)`.
2. Overlay `sug` (validate `k` < `options.length`).
3. Work out the shown form: `wN` if it's valid, else the suggestion, else form 0. The prior shown form comes from the re-rendered state.
4. If the submitted vowel set differs from the vowels of the **form that was in the text when the page was rendered**, the custom form wins. Carry that pre-render form in the same `N:` scheme in a hidden `shown` field, or derive it the same way from `sug` + `wN`. The implementer picks; the test is in §8.
5. Re-render: chosen radios checked, custom forms shown with an "edited" tag, the plain-text box rebuilt.

> [!NOTE]
>
> The plain-text box is rebuilt on every Apply, so edits made in the box are lost if the user clicks Apply afterwards. The box's label says so ("fix anything by hand here **last**").

### 3.4 Page markup contract

The markup is server-rendered and the same with and without JS. Use `html`/`joinHtml`/`raw`; `he` is banned in new code.

| Element           | Markup                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Root              | `<morcus-macronizer-view>` wraps both panes (activation gate: no cross-owner references).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Separator         | Text inside the passage (`white-space: pre-wrap`).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| Plain word        | `<a class="mac-word mac-plain" data-w="N" href="/v2/dicts?q=<form>&lang=La&o=1&embedded=1" target="mac-dict" data-l="…">form</a>`. `data-l` holds the lemma/morph the JS plain card needs (see §10, O2).                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Ambiguous word    | `<a class="mac-word mac-ambig" id="tN" href="#wN" data-w="N" data-tier="1..4">shown</a>`, plus `mac-chosen` once chosen.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| Unknown word      | `<a class="mac-word mac-unknown" id="tN" href="#wN" data-w="N" data-tier="5">word</a>`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| Ambiguous card    | `<details class="mac-card" open id="wN" data-w="N">`. Summary: `orig → shown` plus a tag. The tag is one of the tier tags, "possible Roman numeral", "your choice" or "edited". Then a `fieldset` of radios (`name="wN" value="k" form="mac-apply"`, **none pre-checked** unless applied), the "suggested" badge, and the "in text" marker via `data-shown` on the option (CSS only). Each form is followed by lemma links (`#n` stripped) and morph lines (empty ones dropped). A numeral option shows "Roman numeral (N), no macrons" and has no lemma link. Then "Edit macrons" `<details>` (collapsed), the JS-only Keep button, and the No-JS-only "↑ in text" link. |
| Unknown card      | Same frame, open editor, the text "Morceus doesn't know this word…", a "📖 Look up _word_" link, and Keep.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| Edit macrons      | No-JS: one checkbox per vowel, as in §3.3. JS: the checkboxes are presented as toggle buttons with `aria-pressed`. Either restyle the checkboxes (preferred, no created DOM), or hide them with `data-nojs-only` and server-render `data-js-only` buttons next to them.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Shared plain card | One server-rendered, `data-js-only` empty card. The script fills it from `data-l`. Building its vowel buttons is the **one** `CREATED_DOM_ALLOWLIST` entry.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Toolbar (sticky)  | Status (`N need a choice · M uncertain · K likely fine · U unknown`; until tiers split, "M to check" replaces "uncertain/likely fine"), "Next to review" (JS), Copy (JS).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| Below the text    | Legend `<details>`, plus a `data-nojs-only` editable `<textarea>` with the plain macronized text, and the Apply button.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| Dictionary        | `<iframe name="mac-dict">` in the right column. Move the URL builder (`buildReaderDictIframeSrc`) out of `reader.server.ts` into a shared module (E12).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

**CSS (`macronizer.css`, tokens only, nothing copied from `reader-*`):**

- **Wide (> ~860 px):** grid `minmax(0,1fr) | 380px` with the row filling the viewport. The page doesn't scroll; the text pane scrolls with a sticky toolbar. On the right, the inspector (max ~45 %, scrolls) sits above the iframe.
- **Cards:** shown only for `.mac-card.current` (JS) or `.mac-card:target` (No-JS).
- **Tier styles:** 1 shaded, 2–3 dashed, 4 faint dotted, 5 red dotted; `mac-chosen` gets a faint solid underline. Until the split, 2–4 share the dashed style.
- **Selection:** `#passage .mac-word.mac-selected` (mind the specificity bug found in the prototype).
- **Narrow:** JS: the column becomes a `DrawerController` bottom drawer with a peek (selected word → shown form). No-JS: panes stacked.

---

## 4. Client: `<morcus-macronizer-view>` (`macronizer_view.client.ts`)

Attribute, class and text writes only. Server markup is never moved.

| Behaviour          | Spec                                                                                                                                                                                                                                                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Select             | `focusin` or click on an ambiguous or unknown word: `preventDefault` the fragment navigation, add `.mac-selected`, give its card `.current`, and load the shown form in the iframe. Clicking a plain word fills the shared plain card and loads the dictionary. On upgrade, adopt a `#wN` hash.                                            |
| **Explicit focus** | Clicking a word, radio or Keep button calls `focus({ preventScroll: true })`. Safari and macOS Firefox don't focus on click, and without this Enter-after-click silently fails (a prototype bug). Keep and Next always move focus programmatically.                                                                                        |
| Keep               | Enter on a selected ambiguous/unknown word, or the Keep button: add `mac-chosen`, update the status, go to the next word. Enter is handled **only** while focus is on a word or a card radio.                                                                                                                                              |
| Card keyboard      | ↓ on the word moves focus to the checked radio, or the first one. Arrow keys move between radios natively. Enter on a radio keeps that form and moves on. Esc returns to the word.                                                                                                                                                         |
| Choose             | Radio `change`: set the word text, add `mac-chosen`, move `data-shown`, update the summary tag ("your choice"), status and dictionary.                                                                                                                                                                                                     |
| Edit macrons       | Toggling a vowel: build the form (NFC), write it into the word, uncheck the radios, tag the word "edited", add `mac-chosen`, update the status.                                                                                                                                                                                            |
| Next to review     | Go to the lowest unfinished tier (1, then 2–4, then 5; split 2/3/4 after PR 7). Within a tier, go in reading order from the current word. When moving to the next tier, start from the top of the text and show a toast ("Now checking …"). When nothing is left, show a toast ("All reviewed"). Scroll the **text pane**, never the page. |
| Copy               | Text nodes plus each word's current text, NFC-normalized, through `copyText` and `showToast`.                                                                                                                                                                                                                                              |
| Submit             | `hijackForm` → POST with the raw textarea value → swap the slots, with `aria-busy` while in flight. On failure, use **native submit** (`requestSubmit`), not `location.assign`. This needs E1: a `{ method, body }` option on `swapSlots`/`fetchAndSwapPartial` and a fallback hook.                                                       |
| Counter            | `data-js-only` "(n / 10000)". Macronize is disabled when the text is empty.                                                                                                                                                                                                                                                                |
| Hidden with JS     | Apply, the plain-text box, "↑ in text", and the No-JS vowel checkboxes if they're restyled differently.                                                                                                                                                                                                                                    |

---

## 5. No-JS behaviour (checklist)

1. Submit → result page with the text, a status line computed on the server, and tier highlighting.
2. Word link → `#wN`: its card appears in the right column (`:target`) and the word is highlighted. "↑ in text" or Back returns.
3. Lemma, plain-word and "Look up" links load the dictionary in the `mac-dict` iframe.
4. Radios and vowel checkboxes, then "Apply choices" → re-rendered page with the choices applied, still checked, and the box updated.
5. Copy from the editable box (Ctrl+A inside it).
6. Apply works when the tagger is down.

## 6. Shared and infra changes outside the slice

- **`core/partial.client.ts`:** POST support plus a native-submit fallback (E1).
- **`testing/form_roundtrip.ts`:** `serializePostForm(form) → { action, body }` (E2).
- **Dictionary iframe URL:** move the builder to a shared module (E12).
- **`shell/page_shell.server.ts`:** add a `route` to `PageShellOptions`, or a macronizer `activePage` value (E5). Prefer `route`.
- **`v2_build_contract.ts` and `v2_bundle_budget.ts`:** register the `macronizer` entry, chunk, route and leaf; set a budget ceiling.
- **Element registration:** `v2_elements.client.ts`, `v2.css` import.
- **`v2_router.server.ts`:** mount the routes and the urlencoded parser.
- **`start_server.ts`:** pick the engine (D4).
- **`morcus_integration_setup.ts`:** set `MACRONIZER_ENGINE=fake-latincy`.

## 7. Testing plan

| Layer                                       | What                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Backend unit                                | §2 tests: split determinism, confidence branches, E14, D21 (positive and negative cases).                                                                                                                                                                                                                                      |
| Route unit (supertest)                      | GET landing; POST happy path; empty; too long; 413; 503 unavailable; 503 tagger reject; Apply with radios, with vowel edits, with "all short", with tampered fields; Apply with `unavailableEngine`.                                                                                                                           |
| SSR conformance                             | `buildMacronizerFixtures()` (landing, result with every word state and tier, numeral flag, after Apply, error, unavailable) in `ssr_fixtures.ts`; `macronizer_ssr_conformance.test.ts`.                                                                                                                                        |
| Form conformance                            | `macronizer_form_conformance.test.ts` via `serializePostForm`: the Macronize form and the Apply form round-trip to the routes.                                                                                                                                                                                                 |
| Interaction conformance                     | Select by click **without focus** (`el.click()`, the Safari case); Enter keep/advance; ↓/Enter/Esc; radio choose; vowel toggle; tier ordering and wrap-around; Copy string; hash adoption; POST swap plus the native-submit fallback. Plus `reattach_conformance` and `route_bundle_conformance` entries.                      |
| Ratchets                                    | `CREATED_DOM_ALLOWLIST`: one entry, for the plain-card vowels. Inventory: expect one reviewed `domMutationOutsideCore` entry.                                                                                                                                                                                                  |
| E2E (Playwright, ask first)                 | No-JS: submit → open card → Apply → box. JS: submit → click a word → Enter ×N → choose → edit → Copy. **Run the keyboard journey on Chromium and both Firefox projects** (`--all`); WebKit isn't available here.                                                                                                               |
| Visual (ask first; baselines need approval) | Landing; result wide light/dark; result narrow with the drawer peek; card selected; unknown card; No-JS result; after Apply. Use the tier fixture engine so tiers show up. Expect around 7 scenarios × 4 projects = **~28 new baselines**. Follow AGENTS.md §3: run without `--update`, show `visual-diff`, wait for approval. |

## 8. Acceptance tests that pin tricky contracts

- The same text gives the same `N` for every word in `macronize` and `analyzeOnly`.
- Apply where a word's checkboxes are all unchecked produces the all-short form, not the shown form.
- Apply where the checkboxes are unchanged and a radio is checked produces the radio's form.
- A tampered `sug=999:9:c` or `w5=7` is ignored without a 500.
- A known _VI_ in all caps renders as tier 1 with the "possible Roman numeral" tag; it stays unsuggested even when the tagger tags it `NUM`.
- After a click without focus, Enter on the word still keeps it and advances.

---

## 9. Phases (PR-sized)

| PR  | Scope                                                                                                                                                                                                                                                                       | Exit criteria                                                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | **Backend:** §2 (pipeline split, tagger injection, `confidence`, `kind`, E14, D21) plus tests. No UI.                                                                                                                                                                       | `morcronizer.test.ts` and the new tests are green; V1 macronizer tests are green; the benchmark script still runs (it compiles and runs against the stub when there's no LatinCy). |
| 2   | **Seam, routes skeleton and infra:** engine factories, D4 switch, `createV2Router` option, urlencoded parsing, `serializePostForm`, `route` on the page shell, build-contract registration (no JS entry yet), shared dictionary URL builder. Landing page plus error views. | `MACRONIZER_ENGINE=fake-latincy ./morcus.sh web` serves the landing page; route unit tests for errors and 503 pass.                                                                |
| 3   | **Zero-JS result:** result renderer (words, tiers, cards, editor checkboxes, status, legend, box, iframe), wide/narrow CSS, the Apply route, fixtures, SSR and form conformance.                                                                                            | The full §5 checklist works with JS disabled; §8 contracts 1–5 pass. **No macronizer JS shipped.**                                                                                 |
| 4   | **Client core:** chunk and budget, POST swap with fallback (E1), select, keep, keyboard, choose, Next to review, Copy, counter, hash adoption.                                                                                                                              | Interaction conformance green, including the no-focus click case; markup identical with and without JS for the same input; within the bundle ceiling.                              |
| 5   | **Client extras:** Edit macrons toggles, the shared plain card (allowlist entry), the narrow-screen drawer with peek.                                                                                                                                                       | Ratchets green with the reviewed entries.                                                                                                                                          |
| 6   | **Ship:** E2E journeys, visual scenarios, slice `README.md` (per NEW_FEATURE_GUIDE: what it does, URL contract, files) and `TODOS.md`; new framework gaps into `docs/FRAMEWORK_GAPS.md`. Baselines only after approval.                                                     | AGENTS.md pre-push checklist green.                                                                                                                                                |
| 7   | **Later:** benchmark tiers 2–4 against the goldens (needs LatinCy) and split the look and queue if their error rates differ; saved texts; resizable divider; server PRG.                                                                                                    | —                                                                                                                                                                                  |

PRs 2 and 3 can be one PR if the reviewer prefers; 4 and 5 likewise.

## 10. Open items for the implementer or reviewer

- **O2 (check with Nitin):** the plain-word card's data. The default is a `data-l` attribute on each plain word (lemmas `#n`-stripped, plus morph). In PR 3, measure the page weight for a 10k-char input (~1,200 plain words), raw and gzipped, and **bring the numbers to Nitin**; he decides whether it's too heavy and the fallback (lemmas only) is needed. Fetching is not an option: there's no per-word API and the server is stateless.
- **O3:** how Apply derives the pre-render shown form (§3.3 step 4): a hidden `shown` field, or recompute it. Either is fine if contract 2 in §8 holds.
- **O4:** how the JS vowel buttons are presented, restyled checkboxes or separate buttons (§3.4). Prefer restyled checkboxes; that avoids a second set of controls.

Resolved in review: D7 (drop `contentEditable`), O1 (V1 is out of scope, §2.6).

## 11. Files

```
src/web/v2/macronizer/
├── RESEARCH.md, IMPLEMENTATION_PLAN.md          # this plan + the research record
├── README.md, TODOS.md                         # PR 6
├── macronizer_engine.server.ts                 # interface, real/morceus-only/unavailable factories, UnavailableError
├── macronizer_params.server.ts                 # text/sug/wN/mN parsing + validation, limits
├── macronizer_apply.server.ts                  # apply algorithm (§3.3), pure
├── macronizer_tiers.common.ts                  # word → tier, tier tags
├── macronizer_view.server.ts                   # landing, result, cards, status, legend, box
├── macronizer_routes.server.ts                 # createMacronizerRoutes({ engine })
├── macronizer_slots.common.ts                  # slot names, titles
├── macronizer_view.client.ts                   # <morcus-macronizer-view>
├── macronizer_entry.client.ts                  # macronizer.js (dependOn: "common")
├── macronizer.css
└── *.test.ts, *_ssr_conformance.test.ts, *_form_conformance.test.ts, *_interaction_conformance.test.ts
src/web/v2/testing/fake_macronizer_engine.ts    # canned, table-tagger fixture, throwing
src/macronizer/morcronizer.ts, src/nlp/text_tokenization.ts, src/web/api_routes.ts   # PR 1
```

Outside the slice: `v2_router.server.ts`, `start_server.ts`, `v2_elements.client.ts`, `v2.css`, `v2_build_contract.ts`, `v2_bundle_budget.ts`, `shell/page_shell.server.ts`, `core/partial.client.ts`, `testing/ssr_fixtures.ts`, `testing/fake_v2_network.ts`, `testing/form_roundtrip.ts`, `testing/created_dom_allowlist.ts`, `core/route_bundle_conformance.test.ts`, `core/reattach_conformance.test.ts`, the shared dictionary-URL module, and `integration/utils/morcus_integration_setup.ts`.
