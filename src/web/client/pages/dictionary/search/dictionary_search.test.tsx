/**
 * @jest-environment jsdom
 */

import "fake-indexeddb/auto";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { SettingsHandler } from "@/web/client/components/global_flags";
import { autocompleteOptions } from "@/web/client/pages/dictionary/search/autocomplete_options";
import { DictionarySearch } from "@/web/client/pages/dictionary/search/dictionary_search";
import { render, screen } from "@testing-library/react";
import user from "@testing-library/user-event";
import { FakeBroadcastChannel } from "@/web/client/offline/fake_broadcast_channel";

global.BroadcastChannel = FakeBroadcastChannel as any;

console.debug = jest.fn();

jest.mock("@/web/client/pages/dictionary/search/autocomplete_options");
// @ts-ignore
const mockAutocomplete: jest.Mock<any, any, any> = autocompleteOptions;
afterEach(() => {
  mockAutocomplete.mockReset();
});

const BOTH_DICTS = [LatinDict.LewisAndShort, LatinDict.SmithAndHall];

describe("DictionarySearch", () => {
  beforeAll(() => {
    window.HTMLElement.prototype.scrollIntoView = jest.fn();
  });

  beforeEach(() => {
    mockAutocomplete.mockResolvedValue([
      ["La", "ab"],
      ["En", "ack"],
    ]);
  });

  it("shows options on type", async () => {
    render(
      <DictionarySearch
        smallScreen={false}
        dicts={BOTH_DICTS}
        setDicts={() => {}}
        autoFocused
        onSearchQuery={() => {}}
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
    const mockCallback = jest.fn(() => {});
    render(
      <DictionarySearch
        smallScreen={false}
        dicts={BOTH_DICTS}
        setDicts={() => {}}
        autoFocused
        onSearchQuery={mockCallback}
      />
    );
    const search = screen.getByRole("combobox");
    await user.click(search);

    // Enter without input should be a no-op
    await user.type(search, "{enter}");
    expect(mockCallback).not.toHaveBeenCalled();
    await user.type(search, "a{enter}");
    expect(mockCallback).toHaveBeenCalledWith("a", undefined);
  });

  it("handles navigation on option click", async () => {
    const mockCallback = jest.fn(() => {});
    render(
      <DictionarySearch
        smallScreen={false}
        dicts={BOTH_DICTS}
        setDicts={() => {}}
        autoFocused
        onSearchQuery={mockCallback}
      />
    );
    const search = screen.getByRole("combobox");
    await user.click(search);
    await user.type(search, "a");
    expect(mockCallback).not.toHaveBeenCalled();

    await user.click(screen.getByText("ab"));

    expect(mockCallback).toHaveBeenCalledWith(
      "ab",
      LatinDict.LewisAndShort.languages.from
    );
  });

  it("handles navigation on option enter", async () => {
    const mockCallback = jest.fn(() => {});
    render(
      <DictionarySearch
        smallScreen={false}
        dicts={BOTH_DICTS}
        setDicts={() => {}}
        autoFocused
        onSearchQuery={mockCallback}
      />
    );
    const search = screen.getByRole("combobox");
    await user.click(search);
    await user.type(search, "ack");
    expect(mockCallback).not.toHaveBeenCalled();

    await user.hover(screen.getByText("ack"));
    await user.type(search, "{enter}");

    expect(mockCallback).toHaveBeenCalledWith(
      "ack",
      LatinDict.SmithAndHall.languages.from
    );
  });

  it("has an options menu that disables and enables dicts", async () => {
    const mockSetDicts = jest.fn();
    render(
      <DictionarySearch
        smallScreen={false}
        dicts={BOTH_DICTS}
        setDicts={mockSetDicts}
        autoFocused
        onSearchQuery={() => {}}
      />
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
          autoFocused
          onSearchQuery={() => {}}
        />
      </SettingsHandler>
    );
    const settings = screen.getByLabelText("search settings");
    await user.click(settings);

    const increment = screen.queryByLabelText("Increase Highlight Strength");
    await user.click(increment!);
    await user.click(increment!);

    const storage = JSON.parse(localStorage.getItem("GlobalSettings")!);
    expect(storage.highlightStrength).toBe(60);
  });
});
