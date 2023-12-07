/**
 * @jest-environment jsdom
 */

import { LatinDict } from "@/common/dictionaries/latin_dicts";
import { DictAttribution } from "@/web/client/pages/dictionary/sections";
import { render, screen } from "@testing-library/react";

describe("DictAttributions", () => {
  it("shows correct LS attributions", () => {
    render(<DictAttribution isSmall dictKey={LatinDict.LewisAndShort.key} />);
    expect(
      screen.getByText("perseus digital library", { exact: false })
    ).toBeDefined();
  });

  it("shows correct SH attributions", () => {
    render(<DictAttribution isSmall dictKey={LatinDict.SmithAndHall.key} />);
    expect(
      screen.getByText("distributed proofreaders", { exact: false })
    ).toBeDefined();
  });

  it("shows correct pendings attributions", () => {
    render(<DictAttribution isSmall={false} dictKey={"Other"} />);
    expect(screen.getByText("TODO", { exact: false })).toBeDefined();
  });
});
