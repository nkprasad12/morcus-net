import { ICON_PATHS, renderIconSvg } from "@/web/ui/core/widgets/icons.common";

describe("icons", () => {
  it("renders an SVG with expected attributes", () => {
    const svg = renderIconSvg("search", { className: "my-icon", width: 18 });
    expect(svg).toContain('class="my-icon"');
    expect(svg).toContain('width="18"');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain(ICON_PATHS.search);
  });
});
