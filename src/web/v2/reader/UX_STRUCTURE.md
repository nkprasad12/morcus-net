# Reader Chrome: UX Structure & Surface Model

A design record, not a spec. It captures why the reader's top bar is organized the way it is, what is currently wrong with it, and — more importantly — **the rule for deciding where new functionality goes**, so that the next feature doesn't get filed by accident.

Origin: a review of a proposed sticky-top-bar refactor surfaced a settings desync between the quick tools popover it introduced and the existing settings dialog. The desync turned out to be a symptom rather than the problem, and working out what it was a symptom _of_ produced the model below.

> [!NOTE] > **Implementation update**: The single-row primary sticky bar and anchored typography popover have landed. The secondary expandable toolbar (`sticky-expanded-row`, `sticky-expand-btn`) has been retired, `Aa` is promoted directly into the primary row next to `pager-next`, and the modal `<dialog>` is replaced with `#reader-settings-popover` (zero canvas blur/dimming, live preview, caret anchoring). §1 is retained for historical design context on why settings must never be split across surfaces.

Companion docs: [`FEATURE_PARITY.md`](FEATURE_PARITY.md) (V1 → V2 gaps), [`README.md`](README.md) (slice architecture).

---

## 1. The finding that started it

The proposed refactor moved three of the dialog's preference controls into a new quick popover **without removing them from the dialog**:

| Control                        | Pref          | Proposed popover | Settings dialog (ships today) |
| :----------------------------- | :------------ | :--------------: | :---------------------------: |
| Reading canvas text size       | `readerScale` |        ✅        |              ✅               |
| Show macra                     | `showMacra`   |        ✅        |              ✅               |
| Show section numbers           | `showGutter`  |        ✅        |              ✅               |
| Dictionary sidebar text size   | `dictScale`   |        —         |              ✅               |
| Font family                    | `fontFamily`  |        —         |              ✅               |
| Line spacing                   | `lineHeight`  |        —         |              ✅               |
| Reset defaults                 | (all)         |        —         |              ✅               |
| Reading view (Single/Parallel) | _navigation_  |        ✅        |               —               |
| Settings / Info launchers      | _navigation_  |        ✅        |               —               |

**Two writers over one store means bidirectional sync, forever.** The refactor implemented one direction, so the two surfaces silently overwrote each other. Even implemented correctly, every preference added later would have to be wired twice and could regress in either direction.

### The split would have followed no principle

There are three defensible reasons to split a settings surface. None of them applied:

- **Common vs. rare?** Dictionary scale is plausibly adjusted as often as reading-canvas scale — this is a reader with a permanent dictionary panel. One would have been "quick"; its twin stays buried.
- **Simple vs. advanced?** The "advanced" tier is two `<select>` elements. Font family is not an expert setting.
- **Instant vs. committed?** Both apply live. `saveAndEmit` writes on every change and the dialog's Done button is `data-dialog-close` and nothing else. There is no transaction, so there is nothing to justify modality.

The split was historical: the popover was built _next to_ the dialog rather than _instead of_ it.

### The dialog actively fights its own purpose

This one is true of the shipped code, independent of any refactor.

> [!IMPORTANT] > `.dialog::backdrop` applies `rgba(0, 0, 0, 0.55)` **plus `backdrop-filter: blur(4px)`** ([`dialog.css:L37-41`](../dialog/dialog.css)).

Every control in that dialog is a live-preview typography control, and the surface hosting them **dims and blurs the Latin text you are adjusting them for**. A modal is for a focused task that should block the underlying context; typography tuning is the exact inverse. An anchored panel would leave the canvas fully visible, which is the real argument the popover was reaching for — it just needed to replace the dialog rather than sit beside it.

Secondary observations, all of which hold at `HEAD`:

- **A toolbar whose main job is launching other surfaces** is a strong signal the hierarchy is wrong. The expanded row's only non-navigation contents are two launcher buttons.
- **The row mixes interaction models.** The view toggle is real `<a>` navigation that changes the URL; the buttons beside it open JS-only overlays. It is also the only control there that works without JS.
- **"Tools" is the tell.** The trigger is labelled `Tools`, with the title text _"Show additional tools (Contents, view mode, settings, info)"_ — an enumeration rather than a category. A name that has to list its contents is not an organizing principle.

---

## 2. "Info" was a category error

The biblio dialog renders author, structural hierarchy, critical edition, translator, CTS URN, license, and source repository. Its launcher sits beside the Settings launcher in the expanded row — but where every other control in the reader chrome mutates client state, this one mutates nothing.

|              | Preferences         | Biblio metadata                        |
| :----------- | :------------------ | :------------------------------------- |
| **Scope**    | Global, cross-work  | This work only                         |
| **Lifetime** | Persistent          | Immutable, server-rendered             |
| **Intent**   | "Change how I read" | "What am I reading / how do I cite it" |

The two ended up adjacent because the expanded row is where leftover buttons go, and each successive change has inherited that adjacency without re-examining it.

The concrete harm is documented as a parity gap in [`FEATURE_PARITY.md`](FEATURE_PARITY.md) §2.5: the attribution is server-rendered but unreachable without JavaScript, never prints, and the texts are CC BY-SA.

---

## 3. The capacity argument, and why a grab-bag isn't headroom

The natural objection to removing things from the bar is that the bar then has nowhere to grow. The honest answer is that **the grab-bag was never buying the headroom it appears to buy.**

The mobile sticky bar is already at capacity: [`reader_nav.css`](reader_nav.css) sets `min-width: 0` and `overflow-x: clip` on the row, truncates the title, shrinks padding, and hides `.btn-text`. There is no free slot on small screens today, with or without a Tools menu. What a grab-bag provides is _one_ slot holding N features, each at two clicks and near-zero discoverability. That is not extensibility; it is a queue.

|                    | Named menu ("Tools")        | Overflow ("⋯ More")             |
| :----------------- | :-------------------------- | :------------------------------ |
| **Claims**         | these items belong together | these didn't fit                |
| **Admission rule** | none — absorbs anything     | explicit: demoted from the bar  |
| **Responsive**     | fixed                       | items promote/collapse by width |
| **Failure mode**   | silent incoherence          | visible crowding                |

"Tools" makes a semantic claim it cannot honour, so it degrades invisibly — which is exactly how it came to hold display preferences, a navigation mode, and a metadata launcher.

---

## 4. The model: two surfaces, split by what the reader is doing

> **Top bar: things that change exactly what we're seeing. Panel: things that help you understand the text.**

```
CHROME (fixed, small)              PANEL (scalable, large)
├─ Navigate   §  drawer            ├─ Dictionary       (default)
├─ Display    Aa popover           ├─ Notes            ← critical apparatus
└─ Cite       colophon in flow     ├─ Translation      ← on-demand English text
                                   ├─ Vocabulary       (frequent lemmata)
                                   └─ About this text  (editorial provenance)
```

**The bar is deliberately fixed; the panel is where growth goes.** That is the answer to "there's nowhere left to put anything": the extension point was never supposed to be the top bar. A grab-bag grows by stacking two-click items with no discoverability; a tabbed panel grows by adding peers to a surface the user already has open, and it works identically on mobile because the drawer is already there.

This also reframes the dictionary. Today it is a hard-coded special case; under this model it is simply the first member of a category, with notes, vocabulary and provenance as its peers rather than as bolt-ons.

### Two rules keep the axis honest

> **Tiebreak — if it mutates the primary text rendering, it belongs in the top bar, regardless of _why_ the reader wants it.**

Macra and section numbers genuinely help you understand the text, and parallel translation especially so; all three change what is rendered, so all three are chrome. Without this rule the axis is ambiguous for exactly the cases that matter.

> **Second gate — a panel tab needs content you _return to_, not content you read once.**

"Helps you understand the text" is broad enough to become a new grab-bag at the other end of the screen; in a Latin reader nearly everything arguably qualifies. Sustained consultation is what distinguishes a tab from a line of static text.

### Decision procedure

1. **Control or content?** Content → panel or page flow. Control → chrome.
2. **What scope?** Passage/work → reader. Corpus/app → app bar. _Getting this wrong is how reader chrome becomes a junk drawer._
3. **Transient or sustained?** Jump-and-dismiss → drawer/popover. Consulted while reading → panel tab.
4. **Static and about the work?** → page flow (colophon), where it prints and survives No-JS.
5. **Fits nothing?** _Then_ `⋯` overflow — and only once there are two or more genuinely miscellaneous items.

Worked examples:

| Feature                        | Kind               | Scope   | Home                           |
| :----------------------------- | :----------------- | :------ | :----------------------------- |
| In-work search                 | content, transient | work    | § drawer, alongside the filter |
| Corpus search                  | content            | library | app bar — _not_ reader chrome  |
| Frequent lemmata               | content, sustained | work    | panel tab                      |
| Scansion **marks on the text** | control            | work    | Display popover (toggle)       |
| Scansion **analysis view**     | content            | work    | panel tab                      |
| Annotations                    | content, sustained | passage | panel tab + inline markers     |
| Permalink / share              | control, tiny      | passage | Cite cluster                   |
| Dark mode                      | control            | app     | app bar (already there)        |

Note the scansion split: the same subject lands in different places depending on whether it changes the text's rendering or is a thing you read _alongside_ the text. That is the control/content line doing real work.

> [!NOTE]
> In-work search needs no new bar slot — the TOC drawer already has a filter input (`#reader-toc-filter`). Extending it to search passage text is the same surface, same intent, and the same result type: a list of places to jump to.

---

## 5. Citation splits in two

The biblio record lumps seven fields together because they arrive on the same object — grouping by implementation, which is the same move that produced "Tools". Under the axis above they separate cleanly:

| Field                | Helps you understand?                                                                                                       | Home          |
| :------------------- | :-------------------------------------------------------------------------------------------------------------------------- | :------------ |
| Critical edition     | **Yes** — editors differ on emendations and punctuation; which text you are reading changes how you read a disputed passage | apparatus     |
| Translator           | **Yes** — directly affects how you read the parallel column                                                                 | apparatus     |
| Author               | Yes, but already on screen in the text header                                                                               | already there |
| CTS URN              | No — an addressing scheme                                                                                                   | page flow     |
| License              | No — a compliance obligation                                                                                                | page flow     |
| Source repository    | No — provenance for machines                                                                                                | page flow     |
| Structural hierarchy | No — a schema                                                                                                               | page flow     |

The proportionate shape:

- **Editorial provenance and citation mechanics** live together in the **companion About tab** (desktop sidebar & mobile bottom drawer) and the **No-JS colophon `<details>`** at the bottom of the article flow.
- A subtle `ⓘ` trigger beside the work title jumps to the colophon (or toggles the About tab when JS is active).
- **Text-card header subtitle rejected**: Decided against displaying an editorial subtitle in the text-card header to keep the passage canvas header clean and uncluttered.

---

## 6. What makes the panel side real

The panel model would be aspirational if it had only vocabulary lists to hold. It doesn't: the critical apparatus is **85,876 notes across 48 works**, and Ammianus alone carries ~12 per page.

Those notes used to be inert `<button>` markers with no handler and no bodies in the page. They are now numbered footnotes rendered after the passage, linked both ways, and readable with no JavaScript — see [`FEATURE_PARITY.md`](FEATURE_PARITY.md) §2.1.

That does not retire the panel argument; it grounds it. A "too thin to earn a tab" objection no longer applies — the tab would carry 2,526 notes for Ammianus, not seven static rows — and the remaining work is exactly the enhancement the panel exists for: letting a reader consult a note without leaving the line they are on. The difference is that the baseline now works, so the panel can be designed when the arbitration questions in §7 are settled rather than under pressure to rescue a broken feature.

---

## 7. Status

**Adopted as the working model; none of the _chrome_ changes here have been built.** The refactor that prompted the discussion was reverted rather than landed, so the reader's top bar and settings dialog are unchanged. The apparatus port described in §6 has since shipped, but it touched the preprocessor, the text panel and CSS — no chrome.

Settled in discussion and implementation:

- The preference duplication is a design fault, not a sync bug — fix the structure, not the symptom.
- The bar is a fixed surface; the panel is the extension point.
- The tiebreak and sustained-consultation rules above.
- Info does not belong in a settings menu.
- **Companion Panel Arbitration**: Settled and shipped in `ReaderPanelController` (`reader_panel.client.ts`). Word priority (Rule A1) force-switches the panel back to Dictionary whenever a Latin word is clicked, dismiss (Rule A4) resets to Dictionary, and note markers activate the Notes tab with non-destructive in-place scrolling.
- **Attribution & Colophon**: Settled and shipped. Decided against header subtitle clutter; scholarly provenance and citation metadata live in the companion About tab (`#panel-view-about`) and zero-JS `<details>` colophon (`#reader-work-about`).
- **Translation Presentation**: Settled and shipped. The primary reading canvas is strictly a single-column Latin baseline. Dual-column parallel mode and the sticky bar `Single | Parallel` toggle are retired. For translated works, translations are housed in the companion panel's 4th tab (`#panel-view-translation`), loaded on-demand via `/v2/reader/:author/:name/:page/translation`, and synchronized with native scrolling.

- **Single Anchored Typography Popover**: Settled and shipped. The modal `<dialog>` is retired and replaced with `#reader-settings-popover` (`reader_settings.client.ts`). The secondary expandable toolbar is removed, promoting `Aa` directly to the primary sticky bar. All typography controls live together in a single surface over an undimmed reading canvas with caret anchoring and mutual exclusion with the TOC drawer.

> [!NOTE] > **Sequencing completed.** The apparatus footnote baseline, companion arbitration tabs, and the top-bar unified single row with anchored typography popover have all landed cleanly.
