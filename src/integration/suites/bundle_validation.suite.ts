import { gzipSync } from "zlib";
import fetch, { type Response } from "node-fetch";

const BANNED_STRINGS = ["/devOnlyHelper"];

async function* getBundleFiles(): AsyncGenerator<[string, Response]> {
  const req = await fetch(`${global.location.origin}/`);
  const rootHtml = await req.text();

  const pattern = /script src="\/([\w0-9.]+\.js)"/g;
  const matches = [...rootHtml.matchAll(pattern)];
  const bundleFiles = matches.map((matchArray) => matchArray[1]);
  for (const genfile of bundleFiles) {
    const response = await fetch(`${global.location.origin}/${genfile}`);
    yield [genfile, response];
  }
}

export function defineBundleValidationSuite() {
  describe("bundle validation", () => {
    test("bundle size is within limit", async () => {
      let totalSize = 0;
      for await (const [jsFile, jsReq] of getBundleFiles()) {
        const contents = await jsReq.buffer();
        const gzipped = gzipSync(contents).byteLength;
        console.debug(`${jsFile}: ${gzipped / 1024} KB`);
        totalSize += gzipped;
      }

      expect(totalSize).toBeGreaterThan(0);
      expect(totalSize / 1024).toBeLessThan(100);
    });

    it("does not include dev-only code", async () => {
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
}
