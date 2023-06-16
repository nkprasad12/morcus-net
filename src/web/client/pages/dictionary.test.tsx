/**
 * @jest-environment jsdom
 */

import { XmlNode } from "@/common/lewis_and_short/xml_node";
import { callApi } from "@/web/utils/rpc/client_rpc";
import { describe, expect, it } from "@jest/globals";
import { render, screen, waitFor } from "@testing-library/react";
import user from "@testing-library/user-event";
import React from "react";

import {
  ClickableTooltip,
  Dictionary,
  SectionLinkTooltip,
  xmlNodeToJsx,
} from "./dictionary";
import { RouteContext } from "../components/router";

console.debug = jest.fn();

jest.mock("@/web/utils/rpc/client_rpc");

// @ts-ignore
const mockCallApi: jest.Mock<any, any, any> = callApi;

function GalliaRef(props: any, ref: any) {
  return (
    <div {...props} ref={ref}>
      Gallia
    </div>
  );
}

describe("Dictionary View", () => {
  afterEach(() => {
    mockCallApi.mockReset();
  });

  it("shows expected components", () => {
    render(<Dictionary />);
    expect(screen.getByRole("combobox")).toBeDefined();
  });

  it("does not call server on empty submit", async () => {
    render(<Dictionary />);
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "{enter}");

    expect(mockCallApi).not.toHaveBeenCalled();
  });

  it("calls server for autocomplete entries", async () => {
    mockCallApi.mockResolvedValue(["Goo"]);
    render(<Dictionary />);
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "G");

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi.mock.calls[0][1]).toBe("g");
  });

  it("handles autocomplete option clicks", async () => {
    mockCallApi.mockResolvedValue(["Goo"]);
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}
      >
        <Dictionary />
      </RouteContext.Provider>
    );
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "G");
    const option = screen.getByText("Goo");
    await user.click(option);

    expect(mockNav).toHaveBeenCalledWith({ path: "/", query: "Goo" });
  });

  it("handles navigation on submit", async () => {
    mockCallApi.mockResolvedValue([]);
    const mockNav = jest.fn(() => {});
    render(
      <RouteContext.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}
      >
        <Dictionary />
      </RouteContext.Provider>
    );
    const searchBar = screen.getByRole("combobox");

    await user.click(searchBar);
    await user.type(searchBar, "G");
    await user.type(searchBar, "{enter}");

    expect(mockNav).toHaveBeenCalledWith({ path: "/", query: "G" });
  });

  test("updates history state on submit", async () => {
    mockCallApi.mockResolvedValue(["Goo"]);
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
    mockCallApi.mockRejectedValue(new Error("Failure for test"));
    render(
      <RouteContext.Provider
        value={{ route: { path: "/", query: "Gallia" }, navigateTo: jest.fn() }}
      >
        <Dictionary />
      </RouteContext.Provider>
    );

    await waitFor(() => {
      expect(
        screen.getByText("Failed to fetch the entry. Please try again later.")
      ).toBeDefined();
    });
  });

  it("shows result on success", async () => {
    const resultString = "France or whatever idk lol";
    mockCallApi.mockResolvedValue([new XmlNode("span", [], [resultString])]);
    render(
      <RouteContext.Provider
        value={{ route: { path: "/", query: "Gallia" }, navigateTo: jest.fn() }}
      >
        <Dictionary />
      </RouteContext.Provider>
    );

    await waitFor(() => {
      expect(screen.getByText(resultString)).toBeDefined();
    });
  });

  it("fetches result from navigation context", async () => {
    const resultString = "France or whatever idk lol";
    mockCallApi.mockResolvedValue([new XmlNode("span", [], [resultString])]);

    render(
      <RouteContext.Provider
        value={{ route: { path: "/", query: "Belgae" }, navigateTo: () => {} }}
      >
        <Dictionary />
      </RouteContext.Provider>
    );

    expect(mockCallApi).toHaveBeenCalledTimes(1);
    expect(mockCallApi.mock.calls[0][1]).toBe("Belgae");
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
  const DivWithRef = React.forwardRef<HTMLDivElement>(GalliaRef);

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

describe("SectionLinkTooltip", () => {
  const DivWithRef = React.forwardRef<HTMLDivElement>(GalliaRef);

  it("shows link buttons", async () => {
    const writeText = jest.fn();
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    });

    render(
      <SectionLinkTooltip
        forwarded={DivWithRef}
        className="foo"
        senseId="bar"
      />
    );
    await user.click(screen.getByText("Gallia"));

    expect(screen.queryByText(/link/)).not.toBeNull();
    const iconButton = screen.queryByLabelText("copy link");
    expect(iconButton).not.toBeNull();

    await user.click(iconButton!);
    expect(writeText.mock.lastCall![0].endsWith("#bar")).toBe(true);
  });
});
