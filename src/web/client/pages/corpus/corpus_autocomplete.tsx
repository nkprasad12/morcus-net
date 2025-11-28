import { assert } from "@/common/assert";
import { safeParseInt } from "@/common/misc_utils";
import type { SuggestionsList } from "@/web/client/pages/corpus/corpus_view";

export interface CorpusAutocompleteOption {
  option: string;
  help?: string;
  prefix?: string;
}

const SPECIAL_CATEGORIES = new Map<string, string[]>([
  ["lemma", []],
  [
    "case",
    ["nominative", "genitive", "dative", "accusative", "ablative", "vocative"],
  ],
  [
    "tense",
    [
      "present",
      "imperfect",
      "future",
      "perfect",
      "pluperfect",
      "future-perfect",
    ],
  ],
  ["voice", ["active", "passive"]],
  ["person", ["1st", "2nd", "3rd"]],
  ["number", ["singular", "plural"]],
  ["gender", ["masculine", "feminine", "neuter"]],
  ["mood", ["indicative", "subjunctive", "imperative"]],
]);

function informational(help: string): CorpusAutocompleteOption {
  return {
    option: "",
    help,
  };
}

const TILDE_HELP: CorpusAutocompleteOption[] = [
  informational("within 5 words of"),
  { option: ">", prefix: "~", help: "within 5 words before" },
  { option: "3", prefix: "~", help: "within 3 words of" },
  { option: "10", prefix: "~", help: "within 10 words of" },
  { option: "15", prefix: "~", help: "within 15 words of" },
];

const WORD_HELP = informational("<word> match exact word");
const SPECIAL_HELP: CorpusAutocompleteOption = {
  option: "@",
  help: "match lemma or inflection",
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
  return [
    { option: " and ", prefix: last, help: "(restrict further)" },
    { option: " or ", prefix: last, help: "(relax restriction)" },
  ];
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
    const [keyword, value] = token.slice(1).split(":", 2);
    if (keyword === "lemma") {
      if (value.length === 0) {
        return [missingValue(token)];
      }
      // Anything can be the value for a lemma.
      return [];
    }
    const possibleValues = SPECIAL_CATEGORIES.get(keyword);
    if (possibleValues === undefined) {
      return [unknownKeyword(keyword)];
    }
    if (!possibleValues.includes(value)) {
      return [unknownKeywordOption(keyword, value)];
    }
  }

  if (token.startsWith("~")) {
    const [messages, isError] = parseProximityToken(token);
    return isError ? messages : [];
  }

  return [];
}

function errorsForQuery(query: string[], authors: SuggestionsList) {
  // TODO: Also verify that if we have any #author tokens, they are at the start,
  // and that (for now) we only have one.
  return query.flatMap((t) => errorsForToken(t, authors));
}

function parseProximityToken(
  token: string
): [options: CorpusAutocompleteOption[], isError: boolean] {
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

export function optionsForInput(
  inputRaw: string,
  authors?: SuggestionsList,
  lemmata?: SuggestionsList
): CorpusAutocompleteOption[] {
  const isNewToken = inputRaw.endsWith(" ") || inputRaw.length === 0;
  const tokens = inputRaw.split(" ").filter((t) => t.length > 0);

  if (isNewToken) {
    if (tokens.length === 0) {
      // The backend only handles one author right now, so
      // `AUTHOR_HELP` is only included when we have no tokens.
      return [WORD_HELP, SPECIAL_HELP, AUTHOR_HELP];
    }
    // Otherwise, if we have a new token, check all the previous tokens for errors.
    const errors = errorsForQuery(tokens, authors);
    if (errors.length > 0) {
      return errors;
    }
    return [
      WORD_HELP,
      SPECIAL_HELP,
      ...logicOpCompletions(tokens[tokens.length - 1]),
    ];
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
        option: author.substring(afterHash.length),
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
          },
        ];
      }
    }
    return [unknownKeyword(afterAt)];
  }

  if (isKeyword && colonIdx !== -1) {
    // We have a keyword that has been completed.
    const keyword = lastToken.slice(1, colonIdx);
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
        option: m.slice(valueSoFar.length),
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
      <i className="text sm" style={{ whiteSpace: "pre" }}>
        {option}
      </i>
      {props.option.help && (
        <span className="text xs smallChip"> {props.option.help}</span>
      )}
    </div>
  );
}
