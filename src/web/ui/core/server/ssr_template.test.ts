import { ssr } from "@/web/ui/core/server/ssr_template.server";

describe("ssr", () => {
  it("removes the template's indentation", () => {
    const out = ssr`
      <ul>
        <li>${"a"}</li>
      </ul>
    `;

    expect(out).toBe("\n<ul>\n<li>a</li>\n</ul>\n");
  });

  it("interpolates values verbatim, without escaping or dedenting them", () => {
    const markup = "<pre>\n    kept\n</pre>";

    expect(ssr`<div>
      ${markup}</div>`).toBe("<div>\n<pre>\n    kept\n</pre></div>");
  });

  it("stringifies values like an untagged template", () => {
    expect(ssr`${1}|${undefined}|${null}|${false}`).toBe(
      `${1}|${undefined}|${null}|${false}`
    );
  });
});
