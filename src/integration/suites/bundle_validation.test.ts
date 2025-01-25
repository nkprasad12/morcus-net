import { gzipSync } from "zlib";
import fetch, { type Response } from "node-fetch";
import { test, expect } from "@playwright/test";

const BANNED_STRINGS = ["/devOnlyHelper"];

async function listBundleFiles(): Promise<string[]> {
  const baseUrl = process.env.BASE_URL;
  const req = await fetch(`${baseUrl}/`);
  const rootHtml = await req.text();

  const pattern = /script src="\/([\w0-9.-]+\.js)"/g;
  const matches = [...rootHtml.matchAll(pattern)];
  return matches.map((matchArray) => matchArray[1]);
}

async function* getBundleFiles(): AsyncGenerator<[string, Response]> {
  const baseUrl = process.env.BASE_URL;
  for (const genfile of await listBundleFiles()) {
    const response = await fetch(`${baseUrl}/${genfile}`);
    yield [genfile, response];
  }
}

async function fetchWithEncoding(
  fileName: string,
  encoding: string
): Promise<Response> {
  const baseUrl = process.env.BASE_URL;
  const response = await fetch(`${baseUrl}/${fileName}`, {
    headers: { "accept-encoding": encoding },
  });
  expect(response.status).toBe(200);
  return response;
}

function assertEncodingHeaders(
  response: Response,
  contentEncoding: string | null,
  preCompressed?: "preCompressed"
) {
  expect(response.headers.get("content-encoding")).toBe(contentEncoding);
  if (preCompressed !== undefined) {
    expect(response.headers.get("X-MorcusNet-PreCompressed")).toBe("1");
  }
}

test.describe("bundle validation", { tag: "@bundle" }, () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== "chromium" || isMobile,
    "Bundle validation does not use the browser, so only needs to run once."
  );

  test("bundle size is within limit", async () => {
    let totalSize = 0;
    for await (const [jsFile, jsRes] of getBundleFiles()) {
      const contents = await jsRes.buffer();
      const gzipped = gzipSync(contents).byteLength;
      console.debug(`${jsFile}: ${gzipped / 1000} KB`);
      totalSize += gzipped;
    }

    expect(totalSize).toBeGreaterThan(0);
    expect(totalSize / 1000).toBeLessThan(100);
  });

  test("bundle is sent with an immutable header", async () => {
    for await (const [_, jsRes] of getBundleFiles()) {
      expect(jsRes.headers.get("cache-control")).toBeDefined();
      expect(jsRes.headers.get("cache-control")).toContain("immutable");
    }
  });

  test("bundle is served pre-compressed in gzip or brotli", async () => {
    for (const genfile of await listBundleFiles()) {
      // Returns pre-compressed gzip if requested.
      assertEncodingHeaders(
        await fetchWithEncoding(genfile, "gzip"),
        "gzip",
        "preCompressed"
      );
      // Returns pre-compresed brotli if requested.
      assertEncodingHeaders(
        await fetchWithEncoding(genfile, "br"),
        "br",
        "preCompressed"
      );
      // Returns pre-compressed brotli preferentially.
      assertEncodingHeaders(
        await fetchWithEncoding(genfile, "gzip, br"),
        "br",
        "preCompressed"
      );
      // Falls back to uncompressed in case of unsupported
      // or no supported compressed.
      assertEncodingHeaders(
        await fetchWithEncoding(genfile, "middleOut"),
        null
      );
      assertEncodingHeaders(await fetchWithEncoding(genfile, ""), null);
    }
  });

  test("all bundle compressions have the same content", async () => {
    for (const genfile of await listBundleFiles()) {
      const results = new Set([
        await (await fetchWithEncoding(genfile, "gzip")).text(),
        await (await fetchWithEncoding(genfile, "br")).text(),
        await (await fetchWithEncoding(genfile, "")).text(),
      ]);
      expect(results.size).toBe(1);
    }
  });

  test("does not include dev-only code", async () => {
    for await (const [jsFile, jsRes] of getBundleFiles()) {
      const contents = await jsRes.text();
      for (const banned of BANNED_STRINGS) {
        if (contents.includes(banned)) {
          throw new Error(`${jsFile} has banned string ${banned}`);
        }
      }
    }
  });
});
