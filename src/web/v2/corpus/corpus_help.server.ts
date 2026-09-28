/**
 * The static "How to write queries" help, ported from V1's
 * `QueryHelpSection`. The category values come from the grammar's tables so
 * the help can't drift from what the grammar accepts.
 */

import {
  html,
  joinHtml,
  raw,
  type RawHtml,
  type SafeHtml,
} from "@/web/v2/core/html.common";
import { INFLECTION_CATEGORIES } from "@/web/v2/corpus/corpus_syntax.common";

const CATEGORY_ORDER = [
  "mood",
  "tense",
  "voice",
  "person",
  "number",
  "gender",
  "case",
] as const;

function codeList(values: readonly string[]): RawHtml {
  return joinHtml(
    values.map((v) => html`<code>${v}</code>`),
    ", "
  );
}

function categoryItems(): RawHtml {
  return joinHtml(
    CATEGORY_ORDER.map((category) => {
      const values = [...(INFLECTION_CATEGORIES.get(category)?.keys() ?? [])];
      const note =
        category === "case" ? " (all usual cases except locative)" : "";
      return html`<li>
        <code>@${category}</code> - ${codeList(values)}${note}.
      </li>`;
    })
  );
}

interface Example {
  readonly query: string;
  readonly description: SafeHtml;
  readonly sample: SafeHtml;
}

const EXAMPLES: readonly Example[] = [
  {
    query: "amoris",
    description: html`Exact occurrences of <code>amoris</code>.`,
    sample: html`<code>amoris</code> or <code>Amoris</code>`,
  },
  {
    query: "@lemma:do @case:dat",
    description: html`Any inflection of <code>do</code> followed by a dative
      word.`,
    sample: html`<code>dedit nato</code> or <code>dant patri</code>`,
  },
  {
    query: "(@lemma:do or @lemma:habeo) ~ @case:acc",
    description: html`Any inflection of <code>do</code> or
      <code>habeo</code> near an accusative word.`,
    sample: html`<code>dedi saepe panem</code> or
      <code>habet in manu ensem</code>`,
  },
  {
    query: "#Caesar @lemma:bellum",
    description: html`Any inflection of <code>bellum</code> in works by Caesar.`,
    sample: html`<code>bellum</code>, <code>belli</code>, etc.`,
  },
];

function exampleRows(): RawHtml {
  return joinHtml(
    EXAMPLES.map((ex) => {
      const href = `/v2/corpus?${new URLSearchParams({
        q: ex.query,
      }).toString()}`;
      return html`<tr>
        <td>
          <a href="${href}" data-corpus-nav><code>${ex.query}</code></a>
        </td>
        <td>${raw(ex.description)}</td>
        <td>${raw(ex.sample)}</td>
      </tr>`;
    })
  );
}

/**
 * The help disclosure. Open on the landing view, where it's the main
 * content, and closed once there are results to look at.
 */
export function renderCorpusHelp(open: boolean): SafeHtml {
  return html`<details class="corpus-help" ${open ? "open" : ""}>
    <summary>How to write queries</summary>
    <div class="corpus-help-body">
      <details>
        <summary>Narrowing words</summary>
        <ul>
          <li>
            <code>&lt;word&gt;</code> - A specific word to match; for example,
            <code>amoris</code>. This is not case sensitive.
          </li>
          <li>
            <code>@lemma:&lt;lemma&gt;</code> - The lemma form of a word, which
            will match any inflection of the lemma. For example,
            <code>@lemma:corpus</code> would match both <code>corpus</code> and
            <code>corporis</code>.
            <ul>
              <li>
                For verbs, this is usually the first-person singular present
                indicative; for example, <code>@lemma:amo</code> (not
                <code>amare</code>).
              </li>
              <li>
                You can also use <code>@l</code> as a shorthand for
                <code>@lemma</code>; for example, <code>@l:corpus</code>.
              </li>
            </ul>
          </li>
          <li>
            <code>@&lt;category&gt;:&lt;value&gt;</code> - A specific
            grammatical category to match. For example,
            <code>@case:genitive</code> would match any word in the genitive
            case.
            <ul>
              <li>
                All of the usual morphological categories are supported, with
                the exception of <code>@degree</code>. Special verbal forms are
                grouped into <code>@mood</code>. The options for each category
                are:
                <ul>
                  ${categoryItems()}
                </ul>
              </li>
              <li>
                You can use the first letter of a category as a shorthand; for
                example, <code>@c:genitive</code> for
                <code>@case:genitive</code>.
              </li>
            </ul>
          </li>
          <li>
            Combine any of the above with the keywords <code>and</code> and
            <code>or</code>. For example,
            <code>@lemma:amo and @case:genitive</code> will match any word that
            is both an inflection of <code>amo</code> and in the genitive case.
          </li>
        </ul>
      </details>
      <details>
        <summary>Combining words</summary>
        <ul>
          <li>
            <code>(space)</code> - Implies that the previous and next items are
            adjacent. For example, <code>amor @case:genitive</code> would match
            <code>amor</code> followed by any genitive word.
          </li>
          <li>
            <code>~</code> - Implies that the previous and next items are within
            a few words of each other. For example,
            <code>@lemma:amo ~ @case:genitive</code> would match any inflection
            of <code>amo</code> within a few words of any genitive word.
            <ul>
              <li>
                You can specify the exact proximity by adding a number; for
                example, <code>@lemma:amo ~3 @case:genitive</code> would match
                <code>amo</code> within 3 words of any genitive word. The number
                must be 15 or lower.
              </li>
              <li>
                You can specify a direction by adding <code>&gt;</code>; for
                example, <code>@lemma:amo ~3&gt; @case:genitive</code> would
                match <code>amo</code> 3 or fewer words before any genitive
                word. The number must be 15 or lower.
              </li>
            </ul>
          </li>
        </ul>
      </details>
      <details>
        <summary>Filtering by author</summary>
        <ul>
          <li>
            <code>#author</code> - Restricts the search to the specified author.
            For example, <code>#Caesar amoris</code> will find instances of
            <code>amoris</code> but only in works by Caesar. Currently you may
            only specify one author.
          </li>
        </ul>
      </details>
      <details>
        <summary>Examples</summary>
        <table class="corpus-help-examples">
          <thead>
            <tr>
              <th>Query</th>
              <th>Description</th>
              <th>Sample</th>
            </tr>
          </thead>
          <tbody>
            ${exampleRows()}
          </tbody>
        </table>
      </details>
    </div>
  </details>`;
}
