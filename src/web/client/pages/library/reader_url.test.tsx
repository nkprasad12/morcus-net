/**
 * @jest-environment jsdom
 */

import { useState } from "react";

import type { TextHighlightRange } from "@/web/client/pages/library/reader_url";
import { useTextHighlights } from "@/web/client/pages/library/reader_url";
import { Router } from "@/web/client/router/router_v2";
import { act, render, screen } from "@testing-library/react";
import { useEffect, type MutableRefObject } from "react";

jest.mock("@/web/client/router/router_v2");

const mockRouter = Router.useRouter as jest.Mock;
type HighlightMap = Map<string, TextHighlightRange[]> | undefined;

function TestComponent(props: {
  highlightsRef: MutableRefObject<HighlightMap>;
}) {
  const [clicks, setClicks] = useState(0);
  const highlights = useTextHighlights();

  useEffect(() => {
    props.highlightsRef.current = highlights;
  });

  return (
    <>
      <button onClick={() => setClicks((c) => c + 1)}>Click</button>
      <span>{clicks}</span>
    </>
  );
}

describe("useTextHighlights", () => {
  const highlightsRef: MutableRefObject<HighlightMap> = {
    current: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    highlightsRef.current = undefined;
  });

  function setUrlParams(params: Record<string, string | undefined>) {
    mockRouter.mockReturnValue({
      route: { params },
    });
  }

  it("returns empty map when matchText is undefined", () => {
    setUrlParams({});
    render(<TestComponent highlightsRef={highlightsRef} />);
    expect(highlightsRef.current).toBeUndefined();
  });

  it("returns empty map when matchText is empty string", () => {
    setUrlParams({ matchText: "" });
    render(<TestComponent highlightsRef={highlightsRef} />);
    expect(highlightsRef.current).toBeUndefined();
  });

  it("parses single highlight correctly", () => {
    setUrlParams({ matchText: "section1~10~15" });
    render(<TestComponent highlightsRef={highlightsRef} />);
    expect(highlightsRef.current).toEqual(
      new Map([["section1", [expect.objectContaining({ start: 10, end: 15 })]]])
    );
  });

  it("parses multiple highlights with same ID", () => {
    setUrlParams({ matchText: "section1~10~15__section1~20~23" });
    render(<TestComponent highlightsRef={highlightsRef} />);
    expect(highlightsRef.current).toEqual(
      new Map([
        [
          "section1",
          [
            expect.objectContaining({ start: 10, end: 15 }),
            expect.objectContaining({ start: 20, end: 23 }),
          ],
        ],
      ])
    );
  });

  it("parses multiple highlights with different IDs", () => {
    setUrlParams({ matchText: "section1~10~15__section2~20~23" });
    render(<TestComponent highlightsRef={highlightsRef} />);
    expect(highlightsRef.current).toEqual(
      new Map([
        ["section1", [expect.objectContaining({ start: 10, end: 15 })]],
        ["section2", [expect.objectContaining({ start: 20, end: 23 })]],
      ])
    );
  });

  it("returns undefined for invalid format with wrong number of parts", () => {
    setUrlParams({ matchText: "section1~10" });
    render(<TestComponent highlightsRef={highlightsRef} />);
    expect(highlightsRef.current).toBeUndefined();
  });

  it("returns undefined for invalid start position", () => {
    setUrlParams({ matchText: "section1~abc~5" });
    render(<TestComponent highlightsRef={highlightsRef} />);
    expect(highlightsRef.current).toBeUndefined();
  });

  it("returns undefined for invalid length", () => {
    setUrlParams({ matchText: "section1~10~xyz" });
    render(<TestComponent highlightsRef={highlightsRef} />);
    expect(highlightsRef.current).toBeUndefined();
  });

  it("returns undefined when one of multiple highlights is invalid", () => {
    setUrlParams({ matchText: "section1~10~5__section2~invalid~3" });
    render(<TestComponent highlightsRef={highlightsRef} />);
    expect(highlightsRef.current).toBeUndefined();
  });

  it("maintains same map reference when re-rendering with unchanged URL params", () => {
    setUrlParams({ matchText: "section1~10~15" });
    render(<TestComponent highlightsRef={highlightsRef} />);

    const firstMapReference = highlightsRef.current;
    expect(firstMapReference).toBeDefined();

    // Trigger re-render by clicking button
    act(() => {
      screen.getByRole("button").click();
    });

    expect(highlightsRef.current).toBe(firstMapReference);
  });
});
