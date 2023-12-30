/**
 * @jest-environment jsdom
 */

import { XmlNode } from "@/common/xml/xml_node";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import user from "@testing-library/user-event";
import { forwardRef } from "react";

import {
  ClickableTooltip,
  SectionLinkTooltip,
} from "@/web/client/pages/tooltips";
import {
  xmlNodeToJsx,
  SearchSettings,
  InflectionDataSection,
} from "@/web/client/pages/dictionary/dictionary_utils";
import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { RouteContextV2 } from "@/web/client/router/router_v2";

console.log = jest.fn();
console.debug = jest.fn();

function GalliaRef(props: any, ref: any) {
  return (
    <div {...props} ref={ref}>
      Gallia
    </div>
  );
}

describe("xmlNodeToJsx", () => {
  it("changes class to className", () => {
    const root = new XmlNode("span", [["class", "Caesar"]], []);
    const result = xmlNodeToJsx(root);
    expect(result.props.className).toBe("Caesar");
  });

  it("handles embedded QNA elements", () => {
    const root = new XmlNode(
      "span",
      [["class", "Caesar QNA"]],
      [new XmlNode("span", [["class", "QNA"]])]
    );

    const result = xmlNodeToJsx(root, undefined, undefined, undefined, true);
    expect(result.props.className).toBe("Caesar QNAEmbedded");
    expect(result.props.children[0].props.className).toBe("QNAEmbedded");
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

  it("handles dLink elements", async () => {
    const root = new XmlNode(
      "span",
      [
        ["class", "dLink"],
        ["to", "omnis"],
        ["text", "Gallia"],
      ],
      []
    );
    const result = xmlNodeToJsx(root, undefined);
    const mockNav = jest.fn(() => {});
    render(
      <RouteContextV2.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}>
        <div>{result}</div>
      </RouteContextV2.Provider>
    );

    await user.click(screen.getByText("Gallia"));

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/dicts",
        query: expect.objectContaining({ q: "omnis,SnH" }),
      })
    );
  });

  it("handles latWord elements", async () => {
    const root = new XmlNode(
      "span",
      [
        ["class", "latWord"],
        ["to", "omnis"],
      ],
      []
    );
    const result = xmlNodeToJsx(root, undefined);
    const mockNav = jest.fn(() => {});
    render(
      <RouteContextV2.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}>
        <div>{result}</div>
      </RouteContextV2.Provider>
    );

    await user.click(screen.getByText("omnis"));

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/dicts",
        query: expect.objectContaining({ q: "omnis,LnS" }),
      })
    );
  });

  it("handles latWord elements with different text", async () => {
    const root = new XmlNode(
      "span",
      [
        ["class", "latWord"],
        ["to", "omnis"],
        ["orig", "blah"],
      ],
      []
    );
    const result = xmlNodeToJsx(root, undefined);
    const mockNav = jest.fn(() => {});
    render(
      <RouteContextV2.Provider
        value={{ route: { path: "/" }, navigateTo: mockNav }}>
        <div>{result}</div>
      </RouteContextV2.Provider>
    );

    await user.click(screen.getByText("blah"));

    expect(mockNav).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/dicts",
        query: expect.objectContaining({ q: "omnis,LnS" }),
      })
    );
  });
});

describe("ClickableTooltip", () => {
  const DivWithRef = forwardRef<HTMLDivElement>(GalliaRef);

  it("shows base text on initial load", async () => {
    render(
      <ClickableTooltip
        titleText="Caesar"
        className=""
        ChildFactory={DivWithRef}
      />
    );

    expect(screen.queryByText("Caesar")).toBeNull();
    expect(screen.queryByText("Gallia")).toBeVisible();
  });

  it("shows tooltip on click and clears on click away", async () => {
    render(
      <div>
        <ClickableTooltip
          titleText="Caesar"
          className=""
          ChildFactory={DivWithRef}
        />
        <span>Other</span>
      </div>
    );

    await user.click(screen.getByText("Gallia"));

    expect(screen.queryByText("Caesar")).toBeVisible();
    expect(screen.queryByText("Gallia")).toBeVisible();

    await user.click(screen.getByText("Other"));
    expect(screen.queryByText("Gallia")).toBeVisible();
    expect(screen.queryByText("Caesar")).not.toBeVisible();
  });
});

describe("SectionLinkTooltip", () => {
  const DivWithRef = forwardRef<HTMLDivElement>(GalliaRef);

  it("shows link buttons", async () => {
    const writeText = jest.fn((_e) => Promise.resolve());
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    });

    render(
      <SectionLinkTooltip forwarded={DivWithRef} className="foo" id="bar" />
    );
    await user.click(screen.getByText("Gallia"));

    expect(screen.queryByText(/link/)).toBeVisible();
    const iconButton = screen.queryByLabelText("copy link");
    expect(iconButton).toBeVisible();

    await user.click(iconButton!);
    expect(writeText.mock.lastCall![0].endsWith("#bar")).toBe(true);
  });

  it("shows fallback on error", async () => {
    const writeText = jest.fn((_e) => Promise.reject());
    Object.assign(navigator, {
      clipboard: {
        writeText,
      },
    });

    render(
      <SectionLinkTooltip forwarded={DivWithRef} className="foo" id="bar" />
    );
    await user.click(screen.getByText("Gallia"));

    expect(screen.queryByText(/link/)).toBeVisible();
    const iconButton = screen.queryByLabelText("copy link");
    expect(iconButton).toBeVisible();

    await user.click(iconButton!);
    expect(screen.queryByText(/copy manually/)).toBeVisible();
  });

  it("closes on click away", async () => {
    render(
      <>
        <SectionLinkTooltip forwarded={DivWithRef} className="foo" id="bar" />
        <div>Other elem</div>
      </>
    );
    await user.click(screen.getByText("Gallia"));

    await user.click(screen.queryByText("Other elem")!);
    expect(screen.queryByText(/copy manually/)).toBeNull();
    expect(screen.queryByText(/section link/)).not.toBeVisible();
  });

  it("closes on origin element click", async () => {
    render(
      <SectionLinkTooltip forwarded={DivWithRef} className="foo" id="bar" />
    );
    await user.click(screen.getByText("Gallia"));

    await user.click(screen.getByText("Gallia"));

    expect(screen.queryByText(/copy manually/)).toBeNull();
    expect(screen.queryByText(/section link/)).not.toBeVisible();
  });
});

describe("SearchSettings", () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it("returns full list on retrieve without store and experimental on", () => {
    const defaultValue = { experimentalMode: true };
    localStorage.setItem("GlobalSettings", JSON.stringify(defaultValue));
    expect(SearchSettings.retrieve()).toStrictEqual(LatinDict.AVAILABLE);
  });

  it("returns full list with experimental off", () => {
    const defaultValue = { experimentalMode: false };
    localStorage.setItem("GlobalSettings", JSON.stringify(defaultValue));
    expect(SearchSettings.retrieve()).toStrictEqual(LatinDict.AVAILABLE);
  });

  it("returns empty list for empty store", () => {
    SearchSettings.store([]);
    expect(SearchSettings.retrieve()).toStrictEqual([]);
  });

  it("returns expected list for other store", () => {
    SearchSettings.store([LatinDict.LewisAndShort]);
    expect(SearchSettings.retrieve()).toStrictEqual([LatinDict.LewisAndShort]);
  });
});

describe("InflectionDataSection", () => {
  it("shows a list with multiple inflections", () => {
    render(
      <InflectionDataSection
        inflections={[
          { form: "undae", lemma: "unda", data: "dat sg" },
          { form: "undae", lemma: "unda", data: "gen sg" },
        ]}
      />
    );

    expect(screen.queryByText(/gen sg/)).toBeVisible();
    expect(screen.queryByText(/dat sg/)).toBeVisible();
    expect(screen.queryByRole("list", { name: "Inflections" })).toBeVisible();
  });

  it("shows a list with single inflections", () => {
    render(
      <InflectionDataSection
        inflections={[{ form: "undae", lemma: "unda", data: "dat sg" }]}
      />
    );

    expect(screen.queryByText(/dat sg/)).toBeVisible();
    expect(screen.queryByRole("list", { name: "Inflections" })).toBeNull();
  });
});
