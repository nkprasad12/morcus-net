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

describe("stroke icons", () => {
  it("renders outline icons with stroke presentation attributes", () => {
    const svg = renderIconSvg("close", { strokeWidth: 2.5 });
    expect(svg).toContain('fill="none"');
    expect(svg).toContain('stroke="currentColor"');
    expect(svg).toContain('stroke-width="2.5"');
    expect(svg).toContain('stroke-linecap="round"');
  });

  it("leaves filled icons to inherit fill from CSS", () => {
    const svg = renderIconSvg("search");
    expect(svg).not.toContain("fill=");
    expect(svg).not.toContain("stroke");
  });
});
