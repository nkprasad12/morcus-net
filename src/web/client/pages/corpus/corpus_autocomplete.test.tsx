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
    const opts = optionsForInput("");
    const optStrings = opts.map((o) => o.option);
    const helps = opts.map((o) => o.help);
    expect(optStrings).toContain("");
    expect(optStrings).toContain("@");
    expect(helps.some((h) => typeof h === "string" && h.includes("word"))).toBe(
      true
    );
  });

  test("typing a plain word returns no suggestions", () => {
    expect(optionsForInput("amor")).toEqual([]);
  });

  test("single @ returns category suggestions including lemma and case", () => {
    const opts = optionsForInput("@");
    const optStrings = opts.map((o) => o.option);
    expect(optStrings.length).toBeGreaterThan(0);
    expect(optStrings).toContain("lemma:");
    expect(optStrings).toContain("case:");
  });

  test("partial category after @ returns suffix suggestion", () => {
    const opts = optionsForInput("@l");
    // For "@l" we expect "emma:" suggestion (completing "lemma:")
    expect(opts.length).toBeGreaterThan(0);
    expect(opts[0].option).toBe("emma:");
  });

  test("lemma keyword with colon allows free input (no suggestions)", () => {
    expect(optionsForInput("@lemma:")).toEqual([]);
  });

  test("colon without preceding @ returns error informational option", () => {
    const opts = optionsForInput(":");
    expect(opts.length).toBe(1);
    expect(opts[0].help).toEqual("Error - `:` without @keyword");
  });

  test("category @case: returns list of case options (with trailing space)", () => {
    const opts = optionsForInput("@case:");
    const optStrings = opts.map((o) => o.option);
    expect(optStrings).toContain("nominative ");
    expect(optStrings).toContain("genitive ");
  });

  test("partial category value suggests suffix for matching option", () => {
    const opts = optionsForInput("@case:gen");
    // "genitive" startsWith "gen" so expected suggestion is "itive "
    const optStrings = opts.map((o) => o.option);
    expect(optStrings).toContain("itive ");
  });

  test("exact category value yields no suggestions", () => {
    expect(optionsForInput("@case:genitive")).toEqual([]);
  });

  test("unknown @keyword returns informational unknown-keyword help", () => {
    const opts = optionsForInput("@foobarbaz");
    expect(opts.length).toBe(1);
    expect(opts[0].help).toContain("Unknown keyword @foobarbaz");
  });
});

describe("CorpusAutocompleteItem", () => {
  test("renders current text, bolded option and help for actionable option", () => {
    const option = { option: "lemma:", help: "filter by lemma" };
    render(<CorpusAutocompleteItem current="@" option={option} />);

    // current text is rendered
    expect(screen.getByText("@")).toBeInTheDocument();
    // option is rendered in bold
    expect(screen.getByText("lemma:")).toBeInTheDocument();
    // help text is shown
    expect(screen.getByText("filter by lemma")).toBeInTheDocument();
  });

  test("renders only help for informationalOnly option (no current/option)", () => {
    const option = {
      option: "",
      help: "type an exact word to match",
      informationalOnly: true,
    } as const;
    render(<CorpusAutocompleteItem current="amor" option={option} />);

    // help is shown
    expect(screen.getByText("type an exact word to match")).toBeInTheDocument();
    // current text should not be shown because informationalOnly hides the current+option render
    expect(screen.queryByText("amor")).toBeNull();
  });
});
