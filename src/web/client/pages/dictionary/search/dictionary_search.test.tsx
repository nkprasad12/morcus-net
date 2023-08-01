/**
 * @jest-environment jsdom
 */

import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { RouteContext } from "@/web/client/components/router";
import { autocompleteOptions } from "@/web/client/pages/dictionary/search/autocomplete_options";
import { DictionarySearch } from "@/web/client/pages/dictionary/search/dictionary_search";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import React from "react";

console.debug = jest.fn();

jest.mock("@/web/client/pages/dictionary/search/autocomplete_options");
// @ts-ignore
const mockAutocomplete: jest.Mock<any, any, any> = autocompleteOptions;
afterEach(() => {
  mockAutocomplete.mockReset();
});

const BOTH_DICTS = [LatinDict.LewisAndShort, LatinDict.SmithAndHall];

describe("DictionarySearch", () => {
  beforeEach(() => {
    mockAutocomplete.mockResolvedValue([
      [LatinDict.LewisAndShort, "ab"],
      [LatinDict.SmithAndHall, "ack"],
    ]);
  });

  it("shows options on type", async () => {
    render(
      <DictionarySearch
        smallScreen={false}
        dicts={BOTH_DICTS}
        onDictChanged={() => {}}
      />
    );
    expect(screen.queryByText("ab")).toBeNull();
    expect(screen.queryByText("ack")).toBeNull();
    const search = screen.getByRole("combobox");

    await user.click(search);
    await user.type(search, "a");

    expect(screen.queryByText("ab")).not.toBeNull();
    expect(screen.queryByText("ack")).not.toBeNull();
  });

  it("handles navigation on input box enter", async () => {
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}
      >
        <DictionarySearch
          smallScreen={false}
          dicts={BOTH_DICTS}
          onDictChanged={() => {}}
        />
      </RouteContext.Provider>
    );
    const search = screen.getByRole("combobox");
    await user.click(search);

    // Enter without input should be a no-op
    await user.type(search, "{enter}");
    expect(mockNav).not.toHaveBeenCalled();
    await user.type(search, "a{enter}");
    expect(mockNav).toHaveBeenCalledWith({ path: "/", query: "a" });
  });

  it("handles navigation on option click", async () => {
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}
      >
        <DictionarySearch
          smallScreen={false}
          dicts={BOTH_DICTS}
          onDictChanged={() => {}}
        />
      </RouteContext.Provider>
    );
    const search = screen.getByRole("combobox");
    await user.click(search);
    await user.type(search, "a");
    expect(mockNav).not.toHaveBeenCalled();

    await user.click(screen.getByText("ab"));

    expect(mockNav).toHaveBeenCalledWith({ path: "/", query: "ab" });
  });

  it("handles navigation on option enter", async () => {
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}
      >
        <DictionarySearch
          smallScreen={false}
          dicts={BOTH_DICTS}
          onDictChanged={() => {}}
        />
      </RouteContext.Provider>
    );
    const search = screen.getByRole("combobox");
    await user.click(search);
    await user.type(search, "ack");
    expect(mockNav).not.toHaveBeenCalled();

    await user.hover(screen.getByText("ack"));
    await user.type(search, "{enter}");

    expect(mockNav).toHaveBeenCalledWith({ path: "/", query: "ack" });
  });

  it("has an options menu that disables and enables dicts", async () => {
    const mockOnDictChanged = jest.fn();
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}
      >
        <DictionarySearch
          smallScreen={false}
          dicts={BOTH_DICTS}
          onDictChanged={mockOnDictChanged}
        />
      </RouteContext.Provider>
    );
    expect(screen.queryByText("Dictionary Options")).toBeNull();
    const settings = screen.getByLabelText("search settings");
    await user.click(settings);

    expect(screen.queryByText("Dictionary Options")).not.toBeNull();
    const lsCheck = screen.getByRole("checkbox");
    await user.click(lsCheck);
    expect(mockOnDictChanged).toHaveBeenLastCalledWith(
      LatinDict.LewisAndShort,
      false
    );
    await user.click(screen.getByText("Close"));
  });
});
