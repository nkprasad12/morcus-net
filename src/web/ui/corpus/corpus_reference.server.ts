/**
 * SSR for `GET /corpus/reference`: the full reference manual for the corpus
 * query language, inflection categories, settings, limits, and every `#Author`
 * and `#Author/Work` code in the corpus.
 */

import {
  MAX_QUERY_BODY_LENGTH,
  MAX_QUERY_SPANS,
} from "@/common/library/corpus/corpus_common";
import {
  html,
  joinHtml,
  raw,
  type SafeHtml,
} from "@/web/ui/core/dom/html.common";
import {
  CONTEXT_LEN,
  CORPUS_PATH,
  CORPUS_REFERENCE_PATH,
  PAGE_SIZE,
} from "@/web/ui/corpus/corpus_params.common";
import {
  INFLECTION_CATEGORIES,
  MAX_AUTHOR_FILTERS,
  PROXIMITY_DISTANCE,
  type CorpusAuthorList,
} from "@/web/ui/corpus/corpus_syntax.common";
import { getV2LibrarySummaries } from "@/web/ui/reader/reader_loader.server";
import { renderPageShell } from "@/web/ui/shell/page_shell.server";

export const CORPUS_REFERENCE_PAGE_KEY = "page:/corpus/reference";
export const CORPUS_REFERENCE_TITLE = "Corpus search reference";

interface QuickStartExample {
  readonly query: string;
  readonly summary: SafeHtml;
}

const QUICK_START_EXAMPLES: readonly QuickStartExample[] = [
  {
    query: "amoris",
    summary: html`Exact word (case-insensitive)`,
  },
  {
    query: "gallia est omnis",
    summary: html`Contiguous phrase in exact word order`,
  },
  {
    query: "@lemma:amo",
    summary: html`Every inflected form of the dictionary headword <i>amo</i>`,
  },
  {
    query: "(@lemma:amo and @voice:passive)",
    summary: html`Passive forms of <i>amo</i> (two filters on the same word)`,
  },
  {
    query: "@lemma:do ~3 @case:dat",
    summary: html`Any form of <i>do</i> within 3 words of a dative word`,
  },
  {
    query: "#Caesar/DeBelloGallico omnis",
    summary: html`<i>omnis</i> restricted to Caesar's <i>De Bello Gallico</i>`,
  },
];

const CATEGORY_EXAMPLES: Readonly<Record<string, string>> = {
  case: "@case:genitive",
  tense: "@tense:imperfect",
  voice: "@voice:passive",
  person: "@person:3rd",
  number: "@number:plural",
  gender: "@gender:neuter",
  mood: "@mood:subjunctive",
};

function corpusSearchHref(q: string): string {
  return `${CORPUS_PATH}?${new URLSearchParams({ q }).toString()}`;
}

function renderExampleCode(query: string): SafeHtml {
  return html`<code class="corpus-ref-code" data-example="${query}"
    >${query}</code
  >`;
}

/**
 * Resolves full author display names (e.g. `Caesar` → `Julius Caesar`) by
 * joining each author's work IDs against the V2 library summaries.
 */
export async function resolveAuthorDisplayNames(
  authors: CorpusAuthorList
): Promise<ReadonlyMap<string, string>> {
  const summaries = await getV2LibrarySummaries();
  const authorByWorkId = new Map<string, string>();
  for (const s of summaries) {
    authorByWorkId.set(s.id, s.author);
  }
  const result = new Map<string, string>();
  for (const [authorCode, works] of Object.entries(authors)) {
    for (const work of works) {
      const fullAuthor = authorByWorkId.get(work.id);
      if (fullAuthor !== undefined) {
        result.set(authorCode, fullAuthor);
        break;
      }
    }
  }
  return result;
}

function renderInflectionCategoryRows(): SafeHtml {
  const rows: SafeHtml[] = [];
  for (const [category, values] of INFLECTION_CATEGORIES) {
    const shortKey = category[0];
    const valuePairs = [...values.entries()].map(([longVal, shortVal]) =>
      longVal === shortVal
        ? html`<span class="corpus-ref-val-pair"
            ><code class="corpus-ref-code">${longVal}</code></span
          >`
        : html`<span class="corpus-ref-val-pair"
            ><code class="corpus-ref-code">${longVal}</code> (<code
              class="corpus-ref-code"
              >${shortVal}</code
            >)</span
          >`
    );
    const example =
      CATEGORY_EXAMPLES[category] ??
      `@${category}:${[...values.keys()][0] ?? ""}`;
    rows.push(html`<tr>
      <td>
        <code class="corpus-ref-code">@${category}</code>
      </td>
      <td>
        <code class="corpus-ref-code">@${shortKey}</code>
      </td>
      <td class="corpus-ref-values-cell">${joinHtml(valuePairs, ", ")}</td>
      <td>${raw(renderExampleCode(example))}</td>
    </tr>`);
  }
  return html`${joinHtml(rows)}`;
}

function renderAuthorsSection(
  authors: CorpusAuthorList | undefined,
  authorDisplayNames?: ReadonlyMap<string, string>
): SafeHtml {
  if (authors === undefined) {
    return html`<section id="authors" class="corpus-ref-section">
      <h2>Authors and works</h2>
      <p class="corpus-ref-unavailable">
        The corpus author and work list is not available on this server.
      </p>
    </section>`;
  }

  const authorCodes = Object.keys(authors).sort((a, b) => a.localeCompare(b));
  const totalWorks = authorCodes.reduce(
    (sum, code) => sum + authors[code].length,
    0
  );

  const jumpChips = authorCodes.map(
    (code) =>
      html`<a
        href="#author-${code.toLowerCase()}"
        class="corpus-ref-author-chip"
        ><code>#${code}</code></a
      >`
  );

  const authorCards = authorCodes.map((code) => {
    const works = [...authors[code]].sort((a, b) =>
      a.code.localeCompare(b.code)
    );
    const fullName = authorDisplayNames?.get(code);
    const fullNameHtml =
      fullName !== undefined && fullName !== code
        ? html`<span class="corpus-ref-author-name">${fullName}</span>`
        : html``;
    const workItems = works.map(
      (w) => html`<li class="corpus-ref-work-item">
        <code class="corpus-ref-code">#${code}/${w.code}</code>
        <span class="corpus-ref-work-title">${w.name}</span>
      </li>`
    );
    return html`<div
      id="author-${code.toLowerCase()}"
      class="corpus-ref-author-card">
      <div class="corpus-ref-author-header">
        <code class="corpus-ref-code corpus-ref-author-code">#${code}</code>
        ${raw(fullNameHtml)}
        <span class="corpus-ref-author-count"
          >(${works.length} ${works.length === 1 ? "work" : "works"})</span
        >
      </div>
      <ul class="corpus-ref-work-list">
        ${joinHtml(workItems)}
      </ul>
    </div>`;
  });

  return html`<section id="authors" class="corpus-ref-section">
    <h2>Authors and works</h2>
    <p>
      The corpus currently indexes
      <strong>${authorCodes.length} authors</strong> and
      <strong>${totalWorks} works</strong>. Use <code>#Author</code> at the
      start of a query to search all works by an author, or
      <code>#Author/Work</code> to search a single work. Codes are
      case-insensitive.
    </p>
    <nav class="corpus-ref-author-jump" aria-label="Jump to author">
      ${joinHtml(jumpChips, " ")}
    </nav>
    <div class="corpus-ref-author-list">${joinHtml(authorCards)}</div>
  </section>`;
}

/**
 * Renders the `<article>` content of `/corpus/reference` (exported for SSR
 * conformance fixtures and unit tests).
 */
export function renderCorpusReferenceContentHtml(
  authors: CorpusAuthorList | undefined,
  authorDisplayNames?: ReadonlyMap<string, string>
): SafeHtml {
  const quickStartRows = QUICK_START_EXAMPLES.map(
    (ex) => html`<tr>
      <td>
        <a
          href="${corpusSearchHref(ex.query)}"
          class="guide-example-link"
          data-example="${ex.query}"
          >${ex.query}</a
        >
      </td>
      <td>${raw(ex.summary)}</td>
    </tr>`
  );

  const authorSummaryLabel =
    authors !== undefined
      ? ` (${Object.keys(authors).length} authors, ${Object.values(
          authors
        ).reduce((s, w) => s + w.length, 0)} works)`
      : "";

  return html`<article class="corpus-ref-article">
    <header class="corpus-ref-header">
      <a href="${CORPUS_PATH}" class="corpus-ref-back"
        >&larr; Back to corpus search</a
      >
      <h1>${CORPUS_REFERENCE_TITLE}</h1>
    </header>

    <nav class="corpus-ref-toc" aria-label="On this page">
      <div class="corpus-ref-toc-title">On this page</div>
      <ol class="corpus-ref-toc-list">
        <li><a href="#quick-start">Quick start</a></li>
        <li><a href="#words">Words</a></li>
        <li>
          <a href="#lemmas">Lemmas (@lemma / @l)</a>
        </li>
        <li><a href="#inflections">Inflection categories</a></li>
        <li>
          <a href="#combining">Combining filters on one word (and, or)</a>
        </li>
        <li>
          <a href="#proximity">Word order and proximity (~)</a>
        </li>
        <li>
          <a href="#scope">Author and work scope (#Author, #Author/Work)</a>
        </li>
        <li><a href="#settings">Settings and paging</a></li>
        <li><a href="#limits">Limits</a></li>
        <li>
          <a href="#authors">Authors and works${authorSummaryLabel}</a>
        </li>
      </ol>
    </nav>

    <section id="quick-start" class="corpus-ref-section">
      <h2>Quick start</h2>
      <p>
        A corpus query is a sequence of word terms separated by spaces (adjacent
        words) or <code>~</code> (proximity), optionally preceded by one or more
        <code>#Author</code> or <code>#Author/Work</code> scope filters. Click
        any example below to run it in the corpus search bar:
      </p>
      <div class="corpus-ref-table-scroll">
        <table class="corpus-ref-table">
          <thead>
            <tr>
              <th>Query</th>
              <th>What it matches</th>
            </tr>
          </thead>
          <tbody>
            ${joinHtml(quickStartRows)}
          </tbody>
        </table>
      </div>
    </section>

    <section id="words" class="corpus-ref-section">
      <h2>Words</h2>
      <p>
        A bare token without <code>@</code>, <code>#</code>, or
        <code>~</code> matches that exact word form in the text: for example,
        ${raw(renderExampleCode("amoris"))} matches every occurrence of
        <i>amoris</i>.
      </p>
      <ul>
        <li>
          <strong>Case-insensitive:</strong> Word queries are lowercased before
          lookup, so ${raw(renderExampleCode("amoris"))},
          ${raw(renderExampleCode("Amoris"))}, and
          ${raw(renderExampleCode("AMORIS"))} all return the same matches.
        </li>
        <li>
          <strong>No macrons or breves:</strong> Long and short vowel marks are
          stripped when the corpus is indexed. Write query words in plain ASCII
          letters without macrons or breves.
        </li>
        <li>
          <strong>Edition spelling (<code>u</code> / <code>v</code>):</strong>
          Exact word tokens match the spelling printed in the edition. To match
          every spelling and inflected form of a word across editions, use a
          <a href="#lemmas"><code>@lemma:</code> filter</a> instead.
        </li>
      </ul>
    </section>

    <section id="lemmas" class="corpus-ref-section">
      <h2>Lemmas (<code>@lemma</code> / <code>@l</code>)</h2>
      <p>
        Prefix a dictionary headword with <code>@lemma:</code> (or the short
        form <code>@l:</code>) to match every inflected form that the Morceus
        morphological analyzer assigns to that lemma:
      </p>
      <ul>
        <li>
          ${raw(renderExampleCode("@lemma:amo"))} or
          ${raw(renderExampleCode("@l:amo"))} matches <i>amo</i>, <i>amas</i>,
          <i>amavit</i>, <i>amatus</i>, <i>amandi</i>, and all other forms of
          <i>amo</i>.
        </li>
        <li>
          ${raw(renderExampleCode("@lemma:fero"))} includes irregular and
          suppletive stems (<i>fero</i>, <i>tulit</i>, <i>latum</i>).
        </li>
        <li>
          <strong>Case resolution:</strong> Exact case-sensitive matches win
          first (distinguishing capitalized proper nouns from lowercase words
          where both exist); otherwise a unique case-insensitive match is used
          automatically (so ${raw(renderExampleCode("@lemma:caesar"))} resolves
          to <code>Caesar</code>).
        </li>
        <li>
          <strong>Homographs:</strong> Distinct headwords that share a spelling
          are numbered with <code>#N</code> (for example,
          <code>@lemma:edo#1</code> &ldquo;eat&rdquo; vs.
          <code>@lemma:edo#2</code> &ldquo;put forth&rdquo;). If a lemma is
          ambiguous, the search error lists the choices.
        </li>
      </ul>
    </section>

    <section id="inflections" class="corpus-ref-section">
      <h2>Inflection categories</h2>
      <p>
        Filter words by grammatical feature with
        <code>@&lt;category&gt;:&lt;value&gt;</code>. Every category has a
        one-letter shorthand (the first letter of the category name), and nearly
        every value has a 3–4 letter abbreviation. For example,
        ${raw(renderExampleCode("@case:genitive"))},
        ${raw(renderExampleCode("@case:gen"))},
        ${raw(renderExampleCode("@c:genitive"))}, and
        ${raw(renderExampleCode("@c:gen"))} are all equivalent.
      </p>
      <div class="corpus-ref-table-scroll">
        <table class="corpus-ref-table">
          <thead>
            <tr>
              <th>Category</th>
              <th>Short</th>
              <th>Values (long &amp; short)</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            ${raw(renderInflectionCategoryRows())}
          </tbody>
        </table>
      </div>
      <h3>Morphological ambiguity and false positives</h3>
      <p>
        Corpus tokens are tagged automatically by the morphological analyzer
        rather than hand-disambiguated in context. Because many Latin endings
        are shared across cases, numbers, or even parts of speech, a token can
        carry multiple candidate analyses:
      </p>
      <ul>
        <li>
          <code>puellae</code> can be genitive singular, dative singular, or
          nominative/vocative plural of <i>puella</i>. In default
          (<strong>Relaxed</strong>) mode, <code>puellae</code> matches
          <code>@case:gen</code>, <code>@case:dat</code>, and
          <code>@number:plur</code>.
        </li>
        <li>
          <strong>Per-analysis validation on <code>and</code>:</strong> When you
          combine filters on the same word with <code>and</code>, a
          <strong>single analysis</strong> of that word must satisfy all of the
          filters simultaneously. For instance, <code>amoris</code> can be a
          noun (genitive singular of <i>amor</i>) or a verb (2nd singular
          present passive indicative of <i>amo</i>), so it does
          <strong>not</strong> match
          ${raw(renderExampleCode("(@lemma:amo and @case:gen)"))}.
        </li>
        <li>
          <strong>Strict mode:</strong> Turning on
          <a href="#settings">Strict mode</a> requires <em>every</em> possible
          analysis of a matched word to satisfy the query&rsquo;s
          <code>@lemma</code> and <code>@inflection</code> constraints.
        </li>
      </ul>
    </section>

    <section id="combining" class="corpus-ref-section">
      <h2>Combining filters on one word (<code>and</code>, <code>or</code>)</h2>
      <p>
        Join two or more word, <code>@lemma</code>, or
        <code>@inflection</code> filters with <code>and</code> or
        <code>or</code> inside parentheses to constrain a
        <strong>single word position</strong>:
      </p>
      <ul>
        <li>
          <strong>Conjunction (<code>and</code>):</strong> Every filter must
          hold on the same morphological analysis of the word &mdash; for
          example, ${raw(renderExampleCode("(@lemma:amo and @voice:passive)"))},
          ${raw(renderExampleCode("(@c:abl and @n:plur and @g:fem)"))}, or
          ${raw(renderExampleCode("(amoris and @lemma:amor)"))}.
        </li>
        <li>
          <strong>Disjunction (<code>or</code>):</strong> Any of the filters may
          match the word &mdash; for example,
          ${raw(renderExampleCode("(@case:dat or @case:abl)"))} or
          ${raw(renderExampleCode("(@lemma:do or @lemma:habeo)"))}.
        </li>
        <li>
          <strong>When parentheses can be omitted:</strong> If the entire query
          constrains a single word (such as
          ${raw(renderExampleCode("@c:gen and @l:amo"))}), outer parentheses are
          added automatically. Always use parentheses when combining a
          multi-filter word with other words or <code>~</code> (such as
          ${raw(renderExampleCode("(@lemma:do or @lemma:habeo) ~ @case:acc"))}).
        </li>
        <li>
          <strong>Grammar restrictions:</strong>
          <ul>
            <li>
              <code>and</code> and <code>or</code> apply to a single word token,
              not across multi-word phrases.
            </li>
            <li>
              <code>and</code> and <code>or</code> cannot be mixed on the same
              word, and parentheses cannot be nested more than one level deep.
            </li>
            <li>Negation (<code>!</code>) is not supported.</li>
            <li>
              Grammatically impossible <code>and</code> combinations (such as
              two different cases on one word, a case combined with a finite
              verb mood, or a future subjunctive) return 0 results immediately.
            </li>
          </ul>
        </li>
      </ul>
    </section>

    <section id="proximity" class="corpus-ref-section">
      <h2>Word order and proximity (<code>~</code>)</h2>
      <p>
        By default, spaces between terms require adjacent words in exact order.
        Use <code>~</code> to search for words or phrases near each other:
      </p>
      <div class="corpus-ref-table-scroll">
        <table class="corpus-ref-table">
          <thead>
            <tr>
              <th>Operator</th>
              <th>Meaning</th>
              <th>Example</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><code>A B</code> (space)</td>
              <td>
                <code>A</code> immediately followed by <code>B</code>, with no
                sentence break (<code>.</code>) or section boundary in between.
              </td>
              <td>${raw(renderExampleCode("@l:do @c:dat"))}</td>
            </tr>
            <tr>
              <td><code>A ~ B</code></td>
              <td>
                <code>A</code> and <code>B</code> within
                ${PROXIMITY_DISTANCE.default} words of each other, in
                <strong>either order</strong>.
              </td>
              <td>${raw(renderExampleCode("@lemma:do ~ @case:dat"))}</td>
            </tr>
            <tr>
              <td>
                <code>A ~N B</code>
              </td>
              <td>
                <code>A</code> and <code>B</code> within <code>N</code> words
                (${PROXIMITY_DISTANCE.min}&ndash;${PROXIMITY_DISTANCE.max}) of
                each other, in <strong>either order</strong>.
              </td>
              <td>${raw(renderExampleCode("bellum ~3 causa"))}</td>
            </tr>
            <tr>
              <td><code>A ~&gt; B</code></td>
              <td>
                <code>A</code> within ${PROXIMITY_DISTANCE.default} words
                <strong>strictly before</strong> <code>B</code>.
              </td>
              <td>${raw(renderExampleCode("@lemma:do ~> @case:dat"))}</td>
            </tr>
            <tr>
              <td><code>A ~N&gt; B</code></td>
              <td>
                <code>A</code> within <code>N</code> words
                (${PROXIMITY_DISTANCE.min}&ndash;${PROXIMITY_DISTANCE.max})
                <strong>strictly before</strong> <code>B</code>.
              </td>
              <td>${raw(renderExampleCode("arma ~5> virumque"))}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        <strong>Multi-word spans:</strong> Each side of <code>~</code> can be a
        multi-word contiguous phrase (for example,
        ${raw(renderExampleCode("gallia est ~5 partes tres"))}). A query can
        contain up to ${MAX_QUERY_SPANS} contiguous spans separated by
        <code>~</code>.
      </p>
    </section>

    <section id="scope" class="corpus-ref-section">
      <h2>
        Author and work scope (<code>#Author</code>,
        <code>#Author/Work</code>)
      </h2>
      <p>
        Place one or more <code>#Author</code> or
        <code>#Author/Work</code> filters at the very start of the query to
        restrict which texts are searched:
      </p>
      <ul>
        <li>
          <strong>Single author:</strong>
          ${raw(renderExampleCode("#Caesar @lemma:bellum"))} searches all works
          by Caesar.
        </li>
        <li>
          <strong>Single work:</strong>
          ${raw(renderExampleCode("#Caesar/DeBelloGallico omnis"))} searches
          only Caesar&rsquo;s <i>De Bello Gallico</i>.
        </li>
        <li>
          <strong>Multiple authors or works:</strong> List up to
          ${MAX_AUTHOR_FILTERS} scope filters at the start of the query &mdash;
          for example, ${raw(renderExampleCode("#Caesar #Cicero @lemma:res"))}
          or ${raw(renderExampleCode("#Caesar #Cicero/DeOratore eloquentia"))}.
          Results from any of the listed authors or works are included.
        </li>
        <li>
          <strong>Placement &amp; casing:</strong> Scope filters must come
          before all word, <code>@</code>, and <code>(</code> tokens. Both
          author and work codes are matched case-insensitively. Browse the
          complete list in <a href="#authors">Authors and works</a> below.
        </li>
      </ul>
    </section>

    <section id="settings" class="corpus-ref-section">
      <h2>Settings and paging</h2>
      <p>
        Open the settings button in the search tray (or pass URL query
        parameters directly) to adjust how results are returned:
      </p>
      <div class="corpus-ref-table-scroll">
        <table class="corpus-ref-table">
          <thead>
            <tr>
              <th>Setting</th>
              <th>URL param</th>
              <th>Default</th>
              <th>Range / values</th>
              <th>Description</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Context words</strong></td>
              <td><code>contextLen</code> (or <code>cl</code>)</td>
              <td>${CONTEXT_LEN.default}</td>
              <td>${CONTEXT_LEN.min}&ndash;${CONTEXT_LEN.max}</td>
              <td>
                Number of words of surrounding passage text shown before and
                after each match.
              </td>
            </tr>
            <tr>
              <td><strong>Page size</strong></td>
              <td><code>pageSize</code> (or <code>ps</code>)</td>
              <td>${PAGE_SIZE.default}</td>
              <td>${PAGE_SIZE.min}&ndash;${PAGE_SIZE.max}</td>
              <td>Maximum number of matches shown per page.</td>
            </tr>
            <tr>
              <td><strong>Strict mode</strong></td>
              <td><code>strictMode</code> (or <code>sm</code>)</td>
              <td>Off</td>
              <td><code>1</code> or omitted</td>
              <td>
                When enabled, <code>@lemma</code> and
                <code>@inflection</code> filters match a token only if
                <em>every</em> possible morphological analysis of that token
                satisfies the filter.
              </td>
            </tr>
            <tr>
              <td><strong>Page cursor</strong></td>
              <td><code>cursor</code> (or <code>cp</code>)</td>
              <td>First page</td>
              <td><code>&lt;id&gt;-&lt;idx&gt;-&lt;cand&gt;</code></td>
              <td>
                Set by the Next page button. Submitting the search form resets
                the cursor to page 1; use browser Back to return to earlier
                pages.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </section>

    <section id="limits" class="corpus-ref-section">
      <h2>Limits</h2>
      <ul>
        <li>
          <strong>Query body length:</strong> At most ${MAX_QUERY_BODY_LENGTH}
          characters after canonicalization, excluding any leading
          <code>#Author</code> or <code>#Author/Work</code> scope filters.
        </li>
        <li>
          <strong>Scope filters:</strong> At most ${MAX_AUTHOR_FILTERS}
          <code>#Author</code> or <code>#Author/Work</code> filters per query.
        </li>
        <li>
          <strong>Proximity distance:</strong>
          ${PROXIMITY_DISTANCE.min}&ndash;${PROXIMITY_DISTANCE.max} words
          (default ${PROXIMITY_DISTANCE.default}).
        </li>
        <li>
          <strong>Contiguous spans:</strong> At most ${MAX_QUERY_SPANS}
          contiguous word/phrase spans connected by <code>~</code>.
        </li>
      </ul>
    </section>

    ${raw(renderAuthorsSection(authors, authorDisplayNames))}
  </article>`;
}

/**
 * Renders the full standalone `/corpus/reference` document with App Bar.
 * Highlights the Corpus tab (`activePage: "corpus"`) and loads only `common.js`
 * (`route: "static"`), since the reference page has no `<morcus-corpus-*>`
 * custom elements.
 */
export function renderCorpusReferencePageHtml(
  authors: CorpusAuthorList | undefined,
  authorDisplayNames?: ReadonlyMap<string, string>
): string {
  return renderPageShell({
    title: CORPUS_REFERENCE_TITLE,
    description:
      "Complete reference for the Morcus Latin corpus search syntax, grammatical inflection filters, proximity operators, and author and work codes.",
    canonicalPath: authors !== undefined ? CORPUS_REFERENCE_PATH : undefined,
    activePage: "corpus",
    route: "static",
    widthSurface: "corpus",
    contentHtml: renderCorpusReferenceContentHtml(authors, authorDisplayNames),
  });
}

/**
 * Resolves full author display names from the V2 library summaries and renders
 * the full `/corpus/reference` page HTML.
 */
export async function buildCorpusReferencePageHtml(
  authors: CorpusAuthorList | undefined
): Promise<string> {
  const displayNames =
    authors !== undefined
      ? await resolveAuthorDisplayNames(authors)
      : undefined;
  return renderCorpusReferencePageHtml(authors, displayNames);
}
