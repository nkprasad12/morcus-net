import { assert } from "@/common/assert";
import { exhaustiveGuard, safeParseInt } from "@/common/misc_utils";
import {
  tokenizeInput,
  type QueryToken,
} from "@/web/client/pages/corpus/autocomplete/input_tokenizer";
import { findNextOptions } from "@/web/client/pages/corpus/autocomplete/state_transitions";
import type { NonSpaceToken } from "@/web/client/pages/corpus/autocomplete/token_types";
import type { SuggestionsList } from "@/web/client/pages/corpus/corpus_view";

export interface CorpusAutocompleteOption {
  option: string;
  help?: string;
  prefix?: string;
  replacement?: string;
  cursor?: number;
  optionIsPlaceholder?: boolean;
}

const CASES = new Map([
  ["nominative", "nom"],
  ["genitive", "gen"],
  ["dative", "dat"],
  ["accusative", "acc"],
  ["ablative", "abl"],
  ["vocative", "voc"],
]);

const TENSES = new Map([
  ["present", "pres"],
  ["imperfect", "impf"],
  ["future", "fut"],
  ["perfect", "perf"],
  ["pluperfect", "plup"],
  ["future-perfect", "futp"],
]);

const VOICES = new Map([
  ["active", "act"],
  ["passive", "pass"],
]);

const PERSONS = new Map([
  ["1st", "1st"],
  ["2nd", "2nd"],
  ["3rd", "3rd"],
]);

const NUMBER = new Map([
  ["singular", "sing"],
  ["plural", "plur"],
]);

const GENDER = new Map([
  ["masculine", "masc"],
  ["feminine", "fem"],
  ["neuter", "neut"],
]);

const MOODS = new Map([
  ["indicative", "ind"],
  ["subjunctive", "subj"],
  ["imperative", "imper"],
  ["infinitive", "inf"],
  ["participle", "part"],
  ["gerundive", "ger"],
  ["supine", "supine"],
]);

const ALL_CATEGORIES = new Map<string, Map<string, string>>([
  ["case", CASES],
  ["tense", TENSES],
  ["voice", VOICES],
  ["person", PERSONS],
  ["number", NUMBER],
  ["gender", GENDER],
  ["mood", MOODS],
]);

const SPECIAL_CATEGORIES = new Map<string, string[]>([
  ["lemma", []],
  ...Array.from(ALL_CATEGORIES.entries()).map(
    ([k, v]) => [k, Array.from(v.keys())] as const
  ),
]);
const SPECIAL_SHORT_FORMS = new Set(
  Array.from(SPECIAL_CATEGORIES.keys()).map((k) => k[0])
);

function informational(help: string): CorpusAutocompleteOption {
  return {
    option: "",
    help,
    optionIsPlaceholder: true,
  };
}

function informationalWithPlaceholder(
  help: string,
  placeholder: string
): CorpusAutocompleteOption {
  return {
    option: `<${placeholder}>`,
    help,
    optionIsPlaceholder: true,
  };
}

const TILDE_HELP: CorpusAutocompleteOption[] = [
  { option: " ", help: "within 5 words of" },
  { option: "> ", prefix: "~", help: "within 5 words before" },
  { option: "3 ", prefix: "~", help: "within 3 words of" },
  { option: "10 ", prefix: "~", help: "within 10 words of" },
  { option: "15 ", prefix: "~", help: "within 15 words of" },
];

const WORD_HELP = informationalWithPlaceholder("match exact word", "word");
const SPECIAL_HELP: CorpusAutocompleteOption = {
  option: "@",
  help: "match lemma or inflection",
};
const NEXT_WORD_HELP = informationalWithPlaceholder(
  "followed by exact word",
  "word"
);
const NEXT_SPECIAL_HELP: CorpusAutocompleteOption = {
  option: "@",
  help: "followed by lemma or inflection",
};
const PROXIMITY_HELP: CorpusAutocompleteOption = {
  option: "~",
  help: "around",
};

const AUTHOR_HELP: CorpusAutocompleteOption = {
  option: "#",
  help: "search in author",
};

function unknownKeyword(keyword: string): CorpusAutocompleteOption {
  return informational(`❌ invalid keyword @${keyword}`);
}

function unknownKeywordOption(
  keyword: string,
  option: string
): CorpusAutocompleteOption {
  return informational(
    `❌ @${keyword}:${option} - invalid option \`${option}\``
  );
}

function missingAt(token: string): CorpusAutocompleteOption {
  return informational(`❌ ${token} - \`:value\` without @keyword`);
}

function missingValue(token: string): CorpusAutocompleteOption {
  return informational(`❌ ${token} - @keyword without \`:value\``);
}

function conjunctionHelp(last?: string): CorpusAutocompleteOption {
  return { option: " and ", prefix: last, help: "(restrict further)" };
}

function disjunctionHelp(last?: string): CorpusAutocompleteOption {
  return { option: " or ", prefix: last, help: "(relax restriction)" };
}

function logicOpCompletions(
  previousToken: string | undefined
): CorpusAutocompleteOption[] {
  const last = previousToken;
  if (
    last === undefined ||
    last === "and" ||
    last === "or" ||
    last.startsWith("#") ||
    last.startsWith("~")
  ) {
    return [];
  }
  return [conjunctionHelp(last), disjunctionHelp(last)];
}

function resolveKeyword(keyword: string): string | undefined {
  if (SPECIAL_CATEGORIES.has(keyword)) {
    return keyword;
  }
  if (SPECIAL_SHORT_FORMS.has(keyword)) {
    for (const longForm of SPECIAL_CATEGORIES.keys()) {
      if (longForm.startsWith(keyword)) {
        return longForm;
      }
    }
  }
  return undefined;
}

function errorsForToken(
  token: string,
  authors: SuggestionsList
): CorpusAutocompleteOption[] {
  if (token.startsWith("#") && Array.isArray(authors)) {
    const maybeAuthor = token.slice(1);
    const maybeAuthorLower = maybeAuthor.toLowerCase();
    if (!authors.some((author) => author.toLowerCase() === maybeAuthorLower)) {
      return [informational(`❌ invalid author #${maybeAuthor}`)];
    }
  }

  const startsWithAt = token.startsWith("@");
  const hasColon = token.includes(":");

  if (startsWithAt && !hasColon) {
    return [missingValue(token)];
  }

  if (!startsWithAt && hasColon) {
    return [missingAt(token)];
  }

  if (startsWithAt && hasColon) {
    const [rawKey, value] = token.slice(1).split(":", 2);
    if (rawKey === "lemma" || rawKey === "l") {
      if (value.length === 0) {
        return [missingValue(token)];
      }
      // Anything can be the value for a lemma.
      return [];
    }

    const keyword = resolveKeyword(rawKey);
    if (keyword === undefined) {
      return [unknownKeyword(rawKey)];
    }
    const longForms = SPECIAL_CATEGORIES.get(keyword) ?? [];
    const shortForms = ALL_CATEGORIES.get(keyword)?.values() ?? [];
    const possibleValues = longForms.concat(Array.from(shortForms));
    if (possibleValues.length === 0) {
      return [unknownKeyword(keyword)];
    }
    if (!possibleValues.includes(value)) {
      return [unknownKeywordOption(keyword, value)];
    }
  }

  if (token.includes("~")) {
    const [messages, isError] = parseProximityToken(token);
    return isError ? messages : [];
  }

  return [];
}

function parseProximityToken(
  token: string
): [options: CorpusAutocompleteOption[], isError: boolean] {
  const tildeIndex = token.indexOf("~");
  if (tildeIndex !== 0) {
    return [[informational("❌ proximity must start with `~`")], true];
  }
  const afterTilde = token.slice(1);
  if (afterTilde.length === 0) {
    return [TILDE_HELP, false];
  }
  let numbers = "";
  for (const char of afterTilde) {
    if (char >= "0" && char <= "9") {
      numbers += char;
    } else {
      break;
    }
  }
  const distance = numbers.length === 0 ? 5 : safeParseInt(numbers);
  if (distance === undefined || distance < 1 || distance > 15) {
    return [[informational("❌ range after ~ must be 1-15")], true];
  }
  const afterNumber = afterTilde.slice(numbers.length);
  if (afterNumber.length === 0) {
    // Exact match.
    return [
      [
        informational(`within ${distance} words of`),
        {
          option: ">",
          prefix: token,
          help: `within ${distance} words before`,
        },
      ],
      false,
    ];
  }
  if (afterNumber === ">") {
    return [[informational(`within ${distance} words before`)], false];
  }
  return [
    [informational(`❌ invalid \`${token}\`: expected ~, ~N, or ~N>`)],
    true,
  ];
}

function findLemmaCompletions(value: string, lemmata: string[]): string[] {
  assert(value.length > 0);
  const prefix = value[0] + value.slice(1).toLowerCase();

  // Binary search to find the first lemma that could match the prefix
  let left = 0;
  let right = lemmata.length;

  while (left < right) {
    const mid = Math.floor((left + right) / 2);
    if (lemmata[mid] < prefix) {
      left = mid + 1;
    } else {
      right = mid;
    }
  }

  // Collect up to 50 matching lemmata starting from the found position
  const results: string[] = [];
  for (let i = left; i < lemmata.length && results.length < 50; i++) {
    if (!lemmata[i].startsWith(prefix)) {
      break;
    }
    results.push(lemmata[i]);
  }

  return results;
}

function wouldStartNewToken(tokens: QueryToken[]): boolean {
  if (tokens.length === 0) {
    return true;
  }
  const lastType = tokens[tokens.length - 1][2];
  return lastType === "space" || lastType === ")" || lastType === "(";
}

function lastNonSpaceToken(
  query: QueryToken[],
  before?: number
): [QueryToken, number] | null {
  const start = before ?? query.length - 1;
  for (let i = start; i >= 0; i--) {
    if (query[i][2] !== "space") {
      return [query[i], i];
    }
  }
  return null;
}

function newTokenHelp(
  options: NonSpaceToken[],
  query: QueryToken[]
): CorpusAutocompleteOption[] {
  const lastNotSpace = lastNonSpaceToken(query);
  const lastNonSpaceType = lastNotSpace?.[0][2];
  const inMiddleOfSpan =
    lastNonSpaceType === ")" || lastNonSpaceType === "wordFilter";
  // A subsequent logical operator would only allow one of these,
  // because e.g. a and b or c is not allowed.
  const isFirstLogicOp =
    options.includes("logic:and") && options.includes("logic:or");
  const penultNotSpace =
    lastNotSpace === null
      ? null
      : lastNonSpaceToken(query, lastNotSpace[1] - 1);
  const isPenultOpenParen = penultNotSpace?.[0][2] === "(";
  // `isPenultOpenParen !== true` because we want to cover the case where
  // there is no penult token (`null`) or the case where the penult token
  // is not an open paren (`false`).
  const shouldAddOpenParen = isFirstLogicOp && isPenultOpenParen !== true;

  const results: CorpusAutocompleteOption[] = [];
  for (const option of options) {
    switch (option) {
      case "wordFilter":
        results.push(
          inMiddleOfSpan ? NEXT_WORD_HELP : WORD_HELP,
          inMiddleOfSpan ? NEXT_SPECIAL_HELP : SPECIAL_HELP
        );
        break;
      case "proximity":
        results.push(PROXIMITY_HELP);
        break;
      case "logic:or":
      case "logic:and": {
        const lastIsSpace = query[query.length - 1]?.[2] === "space";
        const baseResult =
          option === "logic:and" ? conjunctionHelp() : disjunctionHelp();
        if (lastIsSpace) {
          baseResult.option = baseResult.option.trimStart();
        }
        if (shouldAddOpenParen && lastNotSpace !== null) {
          const i = lastNotSpace[1];
          baseResult.replacement =
            // The part before the last token.
            query
              .slice(0, i)
              .map((t) => t[0])
              .join("") +
            // The added open paren.
            "(" +
            // The part after the last token.
            query
              .slice(i)
              .map((t) => t[0])
              .join("") +
            // The suggestion
            baseResult.option;
        }
        results.push(baseResult);
        break;
      }
      case "workFilter":
        results.push(AUTHOR_HELP);
        break;
      case "(":
        // We'll automatically insert parentheses, so don't suggest anything for this
        // option.
        break;
      case ")":
        results.push({ option: ") ", help: "done filtering word" });
        break;
      default:
        exhaustiveGuard(option);
    }
  }
  return results;
}

export function optionsForInput(
  inputRaw: string,
  authors?: SuggestionsList,
  lemmata?: SuggestionsList,
  position?: number
): CorpusAutocompleteOption[] {
  const allTokens = tokenizeInput(inputRaw);
  const tokens = allTokens.map((t) => t[0]).filter((t) => t.trim() !== "");

  if (wouldStartNewToken(allTokens)) {
    // If we're starting a new token, perform validation on the query so far, and if
    // there are no errors, suggest continuation options.
    const options = findNextOptions(allTokens);
    if (typeof options === "string") {
      // This indicates some error in the structure of the query.
      return [informational(options)];
    }
    // Otherwise, check all the previous tokens for errors.
    const tokenErrors = tokens.flatMap((t) => errorsForToken(t, authors));
    if (tokenErrors.length > 0) {
      return tokenErrors;
    }
    return newTokenHelp(options, allTokens);
  }

  const lastToken = tokens[tokens.length - 1];
  if (lastToken.startsWith("#")) {
    for (const token of tokens) {
      if (!token.startsWith("#")) {
        return [informational("❌ #author filters must be at start")];
      }
    }
    if (tokens.length > 1) {
      // TODO: Support multiple authors in the backend.
      return [informational("❌ only one #author filter allowed")];
    }
    if (authors === undefined) {
      return [informational("loading list of authors...")];
    }
    if (authors === "error") {
      return [informational("error loading list of authors")];
    }
    const afterHash = lastToken.substring(1);
    return authors
      .filter((a) => a.toLowerCase().startsWith(afterHash.toLowerCase()))
      .map((author) => ({
        option: `${author.substring(afterHash.length)} `,
        prefix: `#${afterHash.substring(0, afterHash.length)}`,
      }));
  }

  const isKeyword = lastToken.startsWith("@");
  const colonIdx = lastToken.indexOf(":");

  if (isKeyword && colonIdx === -1) {
    // We are after an @, so they are typing a special category.
    const afterAt = lastToken.slice(1);
    if (afterAt === "") {
      // Return all the options.
      return Array.from(SPECIAL_CATEGORIES.keys()).map((category) => ({
        option: category + ":",
        prefix: "@",
        help: `filter by ${category}`,
      }));
    }
    for (const category of SPECIAL_CATEGORIES.keys()) {
      // Just suggest that they close they keyword.
      if (category === afterAt) {
        return [{ option: ":", prefix: lastToken }];
      }
      // Return any substrings.
      if (category.startsWith(afterAt)) {
        return [
          {
            option: category.substring(afterAt.length) + ":",
            prefix: lastToken,
            help: `filter by ${category}`,
          },
        ];
      }
    }
    return [unknownKeyword(afterAt)];
  }

  if (isKeyword && colonIdx !== -1) {
    // We have a keyword that has been completed.
    const rawKeyword = lastToken.slice(1, colonIdx);
    const keyword = resolveKeyword(rawKeyword) ?? rawKeyword;
    const categoryOptions = SPECIAL_CATEGORIES.get(keyword);
    if (categoryOptions === undefined) {
      return [unknownKeyword(keyword)];
    }
    const valueSoFar = lastToken.slice(colonIdx + 1);
    const valueEmpty = valueSoFar.length === 0;
    if (keyword === "lemma") {
      if (valueEmpty) {
        return Array.isArray(lemmata)
          ? [informational("start typing for completions")]
          : [informational("an exact lemma")];
      }
      if (lemmata === undefined || lemmata === "error") {
        return [informational(`the lemma \`${valueSoFar}\``)];
      }
      const matches = findLemmaCompletions(valueSoFar, lemmata);
      if (matches.length === 0) {
        return [informational(`❌ no lemma matches \`${valueSoFar}\``)];
      }
      return matches.map((m) => ({
        // Add a space so the token completes.
        option: m.slice(valueSoFar.length) + " ",
        prefix: lastToken,
      }));
    }
    if (valueEmpty) {
      // Return all the options. We add a space so the token completes.
      return categoryOptions.map((option) => ({
        option: option + " ",
        prefix: lastToken,
      }));
    }
    let hasExactMatch = false;
    const autocompleteOptions: CorpusAutocompleteOption[] = [];
    for (const option of categoryOptions) {
      if (option === valueSoFar) {
        hasExactMatch = true;
        continue;
      }
      if (option.startsWith(valueSoFar)) {
        autocompleteOptions.push({
          option: option.slice(valueSoFar.length) + " ",
          prefix: lastToken,
        });
      }
    }
    if (autocompleteOptions.length > 0) {
      return autocompleteOptions;
    }
    if (hasExactMatch) {
      // If there's a exact match, don't report an error.
      // TODO: We should return the options for a completed token.
      return [
        informational(`a word with ${valueSoFar} ${keyword}`),
        ...logicOpCompletions(tokens[tokens.length - 2]),
      ];
    }
    return [unknownKeywordOption(keyword, valueSoFar)];
  }

  if (lastToken.startsWith("~")) {
    return parseProximityToken(lastToken)[0];
  }

  // TODO: We should return the options for a completed token.
  return [
    informational(`the word \`${lastToken}\``),
    ...logicOpCompletions(tokens[tokens.length - 2]),
  ];
}

export function CorpusAutocompleteItem(props: {
  option: CorpusAutocompleteOption;
}) {
  const option = props.option.option;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
      }}>
      {props.option.prefix !== undefined && (
        <span className="text sm">{props.option.prefix}</span>
      )}
      {props.option.optionIsPlaceholder ? (
        <span className="text xs smallChip">{option}</span>
      ) : (
        <span
          className="text sm"
          style={{ whiteSpace: "pre", fontWeight: 700 }}>
          {option}
        </span>
      )}

      {props.option.help && (
        <>
          <span style={{ whiteSpace: "pre" }}> </span>
          <span className="text xs smallChip">{props.option.help}</span>
        </>
      )}
    </div>
  );
}
