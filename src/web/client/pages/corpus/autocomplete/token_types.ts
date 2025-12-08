export type CorpusTokenType =
  | "space"
  | "("
  | ")"
  | "wordFilter"
  | "logic:and"
  | "logic:or"
  | "workFilter"
  | "proximity";

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
