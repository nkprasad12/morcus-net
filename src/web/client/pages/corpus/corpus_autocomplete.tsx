export interface CorpusAutocompleteOption {
  option: string;
  help?: string;
  informationalOnly?: true;
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
    informationalOnly: true,
  };
}

const WORD_HELP = informational("type an exact word to match");
const SPECIAL_HELP: CorpusAutocompleteOption = {
  option: "@",
  help: "filter word by lemma or inflection",
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

function errorsForToken(
  token: string,
  authors: string[] | null
): CorpusAutocompleteOption[] {
  if (token.startsWith("#") && authors !== null) {
    const maybeAuthor = token.slice(1);
    const maybeAuthorLower = maybeAuthor.toLowerCase();
    if (!authors.some((author) => author.toLowerCase() === maybeAuthorLower)) {
      return [
        {
          option: "",
          help: `❌ invalid author #${maybeAuthor}`,
          informationalOnly: true,
        },
      ];
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

  return [];
}

function errorsForQuery(query: string[], authors: string[] | null) {
  // TODO: Also verify that if we have any #author tokens, they are at the start,
  // and that (for now) we only have one.
  return query.flatMap((t) => errorsForToken(t, authors));
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
    return [WORD_HELP, SPECIAL_HELP];
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
      }));
    }
    for (const category of SPECIAL_CATEGORIES.keys()) {
      // Just suggest that they close they keyword.
      if (category === afterAt) {
        return [{ option: ":" }];
      }
      // Return any substrings.
      if (category.startsWith(afterAt)) {
        return [{ option: category.substring(afterAt.length) + ":" }];
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
      return [informational(lemmaHelp)];
    }
    if (valueEmpty) {
      // Return all the options. We add a space so the token completes.
      return categoryOptions.map((option) => ({ option: option + " " }));
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
        });
      }
    }
    if (autocompleteOptions.length > 0) {
      return autocompleteOptions;
    }
    if (hasExactMatch) {
      // If there's a exact match, don't report an error.
      // TODO: We should return the options for a completed token.
      return [];
    }
    return [unknownKeywordOption(keyword, valueSoFar)];
  }

  return [];
}

export function CorpusAutocompleteItem(props: {
  current: string;
  option: CorpusAutocompleteOption;
}) {
  const option = props.option.option;
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
      }}>
      {props.option.informationalOnly !== true && (
        <>
          <span className="text sm">{props.current}</span>
          <b>{option}</b>
        </>
      )}
      {props.option.help && (
        <span className="text xs smallChip">{props.option.help}</span>
      )}
    </div>
  );
}
