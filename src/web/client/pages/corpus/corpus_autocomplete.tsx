import { safeParseInt } from "@/common/misc_utils";

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
    { option: " and", prefix: last, help: "(restrict further)" },
    { option: " or", prefix: last, help: "(relax restriction)" },
  ];
}

function errorsForToken(
  token: string,
  authors: string[] | null
): CorpusAutocompleteOption[] {
  if (token.startsWith("#") && authors !== null) {
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

function errorsForQuery(query: string[], authors: string[] | null) {
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

export function optionsForInput(
  inputRaw: string,
  authors: string[] | null
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
    if (!authors) {
      // If we have no authors, we won't automatically re-render until the user types something else.
      // So there's no point returning "loading" as that could prompt the user to just wait.
      return [];
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
      const lemmaHelp = valueEmpty
        ? "an exact lemma"
        : `the lemma \`${valueSoFar}\``;
      // They can type any word here, so we don't need to check anything.
      return [
        informational(lemmaHelp),
        ...logicOpCompletions(tokens[tokens.length - 2]),
      ];
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
  const option = props.option.option.replaceAll(" ", " ");
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
      }}>
      {props.option.prefix !== undefined && (
        <span className="text sm">{props.option.prefix}</span>
      )}
      <i style={{ whiteSpace: "pre" }}>{option}</i>
      {props.option.help && (
        <span className="text xs smallChip"> {props.option.help}</span>
      )}
    </div>
  );
}
