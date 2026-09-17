import { ICON_PATHS, renderIconSvg } from "@/web/v2/core/icons.common";

describe("icons", () => {
  it("defines standard icon paths", () => {
    expect(ICON_PATHS.tune).toBeDefined();
    expect(ICON_PATHS.search).toBeDefined();
    expect(ICON_PATHS.chevronUp).toBeDefined();
    expect(ICON_PATHS.flag).toBeDefined();
    expect(ICON_PATHS.menu).toBeDefined();
    expect(ICON_PATHS.close).toBeDefined();
    expect(ICON_PATHS.sun).toBeDefined();
    expect(ICON_PATHS.moon).toBeDefined();
    expect(ICON_PATHS.toc).toBeDefined();
    expect(ICON_PATHS.book).toBeDefined();
    expect(ICON_PATHS.notes).toBeDefined();
    expect(ICON_PATHS.info).toBeDefined();
    expect(ICON_PATHS.translate).toBeDefined();
  });

  it("renders an SVG with expected attributes", () => {
    const svg = renderIconSvg("search", { className: "my-icon", width: 18 });
    expect(svg).toContain('class="my-icon"');
    expect(svg).toContain('width="18"');
    expect(svg).toContain('viewBox="0 0 24 24"');
    expect(svg).toContain(ICON_PATHS.search);
  });
});
