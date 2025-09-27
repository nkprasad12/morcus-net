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

const WORD_HELP: CorpusAutocompleteOption = {
  option: "",
  help: "type an exact word to match",
  informationalOnly: true,
};

const SPECIAL_HELP: CorpusAutocompleteOption = {
  option: "@",
  help: "filter by lemma or inflection",
};

function unknownKeyword(keyword: string): CorpusAutocompleteOption {
  return {
    option: "",
    help: `Unknown keyword @${keyword}`,
    informationalOnly: true,
  };
}

function unknownKeywordOption(
  keyword: string,
  option: string
): CorpusAutocompleteOption {
  return {
    option: "",
    help: `Unknown option @${keyword}:${option}`,
    informationalOnly: true,
  };
}

const MISSING_AT: CorpusAutocompleteOption = {
  option: "",
  help: "Error - `:` without @keyword",
  informationalOnly: true,
};

type Milestone = "termStart" | "@" | ":";
function findLastMilestone(s: string, startIdx?: number): [Milestone, number] {
  const start = startIdx ?? s.length;
  for (let i = start - 1; i >= 0; i--) {
    const c = s[i];
    if (c === "@") {
      return ["@", i];
    }
    if (c === ":") {
      return [":", i];
    }
  }
  return ["termStart", 0];
}

export function optionsForInput(inputRaw: string): CorpusAutocompleteOption[] {
  const [milestone, idx] = findLastMilestone(inputRaw);
  const fromMilestone = inputRaw.slice(idx).toLowerCase();
  if (milestone === "termStart") {
    // We are at the start of a term, and they have no non-space characters yet.
    if (fromMilestone.trim() === "") {
      return [WORD_HELP, SPECIAL_HELP];
    }
    // We have some non-space characters, so they've started typing a word.
    return [];
  }
  if (milestone === "@") {
    // We are after an @, so they are typing a special category.
    const afterAt = fromMilestone.slice(1);
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
  if (milestone === ":") {
    const [lastMilestone, lastIdx] = findLastMilestone(inputRaw, idx);
    if (lastMilestone !== "@") {
      return [MISSING_AT];
    }
    const category = inputRaw.slice(lastIdx + 1, idx).toLowerCase();
    const categoryOptions = SPECIAL_CATEGORIES.get(category);
    if (categoryOptions === undefined) {
      return [unknownKeyword(category)];
    }
    if (category === "lemma") {
      // They can type any word here.
      return [];
    }
    const afterColon = fromMilestone.slice(1);
    if (afterColon === "") {
      // Return all the options.
      return categoryOptions.map((option) => ({ option: option + " " }));
    }
    let hasExactMatch = false;
    const autocompleteOptions: CorpusAutocompleteOption[] = [];
    for (const option of categoryOptions) {
      if (option === afterColon.trimEnd()) {
        hasExactMatch = true;
        continue;
      }
      if (option.startsWith(afterColon)) {
        autocompleteOptions.push({
          option: option.slice(afterColon.length) + " ",
        });
      }
    }
    if (autocompleteOptions.length > 0) {
      return autocompleteOptions;
    }
    if (hasExactMatch) {
      // If there's a exact match, don't report an error.
      return [];
    }
    return [unknownKeywordOption(category, afterColon)];
  }
  return [];
}

export function CorpusAutocompleteItem(props: {
  current: string;
  option: CorpusAutocompleteOption;
}) {
  return (
    <div>
      {props.option.informationalOnly !== true && (
        <>
          {props.current}
          <b>{props.option.option}</b>{" "}
        </>
      )}
      {props.option.help && (
        <span className="text xs smallChip">{props.option.help}</span>
      )}
    </div>
  );
}
