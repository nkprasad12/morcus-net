/**
 * @jest-environment jsdom
 */

import {
  CorpusAutocompleteItem,
  optionsForInput,
} from "@/web/client/pages/corpus/corpus_autocomplete";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/extend-expect";

describe("optionsForInput", () => {
  test("empty input returns word help and special '@' help", () => {
    const opts = optionsForInput("", null);
    const optStrings = opts.map((o) => o.option);
    const helps = opts.map((o) => o.help);
    expect(optStrings).toContain("");
    expect(optStrings).toContain("@");
    expect(helps.some((h) => typeof h === "string" && h.includes("word"))).toBe(
      true
    );
  });

  test("typing a plain word returns no suggestions", () => {
    const options = optionsForInput("amor", null);

    expect(options).toHaveLength(1);
    expect(options[0].help).toContain("amor");
  });

  test("single @ returns category suggestions including lemma and case", () => {
    const opts = optionsForInput("@", null);
    const optStrings = opts.map((o) => o.option);
    expect(optStrings.length).toBeGreaterThan(0);
    expect(optStrings).toContain("lemma:");
    expect(optStrings).toContain("case:");
  });

  test("partial category after @ returns suffix suggestion", () => {
    const opts = optionsForInput("@l", null);
    // For "@l" we expect "emma:" suggestion (completing "lemma:")
    expect(opts.length).toBeGreaterThan(0);
    expect(opts[0].option).toBe("emma:");
  });

  test("lemma keyword with colon allows free input (no suggestions)", () => {
    const options = optionsForInput("@lemma:amor", null);

    expect(options).toHaveLength(1);
    expect(options[0].help).toContain("amor");
  });

  test("colon without preceding @ returns error informational option", () => {
    const opts = optionsForInput(": ", null);
    expect(opts.length).toBe(1);
    expect(opts[0].help).toContain("without @keyword");
  });

  test("category @case: returns list of case options (with trailing space)", () => {
    const opts = optionsForInput("@case:", null);
    const optStrings = opts.map((o) => o.option);
    expect(optStrings).toContain("nominative ");
    expect(optStrings).toContain("genitive ");
  });

  test("partial category value suggests suffix for matching option", () => {
    const opts = optionsForInput("@case:gen", null);
    // "genitive" startsWith "gen" so expected suggestion is "itive "
    const optStrings = opts.map((o) => o.option);
    expect(optStrings).toContain("itive ");
  });

  test("exact category value yields no suggestions", () => {
    const options = optionsForInput("@case:genitive", null);

    expect(options).toHaveLength(1);
    expect(options[0].help).toContain("with genitive case");
  });

  test("unknown @keyword returns informational unknown-keyword help", () => {
    const opts = optionsForInput("@foobarbaz", null);
    expect(opts.length).toBe(1);
    expect(opts[0].help).toContain("invalid keyword @foobarbaz");
  });

  test("tilde without number returns help options", () => {
    const opts = optionsForInput("~", null);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.some((o) => o.help?.includes("within 5 words"))).toBe(true);
    expect(opts.some((o) => o.option === ">" && o.prefix === "~")).toBe(true);
  });

  test("tilde with valid number returns directional option", () => {
    const opts = optionsForInput("~3", null);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.some((o) => o.help?.includes("within 3 words"))).toBe(true);
    expect(opts.some((o) => o.option === ">" && o.prefix === "~3")).toBe(true);
  });

  test("tilde with number and > returns informational completion", () => {
    const opts = optionsForInput("~10>", null);
    expect(opts.length).toBe(1);
    expect(opts[0].help).toContain("within 10 words before");
  });

  test("tilde with default distance (5) and > returns completion", () => {
    const opts = optionsForInput("~>", null);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.some((o) => o.help?.includes("within 5 words before"))).toBe(
      true
    );
  });

  test("tilde with out-of-range number returns error", () => {
    const opts = optionsForInput("~20", null);
    expect(opts.length).toBe(1);
    expect(opts[0].help).toContain("range after ~ must be 1-15");
  });

  test("tilde with zero returns error", () => {
    const opts = optionsForInput("~0", null);
    expect(opts.length).toBe(1);
    expect(opts[0].help).toContain("range after ~ must be 1-15");
  });

  test("tilde with invalid characters after number returns error", () => {
    const opts = optionsForInput("~5x", null);
    expect(opts.length).toBe(1);
    expect(opts[0].help).toContain("invalid");
    expect(opts[0].help).toContain("expected ~, ~N, or ~N>");
  });

  test("completed proximity token allows new token suggestions", () => {
    const opts = optionsForInput("~5> ", null);
    const optStrings = opts.map((o) => o.option);
    expect(optStrings).toContain("");
    expect(optStrings).toContain("@");
  });
});

describe("CorpusAutocompleteItem", () => {
  test("renders current text, bolded option and help for actionable option", () => {
    const option = { option: "lemma:", help: "filter by lemma", prefix: "@" };
    render(<CorpusAutocompleteItem option={option} />);

    // prefix text is rendered
    expect(screen.getByText("@")).toBeInTheDocument();
    // option is rendered in bold
    expect(screen.getByText("lemma:")).toBeInTheDocument();
    // help text is shown
    expect(screen.getByText("filter by lemma")).toBeInTheDocument();
  });

  test("renders only help for informationalOnly option (no current/option)", () => {
    const option = { option: "", help: "type an exact word to match" };
    render(<CorpusAutocompleteItem option={option} />);

    expect(screen.getByText("type an exact word to match")).toBeInTheDocument();
  });
});
