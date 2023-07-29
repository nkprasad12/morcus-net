/**
 * @jest-environment jsdom
 */

import { XmlNode } from "@/common/xml_node";
import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import user from "@testing-library/user-event";
import React from "react";

import {
  ClickableTooltip,
  SectionLinkTooltip,
} from "@/web/client/pages/tooltips";
import { xmlNodeToJsx } from "@/web/client/pages/dictionary/dictionary_utils";

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
  const DivWithRef = React.forwardRef<HTMLDivElement>(GalliaRef);

  it("shows link buttons", async () => {
    const writeText = jest.fn((_e) => Promise.resolve());
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
      <SectionLinkTooltip
        forwarded={DivWithRef}
        className="foo"
        senseId="bar"
      />
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
        <SectionLinkTooltip
          forwarded={DivWithRef}
          className="foo"
          senseId="bar"
        />
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
      <SectionLinkTooltip
        forwarded={DivWithRef}
        className="foo"
        senseId="bar"
      />
    );
    await user.click(screen.getByText("Gallia"));

    await user.click(screen.getByText("Gallia"));

    expect(screen.queryByText(/copy manually/)).toBeNull();
    expect(screen.queryByText(/section link/)).not.toBeVisible();
  });
});
