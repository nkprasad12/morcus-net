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
  let state: State = ["SpanStartOrWorkFilter", 0];
  let logicalOp: "and" | "or" | null = null;
  for (let i = 0; i < sequence.length; i++) {
    const [token, , tokenType] = sequence[i];
    if (tokenType === "space") {
      continue;
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
    const options = optionsForState(state, logicalOp);
    const matchingOption = options.find((o) => o[0] === tokenType);
    if (!matchingOption) {
      let j = i - 1;
      while (j >= 0 && sequence[j][2] === "space") {
        j--;
      }
      const messageContext =
        i === 0 ? "at start" : `after \`${sequence[j][0]}\``;
      return `❌ \`${sequence[i][0]}\` not allowed ${messageContext}`;
    }
    if (matchingOption[1] === "InSpan") {
      // Reset logical operator after completing a term in a span
      logicalOp = null;
    }
    const parenIncrement =
      matchingOption[0] === "(" ? 1 : matchingOption[0] === ")" ? -1 : 0;
    state = [matchingOption[1], state[1] + parenIncrement];
  }
  return optionsForState(state, logicalOp).map((o) => o[0]);
}

function optionsForState(
  state: State,
  logicalOp: "and" | "or" | null
): [NonSpaceToken, QueryProcessState][] {
  const [processState, parenDepth] = state;
  // A list of [nextToken, nextState (if that token is chosen)]
  const options: [NonSpaceToken, QueryProcessState][] = [];
  switch (processState) {
    case "InSpan": {
      // We are in a span, but we have a single-part last term.
      // We can either add a filter for a next term, add a logical
      // operator to refine current term, or end the span by adding
      // a proximity relation to a next span.
      return [
        ["wordFilter", "InSpan"],
        ["logic:and", "ComplexTerm"],
        ["logic:or", "ComplexTerm"],
        ["proximity", "SpanStart"],
      ];
    }
    case "ComplexTerm;LastWasTerm": {
      // We have just added a term to a complex term.
      // We can add another logical operator to add another term,
      if (logicalOp !== "and") {
        options.push(["logic:or", "ComplexTerm"]);
      }
      if (logicalOp !== "or") {
        options.push(["logic:and", "ComplexTerm"]);
      }
      if (parenDepth > 0) {
        // Or we can close a parenthesis, if there's an open one.
        options.push([")", "InSpan"]);
      } else {
        // Or we can add a proximity operator to finish the span, or
        // start a new term.
        options.push(["proximity", "SpanStart"], ["wordFilter", "InSpan"]);
      }
      return options;
    }
    case "ComplexTerm": {
      // We are building a complex term, and the last token was not a term, so we need a term.
      return [["wordFilter", "ComplexTerm;LastWasTerm"]];
    }
    case "SpanStartOrWorkFilter": {
      options.push(["workFilter", "SpanStartOrWorkFilter"]);
    }
    // Intentionally fall through
    // eslint-disable-next-line no-fallthrough
    case "SpanStart": {
      options.push(["(", "ComplexTerm"], ["wordFilter", "InSpan"]);
      return options;
    }
  }
  exhaustiveGuard(processState);
}
