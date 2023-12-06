/**
 * @jest-environment jsdom
 */

import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { SettingsHandler } from "@/web/client/components/global_flags";
import { RouteContext } from "@/web/client/components/router";
import { autocompleteOptions } from "@/web/client/pages/dictionary/search/autocomplete_options";
import { DictionarySearch } from "@/web/client/pages/dictionary/search/dictionary_search";
import { act, fireEvent, render, screen } from "@testing-library/react";
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
        setDicts={() => {}}
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
          setDicts={() => {}}
        />
      </RouteContext.Provider>
    );
    const search = screen.getByRole("combobox");
    await user.click(search);

    // Enter without input should be a no-op
    await user.type(search, "{enter}");
    expect(mockNav).not.toHaveBeenCalled();
    await user.type(search, "a{enter}");
    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/", query: "a" })
    );
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
          setDicts={() => {}}
        />
      </RouteContext.Provider>
    );
    const search = screen.getByRole("combobox");
    await user.click(search);
    await user.type(search, "a");
    expect(mockNav).not.toHaveBeenCalled();

    await user.click(screen.getByText("ab"));

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/", query: "ab,LnS" })
    );
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
          setDicts={() => {}}
        />
      </RouteContext.Provider>
    );
    const search = screen.getByRole("combobox");
    await user.click(search);
    await user.type(search, "ack");
    expect(mockNav).not.toHaveBeenCalled();

    await user.hover(screen.getByText("ack"));
    await user.type(search, "{enter}");

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({ path: "/", query: "ack,SnH" })
    );
  });

  it("has an options menu that disables and enables dicts", async () => {
    const mockSetDicts = jest.fn();
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}
      >
        <DictionarySearch
          smallScreen={false}
          dicts={BOTH_DICTS}
          setDicts={mockSetDicts}
        />
      </RouteContext.Provider>
    );
    expect(screen.queryByText("Dictionary Options")).toBeNull();
    const settings = screen.getByLabelText("search settings");
    await user.click(settings);

    expect(screen.queryByText("Dictionary Options")).not.toBeNull();
    const lsCheck = screen.getAllByRole("checkbox");
    await user.click(lsCheck[0]);
    expect(mockSetDicts).toHaveBeenCalledWith([LatinDict.SmithAndHall]);
  });

  it("has an options menu that sets highlight strength", async () => {
    const mockSetDicts = jest.fn();
    render(
      <SettingsHandler>
        <DictionarySearch
          smallScreen={false}
          dicts={BOTH_DICTS}
          setDicts={mockSetDicts}
        />
      </SettingsHandler>
    );
    const settings = screen.getByLabelText("search settings");
    await user.click(settings);

    const slider = screen.queryByLabelText("Highlight Strength");
    expect(slider).not.toBeNull();
    // mock the getBoundingClientRect. This isn't handled by JSdom
    // @ts-ignore
    slider.getBoundingClientRect = jest.fn(() => {
      return {
        bottom: 286.22918701171875,
        height: 28,
        left: 19.572917938232422,
        right: 583.0937919616699,
        top: 258.22918701171875,
        width: 563.5208740234375,
        x: 19.572917938232422,
        y: 258.22918701171875,
      };
    });
    act(() => {
      fireEvent.mouseDown(slider!, { clientX: 162, clientY: 302 });
    });

    const storage = JSON.parse(localStorage.getItem("GlobalSettings")!);
    expect(storage.highlightStrength).toBe(90);
  });
});
