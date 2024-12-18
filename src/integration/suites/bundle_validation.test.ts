import { gzipSync } from "zlib";
import fetch, { type Response } from "node-fetch";
import { test, expect } from "@playwright/test";

const BANNED_STRINGS = ["/devOnlyHelper"];

async function* getBundleFiles(): AsyncGenerator<[string, Response]> {
  const baseUrl = process.env.BASE_URL;
  const req = await fetch(`${baseUrl}/`);
  const rootHtml = await req.text();

  const pattern = /script src="\/([\w0-9.]+\.js)"/g;
  const matches = [...rootHtml.matchAll(pattern)];
  const bundleFiles = matches.map((matchArray) => matchArray[1]);
  for (const genfile of bundleFiles) {
    const response = await fetch(`${baseUrl}/${genfile}`);
    yield [genfile, response];
  }
}

test.describe("bundle validation", { tag: "@bundle" }, () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "Bundle validation does not use the browser, so only needs to run once."
  );

  test("bundle size is within limit", async () => {
    let totalSize = 0;
    for await (const [jsFile, jsReq] of getBundleFiles()) {
      const contents = await jsReq.buffer();
      const gzipped = gzipSync(contents).byteLength;
      console.debug(`${jsFile}: ${gzipped / 1000} KB`);
      totalSize += gzipped;
    }

    expect(totalSize).toBeGreaterThan(0);
    expect(totalSize / 1000).toBeLessThan(100);
  });

  test("does not include dev-only code", async () => {
    for await (const [jsFile, jsReq] of getBundleFiles()) {
      const contents = await jsReq.text();
      for (const banned of BANNED_STRINGS) {
        if (contents.includes(banned)) {
          throw new Error(`${jsFile} has banned string ${banned}`);
        }
      }
    }
  });
});
