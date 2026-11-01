# What's New — Library & Open Texts Release

This document contains the draft release announcement for `updates.morcus.net` and the corresponding `latest.json` banner payload surfaced by `src/web/ui/whats_new/whats_new.server.ts`.

---

## 1. Landing Page Banner (`latest.json` payload)

`whats_new.server.ts` caps `description` at 200 characters (`MAX_DESCRIPTION_LENGTH = 200`) for the `#whats-new` banner on `/` and `/dicts`.

```json
{
  "date": "2026-11-01",
  "url": "https://updates.morcus.net/2026/11/01/library-and-open-texts/",
  "description": "New in Texts: 6 curated Latin Library works (including Justinian's Digest and Gaius), a unified Library · Open Texts · Custom bar, and 1,675 uncurated Patrologia Latina & Latin Library texts."
}
```

_(191 characters)_

---

## 2. Full Release Post (`updates.morcus.net`)

### Six New Curated Works in the Library, Plus 1,675 Open Texts

We've expanded Morcus's reading room and reorganized how texts are grouped under a unified **Texts** section in the top navigation bar.

#### 1. Six New Curated Latin Library Works

Six classical and Roman-law works have been added to the curated **Library** with full morphological analysis and dictionary lookup:

- **Augustus — _Res Gestae Divi Augusti_**
- **Pseudo-Quintilian — _Declamationes Maiores_**
- **Justin — _Epitoma Historiarum Philippicarum Pompei Trogi_**
- **Pompeius Trogus — _Prologi_**
- **Gaius — _Institutiones_**
- **Justinian — _Digesta_**, formatted with traditional Roman-law citation style (`D. book.title.fragment.section`) and small-caps jurist inscriptions.

#### 2. Unified **Texts** Navigation (**Library · Open Texts · Custom**)

The top-bar **Library** link is now **Texts**, leading to a three-tab bar shared across `/library`, `/opentexts`, and `/externalReader`:

- **Library**: Morcus's curated, pre-processed editions.
- **Open Texts**: Uncurated public-domain and open-access Latin collections, clearly marked with an uncurated notice.
- **Custom**: Your own pasted, or imported from a URL, Latin texts in the external reader.

#### 3. Open Texts: 1,279 Patrologia Latina Editions & 396 Latin Library Works

**Open Texts** (`/opentexts`) now indexes **1,675 works**—**1,279** from Migne's _Patrologia Latina_ and **396** from _The Latin Library_—with search and filtering by source and historical period (Classical, Late Antique, Patristic, Medieval, Neo-Latin).

- **Best-effort browser-parsed reading**: Texts are fetched and parsed client-side with instant click-to-lookup across all Morcus dictionaries.
- **Migne column & section navigation**: Jump directly by _Patrologia Latina_ column numbers or work sections.
- **Offline IndexedDB caching**: Opened texts are cached locally in your browser's IndexedDB for fast offline re-reading.
