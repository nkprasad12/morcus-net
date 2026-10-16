import * as http from "http";
import type { AddressInfo } from "net";
import { BlockList } from "net";
import * as zlib from "zlib";

import {
  DEFAULT_ADDRESS_POLICY,
  FetchLimitError,
  UnsafeUrlError,
  isBlockedAddress,
  safeFetchText,
  validateFetchUrl,
  type AddressPolicy,
  type Resolver,
} from "@/web/scraping/safe_fetch";

describe("validateFetchUrl (default policy)", () => {
  test("adds https:// to bare hosts, as V1 did", () => {
    expect(validateFetchUrl("thelatinlibrary.com/cic.html").href).toBe(
      "https://thelatinlibrary.com/cic.html"
    );
  });

  test.each([
    "http://thelatinlibrary.com/",
    "https://www.thelatinlibrary.com:443/verg.html",
    "http://93.184.216.34/",
    "https://[2606:4700:4700::1111]/",
  ])("accepts %s", (url) => {
    expect(() => validateFetchUrl(url)).not.toThrow();
  });

  test.each([
    ["file:///etc/passwd", "non-http scheme"],
    ["ftp://example.com/x", "non-http scheme"],
    ["javascript:alert(1)", "not a URL once https:// is prefixed"],
    ["https://user:pass@example.com/", "credentials"],
    ["http://example.com:8080/", "non-default port"],
    ["http://localhost/", "localhost"],
    ["http://foo.localhost/", "*.localhost"],
    ["http://127.0.0.1/", "loopback"],
    ["http://2130706433/", "decimal loopback (canonicalized by URL)"],
    ["http://0x7f.1/", "hex loopback (canonicalized by URL)"],
    ["http://10.1.2.3/", "RFC 1918"],
    ["http://172.20.0.1/", "RFC 1918"],
    ["http://192.168.1.1/", "RFC 1918"],
    ["http://169.254.169.254/latest/meta-data/", "cloud metadata"],
    ["http://100.64.0.1/", "CGNAT"],
    ["http://0.0.0.0/", "unspecified"],
    ["http://[::1]/", "IPv6 loopback"],
    ["http://[::ffff:127.0.0.1]/", "IPv4-mapped IPv6"],
    ["http://[fe80::1]/", "IPv6 link-local"],
    ["http://[fd00::1]/", "IPv6 unique local"],
  ])("rejects %s (%s)", (url) => {
    expect(() => validateFetchUrl(url)).toThrow(UnsafeUrlError);
  });
});

describe("isBlockedAddress (default policy)", () => {
  test.each([
    "8.8.8.8",
    "93.184.216.34",
    "2606:4700:4700::1111",
    "::ffff:8.8.8.8",
  ])("allows public %s", (address) => {
    expect(isBlockedAddress(address, DEFAULT_ADDRESS_POLICY)).toBe(false);
  });

  test.each([
    "127.0.0.1",
    "10.0.0.1",
    "169.254.169.254",
    "::1",
    "fc00::1",
    "::ffff:127.0.0.1",
    "::ffff:7f00:1",
    "0:0:0:0:0:ffff:a00:1",
    "::ffff:169.254.169.254",
  ])("blocks %s", (address) => {
    expect(isBlockedAddress(address, DEFAULT_ADDRESS_POLICY)).toBe(true);
  });

  test("treats a non-IP string as blocked", () => {
    expect(isBlockedAddress("not-an-ip")).toBe(true);
  });
});

describe("safeFetchText against a local server", () => {
  // The test server lives on 127.0.0.1, which the default policy (rightly)
  // refuses. This policy allows it and any port, but still blocks 10/8 and
  // 127.0.0.2 so the blocking paths can be exercised end to end.
  const blockList = new BlockList();
  blockList.addSubnet("10.0.0.0", 8, "ipv4");
  blockList.addAddress("127.0.0.2", "ipv4");
  const policy: AddressPolicy = { blockList, allowedPorts: null };

  let server: http.Server;
  let base: string;
  let port: number;
  const hits: string[] = [];
  let handler: http.RequestListener = () => {};

  beforeAll(async () => {
    server = http.createServer((req, res) => {
      hits.push(req.url ?? "");
      handler(req, res);
    });
    await new Promise<void>((resolve) =>
      server.listen(0, "127.0.0.1", resolve)
    );
    port = (server.address() as AddressInfo).port;
    base = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    hits.length = 0;
  });

  function html(res: http.ServerResponse, body: string | Buffer, headers = {}) {
    res.writeHead(200, { "Content-Type": "text/html", ...headers });
    res.end(body);
  }

  test("returns the body of an HTML page", async () => {
    handler = (_req, res) => html(res, "<html><body>Gallia est</body></html>");
    const result = await safeFetchText(`${base}/page`, { policy });
    expect(result.text).toBe("<html><body>Gallia est</body></html>");
    expect(result.finalUrl).toBe(`${base}/page`);
  });

  test("decompresses gzip", async () => {
    handler = (_req, res) =>
      html(res, zlib.gzipSync("<body>arma virumque</body>"), {
        "Content-Encoding": "gzip",
      });
    const result = await safeFetchText(`${base}/gz`, { policy });
    expect(result.text).toBe("<body>arma virumque</body>");
  });

  test("honors a declared charset", async () => {
    handler = (_req, res) =>
      html(res, Buffer.from("<body>pêdô</body>", "latin1"), {
        "Content-Type": "text/html; charset=ISO-8859-1",
      });
    const result = await safeFetchText(`${base}/latin1`, { policy });
    expect(result.text).toBe("<body>pêdô</body>");
  });

  test("follows relative redirects and reports the final URL", async () => {
    handler = (req, res) => {
      if (req.url === "/start") {
        res.writeHead(302, { Location: "/end" });
        res.end();
      } else {
        html(res, "<body>done</body>");
      }
    };
    const result = await safeFetchText(`${base}/start`, { policy });
    expect(result.text).toBe("<body>done</body>");
    expect(result.finalUrl).toBe(`${base}/end`);
  });

  test("re-validates every redirect hop", async () => {
    handler = (_req, res) => {
      res.writeHead(302, { Location: `http://127.0.0.2:${port}/secret` });
      res.end();
    };
    await expect(
      safeFetchText(`${base}/redirect-to-private`, { policy })
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(hits).toEqual(["/redirect-to-private"]);
  });

  test("gives up after too many redirects", async () => {
    handler = (req, res) => {
      res.writeHead(302, { Location: `${req.url}x` });
      res.end();
    };
    await expect(
      safeFetchText(`${base}/r`, { policy, maxRedirects: 2 })
    ).rejects.toThrow("Too many redirects");
    expect(hits).toEqual(["/r", "/rx", "/rxx"]);
  });

  test("rejects non-2xx responses", async () => {
    handler = (_req, res) => {
      res.writeHead(404);
      res.end("nope");
    };
    await expect(
      safeFetchText(`${base}/missing`, { policy })
    ).rejects.toBeInstanceOf(FetchLimitError);
  });

  test("rejects content types that are not HTML or text", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "image/png" });
      res.end(Buffer.alloc(10));
    };
    await expect(safeFetchText(`${base}/img`, { policy })).rejects.toThrow(
      "Unsupported content type: image/png"
    );
  });

  test("rejects a declared Content-Length over the cap", async () => {
    handler = (_req, res) => html(res, "x".repeat(2000));
    await expect(
      safeFetchText(`${base}/big`, { policy, maxBytes: 1000 })
    ).rejects.toThrow("Page is too large");
  });

  test("caps streamed bodies with no Content-Length", async () => {
    handler = (_req, res) => {
      res.writeHead(200, { "Content-Type": "text/html" });
      // Chunked: no Content-Length for the up-front check to catch.
      for (let i = 0; i < 10; i++) res.write("x".repeat(500));
      res.end();
    };
    await expect(
      safeFetchText(`${base}/stream`, { policy, maxBytes: 1000 })
    ).rejects.toThrow("Page is too large");
  });

  test("caps the decompressed size, so a small gzip bomb is refused", async () => {
    const bomb = zlib.gzipSync(Buffer.alloc(1_000_000));
    expect(bomb.length).toBeLessThan(5_000);
    handler = (_req, res) => html(res, bomb, { "Content-Encoding": "gzip" });
    await expect(
      safeFetchText(`${base}/bomb`, { policy, maxBytes: 10_000 })
    ).rejects.toThrow("Page is too large");
  });

  test("times out a server that never responds", async () => {
    handler = () => {
      // Never respond.
    };
    await expect(
      safeFetchText(`${base}/hang`, { policy, timeoutMs: 200 })
    ).rejects.toThrow("Timed out after 200ms");
  });

  describe("DNS resolution is checked at connect time", () => {
    function resolverFor(map: Record<string, string[]>): Resolver {
      return (hostname) =>
        Promise.resolve(
          (map[hostname] ?? []).map((address) => ({
            address,
            family: address.includes(":") ? 6 : 4,
          }))
        );
    }

    test("connects when the host resolves to an allowed address", async () => {
      handler = (_req, res) => html(res, "<body>ok</body>");
      const resolver = resolverFor({ "public.test": ["127.0.0.1"] });
      const result = await safeFetchText(`http://public.test:${port}/dns`, {
        policy,
        resolver,
      });
      expect(result.text).toBe("<body>ok</body>");
    });

    test("refuses a host that resolves to a blocked address", async () => {
      const resolver = resolverFor({ "rebind.test": ["10.0.0.5"] });
      await expect(
        safeFetchText(`http://rebind.test:${port}/`, { policy, resolver })
      ).rejects.toThrow("resolves to a private or reserved address");
      expect(hits).toEqual([]);
    });

    test("refuses a host with any blocked address among its records", async () => {
      const resolver = resolverFor({ "mixed.test": ["127.0.0.1", "10.0.0.5"] });
      await expect(
        safeFetchText(`http://mixed.test:${port}/`, { policy, resolver })
      ).rejects.toThrow("resolves to a private or reserved address");
      expect(hits).toEqual([]);
    });

    test("refuses a host that resolves to nothing", async () => {
      const resolver = resolverFor({});
      await expect(
        safeFetchText(`http://nowhere.test:${port}/`, { policy, resolver })
      ).rejects.toThrow("resolves to a private or reserved address");
    });
  });
});
