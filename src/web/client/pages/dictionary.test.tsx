/**
 * @jest-environment jsdom
 */

import { XmlNode } from "@/common/lewis_and_short/xml_node";
import { describe, expect, it } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";
import user from "@testing-library/user-event";
import React from "react";

import { ClickableTooltip, Dictionary, xmlNodeToJsx } from "./dictionary";
import { RouteContext } from "../components/router";

const realFetch = global.fetch;

afterAll(() => {
  global.fetch = realFetch;
});

function replaceFetch(ok: boolean = true, text: string = "") {
  const mockFetch = jest.fn((request) =>
    Promise.resolve({
      text: () => Promise.resolve(text),
      ok: ok,
      request: request,
    })
  );
  // @ts-ignore
  global.fetch = mockFetch;
  return mockFetch;
}

describe("Dictionary View", () => {
  it("shows expected components", () => {
    render(<Dictionary />);
    expect(screen.getByRole("combobox")).toBeDefined();
  });

  it("does not call server on empty submit", async () => {
    const mockFetch = replaceFetch(false);
    render(<Dictionary />);
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "{enter}");

    expect(mockFetch.mock.calls).toHaveLength(0);
  });

  it("calls server for autocomplete entries", async () => {
    const mockFetch = replaceFetch(false);
    render(<Dictionary />);
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "G");

    expect(mockFetch.mock.calls).toHaveLength(1);
    expect(mockFetch.mock.calls[0][0]).toContain("api/dicts/entriesByPrefix/g");
  });

  it("handles autocomplete option clicks", async () => {
    replaceFetch(true, JSON.stringify(["Goo"]));
    render(<Dictionary />);
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "G");
    const option = screen.getByText("Goo");
    const mockFetch = replaceFetch(true, JSON.stringify(["<span/>"]));
    await user.click(option);

    expect(mockFetch.mock.calls).toHaveLength(1);
    expect(mockFetch.mock.calls[0][0]).toContain("api/dicts/ls/G");
  });

  it("calls server on submit", async () => {
    const mockFetch = replaceFetch(false);
    render(<Dictionary />);
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "G");
    mockFetch.mockClear();
    await user.type(searchBar, "{enter}");

    expect(mockFetch.mock.calls).toHaveLength(1);
    expect(mockFetch.mock.calls[0][0]).toContain("api/dicts/ls/G");
  });

  test("updates history state on submit", async () => {
    replaceFetch(false);
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}
      >
        <Dictionary />
      </RouteContext.Provider>
    );
    const searchBar = screen.getByRole("combobox");
    history.pushState("", "", "");

    await user.click(searchBar);
    await user.type(searchBar, "Gallia{enter}");

    expect(mockNav).toHaveBeenCalledWith({ path: "/", query: "Gallia" });
  });

  it("calls shows error on failure", async () => {
    replaceFetch(false);
    render(<Dictionary />);
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "Gallia{enter}");

    await waitFor(() => {
      expect(
        screen.getByText("Failed to fetch the entry. Please try again later.")
      ).toBeDefined();
    });
  });

  it("shows result on success", async () => {
    replaceFetch(
      true,
      JSON.stringify(["<span>France or whatever idk lol</span>"])
    );
    render(<Dictionary />);
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "Gallia{enter}");

    await waitFor(() => {
      expect(screen.getByText("France or whatever idk lol")).toBeDefined();
    });
  });

  it("fetches result from navigation context", async () => {
    const mockFetch = replaceFetch(
      true,
      JSON.stringify(["<span>France or whatever idk lol</span>"])
    );

    render(
      <RouteContext.Provider
        value={{ route: { path: "/", query: "Belgae" }, navigateTo: () => {} }}
      >
        <Dictionary />
      </RouteContext.Provider>
    );

    expect(mockFetch.mock.calls).toHaveLength(1);
    expect(mockFetch.mock.calls[0][0]).toContain("Belgae");
    await waitFor(() => {
      expect(screen.getByText("France or whatever idk lol")).toBeDefined();
    });
  });
});

describe("xmlNodeToJsx", () => {
  it("changes class to className", () => {
    const root = new XmlNode("span", [["class", "Caesar"]], []);
    const result = xmlNodeToJsx(root);
    expect(result.props.className).toBe("Caesar");
  });

  it("handles nodes with titles", () => {
    const root = new XmlNode("span", [["title", "Caesar"]], ["Gallia"]);
    const result = xmlNodeToJsx(root);

    expect(result.type).toBe(ClickableTooltip);
    expect(result.props.titleText).toBe("Caesar");
  });

  it("handles nested and text nodes", () => {
    const root = new XmlNode(
      "span",
      [],
      ["Caesar", new XmlNode("span", [], ["Gaius"])]
    );
    const result = xmlNodeToJsx(root);

    expect(result.props.children).toHaveLength(2);
    expect(result.props.children[0]).toBe("Caesar");
    expect(result.props.children[1].props.children[0]).toBe("Gaius");
  });

  it("adds highlight on matching id", () => {
    const root = new XmlNode("span", [["id", "Caesar"]], ["Gallia"]);
    const result = xmlNodeToJsx(root, "Caesar");

    expect(result.props["className"]).toBe("highlighted");
  });

  it("does not add highlight on different id", () => {
    const root = new XmlNode("span", [["id", "Caesar"]], ["Gallia"]);
    const result = xmlNodeToJsx(root, "Augustus");

    expect(result.props["className"]).toBe(undefined);
  });

  it("does not add highlight on both undefined", () => {
    const root = new XmlNode("span", [], ["Gallia"]);
    const result = xmlNodeToJsx(root, undefined);

    expect(result.props["className"]).toBe(undefined);
  });
});

describe("ClickableTooltip", () => {
  const DivWithRef = React.forwardRef<HTMLDivElement>((props, ref) => {
    return (
      <div {...props} ref={ref}>
        Gallia
      </div>
    );
  });

  it("shows base text on initial load", async () => {
    render(
      <ClickableTooltip
        titleText="Caesar"
        className=""
        ChildFactory={DivWithRef}
      />
    );

    expect(screen.queryByText("Caesar")).toBeNull();
    expect(screen.queryByText("Gallia")).not.toBeNull();
  });

  it("shows tooltip on click", async () => {
    render(
      <ClickableTooltip
        titleText="Caesar"
        className=""
        ChildFactory={DivWithRef}
      />
    );

    await user.click(screen.getByText("Gallia"));

    expect(screen.queryByText("Caesar")).not.toBeNull();
    expect(screen.queryByText("Gallia")).not.toBeNull();
  });
});
