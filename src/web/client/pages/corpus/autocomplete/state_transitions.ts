import { exhaustiveGuard } from "@/common/misc_utils";
import type { QueryToken } from "@/web/client/pages/corpus/autocomplete/input_tokenizer";
import type { NonSpaceToken } from "@/web/client/pages/corpus/autocomplete/token_types";

type QueryProcessState =
  | "ComplexTerm"
  | "ComplexTerm;LastWasTerm"
  | "InSpan"
  | "SpanStart"
  | "SpanStartOrWorkFilter";

type State = [QueryProcessState, currentParenDepth: number];

function isLogicalOp(input: string): input is "and" | "or" {
  return input === "and" || input === "or";
}

export function findNextOptions(
  sequence: QueryToken[]
): NonSpaceToken[] | string {
  return errorOr(feedStateMachine(sequence), "nextOptions");
}

export function termGroups(sequence: QueryToken[]): QueryToken[][] | string {
  return errorOr(feedStateMachine(sequence), "termGroups");
}

interface FedStateMachineOutput {
  nextOptions: NonSpaceToken[];
  termGroups: QueryToken[][];
}

type FedStateMachineError = string;

function errorOr<K extends keyof FedStateMachineOutput>(
  output: FedStateMachineOutput | FedStateMachineError,
  key: K
): FedStateMachineOutput[K] | FedStateMachineError {
  if (typeof output === "string") {
    return output;
  }
  return output[key];
}

function feedStateMachine(
  sequence: QueryToken[]
): FedStateMachineOutput | FedStateMachineError {
  let state: State = ["SpanStartOrWorkFilter", 0];
  let logicalOp: "and" | "or" | null = null;
  let workFilters = 0;
  let lastWasCloseParen = false;
  const termGroups: QueryToken<NonSpaceToken>[][] = [];

  function getOptions() {
    return (
      optionsForState(state, logicalOp)
        // This is kind of a hack. Currently, we only support one level of parentheses, so
        // if we see a close paren we know we can't have more logical operators. Eventually we
        // will support at least 2 levels, so this will need to be more sophisticated.
        .filter(
          (o) =>
            !lastWasCloseParen || (o[0] !== "logic:and" && o[0] !== "logic:or")
        )
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
        return `❌ Cannot mix \`and\` with \`or\` on the same word.`;
      }
      if (!isLogicalOp(token)) {
        return `❌ expected logical operator but got \`${token}\``;
      }
      logicalOp = token;
    }

    const options = getOptions();
    const matchingOption = options.find((o) => o[0] === tokenType);
    if (!matchingOption) {
      if (sequence[i][2] === "workFilter") {
        return "❌ #author filters must be at start";
      }
      let j = i - 1;
      while (j >= 0 && sequence[j][2] === "space") {
        j--;
      }
      const messageContext =
        i === 0 ? "at start" : `after \`${sequence[j][0]}\``;
      return `❌ \`${sequence[i][0]}\` not allowed ${messageContext}`;
    }
    if (matchingOption[0] === "workFilter" && workFilters > 1) {
      return "❌ only one #author filter allowed";
    }
    if (matchingOption[1] === "InSpan") {
      // Reset logical operator after completing a term in a span
      logicalOp = null;
    }
    const parenIncrement =
      matchingOption[0] === "(" ? 1 : matchingOption[0] === ")" ? -1 : 0;
    state = [matchingOption[1], state[1] + parenIncrement];

    // If the selected option has `isNewTerm` set (or there are no existing
    // term groups), start a new term group.
    if (matchingOption[2] || termGroups.length === 0) {
      termGroups.push([]);
    }
    termGroups[termGroups.length - 1].push([token, startIdx, tokenType]);
  }
  const nextOptions = getOptions()
    .filter((o) => workFilters === 0 || o[0] !== "workFilter") // We currently only allow one work filter per query.
    .map((o) => o[0]);
  return { nextOptions, termGroups };
}

function optionsForState(
  state: State,
  logicalOp: "and" | "or" | null
): [NonSpaceToken, QueryProcessState, isNewTerm: boolean][] {
  const [processState, parenDepth] = state;
  // A list of [nextToken, nextState (if that token is chosen)]
  const options: [NonSpaceToken, QueryProcessState, isNewTerm: boolean][] = [];
  switch (processState) {
    case "InSpan": {
      // We are in a span, but we have a single-part last term.
      // We can either add a filter for a next term, add a logical
      // operator to refine current term, or end the span by adding
      // a proximity relation to a next span.
      return [
        ["wordFilter", "InSpan", true],
        ["logic:and", "ComplexTerm", false],
        ["logic:or", "ComplexTerm", false],
        ["proximity", "SpanStart", true],
        ["(", "ComplexTerm", true],
      ];
    }
    case "ComplexTerm;LastWasTerm": {
      // We have just added a term to a complex term.
      // We can add another logical operator to add another term,
      if (logicalOp !== "and") {
        options.push(["logic:or", "ComplexTerm", false]);
      }
      if (logicalOp !== "or") {
        options.push(["logic:and", "ComplexTerm", false]);
      }
      if (parenDepth > 0) {
        // Or we can close a parenthesis, if there's an open one.
        options.push([")", "InSpan", false]);
      } else {
        // Or we can add a proximity operator to finish the span, or
        // start a new term.
        options.push(
          ["proximity", "SpanStart", true],
          ["wordFilter", "InSpan", true],
          ["(", "ComplexTerm", true]
        );
      }
      return options;
    }
    case "ComplexTerm": {
      // We are building a complex term, and the last token was not a term, so we need a term.
      return [["wordFilter", "ComplexTerm;LastWasTerm", false]];
    }
    case "SpanStartOrWorkFilter": {
      options.push(["workFilter", "SpanStartOrWorkFilter", true]);
    }
    // Intentionally fall through
    // eslint-disable-next-line no-fallthrough
    case "SpanStart": {
      options.push(["(", "ComplexTerm", true], ["wordFilter", "InSpan", true]);
      return options;
    }
  }
  exhaustiveGuard(processState);
}
