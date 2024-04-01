import { gzipSync } from "zlib";
import fetch from "node-fetch";

export function defineBundleSizeSuite() {
  describe("bundle size check", () => {
    test("bundle size is within limit", async () => {
      const req = await fetch(`${global.location.origin}/`);
      const rootHtml = await req.text();

      const pattern = /script src="\/([\w0-9.]+\.js)"/g;
      const matches = [...rootHtml.matchAll(pattern)];
      const bundleFiles = matches.map((matchArray) => matchArray[1]);

      let totalSize = 0;
      for (const genfile of bundleFiles) {
        const jsReq = await fetch(`${global.location.origin}/${genfile}`);
        const contents = await jsReq.buffer();
        const gzipped = gzipSync(contents).byteLength;
        console.debug(`${genfile}: ${gzipped / 1024} KB`);
        totalSize += gzipped;
      }

      expect(totalSize).toBeGreaterThan(0);
      expect(totalSize / 1024).toBeLessThan(100);
    });
  });
}
