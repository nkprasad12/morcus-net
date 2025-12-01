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
    const opts = optionsForInput("", undefined);
    const optStrings = opts.map((o) => o.option);
    const helps = opts.map((o) => o.help);
    expect(optStrings).toContain("");
    expect(optStrings).toContain("@");
    expect(helps.some((h) => typeof h === "string" && h.includes("word"))).toBe(
      true
    );
  });

  test("typing a plain word returns no suggestions", () => {
    const options = optionsForInput("amor", undefined);

    expect(options).toHaveLength(1);
    expect(options[0].help).toContain("amor");
  });

  test("single @ returns category suggestions including lemma and case", () => {
    const opts = optionsForInput("@", undefined);
    const optStrings = opts.map((o) => o.option);
    expect(optStrings.length).toBeGreaterThan(0);
    expect(optStrings).toContain("lemma:");
    expect(optStrings).toContain("case:");
  });

  test("partial category after @ returns suffix suggestion", () => {
    const opts = optionsForInput("@l", undefined);
    // For "@l" we expect "emma:" suggestion (completing "lemma:")
    expect(opts.length).toBeGreaterThan(0);
    expect(opts[0].option).toBe("emma:");
  });

  test("lemma keyword with colon allows free input (no suggestions)", () => {
    const options = optionsForInput("@lemma:amor", undefined);

    expect(options).toHaveLength(1);
    expect(options[0].help).toContain("amor");
  });

  test("lemma with no value returns help text", () => {
    const options = optionsForInput("@lemma: ", undefined);

    expect(options).toHaveLength(1);
    expect(options[0].help).toContain("@keyword without `:value`");
  });

  test("colon without preceding @ returns error informational option", () => {
    const opts = optionsForInput(": ", undefined);
    expect(opts.length).toBe(1);
    expect(opts[0].help).toContain("without @keyword");
  });

  test("category @case: returns list of case options (with trailing space)", () => {
    const opts = optionsForInput("@case:", undefined);
    const optStrings = opts.map((o) => o.option);
    expect(optStrings).toContain("nominative ");
    expect(optStrings).toContain("genitive ");
  });

  test("partial category value suggests suffix for matching option", () => {
    const opts = optionsForInput("@case:gen", undefined);
    // "genitive" startsWith "gen" so expected suggestion is "itive "
    const optStrings = opts.map((o) => o.option);
    expect(optStrings).toContain("itive ");
  });

  test("exact category value yields no suggestions", () => {
    const options = optionsForInput("@case:genitive", undefined);

    expect(options).toHaveLength(1);
    expect(options[0].help).toContain("with genitive case");
  });

  test("unknown @keyword returns informational unknown-keyword help", () => {
    const opts = optionsForInput("@foobarbaz", undefined);
    expect(opts.length).toBe(1);
    expect(opts[0].help).toContain("invalid keyword @foobarbaz");
  });

  test("keyword unknown form has validation error", () => {
    const opts = optionsForInput("@case:adc ", undefined);

    expect(opts.length).toBe(1);
    expect(opts[0].help).toContain("invalid option `adc`");
  });

  test("keyword short form doesn't return error", () => {
    const opts = optionsForInput("@case:acc ", undefined);

    for (const opt of opts) {
      expect(opt.help).not.toContain("invalid option");
    }
  });

  test("tilde without number returns help options", () => {
    const opts = optionsForInput("~", undefined);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.some((o) => o.help?.includes("within 5 words"))).toBe(true);
    expect(opts.some((o) => o.option === ">" && o.prefix === "~")).toBe(true);
  });

  test("tilde with valid number returns directional option", () => {
    const opts = optionsForInput("~3", undefined);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.some((o) => o.help?.includes("within 3 words"))).toBe(true);
    expect(opts.some((o) => o.option === ">" && o.prefix === "~3")).toBe(true);
  });

  test("tilde with number and > returns informational completion", () => {
    const opts = optionsForInput("~10>", undefined);
    expect(opts.length).toBe(1);
    expect(opts[0].help).toContain("within 10 words before");
  });

  test("tilde with default distance (5) and > returns completion", () => {
    const opts = optionsForInput("~>", undefined);
    expect(opts.length).toBeGreaterThan(0);
    expect(opts.some((o) => o.help?.includes("within 5 words before"))).toBe(
      true
    );
  });

  test("tilde with out-of-range number returns error", () => {
    const opts = optionsForInput("~20", undefined);
    expect(opts.length).toBe(1);
    expect(opts[0].help).toContain("range after ~ must be 1-15");
  });

  test("tilde with zero returns error", () => {
    const opts = optionsForInput("~0", undefined);
    expect(opts.length).toBe(1);
    expect(opts[0].help).toContain("range after ~ must be 1-15");
  });

  test("tilde with invalid characters after number returns error", () => {
    const opts = optionsForInput("~5x", undefined);
    expect(opts.length).toBe(1);
    expect(opts[0].help).toContain("invalid");
    expect(opts[0].help).toContain("expected ~, ~N, or ~N>");
  });

  test("completed proximity token allows new token suggestions", () => {
    const opts = optionsForInput("~5> ", undefined);
    const optStrings = opts.map((o) => o.option);
    expect(optStrings).toContain("");
    expect(optStrings).toContain("@");
  });

  test("lemma completion with empty value and no lemmata list shows help text", () => {
    const opts = optionsForInput("@lemma:", undefined, undefined);
    expect(opts).toHaveLength(1);
    expect(opts[0].help).toContain("an exact lemma");
  });

  test("lemma completion with empty value and loaded lemmata list shows help text", () => {
    const lemmata = ["amor", "amo", "amica"];
    const opts = optionsForInput("@lemma:", undefined, lemmata);
    expect(opts).toHaveLength(1);
    expect(opts[0].help).toContain("start typing for completions");
  });

  test("lemma completion with value and no lemmata list shows informational", () => {
    const opts = optionsForInput("@lemma:am", undefined, undefined);
    expect(opts).toHaveLength(1);
    expect(opts[0].help).toContain("the lemma `am`");
  });

  test("lemma completion with value and error loading lemmata shows informational", () => {
    const opts = optionsForInput("@lemma:am", undefined, "error");
    expect(opts).toHaveLength(1);
    expect(opts[0].help).toContain("the lemma `am`");
  });

  test("lemma completion suggests matching lemmata", () => {
    const lemmata = ["aaron", "amor", "amo", "amica", "amicus", "bellum"];
    const opts = optionsForInput("@lemma:am", undefined, lemmata);
    const optStrings = opts.map((o) => o.option);
    expect(optStrings).toContain("or");
    expect(optStrings).toContain("o");
    expect(optStrings).toContain("ica");
    expect(optStrings).toContain("icus");
    expect(optStrings).not.toContain("bellum");
  });

  test("lemma completion with uppercase prefix matches case-insensitively", () => {
    const lemmata = ["Amor", "Amo", "Amica"];
    const opts = optionsForInput("@lemma:Am", undefined, lemmata);
    expect(opts.length).toBeGreaterThan(0);
    const optStrings = opts.map((o) => o.option);
    expect(optStrings).toContain("or");
    expect(optStrings).toContain("o");
    expect(optStrings).toContain("ica");
  });

  test("lemma completion with no matches shows informational", () => {
    const lemmata = ["amor", "amo", "amica"];
    const opts = optionsForInput("@lemma:xyz", undefined, lemmata);
    expect(opts).toHaveLength(1);
    expect(opts[0].help).toContain("❌ no lemma matches `xyz`");
  });

  test("lemma completion limits to 50 results", () => {
    // Create a list with more than 50 matching lemmata
    const lemmata = Array.from({ length: 100 }, (_, i) => `amor${i}`);
    const opts = optionsForInput("@lemma:amor", undefined, lemmata);
    expect(opts.length).toBeLessThanOrEqual(50);
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
