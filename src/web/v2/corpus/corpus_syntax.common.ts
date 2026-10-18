/**
 * The corpus query grammar, shared by the server and the browser.
 *
 * Ported from V1 (`archive/ui-v1:src/web/client/pages/corpus/autocomplete/` and
 * `transformQuery` in `corpus_view.tsx`). The server uses it to validate a
 * query and translate it into the Rust engine's syntax before running it; the
 * autocomplete element uses it to compute what may come next at the caret.
 * Keeping one copy means the two can't disagree about what a valid query is.
 *
 * Error messages are plain sentences. The autocomplete adds its own
 * decoration (V1 prefixed them with ❌).
 */

// // // // // // //
// Token types    //
// // // // // // //

type CorpusTokenType =
  | "space"
  | "("
  | ")"
  | "wordFilter"
  | "logic:and"
  | "logic:or"
  | "workFilter"
  | "proximity";

export type NonSpaceToken = Exclude<CorpusTokenType, "space">;

export function categorizeToken(token: string): CorpusTokenType {
  if (token === "(") {
    return "(";
  } else if (token === ")") {
    return ")";
  } else if (token === "and" || token === "or") {
    return `logic:${token}`;
  } else if (token.trim() === "") {
    return "space";
  } else if (token.startsWith("@")) {
    return "wordFilter";
  } else if (token.startsWith("#")) {
    return "workFilter";
  } else if (token.includes("~")) {
    return "proximity";
  } else {
    return "wordFilter";
  }
}

// // // // // // //
// Tokenizer      //
// // // // // // //

export type QueryToken<T = CorpusTokenType> = [
  tokenOrSpace: string,
  start: number,
  T
];

/**
 * Splits the input into tokens with their start positions. Runs of spaces are
 * tokens of their own, and each parenthesis is its own token.
 *
 * For example, `" word1 (word2 word3)  "` becomes:
 * ```
 * [" ", 0, "space"], ["word1", 1, "wordFilter"], [" ", 6, "space"],
 * ["(", 7, "("], ["word2", 8, "wordFilter"], [" ", 13, "space"],
 * ["word3", 14, "wordFilter"], [")", 19, ")"], ["  ", 20, "space"]
 * ```
 */
export function tokenizeInput(input: string): QueryToken[] {
  const tokens: QueryToken[] = [];

  let currentToken = "";
  let tokenStart = 0;
  let isCurrentTokenSpace = false;

  const flushCurrentToken = () => {
    if (currentToken.length > 0) {
      tokens.push([currentToken, tokenStart, categorizeToken(currentToken)]);
      currentToken = "";
    }
  };

  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    const isSpace = c === " ";
    const isParenthesis = c === "(" || c === ")";

    if (isParenthesis) {
      flushCurrentToken();
      tokens.push([c, i, c]);
      tokenStart = i + 1;
      continue;
    }

    if (currentToken.length === 0) {
      tokenStart = i;
      isCurrentTokenSpace = isSpace;
      currentToken = c;
    } else if (isCurrentTokenSpace === isSpace) {
      currentToken += c;
    } else {
      flushCurrentToken();
      tokenStart = i;
      isCurrentTokenSpace = isSpace;
      currentToken = c;
    }
  }

  flushCurrentToken();
  return tokens;
}

// // // // // // // //
// State machine     //
// // // // // // // //

type QueryProcessState =
  | "ComplexTerm"
  | "ComplexTerm;LastWasTerm"
  | "InSpan"
  | "SpanStart"
  | "SpanStartOrWorkFilter";

type State = [QueryProcessState, currentParenDepth: number];

interface FedStateMachineOutput {
  nextOptions: NonSpaceToken[];
  termGroups: QueryToken[][];
}

/** The token types allowed next, or an error message. */
export function findNextOptions(
  sequence: QueryToken[]
): NonSpaceToken[] | string {
  const output = feedStateMachine(sequence);
  return typeof output === "string" ? output : output.nextOptions;
}

/**
 * The tokens grouped by the term (single word) they constrain, or an error
 * message.
 */
export function termGroups(sequence: QueryToken[]): QueryToken[][] | string {
  const output = feedStateMachine(sequence);
  return typeof output === "string" ? output : output.termGroups;
}

function isLogicalOp(input: string): input is "and" | "or" {
  return input === "and" || input === "or";
}

function feedStateMachine(
  sequence: QueryToken[]
): FedStateMachineOutput | string {
  let state: State = ["SpanStartOrWorkFilter", 0];
  let logicalOp: "and" | "or" | null = null;
  let workFilters = 0;
  let lastWasCloseParen = false;
  const groups: QueryToken[][] = [];

  function getOptions() {
    // Only one level of parentheses is supported, so after a close paren no
    // more logical operators can follow.
    return optionsForState(state, logicalOp).filter(
      (o) => !lastWasCloseParen || (o[0] !== "logic:and" && o[0] !== "logic:or")
    );
  }

  for (let i = 0; i < sequence.length; i++) {
    const [token, startIdx, tokenType] = sequence[i];
    if (tokenType === "space") {
      continue;
    }
    lastWasCloseParen = tokenType === ")";
    if (tokenType === "workFilter") {
      workFilters++;
    }
    if (tokenType.startsWith("logic:")) {
      const unexpectedOr = logicalOp === "and" && token === "or";
      const unexpectedAnd = logicalOp === "or" && token === "and";
      if (unexpectedOr || unexpectedAnd) {
        return "Cannot mix `and` with `or` on the same word.";
      }
      if (!isLogicalOp(token)) {
        return `expected logical operator but got \`${token}\``;
      }
      logicalOp = token;
    }

    const options = getOptions();
    const matchingOption = options.find((o) => o[0] === tokenType);
    if (!matchingOption) {
      if (tokenType === "workFilter") {
        return "#author filters must be at start";
      }
      let j = i - 1;
      while (j >= 0 && sequence[j][2] === "space") {
        j--;
      }
      const context = i === 0 ? "at start" : `after \`${sequence[j][0]}\``;
      return `\`${token}\` not allowed ${context}`;
    }
    if (matchingOption[0] === "workFilter" && workFilters > 1) {
      return "only one #author filter allowed";
    }
    if (matchingOption[1] === "InSpan") {
      // Completing a term in a span resets the logical operator.
      logicalOp = null;
    }
    const parenIncrement =
      matchingOption[0] === "(" ? 1 : matchingOption[0] === ")" ? -1 : 0;
    state = [matchingOption[1], state[1] + parenIncrement];

    if (matchingOption[2] || groups.length === 0) {
      groups.push([]);
    }
    groups[groups.length - 1].push([token, startIdx, tokenType]);
  }
  const nextOptions = getOptions()
    // Only one work filter per query.
    .filter((o) => workFilters === 0 || o[0] !== "workFilter")
    .map((o) => o[0]);
  return { nextOptions, termGroups: groups };
}

function optionsForState(
  state: State,
  logicalOp: "and" | "or" | null
): [NonSpaceToken, QueryProcessState, isNewTerm: boolean][] {
  const [processState, parenDepth] = state;
  const options: [NonSpaceToken, QueryProcessState, boolean][] = [];
  switch (processState) {
    case "InSpan":
      // In a span with a single-part last term: filter the next word, refine
      // the current one with a logical operator, or end the span.
      return [
        ["wordFilter", "InSpan", true],
        ["logic:and", "ComplexTerm", false],
        ["logic:or", "ComplexTerm", false],
        ["proximity", "SpanStart", true],
        ["(", "ComplexTerm", true],
      ];
    case "ComplexTerm;LastWasTerm":
      if (logicalOp !== "and") {
        options.push(["logic:or", "ComplexTerm", false]);
      }
      if (logicalOp !== "or") {
        options.push(["logic:and", "ComplexTerm", false]);
      }
      if (parenDepth > 0) {
        options.push([")", "InSpan", false]);
      } else {
        options.push(
          ["proximity", "SpanStart", true],
          ["wordFilter", "InSpan", true],
          ["(", "ComplexTerm", true]
        );
      }
      return options;
    case "ComplexTerm":
      // Building a complex term right after an operator: need a term.
      return [["wordFilter", "ComplexTerm;LastWasTerm", false]];
    case "SpanStartOrWorkFilter":
      options.push(["workFilter", "SpanStartOrWorkFilter", true]);
      options.push(["(", "ComplexTerm", true], ["wordFilter", "InSpan", true]);
      return options;
    case "SpanStart":
      options.push(["(", "ComplexTerm", true], ["wordFilter", "InSpan", true]);
      return options;
  }
}

// // // // // // // // // //
// Inflection categories   //
// // // // // // // // // //

/** Long form → short form, for each category value. */
export const INFLECTION_CATEGORIES: ReadonlyMap<
  string,
  ReadonlyMap<string, string>
> = new Map([
  [
    "case",
    new Map([
      ["nominative", "nom"],
      ["genitive", "gen"],
      ["dative", "dat"],
      ["accusative", "acc"],
      ["ablative", "abl"],
      ["vocative", "voc"],
    ]),
  ],
  [
    "tense",
    new Map([
      ["present", "pres"],
      ["imperfect", "impf"],
      ["future", "fut"],
      ["perfect", "perf"],
      ["pluperfect", "plup"],
      ["future-perfect", "futp"],
    ]),
  ],
  [
    "voice",
    new Map([
      ["active", "act"],
      ["passive", "pass"],
    ]),
  ],
  [
    "person",
    new Map([
      ["1st", "1st"],
      ["2nd", "2nd"],
      ["3rd", "3rd"],
    ]),
  ],
  [
    "number",
    new Map([
      ["singular", "sing"],
      ["plural", "plur"],
    ]),
  ],
  [
    "gender",
    new Map([
      ["masculine", "masc"],
      ["feminine", "fem"],
      ["neuter", "neut"],
    ]),
  ],
  [
    "mood",
    new Map([
      ["indicative", "ind"],
      ["subjunctive", "subj"],
      ["imperative", "imper"],
      ["infinitive", "inf"],
      ["participle", "part"],
      ["gerundive", "ger"],
      ["supine", "supine"],
    ]),
  ],
]);

/** `@<keyword>:` names: `lemma` plus every inflection category. */
export const SPECIAL_KEYWORDS: readonly string[] = [
  "lemma",
  ...INFLECTION_CATEGORIES.keys(),
];

/** Resolves a keyword or its one-letter short form (`c` → `case`). */
export function resolveKeyword(keyword: string): string | undefined {
  if (SPECIAL_KEYWORDS.includes(keyword)) {
    return keyword;
  }
  if (keyword.length === 1) {
    return SPECIAL_KEYWORDS.find((k) => k.startsWith(keyword));
  }
  return undefined;
}

/** Whether `value` is a long or short form for the inflection `keyword`. */
export function isInflectionValue(keyword: string, value: string): boolean {
  const values = INFLECTION_CATEGORIES.get(keyword);
  return (
    values !== undefined &&
    (values.has(value) || [...values.values()].includes(value))
  );
}

/** Error message for an unrecognized `@<keyword>:<value>` option. */
export function invalidInflectionOption(
  keyword: string,
  value: string
): string {
  return `@${keyword}:${value} - invalid option \`${value}\``;
}

// // // // // // // // //
// Per-token validation //
// // // // // // // // //

interface ProximityInfo {
  distance: number;
  directed: boolean;
}

/** Parses `~`, `~N`, `~>` or `~N>`; returns an error message otherwise. */
export function parseProximity(token: string): ProximityInfo | string {
  if (!token.startsWith("~")) {
    return "proximity must start with `~`";
  }
  const match = /^~(\d*)(>?)$/.exec(token);
  if (match === null) {
    return `invalid \`${token}\`: expected ~, ~N, or ~N>`;
  }
  const distance = match[1] === "" ? 5 : Number.parseInt(match[1], 10);
  if (distance < 1 || distance > 15) {
    return "range after ~ must be 1-15";
  }
  return { distance, directed: match[2] === ">" };
}

/**
 * The errors in a single complete token, given the known authors (`undefined`
 * if the list isn't available, which skips the author check).
 */
export function errorsForToken(
  token: string,
  authors: readonly string[] | undefined
): string[] {
  if (token.startsWith("#")) {
    const maybeAuthor = token.slice(1).toLowerCase();
    if (
      authors !== undefined &&
      !authors.some((author) => author.toLowerCase() === maybeAuthor)
    ) {
      return [`invalid author #${token.slice(1)}`];
    }
    return [];
  }

  const startsWithAt = token.startsWith("@");
  const hasColon = token.includes(":");
  if (startsWithAt && !hasColon) {
    return [`${token} - @keyword without \`:value\``];
  }
  if (!startsWithAt && hasColon) {
    return [`${token} - \`:value\` without @keyword`];
  }
  if (startsWithAt && hasColon) {
    const colon = token.indexOf(":");
    const rawKey = token.slice(1, colon);
    const value = token.slice(colon + 1);
    const keyword = resolveKeyword(rawKey);
    if (keyword === undefined) {
      return [`invalid keyword @${rawKey}`];
    }
    if (value.length === 0) {
      return [`${token} - @keyword without \`:value\``];
    }
    if (keyword === "lemma") {
      // Anything can be the value for a lemma.
      return [];
    }
    if (!isInflectionValue(keyword, value)) {
      return [invalidInflectionOption(keyword, value)];
    }
    return [];
  }

  if (token.includes("~")) {
    const proximity = parseProximity(token);
    return typeof proximity === "string" ? [proximity] : [];
  }
  return [];
}

// // // // // // // // // // //
// Whole-query operations     //
// // // // // // // // // // //

/** Returns the first problem with a complete query, or `null` if none. */
export function validateQuery(
  query: string,
  authors: readonly string[] | undefined
): string | null {
  const tokens = tokenizeInput(query);
  const structure = findNextOptions(tokens);
  if (typeof structure === "string") {
    return structure;
  }
  for (const [token, , type] of tokens) {
    if (type === "space") continue;
    const errors = errorsForToken(token, authors);
    if (errors.length > 0) {
      return errors[0];
    }
  }
  return null;
}

/** Whether the query has any `@keyword:value` filter (lemma or inflection). */
export function hasInflectionFilters(query: string): boolean {
  return /@\w+:/.test(query);
}

/**
 * Translates the user-facing syntax into the Rust engine's syntax
 * (`corpus_rust/src/query_parsing_v2.rs`):
 *
 * - `#Author` → `[Author]`
 * - `~N` → `N~`, `~N>` → `N~>`
 * - Terms joined by `and` / `or` are wrapped in parentheses (closing any
 *   the user left open).
 *
 * A query with structural errors is returned unchanged; callers validate
 * first with {@link validateQuery}.
 */
export function transformQuery(query: string): string {
  const grouped = termGroups(tokenizeInput(query));
  if (typeof grouped === "string") {
    return query;
  }
  return grouped
    .map((group) => {
      const hasLogicalOp = group.some((t) => t[2].startsWith("logic:"));
      if (!hasLogicalOp) {
        return group;
      }
      let transformed = group;
      if (group[0][2] !== "(") {
        transformed = [["(", group[0][1], "("], ...group];
      }
      if (group[group.length - 1][2] !== ")") {
        transformed = [...transformed, [")", group[group.length - 1][1], ")"]];
      }
      return transformed;
    })
    .flat()
    .map(([token]) => token)
    .map((t) =>
      t.replace(/^~(\d+)(.*)$/, (_match, num: string, rest: string) => {
        return `${num}~${rest}`;
      })
    )
    .map((t) => t.replace(/^#(.+)$/, (_m, name: string) => `[${name}]`))
    .join(" ");
}
